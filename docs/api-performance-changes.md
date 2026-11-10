# Complete change inventory

No pre-existing user changes were present in the backend checkout. No frontend files were changed. All paths below are absolute.

## Source, tests, configuration and reports

- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/package.json` — Added the opt-in benchmark:api command.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/prisma/schema.prisma` — Enabled the relationJoins preview feature; no SQL schema migration.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/common/operation-timing.service.ts` — Created typed, redacted request-correlated timing spans with success/failure outcomes.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/infrastructure.module.ts` — Registered and exported the timing provider.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/database/database.service.ts` — Enabled in-process Prisma query events for isolated SQL measurements.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/auth/access.guard.ts` — Attached the validated session result to the current request.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/auth/http-session.ts` — Declared the request-local resolved-session field.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/auth/auth.controller.ts` — Passed the guard-resolved session to the session response workflow.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/auth/sessions.service.ts` — Timed session resolution and reused request-local session results.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/auth/auth.repository.ts` — Joined session/user reads and selected only the account fields needed by the model.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/following/following.repository.ts` — Added list timing and joined followed-tournament projections.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/tournaments/tournament-read.models.ts` — Created explicit aggregate/public/preview persistence projections and validated list-counter models.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/tournaments/tournaments.repository.ts` — Added timed joined reads, omitted public match stats, consolidated list counters into parameterized SQL, preserved unrelated stat-read strategy, and timed transaction/lock work.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/src/tournaments/tournaments.service.ts` — Reduced save aggregate reloads, combined score/stat writes, advanced fixed brackets from the updated aggregate, and returned the committed mutation revision without rereading after commit.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/test/api/api.test.ts` — Added HTTP/read-budget/privacy/session/rollback regressions and opt-in latency, populated-page and EXPLAIN timing benchmarks.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/test/operation-timing.test.ts` — Created result/error preservation, request isolation and redaction coverage for timing events.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/test/request-logging.test.ts` — Kept severity assertions scoped to HTTP summaries while retaining checks over all logged diagnostics for secret leakage.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/test/stats-review.test.ts` — Registered the new timing dependency in the service test module.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/docs/api-performance.md` — Documented behavior changes, reproduction, local results, regressions, rollout gates and pending live verification.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/docs/api-performance-baseline.json` — Saved 112 original-workflow benchmark cells with complete latency and SQL metrics.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/docs/api-performance-candidate.json` — Saved 112 candidate cells, environment metadata, 28 relation-load diagnostics and eight populated-page cells.
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/docs/api-performance-changes.md` — Created this complete file-change and generated-output inventory.

## Regenerated or timestamp-touched outputs

These ignored outputs were produced by Prisma generation, TypeScript builds and OpenAPI generation. The OpenAPI content is unchanged. Prisma output changes are local generated artifacts, not new dependencies.

- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/prisma/seed.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/app.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/app.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/access.guard.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth-request.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth.controller.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth.repository.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/auth.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/crypto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/google-oauth.adapter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/http-session.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/oauth.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/rate.guard.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/sessions.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/smtp-email.adapter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/auth/tokens.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/api-error.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/api-exception.filter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/application-error.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/application-logger.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/fetch-http.adapter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/operation-timing.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/pagination.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/pagination.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/request-context.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/request-context.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/common/request-logging.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/config/configuration.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/config/configuration.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/database/database.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/database/database.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/domain/competition-fixtures.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/domain/competition-values.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/domain/engine.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/domain/knockout-rules.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/domain/required.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/extraction-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/extraction.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/extraction.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/extraction.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/ocr-worker.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/paddle-ocr-process.adapter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/extraction/paddle-ocr-vision.adapter.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following.controller.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following.repository.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/following/following.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/infrastructure.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/main.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/matches/match-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/matches/matches.controller.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/matches/matches.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/matches/matches.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/matches/result-request.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/openapi.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/public-viewing/health-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/public-viewing/public-viewing.controller.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/public-viewing/public-viewing.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/public-viewing/public-viewing.repository.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/public-viewing/public-viewing.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/stats/team-stats.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/stats/team-stats.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/swagger.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/result-audit.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournament-mutations.port.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournament-read.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournament-request.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournament-response.dto.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournament.models.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournaments.controller.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournaments.module.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournaments.repository.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/src/tournaments/tournaments.service.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/adapters.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/api/api.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/api/migration.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/audit.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/browser-account-fixture.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/browser-server.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/configuration.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/engine.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/errors.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/expansion.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/extraction.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/google-callback.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/knockout.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/logging.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/oauth-schema.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/ocr-process.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/operation-timing.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/password-validation.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/request-logging.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/response-fixture.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/stats-review.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/swagger.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/dist/test/team-stats.test.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/client.d.ts`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/client.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/default.d.ts`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/default.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/edge.d.ts`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/edge.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/index-browser.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/index.d.ts`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/index.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/package.json`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/query_engine_bg.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/query_engine_bg.wasm`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/schema.prisma`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/wasm-edge-light-loader.mjs`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/wasm-worker-loader.mjs`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/wasm.d.ts`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/node_modules/.prisma/client/wasm.js`
- `/Users/macbook/study_materials/pfffffs/projects/Tournament/backend/openapi.json`

## Temporary diagnostic files

The following temporary files were created/overwritten for this task; useful benchmark data was copied into the report JSON files. They are removed at cleanup:

- `/tmp/arena-rules-read.txt`
- `/tmp/arena-latency-baseline.log`
- `/tmp/arena-latency-candidate.log`
- `/tmp/arena-latency-populated.log`
- `/tmp/arena-latency-unit.log`
- `/tmp/arena-latency-e2e.log`
- `/tmp/arena-latency-lint.log`
- `/tmp/arena-latency-openapi.log`
- `/tmp/arena-latency-format.log`

## Non-file changes

- Created an isolated `arena-latency-postgres` PostgreSQL 16 container on loopback port 56474, with disposable `arena_latency_test` and `arena_regression_test` databases. Applied committed migrations and populated/cleared test fixtures. Migration tests created and removed their own temporary databases. The container and its test data are removed at cleanup.
- Regenerated the local Prisma Client. No package installation, dependency version changes, production writes, deployment, push, restart, infrastructure setting update or frontend contract update was performed.
- Queried Render workspace discovery read-only. No workspace was selected; service metadata and metrics were not accessed.
