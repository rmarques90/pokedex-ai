import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runPopulateCommand } from './populate-vector-database.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';
import type { EmbeddingClient } from '../service/openrouter-embeddings.js';
import { EMBEDDING_DIMENSIONS } from '../constants.js';

const datasetUrl = new URL('../../store/data/pokemon.json', import.meta.url);

function dependencies(overrides: Partial<Parameters<typeof runPopulateCommand>[0]> = {}) {
  const lines: string[] = [];
  const store: PokemonVectorStore = {
    async inspectCollection(name) { return { collectionExisted: false, databaseCollectionNames: [name] }; },
    async replaceCollection(name, rows) { return { collectionExisted: false, databaseCollectionNames: [name] }; },
    async searchByVector() { return []; },
    async lookup() { return []; },
  };
  let connectionCount = 0;
  const embeddings: EmbeddingClient = { async embedDocuments(texts) { return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1)); } };
  const base = {
    environment: { LANCEDB_COLLECTION_NAME: 'pokedex_vectors', OPENROUTER_API_KEY: 'test-secret' },
    readDataset: () => readFile(datasetUrl, 'utf8'),
    createEmbeddings: () => embeddings,
    connectStore: async () => { connectionCount += 1; return { store, databaseExisted: true }; },
    writeLine: (line: string) => lines.push(line),
  };
  return { dependencies: { ...base, ...overrides }, lines, store, get connectionCount() { return connectionCount; } };
}

test('validates inputs before opening LanceDB and reports existing database and collection', async () => {
  const fixture = dependencies();
  await runPopulateCommand(fixture.dependencies);
  assert.equal(fixture.connectionCount, 1);
  assert.match(fixture.lines.join('\n'), /database existed before this run: yes/);
  assert.match(fixture.lines.join('\n'), /collection existed before this run: no/);
  assert.match(fixture.lines.join('\n'), /Populated 151 Pokemon records/);
  assert.doesNotMatch(fixture.lines.join('\n'), /test-secret/);
});

test('missing configuration or invalid dataset fails before opening the database', async () => {
  const missingConfig = dependencies({ environment: {} });
  await assert.rejects(runPopulateCommand(missingConfig.dependencies), /LANCEDB_COLLECTION_NAME and OPENROUTER_API_KEY/);
  assert.equal(missingConfig.connectionCount, 0);

  const invalidDataset = dependencies({ readDataset: async () => '{malformed' });
  await assert.rejects(runPopulateCommand(invalidDataset.dependencies), /valid 151-record dataset/);
  assert.equal(invalidDataset.connectionCount, 0);
});

test('npm populate_db command points to the internal script', async () => {
  const packageJson: unknown = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal((packageJson as { scripts: Record<string, string> }).scripts.populate_db, 'tsx src/scripts/populate-vector-database.ts');
});
