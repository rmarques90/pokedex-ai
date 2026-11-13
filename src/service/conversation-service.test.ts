import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationService, buildMemoryContext } from './conversation-service.js';
import { SqliteUserStore } from '../store/sqlite-user-store.js';

const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const conversationId = '00000000-0000-4000-8000-000000000010';
let id = 1;
function makeStore() {
  return new SqliteUserStore({ databasePath: ':memory:', createId: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}` });
}

test('service scopes operations and reports the same not-found error for non-owned conversations', () => {
  const store = makeStore();
  try {
    store.findOrCreateByName('Ash', 'ash');
    store.findOrCreateByName('Misty', 'misty');
    store.appendCompletedInteraction({ userId, conversationId, question: 'Question', result: { answer: 'Answer', abstained: false, sources: [] } });
    const service = createConversationService(store);
    assert.throws(() => service.get(otherUserId, conversationId), { name: 'ConversationAccessError', message: 'Conversation not found.' });
    assert.throws(() => service.delete(otherUserId, conversationId), { name: 'ConversationAccessError', message: 'Conversation not found.' });
    assert.equal(service.get(userId, conversationId).interactions.length, 1);
  } finally { store.close(); }
});

test('memory context is bounded, scoped by the store, and relevance-filters Pokémon facts', () => {
  const context = buildMemoryContext([
    { id: '00000000-0000-4000-8000-000000000030', userId, conversationId, sourceInteractionId: '00000000-0000-4000-8000-000000000031', createdAt: new Date().toISOString(), fact: 'Prefers concise answers', category: 'response_preference' },
    { id: '00000000-0000-4000-8000-000000000032', userId, conversationId, sourceInteractionId: '00000000-0000-4000-8000-000000000033', createdAt: new Date().toISOString(), fact: 'Likes Eevee evolutions', category: 'pokemon_interest' },
  ], 'Tell me about Pikachu');
  assert.equal(context, '[response_preference] Prefers concise answers');
});
