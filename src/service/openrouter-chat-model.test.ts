import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_MODEL, OPENROUTER_BASE_URL } from '../constants.js';
import { createOpenRouterChatModel, getOpenRouterChatOptions, invokeStructuredAnswer } from './openrouter-chat-model.js';
import { ModelGenerationError } from '../domain/ask.js';

test('configures the requested OpenRouter model, endpoint, and runtime API key', () => {
  const options = getOpenRouterChatOptions('test-api-key');
  assert.equal(options.model, CHAT_MODEL);
  assert.equal(options.model, '~deepseek/deepseek-flash-latest');
  assert.equal(options.apiKey, 'test-api-key');
  assert.equal(options.configuration?.baseURL, OPENROUTER_BASE_URL);
  assert.equal(options.temperature, 0);
});

test('creates a LangChain chat client without exposing credentials in its public configuration', () => {
  const client = createOpenRouterChatModel('test-api-key');
  assert.equal(typeof client.invoke, 'function');
});

test('validates structured model output and redacts provider failures', async () => {
  const answer = await invokeStructuredAnswer(async () => ({ answer: 'Pikachu is Electric type.', abstained: false, usedPokemonIds: [25] }));
  assert.deepEqual(answer, { answer: 'Pikachu is Electric type.', abstained: false, usedPokemonIds: [25] });
  await assert.rejects(invokeStructuredAnswer(async () => { throw new Error('provider secret'); }), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.doesNotMatch(error.message, /provider secret/);
    return true;
  });
  await assert.rejects(invokeStructuredAnswer(async () => {
    throw Object.assign(new Error('secret response body and api key'), { status: 401, code: 'invalid_api_key' });
  }), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.match(error.message, /HTTP 401, code invalid_api_key/);
    assert.doesNotMatch(error.message, /secret|api key/i);
    return true;
  });
  await assert.rejects(invokeStructuredAnswer(async () => ({ answer: 'Unsupported', abstained: false, usedPokemonIds: [] })), ModelGenerationError);
});
