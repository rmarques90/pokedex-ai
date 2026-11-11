import { randomUUID } from 'node:crypto';
import type { Connection } from '@lancedb/lancedb';
import { z } from 'zod';
import { CollectionNameSchema, PokemonVectorRowSchema, type PokemonVectorRow } from '../domain/pokemon-vector-document.js';
import {
  RetrievedEvidenceSchema,
  VectorCollectionUnavailableError,
  RetrievalError,
  type RetrievedEvidence,
} from '../domain/ask.js';
import { EMBEDDING_DIMENSIONS } from '../constants.js';

const STAGING_PREFIX = '__pokedex_ai_stage_';
const BACKUP_PREFIX = '__pokedex_ai_backup_';

export interface CollectionState {
  collectionExisted: boolean;
  databaseCollectionNames: string[];
}

export interface PokemonVectorStore {
  inspectCollection(collectionName: string): Promise<CollectionState>;
  replaceCollection(collectionName: string, rows: PokemonVectorRow[]): Promise<CollectionState>;
  searchByVector(collectionName: string, vector: number[], topK: number): Promise<RetrievedEvidence[]>;
}

const SearchVectorSchema = z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS);
const TopKSchema = z.number().int().min(1).max(151);

export class LanceDbStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LanceDbStoreError';
  }
}

export class LanceDbVectorStore implements PokemonVectorStore {
  constructor(private readonly connection: Connection) {}

  async inspectCollection(collectionName: string): Promise<CollectionState> {
    const name = CollectionNameSchema.parse(collectionName);
    const databaseCollectionNames = await this.connection.tableNames();
    return { collectionExisted: databaseCollectionNames.includes(name), databaseCollectionNames };
  }

  async searchByVector(collectionName: string, vector: number[], topK: number): Promise<RetrievedEvidence[]> {
    const name = CollectionNameSchema.parse(collectionName);
    const queryVector = SearchVectorSchema.parse(vector);
    const resultLimit = TopKSchema.parse(topK);
    const names = await this.connection.tableNames();
    if (!names.includes(name)) throw new VectorCollectionUnavailableError();

    try {
      const table = await this.connection.openTable(name);
      const rows = await table.vectorSearch(queryVector).limit(resultLimit).toArray();
      return rows.map((rawRow) => {
        const row = PokemonVectorRowSchema.parse(normalizeRow(rawRow as Record<string, unknown>));
        const distance = (rawRow as Record<string, unknown>)._distance;
        const sources = [row.descriptionSourceUrl, row.pokemonUrl, row.speciesUrl]
          .filter((url, index, all) => all.indexOf(url) === index)
          .map((url) => ({ pokemonId: row.id, pokemonName: row.name, url }));
        return RetrievedEvidenceSchema.parse({
          id: row.id,
          text: row.text,
          pokemonName: row.name,
          sources,
          ...(typeof distance === 'number' && Number.isFinite(distance) ? { score: distance } : {}),
        });
      });
    } catch (error) {
      if (error instanceof VectorCollectionUnavailableError || error instanceof RetrievalError) throw error;
      throw new RetrievalError('Pokémon vector search failed.', { cause: error });
    }
  }

