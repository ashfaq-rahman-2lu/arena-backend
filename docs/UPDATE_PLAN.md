> Historical update plan, completed before repository separation. Use the repository README and PILOT_DEPLOYMENT.md for current commands and hosting.

# Backend standards-compliance update

## Summary

Bring the existing backend into compliance with [the backend instructions](../AGENTS.md), the authoritative `.agents/rules/nestjs-*.mdc` files, and the [NestJS skill](../.agents/skills/nestjs-best-practices/SKILL.md).

The confirmed scope is **minimal compliance**, with coordinated frontend contract updates and **one API instance**. Preserve the agreed tournament workflows and cookie-session authentication.

Baseline checks passed during planning: backend type checking, build, and all 36 unit tests. Database API tests were not rerun during planning.

## Implementation changes

Implement in this order, with focused tests before behavior changes and regression coverage before structural moves.

1. **Types, tests, and enforcement**
   - Add `@nestjs/testing`, ESLint with TypeScript-aware rules, and Prettier; use versions compatible with the existing NestJS 11 stack.
   - Enforce explicit parameter and return annotations—including callbacks—artifact naming, unsafe-operation checks, and bans on `any`, non-null assertions, and double casts.
   - Apply enforcement across backend source, tests, seed code, and scripts. Prove the lint configuration rejects deliberately invalid fixtures before enabling its CI gate.
   - Retain `node:test`; expand discovery to include all new suites.

2. **Feature architecture and persistence**
   - Replace centralized controllers/modules with feature-owned auth, tournaments, matches, public-viewing, and extraction modules.
   - Separate account workflows, sessions, token delivery, and OAuth into cohesive services. Keep cookie/redirect handling at the HTTP boundary.
   - Introduce one injectable `DatabaseService` and feature repositories. Map Prisma records into named application/domain models; keep pure competition calculations independent of persistence and HTTP.
   - Keep tournament mutation coordination in the tournaments feature. Matches delegate through a narrow application interface, avoiding circular dependencies.
   - Preserve row locking, ownership verification, revision comparisons, result updates, and audit writes within one transaction. All participating repositories use its transaction client.
   - Replace sequential setup inserts with bulk writes using preassigned IDs.
   - Add a targeted migration enforcing match-to-knockout-round and bye-to-entrant tournament membership. Backfill bye tournament IDs from their rounds; reject inconsistent existing data without deleting it.

3. **Configuration, integrations, and errors**
   - Introduce typed, startup-validated `@nestjs/config` configuration for database, HTTP, cookies, rate limits, SMTP, Google, and vision. Validate through every application bootstrap path. [NestJS configuration guidance](https://docs.nestjs.com/techniques/configuration)
   - Represent disabled integrations explicitly; reject partial credentials. Tests receive explicit configuration, and OpenAPI generation works without live integrations.
   - Add typed email, OAuth, vision, and HTTP-transport ports. Inject production adapters and test fakes before application creation.
   - Validate OAuth state and provider JSON at runtime. Preserve Google's 15-second and vision's 30-second timeouts; add finite SMTP connection/socket timeouts.
   - Define typed application errors and one injected exception filter. Return `{statusCode, code, message}` with stable codes and safe messages; log redacted diagnostics with request IDs.
   - Preserve failed-email token cleanup and the explicit resend/retry workflow. Keep network calls outside transactions and close adapter resources during shutdown.
   - Retain the database-backed health endpoint and process-local limiter: auth defaults to 20 requests/minute/IP, extraction to 5/minute/admin. Validate limits and document trusted-proxy assumptions.

## Public interfaces and frontend updates

- Replace HTTP Zod schemas with request DTO classes and Swagger metadata. Enable global validation with `whitelist`, `forbidNonWhitelisted`, and `transform`; use explicit conversions. Unknown properties will now produce validation errors. [NestJS validation guidance](https://docs.nestjs.com/application/validation)
- Validate UUID parameters, public IDs, OAuth queries, CSRF headers, nested bodies, and multipart inputs. Preserve existing numeric/text limits and null-versus-zero score semantics; bound currently unbounded arrays.
- Declare response DTOs and explicit allow-list mappings, including audit payloads. Document actual status codes, cookie authentication, CSRF requirements, and error responses.
- Paginate tournament listing, history, and fixture preview using `page` and `limit`, defaulting to 1 and 20, with a maximum limit of 100. Return `{items, total, page, limit}`.
- Tournament listing accepts server-side name search and status filtering. Return summary cards rather than full aggregates, with entrant previews/counts and match completion counts. Include owner-wide dashboard totals independently of the selected filter.
- Use deterministic ordering: tournament/history timestamps plus IDs; fixtures by scope, round, leg, and pairing key.
- Update the dashboard, history, and fixture-preview callers with accessible pagination controls and complete loading/error states. Include owner identity and query parameters in private cache keys.
- Regenerate both API artifacts through `npm run api:generate`; remove handwritten contract patching. Keep `/api/v1` and existing action status codes.

## Test and acceptance plan

- Execute and record **red → green → refactor** for every behavior change. Structural moves begin with passing behavioral coverage.
- Replace global `fetch` mutation, live-provider method replacement, and shared test accounts with typed provider overrides and isolated fixtures. [NestJS testing guidance](https://docs.nestjs.com/fundamentals/testing)
- Cover invalid configuration, DTO bounds/unknown fields, pagination/filtering/totals, safe errors, private-field exclusion, authentication, ownership, CSRF, rate limits, expired/reused tokens, and integration timeouts/malformed responses.
- Preserve league/cup acceptance coverage: fixtures, ties, qualification, byes, concurrency, stale revisions, correction confirmations, atomic resets, rollback, and extraction without persistence.
- Apply migrations to a fresh dedicated `_test` database; exercise cross-tournament constraint rejection and migration backfill. Never run cleanup against development data.
- Add frontend behavior tests for pagination and updated error handling; configure `.test.tsx` discovery and inspect affected desktop/mobile and keyboard flows.
- Completion gates: backend lint/format, typecheck, build, unit and API tests; contract regeneration; frontend typecheck, tests, and build; generated-contract drift check in CI.

## Defaults and boundaries

- No new tournament features, authentication strategy change, framework upgrade, UI redesign, Redis, queues, or production deployment.
- Database changes are limited to the identified membership constraints; preserve existing records.
- Update documentation with intentional API/configuration changes, migration ordering, executed red/green evidence, and any unavailable verification.
- No further confirmation is needed for this plan.
