import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  collectPokemon,
  collectPokemonSample,
  extractBiologySection,
  PokemonDatasetSchema,
  PokemonRecordSchema,
  runCollection,
  writeDataset,
  type CollectedPokemon,
  type PokemonRecord,
} from './collect-pokemon-data.js';

const licenseUrl = 'https://bulbapedia.bulbagarden.net/wiki/Bulbapedia:Copyrights';

function record(id: number): PokemonRecord {
  const stats = { hp: 1, attack: 2, defense: 3, specialAttack: 4, specialDefense: 5, speed: 6 };
  const emptyRelations = { noDamageTo: [], halfDamageTo: [], doubleDamageTo: [], noDamageFrom: [], halfDamageFrom: [], doubleDamageFrom: [] };
  return {
    id, name: `pokemon-${id}`, types: ['normal'], typeDetails: [{ name: 'normal', url: 'https://pokeapi.co/api/v2/type/1/', damageRelations: emptyRelations, pastDamageRelations: [] }], stats, total: 21,
    description: `Biology description for Pokemon ${id}.`,
    pokemonUrl: `https://pokeapi.co/api/v2/pokemon/${id}/`,
    speciesUrl: `https://pokeapi.co/api/v2/pokemon-species/${id}/`,
    descriptionSourceUrl: `https://bulbapedia.bulbagarden.net/wiki/Pokemon_${id}_(Pok%C3%A9mon)`,
    descriptionAttribution: 'Bulbapedia', descriptionLicense: 'CC BY-NC-SA',
    descriptionLicenseUrl: licenseUrl,
    imageSourceUrl: `https://example.test/${id}.png`, imagePath: `images/${String(id).padStart(3, '0')}-pokemon-${id}.png`,
  };
}

function apiPokemon(id: number) {
  return {
    id, name: `pokemon-${id}`, is_default: true,
    types: [{ slot: 1, type: { name: 'normal', url: 'https://pokeapi.co/api/v2/type/1/' } }],
    stats: [
      ['hp', 1], ['attack', 2], ['defense', 3], ['special-attack', 4], ['special-defense', 5], ['speed', 6],
    ].map(([name, value]) => ({ stat: { name }, base_stat: value })),
    sprites: { front_default: `https://example.test/${id}-sprite.png`, other: { 'official-artwork': { front_default: `https://example.test/${id}.png` } } },
    species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  };
}

function apiType() {
  const reference = { name: 'ghost', url: 'https://pokeapi.co/api/v2/type/8/' };
  return {
    name: 'normal',
    damage_relations: {
      no_damage_to: [reference], half_damage_to: [], double_damage_to: [],
      no_damage_from: [], half_damage_from: [], double_damage_from: [],
    },
    past_damage_relations: [{
      generation: { name: 'generation-i', url: 'https://pokeapi.co/api/v2/generation/1/' },
      damage_relations: {
        no_damage_to: [], half_damage_to: [], double_damage_to: [],
        no_damage_from: [], half_damage_from: [], double_damage_from: [reference],
      },
    }],
  };
}

function response(body: string | Uint8Array, contentType = 'application/json'): Response {
  const responseBody = body instanceof Uint8Array ? Buffer.from(body) : body;
  return new Response(responseBody, { status: 200, headers: { 'content-type': contentType } });
}

test('validates normalized Pokemon records and calculated totals with Zod', () => {
  assert.equal(PokemonRecordSchema.safeParse(record(1)).success, true);
  assert.equal(PokemonRecordSchema.safeParse({ ...record(1), total: 999 }).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...record(1), description: '' }).success, false);
  assert.equal(PokemonRecordSchema.safeParse({ ...record(1), id: 152 }).success, false);
});

test('requires exactly one record for each National Pokedex number 001 through 151', () => {
  const records = Array.from({ length: 151 }, (_, index) => record(index + 1));
  assert.equal(PokemonDatasetSchema.safeParse(records).success, true);
  assert.equal(PokemonDatasetSchema.safeParse(records.slice(1)).success, false);
  assert.equal(PokemonDatasetSchema.safeParse([...records.slice(0, 150), record(150)]).success, false);
});

