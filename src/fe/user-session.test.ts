import assert from 'node:assert/strict';
import test from 'node:test';
import { clearActiveUser, readActiveUser, saveActiveUser, USER_STORAGE_KEY, type UserStorage } from './user-session.js';

class MemoryStorage implements UserStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Ash' };

test('validates and restores public identity from browser storage', () => {
  const storage = new MemoryStorage();
  assert.equal(readActiveUser(storage), null);
  assert.equal(saveActiveUser(user, storage), true);
  assert.deepEqual(readActiveUser(storage), user);
  storage.setItem(USER_STORAGE_KEY, '{broken');
  assert.equal(readActiveUser(storage), null);
});

test('clears stored identity and handles unavailable storage', () => {
  const storage = new MemoryStorage();
  saveActiveUser(user, storage);
  clearActiveUser(storage);
  assert.equal(storage.getItem(USER_STORAGE_KEY), null);
  assert.equal(saveActiveUser(user, null), false);
  assert.doesNotThrow(() => clearActiveUser({ removeItem: () => { throw new Error('unavailable'); } }));
});
