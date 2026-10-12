# Update-plan verification

Verified locally on 2026-10-12 with Node.js 24 and a temporary PostgreSQL 18 cluster. The backend and frontend update plans were implemented together. Existing cookie authentication, league/cup rules, routes, and Arena's dark/lime branding remain the defaults. No deployment or live paid-provider call was made.

## Executed checks

- `npm run test:tooling`: 5 passing enforcement tests. Deliberately invalid fixtures are rejected for missing parameter/return annotations, unsafe operations/casts, artifact suffix/filename violations, and inaccessible focusable elements.
- `npm run lint`, `npm run format:check`, and `npm run typecheck`: passing across source, tests, seed code, and handwritten TypeScript scripts.
- Backend production compilation: passing. `npm run test -w backend`: 54 passing tests covering domain rules, configuration, safe errors, audit allow-lists, image processing, and injected Google/vision adapters.
- `npm run test -w frontend`: 30 passing tests across 9 files, including `.test.tsx` discovery, pagination, session bootstrap/identity isolation, cancellation, stable draft IDs, numeric validation, failed dialogs, stale reapplication, extraction races, upload cleanup, correction previews, dirty navigation, field focus, and dialog dismissal.
- `TEST_DATABASE_URL=... npm run test:e2e`: 18 passing API/migration tests. Runtime response fixtures are checked against generated OpenAPI schemas with AJV.
- `BROWSER_DATABASE_URL=... npm run test:browser`: 6 passing production-build Playwright scenarios across desktop 1440px and mobile 375px Chromium projects, using injected integrations and test-only accounts.
- `npm run api:generate`: passing. A second regeneration produced byte-identical SHA-256 hashes for `backend/openapi.json` and `frontend/src/generated/api.ts`. CI checks the same artifacts with `git diff --exit-code`.
- `npm audit --audit-level=high`: zero reported vulnerabilities.
- `docker compose config --quiet`: passing. The Docker daemon is unavailable, so image builds and the full Compose stack were not verified.

API tests used `arena_update_test`; browser tests used exactly `arena_browser_test`. The harness checks database names before migrations or cleanup. Migration tests create temporary sibling `_test` databases, deploy all committed migrations from scratch, preserve/backfill valid existing byes, reject cross-tournament references, and prove inconsistent existing membership causes an atomic abort without deleting or changing the original rows. Development data was not reset or migrated.

## Test-first evidence

Behavioral regression coverage was established before structural moves. Examples of executed red → green → refactor cycles include:

- Empty score submission initially lacked `aria-invalid` and first-error focus. The failing component assertion now passes; empty inputs remain empty rather than becoming zero, and no API request starts.
- Dirty identity-dialog cancellation initially called close without requesting discard confirmation. The new test failed, then passed after cancellation reused the modal's dismissal boundary; declining discard retains the exact draft.
- Initial dialog focus selected Close instead of the first editable field. The failing focus assertion passes after changing initial focus selection, with trigger focus restored on close.
- The desktop result dialog was 370px off-center. A production browser assertion failed, then passed after restoring native-dialog centering.
- At 200% text size, mobile navigation extended below its fixed-height header. A browser containment assertion failed, then passed after allowing header height to grow and navigation to wrap.
- Vision adapter tests initially received a raw timeout or Zod validation error for malformed envelope/score data. All three now pass with safe typed `INTEGRATION_UNAVAILABLE` errors through the injected transport.
- Tooling fixtures prove forbidden examples fail lint while the corresponding explicitly typed/accessible examples pass.

Harness mistakes—wrong CSRF fixtures, incorrect expected HTTP status codes, invalid image bytes, a missing test router, and incorrect test matcher/CLI syntax—were repaired separately. They are not counted as behavioral red evidence.

## Intentional contract and workflow changes

Unknown request properties now fail validation. List/history/preview responses use bounded pagination, deterministic ordering, and named DTOs. Dashboard list responses contain summaries and owner-wide totals rather than full competition aggregates. Error codes replace message-text inspection, including verification-required, stale revision, unavailable integration, and reset-confirmation reasons. OpenAPI describes runtime nullable objects and finite competition/action values.

