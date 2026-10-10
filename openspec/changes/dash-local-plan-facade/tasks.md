## 1. Local Dash enrollment planning

- [ ] 1.1 Red then green: create the `twilight-dash` Bun CLI application at `apps/twilight-structure/twilight-dash/cli`, its ordinary Nx/TypeScript/ESLint registration, `src/cli.ts::runDash` and `src/entrypoint.ts`, with `src/cli.test.ts`. The only accepted command is `plan-enrollment` and the eight flags in design.md. Prove missing/duplicate/unknown flags, missing values, `--operation`, arbitrary executable selection and unsupported commands refuse before the planner seam is invoked. R5: bypass the dispatcher allowlist and duplicate-flag guard separately; watch the real routing negatives fail, restore and add adjacent `Proof:`. Do not add a generic tool launcher or relax global import/lint policy.
- [ ] 1.2 Red then green: connect the fixed enrollment adapter to `tools/tool-fleet/src/cli.ts::runPlan`; add `src/enrollment-plan.test.ts` invoking the real Dash entrypoint and direct fleet entrypoint against matching synthetic fixtures. Assert byte-identical plans, digest and summary; input bytes unchanged; no authority DB/directory and zero external mutation canaries. Preserve complete-observation, exact target, unresolved-identity, malformed digest and lab-production refusals through Dash. R5: inject mutation dispatch and bypass enrollment/lab guard one at a time; watch the appropriate production-entrypoint assertion fail before restoring. Reuse existing fleet fixture builders where public; do not import executing test suites or copy the planner.
- [ ] 1.3 Red then green: prove required fleet/observation absence, unreadability and malformed syntax separately through the real entrypoint; run unreadability under a non-privileged process when needed. Existing output bytes must survive; unwritable output must fail without success text. R5: replace exclusive output creation with overwrite and separately suppress required-read failure; watch occupied-output and required-state assertions fail. Restore before normal rerun and record faults beside the production guard, keeping existing fleet proofs intact. No real credentials, host inventory or account identifiers enter fixtures.

## 2. Acceptance and follow-up boundary

- [ ] 2.1 Add CLI README usage and ownership links: plan creation alone authorizes no apply; existing fleet apply/runbook remains separate. Run `bunx nx run-many -t test lint typecheck build -p twilight-dash --skip-nx-cache`, relevant tool-fleet plan/CLI regressions, scoped Prettier and OpenSpec validation. Confirm the Nx project is discovered and its tests run; no vacuous target. Astra reviews exact wrapper scope, byte equivalence, runtime mutation canaries and R5 fault evidence. Record actual commands and proof table in verify.md after apply, without marking later authority relocation complete.
- [ ] 2.2 Commit the reviewed implementation, run `bin/h2puni-gate.sh <exact-sha>` under the canonical heavy lock, and require exact-head CI before coordinator integration. No host operation, authority bootstrap or cutover is part of these checks.

The first execution packet is 1.1–1.3 plus its acceptance, owned by Sol medium;
Astra high owns review. Tests can use Bun directly for focused files, and Nx
for project acceptance. Existing fleet project test execution uses
`bun test --preload ../test/scratch/preload.ts --timeout=30000` from
`tools/tool-fleet`; preserve its scratch isolation when choosing focused files.

Later 080.19 work requires a new bounded delta after actual authority/caller
inventory. It must not be added opportunistically to these checkboxes. Its
mandatory proofs include interrupted publication before/after Git ref movement,
missing versus unreadable adoption state, overlapping worktree claims, old-writer
fencing, lost-response reconciliation and rollback preserving accepted identities.
