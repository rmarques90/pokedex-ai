import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS } from './constants.js';
import type { RetrievedEvidence } from './domain/ask.js';
import type { LocalVectorStoreHandle } from './store/local-lancedb.js';
import { createAskService } from './config/ask-runtime.js';
import { runCli } from './cli.js';
import { startApiServer } from './index.js';

test('CLI and HTTP use the same composed answer service and return consistent results', async () => {
  const evidence: RetrievedEvidence = {
    id: 1,
    text: 'Bulbasaur is a Grass and Poison Pokémon.',
    pokemonName: 'bulbasaur',
    types: ['grass', 'poison'],
    total: 318,
    sources: [{ pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' }],
  };
  const store: LocalVectorStoreHandle['store'] = {
    async inspectCollection(name) { return { collectionExisted: true, databaseCollectionNames: [name] }; },
    async replaceCollection(name) { return { collectionExisted: true, databaseCollectionNames: [name] }; },
    async searchByVector(name, vector, topK) {
      assert.equal(name, 'pokedex_vectors');
      assert.equal(vector.length, EMBEDDING_DIMENSIONS);
      assert.equal(topK, 5);
      return [evidence];
    },
    async lookup() { return [evidence]; },
  };
  const service = await createAskService({
    environment: { LANCEDB_COLLECTION_NAME: 'pokedex_vectors', OPENROUTER_API_KEY: 'integration-test-key' },
    async connectStore() { return { store, databaseExisted: true }; },
    createEmbeddings() {
      return {
        async embedDocuments(texts) { return texts.map(() => []); },
        async embedQuery() { return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1); },
      };
    },
    createGenerator() {
      return { async generate() { return { answer: 'Bulbasaur is Grass and Poison type.', abstained: false, usedPokemonIds: [1] }; } };
    },
    createGuardrail() {
      return {
        async checkQuestion(question) { return question as string; },
        checkEvidence(items) { return items as RetrievedEvidence[]; },
      };
    },
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  const cliExitCode = await runCli(['ask', 'What type is Bulbasaur?'], { ask: service.ask }, {
    writeOutput: (line) => stdout.push(line),
    writeError: (line) => stderr.push(line),
  });
  assert.equal(cliExitCode, 0);
  assert.deepEqual(stderr, []);

  const server = await startApiServer({ service, port: 0 });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const httpResponse = await fetch(`http://127.0.0.1:${address.port}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ question: 'What type is Bulbasaur?' }),
    });
    const httpResult: unknown = await httpResponse.json();
    assert.equal(httpResponse.status, 200);
    assert.deepEqual(httpResult, {
      answer: 'Bulbasaur is Grass and Poison type.',
      abstained: false,
      sources: evidence.sources,
    });
    assert.deepEqual(stdout, [
      'Bulbasaur is Grass and Poison type.',
      `Sources:\n- bulbasaur: ${evidence.sources[0]?.url}`,
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
