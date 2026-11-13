# 020 - Poké Ball favicon

## 1. Context and problem

The application has no favicon declaration or favicon asset. Browsers therefore show a generic or empty icon for the Pokédex AI page in tabs and bookmarks. The app already uses a Poké Ball-inspired red theme (`#f04438`) and serves static files through Vite from `public/`.

This activity adds a recognizable Poké Ball icon to the page metadata without changing the application interface, title, or theme.

## 2. User stories

- As a user, I want to see a Poké Ball icon in the browser tab so I can recognize the Pokédex AI page quickly.
- As a user, I want the icon to remain recognizable in small browser tab and bookmark sizes.
- As an operator, I want the favicon served by the application itself without a third-party asset or external network request.

## 3. Functional requirements

- **RF-1:** Declare an explicit favicon in the document head so the browser does not rely on an absent default `/favicon.ico`.
- **RF-2:** Use a Poké Ball silhouette with a red upper half, white lower half, a dark outline and divider, and a centered button. Reuse the existing red theme color where it remains legible.
- **RF-3:** Keep the design simple and high contrast so its main shape remains recognizable at 16×16 and 32×32 pixels. Do not include text, gradients, fine details, or an outer square background.
- **RF-4:** Store the icon as a project-owned static asset under `public/` and reference it with a root-relative URL that works in both Vite development and production builds.
- **RF-5:** Prefer a compact SVG favicon for crisp scaling. Add a raster fallback only if planning identifies a supported browser or platform that needs it; any fallback must depict the same design and be generated from the project-owned vector source.
- **RF-6:** Keep the page title, `theme-color`, app behavior, and existing public assets unchanged.
- **RF-7:** Do not load the favicon from a remote host, add a runtime icon package, or introduce a new build step.

## 4. Proposed visual contract

Create a circular Poké Ball mark centered in a square transparent SVG viewBox. The top semicircle uses `#f04438`; the bottom semicircle is white. A near-black outer stroke encloses the circle. A horizontal near-black divider crosses the center, and a white circular button with a near-black outline sits over that divider. Use rounded stroke caps/joins where appropriate and line widths sized to preserve a clean silhouette at 16×16 pixels.

The icon should remain legible against both light and dark browser chrome. The transparent canvas and dark outer outline provide separation without adding an opaque square. The source SVG should use explicit dimensions or a viewBox suitable for browser favicon use and avoid external fonts, CSS, or image references.

## 5. Architecture and scope

- Add one project-owned favicon asset under `public/` and add its `<link rel="icon">` declaration to `index.html`.
- Vite should serve the asset from the root URL during development and copy it to the build output unchanged.
- Do not alter React components, application CSS, page title, manifest behavior, or the existing Charizard artwork.
- Do not add Apple touch icons, installable-app metadata, or a full PWA manifest in this activity.

## 6. Acceptance criteria

- **AC-1:** `index.html` declares the project favicon with a correct MIME type and root-relative asset path.
- **AC-2:** The favicon asset exists under `public/`, contains no external dependencies, and renders a recognizable Poké Ball using the visual contract above.
- **AC-3:** The browser requests the declared icon successfully in Vite development and the production build includes the same asset at the referenced path.
- **AC-4:** The icon is visually recognizable at 16×16 and 32×32 and remains visible against light and dark browser chrome.
- **AC-5:** The page title, theme color, app behavior, and existing assets are unchanged.
- **AC-6:** No remote requests, runtime dependencies, secrets, or generated unrelated files are added.

## 7. Test and verification strategy

- Add a focused check that the HTML contains the favicon declaration and that its referenced asset exists.
- Run the frontend build and verify the favicon is emitted at the URL declared by the HTML.
- Inspect the SVG at 16×16 and 32×32 against light and dark backgrounds; adjust the geometry if the button, divider, or outline collapses at browser-tab size.
- Confirm the browser tab displays the icon after loading the application.

## 8. Review checkpoint

Review this specification before `/planejar`. The plan should confirm whether SVG-only support is sufficient for the project's target browsers, choose the exact asset path and MIME declaration, and define lightweight asset/build verification. This phase adds no implementation files.
