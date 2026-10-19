# Serial compiler implementation plan

**Goal:** Remove simultaneous compiler retention from filesystem extraction.

**Architecture:** Five serial phases replay one immutable program at a time. The bounded runner is unchanged. Bun collects released state between helper invocations.

**Tech stack:** Bun 1.4.2, TypeScript 6.0.3, existing Bun/Nx checks.

**Spec:** [design](design.md), [requirements](specs/burokrat-rules/spec.md).

## 1. Production resource RED

- [x] 1.1 Write a committed synthetic multi-config fixture and production CLI memory oracle; record workload dimensions, exact invocation, complete output assertion and sampled process-tree guard.
- [x] 1.2 Observe the unchanged production path exceed the workload ceiling; keep stderr/stdout and receipt. No production implementation precedes this RED.
- [x] 1.3 Add small-workload report parity and compound parse/import/diagnostic/emission/public-owner cases using the existing real compiler.

## 2. Serial legacy implementation

- [x] 2.1 Add `relationships/typescript-serial.ts` with one program per helper invocation; retain plain observations and selected configuration metadata, including config-only reference ASTs; freeze initial roots and nested/cyclic/absent references. Replay parse, imports, diagnostics, emission and requested public surfaces in phase order.
- [x] 2.2 Route only `relationships/typescript.ts` to the new runner. Verify the bounded runner/import/declaration source hashes remain equal to the base; review the compiler helper extraction for identical callback sequence.
- [x] 2.3 Run focused GREEN under 2 GiB/360 seconds and minimum 12 GiB available; measure elapsed wall time and sampled RSS. Restore old production routing, observe resource RED, restore serial routing and GREEN. Add adjacent observed Proof comments.

## 3. Reviewable candidate

- [x] 3.1 Run equivalence, ownership, semantic closure and compound-fault cases; run existing bounded-source exact-fit and admission suites unchanged.
- [x] 3.2 Run scoped format/lint/typecheck and strict OpenSpec validation; document every omission and dependency symlink honestly.
- [ ] 3.3 Obtain independent review, preserve unrelated files, and commit using normal hooks.

## 4. Coordinator acceptance

- [ ] 4.1 Build and install an explicitly identified successor in an authorized hosted lane; retain historical artifact unchanged and compare small fixture reports.
- [ ] 4.2 Run complete base/candidate all-rule comparisons with identical external policy and committed oversized negative; record every unevaluated rule.
- [ ] 4.3 Run full CI and canonical exact-SHA h2puni gate. Keep WBS100 blocked until all remaining obligations are evidenced.
