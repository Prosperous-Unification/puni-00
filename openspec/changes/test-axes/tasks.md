## 1. The contract

- [ ] 1.1 Record this delta spec, its level-selection table and its identifier rules — test: strict OpenSpec validation reporting zero failures; negative: remove the sole scenario heading of TEST-AXES-023 and watch it report `must include at least one scenario`, then restore it

## 2. Levels and identifiers (needs 1.1)

- [ ] 2.1 Add one Nx target per level without renaming or removing an existing target, and make every runner write a JUnit report; implements the level and target requirements — test: run each level target and confirm it collects only that level's files; negative: add an existing Conformance file, which rule 2 of the level table keeps classified as Conformance, to a target declared for the API level alone, and watch the isolation assertion fail naming that file and both levels; restore the target
- [ ] 2.2 Deliver the scenario identifier allocator with predecessor support, then allocate the identifiers of one capability end to end, cite them in its existing tests and produce the first coverage table by hand; implements the identifier requirements — test: the join from the JUnit reports to that capability's scenarios; negative: remove one citation and watch the scenario show as uncovered (needs slice B3 of the rules design, which also imports and reserves the identifiers this change already wrote by hand)

## 3. The ledgers (needs 2.1 and 2.2)

- [ ] 3.1 Compute both coverage ledgers in Twilight Burokrat and enforce T2; implements T1, T2, both coverage requirements, the capability chain and the manual case requirements — test: the Burokrat's ledger tests; negative: remove a citation from an API-level test, and separately give a scenario a disposition that is neither manual nor a reasoned inapplicability (needs slice B4, which the rules design makes depend on B3)

## References

1.1 is Task 1 of the [rollout plan](../../../docs/superpowers/plans/2026-09-19-code-organization-rollout.md), 2.1 and 2.2 are its Task 5, and 3.1 is its Task 9. The allocator in 2.2 is slice B3 of the [Twilight Burokrat rules design](../../../docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md), and the ledgers in 3.1 are its slice B4, which that design makes depend on B3.
