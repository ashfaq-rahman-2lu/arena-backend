# Tournament updates and knockout formats

Formats are LEAGUE, WORLD_CUP (Group + knockout), and KNOCKOUT (Only knockout). Existing format values and public URLs are unchanged. The owner is the tournament admin.

## Setup and participant rules

`knockoutLegs` and `knockoutFinalLegs` default to 1 and accept 1 or 2; final legs cannot exceed knockout legs. `legs` continues to configure league/group round robins. Knockout-only setup normalizes unused round-robin settings and has no groups. Starting it locks participants and makes all teams eligible for round one, without creating matches.

Owners can PATCH `/api/v1/tournaments/:id/name` with `name` and `expectedRevision` at any stage. POST `/api/v1/tournaments/:id/entrants` accepts `entrants: [{name, aliases, groupId?}]` and `expectedRevision`. Additions are atomic, capped at 256 total teams, and preserve existing records. Completed leagues reopen. Group additions stop when qualification is confirmed. Knockout-only rosters lock on start. Drafts continue using the setup API.

Owner-only GET `/api/v1/tournaments/:id/entrants?page=1&limit=100` returns lightweight paginated import candidates. Imports are independent copies in the frontend's unsaved creation form; importing creates no durable source relationship.

## Knockout rounds and scoring

The existing rounds endpoint accepts `method` (MANUAL by default, RANDOM, or FIXED). Manual/random may be selected each round. FIXED is available only before round one and locks subsequent ordering. Optional `slots: [{kind: 'PAIR' | 'BYE', index}]` orders the submitted pair/bye arrays. Fixed rounds advance automatically after all ties finish.

POST `/api/v1/tournaments/:id/rounds/draw-preview` accepts `byes` and `expectedRevision`. It returns pairs plus a revision-bound `drawToken`; submit the token and exact pairs/byes with method RANDOM to confirm. Bye recipients are always chosen by the admin. Only the opening round uses byes.

Responses include `knockoutTies`; matches reference `knockoutTieId`. Tie aggregates use stable team identities across reversed legs. A tied first leg is valid. No away-goals rule applies. For two-leg ties, use optional `knockoutDecision: {homeTiebreak?, awayTiebreak?, winnerId?}` on the second leg's result request. Decision home/away refers to the tie's canonical teams, not the reversed second-leg home/away. Decisions require both legs to finish with a tied aggregate. An unresolved aggregate can be saved but blocks progression. Existing single-match result fields remain compatible.

Corrections preview the change to the advancing team, require a revision-bound confirmation before removing later rounds/results, and retain tie outcomes in audit snapshots. Fixed opening order survives downstream resets; changed group qualification removes the old knockout bracket.

## Migration and rollout

Apply committed migrations, regenerate Prisma, deploy the backend, publish its generated OpenAPI schema, then deploy the frontend. The knockout migration expands the format constraint, adds independent knockout settings and ties, and backfills legacy knockout matches as one-leg ties without changing match IDs, scores, winners, or revisions. Existing tournaments retain manual pairing and single-match knockout behavior regardless of round-robin legs. Do not reset existing databases or run db push.

Verification uses isolated PostgreSQL databases ending in `_test`. The browser fixture uses exactly `arena_browser_test`. The feature was developed with failing/passing behavior tests for knockout-only start eligibility, appended fixtures, aggregates, imports, setup controls, name-save recovery, audit payloads, and draw conflict recovery. Run the full backend/frontend checks and browser suites before release.

## Verified implementation

On 2026-10-15: backend typecheck, lint, build, formatting, 67 unit tests, and 30 API/migration tests passed. Integration tests used a temporary PostgreSQL instance with dedicated `_test` databases. The API suite covers ownership, stale revisions, concurrent additions/qualification, fixed-bracket rebuilding, aggregates, and legacy migration backfills. Generated backend and frontend schema snapshots match.
