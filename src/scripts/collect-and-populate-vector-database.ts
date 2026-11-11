import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCollection } from './collect-pokemon-data.js';
import { loadLocalEnvironment, runPopulateCommand } from './populate-vector-database.js';

export interface CollectAndPopulateDependencies {
  collect: () => Promise<string>;
  populate: () => Promise<void>;
  writeLine?: (line: string) => void;
}

export async function runCollectAndPopulateCommand(dependencies: CollectAndPopulateDependencies): Promise<void> {
  const writeLine = dependencies.writeLine ?? console.log;
  const summary = await dependencies.collect();
  writeLine(summary);
  await dependencies.populate();
}

async function main(): Promise<void> {
  try {
    loadLocalEnvironment();
    await runCollectAndPopulateCommand({
      collect: () => runCollection(),
      populate: () => runPopulateCommand({ environment: process.env }),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Data collection and LanceDB population failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
