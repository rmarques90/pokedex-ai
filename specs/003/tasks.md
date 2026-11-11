# LLM Integration Tasks

1. - [x] Add ask-domain schemas, result types, and domain errors. **Ready when:** `src/domain/ask.test.ts` covers valid/invalid questions, retrieved evidence, source references, and answer/abstention results; `npm run typecheck` passes. **Dependencies:** none.

2. - [x] Add vector similarity search to the LanceDB store interface and implementation, scoped to the configured collection and accepting a query vector plus `topK`. **Ready when:** store tests verify collection scoping, `topK = 5` behavior, normalized metadata/source URLs, empty results, and database errors; `npm run typecheck` passes. **Dependencies:** Task 1.

3. - [x] Add the OpenRouter chat-model adapter and constants for `CHAT_MODEL = '~deepseek/deepseek-flash-latest'` and the OpenRouter base URL. **Ready when:** adapter tests verify model/base URL configuration, runtime API-key use, and safe provider-error handling without exposing credentials; `npm run typecheck` passes. **Dependencies:** none.

4. - [x] Implement the LangChain prompt-injection guardrail as a dedicated module for user questions and retrieved text. Treat both as untrusted input and fail closed if the guardrail cannot complete. **Ready when:** tests demonstrate that instruction-like user and retrieved content cannot override the Pokémon/evidence-only policy, and a guardrail failure prevents model invocation; `npm run typecheck` passes. **Dependencies:** Task 1.

5. - [x] Implement the answer-question service using the existing embedding integration, LanceDB search, the guardrail, and the OpenRouter chat adapter. Retrieve the initial five candidates, answer only from retrieved evidence, abstain when it is insufficient, and return only source URLs used as evidence. **Ready when:** service tests with fakes verify call ordering, five-result retrieval, evidence-only context, abstention, citations, and safe retrieval/model failures; `npm run typecheck` passes. **Dependencies:** Tasks 1–4.

6. - [x] Add shared runtime configuration and dependency composition for the configured LanceDB collection, OpenRouter key, store, embeddings, guardrail, and chat model. **Ready when:** tests cover missing/invalid configuration and verify that secrets are never included in errors or logs; no `.env` contents are read during implementation; `npm run typecheck` passes. **Dependencies:** Tasks 2–5.

7. - [x] Implement the one-shot `ask` CLI command in `src/cli.ts`, supporting `npm run cli ask my-question`. Validate the question with Zod and print the answer and source URLs. **Ready when:** CLI tests cover argument parsing, success, expected abstention, invalid input, service failures, and process exit behavior; `npm run cli ask my-question` dispatches to the CLI; `npm run typecheck` passes. **Dependencies:** Tasks 1, 5, and 6.

8. - [x] Implement the `node:http` server and `POST /ask` route, using the shared service and validating JSON with Zod. Return `{ answer, abstained, sources }`; map invalid requests to client errors and server-side failures to HTTP 500 with a safe message. **Ready when:** HTTP tests cover success, citations, abstention, malformed JSON, invalid questions, server failures, and absence of secrets/stack traces in responses; `npm run typecheck` passes. **Dependencies:** Tasks 1, 5, and 6.

9. - [x] Connect the `dev` entry point to the HTTP server on `localhost:3000` and verify both public entry points against the shared service composition. **Ready when:** boundary integration tests show CLI and HTTP return consistent answer/source data for the same mocked retrieval, `npm run test` passes, and `npm run typecheck` passes. **Dependencies:** Tasks 7 and 8.
