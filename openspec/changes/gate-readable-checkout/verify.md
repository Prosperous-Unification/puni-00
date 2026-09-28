# Verification Report

**Change**: `gate-readable-checkout`
**Verified at**: `2026-09-28`
**Verifier**: `batch-9 lane solver-smoke-h2puni`

## 1. Root cause on h2puni

- The orphan images built at 00:35Z, 01:19Z and 02:03Z (`b8c82445fa64`, `95d3bdc59ccd`, `fc0eb5ef320b`) all fail the orphan proof deterministically when rerun at 02:50Z; the caller log reads `Cannot find module '@wbs/contracts/solver/supervisor-protocol'`. `tsconfig.base.json` is 0600 in each.
- The 21:32Z image `b136e1d037a5` and the 02:47Z image `990a6e55aaff` resolve the module as uid 1000; their `tsconfig.base.json` is 0644. Run as root, the failing images resolve too.
- Three runs of the proof against `990a6e55aaff` passed at 02:49Z (9.8 s each).

## 2. Tests

- `env -u CLAUDECODE bash bin/h2puni-gate.test.sh` — `all cases passed`.
- `shellcheck bin/*.sh` — the same two info findings (SC1091, SC2016) as `origin/main`, exit 1 on both.

## 3. R5 proofs (each fault injected into `bin/h2puni-gate-lib.sh`, then restored)

| Fault                                             | Observed                                        |
| ------------------------------------------------- | ----------------------------------------------- |
| `umask 022` removed                               | case 37: exit 66, listing empty                 |
| file scan removed                                 | case 38: exit 0, steps ran over the 0600 file   |
| directory scan removed                            | case 38: exit 0 over the 0700 directory         |
| both scans in one substitution, file scan failing | case 39: exit 0, steps ran, branch not restored |
| repair branch removed                             | case 40: exit 66                                |

## 4. Not run

macOS execution of the payload; the canonical h2puni gate on this change (left to the integration round).
