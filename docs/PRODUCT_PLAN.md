> Historical accepted product brief. Paths and workspace commands in this document describe the earlier combined checkout.

# League and Tournament Web App

## Summary

Build an app where registered admins organize gaming competitions and anyone can view them using a public tournament ID or shared link. Only the tournament owner can edit its state. Players and spectators need no accounts.

Use independent applications in one repository:

- Frontend: React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS.
- Backend: NestJS, TypeScript, REST API under `/api/v1`.
- Database: PostgreSQL, Prisma migrations.
- AI: OpenAI Responses API behind a replaceable vision-provider interface.

Initial games are eFootball and CODM. A match involves two entrants and numeric scores. An entrant may represent a team or an individual gamer. Detailed statistics, battle royale scoring, multi-game series, cross-group wildcard ranking, and automatic knockout pairing are outside v1.

## Tournament behavior

### Identity and ownership

- Admin accounts support verified email/password and Google sign-in.
- Include password reset, secure sessions, and authenticated Google account linking.
- Each tournament has one owner and a random human-readable public ID.
- Allow unlimited tournaments per admin.
- Public pages show entrants, fixtures, results, standings, qualification, and knockout progress. They exclude account details and audit history.

### Setup and lifecycle

- Collect competition name, game, format, entrants, scoring rules, and group settings where applicable.
- Entrants have unique display names within the tournament and optional in-game aliases.
- Use DRAFT, ACTIVE, and COMPLETED statuses plus a separate current stage.
- Preview generated fixtures before starting, then persist them exactly once.
- Lock format, membership, groups, qualifier counts, legs, and points after starting. Names and aliases remain editable.
- Fixture rounds are informational; matches in the active stage can be played in any order.

### League

- Admin chooses one or two round robin legs.
- Generate n(n−1)/2 matches for a single leg and n(n−1) for two legs.
- Show played, wins, draws, losses, score for/against, difference, and points.
- Default win/draw/loss points are 3/1/0 and are configurable before starting.
- Rank by points, score difference, then score for. Admin orders any remaining tied entrants.
- Complete once every match is scored and ties affecting the champion are resolved.

### Groups and qualification

- Allow manual group assignments or balanced random distribution, editable before starting.
- Each entrant belongs to one group with at least two entrants.
- Use single or double round robin within each group.
- Each group has its own top-N qualifier count, between one and the group's size.
- No automatic comparison of third-place teams across groups.
- Finish every group fixture and resolve qualification-cutoff ties before confirming advancement.
- Require at least two total qualifiers and show a qualification preview.

### Knockout

- Single-match elimination with admin-chosen pairings in every round.
- For non-power-of-two fields, give enough first-round byes to reach the next power-of-two bracket size; the admin chooses recipients.
- Every eligible entrant appears exactly once as a matched team or bye recipient.
- Byes advance without a scored match.
- Finish each round before manually pairing its survivors in the next.
- Unequal scores determine the winner. Equal scores require an explicit winner or decisive optional tiebreak scores.
- Completing the final records the champion.

### Corrections

- Recompute standings from completed matches after every save, edit, or clear.
- Preserve revision history and invalidate affected tie decisions.
- If a group correction changes qualification or makes it incomplete/unresolved, preview and explicitly confirm a knockout reset.
- If a knockout winner changes, preview and confirm resetting subsequent rounds.
- Preserve valid downstream rounds when qualifiers/winners remain unchanged.
- Apply correction and reset atomically; archive removed progression in audit history.
- Reject stale result revisions and stale impact previews.

## Architecture and interfaces

- Keep authentication, competition persistence, fixtures/standings rules, qualification/knockout, and extraction separate.
- Backend owns all rules and authorization; frontend uses server-calculated state.
- Core records: User, AuthIdentity, Session, AuthToken, Tournament, Entrant, Group, Round, Match, Bye, QualificationDecision, TieResolution, ResultRevision.
- Enforce fixture uniqueness, tournament membership, valid scores, and distinct opponents with database constraints and service validation.
- Publish OpenAPI and generate the frontend's typed REST client.
- APIs cover auth, setup, public lookup, fixture preview/start, result updates/clears, correction preview/reset, tie ordering, qualification, rounds/byes, entrant identity, and owner-only history.
- Mutation requests carry revisions; reset confirmations carry a token bound to the preview's tournament revision and result.
- Use HTTP-only cookie sessions, CSRF protection, ownership checks, Argon2id hashes, request validation, and auth/extraction rate limits.

## Frontend

- Responsive tournament lookup, authentication, admin dashboard, setup, fixture preview, and management screens.
- Fixtures filter by team, stage, and completion status.
- Management includes editable scores, image review, tie decisions, qualifier confirmation, knockout pairing/byes, and correction-impact dialogs.
- Public pages have no editing controls and refresh every 15 seconds while visible.
- Refresh admin data after mutations.

## Image extraction

1. Admin selects a match and uploads JPEG, PNG, or WebP, at most 10 MB.
2. Backend verifies ownership and decodes the upload.
3. Send transient image input plus expected entrant names/aliases to a hosted vision model.
4. Default to configurable `gpt-4.1-mini` through OpenAI Responses with strict structured output.
5. Extract observed names, final scores, optional tiebreaks, and warnings. Unreadable fields stay null.
6. Map reversed names correctly; unresolved identities require explicit admin mapping.
7. Fill an editable draft without overwriting fields edited during the request. Only Save persists a result.

No tournament-writing tools are exposed to the model. Treat screenshot text as untrusted evidence. Keep credentials server-side, do not retain application image uploads, use a 30-second provider timeout, and retain manual entry/retry paths. Record latency, failure, and usage metrics.

## Delivery and validation

1. Scaffold applications, migrations, OpenAPI, and Docker Compose.
2. Implement authentication, ownership, setup, and public views.
3. Implement round robin, scores, standings, and audit revisions.
4. Add groups, top-N qualification, tie ordering, and knockout/byes.
5. Implement revision-bound correction previews and transactional resets.
6. Add extraction, responsive UI, and end-to-end tests.

Provide environment examples, startup/migration instructions, independent builds, and provider-neutral deployment packaging. Hosting purchases and publication are outside this request.

Acceptance coverage:

- Anonymous and non-owner mutations are forbidden; public responses omit private records.
- Email verification/reset, Google sign-in, and authenticated linking work.
- Four entrants produce six/twelve matches; odd-sized fields have no self-matches or duplicate opponents.
- Arbitrary match order and custom points produce correct standings; editing/clearing recomputes totals.
- Group qualifier counts differ; unresolved cutoff ties block qualification.
- Six qualifiers produce two byes plus two played matches and then four survivors.
- Invalid, duplicate, eliminated, or incomplete pairings are rejected.
- Tied knockout results require a winner; final completion identifies the champion.
- Correction previews preserve valid progression and reset invalid rounds only after confirmation.
- Concurrent saves/start actions and stale previews cannot overwrite or duplicate state.
- Extraction handles reverse ordering, aliases, ambiguity, unreadable fields, invalid images, and provider errors without auto-saving.
- Manual entry works without AI credentials.
- Complete league and cup flows work on mobile and desktop; public state refreshes on schedule.
