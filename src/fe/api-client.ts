import { AskQuestionSchema, AskResultSchema, type AskResult } from '../domain/ask.js';
import { AskStreamEventSchema, type AskStreamEvent } from '../domain/ask-stream.js';
import { PublicUserSchema, type PublicUser } from '../domain/user.js';
import { ConversationDetailSchema, ConversationPageSchema, type ConversationDetail, type ConversationPage } from '../domain/conversation.js';

export type AskResponse = Pick<Response, 'ok' | 'status' | 'json'>;
export type AskFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<AskResponse>;
export type AskStreamFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type LoginFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<AskResponse>;

export class UserLoginApiError extends Error {
  constructor(readonly status?: number, options?: ErrorOptions) {
    super('The user identity request failed.', options);
    this.name = new.target.name;
  }
}

export async function loginUser(nameInput: unknown, fetcher: LoginFetcher = fetch): Promise<PublicUser> {
  if (typeof nameInput !== 'string') throw new UserLoginApiError();
  let response: AskResponse;
  try {
    response = await fetcher('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameInput }),
    });
  } catch (error) { throw new UserLoginApiError(undefined, { cause: error }); }
  if (!response.ok) throw new UserLoginApiError(response.status);
  try {
    const parsed = PublicUserSchema.safeParse(await response.json());
    if (!parsed.success) throw new UserLoginApiError(response.status, { cause: parsed.error });
    return parsed.data;
  } catch (error) {
    if (error instanceof UserLoginApiError) throw error;
    throw new UserLoginApiError(response.status, { cause: error });
  }
}

export interface AskConversationContext {
  userId: string;
  conversationId: string;
}

export interface AskStreamOptions extends AskConversationContext {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onReplace?: (text: string, reason: 'fallback' | 'revision' | 'retry') => void;
  onRetry?: (attempt: number, maxRetries: number) => void;
  fetcher?: AskStreamFetcher;
  delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  maxRetries?: number;
}

class StreamTransportError extends Error {}
class StreamEventError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

export class AskApiError extends Error {
  constructor(readonly status?: number, options?: ErrorOptions) {
    super('The Pokémon question request failed.', options);
    this.name = new.target.name;
  }
}

export async function askPokemon(questionInput: unknown, context: AskConversationContext, fetcher: AskFetcher = fetch): Promise<AskResult> {
  const question = AskQuestionSchema.parse(questionInput);
  let response: AskResponse;
  try {
    response = await fetcher('/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, ...context }),
    });
  } catch (error) {
    throw new AskApiError(undefined, { cause: error });
  }

  if (!response.ok) throw new AskApiError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AskApiError(response.status, { cause: error });
  }

  const parsed = AskResultSchema.safeParse(payload);
  if (!parsed.success) throw new AskApiError(response.status, { cause: parsed.error });
  return parsed.data;
}

export async function listConversations(userId: string, options: { limit?: number; cursor?: string } = {}, fetcher: AskFetcher = fetch): Promise<ConversationPage> {
  const url = new URL(`/users/${encodeURIComponent(userId)}/conversations`, globalThis.location?.origin ?? 'http://localhost');
  if (options.limit !== undefined) url.searchParams.set('limit', String(options.limit));
  if (options.cursor) url.searchParams.set('cursor', options.cursor);
  const response = await requestJson(fetcher, url.pathname + url.search, { method: 'GET' });
  const parsed = ConversationPageSchema.safeParse(response);
  if (!parsed.success) throw new AskApiError(undefined, { cause: parsed.error });
  return parsed.data;
}

export async function getConversation(userId: string, conversationId: string, fetcher: AskFetcher = fetch): Promise<ConversationDetail> {
  const response = await requestJson(fetcher, `/users/${encodeURIComponent(userId)}/conversations/${encodeURIComponent(conversationId)}`, { method: 'GET' });
  const parsed = ConversationDetailSchema.safeParse(response);
  if (!parsed.success) throw new AskApiError(undefined, { cause: parsed.error });
  return parsed.data;
}

