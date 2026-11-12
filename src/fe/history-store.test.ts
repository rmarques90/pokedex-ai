import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistoryStore, HISTORY_STORAGE_KEY, type HistoryStorage } from './history-store.js';

class MemoryStorage implements HistoryStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function ids() { let value = 0; return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`; }
const exchange = (conversationId: string, question: string) => ({ conversationId, question, result: { answer: `Answer: ${question}`, abstained: false, sources: [] } });

test('persists exchanges, keeps newest 100, starts and deletes conversations', () => {
  const storage = new MemoryStorage();
  const store = createHistoryStore({ storage, createId: ids(), now: () => new Date('2026-11-12T12:00:00Z') });
  const initial = store.load().document;
  for (let index = 0; index < 102; index += 1) store.append(exchange(initial.activeConversationId, `Question ${index}`));
  assert.equal(store.load().document.entries.length, 100);
  assert.equal(store.load().document.entries[0]?.question, 'Question 2');
  const oldConversation = store.startConversation().document.activeConversationId;
  store.append(exchange(oldConversation, 'In second conversation'));
  const currentConversation = store.startConversation().document.activeConversationId;
  const deleted = store.deleteConversation(oldConversation).document;
  assert.equal(deleted.activeConversationId, currentConversation);
  assert.equal(deleted.entries.some((entry) => entry.conversationId === oldConversation), false);
  assert.ok(deleted.entries.length > 0);
  assert.ok(storage.getItem(HISTORY_STORAGE_KEY));
});

test('deleting the active conversation clears it and creates a fresh conversation ID', () => {
  const store = createHistoryStore({ storage: new MemoryStorage(), createId: ids() });
  const active = store.load().document.activeConversationId;
  store.append(exchange(active, 'Question'));
  const deleted = store.deleteConversation(active).document;
  assert.notEqual(deleted.activeConversationId, active);
  assert.equal(deleted.entries.length, 0);
});

test('does not overwrite invalid persisted data until explicit clear', () => {
  const storage = new MemoryStorage();
  storage.values.set(HISTORY_STORAGE_KEY, '{bad json');
  const store = createHistoryStore({ storage, createId: ids() });
  const loaded = store.load();
  assert.equal(loaded.persistent, false);
  store.append(exchange(loaded.document.activeConversationId, 'In memory'));
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), '{bad json');
  assert.equal(store.clear().persistent, true);
  assert.equal(store.load().document.entries.length, 0);
});

test('keeps session usable when storage is unavailable or writes fail', () => {
  const unavailable = createHistoryStore({ storage: null, createId: ids() });
  assert.equal(unavailable.load().persistent, false);
  assert.equal(unavailable.append(exchange(unavailable.load().document.activeConversationId, 'Memory')).document.entries.length, 1);
  const storage = new MemoryStorage(); storage.failWrites = true;
  const store = createHistoryStore({ storage, createId: ids() });
  const current = store.load().document;
  assert.equal(store.append(exchange(current.activeConversationId, 'Quota')).persistent, false);
  assert.equal(store.load().document.entries.length, 1);
});
