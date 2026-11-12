# 017 - Technical Plan

## 1. Architecture

Keep the feature intentionally small for the name-only testing POC. The API owns user creation and lookup; the browser owns only the currently selected public user identity. Do not introduce sessions, credentials, per-user history, or authorization checks on the assistant routes.

Use Node's built-in `node:sqlite` module behind the store interface. The repository runs Node 22.13.1; this module is available without an experimental CLI flag from Node 22.13, but remains experimental. Encapsulating it in the store keeps the driver replaceable if the project later needs a stable SQLite package. See the [Node.js 22 SQLite documentation](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

Proposed changes:

- `src/domain/user.ts` — define Zod schemas and types for login input and public user identity. Keep the name boundary at 1–50 trimmed Unicode characters.
- `src/store/sqlite-user-store.ts` — open `store/data/users.sqlite`, create the users table/index, expose a small `findOrCreateByName` store interface, and provide a close method. Use `DatabaseSync` through prepared statements; open `:memory:` in isolated store tests.
- `src/service/user-identity.ts` — normalize names with NFKC, trim, and locale-independent lowercase; validate at the service boundary and call the store. Let SQLite's unique normalized-name index arbitrate duplicates; use an insert-on-conflict-then-select flow so repeat or concurrent requests resolve to one user.
- `src/http/server.ts` — add `POST /auth/login`, parse JSON and validate the name before calling the user service, and return only the public user identity. Reuse the existing exact-origin rejection behavior. Keep `/ask` and `/ask/stream` behavior and payloads unchanged.
- `src/index.ts` — initialize the user store and identity service before listening; fail startup with a safe error if database initialization fails. Add an injectable user-store/service dependency for tests and close the database when the HTTP server closes.
- `src/fe/api-client.ts` — add a login API helper that sends the name and validates the returned public user object.
- `src/fe/App.tsx` — restore the active public user from a dedicated browser-local key. Render a localized login screen when no valid identity is present; on successful login save the identity and show the existing assistant. Replace the trainer label with the user's name. On logout cancel an active answer request, clear the browser-history store and user identity, then show the login screen.
- `src/fe/i18n.ts` — add Portuguese and English login, name-field, submit, request-error, and logout copy.
- `vite.config.ts` — proxy `/auth` to the API, matching the existing `/ask` development proxy.
- `.gitignore` — explicitly ignore `store/data/users.sqlite`, `store/data/users.sqlite-wal`, and `store/data/users.sqlite-shm`; keep only source/schema/test files tracked.

No database session table, cookie, external authentication, or user-aware question payload is introduced. The public identity in browser storage is for the POC UI only and is not trusted as authentication.

## 2. Data and request flow

- Store `id` (UUID text primary key), `display_name`, `normalized_name` (unique), and `created_at` (ISO timestamp) in one `users` table.
- Compute `normalized_name` in application code using NFKC, trim, and locale-independent lowercase. Never depend on SQLite `NOCASE` for Unicode behavior.
- On login, insert a new row if the normalized name is absent. If the unique key already exists, select and return the existing row without changing its first display spelling.
- Keep the existing active-user value in localStorage under a new key. Validate stored JSON with the public-user Zod schema when the app starts; malformed data behaves as logged out.
- Logout calls the existing browser history store's `clear()` operation and removes only the active-user key. Preserve the language preference. If browser storage is unavailable, clear in-memory identity/history and use the existing storage-warning pattern where practical.
- The login screen is a client-side entry gate only. Existing assistant routes remain callable without a user identity, as explicitly scoped for this POC.

## 3. Implementation sequence

1. Add user domain schemas and name normalization behavior; cover input boundaries and normalized-name equivalence.
2. Add the SQLite user store, schema initialization, unique normalized-name index, idempotent find-or-create operation, and close lifecycle.
3. Add the user identity service and `POST /auth/login`; inject it through API composition without changing assistant route contracts.
4. Add the Vite `/auth` proxy and frontend login client; gate the app on a valid browser-local public identity and add localized login states.
5. Replace the trainer label with the active user's display name and implement logout to clear identity and all local history.
6. Add end-to-end layer tests and review the ignored database paths and logout behavior.

## 4. Test strategy (`node:test`)

- Domain/service tests cover trimmed names, empty and over-limit rejection, Unicode NFKC/case normalization, and returning an existing identity.
- SQLite store tests use an in-memory or temporary database to verify schema creation, unique-name behavior, first display-name preservation, and persistence after close/reopen. Confirm that separate users can have distinct normalized names.
- HTTP tests inject a user identity service and cover successful create/reuse responses, malformed JSON, invalid names, unsupported methods, and disallowed origins. Existing `/ask` and streaming tests remain unchanged.
- Frontend tests use a helper that seeds a valid identity for existing assistant tests. New cases cover login gating, successful login and reload, login failure, sidebar display name, and logout removing both the identity key and local conversation-history key while preserving language preference.
- Run the repository test suite, typecheck, and frontend build. The SQLite store should be exercised without a live service or a committed database file.

## 5. Risks and mitigations

- **Name-only impersonation:** intentional POC behavior. Label the feature as identity selection and keep sensitive data out of it.
- **Duplicate normalized names under concurrent requests:** enforce a unique SQLite index and use conflict-safe insert/select logic rather than a separate check-then-insert only.
- **Experimental SQLite API:** isolate `node:sqlite` in one store module and keep the store interface small so a package driver can replace it later.
- **Local storage can be edited or unavailable:** validate loaded public-user data; keep logout effective in memory even if storage removal fails. Do not claim that client identity proves ownership.
- **Logout leaves history behind:** call the existing history store clear operation as part of logout and test that its key is removed; leave the language preference key untouched.
- **Database files leak into Git:** explicitly ignore the database and WAL/SHM files and verify their paths are ignored.

## 6. Review points

- Confirm the built-in `node:sqlite` choice is acceptable for this Node 22 POC despite its experimental status.
- Keep this implementation limited to name-based identity selection, SQLite-backed user records, browser-local identity, and logout cleanup.
- Preserve the agreed behavior that a repeat normalized name selects the same user and logout clears all browser-local conversations.
