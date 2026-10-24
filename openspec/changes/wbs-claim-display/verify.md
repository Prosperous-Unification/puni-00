## Verification record

Drafted 2026-10-23 as an OpenSpec proposal; nothing is built. C1 to C19 are assumed until
Dany reads them. Sources read on 2026-10-23 on `main` at `e70166d28` and on
`plan/wbs-claim-leases` at `485972419`: `wbs-team-claims` (tasks 1.7, D1 to D8, spec
`startable-work`), `wbs-claim-leases` (L1 to L16, tasks 2.1), `startable-shapes.ts`,
`person-work-shapes.ts`, `history-shapes.ts`, `work-item-shapes.ts` (`getWorkItems`),
`work-item.resource.ts` (`claim`, `release`, `releaseExpiredLeases`, `announceTree`),
`project-event.ts`, `announcement-collector.ts`, fe-01 `plan-refresh.ts`, `use-plan-read.ts`,
`plan-columns/estimates.tsx`, `estimate-presentation.tsx` (`ASSIGNEE_SLOT_PX`),
`folded-step-card.tsx`, `wbs-table.tsx` (`usePlanAssignments`), and the `plan-refresh` spec.

Facts the decisions rest on, read not run:

- fe-01 calls neither the startable, person-work nor history read (grep of
  `apps/wbs/fe-01/src`, 2026-10-23).
- `POST /api/claims/renew` publishes no event; claim, release and the sweep call
  `announceTree` (plan branch, `work-item.resource.ts`).
- The tree read has no ETag or conditional GET; fe-01 refetches it on every `tree_replaced`
  (`plan-refresh.ts` `resourcesFor`).
- `getApiProjectsByIdHistory` has no limit and types `before` and `after` as `unknown`.

Term collisions checked in `CONTEXT.md`: **Plan history** avoids "activity feed", so the new
projection is **Claim history**, not claim activity; **Membership chip** is the precedent for
**Claim chip**; **Releasing claim** is distinct from a **release**.

## Commands and results

`bunx openspec validate wbs-claim-display` and `bunx openspec validate --all --json`: recorded
in the PR description for the proposal commit.

## Per-slice proofs

### Slice 1: complete claims read (be-01), 2026-10-23

Branch `feat/wbs-claim-display-read`, on `plan/wbs-claim-display` with `origin/main` (1de277850,
claim leases slice 1) merged in, not rebased (task 0.2), and later `plan/wbs-claim-display`
(b6fae8a20) merged in too. Commands ran with
`env -u CLAUDECODE` from the worktree.

