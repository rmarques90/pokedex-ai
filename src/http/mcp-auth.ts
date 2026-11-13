import { createHash, timingSafeEqual } from 'node:crypto';

export const MCP_TOKEN_ENV = 'MCP_AUTH_TOKEN';

export interface McpRuntimeConfig {
  enabled: boolean;
  token?: string;
}

export class McpConfigurationError extends Error {
  constructor() {
    super('MCP configuration is invalid. Set MCP_ENABLED to true or false and configure MCP_AUTH_TOKEN when enabled.');
    this.name = 'McpConfigurationError';
  }
}

export function readMcpRuntimeConfig(environment: NodeJS.ProcessEnv): McpRuntimeConfig {
  const enabledValue = environment.MCP_ENABLED ?? 'false';
  if (enabledValue !== 'true' && enabledValue !== 'false') throw new McpConfigurationError();
  if (enabledValue === 'false') return { enabled: false };

  const token = environment[MCP_TOKEN_ENV]?.trim();
  if (!token || Buffer.byteLength(token, 'utf8') < 32) throw new McpConfigurationError();
  return { enabled: true, token };
}

export function createMcpBearerAuthenticator(expectedToken: string): (authorization: string | undefined) => boolean {
  const expectedDigest = createHash('sha256').update(expectedToken, 'utf8').digest();
  return (authorization) => {
    if (!authorization || authorization.length > 4096) return false;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) return false;
    const presentedDigest = createHash('sha256').update(match[1], 'utf8').digest();
    return timingSafeEqual(expectedDigest, presentedDigest);
  };
}
