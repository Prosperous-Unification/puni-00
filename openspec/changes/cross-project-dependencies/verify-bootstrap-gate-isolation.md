# Bootstrap gate fixture isolation — 2026-10-23

The Caddy merge reachability fixture set `WBS_ROOT` but omitted
`WBS_EDGE_STATE`. `configure.sh` defaults the latter independently to
`/home/puni1/wbs/state` before reaching the merge. Concurrent environment-product
cells therefore shared the host admission lock, explaining h4's reported status
75 instead of the intentional htpasswd stop at 7. This source trace established
the escaped path without executing an unisolated fixture.

The fixture now pins `WBS_EDGE_STATE` beneath its own scratch root and declares
that limitation in `PINNED_BY_CONSTRUCTION`. Existing closed-environment and
override guards cover the pin. Production admission is unchanged; the complete
128-cell environment product and conditional-disconnection mutations remain.
This restores test isolation and does not change the production contract.

The new acceptance test holds a real scratch `flock`: the corresponding fixture
refuses with 75 before writing site.caddy, while an independent fixture reaches
7 and writes the owned imports. The holder uses bounded convergence and is
released before fixture cleanup. No successful flock stub is introduced.

Observed negatives:

- Before adding the pin, the focused acceptance failed with expected
  `<fixture-root>/state`, received `undefined`, before any shell execution.
- Temporarily removing only configure.sh's admission `flock` made that acceptance
  fail with expected status 75, received 7. The production source was restored.

Validation ran in `/tmp/puni-bootstrap-gate-isolation`, based on
`36f7871e463e18f64900b883c2fdc7ab6d49345e`, using the existing workspace
node_modules through an untracked symlink:

| Command                                                                                                     | Observed outcome                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-bootstrap/src/configure-caddy-merge.test.ts` | 43 passed, 0 failed; all three environment-product sweeps passed                               |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-bootstrap:test --skip-nx-cache`                  | 65 passed, 0 failed across four files; configured scratch preload and 10-second target timeout |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-bootstrap:lint --skip-nx-cache`                  | Passed                                                                                         |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-bootstrap:typecheck --skip-nx-cache`             | Passed                                                                                         |

Initial default Nx invocations printed sandbox socket denials and exited zero
without running targets; those exits were rejected as evidence. The explicit
daemon/plugin settings above produced target command output and success banners.
An initial acceptance implementation using child stdin hit a sandbox pipe-write
EPERM; the final fixture uses a scratch release file and passed in the sandbox.
Lint initially found two shorthand void callbacks; braces corrected both.

The isolated worktree shares already-installed dependencies; a fresh frozen
install was not performed. No live host operations, deployment, h2/h4 full gate,
or production Caddy proof was performed in this scope. Those remain integration
checks for the combined commit.
