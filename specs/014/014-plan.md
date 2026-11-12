# 014 - Technical Plan

## 1. Architecture

Keep language selection in the frontend localization module. The app already initializes its React state through `readLanguagePreference()` and persists manual changes through `saveLanguagePreference()`. Extend this boundary so initial selection follows this precedence:

1. A valid language explicitly saved in local storage.
2. The first supported language found in the browser's preferred-language list.
3. Brazilian Portuguese (`pt`).

Proposed changes:

- `src/fe/i18n.ts` — add a small browser-language detection/resolution function that accepts language tags, checks them in order, and maps primary subtags `pt` and `en` to the existing UI language codes. Extend `readLanguagePreference()` to use the detected browser preference only when storage has no valid saved choice. Read browser language APIs defensively so server-side rendering, restricted environments, or missing values fall back to Portuguese.
- `src/fe/App.tsx` — retain the current lazy state initialization through `readLanguagePreference()`, allowing the new resolution behavior to apply on the first render. Keep the existing selector handler and persistence behavior, and synchronize the document `lang` attribute with the active UI language.
- `src/fe/i18n.test.ts` — add coverage for regional tags, case-insensitive matching, ordered preferences, unsupported tags, valid and invalid saved preferences, unavailable browser-language data, and storage exceptions using injected dependencies rather than changing global browser state.
- `src/fe/App.test.tsx` — verify the initial interface language reflects browser preferences when no saved choice exists and that a saved choice overrides them, using the existing frontend test setup.

No service, API, domain schema, or dependency changes are needed. The selected UI language remains independent from answer generation, which continues to use the question language.

## 2. Data and matching decisions

- Keep the persisted values and `Language` union as `pt` and `en`; do not persist regional tags.
- Match language tags by their primary BCP 47 subtag (the segment before the first hyphen), after trimming and case normalization. Accept only exact primary subtags `pt` and `en`; do not treat values such as `ptx` or `english` as supported languages.
- Consider browser preferences in priority order. Use `navigator.languages` when it provides a non-empty list; otherwise use `navigator.language` as a single fallback preference.
- Treat an unavailable or unusable browser language source as no match and return `pt`.
- Preserve a valid stored user selection even if the current browser preference differs. Ignore unsupported stored values and continue to browser detection.

## 3. Error handling and compatibility

- Keep storage reads and writes guarded so restricted browser storage cannot prevent startup or an in-session language change.
- Access browser language information only in a safe browser-aware helper; when `window`/`navigator` is unavailable, use the Portuguese default.
- Preserve current selector accessibility and behavior, `pokedex-ai.language` storage key, supported language labels, and `/ask` request/response contract.
- Do not persist an automatically detected language as a manual preference. This lets browser preference changes apply on later visits until the user chooses a language explicitly.

## 4. Test strategy (`node:test`)

- Unit tests exercise language-tag mapping for `pt-BR`, `pt-PT`, `en-US`, `en-GB`, mixed case, malformed values, and unrelated prefixes.
- Unit tests verify priority ordering, unsupported languages before a supported language, all-unsupported fallback, and the `navigator.language` fallback when the preferred list is absent or empty.
- Preference tests verify a saved supported value overrides detection, an invalid value falls through to detection, and missing/throwing storage uses detection without throwing.
- Frontend tests verify Portuguese/English copy on initial render according to browser preferences, manual selection persistence, and saved preference precedence.
- During implementation, run the repository test, typecheck, and frontend build commands in accordance with project conventions.

## 5. Risks and mitigations

- **Browser APIs vary by environment:** centralize access behind a guarded helper and cover absent `navigator` data with deterministic tests.
- **Regional and malformed tags:** parse only the primary subtag and compare against the explicit supported set, avoiding accidental prefix matches.
- **Manual selection could be lost to locale detection:** always validate and check stored preference before consulting browser language settings.
- **Automatic detection could become sticky:** do not save detected values; only the existing explicit selector action writes the preference.

## 6. Review points

- Confirm this plan before proceeding to `/tarefas`.
- During implementation, keep the change limited to initial frontend language selection and its coverage; preserve the current manual selector, translations, and question-language answer behavior.
