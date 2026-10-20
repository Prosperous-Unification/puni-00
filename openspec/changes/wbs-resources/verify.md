## Verification record

Nothing implemented. Drafted 2026-10-20 under Dany's "GO" goal of the same day; R1 to R8 in
design.md are assumed until he reads them. Sources: Claire's design consult and breakdown of
2026-10-17 (PR #571, merged), `docs/capacity.md`, the `wbs-team-claims` change (slice 1
claim table at PR #579), `schedule.ts` ledger and `model.py` cumulative per pool as read on
2026-10-20.

Term collision checked in `CONTEXT.md`: **Hold** already names a work item's on-hold state
and **Lease** is reserved for runtime, so the live units a claim holds are **Occupancy**.

`openspec validate --all --json`: run before each push, result in the PR.
