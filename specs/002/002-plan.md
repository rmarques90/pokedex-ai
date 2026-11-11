# Vector Database Population Plan

## 1. Architecture

The population flow is an internal data script, not an HTTP or interactive CLI route. It keeps the project dependency direction: script boundary → service → store; domain schemas and text construction remain free of I/O.

Planned files to create or update:

- `package.json` — add runtime dependencies for LanceDB and LangChain's OpenAI-compatible embeddings integration; add `populate_db` and a combined collect-then-populate npm command.
- `.gitignore` — ignore the local LanceDB directory (and retain the existing generated-data ignore rule).
- `.env.example` — document the collection-name setting without credentials; `.env` remains ignored.
- `src/constants.ts` — export `EMBEDDING_MODEL = "qwen/qwen3-embedding-8b"` and the selected embedding dimension constant.
- `src/domain/pokemon-vector-document.ts` — data and Zod schemas for the 151 source records and the LanceDB row shape.
- `src/service/populate-vector-database.ts` — validate the full input and config, render embedding text, request document embeddings through LangChain, then coordinate replacement.
- `src/store/lance-db-store.ts` — local LanceDB operations behind a narrow store interface; keep file/database I/O out of the service's domain transformations.
- `src/scripts/populate-vector-database.ts` — load local runtime configuration and invoke the service.
- `src/scripts/collect-and-populate-vector-database.ts` — invoke the existing collector and only invoke population after collection succeeds.
- `src/scripts/*test.ts` — cover service validation/replacement behavior and script configuration/command sequencing with injected dependencies or child-process boundaries.
- `.githooks/pre-commit` (or the repository's configured hook path) — reject changes that remove or weaken the protected-collection deny list; hook installation/configuration must be explicit and documented.

The collector remains the source of `store/data/pokemon.json`. The population command reads it but does not alter its schema or collection behavior. Runtime configuration may load `.env`; development agents must not inspect `.env` contents.

## 2. Data model

- Define a Zod schema matching the approved collector JSON. Require exactly 151 unique National Pokédex IDs in the inclusive range 1–151, valid names, types, all six non-negative base stats, total, Biology text, image/source references, and attribution/license fields. Reject the complete input before opening a write path if any record is invalid.
- Define an embedding document with stable `id` (National Pokédex number), `text` (name, types, each base stat, total, and Biology description), and metadata containing the original structured fields and source/reference/license values.
- Define a LanceDB row schema with `id`, `text`, metadata fields, and `vector: number[]`. Validate embedding count, finite numeric elements, and the selected dimension before creating or swapping the target table.
- Store vectors at **4096 dimensions**, the model's native output size. This avoids reducing the model output for this initial 151-record dataset and fixes the table's vector shape. The embedding adapter should request/use 4096 dimensions explicitly if supported by OpenRouter and fail validation if the returned vectors differ.
- Read `LANCEDB_COLLECTION_NAME` from local runtime environment configuration. Validate its syntax and reject reserved/protected names using a deny list held in code; never derive the target name from the dataset or model output. Require `OPENROUTER_API_KEY` at runtime, without placing it in example configuration.

## 3. Contracts

### `npm run populate_db`

- **Input:** `store/data/pokemon.json`; `.env` values `LANCEDB_COLLECTION_NAME` and `OPENROUTER_API_KEY`; local database directory `store/lancedb`.
- **Success:** validates exactly the original 151 records, produces 151 embeddings through LangChain using OpenRouter's OpenAI-compatible embeddings endpoint and `EMBEDDING_MODEL`, and replaces the configured local LanceDB collection. Prints a concise success summary including collection name and record count.
- **Failure:** exits non-zero with a safe actionable message. Invalid/missing data or configuration and protected collection names fail before database mutation. Embedding or staging persistence failure retains the currently published collection.

### `npm run collect:populate-db`

- **Input:** same environment/database inputs as `populate_db`, plus the existing collector's inputs.
- **Success:** runs collection first, then population, and exits zero only when both steps succeed.
- **Failure:** exits non-zero; a failed collector prevents any database initialization or mutation.

### Replacement procedure

Build a uniquely named staging table in the same local LanceDB database, validate its 151 rows and vectors, then publish it as the configured collection. Preserve the prior collection until the staging table is complete. Because embedded LanceDB does not support table rename in the documented JS API, do not promise an atomic rename: use an explicit backup/restore sequence around `dropTable`/`createTable` (or equivalent supported operations), and restore the backup if publishing fails. Cleanup of stage/backup names must be restricted to names generated by this process and checked against the protected-name policy. The current collection remains readable during embedding and staging; brief unavailability during a local table replacement is a known limitation to document and test.

### Destructive-operation guardrail

Only the fixed local database path and validated configured collection may be touched. Deny-list matching must be exact and case-normalized. The pre-commit hook should fail closed when the protected guardrail implementation is changed, unless its required safeguard test/approval marker is present; exact mechanics are an implementation detail for the task breakdown, but bypass must be testable and documented. No operation accepts a model-selected collection or filesystem path.

## 4. Decisions, trade-offs, and risks

- **Dimension selected: 4096.** Qwen's official model card lists 4096 as Qwen3-Embedding-8B's native dimension and supports reduced output sizes. Native dimensions preserve the full representation; the local corpus is small enough that the larger vectors are a reasonable initial choice. Confirm this decision during plan review. [Qwen3-Embedding-8B model card](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- **LangChain/OpenRouter integration:** use LangChain `OpenAIEmbeddings` with OpenRouter's OpenAI-compatible embeddings endpoint configured as the base URL, model `qwen/qwen3-embedding-8b`, and API key from environment. This keeps the embedding abstraction in LangChain while allowing model/provider selection through OpenRouter. [LangChain JavaScript OpenAI integration](https://reference.langchain.com/javascript/langchain-openai), [OpenRouter embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)
- **LanceDB integration:** use the official JavaScript SDK directly behind the store interface rather than depending on a LangChain LanceDB vector-store adapter. The SDK documents local connections and table creation; its embedded connection explicitly does not support table renaming. This makes the staging/publish behavior explicit and avoids relying on unsupported atomic rename behavior. [LanceDB JavaScript SDK](https://lancedb.github.io/lancedb/js/), [LanceDB `renameTable` API](https://lancedb.github.io/lancedb/js/classes/Connection/)
- **Batching:** send the 151 texts through LangChain's `embedDocuments` batching support with a bounded batch size. This limits request overhead while keeping the dataset within the provider's embedding API constraints. Retry policy must be bounded; permanent/partial failures abort before publishing.
- **Replacement is not transactionally atomic:** local table swap needs a backup/restore sequence, and a crash between table operations may require manual recovery. Keep the backup until the new target opens and row count verifies; startup should detect stale stage/backup tables and refuse destructive cleanup rather than guessing.
- **Secrets/cost:** the command needs an OpenRouter API key and sends Pokémon text to the provider. Missing credentials fail before database writes; logs must not print the key. Embedding provider cost, rate limits, network failure, and retry time affect the one-shot operation.
- **Hook reliability:** Git hooks can be bypassed with `--no-verify`; the hook is a guardrail, not a security boundary. Keep a unit test that verifies protected names and the pre-commit check, and document hook setup. Human review remains required for modifying safeguards.
- **Decision for review:** approve the 4096 dimension and the staging/backup replacement contract, including the brief local collection-unavailable interval. The spec's requirement to preserve the old collection through failed generation/persistence is met, while process-crash recovery requires explicit stale-backup handling.

## 5. Test strategy (`node:test`)

- Zod dataset tests: valid 151-record fixture passes; missing, malformed, duplicate, out-of-range, incomplete-stat, and invalid metadata inputs fail before store calls.
- Embedding service tests with a fake LangChain `Embeddings` implementation: verify text includes required fields; model/configuration is passed correctly; output count, finite values, and 4096 dimensions are enforced; errors abort before publish.
- Store tests in temporary database directories: first creation produces 151 rows; rerun replaces instead of appending; prior data survives failures during embedding and staging; publishing failure restores prior data; protected and malformed collection names cause no destructive calls; stale stage/backup state is surfaced safely.
- Script tests: absent collection name/API key fails without DB writes; `collect:populate-db` does not run population after collector failure and runs it after success; outputs omit credential values.
- Guardrail tests: deny-listed names are rejected and the pre-commit check rejects an attempted weakening or removal of the deny list.
- Run `npm run test` and `npm run typecheck` as implementation acceptance checks; this plan phase does not run or add implementation tests.
