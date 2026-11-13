import assert from 'node:assert/strict';
import test from 'node:test';
import { EMBEDDING_DIMENSIONS } from '../constants.js';
import {
  ModelGenerationError,
  PromptGuardrailError,
  PromptSafetyModelError,
  RetrievalError,
  type RetrievedEvidence,
} from '../domain/ask.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';
import type { QueryEmbeddingClient } from './openrouter-embeddings.js';
import type { PokemonAnswerGenerator } from './openrouter-chat-model.js';
import type { PromptInjectionGuardrail } from './prompt-injection-guardrail.js';
import { answerQuestion, INITIAL_RETRIEVAL_TOP_K, streamAnswerQuestion } from './answer-question.js';

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
  failSafetyModel?: boolean;
  failRetrieval?: boolean;
  failModel?: boolean;
} = {}) {
  const questionText = overrides.question ?? 'Why does the seed grow?';
  const calls: string[] = [];
  const requestedLimits: number[] = [];
  const lookups: unknown[] = [];
  const memoryContexts: Array<string | undefined> = [];
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
      memoryContexts.push(input.memoryContext);
      modelCalls += 1;
      assert.equal(input.question, questionText);
      if (input.mode === 'general') assert.deepEqual(input.evidence, []);
      else assert.deepEqual(input.evidence, overrides.lookupEvidence ?? overrides.evidence ?? [bulbasaur, pikachu]);
      if (overrides.failModel) throw new Error('provider key secret');
      if (input.mode === 'general' && !overrides.generated?.abstained) {
        return { answer: 'Pikachu evolves into Raichu.', abstained: false, usedPokemonIds: [] };
      }
      return overrides.generated ?? {
        answer: 'Bulbasaur is a Grass and Poison Pokémon.',
        abstained: false,
        usedPokemonIds: [1],
      };
    },
  };
  const guardrail: PromptInjectionGuardrail = {
    async checkQuestion(question) {
      calls.push('guardrail:question');
      if (overrides.failGuardrail) throw new PromptGuardrailError();
      if (overrides.failSafetyModel) throw new PromptSafetyModelError();
      return question as string;
    },
    checkEvidence(items) {
      calls.push('guardrail:evidence');
      if (overrides.failGuardrail) throw new PromptGuardrailError();
      return items as RetrievedEvidence[];
    },
  };
  return {
    dependencies: { collectionName: 'pokedex_vectors', store, embeddings, generator, guardrail },
    calls,
    requestedLimits,
    lookups,
    memoryContexts,
    get modelCalls() { return modelCalls; },
  };
}

test('embeds, retrieves five records, guards the question and context, and cites only used evidence', async () => {
  const fixture = dependencies();
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
  assert.equal(INITIAL_RETRIEVAL_TOP_K, 5);
  assert.deepEqual(fixture.requestedLimits, [5]);
  assert.deepEqual(fixture.calls, ['guardrail:question', 'embedding', 'store', 'guardrail:evidence', 'model']);
  assert.deepEqual(result, {
    answer: 'Bulbasaur is a Grass and Poison Pokémon.',
    abstained: false,
    sources: bulbasaur.sources,
  });
});

test('passes memory into a separate generator context without changing evidence or citations', async () => {
  const fixture = dependencies();
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies, { memoryContext: '[response_preference] Prefers concise answers' });
  assert.equal(result.sources[0]?.pokemonId, 1);
  assert.deepEqual(fixture.memoryContexts, ['[response_preference] Prefers concise answers']);
});

test('uses general Pokemon knowledge with no evidence when the collection returns no matches', async () => {
  const fixture = dependencies({ evidence: [] });
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
  assert.deepEqual(result, { answer: 'Pikachu evolves into Raichu.', abstained: false, sources: [] });
  assert.equal(fixture.modelCalls, 1);
});

test('streams grounded deltas and completes with validated citations', async () => {
  const fixture = dependencies();
  fixture.dependencies.generator.stream = async (_input, emit) => {
    emit({ type: 'delta', text: 'Bulbasaur is ' });
    emit({ type: 'delta', text: 'Grass and Poison.' });
    return { answer: 'Bulbasaur is Grass and Poison.', abstained: false, usedPokemonIds: [1] };
  };
  const updates: unknown[] = [];
  const result = await streamAnswerQuestion('Why does the seed grow?', fixture.dependencies, new AbortController().signal, (event) => updates.push(event));
  assert.deepEqual(updates, [
    { type: 'delta', text: 'Bulbasaur is ' },
    { type: 'delta', text: 'Grass and Poison.' },
  ]);
  assert.deepEqual(result.sources, bulbasaur.sources);
});

test('replaces an abstained grounded draft before streaming general knowledge', async () => {
  const fixture = dependencies();
  let modelCalls = 0;
  fixture.dependencies.generator.stream = async (input, emit) => {
    modelCalls += 1;
    if (input.mode === 'retrieved') {
      emit({ type: 'delta', text: 'Insufficient indexed data.' });
      return { answer: 'Insufficient indexed data.', abstained: true, usedPokemonIds: [] };
    }
    emit({ type: 'delta', text: 'Pikachu evolves into Raichu.' });
    return { answer: 'Pikachu evolves into Raichu.', abstained: false, usedPokemonIds: [] };
  };
  const updates: unknown[] = [];
  const result = await streamAnswerQuestion('Why does the seed grow?', fixture.dependencies, new AbortController().signal, (event) => updates.push(event));
  assert.deepEqual(updates, [
    { type: 'delta', text: 'Insufficient indexed data.' },
    { type: 'replace', reason: 'fallback', text: '' },
    { type: 'delta', text: 'Pikachu evolves into Raichu.' },
  ]);
  assert.equal(modelCalls, 2);
  assert.deepEqual(result.sources, []);
});

