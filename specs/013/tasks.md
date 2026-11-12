# 013 Tasks: Browser-local History and Chat Transcript

## 1. Domain contract

- [x] Add a versioned Zod schema for browser history documents and conversation entries, reusing `AskResultSchema`.
- [x] Enforce unique entry IDs, valid timestamps, strict object shapes, supported version, and the 100-entry maximum.
- [x] Add schema tests for valid documents and each rejected malformed or unsupported case.

## 2. Local history store

- [x] Implement the localStorage adapter with injectable storage, clock, and ID factory.
- [x] Support loading, appending completed exchanges, starting a conversation, deleting one conversation, and clearing all history.
- [x] Keep only the newest 100 entries and ensure deletion removes all exchanges in the selected conversation.
- [x] When deleting the active conversation or clearing history, generate a fresh empty active conversation.
- [x] Handle unavailable storage, invalid persisted data, and quota failures without exposing internal exception details or crashing the app.
- [x] Add store tests for persistence, retention, conversation lifecycle/deletion, malformed data, unavailable storage, and quota failures.

## 3. Transcript and submission lifecycle

- [x] Initialize validated local history once when the app mounts and keep it in React state.
- [x] Replace the single-result main view with a chronological transcript for the active conversation, reusing existing answer, provenance, and source rendering.
- [x] Append and persist an entry only after a validated stream completion; keep deltas temporary and exclude canceled or failed requests.
- [x] Preserve current streaming, cancellation, retry behavior, and show a localized notice when persistence is unavailable or fails.
- [x] Keep the question form available in the empty transcript state and preserve the current draft/status behavior while streaming.
- [x] Add integration coverage for completed answers, reload/remount restoration, deltas, cancellation, and failures.

## 4. History sidebar and conversation actions

- [x] Add a sidebar that groups questions by conversation, ordered by recent activity, with localized timestamps and accessible question buttons.
- [x] Add a start-new-conversation action that clears only the active transcript and draft while retaining saved conversations.
- [x] Add an individual conversation delete action and localized confirmation; canceling preserves data, while confirming removes the conversation's entries.
- [x] Ensure deleting the active conversation clears the transcript and starts a fresh empty active conversation.
- [x] Add a clear-all-history action with a separate localized confirmation.
- [x] Provide accessible history navigation on narrow screens.
- [x] Add integration coverage for new conversations and confirmed/canceled deletion of active and inactive conversations, plus clear-all behavior.

## 5. Saved-result modal and localization

- [x] Add an accessible modal for a selected saved exchange using the shared answer renderer and safe source links.
- [x] Support focus entry and containment, Escape and close-button dismissal, and focus return to the invoking history button.
- [x] Ensure opening and closing the modal does not change the active transcript.
- [x] Add Portuguese and English copy for history, empty states, timestamps, modal controls, deletion confirmations, clear-all controls, and storage notices.
- [x] Add UI coverage for modal content, dismissal, focus behavior, and unchanged transcript.

## 6. Styling and validation

- [x] Style transcript turns, grouped sidebar entries, focus/selected states, modal, confirmation dialogs, and responsive history navigation in the existing theme.
- [x] Verify source links retain safe target and rel attributes.
- [x] Verify Portuguese and English copy alignment and keyboard accessibility.
- [x] Run `npm run typecheck`, `npm test`, `npm run build:fe`, and `git diff --check`.
