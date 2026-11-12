# 016 - Technical Plan

## 1. Architecture

Keep the existing browser-history document and append order unchanged. Change only how the active conversation is projected for rendering in the React frontend.

Proposed changes:

- `src/fe/App.tsx` — sort active transcript turns newest-first, using `createdAt` descending and the existing append order as the deterministic tie-break for equal timestamps. Render the active request as a pending turn before completed transcript entries. Keep its submitted question, loading state, and streamed answer preview together. When the request completes, replace the pending presentation with the newly saved turn at the same top position.
- `src/fe/styles.css` — reuse the existing chat turn, question, answer, and loading styles; add only minimal pending-turn styling if needed to keep loading and streamed content visually grouped.
- `src/fe/App.test.tsx` — cover newest-first completed turns, the pending turn's top position before the first stream delta, streaming preview in that turn, and transition to one completed turn without duplication. Cover cancellation/failure behavior and confirm the existing sidebar order remains unchanged.

No changes are needed to the domain history schema, history store, API contract, persistence order, or answer rendering component. The composer and page header stay where they are; “top” means the first turn in the active transcript below the existing composer.

## 2. Ordering decisions

- Filter the active conversation's saved entries as today.
- Sort by descending `createdAt` so the most recent saved turn renders first.
- If timestamps are equal, use descending source-array index. The history store appends entries, so later appended turns remain ahead even when their timestamps are identical.
- Render the in-progress turn before all saved turns while `loading` is true. Use `submittedQuestion` as its question and reuse the existing loading and streaming-answer UI inside the same turn.
- On success, the history store appends the completed entry and the pending presentation is removed when loading finishes. Do not change stored entry ordering or add duplicate pending history data.
- On cancellation or failure, remove the pending presentation and leave all completed turns in the same newest-first order; preserve existing composer/error behavior.

## 3. Test strategy (`node:test`)

- In `src/fe/App.test.tsx`, submit two distinct questions and verify their question-answer turn order is newest-first, with each answer and its associated sources/status remaining in the same article.
- Use a deferred ask promise to verify that the latest submitted question and loading state appear above the completed transcript before the response resolves.
- Emit a streaming delta and verify it appears in the same top pending turn as the submitted question.
- Resolve the deferred request and verify the pending turn is replaced by a single saved turn at the top.
- Reject/cancel a pending request and verify previously completed turns keep their order and content.
- Confirm sidebar history ordering and selection behavior remain unchanged.
- During implementation, run the repository test, typecheck, and frontend build commands in accordance with project conventions.

## 4. Risks and mitigations

- **Pending/completed duplication during React state updates:** render the pending turn only while `loading` is true and verify the success transition in a deferred-promise test.
- **Equal creation timestamps:** use source-array append position as a deterministic tie-break instead of relying on sort stability alone.
- **Detached question/answer after reordering:** sort and render complete history entries as whole turn articles; do not reverse question and answer elements independently.
- **Scope spilling into history persistence:** keep the sort local to the active transcript and verify the sidebar and storage document are unchanged.

## 5. Review points

- Confirm this plan before proceeding to `/tarefas`.
- During implementation, keep the change limited to active transcript order and top-positioned pending state; preserve the existing composer position, history ordering, and answer behavior.
