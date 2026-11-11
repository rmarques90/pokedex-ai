import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { OpenAIEmbeddings, type OpenAIEmbeddingsParams } from '@langchain/openai';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../constants.js';

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1';
export const EMBEDDING_BATCH_SIZE = 32;

export type EmbeddingClient = Pick<EmbeddingsInterface, 'embedDocuments'>;
export type OpenRouterEmbeddingOptions = Partial<OpenAIEmbeddingsParams> & {
  apiKey: string;
  configuration: { baseURL: string };
};

export class EmbeddingGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingGenerationError';
  }
}

export function getOpenRouterEmbeddingOptions(apiKey: string): OpenRouterEmbeddingOptions {
  return {
    apiKey,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    batchSize: EMBEDDING_BATCH_SIZE,
    maxRetries: 2,
    configuration: { baseURL: OPENROUTER_EMBEDDINGS_URL },
  };
}

export function createOpenRouterEmbeddings(apiKey: string): EmbeddingClient {
  return new OpenAIEmbeddings(getOpenRouterEmbeddingOptions(apiKey));
}

export async function embedDocuments(
  client: EmbeddingClient,
  texts: string[],
): Promise<number[][]> {
  let vectors: number[][];
  try {
    vectors = await client.embedDocuments(texts);
  } catch (error) {
    throw new EmbeddingGenerationError('OpenRouter embedding request failed', { cause: error });
  }

  if (vectors.length !== texts.length) {
    throw new EmbeddingGenerationError(`Expected ${texts.length} vectors, received ${vectors.length}`);
  }
  vectors.forEach((vector, index) => {
    if (vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
      throw new EmbeddingGenerationError(`Embedding ${index + 1} must contain ${EMBEDDING_DIMENSIONS} finite values`);
    }
  });
  return vectors;
}
