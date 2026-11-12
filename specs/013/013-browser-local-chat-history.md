# 013 - Browser-local question history and chat transcript

## 1. Context and problem

The web UI currently shows only the latest question and answer. After asking another question or reloading the page, users cannot review previous results. The application already uses a React frontend and has no account or server-side user history; this feature should keep history in the user's browser.

## 2. User story

As a Pokédex AI user, I want my completed questions and answers to remain available in a chat-like transcript and a sidebar history, so I can review what I asked without sending the data to a server.

## 3. Functional requirements

- **RF-1:** Save each successfully completed web question and its final answer locally in the browser. Preserve the final `AskResult` fields: answer text, abstention state, and source references.
- **RF-2:** Store a timestamp and stable local identifier with every completed question/answer entry. Keep repeated questions as separate entries.
- **RF-3:** Show saved conversations in the left-side history, ordered by most recent activity. Group each conversation's questions and identify each question and when it was asked.
- **RF-4:** Selecting a history row opens an accessible modal with that entry's captured question, answer, abstention or general-knowledge status, and source links. Closing the modal returns to the current main view without replacing its transcript.
- **RF-5:** Show the current conversation's completed questions and answers as a chronological chat transcript on the main screen. Render final provenance and references using the existing answer behavior.
- **RF-6:** Restore the saved transcript and sidebar history after a page reload in the same browser profile.
- **RF-7:** Persist only completed results. Do not save partial streaming text, canceled requests, or failed requests as completed answers.
- **RF-8:** Keep all history data in browser storage; do not add an API route, server persistence, account identity, or external storage for this feature.
- **RF-9:** Validate stored data when loading it. If browser storage is unavailable, corrupt, or contains an unsupported version, keep the app usable and report no internal storage details to the user.
- **RF-10:** Provide a way to clear local history and ask for confirmation before deleting it. Clearing history also clears the persisted transcript.
- **RF-11:** Allow the user to delete an individual conversation after confirmation. Delete all saved exchanges in that conversation while preserving other conversations. If it is active, clear the main transcript and start an empty conversation.
- **RF-12:** Localize history labels, empty states, modal controls, conversation and history deletion confirmations, and storage-error feedback in the supported UI languages.
- **RF-13:** Preserve existing streaming, cancellation, retry, source-link safety, and JSON/API behavior.

## 4. Local data and interaction model

Persist a versioned, bounded collection of completed question/answer entries using browser-local storage. Each entry includes an identifier, creation timestamp, question, and validated `AskResult`. Retain the most recent 100 entries and remove the oldest entries when the limit is exceeded. Store no API keys, prompt internals, raw provider chunks, or retrieved evidence beyond the final source references already shown to the user.

The sidebar groups saved questions by conversation, with conversations ordered by most recent activity. Selecting a question opens a modal for that single captured result; the active chat remains visible behind the modal and is unchanged when the modal closes. Each conversation group provides a delete action with confirmation. Deleting a conversation removes all its saved exchanges while preserving other groups; deleting the active conversation clears the main transcript and starts an empty conversation. The main chat transcript shows the active conversation's completed exchanges in chronological order and is restored after reload. Starting a new conversation starts an empty main transcript while retaining prior entries in the sidebar. A new completed exchange is appended to the active transcript and local history only after the stream's validated completion result arrives.

The modal must support keyboard focus, closing with Escape and a visible close control, and correct focus return to the selected history row. Source URLs remain external links with safe target/rel attributes. Empty history and empty transcript states should guide the user back to the question input.

## 5. Acceptance criteria

- A completed question appears in the active chat and the sidebar without a page reload.
- The chat renders the user's question followed by the captured answer; final sources and provenance indicators match the completed result.
- Reloading the page in the same browser profile restores the active transcript and sidebar history.
- Selecting a sidebar item opens a modal with the selected saved question and result. Closing the modal leaves the active transcript unchanged.
- Starting a new conversation leaves old saved questions accessible from the sidebar while the main transcript starts empty.
- Deleting a conversation requires confirmation and removes all its questions and answers while preserving other conversations; deleting the active conversation leaves an empty active transcript.
- Canceled, failed, and incomplete stream attempts never appear as completed history entries.
- Clearing history requires confirmation and removes saved history and transcript data from browser storage.
- Malformed or unsupported stored data does not crash rendering or prevent a new question from being asked.
- History remains available only in the browser profile where it was created; no history is sent to the backend.
- All added UI controls and states have matching Portuguese and English copy and are keyboard accessible.

## 6. Out of scope

- Cross-device synchronization, user accounts, cloud backups, or server-side conversation storage.
- Exporting or importing conversation data.
- Searching, renaming, or editing saved questions and answers.
- Persisting incomplete streaming drafts or retry attempts.

## 7. Decisions

- Use browser-local storage with a versioned schema and a bounded history of 100 completed entries.
- Keep one active chat transcript while maintaining a sidebar index of saved questions; starting a new conversation clears only the active transcript, not saved history.
- Open a selected saved result in a modal without switching or mutating the active transcript.
- Save only after the validated completion event, so partial or canceled generations do not look like finished answers.
- Make clearing all history and deleting one conversation explicit and confirm before deletion.
