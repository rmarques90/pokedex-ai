# 012 - Stream answers to the frontend

## 1. Context and problem

The React frontend submits a question and waits for the complete JSON response from `POST /ask`. The service performs safety assessment, local retrieval, and one or more OpenRouter generations before returning. During generation the user sees only a loading indicator, which makes the application feel slow even when the model is already producing the answer.

The API uses `node:http` directly. The current answer generator uses LangChain structured output, while the frontend API client calls `response.json()` and the UI renders the answer only after the request resolves. The application also has a CLI and existing tests/clients that rely on the JSON response contract.

## 2. User story

As a user asking a question in the web interface, I want the answer text to appear as the model produces it, so that I can see progress and start reading sooner.

## 3. Functional requirements

- **RF-1:** The web frontend must be able to receive and render answer text incrementally while generation is in progress.
- **RF-2:** Streaming must not expose raw provider payloads, JSON framing, system prompts, retrieved evidence, or internal generation metadata as answer text.
- **RF-3:** Keep the existing `POST /ask` JSON request/response behavior available for CLI integrations, maintenance callers, and clients that do not request streaming.
- **RF-4:** The streamed response must provide an explicit completion event containing the existing `AskResult` shape, including final abstention state and source references. References are displayed only after completion.
- **RF-5:** The stream must communicate safe errors that occur before or during generation. If an error occurs after the stream begins, terminate it with a defined error event and do not expose stack traces or provider response bodies.
- **RF-6:** Preserve the existing Origin allowlist behavior for browser requests, request validation, prompt-injection checks, retrieval behavior, hybrid general-knowledge fallback, and source citation rules.
- **RF-7:** If a grounded generation abstains and the service falls back to general Pokémon knowledge, the frontend must not combine the partial grounded draft with the fallback answer. The stream protocol must explicitly support replacing/clearing a draft before fallback text is sent.
- **RF-8:** If the user cancels, resets, navigates away, or closes the request while streaming, the frontend must abort the request and the server/model generation should stop when cancellation is supported.
- **RF-9:** The frontend must provide a visible cancel button while a streamed request is active. Activating it aborts the active request, stops loading, and does not trigger automatic retries.
- **RF-10:** The UI must keep a clear generating state until completion, and transition to the existing error/retry state if the stream fails.
- **RF-11:** On a retryable transport, rate-limit, or server failure, automatically retry the streaming request up to three additional times after the initial attempt. Do not retry validation/authentication/authorization errors or user cancellations. Use a bounded delay between retries and stop retrying when the user cancels.
- **RF-12:** If a failure occurs after answer deltas were displayed, clear the partial answer before starting a retry so text from separate attempts is never concatenated. Indicate retry progress and show the existing error/retry state after all attempts fail.
- **RF-13:** General-knowledge answers must retain their no-RAG-sources provenance indicator; grounded answers must retain their final source references.

## 4. Streaming contract

Use a browser-readable streaming HTTP response suitable for a `POST` request with a JSON body. The transport should use named events so the frontend can distinguish answer deltas, draft replacement, successful completion, and safe errors. Event payloads must be JSON-encoded and each answer delta must contain only renderable answer text.

Implement the stream as a dedicated `POST /ask/stream` endpoint and update the web frontend to use it. Retain `POST /ask` as the existing JSON route for CLI integrations, maintenance callers, and other compatible clients. The stream must not require `EventSource`, which cannot send this request body; the frontend can consume it with `fetch` and a `ReadableStream`.

## 5. Acceptance criteria

- A streamed request begins delivering answer text before model generation completes, and the UI visibly appends each received delta.
- A completed stream yields the same `AskResult` fields and citations as the non-streaming JSON path.
- The existing JSON endpoint behavior and CLI invocation remain compatible.
- Streamed payloads never include provider JSON fragments, retrieved records, prompt text, or secret/internal error details.
- If the grounded attempt abstains before a general-knowledge fallback, the client clears/replaces any partial grounded text before displaying fallback text.
- The UI shows final references and general-knowledge provenance only when the stream completes successfully.
- Safe failures before stream start use an appropriate HTTP error response; failures after stream start use the documented error event and close the stream.
- Aborting a request stops frontend updates and cancels generation where the provider/runtime supports it.
- A visible cancel button aborts an active request and cancellation never triggers a retry.
- Retryable failures result in at most three additional attempts; non-retryable client errors are returned immediately.
- Partial text from a failed attempt is cleared before a retry, and the UI indicates retry progress.
- Allowed frontend origins continue to work and unlisted origins remain rejected before answer processing.

## 6. Out of scope

- Changing the answer content, RAG retrieval ranking, or general-knowledge domain policy.
- Adding web search or other tools.
- Replacing the Node HTTP server or introducing a web framework.
- Removing the existing JSON response path.
- Guaranteeing cancellation if an upstream provider cannot cancel an already submitted generation.

## 7. Decisions

- Use a dedicated `POST /ask/stream` endpoint for the web frontend and retain `POST /ask` for JSON compatibility.
- Allow up to three retries in addition to the first request, only for retryable transport, rate-limit, or server failures.
- Use server-sent events over the `POST` response body, consumed with `fetch` streaming; `EventSource` is not suitable for posting the question body.
- Final source references and abstention state are sent in a completion event, not attached to each text delta.
- On a grounded-to-general fallback, emit a replacement/reset event before any fallback deltas so the UI discards the earlier draft.
- On a failed streamed attempt, clear already displayed deltas before retrying; never retry a user cancellation.
