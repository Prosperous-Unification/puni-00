# Verification

## Candidate scope

Isolated clone `/tmp/puni-pr-merge-base`, branch `ci-pr-merge-base`, based on public `origin/main` `8466b57d7` fetched from GitHub on 2026-10-14. No shared root checkout edits and no push. Architect review and hosted integration remain pending.

## Commands and observed results

- `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/bun-pr-base-cache bun install --frozen-lockfile`: exit 0, 1573 installs checked across 1447 packages. The initial default-temp attempt failed with EROFS and was rerun with writable paths.
- TDD: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-git-hooks/src/hooks/pr-merge-base.test.ts`: initial 20 pass / 5 fail. Missing resolver failed the positive CLI case; existing corpus, gate and browser used the stale ancestor; workspace accepted the stale GATE_BASE. After implementation: 25 pass / 0 fail. Extended final resolver/production-step suite: 32 pass / 0 fail.
- Focused suite: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-git-hooks/src/hooks/{pr-merge-base,corpus-version-base,corpus-lint-workflow,pixels-workflow,gate-workflow}.test.ts tools/tool-devsync/src/toolchain-pins.test.ts`: exit 0, 78 pass / 0 fail, 288 assertions across six files. Includes the required gate/pixels aggregates and unchanged non-PR corpus paths.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p tool-git-hooks,tool-devsync --skip-nx-cache --output-style=stream`: exit 0, all four targets successful. The first command without those environment controls printed socket denials and ran no targets; its exit 0 is not validation evidence. Intermediate lint failures were corrected; checks during mutation were discarded and rerun after restoring sources.
- Scoped `bunx prettier --check` on every changed file: exit 0, all matched files formatted.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 190/190 valid (172 changes, 18 main specs); independent `ci-pr-merge-base` capability has no archive warnings. The existing affected-pr-gate delta was also corrected to remove its explicit payload-base rule.

## R5 injected production faults

Each mutation edited the actual resolver, corpus selector or workflow, ran the real-history production-path suite, observed the named negative or boundary oracle fail, then restored the original source. The first 16 mutations ran against the 30-case suite; later mutations ran against 32 cases. Corrupt-object fixtures initially attempted to overwrite Git's read-only loose objects; corrected by replacing the object file before the recorded mutation run.

| Injected fault                                             | Observed suite result (exit 1) |
| ---------------------------------------------------------- | ------------------------------ |
| event guard                                                | 28 pass / 2 fail               |
| SHA guard                                                  | 29 pass / 1 fail               |
| head SHA guard                                             | 29 pass / 1 fail               |
| number guard                                               | 27 pass / 3 fail               |
| ref guard                                                  | 29 pass / 1 fail               |
| ref identity                                               | 29 pass / 1 fail               |
| checkout identity                                          | 29 pass / 1 fail               |
| topology                                                   | 29 pass / 1 fail               |
| head identity                                              | 26 pass / 4 fail               |
| readable parents                                           | 26 pass / 4 fail               |
| old corpus selection                                       | 29 pass / 1 fail               |
| old gate scope                                             | 29 pass / 1 fail               |
| old pixels scope                                           | 29 pass / 1 fail               |
| workspace comparison                                       | 29 pass / 1 fail               |
| swallowed gate failure                                     | 29 pass / 1 fail               |
| swallowed pixels failure                                   | 29 pass / 1 fail               |
| Suppress Git nonzero status                                | 28 pass / 4 fail               |
| Enable local Git replacement objects                       | 31 pass / 1 fail               |
| Swallow workspace resolver failure with received GATE_BASE | 31 pass / 1 fail               |

Missing and corrupt parent objects are separate real Git faults for each parent. Missing merge objects fail without stdout. CLI failures assert nonzero status and empty stdout. Identity cases include missing/malformed SHA, missing/malformed PR number, wrong ref kind/number, wrong checkout, wrong payload head, and root/linear/octopus topology. The first-parent positive stays fixed while `origin/main` moves among three commits. Consumer tests record the exact base sent to Nx, require no Nx calls on resolution failure, and verify no successful scope outputs on such failures.

## Integration limits

No hosted PR run, main push, merge-group run or docs-only skip run was initiated: this candidate is intentionally unpushed pending Astra review. The 19-versus-43 incident numbers are supplied diagnosis, not a new measurement on this candidate. Tests exercise actual Git and production workflow shell with Nx and annotations stubbed; they do not prove runner scheduling, full Nx build results or hosted duration. The canonical h2puni gate was not run in this worker; it remains required on the reviewed candidate SHA before final integration claims. No raw full Nx gate was run.
