import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SqliteUserStore } from './sqlite-user-store.js';

const userOne = '00000000-0000-4000-8000-000000000001';
const userTwo = '00000000-0000-4000-8000-000000000002';
const conversationOne = '00000000-0000-4000-8000-000000000011';
const conversationTwo = '00000000-0000-4000-8000-000000000012';
function createStore(now = () => new Date(), next = { value: 1 }) {
  return new SqliteUserStore({
    databasePath: ':memory:', now,
    createId: () => `00000000-0000-4000-8000-${String(next.value++).padStart(12, '0')}`,
  });
}
const answer = { answer: 'Answer', abstained: false, sources: [] };

test('creates one user for equivalent names and preserves the first display spelling', () => {
  const store = new SqliteUserStore({ databasePath: ':memory:', createId: () => '00000000-0000-4000-8000-000000000001' });
  try {
    const first = store.findOrCreateByName('Ash', 'ash');
    const repeated = store.findOrCreateByName('ASH', 'ash');
    assert.deepEqual(repeated, first);
    assert.equal(first.name, 'Ash');
  } finally { store.close(); }
});

test('persists identities after closing and reopening a database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokedex-user-store-'));
  const databasePath = join(directory, 'users.sqlite');
  try {
    const first = new SqliteUserStore({ databasePath, createId: () => '00000000-0000-4000-8000-000000000001' });
    const created = first.findOrCreateByName('Misty', 'misty');
    first.close();

    const reopened = new SqliteUserStore({ databasePath, createId: () => '00000000-0000-4000-8000-000000000002' });
    try { assert.deepEqual(reopened.findOrCreateByName('misty', 'misty'), created); }
    finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('persists interactions with pending extraction jobs and enforces per-conversation retention', () => {
  const store = createStore();
  try {
    store.findOrCreateByName('Ash', 'ash');
    store.findOrCreateByName('Misty', 'misty');
    for (let index = 0; index < 51; index += 1) {
      store.appendCompletedInteraction({ userId: userOne, conversationId: conversationOne, question: `Question ${index}`, result: answer });
    }
    store.appendCompletedInteraction({ userId: userOne, conversationId: conversationTwo, question: 'Other conversation', result: answer });
    const detail = store.getConversation(userOne, conversationOne);
    assert.equal(detail?.interactions.length, 50);
    assert.equal(detail?.interactions[0]?.question, 'Question 1');
    assert.equal(store.getConversation(userOne, conversationTwo)?.interactions.length, 1);
    const claimed = store.claimMemoryExtractionJob();
    assert.ok(claimed);
    assert.equal(claimed.question, 'Question 1');
    store.completeMemoryExtractionJob(claimed, [{ fact: 'Likes Eevee', category: 'pokemon_interest' }]);
    assert.equal(store.getMemories(userOne, conversationOne).length, 1);
  } finally { store.close(); }
});

test('scopes history and deletion by user and cascades source memories/jobs', () => {
  const store = createStore();
  try {
    store.findOrCreateByName('Ash', 'ash');
    store.findOrCreateByName('Misty', 'misty');
    store.appendCompletedInteraction({ userId: userOne, conversationId: conversationOne, question: 'Ash question', result: answer });
    store.appendCompletedInteraction({ userId: userTwo, conversationId: conversationTwo, question: 'Misty question', result: answer });
    const job = store.claimMemoryExtractionJob();
    assert.ok(job);
    store.completeMemoryExtractionJob(job, [{ fact: 'Likes Eevee', category: 'pokemon_interest' }]);
    assert.equal(store.getConversation(userTwo, conversationOne), null);
    assert.equal(store.deleteConversation(userTwo, conversationOne), false);
    assert.equal(store.listConversations(userOne, 20).conversations.length, 1);
    assert.equal(store.deleteConversation(userOne, conversationOne), true);
    assert.deepEqual(store.getMemories(userOne, conversationOne), []);
    assert.equal(store.getConversation(userTwo, conversationTwo)?.interactions.length, 1);
  } finally { store.close(); }
});

test('paginates conversation summaries and clear-history affects only one user', () => {
  const clock = { value: Date.parse('2026-01-01T00:00:00.000Z') };
  const store = createStore(() => new Date(clock.value++));
  try {
    store.findOrCreateByName('Ash', 'ash');
    store.findOrCreateByName('Misty', 'misty');
    for (let index = 0; index < 3; index += 1) {
      const conversationId = `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`;
      store.appendCompletedInteraction({ userId: userOne, conversationId, question: `Question ${index}`, result: answer });
    }
    store.appendCompletedInteraction({ userId: userTwo, conversationId: '00000000-0000-4000-8000-000000000200', question: 'Private', result: answer });
    const first = store.listConversations(userOne, 2);
    assert.equal(first.conversations.length, 2);
    assert.ok(first.nextCursor);
    const second = store.listConversations(userOne, 2, first.nextCursor!);
    assert.equal(second.conversations.length, 1);
    assert.equal(store.clearConversations(userOne), 3);
    assert.equal(store.listConversations(userOne, 20).conversations.length, 0);
    assert.equal(store.listConversations(userTwo, 20).conversations.length, 1);
  } finally { store.close(); }
});

test('recovers expired extraction leases and rejects stale worker completions', () => {
  const clock = { value: Date.parse('2026-01-01T00:00:00.000Z') };
  const store = createStore(() => new Date(clock.value));
  try {
    store.findOrCreateByName('Ash', 'ash');
    store.appendCompletedInteraction({ userId: userOne, conversationId: conversationOne, question: 'I prefer concise answers.', result: answer });
    const firstLease = store.claimMemoryExtractionJob(1000);
    assert.ok(firstLease);
    clock.value += 1001;
    const recovered = store.claimMemoryExtractionJob(1000);
    assert.ok(recovered);
    assert.equal(recovered.attemptCount, 2);
    store.completeMemoryExtractionJob(firstLease, [{ fact: 'Stale fact', category: 'response_preference' }]);
    assert.deepEqual(store.getMemories(userOne, conversationOne), []);
    store.completeMemoryExtractionJob(recovered, [{ fact: 'Prefers concise answers', category: 'response_preference' }]);
    assert.equal(store.getMemories(userOne, conversationOne)[0]?.fact, 'Prefers concise answers');
  } finally { store.close(); }
});
