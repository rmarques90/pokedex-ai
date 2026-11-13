import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createAskService, loadLocalEnvironment, type AskService } from './config/ask-runtime.js';
import { AskDomainError } from './domain/ask.js';
import { DEFAULT_FRONTEND_ORIGINS, listenAskHttpServer } from './http/server.js';
import { SqliteUserStore, type ConversationStore, type UserStore } from './store/sqlite-user-store.js';
import { createUserIdentityService } from './service/user-identity.js';
import { buildMemoryContext, createConversationService } from './service/conversation-service.js';
import { createMemoryExtractionWorker } from './service/memory-extraction-worker.js';
import { readMcpRuntimeConfig } from './http/mcp-auth.js';
import { createMcpHttpEndpoint, type McpHttpEndpoint } from './http/mcp-server.js';

export interface ApiServerOptions {
  service?: AskService;
  environment?: NodeJS.ProcessEnv;
  port?: number;
  host?: string;
  allowedOrigins?: readonly string[];
  userStore?: UserStore;
  createUserStore?: () => UserStore;
  conversationStore?: ConversationStore;
}

export async function startApiServer(options: ApiServerOptions = {}): Promise<Server> {
  const environment = options.environment ?? process.env;
  const mcpConfig = readMcpRuntimeConfig(environment);
  const service = options.service ?? await createAskService({ environment });
  const userStore = options.userStore ?? (options.createUserStore ?? (() => new SqliteUserStore()))();
  const identityService = createUserIdentityService(userStore);
  const conversationStore = options.conversationStore ?? (isConversationStore(userStore) ? userStore : undefined);
  const conversationService = conversationStore ? createConversationService(conversationStore) : undefined;
  const worker = conversationStore && service.memoryExtractor
    ? createMemoryExtractionWorker({ store: conversationStore, extractor: service.memoryExtractor, onError: () => undefined })
    : undefined;
  let mcpEndpoint: McpHttpEndpoint | undefined;
  try {
    if (mcpConfig.enabled) mcpEndpoint = createMcpHttpEndpoint(service, mcpConfig.token!);
    const ask = async (question: string, context: { userId: string; conversationId: string }) => {
      if (!conversationStore || !conversationService) throw new Error('Conversation persistence is unavailable.');
      conversationService.validateAsk(context);
      const memoryContext = buildMemoryContext(conversationService.memories(context, question), question);
      const result = await service.ask(question, memoryContext);
      conversationService.recordCompleted({ ...context, question, result });
      return result;
    };
    const askStream = service.askStream ? async (
      question: string,
      signal: AbortSignal,
      emit: Parameters<NonNullable<typeof service.askStream>>[2],
      context: { userId: string; conversationId: string },
    ) => {
      if (!conversationStore || !conversationService) throw new Error('Conversation persistence is unavailable.');
      conversationService.validateAsk(context);
      const memoryContext = buildMemoryContext(conversationService.memories(context, question), question);
      const result = await service.askStream!(question, signal, emit, memoryContext);
      if (signal.aborted) throw signal.reason;
      conversationService.recordCompleted({ ...context, question, result });
      return result;
    } : undefined;
    const server = await listenAskHttpServer(ask, options.port ?? 3000, options.host ?? '127.0.0.1', {
      allowedOrigins: options.allowedOrigins ?? DEFAULT_FRONTEND_ORIGINS,
      login: (input) => identityService.login(input),
      conversations: conversationService,
      mcp: mcpEndpoint,
    }, askStream);
    worker?.start();
    server.once('close', () => {
      void (async () => {
        try {
          await worker?.stop();
        } finally {
          try {
            await mcpEndpoint?.close();
          } finally {
            userStore.close();
          }
        }
      })();
    });
    return server;
  } catch (error) {
    await mcpEndpoint?.close();
    userStore.close();
    throw error;
  }
}

function isConversationStore(store: UserStore): store is UserStore & ConversationStore {
  return 'appendCompletedInteraction' in store
    && 'validateConversationAccess' in store
    && 'listConversations' in store
    && 'claimMemoryExtractionJob' in store;
}

async function main(): Promise<void> {
  try {
    loadLocalEnvironment();
    await startApiServer();
    console.log('Pokédex AI API listening on http://localhost:3000');
  } catch (error) {
    console.error(error instanceof AskDomainError ? error.message : 'Could not start the Pokémon question server.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
