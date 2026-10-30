# Workspace allowance repair implementation plan

Intent and acceptance: [proposal](proposal.md), [delta](specs/ci-gate/spec.md), [verification](verify.md). This is the reversible CI blocker repair authorized by the user's instruction to fix and merge changes that are easily undone. The R2 architectural branch remains held. Root controller owns publication, CI/canonical gates, WBS and final acceptance.

## Global constraints

- Work only in /home/df/.codex/worktrees/b8c9/puni-00 on fix/ci-workspace-budget-120-20261030, based on4fec7f2ba93876ccb749f6a78b072945cee7813c. Preserve other plan scratch directories.
- Change only workspace scheduling allowance90→120 and its existing policy assertion90→120. Preserve Twilight75, all other jobs/commands/conditions/required verdicts, pins, parallelism, activation and application source.
- Earlier sections of tasks/verify describe historical60/90 repairs; preserve their evidence and label historical50-minute Twilight references clearly. Current base is75. Never claim those old incomplete runs passed.
- Bun/Nx only. No new mirrored tests or full local Nx/browser/Burokrat target. Use the existing focused policy test with actual scratch preload, then local scoped static/format/OpenSpec checks. Hosted CI and canonical full gate remain required.
- Every process observation awaits actual exit and both independent streams. Preserve failing attempts, exact source restoration and unknown/skipped checks. No --no-verify, force/admin merge, test weakening, production deployment, new branches or subagents by implementer.

### Task 1: Repair the finite allowance and its production policy assertion

**Owned paths:** .github/workflows/ci.yml; apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts; this change's tasks.md and verify.md (new repair sections/local evidence only). The controller's proposal.md/spec delta/repair-tasks.md and SDD ledger are not worker-owned. No unrelated file change.

**Binding values and workflow:** workspace timeout120; Twilight remains75; only gate_workspace scheduling value changes semantically. Explain the observed90-minute failures next to that timeout, keeping prior evidence history. Do not alter any check command, input selection, status propagation, other timeout or token/auth handling. No ADR or domain glossary change is needed for this reversible scheduling parameter.

**Existing test:** CI gives the complete uncached gate its chosen finite allowance, in gate-entrypoints.test.ts. Baseline on clean4fec already passed1/0/2expectations/57filtered; raw logs /tmp/puni-ci-budget-baseline-20261030.{stdout,stderr}. Bun1.4.4 frozen install completed with no dependency changes; /tmp/puni-ci-budget-install-20261030.{stdout,stderr}. Do not repeat baseline solely for cosmetics.

1. Read LLM_README.md first, AGENTS.md, the bounded workflow job/selected policy test, and these exact spec/proposal requirements. Capture BASE before edits. Outside-workspace writes/commands may need require_escalated; use targeted Bun file writes and normal Git commands with the authorized CI-worktree justification, never Python/standalone Node.
2. Update only the existing workspace assertion to120 while production workflow remains90. Run:

`bun --no-env-file test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts --test-name-pattern 'CI gives the complete uncached gate its chosen finite allowance' --timeout=60000`

Observe genuine RED Expected120/Received90. Preserve command, exit, full raw streams and current production-workflow hash. This is the new policy check observing its obsolete production dependency; no import/configuration error earns proof credit. 3. Set only gate_workspace timeout to120 and update its adjacent rationale/evidence link. Run the same focused command GREEN; both workspace120 and Twilight75 assertions must execute. Add an adjacent truthful Proof comment naming the obsolete90 value and observed case. No new test suite or fake workflow fixture. Do not launch healthy checks concurrently with source fault edits. 4. Parse old base and current YAML with the installed YAML parser. Compare complete parsed objects after changing only the old workspace value to120: require exact equality. This proves all other commands/conditions/values stay unchanged; unknown/malformed/missing values throw. Record actual comparison, not a claim from exit alone. 5. Run scoped actual ESLint on the changed test, exact-path Prettier, scoped OpenSpec validation and git diff --check; report any skipped boundary rule/warning. No full healthy suite repetition. Keep past verify.md content intact and append new commands/results plus both cancelled hosted attempts. Add a current tasks.md section linked to this repair plan; do not check controller-owned hosted/canonical acceptance complete. 6. Self-review exact owned diff, check no transient mutation or dependency changes remain, and commit normal hooks with only owned paths. No push/PR/merge/deploy; controller does that after review. Write full report including RED/GREEN, parsed-workflow comparison, commands, exits, stream paths/hashes, source hashes, source restoration if any, hooks, changed files and limitations. Return DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED, commits, one-line checks and report path only.

**Hosted facts to retain:** run40959508633 attempt1 workspace123748477125 cancelled in solver smoke after its Nx step passed; attempt2 workspace124066899303 cancelled in lint after the test/typecheck/build subphase passed80m32s. Both actual annotations say maximum execution1h30m0s. Attempt2 aggregate124109679034 failed. No third retry. Full logs/artifacts are /tmp/puni-r2-ci-workspace-40959508633-attempt{1,2}.log and /tmp/puni-ci-workspace-duration-20261030-9b061932-099e-461d-92a4-738d092a7a2e/{attempt1,attempt2}/nx-gate.log; derived analysis.json separates phase summaries from expected diagnostic logs. Full source pin for those runs isb3b594dab4f0153d2ef00a2989bbeb02ea0cbbda; do not relabel it as this CI branch.

### Task 2: Controller review and hosted release acceptance

- [ ] Inspect full Task1 report and exact base..head review package; task review plus final whole-branch review; resolve findings through scoped fixes.
- [ ] Publish a CI-only PR and run exact-head required hosted CI plus canonical gate from a clean isolated h2/h4 tree under its heavy lock. Inspect actual printed SHA and all outcomes; no bare full Nx on hosts.
- [ ] Merge only the reversible CI repair after required evidence is green; track actual main CI. R2 architecture/main and production holds remain separate.
- [ ] Record all rulings/costs and final evidence, preserve raw artifacts before any scratch cleanup, update WBS. Then integrate the merged budget contract into the separate R2 branch and obtain its own required combined-source gate/CI.
