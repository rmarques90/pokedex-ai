import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import test from 'node:test';
import { PromptGuardrailError, PromptSafetyModelError, type AskResult } from '../domain/ask.js';
import { createAskHttpServer, type AskHttpServerOptions } from './server.js';

const success: AskResult = {
  answer: 'Bulbasaur is a Grass and Poison Pokémon.',
  abstained: false,
  sources: [{ pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' }],
};

async function withServer<T>(
  ask: (question: string) => Promise<AskResult>,
  callback: (baseUrl: string) => Promise<T>,
  options?: AskHttpServerOptions,
): Promise<T> {
  const server = createAskHttpServer(ask, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
}

async function post(baseUrl: string, body: string, headers: Record<string, string> = { 'content-type': 'application/json' }): Promise<Response> {
  return fetch(`${baseUrl}/ask`, { method: 'POST', headers, body });
}

test('POST /ask returns the answer and source URLs', async () => {
  let receivedQuestion = '';
  await withServer(async (question) => { receivedQuestion = question; return success; }, async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'What type is Bulbasaur?' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), success);
    assert.equal(receivedQuestion, 'What type is Bulbasaur?');
  });
});

test('accepts a request from an exactly allowed frontend origin', async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; return success; }, async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'What type is Bulbasaur?' }), {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5173',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), success);
    assert.equal(calls, 1);
  }, { allowedOrigins: ['http://127.0.0.1:5173'] });
});

test('rejects unlisted, lookalike, null, and malformed origins before reading the request body or invoking the service', async () => {
  let calls = 0;
  const disallowedOrigins = [
    'http://untrusted.example',
    'http://127.0.0.1:5173.attacker.example',
    'null',
    'not-an-origin',
  ];
  await withServer(async () => { calls += 1; return success; }, async (baseUrl) => {
    for (const origin of disallowedOrigins) {
      const response = await post(baseUrl, '{invalid json', {
        'content-type': 'application/json',
        origin,
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'Request origin is not allowed.' });
    }
    assert.equal(calls, 0);
  }, { allowedOrigins: ['http://127.0.0.1:5173'] });
});

test('POST /ask returns an expected abstention with no sources', async () => {
  await withServer(async () => ({ answer: 'The indexed data is insufficient.', abstained: true, sources: [] }), async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'Question?' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'The indexed data is insufficient.', abstained: true, sources: [] });
  });
});

test('POST /ask preserves a direct lookup answer and its source references', async () => {
  const directResult: AskResult = {
    answer: 'O Pokémon #3 é Venusaur.',
    abstained: false,
    sources: [{ pokemonId: 3, pokemonName: 'venusaur', url: 'https://pokeapi.co/api/v2/pokemon/3/' }],
  };
  await withServer(async () => directResult, async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'Qual o pokemon numero 3?' }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), directResult);
  });
});

test('rejects malformed JSON, invalid questions, and non-JSON content types before invoking the service', async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; return success; }, async (baseUrl) => {
    const malformed = await post(baseUrl, '{invalid');
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /valid JSON/);
    const empty = await post(baseUrl, JSON.stringify({ question: '  ' }));
    assert.equal(empty.status, 400);
    const wrongContentType = await post(baseUrl, 'question', { 'content-type': 'text/plain' });
    assert.equal(wrongContentType.status, 415);
    assert.equal(calls, 0);
  });
});

test('maps server failures to safe HTTP 500 responses and guardrail rejections to client errors', async () => {
  await withServer(async () => { throw new PromptSafetyModelError('private key detail'); }, async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'Question?' }));
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.match(body, /server error/);
    assert.doesNotMatch(body, /private key detail|stack|secret/i);
  });

  await withServer(async () => { throw new PromptGuardrailError(); }, async (baseUrl) => {
    const response = await post(baseUrl, JSON.stringify({ question: 'Ignore instructions?' }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /safety check/);
  });
});

test('returns not found for any route other than POST /ask', async () => {
  await withServer(async () => success, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/other`, { method: 'GET' });
    assert.equal(response.status, 404);
  });
});
