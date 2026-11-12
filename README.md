# pokedex-ai

**Language:** English | [Português](README.pt-BR.md)

A Node.js and TypeScript project for an AI-powered Pokédex. The API and React frontend are kept in one repository; frontend modules live in `src/fe/`.

## Requirements

- Node.js 22 or later
- npm (included with Node.js)

Project dependencies:

- **Runtime:** React and React DOM for the frontend; [Zod](https://zod.dev/) for data validation; [LangChain](https://js.langchain.com/) and [OpenRouter](https://openrouter.ai/) for LLMs and embeddings; and [LanceDB](https://lancedb.github.io/lancedb/) for local vector storage
- **Development:** TypeScript, `tsx`, Vite, and `concurrently`; `@types/node` and React type definitions

## Installation

From the project root, install the dependencies:

```bash
npm install
```

## Run

Start the API in development mode:

```bash
npm run dev
```

The API listens at `http://localhost:3000`.

Start the frontend by itself:

```bash
npm run dev:fe
```

Start the API and frontend together:

```bash
npm run dev:full
```

The frontend runs at `http://localhost:5173` and proxies `/ask` requests to the API.

### Local API access

The development API listens on the loopback address `127.0.0.1` by default. Browser requests to `POST /ask` are accepted when their `Origin` exactly matches `http://127.0.0.1:5173` or `http://localhost:5173`; the Vite proxy forwards the request to the API. Requests without an `Origin` header are also allowed for local maintenance.

This origin check limits browser requests from unrelated websites. It is not authentication: local scripts can call the loopback API directly, omit the header, or forge an allowed `Origin`. Do not expose this proof-of-concept API to a network or treat this local rule as production security.

To run the command-line interface:

```bash
npm run cli
```

This command runs the one-shot CLI. The current data workflows use the internal scripts below.

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

Build the frontend for production:

```bash
npm run build:fe
```

Run tests found in `src/`:

```bash
npm test
```

## Current structure

```text
src/index.ts      API entry point
src/fe/            React frontend modules
src/domain/       data types and validation schemas
src/http/         HTTP boundary
src/service/      business rules and embedding integration
src/store/        local LanceDB persistence
src/scripts/      internal data collection and population commands
specs/            feature specifications, plans, and task lists
```

The project uses ES modules (`type: module`) and TypeScript with the ES2022 target and NodeNext module resolution.
