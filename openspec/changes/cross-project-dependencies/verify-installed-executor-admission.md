# Bounded installed executor replacement admission — 2026-10-23

This packet changes installer source and the durable recovery recipe. No real
SSH/SCP call, host replacement, owner publication, route mutation, activation or
prior-holder drain occurred. Parent tasks 10.1/10.2 remain open.

The real installer CLI executes local SSH/SCP substitutes that run the generated
remote shell against isolated filesystem state. The canonical production path is
translated only by the test transport. Actual flock and SHA-256 utilities are
used. The replacement and installed-readback substitutes independently attempt
canonical lock acquisition and refuse if publication escaped the lock. These are
local production-shell proofs, not installed-host adoption evidence.

## Watched faults

| Injected fault                                                               | Observed failure                                                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Remove existing-lock requirement and change descriptor open to creating mode | Missing-lock negative failed: both original files replaced                                               |
| Omit remote `flock`                                                          | Successful-install control failed; replacement substitute independently acquired edge.lock and refused   |
| Omit retained-marker refusal                                                 | Eight JSON/pending negatives failed, covering malformed, unreadable, directory and dangling marker paths |
| Omit staged checksum validation                                              | Corrupted-SCP negative failed; installed originals no longer preserved                                   |
| Omit installed checksum readback                                             | Post-rename corruption negative failed: installer reported success                                       |
| Reuse a fixed attempt identity                                               | Second real CLI invocation reused staging paths; uniqueness assertion failed                             |
| Remove recovery recipe marker guard                                          | Both exact documented SSH-command negatives reached interpreter setup rather than owner admission        |

Each fault was restored. Adjacent `Proof:` comments name the production guards.
The initial focused suite also failed before implementation (12 failures after
correcting the transport fixture's path translation). Restored controls cover
missing/unreadable canonical state, real contention and subsequent release,
partial second rename, installed corruption, and both successful replacements.

## Verification

- `bun test tools/tool-remote-scripts/src/install-admission.test.ts tools/tool-remote-scripts/src/install.test.ts tools/tool-remote-scripts/src/install-solver-supervisor.test.ts`: 40 passed, zero failed, 138 assertions.
- Scoped ESLint on the three changed TypeScript files: passed. Nx module-boundary checks were visibly skipped because this isolated tree has no cached project graph; no boundary-check success is claimed.
- `bun node_modules/.bin/tsc --build --force tools/tool-remote-scripts/tsconfig.json`: passed using the locked TypeScript native 7.0.2 compiler, with emitted installer output confirmed. An initial direct `node_modules/typescript/bin/tsc` attempt failed because that legacy path is absent; the repository's actual `.bin/tsc` entrypoint was then used.
- `openspec validate cross-project-dependencies --type change --json`: valid. Strict mode fails on pre-existing long-requirement warnings in this change; the added requirement contributes no warning.
- Explicit Prettier check and `git diff --check`: passed.

Full Nx/Docker acceptance, installed-byte verification, independent review and an
isolated integrated-SHA host gate remain unverified. Disk constraints kept this
packet to focused checks. Renames remain individually atomic; a transport loss or
failed publication can leave staging or a partial installation. No automatic
rollback or pairwise atomicity is asserted.
