# 015 - Investigate and improve first-request reliability

## 1. Context and observed behavior

The first request sent after the API service starts is reported to fail consistently. The exact failure, provider status, and stage are not yet known, so the cause cannot be confirmed from the symptom alone.

The current code shows that startup does not call OpenRouter. `createAskService()` opens LanceDB and constructs embedding, prompt-safety, and answer clients; the HTTP server starts after service creation. The first question then calls the OpenRouter prompt-safety model first. Depending on question classification, it may next call the embedding model, and then the answer model. If the retrieved-answer attempt abstains, a second answer-model call can follow. The configured models are the safeguard model `openai/gpt-oss-safeguard-20b`, embedding model `qwen/qwen3-embedding-8b`, and answer model `~deepseek/deepseek-flash-latest`.

The OpenRouter clients set `maxRetries: 2`. The frontend streaming client also retries selected transport, HTTP 429, and server failures up to three times. These retries rerun the whole question flow at the frontend level, so earlier successful model stages may run again. Streaming failures are currently converted to generic user-facing events, and the HTTP server does not log stage-level provider diagnostics. As a result, the existing behavior can conceal which upstream operation fails and whether the first error is transient.

Possible causes include transient provider/model availability or overload, rate or credit limits, authentication or model configuration errors, transport/connectivity failures, or an error specific to the first prompt-safety call. A cold provider start is one possibility, but the code and symptom do not establish it as the cause. OpenRouter documents multiple failure statuses and exposes routing metadata in successful completion responses; capturing safe status and stage information is needed before deciding that an inference warmup will help.

## 2. User stories

- As an operator, I want to identify which OpenRouter stage fails on the first request, so that I can fix the actual cause instead of guessing.
- As a developer, I want transient startup-related provider failures handled predictably, so that a temporary provider issue does not unnecessarily fail the user's first question.
- As an operator, if evidence shows a cold inference start is the cause, I want a controlled startup warmup option that reduces first-request failures without hiding provider outages or exposing user data.

## 3. Functional requirements

- **RF-1:** For an OpenRouter-related failure, the service diagnostics must identify the operation stage: prompt-safety classification, query embedding, structured answer generation, or streaming answer generation.
- **RF-2:** Diagnostics must include safe, available failure details such as HTTP status, provider error code, configured model identifier, elapsed time, and retry attempt information. They must not include the API key, authorization headers, raw user question, retrieved evidence text, or raw provider response bodies.
- **RF-3:** Failure handling must distinguish transient provider/network failures from non-transient configuration, authentication, and billing failures. Retry behavior must be bounded and must not retry known non-transient failures as if they were cold starts.
- **RF-4:** Keep the existing service startup free of OpenRouter inference calls until warmup is explicitly enabled; service startup must not silently issue billable requests.
- **RF-5:** If investigation confirms that an inference cold start materially causes the reported first-request failure, provide an explicit, bounded warmup configuration that can exercise the necessary OpenRouter operations using fixed non-user input. Warmup must not send user questions or retrieved Pokemon evidence.
- **RF-6:** When warmup is enabled, its startup behavior, timeout, result, and failure policy must be observable. A warmup failure must not be misreported as a successful warmup, and the policy for whether it blocks listening or only logs a warning must be explicit.
- **RF-7:** Preserve answer behavior, evidence grounding, prompt-injection protection, request/response contracts, and the existing model selections unless diagnostics establish a separate configuration defect.

## 4. Acceptance criteria

- **AC-1:** A simulated failure in each OpenRouter stage can be distinguished in diagnostics without requiring access to the question or credentials.
- **AC-2:** For an upstream failure, diagnostics retain the available status/code/model/stage and retry context, while HTTP/SSE user-facing messages remain safe and do not expose provider internals.
- **AC-3:** Authentication, invalid model/configuration, and billing failures are not repeatedly retried as transient transport failures.
- **AC-4:** With warmup disabled or unset, service startup makes zero OpenRouter requests.
- **AC-5:** The investigation records which stage and failure class correspond to the reported first-request symptom, or explicitly concludes that the available evidence is insufficient to identify a single root cause.
- **AC-6:** If a cold inference start is confirmed and warmup is implemented, it is opt-in, bounded, uses only fixed synthetic input, reports success/failure, and leaves the `/ask` contract unchanged.
- **AC-7:** Existing fallback, retry, streaming, cancellation, and prompt-safety semantics remain covered and no API key, user prompt, evidence text, or raw provider body is logged.

## 5. Out of scope

- Changing model selection, provider routing policy, OpenRouter account limits, or model pricing without evidence that one of those is the confirmed cause.
- Adding a generic health check that claims to prove inference readiness without making an inference request.
- Logging raw prompts, retrieved data, credentials, or full provider response payloads.
- Changing the answer or retrieval contracts or relaxing the prompt-injection guardrail.

## 6. Open questions

- What exact error is seen for the first failed request (HTTP status, safe provider code, and whether it comes from prompt safety, embeddings, or answer generation)? No application log currently provides this stage-level information.
- Should an eventual warmup be opt-in through runtime configuration or enabled by default after the cause is confirmed?
- If enabled warmup fails, should the API still start and log a warning, or should startup fail? The current evidence does not justify making the application unavailable because an optional inference warmup failed.

## 7. Investigation references

- [OpenRouter chat completion API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) documents the completion request/response, model information, provider-routing configuration, and response metadata.
- The current implementation to inspect during planning is `src/config/ask-runtime.ts`, `src/service/answer-question.ts`, `src/service/prompt-injection-guardrail.ts`, `src/service/openrouter-chat-model.ts`, `src/service/openrouter-prompt-safety.ts`, `src/service/openrouter-embeddings.ts`, `src/http/server.ts`, and `src/fe/api-client.ts`.
