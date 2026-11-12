import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PublicUser } from '../domain/user.js';

export interface StoredUser extends PublicUser {
  normalizedName: string;
  createdAt: string;
}

export interface UserStore {
  findOrCreateByName(name: string, normalizedName: string): PublicUser;
  close(): void;
}

interface SqliteUserStoreOptions {
  databasePath?: string;
  now?: () => Date;
  createId?: () => string;
}

export class SqliteUserStore implements UserStore {
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

  close(): void {
    this.database.close();
  }
}
