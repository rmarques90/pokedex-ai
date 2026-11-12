# 017 - Name-based user identification

## 1. Context and problem

The application currently has no user identity. The frontend shows a static trainer label, and the API does not persist users. User memory is planned for a later activity; this proof of concept first needs a simple way for a visitor to identify themselves by name.

This is not secure authentication. It is a lightweight identity selection flow for testing: no password, verified ownership, or persistent server-side session is required. User records must be persisted by the API in SQLite, and the database file must be excluded from Git.

## 2. User stories

- As a visitor, I want to enter my name before using the assistant, so that the application can identify me for future features.
- As a returning user, I want the same name to resolve to the same user record, so that duplicate users are not created.
- As a signed-in user, I want to see my name where the trainer label appears and have a logout action, so that I can tell which identity is active and clear my browser state when I leave.
- As an operator, I want user records stored by the API in SQLite, so that names remain available across browser reloads and API restarts.

## 3. Functional requirements

- **RF-1:** When the browser has no active user identity, show a login screen that requests only a name. Use the selected/detected interface language for its labels and messages.
- **RF-2:** Trim and validate the submitted name at the API boundary. Accept 1 to 50 Unicode characters after trimming; reject empty or over-limit input with a safe client error.
- **RF-3:** Create a user when no user has the submitted normalized name. If the normalized name already exists, return the existing user rather than creating a duplicate.
- **RF-4:** Normalize names consistently for uniqueness by applying Unicode NFKC normalization, trimming, and locale-independent case folding. Preserve the first accepted display spelling for presentation, and enforce uniqueness in SQLite on the normalized name, including for concurrent requests.
- **RF-5:** Persist user records through API → service → store layers using SQLite. The frontend must never access the SQLite database directly.
- **RF-6:** After a successful login response, keep the public user identity (`id` and display `name`) in browser-local storage so reloads restore the identity during this POC. No server-side session table or token is required.
- **RF-7:** Replace the static trainer label in the sidebar with the active user's display name and provide a logout action in that area.
- **RF-8:** On logout, clear the active user identity and all existing browser-local conversation history, then return to the login screen. Do not associate or partition local history by user in this activity.
- **RF-9:** Keep existing `/ask` and `/ask/stream` request and response contracts unchanged. They do not require login credentials in this POC; the login flow records identity for future features.
- **RF-10:** Add the SQLite database file and its WAL/SHM sidecar files to `.gitignore`; no database or user record may be committed.

## 4. Acceptance criteria

- **AC-1:** A visitor without an active browser-local identity sees a localized login screen with one name field and a submit action; the assistant is shown after login succeeds.
- **AC-2:** Logging in with a new valid name creates one user record; logging in again with the same normalized name returns that same record without creating a duplicate.
- **AC-3:** Names that differ only by surrounding whitespace, Unicode NFKC compatibility forms, or letter casing resolve to the same user; the first stored display spelling is shown.
- **AC-4:** Invalid names return a safe client error and do not create a user record.
- **AC-5:** The active identity survives page reload using browser-local storage, while the user record survives API restart using SQLite.
- **AC-6:** The sidebar displays the active user's name in place of the trainer label and includes a logout action.
- **AC-7:** Logout removes the browser-local identity and all browser-local conversation history, then displays the login screen. A following login can select or create a user again.
- **AC-8:** The SQLite database and its WAL/SHM sidecars are ignored by Git, while schema code and tests remain tracked.
- **AC-9:** SQLite access stays within the API persistence layers, and existing assistant answer payloads remain unchanged.

## 5. Out of scope

- Passwords, email addresses, identity providers, account recovery, verified ownership, roles, or security guarantees.
- Server-side sessions, token issuance, session expiry, or requiring a logged-in identity for `/ask` routes.
- User-specific assistant memory or changes to answer generation and retrieval.
- Moving conversation history from browser storage into SQLite or preserving local history across logout.
- Administrative user management or deletion workflows.

## 6. POC limitations

- Anyone can enter an existing user's name and select that identity. This behavior is intentional for the testing POC and must not be treated as secure authentication or used to protect sensitive personal data.
- The active identity and conversation history live in browser storage. Clearing browser storage removes the active identity but does not remove the SQLite user record.
- Logging out clears all local conversation history in the browser, including history created before login; local history is not partitioned by identity.

## 7. Proposed API behavior

- `POST /auth/login` with `{ "name": "..." }`: normalize and validate the name, find or create the unique user, and return the public user identity (`id` and display `name`).
- No session or logout API is needed for this POC; logout is a frontend action that clears the browser-local identity and history.
- Existing `POST /ask` and `POST /ask/stream` continue to accept their current payloads and require no identity credential.

## 8. Data and deployment assumptions

- Store the SQLite database at `store/data/users.sqlite`; explicitly ignore that file and its `-wal` and `-shm` sidecars in `.gitignore`.
- Create or migrate the schema during API startup before accepting requests. If database initialization fails, fail API startup with a safe diagnostic rather than silently running without persistence.
- Persist a user identifier, display name, normalized unique name, and creation timestamp. A single users table is sufficient for this POC; there is no sessions table.
- The login UI and API are served on separate localhost ports in development. Use the existing exact-origin checks for the login POST and do not enable arbitrary origins.

## 9. Confirmed decisions

- This is a name-only testing POC with no ownership verification or security guarantee.
- Logging out clears all browser-local conversation history; history is not preserved between identities.
