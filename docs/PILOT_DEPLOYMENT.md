# Zero-budget pilot: Render Free API + Neon Free PostgreSQL

The independent frontend repository deploys to Cloudflare Pages. Its Pages Function forwards `/api/*` to Render so browser session cookies belong to the frontend's origin. No third-party-cookie policy change or custom domain is needed.

## Neon

Create a Free Neon project and database. In Connect, disable connection pooling and copy the direct PostgreSQL connection string with TLS (`sslmode=require`). This repository uses the standard Prisma 6 PostgreSQL connector; no Neon driver adapter or schema change is required. The same direct URL supports the long-running API and committed migrations. Keep a small application connection pool, e.g. append `connection_limit=3&pool_timeout=30` to its existing query parameters. Store this URL only as Render's `DATABASE_URL`.

Do not run the development seed or acceptance tests against Neon pilot data. Tests use separate guarded `_test` databases.

## Render

Push this backend repository to your Git host. Connect it to a Free Render Web Service using Docker runtime, or create a Blueprint from `render.yaml`. The blueprint explicitly chooses the Free plan and creates no Render database.

- Dockerfile: `Dockerfile` (includes the CPU PaddleOCR runtime and cached recognition model)
- Startup: container applies migrations and starts the API
- Health path: `/api/v1/health`
- Node version: `24.21.0`
- `NODE_ENV=production`, `HOST=0.0.0.0`, `COOKIE_SECURE=true`
- `FRONTEND_URL=https://arena-tour.pages.dev` (exact origin, no trailing slash)
- `DATABASE_URL`: the private Neon direct connection string
- `SESSION_SECRET`: private random value of at least 32 characters; Blueprint can generate it
- `TRUST_PROXY=true` for Render's managed ingress, which is the one trusted proxy hop

Render supplies `PORT`. Migrations run at startup because the Free pilot does not depend on a paid pre-deploy job. Run one API instance. Its process-local limits remain in effect. Behind the Pages gateway, some auth requests may share gateway egress-IP buckets; keep pilot volume in mind when choosing `AUTH_RATE_LIMIT`. Extraction remains limited per authenticated admin.

Once Render supplies the `https://YOUR-API.onrender.com` address, set it as the frontend Pages Function's `API_ORIGIN`. The browser uses its Pages origin for API requests, while the backend remains a separate deployment.

## Pilot authentication and optional integrations

Render Free blocks outbound SMTP ports 25, 465, and 587. Keep SMTP variables unset unless you have verified an allowed alternative. Email/password registration and reset require real delivery; disabling email does not bypass verification. A future HTTPS email adapter would be a separate provider decision.

For a pilot without an email service, configure the existing Google sign-in integration:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Render
- `GOOGLE_CALLBACK_URL=https://YOUR-PROJECT.pages.dev/api/v1/auth/google/callback`
- Register that exact callback with Google. If the OAuth application is in testing mode, configure its pilot users in Google's console.

The callback must use the Pages domain because OAuth state and session cookies pass through its proxy. The API redirects successful login back to its configured `FRONTEND_URL`.

Google callbacks include optional `scope`, `authuser`, `prompt`, `hd`, and `iss` query metadata. The callback accepts bounded strings for these fields while still validating the required state/code and signed state cookie. Identity and account linking use Google's verified userinfo response, not callback metadata. A `400 VALIDATION_FAILED` immediately after consent on an older deployment can mean its callback DTO rejects these standard fields; deploy the callback validation fix and restart sign-in from the frontend.

Scorecard extraction uses local PaddleOCR with no API key or per-image fees. The Docker build downloads the free recognition model once. It reads home/away scores and all 13 match statistic rows by position in the supported eFootball template and ignores team names. Stats are returned as suggestions and displayed for review; only scores are persisted when saving a result. Confirm that the host has enough memory for the Node API plus PaddleOCR; manual entry remains available if extraction fails.

## Free-service behavior

Render Free sleeps after 15 minutes without inbound traffic and can take about a minute to wake. The Pages proxy allows up to 90 seconds for a request and returns a safe retry message on gateway failure. A request can still fail during startup; do not repeatedly submit mutations without reviewing their state. This implementation does not add keep-alive jobs to defeat idle behavior.

Free limits and policies can change. Monitor Render and Neon's dashboards; keep the selected Free plans and avoid enabling paid upgrades. Hosting accounts, credentials, remote repositories, and actual production deployments are not created by this source change.

Sources checked during implementation:

- [Render Free behavior and SMTP limits](https://render.com/docs/free)
- [Render Blueprint fields](https://render.com/docs/blueprint-spec)
- [Neon connection setup](https://github.com/neondatabase/website/blob/main/content/docs/get-started/connect-neon.md)