export async function deleteConversation(userId: string, conversationId: string, fetcher: AskFetcher = fetch): Promise<void> {
  await requestJson(fetcher, `/users/${encodeURIComponent(userId)}/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}

export async function clearConversations(userId: string, fetcher: AskFetcher = fetch): Promise<void> {
  await requestJson(fetcher, `/users/${encodeURIComponent(userId)}/conversations`, { method: 'DELETE' });
}

async function requestJson(fetcher: AskFetcher, url: string, init: RequestInit): Promise<unknown> {
  let response: AskResponse;
  try { response = await fetcher(url, init); }
  catch (error) { throw new AskApiError(undefined, { cause: error }); }
  if (!response.ok) throw new AskApiError(response.status);
  try { return await response.json(); }
  catch (error) { throw new AskApiError(response.status, { cause: error }); }
}

export async function askPokemonStream(questionInput: unknown, options: AskStreamOptions): Promise<AskResult> {
  const question = AskQuestionSchema.parse(questionInput);
  const maxRetries = options.maxRetries ?? 3;
  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) throw abortError(options.signal);
    try {
      return await readStreamAttempt(question, options);
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) throw error;
      const retryable = isRetryableStreamFailure(error);
      if (!retryable || attempt >= maxRetries) throw error instanceof AskApiError ? error : new AskApiError(undefined, { cause: error });
      options.onReplace?.('', 'retry');
      options.onRetry?.(attempt + 1, maxRetries);
      const backoff = [250, 500, 1000][Math.min(attempt, 2)]!;
      await (options.delay ?? delay)(backoff, options.signal);
    }
  }
}

async function readStreamAttempt(question: string, options: AskStreamOptions): Promise<AskResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)('/ask/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, userId: options.userId, conversationId: options.conversationId }),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    throw new StreamTransportError('Stream request failed.', { cause: error });
  }
  if (!response.ok) {
    const error = new AskApiError(response.status);
    if (response.status === 429 || response.status >= 500) throw new StreamTransportError(error.message, { cause: error });
    throw error;
  }
  if (!response.body) throw new StreamTransportError('Stream response has no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: AskResult | undefined;
  const consumeFrames = () => {
    const separator = /\r?\n\r?\n/;
    for (;;) {
      const match = separator.exec(buffer);
      if (!match) return;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data: string[] = [];
      let eventType = '';
      for (const line of frame.replaceAll('\r', '').split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length > 0) consumeEvent(eventType, data.join('\n'));
    }
  };
  const consumeEvent = (eventType: string, rawData: string) => {
    let payload: unknown;
    try { payload = JSON.parse(rawData) as unknown; } catch (error) { throw new StreamTransportError('Invalid stream event JSON.', { cause: error }); }
    const parsed = AskStreamEventSchema.safeParse(payload);
    if (!parsed.success || parsed.data.type !== eventType) throw new StreamTransportError('Invalid stream event.');
    const event: AskStreamEvent = parsed.data;
    if (event.type === 'delta') options.onDelta?.(event.text);
    else if (event.type === 'replace') options.onReplace?.(event.text, event.reason);
    else if (event.type === 'error') throw new StreamEventError(event.error, event.retryable);
    else completed = AskResultSchema.parse(event.result);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeFrames();
      if (completed) return completed;
    }
    buffer += decoder.decode();
    consumeFrames();
    if (completed) return completed;
    throw new StreamTransportError('Stream ended before completion.');
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function isRetryableStreamFailure(error: unknown): boolean {
  if (error instanceof StreamEventError) return error.retryable;
  if (error instanceof AskApiError) return error.status === 429 || (error.status !== undefined && error.status >= 500);
  return error instanceof StreamTransportError;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The request was aborted.', 'AbortError');
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError(signal)); return; }
    const timer = setTimeout(() => { cleanup(); resolve(); }, milliseconds);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(abortError(signal!)); };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
