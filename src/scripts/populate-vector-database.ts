import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POKEMON_DATA_PATH } from '../constants.js';
import { PokemonDatasetSchema, PopulationConfigSchema } from '../domain/pokemon-vector-document.js';
import { createOpenRouterEmbeddings } from '../service/openrouter-embeddings.js';
import { populateVectorDatabase, InvalidPokemonDatasetError, PopulationConfigurationError } from '../service/populate-vector-database.js';
import { connectLocalVectorStore, type LocalVectorStoreHandle } from '../store/local-lancedb.js';
import type { EmbeddingClient } from '../service/openrouter-embeddings.js';

export interface PopulateCommandDependencies {
  environment: NodeJS.ProcessEnv;
  readDataset?: () => Promise<string>;
  createEmbeddings?: (apiKey: string) => EmbeddingClient;
  connectStore?: () => Promise<LocalVectorStoreHandle>;
  writeLine?: (line: string) => void;
}

export async function runPopulateCommand(dependencies: PopulateCommandDependencies): Promise<void> {
  const writeLine = dependencies.writeLine ?? console.log;
  const collectionName = dependencies.environment.LANCEDB_COLLECTION_NAME;
  const apiKey = dependencies.environment.OPENROUTER_API_KEY;
  const configResult = PopulationConfigSchema.safeParse({ collectionName, openRouterApiKey: apiKey });
  if (!configResult.success) throw new PopulationConfigurationError('Set a valid LANCEDB_COLLECTION_NAME and OPENROUTER_API_KEY in the local environment');

  let rawDataset: unknown;
  try {
    const source = await (dependencies.readDataset ?? (() => readFile(resolve(process.cwd(), POKEMON_DATA_PATH), 'utf8')))();
    rawDataset = JSON.parse(source) as unknown;
    PokemonDatasetSchema.parse(rawDataset);
  } catch (error) {
    throw new InvalidPokemonDatasetError('Could not read a valid 151-record dataset; run the data collection command first', { cause: error });
  }

  const embeddings = (dependencies.createEmbeddings ?? createOpenRouterEmbeddings)(configResult.data.openRouterApiKey);
  const { store, databaseExisted } = await (dependencies.connectStore ?? connectLocalVectorStore)();
  writeLine(`Local LanceDB database existed before this run: ${databaseExisted ? 'yes' : 'no'}`);
  const stateBefore = await store.inspectCollection(configResult.data.collectionName);
  writeLine(`Configured collection existed before this run: ${stateBefore.collectionExisted ? 'yes' : 'no'}`);

  const result = await populateVectorDatabase(rawDataset, configResult.data, { embeddings, store });
  writeLine(`Populated ${result.recordCount} Pokemon records in LanceDB collection "${result.collectionName}".`);
}

export function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Could not load local environment configuration');
    }
  }
}

async function main(): Promise<void> {
  try {
    loadLocalEnvironment();
    await runPopulateCommand({ environment: process.env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Vector database population failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
