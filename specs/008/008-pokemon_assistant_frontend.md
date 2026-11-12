# 008 - Pokédex AI Frontend

## 1. Context and problem

The application currently exposes its Pokémon question-answering capability through a CLI and HTTP API, but it has no user-facing web interface. The supplied `homepage_sample.png` is a visual guide for a Pokémon-themed assistant page with a question composer, suggested questions, answers, and source references. Users need a simple way to ask one question and read an answer with its supporting sources.

The first version is a single-query experience. It does not retain conversation history. The interface must be available in Portuguese and English, default to Portuguese, and remember the user's language selection on that browser. The selected language controls interface text; the answer language follows the language detected from the question.

ReactJS is the selected frontend framework. Frontend modules will be located in `src/fe/` in this repository. Questions will use the API's existing `POST /ask` endpoint with its current question-only request contract.

## 2. User stories

- As a visitor, I want to ask a Pokémon question in a web page, so that I can use the assistant without the CLI.
- As a visitor, I want to see the answer and its source links, so that I can review the indexed information behind the response.
- As a visitor, I want to choose Portuguese or English, so that I can use the interface in my preferred language.
- As a returning visitor, I want my language choice remembered, so that I do not need to select it again on the same browser.

## 3. Functional requirements

- **RF-1:** The frontend must provide a Pokémon assistant page guided by the supplied homepage reference, including a question input, a way to submit it, and a results area.
- **RF-2:** The frontend must provide suggested questions that a visitor can use to start a query.
- **RF-3:** The frontend must submit one question at a time to the API's `POST /ask` endpoint.
- **RF-4:** The frontend must display the answer returned for the submitted question and indicate when the service reports insufficient evidence.
- **RF-5:** The frontend must display the returned sources as identifiable links that open their referenced pages.
- **RF-6:** The frontend must provide Portuguese and English interface text. Portuguese must be selected by default when no saved language preference exists.
- **RF-7:** The visitor must be able to change the selected language from the page.
- **RF-8:** The selected language must be saved in browser-local storage and restored on subsequent visits to the page.
- **RF-9:** The frontend must send only the question using the existing `POST /ask` contract. The answer language must follow the language detected from the question.
- **RF-10:** The page must communicate loading and request failure states, and allow the visitor to submit another question after a request finishes.
- **RF-11:** The page must not persist questions or answers as conversation history. A page reload must start without a previous query while retaining the language preference.

## 4. Acceptance criteria

- **AC-1:** When a visitor opens the page without a saved language preference, the system must display the interface in Portuguese.
- **AC-2:** When a visitor selects English, the system must display the interface in English and save that selection for the browser.
- **AC-3:** When a visitor returns to the page after selecting English, the system must restore the English interface.
- **AC-4:** When a visitor submits a non-empty Pokémon question, the frontend must call `POST /ask` with the question and display the answer in the language detected from that question.
- **AC-5:** When the answer includes sources, the system must display each source as a link to its referenced page.
- **AC-6:** When the service reports insufficient evidence, the system must display that result without presenting it as a supported answer.
- **AC-7:** When a request is in progress, the system must communicate that state and prevent accidental duplicate submission of that same request.
- **AC-8:** When a request fails, the system must display a user-facing failure message and allow another attempt.
- **AC-9:** When a visitor reloads the page after asking a question, the system must show no previous question or answer and must retain the saved language selection.
- **AC-10:** When the page is used on a narrow viewport or with a keyboard, the system must keep the question, language selector, answer, and source links usable and reachable.

## 5. Out of scope

- Persisting conversations or providing conversation history across visits.
- User accounts, authentication, or synchronization across devices.
- Streaming answers or multi-turn conversations.
- Adding Pokémon data or changing the vector database.
- Changing answer-generation behavior beyond returning evidence-grounded answers in the language detected from the question.

## 6. Open questions

- None. The frontend location is `src/fe/`, the repository remains a single repository, the first version has no conversation persistence, the interface follows the user's Portuguese/English selection, and the answer follows the question's language.
