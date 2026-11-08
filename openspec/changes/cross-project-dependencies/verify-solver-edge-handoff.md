# Solver local edge descriptor handoff prerequisite — 2026-10-23

The subsequent [installer admission packet](verify-solver-installer-admission.md) now wires this handoff into the installer. The record below describes the earlier prerequisite and its original limits.

This packet supplies a callable production child execution seam, not installer
admission. `runSolverBindingCommand`, the default runtime command runner, accepts
an explicit `edgeLock: 'inherit'` mode. The unchanged installer caller does not
request it and continues to use its existing remote CLI.

The mode verifies canonical local state readability and nonsymlink state/lock
kinds, validates the inherited descriptor against the canonical inode and flock,
and refuses every retained owner JSON/pending path. It maps the same open
description to child FD3 and pins child admission environment even when ordinary
invocation environment overrides supply forged values. It awaits the child and
leaves descriptor closure to its parent owner.

## Production-path proof

The test launches a real Bash parent holding FD8, runs the production command
runner, then starts a real Bun child using the ordinary admission helper. The
child verifies FD3, independently attempts a competing flock, and writes its
completion artifact. A separate launch artifact distinguishes parent refusal
from a child that started and then refused. The lock becomes available after
completion. No live SSH, SCP, systemd, Docker or host mutation was performed.

Initial implementation-free command behavior failed all 15 initial tests; four
additional descriptor/state cases were exercised by the watched faults below.
The original red run is retained in [red.log](evidence/solver-edge-handoff/red.log).

| Omitted production guard               | Observed fault detection                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| State-root kind                        | Symlink state admitted; 1 failed test                                                  |
| Lock kind                              | Symlink canonical lock admitted; 1 failed test                                         |
| Descriptor identity/flock verification | Foreign and independently opened descriptors reached child launch; 2 failed tests      |
| Retained-marker refusal                | Eight JSON/pending shape cases reached child launch; 8 failed tests                    |
| Required state directory read          | Execute-only 0111 state admitted; 1 failed test                                        |
| Token syntax                           | Missing/malformed tokens lost the required-descriptor refusal; 2 failed tests          |
| Descriptor integer range               | Unsafe integer reached EBADF rather than the modeled refusal; 1 failed test            |
| Child admission environment pins       | Each forged state/token override failed the real child control; 1 failure per omission |
| Explicit child FD3 mapping             | Real child lost the verified description; 1 failed test                                |

Each omission was restored. Individual logs are in
[evidence/solver-edge-handoff](evidence/solver-edge-handoff/). `Proof:` comments
name the observed fault at each production guard. Initial unreadability coverage
used mode 000, which was also refused by later marker access. The watched
omission exposed that overlap; mode 0111 now independently proves the required
state-directory read. Token tests inspect the actual `error:` line, so source
excerpts in Bun diagnostics cannot satisfy their refusal assertions.

## Verification and limits

- `bun test tools/tool-devsync/src/solver-binding-command.test.ts tools/tool-devsync/src/solver-binding-runtime.test.ts tools/tool-devsync/src/edge-admission.test.ts tools/tool-remote-scripts/src/install-solver-supervisor.test.ts tools/tool-remote-scripts/src/edge-admission.test.ts`: 77 pass, 0 fail, 241 assertions ([restored output](evidence/solver-edge-handoff/restored.log)).
- Scoped ESLint on the four changed TypeScript files: passed. The Nx module boundary rule was visibly skipped because this isolated worktree has no cached project graph; no boundary-check success is claimed.
- `bun node_modules/.bin/tsc --build --force tools/tool-devsync/tsconfig.json tools/tool-remote-scripts/tsconfig.json`: passed.
- `bun node_modules/.bin/openspec validate cross-project-dependencies --type change --json`: valid, with pre-existing long-requirement warnings; this added requirement contributes none.
- Explicit changed-file Prettier and `git diff --check`: passed.

Locked root `node_modules` is reused by symlink because of disk constraints; no
fresh frozen dependency install was run. Full Nx gates, independent review and
isolated integrated-SHA host acceptance remain unverified in this packet.

The next packet must share the local/remote supervisor install operation, wire
devsync to the verified local mode, and make the remote CLI take canonical
edge.lock. It must capture reviewed local hashes before transport, use unique
staging and verify staged/installed bytes, then retain one admission interval
through all four replacements, service changes and readiness, with explicit
partial-publication diagnostics. Those installer protections, activation,
owner publication, automatic rollback and parent Task 10.2 remain open.

## Astra P2 correction — canonical state spelling

`lstat` follows a directory symlink when its path ends in `/` or `/.`. The
local prerequisite now requires an absolute normalized spelling before any
filesystem check, also rejecting parent segments and duplicate slashes. It
returns the validated path together with the descriptor; the runner pins that
exact path into the child environment. Existing callers and installer behavior
remain unchanged; activation is still blocked.

All original 19 command tests remain. Five new real-runner negatives cover
trailing `/`, `/.`, `/..`, `//`, and a relative path under a genuine Bash-held
canonical FD8. Initial red was 19 pass / 5 fail; `/`, `/.`, `//`, and relative
state actually returned success. After the fix, all 24 command tests passed.
Removing only the spelling guard independently made the `/` and `/.` cases
fail with `Expected: not 0` (each 0 pass / 1 fail / 23 filtered out), proving
actual child-runner admission rather than a helper-only assertion. Both faults
were restored; all earlier guard proofs and logs remain retained.

Evidence: [path red](evidence/solver-edge-handoff/path-red.log),
[omitted slash](evidence/solver-edge-handoff/path-omitted-slash.log),
[omitted dot](evidence/solver-edge-handoff/path-omitted-dot.log),
[restored scope](evidence/solver-edge-handoff/path-restored.log).

- The same five-file scoped Bun test command above: 82 pass, 0 fail, 261 assertions.
- Scoped ESLint on the three changed TypeScript files: passed; module boundary
  rule visibly skipped because the isolated worktree has no cached project graph.
- Both tool project typechecks, using the same command above: passed.
- OpenSpec change validation, explicit changed-file Prettier, and diff whitespace checks: passed.

No host commands, fresh dependency install, full Nx gate, or integrated-SHA host
acceptance were run. Independent Astra rereview remains pending.