test('streams general knowledge directly when retrieval returns no evidence', async () => {
  const fixture = dependencies({ evidence: [] });
  const modes: string[] = [];
  fixture.dependencies.generator.stream = async (input, emit) => {
    modes.push(input.mode);
    emit({ type: 'delta', text: 'Pikachu evolves into Raichu.' });
    return { answer: 'Pikachu evolves into Raichu.', abstained: false, usedPokemonIds: [] };
  };
  const updates: unknown[] = [];
  const result = await streamAnswerQuestion('Why does the seed grow?', fixture.dependencies, new AbortController().signal, (event) => updates.push(event));
  assert.deepEqual(modes, ['general']);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(updates, [{ type: 'delta', text: 'Pikachu evolves into Raichu.' }]);
});

test('stops before retrieval when the stream is cancelled', async () => {
  const fixture = dependencies();
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(streamAnswerQuestion('Why does the seed grow?', fixture.dependencies, controller.signal, () => undefined));
  assert.deepEqual(fixture.calls, ['guardrail:question']);
});
test('uses the general-knowledge pass for a Portuguese question with no indexed evidence', async () => {
  const question = 'Qual informacao existe sobre esse Pokemon?';
  const fixture = dependencies({ question, evidence: [] });
  const result = await answerQuestion(question, fixture.dependencies);
  assert.deepEqual(result, { answer: 'Pikachu evolves into Raichu.', abstained: false, sources: [] });
  assert.equal(fixture.modelCalls, 1);
});
test('returns a model abstention without citations', async () => {
  const fixture = dependencies({ generated: { answer: 'The indexed data is insufficient.', abstained: true, usedPokemonIds: [] } });
  const result = await answerQuestion('Why does the seed grow?', fixture.dependencies);
  assert.deepEqual(result, { answer: 'The indexed data is insufficient.', abstained: true, sources: [] });
  assert.equal(fixture.modelCalls, 2);
});

test('fails closed before model invocation when the guardrail rejects input or evidence', async () => {
  const fixture = dependencies({ failGuardrail: true });
  await assert.rejects(answerQuestion('Why does the seed grow?', fixture.dependencies), PromptGuardrailError);
  assert.equal(fixture.modelCalls, 0);
  assert.deepEqual(fixture.calls, ['guardrail:question']);
});

test('fails closed before embeddings, retrieval, and answer generation when safety assessment is unavailable', async () => {
  const fixture = dependencies({ failSafetyModel: true });
  await assert.rejects(answerQuestion('Why does the seed grow?', fixture.dependencies), PromptSafetyModelError);
  assert.deepEqual(fixture.calls, ['guardrail:question']);
  assert.equal(fixture.modelCalls, 0);
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
  assert.deepEqual(fixture.calls, ['guardrail:question', 'lookup', 'guardrail:evidence', 'model']);
  assert.equal(fixture.modelCalls, 1);
  assert.equal(result.answer, 'O Pokémon #3 é Venusaur.');
  assert.deepEqual(result.sources, venusaur.sources);
});

test('uses exact canonical-name lookup and falls back to general knowledge for a missing record', async () => {
  const nameFixture = dependencies({
    question: 'What types does Bulbasaur have?',
    lookupEvidence: [bulbasaur],
  });
  const nameResult = await answerQuestion('What types does Bulbasaur have?', nameFixture.dependencies);
  assert.deepEqual(nameFixture.lookups, [{ kind: 'name', name: 'Bulbasaur' }]);
  assert.equal(nameResult.abstained, false);

  const missingFixture = dependencies({ question: 'What Pokémon is #999?' });
  const missingResult = await answerQuestion('What Pokémon is #999?', missingFixture.dependencies);
  assert.equal(missingResult.abstained, false);
  assert.equal(missingResult.answer, 'Pikachu evolves into Raichu.');
  assert.deepEqual(missingResult.sources, []);
  assert.deepEqual(missingFixture.calls, ['guardrail:question', 'lookup', 'guardrail:evidence', 'model']);
  assert.equal(missingFixture.modelCalls, 1);

  const missingNameFixture = dependencies({ question: 'Who is Missingno?' });
  const missingNameResult = await answerQuestion('Who is Missingno?', missingNameFixture.dependencies);
  assert.equal(missingNameResult.abstained, false);
  assert.equal(missingNameResult.answer, 'Pikachu evolves into Raichu.');
  assert.deepEqual(missingNameResult.sources, []);
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
  assert.deepEqual(fixture.calls, ['guardrail:question', 'lookup', 'guardrail:evidence', 'model']);
});

test('does not misclassify generic Pokémon questions as exact-name lookups', async () => {
  const fixture = dependencies({ question: 'What is a Pokémon?' });
  const result = await answerQuestion('What is a Pokémon?', fixture.dependencies);
  assert.equal(result.abstained, false);
  assert.deepEqual(fixture.calls, ['guardrail:question', 'embedding', 'store', 'guardrail:evidence', 'model']);
  assert.deepEqual(fixture.lookups, []);
});
