import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStreamingAnswer, type AnswerTextUpdate } from './streaming-answer-parser.js';

async function* chunksOf(...chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

test('extracts only the answer field incrementally from structured JSON', async () => {
  const updates: AnswerTextUpdate[] = [];
  async function* delayedChunks() {
    yield '{"answer":"Pikachu';
    assert.deepEqual(updates, [{ type: 'delta', text: 'Pikachu' }]);
    yield ' evolves into Raichu.","abstained":false,"usedPokemonIds":[]}';
  }

  const result = await parseStreamingAnswer(delayedChunks(), (update) => updates.push(update));
  assert.deepEqual(result, { answer: 'Pikachu evolves into Raichu.', abstained: false, usedPokemonIds: [] });
  assert.deepEqual(updates, [
    { type: 'delta', text: 'Pikachu' },
    { type: 'delta', text: ' evolves into Raichu.' },
  ]);
  assert.equal(updates.some((update) => update.text.includes('usedPokemonIds')), false);
});

test('handles JSON chunks split inside escaped answer content', async () => {
  const updates: AnswerTextUpdate[] = [];
  const json = JSON.stringify({ answer: 'Line one\nwith a "quote" and \u00e9', abstained: false, usedPokemonIds: [1] })
    .replace('\u00e9', '\\u00e9');
  const escapeIndex = json.indexOf('\\u00e9');
  const result = await parseStreamingAnswer(
    chunksOf(json.slice(0, escapeIndex + 3), json.slice(escapeIndex + 3)),
    (update) => updates.push(update),
  );
  assert.deepEqual(result, { answer: 'Line one\nwith a "quote" and \u00e9', abstained: false, usedPokemonIds: [1] });
  assert.equal(updates.every((update) => !update.text.includes('"answer"')), true);
});

test('does not expose an incomplete unicode escape and resumes the draft when it resolves', async () => {
  const updates: AnswerTextUpdate[] = [];
  await parseStreamingAnswer(chunksOf(
    '{"answer":"Before\\u00',
    'e9 after","abstained":false,"usedPokemonIds":[1]}',
  ), (update) => updates.push(update));
  assert.deepEqual(updates, [
    { type: 'delta', text: 'Before' },
    { type: 'delta', text: '\u00e9 after' },
  ]);
});

test('rejects a truncated or malformed final structured answer', async () => {
  await assert.rejects(parseStreamingAnswer(chunksOf('{"answer":"unfinished'), () => undefined));
});
