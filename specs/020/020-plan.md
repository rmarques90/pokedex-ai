# 020 - Technical Plan: Poké Ball favicon

## 1. Architecture decisions

- Use one SVG favicon at `public/favicon.svg`. SVG suits a simple geometric icon, scales without separate raster sizes, and is served as a static file by the existing Vite setup.
- Declare it in `index.html` as `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`. The root-relative path resolves consistently in Vite development and when deployed at the site root, matching the application's current deployment assumption.
- Target current mainstream browsers that support SVG favicons. Do not add a PNG/ICO fallback, Apple touch icon, or web app manifest in this activity. Revisit a raster fallback only if a supported deployment target requires one.
- Use a 64×64 viewBox and vector geometry with a transparent square canvas. Draw a red upper semicircle (`#f04438`), white lower semicircle, near-black circular outline and horizontal center line, and a white center button with a near-black outline. Keep strokes and button large enough to survive 16×16 rendering.
- Keep the favicon self-contained: no external styles, fonts, raster references, JavaScript, or dependencies.

## 2. Code changes by file

- `public/favicon.svg` — add the project-owned Poké Ball vector asset. Use a complete circular silhouette with no square background; keep shape geometry simple and high contrast.
- `index.html` — add the explicit SVG icon link in `<head>`, next to the existing metadata. Preserve the current title, viewport, language, and theme-color values.
- `src/fe/favicon.test.ts` — add a focused Node test, following the repository's `node:test` conventions. Read the root HTML and public SVG; verify that the declared root-relative href and MIME type match the asset, the asset exists, and the SVG is self-contained. Keep checks aligned with the published contract rather than snapshotting SVG formatting.

No React component, application stylesheet, Vite configuration, package dependency, README, manifest, or existing public image needs to change.

## 3. Test and verification strategy

1. Add the focused favicon test first and confirm it fails before the asset/link are added.
2. Add the SVG and HTML declaration, then run the focused test and the project's full `npm test` command.
3. Run `npm run build:fe` and confirm `dist/favicon.svg` exists and `dist/index.html` still declares `/favicon.svg`.
4. Start Vite and request `/favicon.svg`; confirm it returns the SVG successfully. Load the page in a browser and verify the tab icon appears.
5. Inspect the icon at 16×16 and 32×32 against light and dark backgrounds. Adjust strokes or the center button if any essential part becomes indistinct.
6. Review the diff to confirm the title, theme-color, application behavior, and existing assets did not change and there are no generated files beyond expected build output.

## 4. Implementation sequence

1. Add a focused static asset/HTML contract test.
2. Create `public/favicon.svg` from the visual contract and declare it in `index.html`.
3. Run the focused test, full test suite, frontend build, and browser/visual checks.
4. Review the diff and acceptance criteria; keep the generated `dist/` output out of the change if it is not tracked by the repository.

## 5. Acceptance mapping

- **AC-1:** Covered by the focused HTML test matching `rel="icon"`, `type="image/svg+xml"`, and the root-relative href.
- **AC-2:** Covered by asset existence and self-contained SVG checks plus visual review.
- **AC-3:** Covered by frontend build artifact inspection and a successful development-server asset request.
- **AC-4:** Covered by manual inspection at 16×16 and 32×32 over light and dark backgrounds, and browser tab confirmation.
- **AC-5:** Covered by diff review for the existing title, theme-color, and application files.
- **AC-6:** Covered by SVG self-containment checks and diff review for dependencies, network references, secrets, and generated files.

## 6. Risks and mitigations

- **Fine details disappear at tab size:** use only large shapes and inspect a true 16×16 rasterized preview before finalizing.
- **White lower half blends into light chrome:** preserve the near-black outer stroke and divider; do not add a full square background.
- **Deployment below a URL prefix:** the application and current Vite configuration assume root-relative assets. If a subpath deployment is introduced, update the favicon URL to use the configured Vite base path as a separate deployment change.
- **Older browser support:** this activity targets current mainstream browsers with SVG favicon support. Add a PNG/ICO fallback only if the product defines legacy browser or platform support.

## 7. Review checkpoint

Review this plan before `/tarefas`. It selects SVG-only support, `public/favicon.svg`, a root-relative HTML declaration, one focused `node:test` contract test, and frontend build plus browser visual verification. No implementation files are created in this phase.
