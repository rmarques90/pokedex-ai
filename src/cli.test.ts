import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ModelGenerationError, type AskResult } from './domain/ask.js';
import { runCli } from './cli.js';

const success: AskResult = {
  answer: 'Bulbasaur is a Grass and Poison Pokémon.',
  abstained: false,
  sources: [{ pokemonId: 1, pokemonName: 'bulbasaur', url: 'https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)' }],
};

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { writeOutput: (line: string) => stdout.push(line), writeError: (line: string) => stderr.push(line) } };
}

test('runs a one-shot ask command and prints the answer and citations', async () => {
  const captured = output();
  let asked = '';
  const exitCode = await runCli(['ask', 'What', 'type', 'is', 'Bulbasaur?'], {
    async ask(question) { asked = question; return success; },
  }, captured.io);
  assert.equal(exitCode, 0);
  assert.equal(asked, 'What type is Bulbasaur?');
  assert.deepEqual(captured.stdout, [success.answer, `Sources:\n- bulbasaur: ${success.sources[0]?.url}`]);
  assert.deepEqual(captured.stderr, []);
});

test('prints expected abstention and exits successfully', async () => {
  const captured = output();
  const result: AskResult = { answer: 'The indexed data is insufficient.', abstained: true, sources: [] };
  const exitCode = await runCli(['ask', 'Question?'], { async ask() { return result; } }, captured.io);
  assert.equal(exitCode, 0);
  assert.deepEqual(captured.stdout, [result.answer]);
});

test('prints a direct Pokémon lookup before its citations', async () => {
  const captured = output();
  const result: AskResult = {
    answer: 'O Pokémon #3 é Venusaur.',
    abstained: false,
    sources: [{ pokemonId: 3, pokemonName: 'venusaur', url: 'https://pokeapi.co/api/v2/pokemon/3/' }],
  };
  const exitCode = await runCli(['ask', 'qual', 'o', 'pokemon', 'numero', '3?'], { async ask() { return result; } }, captured.io);
  assert.equal(exitCode, 0);
  assert.deepEqual(captured.stdout, [result.answer, `Sources:\n- venusaur: ${result.sources[0]?.url}`]);
});

test('rejects a missing or empty question before calling the service', async () => {
  const captured = output();
  let called = false;
  const dependencies = { async ask() { called = true; return success; } };
  assert.equal(await runCli(['ask'], dependencies, captured.io), 2);
  assert.equal(await runCli(['ask', '   '], dependencies, captured.io), 2);
  assert.equal(await runCli(['unknown', 'question'], dependencies, captured.io), 2);
  assert.equal(called, false);
  assert.equal(captured.stderr.length, 3);
});

test('prints categorized errors and their complete stack traces to stderr', async () => {
  const captured = output();
  const failure = new ModelGenerationError('OpenRouter answer generation failed.');
  const exitCode = await runCli(['ask', 'Question'], { async ask() { throw failure; } }, captured.io);
  const diagnostic = captured.stderr.join('\n');
  assert.equal(exitCode, 1);
  assert.match(diagnostic, /Error category: ModelGenerationError/);
  assert.match(diagnostic, /Message: OpenRouter answer generation failed/);
  assert.match(diagnostic, /Stack trace:/);
  assert.ok(diagnostic.includes(failure.stack ?? ''));
  assert.deepEqual(captured.stdout, []);
});

test('prints nested causes and redacts credentials from messages and stack traces', async () => {
  const captured = output();
  const apiKey = `sk-or-v1-${'a'.repeat(48)}`;
  const cause = new Error(`Provider response contained api_key=${apiKey}; password=${apiKey}; https://service.test/?access_token=${apiKey}`);
  const failure = new ModelGenerationError(`OpenRouter answer generation failed (HTTP 401, code invalid_api_key) with Bearer ${apiKey}`, { cause });
  assert.equal(await runCli(['ask', 'Question'], { async ask() { throw failure; } }, captured.io), 1);
  const diagnostic = captured.stderr.join('\n');
  assert.match(diagnostic, /Caused by \(1\): Error/);
  assert.match(diagnostic, /HTTP 401, code invalid_api_key/);
  assert.match(diagnostic, /Provider response contained api_key=\[REDACTED\]/);
  assert.match(diagnostic, /password=\[REDACTED\]/);
  assert.match(diagnostic, /access_token=\[REDACTED\]/);
  assert.match(diagnostic, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(diagnostic, new RegExp(apiKey));
  assert.match(diagnostic, /Stack trace:/);
});

test('reports unexpected errors instead of hiding their diagnostic message', async () => {
  const captured = output();
  const exitCode = await runCli(['ask', 'Question'], { async ask() { throw new Error('private token details are unavailable'); } }, captured.io);
  const diagnostic = captured.stderr.join('\n');
  assert.equal(exitCode, 1);
  assert.match(diagnostic, /Error category: Error/);
  assert.match(diagnostic, /Message: private token details are unavailable/);
  assert.match(diagnostic, /Stack trace:/);
});

test('keeps the npm CLI entry configured for positional ask arguments', async () => {
  const packageJson: unknown = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal((packageJson as { scripts: Record<string, string> }).scripts.cli, 'tsx src/cli.ts');
});
