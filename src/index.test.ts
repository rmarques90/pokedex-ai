import assert from 'node:assert/strict';
import test from 'node:test';
import type { AskService } from './config/ask-runtime.js';
import { startApiServer } from './index.js';
import type { UserStore } from './store/sqlite-user-store.js';

const service: AskService = { async ask() { return { answer: 'Answer', abstained: false, sources: [] }; } };

test('starts with an injected user store, serves login, and closes persistence with the HTTP server', async () => {
  const rows = new Map<string, { id: string; name: string }>();
  let closed = false;
  const userStore: UserStore = {
    findOrCreateByName(name, normalizedName) {
      const existing = rows.get(normalizedName);
      if (existing) return existing;
      const created = { id: '00000000-0000-4000-8000-000000000001', name };
      rows.set(normalizedName, created);
      return created;
    },
    close() { closed = true; },
  };
  const server = await startApiServer({ service, userStore, port: 0 });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '  Ash  ' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: '00000000-0000-4000-8000-000000000001', name: 'Ash' });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.equal(closed, true);
});

test('fails before listening when SQLite store initialization fails', async () => {
  await assert.rejects(startApiServer({
    service,
    createUserStore: () => { throw new Error('sqlite unavailable'); },
    port: 0,
  }), /sqlite unavailable/);
});
