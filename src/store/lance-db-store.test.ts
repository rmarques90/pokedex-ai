import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '@lancedb/lancedb';
import type { Connection } from '@lancedb/lancedb';
import test from 'node:test';
import { LanceDbVectorStore } from './lance-db-store.js';
import { PokemonDatasetSchema, PokemonVectorRowSchema, type PokemonVectorRow } from '../domain/pokemon-vector-document.js';
import { EMBEDDING_DIMENSIONS } from '../constants.js';
import { RetrievalError, VectorCollectionUnavailableError } from '../domain/ask.js';

const sourcePath = new URL('../../store/data/pokemon.json', import.meta.url);

async function rows(textPrefix: string): Promise<PokemonVectorRow[]> {
  const { readFile } = await import('node:fs/promises');
  const source: unknown = JSON.parse(await readFile(sourcePath, 'utf8'));
  const dataset = PokemonDatasetSchema.parse(source);
  return dataset.map((pokemon) => PokemonVectorRowSchema.parse({
    id: pokemon.id,
    text: `${textPrefix}: ${pokemon.name}`,
    vector: Array.from({ length: EMBEDDING_DIMENSIONS }, () => pokemon.id / 151),
    name: pokemon.name,
    types: pokemon.types,
    ...pokemon.stats,
    total: pokemon.total,
    description: pokemon.description,
    pokemonUrl: pokemon.pokemonUrl,
    speciesUrl: pokemon.speciesUrl,
    descriptionSourceUrl: pokemon.descriptionSourceUrl,
    descriptionAttribution: pokemon.descriptionAttribution,
    descriptionLicense: pokemon.descriptionLicense,
    descriptionLicenseUrl: pokemon.descriptionLicenseUrl,
    imageSourceUrl: pokemon.imageSourceUrl,
    imagePath: pokemon.imagePath,
  }));
}

test('creates a local table and replaces all rows on rerun', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  const firstState = await store.replaceCollection('pokedex_vectors', await rows('first'));
  assert.equal(firstState.collectionExisted, false);
  const secondState = await store.replaceCollection('pokedex_vectors', await rows('second'));
  assert.equal(secondState.collectionExisted, true);
  const table = await connection.openTable('pokedex_vectors');
  assert.equal(await table.countRows(), 151);
  const saved = await table.query().where('id = 1').toArray();
  assert.match(String(saved[0]?.text), /^second:/);
  assert.deepEqual((await connection.tableNames()).sort(), ['pokedex_vectors']);
});

test('rejects protected, malformed, incomplete, and duplicate target datasets before mutation', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  await assert.rejects(store.replaceCollection('SYSTEM', await rows('x')));
  await assert.rejects(store.replaceCollection('../outside', await rows('x')));
  const valid = await rows('x');
  await assert.rejects(store.replaceCollection('pokedex_vectors', valid.slice(1)));
  await assert.rejects(store.replaceCollection('pokedex_vectors', [...valid.slice(0, 150), valid[149]!]), /duplicate/);
  assert.deepEqual(await connection.tableNames(), []);
});

