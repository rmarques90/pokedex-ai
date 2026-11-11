import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCollectAndPopulateCommand } from './collect-and-populate-vector-database.js';

test('runs collection before population and waits for each to finish', async () => {
  const calls: string[] = [];
  const output: string[] = [];
  await runCollectAndPopulateCommand({
    async collect() { calls.push('collect:start'); await Promise.resolve(); calls.push('collect:complete'); return '151 records collected'; },
    async populate() { calls.push('populate:start'); await Promise.resolve(); calls.push('populate:complete'); },
    writeLine: (line) => output.push(line),
  });
  assert.deepEqual(calls, ['collect:start', 'collect:complete', 'populate:start', 'populate:complete']);
  assert.deepEqual(output, ['151 records collected']);
});

test('does not invoke population when collection fails', async () => {
  let populationCalled = false;
  await assert.rejects(runCollectAndPopulateCommand({
    async collect() { throw new Error('collection failed'); },
    async populate() { populationCalled = true; },
  }), /collection failed/);
  assert.equal(populationCalled, false);
});

test('npm combined command points to the sequential internal script', async () => {
  const packageJson: unknown = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal((packageJson as { scripts: Record<string, string> }).scripts['collect:populate-db'], 'tsx src/scripts/collect-and-populate-vector-database.ts');
});
