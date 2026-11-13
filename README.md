# pokedex-ai

**Language:** English | [Português](README.pt-BR.md)

A Node.js and TypeScript project for an AI-powered Pokédex. The API and React frontend are kept in one repository; frontend modules live in `src/fe/`.

## UI preview

The repository includes this static homepage sample to demonstrate the project's interface:

![Static sample of the Pokédex AI homepage](homepage_sample.png)

## Requirements

- Node.js 22 or later
- npm (included with Node.js)

Project dependencies:

- **Runtime:** React and React DOM for the frontend; [Zod](https://zod.dev/) for data validation; [LangChain](https://js.langchain.com/) and [OpenRouter](https://openrouter.ai/) for LLMs and embeddings; [LanceDB](https://lancedb.github.io/lancedb/) for local vector storage; and the official MCP TypeScript SDK for the optional remote tool endpoint
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

### HTTP question endpoints

- `POST /ask` keeps the JSON request/response flow for CLI integrations and other callers.
- `POST /ask/stream` accepts the same `{ "question": "..." }` JSON body and returns named server-sent events: `delta` appends answer text, `replace` resets or corrects the draft, `complete` carries the validated final result and sources, and `error` carries a safe message plus a retryable flag. Validation errors are ordinary JSON responses before the stream starts.

The web UI uses `/ask/stream`, renders answer text as it arrives, and offers a cancel control. It retries transient network failures, incomplete streams, HTTP 429/5xx responses, and retryable stream errors up to three times after the first attempt, with bounded backoff. User cancellation and non-retryable client errors are not retried. The stream uses the same retrieval, prompt-safety, and source validation flow as `/ask`; general-knowledge answers complete without RAG sources.

### MCP server for external AI clients

The API can expose read-only Pokédex RAG data through Model Context Protocol (MCP) using Streamable HTTP at `http://localhost:3000/mcp`. MCP is disabled by default. To enable it, copy `.env.example` to `.env`, set `MCP_ENABLED=true`, and set `MCP_AUTH_TOKEN` to a randomly generated secret containing at least 32 bytes. Startup fails with a configuration error when the token is missing or shorter than 32 bytes. The command below generates a 256-bit token represented by 64 hexadecimal characters:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the generated value only in `.env` and your MCP client's private configuration; never commit or log it. Restart the API after changing the value to rotate the token. Semantic search also requires the existing `OPENROUTER_API_KEY` and a populated LanceDB collection.

Configure an MCP client to use the URL above and send `Authorization: Bearer <your-token>` on every request. For clients using a JSON server configuration with URL and headers:

```json
{
  "mcpServers": {
    "pokedex-ai": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <replace-with-your-private-token>"
      }
    }
  }
}
```

The server exposes two read-only tools:

- `lookup_pokemon` accepts exactly one of `{ "id": 25 }`, `{ "name": "pikachu" }`, or `{ "type": "electric" }` and returns `{ "items": [...] }` with indexed evidence and source URLs. No matches return an empty `items` array.
- `search_pokemon` accepts `{ "query": "Pokemon that can fly", "limit": 5 }`. `limit` is optional, defaults to 5, and accepts values from 1 to 10. It returns retrieved evidence and source URLs, not an LLM-generated answer.

Natural-language search runs the existing prompt-safety classifier before embedding. Both tools screen retrieved evidence with the existing prompt-injection guardrail; returned text is still untrusted input for the client AI. Authentication failures return HTTP 401. The in-memory limiter allows 30 MCP HTTP requests per peer address every 60 seconds, counting initialization, discovery, and tool requests; excess calls return HTTP 429 with `Retry-After`.

This proof of concept uses one shared bearer token and a per-process in-memory rate limit. It does not identify individual clients, coordinate quotas across API instances, or trust reverse-proxy forwarding headers. Keep it on a controlled network; it is not production-grade authentication or distributed abuse protection.

### Local API access

The development API listens on the loopback address `127.0.0.1` by default. Browser requests to `POST /ask` and `POST /ask/stream` are accepted when their `Origin` exactly matches `http://127.0.0.1:5173` or `http://localhost:5173`; the Vite proxy forwards the request to the API. Requests without an `Origin` header are also allowed for local maintenance.

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

### Answer sources and model data

The assistant searches the local index first. When indexed evidence supports an answer, it uses that evidence and returns its source links. If the index has no matching evidence or the grounded answer cannot be supported, the assistant may use the model's general knowledge for Pokemon topics; those answers have no RAG source links and are labeled as general model knowledge in the interface. The model is instructed to decline requests outside the Pokemon domain. This fallback does not use web search or external tools.

The user question is sent to OpenRouter for safety assessment and embeddings. The answer model receives the question and, on the retrieved-evidence path, the selected Pokemon records. The general-knowledge fallback receives the question with an empty evidence list. The current index contains public Pokemon data; do not add sensitive records without revisiting the provider data flow and privacy requirements.

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
