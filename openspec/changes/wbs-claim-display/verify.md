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
