import { ConversationListQuerySchema, MemoryCandidateSchema, type ConversationAskContext, type ConversationDetail, type ConversationMemory, type ConversationPage, type MemoryCandidate } from '../domain/conversation.js';
import type { AskResult } from '../domain/ask.js';
import type { ConversationStore } from '../store/sqlite-user-store.js';

export class ConversationAccessError extends Error {
  constructor() { super('Conversation not found.'); this.name = new.target.name; }
}

export interface ConversationService {
  validateAsk(context: ConversationAskContext): void;
  recordCompleted(input: ConversationAskContext & { question: string; result: AskResult }): string;
  list(userId: string, query: unknown): ConversationPage;
  get(userId: string, conversationId: string): ConversationDetail;
  delete(userId: string, conversationId: string): void;
  clear(userId: string): void;
  memories(context: ConversationAskContext, question: string): ConversationMemory[];
}

const MAX_MEMORY_CONTEXT_CHARS = 1200;

export function buildMemoryContext(memories: ConversationMemory[], question: string): string | undefined {
  const questionWords = new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
  let budget = MAX_MEMORY_CONTEXT_CHARS;
  const selected: string[] = [];
  for (const memory of memories) {
    const words = memory.fact.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const broadlyRelevant = memory.category === 'response_preference' || memory.category === 'knowledge_level';
    if (!broadlyRelevant && questionWords.size > 0 && !words.some((word) => questionWords.has(word))) continue;
    const fact = '[' + memory.category + '] ' + memory.fact;
    if (fact.length > budget) continue;
    selected.push(fact);
    budget -= fact.length + 1;
  }
  return selected.length ? selected.join('\n') : undefined;
}

export function createConversationService(store: ConversationStore): ConversationService {
  return {
    validateAsk(context) {
      store.validateConversationAccess(context.userId, context.conversationId);
    },
    recordCompleted(input) {
      return store.appendCompletedInteraction(input);
    },
    list(userId, query) {
      const parsed = ConversationListQuerySchema.parse(query);
      return store.listConversations(userId, parsed.limit, parsed.cursor);
    },
    get(userId, conversationId) {
      const conversation = store.getConversation(userId, conversationId);
      if (!conversation) throw new ConversationAccessError();
      return conversation;
    },
    delete(userId, conversationId) {
      if (!store.deleteConversation(userId, conversationId)) throw new ConversationAccessError();
    },
    clear(userId) {
      store.clearConversations(userId);
    },
    memories(context, question) {
      return store.getMemories(context.userId, context.conversationId, 30);
    },
  };
}

export function validateMemoryCandidates(value: unknown): MemoryCandidate[] {
  const parsed = MemoryCandidateSchema.array().max(5).safeParse(value);
  return parsed.success ? parsed.data : [];
}
