import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAskService, loadLocalEnvironment, type AskService } from './config/ask-runtime.js';
import { AskQuestionSchema, type AskResult } from './domain/ask.js';

export interface CliIo {
  writeOutput(message: string): void;
  writeError(message: string): void;
}

export interface CliDependencies {
  ask(question: string): Promise<AskResult>;
}

const USAGE = 'Usage: npm run cli ask "<question>"';

export async function runCli(args: string[], dependencies: CliDependencies, io: CliIo = {
  writeOutput: console.log,
  writeError: console.error,
}): Promise<number> {
  const [command, ...questionParts] = args;
  if (command !== 'ask' || questionParts.length === 0) {
    io.writeError(USAGE);
    return 2;
  }

  const questionResult = AskQuestionSchema.safeParse(questionParts.join(' '));
  if (!questionResult.success) {
    io.writeError('Question must not be empty.');
    return 2;
  }

  try {
    const result = await dependencies.ask(questionResult.data);
    io.writeOutput(result.answer);
    if (result.sources.length > 0) {
      io.writeOutput(`Sources:\n${result.sources.map((source) => `- ${source.pokemonName}: ${source.url}`).join('\n')}`);
    }
    return 0;
  } catch (error) {
    io.writeError(toCliErrorMessage(error));
    return 1;
  }
}

export function toCliErrorMessage(error: unknown): string {
  const diagnostics: string[] = [];
  const seen = new Set<Error>();
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const category = current.name || current.constructor.name || 'Error';
    const stack = current.stack ?? `${category}: ${current.message}`;
    diagnostics.push([
      depth === 0 ? `Error category: ${category}` : `Caused by (${depth}): ${category}`,
      `Message: ${current.message || '(no message)'}`,
      `Stack trace:\n${stack}`,
    ].join('\n'));
    current = current.cause;
    depth += 1;
  }

  if (diagnostics.length === 0) {
    const message = typeof error === 'string' ? error : 'A non-Error value was thrown.';
    diagnostics.push(`Error category: ${typeof error}\nMessage: ${message}\nStack trace: unavailable`);
  } else if (current !== undefined) {
    const detail = typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean'
      ? String(current)
      : current instanceof Error && seen.has(current)
        ? 'cause cycle detected'
        : `non-Error cause (${typeof current})`;
    diagnostics.push(`Caused by: ${detail}`);
  }

  return redactDiagnosticSecrets(diagnostics.join('\n\n'));
}

export function redactDiagnosticSecrets(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-or-v1-|sk-proj-|sk-)\w[\w-]{12,}\b/gi, '[REDACTED_API_KEY]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(['"]?\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization|credential)\b['"]?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    .replace(/(\b(?:token|secret|credential))\s+[A-Za-z0-9._~+/-]{12,}\b/gi, '$1 [REDACTED]');
}

async function main(): Promise<void> {
  try {
    loadLocalEnvironment();
    let service: AskService | undefined;
    const exitCode = await runCli(process.argv.slice(2), {
      async ask(question) {
        service ??= await createAskService({ environment: process.env });
        return service.ask(question);
      },
    });
    process.exitCode = exitCode;
  } catch (error) {
    console.error(toCliErrorMessage(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
