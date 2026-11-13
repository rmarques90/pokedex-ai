import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ModelGenerationError, PromptGuardrailError, RetrievalError, type AskResult } from '../domain/ask.js';
import { AskStreamEventSchema, type AskStreamUpdate } from '../domain/ask-stream.js';
import { ConversationAskRequestSchema, ConversationListQuerySchema, ConversationUserIdSchema, type ConversationAskContext, type ConversationDetail, type ConversationPage } from '../domain/conversation.js';
import { isRetryableOpenRouterFailure } from '../service/openrouter-diagnostics.js';
import type { McpHttpEndpoint } from './mcp-server.js';

const MAX_REQUEST_BYTES = 1024 * 1024;

export const DEFAULT_FRONTEND_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
] as const;

export interface AskHttpServerOptions {
  allowedOrigins?: readonly string[];
  login?: UserLoginHandler;
  conversations?: ConversationHttpService;
  mcp?: McpHttpEndpoint;
}

class ClientRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ClientRequestError';
  }
}

export interface ConversationHttpService {
  list(userId: string, query: unknown): ConversationPage;
  get(userId: string, conversationId: string): ConversationDetail;
  delete(userId: string, conversationId: string): void;
  clear(userId: string): void;
}
export type AskHandler = (question: string, context: ConversationAskContext) => Promise<AskResult>;
export type AskStreamHandler = (question: string, signal: AbortSignal, emit: (update: AskStreamUpdate) => void, context: ConversationAskContext) => Promise<AskResult>;
export type UserLoginHandler = (input: unknown) => unknown | Promise<unknown>;

export function createAskHttpServer(ask: AskHandler, options: AskHttpServerOptions = {}, askStream?: AskStreamHandler): Server {
  const allowedOrigins = new Set((options.allowedOrigins ?? DEFAULT_FRONTEND_ORIGINS).map(normalizeConfiguredOrigin));
  return createServer((request, response) => {
    void handleRequest(request, response, ask, allowedOrigins, askStream, options.login, options.conversations, options.mcp);
  });
}

export function listenAskHttpServer(
  ask: AskHandler,
  port = 3000,
  host = '127.0.0.1',
  options: AskHttpServerOptions = {},
  askStream?: AskStreamHandler,
): Promise<Server> {
  const server = createAskHttpServer(ask, options, askStream);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  ask: AskHandler,
  allowedOrigins: ReadonlySet<string>,
  askStream?: AskStreamHandler,
  login?: UserLoginHandler,
  conversations?: ConversationHttpService,
  mcp?: McpHttpEndpoint,
): Promise<void> {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  if (pathname === '/mcp') {
    if (!mcp) {
      sendJson(response, 404, { error: 'Route not found.' });
      return;
    }
    await mcp.handle(request, response);
    return;
  }

  const requestOrigin = request.headers.origin;
  if (requestOrigin !== undefined && !allowedOrigins.has(normalizeRequestOrigin(requestOrigin))) {
    sendJson(response, 403, { error: 'Request origin is not allowed.' });
    return;
  }

  if (pathname.startsWith('/users/')) {
    await handleConversationRoute(request, response, pathname, conversations);
    return;
  }
  if (pathname === '/auth/login') {
    if (request.method !== 'POST' || !login) {
      sendJson(response, 404, { error: 'Route not found.' });
      return;
    }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { error: 'Content-Type must be application/json.' });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await readBody(request)) as unknown;
    } catch (error) {
      if (error instanceof ClientRequestError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      sendJson(response, 400, { error: 'Request body must contain valid JSON.' });
      return;
    }
    try {
      sendJson(response, 200, await login(payload));
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        sendJson(response, 400, { error: 'Request must contain a valid name between 1 and 50 characters.' });
        return;
      }
      sendJson(response, 500, { error: 'The user identity could not be selected due to a server error.' });
    }
    return;
  }
  const streamRoute = pathname === '/ask/stream';
  if (request.method !== 'POST' || (pathname !== '/ask' && !streamRoute)) {
    sendJson(response, 404, { error: 'Route not found.' });
    return;
  }

  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    sendJson(response, 415, { error: 'Content-Type must be application/json.' });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(request)) as unknown;
  } catch (error) {
    if (error instanceof ClientRequestError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    sendJson(response, 400, { error: 'Request body must contain valid JSON.' });
    return;
  }

  const parsed = ConversationAskRequestSchema.safeParse(payload);
  if (!parsed.success) {
    sendJson(response, 400, { error: 'Request must contain a non-empty question and valid user and conversation IDs.' });
    return;
  }

  if (streamRoute) {
    if (!askStream) {
      sendJson(response, 404, { error: 'Route not found.' });
      return;
    }
    await handleStreamRequest(request, response, askStream, parsed.data.question, { userId: parsed.data.userId, conversationId: parsed.data.conversationId });
    return;
  }

  try {
    const result = await ask(parsed.data.question, { userId: parsed.data.userId, conversationId: parsed.data.conversationId });
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof PromptGuardrailError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (error instanceof Error && (error.name === 'ConversationNotFoundError' || error.name === 'ConversationAccessError')) {
      sendJson(response, 404, { error: 'Conversation not found.' });
      return;
    }
    sendJson(response, 500, { error: 'The Pokémon question could not be answered due to a server error.' });
  }
}

