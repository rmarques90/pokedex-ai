import {
  PokemonDatasetSchema,
  PokemonEmbeddingDocumentSchema,
  PopulationConfigSchema,
  type PokemonEmbeddingDocument,
  type PopulationConfig,
  type PokemonRecord,
  type PokemonVectorRow,
} from '../domain/pokemon-vector-document.js';
import { embedDocuments, type EmbeddingClient } from './openrouter-embeddings.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';

export class InvalidPokemonDatasetError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidPokemonDatasetError';
  }
}

export class PopulationConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PopulationConfigurationError';
  }
}

export interface PopulateDependencies {
  embeddings: EmbeddingClient;
  store: PokemonVectorStore;
}

export interface PopulationResult {
  collectionName: string;
  recordCount: number;
  collectionExisted: boolean;
}

export function toEmbeddingDocument(pokemon: PokemonRecord): PokemonEmbeddingDocument {
  const typeFacts = pokemon.typeDetails.flatMap((type) => {
    const current: Array<[string, typeof type.damageRelations.doubleDamageTo]> = [
      ['strong against', type.damageRelations.doubleDamageTo],
      ['resisted by', type.damageRelations.halfDamageTo],
      ['no effect against', type.damageRelations.noDamageTo],
      ['weak to', type.damageRelations.doubleDamageFrom],
      ['resistant to', type.damageRelations.halfDamageFrom],
      ['immune to', type.damageRelations.noDamageFrom],
    ] as const;
    const lines = current.filter(([, targets]) => targets.length > 0)
      .map(([meaning, targets]) => `Type ${type.name} is ${meaning}: ${targets.map(({ name }) => name).join(', ')}.`);
    const historical = type.pastDamageRelations.flatMap(({ generation, damageRelations }) => {
      const relations: Array<[string, typeof damageRelations.doubleDamageTo]> = [
      ['strong against', damageRelations.doubleDamageTo],
      ['resisted by', damageRelations.halfDamageTo],
      ['no effect against', damageRelations.noDamageTo],
      ['weak to', damageRelations.doubleDamageFrom],
      ['resistant to', damageRelations.halfDamageFrom],
      ['immune to', damageRelations.noDamageFrom],
      ];
      return relations.filter(([, targets]) => targets.length > 0).map(([meaning, targets]) =>
        `In ${generation.name}, type ${type.name} was ${meaning}: ${targets.map(({ name }) => name).join(', ')}.`);
    });
    return [...lines, ...historical];
  });
  const text = [
    `Name: ${pokemon.name}`,
    `Types: ${pokemon.types.join(', ')}`,
    `Base stats: HP ${pokemon.stats.hp}, Attack ${pokemon.stats.attack}, Defense ${pokemon.stats.defense}, Special Attack ${pokemon.stats.specialAttack}, Special Defense ${pokemon.stats.specialDefense}, Speed ${pokemon.stats.speed}`,
    `Total base stats: ${pokemon.total}`,
    `Biology: ${pokemon.description}`,
    ...typeFacts,
  ].join('\n');

  return PokemonEmbeddingDocumentSchema.parse({
    id: String(pokemon.id).padStart(3, '0'),
    text,
    metadata: pokemon,
  });
}

export async function populateVectorDatabase(
  rawDataset: unknown,
  rawConfig: unknown,
  dependencies: PopulateDependencies,
): Promise<PopulationResult> {
  let dataset: PokemonRecord[];
  try {
    dataset = PokemonDatasetSchema.parse(rawDataset);
  } catch (error) {
    throw new InvalidPokemonDatasetError('Source Pokemon JSON is invalid; expected the complete original 151 records', { cause: error });
  }

  let config: PopulationConfig;
  try {
    config = PopulationConfigSchema.parse(rawConfig);
  } catch (error) {
    throw new PopulationConfigurationError('Population configuration is invalid or the collection name is protected', { cause: error });
  }

  const documents = dataset.map(toEmbeddingDocument);
  const vectors = await embedDocuments(dependencies.embeddings, documents.map(({ text }) => text));
  const rows: PokemonVectorRow[] = documents.map((document, index) => {
    const pokemon = document.metadata;
    const vector = vectors[index];
    if (!vector) throw new Error(`Missing embedding for Pokemon ${pokemon.id}`);
    return {
      id: pokemon.id,
      text: document.text,
      vector,
      name: pokemon.name,
      types: pokemon.types,
      typeDetails: JSON.stringify(pokemon.typeDetails),
      ...pokemon.stats,
      total: pokemon.total,
      description: pokemon.description,
      pokemonUrl: pokemon.pokemonUrl,
      speciesUrl: pokemon.speciesUrl,
      descriptionSourceUrl: pokemon.descriptionSourceUrl,
      descriptionAttribution: pokemon.descriptionAttribution,
      descriptionLicense: pokemon.descriptionLicense,
      descriptionLicenseUrl: pokemon.descriptionLicenseUrl,
      imageSourceUrl: pokemon.imageSourceUrl,
      imagePath: pokemon.imagePath,
    };
  });

  const state = await dependencies.store.replaceCollection(config.collectionName, rows);
  return { collectionName: config.collectionName, recordCount: rows.length, collectionExisted: state.collectionExisted };
}