test('extracts only paragraph text from Biology before the next top-level section', () => {
  const html = `
    <h2><span class="mw-headline" id="Biology">Biology</span></h2>
    <p>Bulbasaur is a <b>small</b> Pokémon.<sup class="reference">[1]</sup></p>
    <p>Its bulb grows with it &amp; stores energy.</p>
    <h2><span id="Game_data">Game data</span></h2>
    <p>This text is outside Biology.</p>`;

  assert.equal(extractBiologySection(html), 'Bulbasaur is a small Pokémon.\n\nIts bulb grows with it & stores energy.');
});

test('rejects missing Biology sections and empty Biology sections', () => {
  assert.throws(() => extractBiologySection('<h2>Game data</h2><p>Other content</p>'), /no Biology section/);
  assert.throws(() => extractBiologySection('<h2><span id="Biology">Biology</span></h2><h2>Next</h2>'), /no description text/);
});

test('collects all 151 linked default Pokemon and uses their source URLs', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/pokemon-list-151.json', import.meta.url), 'utf8')) as {
    count: number;
    results: Array<{ name: string; url: string }>;
  };
  let typeRequestCount = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(JSON.stringify(fixture));
    if (url.includes('/type/')) { typeRequestCount += 1; return response(JSON.stringify(apiType())); }
    const id = Number(url.match(/pokemon\/(\d+)\/$/)?.[1]);
    if (Number.isInteger(id)) return response(JSON.stringify(apiPokemon(id)));
    if (url.includes('bulbapedia')) return response('<h2><span id="Biology">Biology</span></h2><p>Only the Biology text.</p><h2>Other</h2>');
    if (url.includes('example.test')) return response(new Uint8Array([1, 2, 3]), 'image/png');
    return new Response(null, { status: 404 });
  };

  const collected = await collectPokemon(fetcher);
  assert.equal(collected.length, 151);
  assert.deepEqual(collected.map(({ record: item }) => item.id), Array.from({ length: 151 }, (_, index) => index + 1));
  assert.equal(collected[0]?.record.total, 21);
  assert.equal(collected[0]?.record.description, 'Only the Biology text.');
  assert.equal(collected[0]?.record.descriptionAttribution, 'Bulbapedia');
  assert.equal(collected[0]?.record.typeDetails[0]?.damageRelations.noDamageTo[0]?.name, 'ghost');
  assert.equal(collected[0]?.record.typeDetails[0]?.pastDamageRelations[0]?.generation.name, 'generation-i');
  assert.equal(typeRequestCount, 1, 'shared type resource should be fetched once per collection');
  assert.equal(collected[150]?.record.pokemonUrl, 'https://pokeapi.co/api/v2/pokemon/151/');
  assert.equal(collected[0]?.record.imageSourceUrl, 'https://example.test/1.png');
});

test('fails collection when a PokéAPI type resource is invalid', async () => {
  const list = JSON.stringify({ count: 1, results: [{ name: 'pokemon-1', url: 'https://pokeapi.co/api/v2/pokemon/1/' }] });
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(list);
    if (url.includes('/pokemon/1/')) return response(JSON.stringify(apiPokemon(1)));
    if (url.includes('/type/')) return response(JSON.stringify({ name: 'normal', damage_relations: {} }));
    if (url.includes('bulbapedia')) return response('<h2><span id="Biology">Biology</span></h2><p>Biology.</p><h2>Other</h2>');
    return response(new Uint8Array([1]), 'image/png');
  };
  await assert.rejects(collectPokemonSample(fetcher));
});

