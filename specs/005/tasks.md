# Tasks — CLI Error Diagnostics

1. - [x] Add a CLI diagnostic formatter with tests for categorized errors and complete stack traces.
   - Done when `src/cli.test.ts` verifies error category and message, the complete stack trace, stderr output, non-zero exit status, and unchanged successful output through injected dependencies and I/O.
   - Depends on: none.

2. - [x] Include nested causes in CLI diagnostics and redact secrets throughout the output.
   - Done when CLI tests verify nested cause messages and stacks are shown, representative API keys and credentials are redacted from messages, causes, and stacks, and ordinary diagnostic details remain readable.
   - Depends on: Task 1.

3. - [x] Preserve safe provider diagnostics through model error wrapping.
   - Done when `src/service/openrouter-chat-model.test.ts` verifies provider HTTP status and safe error codes remain available to the CLI, the cause chain is retained, and raw provider content or credentials are not exposed.
   - Depends on: Task 2.

4. - [x] Verify the CLI output for a failed answer-generation request end to end.
   - Done when a CLI-level test verifies an OpenRouter generation failure prints the useful error details and full stack by default, redacts secrets, returns a non-zero exit code, and does not change HTTP error responses.
   - Depends on: Tasks 2–3.

5. - [x] Run the complete verification suite and review the final diff.
   - Done when `npm run test` and `npm run typecheck` pass, diagnostics never read `.env`, and all prior tasks are checked only after their criteria pass.
   - Depends on: Tasks 1–4.
