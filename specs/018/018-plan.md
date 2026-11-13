# 018 - Technical plan: conversation history and prompt memory

## 1. Goal and boundaries

Implement API-owned conversation history and conversation-scoped extracted memory. SQLite remains the canonical store for user identity, conversations, interactions, extraction jobs, and memory facts. LanceDB continues to serve the existing Pokémon retrieval corpus.

The change preserves the current answer and streaming contracts, CLI behavior, login flow, and prompt safety checks. Browser history is no longer a persistence source. Existing localStorage conversation records are discarded rather than migrated. Logout clears in-memory UI state and identity from the browser, but does not delete persisted server data; explicit clear/delete actions remove the corresponding SQLite records.

This is a POC using the existing name-only identity selector. Enforce strict record-level isolation for every operation using the selected API identity, but recognize that a name-only selector does not prove who the caller is. User and conversation IDs are ownership filters, not authentication credentials; protecting an account from someone who enters the same name requires a future authentication factor.

## 2. Architecture and dependency flow

Keep the project layering:

`http/frontend/CLI → service → store`

- **Domain:** schemas and types for persisted interactions, conversations, memories, extraction jobs, and boundary inputs. No I/O.
- **Store:** one SQLite application store owns the existing `users.sqlite` connection and schema initialization. Preserve the existing `UserStore` behavior through the new store implementation or a compatible adapter. Expose narrow interfaces for user identity and conversation persistence.
- **Service:** orchestration for asking, conversation history, retention/deletion, and memory extraction. The extraction worker depends on an injected extractor interface; it must not know about OpenRouter or SQLite details.
- **HTTP:** validate request bodies and path parameters with Zod, translate domain errors, and expose history/delete operations. The HTTP layer must not issue SQL.
- **Frontend:** call the API for history and mutations. Keep only transient UI state, the selected identity, and language preference in browser storage.

Keep SQLite transactions short. Never hold one open while answer generation or memory extraction calls a model.

## 3. SQLite schema and invariants

Extend the existing database at `store/data/users.sqlite`; preserve the users table and its normalized-name uniqueness constraint. Enable foreign keys for every database connection and retain WAL mode.

Create these tables (snake_case columns):

