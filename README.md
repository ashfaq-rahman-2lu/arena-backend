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

### Persistent OCR worker and timings

The backend automatically chooses extraction scope from the tournament's `statsEnabled` setting after checking ownership and game type. When stat recording is disabled, OCR receives only the two score cells and returns `stats: []`. When enabled, it receives all 28 score/stat cells and returns the thirteen stat rows. No extra choice is presented to the owner, and extraction never saves a result automatically or clears existing drafts/results.

The authenticated multipart endpoint `POST /api/v1/matches/:matchId/extract-score` continues to accept only `image`. Clients cannot override the extraction mode with a multipart field. Existing clients need no upload changes. Internal providers and workers retain full extraction as their default for callers outside the match workflow; each queued request carries its own mode. The high bit of the four-byte binary frame header selects score-only extraction, while the remaining 31 bits encode the bounded image size.

Score tiles are located dynamically by yellow color, rectangular shape, matching dimensions, alignment, and a navy gap with yellow emblem content. Detection searches the central scoreboard area (30–70% of image width, 5–28% of image height) at a maximum width of 1024 pixels, then maps the boxes to the original image. It requires exactly one plausible pair and never guesses from the old score coordinates. Missing, misaligned, or ambiguous boxes return the existing manual-entry warning. This uses NumPy/Pillow preprocessing and adds no model or OCR inference call.

Preprocessing removes nearly full-height/width separator lines at the outer edges of each detected score tile. Interior digit pixels, strict numeric parsing, and the 0.85 confidence threshold are preserved. The thirteen statistic rows retain their existing normalized coordinates, and the supported full-image dimensions/aspect ratio are unchanged; moving or adding margins around the entire screenshot is not supported by this score-only change. Regressions cover both supplied scorecards, scaled images, shifted/resized score tiles, unchanged stat crops, unrelated yellow regions, and ambiguous layouts. An unsupported layout still requires manual entry.

The API starts one Python worker in the background at application bootstrap and loads the recognition model once. API health and manual score entry remain available while OCR warms up. Tests and offline OpenAPI generation do not start the real worker. The Docker build's `--warmup` downloads weights; the running worker initializes the in-memory model.

Uploads use a bounded binary protocol over the worker's stdin. One image is processed at a time, with at most two additional requests waiting. The `PADDLEOCR_TIMEOUT_MS` budget includes waiting, startup (if still warming), and inference. Excess work fails safely rather than spawning more model copies. A timeout, crash, or invalid worker response rejects affected requests and terminates that worker; the next request can start a replacement after it closes. Failed images are never automatically retried. Application shutdown terminates the worker and settles pending requests.

Structured logs contain only timing and process metadata:

- `ocr_worker_ready`: `startupMs` (Python launch plus initialization), `modelLoadMs` (PaddleOCR import and model creation).
- `ocr_phases`: `mode` (`scores` or `full`), `cells` (2 or 28), `queueMs`, `prepareMs` (image decoding and crops), `inferenceMs`, and `totalMs` (request time including waiting).
- `ocr_process_failure`: safe reason, duration, exit code, and signal. Images, results, raw Python stderr, and executable paths are not logged.

`queueMs` includes any remaining startup wait; do not add `startupMs` to it when calculating request totals. The first inference after a restart can still have initialization overhead. The frontend proxy has a 90-second timeout; keep the OCR request budget below that when using the proxy. Model reuse reduces repeated startup work, but does not increase available CPU or memory. The one-shot CLI and build-time `--warmup` remain supported.

### Better Stack log collection through Render

With `NODE_ENV=production`, the injected application logger and Nest startup logs emit one JSON object per line to stdout/stderr. Development retains readable console output; test logging is disabled. OCR events pass objects to the logger so durations remain numeric, searchable properties instead of JSON strings inside the message. No logging SDK, database, application-side network delivery, or Better Stack environment variables are required.

Example production entry (illustrative values):

```json
{"level":"log","pid":123,"timestamp":1792759200000,"message":{"event":"ocr_phases","queueMs":0,"totalMs":3260,"prepareMs":40,"inferenceMs":3200},"context":"Arena"}
```

Configure forwarding once in the hosting dashboards:

1. In Better Stack, open **Telemetry → Sources → Connect source**. Name it **Arena backend** and select **Logs & Metrics → Render**.
2. Copy the source's **Ingesting host** and **Source token**. Keep the token private and outside source control.
3. In the Render workspace, open **Integrations → Observability → Log Streams → Set default**.
4. Set **Log Endpoint** to the ingesting hostname followed by `:6514` (without an `https://` prefix), and set **Token** to the source token. Save. This workspace default forwards supported services; review the workspace scope before enabling it.
5. Deploy the backend, then run one scorecard extraction. In Better Stack, open **Live tail**, select **Arena backend**, and search for `ocr_phases`, `ocr_worker_ready`, or `ocr_process_failure`.
6. Expand an entry to inspect `message.event`, `message.inferenceMs`, `message.queueMs`, and the other timing fields. Field paths may appear under the parsed log payload depending on Better Stack's Render transformation. Start with text search to confirm delivery.

Forwarding collects new logs; it does not backfill previous logs. Retention and ingestion limits belong to the selected provider plan. These code changes do not create an account, configure a Render log stream, add alerts, or enable request tracing. Existing safe diagnostics remain in effect: uploaded images, extracted scores/statistics, credentials, and raw OCR stderr are not added to logs.

Setup reference: [Render log streams and Better Stack](https://render.com/docs/log-streams#better-stack).
