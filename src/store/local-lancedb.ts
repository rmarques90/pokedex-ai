import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connect } from '@lancedb/lancedb';
import { LANCEDB_PATH } from '../constants.js';
import { LanceDbVectorStore, type PokemonVectorStore } from './lance-db-store.js';

export interface LocalVectorStoreHandle {
  store: PokemonVectorStore;
  databaseExisted: boolean;
}

export async function connectLocalVectorStore(): Promise<LocalVectorStoreHandle> {
  const path = resolve(process.cwd(), LANCEDB_PATH);
  let databaseExisted = true;
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') databaseExisted = false;
    else throw error;
  }
  const connection = await connect(path);
  return { store: new LanceDbVectorStore(connection), databaseExisted };
}
