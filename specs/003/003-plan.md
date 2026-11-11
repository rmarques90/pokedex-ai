# LLM Integration Technical Plan

## 1. Architecture

The request flow will follow `HTTP/CLI → service → store`. The service coordinates retrieval, prompt-safety checks, and answer generation; the store owns LanceDB access. The domain remains free of network and database I/O. Reuse the existing local LanceDB connection and vector-document schema.

Planned files to create or update:

- `src/constants.ts` — add `CHAT_MODEL = '~deepseek/deepseek-flash-latest'` and the OpenRouter-compatible base URL, keeping the model identifier in one place.
- `src/domain/ask.ts` — Zod schemas and types for the question, retrieved evidence, source references, answer result, and boundary inputs.
- `src/store/lance-db-store.ts` — extend the existing store contract with vector similarity search against the configured collection; return record text, metadata, and source references.
- `src/store/local-lancedb.ts` — expose the configured collection to the ask flow using the existing local database connection and validated runtime configuration.
- `src/service/answer-question.ts` — validate or accept domain input, retrieve evidence, call the model, enforce evidence-only output and abstention behavior, and return answer plus sources. The LangChain prompt-injection guardrail will be implemented in its own later task in this activity, as required by the constitution.
- `src/service/openrouter-chat-model.ts` — configure LangChain's chat model with OpenRouter and `CHAT_MODEL`; obtain credentials from runtime environment without logging them.
- `src/cli.ts` — implement the one-shot `ask` command, parse the supplied question, invoke the service, and print the answer and references.
- `src/index.ts` and `src/http/*` — implement the `node:http` server and `POST /ask` boundary, validate the JSON request, invoke the service, and translate errors into HTTP responses.
- `src/domain/ask.test.ts`, `src/store/lance-db-store.test.ts`, `src/service/answer-question.test.ts`, `src/http/*test.ts`, and `src/cli.test.ts` — cover schemas and behavior with `node:test`, fakes, and temporary/local test resources as appropriate.
- `package.json` — retain the existing `cli` script and `dev` server script; positional arguments after `npm run cli` are forwarded to the CLI entry point.

The current LanceDB store supports collection inspection and replacement but not retrieval. Add a narrow search method without exposing the database connection to the service. LangChain owns chat orchestration and prompt-safety integration; it must not add a web-search or other external-knowledge tool.

## 2. Data model

- `AskQuestionSchema`: an object containing a non-empty question string. The same domain type is used after CLI and HTTP boundary parsing.
- `AskRequestSchema`: the HTTP JSON body, initially `{ "question": string }`.
- `RetrievedEvidenceSchema`: a retrieved record's text plus Pokémon identity and source URL metadata, validated before it is used to construct model context.
- `AskResultSchema`: an answer string, an abstention indicator or equivalent explicit result state, and a list of unique source references used for the answer.
- `ChatRuntimeConfigSchema`: the required OpenRouter API key and configured LanceDB collection name; keep secrets runtime-only and never include them in errors or outputs.
- The existing `PokemonVectorRowSchema` remains the stored record contract. Search results must be normalized and validated against the fields required for evidence and citations; avoid changing the 151-record population schema unless implementation reveals a concrete incompatibility.
- Domain errors should distinguish invalid question, insufficient evidence, unavailable vector collection, retrieval failure, and model/provider failure where callers need different boundary behavior.

## 3. Contracts

### CLI

- **Invocation:** `npm run cli ask my-question` (for a multi-word question, quote the question argument). npm forwards positional arguments to the selected script; use `--` when passing flags that npm might parse.
- **Input:** one question as a command argument; no interactive prompt or follow-up turn.
- **Success:** print the answer and source URLs, then exit successfully.
- **Insufficient evidence:** print the defined abstention message and any references that support that decision, then exit successfully.
- **Invalid input or service failure:** print a safe, actionable message to stderr and exit non-zero; never print credentials or raw provider request configuration.

### HTTP