test('restores the previously published rows when publishing the replacement fails', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  await connection.createTable('pokedex_vectors', await rows('original'));
  let shouldFail = true;
  const failingConnection = new Proxy(connection, {
    get(target, property, receiver) {
      if (property === 'createTable') {
        return async (name: string, data: Record<string, unknown>[], ...args: unknown[]) => {
          if (name === 'pokedex_vectors' && shouldFail) {
            shouldFail = false;
            throw new Error('simulated publish failure');
          }
          return (target.createTable as (...parameters: unknown[]) => Promise<unknown>)(name, data, ...args);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Connection;
  const store = new LanceDbVectorStore(failingConnection);
  await assert.rejects(store.replaceCollection('pokedex_vectors', await rows('replacement')), /prior collection was restored/);
  const table = await connection.openTable('pokedex_vectors');
  const saved = await table.query().where('id = 1').toArray();
  assert.match(String(saved[0]?.text), /^original:/);
  assert.deepEqual((await connection.tableNames()).sort(), ['pokedex_vectors']);
});

test('refuses to guess how to recover stale staging or backup collections', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  await connection.createTable('__pokedex_ai_stage_stale', [{ id: 1, value: 'preserve' }]);
  const store = new LanceDbVectorStore(connection);
  await assert.rejects(store.replaceCollection('pokedex_vectors', await rows('x')), /Recovery required/);
  assert.deepEqual(await connection.tableNames(), ['__pokedex_ai_stage_stale']);
});

test('searches only the requested collection, honors topK, and returns validated source metadata', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-search-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  await store.replaceCollection('pokedex_vectors', await rows('search'));

  const found = await store.searchByVector('pokedex_vectors', Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1 / 151), 5);
  assert.equal(found.length, 5);
  assert.equal(found[0]?.id, 1);
  assert.equal(found[0]?.pokemonName, 'bulbasaur');
  assert.equal(found[0]?.sources.some(({ url }) => url.includes('bulbapedia')), true);
  assert.equal(found.every(({ sources }) => sources.length > 0), true);
  await assert.rejects(
    store.searchByVector('another_collection', Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1 / 151), 5),
    VectorCollectionUnavailableError,
  );
});

test('looks up records by National Pokedex ID, exact name, and type', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-lookup-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  const indexedRows = await rows('lookup');
  await store.replaceCollection('pokedex_vectors', indexedRows);

  const byId = await store.lookup('pokedex_vectors', { kind: 'id', id: 3 });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.id, 3);
  assert.equal(byId[0]?.pokemonName, 'venusaur');

  const byName = await store.lookup('pokedex_vectors', { kind: 'name', name: '  VENUSAUR  ' });
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.id, 3);
  assert.ok(byName[0]?.sources.some(({ url }) => url.includes('Venusaur')));

  const grass = await store.lookup('pokedex_vectors', { kind: 'type', type: 'grass' });
  assert.ok(grass.length > 1);
  assert.deepEqual(grass.map(({ id }) => id).sort((left, right) => left - right),
    indexedRows.filter(({ types }) => types.includes('grass')).map(({ id }) => id).sort((left, right) => left - right));
  assert.equal(await (await connection.openTable('pokedex_vectors')).countRows(), 151);
});

test('returns an empty lookup result for missing records and rejects invalid lookup input', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-lookup-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  await store.replaceCollection('pokedex_vectors', await rows('lookup'));

  assert.deepEqual(await store.lookup('pokedex_vectors', { kind: 'id', id: 999 }), []);
  assert.deepEqual(await store.lookup('pokedex_vectors', { kind: 'name', name: 'not-a-pokemon' }), []);
  await assert.rejects(store.lookup('pokedex_vectors', { kind: 'id', id: 0 }));
  assert.deepEqual((await connection.tableNames()).sort(), ['pokedex_vectors']);
});

test('rejects invalid search vectors and topK before querying LanceDB', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-search-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const store = new LanceDbVectorStore(connection);
  await assert.rejects(store.searchByVector('pokedex_vectors', [1, 2], 5));
  await assert.rejects(store.searchByVector('pokedex_vectors', Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0), 0));
  assert.deepEqual(await connection.tableNames(), []);
});

test('returns an empty result for an existing empty collection and wraps search failures', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-lance-search-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const connection = await connect(directory);
  const initialRows = await rows('search');
  const populated = await connection.createTable('empty_collection', initialRows);
  await connection.dropTable('empty_collection');
  await connection.createEmptyTable('empty_collection', await populated.schema());
  const store = new LanceDbVectorStore(connection);
  assert.deepEqual(
    await store.searchByVector('empty_collection', Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0), 5),
    [],
  );

  const failingConnection = new Proxy(connection, {
    get(target, property, receiver) {
      if (property === 'openTable') return async () => { throw new Error('internal connection detail'); };
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Connection;
  await assert.rejects(
    new LanceDbVectorStore(failingConnection).searchByVector('empty_collection', Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0), 5),
    (error: unknown) => error instanceof RetrievalError && !error.message.includes('internal connection detail'),
  );
});
