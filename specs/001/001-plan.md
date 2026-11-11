# Technical Plan — Pokémon Data Acquisition

## 1. Architecture

This activity is a standalone data-collection script, not an HTTP or interactive CLI feature. A developer starts it manually through a dedicated npm script. The script requests the first 151 Pokémon resources from PokéAPI, follows each returned Pokémon URL for structured data, retrieves only the Biology section from the corresponding Bulbapedia page, validates all records, and saves the JSON and image assets under `store/data/`.

Planned files:

- `src/scripts/collect-pokemon-data.ts` — standalone collection script, including PokéAPI requests, schema validation, completeness checks, image downloads, and local persistence.
- `store/data/pokemon.json` and `store/data/images/` — generated JSON dataset and downloaded image assets; this directory must be excluded from Git. `store/data/sample/` contains the one-record validation sample.
- `src/scripts/collect-pokemon-data.test.ts` — tests using local fixtures and mocked network responses, matching the existing test command's `src/**/*.test.ts` pattern.
- `package.json` — add a dedicated npm script that invokes the collection script manually.
- `.gitignore` — exclude generated files under `store/data/`.

No HTTP route, interactive CLI, or new application-layer module is required. LanceDB population and embedding generation remain out of scope.

## 2. Data model

Represent one base-form Pokémon with:

- National Pokédex number (1–151), name, and one or two types.
- Total base-stat value and the six numeric base stats: HP, Attack, Defense, Special Attack, Special Defense, and Speed.
- Text from only the Biology section of each Bulbapedia Pokemon page, with source URL, Bulbapedia attribution, and CC BY-NC-SA license metadata.
- PokeAPI Pokemon resource URL, species resource URL, Bulbapedia page URL, image source URL, local image reference, and description attribution/license metadata.

Define small Zod schemas in the script module for the normalized Pokémon record and complete dataset. The dataset schema must enforce the expected record count and valid unique Pokédex numbers; the script additionally verifies coverage of all numbers 1–151.

## 3. Contracts

### Manual command

- npm command: `npm run collect:data`, invoking `tsx src/scripts/collect-pokemon-data.ts`; `npm run collect:data -- --sample` writes a one-record sample separately.
- Input: no required arguments; collection targets the original 151 base forms.
- Source sequence: request `https://pokeapi.co/api/v2/pokemon?limit=151&offset=0`; follow all 151 returned Pokemon resource URLs for structured details; retrieve only the Biology section text from the corresponding Bulbapedia page, retaining its attribution and CC BY-NC-SA terms.
- Success: write the complete JSON dataset and image assets under `store/data/`, then print a concise completion summary with record count and output location.
- Failure: print a non-zero command result and identify the Pokémon and unavailable source item; do not report an incomplete dataset as successful.
- The command is run manually by a developer when the local initial dataset is needed; it is not started automatically by the application.

There is no HTTP or interactive CLI contract for this feature.

## 4. Decisions and trade-offs

- Use Node.js 22's built-in `fetch` for API and image requests. Extract paragraph text from the Bulbapedia Biology section without adding an HTML parser dependency.
- Follow PokéAPI's [fair use policy](https://pokeapi.co/docs/v2#fair-use-policy): cache API resources locally and avoid unnecessary request frequency. The documentation states that rate limiting has been removed but asks consumers to limit request frequency to control hosting costs.
- Use the resource URLs returned by the list and detail responses rather than constructing Pokémon detail URLs from names.
- Keep network and filesystem operations testable through isolated script helpers and fixtures, without live requests.
- Validate every record and the full 001–151 coverage before publishing the dataset. This avoids treating a partial crawl as success, at the cost of failing the complete run when one required record or image is unavailable.
- Approved defaults: collect all original 151 base forms; source descriptions only from each Bulbapedia Biology section, storing page URL, attribution, and CC BY-NC-SA metadata; use official artwork with default-sprite fallback; stage and validate all output before replacing a prior complete dataset; use `npm run collect:data`, `store/data/pokemon.json`, and `store/data/images/<NNN>-<name>.<ext>`. This is a personal non-commercial RAG test project.

## 5. Test strategy

- Script tests: validate the 151-entry Pok?API list fixture and detail responses; verify resource URL following, base-form filtering, Bulbapedia Biology-section extraction and attribution/license metadata, stats, and images.
- Collection tests: successful 151-record collection, missing/duplicate/out-of-range Pokédex numbers, absent required fields, unavailable page or image, and incomplete-run failure behavior.
- Persistence tests: JSON and image writes under `store/data/`, Git ignore coverage, and preservation of prior output if validation or staging fails.
- Command tests: manual npm command dispatch, success summary, and non-zero failure result.
- Tests must not depend on live PokéAPI availability. Run `npm run test` and `npm run typecheck` for implementation changes.
