# 006 Tasks: Pokémon Type Effectiveness and Type Details

1. - [x] Define the type-relation schemas and fixtures.
   - Add schemas/types for a PokéAPI type resource, all six current `damage_relations` categories, and `past_damage_relations` entries that retain generation and all six categories.
   - Include relation target names and URLs; allow valid empty relation arrays.
   - **Ready when:** `node:test` covers valid current and historical resources plus malformed/missing fields; `npm run typecheck` passes.
   - **Dependencies:** None.

2. - [x] Add type-relation normalization and meaning labels.
   - Normalize PokéAPI type-resource data without losing category direction, targets, generation, or source URL. Provide clear text meanings for strong against, resisted by, no effect against, weak to, resistant to, and immune to.
   - **Ready when:** unit tests prove all six categories map correctly and historical facts retain their generation labels; typecheck passes.
   - **Dependencies:** Task 1.

3. - [x] Fetch, deduplicate, and associate PokéAPI type resources during collection.
   - Fetch each distinct `types[].type.url` once per run, attach its validated details to every relevant Pokémon, and keep existing Biology/image collection behavior.
   - Validate the staged dataset has exactly 151 Pokémon and complete details for every listed type before replacing the local JSON file.
   - **Ready when:** fixture-based tests verify request deduplication, association, failure handling, and preservation of existing local data on failed collection; typecheck passes.
   - **Dependencies:** Tasks 1–2.

4. - [x] Include current and historical type facts in vector documents.
   - Add relation facts and generation context to searchable text; preserve structured relations and PokéAPI type URLs in metadata. Keep Biology attribution unchanged.
   - **Ready when:** service tests verify searchable semantics, historical generation labels, type metadata, and all 151 records; typecheck passes.
   - **Dependencies:** Tasks 1–3.

5. - [x] Persist type evidence and expose its citation in answers.
   - Ensure LanceDB storage and retrieval retain type relation metadata and the PokéAPI Type resource URL used as evidence.
   - **Ready when:** store/service tests verify type source URLs survive persistence and appear in answer evidence; typecheck passes.
   - **Dependencies:** Task 4.

6. - [x] Verify existing population and combined commands with the enriched dataset.
   - Confirm input validation occurs before collection replacement and that the existing `collect:data`, `populate_db`, and `collect:populate-db` workflows process the enriched records without changing their invocation.
   - **Ready when:** command/service tests cover successful runs and reject incomplete data without publishing a partial dataset or collection; typecheck passes.
   - **Dependencies:** Tasks 3–5.

7. - [x] Run final project checks and review the data-source boundary.
   - Run the full test suite and typecheck; confirm no type-effectiveness code depends on Bulbapedia type pages and that Biology attribution is unchanged.
   - **Ready when:** `npm run test` and `npm run typecheck` both pass and the task checklist accurately reflects completion.
   - **Dependencies:** Task 6.