**1.1** `StampedClaim.leaseRevokedAt`; conformance case `claims.lease:revoked-instant-read`
with a new `lease-revocation` scenario: SQLite runs `endLeasesOfUncredentialed` under
`writeImmediately`, the memory twin a new `endMemoryLeases` seam. Red: the SQLite certification
failed the case with `leaseRevokedAt` absent from the read (73 pass, 2 fail; the second failure
was the Task 6.3 capture test's 5 s timeout, which passed on every later run). The memory twin
also gained what SQLite already did: renewal skips a revoked lease, and expiry reads
`credential_revoked`.

| R5 fault (watched)                                         | Observed                                   |
| ---------------------------------------------------------- | ------------------------------------------ |
| SQLite read selects a constant null for `lease_revoked_at` | SQLite certification fails the case (74/1) |
| memory read answers `leaseRevokedAt: null`                 | memory certification fails the case (74/1) |
| memory renewal ignores the revocation                      | case fails: a revoked lease renewed (74/1) |
| memory expiry answers `lease_expired` for every claim      | case fails on the reason (74/1)            |

**1.2** `project-claims.ts` (`findProjectClaims`) and `WorkItemService.claimsWithin`; five cases
in `project-claims.test.ts` on the memory source with a stopped clock.

| R5 fault (watched)                                                       | Observed                    |
| ------------------------------------------------------------------------ | --------------------------- |
| claims filtered to leaves not blocked, on hold, blocked by proxy or done | order case reads none (4/1) |
| sorted by claim id                                                       | 2 pass, 3 fail              |
| absent-holder check never true                                           | throw case answers (4/1)    |

Deviation: the task's fault "filter through the startable fold" does not redden. The
unfiltered startable read already lists every step claim of every leaf whatever its status
(only a team filter drops one), so the injected fault filters by leaf status instead. The
`claim-reads` scenario's THEN clause ("although the startable read lists it nowhere") said the
same wrong thing and now reads "with no team filter to pass".

**1.3** `readProjectClaims` (`GET /api/projects/:id/claims`, `getApiProjectsByIdClaims`), route,
inventory entries; `project-claims-organization.controller.db.test.ts` (4 cases: member and
viewer alike in tree and step order with a revoked lease, an unclaimed project, stranger /
foreign / absent / unbound refused as the tree read, and the read answering while the tree read
is `409 engine_unavailable`). The MCP README count moved 86 to 87: `counts them the same way the
document does` failed until it did.

| R5 fault (watched)                                    | Observed                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `organization-resource` policy dropped from the shape | `covers every mounted organization mutation` fails; stranger case still passes (the admission refuses) |
| `claimsWithin` admission removed                      | stranger case fails (3/1)                                                                              |
| route reads with legacy access, no `resolve`          | listing and stranger cases fail (2/2)                                                                  |

Deviation: the task named the stranger's read as the policy's negative; the policy only drives
the expected-organization header and the inventory check, so its watched negative is the
inventory test. The admission's negative is the stranger case.

**Review round (Fable, PR #691, no S1 or S2).**

- S3-1: `claimsWithin` read rows, steps, claims and names as four awaited reads, so a batch
  landing between them could make a claim name a row the read did not hold, a 500. They are now
  one `ClaimStore.observeProject` observation. On SQLite every read is synchronous on the
  process connection with no await between them, inside a savepoint (a savepoint nests inside a
  batch's open transaction where `BEGIN` would fail, and holds one snapshot against the other
  colour's commits). The memory twin reads its tables synchronously. A new conformance case,
  `claims.observeProject:legacy-observation`, runs on both stores, and
  `claim-observation.db.test.ts` sweeps a racing insert-and-claim over 40 interleavings.
- S3-4: under scoped access the observation rechecks activation, membership and the project's
  organization, as the tree read's snapshot does, and the route maps a refusal to the same 403.
  Under legacy access it rechecks that the deployment is not activated. The memory twin refuses
  a scoped observation as misuse, as the memory project store refuses organization edits.
- S3-2: the core and controller tests use step ids whose lexical order is the reverse of project
  step order. The core swarm adds a step claim on the item that holds the subtree claim. No
  command writes one (a step belongs to a leaf), but nothing in the store refuses one.
- S3-3: the proposal and design no longer claim that the startable read lists only startable
  leaves.
- S4-1: the SQLite constant-null fault reran clean at 74 pass, 1 fail.
- S4-2: added a route case: a removed member is refused `not_a_member` exactly as the tree read
  refuses them.

| R5 fault (watched)                                                       | Observed                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `claimsWithin` back to four awaited reads                                | race sweep throws `claim claim-w-8 is on no row` (2/1)         |
| SQLite scoped membership recheck skipped                                 | removed-between-admission case answers 200 with the claims     |
| SQLite legacy activation recheck skipped                                 | `refuses legacy access once the deployment is activated` (2/1) |
| SQLite observation rows unfiltered by project                            | SQLite certification fails `legacy-observation` (74/1)         |
| memory observation keeps every claim                                     | memory certification fails `legacy-observation` (74/1)         |
| steps compared by id (deterministic ids)                                 | project-claims 3 pass, 2 fail                                  |
| subtree claim placed after its item's step claims                        | project-claims 3 pass, 2 fail                                  |
| sorted by claim id / status filter / holder check never true (rewatched) | 2/3, 2/3, 4/1                                                  |

A store-level fault that only split the claims read after two awaits did not hit the sweep's
window; the service-level fault above (the code as it shipped) does, deterministically at delay 8.

**Second review round (Fable, ed3d289d6, no S1 or S2).**

- S3-A: the observation on the process connection saw an open batch's uncommitted claim, so a
  batch that rolled back left a phantom claim. The public catalogs (`openSqliteSource`'s
  `stores` and `bindLivePlans`' public stores) now pass the claims repository a read-only
  connection, and `observeProject` runs through `observeCommitted`. `observeCommitted` is the
  owned-connection read transaction, lifted out of `createLivePlanStore` into `db.ts` with its
  proofs, and the live plan store now uses it. A batch's own catalog keeps the savepoint path
  on the process connection, so it still sees its own writes; JSDoc on the port and the
  repository says which catalog does which. be-01's organization harness binds the same
  connection.
- S3-B: a two-connection test commits a row and its claim from a second connection between the
  observation's step read and its claims read; the claims read stays at the snapshot. New
  controller cases cover an activation marker reset and a project moved out of the organization
  after admission. Both changes are refused by triggers, so the fault drops the trigger, as the
  tree read's reset-marker case does.
- S4-A: a savepoint rollback that fails throws `AggregateError([cause, rollbackCause])`.
- S4-B: ownership uses the tree read's predicate (`findInOrganization`): the project row
  joined to its `project_organization` row.

| R5 fault (watched)                                          | Observed                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| observation reads the process connection, not the owned one | open-batch case sees `claim-staged` (3 pass, 2 fail)        |
| owned connection read with no read transaction              | snapshot case throws `claim claim-other is on no row` (4/1) |
| scoped activation recheck skipped                           | marker-reset case answers 200 (7/1)                         |
| ownership recheck skipped                                   | moved-project case answers 200 (7/1)                        |
| membership recheck skipped (rewatched on the owned path)    | removed-between-admission case answers 200 (7/1)            |
| `claimsWithin` back to four awaited reads (rewatched)       | race sweep throws `claim claim-w-8 is on no row` (3/2)      |

Results after the second round (fresh, 2026-10-23): store-sqlite `chain-snapshot`, all claim DB
tests, `claim-observation`, person-work-scope, startable-scope and conformance 166 pass;
store-memory 193; core `module/work-item` and `module/plan-commands` 381; be-01
`project-claims-organization` (8), `schedule-organization`, `person-load`, `app.routes`,
`organization-context`, `person-work-organization`, `claim-lease`, `startable-organization`,
`claim-identity`, `services` 278 pass; `tool-devsync:test` 921 pass.

**Round-2 check (Fable, 89eee7d69).** No test proved that `openSqliteSource` passes the
observation connection: dropping it left every test green. Two new cases run over
`openSqliteSource` and over `.bindLivePlans`: `does not see an open batch's claim (plain
source)` and `(bound source)`. Inside a `uow.run` that is still open and has written a row and
a claim, the batch's own catalog sees the claim and the public catalog does not.
`throws both failures when the savepoint does not roll back` gives the `AggregateError` a
negative: a proxied connection whose reads fail and whose `ROLLBACK TO` fails too. The
organization harness's own copy of the binding has no negative, because no harness test opens a
batch beside a read; its comment says so.

| R5 fault (watched)                                           | Observed                               |
| ------------------------------------------------------------ | -------------------------------------- |
| observation dropped from the plain catalog (`source.ts`)     | plain-source case sees the claim (6/1) |
| observation dropped from the bound public catalog            | bound-source case sees the claim (6/1) |
| savepoint rollback failure rethrown alone, not the aggregate | `throws both failures …` fails (7/1)   |

Results after the review round (fresh, 2026-10-23): store-sqlite conformance, claim, claim-race,
claim-occupancy-race, claim-lease, claim-lease-race, claim-observation, person-work-scope and
startable-scope DB tests 119 pass; store-memory 193 pass; conformance 35 pass; core
`module/work-item` and `module/plan-commands` 381 pass; be-01 `project-claims-organization` (6),
`app.routes`, `organization-context`, `person-work-organization`, `claim-lease`,
`startable-organization`, `claim-identity` 42 pass; mcp-01 516 pass; typecheck wbs-contracts,
wbs-core (+module), wbs-conformance, wbs-store-memory, wbs-store-sqlite, wbs-be-01 (+module),
wbs-mcp-01 and wbs-fe-01 `typecheck:module` pass; lint wbs-core, wbs-conformance,
wbs-store-memory, wbs-store-sqlite, wbs-be-01 pass (contracts and mcp-01 unchanged since the
first round's lint); Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all
--json` 275 of 275; `tool-devsync:test` 921 tests pass. Not run locally: the full be-01 and
fe-01 suites (CI carries them).

### Slice 2: claims as a plan-refresh resource (fe-01), 2026-10-23

Branch `feat/wbs-claim-display-refresh` on `plan/wbs-claim-display` at `dfacc4af0`. Commands ran
with `env -u CLAUDECODE` and `TZ=UTC` from `apps/wbs/fe-01`.

**2.1** `RefreshResource` gains `claims`; `ALL_RESOURCES` lists five. `resourcesFor`:
`claims_changed` is `['claims']`, `tree_replaced` is `['tree', 'claims']`, `plan_unavailable`
stays `['tree']`, unknown events answer all five. `ProjectApi.readClaims` reads
`getApiProjectsByIdClaims` through `readProjectClaims`; `PlanReadRoutes` adds it. Red: three of
the four new `plan-refresh.test.ts` cases failed before the green (`plan_unavailable` already
answered `['tree']`).

| R5 fault (watched)                            | Observed                                                         |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `claims_changed` line removed (falls through) | `refreshes claims alone for a heartbeat` receives all five, 19/1 |

**2.2** Claims are their own `resourceRead` with their own generations, failure and stale
state; the installed value is `InstalledClaims` (`readAt` plus `installedAt` from the owner's
injected `monotonicNow`, production `performance.now()`). The baseline does not wait for claims:
`establish` starts the claims read beside steps, directory and markers without awaiting it, and
an anchor failure marks claims stale with the others. Four cases in `claims as a refresh
resource`: a heartbeat reads claims alone and installs `readAt` beside the monotonic instant; a
held claims read for `tree_replaced` does not hold the tree install; a failed claims read keeps
the last claims and their stale state across a later tree success, until a claims read
succeeds; the baseline anchors while the claims read is refused.

| R5 fault (watched)                                         | Observed                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `claims: tree` in the resources record (shared generation) | all four claims cases and the `plan_unavailable` case fail, 19/5   |
| claims awaited with the baseline's anchored reads          | `anchors the baseline without claims …` initializes `failed`, 23/1 |

**2.3** `plan-read-and-write.test.tsx` `draws the plan with the stale notice when an older be-01
answers 404 for claims`: the table, under `AppFaultBoundary`, with a fake whose `readClaims`
rejects a `not_found` refusal, draws row `010`, raises the stale notice, raises no toast and no
`[data-app-fault]`. (The review round below replaced the plan stale notice with the claims notice.)

| R5 fault (watched)                                | Observed                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| claims awaited with the baseline's anchored reads | no rows drawn: `expected [] to deeply equal [ '010' ]` (1 failed, 90 skipped) |

Deviations:

- 2.1's green carried the whole fifth resource (it cannot type without a snapshot entry and a
  read), so 2.2's and 2.3's cases passed on their first run. Their weight rests on the
  watched faults above, not on a red before the green.
- `WbsProblem`'s failure arm is one member instead of one per operation: with the 26th shape
  (`readProjectClaims`) TypeScript no longer related `throwReply`'s failure object to the
  per-operation union (its 25-member discriminant expansion limit). Only a refusal body depends
  on the operation, so nothing narrowed on the failure arm's operation.
- `plan-refusal.ts` gains `claimsReadCode` (the exhaustive refusal switch requires it).
- Known consequence, by design of the existing acknowledgment rule: while claims reads fail (an
  older be-01 mid-swap), a `tree_replaced` event's claims obligation is uncovered, so the
  acknowledged sequence holds there, as it already does for a failed marker read; a reconnect
  then resumes from the held sequence.

Hard-coded counts moved: `READS_THE_FULL_SCOPE_MAKES` (optimization-integration) and
`FULL_SCOPE_PUTS_ON_THE_WIRE` (wbs-api) gain the claims read (nine to ten); the replacement-reader
case in `plan-read-and-write.test.tsx` records `readClaims` and expects ten;
`keeps the narrow scopes …` expects `tree_replaced` to be `['tree', 'claims']`; the plan-feed
reading case expects `['tree', 'claims']` for `tree_replaced`. Doubles that state every read
(`gantt-panel`, `plan-dependencies`, `project-page`), the `refusing-api` shape boundary and
`fakeProjectApi` answer `readClaims`; the stream test's fetch stub models `/claims`. No e2e spec
counts plan reads (the specs that route `**/api/**` do not open a plan), and no pixels baseline
change is expected: pixels run against this branch's be-01, which serves the route.

Results (fresh, 2026-10-23): `nx run wbs-fe-01:typecheck` (with `typecheck:module`) pass;
eslint on the 17 touched files exit 0; vitest over `src/lib`, `src/modules`, `src/runtime`,
`src/testing`, `app-router`, `delivery-boundaries` and the plan component suites that build API
doubles (67 files) first run 1385 pass, 8 fail (the counts and doubles above); after the fixes
the 12 files holding those failures 421 pass, and `plan-read-and-write` with `wbs-api` 156 pass.
Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all --json` 275 of 275. Not run locally: the full fe-01 suite, the Auckland zoned run, e2e and pixels (CI carries
them; laptop RAM shared with another heavy agent).

**Review round (Fable, PR #694 at `bd4e55cfe`, one S2).**

- S2-1: a failed claims read made the whole plan stale. That raised the red "This plan may be
  out of date" alert, nulled the optimization cue's comparisons, and its Retry could not clear a
  claims failure that would not go away. Now `treeMayBeStale` counts the plan's resources only
  (`use-plan-read.ts`), and claims have their own quiet status line, "Claims could not be
  read.", with a `Retry claims` button that rereads `['claims']` alone (`wbs-table.tsx`,
  `[data-stale-claims]`). C12 and the `claim-display` delta now name that notice and add two
  scenarios.
- S3-1, decision C20 (proposal, design, `plan-refresh` delta): claims obligations are not
  recorded against an event's sequence, so a failing claims read never holds the stream
  acknowledgment.
- S3-2: the anchor-failure path that marks claims stale now has a negative.
- S4-1: `plan-refresh-stream.test.ts` gives the real `httpProjectApi` an older be-01's router
  miss for `/claims`: Elysia's bare `404` with body `NOT_FOUND` and no content type. That body
  was measured with `new Elysia()` (`^1.4.30`) on an unmounted path. The plan anchors, only
  claims are stale, and the cause is a `WbsRequestError`.
- S4-2: in the 2.3 test, the `[data-app-fault]` assertion is not an R5 proof. Nothing can throw
  into the Error Boundary yet; the assertion guards the chips of later slices. The test's own
  comment says so.
- S4-3: the `project-stream.ts` JSDoc now says ten requests. S4-4: the `tree_replaced` line now
  has a `Proof:` comment.

| R5 fault (watched)                                                  | Observed                                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `treeMayBeStale` back to `staleResources.length > 0`                | `keeps the plan current and the optimizer's suggestion when only claims fail`: `expected undefined to be '· Pri 3 days earlier'` |
| claims notice suppressed                                            | same case: `[data-stale-claims]` absent                                                                                          |
| `Retry claims` wired to `refreshOrMarkStale()` (every resource)     | 404 table case: the tree read twice, expected once                                                                               |
| claims obligations recorded against the event sequence (C20 undone) | `resumes past tree events while claims fail …`: acknowledged 0, expected 2 (31/1)                                                |
| `claims` dropped from the anchor-failure list                       | `ends a claims invalidation made during an initialize whose anchor fails`: `expected 'pending' to be 'failed'` (24/1)            |
| `tree_replaced` answering `['tree']`                                | 5 cases across `plan-refresh`, `plan-feed.resource`, `optimization-integration`                                                  |

The 2.3 table case now asserts the claims notice and no plan alert. Its Retry clears the notice
by succeeding, with one more claims read and no tree read.

By eye (2026-10-23): be-01, gw-01 and fe-01 ran from this branch (`bun run dev:setup`, local auth
`local-dev`). fe-01's Vite proxy pointed at a small Bun proxy (port 3150) that answered
`GET /api/projects/:id/claims` with `404 NOT_FOUND` and forwarded everything else to be-01. A
headless Chromium (Playwright) loaded the plan page.

- Desktop 1440×900: the plan drew its rows with no red alert. One muted line, "Claims could not
  be read.", sat between the toolbar and the table, with a small ghost `Retry claims`. Once the
  proxy served claims, `Retry claims` cleared the line.
- Phone 390×844: the same line appeared under the Plan/Board/Plan actions row, above the first
  card, with no alert.

Results after the round (fresh, 2026-10-23):

- `nx run wbs-fe-01:typecheck` succeeded.
- eslint on the 19 changed TypeScript files: exit 0.
- vitest over `src/lib`, `src/modules`, `src/runtime`, `src/testing`, `src/components/board`,
  `app-router`, `delivery-boundaries` and the plan component suites with API doubles,
  `optimization-cue` included: 70 files, 1456 pass.

Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all --json` 275 of 275.
Not run locally: the full fe-01 suite, the Auckland zoned run, e2e and pixels.

**Transient claims announcements (C21, coordinator, 2026-10-23).** be-01 will push
`claims_changed` as a live announcement. It is not written to the durable log, a resume does not
replay it, and it may carry no sequence. Slice 3 records C21 in the proposal and design; this
branch adds the `plan-refresh` delta requirement "Claims announcements are transient" with four
scenarios.

- `project-stream.ts` forwards `claims_changed` as `onChange('claims_changed')` with no
  sequence, whether the frame carries one or not. Any other change enters the bookkeeping only
  with a whole sequence (`Number.isSafeInteger`). JSON's `1e400` parses to Infinity, and that or
  `1.5` would otherwise poison `Math.max` in `received`. Such a change is dropped, just as an
  unsequenced one already was.
- `plan-feed.resource.ts` rereads `['claims']` every time the stream reports it is synchronised
  (`onConnectionChange(true)`). That covers an accepted resume and a refused one alike (the
  refusal's full resync reads claims too), and the first synchronisation after the baseline.
- With no sequence, `invalidate` neither records an obligation nor checks for a gap (C20 already
  keeps claims out of obligations). `plan-refresh.test.ts` pins this: an unsequenced
  announcement reads claims alone, leaves the acknowledgment where it was, and the next durable
  event acknowledges normally without a resync.

| R5 fault (watched)                                     | Observed                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| claims branch removed from `project-stream.ts`         | `forwards an unsequenced claims announcement`: `expected [] …`; `… without whatever sequence it carries`: `['claims_changed', 40]` |
| whole-sequence check back to `typeof seq !== 'number'` | `drops a change whose sequence is not a whole number`: `['tree_replaced', Infinity]` forwarded                                     |
| claims reread on synchronisation removed               | `rereads claims each time the stream synchronises`: `expected [] …` (30/1)                                                         |

Results (fresh): `nx run wbs-fe-01:typecheck` succeeded; eslint on the touched files exit 0;
vitest over the same set plus presence, 71 files, 1469 pass; Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all --json` 275 of 275.

Not covered end to end: the real-stream harness (`plan-refresh-stream.test.ts`) drives the owner
directly, not through `createPlanReading`. The one-claims-read-per-reconnect rule is therefore
pinned at the plan-feed seam with a recording owner.

**Second review round (Fable, PR #694 at `a4aaa1265`, one S2).**

- S2-A: `project-stream.ts` delivered unsequenced `claims_changed` frames to every subscriber.
  The saved-plan shelf's socket therefore reread its capability (the whole OpenAPI document) and
  its list once per heartbeat per viewer.
  - Claims announcements now go to a new opt-in `onClaims`, never to `onChange`.
  - Only the plan feed opts in: `PlanFeedStreamHandlers.onClaims` is threaded through the
    project runtime and composition.
  - The shelf passes no `onClaims`, so it hears nothing.
  - Audit, pre-existing and unchanged: the shelf still rereads on every sequenced event of any
    type (`tree_replaced` and the rest), because `watchShelf` hands `read` to `subscribe`
    whatever the event says.
- S3-A: while unanchored (for example after a resynchronisation whose anchor was refused
  `engine_unavailable`), every claims-only invalidation escalated to `initialize()`.
  - Choice: claims are readable whether or not the coordinator holds an anchor (C11 handles
    moment skew), and a claims-only invalidation never starts a resynchronisation.
  - Recorded in the `plan-refresh` delta with the scenario "Heartbeats while the anchor is
    failing".
  - The anchor-failure path no longer marks claims stale, since the tree's failure is not
    theirs. The S3-2 case became `reads claims during an initialize whose anchor fails`.
- S4:
  - Page load reads claims twice. This is kept and documented under design Risks: the first
    read always starts before the socket registers, so only the synchronisation reread covers
    that interval.
  - The design Risks entry that said heartbeats reach the event log is replaced (C21).
  - The claims notice is now an always-mounted `aria-live="polite"` region (`[data-claims-notice]`)
    whose words change. It has no `role=status`, so the existing `getByRole('status')` cases
    still find one status.

| R5 fault (watched)                                              | Observed                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| claims branch removed from `project-stream.ts`                  | `onClaims` 0 calls; a subscriber that did not opt in received `['claims_changed', 40]`; shelf reads 3, expected 1 |
| claims announcement also sent to `onChange`                     | shelf `rereads nothing for five claims announcements`: reads and capability reads 6, expected 1                   |
| plan feed `onClaims` invalidates nothing                        | `reads claims alone for a claims announcement`: `['initialize']`, expected `['initialize', 'invalidate']`         |
| claims-only invalidation escalates                              | `reads claims, not the tree, for heartbeats while unanchored`: `['tree']`, expected none                          |
| claims readable only when anchored (`() => unsequencedAllowed`) | `reads claims during an initialize whose anchor fails`: `pending`, expected `installed`; heartbeat case times out |
| notice region mounted only while stale                          | 404 table case: `toHaveAttribute('aria-live', 'polite')` after the retry, region gone                             |

`composition.test.ts` `READ_ROUTES` now lists `readClaims` (ten routes).

Results (fresh, 2026-10-23):

- `nx run wbs-fe-01:typecheck` succeeded.
- eslint on the touched files: exit 0.
- vitest over the earlier set plus the saved-plan suites: 74 files, 1522 pass.
- Burokrat `check-indexes working . HEAD`: exit 0.
- `openspec validate --all --json`: 275 of 275.

The C21 section above described `onChange('claims_changed')`; the second review round replaced that with the opt-in `onClaims`.

### Slice 3: heartbeat announcement (be-01), 2026-10-23

Branch `feat/wbs-claim-display-heartbeat` on `plan/wbs-claim-display` at `dfacc4af0`. Commands
ran with `env -u CLAUDECODE` from the worktree.

**3.1** `ClaimStore.renewLeases` answers a `LeaseRenewal`: the standing and the projects whose
leases its committed write moved, in project-id order. SQLite reads them inside the transaction
that moves the leases; the memory twin from the rows it moves. `PlanCommandRunner.renewLeases`
publishes one type-only `claims_changed` per named project after the store answers, and the
route still answers the standing alone. `claims_changed` joins `ProjectEvent` (core only; fe-01
reads event types as strings, so no fe-01 union changed). Red: two of three new
`claim-lease.controller.db.test.ts` cases failed before the change (4 pass, 2 fail); the
`write-renew-expire` conformance case now asserts the named projects.

| R5 fault (watched)                                                                                  | Observed                                                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| SQLite store answers the pre-turn due projects and does not await the write (publish before commit) | `announces nothing when the renewal rolls back` records one (0/1 alone) |
| SQLite store answers every in-force lease's project after the renewal (publish unconditionally)     | `announces nothing for a heartbeat within the minute, …` (5/1)          |
| SQLite in-transaction read selects in-force rather than due leases                                  | SQLite certification fails `claims.lease:write-renew-expire` (74/1)     |
| memory twin names the in-force rows' projects rather than the due rows'                             | memory certification fails `claims.lease:write-renew-expire` (74/1)     |

The rolled-back renewal is made by a temporary `RAISE(ABORT)` trigger on `claim.lease_expires_at`;
the route answers 500 and the lease keeps its old expiry.

Deviation: the task's fault "publish before commit" has no one-line form here, because the store
owns both the turn and the transaction and the runner learns the moved projects only from its
answer. The injected fault is the closest real mistake: the store answers before its write
commits. Observation, not changed: a batch's own renewal moves the agent's leases in every
project, yet only the batch's project is announced (`tree_replaced`); design C4 accepts the
batch's project and says nothing of the others.

**3.2** `optimizer-trigger-broadcaster.test.ts` `schedules no optimization for claims_changed`.
The trigger is an allowlist, so there is no exclusion to remove; the fault adds `claims_changed`
to the list.

| R5 fault (watched)                      | Observed                      |
| --------------------------------------- | ----------------------------- |
| `claims_changed` added to the allowlist | the case sees a trigger (3/1) |

Results (fresh, 2026-10-23): be-01 `claim-lease.controller` (6), `project-claims-organization`,
`gateway-broadcaster-*`, `services.db`, `app.routes` 163 pass; be-01 `optimization-events` 4
pass; core `service`, `module/plan-commands`, `module/work-item`, `http/claim*` 830 pass;
store-sqlite `claim*` and source conformance 130 pass; store-memory 193 pass; conformance 35
pass; typecheck wbs-contracts, wbs-core (+module), wbs-store-sqlite, wbs-store-memory,
wbs-conformance, wbs-be-01 (+module), wbs-mcp-01 pass. Not run: mcp-01 tests and fe-01
`typecheck:module` (no contract or fe-01-visible union changed), the full be-01 and fe-01
suites (CI carries them).

**3.3** (C19, the coordinator's decision of 2026-10-23, assumed until Dany reads it) A
committed agent batch announces `claims_changed` through its collector to each project its
renewal moved other than its own. Four new cases in `claim-lease.controller.db.test.ts`
(`a batch renewal announcing claims_changed elsewhere`); red before the change on the two
announcing cases (8 pass, 2 fail).

| R5 fault (watched)                                                | Observed                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| announcement loop removed                                         | `announces once to each other project, …` records none (8/2) |
| own-project filter removed                                        | the batch's own project is announced too (8/2)               |
| published through the outer broadcaster in place of the collector | deadlock on the event log's turn: both cases time out (8/2)  |
| SQLite store answers its due projects before its write            | `announces nothing when the batch rolls back` records one    |
| SQLite store answers every in-force lease's project               | `announces nothing within the minute` records a second       |

The refused case renews nothing, because a refusal never reaches the renewal. It reddened only
under the every-in-force-project fault, whose setup claims also announce, so it has no fault of
its own.

**Review round (Fable, #693 at 965adfe10).** After-commit and tenant isolation held. Fixes:

- S3-1 (task 3.4): the own-project exclusion assumed a `tree_replaced` that only a dirty batch
  sends. A batch that changed no row now announces its own project too. Step commands are not
  plan commands (steps have their own routes), so no step-only batch renews. Residual, recorded
  in design C19: a dirty batch whose tree answers `plan_unavailable` refreshes the tree only.
- S3-2 → C21 (task 3.5): `claims_changed` is transient. `GatewayBroadcaster` pushes it with no
  `seq`, no `event_log` row and no buffer entry; `InternalPushRequest.seq` is optional and gw-01
  forwards the frame without one. The route tests now read the pushes (`pushFetch`) and throw if
  the event is ever logged or sequenced. fe-01 (slice 2) must treat an unsequenced frame as a
  hint and reread claims on every resume (plan-refresh delta).
- S4-1: the runner's JSDoc says what a throwing publish means; sequential, kept.
- S4-2 (task 3.6): SQLite names the projects from `UPDATE … RETURNING` with a scalar subquery,
  one write statement, no read snapshot before the write.
- S4-3: the memory twin finds every due row's project before moving any row (new memory test);
  the conformance case asserts two projects in code-unit order.
- S4-4: the loop variable is `renewedProjectId`.

| R5 fault (watched 2026-10-23)                                    | Observed                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| batch announcement loop removed                                  | three announcing batch cases record none (8/3)                                          |
| own-project filter removed                                       | the dirty batch's own project is announced (9/2)                                        |
| dirty test removed                                               | `announces its own project for a batch that changed no row` (10/1)                      |
| SQLite store answers due projects before its write               | both rollback cases record one (7/4)                                                    |
| SQLite store answers every in-force lease's project              | within-the-minute and refused cases record extra (4/7)                                  |
| `isTransient` never true                                         | gateway-broadcaster unit cases (5/2); be-01 cases throw `claims_changed recorded` (6/5) |
| a failed transient push rethrown                                 | `reports a refused transient push and does not throw` (6/1)                             |
| `InternalPushRequest.seq` required again                         | gw-01 `delivers an unsequenced push without a sequence` 400 (7/1)                       |
| SQLite project list unsorted; again undeduplicated               | SQLite certification `write-renew-expire` (74/1 each)                                   |
| memory project list unsorted; due rows replaced by in-force rows | memory certification `write-renew-expire` (74/1 each)                                   |
| memory rows moved before the work-item lookups                   | `renews nothing when a due claim names an absent work item` (0/1)                       |

Not watchable: publishing the batch's announcement through the outer broadcaster instead of the
collector left every case green, because nothing in a batch can fail after its renewal; the
collector's after-commit send is the existing batch rule, proven in `plan-commands.db.test.ts`.
The earlier "deadlock" observation no longer holds since the event is not logged.

Merge order (tasks.md): after slices 1 and 2 reach `main` and deploy; gw-01 no later than be-01.

**Cross-check (contract drift, task 3.7).** C21 frames had no home in the socket vocabulary:
`WsFrame` requires `seq` and the generic client's guard refused a frame without one. Chosen: a
named `WsTransientFrame` (subscription, message, `'seq?': 'never'`) with its builder
`wsTransient`, rather than an optional `seq` on `WsFrame`, so every reader that advances a
resume point still holds a `seq` it can trust. gw-01's internal push builds it when `seq` is
absent; `createReconnectingWs` gains a required `onTransient` and never updates its tracker
for one.

| R5 fault (watched 2026-10-23)                     | Observed                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| client's transient arm removed                    | `hands a seq-less frame to onTransient and leaves …` fails (6/1)    |
| guard's transient arm removed                     | the same case throws on parse (6/1)                                 |
| tracker advanced on a transient frame             | the same case fails on the snapshot (6/1)                           |
| `'seq?': 'never'` dropped from `WsTransientFrame` | `are transient frames the parser accepts, and only without …` (6/1) |

design.md's Risks no longer says heartbeat events reach the event log; the claim-reads delta
states that a transient announcement SHALL NOT consume a durable sequence.

Slice 3 gate fix, 2026-10-24: the h4claw gate on 9bb246710 failed `wbs-core:test` in
`module-boundaries.test.ts` ("closed feature modules do not reference repository ports"):
`plan-commands.feature.ts` resolved `renewLeases`' answer to `LeaseRenewal`, then declared in
`ports/claim-store.ts`. `LeaseRenewal` now lives in `@wbs/domain` beside `LeaseStanding` and the
port re-exports it. After the move the audit file passes 15 of 15; typecheck wbs-domain, wbs-core,
wbs-store-sqlite, wbs-store-memory, wbs-be-01 and lint wbs-domain, wbs-core pass.

### Slices 4–7: claim chips, lease display, phone cards (fe-01), 2026-10-24

Branch `feat/wbs-claim-display-chips` on `origin/main` at `76575e668` (slices 1 and 2 merged).
Commands ran with `env -u CLAUDECODE` and `TZ=UTC` from `apps/wbs/fe-01`. Slice 3 (be-01
heartbeat announcement, #693) is separate; nothing here touches be-01, gw-01 or contracts.

**Plumbing.** The claims resource installed in slice 2 never reached the screen: the plan feed's
delivery carried tree, steps, directory and markers only. `AppliedGenerations`,
`PlanFeedDelivery` and `DeliveredPlan` gain `claims`; `nextDelivery` carries each claims
generation once, as it does the others; `usePlanRead` returns the installed claims.

| R5 fault (watched)                        | Observed                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| claims generation comparison dropped      | `carries each generation exactly once`: `expected { readAt: 1, … } to be null`                  |
| delivered store ignores a claims delivery | model run fails after 1 run: `a new snapshot exactly when something changed`, teardown `claims` |

**Boundary.** `httpProjectApi.readClaims` now refuses a read with two claims on one work item and
step, or a delegated claim whose parent it does not list (`checkClaimsRead`): either is a
malformed answer (a claims read is one observation and a release cascades to delegated claims),
and refused there it shows as the claims notice (C12) instead of a chip naming nobody.

| R5 fault (watched)      | Observed                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| duplicate check removed | `refuses a claims read with two claims on one step` resolved                    |
| parent check removed    | `refuses a claims read whose delegated claim names an unlisted parent` resolved |

**4.1** `claim-chip.tsx` (`ClaimChip`, `ClaimLine`, `claimSentence`, `CLAIM_SLOT_PX`),
`use-plan-claims.ts` (`indexClaims`, `usePlanClaims`), the folded cell's claim slot after the
assignee's, the unfolded `by` chip after the picker, the folded step card's claim line. The chip is
`role="img"` named by the whole sentence ("Claimed by codex since 24 Oct 10:42, run r-7, under
claire's claim on 010; lease 14 min left"), not focusable, no action; bordered with a 3px hold
edge in a new `--claim-ink` violet (light and dark tokens), so it differs from the assignee by
shape. The instant prints in the project's zone (`zonedMoment`) and is left out on a read
without a zone. Six cases in `plan-claims.test.tsx` over `testing/claims-fixture.ts`.

| R5 fault (watched)                     | Observed                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| slot reserved whatever `anyClaim` says | `reserves no claim slot …` and `leaves an unclaimed plan exactly as it was` fail: `expected <span …(3)></span> to be null` |
| chip's `aria-label` dropped            | `names the claim in full …` and the 5.1 delegated case: `Unable to find role="img" and name "Claimed by codex …"`          |

**4.2** A claim whose row or step the installed tree lacks is skipped in `indexClaims` (C11) and
starts no ticker; the case draws dana's chip and nothing for three absent claims.

| R5 fault (watched)                       | Observed                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| throwing row lookup (`no row w-not-yet`) | `draws nothing for a claim on a row or step the tree lacks …`: no rows, the table replaced by its fault |
| row skip removed                         | same case: `expected 1 to be +0` (the absent claim's lease ran the ticker)                              |
| step skip removed                        | same case: `expected 1 to be +0`                                                                        |

**5.1** The subtree chip sits absolutely after the name, before the notes marker; the Name
cell's box keeps 82px (103px beside the notes marker) on its right only while the row holds one
(`[data-subtree-claim]` in `styles.css`), so unclaimed names wrap as before.

| R5 fault (watched)                      | Observed                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| leaf inherits its parent's subtree chip | `sits in its own row’s Name cell …`: `expected [ 'CL14m' ] to deeply equal []`; collapsed case: `[ 'CL14m', 'CO' ]` |

**6.1** `claim-lease-view.ts` (`leaseViewOf`, `leaseChipText`, `leaseCardWords`), nine cases in
`claim-lease-view.test.ts` (node tier, listed in `vitest.node-suites.json`) including a
fast-check property (seed 20261024, 200 runs) that the faked wall clock never changes the answer.

| R5 fault (watched)                  | Observed                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `Date.now()` for the server instant | 7 of 9 fail; the clock-ahead case on `expected 'releasing' to be '14m'`         |
| `<` for `<=` at the lease end       | `reads releasing at exactly the lease end`: `{ kind: 'in_force', minutes: +0 }` |

**6.2** `lease-clock.ts`: one `LeaseClock` store per table (`useLeaseClock`), ticked by
`useLeaseTicker` every 15 s only while a drawn lease is in force and the page is visible; chips
read it through `useSyncExternalStore`, carried in each `DrawnClaim`, so a tick re-renders the
chips and no row. Three cases with fake `setInterval`, `clearInterval` and `performance`
(`Date` stays real: faking it kept the plan from drawing).

| R5 fault (watched)               | Observed                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| a timer per chip                 | the three ticker cases: `expected 6 to be 1`, `expected 3 to be 1`, `expected 2 to be +0` |
| `running` gate removed           | `runs no timer while no drawn claim holds a lease in force`: `expected 1 to be +0`        |
| revoked lease counted as running | same case: `expected 1 to be +0`                                                          |
| visibility ignored               | `stops the ticker while the page is hidden …`: `expected 1 to be +0`                      |
| tick reads no clock              | `… counts down on it`: `expected '✕CO14m' to contain '12m'`                               |

**7.1** Phone cards draw the step chip right after the step's assignee and the subtree chip in
the header, at a tap size (12px) beside the cards' 14px words; two cases in `plan-cards.test.tsx`.

| R5 fault (watched)   | Observed                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| step chip not read   | `draws a step’s chip beside its assignee …`: `expected [] to deeply equal [ 'CO14m' ]`           |
| header chip not read | `draws a subtree claim’s chip in its card’s header …`: `expected [] to deeply equal [ 'CL14m' ]` |

Deviations:

- The green for each slice was written before its test file, as in slice 2; the weight of each
  case rests on the watched faults above, not on a red before the green.
- The ticker is a store carried in `DrawnClaim`, not a React context: a provider around the
  viewport re-indented about a thousand lines of `wbs-table.tsx`.
- `CLAIM_SLOT_PX` is 30, not the narrower slot the design imagined: `WW` is a 27px chip at 10px
  bold (Chromium, 2026-10-24). In a claimed column the folded trio box shrinks to about 18px. A
  trio beside a drawn result is dropped whole to the card (`watchTrioFit`), but a box with no
  result has no such yield, and its `o/r/p` placeholder read `o.`; the review round below drops
  that placeholder in claimed columns. Pixel budget per design Risks.
- By-eye review used a scratch Vite page (not committed) that draws the real table over
  `testing/claims-fixture.ts`, not the dev stack.

By eye (2026-10-24, Chromium 1440×900 and 390×844 at 2x, light and dark; screenshots kept outside
the repo): folded chips line up on the figures' baseline with the figures still in one column;
the subtree chip sits on the name's first line left of the notes marker; the unfolded `CO 14m`
counted down to `13m` and `EV <1m` turned to a dashed, muted `EV releasing` 31 s later; the card
and the instant fact card read the full sentence; phone chips sit right after the assignee and in
the header. Seen and left: on a phone a long assignee name truncates beside the chip. (The
unfolded `by` cell squeezed an assumed name to `(…` beside a releasing chip; the review round
below fixed it.)

Results (fresh, 2026-10-24):

- `nx run wbs-fe-01:typecheck` (with `typecheck:module`, `--skip-nx-cache`) succeeded.
- eslint on the 26 changed TypeScript files: exit 0; Prettier check on every changed file: clean.
- vitest over `src/components/wbs`, `src/components/board`, `src/modules`, `src/lib`,
  `src/testing` and `src/runtime`, serial: 173 files, 3684 pass.
- `apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`: exit
  0 (the published `bunx twilight-burokrat` refuses under Bun 1.4.4: `toolkit was built with
another Bun: 1.4.2 != 1.4.4`).
- `openspec validate --all --json`: 278 of 278.

Not run locally: the full fe-01 suite, the Auckland zoned run, e2e and pixels (CI carries them;
laptop RAM). No e2e spec names claims or counts claim marks, and an unclaimed plan adds no
element, so no pixels baseline is expected to move.

**Review round (Fable, PR #704 at `91ab8593f`, no S1).**

- S2-1 **Merge order: #704 lands after #693.** Until be-01 publishes `claims_changed` on a
  heartbeat (#693), nothing rereads claims when a lease is renewed, so a healthy heartbeating
  agent's chip counts down to a false `releasing` until some tree change rereads them. New case
  for the scenario "A renewal moves the display": a chip at `lease 3 min left` reads `lease 14
min left` after the stream's claims announcement and its covering claims read.
- S2-2 The unfolded `by` cell's chip moved out of the picker's flex row onto a line of its own
  under it, so the row above is exactly the unclaimed cell's. Chromium, 1440×900, after 31 s:
  `search (Vad…` on the first line (the same ellipsis an unclaimed long assumed name has, 43 of
  121px shown) and `EV releasing` under it, no `(…`; `CO 13m` under `ada ×`. A claimed row is
  one chip-line taller while the step is unfolded.
- S2-3 A folded column that keeps the claim slot draws no `o/r/p` placeholder (Chromium: the
  `030` boxes of claimed Dev and QA read `null`); an unclaimed column keeps it.
- S3:
  - A read `checkClaimsRead` refuses, driven through the table: the claims notice, no plan
    stale alert, no chip, no fault.
  - `parentOf`'s throw names the boundary that makes it unreachable, with a unit negative on
    `indexClaims`.
  - The `columnWidths()` assertion, which could not fail (no claim reaches `<col>`), is gone;
    the unclaimed case now also asserts no claimed `by` line and the `o/r/p` placeholder.
  - The ticker now runs until the latest lease end among claims drawn on screen: rows the
    collapse and filter leave (`shownRows`), step columns not hidden. The tick that reaches it is
    the last, so the last chip turns to releasing and no timer remains.
  - No timer remains after the table unmounts.
  - The phone header's subtree chip clips (`overflow-hidden`) rather than pushing past a long
    priority.
- Left as notes, unchanged: tick granularity, the per-read row rebuild, the `subtree` key.

| R5 fault (watched)                           | Observed                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| plan feed `onClaims` invalidates nothing     | `moves the chip to the renewed minutes …`: aria-label still `lease 3 min left`             |
| by-cell chip back inside the picker's row    | `puts a claimed by cell’s chip on its own line …`: `expected 'flex' not to be 'flex'`      |
| `o/r/p` placeholder kept in a claimed column | `drops the o/r/p placeholder in a claimed column`: `expected 'o/r/p' to be null`           |
| `checkClaimsRead` duplicate check removed    | `shows a read its boundary refuses as the claims notice …`: `expected null not to be null` |
| `parentOf` throw never taken                 | `refuses to index a delegated claim …`: `expected [Function] to throw an error`            |
| lease deadline counts rows off screen        | `runs no timer for a lease drawn on no row on screen`: `expected 1 to be +0`               |
| ticker never stops at the deadline           | `stops ticking once the last drawn lease has ended`: `expected 1 to be +0`                 |
| ticker cleanup does not clear its timer      | `leaves no timer behind once the plan unmounts`: `expected 1 to be +0`                     |

Screenshots re-shot: `desktop-light.png`, `desktop-light-right.png`,
`desktop-{light,dark}-unfolded-after-31s.png`.

Results after the round (fresh, 2026-10-24): `nx run wbs-fe-01:typecheck --skip-nx-cache`
succeeded; eslint on the changed files exit 0; vitest over the same six trees, serial: 173 files,
3692 pass (`plan-claims.test.tsx` 21).

### Slice 8: claim history read (be-01), 2026-10-24

Branch `feat/wbs-claim-history` on `origin/main` at `e763aa1a3` (slices 1 and 2 merged as
`76575e668`; slices 3 to 7 are open PRs and not in this branch). Commands ran with
`env -u CLAUDECODE` from the worktree.

**8.1** `claim-history.ts` in the work-item module: `decodeClaimEvents` decodes each stored
`after` with the journal's `readCommand` (batches walked, so a claim that also assigned lists its
`add_claims`), `nameClaimHistory` names holders and items as the plan holds them now, and
`claimHistoryLimitOf` reads the `limit` query. `WorkItemService.claimHistoryWithin` admits as the
tree read does, reads `listFor(projectId, { kinds: ['claim', 'release'], limit })`, then the rows
and the holders' names through the caller's access. `PlanEventFilter` gains `limit`: SQLite adds
`LIMIT`, the memory twin slices. Eight cases in `claim-history.test.ts` over the memory source and
the real batch runner: claim, release, lease reap and credential reap newest first with their
reasons and the stored event ids; a release of an item named `x (lease expired)` reads
`released`; a deleted holder and item read `null`; a claim's undo and redo and a `setEstimate`
add nothing; 120 events answer the newest 50 and 100; the limit grammar; four corrupt events
(unknown command, no command, a `claim` whose command claims nothing, an unknown reap reason) each
fail the read naming the event; an absent project reads `null`. Red: the seven service cases
failed (`claimHistoryWithin` is not a function) before the green; the limit grammar case passed
with the helper alone. SQLite `plan-event.db.test.ts` gains `answers at most the limit, newest
first, after the other filters`.

| R5 fault (watched)                                                 | Observed                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| undecodable event skipped (`flatMap` with an empty catch)          | corrupt-history case fails (7/1)                            |
| reason read off the label before the stored reason                 | `reads a release named like a reap …` fails (7/1)           |
| unknown reap reason read as `released`                             | corrupt-history case fails (7/1)                            |
| "names no claim" check removed                                     | corrupt-history case fails (7/1)                            |
| `limit` maximum check removed                                      | limit grammar case fails (7/1)                              |
| memory store ignores `limit`                                       | `answers the newest events up to the limit` fails (7/1)     |
| SQLite store ignores `limit`                                       | SQLite `answers at most the limit …` fails (7/1)            |
| `kinds` filter dropped from the service's read                     | `lists no undo, redo or other command` fails (7/1)          |
| deleted holder named by its id instead of `null`                   | `names a holder and an item deleted since as null` (7/1)    |
| `planEvents` dropped from `servicesOver` / from the module mapping | every service case throws `built without plan events` (1/7) |

**8.2** `readClaimHistory` (`GET /api/projects/:id/claim-history`,
`getApiProjectsByIdClaim-history`) in `claim-history-shapes.ts`, bound beside the claims read
in `work-item.routes.ts`: a repeated key or a `limit` outside 1 to 100 is `400 invalid_query`
before access is resolved; then `organizations.resolve`, then the service (`404 not_found` for a
foreign or absent project). Inventory entry, `app.routes.test.ts` operation lists, the MCP pin
list and README (87 to 88 tools; `counts them the same way the document does` failed 87 against
88 until the README moved). `claim-history-organization.controller.db.test.ts` (6 cases): a
member and a viewer read the same newest-first list with `lease_expired`, `released` and
`claimed`, a deleted holder and item `null`, and no foreign event; 60 events answer 50, 2 and 60;
`limit=0`, `101`, `ten`, empty and repeated are refused; a stranger, a foreign or absent project
and an unbound session are refused exactly as the tree read; a removed member is refused as the
tree read refuses them; an undecodable stored command answers 500. The organization harness's
work-item service now gets `PlanEventRepository`.

| R5 fault (watched)                                    | Observed                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `organization-resource` policy dropped from the shape | `covers every mounted organization mutation` and `refuses a stale expected organization …` fail |
| repeated-key check removed                            | limit refusal case fails (5/1)                                                                  |
| `limit === null` refusal removed                      | limit refusal case fails (5/1)                                                                  |
| read with legacy access, access unresolved            | listing, stranger and removed-member cases fail (3/3)                                           |
| service admission removed                             | stranger case fails (5/1)                                                                       |

Deviations and limits:

- Placement: the read lives in the work-item resource, not in `plan-history`. It needs the
  admission, rows and access-scoped names that `WorkItemService` already owns
  (`admits`, `personNamesWithin`), and `plan-history` is a closed feature module under
  `module-boundaries.test.ts`. The resource gains an optional `planEvents` option (read-only
  `listFor`), throwing when absent, as `claims` does; `servicesOver` passes the scope's store.
- The admission is the tree read's `admits` after `organizations.resolve`; unlike the claims read
  it rechecks nothing inside one observation, so a member removed between admission and the event
  read is answered. History rows are append-only and the plan history read takes the same stance;
  the spec now says "refused alike at admission" (review S3-6).
- The first round left claims and releases inside a multi-command batch unlisted; the review
  round below closes that gap (S1-1).
- An undone claim stays listed as claimed (design Risks); the held claims are the truth.

Results (fresh, 2026-10-24): core `claim-history`, `module-boundaries` (15) and the
`module/work-item`, `module/plan-commands`, `module/plan-history`, `module/plan-event` and `http`
suites 446 pass; store-memory 193 pass; store-sqlite `plan-event`, `command-journal`, `changes`
and source conformance 91 pass; be-01 `claim-history-organization` (6),
`project-claims-organization`, `app.routes`, `organization-context`, `claim-lease`,
`claim-identity`, `saved-plan-organization` 52 pass and `history.controller` 8 pass; contracts
496 pass; mcp-01 516 pass; typecheck wbs-contracts, wbs-core (+module), wbs-store-sqlite,
wbs-store-memory, wbs-be-01 (+module), wbs-mcp-01 pass; lint of the same six projects pass;
Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all --json` 280 of 280;
`tool-devsync:test` 921 tests, target succeeded. Not run locally: the full be-01 and fe-01
suites (CI carries them).

**Review round (Fable, #706).** Decision on the batch gap: filter in the store by the stored
command, no migration.

- S1-1: `PlanEventFilter.batchesHolding` widens a non-empty `kinds` with the `batch` events whose
  stored `after` holds an object whose `do` names `add_claims` or `remove_claims` at any depth:
  SQLite `kind = 'batch' AND EXISTS (SELECT 1 FROM json_tree(after) …)` before `LIMIT`, the memory
  twin `holdsCommand`. The decoder splits a batch into one act per top-level step holding either
  (a step holding both, or a kept batch with no act, fails the read naming the event), listed
  last step first with an `act` index; acts of one batch share `eventId`, a lone event is act 0.
  The service cuts the acts to `limit` (each kept event yields at least one). Contract field
  `act`, description and MCP README wording; spec scenarios "A claim inside a batch is listed"
  and "A batch releasing one claim and claiming another lists two events"; C13 note in the
  proposal and design; task 8.3. New conformance case `planEvents.listFor:batches-limit`
  (registered in the manifest, certification and existing-case lists) pins the batch clause, a
  nested batch, a batch that only mentions `add_claims` in text, the limit after the filter, and
  the refusal of limit 0, -1 and 1.5. New core cases: a claim beside `setEstimate` in one batch;
  a batch releasing `090` and claiming `080.1` as two acts, and `limit` 1 answering only the
  newest act; a claim batch found under three newer batches that claim nothing with `limit` 1; a
  batch deleting a claimed item lists nothing (its `before` holds `add_claims`); two corrupt
  batches. `claim-history-batch.controller.db.test.ts` runs `claimWorkItem` beside `setProgress`
  through `POST /commands` on be-01's production composition (`openComposedWith`), so it also
  proves `json_tree` in the SQLite build be-01 runs.
- S3-1: the SQLite limit Proof now cites `plan-event.db.test.ts` and the case's full name.
- S3-2: both stores throw for a limit that is not a whole number of at least 1
  (`checkPlanEventLimit`), pinned in the conformance case.
- S3-3: `claimHistoryLimitOf` is gone; `limitOf(raw, bounds = PAGE_LIMIT)` in
  `service/list-query.ts` reads the claim history's `limit` with `CLAIM_HISTORY_LIMIT`.
- S3-4: `item` is `null` only when the row is gone; a row present with no number throws. No fault
  reaches that line: `deriveNumbers` already throws for a row no root reaches ("work items
  unreachable from any root"), which the case "fails the read for a row the tree cannot number,
  never reading it as deleted" pins. The line narrows the map's answer as `project-claims.ts` and
  `person-work.ts` do; its comment says so instead of claiming a watched negative.
- S3-5: kept as is (optional `planEvents`, production wiring proven).
- S3-6: spec wording "refused alike at admission".

| R5 fault (watched)                                                       | Observed                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| SQLite batch clause removed                                              | SQLite certification fails `batches-limit` (74/1); be-01 batch case fails (0/1) |
| memory batch clause removed                                              | memory certification fails `batches-limit` (74/1); four core batch cases (10/4) |
| SQLite `LIKE '%add_claims%'` in place of `json_tree`                     | SQLite certification fails `batches-limit` (74/1)                               |
| memory text match (`JSON.stringify(…).includes`) before the walk         | memory certification fails `batches-limit` (74/1)                               |
| SQLite limit check removed                                               | SQLite certification fails `batches-limit` (74/1)                               |
| memory limit check removed                                               | memory certification fails `batches-limit` (74/1)                               |
| batches read as a kind and filtered in the service after the store limit | `finds a claim batch under newer batches that claim nothing` (13/1)             |
| post-expansion cut removed                                               | `lists a batch that … as two acts` answers two acts for limit 1 (13/1)          |
| both-in-one-step check skipped                                           | `fails the read on a batch it cannot split into acts` (13/1)                    |
| zero-act batch check skipped                                             | same case (13/1)                                                                |
| memory matches `before` as well as `after`                               | `lists nothing for a batch that deleted a claimed item` (13/1)                  |
| `kinds` dropped from the service's read (rewatched)                      | undo/redo, newer-batches and deleted-item cases (11/3)                          |

A text-match fault on the escaped serialised `"do":"add_claims"` did not redden the memory case:
JSON escapes the quotes inside the stored string, so that spelling cannot match it; the
watched text fault matches the bare command name instead.

Results after the review round (fresh, 2026-10-24): core `module-boundaries`, `list-query` and
the `module/work-item` (claim history 14), `module/plan-commands`, `module/plan-history`,
`module/plan-event` and `http` suites 456 pass; conformance 35 pass; store-memory 193 pass;
store-sqlite `plan-event`, `command-journal`, `changes` and source conformance 91 pass; be-01
`claim-history-batch` (1), `claim-history-organization` (6), `project-claims-organization`,
`app.routes`, `organization-context`, `claim-lease`, `claim-identity`, `saved-plan-organization`
and `history.controller` 61 pass; contracts 496 pass; mcp-01 516 pass; typecheck and lint of
wbs-contracts, wbs-core (+module), wbs-conformance, wbs-store-sqlite, wbs-store-memory,
wbs-be-01 (+module), wbs-mcp-01 pass; Burokrat `check-indexes working . HEAD` exit 0;
`openspec validate --all --json` 280 of 280; `tool-devsync:test` 921 tests, target succeeded.
Not run locally: the full be-01 and fe-01 suites (CI carries them).

### Slice 9: Claims sheet (fe-01), 2026-10-24

Branch `feat/wbs-claim-display-sheet` on `origin/feat/wbs-claim-history` at `167ab6f82` (#706,
slice 8, which already holds main with slices 1–7). Commands ran with `env -u CLAUDECODE` and
`TZ=UTC` from `apps/wbs/fe-01`. No contracts change: slice 8's `readClaimHistory` shape is
used as it is.

**Plumbing.** `ProjectApi.readClaimHistory` (`ClaimHistoryEventView`, `ClaimHistoryClaimView`)
reads `GET /api/projects/:id/claim-history` at be-01's default bound through the shape list;
`plan-refusal.ts` words its refusals exhaustively. It reaches the table as a bound project route
of `PlanCommands` (`readClaimHistory`, beside `exportPlan`, the other read there), so no new
runtime member. The fakes (`fake-project-api.ts`, the shape-checked `refusing-api.ts` boundary,
`claims-fixture.ts` with `history` and `historyReads`) answer it.

**9.1** `claims-sheet.tsx` (`ClaimsSheet`, `groupHeldClaims`): a `Claims` toolbar button with
the held count, a right-side sheet (the whole screen on a phone) listing held claims grouped by
holder (by name), then run (read order), each row number, name, step or `subtree`, lease text
(the plan's lease clock against the read's own clock, C6) and since; claims the tree lacks are
listed by the read's own number and name. Below, the recent claims and releases newest first,
each naming who, `claimed` or `released`, the items (`a deleted person`, `a deleted item` for
null) and the reason (`lease expired`, `credential revoked`). The history is read on open and on
each change of the installed tree's generation while open, never on `claims_changed` and never
while closed; its failure is said in place ("Claim history could not be read.", `Retry
history`) with the held list kept; a failed claims read is said in place over the last claims.
No claim or release control: the sheet's only button is its ✕. Ten cases in
`claims-sheet.test.tsx` at first push. Red before the green: 8 of the first 9 failed (no
button, no dialog); the zero-claims case passed vacuously until its fault below. The tenth,
`says a failed claims read in place …`, was written after the green, its weight resting on its
watched fault.

| R5 fault (watched)                                        | Observed                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| history reread on `claims_changed` (`claims` in the deps) | `rereads the history on a tree change while open, and not on claims_changed`: `expected 2 to be 1` |
| `treeGeneration` dropped from the deps                    | same case, on the tree change: `expected 1 to be 2`                                                |
| button drawn with no claim held                           | `is not drawn while no claim is held …`: `expected <button …> to be null`                          |
| history failure answered as an empty list                 | `says the history could not be read in place …`: the sentence not found                            |
| claims failure not said in the sheet                      | `says a failed claims read in place …`: `expected undefined to be 'Claims could not be read. …'`   |

**9.2** The phone `Plan actions` sheet's View group carries the same button; it opens the Claims
sheet over the actions sheet (its trigger is `aria-haspopup`, so the actions sheet stays, as
Project settings does). Case `is offered on the Plan actions sheet, and opens over it` in
`plan-cards.test.tsx`.

| R5 fault (watched)             | Observed                                               |
| ------------------------------ | ------------------------------------------------------ |
| button left off the View group | the case found no `Claims, 5 held` button in the sheet |

Deviations:

- C16 amended (first push: drawn only while a claim is held or the sheet is open; replaced in
  the review round below by the latch).
- The history read is a `PlanCommands` route rather than a new `ProjectRuntime` member, as
  `exportPlan` is: a new runtime member would change the runtime's enumerated surface for one
  sheet-local read.

By eye (2026-10-24, Chromium 1440×900 and 390×844 at 2x, light and dark, a scratch Vite page
over `claims-fixture.ts` with seven claims, one on a row the tree lacks, a 52-character run id,
and five history acts including a batch and a deleted person and item; not committed): the
button sits after `2 unestimated` with its count in the claim tint; the sheet lists the groups
with the run ids in mono, long names truncated before the lease and since columns, the long run
id wrapping inside the sheet (no horizontal overflow: scrollWidth equals clientWidth at both
widths); the failed history reads one line with its retry. Fixed during review: browser-default
list margins and indent (an empty band above each run's rows) and the kit's 90vh cap leaving the
right sheet short of the bottom edge (`max-h-dvh`). Screenshots kept outside the repo.

Results (fresh, 2026-10-24):

- `nx run wbs-fe-01:typecheck` (with `typecheck:module`, `--skip-nx-cache`) succeeded.
- eslint on the 14 changed TypeScript files: exit 0; Prettier written on them.
- vitest over `src/components/wbs`, `src/modules`, `src/lib` and `src/testing`, serial: 156
  files, 3560 pass (`claims-sheet.test.tsx` 10).
- `apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`: exit 0.
- `openspec validate --all --json`: 282 of 282.

Not run locally: the full fe-01 suite, e2e and pixels (CI carries them; laptop RAM). No e2e
plan holds a claim, so no e2e toolbar count or width moves and no pixels baseline is expected to
change.

**Review round (#710 at `7c541b40a`, no blocker).** Coordinator decisions recorded as
assumptions for Dany.

- S1 The latch: `useClaimsOffered` in `claims-sheet.tsx`, held by the table (on a phone the
  sheet mounts only while `Plan actions` is open), offers the button once a claims read in this
  table has listed a claim for the project, and while the sheet is open. A never-claimed plan's
  toolbar is unchanged; a plan whose last claim was reaped keeps a count-less button, so the
  reason stays reachable (C13). C16 and the spec delta say so, with the scenario "The last claim
  is reaped while the sheet is closed"; case `stays, with no number, when the last claim is
reaped while it is closed`.
- S2 Focus: the "last claim goes while open" case now closes the sheet with Escape and asserts
  the focus is back on the trigger.
- S3 Two deferred-promise cases: a close and reopen, and a tree change whose read lands before an
  older one. Proof beside the `current` guards.
- S4 The toolbar on the scratch plan (light, Chromium), `measureToolbar`'s sum:

  | Width | Plan                            | laidOut | Rows | Overflow right | Page scroll |
  | ----- | ------------------------------- | ------- | ---- | -------------- | ----------- |
  | 1280  | never claimed                   | 1332.48 | 2    | 0              | 0           |
  | 1280  | seven claims (`Claims 7`, 83px) | 1421.84 | 2    | 0              | 0           |
  | 1024  | never claimed                   | 1332.48 | 2    | 0              | 0           |
  | 1024  | seven claims                    | 1421.84 | 2    | 0              | 0           |

  The never-claimed figure equals `project-settings.spec.ts`' pin (1332.5). With claims the
  button ends row one and the `Whole plan` group stays whole and right-aligned on row two
  (top 44, right edge 1272 and 1016); no third row, nothing clipped. Screenshots
  `toolbar-{1280,1024}-light-claimed.png`.

- Nits: a Proof on the never-read-while-closed return; a reopened sheet starts from `Reading…`
  and a reread while open dims the list it keeps (`data-claim-history-rereading`); the history
  failure comment cites the spec scenario; a `Reading…` line in the held section before the
  first claims read; the amended design and spec lines rewrapped; the API JSDoc points at the
  contract for the bound instead of repeating it; `PROJECT_COMMAND_ROUTES`' JSDoc names the
  project-scoped reads.
- Eye review: run ids break after `:`, `-` and `/` (`<wbr>`, `overflow-wrap: anywhere` only as
  the last resort), so `…-long-` / `run-identifier`; `Retry history` is an outline button; a
  history entry naming several claims reads `released 2 items` with one item per line, a
  deleted one still `a deleted item`.

| R5 fault (watched)               | Observed                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| latch dropped (`return holding`) | `stays, with no number, when … closed`: `expected undefined to be 'Claims'`; the open case's focus: `expected <body …> to be <button …>` |
| both `current` guards removed    | the two race cases: `expected [ 'old' ] to deeply equal [ 'new' ]`                                                                       |
| `if (!open) return` removed      | `rereads the history …`: `expected 3 to be +0`                                                                                           |
| no history reset on close        | `dims the list while open and rereading, and shows none of it on a reopen`: `expected [ 'second' ] to deeply equal []`                   |
| no rereading mark                | same case: `expected null not to be null`                                                                                                |

Results after the round (fresh, 2026-10-24): `nx run wbs-fe-01:typecheck --skip-nx-cache`
succeeded; eslint on the changed files exit 0; vitest over the same four trees, serial: 156
files, 3564 pass (`claims-sheet.test.tsx` 14); `openspec validate --all --json` 282 of 282; Burokrat `check-indexes working . HEAD` exit 0.

Screenshots re-shot: every sheet shot (desktop and phone, light and dark, history failed) and the
two toolbar shots, in the session scratchpad's `claim-sheet-shots`.
