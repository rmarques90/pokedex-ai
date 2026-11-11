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
