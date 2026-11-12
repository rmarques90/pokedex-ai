import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PokemonDatasetSchema,
  PokemonRecordSchema,
  PokemonVectorRowSchema,
  CollectionNameSchema,
} from './pokemon-vector-document.js';
import { checkProtectedChanges } from '../scripts/pre-commit-guard.js';
import { addEmptyTypeRelations } from '../test-helpers/pokemon-dataset.js';

const datasetPath = new URL('../../store/data/pokemon.json', import.meta.url);

test('validates the generated 151-record Pokemon dataset', async () => {
  const dataset: unknown = addEmptyTypeRelations(JSON.parse(await readFile(datasetPath, 'utf8')));
  assert.equal(PokemonDatasetSchema.safeParse(dataset).success, true);
});

test('rejects missing, malformed, duplicate, and out-of-range datasets', async () => {
  const records: unknown = addEmptyTypeRelations(JSON.parse(await readFile(datasetPath, 'utf8')));
  assert.ok(Array.isArray(records));
  assert.equal(PokemonDatasetSchema.safeParse(records.slice(1)).success, false);
  assert.equal(PokemonDatasetSchema.safeParse([...records.slice(0, 150), records[149]]).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...records[0], id: 152 }).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...records[0], stats: { hp: 1 } }).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...records[0], descriptionAttribution: 'Unknown' }).success, false);
  assert.equal(PokemonDatasetSchema.safeParse('not-json-data').success, false);
});

test('requires complete current type relations and generation-labeled historical relations', async () => {
  const records: unknown = addEmptyTypeRelations(JSON.parse(await readFile(datasetPath, 'utf8')));
  assert.ok(Array.isArray(records));
  const first = records[0] as Record<string, unknown>;
  const typeDetails = first.typeDetails as Array<Record<string, unknown>>;
  const normal = typeDetails[0];
  assert.equal(PokemonRecordSchema.safeParse({ ...first, typeDetails: [{ ...normal, pastDamageRelations: [{ generation: { name: 'generation-i', url: 'https://pokeapi.co/api/v2/generation/1/' }, damageRelations: normal?.damageRelations }] }, ...typeDetails.slice(1)] }).success, true);
  assert.equal(PokemonRecordSchema.safeParse({ ...first, typeDetails: [{ ...normal, damageRelations: { noDamageTo: [] } }, ...typeDetails.slice(1)] }).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...first, typeDetails: [] }).success, false);
});

test('requires vector rows to contain finite vectors of exactly 4096 dimensions', async () => {
  const dataset: unknown = addEmptyTypeRelations(JSON.parse(await readFile(datasetPath, 'utf8')));
  assert.ok(Array.isArray(dataset));
  const first = dataset[0] as Record<string, unknown>;
  const stats = first.stats as Record<string, number>;
  const valid = {
    ...first,
    typeDetails: JSON.stringify(first.typeDetails),
    ...stats,
    text: 'Bulbasaur vector text',
    vector: Array.from({ length: 4096 }, () => 0.25),
  };
  assert.equal(PokemonVectorRowSchema.safeParse(valid).success, true);
  const parsedRow = PokemonVectorRowSchema.parse(valid);
  assert.deepEqual(parsedRow.types, first.types);
  assert.equal(parsedRow.total, first.total);
  assert.equal(PokemonVectorRowSchema.safeParse({ ...valid, vector: [Number.NaN] }).success, false);
  assert.equal(PokemonVectorRowSchema.safeParse({ ...valid, vector: [0.1, 0.2] }).success, false);
});

test('rejects protected collection names without case sensitivity', () => {
  assert.equal(CollectionNameSchema.safeParse('pokedex_vectors').success, true);
  assert.equal(CollectionNameSchema.safeParse('SYSTEM').success, false);
  assert.equal(CollectionNameSchema.safeParse('__pokedex_ai_stage_manual').success, false);
  assert.equal(CollectionNameSchema.safeParse('../other-db').success, false);
});

test('pre-commit blocks safeguard edits without human review and staged tests', () => {
  const change = ['src/domain/pokemon-vector-document.ts'];
  assert.match(checkProtectedChanges(change, false) ?? '', /human review/);
  assert.match(checkProtectedChanges([...change, 'src/domain/pokemon-vector-document.test.ts'], true) ?? '', /^$/);
  assert.match(checkProtectedChanges(change, true) ?? '', /require a staged safeguard test/);

  const storeChange = ['src/store/lance-db-store.ts'];
  assert.match(checkProtectedChanges(storeChange, false) ?? '', /human review/);
  assert.match(checkProtectedChanges([...storeChange, 'src/domain/pokemon-vector-document.test.ts'], true) ?? '', /^$/);
});
