import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PublicUser } from '../domain/user.js';
import { AskResultSchema, type AskResult } from '../domain/ask.js';
import { ConversationDetailSchema, ConversationMemorySchema, ConversationPageSchema, ConversationSummarySchema, type ConversationDetail, type ConversationMemory, type ConversationPage, type MemoryCandidate } from '../domain/conversation.js';

export interface StoredUser extends PublicUser {
  normalizedName: string;
  createdAt: string;
}

export interface UserStore {
  findOrCreateByName(name: string, normalizedName: string): PublicUser;
  close(): void;
}

export interface ConversationStore {
  validateConversationAccess(userId: string, conversationId: string): void;
  appendCompletedInteraction(input: { userId: string; conversationId: string; question: string; result: AskResult }): string;
  listConversations(userId: string, limit: number, cursor?: string): ConversationPage;
  getConversation(userId: string, conversationId: string): ConversationDetail | null;
  deleteConversation(userId: string, conversationId: string): boolean;
  clearConversations(userId: string): number;
  getMemories(userId: string, conversationId: string, limit?: number): ConversationMemory[];
  claimMemoryExtractionJob(leaseMilliseconds?: number): ClaimedMemoryJob | null;
  completeMemoryExtractionJob(job: ClaimedMemoryJob, memories: MemoryCandidate[]): void;
  failMemoryExtractionJob(job: ClaimedMemoryJob, category: string, maxAttempts?: number): void;
}

export interface ClaimedMemoryJob {
  interactionId: string; userId: string; conversationId: string; question: string; answer: string; attemptCount: number; leaseExpiresAt: string;
}

export class ConversationNotFoundError extends Error {
  constructor() { super('Conversation not found.'); this.name = new.target.name; }
}

interface SqliteUserStoreOptions {
  databasePath?: string;
  now?: () => Date;
  createId?: () => string;
}

