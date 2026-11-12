# 016 - Show the newest chat turn first

## 1. Context and problem

The active conversation transcript is currently displayed oldest-first. As a user asks follow-up questions, each completed question and answer is appended after the earlier turns, so the latest exchange ends up at the bottom of the page.

Users want the most recent question to appear above earlier exchanges, making the current point in the conversation easy to find. The question and its answer must remain a single turn while the display order changes.

## 2. User stories

- As a user asking several questions in one conversation, I want the newest question and answer at the top of the transcript, so that I can immediately see the latest exchange.
- As a user waiting for an answer, I want my submitted question to appear at the top while it is being processed, so that the visible order is consistent before and after completion.
- As a user reviewing older exchanges, I want each question to stay grouped with its corresponding answer while turns are reordered.

## 3. Functional requirements

- **RF-1:** Display turns in the active conversation transcript in newest-first order. A turn consists of its question and its associated answer, including source references and abstention/general-knowledge state.
- **RF-2:** When the user submits a new question, show its in-progress turn at the top of the transcript while the request is loading or streaming. Keep the question visible with the current loading/answer preview state.
- **RF-3:** When a turn completes, place the saved question and final answer at the top without duplicating the in-progress turn. Keep all earlier turns below it in newest-first order.
- **RF-4:** Use a deterministic order when two turns have equal timestamps, preserving their actual submission/creation order with the newer turn first.
- **RF-5:** Keep the order of entries in the sidebar history and stored browser history unchanged; this change applies to the active conversation transcript only.
- **RF-6:** Preserve current submission, streaming, retry, cancellation, failure, conversation switching, and answer rendering behavior apart from the transcript ordering and visibility of the in-progress turn.

## 4. Acceptance criteria

- **AC-1:** After completing two or more questions in one conversation, the newest complete question-answer pair is the first transcript turn and older turns follow beneath it.
- **AC-2:** The question and corresponding answer, sources, and answer status remain grouped together after reordering.
- **AC-3:** On submission of a follow-up question, it appears above completed turns while loading; streaming text is displayed in that same top turn.
- **AC-4:** When the in-progress turn completes, it appears once at the top with its final answer; no duplicate pending/completed copy remains.
- **AC-5:** Equal timestamps still result in the most recently submitted turn appearing first.
- **AC-6:** The sidebar history remains unchanged and continues to expose the same saved conversations and entries.
- **AC-7:** Canceling, retrying, or failing a request does not reorder or alter previously completed turns.

## 5. Out of scope

- Reordering entries in the history sidebar or changing their saved order in browser storage.
- Changing how the question composer, page header, or navigation is positioned.
- Changing the `/ask` API contract, generated answers, sources, or conversation persistence model.

## 6. Open questions

- None. “Newest first” applies to the active transcript below the existing composer; older turns remain available beneath the latest turn.
