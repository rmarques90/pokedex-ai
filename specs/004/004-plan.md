# Answer Quality and Direct Pokémon Lookup Technical Plan

## 1. Architecture

Keep the request flow `HTTP/CLI → service → store`. The service will identify questions that request a specific National Pokédex number or exact Pokémon name and use the store's structured lookup contract for those records. Other natural-language questions will continue through vector retrieval. The answer-generation flow will keep the existing LangChain prompt-injection guardrail and evidence-only model constraints, while making the answer lead with the result and clearly state any comparison criterion and limitation.

Planned files to create or update:

- `src/store/lance-db-store.ts` — extend the store interface and LanceDB implementation with validated structured lookup by Pokédex ID and canonical name, plus retrieval of all records matching a Pokémon type. Return the same validated evidence shape used by vector search.
- `src/domain/ask.ts` — add any Zod schemas needed for lookup criteria or structured evidence, only if the existing `RetrievedEvidenceSchema` is insufficient. Keep domain types free of I/O.
- `src/service/answer-question.ts` — recognize unambiguous ID/name requests, prefer structured lookup for them, and avoid reporting a requested record absent solely because vector search omitted it. Preserve the existing vector retrieval path for general questions.
- `src/service/openrouter-chat-model.ts` — refine answer instructions so the answer comes first; for subjective “best” questions, use a stated criterion supported by supplied records and keep ambiguity notes concise.
- `src/service/answer-question.test.ts` — verify exact lookup takes precedence over similarity results, missing direct matches are reported accurately, and general questions retain vector retrieval behavior.
- `src/store/lance-db-store.test.ts` — verify lookup by ID/name returns validated evidence, handles missing matches, and does not mutate collections.
- `src/service/openrouter-chat-model.test.ts` — verify prompt construction/answer policy where testable without making provider requests.
- `src/http/server.test.ts` and `src/cli.test.ts` — verify direct answers, source references, and stable answer-first output through both existing boundaries.

No changes are expected to the HTTP route or CLI command contract. The current successful response already carries `answer`, `abstained`, and `sources`; the CLI prints the answer before citations. The changes should improve the answer text and evidence selection without adding a new endpoint or command.

## 2. Data model

- Reuse `RetrievedEvidenceSchema` as the service/store lookup result unless implementation shows a specific missing field.
- Reuse the indexed `PokemonVectorRowSchema`, which already stores `id`, `name`, `types`, base stats, total, description, and source metadata.
- Add a small Zod schema for direct lookup input if the store contract accepts untrusted values. A lookup must distinguish a valid National Pokédex ID from a canonical name and reject malformed IDs before database access.
- Keep the existing `AskResultSchema` response shape. No new public fields are needed for this activity.
- If the service supplies a computed comparison criterion to generation, validate the criterion and candidate evidence before passing them across the model boundary.

## 3. Contracts

### Store contract

- Add a structured lookup operation accepting either a National Pokédex ID or a canonical Pokémon name.
- Return one validated evidence record for a match and an explicit empty result for no match.
- Keep vector similarity search available for semantic questions. Structured lookup does not call the embedding model.

### Service behavior

- For an unambiguous ID or exact-name question, use structured lookup so the answer does not depend on `topK` or embedding similarity.
- For other questions, use the existing vector search and answer-generation flow.
- For “best Pokémon of [type]” questions, compare all indexed records of the requested type by total base stats, state that criterion, and avoid implying that this defines a universal competitive or gameplay ranking.
- Route type-lookup evidence through the same model generation step as other answerable questions, preserving the complete user question so the model can address every requested part, including individual stats when requested.
- Return the existing `AskResult` shape and include source references only for records used to answer.

### HTTP and CLI

- Preserve `POST /ask` with `{ "question": string }` and its existing JSON result shape.
- Preserve `npm run cli ask "<question>"`; print the direct answer first, followed by source references when present.
- Missing direct matches are expected answer outcomes, not server failures. Invalid input and unexpected store/model failures continue to follow the existing boundary behavior.

## 4. Decisions and trade-offs

- **Exact entity recognition:** Prefer explicit number and canonical-name patterns to avoid using semantic similarity for exact record identity. Human review should confirm how to handle aliases, alternate forms, ordinal expressions, and ambiguous numbers before implementation.
- **Best-Pokémon comparison scope — approved:** Compare all indexed records matching the requested type, using the highest total base stats as the default measurable criterion. State the metric and scope in the answer. The user approved this scope before task breakdown.
- **Subjective criteria:** Base stats offer measurable comparisons but do not establish a universal gameplay or competitive “best.” The generated answer must name the criterion and keep any caveat short, without leading with a full abstention when supported comparison data exists.
- **Lookup mismatch:** The local JSON and LanceDB population contract require all original 151 IDs. If a structured lookup misses an ID, report unavailable from the configured collection and avoid falling back to a fabricated or external answer.
- **Prompt safety:** Direct lookup and answer refinement must not bypass the existing guardrail for the user question or retrieved text.
- **Tests and external calls:** Use fake stores and model dependencies for deterministic `node:test` coverage. Do not require OpenRouter credentials or external API calls in tests.

## 5. Test strategy (`node:test`)

- Store tests: lookup known IDs and names, return all records for a requested type, return no match for unavailable records, validate result metadata, and verify no collection mutation.
- Service tests: ask for National Pokédex number 3 while the vector fake omits Venusaur and prove the structured lookup returns the correct record; test exact canonical names; test missing matches; and prove general semantic questions still use vector search.
- Service comparison tests: prove “best Pokémon of [type]” compares every indexed record of that type by total base stats, states the metric, and describes any dataset limitations accurately.
- Guardrail tests: prove direct lookup still checks user input and retrieved evidence before generation.
- Adapter/boundary tests: check answer-first text and source citations remain consistent through CLI and HTTP without changing response contracts.
- Run `npm run test` and `npm run typecheck` during implementation. This plan phase adds no code or tests.
