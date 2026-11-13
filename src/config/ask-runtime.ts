import {
  AskRuntimeConfigSchema,
  AskRuntimeConfigurationError,
  type AskResult,
  type RetrievedEvidence,
} from '../domain/ask.js';
import { createOpenRouterAnswerGenerator, type PokemonAnswerGenerator } from '../service/openrouter-chat-model.js';
import { answerQuestion, lookupPokemonEvidence, searchPokemonEvidence, type AnswerQuestionDependencies } from '../service/answer-question.js';
import { streamAnswerQuestion } from '../service/answer-question.js';
import type { AskStreamUpdate } from '../domain/ask-stream.js';
import { createOpenRouterPromptSafetyClassifier, type PromptSafetyClassifier } from '../service/openrouter-prompt-safety.js';
import {
  createOpenRouterEmbeddings,
  type EmbeddingClient,
  type QueryEmbeddingClient,
} from '../service/openrouter-embeddings.js';
import { createPromptInjectionGuardrail, type PromptInjectionGuardrail } from '../service/prompt-injection-guardrail.js';
import { connectLocalVectorStore, type LocalVectorStoreHandle } from '../store/local-lancedb.js';
import { logOpenRouterFailure, type OpenRouterDiagnosticLogger } from '../service/openrouter-diagnostics.js';
import { createOpenRouterMemoryExtractor } from '../service/openrouter-memory-extractor.js';
import type { ConversationMemoryExtractor } from '../service/memory-extraction-worker.js';

export interface AskServiceRuntimeOptions {
  environment: NodeJS.ProcessEnv;
  connectStore?: () => Promise<LocalVectorStoreHandle>;
  createEmbeddings?: (apiKey: string) => EmbeddingClient & QueryEmbeddingClient;
  createGenerator?: (apiKey: string) => PokemonAnswerGenerator;
  createGuardrail?: (apiKey: string) => PromptInjectionGuardrail;
  createPromptSafetyClassifier?: (apiKey: string) => PromptSafetyClassifier;
  createMemoryExtractor?: (apiKey: string) => ConversationMemoryExtractor;
  diagnosticLogger?: OpenRouterDiagnosticLogger;
}

export interface AskService {
  ask(question: unknown, memoryContext?: string): Promise<AskResult>;
  askStream?(question: unknown, signal: AbortSignal, emit: (update: AskStreamUpdate) => void, memoryContext?: string): Promise<AskResult>;
  lookupPokemon?(criteria: unknown): Promise<RetrievedEvidence[]>;
  searchPokemon?(input: unknown): Promise<RetrievedEvidence[]>;
  memoryExtractor?: ConversationMemoryExtractor;
}

export function readAskRuntimeConfig(environment: NodeJS.ProcessEnv) {
  const result = AskRuntimeConfigSchema.safeParse({
    collectionName: environment.LANCEDB_COLLECTION_NAME,
    openRouterApiKey: environment.OPENROUTER_API_KEY,
  });
  if (!result.success) throw new AskRuntimeConfigurationError();
  return result.data;
}

export async function createAskService(options: AskServiceRuntimeOptions): Promise<AskService> {
  const config = readAskRuntimeConfig(options.environment);
  const { store } = await (options.connectStore ?? connectLocalVectorStore)();
  const embeddings = (options.createEmbeddings ?? createOpenRouterEmbeddings)(config.openRouterApiKey);
  const generator = (options.createGenerator ?? createOpenRouterAnswerGenerator)(config.openRouterApiKey);
  const memoryExtractor = (options.createMemoryExtractor ?? createOpenRouterMemoryExtractor)(config.openRouterApiKey);
  const guardrail = (options.createGuardrail ?? ((apiKey) => createPromptInjectionGuardrail(
    (options.createPromptSafetyClassifier ?? createOpenRouterPromptSafetyClassifier)(apiKey),
  )))(config.openRouterApiKey);
  const dependencies: AnswerQuestionDependencies = {
    collectionName: config.collectionName,
    store,
    embeddings,
    generator,
    guardrail,
    diagnosticLogger: options.diagnosticLogger ?? logOpenRouterFailure,
  };
  return {
    ask: (question, memoryContext) => answerQuestion(question, dependencies, { memoryContext }),
    askStream: (question, signal, emit, memoryContext) => streamAnswerQuestion(question, dependencies, signal, emit, { memoryContext }),
    lookupPokemon: (criteria) => lookupPokemonEvidence(criteria, dependencies),
    searchPokemon: (input) => searchPokemonEvidence(input, dependencies),
    memoryExtractor,
  };
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
