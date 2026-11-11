import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { createAskService, loadLocalEnvironment, type AskService } from './config/ask-runtime.js';
import { AskDomainError, AskQuestionSchema, type AskResult } from './domain/ask.js';

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
  if (error instanceof ZodError) return 'The question or result was invalid.';
  if (error instanceof AskDomainError) return error.message;
  return 'The ask command failed. Check local configuration and try again.';
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
