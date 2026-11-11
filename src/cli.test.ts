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

test('reports domain errors safely and hides unexpected details', async () => {
  const domainOutput = output();
  assert.equal(await runCli(['ask', 'Question'], { async ask() { throw new ModelGenerationError(); } }, domainOutput.io), 1);
  assert.match(domainOutput.stderr[0] ?? '', /Answer generation failed/);

  const unexpectedOutput = output();
  assert.equal(await runCli(['ask', 'Question'], { async ask() { throw new Error('private token secret'); } }, unexpectedOutput.io), 1);
  assert.doesNotMatch(unexpectedOutput.stderr.join('\n'), /private token secret/);
});

test('keeps the npm CLI entry configured for positional ask arguments', async () => {
  const packageJson: unknown = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal((packageJson as { scripts: Record<string, string> }).scripts.cli, 'tsx src/cli.ts');
});
