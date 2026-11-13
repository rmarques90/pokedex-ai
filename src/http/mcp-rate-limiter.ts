export const MCP_RATE_LIMIT = 30;
export const MCP_RATE_WINDOW_MS = 60_000;
export const MCP_RATE_MAX_PEERS = 10_000;

export interface McpRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface McpRateLimiter {
  consume(peer: string): McpRateLimitResult;
  close(): void;
}

interface WindowState {
  startedAt: number;
  count: number;
}

export interface McpRateLimiterOptions {
  now?: () => number;
  limit?: number;
  windowMs?: number;
  maxPeers?: number;
  cleanupIntervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export function createMcpRateLimiter(options: McpRateLimiterOptions = {}): McpRateLimiter {
  const now = options.now ?? Date.now;
  const limit = options.limit ?? MCP_RATE_LIMIT;
  const windowMs = options.windowMs ?? MCP_RATE_WINDOW_MS;
  const maxPeers = options.maxPeers ?? MCP_RATE_MAX_PEERS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const windows = new Map<string, WindowState>();
  const cleanup = setIntervalFn(() => pruneExpired(now()), options.cleanupIntervalMs ?? windowMs);
  cleanup.unref?.();

  return {
    consume(peer) {
      const current = now();
      pruneExpired(current);
      const state = windows.get(peer);
      if (state) {
        if (current >= state.startedAt + windowMs) {
          state.startedAt = current;
          state.count = 0;
        }
        if (state.count >= limit) {
          return { allowed: false, retryAfterSeconds: retryAfter(state.startedAt + windowMs, current) };
        }
        state.count += 1;
        return { allowed: true };
      }

      if (windows.size >= maxPeers) {
        const nextExpiry = Math.min(...Array.from(windows.values(), (entry) => entry.startedAt + windowMs));
        return { allowed: false, retryAfterSeconds: retryAfter(nextExpiry, current) };
      }
      windows.set(peer, { startedAt: current, count: 1 });
      return { allowed: true };
    },
    close() {
      clearIntervalFn(cleanup);
      windows.clear();
    },
  };

  function pruneExpired(current: number): void {
    for (const [peer, state] of windows) {
      if (current >= state.startedAt + windowMs) windows.delete(peer);
    }
  }
}

function retryAfter(deadline: number, now: number): number {
  return Math.max(1, Math.ceil((deadline - now) / 1000));
}
