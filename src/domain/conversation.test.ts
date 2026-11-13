import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConversationAskRequestSchema,
  ConversationDetailSchema,
  ConversationListQuerySchema,
  ConversationMemorySchema,
  MemoryExtractionSchema,
  MemoryExtractionJobSchema,
} from './conversation.js';

const userId = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const interactionId = '00000000-0000-4000-8000-000000000003';

test('validates ask context and rejects unknown request fields', () => {
  assert.equal(ConversationAskRequestSchema.parse({ question: '  Pikachu? ', userId, conversationId }).question, 'Pikachu?');
  assert.equal(ConversationAskRequestSchema.safeParse({ question: 'x', userId, conversationId, owner: userId }).success, false);
});

test('validates bounded memory candidates and extraction results', () => {
  assert.equal(MemoryExtractionSchema.safeParse({ memories: [{ fact: 'Prefers concise answers', category: 'response_preference' }] }).success, true);
  assert.equal(MemoryExtractionSchema.safeParse({ memories: [{ fact: 'x'.repeat(241), category: 'response_preference' }] }).success, false);
  assert.equal(MemoryExtractionSchema.safeParse({ memories: [{ fact: 'x', category: 'health' }] }).success, false);
});

test('validates extraction job state and conversation response bounds', () => {
  const now = new Date().toISOString();
  assert.equal(MemoryExtractionJobSchema.safeParse({
    interactionId, userId, conversationId, status: 'pending', attemptCount: 0,
    nextAttemptAt: now, leaseExpiresAt: null, lastErrorCategory: null, createdAt: now, updatedAt: now,
  }).success, true);
  assert.equal(ConversationDetailSchema.safeParse({
    id: conversationId, createdAt: now, updatedAt: now,
    interactions: Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      conversationId, createdAt: now, question: 'q', result: { answer: 'a', abstained: false, sources: [] },
    })),
  }).success, false);
  assert.equal(ConversationListQuerySchema.safeParse({ limit: '1000' }).success, false);
});

test('validates memory ownership and attribution identifiers', () => {
  const result = MemoryExtractionSchema.parse({ memories: [{ fact: 'Likes Eevee', category: 'pokemon_interest' }] }).memories[0]!;
  assert.equal(ConversationMemorySchema.safeParse({
    ...result, id: interactionId, userId, conversationId, sourceInteractionId: interactionId, createdAt: new Date().toISOString(),
  }).success, true);
});
