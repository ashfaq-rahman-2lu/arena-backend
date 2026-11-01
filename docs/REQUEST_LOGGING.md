# API request logging

The backend records all requests reaching its HTTP application without sampling. Production writes one JSON object per line through the existing injected logger; Render forwards those lines to Better Stack. Development keeps readable output. Test output stays silent unless a test injects a capture logger.

## Event contract

One `message.event = "http_request"` summary is emitted when the response finishes or the connection closes early. Normal completion emits only one summary even though both lifecycle events can fire. Coverage includes controller responses, redirects, guards, validation, malformed/oversized JSON, unknown paths, health checks, Swagger/OpenAPI, and CORS preflights. This is application logging; traffic rejected by the host or HTTP parser before it reaches Express cannot produce an application summary.

Example production entry (illustrative values):

```json
{"level":"log","pid":123,"timestamp":1793491200125,"message":{"event":"http_request","timestamp":"2026-11-01T00:00:00.000Z","requestId":"example-request-123","method":"GET","route":"/api/v1/tournaments/:id","statusCode":200,"durationMs":125.4,"outcome":"completed","userId":"example-user-id","clientIp":"192.0.2.10","userAgent":"Example browser","errorCode":null,"errorType":null},"context":"Arena"}
```

- `message.timestamp` is the UTC request start time; the logger's outer timestamp is emission time. `durationMs` uses a monotonic clock and includes middleware, authentication, and response processing.
- `route` is Express's matched route template, never the raw URL or concrete path parameters. Requests with no matched template use `unmatched`, including early parser failures and preflights. Swagger/static middleware may also have no template.
- `outcome` is `completed` or `aborted`. `statusCode` is the response status when headers were sent, otherwise `null`; an aborted request is never assigned an invented success status. Completion means the response was handed to the operating system, not proof that the browser received it.
- `userId` is set only after server-side session verification or successful session creation for password/Google login. Anonymous and pre-authentication failures use `null`. A verified user remains attributed if a later CSRF or authorization check fails.
- `clientIp` uses Express's existing `TRUST_PROXY` configuration. It may be a frontend proxy/egress address rather than the browser's original address. Arbitrary forwarded headers are not independently trusted by logging.
- `userAgent` is limited to 512 characters and has control characters replaced with spaces. Missing metadata uses `null`.
- `errorCode` is the mapped application error code. `errorType` is a fixed safe category, not an arbitrary exception name. Both are `null` when no exception reaches the global filter.
- Severity is `log` below 400, `warn` for 4xx or an aborted response, and `error` for 5xx. The existing error-only `request_failed` event is replaced by the complete request summary.

The middleware accepts exactly one incoming `X-Request-ID` containing 1–100 ASCII letters, digits, underscores, or hyphens. Missing, malformed, oversized, or repeated headers cause generation of a UUID. The same ID appears in the response header and summary. CORS exposes this header to the configured frontend origin. A caller-supplied ID is a correlation hint, not an authenticated identity or uniqueness guarantee.

Structured application events inherit `requestId` and `userId` through `AsyncLocalStorage`. OCR jobs copy only those two fields when queued, then restore their own context when logging phases or queue timeouts. Shared worker readiness, crashes, and process lifecycle diagnostics have no request identity. Request summaries and extraction outcomes still identify each affected request.

## Privacy and intended behavior changes

The summary allowlist excludes request/response bodies, query strings, raw paths, arbitrary headers, cookies, authorization/CSRF values, email addresses, credentials, tokens, images, extracted results, SQL, stacks, and raw provider output. Logging does not serialize Express requests, responses, or error objects. User IDs, observed IP addresses, and user-agent metadata are retained in Better Stack; restrict source access appropriately.

Responses now consistently carry `X-Request-ID`, including success, redirects, early parser errors, and preflights. The global filter adds only a safe error category/code to the request context rather than emitting a second failure access event. Oversized JSON bodies now return HTTP 413 with code `VALIDATION_FAILED` and message `Request body too large`; previously this parser error was mapped to HTTP 500. OpenAPI documents the response correlation header and 413 response.

## Better Stack and 3-day retention

Use the existing **Arena backend** Render source and forwarding setup in the README. No application-side delivery SDK, database request-log table, additional environment variables, or new network client is required.

The agreed request-log retention is **3 days**. On 2026-11-01, read-only inspection confirmed existing Render startup and OCR logs in that source and **3-day log retention**, so the existing provider setting meets the target. Metrics retention is separately 30 days. No billing, retention, transformation, or forwarding settings were changed during implementation.

Keep **Sources → Arena backend → Ingest → Data retention → Logs** at **3 days**. No paid upgrade or dashboard changes are required for the agreed policy. Verify logs retention separately from metrics retention; forwarding does not recover logs that already expired.

The pipeline provides operational logs, not durable audit delivery. Crashes can prevent a final summary; Render drops application log lines above 6,000 per minute per instance, including from forwarded streams. Application logging does not wait for Better Stack acknowledgment. Monitor ingestion volume and revisit the transport before traffic approaches the host limit.

References: [Render log streaming](https://render.com/docs/log-streams#better-stack), [Render log limits](https://render.com/docs/logging#rate-limit), [Better Stack source retention fields](https://betterstack.com/docs/logs/api/get-a-single-source/).

## Search and deployment verification

Start with **Live tail → Arena backend** and plain text search for `http_request`, a returned request ID, or `ocr_phases`. Text search works even when the Render syslog transformation keeps the application JSON in a string. Expand a newly ingested row to find the JSON envelope; do not assume Better Stack's syslog fields are the application's fields.

Where the application JSON is parsed into structured properties, use the paths under its `message` object:

- All requests: `message.event = http_request`.
- One request and related extraction events: `message.requestId = <returned X-Request-ID>`.
- Server failures: `message.event = http_request` and `message.statusCode >= 500`.
- Slow requests: `message.event = http_request` and `message.durationMs >= 1000`.
- A user or endpoint: filter `message.userId` or `message.route`.

These are field/filter definitions, not a promise of a particular Better Stack query language. If the JSON remains a string, configure and validate JSON parsing on the source before relying on numeric filters; text-searching a request ID remains available. Keep existing syslog/service metadata and non-JSON hosting messages when configuring parsing.

After deploying the backend revision:

1. Request `/api/v1/auth/session`, `/api/v1/health`, and an unknown path. Capture the returned `X-Request-ID` for each. Verify one corresponding `http_request` event with the actual status and numeric duration.
2. Submit a rejected mutation and an invalid JSON body. Verify a warning summary with the same response ID and safe error metadata, with no submitted payload in logs.
3. Sign in, make an authenticated request, and run a score extraction using an approved test account/tournament. Verify the user ID and link the summary, `extraction`, and `ocr_phases` through their request ID; do not change saved match results for this check.
4. Expand a row to confirm the field paths and numeric types. Verify ingestion and the existing 3-day logs retention setting; no retention change is needed.

The new request-event production checks require this revision to be deployed. Existing production forwarding was verified; this local implementation does not claim that the new code is deployed or that its production smoke tests have run. The existing backend CI publishes regenerated `openapi.json` as the `arena-openapi` artifact for the independent frontend repository.
