## Verification record

Drafted 2026-10-23 as an OpenSpec proposal; nothing is built. C1 to C18 are assumed until
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
  bold (Chromium, 2026-10-24). In a claimed column the folded trio box shrinks to about 18px, so
  the trio yields to the card as it does for the assignee slot. Pixel budget per design Risks.
- By-eye review used a scratch Vite page (not committed) that draws the real table over
  `testing/claims-fixture.ts`, not the dev stack.

By eye (2026-10-24, Chromium 1440×900 and 390×844 at 2x, light and dark; screenshots kept outside
the repo): folded chips line up on the figures' baseline with the figures still in one column;
the subtree chip sits on the name's first line left of the notes marker; the unfolded `CO 14m`
counted down to `13m` and `EV <1m` turned to a dashed, muted `EV releasing` 31 s later; the card
and the instant fact card read the full sentence; phone chips sit right after the assignee and in
the header. Seen and left: in the unfolded `by` cell an assumed name beside a releasing chip
ellipsizes to `(…`; on a phone a long assignee name truncates beside the chip.

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
