# CLI Error Diagnostics Specification

## 1. Context and problem

When the CLI fails, it can print only a generic message such as “OpenRouter answer generation failed.” This hides the error context needed to investigate and correct failures. CLI users need detailed diagnostics by default while keeping secrets out of terminal output.

## 2. User stories

- As a developer using the CLI, I want actionable details and the complete stack trace whenever a command fails, so that I can identify and correct the cause.
- As a developer using the CLI, I want credentials and other secrets redacted from diagnostic output, so that troubleshooting does not expose sensitive values.

## 3. Functional requirements

- **RF-1:** When a CLI command fails, the system shall identify the error category and display its available diagnostic message instead of replacing it with a generic message.
- **RF-2:** When a CLI command fails, the system shall display the complete stack trace by default.
- **RF-3:** When an error contains nested causes or provider diagnostics, the system shall include the available cause details, provider status, and safe error codes in the CLI diagnostic output.
- **RF-4:** The system shall redact API keys, credentials, and other secret values from all CLI diagnostic output, including messages and stack traces.
- **RF-5:** The system shall preserve the CLI's non-zero exit status when a command fails.

## 4. Acceptance criteria

- When OpenRouter answer generation fails, the CLI shall display the error category, available provider details, and complete stack trace by default.
- When an error has a nested cause, the CLI shall include its available diagnostic details and stack trace in the output.
- When an error message, cause, or stack trace contains a secret value, the CLI shall redact that value before displaying the diagnostic.
- When a CLI command fails, the process shall return a non-zero exit status.

## 5. Out of scope

- Changing HTTP error responses or server-side logging.
- Adding persistent log files, telemetry, or external error reporting.
- Changing successful CLI output or the answer-generation behavior.

## 6. Open questions

- No open questions remain for this specification.