async function handleStreamRequest(
  request: IncomingMessage,
  response: ServerResponse,
  askStream: AskStreamHandler,
  question: string,
  context: ConversationAskContext,
): Promise<void> {
  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!response.writableEnded) controller.abort(new Error('Client disconnected.'));
  };
  request.once('aborted', abortOnDisconnect);
  response.once('close', abortOnDisconnect);
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const writeEvent = (event: unknown) => {
    if (controller.signal.aborted || response.destroyed) return;
    const parsed = AskStreamEventSchema.parse(event);
    response.write(`event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`);
  };
  try {
    const result = await askStream(question, controller.signal, (update) => writeEvent(update), context);
    writeEvent({ type: 'complete', result });
    if (!response.destroyed) response.end();
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return;
    const retryable = isRetryableOpenRouterFailure(error);
    const safeMessage = error instanceof PromptGuardrailError
      ? error.message
      : error instanceof ModelGenerationError || error instanceof RetrievalError
        ? 'The answer could not be generated. Please try again.'
        : 'The Pokémon question could not be answered due to a server error.';
    writeEvent({ type: 'error', error: safeMessage, retryable });
    if (!response.destroyed) response.end();
  } finally {
    request.removeListener('aborted', abortOnDisconnect);
    response.removeListener('close', abortOnDisconnect);
  }
}

async function handleConversationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  conversations?: ConversationHttpService,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const parts = pathname.split('/').filter(Boolean);
  if (!conversations || parts.length < 3 || parts[0] !== 'users' || parts[2] !== 'conversations') {
    sendJson(response, 404, { error: 'Route not found.' });
    return;
  }
  const user = ConversationUserIdSchema.safeParse(parts[1]);
  if (!user.success) { sendJson(response, 400, { error: 'User ID must be a valid UUID.' }); return; }
  try {
    if (parts.length === 3 && request.method === 'GET') {
      const query = ConversationListQuerySchema.safeParse({
        ...(url.searchParams.has('limit') ? { limit: url.searchParams.get('limit') } : {}),
        ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
      });
      if (!query.success) { sendJson(response, 400, { error: 'Conversation pagination parameters are invalid.' }); return; }
      sendJson(response, 200, conversations.list(user.data, query.data));
      return;
    }
    if (parts.length === 3 && request.method === 'DELETE') {
      conversations.clear(user.data);
      sendJson(response, 200, { deleted: true });
      return;
    }
    if (parts.length === 4) {
      const conversationId = ConversationUserIdSchema.safeParse(parts[3]);
      if (!conversationId.success) { sendJson(response, 400, { error: 'Conversation ID must be a valid UUID.' }); return; }
      if (request.method === 'GET') { sendJson(response, 200, conversations.get(user.data, conversationId.data)); return; }
      if (request.method === 'DELETE') { conversations.delete(user.data, conversationId.data); sendJson(response, 200, { deleted: true }); return; }
    }
    sendJson(response, 404, { error: 'Route not found.' });
  } catch (error) {
    if (error instanceof Error && (error.name === 'ConversationAccessError' || error.name === 'ConversationNotFoundError')) {
      sendJson(response, 404, { error: 'Conversation not found.' });
      return;
    }
    sendJson(response, 500, { error: 'Conversation history could not be processed due to a server error.' });
  }
}

function normalizeConfiguredOrigin(origin: string): string {
  const normalized = parseOrigin(origin);
  if (!normalized) throw new Error('Configured frontend origins must be valid HTTP origins.');
  return normalized;
}

function normalizeRequestOrigin(origin: string): string {
  return parseOrigin(origin) ?? '';
}

function parseOrigin(origin: string): string | null {
  if (origin === 'null') return null;
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new ClientRequestError(413, 'Request body is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.headersSent) return;
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}
