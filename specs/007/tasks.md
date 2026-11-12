# 007 Tasks: LLM Prompt Injection Protection

1. - [x] Add the safeguard model constant.
   - Define the project constant for `openai/gpt-oss-safeguard-20b`; do not add an environment-variable override.
   - **Ready when:** a unit test verifies the configured model identifier and `npm run typecheck` passes.
   - **Dependencies:** None.

2. - [x] Implement the OpenRouter safety-model adapter and verdict schema.
   - Add a LangChain adapter using the existing OpenRouter endpoint and API key. Validate a structured safe/unsafe verdict with Zod; keep provider details out of user-facing messages.
   - **Ready when:** injected-client tests cover safe, unsafe, malformed, and provider-failure results without network access; `npm run typecheck` passes.
   - **Dependencies:** Task 1.

3. - [x] Add a distinct domain error for safety-model failures.
   - Keep unsafe-question rejection represented by `PromptGuardrailError`; represent model unavailability or invalid assessment as a server-side domain error.
   - **Ready when:** unit tests verify the error categories and safe messages do not expose provider details; `npm run typecheck` passes.
   - **Dependencies:** None.

4. - [x] Integrate the LLM assessment with the existing guardrail.
   - Preserve current pattern checks for the question and retrieved evidence. Add the model assessment for the user question only, and do not pass retrieved evidence to the safety model.
   - **Ready when:** guardrail tests prove existing checks remain active, unsafe questions are rejected, evidence is not sent to the model, and model failures block the request; `npm run typecheck` passes.
   - **Dependencies:** Tasks 2–3.

5. - [x] Wire OpenRouter configuration into the ask runtime.
   - Inject the existing OpenRouter API key and a testable safety-model client through runtime dependencies; keep model selection constant-based.
   - **Ready when:** runtime tests verify correct dependency wiring and that the API key is not exposed in errors; `npm run typecheck` passes.
   - **Dependencies:** Tasks 2–4.

6. - [x] Enforce one pre-retrieval safety review per question.
   - Arrange the answer flow so the new model reviews the question before embeddings, retrieval, or answer generation, and is called once per request. Keep the existing post-retrieval evidence pattern check.
   - **Ready when:** answer-flow tests verify call order, one model invocation, no retrieval or generation after unsafe verdicts or provider failures, and normal continuation for safe questions; `npm run typecheck` passes.
   - **Dependencies:** Tasks 4–5.

7. - [x] Verify CLI and HTTP error handling.
   - Map unsafe prompts through the existing client-error behavior and safety-provider failures to generic HTTP 500 responses. Preserve CLI diagnostics and secret redaction.
   - **Ready when:** CLI and HTTP tests verify user-facing messages/statuses and ensure provider details are not exposed; `npm run typecheck` passes.
   - **Dependencies:** Tasks 3–6.

8. - [x] Run final project checks and review the guardrail integration.
   - Run the full suite and typecheck; confirm the LLM assesses only the user question, the existing pattern layer remains enabled, and every request fails closed when the safety assessment is unavailable or invalid.
   - **Ready when:** `npm run test` and `npm run typecheck` both pass; all previous task checkboxes are complete.
   - **Dependencies:** Task 7.
