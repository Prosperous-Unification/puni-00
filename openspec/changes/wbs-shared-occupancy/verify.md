## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only; nothing is implemented. S1 to S12 in
design.md are assumed, awaiting Dany. Amended the same day after a Fable review of PR #737
(eight S2 and eight S3 findings).

Sources read on 2026-10-25 on `main` at `2ca06fcf1`: `wbs-resources` (proposal, design R1 to
R8a, `resource-occupancy`, `startable-work` and `schedule-resources` specs, tasks),
`compute-providers` (proposal, P3 to P7, `compute-provider` spec), `wbs-organization-limits`
(proposal, L1, L2, `organization-limits` spec), `wbs-permissions` (proposal),
`wbs-team-claims` (D5), `wbs-claim-leases` (L7), ADR 0015,
`libs/wbs/domain/domain/src/occupancy.ts`, `canonical-schedule-input.ts`,
`libs/wbs/adapters/store-sqlite/src/claim.ts` (`occupancyOf`), `schema.ts` (`resource`,
`project_resource_capacity`, `claim_occupancy`, `resource_organization`), `gate.ts`
(`WriteCoordinator`), `command-references.ts` 103 to 123, `working-plan.resource.ts`
(`assertProject`, the lazy claim-store reads), the claim, release and `withClaimsRestored`
paths in `work-item.resource.ts`, `startable-shapes.ts`, `refusal.ts`, and the audit
migrations `20261022140100_widen_organization_audit_compute_providers`. Read only, not on
`main` and not modified: `openspec/changes/wbs-resource-release` in the main checkout
(proposal lines 23 and 32, design lines 39 and 181 to 182, `resource-release` spec lines 126
to 127).

Evidence of the gap: the swarm rehearsal of 2026-10-25, check 4 (`g4-multi.ts`,
`evidence.log` phases 4a to 4c, outside the repo): B read `host ram [16, 0, 16]` while A held
16; a 16 GB claim in B answered 200; `staging` was claimed in A and B at once.

Already proven on `main`, not re-tasked: a plan cannot name another organization's resource
(`refuses a foreign resource exactly as an absent one`, `refuses a claim asking for a foreign
resource exactly as an absent one`, `resource-organization.controller.db.test.ts`).

Known gaps, stated:

- The S5 redaction has no production-path negative until a `wbs-permissions` grant can deny
  a project; task 4.1's negative runs through the access port seam only.
- `openspec validate` reports that archive would refuse the MODIFIED deltas of
  `startable-work`, `schedule-resources`, `organization-limits` and `compute-provider`
  until those capabilities' main specs exist (task 0.3).

## Commands

- `openspec validate wbs-shared-occupancy --strict`, `openspec validate --all --json`, the
  docs index check (`twilight-burokrat check-indexes working . HEAD`) and Prettier: results in
  the PR.

## What must be observed before each slice is called done

Each task's fault line, watched failing with the check removed, with its `Proof:` comment
beside the check and the command output recorded here.
