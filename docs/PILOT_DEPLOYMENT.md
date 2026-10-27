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

Production account emails use the existing SMTP adapter with Brevo on port 2525, an alternative to Render Free's blocked outbound SMTP ports 25, 465, and 587. Email/password registration, password setup/reset, and email changes require real delivery; Google sign-in alone does not configure email. No new provider SDK or frontend deployment change is needed.

### Brevo account email

1. Create a Brevo account and enable transactional sending. In **SMTP & API → SMTP**, copy the SMTP login and generate an SMTP key. Use the SMTP key rather than a Brevo API key or account password.
2. In **Senders, Domains & Dedicated IPs**, add and verify the exact sender address you want to use. For a branded sender, authenticate a domain you own with Brevo's DNS records. A sender on Gmail or an unauthenticated domain may be replaced with a `brevosend.com` sender address; this does not change Arena's password-reset link.
3. In **Render → arena-api → Environment**, configure the following values on the API service:

   ```env
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=2525
   SMTP_SECURE=false
   SMTP_USER=YOUR_BREVO_SMTP_LOGIN
   SMTP_PASSWORD=YOUR_BREVO_SMTP_KEY
   MAIL_FROM=Arena <YOUR_VERIFIED_SENDER_EMAIL>
   ```

   Replace the three `YOUR_...` values with your account settings. Enter the values without surrounding quotes in Render. Keep credentials out of Git and frontend variables. Do not use `127.0.0.1`, `mailpit`, port `1025`, or the local `arena.local` sender for the deployment. `SMTP_SECURE=false` selects a connection that can upgrade with STARTTLS instead of implicit TLS; it does not disable Nodemailer's automatic STARTTLS negotiation.
4. Save the environment and redeploy/restart the API. New Blueprint deployments prompt for `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` via `sync: false`. For an existing Blueprint or manually created service, enter these values directly in Render; syncing the file alone does not fill them. Startup rejects a Brevo host without credentials or an explicit `MAIL_FROM`, instead of waiting for the first password-email request to fail.
5. After deployment, request **Set password by email** from a signed-in account without a password. Confirm delivery in Brevo's transactional email logs and the recipient inbox, then use the link on the Pages site. Successful HTTP acceptance does not by itself prove inbox delivery. Automated tests use fake email delivery and never send real messages.

Local `.env` and `compose.yaml` continue using Mailpit at port 1025 with its inbox at `http://localhost:8025`. No live SMTP login is required locally. To run an explicitly Google-only deployment instead, remove all SMTP values; the integration remains optional, but email-dependent account actions will not work.

References:

- [Brevo SMTP credentials](https://developers.brevo.com/docs/smtp-integration)
- [Brevo alternative SMTP port 2525](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525)
- [Brevo sender-domain authentication and address replacement](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
- [Render environment variables and secret values](https://render.com/docs/blueprint-spec#environment-variables)

### Google sign-in

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
