import { z } from 'zod';
import { CollectionNameSchema } from './pokemon-vector-document.js';

export const AskQuestionSchema = z.string().trim().min(1, 'Question must not be empty');
export type AskQuestion = z.infer<typeof AskQuestionSchema>;

export const AskRequestSchema = z.object({ question: AskQuestionSchema }).strict();
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskSourceSchema = z.object({
  pokemonId: z.number().int().min(1).max(151),
  pokemonName: z.string().trim().min(1),
  url: z.string().url(),
}).strict();
export type AskSource = z.infer<typeof AskSourceSchema>;

export const RetrievedEvidenceSchema = z.object({
  id: z.number().int().min(1).max(151),
  text: z.string().min(1),
  pokemonName: z.string().trim().min(1),
  types: z.array(z.string().trim().min(1)).min(1).max(2),
  total: z.number().int().nonnegative(),
  sources: z.array(AskSourceSchema).min(1),
  score: z.number().finite().optional(),
}).strict();
export type RetrievedEvidence = z.infer<typeof RetrievedEvidenceSchema>;

export const PokemonLookupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('id'), id: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('name'), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('type'), type: z.string().trim().min(1).max(20) }).strict(),
]);
export type PokemonLookup = z.infer<typeof PokemonLookupSchema>;

export const AskResultSchema = z.object({
  answer: z.string().trim().min(1),
  abstained: z.boolean(),
  sources: z.array(AskSourceSchema),
}).strict();
export type AskResult = z.infer<typeof AskResultSchema>;

export const AskRuntimeConfigSchema = z.object({
  collectionName: CollectionNameSchema,
  openRouterApiKey: z.string().min(1),
}).strict();
export type AskRuntimeConfig = z.infer<typeof AskRuntimeConfigSchema>;

export class AskDomainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InsufficientEvidenceError extends AskDomainError {
  constructor() {
    super('The indexed Pokémon data does not contain enough information to answer this question.');
  }
}

export class VectorCollectionUnavailableError extends AskDomainError {
  constructor(message = 'The configured Pokémon vector collection is unavailable.', options?: ErrorOptions) {
    super(message, options);
  }
}

export class RetrievalError extends AskDomainError {
  constructor(message = 'Pokémon evidence retrieval failed.', options?: ErrorOptions) {
    super(message, options);
  }
}

export class ModelGenerationError extends AskDomainError {
  constructor(message = 'Answer generation failed.', options?: ErrorOptions) {
    super(message, options);
  }
}

export class PromptGuardrailError extends AskDomainError {
  constructor(message = 'The prompt safety check could not be completed.', options?: ErrorOptions) {
    super(message, options);
  }
}

export class AskRuntimeConfigurationError extends AskDomainError {
  constructor(message = 'Set a valid LANCEDB_COLLECTION_NAME and OPENROUTER_API_KEY in the local environment.', options?: ErrorOptions) {
    super(message, options);
  }
}
