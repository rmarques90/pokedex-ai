import assert from 'node:assert/strict';
import test from 'node:test';
import { AskApiError, askPokemon, type AskFetcher } from './api-client.js';

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
