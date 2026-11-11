# LLM Integration Specification

## 1. Context and problem

The project has a local Pokémon dataset indexed in LanceDB, but users cannot ask natural-language questions about it. The application needs to retrieve relevant vector records and use an OpenRouter-hosted language model to produce a Pokémon-expert answer grounded only in those records. Answers must not rely on external knowledge, and users should be able to inspect the source references behind them.

## 2. User stories

- As a Pokémon fan, I want to ask a one-shot question through the CLI, so that I can get an answer grounded in the local Pokédex data.
- As a Pokémon fan, I want to ask a question through HTTP, so that another client can retrieve an answer from the local Pokédex data.
- As a user, I want answers to include source URLs and to abstain when the indexed data is insufficient, so that I can verify the information and avoid unsupported claims.
- As a project maintainer, I want the OpenRouter model identifier to be a project constant, so that I can change the model centrally.

## 3. Functional requirements

- **RF-1:** The system shall accept a single natural-language question through a non-interactive CLI command named `ask`.
- **RF-2:** The system shall accept a question through the HTTP `POST /ask` endpoint.
- **RF-3:** The system shall validate CLI and HTTP question input with Zod before passing it into the application domain.
- **RF-4:** For each valid question, the system shall retrieve relevant Pokémon records only from the configured local LanceDB collection.
- **RF-5:** The generated answer shall use only information supported by the retrieved records and shall not use external sources or the model's unstated background knowledge as evidence.
- **RF-6:** The system shall use LangChain to apply the project's prompt-injection guardrail to user questions and retrieved content before those inputs are used by the language model.
- **RF-7:** The system shall use OpenRouter to invoke the language model, with the model identifier `~deepseek/deepseek-flash-latest` declared as a project constant so it can be changed centrally.
- **RF-8:** The assistant shall respond as a Pokémon subject-matter expert while remaining within the evidence available in the retrieved records.
- **RF-9:** If the retrieved records do not provide sufficient evidence to answer, the system shall abstain and clearly tell the user that the indexed data is insufficient.
- **RF-10:** A successful answer shall include the source reference URLs associated with the records used to compose it.
- **RF-11:** The HTTP boundary shall translate invalid input and predictable domain failures into appropriate HTTP responses; the CLI boundary shall present equivalent failures as clear command output and a failing process result.

## 4. Acceptance criteria

- When a user runs the `ask` CLI command with a question, the system shall return one answer and finish without entering an interactive session.
- When a client sends a valid question to `POST /ask`, the system shall return an answer and its source reference URLs.
- When a CLI or HTTP question is empty or invalid, the system shall reject it through the corresponding boundary without invoking retrieval or the language model.
- When the system handles a valid question, it shall retrieve evidence only from the configured LanceDB collection and invoke the configured OpenRouter model through LangChain.
- When the model identifier is changed in the project constant, subsequent requests shall use the new identifier.
- When retrieved records provide enough evidence to answer, the system shall return a Pokémon-focused answer supported by those records and include their source URLs.
- When retrieved records do not provide enough evidence to answer, the system shall state that the indexed data is insufficient and shall not fill the gap with external or unsupported knowledge.
- When the question or retrieved content contains prompt-injection instructions, the system shall apply the LangChain guardrail and continue to enforce the evidence-only answering requirement.
- When retrieval, OpenRouter, or answer generation fails predictably, the system shall report the failure at the CLI or HTTP boundary without exposing secrets.

## 5. Out of scope

- Interactive or multi-turn conversations.
- Web search, external knowledge sources, or answers grounded outside the local LanceDB collection.
- Changing the Pokémon dataset or rebuilding the vector database.
- User authentication, conversation history, and persistent chat sessions.
- Selecting retrieval thresholds, prompt templates, HTTP response schema details, or the technical layout of modules; these belong in the technical plan.

## 6. Open questions

- No open questions remain for this specification.
