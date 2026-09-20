# Verification Report

**Change**: `backend-startup-ownership`
**Verified at**: `2026-09-20`
**Verifier**: Codex executors for attempts A-E, with separately identified planner results

## Evidence provenance

Historical results below come from the seeded reports and evidence for these attempts:

- Slice A: `020-7-backend-startup.A.20260920T144350Z`
- Slice B: `020-7-backend-startup.B.20260920T155029Z`
- Slice C: `020-7-backend-startup.C.20260920T160057Z`
- Slice D: `020-7-backend-startup.D.20260920T161533Z`
- Slice E: `020-7-backend-startup.E.20260920T162908Z`

Evidence is referenced by basename and attempt identifier. Planner observations come only from
`planner-notes.md`; they are not attributed to an executor.

## Results

### Slice A — open the OpenSpec change

Executor attempt `020-7-backend-startup.A.20260920T144350Z`:

- `git rev-parse HEAD`: exit 0; `1280a7341d74ff7e499f217e3708033bbce543cf`.
- `git status --short --untracked-files=all`: exit 0; no output before edits.
- Slice prerequisite grep for the `DiBag` import: printed `0` and exited 1, as expected.
- Baseline `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`:
  exit 0; 15 pass, 0 fail.
- Baseline strict OpenSpec validation: exit 0; 103 passed, 0 failed
  (`openspec-validation.baseline.vMKzQ9.json`).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change
backend-startup-ownership --schema sdd-lean`: exit 0; the change was created. The metadata grep
  exited 0 and printed `1:schema: sdd-lean`.
- A6 strict OpenSpec validation: exit 1; 103 passed, 1 failed. Each of the five requirements was
  reported as `is missing requirement text` (`openspec-validation.slice-a.8y4nVp.json`). The
  executor stopped; A7 Prettier and the repository format check did not run.

Planner repair, recorded separately in `planner-notes.md`:

- Added one normative sentence beneath each requirement heading.
- Strict OpenSpec validation then reported 104 passed, 0 failed, against the 103-item baseline.
- `tool-devsync:test` reported 301 pass, 0 fail.
- The repository format check was clean.

### Slice B — pin existing behavior

Executor attempt `020-7-backend-startup.B.20260920T155029Z`:

- `git rev-parse HEAD`: exit 0; `10a43edbfce6cee4871bad3e94b74151dd4b5a29`.
- Initial `git status --short --untracked-files=all`: exit 0; no output.
- Baseline focused suite: exit 0; 15 pass, 0 fail.
- Slice prerequisite grep for the `DiBag` import: printed `0` and exited 1, as expected.
- Focused suite after the five characterization cases: exit 0; 20 pass, 0 fail.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; target succeeded
  (`slice-b-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; target succeeded
  (`slice-b-lint.log`).
- Both owned-file Prettier writes: exit 0; all three files were unchanged
  (`slice-b-prettier-write.log`, `slice-b-prettier-final.log`).
- The first format-check invocation outlived the executor yield and its session identifier was not
  preserved; its empty log did not establish an exit status. No Nx process remained. The permitted
  rerun exited 0 (`slice-b-format-check-rerun.log`), and the final post-record run also exited 0
  (`slice-b-format-check-final.log`).
- Final focused suite: exit 0; 20 pass, 0 fail, 32 assertions.
- `git diff --check`: exit 0; no diagnostics. Final status named exactly the three Slice B files.

Planner result, from `planner-notes.md`: the focused suite again reported 20 pass, 0 fail;
typecheck, lint and the format check succeeded.

### Slice C — transfer lifecycle ownership

Executor attempt `020-7-backend-startup.C.20260920T160057Z`:

- `git rev-parse HEAD`: exit 0; `e45913380a75197e08265306022cf1fc81831a8d`.
- Initial `git status --short --untracked-files=all`: exit 0; no output.
- Baseline focused suite: exit 0; 20 pass, 0 fail.
- `grep -c "^function heldPort" apps/wbs/be-01/src/boot.db.test.ts`: exit 0; printed `1`.
- Each filtered red test matched one test and exited 1 with one failure:
  - occupied-port cleanup: `Expected: 1`, `Received: 0` (`red-taken-port.log`);
  - composition cleanup: `Expected: 1`, `Received: 0` (`red-uncomposable.log`);
  - post-listener rollback: `Expected: 1`, `Received: 0` (`red-post-listener.log`);
  - optimizer cleanup refusal: expected
    `[class DiBagCleanupError extends AggregateError]`; the received rendering contained
    `optimizer refused to settle` (`red-refused-optimizer.log`);
  - source cleanup refusal: expected `[class DiBagCleanupError extends AggregateError]`; the run
    also reported `disk gone` (`red-refused-source.log`).