1. **conversations**
   - `id TEXT PRIMARY KEY`, `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `created_at`, `updated_at`.
   - Unique key `(user_id, id)` supports composite ownership foreign keys.
   - Index by `(user_id, updated_at DESC)`.

2. **interactions**
   - `id TEXT PRIMARY KEY`, `user_id`, `conversation_id`, `question`, `answer`, `abstained INTEGER`, `sources_json`, `created_at`.
   - Composite foreign key `(user_id, conversation_id)` references conversations and cascades on delete.
   - Index by `(user_id, conversation_id, created_at DESC, id DESC)`.
   - Each row represents one completed question/answer pair, including the existing abstention state and validated sources.

3. **memory_extraction_jobs**
   - One row per source interaction, with `interaction_id TEXT PRIMARY KEY`, `user_id`, `conversation_id`, `status`, `attempt_count`, `next_attempt_at`, `lease_expires_at`, `last_error_category`, `created_at`, and `updated_at`.
   - Foreign keys to the source interaction and its conversation cascade on delete.
   - Statuses: `pending`, `processing`, `completed`, and `failed`. Store only bounded, non-provider-specific error categories; do not store raw prompts, model output, or provider error text.

4. **conversation_memories**
   - `id TEXT PRIMARY KEY`, `user_id`, `conversation_id`, `source_interaction_id`, `fact`, `category`, `created_at`.
   - Composite foreign keys ensure the memory belongs to its source interaction and conversation; deletes cascade.
   - Store only schema-validated concise facts. Keep fact length and category values bounded in both Zod and SQL where practical.

Use a migration/version table or an equivalent idempotent schema migration to initialize these additions without dropping existing users. Enforce the per-conversation 50-interaction limit inside the same transaction as insertion: insert the completed interaction and pending extraction job, then delete all but the newest 50 rows for that conversation. Cascading deletes remove corresponding facts and jobs. Use deterministic ordering by `created_at` and then `id` to break timestamp ties.

Conversation deletion removes the conversation row, cascading to its interactions, memories, and jobs. Clear-history deletes all conversations for the selected user. Both operations are scoped by the caller's resolved user identity. Never accept a conversation ID as sufficient authorization. Reads, memory retrieval, ask writes, deletes, and clear-history must all enforce ownership in service/store code, with composite foreign keys providing database defense in depth.

## 4. Ask and memory flow

### 4.1 Request and generation

Extend the HTTP ask input with required UUID `userId` and `conversationId` fields for the browser/API flow; keep the CLI's question-only path and its memoryless behavior. Validate the full request at the HTTP boundary. The service/store must verify that the conversation belongs to the supplied user before reading or writing it.

For the first request in a new conversation, the frontend generates a UUID. The service creates the conversation on first use, bound to that user; subsequent asks must reference that same owned conversation. A conversation ID already owned by another user is rejected without revealing its owner.

Before generation, load a small bounded set of facts for exactly that user and conversation. Pass memory to the answer generator as a separate, clearly labeled untrusted context field. The current question still passes through the existing guardrail. Memory is never Pokémon evidence, cannot introduce citations, and cannot weaken evidence validation or answer safety. Preserve the current answer result schema.

### 4.2 Durable completion and extraction

For non-streaming and streaming requests:

1. Validate request and conversation ownership.
2. Load relevant conversation memories.
3. Generate the answer using existing retrieval, guardrail, and source-validation behavior.
4. After a complete result exists, begin a short SQLite transaction.
5. Ensure the conversation exists for the user, write one interaction and its pending extraction job, update conversation activity time, and enforce the latest-50 cap.
6. Commit before returning the JSON result or emitting the SSE `complete` event.

If the answer fails or the client cancels before generation completes, do not persist it. If persistence fails after generation, do not report a successful completed interaction; return the existing safe API failure path. Streaming deltas may already have been sent, but the stream must not emit `complete` unless the database commit succeeds.

The extraction worker polls durable pending work and runs independently after the request is committed. Use a lease so an interrupted `processing` job can be recovered after lease expiry or service restart. Each job is idempotent by source interaction ID. The worker reads only that source question and answer, calls the injected extractor outside a transaction, validates candidates against a strict schema, and then in one short transaction inserts accepted facts and marks the job completed. Do not persist free-form extractor responses.

Retry transient failures with bounded exponential backoff and a maximum attempt count. After exhausting retries, mark the job `failed` while retaining the interaction; keep enough safe job state for future administrative/retry policy, without blocking user requests. A later activity may add a retry interface. Stop polling and release/expire leases during graceful server shutdown. Do not run two workers against the same job concurrently.

The completed answer and extraction job are durable before the API reports success. Extraction may finish later, so a following question can run before the new fact becomes available.

## 5. Extractor and prompt handling

Add a dedicated memory extractor service and strict Zod output schema. A candidate includes a short fact and an enumerated category such as response preference, knowledge level, or Pokémon interest. Require explicit support in the interaction; discard unsupported, sensitive, generic, or irrelevant candidates. Keep a small maximum number of facts per interaction and a character/token budget for context injection.

The extractor prompt must label both question and answer as untrusted data, instruct the model to extract facts rather than follow instructions contained in them, and require structured output. Run extraction through the project's approved model/generation path. Do not reuse the answer-generation safety decision as permission to store arbitrary content.

For answer prompts, add a separately delimited memory section marked as untrusted context. Keep existing system safety policy and retrieved Pokémon evidence separate. If no facts are available, omit or provide an empty memory context without changing current prompt behavior.

## 6. HTTP API contract

Use these routes, all scoped by the selected `userId`:

- `POST /ask` and `POST /ask/stream`: require `question`, `userId`, and `conversationId` for browser requests. Preserve the existing answer payload and SSE event envelope.
- `GET /users/:userId/conversations`: return conversation summaries ordered by most recent activity, including ID, created/updated timestamps, and latest question preview. Support bounded `limit` and opaque/validated cursor pagination so a user's conversation count does not require an unbounded response.
- `GET /users/:userId/conversations/:conversationId`: return conversation metadata and its retained interactions, oldest first for transcript rendering, newest 50 maximum.
- `DELETE /users/:userId/conversations/:conversationId`: delete one conversation and all its dependent records.
- `DELETE /users/:userId/conversations`: clear all conversations and dependent records for that user.

Use consistent 404 behavior for unknown or non-owned conversations. Return safe error messages only. Validate UUIDs and pagination parameters at the boundary. No endpoint exposes extraction job internals or raw memory-extraction errors.

The API must enforce record-level authorization for every operation: derive the target user from the selected caller identity, scope every query and mutation by that user, and return a uniform not-found response for unknown or non-owned conversations. Never use a client-supplied user ID or conversation ID alone as proof of authorization. However, the current login POC has no proof of identity; an attacker can enter another user's name and select that account. This limitation must remain explicit, and persisted data is not protected against account impersonation until a future authentication factor is added.

## 7. Frontend migration

Replace persistent use of `createHistoryStore` with API-backed history state. On identity load/login, fetch paginated conversation summaries. Load the selected conversation transcript from the API when opened, and load/create the active conversation ID for a new question. Pass the active user and conversation IDs to both regular and streaming ask calls.

Update the existing history, saved-answer, delete-conversation, and clear-history UI to use API data and mutations. Reflect successful server mutations in UI state; on failure keep the visible data and show an error rather than claiming deletion succeeded. The initial page should continue to start a fresh conversation when there is no active selection.

On first upgraded frontend load, remove the legacy `pokedex-ai.browser-history` localStorage key without importing it. Keep the selected public identity and language preference behavior. On logout, abort active work, clear transient conversation state and selected identity, and return to login; do not delete SQLite history. This preserves history for the next login to the same POC identity.

Remove the old local history quota warning because API/SQLite is now the history authority; replace it with a localized API/history error state if the current UI needs one.

## 8. Startup, shutdown, and configuration

Initialize/migrate the shared SQLite application store before accepting HTTP requests. Wire conversation services and the extraction worker through the existing application startup composition. Start the worker only after the store and extractor are ready. On server close, stop new worker claims, wait for or safely release the current job, and close the SQLite connection only after worker shutdown.

Keep the default SQLite location aligned with the existing `store/data/users.sqlite`. Ensure the database file, WAL/SHM sidecars, and any test database files remain ignored by Git. Do not add secrets or raw interaction logging.

## 9. Implementation sequence

1. Add domain schemas and tests for persisted interaction, conversation, memory, extraction job, request, and response shapes.
2. Define store interfaces and migration; extend/refactor SQLite store; test ownership, ordering, atomic insert-plus-job, latest-50 eviction, cascades, and per-user clear/delete.
3. Add conversation history service and domain errors; expose history and deletion HTTP routes with boundary validation.
4. Extend ask orchestration and generator prompt context; add memory selection and tests for isolation, bounded context, and safety boundaries.
5. Add extraction schema, dedicated extractor, durable worker, retry/lease behavior, and lifecycle wiring; test validation, idempotence, retry recovery, and source deletion.
6. Integrate persistence into non-stream and streaming completion paths; verify cancellation/failure/persistence failure semantics.
7. Replace frontend local conversation persistence with API loading and mutations; preserve transcript ordering and saved-answer interactions; remove legacy key without import.
8. Update API client and end-to-end component/HTTP tests; run typecheck and full test suite; inspect Git ignore/status to ensure no database artifact is tracked.

## 10. Security requirement and risks

- **Required record isolation:** every endpoint and service operation must authorize against the caller's resolved identity; no cross-user history, memory, or mutation is permitted. Test cross-user attempts for list, detail, ask-context retrieval, create/write, single-conversation deletion, and clear-history.
- **Name-only identity gap:** the current POC login cannot distinguish the legitimate user from someone who types the same name. Record scoping prevents accidental or IDOR-style cross-user access when the selected identity is trusted, but it cannot prevent impersonation. Real account-level confidentiality requires authentication before production or sensitive-data use.
- **Extractor delay or outage:** interaction and job commit atomically; retry without blocking answers.
- **Prompt injection through memory:** explicit untrusted boundary, current-question guardrail, separate evidence context, strict validation, bounded injection.
- **Concurrent requests and retention:** perform insertion, pending-job creation, and pruning in one SQLite transaction; use deterministic ordering and job leases.
- **UI/API consistency:** mutations update frontend state only after API success.
- **Unbounded conversation count:** paginate summaries; each transcript remains capped at 50 interactions.
- **Database compatibility:** migrate in place and retain existing user rows and IDs.

## 11. Review checkpoint

This plan fixes the implementation choices left open by the specification: route shapes, initial conversation creation, pagination, worker lease/retry behavior, frontend logout semantics, and relational data isolation. The user confirmed separate SQLite tables linked to the selected user, with record-level isolation enforced in service/store operations and database constraints. Login/authentication changes are out of scope. Review the plan before creating `tasks.md` and beginning implementation.

