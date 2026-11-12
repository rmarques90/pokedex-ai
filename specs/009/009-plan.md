# 009 - Technical Plan

## 1. Architecture

Keep the existing React frontend and `POST /ask` contract. Implement the interaction changes in the frontend, improve answer-language guidance in the existing LangChain system prompt, and retain source URLs already returned by the service.

Proposed changes:

- `src/fe/App.tsx` — render the language options with flag indicators and readable Portuguese/English labels; add an accessible selector name; route both suggestion lists through the same submit function; preserve the textarea's Enter submit and Shift+Enter newline behavior; update the localized keyboard hint; render source host identity in each reference.
- `src/fe/i18n.ts` — add localized copy for the language selector and keyboard guidance, keeping Portuguese and English keys aligned.
- `src/fe/styles.css` — style flag/label options and source host text so they remain legible and responsive.
- `src/service/openrouter-chat-model.ts` — strengthen `ANSWER_SYSTEM_PROMPT` with an explicit requirement to translate Pokémon type names and domain terminology into the question language, including the rock/pedra example, while preserving evidence-grounded meaning.
- `src/fe/App.test.tsx`, `src/fe/i18n.test.ts`, and `src/service/openrouter-chat-model.test.ts` — cover observable interaction, presentation, and prompt-contract behavior using existing test patterns.

No new service, domain, or HTTP contract is needed. The answer service already deduplicates source references by URL, so the frontend can distinguish sources using the URL's hostname and continue linking the full URL. Existing deterministic type lookup logic in `src/service/answer-question.ts` remains in place; this activity addresses language consistency in model-generated answers.

## 2. Data model

- Keep `AskRequestSchema` as `{ question }` and `AskResultSchema` as `{ answer, abstained, sources }`.
- Keep source identity based on each returned source's existing `url` and Pokémon metadata. Derive the hostname for display from the URL; do not add a schema field.
- Keep supported interface languages as `pt` and `en`, with the existing local-storage preference behavior.

## 3. Interaction and prompt decisions

- Use native flag emoji alongside text labels (“Português” and “English”) in the selector. Text remains the accessible, unambiguous language identifier.
- Keep Enter as submit and Shift+Enter as newline. Ensure Shift+Enter is not prevented by the handler and update the visible hint in both interface languages.
- Use one submission function for form submission and suggested-question activation. It should pass the selected suggestion directly to submission rather than relying on asynchronous state updates to the composer value.
- Display the source hostname with the Pokémon identifier/name, while the card link continues to target the complete source URL. The hostname is sufficiently distinct for references from different sites and keeps long URLs from overwhelming the card.
- Update the system prompt to require answers fully in the question language, explicitly translating Pokémon type names and other avoidable source-language terminology. The prompt must retain evidence-only, untrusted-input, and structured-output constraints.

## 4. Test strategy (`node:test`)

- Frontend tests verify accessible, labeled flag choices in both languages, Enter submission, Shift+Enter newline behavior, immediate submission of a suggestion, and visible hostname with the correct source link.
- Localization tests verify the new Portuguese and English copy keys stay aligned.
- Model prompt tests verify the language/terminology requirements and rock/pedra mapping are present in the system prompt. Existing service tests continue covering generated and deterministic answers and their supported evidence.
- Run the repository `test`, `typecheck`, and frontend build commands after implementation, following the project conventions.

## 5. Risks and mitigations

- **Flag emoji rendering varies by platform:** always show a readable text label and use the flag as a visual cue only.
- **Invalid or unusual source URLs:** source URLs are validated by `AskSourceSchema`; derive the hostname defensively so rendering remains robust if a malformed value reaches the view through a mocked or unexpected result.
- **Model compliance varies:** make terminology translation explicit in the system prompt and include focused prompt/service regression coverage; do not add a brittle output rewrite that could alter names or evidence.
- **Suggestion submission race:** call the shared submit routine with the suggestion string directly so behavior does not depend on a React state update completing first.

## 6. Review points

- Confirm this plan before proceeding to `/tarefas`.
- During implementation, keep this activity limited to the listed UX and language-consistency behavior; do not expand the API contract or source model.
