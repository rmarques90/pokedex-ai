import assert from 'node:assert/strict';
import test from 'node:test';
import { AskApiError, askPokemon, askPokemonStream, type AskFetcher } from './api-client.js';

const result = {
  answer: 'Bulbasaur is a Grass and Poison Pokémon.',
  abstained: false,
  sources: [{ pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' }],
};

test('sends a question-only POST request and validates the answer response', async () => {
  let receivedUrl: RequestInfo | URL | undefined;
  let receivedInit: RequestInit | undefined;
  const fetcher: AskFetcher = async (input, init) => {
    receivedUrl = input;
    receivedInit = init;
    return { ok: true, status: 200, json: async () => result };
  };

  assert.deepEqual(await askPokemon('  Who is Bulbasaur?  ', fetcher), result);
  assert.equal(receivedUrl, '/ask');
  assert.equal(receivedInit?.method, 'POST');
  assert.equal(new Headers(receivedInit?.headers).get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(receivedInit?.body)), { question: 'Who is Bulbasaur?' });
});

test('rejects an empty question before making the request', async () => {
  let called = false;
  const fetcher: AskFetcher = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => result };
  };
  await assert.rejects(askPokemon('  ', fetcher));
  assert.equal(called, false);
});

test('turns HTTP errors into a safe displayable error with status', async () => {
  const fetcher: AskFetcher = async () => ({ ok: false, status: 500, json: async () => ({ error: 'internal detail' }) });
  await assert.rejects(askPokemon('Who is Bulbasaur?', fetcher), (error: unknown) => {
    assert.ok(error instanceof AskApiError);
    assert.equal(error.status, 500);
    assert.doesNotMatch(error.message, /internal detail/);
    return true;
  });
});

test('rejects malformed JSON and invalid answer payloads', async () => {
  const invalidJson: AskFetcher = async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad JSON'); } });
  const invalidShape: AskFetcher = async () => ({ ok: true, status: 200, json: async () => ({ answer: '', sources: [] }) });
  await assert.rejects(askPokemon('Who is Bulbasaur?', invalidJson), AskApiError);
  await assert.rejects(askPokemon('Who is Bulbasaur?', invalidShape), AskApiError);
});

test('converts network errors into a safe displayable error', async () => {
  const fetcher: AskFetcher = async () => { throw new Error('network internals'); };
  await assert.rejects(askPokemon('Who is Bulbasaur?', fetcher), (error: unknown) => {
    assert.ok(error instanceof AskApiError);
    assert.doesNotMatch(error.message, /network internals/);
    return true;
  });
});

function streamResponse(body: string, chunks?: number[]): Response {
  const encoded = new TextEncoder().encode(body);
  let offset = 0;
  let chunkIndex = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= encoded.length) { controller.close(); return; }
      const size = chunks?.[chunkIndex++] ?? encoded.length;
      controller.enqueue(encoded.slice(offset, offset + size));
      offset += size;
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('reads split SSE frames and UTF-8 chunks from /ask/stream', async () => {
  const wire = [
    `event: delta\ndata: {"type":"delta","text":"Pokémon ”"}\n\n`,
    `event: complete\ndata: {"type":"complete","result":${JSON.stringify(result)}}\n\n`,
  ].join('');
  const bytes = new TextEncoder().encode(wire);
  const pokemonByte = new TextEncoder().encode('é')[0]!;
  const splitAt = bytes.indexOf(pokemonByte) + 1;
  let receivedUrl: RequestInfo | URL | undefined;
  let draft = '';
  const answer = await askPokemonStream('Who is Bulbasaur?', {
    fetcher: async (input) => { receivedUrl = input; return streamResponse(wire, [splitAt, 1]); },
    onDelta: (text) => { draft += text; },
  });
  assert.equal(receivedUrl, '/ask/stream');
  assert.equal(draft, 'Pokémon ”');
  assert.deepEqual(answer, result);
});

test('retries incomplete streams at most three times and clears each partial draft', async () => {
  let calls = 0;
  const replacements: string[] = [];
  const retryAttempts: number[] = [];
  const answer = await askPokemonStream('Who is Bulbasaur?', {
    fetcher: async () => {
      calls += 1;
      if (calls < 4) return streamResponse('event: delta\ndata: {"type":"delta","text":"partial"}\n\n');
      return streamResponse(`event: complete\ndata: {"type":"complete","result":${JSON.stringify(result)}}\n\n`);
    },
    onReplace: (text, reason) => { if (reason === 'retry') replacements.push(text); },
    onRetry: (attempt) => retryAttempts.push(attempt),
    delay: async () => undefined,
  });
  assert.deepEqual(answer, result);
  assert.equal(calls, 4);
  assert.deepEqual(replacements, ['', '', '']);
  assert.deepEqual(retryAttempts, [1, 2, 3]);
});

test('does not retry non-retryable 4xx responses or a non-retryable stream error', async () => {
  let calls = 0;
  await assert.rejects(askPokemonStream('Who is Bulbasaur?', {
    fetcher: async () => { calls += 1; return new Response('{}', { status: 400 }); },
    delay: async () => undefined,
  }), (error: unknown) => error instanceof AskApiError && error.status === 400);
  assert.equal(calls, 1);
  await assert.rejects(askPokemonStream('Who is Bulbasaur?', {
    fetcher: async () => { calls += 1; return streamResponse('event: error\ndata: {"type":"error","error":"Rejected","retryable":false}\n\n'); },
  }));
  assert.equal(calls, 2);
});
