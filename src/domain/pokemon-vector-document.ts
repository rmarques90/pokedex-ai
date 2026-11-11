import { z } from 'zod';

const BULBAPEDIA_LICENSE = 'CC BY-NC-SA';
const BULBAPEDIA_LICENSE_URL = 'https://bulbapedia.bulbagarden.net/wiki/Bulbapedia:Copyrights';

export const PokemonRecordSchema = z.object({
  id: z.number().int().min(1).max(151),
  name: z.string().min(1),
  types: z.array(z.string().min(1)).min(1).max(2),
  stats: z.object({
    hp: z.number().int().nonnegative(),
    attack: z.number().int().nonnegative(),
    defense: z.number().int().nonnegative(),
    specialAttack: z.number().int().nonnegative(),
    specialDefense: z.number().int().nonnegative(),
    speed: z.number().int().nonnegative(),
  }),
  total: z.number().int().nonnegative(),
  description: z.string().min(1),
  pokemonUrl: z.string().url(),
  speciesUrl: z.string().url(),
  descriptionSourceUrl: z.string().url(),
  descriptionAttribution: z.literal('Bulbapedia'),
  descriptionLicense: z.literal(BULBAPEDIA_LICENSE),
  descriptionLicenseUrl: z.literal(BULBAPEDIA_LICENSE_URL),
  imageSourceUrl: z.string().url(),
  imagePath: z.string().min(1),
}).refine((record) => record.total === Object.values(record.stats).reduce((sum, stat) => sum + stat, 0), {
  message: 'Total must equal the sum of the six base stats',
  path: ['total'],
});

export type PokemonRecord = z.infer<typeof PokemonRecordSchema>;

export const PokemonDatasetSchema = z.array(PokemonRecordSchema).length(151).superRefine((records, context) => {
  const ids = new Set(records.map(({ id }) => id));
  if (ids.size !== records.length) context.addIssue({ code: 'custom', message: 'Pokemon IDs must be unique' });
  for (let id = 1; id <= 151; id += 1) {
    if (!ids.has(id)) context.addIssue({ code: 'custom', message: `Missing National Pokedex number ${id}` });
  }
});

export const PROTECTED_COLLECTION_NAMES = new Set([
  'default',
  'information_schema',
  'sqlite_schema',
  'system',
  '_versions',
]);
export const INTERNAL_COLLECTION_PREFIXES = ['__pokedex_ai_stage_', '__pokedex_ai_backup_'] as const;

export function isProtectedCollectionName(name: string): boolean {
  const normalized = name.toLowerCase();
  return PROTECTED_COLLECTION_NAMES.has(normalized)
    || INTERNAL_COLLECTION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export const CollectionNameSchema = z.string()
  .min(1)
  .max(63)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
  .refine((name) => !isProtectedCollectionName(name), 'Collection name is protected');

export const PopulationConfigSchema = z.object({
  collectionName: CollectionNameSchema,
  openRouterApiKey: z.string().min(1),
});
export type PopulationConfig = z.infer<typeof PopulationConfigSchema>;

export const PokemonEmbeddingDocumentSchema = z.object({
  id: z.string().regex(/^\d{3}$/),
  text: z.string().min(1),
  metadata: PokemonRecordSchema,
});
export type PokemonEmbeddingDocument = z.infer<typeof PokemonEmbeddingDocumentSchema>;

export const PokemonVectorRowSchema = z.object({
  id: z.number().int().min(1).max(151),
  text: z.string().min(1),
  vector: z.array(z.number().finite()).length(4096),
  name: z.string().min(1),
  types: z.array(z.string().min(1)),
  hp: z.number().int().nonnegative(),
  attack: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  specialAttack: z.number().int().nonnegative(),
  specialDefense: z.number().int().nonnegative(),
  speed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  description: z.string().min(1),
  pokemonUrl: z.string().url(),
  speciesUrl: z.string().url(),
  descriptionSourceUrl: z.string().url(),
  descriptionAttribution: z.literal('Bulbapedia'),
  descriptionLicense: z.literal(BULBAPEDIA_LICENSE),
  descriptionLicenseUrl: z.literal(BULBAPEDIA_LICENSE_URL),
  imageSourceUrl: z.string().url(),
  imagePath: z.string().min(1),
});
export type PokemonVectorRow = z.infer<typeof PokemonVectorRowSchema>;
