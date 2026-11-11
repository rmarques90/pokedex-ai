# Project Memory

## Stack
- Node.js 22 LTS.
- TypeScript, ESM, strict mode.
- Zod validates HTTP and CLI boundaries.
- OpenRouter provides flexibility in model selection.
- LangChain integrates LLMs and vector retrieval.
- LanceDB stores embeddings and serves vector search to LangChain and LLM workflows.
- Tests use Node.js `node:test` via `tsx`.
- No HTTP framework; use `node:http` by design.

## Commands
- `dev` — `tsx src/index.ts` (API at `localhost:3000`).
- `cli` — `tsx src/cli.ts`.
- `test` — `node --import tsx --test "src/**/*.test.ts"`.
- `typecheck` — `tsc --noEmit`.
- `populate_db` — populate LanceDB with initial data when needed (not configured in `package.json` yet).

## Structure
- `src/domain/` — types and Zod schemas; no I/O.
- `src/store/` — in-memory persistence behind an interface; LanceDB handles vector embeddings and search.
- `src/service/` — business rules.
- `src/http/` — HTTP boundary.
- `src/cli.ts` — CLI entry point.
- `specs/<NNN>/` — one directory per activity, containing `<NNN>-<slug>.md`, `<NNN>-plan.md`, and `tasks.md`.

## Conventions
- Write all code, identifiers, comments, and technical documentation in English.
- Layers do not skip: `http`/`cli` → `service` → `store`.
- Validate external input with Zod.
- Domain errors are classes translated at the boundary.
- New logic starts with a test; keep `typecheck` and `test` green.
- Never commit secrets. Do not read `.env` files.

## Workflow
- `/especificar` → `/planejar` → `/tarefas` → `/implementar`.
- Require human review between phases.
- Store artifacts in `specs/`.
