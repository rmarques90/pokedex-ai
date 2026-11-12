import { PromptGuardrailError, RetrievalError } from '../domain/ask.js';

export const OPENROUTER_FAILURE_STAGES = [
  'prompt_safety',
  'query_embedding',
  'answer_generation',
  'answer_stream',
] as const;

export type OpenRouterFailureStage = (typeof OPENROUTER_FAILURE_STAGES)[number];

export interface OpenRouterFailureDiagnostic {
  event: 'openrouter.failure';
  stage: OpenRouterFailureStage;
  model: string;
  elapsedMs: number;
  retryable: boolean;
  status?: number;
  code?: string;
}

export type OpenRouterDiagnosticLogger = (event: OpenRouterFailureDiagnostic) => void;

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 522, 524, 529]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

interface SafeProviderDetails {
  status?: number;
  code?: string;
}

export function getSafeProviderDetails(error: unknown): SafeProviderDetails {
  const seen = new Set<object>();
  let current: unknown = error;
  let status: number | undefined;
  let code: string | undefined;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { status?: unknown; statusCode?: unknown; code?: unknown; cause?: unknown };
    status ??= [candidate.status, candidate.statusCode].find(
      (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599,
    );
    if (typeof candidate.code === 'string' && isSafeCode(candidate.code)) code ??= candidate.code;
    current = candidate.cause;
  }

  return { ...(status === undefined ? {} : { status }), ...(code === undefined ? {} : { code }) };
}

export function isRetryableOpenRouterFailure(error: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  let transientStatus = false;
  let transientCode = false;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof PromptGuardrailError || current instanceof RetrievalError) return false;

    const candidate = current as { name?: unknown; status?: unknown; statusCode?: unknown; code?: unknown; cause?: unknown };
    if (candidate.name === 'AbortError' || candidate.name === 'ZodError') return false;
    const status = [candidate.status, candidate.statusCode].find(
      (value): value is number => typeof value === 'number' && Number.isInteger(value),
    );
    if (status !== undefined && TRANSIENT_HTTP_STATUSES.has(status)) transientStatus = true;
    if (typeof candidate.code === 'string' && TRANSIENT_NETWORK_CODES.has(candidate.code.toUpperCase())) transientCode = true;
    current = candidate.cause;
  }

  return transientStatus || transientCode;
}

export async function withOpenRouterDiagnostics<T>(options: {
  stage: OpenRouterFailureStage;
  model: string;
  logger?: OpenRouterDiagnosticLogger;
  isCancellation?: () => boolean;
  operation: () => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  try {
    return await options.operation();
  } catch (error) {
    if (!(error instanceof PromptGuardrailError) && !isCancellationError(error) && !options.isCancellation?.()) {
      const details = getSafeProviderDetails(error);
      const event: OpenRouterFailureDiagnostic = {
        event: 'openrouter.failure',
        stage: options.stage,
        model: options.model,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        retryable: isRetryableOpenRouterFailure(error),
        ...details,
      };
      try { options.logger?.(event); } catch { /* Diagnostics must never replace the provider error. */ }
    }
    throw error;
  }
}

function isCancellationError(error: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { name?: unknown; cause?: unknown };
    if (candidate.name === 'AbortError') return true;
    current = candidate.cause;
  }
  return false;
}

export function logOpenRouterFailure(event: OpenRouterFailureDiagnostic): void {
  console.warn(JSON.stringify(event));
}

function isSafeCode(code: string): boolean {
  return code.length <= 40
    && /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)+$/i.test(code)
    && !/^(?:sk|token|secret|bearer)(?:[_-]|$)/i.test(code);
}
