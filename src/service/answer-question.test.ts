import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS } from '../constants.js';
import {
  ModelGenerationError,
  PromptGuardrailError,
  RetrievalError,
  type RetrievedEvidence,
} from '../domain/ask.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';
import type { QueryEmbeddingClient } from './openrouter-embeddings.js';
import type { PokemonAnswerGenerator } from './openrouter-chat-model.js';
import type { PromptInjectionGuardrail } from './prompt-injection-guardrail.js';
import { answerQuestion, INITIAL_RETRIEVAL_TOP_K, INSUFFICIENT_EVIDENCE_ANSWER } from './answer-question.js';

const bulbasaur: RetrievedEvidence = {
  id: 1,
  text: 'Name: bulbasaur. Types: grass, poison. Biology: It grows from a seed on its back.',
  pokemonName: 'bulbasaur',
  sources: [
    { pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' },
    { pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon/1/' },
  ],
  score: 0.1,
};
const pikachu: RetrievedEvidence = {
  id: 25,
  text: 'Name: pikachu. Type: electric.',
  pokemonName: 'pikachu',
  sources: [{ pokemonId: 25, pokemonName: 'pikachu', url: 'https://bulbapedia.bulbagarden.net/wiki/Pikachu_(Pok%C3%A9mon)' }],
};

function dependencies(overrides: {
  evidence?: RetrievedEvidence[];
  generated?: { answer: string; abstained: boolean; usedPokemonIds: number[] };
  failGuardrail?: boolean;
  failRetrieval?: boolean;
  failModel?: boolean;
} = {}) {
  const calls: string[] = [];
  const requestedLimits: number[] = [];
  let modelCalls = 0;
  const store: Pick<PokemonVectorStore, 'searchByVector'> = {
    async searchByVector(name, vector, topK) {
      calls.push('store');
      assert.equal(name, 'pokedex_vectors');
      assert.equal(vector.length, EMBEDDING_DIMENSIONS);
      requestedLimits.push(topK);
      if (overrides.failRetrieval) throw new Error('internal storage path');
      return overrides.evidence ?? [bulbasaur, pikachu];
    },
  };
  const embeddings: QueryEmbeddingClient = {
    async embedQuery(question) {
      calls.push('embedding');
      assert.equal(question, 'What types does Bulbasaur have?');
      return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    },
  };
  const generator: PokemonAnswerGenerator = {
    async generate(input) {
      calls.push('model');
      modelCalls += 1;
      assert.equal(input.question, 'What types does Bulbasaur have?');
      assert.deepEqual(input.evidence, overrides.evidence ?? [bulbasaur, pikachu]);
      if (overrides.failModel) throw new Error('provider key secret');
      return overrides.generated ?? {
        answer: 'Bulbasaur is a Grass and Poison Pokémon.',
        abstained: false,
        usedPokemonIds: [1],
      };
    },
  };
  const guardrail: PromptInjectionGuardrail = {
    async invoke(input) {
      calls.push('guardrail');
      if (overrides.failGuardrail) throw new PromptGuardrailError();
      return input;
    },
  };
  return {
    dependencies: { collectionName: 'pokedex_vectors', store, embeddings, generator, guardrail },
    calls,
    requestedLimits,
    get modelCalls() { return modelCalls; },
  };
}

test('embeds, retrieves five records, guards the question and context, and cites only used evidence', async () => {
  const fixture = dependencies();
  const result = await answerQuestion('What types does Bulbasaur have?', fixture.dependencies);
  assert.equal(INITIAL_RETRIEVAL_TOP_K, 5);
  assert.deepEqual(fixture.requestedLimits, [5]);
  assert.deepEqual(fixture.calls, ['guardrail', 'embedding', 'store', 'guardrail', 'model']);
  assert.deepEqual(result, {
    answer: 'Bulbasaur is a Grass and Poison Pokémon.',
    abstained: false,
    sources: bulbasaur.sources,
  });
});

test('abstains without calling the model when the collection returns no evidence', async () => {
  const fixture = dependencies({ evidence: [] });
  const result = await answerQuestion('What types does Bulbasaur have?', fixture.dependencies);
  assert.deepEqual(result, { answer: INSUFFICIENT_EVIDENCE_ANSWER, abstained: true, sources: [] });
  assert.equal(fixture.modelCalls, 0);
});

test('returns a model abstention without citations', async () => {
  const fixture = dependencies({ generated: { answer: 'The indexed data is insufficient.', abstained: true, usedPokemonIds: [] } });
  const result = await answerQuestion('What types does Bulbasaur have?', fixture.dependencies);
  assert.deepEqual(result, { answer: 'The indexed data is insufficient.', abstained: true, sources: [] });
});

test('fails closed before model invocation when the guardrail rejects input or evidence', async () => {
  const fixture = dependencies({ failGuardrail: true });
  await assert.rejects(answerQuestion('What types does Bulbasaur have?', fixture.dependencies), PromptGuardrailError);
  assert.equal(fixture.modelCalls, 0);
  assert.deepEqual(fixture.calls, ['guardrail']);
});

test('wraps retrieval and model failures without exposing internal details', async () => {
  const retrievalFailure = dependencies({ failRetrieval: true });
  await assert.rejects(answerQuestion('What types does Bulbasaur have?', retrievalFailure.dependencies), (error: unknown) => {
    assert.ok(error instanceof RetrievalError);
    assert.doesNotMatch(error.message, /storage path/);
    return true;
  });

  const modelFailure = dependencies({ failModel: true });
  await assert.rejects(answerQuestion('What types does Bulbasaur have?', modelFailure.dependencies), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.doesNotMatch(error.message, /provider key secret/);
    return true;
  });
});

test('rejects a generated answer that cites records outside retrieved evidence', async () => {
  const fixture = dependencies({ generated: { answer: 'Unsupported.', abstained: false, usedPokemonIds: [151] } });
  await assert.rejects(answerQuestion('What types does Bulbasaur have?', fixture.dependencies), ModelGenerationError);
});

test('validates the question before running retrieval or generation', async () => {
  const fixture = dependencies();
  await assert.rejects(answerQuestion('  ', fixture.dependencies));
  assert.deepEqual(fixture.calls, []);
});
