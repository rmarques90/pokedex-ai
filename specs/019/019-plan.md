# 019 - Technical Plan

## 1. Architecture decisions

- Use the current official MCP TypeScript SDK v2 line: `@modelcontextprotocol/server` 2.4.0 and its `@modelcontextprotocol/node` adapter 2.1.2. The official v1 line is a maintenance branch; v2 is the current stable line. The Node adapter bridges `node:http` requests to the MCP handler without replacing the application's HTTP server. Pin exact versions in `package.json`/lockfile during implementation and use the SDK's documented compatibility surface. ([SDK v2 release](https://github.com/modelcontextprotocol/typescript-sdk/releases), [Node adapter](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/node/src/streamableHttp.ts))
- Use the SDK's stateless Streamable HTTP handler on `POST /mcp`, with the SDK's Node adapter. The endpoint is disabled unless `MCP_ENABLED=true`. Stateless per-request servers avoid in-memory protocol sessions and simplify shutdown and horizontal deployment. Authentication and rate limiting wrap every request to `/mcp`, including initialize, tool discovery, and tool calls. ([HTTP serving guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md))
- Reuse existing Zod 3.25+ installation via the SDK's documented `zod/v4` subpath where required by the SDK. Keep application domain schemas on existing Zod imports and adapt their validated values at the MCP boundary. Do not upgrade the project's Zod major version as part of this activity.
- The MCP endpoint shares the API host and port. It must not be covered by browser CORS rules; MCP client authentication is bearer-token based. Preserve existing route and origin behavior for all current browser/API routes.

## 2. Configuration and security policy

- Add `MCP_ENABLED=false` and `MCP_AUTH_TOKEN=` placeholders to `.env.example`. Do not read `.env` during planning or place real credentials in source, test fixtures, logs, or documentation.
- When disabled, do not construct an MCP handler, require a token, or expose `/mcp`; return the existing safe 404 response. When enabled, require a trimmed token of at least 32 characters and fail startup with a safe configuration error if absent or invalid.
- Compare tokens by hashing both configured and presented UTF-8 token bytes with SHA-256 and comparing the fixed-size digests using `timingSafeEqual`; require the exact `Bearer <token>` authorization scheme and reject empty/malformed headers. This avoids length-based comparison behavior while keeping raw tokens out of logs.
- Reject unauthenticated traffic with 401 and `WWW-Authenticate: Bearer` before it reaches the SDK or rate limiter. Rate-limit authenticated requests by `request.socket.remoteAddress`; ignore `Forwarded` and `X-Forwarded-For` because the current server has no trusted-proxy configuration.
- Use a fixed-window limiter: 30 requests per peer per 60 seconds, counting every authenticated HTTP request to `/mcp` including initialize, list, and tool requests. Return 429 with integer `Retry-After` seconds. Keep policy constants in one module rather than adding environment knobs for this POC.
- Bound limiter memory to 10,000 peer entries. Prune expired entries on incoming requests and with an unreferenced periodic cleanup timer. If capacity remains full after pruning, reject new peer addresses with 429 rather than evicting active counters. Clear the timer during server close. Keep the implementation injectable with a clock for deterministic tests.
- This is a shared credential and process-local limit. Document rotation by changing the environment value and restarting, and state that the controls do not provide individual client identity or a distributed quota.

## 3. Tool and service contracts

Expose exactly two read-only tools:

1. `lookup_pokemon`: strict discriminated input for `{ id }`, `{ name }`, or `{ type }`. Reuse `PokemonLookupSchema` and the existing `PokemonVectorStore.lookup`; cap results at 151 (the existing indexed National Dex range). Return `{ items: RetrievedEvidence[] }` with validated source URLs. Empty matches return an empty array.
2. `search_pokemon`: strict input `{ query, limit? }`, trimmed query length 1-500 characters, default limit 5 and maximum 10. Run the existing question guardrail, embed with the configured OpenRouter embeddings client, then call `searchByVector`; validate and guard returned evidence before returning `{ items: RetrievedEvidence[] }`.

Return MCP tool output as JSON text content for broad MCP client compatibility, and supply the equivalent validated structured content if supported by the selected SDK output contract. Never include LanceDB row internals or vector values.

Extend `AskService` with `lookupPokemon(input)` and `searchPokemon(input)` methods returning `RetrievedEvidence[]`. Implement them in the existing answer service module using the already configured collection, store, embeddings, and exact `PromptInjectionGuardrail` instance used by `/ask`. Structured lookup validates its criteria and checks all retrieved evidence before returning. Semantic search validates the query, calls `guardrail.checkQuestion` before embedding, performs retrieval, then calls `guardrail.checkEvidence`. Map retrieval/guardrail errors to safe MCP tool errors; do not return partial evidence after a guardrail failure. Keep answer generation, conversation persistence, and memory outside the MCP path.

## 4. Code changes by module

- `src/service/answer-question.ts` — factor or add guarded evidence lookup and semantic-search operations; preserve current `/ask` and stream behavior. Ensure the same configured guardrail protects both new operations.
- `src/config/ask-runtime.ts` — extend `AskService` with the two evidence methods and construct them with the existing shared store, embeddings, and guardrail dependencies.
- `src/domain/ask.ts` or a focused MCP domain module — add strict schemas for MCP tool inputs and bounded query/result limits without changing existing public ask schemas.
- `src/http/mcp-auth.ts` — parse MCP enablement/token configuration, bearer validation, constant-time digest comparison, and safe config errors.
- `src/http/mcp-rate-limiter.ts` — implement the bounded per-peer fixed-window limiter with injected time source and timer cleanup.
- `src/http/mcp-server.ts` — register MCP tool schemas/handlers, build stateless Streamable HTTP handler, and adapt it to Node request/response through the official Node adapter.
- `src/http/server.ts` — accept an optional MCP request handler and route only `/mcp` requests to it before current routes; keep disabled behavior as 404 and preserve existing CORS behavior on other routes.
- `src/index.ts` — read MCP config from the same injected environment passed to `startApiServer`, construct MCP only when explicitly enabled, fail before listening on invalid enabled configuration, and dispose the limiter/handler on server close. MCP startup failure must close already-created resources.
- `.env.example` and `README.md` / `README.pt-BR.md` — add token placeholders and document MCP in both languages: purpose and scope, opt-in setup (`MCP_ENABLED=true`), how to create/configure `MCP_AUTH_TOKEN` without committing it, endpoint URL and Streamable HTTP transport, bearer-header/client configuration example using a placeholder token, both tool names and their input/result behavior, default rate limit (30 requests per peer per 60 seconds), 401/429 behavior, prompt-injection screening, token rotation, and POC limitations (shared token, in-memory per-process limit, no trusted proxy handling). Keep examples safe to copy without a real credential.

## 5. Request lifecycle

1. Application startup reads the injected environment. With MCP disabled, existing startup proceeds unchanged. With MCP enabled, validate the token before binding the listener and build the MCP handler from the already-created `AskService`.
2. The main HTTP server recognizes the `/mcp` path. The MCP wrapper validates the bearer token, then charges the peer's rate-limit bucket, then delegates to the Streamable HTTP handler/Node adapter. Invalid tokens cannot consume retrieval work or limiter state.
3. The SDK validates the MCP frame and dispatches one of the registered tools. Tool schemas validate again at the boundary. Service logic runs the guardrail and retrieval sequence before returning validated evidence.
4. Rate-limited requests receive HTTP 429 with `Retry-After`; authentication failures receive 401. MCP protocol/tool failures remain protocol responses with safe messages and no internal exception details.
5. On HTTP server close, stop and clear the limiter cleanup timer and close the MCP handler/SDK resources using its lifecycle API. The current stateless setup must not retain per-client sessions.

## 6. Test strategy (`node:test`)

- Service tests: structured lookup success and empty results; semantic query validation, safety check before embeddings, search result cap, evidence validation, evidence injection rejection, and retrieval/model failure mapping. Verify the guardrail used is the configured API instance.
- Auth tests: disabled config, enabled missing/short token, exact bearer parsing, missing/wrong token, same-length and different-length wrong tokens, and no raw token in safe errors.
- Rate limiter tests with fake time: exact quota boundary, retry-after calculation, reset after window, expiry cleanup, max-entry behavior, new-peer rejection at capacity, and disposal of timer.
- MCP HTTP tests: initialize/list/tools/call with a valid bearer; missing/invalid bearer gets 401 before SDK execution; initialization and tool calls count toward quota; limited request gets 429; invalid tool input and guardrail/retrieval failures return safe MCP errors.
- API integration tests: `/ask`, `/ask/stream`, login, and conversation routes are unchanged with MCP disabled and enabled; disabled `/mcp` is 404; startup validation fails before listening when enabled without token; server close disposes MCP and limiter resources.
- Avoid external OpenRouter calls by injecting deterministic embedding, classifier, store, and clock dependencies. Exercise the official client/server SDK in-process where practical for handshake and tool discovery.

## 7. Implementation sequence

1. Add and pin compatible MCP SDK packages; confirm strict TypeScript build with Zod 3.25 and `zod/v4` schemas.
2. Add MCP configuration and strict tool input schemas with domain tests.
3. Extend evidence service methods and guardrail wiring; add deterministic service tests before transport code.
4. Implement and test bearer-token validation and bounded fixed-window limiter independently.
5. Register the two MCP tools and create the stateless Streamable HTTP handler through the official Node adapter.
6. Route `/mcp` through the existing `node:http` listener; wire explicit enablement and shutdown cleanup through application startup.
7. Add HTTP/protocol integration tests for auth, rate limit, prompt injection, safe errors, and route compatibility.
8. Update `README.md` and `README.pt-BR.md` with complete MCP setup, endpoint, client connection, tool, rate-limit, guardrail, and security limitation details; verify examples use placeholders and no real token or environment file is staged.
9. Run typecheck, full tests, and frontend build; inspect acceptance criteria and final Git status.

## 8. Documentation acceptance

- **README-1:** Both READMEs explain how to enable MCP, configure the bearer token, connect a Streamable HTTP client to `/mcp`, and invoke `lookup_pokemon` and `search_pokemon` with their input and result shapes.
- **README-2:** Both READMEs state the default per-peer quota and describe authentication/rate-limit errors, prompt-injection checks, token rotation, and the shared-token/process-local POC limitations.
- **README-3:** Client examples use a placeholder token, never include a real secret, and match the implemented configuration and protocol behavior.

## 9. Risks and mitigations

- **SDK churn:** use the official stable v2 packages and exact dependency versions; isolate adapter code in `src/http/mcp-server.ts`.
- **Guardrail availability/cost:** semantic MCP calls reuse the existing classifier and embeddings, so they incur the same provider dependency and may fail closed. Structured lookups still validate evidence against injection patterns.
- **Static shared token:** every client with the token is equivalent. Keep the endpoint disabled by default, require a high-entropy credential, and document rotation.
- **In-memory throttling:** restart resets counters and multiple API processes do not share quotas. Keep the POC scope explicit; distributed rate limiting is deferred.
- **Peer address behind proxy:** forwarded headers are untrusted by default, so behind a proxy all callers may share one peer bucket. A trusted-proxy policy can be a later activity.
- **Malformed corpus content:** evidence is screened before return, but pattern/classifier-based checks cannot guarantee full prompt-injection detection. Keep evidence marked as untrusted in tool descriptions and client documentation.

## 10. Review checkpoint

This plan fixes the open choices from spec 019: endpoint `POST /mcp`, explicit opt-in `MCP_ENABLED=true`, token variable `MCP_AUTH_TOKEN` with a minimum length, official stateless Streamable HTTP SDK v2 and Node adapter, 30 requests per peer per 60 seconds with a 10,000-entry bound, and direct reuse of the existing evidence store, embeddings, and prompt guardrail. Review this plan before creating `tasks.md` or implementing it.
