# API latency optimization

This change targets the six endpoints averaging more than two seconds in the November 7–9, 2026 Better Stack sample. It preserves their HTTP response schemas and freshness behavior. Production latency remains unverified until this revision is deployed and measured on comparable infrastructure.

## Behavior and implementation

- Request-correlated `operation_timing` events report session resolution, tournament reads, public/preview reads, lists, lock acquisition, transaction duration, and tournament response construction. Each event contains only a request ID, operation name, elapsed milliseconds, and completed/failed outcome. Spans overlap: do not add them together. The existing `http_request.durationMs` remains the server end-to-end measure.
- Prisma query events are emitted to in-process subscribers for isolated benchmark SQL counts/durations. SQL text and parameters are never forwarded to the application logger. Engine events are not assumed to preserve request AsyncLocalStorage context.
- Prisma 6 `relationJoins` is enabled. Aggregate, public, preview, session/user, followed-page, and owner-list projections explicitly use joined reads. Unrelated public-stat reads explicitly retain the query strategy. No SQL migration or index change is required. Generate Prisma Client before building/deploying.
- Public projection omits stored match stats before transport/mapping. Public responses retain null stats. A malformed private stats payload therefore no longer prevents public viewing; private/stats reads continue validating stored stats.
- Result saves use a narrow identity lookup, then ownership and revision checks under the tournament row lock. The ordinary path loads the aggregate twice; fixed advancement reloads once more only when it creates a round. Score and supplied/cleared stats share one update. Completion and revision are committed atomically with audit/write records. Mutation responses describe that mutation's committed revision, without a post-commit reread that could return a later writer's state.
- List page data uses a joined projection. A parameterized, validated conditional aggregate supplies filtered total and owner-wide counters. Completed-match counts are restricted to IDs on the current page. Pagination, sort order, filter semantics and counters are retained.
- The validated session is reused only on its Express request. Anonymous/null results are also reused. Every new request still checks expiry/revocation in the database; no shared session cache is introduced.

## Reproduction

Use Node 24 and a disposable PostgreSQL database whose name ends in `_test`. The integration suite migrates and clears this database; never use a development or production database. External email/OAuth/vision adapters are replaced by test fakes.

```sh
docker run -d --name arena-latency-postgres \
  -p 127.0.0.1:56474:5432 \
  -e POSTGRES_USER=arena -e POSTGRES_PASSWORD=arena \
  -e POSTGRES_DB=arena_latency_test postgres:16-alpine
npm run db:generate
TEST_DATABASE_URL=postgresql://arena:arena@127.0.0.1:56474/arena_latency_test \
  ARENA_BENCHMARK_STAGE=candidate ARENA_BENCHMARK_ENFORCE=1 \
  npm run benchmark:api
```

The benchmark covers league, World Cup and knockout tournaments with 16 and 64 entrants, plus a 256-entrant knockout stress case. Every endpoint/scenario uses 20 warm-up requests and 200 measured requests at concurrency 1 and 5. Worker tournaments are independent for writes; the normal e2e suite separately exercises competing writes against the same tournament. List requests exercise limits 20 and 100. An additional populated-page benchmark seeds 110 followed tournaments and verifies full 20/100-item pages.

Each `api_benchmark` event includes average, p50, p95, maximum, errors, client-side aborts, percentage over two seconds, and actual engine SQL counts/durations. SQL fields labeled `IncludingWarmup` include all 220 requests and occasional engine connection probes. Populated-page SQL fields exclude warm-up. Failed status/transport results are recorded and fail the benchmark. The optional enforcement flag fails a cell whose average reaches 2,000ms. Ordinary tests do not enforce wall-clock thresholds.

The main matrix uses the existing fixture's empty following list; populated following performance is measured separately. The original baseline does not include the supplemental populated-page benchmark. Do not present these as identical populated before/after workloads.

