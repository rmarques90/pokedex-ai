import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PokemonDatasetSchema, PokemonRecordSchema, type PokemonRecord, type PokemonTypeDetails } from '../domain/pokemon-vector-document.js';

export { PokemonDatasetSchema, PokemonRecordSchema };
export type { PokemonRecord };

const POKEAPI_LIST_URL = 'https://pokeapi.co/api/v2/pokemon?limit=151&offset=0';
const POKEAPI_SAMPLE_LIST_URL = 'https://pokeapi.co/api/v2/pokemon?limit=1&offset=0';
const DEFAULT_OUTPUT_DIRECTORY = join(process.cwd(), 'store', 'data');
const SAMPLE_OUTPUT_DIRECTORY = join(DEFAULT_OUTPUT_DIRECTORY, 'sample');
const BULBAPEDIA_LICENSE = 'CC BY-NC-SA';
const BULBAPEDIA_LICENSE_URL = 'https://bulbapedia.bulbagarden.net/wiki/Bulbapedia:Copyrights';

const PokemonListSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(z.object({ name: z.string().min(1), url: z.string().url() })),
});

const PokemonApiSchema = z.object({
  id: z.number().int().min(1).max(151),
  name: z.string().min(1),
  is_default: z.boolean(),
  types: z.array(z.object({ slot: z.number().int().positive(), type: z.object({ name: z.string().min(1), url: z.string().url() }) })).min(1).max(2),
  stats: z.array(z.object({ base_stat: z.number().int().nonnegative(), stat: z.object({ name: z.string().min(1) }) })).length(6),
  sprites: z.object({
    front_default: z.string().url().nullable(),
    other: z.object({ 'official-artwork': z.object({ front_default: z.string().url().nullable() }).optional() }).optional(),
  }),
  species: z.object({ url: z.string().url() }),
});

const ApiTypeReferenceSchema = z.object({ name: z.string().min(1), url: z.string().url() });
const ApiDamageRelationsSchema = z.object({
  no_damage_to: z.array(ApiTypeReferenceSchema),
  half_damage_to: z.array(ApiTypeReferenceSchema),
  double_damage_to: z.array(ApiTypeReferenceSchema),
  no_damage_from: z.array(ApiTypeReferenceSchema),
  half_damage_from: z.array(ApiTypeReferenceSchema),
  double_damage_from: z.array(ApiTypeReferenceSchema),
});
const ApiTypeSchema = z.object({
  name: z.string().min(1),
  damage_relations: ApiDamageRelationsSchema,
  past_damage_relations: z.array(z.object({ generation: ApiTypeReferenceSchema, damage_relations: ApiDamageRelationsSchema })),
});

type Fetcher = typeof fetch;
type PokemonListEntry = z.infer<typeof PokemonListSchema>['results'][number];
export type CollectedPokemon = { record: PokemonRecord; image: Uint8Array };

function decodeHtml(text: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', ndash: '–', mdash: '—',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…',
  };
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, key: string) => {
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return named[key] ?? entity;
  });
}

export function extractBiologySection(html: string): string {
  const start = /<h2\b(?:(?!<\/h2>)[\s\S])*?\bid=["']Biology["'](?:(?!<\/h2>)[\s\S])*?<\/h2>/i.exec(html);
  if (!start) throw new Error('Bulbapedia page has no Biology section');
  const remainder = html.slice(start.index + start[0].length);
  const nextHeading = /<h2\b/i.exec(remainder);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
    match[1]
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim(),
  ).filter(Boolean);
  const description = decodeHtml(paragraphs.join('\n\n')).trim();
  if (!description) throw new Error('Bulbapedia Biology section contains no description text');
  return description;
}

async function fetchJson<T>(fetcher: Fetcher, url: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetcher(url, { headers: { 'user-agent': 'pokedex-ai personal RAG data collector' } });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return schema.parse(await response.json());
}

function bulbapediaUrl(name: string): string {
  const overrides: Record<string, string> = {
    'nidoran-f': 'Nidoran♀',
    'nidoran-m': 'Nidoran♂',
    farfetchd: "Farfetch'd",
    'mr-mime': 'Mr. Mime',
  };
  const articleName = overrides[name] ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const title = `${articleName}_(Pokémon)`;
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
}

