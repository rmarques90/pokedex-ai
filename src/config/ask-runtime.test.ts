import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS } from '../constants.js';
import { AskRuntimeConfigurationError, type RetrievedEvidence } from '../domain/ask.js';
import type { LocalVectorStoreHandle } from '../store/local-lancedb.js';
import { createAskService, readAskRuntimeConfig } from './ask-runtime.js';

const evidence: RetrievedEvidence = {
  id: 1,
  text: 'Bulbasaur is Grass and Poison type.',
  pokemonName: 'bulbasaur',
  sources: [{ pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' }],
};

test('validates collection and OpenRouter configuration without exposing the key', () => {
  assert.deepEqual(readAskRuntimeConfig({ LANCEDB_COLLECTION_NAME: 'pokedex_vectors', OPENROUTER_API_KEY: 'test-secret' }), {
    collectionName: 'pokedex_vectors',
    openRouterApiKey: 'test-secret',
  });
  assert.throws(() => readAskRuntimeConfig({ LANCEDB_COLLECTION_NAME: 'SYSTEM', OPENROUTER_API_KEY: 'sensitive-value' }), (error: unknown) => {
    assert.ok(error instanceof AskRuntimeConfigurationError);
    assert.doesNotMatch(error.message, /sensitive-value/);
    return true;
  });
  assert.throws(() => readAskRuntimeConfig({ LANCEDB_COLLECTION_NAME: 'pokedex_vectors' }), AskRuntimeConfigurationError);
});

test('rejects invalid runtime configuration before opening LanceDB', async () => {
  let connectionCount = 0;
  await assert.rejects(createAskService({
    environment: { LANCEDB_COLLECTION_NAME: 'pokedex_vectors' },
    async connectStore() { connectionCount += 1; throw new Error('should not connect'); },
  }), AskRuntimeConfigurationError);
  assert.equal(connectionCount, 0);
});

test('composes local store, embedding, guardrail, and generator dependencies without reading .env', async () => {
  let connectionCount = 0;
  let receivedKey = '';
  const store: LocalVectorStoreHandle['store'] = {
    async inspectCollection(name) { return { collectionExisted: true, databaseCollectionNames: [name] }; },
    async replaceCollection(name) { return { collectionExisted: true, databaseCollectionNames: [name] }; },
    async searchByVector(name, vector, topK) {
      assert.equal(name, 'pokedex_vectors');
      assert.equal(vector.length, EMBEDDING_DIMENSIONS);
      assert.equal(topK, 5);
      return [evidence];
    },
  };
  const runtime = await createAskService({
    environment: { LANCEDB_COLLECTION_NAME: 'pokedex_vectors', OPENROUTER_API_KEY: 'runtime-secret' },
    async connectStore() { connectionCount += 1; return { store, databaseExisted: true }; },
    createEmbeddings(apiKey) {
      receivedKey = apiKey;
      return {
        async embedDocuments(texts) { return texts.map(() => []); },
        async embedQuery() { return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1); },
      };
    },
    createGenerator(apiKey) {
      receivedKey = apiKey;
      return { async generate() { return { answer: 'Bulbasaur is Grass and Poison type.', abstained: false, usedPokemonIds: [1] }; } };
    },
  });

  const answer = await runtime.ask('What type is Bulbasaur?');
  assert.equal(connectionCount, 1);
  assert.equal(receivedKey, 'runtime-secret');
  assert.equal(answer.abstained, false);
  assert.equal(answer.sources[0]?.url, evidence.sources[0]?.url);
});