Candidate diagnostics compare the exact aggregate projection with both `query` and `join`, capture generated SELECT statements, and execute bound-parameter `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on the dedicated test database. Output contains only statement counts and planning/execution times, not SQL, bound values or raw plans. These diagnostic reads are outside endpoint measurements. Joined reads can use more database CPU despite fewer round trips.

Environment events include PostgreSQL version, database host and supplied deployment metadata. Set `ARENA_DEPLOYED_COMMIT`, `ARENA_API_REGION` and `ARENA_DATABASE_REGION` for a remote test fixture. Defaults explicitly identify a local run/unverified deployment. RSS and CPU measurements cover the combined in-process Supertest client/server, not separate production resource usage. The local container does not reproduce the approximately 176ms production health-probe baseline.

## Verification and rollout

The resource-budget regression was observed failing at five aggregate reads before optimization, then passed at two. A public-read regression failed HTTP 500 on malformed private stats before the projection change, then passed HTTP 200 with null public stats. Additional tests verify SQL read budgets, request-local session reuse/revocation, timing-result/error preservation, correlation isolation and diagnostic redaction.

Release instrumentation and benchmark tooling first, then joined reads/counters, then mutation restructuring as separate reviewable changes if desired. This checkout contains the combined implementation; no commits, pushes or deployments were performed by this task.

Before deployment, verify the live commit, API and database regions, pool/connection settings and resource limits. Do not expose credentials. Reproduce the workload on a dedicated production-equivalent test deployment and compare the same dataset, outcome groups and concurrency. Local threshold passes do not establish production success. Monitor each target endpoint's mean, p95, errors, aborts and slow fraction; require 100 successful observations per endpoint after release. Low-traffic endpoints remain pending. Keep health traffic in separate panels.

If the deployed average remains above two seconds, use measured query/lock/network/resource timings to choose the next change. This implementation does not change hosting capacity, relocate a database, add shared caching, or split endpoints. Revert application changes and regenerate the prior Prisma Client for rollback; there is no schema migration to reverse.

## Results from this implementation run

The original and candidate main matrices each completed 112 cells and 22,400 measured HTTP requests (plus 2,240 warm-ups), with zero HTTP errors and transport aborts. Every candidate cell averaged below two seconds. The worst candidate cell mean was **589.33ms**, worst p95 **967.52ms**, and maximum individual request **1,203.27ms**. The additional populated-page run completed eight cells and 1,600 measured requests without failures.

These are local container results, not production-equivalent evidence. Some verification commands ran while the benchmark was active, so wall-clock comparisons also include host load variation. The main following lists were empty in both before/after runs; the additional candidate-only benchmark verifies populated pages separately.

Worst scenario mean by endpoint (baseline → candidate; different scenarios may define each maximum):

- Result save: 342.23 → 589.33ms.
- Owner list, limit 20: 53.51 → 21.56ms.
- Owner detail: 90.86 → 364.27ms.
- Public detail: 100.92 → 315.68ms.
- Correction preview: 68.42 → 352.96ms.
- Following list, limit 20: 22.18 → 6.84ms.

**Joined reads are a local CPU regression for large league aggregates.** They are not a demonstrated universal speedup. The query-plan diagnostics confirm the joined strategy reduces the aggregate to one SQL statement but spends more time building JSON inside PostgreSQL. Keep the production-equivalent performance gate open; do not approve deployment solely because the local two-second threshold passes. The production round-trip baseline makes query reduction relevant, but the remote CPU/network balance must be measured.

Typical SQL statements per request, including transaction control statements:

- Ordinary result save: about 49 → 10; knockout saves about 55 → 11.
- Owner/public detail: 10–11 → 2, including session lookup.
- Correction preview: 11–12 → 2, including session lookup.
- Owner list: 13 → 6.
- Following list: 6 → 5.

Connection probes can add a few statements across a full 220-request cell; consult the raw counts rather than treating these rounded per-request figures as exact SQL budgets.

Full outputs, including per-scenario p50/p95/max, errors, aborts, slow percentages, SQL counts/durations, resource observations, and query-plan timing summaries:

- [Original baseline](api-performance-baseline.json)
- [Candidate and populated-page results](api-performance-candidate.json)

The original baseline was collected after adding query-event emission/tournament timing, before joined reads and save restructuring. The candidate uses the same main workload. Neither run verifies the current Render commit, live database location, live connection settings, production resource limits, or post-release observations. Render discovery found no selected workspace, so the live metadata read requires workspace confirmation before proceeding.

## Executed checks

- RED: `node --test --test-name-pattern='slow API work|public viewing does not' dist/test/api/api.test.js` against the disposable `_test` database: aggregate budget failed `5 !== 2`; public read failed expected HTTP 200 versus actual 500.
- GREEN: the same focused HTTP regressions passed after implementation; bounded SQL/session tests, concurrent writes and fixed-bracket tests also passed.
- Final `npm run typecheck`, `npm run build`, `npm run lint`, `npm run format:check`, `npm run openapi`, and `git diff --check` passed. Regenerated OpenAPI is byte-for-byte unchanged against Git.
- Final `npm test`: 117 passed, zero failed, one pre-existing opt-in local PaddleOCR process test skipped.
- Final `npm run test:e2e`: 52 passed, zero failed, two opt-in benchmark tests skipped in the normal suite. Those benchmarks were separately executed: the main candidate benchmark and populated pages both passed, and the forced rollback regression passed.
- Prisma Client regeneration succeeded. No database migration was added; the migration regression suite successfully exercised the existing committed migrations in disposable databases.
- The disposable PostgreSQL container/test databases and `/tmp/arena-*` diagnostic files listed in the inventory were removed after verification. JSON benchmark reports remain in `docs/`.