function getRequiredStat(stats: Record<string, number>, name: string): number {
  const value = stats[name];
  if (value === undefined) throw new Error(`PokéAPI response is missing base stat: ${name}`);
  return value;
}

function normalizeRelations(relations: z.infer<typeof ApiDamageRelationsSchema>) {
  return {
    noDamageTo: relations.no_damage_to,
    halfDamageTo: relations.half_damage_to,
    doubleDamageTo: relations.double_damage_to,
    noDamageFrom: relations.no_damage_from,
    halfDamageFrom: relations.half_damage_from,
    doubleDamageFrom: relations.double_damage_from,
  };
}

async function getTypeDetails(fetcher: Fetcher, type: { name: string; url: string }, cache: Map<string, Promise<PokemonTypeDetails>>): Promise<PokemonTypeDetails> {
  let pending = cache.get(type.url);
  if (!pending) {
    pending = fetchJson(fetcher, type.url, ApiTypeSchema).then((apiType) => {
      if (apiType.name !== type.name) throw new Error(`PokéAPI returned unexpected type for ${type.name}`);
      return {
        name: apiType.name,
        url: type.url,
        damageRelations: normalizeRelations(apiType.damage_relations),
        pastDamageRelations: apiType.past_damage_relations.map(({ generation, damage_relations }) => ({
          generation,
          damageRelations: normalizeRelations(damage_relations),
        })),
      };
    });
    cache.set(type.url, pending);
  }
  return pending;
}

async function collectOne(fetcher: Fetcher, entry: PokemonListEntry, typeCache: Map<string, Promise<PokemonTypeDetails>>): Promise<CollectedPokemon> {
  const pokemon = await fetchJson(fetcher, entry.url, PokemonApiSchema);
  if (pokemon.name !== entry.name || !pokemon.is_default || pokemon.id > 151) {
    throw new Error(`Unexpected Pokemon list entry for ${entry.name}`);
  }

  const orderedTypes = [...pokemon.types].sort((a, b) => a.slot - b.slot);
  const typeDetails = await Promise.all(orderedTypes.map(({ type }) => getTypeDetails(fetcher, type, typeCache)));

  const descriptionSourceUrl = bulbapediaUrl(pokemon.name);
  const page = await fetcher(descriptionSourceUrl, { headers: { 'user-agent': 'pokedex-ai personal RAG data collector' } });
  if (!page.ok) throw new Error(`Bulbapedia request failed (${page.status}) for ${pokemon.name}`);
  const description = extractBiologySection(await page.text());

  const stats = Object.fromEntries(pokemon.stats.map(({ stat, base_stat }) => [stat.name, base_stat]));
  const normalizedStats = {
    hp: getRequiredStat(stats, 'hp'), attack: getRequiredStat(stats, 'attack'),
    defense: getRequiredStat(stats, 'defense'), specialAttack: getRequiredStat(stats, 'special-attack'),
    specialDefense: getRequiredStat(stats, 'special-defense'), speed: getRequiredStat(stats, 'speed'),
  };
  const total = Object.values(normalizedStats).reduce((sum, value) => sum + value, 0);
  const imageSourceUrl = pokemon.sprites.other?.['official-artwork']?.front_default ?? pokemon.sprites.front_default;
  if (!imageSourceUrl) throw new Error(`No image URL available for ${pokemon.name}`);
  const imageResponse = await fetcher(imageSourceUrl);
  if (!imageResponse.ok) throw new Error(`Image request failed (${imageResponse.status}) for ${pokemon.name}`);
  const image = new Uint8Array(await imageResponse.arrayBuffer());
  if (image.length === 0) throw new Error(`Downloaded image is empty for ${pokemon.name}`);

  const extension = new URL(imageSourceUrl).pathname.split('.').pop() || 'png';
  const imagePath = `images/${String(pokemon.id).padStart(3, '0')}-${pokemon.name}.${extension}`;
  const record = PokemonRecordSchema.parse({
    id: pokemon.id, name: pokemon.name,
    types: orderedTypes.map(({ type }) => type.name), typeDetails,
    stats: normalizedStats, total, description,
    pokemonUrl: entry.url, speciesUrl: pokemon.species.url, descriptionSourceUrl,
    descriptionAttribution: 'Bulbapedia', descriptionLicense: BULBAPEDIA_LICENSE,
    descriptionLicenseUrl: BULBAPEDIA_LICENSE_URL, imageSourceUrl, imagePath,
  });
  return { record, image };
}

