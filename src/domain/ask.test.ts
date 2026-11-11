import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AskQuestionSchema,
  AskRequestSchema,
  AskResultSchema,
  AskSourceSchema,
  PokemonLookupSchema,
  RetrievedEvidenceSchema,
} from './ask.js';

const source = { pokemonId: 1, pokemonName: 'Bulbasaur', url: 'https://example.com/bulbasaur' };

test('ask question trims and accepts a non-empty question', () => {
  assert.equal(AskQuestionSchema.parse('  What is Bulbasaur?  '), 'What is Bulbasaur?');
  assert.equal(AskRequestSchema.parse({ question: 'Who is Pikachu?' }).question, 'Who is Pikachu?');
});

test('ask question and request reject empty or unexpected input', () => {
  assert.throws(() => AskQuestionSchema.parse('  '));
  assert.throws(() => AskRequestSchema.parse({ question: 'Who?', extra: true }));
});

test('source references require a valid Pokémon identity and URL', () => {
  assert.deepEqual(AskSourceSchema.parse(source), source);
  assert.throws(() => AskSourceSchema.parse({ ...source, url: 'not-a-url' }));
  assert.throws(() => AskSourceSchema.parse({ ...source, pokemonId: 152 }));
});

test('retrieved evidence requires non-empty text and source references', () => {
  const evidence = { id: 1, text: 'Grass and Poison Pokémon.', pokemonName: 'Bulbasaur', types: ['grass', 'poison'], total: 318, sources: [source], score: 0.2 };
  assert.deepEqual(RetrievedEvidenceSchema.parse(evidence), evidence);
  assert.throws(() => RetrievedEvidenceSchema.parse({ ...evidence, sources: [] }));
});

test('Pokemon lookup criteria validate IDs, names, and types', () => {
  assert.deepEqual(PokemonLookupSchema.parse({ kind: 'id', id: 3 }), { kind: 'id', id: 3 });
  assert.deepEqual(PokemonLookupSchema.parse({ kind: 'name', name: 'bulbasaur' }), { kind: 'name', name: 'bulbasaur' });
  assert.deepEqual(PokemonLookupSchema.parse({ kind: 'type', type: 'grass' }), { kind: 'type', type: 'grass' });
  assert.throws(() => PokemonLookupSchema.parse({ kind: 'id', id: 0 }));
  assert.throws(() => PokemonLookupSchema.parse({ kind: 'name', name: '  ' }));
  assert.throws(() => PokemonLookupSchema.parse({ kind: 'type', type: 'grass', extra: true }));
});

test('answer and abstention results accept valid shapes and reject invalid ones', () => {
  const result = { answer: 'Bulbasaur is a Grass and Poison Pokémon.', abstained: false, sources: [source] };
  assert.deepEqual(AskResultSchema.parse(result), result);
  assert.deepEqual(AskResultSchema.parse({ answer: 'The indexed data is insufficient.', abstained: true, sources: [] }), {
    answer: 'The indexed data is insufficient.', abstained: true, sources: [],
  });
  assert.throws(() => AskResultSchema.parse({ ...result, sources: [{ ...source, url: 'invalid' }] }));
});
