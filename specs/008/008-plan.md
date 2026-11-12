# 008 - Technical Plan

## 1. Architecture

The frontend will use ReactJS with TypeScript and live under `src/fe/`. The API remains in the existing `src/http/`, `src/domain/`, and `src/service/` layers. Frontend requests flow through the HTTP boundary to the service; the service continues to use the existing store and model integrations. The frontend uses the current question-only `POST /ask` contract. The selector controls interface text; the answer follows the language detected from the question.

Proposed frontend files:

- `src/fe/main.tsx` and `src/fe/App.tsx` — React entry point and page composition based on `homepage_sample.png`.
- `src/fe/components/` — question form, language selector, answer/source view, and suggested-question controls.
- `src/fe/i18n.ts` — Portuguese and English interface strings and language types.
- `src/fe/api-client.ts` — request to `/ask` and validation of the returned `AskResult`.
- `src/fe/styles.css` — responsive styles and visual layout.
- `index.html` — browser entry document for the frontend bundler.

Proposed API updates:

- `src/domain/ask.ts` — retain the existing request schema containing only the validated question.
- `src/http/server.ts` — retain the existing `POST /ask` payload and error mapping.
- `src/service/answer-question.ts` and `src/service/openrouter-chat-model.ts` — retain question-language detection for generated answers and ensure fixed or abstention answers follow the question language where applicable. Keep the user question as the only user-controlled prompt input.
- `src/index.ts` — keep the existing API startup behavior.
- `package.json` and `tsconfig.json` — add React/frontend tooling, scripts, and TSX support. Keep `dev` for the API, add `dev:fe` for the frontend, and add `dev:full` to start both together using a process runner such as `concurrently`.

For local development, the proposed setup is a Vite frontend dev server with `/ask` proxied to the API at `localhost:3000`. This keeps browser requests same-origin during development and avoids adding CORS behavior to the API solely for the dev UI. No production hosting arrangement is defined by the spec.

## 2. Data model

- Keep the strict `AskRequestSchema` as `{ question }`; do not add a language field to the API payload.
- Keep the existing `AskResultSchema`: `{ answer, abstained, sources }`. Each source retains its Pokémon ID, name, and URL.
- Model the selected language in the frontend as the same two-value union. Initialize it from the saved browser preference, falling back to `pt`; persist only this preference in `localStorage`.
- Do not define a conversation/history data model. Query and answer state exists only while the page is open.

## 3. Contracts

### HTTP

- **Request:** `POST /ask`, `Content-Type: application/json`, body containing a non-empty `question`.
- **Success:** HTTP 200 with the existing `AskResult` shape. The `answer` language follows the language detected from the question; `abstained` and `sources` retain their current meanings.
- **Invalid request:** HTTP 400 for an invalid question, using the existing JSON error response convention.
- **Prompt safety or server failure:** preserve the current 400 prompt-guardrail and 500 server-error behavior.
- The frontend must validate the response shape before rendering it and render source URLs as links.

### Frontend

- Add a development command to run Vite, a build command for the frontend, and a combined `dev:full` command to start the existing API `dev` script and frontend `dev:fe` script together. Keep individual commands available.
- The UI sends exactly one active question per submission and displays the question, answer/abstention, and returned sources. A completed or failed request can be followed by another question.
- The language selector updates interface strings only; its selection survives reloads, while query and answer state does not.

## 4. Decisions, trade-offs, and review points

- **ReactJS + Vite:** React organizes the reference page into components and handles request/language state. Vite supplies a development server and frontend build with limited changes to the existing Node API. This adds runtime React packages and frontend build tooling.
- **Language handling:** keep `/ask` backward-compatible with its current `{ question }` request. The selector controls interface text, while the question itself determines answer language. Ensure fixed or abstention answers are localized consistently where the question language is supported.
- **Production hosting:** the spec does not say how the built frontend will be served or deployed. Decide whether a later task should serve the build through the existing Node server, use a separate static host, or leave deployment outside this activity. Local development can use the proposed Vite proxy.
- **Visual assets:** the reference is a guide, but the spec does not establish image licensing or whether its character artwork may ship in the app. Confirm which assets are approved before copying artwork into the frontend.
- **Responsive and keyboard behavior:** preserve the page's core interaction on narrow screens and by keyboard; avoid requiring a specific visual implementation beyond the supplied guide.

## 5. Test strategy (`node:test`)

- Keep domain and HTTP tests for the existing question-only request contract, including rejection of unexpected fields, prompt-safety errors, and server errors.
- Extend service/model tests to verify that generated and abstention answers follow the language detected from the question.
- Add frontend tests for Portuguese default, stored-language restoration and updates, translated interface strings, question submission, loading/error/abstention states, and source links. Use `node:test`; select a lightweight DOM environment only if needed for React interaction tests.
- Run `npm run test` and `npm run typecheck` after implementation tasks; verify the frontend build command as a separate acceptance check.