Configuration is validated through every bootstrap path. Optional integrations are represented explicitly, partial credentials fail startup, production requires HTTPS/secure cookies, and all provider connections have finite timeouts. Provider overrides are installed before test application creation. Safe logs include request IDs and omit credentials, image bytes, and arbitrary provider response data. Health checks go through a feature repository.

Feature-owned Nest modules and repositories share one injectable database client. Competition mutations retain row locking, owner/revision checks, result updates, and audit writes within the same transaction; setup uses bulk inserts with preassigned IDs. Match workflows delegate through a narrow tournament mutation port. Domain models use finite competition values and remain independent of Prisma and HTTP DTOs.

Frontend reads use owner-scoped query keys with filters/pages/revisions and separate public keys. Session requests coalesce, identity changes invalidate CSRF and prior-owner work, and successful writes refresh affected private/session queries. Setup/editor drafts survive refetches and failed saves. Stale recovery requires local/latest review, explicit reapplication, validation, and a separate save. Correction confirmations require fresh impact previews. Extraction preserves touched fields, requires ambiguous-side mapping, distinguishes null from zero, ignores obsolete requests, and never persists a result.

## Browser and visual verification

The browser suite exercises sign-in, 20-card server pagination, keyboard tabs, public viewing, 50-row local fixture pagination, league/cup setup, dirty navigation, scorecard suggestions, clear confirmation, focus restoration, and a knockout correction that removes the downstream final only after confirmation. The cup setup uses the UI; completing its initial knockout results uses a contract-validated HTTP fixture before the correction is performed in the UI.

Axe checks pass on the tested dashboard, setup, public, fixture, editor, and correction states. Browser assertions verify 200% text zoom keeps navigation contained and avoids page-level horizontal scrolling. Public polling stays visible-only at 15 seconds and retains loaded data when refresh fails. Reduced-motion rules and scrollable table/bracket containers are included.

Saved screenshots were visually inspected at 1440px and 375px, including long names, the result dialog, and 200% text zoom. Mobile screenshots use device scaling, so PNG pixel dimensions exceed the CSS viewport width. Dialog contents scroll inside the modal when taller than the viewport.

Screenshots: `frontend/e2e/screenshots/desktop-dashboard.png`, `desktop-fixtures.png`, `desktop-correction.png`, `desktop-zoom.png`, and corresponding `mobile-*.png` files. Playwright retains traces/screenshots on failures and CI uploads reports and screenshots.

## Measurements and remaining limits

The production entry JavaScript is **116.69 kB gzip** (367,973 bytes uncompressed); CSS is approximately **10.63 kB gzip**. The landing page is lazy-loaded at 2.70 kB gzip; auth is 2.10 kB, setup 3.79 kB, tournament management 8.72 kB, and score editing 4.42 kB, excluding their shared chunks. These are chunk measurements, not total route transfer sizes.

Route splitting and production minification reduced the first update build from 122.27 kB gzip to 116.69 kB. The requested smaller-than-114.61 kB initial-JavaScript target remains **unmet by 2.08 kB**. Navigation blocking uses the existing router's data-router runtime; further initial-payload work remains a performance follow-up. No framework version was upgraded to achieve the update.

For a 64-team league with 2,016 fixtures, the production fixture-tab interaction rendered the first 50 rows in 119ms on desktop and 129ms on mobile in the recorded run. This measures elapsed time from keyboard tab selection through Playwright's row-count assertion on this machine, not a controlled benchmark or latency guarantee. Memoization and virtualization were not added without evidence of a need.

Live Google OAuth, SMTP delivery, and OpenAI were not contacted. Typed fake-provider tests cover service behavior, timeouts, malformed responses, and failed token delivery cleanup; they cannot verify external credentials or actual provider availability. Docker image/stack execution, CI execution on GitHub, production hosting, and deployment remain unverified. This workspace has no Git metadata; local generated-file drift was verified by hashes, while the committed CI workflow uses Git.

Deploy one API process as agreed. Apply existing migrations followed by the round-membership migration without resetting data; inconsistent existing records require an authorized repair before retrying. README documents exact-origin cookies/CSRF, configuration, trusted-ingress assumptions, and test commands.
