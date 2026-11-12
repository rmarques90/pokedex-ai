# 011 - Hybrid Pokémon knowledge answers

## Context

The current assistant answers only from the indexed first-generation Pokémon data. When the retrieval result is empty or insufficient, it abstains even when a general Pokémon answer could help. The project is a proof of concept and the RAG currently contains public Pokémon facts. The question and retrieved records already pass through OpenRouter for safety assessment, embeddings, and answer generation.

## User story

As a Pokédex user, I want the assistant to use general model knowledge for Pokémon questions that the local index cannot answer, while keeping RAG citations tied only to facts actually supported by retrieved records.

## Requirements

- **RF-1:** Keep retrieval-first behavior. When retrieved records support an answer, generate an evidence-grounded answer and cite only retrieved sources actually used.
- **RF-2:** When no records are found, or the evidence-grounded answer abstains, allow a second generation pass using general model knowledge, scoped to the Pokémon universe.
- **RF-3:** The general-knowledge pass must receive the question but no retrieved RAG records, and must not produce RAG citations.
- **RF-3a:** The frontend must label a non-abstained answer with no RAG citations as general model knowledge.
- **RF-4:** The model must use the question's language, state uncertainty when needed, and abstain for requests outside the Pokémon domain.
- **RF-5:** Do not add web search or external retrieval tools. Keep prompt-injection checks active.
- **RF-6:** Retrieval infrastructure failures and safety failures remain errors; they must not silently trigger general fallback.
- **RF-7:** Preserve the existing API/CLI response contract, including `answer`, `abstained`, and `sources`.

## Acceptance criteria

- A question with supported RAG evidence uses the existing grounded path and citations.
- Empty or insufficient RAG evidence can receive a Pokémon-domain answer with an empty sources array.
- The frontend labels answers with no sources as general model knowledge.
- The fallback receives no retrieved records.
- The fallback does not mask retrieval, prompt-safety, or model infrastructure failures.
- Out-of-domain requests are instructed to abstain; no web/tool calls are available.
- README explains that the model provider receives the question and, on the RAG path, selected public Pokémon evidence.

## Out of scope

- Web search, non-Pokémon knowledge, private RAG data, production privacy guarantees, API contract changes.