test('rejects an incomplete PokéAPI list and non-default sample records', async () => {
  const shortList: typeof fetch = async () => response(JSON.stringify({ count: 1, results: [{ name: 'pokemon-1', url: 'https://pokeapi.co/api/v2/pokemon/1/' }] }));
  await assert.rejects(collectPokemon(shortList), /Expected 151/);

  const variant: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(JSON.stringify({ count: 1, results: [{ name: 'pokemon-1', url: 'https://pokeapi.co/api/v2/pokemon/1/' }] }));
    return response(JSON.stringify({ ...apiPokemon(1), is_default: false }));
  };
  await assert.rejects(collectPokemonSample(variant), /Unexpected Pokemon/);
});

test('reports Pokemon context when its Bulbapedia page or image cannot be fetched', async () => {
  const list = JSON.stringify({ count: 1, results: [{ name: 'pokemon-1', url: 'https://pokeapi.co/api/v2/pokemon/1/' }] });
  const detail = JSON.stringify(apiPokemon(1));
  const failBulbapedia: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(list);
    if (url.includes('/pokemon/1/')) return response(detail);
    if (url.includes('/type/')) return response(JSON.stringify(apiType()));
    return new Response(null, { status: url.includes('bulbapedia') ? 503 : 404 });
  };
  await assert.rejects(collectPokemonSample(failBulbapedia), /Bulbapedia request failed \(503\) for pokemon-1/);

  const failImage: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(list);
    if (url.includes('/pokemon/1/')) return response(detail);
    if (url.includes('/type/')) return response(JSON.stringify(apiType()));
    if (url.includes('bulbapedia')) return response('<h2><span id="Biology">Biology</span></h2><p>Biology.</p><h2>Other</h2>');
    return new Response(null, { status: 503 });
  };
  await assert.rejects(collectPokemonSample(failImage), /Image request failed \(503\) for pokemon-1/);
});

test('writes validated JSON and images, and preserves an existing output on invalid replacement', async (context) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pokedex-ai-test-'));
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const outputDirectory = join(temporaryDirectory, 'data');
  const item: CollectedPokemon = { record: record(1), image: new Uint8Array([1, 2, 3]) };

  const path = await writeDataset(outputDirectory, [item]);
  const saved = JSON.parse(await readFile(path, 'utf8')) as PokemonRecord[];
  assert.equal(saved.length, 1);
  assert.deepEqual([...await readFile(join(outputDirectory, item.record.imagePath))], [1, 2, 3]);

  const replacement: CollectedPokemon = { record: { ...record(1), description: 'Replacement Biology text.' }, image: new Uint8Array([4, 5, 6]) };
  await writeDataset(outputDirectory, [replacement]);
  assert.equal((JSON.parse(await readFile(path, 'utf8')) as PokemonRecord[])[0]?.description, 'Replacement Biology text.');

  await assert.rejects(writeDataset(outputDirectory, [{ ...item, record: { ...record(1), total: 0 } }]));
  assert.equal((JSON.parse(await readFile(path, 'utf8')) as PokemonRecord[])[0]?.description, 'Replacement Biology text.');
  const ignoreFile = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignoreFile, /^store\/data\/$/m);
});

test('npm collection command is configured and supports an isolated sample run', async (context) => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts['collect:data'], 'tsx src/scripts/collect-pokemon-data.ts');

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pokedex-ai-command-'));
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const list = JSON.stringify({ count: 1, results: [{ name: 'pokemon-1', url: 'https://pokeapi.co/api/v2/pokemon/1/' }] });
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/pokemon?')) return response(list);
    if (url.includes('/pokemon/1/')) return response(JSON.stringify(apiPokemon(1)));
    if (url.includes('/type/')) return response(JSON.stringify(apiType()));
    if (url.includes('bulbapedia')) return response('<h2><span id="Biology">Biology</span></h2><p>Biology.</p><h2>Other</h2>');
    return response(new Uint8Array([7, 8, 9]), 'image/png');
  };
  const summary = await runCollection({ sample: true, fetcher, outputDirectory: join(temporaryDirectory, 'sample') });
  assert.match(summary, /^1 Pokemon collected to /);
  assert.equal(JSON.parse(await readFile(join(temporaryDirectory, 'sample', 'pokemon.json'), 'utf8')).length, 1);
});
