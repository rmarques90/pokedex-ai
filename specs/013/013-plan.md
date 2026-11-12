# 013 Technical Plan: Browser-local History and Chat Transcript

## 1. Design overview

Keep this feature entirely in the React frontend. The answer API, RAG/service code, CLI, and stream protocol stay unchanged. The frontend records a question only after `askPokemonStream` resolves with a validated `AskResult`; deltas are still temporary UI state and are never written to storage.

Use one versioned localStorage document for saved exchanges. Each record has a stable ID, conversation ID, timestamp, question, and `AskResult`. The document also stores the ID of the active conversation. Cap the total number of records at 100 and retain the newest records. The sidebar groups retained records by conversation, ordered by most recent activity, with questions inside each group newest-first; the main transcript filters records to the active conversation and displays them oldest-first.

Starting a new conversation creates a new active conversation ID and clears only the visible transcript and draft. Saved entries from previous conversations remain in the sidebar. Selecting a question opens a modal for that single saved result and leaves the active conversation unchanged. Each conversation group has a confirmed delete action that removes all its records while preserving other conversations; deleting the active conversation also clears its transcript and starts a new empty active conversation. Clearing all history requires confirmation and clears all records plus the active transcript.

## 2. Data contract and storage boundary

Add a pure Zod schema in `src/domain/browser-history.ts` for a version-1 storage document and individual records. Reuse `AskResultSchema` so the persisted answer, abstention value, and source references match the existing API contract. Validate the full document on every load; reject malformed entries, duplicate IDs, invalid timestamps, extra properties, and unknown versions. Do not store raw streamed chunks, prompts, retrieved evidence, provider metadata, or credentials.

Add `src/fe/history-store.ts` as the only localStorage adapter. It should accept a storage interface and injectable clock/ID factory for deterministic tests. Provide operations to load history, append a completed exchange, start a conversation, delete a conversation, and clear history. Deleting a conversation removes every record with its ID; deleting the active one assigns a fresh active conversation ID. Appending deduplicates by the generated stable ID, keeps the newest 100 entries, and persists one serialized versioned document. Storage access and quota errors must be caught at this boundary so they never crash the UI.

If storage is unavailable or existing data cannot be parsed, initialize a usable in-memory empty history and show a localized storage notice. Do not expose exception text. Do not silently overwrite a corrupt or unsupported saved document; allow new questions in memory and let the user explicitly clear the incompatible data to resume persistence. Clearing history resets to a new empty active conversation.

## 3. React state and submission lifecycle

Initialize history once when `App` mounts. Keep the history document (or its validated equivalent) in React state so sidebar and transcript update immediately without rereading localStorage. The storage adapter persists state updates after each successful operation.

On submit, keep the current streaming draft and cancel/retry behavior. After the stream's completion promise resolves, construct a record from the normalized question and final result, append it to the active conversation and all-history index, persist it, and clear temporary stream state. On cancellation or final failure, clear the temporary draft according to existing behavior and do not create a record. If persistence fails, retain the completed item in current memory for the session and show the localized storage notice.

Replace the single-result main content with a `ChatTranscript` that renders each active conversation record as a user question followed by an assistant answer. Reuse existing answer provenance and safe source rendering. Keep the generating status/draft visible after the latest transcript item while streaming. Empty transcript state keeps the question form available.

## 4. Sidebar, modal, and conversation controls

Add a history list to the left sidebar, grouped by conversation and ordered by most recent activity. Show each retained question with a localized time label and make each item a real button with a stable key and useful accessible name. Put a delete-conversation action in each group, with a localized confirmation dialog; canceling preserves that conversation, and confirming removes its exchanges. If the deleted conversation is active, clear the transcript and establish a new empty active conversation. The existing new-question control becomes the start-new-conversation action described in the specification.

Add a localized custom modal for a saved record. It presents the question, answer, abstention/general-knowledge provenance, and safe source links using the same answer rendering component as the transcript. Give the dialog `role="dialog"`, `aria-modal="true"`, and a localized title. Move focus into the dialog when it opens, close on Escape or the close button, keep keyboard interaction inside the dialog, and return focus to the history button that opened it. The modal must not navigate the active transcript.

Add a clear-history control and a localized confirmation dialog. Confirming clears the saved sidebar entries and active transcript; canceling preserves everything. Conversation deletion uses a separate confirmation that names the selected conversation or its first question. On narrow screens, provide an accessible way to open/close the history list instead of leaving the new history inaccessible when the existing sidebar collapses.

## 5. Localization and visual behavior

Extend `UiCopy` in `src/fe/i18n.ts` for history heading, empty states, time labels, modal title/close action, clear-history and delete-conversation actions/confirmations, and storage warning in Portuguese and English. Keep existing language preference behavior.

Add styles for chat turns, question and answer grouping, history rows, selected/focus states, modal overlay/dialog, and mobile history navigation. Preserve the current Pokédex theme, source presentation, and responsive layout. Do not add a third-party modal or persistence dependency.

## 6. Files and contracts affected

- `src/domain/browser-history.ts` and tests — versioned Zod types for browser history.
- `src/fe/history-store.ts` and tests — localStorage adapter, validation, retention cap, conversation deletion, and storage failure handling.
- `src/fe/App.tsx` — local history state, completion persistence, active conversation, and chat transcript.
- `src/fe/` UI modules — history sidebar, modal, confirmation dialog, and reusable answer rendering, split into components if this keeps `App` maintainable.
- `src/fe/i18n.ts` — localized labels and states.
- `src/fe/styles.css` — chat, sidebar history, modal, and responsive behavior.
- `src/fe/App.test.tsx` — integration tests for history, modal, new conversation, conversation deletion, clear-history, reload, and stream lifecycle.
- `specs/013/` — this plan and the activity task list when the tasks phase is approved.

## 7. Validation strategy

- Unit-test schema validation for valid records, invalid `AskResult`, malformed timestamps, duplicate IDs, extra fields, unsupported versions, and more than 100 entries.
- Unit-test the storage adapter with an in-memory `Storage` fake for load/save, newest-100 retention, new conversation, deleting active and inactive conversations, clear, invalid stored data, unavailable storage, and quota errors.
- React-test that a completed answer appears in the transcript and sidebar and survives an app remount using the same localStorage.
- React-test that deltas alone do not enter history, completion does, and cancellation/final failure does not.
- React-test that history selection opens the matching modal, Escape/close returns focus, and the active transcript remains unchanged.
- React-test new-conversation isolation, confirmed versus canceled conversation deletion (including active and inactive conversations), and confirmed versus canceled clear-history behavior.
- Verify Portuguese and English UI copy alignment, responsive history access, and safe source-link attributes.
- Run `npm run typecheck`, the full `npm test` suite, `npm run build:fe`, and `git diff --check`.

## 8. Risks and constraints

- localStorage is synchronous and may be unavailable or full. Keep the adapter boundary narrow, cap records at 100, and preserve in-memory operation when persistence fails.
- Questions and answers can contain user-entered text. The data stays in the browser profile and is not sent to the API for history; make the clear action discoverable.
- The sidebar and active chat are two views over a bounded record list. Keep conversation IDs in the contract so a new conversation does not erase the history index.
- A saved result represents only a successfully completed answer. Do not persist partial deltas during retries or cancellation.
- Focus handling and small-screen history navigation need accessibility tests, not only visual checks.