export class SqliteUserStore implements UserStore, ConversationStore {
  private readonly database: DatabaseSync;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor({ databasePath = resolve(process.cwd(), 'store/data/users.sqlite'), now = () => new Date(), createId = randomUUID }: SqliteUserStoreOptions = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.now = now;
    this.createId = createId;
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_name_unique ON users(normalized_name);
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, id)
      );
      CREATE INDEX IF NOT EXISTS conversations_user_updated ON conversations(user_id, updated_at DESC, id DESC);
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, question TEXT NOT NULL,
        answer TEXT NOT NULL, abstained INTEGER NOT NULL CHECK(abstained IN (0, 1)), sources_json TEXT NOT NULL,
        created_at TEXT NOT NULL, UNIQUE(user_id, conversation_id, id),
        FOREIGN KEY(user_id, conversation_id) REFERENCES conversations(user_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS interactions_conversation_order ON interactions(user_id, conversation_id, created_at DESC, id DESC);
      CREATE TABLE IF NOT EXISTS memory_extraction_jobs (
        interaction_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), next_attempt_at TEXT NOT NULL,
        lease_expires_at TEXT, last_error_category TEXT CHECK(last_error_category IS NULL OR length(last_error_category) <= 40),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id, conversation_id, interaction_id) REFERENCES interactions(user_id, conversation_id, id) ON DELETE CASCADE,
        FOREIGN KEY(user_id, conversation_id) REFERENCES conversations(user_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS memory_jobs_pending ON memory_extraction_jobs(status, next_attempt_at, lease_expires_at);
      CREATE TABLE IF NOT EXISTS conversation_memories (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, source_interaction_id TEXT NOT NULL,
        fact TEXT NOT NULL CHECK(length(fact) BETWEEN 1 AND 240),
        category TEXT NOT NULL CHECK(category IN ('response_preference', 'knowledge_level', 'pokemon_interest')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id, conversation_id, source_interaction_id) REFERENCES interactions(user_id, conversation_id, id) ON DELETE CASCADE,
        FOREIGN KEY(user_id, conversation_id) REFERENCES conversations(user_id, id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS memories_conversation ON conversation_memories(user_id, conversation_id, created_at DESC);
    `);
  }

  findOrCreateByName(name: string, normalizedName: string): PublicUser {
    const insert = this.database.prepare(`
      INSERT INTO users (id, display_name, normalized_name, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(normalized_name) DO NOTHING
    `);
    insert.run(this.createId(), name, normalizedName, this.now().toISOString());
    const row = this.database.prepare('SELECT id, display_name FROM users WHERE normalized_name = ?').get(normalizedName) as { id: string; display_name: string } | undefined;
    if (!row) throw new Error('User could not be selected after the create operation.');
    return { id: row.id, name: row.display_name };
  }

  appendCompletedInteraction(input: { userId: string; conversationId: string; question: string; result: AskResult }): string {
    const id = this.createId();
    const now = this.now().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const owner = this.database.prepare('SELECT user_id FROM conversations WHERE id = ?').get(input.conversationId) as { user_id: string } | undefined;
      if (owner && owner.user_id !== input.userId) throw new ConversationNotFoundError();
      if (!owner) {
        const user = this.database.prepare('SELECT id FROM users WHERE id = ?').get(input.userId);
        if (!user) throw new ConversationNotFoundError();
        this.database.prepare('INSERT INTO conversations(id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(input.conversationId, input.userId, now, now);
      }
      this.database.prepare('INSERT INTO interactions(id, user_id, conversation_id, question, answer, abstained, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, input.userId, input.conversationId, input.question, input.result.answer, input.result.abstained ? 1 : 0, JSON.stringify(input.result.sources), now);
      this.database.prepare("INSERT INTO memory_extraction_jobs(interaction_id, user_id, conversation_id, status, attempt_count, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)")
        .run(id, input.userId, input.conversationId, now, now, now);
      this.database.prepare('UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?').run(now, input.conversationId, input.userId);
      this.database.prepare('DELETE FROM interactions WHERE id IN (SELECT id FROM interactions WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 50)')
        .run(input.userId, input.conversationId);
      this.database.exec('COMMIT');
      return id;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  validateConversationAccess(userId: string, conversationId: string): void {
    const owner = this.database.prepare('SELECT user_id FROM conversations WHERE id = ?').get(conversationId) as { user_id: string } | undefined;
    if (owner && owner.user_id !== userId) throw new ConversationNotFoundError();
    const user = this.database.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) throw new ConversationNotFoundError();
  }

  listConversations(userId: string, limit: number, cursor?: string): ConversationPage {
    const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    let before: { updatedAt: string; id: string } | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { updatedAt?: unknown; id?: unknown };
        if (typeof decoded.updatedAt !== 'string' || typeof decoded.id !== 'string') return { conversations: [], nextCursor: null };
        before = { updatedAt: decoded.updatedAt, id: decoded.id };
      } catch { return { conversations: [], nextCursor: null }; }
    }
    const sql = 'SELECT c.id, c.created_at, c.updated_at, (SELECT question FROM interactions i WHERE i.user_id = c.user_id AND i.conversation_id = c.id ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS latest_question FROM conversations c WHERE c.user_id = ?';
    const suffix = before
      ? ' AND (c.updated_at < ? OR (c.updated_at = ? AND c.id < ?)) ORDER BY c.updated_at DESC, c.id DESC LIMIT ?'
      : ' ORDER BY c.updated_at DESC, c.id DESC LIMIT ?';
    const rows = (before
      ? this.database.prepare(sql + suffix).all(userId, before.updatedAt, before.updatedAt, before.id, boundedLimit + 1)
      : this.database.prepare(sql + suffix).all(userId, boundedLimit + 1)) as Array<{ id: string; created_at: string; updated_at: string; latest_question: string | null }>;
    const hasMore = rows.length > boundedLimit;
    const pageRows = rows.slice(0, boundedLimit);
    const conversations = pageRows.map((row) => ConversationSummarySchema.parse({
      id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, latestQuestion: row.latest_question?.slice(0, 240) ?? null,
    }));
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ updatedAt: last.updated_at, id: last.id })).toString('base64url') : null;
    return ConversationPageSchema.parse({ conversations, nextCursor });
  }

  getConversation(userId: string, conversationId: string): ConversationDetail | null {
    const conversation = this.database.prepare('SELECT id, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, userId) as { id: string; created_at: string; updated_at: string } | undefined;
    if (!conversation) return null;
    const rows = this.database.prepare('SELECT id, conversation_id, created_at, question, answer, abstained, sources_json FROM interactions WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC, id ASC')
      .all(userId, conversationId) as Array<{ id: string; conversation_id: string; created_at: string; question: string; answer: string; abstained: number; sources_json: string }>;
    return ConversationDetailSchema.parse({
      id: conversation.id, createdAt: conversation.created_at, updatedAt: conversation.updated_at,
      interactions: rows.map((row) => ({
        id: row.id, conversationId: row.conversation_id, createdAt: row.created_at, question: row.question,
        result: AskResultSchema.parse({ answer: row.answer, abstained: row.abstained === 1, sources: JSON.parse(row.sources_json) as unknown }),
      })),
    });
  }

  deleteConversation(userId: string, conversationId: string): boolean {
    return Number(this.database.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(conversationId, userId).changes) > 0;
  }

  clearConversations(userId: string): number {
    return Number(this.database.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId).changes);
  }

  getMemories(userId: string, conversationId: string, limit = 20): ConversationMemory[] {
    const rows = this.database.prepare('SELECT id, user_id, conversation_id, source_interaction_id, fact, category, created_at FROM conversation_memories WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(userId, conversationId, Math.max(1, Math.min(30, Math.trunc(limit)))) as Array<{ id: string; user_id: string; conversation_id: string; source_interaction_id: string; fact: string; category: string; created_at: string }>;
    return rows.map((row) => ConversationMemorySchema.parse({
      id: row.id, userId: row.user_id, conversationId: row.conversation_id, sourceInteractionId: row.source_interaction_id,
      fact: row.fact, category: row.category, createdAt: row.created_at,
    }));
  }

  claimMemoryExtractionJob(leaseMilliseconds = 60_000): ClaimedMemoryJob | null {
    const now = this.now();
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseMilliseconds).toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const row = this.database.prepare("SELECT j.interaction_id, j.user_id, j.conversation_id, j.attempt_count, i.question, i.answer FROM memory_extraction_jobs j JOIN interactions i ON i.id = j.interaction_id AND i.user_id = j.user_id AND i.conversation_id = j.conversation_id WHERE (j.status = 'pending' AND j.next_attempt_at <= ?) OR (j.status = 'processing' AND j.lease_expires_at <= ?) ORDER BY j.next_attempt_at ASC, j.created_at ASC, j.interaction_id ASC LIMIT 1")
        .get(nowIso, nowIso) as { interaction_id: string; user_id: string; conversation_id: string; attempt_count: number; question: string; answer: string } | undefined;
      if (!row) { this.database.exec('COMMIT'); return null; }
      const attemptCount = row.attempt_count + 1;
      this.database.prepare("UPDATE memory_extraction_jobs SET status = 'processing', attempt_count = ?, lease_expires_at = ?, updated_at = ? WHERE interaction_id = ?")
        .run(attemptCount, leaseExpiresAt, nowIso, row.interaction_id);
      this.database.exec('COMMIT');
      return { interactionId: row.interaction_id, userId: row.user_id, conversationId: row.conversation_id, question: row.question, answer: row.answer, attemptCount, leaseExpiresAt };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  completeMemoryExtractionJob(job: ClaimedMemoryJob, memories: MemoryCandidate[]): void {
    const now = this.now().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const current = this.database.prepare('SELECT status, lease_expires_at FROM memory_extraction_jobs WHERE interaction_id = ? AND user_id = ? AND conversation_id = ?')
        .get(job.interactionId, job.userId, job.conversationId) as { status: string; lease_expires_at: string | null } | undefined;
      if (!current || current.status === 'completed') { this.database.exec('COMMIT'); return; }
      if (current.status !== 'processing' || current.lease_expires_at !== job.leaseExpiresAt) { this.database.exec('COMMIT'); return; }
      for (const memory of memories) {
        this.database.prepare('INSERT INTO conversation_memories(id, user_id, conversation_id, source_interaction_id, fact, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(this.createId(), job.userId, job.conversationId, job.interactionId, memory.fact, memory.category, now);
      }
      this.database.prepare("UPDATE memory_extraction_jobs SET status = 'completed', lease_expires_at = NULL, last_error_category = NULL, updated_at = ? WHERE interaction_id = ? AND user_id = ? AND conversation_id = ?")
        .run(now, job.interactionId, job.userId, job.conversationId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  failMemoryExtractionJob(job: ClaimedMemoryJob, category: string, maxAttempts = 5): void {
    const now = this.now();
    const failed = job.attemptCount >= maxAttempts;
    const backoffMilliseconds = Math.min(60 * 60_000, 1000 * (2 ** Math.min(job.attemptCount, 10)));
    const nextAttemptAt = new Date(now.getTime() + backoffMilliseconds).toISOString();
    this.database.prepare("UPDATE memory_extraction_jobs SET status = ?, lease_expires_at = NULL, last_error_category = ?, next_attempt_at = ?, updated_at = ? WHERE interaction_id = ? AND user_id = ? AND conversation_id = ? AND status = 'processing' AND lease_expires_at = ?")
      .run(failed ? 'failed' : 'pending', category.slice(0, 40), nextAttemptAt, now.toISOString(), job.interactionId, job.userId, job.conversationId, job.leaseExpiresAt);
  }

  close(): void {
    this.database.close();
  }
}
