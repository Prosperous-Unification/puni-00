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
claim leases slice 1) merged in rather than rebased (task 0.2). Commands ran with
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
| SQLite read selects a constant null for `lease_revoked_at` | SQLite certification fails the case (72/3) |
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

Results (fresh, 2026-10-23): store-sqlite `source-conformance.db.test.ts` 75 pass; claim DB tests
(`claim`, `claim-occupancy-race`, `claim-race`, `claim-lease`, `claim-lease-race`) 37 pass;
store-memory 193 pass; conformance 35 pass; contracts 496 pass; core `module/work-item` plus
`resource-command` and `claim-command` 268 pass; be-01 `project-claims-organization`,
`app.routes`, `organization-context`, `person-work-organization`, `claim-lease` controller tests
pass; mcp-01 516 pass; typecheck wbs-contracts, wbs-core (+module), wbs-conformance,
wbs-store-memory, wbs-store-sqlite, wbs-be-01 (+module), wbs-mcp-01, wbs-fe-01 `typecheck:module`
pass; Burokrat `check-indexes working . HEAD` exit 0; `openspec validate --all --json` 275 of 275. Lint of wbs-contracts, wbs-core, wbs-conformance, wbs-store-memory, wbs-store-sqlite, wbs-be-01 and wbs-mcp-01 passes; `tool-devsync:test` passes. Not run locally: the full
be-01 and fe-01 suites (CI carries them).
