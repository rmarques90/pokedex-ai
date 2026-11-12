# 012 Technical Plan: Stream Answers to the Frontend

## 1. Design overview

Keep the existing `POST /ask` request and JSON response path unchanged. Add `POST /ask/stream` for the web client. The new route reuses the existing origin policy, JSON request validation, answer service, and safe domain-error mapping.

The response uses server-sent-event framing over the POST response body. The frontend sends the question with `fetch`, reads the response body as a `ReadableStream`, and parses events incrementally. It does not use `EventSource`.

## 2. Event contract

All event `data` values are JSON. Proposed named events:

| Event | Payload | Behavior |
| --- | --- | --- |
| `delta` | `{ "text": "..." }` | Append answer text to the current attempt. Contains no structured JSON or metadata. |
| `replace` | `{ "reason": "fallback" | "revision" | "retry", "text": "..." }` | Replace the current draft, including clearing it before general-knowledge fallback or a retry. |
| `complete` | Existing `AskResult` | Marks successful completion; final sources, abstention, and general-knowledge provenance become authoritative. |
| `error` | `{ "error": "...", "retryable": true/false }` | Safe failure after the HTTP stream has started; the server ends the response after this event. |

Pre-stream validation, origin, and client errors remain ordinary JSON responses with their current HTTP status. Successful stream responses use `Content-Type: text/event-stream`, disable intermediary buffering and caching, and end after one `complete` or `error` event. Keep-alive comments may be added only if needed to prevent local proxies from timing out.

## 3. Service and model flow

Add an asynchronous streaming path to the answer service while preserving its current `ask()` method for JSON and CLI callers. Share question validation, prompt-safety checks, retrieval, evidence validation, citation resolution, and answer-mode routing between the two paths to avoid behavioral drift.

Extend the answer generator with a streaming operation that accepts the same question, evidence, and `retrieved`/`general` mode plus an `AbortSignal`. The model continues producing the existing structured result (`answer`, `abstained`, `usedPokemonIds`). Use the installed LangChain JSON streaming parser or an equivalent tested incremental parser to observe partial JSON objects. Emit only newly available text from the `answer` property; never forward the raw JSON chunks. Handle partial JSON string escapes and revisions to a previously emitted partial value by emitting a `replace` event and the corrected draft when required. Validate the complete result against the existing Zod answer schema and the mode-specific evidence-ID rules before emitting `complete`.

The schema places `answer` first so supported model output can begin rendering early. A focused integration-style test must demonstrate that at least one answer delta is emitted before the model's final structured result is available; if the configured OpenRouter model/provider buffers output despite streaming, fail clearly and document that limitation rather than pretending to stream.

For an empty retrieval result, stream general mode directly with an empty evidence array. For a retrieved-mode abstention, emit `replace` before starting general mode, then emit its deltas. Resolve final citations only from IDs validated against the retrieved evidence. General answers and abstentions complete with no RAG sources.

## 4. HTTP and cancellation

Extend the ask-service HTTP contract with a streaming handler while keeping the current JSON handler. `POST /ask/stream` uses the same origin allowlist and request body size/content-type/schema checks as `POST /ask`. Validate the request before sending SSE headers so deterministic client failures retain ordinary HTTP status codes.

Create an `AbortController` for each stream. Abort it when the request body is aborted or the response closes before normal completion. Pass the signal through safety assessment, embeddings, and answer generation wherever the SDK/runtime accepts it. Stop writing and clean up listeners after completion, client disconnect, or stream failure. If cancellation is not supported by an upstream operation, do not send additional events to the disconnected client.

Map known guardrail errors after stream start to safe non-retryable `error` events; map provider, retrieval, and unexpected server failures to safe retryable events according to their category. Never put error causes, stack traces, provider bodies, prompts, or evidence in event payloads. Do not attempt to write a JSON response after SSE headers have been sent.

## 5. Frontend behavior and retries

Update the default `askPokemon` frontend path to POST to `/ask/stream`. Keep the existing non-streaming client/helper as needed for compatibility tests or other consumers, but the React UI uses the streaming client.

The stream client accepts an `AbortSignal` and callbacks for deltas, replacement, retry progress, and completion. The React component owns the active `AbortController`; show a cancel button only while a request is active. Cancel, reset, unmount, or a new question aborts the current operation and prevents late chunks from changing the UI.

Retry up to three additional attempts after the first, only for network failures, incomplete streams, HTTP 429, HTTP 5xx, or an `error` event explicitly marked retryable. Do not retry user cancellation, question validation failures, origin/guardrail rejection, or other non-retryable 4xx responses. Use bounded backoff with a testable delay helper. Before each retry, clear the previous attempt's partial text and show retry progress. After the final failure, show the existing error and manual retry control. Display sources and general-knowledge provenance only after a valid `complete` event.

## 6. Modules and contracts affected

- `src/domain/` — typed SSE event payload schemas, if needed for shared validation.
- `src/service/` — add the cancellable streaming answer path and model stream contract; preserve `answerQuestion()` for JSON/CLI.
- `src/http/server.ts` — route `POST /ask/stream`, SSE framing, safe pre/post-header errors, origin checks, and disconnect cancellation.
- `src/config/ask-runtime.ts` and `src/index.ts` — expose both JSON and streaming service methods to the HTTP server without changing the CLI path.
- `src/fe/api-client.ts` — fetch-stream parser, validation, abort, retry, and callback contract.
- `src/fe/App.tsx`, `src/fe/i18n.ts`, and styles — append deltas, show progress/cancel/retry state, and preserve final provenance UI.
- `vite.config.ts` — verify the existing `/ask` prefix proxy forwards `/ask/stream`; adjust only if the smoke test shows it does not.
- Tests — cover stream framing/parsing, incremental model output, fallback replacement, final source equivalence, errors, retries, cancellation, origin policy, and unchanged JSON/CLI behavior.
- `README.md` — document both endpoints and the streaming/retry behavior.

## 7. Validation strategy

- Unit-test the incremental answer-field parser with chunks split inside JSON keys, escaped quotes, backslashes, Unicode escapes, and incomplete JSON; confirm no JSON syntax reaches `delta` events.
- Use a controllable fake streaming model to prove deltas arrive before completion, fallback emits a replacement, citation IDs are validated, and abort stops further output.
- HTTP-test the new route, request validation before headers, named event framing, safe error events, exact origin policy, client disconnect behavior, and the unchanged JSON endpoint.
- Frontend-test event parsing across arbitrary UTF-8 and SSE frame boundaries, delta append/replacement, final completion, cancellation, retryable vs non-retryable errors, partial-text clearing between attempts, and the three-retry limit.
- Run `npm run typecheck`, the full test suite, and a Vite proxy smoke check for `/ask/stream` against a stub API. Do not use live `.env` credentials for validation.

## 8. Risks and constraints

- JSON-mode streaming and partial structured parsing can vary by model/provider; verify actual chunk behavior for the configured OpenRouter route.
- Retry attempts can incur additional provider requests and cost. The three-retry limit and transient-error classification bound this behavior.
- A browser disconnect can cancel local work, but an upstream provider may already be processing and may not support cancellation.
- If partial structured values revise earlier answer characters, a `replace` event is required to maintain exact text; appending deltas blindly is unsafe.
- Streamed RAG evidence continues to be sent to OpenRouter for grounded generation, as it is on the current JSON path. This feature does not change the data privacy boundary.
