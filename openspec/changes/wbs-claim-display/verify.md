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

None yet; each slice records its red, green and R5 fault here.
