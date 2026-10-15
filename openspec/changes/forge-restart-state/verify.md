# Forge restart state verification — 2026-10-15

Baseline: public main `2248cb41bf297872152f3e2c8cb3cae58481678b`. Isolated clone `/tmp/puni-f9-nx-recovery-sol-20261015`, branch `fix/forge-nx-container-state`.

## Failure proofs

| Check                              | Injected fault                                 | Observed test                               | Evidence                                                                                            |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Independent continuous-task launch | Baseline overlay omits private workspace state | Real installed Nx ownership fixture         | `/tmp/puni-f9-nx-red.log`: exit 1; timed out with `Waiting for fixture:serve in another nx process` |
| Effective Pod state                | Remove private setting from overlay            | Bound overlay assertion and real Nx fixture | `/tmp/puni-f9-nx-mutation.log`: exit 1; 31 pass / 2 expected failures; setting restored             |

## Commands

- `BUN_TMPDIR=/tmp/puni-f9-bun-tmp bun install --frozen-lockfile`: passed, 1573 installs across 1447 packages, no changes. Initial `/tmp` attempt reported EROFS; dedicated temporary directory succeeded.

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-devsync/src/k3s/dev-environment.test.ts`: 33 pass, 0 fail; `/tmp/puni-f9-nx-final.log`. The fixture observes shared ownership blocking, then private task launch; original database bytes and ownership row are unchanged. Three 12-second observation phases and 3-second process-group cleanup fit its 45-second test budget. Subprocess output goes to scratch files because this Bun/Node combination lost buffered console output over pipes during fixture development.
- `bunx @fission-ai/openspec@1.12.0 validate forge-restart-state --json`: passed, 1 change, no issues.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: passed, 189 changes and 18 specs, 0 failed; `/tmp/puni-f9-openspec-all.log`.
- `timeout 120s env NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false bunx nx run-many -p tool-devsync -t lint typecheck build --skip-nx-cache --parallel=2 --outputStyle=stream`: passed, all three targets and six dependency tasks, 14.8s; `/tmp/puni-f9-scoped-compile.log`.
- `timeout 600s env NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false bunx nx run-many -p tool-devsync -t test lint typecheck build --skip-nx-cache --parallel=2 --outputStyle=stream`: **incomplete**, exit 124 at the 600-second deadline; `/tmp/puni-f9-scoped-accepted.log`. The full `tool-devsync:test` target did not complete. Before cutoff, 356 passing cases were observed. At termination, `refuses persistent checkout changes between discovery and execution` failed because its supervisor exited 143 instead of yielding the expected checkout-change diagnostic. No case had failed before the deadline. The existing hung-Playwright and detached-listener timeout cases each passed after about 126 seconds. The full target remains unverified; the focused regression and the separate scoped compile checks passed.
- Scoped Prettier check and `git diff --check`: passed.

### Verification setup corrections

The first scoped run used Nx's native command runner, found fixture lint issues, and stalled without useful test output; interrupted with exit 130. Fixed all eight fixture lint issues and ran its lint check successfully. The next run exposed an unsuitable verification setting: the absolute `NX_WORKSPACE_DATA_DIRECTORY=/tmp/puni-f9-scoped-nx` was inherited by unrelated scratch-workspace tests, which overwrote the shared project graph and caused unrelated module-boundary failures. Interrupted that run (130) and reran scoped checks with normal per-workspace state, daemon/plugin isolation/native runner disabled, and streamed output. The subsequent sandbox run reached the expected socket-using tests and failed with `EPERM: operation not permitted, listen`; its index checker also refused the new, then-untracked OpenSpec paths. Staged the candidate and reran the same scoped checks with approved listener access. Neither verification setting is committed. The production directory belongs to one container and one workspace.

## Limits

This change addresses restart ownership only. The baseline's first cold container OOMKilled at 2Gi remains unresolved; original live evidence is `/tmp/puni-f9-acceptance-20261015/REPORT.md`. No cold OOM fix, full F9 pass or h2puni gate is claimed. Disposable runtime recovery acceptance is scheduled against this exact committed candidate with evidence kept outside the checkout. Broad host gates are not run; the full tool-devsync test target remains unverified after its bounded timeout.
