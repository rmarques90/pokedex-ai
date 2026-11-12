import assert from 'node:assert/strict';
import test from 'node:test';
import { AskStreamEventSchema } from './ask-stream.js';

test('accepts only valid stream events and existing AskResult completion payloads', () => {
  assert.equal(AskStreamEventSchema.safeParse({ type: 'delta', text: 'Pika' }).success, true);
  assert.equal(AskStreamEventSchema.safeParse({ type: 'replace', reason: 'fallback', text: '' }).success, true);
  assert.equal(AskStreamEventSchema.safeParse({
    type: 'complete', result: { answer: 'Pikachu', abstained: false, sources: [] },
  }).success, true);
  assert.equal(AskStreamEventSchema.safeParse({ type: 'error', error: 'Unavailable', retryable: true }).success, true);
  assert.equal(AskStreamEventSchema.safeParse({ type: 'complete', result: { answer: '', abstained: false, sources: [] } }).success, false);
  assert.equal(AskStreamEventSchema.safeParse({ type: 'delta', text: '', extra: true }).success, false);
  assert.equal(AskStreamEventSchema.safeParse({ type: 'error', error: 'Failure', retryable: 'yes' }).success, false);
});
