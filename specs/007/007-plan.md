# 007 Technical Plan: LLM Prompt Injection Protection

## 1. Architecture

Keep the current dependency flow: HTTP/CLI → answer service → prompt guardrail → OpenRouter. The question safety review runs before embedding or retrieval. The existing deterministic guardrail remains active for the user question and retrieved evidence; the LLM review receives only the user question.

Expected code areas:

- `src/constants.ts` — define the safeguard model identifier alongside the existing model constants.
- `src/service/openrouter-prompt-safety.ts` — provide the LangChain/OpenRouter safety-model adapter and validate its result.
- `src/service/prompt-injection-guardrail.ts` — retain local pattern checks and compose them with the LLM question assessment; keep retrieved-evidence checks local.
- `src/service/answer-question.ts` — ensure the LLM question check occurs before embedding, retrieval, or answer generation, without calling the model again for retrieved evidence.
- `src/config/ask-runtime.ts` — inject the existing OpenRouter API key and safety-model dependency into the guardrail.
- `src/domain/ask.ts` — represent unsafe prompts and safety-provider failures with domain errors.
- `src/http/server.ts` and `src/cli.ts` — preserve safe boundary responses for rejected prompts and provider failures.
- Related tests — cover the model adapter, guardrail, answer flow, runtime wiring, CLI, and HTTP behavior.

The model adapter uses OpenRouter's existing base URL and the model identifier `openai/gpt-oss-safeguard-20b`. The safety model sees only the user question. The answer model and retrieval context are not sent to this safety assessment.

## 2. Model and Validation

The safety model returns a structured safe/unsafe verdict. Validate the verdict with Zod before using it. Only an explicitly valid safe verdict allows the answer flow to continue; an unsafe, missing, malformed, or unavailable verdict blocks it. Do not return model reasoning or private diagnostics to the user.

The existing pattern guardrail remains active. Its question checks can reject known injection patterns before the LLM call, and its evidence checks remain in place after retrieval. The new model assessment runs once per request, before retrieval.

## 3. Contracts

No public CLI syntax or HTTP route changes.

- Internal safety input: the validated user question only.
- Internal safety result: a schema-validated safe/unsafe verdict.
- Unsafe question: raise the existing prompt rejection domain error; the HTTP boundary maps it to the existing client-error response and the CLI reports the rejection.
- Safety model unavailable or invalid output: raise a distinct domain service error; the HTTP boundary returns a generic server error without provider details, and the CLI provides its established diagnostic output with secret redaction.
- On either failure, do not perform retrieval or invoke answer generation.

## 4. Decisions and Trade-offs

- Retain the deterministic guardrail and add the model as a separate safety layer. This combines fast known-pattern detection with a semantic review while avoiding any dependency on the LLM for screening retrieved evidence.
- Fail closed: only a validated safe verdict proceeds. Provider failures and malformed results return errors rather than bypassing the check.
- Review the user question before retrieval so the safety decision is made before external model calls for embeddings or answers, and so retrieved evidence is not included in the safety-model input.
- Use the same OpenRouter API key and endpoint as the current LangChain models; do not add a separate credential.
- Keep the model's explanation private and expose a stable error message, reducing the chance of leaking internal prompt or provider details.
- A separate provider-failure domain error is needed because an unsafe user prompt is a client rejection, while an unavailable safety provider is a server failure.

## 5. Test Strategy (`node:test`)

- Model adapter tests validate the OpenRouter base URL, safeguard model identifier, structured safe/unsafe output, malformed responses, and provider failures without live requests.
- Guardrail tests prove existing pattern checks remain enabled, the safety model receives only the question, and model rejection or failure blocks the request.
- Answer-flow tests prove the safety check occurs before embedding, retrieval, and answer generation and that the model is called once per request.
- Runtime tests verify the existing OpenRouter key is injected without exposing it.
- CLI and HTTP tests verify unsafe prompts and provider failures map to their intended safe boundary messages and statuses.
- Run `npm run test` and `npm run typecheck`; fixtures and injected model clients must keep tests independent of network access.

## 6. Risks and Human Review

- **Human decisions recorded:** Safety-provider failures use the existing generic HTTP 500 response with a safe error message. The safeguard model is configured only by a project constant; no environment-variable override is added.
- The LLM review adds latency and OpenRouter usage to each question. Tests should assert one safety-model call per request to prevent accidental duplicate charges.
