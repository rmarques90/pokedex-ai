# 018 - Conversation history and prompt memory

## 1. Context and problem

Activity 017 added name-based identity selection and SQLite-backed user records. The assistant still stores its conversation history only in browser storage, and answer generation does not use prior interactions. The next step is to persist completed interactions in SQLite and derive a small, validated memory from each interaction so relevant details can improve later answers in the same conversation.

The project already uses SQLite for user identity and LanceDB for the Pokémon retrieval corpus. Conversation records need user/conversation relationships, bounded retention, and atomic deletion. Extracted memories are small, structured facts rather than a large document corpus.

## 2. User stories

- As a signed-in user, I want completed questions and answers to remain available after reloads and API restarts.
- As a user continuing a conversation, I want the assistant to use relevant details I shared earlier in that conversation without replaying the entire transcript.
- As a user, I want older interactions to be removed automatically so only the latest 50 are retained.
- As an operator, I want history and memory stored by the API in the existing SQLite database, not in browser storage or the Pokémon vector corpus.

## 3. Functional requirements

- **RF-1:** Persist each completed user question and assistant answer as one interaction associated with a user and a conversation. A partial stream, failed answer, or cancelled request is not a completed interaction.
- **RF-2:** Persist the assistant answer's existing abstention state and source references with the interaction so the saved transcript can be reconstructed without changing the answer contract.
- **RF-3:** Keep at most the latest 50 completed interactions per conversation. Each conversation has its own history and memory. Define an interaction as one question/answer pair, not an individual streamed token. Enforce the cap in the API persistence layer, including when multiple requests finish close together.
- **RF-4:** Extract only concise, relevant, explicit user facts or preferences that could help answer later questions in the same conversation. Do not store the full transcript as memory, unsupported inferences, or sensitive personal details.
- **RF-5:** Validate extraction output against a strict domain schema before storing or using it. Each memory must retain its source interaction, conversation, user, and extraction timestamp. Invalid or failed extraction must not invalidate an already generated answer or its history record. Persist extraction work durably so it can be retried after failures or API restarts.
- **RF-6:** Before answer generation, load only relevant validated memories belonging to the active user and active conversation. Bound the amount of injected memory and label it as untrusted user-provided context that cannot override system or safety instructions.
- **RF-7:** Treat all remembered user content as untrusted input. Run existing prompt safety checks on the current question and do not let memory bypass question safety, evidence checks, or source citation rules.
- **RF-8:** Associate persisted interactions with the logged-in user's ID and the browser's conversation ID. Validate both at the HTTP boundary and prevent a conversation ID from being attached to another user in the persistence layer.
- **RF-13 (security):** Enforce user-level data isolation for every history, memory, and conversation operation. Resolve the caller's user identity at the API boundary and authorize every read, create, update, and delete against that identity; never authorize by a client-supplied conversation ID alone. A user must not read, alter, or delete another user's conversations, interactions, extraction jobs, or memories. Apply ownership checks in the service/store as well as HTTP routing, and use database constraints as defense in depth.
- **RF-9:** Load persisted history from the API for the current user, preserving the existing conversation list, transcript ordering, clear-history, delete-conversation, and saved-answer behavior. Remove browser history as the source of truth for new interactions.
- **RF-10:** Clearing a conversation deletes its interactions and derived memories. Clearing all history removes all interactions and derived memories for that user. Deletion must not affect another user's data.
- **RF-11:** Keep CLI answer generation usable without a browser identity. CLI requests have no conversation memory unless a later activity explicitly adds that capability.
- **RF-12:** Keep SQLite files and sidecars ignored by Git. Do not store conversation records or extracted memories in LanceDB as their canonical source.

## 4. Proposed data and request behavior

- Add SQLite conversation and interaction records keyed by stable UUIDs, with `user_id`, `conversation_id`, question, answer, abstention, serialized validated sources, and creation time. Enforce a composite ownership boundary for user and conversation.
- Add structured memory records linked to their source interaction and conversation. Delete them when the source interaction is deleted or evicted by the retention cap. Enforce the latest-50 cap independently for each conversation and cascade eviction to its derived memories and unfinished extraction job.
- Extend the browser's `/ask` and `/ask/stream` requests with the active `userId` and current `conversationId`. The API validates UUID shapes and passes the identity and conversation context through service/store layers. These fields identify records for this POC; they are not authentication credentials.
- Before generation, retrieve a bounded set of memory facts for that user and conversation and pass them as a separate context field to the answer generator. Preserve existing Pokémon evidence retrieval, source validation, and response shape.
- After answer generation, persist the completed interaction and a pending memory-extraction job in the same SQLite transaction, enforce the 50-interaction conversation cap, and only then complete the request. A background worker processes pending jobs and transactionally stores validated facts and marks the job complete. On extraction failure, retain the interaction and pending job, record a bounded retry count and next-attempt time, and retry after transient failures or API restart. No raw provider error is returned to the user.
- Add API operations to read the user's saved conversation history and to delete one conversation or clear all of that user's history. Exact route names and response shapes are a planning decision.
- On application start or login, fetch the user's persisted conversations and latest interactions and render them using the existing frontend history UI. Browser local storage continues to hold only the selected public identity and language preference.
- Discard pre-018 browser-local conversation history; it was a temporary solution and will not be migrated. New history reads and all conversation deletion or clear-history operations use SQLite.

## 5. Memory extraction and prompt safety

