# Arena backend

Independent NestJS API repository. It requires Node.js 24+, npm, and PostgreSQL 16+. The frontend is deployed separately; no frontend source or parent npm workspace is required to install, build, test, or package this API.

## Selected pilot hosting

Deploy this API on Render Free and connect it to Neon Free PostgreSQL. Follow [the pilot deployment guide](docs/PILOT_DEPLOYMENT.md). The frontend uses Cloudflare Pages and a same-origin API proxy.

## Local development

Use Node 24. If you manage Node with nvm, run `nvm use` in this repository first; `.nvmrc` pins the major version and npm rejects unsupported runtimes.

```sh
cp .env.example .env
```

Set `SESSION_SECRET` to at least 32 random characters. Set `DATABASE_URL` to your database and `FRONTEND_URL` to the exact frontend origin, such as `http://localhost:5173`. The existing local `.env` is preserved; review its database port before starting.

Start local infrastructure and the API from this repository:

```sh
docker compose up -d db mailpit
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API: http://localhost:3000/api/v1. Swagger: http://localhost:3000/api/docs. Development inbox: http://localhost:8025. Optional seeded account: `demo@arena.local` / `ArenaDemo2026!`.

For backend-only Swagger testing, set `FRONTEND_URL=http://localhost:3000` and restart the API. In the same browser, execute `GET /api/v1/auth/session`, then enter the returned `csrf` value in Swagger's **Authorize → csrf** field. Leave cookie authorization empty; the browser sends the signed cookies. Execute login with the demo credentials, then update the authorized CSRF value using the login response before making further mutations. All POST auth operations declare CSRF security so Swagger sends that header, including before login. Restore the frontend origin when testing through the frontend.

Alternatively, `docker compose up --build` runs this API plus its local database and inbox. Start the independent frontend separately.

## Separate deployment

Build from this repository root:

```sh
docker build -t arena-backend .
```

Supply production settings through the deployment environment: `NODE_ENV=production`, `HOST=0.0.0.0`, your `PORT`, PostgreSQL `DATABASE_URL`, a private `SESSION_SECRET`, `COOKIE_SECURE=true`, and `FRONTEND_URL=https://arena-tour.pages.dev` (no trailing slash). Set this in the backend hosting service's environment variables; `render.yaml` includes this value for Blueprint deployments. Deploy one API instance. Configure SMTP and optional Google/vision credentials on the API only. The container applies committed migrations before starting; with other hosting, run `npm run db:migrate` as a release step, then `npm start` after `npm run build`.

Frontend and API may use sibling HTTPS subdomains, e.g. `app.example.com` and `api.example.com`. Signed HttpOnly cookies use `SameSite=Lax`; credentialed CORS permits only `FRONTEND_URL`. If hosts have different root domains, route `/api` through the frontend's ingress to the separately deployed API to keep browser cookies same-site. Arbitrary cross-site cookie support is not enabled.

Set `GOOGLE_CALLBACK_URL` to the API's public callback, e.g. `https://api.example.com/api/v1/auth/google/callback`, and register that exact URI with Google. After callback, the API redirects to `FRONTEND_URL/dashboard`. Google accounts are linked only through explicit authenticated linking.

Keep `TRUST_PROXY=false` for direct access. Enable it only behind the trusted ingress; this API trusts one proxy hop. Auth limits default to 20 requests/minute/IP and extraction to 5/minute/admin.

## API contract handoff

```sh
npm run openapi
```

`openapi.json` is the canonical schema. CI checks regeneration drift and uploads it as an artifact. Publish that artifact with API releases, or expose `/api/openapi.json`. The independent frontend commits its own schema snapshot and regenerates its client explicitly; backend builds never write into another repository.

## Verification

```sh
npm run test:tooling
npm run lint
npm run format:check
npm run typecheck
npm test
```

Database tests require a dedicated database whose name ends in `_test`:

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/arena_test npm run test:e2e
```

Tests guard the name before migrations or cleanup and inject provider fakes. Never use a development database for acceptance tests. Membership migrations preserve/backfill valid byes and abort atomically on inconsistent existing records; apply migrations in order without resetting data.

## Browser fixture service

The frontend's browser suite uses an explicitly started test API. Create a database named exactly `arena_browser_test`, then run:

```sh
BROWSER_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/arena_browser_test npm run test:browser-server
```

This service applies migrations, clears only that guarded test database, seeds test-only accounts/competitions, injects email/vision fakes, and listens on port 3001. It is not a production server. For frontend CI, package it separately with `docker build --target browser-test -t arena-browser-fixture .`; publish that test image only if you want to run the frontend's manual browser workflow against it.

See `VERIFICATION.md` for current separation checks and `docs/` for historical product/update plans.
