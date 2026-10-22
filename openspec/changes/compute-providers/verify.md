## Verification record

Drafted 2026-10-22 as an OpenSpec proposal only; nothing is implemented. O1 to O5 in
design.md are Dany's owner decisions; P1 to P14 are assumed until he reads them. Sources read
on 2026-10-22: `wbs-resources` (proposal, design R1 to R8, `resource-directory` and
`resource-occupancy` specs, tasks, verify slice 5), `wbs-machine-credentials` on branch
`plan/wbs-machine-credentials` at `0dd0c4710` (design A1 to A24, `machine-credentials` spec,
tasks slice 1), `wbs-team-claims` (D1 to D8, `fleet-credentials` spec), the migrations
`20261020120000_add_resources`, `20261020130000_add_claim_occupancy` and
`20261012090000_add_enterprise_sso_records`, `commands/definitions.ts` (`createResource`,
`patchResource`, `deleteResource`, `setResourceCapacity`), `resource-shapes.ts`,
`refusal.ts`, `ports/organization-audit.ts`, the Dash README and `src/` layout,
`docs/twilight-structure/names.md` and glossary, `docs/infra/gate-hosts.md`,
`docs/infra/enroll-h4claw-h3mon.md` (h4claw 8 CPUs, 15,602 MiB; h2puni 8 vCPU, 15 GB usable),
`discovery-ssh-transport` and `f9-local-process-observation` proposals, Claire's notes
`notes/resource-claim-release-design-2026-10-17.md` and
`notes/wbs-resource-claiming-breakdown.md`, `openspec/changes/twilight-control-plane/design.md`
§Admission and §Planning, knowledge and client portability.

Term collisions checked in `CONTEXT.md` and `docs/twilight-structure/CONTEXT.md`:
**provider** alone is avoided for Adapter and Ref family and is the identity provider in the
auth terms, so the term is **Compute provider** (P1); **Capacity pool** and **Lease** stay
Dash's runtime terms and are not reused for the report; **Worker provisioner** is the Dash
actor that places an attempt on a provider and is not renamed; **Occupancy** is untouched.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before any slice is called done

- Slice 1: the rollback guard refuses over one reference; the browser-session, delegation and
  `person`-pinned machine cases are each refused `not_an_agent_principal` and store nothing;
  B's key against A's instance is `404 unknown_provider` with no instance named; the same body
  twice is one stored row; the older `observedAt` is `report_superseded`; the schedule hash and
  the claim decision are byte-identical with and without a stored report; the export holds no
  instance id; each `Proof:` names its watched negative.
- Slice 2: the SSH adapter answers `unreachable` for a closed port and throws for a missing
  `MemTotal`; no `Date.now` in `src/compute`; the reporter exits on `401` and after three
  `report_superseded`; the credential appears in no output; the first stored reports for
  h2puni and h4claw are quoted from dev with their `observedAt` and `reportedBy`.
- Slice 3: the labelled-containers fixture over-reports with the label filter removed and
  does not with it restored.
- Slice 4: a `puni_pool` and a `kubernetes` instance each register in WBS and each refuse to
  start in Dash with their named refusal before any dial.
- Slice 5: the four report states and the stale boundary render; a missing report never
  renders as a number; adopt writes exactly one `setResourceCapacity` and undo restores.

## Slices

None implemented.