- Focused suite after DI Bag took ownership: exit 0; 25 pass, 0 fail.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; target succeeded
  (`typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; target succeeded (`lint.log`).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test
src/production-entrypoint.test.ts`: exit 0; 2 pass, 0 fail.
- The six-file Prettier write and two later writes of this record: exit 0; files were unchanged.
- Three post-record `NX_DAEMON=false bunx nx format:check --all` runs: exit 0
  (`format-check.log`, `format-check-after-verify.log`, `format-check-final.log`).
- Additional strict OpenSpec validation: exit 0; 104 passed, 0 failed
  (`openspec-validation.IFLcwp.json`).
- `git diff --check`: exit 0; no diagnostics. Final status named exactly the six Slice C files.

Planner result, from `planner-notes.md`: the whole `wbs-be-01` test target, typecheck and lint
succeeded after Slice C. A real be-01/gw-01/built-fe-01 stack served two Chromium cases with
`CI=1 E2E_PORT_SHIFT=2000`: 2 passed in 15.5 seconds. This was a two-case check, not the whole
frontend e2e target.

### Slice D — watch the six lifecycle faults

Executor attempt `020-7-backend-startup.D.20260920T161533Z`:

- `git rev-parse HEAD`: exit 0; `839c723e572be2ee84c9733d0873af0c1792e353`.
- Initial `git status --short --untracked-files=all`: exit 0; no output.
- Baseline focused suite: exit 0; 25 pass, 0 fail.
- Slice prerequisite grep for the `DiBag` import: exit 0; printed `1`.
- All six mutation-patch checks exited 0, establishing non-empty patches. Each mutation-focused
  test exited 1 with exactly one matching failure. Each corrected restore matched its backup with
  `cmp`, and each focused green rerun exited 0 with 1 pass, 0 fail.
- During proof 1, the first restore used a repository-relative destination from the application
  directory. `cp` and `cmp` exited 1 and the next focused test remained red with `Expected: 1`,
  `Received: 0`. The corrected `src/boot.ts` destination restored matching bytes before the green
  rerun.
- Final focused suite: exit 0; 25 pass, 0 fail.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; target succeeded
  (`slice-d-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; target succeeded
  (`slice-d-lint.log`).
- Both owned-file Prettier runs: exit 0; the final run left all three files unchanged.
- Both `NX_DAEMON=false bunx nx format:check --all` runs: exit 0
  (`slice-d-format-check.log`, `slice-d-format-check-final.log`).
- `git diff --check`: exit 0. Final status named exactly the three Slice D files; the final diff
  contained 37 insertions and 1 deletion.

Planner result, from `planner-notes.md`: replaying the partial-listener rollback fault made
`releases the source and the port when a step after the listener fails` report `Expected: true`,
`Received: false`, with 24 pass and 1 fail. The planner restored with `cmp`; the suite then
reported 25 pass.

## Negative proofs

| Proof | Injected fault                                                      | Named test                                                              | Observed failure                                                                         | Evidence in attempt `020-7-backend-startup.D.20260920T161533Z`                     |
| ----- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Registered `source` without `withDisposal` or `source.close()`      | `releases the source when the port it was given is already taken`       | `Expected: 1`, `Received: 0` source closes                                               | `proof-1-source-disposal.patch`, `proof-1-source-disposal.log`                     |
| 2     | Removed the server factory's `retention` dependency edge            | `starts the retention timer`                                            | `Expected: true`, `Received: false`                                                      | `proof-2-retention-edge.patch`, `proof-2-retention-edge.log`                       |
| 3     | Removed the pushed disposer for a partially acquired listener       | `releases the source and the port when a step after the listener fails` | `Expected: true`, `Received: false` for connection refusal                               | `proof-3-partial-listener-disposal.patch`, `proof-3-partial-listener-disposal.log` |
| 4     | Replaced the server disposer body with `await Promise.resolve()`    | `stops accepting before it closes the source it opened`                 | `Expected: true`, `Received: false` at source close                                      | `proof-4-server-disposer.patch`, `proof-4-server-disposer.log`                     |
| 5     | Swallowed the source-close refusal                                  | `refuses to report a clean stop when a release is refused`              | Expected `[class DiBagCleanupError extends AggregateError]`; `Received value: undefined` | `proof-5-swallowed-source-refusal.patch`, `proof-5-swallowed-source-refusal.log`   |
| 6     | Registered `retention` without `withDisposal` or `retention.stop()` | `releases every other resource when one release is refused`             | `Expected: false`, `Received: true` for timer activity                                   | `proof-6-retention-disposal.patch`, `proof-6-retention-disposal.log`               |

Slice A changed no check. Slice B added characterization cases that already passed. Slice C's five
red observations drove the implementation; Slice D independently falsified the six production
ownership checks and supplied the adjacent `Proof:` comments.

## Slice E — complete the record

Executor attempt `020-7-backend-startup.E.20260920T162908Z`:

- `git rev-parse HEAD`: exit 0; `0d38e0b6b0b2f5d229c5540de66e1fb028e13a3e`.
- Initial `git status --short --untracked-files=all`: exit 0; no output.
- Baseline `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`:
  exit 0; 25 pass, 0 fail, 51 assertions.
- `grep -c "^import { DiBagCleanupError } from 'di-bag';"
apps/wbs/be-01/src/boot.db.test.ts`: exit 0; printed `1`.
- Step 0 strict OpenSpec validation: exit 0; 104 passed, 0 failed
  (`openspec-validation.step0.f3sQIm.json`).
- E3 strict OpenSpec validation after consolidating the record: exit 0; the count was unchanged at
  104 passed, 0 failed (`openspec-validation.slice-e.jfVU3G.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on `tasks.md` and `verify.md`: exit 0;
  `tasks.md` was unchanged and `verify.md` was formatted.
- The first status-recording `NX_DAEMON=false bunx nx format:check --all` invocation reached the
  tool's yield boundary, left no status in `slice-e-format-check.log`, and no Nx process remained;
  it does not establish a result. The single monitored rerun exited 0 with no diagnostics
  (`slice-e-format-check-rerun.log`).
- The second owned-file Prettier write after ticking the final task: exit 0; both files were
  unchanged.
- Final strict OpenSpec validation after ticking the task: exit 0; 104 passed, 0 failed
  (`openspec-validation.final.pCXb5d.json`).
- Final monitored `NX_DAEMON=false bunx nx format:check --all`: exit 0 with no diagnostics
  (`slice-e-format-check-final.log`).

## Not verified

- The whole `NX_DAEMON=false bunx nx run wbs-be-01:test` target was not rerun against the final
  Slice D/E tree. The planner ran it successfully after Slice C; Slice D changed comments only and
  Slice E changes records only, but that is not a final-tree run.
- `NX_DAEMON=false bunx nx run wbs-be-01:build` was not run by anyone. The bundle-content checks
  for `solverSupervisorSpawner` and `/run/wbs-solver/supervisor.sock` remain pending planner
  verification.
- The whole `NX_DAEMON=false bunx nx run wbs-fe-01:e2e` target was not run. The planner ran only
  two Chromium cases after Slice C.
- The whole `tool-devsync:test` target was not rerun against the completed tree. The planner ran it
  after repairing Slice A; executor attempts cannot run it because it writes Git objects.
- `bin/h2puni-gate.sh <sha>` was not run; the host gate is unavailable on this machine.
- An `OptimizationCoordinator.start()` failure remains deferred to work item 020.9 because this
  change has no seam that can inject it.
- No independent check observed the complete listener -> optimizer -> retention -> source shutdown
  sequence, retention cleanup after startup failure, or simultaneous startup and cleanup failures
  preserving the original startup cause.
- No check here proves clean shutdown under real `docker stop`, a real-image blue/green health
  gate, or abandoned-generation reconciliation on a loaded host.

Planner, closing the lane, 2026-09-20: on the final tree the whole `wbs-be-01` test, typecheck, lint and build succeeded; `tool-devsync:test` succeeded; format check clean; OpenSpec 104 of 104. Still not run: the whole `wbs-fe-01:e2e` against this backend and `bin/h2puni-gate.sh`, which run on the batch's integration branch.
