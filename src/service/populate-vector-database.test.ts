import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS } from '../constants.js';
import { InvalidPokemonDatasetError, populateVectorDatabase, PopulationConfigurationError, toEmbeddingDocument } from './populate-vector-database.js';
import type { PokemonVectorRow } from '../domain/pokemon-vector-document.js';
import type { CollectionState, PokemonVectorStore } from '../store/lance-db-store.js';
import type { EmbeddingClient } from './openrouter-embeddings.js';
import { addEmptyTypeRelations } from '../test-helpers/pokemon-dataset.js';

const datasetPath = new URL('../../store/data/pokemon.json', import.meta.url);

async function readDataset(): Promise<unknown> {
  return addEmptyTypeRelations(JSON.parse(await readFile(datasetPath, 'utf8')));
}

function fakeStore() {
  const calls: Array<{ name: string; rows: PokemonVectorRow[] }> = [];
  const store: PokemonVectorStore = {
    async inspectCollection(name): Promise<CollectionState> { return { collectionExisted: false, databaseCollectionNames: [name] }; },
    async replaceCollection(name, rows): Promise<CollectionState> {
      calls.push({ name, rows });
      return { collectionExisted: calls.length > 1, databaseCollectionNames: [name] };
    },
    async searchByVector() { return []; },
    async lookup() { return []; },
  };
  return { calls, store };
}

function fakeEmbeddings(vectors?: number[][]): EmbeddingClient {
  return { async embedDocuments(texts) {
    return vectors ?? texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5));
  } };
}

test('includes all retrieval facts in the embedding text and keeps source data as metadata', async () => {
  const dataset = await readDataset();
  assert.ok(Array.isArray(dataset));
  const document = toEmbeddingDocument(dataset[0] as Parameters<typeof toEmbeddingDocument>[0]);
  assert.match(document.text, /Name: bulbasaur/);
  assert.match(document.text, /Types: grass, poison/);
  assert.match(document.text, /HP 45, Attack 49, Defense 49, Special Attack 65, Special Defense 65, Speed 45/);
  assert.match(document.text, /Total base stats: 318/);
  assert.match(document.text, /Biology: Bulbasaur/);
  assert.equal(document.metadata.descriptionAttribution, 'Bulbapedia');
  assert.match(document.id, /^001$/);
});

test('adds current and generation-labeled historical type relations to searchable text', async () => {
  const dataset = await readDataset();
  assert.ok(Array.isArray(dataset));
  const pokemon = dataset[0] as Parameters<typeof toEmbeddingDocument>[0];
  const emptyRelations = { noDamageTo: [], halfDamageTo: [], doubleDamageTo: [], noDamageFrom: [], halfDamageFrom: [], doubleDamageFrom: [] };
  const document = toEmbeddingDocument({
    ...pokemon,
    typeDetails: [{
      name: 'grass', url: 'https://pokeapi.co/api/v2/type/12/',
      damageRelations: { ...emptyRelations, doubleDamageTo: [{ name: 'water', url: 'https://pokeapi.co/api/v2/type/11/' }] },
      pastDamageRelations: [{
        generation: { name: 'generation-i', url: 'https://pokeapi.co/api/v2/generation/1/' },
        damageRelations: { ...emptyRelations, halfDamageFrom: [{ name: 'fire', url: 'https://pokeapi.co/api/v2/type/10/' }] },
      }],
    }, ...pokemon.typeDetails.slice(1)],
  });
  assert.match(document.text, /Type grass is strong against: water/);
  assert.match(document.text, /In generation-i, type grass was resistant to: fire/);
  assert.equal(document.metadata.typeDetails[0]?.url, 'https://pokeapi.co/api/v2/type/12/');
});

test('embeds and replaces exactly the complete validated 151-record dataset', async () => {
  const { calls, store } = fakeStore();
  const result = await populateVectorDatabase(await readDataset(), {
    collectionName: 'pokedex_vectors', openRouterApiKey: 'secret-test-value',
  }, { embeddings: fakeEmbeddings(), store });
  assert.deepEqual(result, { collectionName: 'pokedex_vectors', recordCount: 151, collectionExisted: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.rows.length, 151);
  assert.equal(calls[0]?.rows[150]?.id, 151);
  assert.equal(calls[0]?.rows[0]?.vector.length, EMBEDDING_DIMENSIONS);
  assert.equal(calls[0]?.rows[0]?.descriptionAttribution, 'Bulbapedia');
  assert.equal(JSON.parse(calls[0]?.rows[0]?.typeDetails ?? '[]')[0]?.name, 'grass');
});

test('invalid data, protected names, and embedding failures never call the store', async () => {
  const dataset = await readDataset();
  const { calls, store } = fakeStore();
  await assert.rejects(populateVectorDatabase([], { collectionName: 'pokedex_vectors', openRouterApiKey: 'key' }, { embeddings: fakeEmbeddings(), store }), InvalidPokemonDatasetError);
  await assert.rejects(populateVectorDatabase(dataset, { collectionName: 'SYSTEM', openRouterApiKey: 'key' }, { embeddings: fakeEmbeddings(), store }), PopulationConfigurationError);
  const failing: EmbeddingClient = { async embedDocuments() { throw new Error('network'); } };
  await assert.rejects(populateVectorDatabase(dataset, { collectionName: 'pokedex_vectors', openRouterApiKey: 'key' }, { embeddings: failing, store }), /OpenRouter embedding request failed/);
  assert.equal(calls.length, 0);
});
