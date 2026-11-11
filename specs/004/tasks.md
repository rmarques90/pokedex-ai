# Tasks — Answer Quality and Direct Pokémon Lookup

1. - [x] Add validated structured lookup contracts to the vector store interface.
   - Done when store types and Zod inputs cover lookup by National Pokédex ID, canonical name, and all records matching a Pokémon type; `npm run typecheck` passes.
   - Depends on: none.

2. - [x] Implement and test LanceDB structured lookups.
   - Done when `node --import tsx --test "src/store/lance-db-store.test.ts"` verifies ID and exact-name matches, complete type results, missing matches, validated metadata, and no collection mutation.
   - Depends on: Task 1.

3. - [x] Route unambiguous ID and exact-name questions through structured lookup.
   - Done when `node --import tsx --test "src/service/answer-question.test.ts"` proves a #3 query returns Venusaur even when vector search omits it, canonical-name lookup returns the matching record, missing records are reported without fabricated matches, and other questions retain vector retrieval.
   - Depends on: Task 2.

4. - [x] Add complete type-based comparison behavior for “best Pokémon” questions.
   - Done when service tests verify every indexed record of the requested type is considered, the default criterion is highest total base stats, the selected metric is explicit, and no universal gameplay ranking is implied.
   - Depends on: Task 2.

5. - [x] Refine generated answers to lead with the result and keep caveats concise.
   - Done when adapter/service tests verify answer-first phrasing, evidence-only output, stated comparison criteria, concise ambiguity notes, and unchanged source attribution; `npm run typecheck` passes.
   - Depends on: Tasks 3 and 4.

6. - [x] Verify answer quality through CLI and HTTP boundaries.
   - Done when CLI and HTTP tests confirm direct answers precede citations, matching sources are returned, and existing command/route and response shapes remain unchanged.
   - Depends on: Task 5.

7. - [ ] Route full type-comparison questions and their matching evidence through answer generation.
   - Done when a service test proves the complete question and all matching records reach the model, its answer can address multiple requested details such as individual stats, and source attribution remains limited to the records it cites.
   - Depends on: Tasks 4–5.

8. - [ ] Run the complete verification suite and review the final diff.
   - Done when `npm run test` and `npm run typecheck` both pass and all tasks above are marked complete only after their checks pass.
   - Depends on: Tasks 1–7.