export async function collectPokemon(fetcher: Fetcher = fetch): Promise<CollectedPokemon[]> {
  const list = await fetchJson(fetcher, POKEAPI_LIST_URL, PokemonListSchema);
  if (list.results.length !== 151) throw new Error(`Expected 151 PokéAPI results; received ${list.results.length}`);
  const urls = new Set(list.results.map(({ url }) => url));
  if (urls.size !== 151) throw new Error('PokéAPI returned duplicate Pokemon resource URLs');

  const collected: CollectedPokemon[] = [];
  const typeCache = new Map<string, Promise<PokemonTypeDetails>>();
  for (const entry of list.results) collected.push(await collectOne(fetcher, entry, typeCache));
  const dataset = PokemonDatasetSchema.parse(collected.map(({ record }) => record));
  if (dataset.some((record, index) => record.id !== index + 1)) {
    throw new Error('PokéAPI results do not cover National Pokedex numbers 001 through 151 in order');
  }
  return collected;
}

export async function collectPokemonSample(fetcher: Fetcher = fetch): Promise<CollectedPokemon[]> {
  const list = await fetchJson(fetcher, POKEAPI_SAMPLE_LIST_URL, PokemonListSchema);
  const first = list.results[0];
  if (!first) throw new Error('PokéAPI returned no Pokemon');
  return [await collectOne(fetcher, first, new Map())];
}

export async function writeDataset(outputDirectory: string, collected: CollectedPokemon[]): Promise<string> {
  const records = collected.map(({ record }) => record);
  if (outputDirectory === DEFAULT_OUTPUT_DIRECTORY) PokemonDatasetSchema.parse(records);
  else z.array(PokemonRecordSchema).min(1).parse(records);

  const parentDirectory = dirname(outputDirectory);
  const stageDirectory = join(parentDirectory, `.pokedex-data-${randomUUID()}.tmp`);
  const backupDirectory = join(parentDirectory, `.pokedex-data-${randomUUID()}.bak`);
  try {
    await mkdir(join(stageDirectory, 'images'), { recursive: true });
    if (outputDirectory === DEFAULT_OUTPUT_DIRECTORY) {
      await cp(join(outputDirectory, 'sample'), join(stageDirectory, 'sample'), { recursive: true, force: true }).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
    await writeFile(join(stageDirectory, 'pokemon.json'), `${JSON.stringify(records, null, 2)}\n`);
    for (const { record, image } of collected) {
      await writeFile(join(stageDirectory, record.imagePath), image);
    }
    let backedUp = false;
    try {
      await rename(outputDirectory, backupDirectory);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(stageDirectory, outputDirectory);
    } catch (error) {
      if (backedUp) await rename(backupDirectory, outputDirectory);
      throw error;
    }
    if (backedUp) await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    await rm(stageDirectory, { recursive: true, force: true });
    throw error;
  }
  return join(outputDirectory, 'pokemon.json');
}

export async function runCollection(options: { sample?: boolean; fetcher?: Fetcher; outputDirectory?: string } = {}): Promise<string> {
  const sample = options.sample ?? false;
  const collected = sample
    ? await collectPokemonSample(options.fetcher)
    : await collectPokemon(options.fetcher);
  const outputDirectory = options.outputDirectory ?? (sample ? SAMPLE_OUTPUT_DIRECTORY : DEFAULT_OUTPUT_DIRECTORY);
  const path = await writeDataset(outputDirectory, collected);
  return `${collected.length} Pokemon collected to ${path}`;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (invokedPath) {
  const sample = process.argv.includes('--sample');
  runCollection({ sample }).then((summary) => console.log(summary)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
