import {
  AskRuntimeConfigSchema,
  AskRuntimeConfigurationError,
  type AskResult,
} from '../domain/ask.js';
import { createOpenRouterAnswerGenerator, type PokemonAnswerGenerator } from '../service/openrouter-chat-model.js';
import { answerQuestion, type AnswerQuestionDependencies } from '../service/answer-question.js';
import {
  createOpenRouterEmbeddings,
  type EmbeddingClient,
  type QueryEmbeddingClient,
} from '../service/openrouter-embeddings.js';
import { createPromptInjectionGuardrail, type PromptInjectionGuardrail } from '../service/prompt-injection-guardrail.js';
import { connectLocalVectorStore, type LocalVectorStoreHandle } from '../store/local-lancedb.js';

export interface AskServiceRuntimeOptions {
  environment: NodeJS.ProcessEnv;
  connectStore?: () => Promise<LocalVectorStoreHandle>;
  createEmbeddings?: (apiKey: string) => EmbeddingClient & QueryEmbeddingClient;
  createGenerator?: (apiKey: string) => PokemonAnswerGenerator;
  createGuardrail?: () => PromptInjectionGuardrail;
}

export interface AskService {
  ask(question: unknown): Promise<AskResult>;
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
  const guardrail = (options.createGuardrail ?? createPromptInjectionGuardrail)();
  const dependencies: AnswerQuestionDependencies = {
    collectionName: config.collectionName,
    store,
    embeddings,
    generator,
    guardrail,
  };
  return { ask: (question) => answerQuestion(question, dependencies) };
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
