import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../constants.js';
import {
  EMBEDDING_BATCH_SIZE,
  embedDocuments,
  EmbeddingGenerationError,
  getOpenRouterEmbeddingOptions,
  type EmbeddingClient,
} from './openrouter-embeddings.js';

test('configures LangChain embeddings for OpenRouter and the selected model', () => {
  const options = getOpenRouterEmbeddingOptions('test-key-never-logged');
  assert.equal(options.model, EMBEDDING_MODEL);
  assert.equal(options.dimensions, EMBEDDING_DIMENSIONS);
  assert.equal(options.apiKey, 'test-key-never-logged');
  assert.equal(options.batchSize, EMBEDDING_BATCH_SIZE);
  assert.equal(options.configuration.baseURL, 'https://openrouter.ai/api/v1');
  assert.equal(options.maxRetries, 2);
});

test('embeds documents in a single client call and validates count, dimension, and finite values', async () => {
  const texts = Array.from({ length: 35 }, (_, index) => `Pokemon ${index + 1}`);
  const batches: string[][] = [];
  const fake: EmbeddingClient = {
    async embedDocuments(input) {
      batches.push(input);
      return input.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.125));
    },
  };
  const vectors = await embedDocuments(fake, texts);
  assert.equal(vectors.length, texts.length);
  assert.deepEqual(batches, [texts]);
});

test('rejects partial, wrong-sized, or non-finite provider responses safely', async () => {
  const partial: EmbeddingClient = { async embedDocuments() { return []; } };
  await assert.rejects(embedDocuments(partial, ['a']), EmbeddingGenerationError);

  const wrongSize: EmbeddingClient = { async embedDocuments() { return [[0.1]]; } };
  await assert.rejects(embedDocuments(wrongSize, ['a']), /4096 finite values/);

  const nonFinite: EmbeddingClient = {
    async embedDocuments() { const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1); vector[0] = Number.NaN; return [vector]; },
  };
  await assert.rejects(embedDocuments(nonFinite, ['a']), /4096 finite values/);
});

test('wraps provider failures without putting credential data in its message', async () => {
  const fake: EmbeddingClient = { async embedDocuments() { throw new Error('request failed'); } };
  await assert.rejects(embedDocuments(fake, ['a']), (error: unknown) => {
    assert.ok(error instanceof EmbeddingGenerationError);
    assert.equal(error.message, 'OpenRouter embedding request failed');
    assert.doesNotMatch(error.message, /test-key/);
    return true;
  });
});
