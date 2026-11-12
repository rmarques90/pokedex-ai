# Pokémon Type Effectiveness and Type Details

## 1. Context and Problem

The initial dataset contains the first 151 Pokémon and their Biology descriptions. Its current type data is not sufficient to answer questions about type strengths and weaknesses, and the Bulbapedia type-page scraper is unreliable. PokéAPI exposes structured type resources with current and historical damage relations.

## 2. User Stories

- As a Pokédex user, I want to ask which types a Pokémon is strong or weak against, so that I can understand its battle matchups.
- As a Pokédex user, I want historical type relations to retain their generation context, so that answers do not mix rules from different generations.
- As a project maintainer, I want type data collected from a structured API, so that the dataset can be refreshed and validated consistently.

## 3. Functional Requirements

- **FR-1:** For each distinct Pokémon type found among the original 151 Pokémon, the collector must retrieve its PokéAPI Type resource using the resource URL supplied by the Pokémon API response.
- **FR-2:** The collector must persist each type's name, source URL, current `damage_relations`, and complete `past_damage_relations` data.
- **FR-3:** Current relations must preserve the API categories `no_damage_to`, `half_damage_to`, `double_damage_to`, `no_damage_from`, `half_damage_from`, and `double_damage_from`.
- **FR-4:** Every historical relation entry must retain its associated generation and all six relation categories. Historical data must not be merged into current relations.
- **FR-5:** Relation meaning must be available for answers: `double_damage_to` means strong against; `half_damage_to` means resisted by the target; `no_damage_to` means no effect against; `double_damage_from` means weak to; `half_damage_from` means resistant to; and `no_damage_from` means immune to.
- **FR-6:** Each Pokémon record must include the structured data for each of its types, without changing the expected count of 151 Pokémon records.
- **FR-7:** Type names, relation facts, historical generation labels, and their PokéAPI source URLs must be searchable or available as supporting metadata in LanceDB.
- **FR-8:** The collector must reuse each type resource response within a collection run instead of fetching the same type repeatedly, and must validate the complete dataset before replacing the local dataset.
- **FR-9:** Database population must validate the type data before replacing the collection. A failed validation or population must not publish a partial replacement.
- **FR-10:** Type citations must point to the PokéAPI Type resource URL. Existing Pokémon Biology descriptions, image references, and their attribution metadata remain unchanged.
- **FR-11:** The existing manual collection, database population, and combined collect-and-populate commands must continue to work with the enriched data.

## 4. Acceptance Criteria

- When collection encounters multiple Pokémon with the same type, the system must fetch that type resource at most once during the run and associate it with each relevant Pokémon.
- When a type resource includes current damage relations, the system must persist all six categories without changing their direction or meaning.
- When a type resource includes past damage relations, the system must persist each entry together with its generation and all six categories.
- When collected data is malformed, missing required type information, or does not contain exactly 151 Pokémon, the system must fail before replacing the existing local dataset.
- When valid enriched data is populated, the vector records must retain current and historical type facts and type-resource citations.
- When the combined command runs successfully, it must collect the enriched dataset and then populate the vector database using the existing workflow.
- When Bulbapedia type pages are unavailable, collection must not depend on them for type names or effectiveness relations.

## 5. Out of Scope

- Scraping type descriptions or `Battle properties` from Bulbapedia.
- Pokémon beyond the original 151, alternate forms, moves, abilities, or battle simulation.
- Adding or changing HTTP routes or interactive CLI behavior.
- Changing the existing source and attribution for Pokémon Biology descriptions.

## 6. Open Questions

- None for this iteration. The API's current relations and generation-labeled historical relations are stored separately as returned by PokéAPI.
