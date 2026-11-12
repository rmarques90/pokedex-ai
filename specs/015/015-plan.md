# 015 - Technical Plan

## 1. Architecture

Add stage-aware, redacted diagnostics around the existing OpenRouter calls before deciding whether to add startup inference warmup. Startup currently constructs provider clients without invoking them, so the first OpenRouter request happens during a user question. The first external call is the prompt-safety classifier; non-deterministic questions then call embeddings, and supported answers call the answer model. This order lets diagnostics identify the failing stage without logging prompt or evidence content.

Proposed changes:

- `src/service/openrouter-diagnostics.ts` — add a small typed diagnostic event/logger contract and safe error detail extraction. Traverse nested causes to retain only approved fields (stage, configured model, safe HTTP status/code, elapsed time, and known retry context). Do not serialize arbitrary errors, headers, response bodies, prompts, or evidence.
- `src/service/answer-question.ts` — wrap calls to safety classification, query embedding, and answer generation with stage/timing context. Keep error classes and causes intact; send only sanitized failure events to the injected diagnostic logger.
- `src/service/answer-question.ts` streaming path — apply the same stage labels and timing to the streaming chain. Preserve cancellation behavior and avoid logging aborts as provider failures.
- `src/config/ask-runtime.ts` — provide a logger dependency when composing the service, with a small safe runtime default for failures and a no-op/injected implementation in tests. Do not make an OpenRouter call during service construction.
- `src/http/server.ts` — derive the stream error `retryable` flag from typed transient failure classification. Do not mark every non-guardrail error retryable; authentication, invalid request/model configuration, and billing/credit errors must not cause the browser to restart the complete pipeline repeatedly. Keep user-facing HTTP/SSE messages generic.
- `src/service/openrouter-chat-model.ts`, `src/service/openrouter-prompt-safety.ts`, and `src/service/openrouter-embeddings.ts` — preserve existing typed errors and safe status/code extraction so the stage wrapper can inspect causes. Do not change model selection or dump provider payloads.
- `src/service/openrouter-diagnostics.test.ts`, service/runtime tests, and `src/http/server.test.ts` — cover safe extraction, stage isolation, retry classification, logger injection, streaming behavior, and startup with zero OpenRouter calls.

Do not implement startup warmup in this activity unless collected diagnostics establish a reproducible inference cold-start failure. If that happens, pause for a warmup design decision: whether it should be opt-in, which stages it must exercise, how to bound cost/time, and whether its failure blocks API startup. A model-list or process-health check alone does not exercise inference and must not be presented as a warmup.

## 2. Diagnostic event and failure policy

- Use a closed set of operation stages: `prompt_safety`, `query_embedding`, `answer_generation`, and `answer_stream`.
- Include configured model identifier, elapsed milliseconds, safe HTTP status, safe provider error code, and an attempt field only when it is genuinely known. The LangChain client's `maxRetries` setting may be reported as configuration; do not claim it is the number of attempts actually made unless the client exposes that value.
- Use structured events and emit diagnostics only on failure initially; successful-request telemetry and general observability infrastructure are outside scope.
- Classify as retryable only explicitly transient upstream/network failures (such as 429, selected 5xx statuses, and transport failures). Treat credential, account/billing, invalid model/request, prompt-safety rejection, validation, and local retrieval failures as non-retryable.
- Keep retries bounded. Document that a frontend retry re-executes prior successful pipeline stages and may repeat provider work; avoid broad retries that amplify cost or rate pressure.
- The emitted event must never include the API key, authorization headers, raw question, retrieved text, arbitrary error messages, or full provider response bodies. Preserve current safe user-facing messages.

## 3. Warmup decision gate

The first implementation should gather evidence rather than send extra provider traffic at startup. After stage diagnostics are available, reproduce the first-request failure and compare the first and subsequent calls by stage, status/code, and duration.

Only add warmup in a follow-up if the failure is reproducibly attributable to a cold inference endpoint and a real model call is expected to address it. Such a follow-up should use fixed synthetic input, make its provider calls and cost explicit, enforce a timeout, report completion/failure, and define whether startup continues on warmup failure. It must never send user questions or retrieved evidence. Keep warmup disabled by default unless a later review explicitly chooses another policy.

## 4. Test strategy (`node:test`)

- Unit-test safe error extraction through nested causes, including accepted status/code values and rejection of secrets, raw messages, headers, and bodies.
- Use fake safety, embedding, and answer clients to trigger each stage failure and assert that diagnostics identify the correct stage and elapsed time without including input content.
- Verify retry classification: transient statuses and transport errors are retryable; authentication, malformed request/model, credit/billing, guardrail, schema, and local database errors are not.
- Verify a stream failure event carries the right retryability and that the frontend's full-question retry does not repeat known non-transient failures.
- Verify service construction and API startup make no OpenRouter requests.
- Verify cancellation is not reported as an upstream outage and current answer, evidence, prompt-injection, and API contracts remain unchanged.

## 5. Risks and mitigations

- **Cause chains vary by SDK/provider:** use defensive allowlisted extraction and tests against representative nested errors; omit unavailable details rather than logging arbitrary objects.
- **Retries can repeat paid work:** distinguish transport/provider failures from deterministic failures and retain a strict retry bound.
- **A warmup might not reproduce user traffic:** defer it until a failing stage is known; if later added, exercise only the confirmed stage(s) and use synthetic data.
- **Warmup could delay or prevent service startup:** keep it outside this diagnostic change; any later warmup must define bounded timeout and startup failure policy before implementation.
- **Logs can expose sensitive input:** emit only allowlisted structured fields and test for absence of credentials, questions, and evidence.

## 6. Review points

- Confirm this plan before proceeding to `/tarefas`.
- The plan recommends stage diagnostics and corrected retry classification first, with no automatic warmup until evidence identifies an inference cold start. If the exact first-request error is available, use it to refine the diagnostic fields and retry policy before task breakdown.
