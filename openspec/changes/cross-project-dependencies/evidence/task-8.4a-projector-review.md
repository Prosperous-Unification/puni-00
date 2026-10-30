# Independent review: task 8.4a projector

**REJECT** commit `c103ed3f209e7e82ee3ea21e6dd1f3b986373443` against base
`f0a1b99b605c57545dee7fbdbda8c7af1664f6ee`, reviewed 2026-10-22 in
`/tmp/puni-connected-tree-84a`. This verdict concerns the unmounted pure projector
only, not completion of task 8.4 or activation readiness.

## Required corrections

1. **P2 — descendant-step endpoints are mislabeled as individual steps.**
   `libs/wbs/application/core/src/service/connected-tree.ts:185–190` computes a
   step reference for every non-whole endpoint. A valid parent `parent` in project
   A, with child `a`, code `dev`, and an authored descendant-step prerequisite on
   B projects `stepReference: "010.s1-dev"` and
   `qualifiedReference: "A.010.s1-dev"`, although `isLeaf` is false and
   `stepNodeId` is null. This printable address denotes a single step, whereas the
   endpoint selects the parent's descendant steps. The cross-project delta
   `specs/wbs-domain/spec.md:123` expressly prohibits spelling a descendant-step
   endpoint as one step reference. Make the reference projection scope-aware;
   retain stable parent/project/step identity and selector meaning, and test a
   coded descendant-step endpoint. Freeze the corresponding DTO interpretation
   with the PlanTree integrator so consumers cannot display this false address.

2. **P2 — required endpoint-label checks accept unexpected null values.**
   `connected-tree.ts:51–54,167–183` checks only undefined. Injecting `null` into
   the captured remote row name returns `name: null`; injecting it into the remote
   abbreviation returns `projectAbbreviation: null` and invents
   `qualifiedReference: "null.010"`. These are the same production projection and
   evidence-injection boundary exercised by the committed undefined-label tests.
   They violate R5's unexpected-nullish refusal and the live-plan snapshot delta's
   missing/invalid external evidence contract. Reject null for required textual
   facts, while preserving deliberately nullable step code. Add watched production
   negatives for the required label fields and retain the existing uncoded-step
   success case.

Both findings were reproduced without modifying repository source. Diagnostic
script: `/tmp/puni-connected-tree-review-diagnostics.ts`; fresh output:
`/tmp/puni-connected-tree-review-diagnostics.log`.

## Confirmed within this packet

- `reads` and live `metadata` come from the requested captured member; row and step
  identities and project ownership are checked across captured members.
- Readiness is selected from component-derived maps, with remote blocker/root IDs
  preserved. Missing target status, leaf reading/cause, per-step reading/cause,
  eligibility and order evidence refuses. Sparse predecessor maps remain sparse.
- Scheduled placement is the actual `byProject` schedule reference selected by
  `selectConnectedProject`; the projector does not schedule or round it. Own-anchor
  fractional placement and interleaving have focused witnesses.
- Incoming and outgoing authored incident links are retained, unrelated links are
  excluded, and node endpoints use their own captured numbering and step order.
- Missing calendars and engine refusal retain metadata, readiness and incident
  links. No synthetic local optimization or fallback schedule is introduced.
- The function accepts detached values only and contains no IO, runtime admission
  or replanning call. Authorization and capture lifetime remain producer duties.
- The discriminated result is usable by the planned explicit connected formatter
  branch after the two corrections. It is not a PlanTree and has no mounted caller
  in this commit. Existing row folds/accounting, scheduled row membership, DTO
  availability, response validation and event behavior remain integration work.

## Fresh verification and proof audit

- `bun test libs/wbs/application/core/src/service/connected-tree.test.ts
libs/wbs/application/core/src/service/connected-plan.test.ts
libs/wbs/application/core/src/service/connected-readiness.test.ts`:
  **50 pass, 0 fail, 142 assertions**, exit 0, 158 ms.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.lib.json
libs/wbs/application/core/tsconfig.spec.json`: exit 0, no diagnostics.
- `bun --tsconfig-override tsconfig.base.json
/tmp/puni-connected-tree-review-diagnostics.ts`: exit 0; output demonstrates
  both findings above. The diagnostic intentionally prints accepted malformed
  projections; its exit status does not imply acceptance correctness.
- `git diff --check f0a1b99b6 c103ed3f209e7e82ee3ea21e6dd1f3b986373443`:
  exit 0. Final `git status --short` empty; no repository edits.
- Read the committed evidence and the existing watched-fault summary/logs. The
  summary records failing guard/filter/number faults, and the separate
  `metadata-identities-all.log` contains all five metadata identity failures as
  claimed. The missing-row fault reaches a later refusal; the other four accept
  invalid evidence without the guard. These are pure production-function proofs,
  not mounted HTTP proofs. No mutation experiments were rerun during this read-only
  review; endpoint-label initial REDs are author-recorded evidence, not newly
  observed mutations by this reviewer.

## Limits and diagnostics

No fresh full lint, full core suite, OpenSpec validation, mounted controller suite,
browser test, exact-SHA host gate, CI, deployment or activation was performed.
The author's configured `wbs-core:lint` attempt remains a recorded exit-1 failure
without ESLint rule diagnostics; the passing named-file lint does not clear it.
The test suite has no descendant-step endpoint projection case. Mounted
full/paged/detail trees, retained reads, claim commit/announcement timing,
load/space aggregation, arrangement and optimizer restart are explicitly outside
this commit and remain unverified.

Initial diagnostic invocations failed because the review script first named an
incorrect domain source path and then a nonexistent root `tsconfig.json`; these
were corrected in the temporary script/invocation before the recorded successful
run. Bun printed a directory-mismatch internal warning on both successful
diagnostic invocations, including the final saved log; all three expected
diagnostic JSON records were emitted and the process exited 0.
