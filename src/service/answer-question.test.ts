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
  text: 'Name: bulbasaur. Types: grass, poison. Base stats: HP 45, Attack 49, Defense 49, Special Attack 65, Special Defense 65, Speed 45. Total base stats: 318. Biology: It grows from a seed on its back.',
  pokemonName: 'bulbasaur',
  types: ['grass', 'poison'],
  total: 318,
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
  types: ['electric'],
  total: 320,
  sources: [{ pokemonId: 25, pokemonName: 'pikachu', url: 'https://bulbapedia.bulbagarden.net/wiki/Pikachu_(Pok%C3%A9mon)' }],
};
const venusaur: RetrievedEvidence = {
  id: 3,
  text: 'Name: venusaur. Types: grass, poison. Base stats: HP 80, Attack 82, Defense 83, Special Attack 100, Special Defense 100, Speed 80. Total base stats: 525.',
  pokemonName: 'venusaur',
  types: ['grass', 'poison'],
  total: 525,
  sources: [{ pokemonId: 3, pokemonName: 'venusaur', url: 'https://pokeapi.co/api/v2/pokemon/3/' }],
};

function dependencies(overrides: {
  evidence?: RetrievedEvidence[];
  lookupEvidence?: RetrievedEvidence[];
  question?: string;
  generated?: { answer: string; abstained: boolean; usedPokemonIds: number[] };
  failGuardrail?: boolean;
  failRetrieval?: boolean;
  failModel?: boolean;
} = {}) {
  const questionText = overrides.question ?? 'Why does the seed grow?';
  const calls: string[] = [];
  const requestedLimits: number[] = [];
  const lookups: unknown[] = [];
  let modelCalls = 0;
  const store: Pick<PokemonVectorStore, 'searchByVector' | 'lookup'> = {
    async searchByVector(name, vector, topK) {
      calls.push('store');
      assert.equal(name, 'pokedex_vectors');
      assert.equal(vector.length, EMBEDDING_DIMENSIONS);
      requestedLimits.push(topK);
      if (overrides.failRetrieval) throw new Error('internal storage path');
      return overrides.evidence ?? [bulbasaur, pikachu];
    },
    async lookup(name, criteria) {
      calls.push('lookup');
      assert.equal(name, 'pokedex_vectors');
      lookups.push(criteria);
      return overrides.lookupEvidence ?? [];
    },
  };
  const embeddings: QueryEmbeddingClient = {
    async embedQuery(question) {
      calls.push('embedding');
      assert.equal(question, questionText);
      return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    },
  };
  const generator: PokemonAnswerGenerator = {
    async generate(input) {
      calls.push('model');
      modelCalls += 1;
      assert.equal(input.question, questionText);
      assert.deepEqual(input.evidence, overrides.lookupEvidence ?? overrides.evidence ?? [bulbasaur, pikachu]);
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
    lookups,
    get modelCalls() { return modelCalls; },
  };
}

test('embeds, retrieves five records, guards the question and context, and cites only used evidence', async () => {
  const fixture = dependencies();
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
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
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
  assert.deepEqual(result, { answer: INSUFFICIENT_EVIDENCE_ANSWER, abstained: true, sources: [] });
  assert.equal(fixture.modelCalls, 0);
});

test('returns a model abstention without citations', async () => {
  const fixture = dependencies({ generated: { answer: 'The indexed data is insufficient.', abstained: true, usedPokemonIds: [] } });
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
  assert.deepEqual(result, { answer: 'The indexed data is insufficient.', abstained: true, sources: [] });
});

test('fails closed before model invocation when the guardrail rejects input or evidence', async () => {
  const fixture = dependencies({ failGuardrail: true });
  await assert.rejects(answerQuestion('Why does the seed grow?', fixture.dependencies), PromptGuardrailError);
  assert.equal(fixture.modelCalls, 0);
  assert.deepEqual(fixture.calls, ['guardrail']);
});

test('wraps retrieval and model failures without exposing internal details', async () => {
  const retrievalFailure = dependencies({ failRetrieval: true });
  await assert.rejects(answerQuestion('Why does the seed grow?', retrievalFailure.dependencies), (error: unknown) => {
    assert.ok(error instanceof RetrievalError);
    assert.doesNotMatch(error.message, /storage path/);
    return true;
  });

  const modelFailure = dependencies({ failModel: true });
  await assert.rejects(answerQuestion('Why does the seed grow?', modelFailure.dependencies), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.doesNotMatch(error.message, /provider key secret/);
    return true;
  });
});

