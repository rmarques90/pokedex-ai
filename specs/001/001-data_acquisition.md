# Pokémon Data Acquisition Specification

## 1. Context and problem

The intelligent Pokédex needs an initial dataset for the first 151 Pokémon before it can be populated into LanceDB and used in embedding-based experiences. Structured Pokemon data will be collected from [PokeAPI v2](https://pokeapi.co/docs/v2). Descriptions will be limited to the Biology section of each corresponding [Bulbapedia Pokemon page](https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)); each record retains that page URL and Bulbapedia attribution. This is a personal, non-commercial RAG test project. Copied Biology text must retain CC BY-NC-SA attribution and share-alike terms. Save the dataset locally as JSON for later processing.

## 2. User stories

- As a project maintainer, I want to collect consistent data for the original 151 base-form Pokémon, so that I can prepare the initial Pokédex dataset.
- As a project maintainer, I want the Biology section text, a locally available image, and source references for each Pokémon, so that the dataset can support future user-facing details and embedding workflows.
- As a project maintainer, I want the collected data saved as JSON, so that it can be reviewed and used to populate LanceDB later.

## 3. Functional requirements

- **RF-1:** The collection shall retrieve the Pokémon resource list for IDs 1–151 and follow each returned resource URL to fetch its details. It shall include only resources whose IDs are 1–151 and whose `is_default` value is true.
- **RF-2:** For each Pokémon, the collected record shall include its National Pokédex number, name, type or types, HP, Attack, Defense, Special Attack, Special Defense, and Speed. The total base-stat value shall be the sum of the six listed stats.
- **RF-3:** For each Pokemon, collect only the Biology section text from its Bulbapedia page. Store the page URL, Bulbapedia attribution, and CC BY-NC-SA license metadata with the text.
- **RF-4:** For each Pokémon, the associated image shall be downloaded from an image URL provided by its Pokémon resource and made available locally.
- **RF-5:** The dataset shall retain the PokeAPI Pokemon resource URL, species resource URL, Bulbapedia page URL, image source URL, and attribution/license metadata for the description.
- **RF-6:** The collected dataset shall be saved locally as JSON under `store/data/` and remain available for later LanceDB population. Generated data and image assets in this directory shall be excluded from Git and populated manually by a developer when needed.
- **RF-7:** The collection shall report a failure when required source data or an image cannot be obtained, rather than silently presenting an incomplete dataset as complete.
- **RF-8:** The project shall provide a dedicated npm command that allows a maintainer to start data collection manually.

## 4. Acceptance criteria

- When the collection completes successfully, the system shall provide exactly 151 Pokémon records with unique National Pokédex numbers covering 001 through 151.
- When a Pokémon resource is collected, the system shall include its ID, name, types, and six base stats, and calculate the total as the sum of those stats.
- When the Bulbapedia page is collected, the system shall store only the Biology section, its page URL, Bulbapedia attribution, and CC BY-NC-SA license metadata.
- When an image is collected for a Pokémon, the system shall make the image available locally and retain its source URL.
- When collection completes successfully, the system shall save the dataset as a locally available JSON file.
- When generated dataset or image files are stored under `store/data/`, Git shall exclude them from version control.
- When the initial dataset is needed, a developer shall be able to populate it by manually running the collection command.
- When a maintainer invokes the dedicated npm command, the system shall start the data collection process manually.
- When required data or an image is unavailable, the system shall report the affected Pokémon and indicate that collection did not complete successfully.
- When the records are reviewed, the system shall not include alternate forms or Mega Evolutions as separate Pokémon records.

## 5. Out of scope

- Populating or updating LanceDB.
- Generating embeddings or performing LLM-based processing.
- Collecting Pokémon beyond National Pokédex numbers 001–151.
- Collecting alternate forms, Mega Evolutions, moves, abilities, evolution details, or game-specific Pokédex entries.
- Building an HTTP API, frontend, or user-facing search experience.
- Providing an interactive CLI for data collection.

## 6. Open questions

- None. The description scope is limited to the Bulbapedia Biology section for personal, non-commercial testing, with attribution and CC BY-NC-SA share-alike terms.