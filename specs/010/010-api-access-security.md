# 010 - API access security for the frontend

## 1. Context and problem

The application has a browser frontend and an HTTP API. The POST /ask endpoint currently accepts any caller that can reach the API. For this proof of concept, the web frontend uses the HTTP API while the CLI continues to call the application service directly without HTTP authentication requirements. The API is a local development service, not a production deployment target.

The frontend is a client-side React application. A credential embedded in its JavaScript bundle is public and can be copied. CORS and an Origin allowlist can restrict ordinary cross-origin browser requests, but they do not authenticate callers: command-line tools and scripts can omit or forge the Origin header. The current Vite development server proxies /ask, while a production hosting and network topology is not defined.

This activity limits unwanted browser-based cross-origin requests while preserving direct local maintenance access. It does not claim to prevent local scripts or other non-browser clients from calling the API.

## 2. User stories

- As an application owner, I want browser requests from untrusted origins rejected, so that unrelated web pages cannot use the local model-backed endpoint through a visitor's browser.
- As a frontend user, I want valid questions from the frontend to keep working through its configured API path.
- As a CLI user, I want CLI questions to continue calling the application service directly without new HTTP credentials or network requirements.
- As an operator, I want local API access rules and their limits to be explicit, so that origin checks are not mistaken for caller authentication.

## 3. Functional requirements

- **RF-1:** Requests made through the supported frontend path must continue to use the existing POST /ask question and response contracts.
- **RF-2:** The CLI must continue to invoke the service directly and must not be required to call the HTTP API or supply frontend/API credentials.
- **RF-3:** The API must not rely on a static secret shipped to the browser or describe Origin/CORS as authentication. A local caller can omit or forge browser headers; blocking such callers is outside this proof-of-concept threat model.
- **RF-4:** For requests that include an Origin header, the API must compare it against an exact, explicitly configured frontend-origin allowlist and reject an unlisted origin before invoking the answer service. Prefix, substring, and wildcard matching are not allowed.
- **RF-5:** Requests without an Origin header must remain allowed in the local proof-of-concept configuration to support direct local maintenance calls. The API must keep its default loopback bind (127.0.0.1) so that this exception does not expose the development service to other network hosts.
- **RF-6:** The local development setup must continue to support the Vite /ask proxy. The allowed Vite origin must be explicit in configuration. This activity does not define production access controls or a production bypass.
- **RF-7:** If CORS is enabled, allow only configured frontend origins and required methods/headers. CORS is defense in depth and must not be documented as protection from direct HTTP clients.
- **RF-8:** Rejected requests must receive a safe client error and must not invoke the answer service. Existing request validation and domain error behavior must remain intact.
- **RF-9:** The security change must not expose provider credentials, proxy credentials, or internal error details in browser responses, logs, or built frontend assets.

## 4. Acceptance criteria

- **AC-1:** A valid question sent through the configured Vite frontend origin receives the existing successful response shape.
- **AC-2:** A request with an unlisted Origin is rejected before the answer handler runs, including origins that merely share a prefix or suffix with an allowed origin.
- **AC-3:** A request from the configured Vite origin succeeds through the development proxy, and a request without Origin remains available for direct local maintenance.
- **AC-4:** The API default bind remains loopback-only. Configuration and documentation state that local direct callers can still invoke the API and that origin checks do not authenticate callers.
- **AC-5:** CLI behavior and its direct service invocation remain unchanged, and CLI tests continue to pass without HTTP credentials.
- **AC-6:** Rejected requests expose no secrets or stack traces and do not call OpenRouter or retrieval services.
- **AC-7:** Existing POST /ask payload, success response, validation rules, and domain error mappings remain compatible for allowed requests.

## 5. Out of scope

- User accounts, end-user login, or per-user authorization.
- Adding a reusable API secret to frontend JavaScript or local storage.
- Changing CLI command behavior or requiring CLI users to use HTTP.
- Rate limiting, billing quotas, bot detection, or abuse analytics.
- Protection against local processes or non-browser clients that can reach loopback and forge headers.
- Production hosting, private networking, or deployment authentication.

## 6. Decisions

- This activity covers the local proof of concept only; production deployment security is deferred.
- The local API may accept direct loopback calls without an Origin header to support maintenance.
- The API rejects browser requests carrying an origin outside the configured frontend allowlist. This limits cross-origin browser use but does not make the API exclusive to the frontend against local scripts or forged headers.