test('rejects a generated answer that cites records outside retrieved evidence', async () => {
  const fixture = dependencies({ generated: { answer: 'Unsupported.', abstained: false, usedPokemonIds: [151] } });
  await assert.rejects(answerQuestion('Why does the seed grow?', fixture.dependencies), ModelGenerationError);
});

test('validates the question before running retrieval or generation', async () => {
  const fixture = dependencies();
  await assert.rejects(answerQuestion('  ', fixture.dependencies));
  assert.deepEqual(fixture.calls, []);
});

test('uses exact indexed lookup for National Pokedex number 3 even when vector search omits Venusaur', async () => {
  const question = 'Qual o pokemon numero 3?';
  const fixture = dependencies({
    question,
    lookupEvidence: [venusaur],
    generated: { answer: 'O Pokémon #3 é Venusaur.', abstained: false, usedPokemonIds: [3] },
  });
  const result = await answerQuestion(question, fixture.dependencies);
  assert.deepEqual(fixture.lookups, [{ kind: 'id', id: 3 }]);
  assert.deepEqual(fixture.calls, ['guardrail', 'lookup', 'guardrail', 'model']);
  assert.equal(fixture.modelCalls, 1);
  assert.equal(result.answer, 'O Pokémon #3 é Venusaur.');
  assert.deepEqual(result.sources, venusaur.sources);
});

test('uses exact canonical-name lookup and reports a missing direct record clearly', async () => {
  const nameFixture = dependencies({
    question: 'What types does Bulbasaur have?',
    lookupEvidence: [bulbasaur],
  });
  const nameResult = await answerQuestion('What types does Bulbasaur have?', nameFixture.dependencies);
  assert.deepEqual(nameFixture.lookups, [{ kind: 'name', name: 'Bulbasaur' }]);
  assert.equal(nameResult.abstained, false);

  const missingFixture = dependencies({ question: 'What Pokémon is #999?' });
  const missingResult = await answerQuestion('What Pokémon is #999?', missingFixture.dependencies);
  assert.equal(missingResult.abstained, true);
  assert.match(missingResult.answer, /No matching Pokémon record/);
  assert.deepEqual(missingFixture.calls, ['guardrail', 'lookup']);
  assert.equal(missingFixture.modelCalls, 0);

  const missingNameFixture = dependencies({ question: 'Who is Missingno?' });
  const missingNameResult = await answerQuestion('Who is Missingno?', missingNameFixture.dependencies);
  assert.equal(missingNameResult.abstained, true);
  assert.match(missingNameResult.answer, /No matching Pokémon record/);
  assert.deepEqual(missingNameFixture.lookups, [{ kind: 'name', name: 'Missingno' }]);
});

test('compares all indexed records of a requested type using total base stats', async () => {
  const question = 'Qual o melhor Pokémon do tipo planta? Pode me dizer sua opinião e os stats deles?';
  const fixture = dependencies({
    question,
    lookupEvidence: [bulbasaur, venusaur],
    generated: {
      answer: 'Pelo maior total de stats base, Venusaur lidera com 525. Bulbasaur: HP 45, Attack 49, Defense 49, Special Attack 65, Special Defense 65, Speed 45, total 318. Venusaur: HP 80, Attack 82, Defense 83, Special Attack 100, Special Defense 100, Speed 80, total 525.',
      abstained: false,
      usedPokemonIds: [1, 3],
    },
  });
  const result = await answerQuestion(question, fixture.dependencies);
  assert.deepEqual(fixture.lookups, [{ kind: 'type', type: 'grass' }]);
  assert.equal(result.abstained, false);
  assert.match(result.answer, /Venusaur/);
  assert.match(result.answer, /525/);
  assert.match(result.answer, /stats base/);
  assert.match(result.answer, /Bulbasaur: HP 45/);
  assert.match(result.answer, /Venusaur: HP 80/);
  assert.deepEqual([...new Set(result.sources.map(({ pokemonId }) => pokemonId))], [1, 3]);
  assert.equal(fixture.modelCalls, 1);
  assert.deepEqual(fixture.calls, ['guardrail', 'lookup', 'guardrail', 'model']);
});

test('does not misclassify generic Pokémon questions as exact-name lookups', async () => {
  const fixture = dependencies({ question: 'What is a Pokémon?' });
  const result = await answerQuestion('What is a Pokémon?', fixture.dependencies);
  assert.equal(result.abstained, false);
  assert.deepEqual(fixture.calls, ['guardrail', 'embedding', 'store', 'guardrail', 'model']);
  assert.deepEqual(fixture.lookups, []);
});
