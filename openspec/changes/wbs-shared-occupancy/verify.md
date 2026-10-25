## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only; nothing is implemented. S1 to S11 in
design.md are assumed, awaiting Dany.

Sources read on 2026-10-25 on `main` at `2ca06fcf1`: `wbs-resources` (proposal, design R1 to
R8a, `resource-occupancy` and `startable-work` specs, tasks), `compute-providers` (proposal,
P3 to P7, risks), `wbs-organization-limits` (proposal, L1, L2), `wbs-permissions` (proposal),
`libs/wbs/domain/domain/src/occupancy.ts`, `libs/wbs/adapters/store-sqlite/src/claim.ts`
(`occupancyOf`), `schema.ts` (`resource`, `project_resource_capacity`, `claim_occupancy`,
`resource_organization`), `gate.ts` (`WriteCoordinator`), the claim and release paths in
`work-item.resource.ts`, `startable-shapes.ts`. Read only, not on `main` and not modified:
`openspec/changes/wbs-resource-release` in the main checkout (design §1, §6).

Evidence of the gap: the swarm rehearsal of 2026-10-25, check 4 (`g4-multi.ts`,
`evidence.log` phases 4a to 4c, outside the repo): B read `host ram [16, 0, 16]` while A held
16; a 16 GB claim in B answered 200; `staging` was claimed in A and B at once.

Unverified: whether a project can today demand or state another organization's resource
(task 1.3 proves it).

## Commands

- `openspec validate wbs-shared-occupancy --strict`: result in the PR.
- Docs index check (`twilight-burokrat check-indexes working . HEAD`): result in the PR.

## What must be observed before each slice is called done

Each task's fault line, watched failing with the check removed, with its `Proof:` comment
beside the check and the command output recorded here.
