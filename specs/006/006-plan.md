# 006 Technical Plan: Pokémon Type Effectiveness and Type Details

## 1. Architecture

The collector continues to obtain the first 151 Pokémon from PokéAPI and Biology descriptions and images from the existing source. For every distinct type URL present in the Pokémon responses, it fetches the PokéAPI Type resource once per collection run. The official [PokéAPI Types documentation](https://pokeapi.co/docs/v2#types) defines the resource fields `name`, `damage_relations`, and `past_damage_relations`.

The enriched type details are attached to their Pokémon records. The collector validates the complete staged dataset before replacing the local JSON file. Database population validates the same contract and replaces the LanceDB collection only after the input passes validation.

Expected code areas:

- `src/domain/pokemon-vector-document.ts` — schemas and types for current and historical type relations.
- `src/scripts/collect-pokemon-data.ts` — fetch, cache, normalize, and associate type resources.
- `src/scripts/collect-pokemon-data.test.ts` — collector behavior and failure cases.
- `src/service/populate-vector-database.ts` — validate enriched data and construct searchable type facts.
- `src/store/lance-db-store.ts` — persist type facts and source URLs in vector records.
- Related service/store/CLI tests — verify population, retrieval, and citations.

No HTTP routes or user-facing CLI commands are added. Existing collection, population, and combined commands remain the entry points.

## 2. Data Model

Each Pokémon record retains its existing fields and adds its type details. A type detail contains:

- `name` and the PokéAPI Type resource `url`.
- `damageRelations`, with all six API arrays: `no_damage_to`, `half_damage_to`, `double_damage_to`, `no_damage_from`, `half_damage_from`, `double_damage_from` (normalized to the project's naming convention if appropriate).
- `pastDamageRelations`, an array where each entry contains its `generation` resource (`name` and `url`) and the same six relation arrays.

Each relation target is represented by its API resource name and URL. Current and historical relations remain distinct. The data model must not assume a single historical generation or silently treat historical entries as current.

Embedding text should state relation direction plainly (strong against, resisted by, no effect against, weak to, resistant to, immune to) and label historical facts with their generation. Vector metadata must preserve structured type relations and the PokéAPI type URL so an answer can cite its evidence.

## 3. Contracts

There are no new HTTP or CLI contracts. The collector's internal output contract adds structured type details to each Pokémon record. The collection output remains exactly 151 Pokémon records, each with its existing source data and a complete detail for every listed type.

Type resources are requested using URLs supplied in each Pokémon response's `types[].type.url`; repeated URLs are fetched once in a run. Invalid responses, missing type details, or an unexpected Pokémon count fail validation before local data or the LanceDB collection is replaced. Existing command names and arguments remain unchanged.

## 4. Decisions and Trade-offs

- PokéAPI is the structured source for type relations; type effectiveness no longer depends on Bulbapedia scraping.
- Preserve all relation categories, including no-effect relations, because these distinguish immunity from resistance and weakness.
- Preserve `past_damage_relations` with generation labels instead of flattening them. This increases record size but prevents generation-specific matchups from being misrepresented.
- Attach type details to Pokémon records rather than adding separate vector documents. This maintains the 151-record dataset shape and makes each Pokémon's evidence self-contained, at the cost of repeating shared type metadata in the vector store.
- Deduplicate type requests per run to reduce requests and latency. Collection fixtures must avoid repeated external requests and must not require a live API.
- Keep existing Biology description sources and attribution unchanged; only type facts and their citations move to PokéAPI.

## 5. Test Strategy (`node:test`)

- Validate schemas for complete current relations, empty relation categories, historical entries with generation labels, and malformed or missing fields.
- Use mocked/fixed fixtures to verify each distinct type URL is fetched once and associated with all Pokémon using that type.
- Verify all six relation categories retain correct direction and historical relations remain separate and generation-labeled.
- Verify malformed type resources, failed requests, incomplete Pokémon type coverage, and counts other than 151 fail before replacing existing data.
- Verify population text expresses relation semantics and generation context, and vector metadata retains structured relations and PokéAPI URLs.
- Verify retrieval/answer evidence includes the type source URL.
- Run `npm run test` and `npm run typecheck`; no test should depend on live network access.
