# 014 - Detect the user's interface language

## 1. Context and problem

The frontend supports Brazilian Portuguese (`pt`) and English (`en`). On a first visit, it currently defaults to Portuguese regardless of the browser's preferred language. Users who prefer English must change the selector manually.

The application should select an available interface language from the browser's language preferences on first use. If none of the supported languages matches, Brazilian Portuguese is the default. A language explicitly selected by the user should continue to take precedence on later visits.

## 2. User stories

- As a first-time visitor whose browser is set to English, I want the interface to open in English without changing a setting.
- As a first-time visitor whose browser is set to Brazilian Portuguese, I want the interface to open in Brazilian Portuguese.
- As a visitor whose browser language is unsupported, I want a usable Portuguese interface by default.
- As a returning visitor, I want the language I chose manually to remain selected regardless of browser settings.

## 3. Functional requirements

- **RF-1:** On startup, the frontend must use a valid, previously saved user language preference when one exists.
- **RF-2:** If there is no valid saved preference, the frontend must detect the browser's preferred languages in their reported priority order and choose the first supported language.
- **RF-3:** Language matching must support regional tags: any Portuguese language tag (for example, `pt-BR` or `pt-PT`) maps to the supported Brazilian Portuguese interface (`pt`), and any English language tag (for example, `en-US` or `en-GB`) maps to the supported English interface (`en`). Matching is case-insensitive and must not match unrelated language tags that merely begin with the same letters.
- **RF-4:** If browser language preferences are absent, unavailable, or contain no supported language, the frontend must default to Brazilian Portuguese (`pt`).
- **RF-5:** Selecting a language through the existing interface control must update the interface immediately and persist that explicit choice using the existing browser storage mechanism.
- **RF-6:** If browser storage is unavailable or throws while reading, startup must remain usable and fall back to browser detection, then to Portuguese if no supported browser language is available. Storage write failures must not prevent an in-session language change.
- **RF-7:** Keep the supported language set as Brazilian Portuguese and English. This change applies to frontend interface localization only; generated answer language continues to follow the user's question as defined by the existing answer behavior.
- **RF-8:** Keep the document's `lang` attribute synchronized with the active interface language (`pt-BR` for Portuguese and `en` for English) so browser and assistive-technology language metadata matches the rendered interface.

## 4. Acceptance criteria

- **AC-1:** With no saved preference and browser preference `en-US`, the frontend starts in English.
- **AC-2:** With no saved preference and browser preference `pt-BR`, the frontend starts in Brazilian Portuguese.
- **AC-3:** With preferences ordered as `fr-FR`, then `en-GB`, the frontend selects English; preference order is respected when more than one supported language is present.
- **AC-4:** With no saved preference and only unsupported browser languages, the frontend starts in Brazilian Portuguese.
- **AC-5:** A saved supported preference takes precedence over browser languages, and remains selected after reload.
- **AC-6:** An invalid saved preference is ignored and browser detection is used.
- **AC-7:** Missing browser language APIs and storage read/write exceptions do not prevent the interface from rendering or the user from changing its language.
- **AC-8:** The interface remains limited to Brazilian Portuguese and English, and the `/ask` API contract is unchanged.
- **AC-9:** The document language is `pt-BR` when the Portuguese interface is active and `en` when the English interface is active, including after a manual language change.

## 5. Out of scope

- Adding more interface translations or a language selector beyond the existing Portuguese and English options.
- Changing the language of generated answers based on the browser locale; answer language continues to follow the question.
- Adding server-side language detection, account preferences, or changes to the `/ask` request/response schema.

## 6. Open questions

- None. Browser language preferences are the detection source; a saved manual choice has priority, and unsupported or unavailable preferences fall back to Brazilian Portuguese.
