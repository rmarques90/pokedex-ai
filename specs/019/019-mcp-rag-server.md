# 019 - Read-only MCP server for Pokédex RAG

## 1. Context and problem

The application currently serves its Pokédex assistant through its own HTTP API and CLI. External AI clients cannot query the indexed Pokédex corpus through a standard tool protocol. This activity adds a Model Context Protocol (MCP) endpoint so compatible clients can retrieve the same indexed evidence.

The project uses Node.js 22, TypeScript, Zod, `node:http`, and LanceDB. MCP has a maintained TypeScript SDK; its official guidance recommends Streamable HTTP for remote servers and stdio for locally spawned processes. This activity targets remote clients and should use Streamable HTTP, integrated with the existing HTTP server rather than opening a second public port. ([MCP TypeScript SDK server guide](https://ts.sdk.modelcontextprotocol.io/server))

## 2. User stories

- As an external AI client, I want to search the Pokédex knowledge index using MCP tools so I can ground answers in the project's indexed sources.
- As the operator, I want MCP calls protected by a shared bearer token configured in the local environment so only clients with the POC credential can use the endpoint.
- As the operator, I want requests rate-limited so a client cannot make unbounded use of retrieval and embedding resources.

## 3. Functional requirements

- **RF-1:** Expose an MCP endpoint over Streamable HTTP at a documented path on the existing API listener. Preserve existing HTTP routes and behavior.
- **RF-2:** Expose read-only tools for (a) structured Pokédex lookup by National Dex ID, canonical name, or Pokémon type and (b) semantic search over the existing RAG index. Return validated Pokémon evidence and available source URLs, not raw LanceDB rows or internal database details.
- **RF-3:** MCP tools must invoke service-layer operations. MCP/HTTP handlers must not access LanceDB directly, bypass existing domain schemas, or expose conversation history, user memory, or write/populate operations.
- **RF-4:** Require an `Authorization: Bearer <token>` header for every MCP HTTP request, including initialization and subsequent session requests. Reject absent or invalid credentials before invoking MCP handlers or retrieval. Do not accept tokens in query strings or tool arguments.
- **RF-5:** Read the shared POC token from an environment variable (proposed name: `MCP_AUTH_TOKEN`). When MCP is enabled, fail startup with a safe configuration error if the token is missing, empty, or malformed. Never log or return the token. Add only a placeholder variable to `.env.example`; never commit a real credential.
- **RF-6:** Compare presented credentials without an early-exit string comparison where practical. Reject invalid credentials with HTTP 401 and a `WWW-Authenticate: Bearer` challenge; use safe, non-revealing error bodies.
- **RF-7:** Apply a bounded in-memory rate limiter to MCP requests before dispatch. Key limits by the network peer address (not by the shared token, which would make all clients one bucket); do not trust forwarding headers unless a trusted-proxy policy is explicitly configured. Return HTTP 429 and `Retry-After` when limited. Bound limiter state and expire inactive entries.
- **RF-8:** Rate-limit MCP initialization and tool calls, and ensure one logical MCP request cannot bypass the limit through protocol/session behavior. Define initial threshold/window, cleanup policy, and handling of concurrent calls during planning.
- **RF-9:** Validate all tool inputs with Zod, impose a bounded maximum result count and query size, and return safe errors for malformed input or retrieval failures. Do not leak stack traces, provider credentials, or internal database paths.
- **RF-10 (prompt injection):** Reuse the existing `PromptInjectionGuardrail` used by the API. Run `checkQuestion` on free-text MCP search queries before embedding/retrieval, and run `checkEvidence` on every retrieved evidence set before returning it from either tool. For structured lookups, validate the structured arguments and apply the evidence check; do not pass arbitrary MCP input directly to retrieval. If a check fails, do not return the unsafe evidence; surface a safe MCP error without internal details.
- **RF-11:** Keep current API and CLI behavior intact when MCP is enabled. The shared listener should have a clear shutdown lifecycle and release MCP transport/session resources.
- **RF-12:** Document local setup, token configuration, endpoint path, available tools, and how an MCP client supplies the bearer token. State that the static shared-token and in-memory rate limit are POC controls, not production-grade identity, distributed throttling, or abuse prevention.

## 4. Proposed tool contract

- `lookup_pokemon`: input is exactly one of a National Dex ID, canonical Pokémon name, or type. Return matching structured evidence and source references. Cap results; type lookup may return multiple Pokémon.
- `search_pokemon`: input is a non-empty natural-language query and an optional bounded result count. Use the existing embedding and vector retrieval path; return retrieved evidence and sources, without generating a separate assistant answer.
- Tool names and input/output schemas are versioned public integration contracts. Unknown input fields should be rejected or handled consistently with the project's existing boundary validation policy.

Exact naming and result serialization can be finalized in the plan, but the contract must preserve source attribution and distinguish an empty result from a server failure.

## 5. Authentication and abuse controls

The POC uses one operator-configured static bearer token shared among clients. The token identifies possession of that credential only; it does not identify individual users or grant access to conversation data. The implementation must not log Authorization headers. Documentation must instruct operators to use a high-entropy random value, keep it out of source control, and rotate it by changing the environment configuration and restarting the process.

The rate limiter is process-local and therefore resets on restart and does not coordinate across multiple instances. It should count authenticated MCP HTTP requests that can trigger server work, including tool invocations. A planning decision must set a conservative default threshold and window, whether initialization shares that bucket, and whether limit configuration is environment-controlled. The limiter must bound memory use under many distinct source addresses. The server must not trust arbitrary `X-Forwarded-For` or `Forwarded` values to choose a client identity.

## 6. Architecture and scope

- Keep MCP transport adaptation in the HTTP boundary and tool business logic in `service`; reuse/extend the existing vector-store interface where necessary.
- The existing answer service includes guardrails and generation behavior. MCP search returns indexed evidence directly, so it must validate inputs, constrain outputs, and treat indexed text as untrusted content for downstream AI clients. It must not run answer generation unless explicitly included in a future activity.
- Reuse the current `PromptInjectionGuardrail` for natural-language search query screening and retrieved-evidence screening. The guardrail is a safety boundary for this application's tool output; it does not make returned text trusted or guarantee detection of every attack.
- Keep the existing `node:http` design. Select an SDK/adapter compatible with that server and the existing Zod version; do not silently replace the application's HTTP stack.
- Initial scope is read-only access to indexed Pokédex evidence. No user-specific conversations, memories, authentication accounts, OAuth, arbitrary SQL/LanceDB queries, resources, prompts, mutation tools, stdio transport, or multi-tenant token registry.

## 7. Acceptance criteria

- **AC-1:** A compatible MCP client can initialize and discover the two read-only tools over the documented Streamable HTTP endpoint.
- **AC-2:** Structured lookup and semantic search return schema-valid evidence with source URLs; invalid inputs and empty matches have stable, documented results.
- **AC-3:** Requests without a bearer token or with an incorrect token receive 401 and cannot invoke retrieval. A correct token permits MCP protocol and tool requests.
- **AC-4:** Requests beyond the configured per-client rate limit receive 429 and `Retry-After`; requests under the limit work normally. Limiter state is bounded and expires.
- **AC-5:** Missing token configuration prevents MCP-enabled startup with a safe error; no token appears in logs, responses, fixtures, or tracked configuration.
- **AC-6:** Existing prompt-injection checks are applied before semantic retrieval and to evidence before either MCP tool returns it. Unsafe queries/evidence produce a safe error and unsafe evidence is never included in the response.
- **AC-7:** MCP handlers use service/store interfaces and do not expose database internals, conversations, memories, or write operations.
- **AC-8:** Existing API/CLI flows continue to work, and MCP resources are closed during server shutdown.
- **AC-9:** Tests cover authentication on initialization and follow-up requests, rate limits and limiter cleanup, tool validation, prompt-injection query/evidence paths, result bounds, retrieval failures, existing route compatibility, and shutdown.

## 8. Open decisions for planning

- Select the current MCP TypeScript SDK release compatible with Node 22, TypeScript strict mode, Zod 3, and `node:http`; official SDK documentation has more than one published major line, so pin and verify the chosen API during planning.
- Decide the endpoint path and exact bearer-token verification integration with Streamable HTTP sessions.
- Choose initial rate-limit window and quota, cleanup interval, maximum number of tracked peer addresses, and whether to expose configuration through environment variables.
- Confirm how to derive the peer address behind local development and any future reverse proxy. Default behavior must use the socket peer and ignore untrusted forwarding headers.
- Define the service interface for structured and semantic evidence retrieval so MCP can reuse the current store without duplicating query classification or leaking table access.
- Define how MCP services receive the existing `PromptInjectionGuardrail` and its classifier dependency; ensure it is wired once from application composition and guardrail failures map to safe protocol errors.
- Decide whether MCP is enabled by default when a token is configured or requires an explicit `MCP_ENABLED` flag. Regardless, it must not accept requests without a configured token.

## 9. Review checkpoint

Review this specification before `/planejar`. The plan should settle SDK/version, endpoint, token startup behavior, rate-limit defaults, and service interfaces. This POC is intended for controlled integration testing; a shared static token and process-local limiter are not sufficient for an internet-facing production service.
