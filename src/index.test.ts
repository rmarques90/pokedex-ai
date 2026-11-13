import assert from 'node:assert/strict';
import test from 'node:test';
import type { AskService } from './config/ask-runtime.js';
import { startApiServer } from './index.js';
import { SqliteUserStore, type UserStore } from './store/sqlite-user-store.js';

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

test('persists browser asks before responding and keeps histories isolated by user', async () => {
  let observedMemory: string | undefined;
  const answerService: AskService = {
    async ask(_question, memoryContext) { observedMemory = memoryContext; return { answer: 'Answer', abstained: false, sources: [] }; },
    async askStream(_question, _signal, emit) { emit({ type: 'delta', text: 'Answer' }); return { answer: 'Answer', abstained: false, sources: [] }; },
    memoryExtractor: { async extract() { return []; } },
  };
  const store = new SqliteUserStore({ databasePath: ':memory:' });
  const server = await startApiServer({ service: answerService, userStore: store, port: 0 });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const login = async (name: string) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    });
    return response.json() as Promise<{ id: string; name: string }>;
  };
  try {
    const ash = await login('Ash');
    const misty = await login('Misty');
    const conversationId = '00000000-0000-4000-8000-000000000099';
    const response = await fetch(`${baseUrl}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Question', userId: ash.id, conversationId }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Answer', abstained: false, sources: [] });
    assert.equal(observedMemory, undefined);
    const history = await fetch(`${baseUrl}/users/${ash.id}/conversations/${conversationId}`);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).interactions[0].question, 'Question');
    const streamedConversationId = '00000000-0000-4000-8000-000000000098';
    const streamed = await fetch(`${baseUrl}/ask/stream`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Streamed question', userId: ash.id, conversationId: streamedConversationId }),
    });
    const streamBody = await streamed.text();
    assert.match(streamBody, /event: complete/);
    const streamedHistory = await fetch(`${baseUrl}/users/${ash.id}/conversations/${streamedConversationId}`);
    assert.equal((await streamedHistory.json()).interactions[0].question, 'Streamed question');
    const hidden = await fetch(`${baseUrl}/users/${misty.id}/conversations/${conversationId}`);
    assert.equal(hidden.status, 404);
    const crossAsk = await fetch(`${baseUrl}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Attempt', userId: misty.id, conversationId }),
    });
    assert.equal(crossAsk.status, 404);
    const otherHistory = await fetch(`${baseUrl}/users/${misty.id}/conversations`);
    assert.equal((await otherHistory.json()).conversations.length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
