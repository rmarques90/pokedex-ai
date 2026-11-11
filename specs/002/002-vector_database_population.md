# Vector Database Population Specification

## 1. Context and problem

The project has a validated local dataset for the original 151 base-form Pokémon. Retrieval-augmented generation requires that dataset to be embedded and available in a local LanceDB collection. Maintainers need repeatable commands to populate the collection directly or collect and populate in one run. Existing source data and database contents must be checked, and a failed rebuild must not expose an empty or partial collection.

## 2. User stories

- As a project maintainer, I want to populate LanceDB from the validated local Pokémon dataset, so that the RAG workflow can retrieve relevant Pokémon records.
- As a project maintainer, I want a single command to collect the initial dataset and populate LanceDB, so that I can bootstrap the local RAG data store consistently.
- As a project maintainer, I want the target collection name configured locally and the database files excluded from Git, so that local data stays configurable and out of the repository.

## 3. Functional requirements

- **RF-1:** Before database changes, the population process shall verify that `store/data/pokemon.json` exists, contains exactly 151 records for National Pokédex numbers 001–151, and conforms to the approved dataset schema.
- **RF-2:** Before rebuilding, the process shall inspect whether the local LanceDB database and configured collection already exist and report that state. An existing collection shall not cause the process to skip repopulation.
- **RF-3:** The process shall initialize or open a local LanceDB database and create the configured collection when it does not exist.
- **RF-4:** For every Pokémon, the vectorized text shall include its name, types, six base stats, total base stats, and Bulbapedia Biology description. Source URLs, attribution, license, Pokédex number, and other structured fields shall remain available as record metadata.
- **RF-5:** The process shall generate embeddings through LangChain and OpenRouter using the `qwen/qwen3-embedding-8b` model, and store vectors and associated records in the configured LanceDB collection.
- **RF-6:** The model identifier shall be declared once as the `EMBEDDING_MODEL` constant in the project's `src/constants.ts` file and used by the embedding integration.
- **RF-7:** Each successful population run shall replace all prior records in the configured collection with records for the complete validated dataset; it shall not append duplicates.
- **RF-8:** The configured collection name shall be read from `LANCEDB_COLLECTION_NAME` in the local `.env` configuration. The secret-free example configuration may be committed, but `.env` and local database files shall be excluded from Git.
- **RF-9:** The process shall be restricted to the configured local database and enforce destructive-operation guardrails, including a deny list for protected collection names and pre-commit checks for changes to those safeguards. It shall not allow model-generated input to select or broaden the destructive target.
- **RF-10:** The project shall provide a `populate_db` npm command that validates the local source data and configuration, initializes or opens LanceDB, and performs the collection rebuild.
- **RF-11:** The project shall provide a combined npm command that runs the existing data collection first and starts/populates LanceDB only after collection completes successfully.
- **RF-12:** The process shall keep the current collection available until the new dataset and its embeddings are ready to replace it. If collection, embedding, validation, or persistence fails, the current collection shall remain usable and the command shall report failure without exposing a partial replacement.
- **RF-13:** Local LanceDB database files and generated local data shall be excluded from Git.

## 4. Acceptance criteria

- When `populate_db` starts, the system shall validate the complete source JSON and required configuration before modifying LanceDB.
- When the source JSON is missing, malformed, incomplete, or contains duplicate or out-of-range Pokédex numbers, the system shall fail without changing the current collection.
- When the configured local database or collection already exists, the system shall report its existence and replace its prior records after the new complete population is ready.
- When the configured collection does not exist, the system shall create it locally and populate it with the validated dataset.
- When the process generates embeddings, the system shall use the `qwen/qwen3-embedding-8b` model identifier declared as `EMBEDDING_MODEL` in `src/constants.ts`.
- When population succeeds, the system shall make exactly one record per Pokédex number 001–151 available in LanceDB, with embeddings, searchable Pokémon text, source references, and structured metadata.
- When embedding generation or persistence fails during a rebuild, the system shall leave the previous complete collection usable and report the failure.
- When the collection name is missing, invalid, or protected, the system shall stop before any destructive database operation.
- When a change bypasses or weakens the destructive-operation deny list, the pre-commit guardrail shall reject the change.
- When the combined command's data collection fails, the system shall not initialize or modify the LanceDB collection.
- When the combined command's collection succeeds, the system shall proceed to validate and populate the local LanceDB collection.
- When local database files are created, Git shall ignore them.

## 5. Out of scope

- Exposing database population through HTTP or an interactive CLI.
- Serving user queries or implementing retrieval/chat endpoints.
- Updating or deleting individual Pokémon records independently.
- Managing a remote or production LanceDB deployment.
- Selecting vector dimensions, batching strategy, or database schema; those decisions belong in the technical plan.

## 6. Open questions

- The embedding vector dimensions must be selected in the technical plan before implementation.
