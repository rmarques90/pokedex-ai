# pokedex-ai

**Language:** English | [Português](README.pt-BR.md)

A Node.js and TypeScript project for an AI-powered Pokédex. The repository is designed to grow into a multi-module project with separate modules for the API (`api/`) and frontend (`fe/`).

## Requirements

- Node.js 22 or later
- npm (included with Node.js)

Project dependencies:

- **Runtime:** [Zod](https://zod.dev/) for data validation, [LangChain](https://js.langchain.com/) and [OpenRouter](https://openrouter.ai/) for embeddings, and [LanceDB](https://lancedb.github.io/lancedb/) for local vector storage
- **Development:** TypeScript, `tsx` for running TypeScript during development, and `@types/node` for Node.js type definitions

## Installation

From the project root, install the dependencies:

```bash
npm install
```

## Run

Start the application in development mode:

```bash
npm run dev
```

This command runs `src/index.ts`. The entry point is currently a placeholder.

To run the command-line interface:

```bash
npm run cli
```

This command expects `src/cli.ts`; the current data workflows use the internal scripts below.

## Collect and populate Pokemon data

Enable the repository's pre-commit safety hook once after installing dependencies:

```bash
npm run hooks:install
```

The local dataset contains the first 151 base-form Pokemon. Copy `.env.example` to `.env`, set `LANCEDB_COLLECTION_NAME`, and add an `OPENROUTER_API_KEY` from your OpenRouter account. The `.env` file and local data/database directories are ignored by Git.

Collect or refresh the source dataset and images:

```bash
npm run collect:data
```

Populate the local LanceDB collection with LangChain embeddings using `qwen/qwen3-embedding-8b`:

```bash
npm run populate_db
```

Run collection followed by population in one command:

```bash
npm run collect:populate-db
```

Embedding requests are sent to OpenRouter. The database is stored locally in `store/lancedb/`; source JSON and image data are stored in `store/data/`.

## Build and validate

Compile TypeScript files into `dist/`:

```bash
npx tsc
```

Check types without generating output files:

```bash
npm run typecheck
```

Run tests found in `src/`:

```bash
npm test
```

## Current structure

```text
api/              reserved for the API module
fe/               reserved for the frontend module
src/index.ts      TypeScript entry point (placeholder)
src/domain/       data types and validation schemas
src/service/      business rules and embedding integration
src/store/        local LanceDB persistence
src/scripts/      internal data collection and population commands
specs/            feature specifications, plans, and task lists
```

The project uses ES modules (`type: module`) and TypeScript with the ES2022 target and NodeNext module resolution.
