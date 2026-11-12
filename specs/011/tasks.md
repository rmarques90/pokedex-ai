# 011 - Tasks

- [x] 1. Add explicit answer modes to the generator contract and validate mode-specific evidence IDs. **Ready when:** retrieved mode requires citations and general mode returns no evidence IDs.
- [x] 2. Update answer prompts for grounded Pokémon answers and Pokémon-only general-knowledge fallback without tools or web search. **Ready when:** each mode has a clear domain, language, uncertainty, and evidence policy.
- [x] 3. Route empty retrieval and grounded abstention to general mode with an empty evidence array; preserve errors and citations. **Ready when:** general answers have no RAG sources and retrieval/safety errors do not trigger fallback.
- [x] 4. Update the frontend and documentation for hybrid behavior and provider data flow. **Ready when:** the UI labels general-knowledge answers and README explains scope, provenance, and what content is sent to the model provider.
- [x] 5. Validate type safety and behavior, then mark all completed tasks. **Ready when:** project checks pass and each acceptance criterion is represented.
