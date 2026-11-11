import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AskRequestSchema, PromptGuardrailError, type AskResult } from '../domain/ask.js';

const MAX_REQUEST_BYTES = 1024 * 1024;

class ClientRequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ClientRequestError';
  }
}

export type AskHandler = (question: string) => Promise<AskResult>;

export function createAskHttpServer(ask: AskHandler): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, ask);
  });
}

export function listenAskHttpServer(ask: AskHandler, port = 3000, host = '127.0.0.1'): Promise<Server> {
  const server = createAskHttpServer(ask);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, ask: AskHandler): Promise<void> {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  if (request.method !== 'POST' || pathname !== '/ask') {
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