- Use a dedicated structured extraction schema and prompt. Candidate facts should be concrete and useful to future Pokémon-assistant answers, such as the user's stated response preferences, knowledge level, or an explicitly mentioned Pokémon interest.
- Keep each extracted fact short, attributable to a source interaction, and limited to the active conversation. Do not infer age, health, location, identity traits, or other sensitive facts.
- Treat the question and answer being analyzed as untrusted text, not instructions to the extractor. Accept only schema-valid output and discard any invalid candidate rather than falling back to storing free-form model text.
- Before injection, select only facts relevant to the current question, apply a small token/character budget, and keep memory separate from retrieved Pokémon evidence. Memories cannot create citations or substitute for indexed facts.
- Extraction requires an additional model call after each answer. Use a durable asynchronous extraction job rather than making interaction persistence depend on extractor success. The API response may complete while memory is pending; later questions can use facts once extraction completes. Jobs survive process restarts and are retried, while the interaction and answer are already safely stored.

## 6. Storage recommendation

Use SQLite as the source of truth for users, conversations, completed interactions, and extracted memory facts. The data is relational, strictly capped at 50 interactions per conversation, and needs reliable ownership filters, ordered reads, per-conversation deletion, and atomic retention. SQLite provides relational SQL and ACID transactions, which directly match these requirements ([SQLite overview](https://www.sqlite.org/about.html), [SQLite transactions](https://www.sqlite.org/transactional.html)).

Keep LanceDB for the existing Pokémon knowledge corpus and vector retrieval. Its documented purpose is vector similarity search and related retrieval, which is valuable when the memory corpus becomes large or needs semantic nearest-neighbor lookup ([LanceDB vector query](https://lancedb.github.io/lancedb/js/classes/Query/), [LanceDB quickstart](https://lance.org/quickstart/)). With only 50 interactions and extracted facts scoped to a conversation, adding per-user memory embeddings now would create a second source of truth and additional embedding/index lifecycle without a demonstrated retrieval need.

If later experience shows that users accumulate many long-lived facts across conversations, keep canonical memory records in SQLite and consider adding a LanceDB vector index as a derived retrieval layer. Do not make the vector index the sole store for conversation history or user memory.

## 7. POC limitations and risks

- Activity 017 explicitly uses name-only identity selection without ownership verification. A person who enters another user's name can select that identity. Once history and memories are persisted, that person could read or influence the selected identity's memory. This remains unsuitable for sensitive data or production use without real authentication and authorization.
- Memory extraction can hallucinate, overgeneralize, or follow malicious content. Strict schemas, source attribution, conservative extraction, safety checks, and isolated prompt context reduce but do not eliminate this risk.
- Persisted conversation data is personal data. The API must expose deletion scoped to the selected user and avoid logging raw questions, answers, or memory values.
- A model extraction call increases answer latency and provider usage. Extraction failure must be isolated from the primary answer path.
- Since SQLite's `DatabaseSync` executes synchronously in the current Node 22 runtime, implementation must keep database transactions short and avoid holding a transaction open during model calls.

## 8. Acceptance criteria

- **AC-1:** A successful `/ask` or `/ask/stream` completion stores exactly one interaction with its user and conversation IDs; failed, cancelled, or incomplete answers do not create completed interactions.
- **AC-2:** Reloading or restarting the API preserves conversation records and the frontend can render them from the API.
- **AC-3:** Each conversation has no more than 50 persisted interactions; inserting interaction 51 evicts that conversation's oldest interaction and its derived memories without affecting another conversation or user.
- **AC-4:** The completed interaction and a pending extraction job are committed before the API reports completion. Extraction stores only schema-valid, relevant facts with source interaction references; extractor failure or API restart does not lose the interaction or pending job.
- **AC-5:** A later question in the same conversation receives relevant extracted facts as bounded, explicitly untrusted context; another user's or another conversation's memories are never injected.
- **AC-6:** Existing Pokémon evidence and citation behavior remains authoritative and the public answer response schema remains compatible.
- **AC-7:** Deleting one conversation or clearing all history removes associated interactions, memories, and pending extraction jobs from SQLite and updates the UI. Existing localStorage history is discarded, not imported.
- **AC-8:** CLI behavior and current user login behavior continue to work, and SQLite data files remain ignored by Git.
- **AC-9:** Requests scoped to one user cannot read or mutate another user's records, including by supplying another user's conversation ID. Ownership checks cover history listing/detail, ask/context loading, conversation deletion, and clear-history.

## 9. Confirmed decisions for planning

- Each conversation keeps its own interaction history and extracted memory. A general user context built across conversations is deferred to a future activity.
- The latest-50 retention limit applies independently to each conversation. Evicting an interaction also removes its derived memories and any pending extraction job.
- Existing browser-local history is temporary and will be discarded, not imported. Conversation deletion and clear-history operations must delete the corresponding SQLite records.
- Persist completed interactions and pending extraction jobs atomically, then process extraction asynchronously with durable retries. This preserves answer history even when the model call or API process fails; memory availability may be delayed.
- The existing name-only login remains a POC identity selector, not proof of ownership. Persistent history and memory must not be treated as protected production data until real authentication is added.
- User/conversation scoping prevents cross-record access when the API has a trustworthy caller identity, but the current name-only login does not establish one: anyone can select an existing user's name. Therefore RF-13's record-level isolation is mandatory in this activity, while protection against impersonating another account requires a future authentication factor and remains an explicit POC limitation.
- Persist conversations, interactions, memories, and extraction jobs in separate relational tables linked to the selected user. Enforce record-level isolation through scoped service/store operations and database constraints. Login/authentication changes are out of scope for this activity.
