## 1. The decision

- [ ] 1.1 Record ADR 0029, this delta spec and the five glossary terms — test: `bun test tools/tool-devsync/src/adr-index.test.ts -t '^ADR numbers are unique and contiguous from 0001$'`; negative: remove the sole scenario heading of SERVICE-TAXONOMY-041 and watch strict OpenSpec validation report `must include at least one scenario`, then restore it

## 2. Classification, observe mode (needs 1.1)

- [ ] 2.1 Classify every existing service file and its capability, term or disposition; implements K1, K9 and inventory integrity — test: the inventory test in `tools/tool-devsync/src/service-kinds.test.ts`; negative: delete one entry, and separately point an entry at a path that does not exist, and separately remove the classification file altogether

## 3. Checks that can fail (needs 1.1)

- [ ] 3.1 Add the direction fences to `apps/wbs/eslint.product.mjs`; implements F1, K2, K3, K4 — test: `tools/tool-devsync/src/kind-direction.test.ts`; negative: remove each pattern in turn and watch its case fail
- [ ] 3.2 Add the file size ratchet; implements F7 — test: `tools/tool-devsync/src/size-ceilings.test.ts`; negative: grow a pinned file through the test's fixture path, and add an unlisted file over the ceiling
- [ ] 3.3 Add the primitives fence; implements F3 — test: the F3 case beside `kind-direction.test.ts`, added with the first extracted frontend module; negative: import a vendor UI library from a feature file and from a file outside `apps/wbs/fe-01/src/components/ui`

## 4. Modules (needs 2.1 and 3.1)

- [ ] 4.1 Extract the frontend services into modules; implements F2 and the module layout — test: each source hook's existing tests, unedited, plus each module's isolated type check
- [ ] 4.2 Split the backend core's services into modules; implements K1, K6, K8 — test: the core's tests and both store conformance targets
- [ ] 4.3 Make each module one sealed, labelled DI Bag module; implements the "exactly one DI Bag module" half of the module layout — test: each module's `check.ts` installing the module with typed fixtures; negative: remove a required key from a module's contract and watch the install fail

## 5. Handover (needs 2.1, 3.1, 3.2 and 4.3)

- [ ] 5.1 Move the inventory, the ratchet and the direction rules into Twilight Bureaucrat's policy and supply the adopted set that ratchet mode needs; implements K2 to K6, K8 and all three modes — test: the Bureaucrat's own rule tests; negative: one violating fixture per rule, watched failing before the rule is enabled

## References

Slices map onto the [rollout plan](../../../docs/superpowers/plans/2026-09-19-code-organization-rollout.md): 1.1 is its Task 1, 2.1 its Task 2, 3.1 its Task 3, 3.2 its Task 4, 4.1 its Task 6, 4.2 its Task 7, 4.3 its Task 8, and 5.1 its Task 9. Slice 4.3 is owned by the [package adoption plan](../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md), which must be amended first. Slice 5.1 is slice B2 of the [Twilight Bureaucrat rules design](../../../docs/superpowers/specs/2026-09-19-twilight-bureaucrat-rules-design.md).
