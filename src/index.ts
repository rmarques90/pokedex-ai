import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createAskService, loadLocalEnvironment, type AskService } from './config/ask-runtime.js';
import { AskDomainError } from './domain/ask.js';
import { listenAskHttpServer } from './http/server.js';

export interface ApiServerOptions {
  service?: AskService;
  environment?: NodeJS.ProcessEnv;
  port?: number;
  host?: string;
}

export async function startApiServer(options: ApiServerOptions = {}): Promise<Server> {
  const service = options.service ?? await createAskService({ environment: options.environment ?? process.env });
  return listenAskHttpServer(service.ask, options.port ?? 3000, options.host ?? '127.0.0.1');
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
