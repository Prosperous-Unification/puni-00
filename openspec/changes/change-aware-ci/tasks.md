## 1. Focused documentation validation

- [x] 1.1 Extract current-document checks into tools/tool-devsync/src/current-documents.ts and a check-documents.ts CLI, retaining tests in repo-namespacing-handoff.test.ts and adding current-documents.test.ts production-path regressions. Prove invalid links, missing exemption state, and invalid index memberships fail; record guard-removal failures. Expose an uncached tool-devsync:check:docs target.
- [x] 1.2 Implement immutable diff/prose classification in tools/tool-git-hooks/src/hooks/ci-selection.ts with ci-selection.test.ts. Cover reviewed prose namespaces and supported docs index membership changes; refuse malformed identities and prevent mixed code, rename-from-code, modes, fixtures, consumed docs and authority edits from qualifying. Use actual Git histories; remove each narrowing guard and observe its negative fail.

## 2. Runtime and file selection

- [x] 2.1 Select runtime targets independently of lint-only inputs using pinned Nx project/dependency evidence; test in ci-runtime-selection.test.ts with real configured projects. Prove transitive source, fixture, process and config consumers stay selected, and unrelated repository-wide lint does not activate Burokrat tests. Preserve full-event selection.
- [x] 2.2 Add narrowly eligible Bun file selection through an additional Nx entrypoint where complete impact is established, preserving default full commands. Test selected file execution and failing cases, transitive consumers, missing files, empty discovery, dynamic inputs, deletion and rename. Fall back explicitly to complete module suites for uncertain impact. Retain observed negative proofs and selection reasons.

## 3. CI integration and evidence

- [x] 3.1 Wire .github/workflows/ci.yml to the validated plan and focused docs job, retaining formatting/security checks and immutable-base revalidation. Update gate-workflow.test.ts, pr-merge-base.test.ts, pixels-workflow.test.ts and toolchain-pins.test.ts. Production reducer negatives must reject scope failures and failed/cancelled/absent/unexplained-skipped selected jobs; mutation-test each changed guard.
- [ ] 3.2 Preserve exact revision/selected-check/reason/timing evidence. Replay the assessment diff, broken docs, module, fixture and deleted/renamed source scenarios. Run focused lint/typecheck/tests, OpenSpec validation, independent review and hosted/full required gates; record actual outputs and unverified work in verify.md. Publish a reviewable implementation PR with measured scope savings.
