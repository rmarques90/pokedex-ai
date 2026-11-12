# 009 - Assistant usability and language consistency

## 1. Context and problem

The Pokédex assistant frontend is functional, but several interactions need to be clearer and faster. The language selector uses plain text labels, suggested questions only populate the composer, and the composer does not explain that Shift+Enter inserts a line break. Source cards identify a Pokémon but do not make it obvious when multiple references come from distinct sources for that same Pokémon. In addition, generated answers can mix languages, such as using the English type name “rock” in a Portuguese answer.

This activity improves those behaviors while preserving the current Portuguese/English interface, question-only `POST /ask` contract, and evidence-grounded answer flow.

## 2. User stories

- As a visitor, I want to recognize the language choices by their flags and names, so that I can select my preferred interface language quickly.
- As a visitor, I want Enter to submit and Shift+Enter to add a line break, so that I can ask either short or multi-line questions from the keyboard.
- As a visitor, I want a suggested question to run as soon as I select it, so that I can get an answer without an extra submit step.
- As a visitor, I want each reference to show its source clearly, so that I can distinguish different pages about the same Pokémon.
- As a visitor, I want the answer’s terminology to follow my question’s language, so that Portuguese answers use Portuguese Pokémon type names and English answers use English names.

## 3. Functional requirements

- **RF-1:** The language selector must display a recognizable flag and the language name or standard code for each supported language (Portuguese and English). It must remain operable by keyboard and expose an accessible name that does not rely on the flag alone.
- **RF-2:** In the question composer, Enter without Shift must submit a non-empty question. Shift+Enter must insert a newline without submitting. The visible hint must communicate both actions in the active interface language.
- **RF-3:** Selecting a suggested question from any suggested-question control must submit that question immediately through the existing question submission flow.
- **RF-4:** Each displayed reference must show enough source identity to distinguish different source pages, including when the references concern the same Pokémon. The source URL or its hostname must be visible or clearly represented alongside the Pokémon identity, and each reference must continue to link to its source page.
- **RF-5:** Generated answer text must be consistently written in the language detected from the user's question, including Pokémon type names and other localized domain terminology. For example, a Portuguese question about a Pokémon of type “rock” must receive “pedra” in the Portuguese response; an English question must use “rock”.
- **RF-6:** The model instructions must treat the question's language as the output-language requirement and preserve factual meaning while translating terminology. Retrieved evidence may use a different language, but must not cause the response to switch languages or leave avoidable source-language terms untranslated.
- **RF-7:** Preserve the existing `POST /ask` request and response contracts, loading/error behavior, and evidence grounding. No interface language field is added to the request; response language continues to follow the question.

## 4. Acceptance criteria

- **AC-1:** The selector visibly pairs each supported language with its flag and a readable language label/code; assistive technology can identify the choices without interpreting the flag.
- **AC-2:** Pressing Enter in the composer submits the current non-empty question once. Pressing Shift+Enter inserts a newline and does not submit.
- **AC-3:** The composer hint describes Enter submission and Shift+Enter line breaks in Portuguese and English, matching the selected interface language.
- **AC-4:** Activating a suggested question sends that exact question to `POST /ask` immediately and displays the normal loading and result states.
- **AC-5:** When multiple references share a Pokémon identity but point to different pages or domains, each is visually distinguishable by its source identity and opens the corresponding URL.
- **AC-6:** A Portuguese question about a Rock-type Pokémon receives a Portuguese answer that uses “pedra” (or grammatically appropriate Portuguese wording), rather than the untranslated English type name “rock”.
- **AC-7:** An English question about a Pokémon of type pedra receives an English answer that uses “rock” and does not switch to Portuguese.
- **AC-8:** The changes preserve response evidence, abstention semantics, and the existing API contract.

## 5. Out of scope

- Adding additional interface languages.
- Changing Pokémon data sources, retrieval ranking, or the vector database contents.
- Adding chat history, multi-turn conversation, or streaming responses.
- Changing the API request/response schema solely to communicate the selected interface language.

## 6. Open questions

- None. Source identity should use the source URL or hostname already available in each reference; the exact visual treatment can be selected during planning.
