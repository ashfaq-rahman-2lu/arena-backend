# Backend repository separation verification

Verified on 2026-10-12 with Node 24.21.0. This directory is a separate local Git repository on `main`, with its own manifest/lockfile, dependencies, rules, lint/format configuration, tooling tests, CI, Docker build, and Render blueprint. No parent workspace or frontend source is required. Existing application/dependency versions were pinned to their previous resolved versions; Prisma's CLI is a runtime dependency so production containers can run migrations.

## Executed checks

- A fresh backend-only copy in an isolated temporary directory passed `npm ci --ignore-scripts`, Prisma generation, lint, type checks, all 54 unit tests, build, and offline OpenAPI generation. Its parent directory contains no frontend or workspace dependencies.
- The working repository passed lint, format checks, type checks, and 3 tooling-enforcement tests.
- All 18 API/migration tests passed against the dedicated temporary `arena_update_test` database. One remaining parent-relative Prisma CLI path in the harness was corrected after the independent run exposed it; this was a harness-path failure, not an application behavior regression.
- `docker compose config --quiet` passed for this repository's backend/database/inbox stack.
- `openapi.json` remains byte-identical to the frontend's explicitly supplied contract snapshot. Hash checks also confirmed generated-client reproducibility.
- The backend's test-only fixture service independently started, migrated/seeds only `arena_browser_test`, and supported frontend desktop/mobile acceptance flows through a Vite proxy, direct API access, and the real local Cloudflare Pages runtime.
- Fresh dependency installation reported zero audit vulnerabilities.

Node/npm commands launched from app directories initially selected an older system Node version. Verification explicitly used Node 24; `.nvmrc`, package engines, and `.npmrc` now make the required runtime clear. The existing development `.env` was preserved and remains ignored by Git.

## Deployment preparation

`render.yaml` explicitly selects a Free Node Web Service, applies migrations during startup, binds to Render's port/interface, and takes private Neon connection/frontend-origin settings from the deployment environment. The Render/Neon pilot guide documents direct TLS database access, a small connection pool, same-origin Pages cookie forwarding, optional Google login, and SMTP restrictions on Render Free. No authentication-verification bypass was introduced.

Docker image execution and actual Render/Neon provisioning are not verified locally. Remote repositories, commits, credentials, and deployments were not created or published. GitHub CI was configured but not executed on GitHub. Historical combined-workspace verification is retained separately under `docs/PREVIOUS_WORKSPACE_VERIFICATION.md`.

## Google callback validation fix — 2026-10-13

The deployed callback returned `400 VALIDATION_FAILED` when given Google's standard query metadata. The new regression test first failed with `property scope/authuser/prompt/hd/iss should not exist`. The callback DTO now accepts bounded optional metadata strings; signed state, code validation, provider identity verification, and explicit account linking remain required.

- Focused regression: 3 passing tests after the expected red failure.
- Backend: 57 unit tests and 18 API/migration tests passed, including successful Google callbacks with metadata and rejection of mismatched state with metadata. API tests used only the isolated local `arena_update_test` database and fake Google transport.
- Backend build, type checks, lint, format checks, and offline OpenAPI generation passed.
- The independent frontend contract snapshot and generated types were updated. All 40 frontend tests, type checks, lint, and format checks passed.
- Completing real Google login still requires verification after Render deploys the fix.
