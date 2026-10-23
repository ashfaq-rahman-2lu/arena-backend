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

Supply production settings through the deployment environment: `NODE_ENV=production`, `HOST=0.0.0.0`, your `PORT`, PostgreSQL `DATABASE_URL`, a private `SESSION_SECRET`, `COOKIE_SECURE=true`, and `FRONTEND_URL=https://arena-tour.pages.dev` (no trailing slash). Set this in the backend hosting service's environment variables; `render.yaml` includes this value for Blueprint deployments. Deploy one API instance. Configure SMTP and optional Google credentials on the API only. PaddleOCR runs locally without API credentials. The container applies committed migrations before starting; with other hosting, run `npm run db:migrate` as a release step, then `npm start` after `npm run build`.

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

## Local score extraction with PaddleOCR

Scorecard upload is available only for `EFOOTBALL` tournaments. The API rejects extraction for other games with `400 RULE_VIOLATION`; manual result entry remains available for every game. Extraction supports the full eFootball result screenshot represented by `test/fixtures/scorer_image.jpg`. It reads both yellow score tiles and all 13 statistic rows: possession, shots, shots on target, fouls, offsides, corner kicks, free kicks, passes, successful passes, crosses, interceptions, tackles, and saves. Left is home, right is away. Team names/aliases are ignored. The extraction response includes `stats` entries with `key`, `label`, `home`, `away`, and `unit` (`percent` or `count`); possession is a number from 0 to 100. The frontend shows stats for review only; saving a result still persists scores only. It returns a suggestion; users still review and save the result. Penalty/tiebreak values are not extracted. Unreadable or low-confidence score/stat cells remain null with warnings, including on unsupported layouts; zero remains zero. Keep the entire screenshot with the same layout and aspect ratio; scaled copies are supported, cropped/shifted layouts are not.

Install Python 3.11 or 3.12, then run from this backend repository:

```sh
python3 -m venv .venv-ocr
.venv-ocr/bin/pip install -r ocr/requirements.txt
.venv-ocr/bin/python ocr/score_reader.py --warmup
```

Set `PADDLEOCR_PYTHON` in `.env` to the absolute path of `.venv-ocr/bin/python`, then start/restart the API. The default is `python3` when dependencies are installed there. Warmup downloads the free English recognition weights once; subsequent extraction runs on CPU locally with a configurable 75-second limit (`PADDLEOCR_TIMEOUT_MS=75000`) and no OpenAI calls. Run the API from the backend repository root. Docker installs Python and warms up the weights during build; Render uses that Docker image. PaddleOCR increases image size and memory usage; verify available memory on your host.

```sh
PYTHONDONTWRITEBYTECODE=1 .venv-ocr/bin/python test/paddleocr_test.py
# Real model regression against the supplied screenshot (requires warmup):
PADDLEOCR_INTEGRATION=1 PYTHONDONTWRITEBYTECODE=1 .venv-ocr/bin/python test/paddleocr_test.py
```

OCR process failures log `ocr_process_failure` with a safe reason (`timeout`, `spawn_failed`, `process_exit`, or `output_limit`), duration, exit code, and signal. Image data and raw Python stderr are not logged. The timeout includes Python startup and model loading for each upload. The frontend proxy has a 90-second timeout; keep the OCR budget below that when using the proxy. Increasing the budget does not resolve memory-related process kills.
