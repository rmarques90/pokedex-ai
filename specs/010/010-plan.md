# 010 - Technical Plan

## 1. Architecture

Apply the local proof-of-concept access rule at the existing `node:http` boundary. The React application continues to call the same-origin `/ask` path through Vite's proxy. The API checks a present `Origin` header against an exact allowlist before parsing a request body or invoking the ask service. Requests without `Origin` remain allowed for local maintenance. The API's existing loopback default is preserved.

This is a browser-origin filter, not API authentication. It does not prevent local scripts or other clients from omitting or forging `Origin`; the API remains local-only by default. No CORS support is needed for the same-origin Vite proxy. If CORS headers are added later, they must use the same exact allowlist.

Proposed changes:

- `src/http/server.ts` — add an explicit HTTP server options type with the allowed frontend origins, defaulting to the local Vite origins (`http://127.0.0.1:5173` and `http://localhost:5173`). Reject a present, unlisted or malformed `Origin` with a safe 403 response before reading the body. Accept an absent origin in this local PoC. Pass options through `listenAskHttpServer` while preserving its default loopback host.
- `src/index.ts` — keep the API host default at `127.0.0.1` and make the local frontend-origin policy explicit when starting the API. Do not introduce a browser credential or change service construction.
- `src/http/server.test.ts` — verify a configured origin succeeds; an unrelated origin, a lookalike origin, and malformed origin fail before the ask handler runs; a missing origin succeeds for direct local maintenance; and existing payload validation and error behavior remains unchanged.
- `vite.config.ts` — keep the same-origin `/ask` proxy. Confirm the browser's `Origin` header is preserved for the API check; adjust proxy configuration only if the current behavior changes or removes it.
- `README.md` — document local allowed origins, the Vite proxy, loopback binding, missing-origin maintenance behavior, and the limitation that this is not protection from local scripts or forged headers.

No CLI or domain/service changes are planned. CLI requests continue to call the application service directly.

## 2. Access policy

- **Configured local browser origins:** exact matches for `http://127.0.0.1:5173` and `http://localhost:5173`.
- **Origin present and allowed:** continue normal request processing.
- **Origin present and not allowed:** return 403 before request-body parsing and before calling the ask handler.
- **Origin absent:** allow local maintenance requests; do not describe this path as authenticated.
- **Network bind:** preserve the default `127.0.0.1` bind so the development exception remains limited to the local machine by default.
- **CORS:** no CORS headers are required for the same-origin frontend proxy. If introduced, return them only for configured origins and the minimum required methods/headers.

Compare normalized URL origins rather than prefixes or substrings. Reject opaque `null` origins and malformed values. Do not reflect arbitrary `Origin` values in response headers.

## 3. Test strategy (`node:test`)

- Extend HTTP boundary tests to assert status, safe response body, and zero handler calls for disallowed origins.
- Cover exact matches and lookalikes (for example, an allowed hostname with an attacker-controlled suffix or port).
- Keep a test proving requests without an `Origin` header remain allowed and a test proving existing HTTP error mappings remain unchanged.
- Run `npm run test` and `npm run typecheck`. Perform a local smoke check through `npm run dev:full` to confirm the Vite proxy preserves the allowed origin and the frontend still receives the existing `/ask` response shape.

## 4. Risks and mitigations

- **Origin is not caller identity:** local clients can forge it. Keep the API loopback-bound by default and document the PoC boundary; production protection is out of scope.
- **Proxy header behavior:** verify that Vite forwards the browser `Origin` header unchanged. Do not silently accept an untrusted substitute if it is absent.
- **Host aliases:** list only the exact local origins intended for use. Do not use wildcard, suffix, or substring checks.
- **Configuration drift:** keep the allowed origin values centralized and explicit so the Vite proxy and API policy stay aligned.

## 5. Review points

- Confirm this plan before proceeding to `/tarefas`.
- Keep the implementation local to the PoC; do not add frontend secrets, CLI HTTP requirements, or production deployment architecture.
