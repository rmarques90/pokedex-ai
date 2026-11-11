# CLI Error Diagnostics Technical Plan

## 1. Architecture

Keep error translation at the CLI boundary: `CLI → service → store`. The service and model adapter preserve typed domain errors and their causes; the CLI formats a diagnostic for terminal output. The HTTP boundary keeps its current response behavior. Diagnostic formatting must redact secrets without reading `.env` or logging environment values.

Files expected to change:

- `src/cli.ts` — format failures with their error category, message, available causes, and complete stack trace by default; preserve non-zero exit status.
- `src/domain/ask.ts` — review the existing domain error classes and `Error.cause` usage; add or adjust error metadata only if the CLI cannot identify available diagnostic details otherwise.
- `src/service/openrouter-chat-model.ts` — preserve safe provider status/code details and the original cause when wrapping generation failures.
- `src/cli.test.ts` — cover diagnostic output, redaction, and exit status using injected dependencies and I/O.
- `src/service/openrouter-chat-model.test.ts` — cover preservation of provider status/code and nested causes without making provider requests.

The implementation should avoid adding I/O to the domain and should keep diagnostics formatting in the CLI boundary or a small CLI-focused helper.

## 2. Data model

- Reuse native `Error.name`, `Error.message`, `Error.stack`, and `Error.cause` where available.
- Reuse existing `AskDomainError` subclasses to identify expected failure categories.
- Preserve provider HTTP status and safe provider error codes already extracted by the model adapter.
- No Zod schema is expected: these are internal runtime errors, not external request data. Revisit only if an explicit diagnostic result crosses a validated boundary.

## 3. Contracts

### CLI

- Preserve `npm run cli ask "<question>"` and its current success output.
- When an ask command fails, write the diagnostic to stderr, include the error category and message, print the complete stack trace by default, and return a non-zero exit code.
- Include available nested cause details and safe provider status/code values.
- Redact secrets from error messages, causes, and stack traces before writing them to stderr.

### HTTP

- Keep current HTTP error status and response bodies unchanged; server error diagnostics are outside this activity.

## 4. Decisions and trade-offs

- **Stack trace — approved:** Show the complete stack trace by default for CLI errors.
- **Secret handling — required by spec and constitution:** Diagnostic detail must not expose API keys, credentials, or secret values. Redaction must apply to the entire cause chain and stack text, not only the top-level message. Never read `.env` to produce diagnostics.
- **Diagnostic detail:** Preserve safe provider status and code fields already available. Raw provider payloads may contain secrets or user data, so their inclusion needs human review before implementation.
- **Output compatibility:** Successful CLI output remains unchanged; failures continue to use stderr and a non-zero exit status.
- **Risks for review:** Redaction that is too broad can remove useful debugging detail; redaction that is too narrow can expose credentials. Tests should include representative API-key formats and nested causes.

## 5. Test strategy (`node:test`)

- CLI tests: verify error category and message, full stack output by default, nested cause details, redaction of secret values in messages and stacks, stderr usage, non-zero exit status, and unchanged success output.
- Model adapter tests: verify provider status/code and causes remain available to the CLI formatter while raw sensitive provider content is not exposed.
- Run `npm run test` and `npm run typecheck`; no external OpenRouter request or real credential is required.