- **Route:** `POST /ask`.
- **Request:** JSON object `{ "question": "..." }`, validated with Zod.
- **Success response:** JSON object containing `answer`, `abstained`, and `sources` (source URL references). Exact source object fields should be aligned with the existing Pokémon record metadata during implementation.
- **Failures:** malformed JSON or invalid question receives a client error; server-side failures receive HTTP `500` and a safe explanatory message. Responses must not expose stack traces, credentials, or sensitive provider details.
- `npm run dev` starts the server on the existing documented `localhost:3000` address.

### Retrieval and generation

- Embed the question with the same embedding model and vector dimensions used to populate the LanceDB collection, then search only the configured collection.
- Pass only validated retrieved records to LangChain's guarded generation flow. No external retrieval or tools are registered.
- Return references drawn from the records actually used as evidence, without fabricating URLs.
- The model is selected by `CHAT_MODEL`; API credentials come from runtime configuration and are not stored in source or logged.

## 4. Decisions and trade-offs

- **Retrieval policy:** start with `topK = 5` and no score threshold. The service must still abstain if the retrieved evidence does not support an answer. Calibrate `topK` and any future threshold against observed questions and retrieval quality.
- **Prompt-injection guardrail:** implement the LangChain guardrail in a dedicated later task in this activity. This is required by the constitution and must be complete before the feature is considered done. Treat user and retrieved text as untrusted input throughout.
- **Abstention contract:** when evidence is insufficient, return a clear abstention message with the `abstained` result state; include only references actually retrieved and used. CLI exits successfully for this expected outcome.
- **HTTP failure mapping:** malformed JSON and invalid questions receive client errors; server-side failures use HTTP `500` with a safe message. Keep internal errors, stack traces, and provider details out of public responses.
- **CLI command registration:** dispatch `ask` through the existing `cli` npm script using `npm run cli ask my-question`; no separate npm alias is needed. `src/cli.ts` still needs to be created.
- **Response format approved:** use `answer`, `abstained`, and `sources` in the HTTP response; derive source URLs from records used as evidence.
- **Model alias:** the requested identifier starts with `~`, which OpenRouter uses for a latest-family alias. This follows the request and can resolve to a different underlying model version over time; model changes can affect response quality and behavior.
- **Secrets and external calls:** runtime requests require `OPENROUTER_API_KEY` and send the question plus selected Pokémon evidence to OpenRouter. Keep `.env` unread by development tooling, never commit credentials, and redact provider errors.
- **Embedding compatibility:** question vectors must use the exact embedding model and dimensions used to populate LanceDB. Reuse the existing embedding integration rather than introducing a separate query-embedding configuration.
- **Review status:** the user approved the initial `topK` policy, deferred guardrail implementation to a dedicated later task, confirmed the server-error behavior, selected CLI dispatch through `cli`, and approved the response shape. No unresolved plan decision blocks task breakdown.

## 5. Test strategy (`node:test`)

- Domain tests: accept valid questions and result objects; reject empty/malformed requests and invalid evidence/source metadata.
- Store tests: search only the configured collection, return normalized/validated evidence with metadata, handle an empty collection, and propagate LanceDB failures through a domain-appropriate error without mutation.
- Service tests with fake store, guardrail, and chat model: prove evidence is retrieved before generation; only retrieved evidence is passed to the model; injection-like content is guarded; source URLs come only from used records; insufficient evidence abstains without an unsupported model answer; model/retrieval failures are handled safely.
- OpenRouter adapter tests: assert configured model and base URL, runtime key forwarding to the client, and safe handling of provider errors without logging or returning credentials.
- CLI tests: verify one-shot argument parsing, answer/source output, abstention behavior, invalid-input behavior, and exit status using injected dependencies or a child-process boundary.
- HTTP tests: verify `POST /ask` success payload, Zod validation, malformed JSON handling, abstention response, error-to-status mapping, and absence of secrets in responses.
- Run `npm run test` and `npm run typecheck` during implementation. The plan phase adds no implementation or tests.
