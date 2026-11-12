import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserHistoryDocumentSchema } from './browser-history.js';

const id = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const entry = { id, conversationId, createdAt: '2026-11-12T12:00:00.000Z', question: 'Who is Pikachu?', result: { answer: 'An Electric-type Pokémon.', abstained: false, sources: [] } };

test('accepts a valid browser history document', () => {
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ version: 1, activeConversationId: conversationId, entries: [entry] }).success, true);
});

test('rejects malformed results, timestamps, duplicate IDs, extra fields, unsupported versions, and excessive entries', () => {
  const valid = { version: 1, activeConversationId: conversationId, entries: [entry] };
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, version: 2 }).success, false);
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, entries: [{ ...entry, createdAt: 'yesterday' }] }).success, false);
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, entries: [{ ...entry, result: { ...entry.result, sources: [{ pokemonId: 999, pokemonName: 'bad', url: 'bad' }] } }] }).success, false);
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, entries: [entry, entry] }).success, false);
  assert.equal(BrowserHistoryDocumentSchema.safeParse({ ...valid, entries: Array.from({ length: 101 }, (_, index) => ({ ...entry, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })) }).success, false);
});
