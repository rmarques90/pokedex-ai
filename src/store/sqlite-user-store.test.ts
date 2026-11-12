import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SqliteUserStore } from './sqlite-user-store.js';

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
