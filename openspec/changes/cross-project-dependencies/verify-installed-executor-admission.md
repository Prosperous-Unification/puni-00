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

- `bun test tools/tool-remote-scripts/src/install-admission.test.ts tools/tool-remote-scripts/src/install.test.ts tools/tool-remote-scripts/src/install-solver-supervisor.test.ts`: 48 passed, zero failed, 171 assertions.
- Scoped ESLint on the three changed TypeScript files: passed. Nx module-boundary checks were visibly skipped because this isolated tree has no cached project graph; no boundary-check success is claimed.
- `bun node_modules/.bin/tsc --build --force tools/tool-remote-scripts/tsconfig.json`: passed using the locked TypeScript native 7.0.2 compiler, with emitted installer output confirmed. An initial direct `node_modules/typescript/bin/tsc` attempt failed because that legacy path is absent; the repository's actual `.bin/tsc` entrypoint was then used.
- `openspec validate cross-project-dependencies --type change --json`: valid. Strict mode fails on pre-existing long-requirement warnings in this change; the added requirement contributes no warning.
- Explicit Prettier check and `git diff --check`: passed.

Full Nx/Docker acceptance, installed-byte verification, independent review and an
isolated integrated-SHA host gate remain unverified. Disk constraints kept this
packet to focused checks. Renames remain individually atomic; a transport loss or
failed publication can leave staging or a partial installation. No automatic
rollback or pairwise atomicity is asserted.

## Review correction: canonical state and lock kinds

Independent review reproduced two source bypasses: `set -e` did not terminate
when the first predicate of the lock's AND-list failed, allowing a directory lock;
and GNU find did not traverse a command-line state-directory symlink, hiding a
retained marker even while lock opening followed that symlink.

The installer now requires the regular-file and no-symlink lock predicates as
standalone commands, and explicitly rejects a symlink or non-directory canonical
state root. The exact durable recovery recipe rejects that state root too.
Directory and nonblocking-open FIFO fixtures reproduce publication through the
old guard; symlink and unreadable lock negatives retain their distinct coverage.
Both marker names are exercised behind a symlinked state root through the real
installer CLI and exact documented SSH recipe.

Before correction, six added tests failed. After correction, omitting the regular
file predicate failed directory and FIFO negatives (2 failures); omitting the lock
symlink predicate failed its CLI negative (1); omitting the installer's state-root
guard failed both marker negatives (2); omitting the recovery recipe's state-root
guard made both exact SSH commands reach interpreter setup rather than reject
state (2). Recipe extraction uses a stable section/SSH boundary, so omission
negatives execute the changed command instead of failing source lookup.
All guards were restored before the 48-test control run. Scoped lint/typecheck,
normal OpenSpec validation, explicit formatting and diff checks were repeated.

Exact mutation selectors (each run after changing only the named guard, followed
by restoration):

| Guard omitted                      | Command                                                                                                  | Observed outcome                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Regular-file lock predicate        | `bun test tools/tool-remote-scripts/src/install-admission.test.ts -t 'canonical lock refuses'`           | 2 failed (directory/FIFO), 3 passed                                              |
| Symlink-lock predicate             | `bun test tools/tool-remote-scripts/src/install-admission.test.ts -t 'symlink canonical lock'`           | 1 failed                                                                         |
| Installer state-root refusal       | `bun test tools/tool-remote-scripts/src/install-admission.test.ts -t 'symlink canonical state'`          | 2 failed                                                                         |
| Recovery recipe state-root refusal | `bun test tools/tool-remote-scripts/src/install-admission.test.ts -t 'durable recovery rejects symlink'` | 2 failed, with actual interpreter-file read observed after the omitted admission |

The restored focused command is the same three-file test command listed above:
48 passed, zero failed, 171 assertions. Typecheck and scoped ESLint passed again;
Nx module-boundary checking remains skipped without its cached graph. Normal
OpenSpec JSON validation remains valid; pre-existing strict-mode warnings remain.
No host gate, live install, activation or prior-holder audit was performed.

Independent Astra rereview approved the corrected bounded packet after
reproducing both original admission bypasses and inspecting the restored
generated-shell and exact-recipe negatives. This is source admission only;
installed writer adoption and process drain remain unverified.