  async replaceCollection(collectionName: string, inputRows: PokemonVectorRow[]): Promise<CollectionState> {
    const name = CollectionNameSchema.parse(collectionName);
    if (inputRows.length !== 151) throw new LanceDbStoreError('Refusing to populate a collection without exactly 151 records');
    const rows = inputRows.map((row) => PokemonVectorRowSchema.parse(row));
    const ids = new Set(rows.map(({ id }) => id));
    if (ids.size !== 151 || Array.from({ length: 151 }, (_, index) => index + 1).some((id) => !ids.has(id))) {
      throw new LanceDbStoreError('Refusing to populate a collection with missing or duplicate Pokédex IDs');
    }

    const namesBefore = await this.connection.tableNames();
    const staleInternalNames = namesBefore.filter((tableName) => tableName.startsWith(STAGING_PREFIX) || tableName.startsWith(BACKUP_PREFIX));
    if (staleInternalNames.length > 0) {
      throw new LanceDbStoreError(`Recovery required for stale internal collection(s): ${staleInternalNames.join(', ')}`);
    }

    const collectionExisted = namesBefore.includes(name);
    const stageName = `${STAGING_PREFIX}${randomUUID().replaceAll('-', '')}`;
    const backupName = `${BACKUP_PREFIX}${randomUUID().replaceAll('-', '')}`;
    let stageCreated = false;
    let backupCreated = false;
    let targetDropped = false;
    let targetPublished = false;

    try {
      const stage = await this.connection.createTable(stageName, rows);
      stageCreated = true;
      await this.assertRowCount(stageName, 151);
      const stagedRows = (await stage.query().toArray()).map(normalizeRow) as PokemonVectorRow[];
      if (stagedRows.length !== 151) throw new LanceDbStoreError('Staging collection did not contain 151 rows');
      const verifiedRows = stagedRows.map((row) => PokemonVectorRowSchema.parse(row));
      await this.connection.dropTable(stageName);
      stageCreated = false;

      if (collectionExisted) {
        const currentTable = await this.connection.openTable(name);
        const previousRows = (await currentTable.query().toArray()).map(normalizeRow);
        if (previousRows.length === 0) {
          await this.connection.createEmptyTable(backupName, await currentTable.schema());
        } else {
          await this.connection.createTable(backupName, previousRows);
        }
        backupCreated = true;
        await this.assertRowCount(backupName, previousRows.length);
        await this.connection.dropTable(name);
        targetDropped = true;
      }

      await this.connection.createTable(name, verifiedRows);
      targetPublished = true;
      await this.assertRowCount(name, 151);
      if (backupCreated) {
        await this.connection.dropTable(backupName);
        backupCreated = false;
      }
      return { collectionExisted, databaseCollectionNames: await this.connection.tableNames() };
    } catch (error) {
      const cleanupFailures: string[] = [];
      if (targetDropped && targetPublished) {
        try {
          await this.connection.dropTable(name);
          targetPublished = false;
        } catch {
          cleanupFailures.push('could not remove the incomplete published collection');
        }
      }
      if (targetDropped && !targetPublished && backupCreated) {
        try {
          const backup = await this.connection.openTable(backupName);
          const previousRows = (await backup.query().toArray()).map(normalizeRow);
          if (previousRows.length === 0) {
            await this.connection.createEmptyTable(name, await backup.schema());
          } else {
            await this.connection.createTable(name, previousRows);
          }
          targetDropped = false;
        } catch {
          cleanupFailures.push(`previous records remain in recovery collection ${backupName}`);
        }
      }
      if (stageCreated) {
        try { await this.connection.dropTable(stageName); } catch { cleanupFailures.push(`staging collection remains: ${stageName}`); }
      }
      if (backupCreated && !targetDropped) {
        try { await this.connection.dropTable(backupName); } catch { cleanupFailures.push(`recovery collection remains: ${backupName}`); }
      }
      const detail = error instanceof Error ? error.message : 'unknown database error';
      throw new LanceDbStoreError(
        cleanupFailures.length > 0
          ? `Collection replacement failed (${detail}); ${cleanupFailures.join('; ')}`
          : `Collection replacement failed and the prior collection was restored (${detail})`,
        { cause: error },
      );
    }
  }

  private async assertRowCount(collectionName: string, expected: number): Promise<void> {
    const table = await this.connection.openTable(collectionName);
    const actual = await table.countRows();
    if (actual !== expected) throw new LanceDbStoreError(`Collection ${collectionName} has ${actual} rows; expected ${expected}`);
  }
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeArrowValue(value)]));
}

function normalizeArrowValue(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<unknown>);
  if (value !== null && typeof value === 'object' && 'toArray' in value && typeof value.toArray === 'function') {
    return Array.from(value.toArray() as ArrayLike<unknown>);
  }
  return value;
}
