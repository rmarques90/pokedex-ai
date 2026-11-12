import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AskRequestSchema, ModelGenerationError, PromptGuardrailError, RetrievalError, type AskResult } from '../domain/ask.js';
import { AskStreamEventSchema, type AskStreamUpdate } from '../domain/ask-stream.js';
import { isRetryableOpenRouterFailure } from '../service/openrouter-diagnostics.js';

const MAX_REQUEST_BYTES = 1024 * 1024;

export const DEFAULT_FRONTEND_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
] as const;

export interface AskHttpServerOptions {
  allowedOrigins?: readonly string[];
  login?: UserLoginHandler;
}

class ClientRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ClientRequestError';
  }
}

export type AskHandler = (question: string) => Promise<AskResult>;
export type AskStreamHandler = (question: string, signal: AbortSignal, emit: (update: AskStreamUpdate) => void) => Promise<AskResult>;
export type UserLoginHandler = (input: unknown) => unknown | Promise<unknown>;

export function createAskHttpServer(ask: AskHandler, options: AskHttpServerOptions = {}, askStream?: AskStreamHandler): Server {
  const allowedOrigins = new Set((options.allowedOrigins ?? DEFAULT_FRONTEND_ORIGINS).map(normalizeConfiguredOrigin));
  return createServer((request, response) => {
    void handleRequest(request, response, ask, allowedOrigins, askStream, options.login);
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
): Promise<void> {
  const requestOrigin = request.headers.origin;
  if (requestOrigin !== undefined && !allowedOrigins.has(normalizeRequestOrigin(requestOrigin))) {
    sendJson(response, 403, { error: 'Request origin is not allowed.' });
    return;
  }

  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
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

  const parsed = AskRequestSchema.safeParse(payload);
  if (!parsed.success) {
    sendJson(response, 400, { error: 'Request must contain a non-empty question string.' });
    return;
  }

  if (streamRoute) {
    if (!askStream) {
      sendJson(response, 404, { error: 'Route not found.' });
      return;
    }
    await handleStreamRequest(request, response, askStream, parsed.data.question);
    return;
  }

  try {
    const result = await ask(parsed.data.question);
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof PromptGuardrailError) {
      sendJson(response, 400, { error: error.message });
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
    const result = await askStream(question, controller.signal, (update) => writeEvent(update));
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
