import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_MODEL, OPENROUTER_BASE_URL } from '../constants.js';
import { ANSWER_SYSTEM_PROMPT, createOpenRouterChatModel, getOpenRouterChatOptions, invokeStructuredAnswer } from './openrouter-chat-model.js';
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

test('answer instructions require direct, concise, evidence-grounded responses', () => {
  assert.match(ANSWER_SYSTEM_PROMPT, /same language as the user question/);
  assert.match(ANSWER_SYSTEM_PROMPT, /direct answer in the first sentence/);
  assert.match(ANSWER_SYSTEM_PROMPT, /Address every distinct request/);
  assert.match(ANSWER_SYSTEM_PROMPT, /individual base stats/);
  assert.match(ANSWER_SYSTEM_PROMPT, /measurable criterion/);
  assert.match(ANSWER_SYSTEM_PROMPT, /never imply a global ranking from partial evidence/);
  assert.match(ANSWER_SYSTEM_PROMPT, /do not lead with a long abstention/);
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

test('preserves the provider cause and safe diagnostics while excluding unsafe error codes', async () => {
  const providerSecret = `sk-or-v1-${'b'.repeat(48)}`;
  const providerFailure = Object.assign(new Error(`Provider response included ${providerSecret}`), {
    status: 502,
    code: 'upstream_timeout',
  });
  await assert.rejects(invokeStructuredAnswer(async () => { throw providerFailure; }), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.match(error.message, /HTTP 502, code upstream_timeout/);
    assert.doesNotMatch(error.message, new RegExp(providerSecret));
    assert.equal(error.cause, providerFailure);
    return true;
  });

  const unsafeCodeFailure = Object.assign(new Error('Provider rejected the request.'), {
    status: 401,
    code: providerSecret,
  });
  await assert.rejects(invokeStructuredAnswer(async () => { throw unsafeCodeFailure; }), (error: unknown) => {
    assert.ok(error instanceof ModelGenerationError);
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, new RegExp(providerSecret));
    return true;
  });
});
