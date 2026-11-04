# Solver runtime admission prerequisite — 2026-10-23

Scope: bounded Task 10.2-S1/S2/O4 source prerequisite under ADR 0063. The actual
service/manual executable takes canonical `<edge state>/solver-runtime.lock`
before config read, orphan sweep or bind, then retains its callback after listener
readiness until process termination. It never takes edge.lock. The owner seam
holds the same lock through a structured callback, checks live owner authority on
entry/exit and includes that descriptor in every existing owner boundary check.
Mapping preflight remains read-only under markers and runtime occupancy.

## Acceptance

`bun test tools/tool-remote-scripts/src/lib/solver-runtime-admission.test.ts tools/tool-remote-scripts/src/solver-runtime-admission.proc.test.ts tools/tool-remote-scripts/src/solver-supervisor.test.ts tools/tool-remote-scripts/src/lib/edge-ownership.test.ts tools/tool-remote-scripts/src/solver-supervisor-install-operation.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000`

**94 pass, 0 fail**, 508 assertions across five files. [Fresh output](evidence/solver-runtime-admission/focused-green.log.txt).
The child CLI checks cover both retained markers before a missing config is read,
manual launch under runtime occupancy, edge-held readiness, SIGTERM/SIGKILL
kernel release, and the actual orphan-sweep startup paused while an owner publishes
its fence. No protected sentinel appears until the prior process exits; subsequent
owner interruption retains the pending marker. Library checks separately exercise
absent and unreadable state, alias state, symlink lock evidence, expired owners,
changed retained bytes and replaced runtime inode. Existing installer tests retain
all four replacements, readbacks, service operations and readiness inside edge admission.

The source child readiness/race cases use **test-only preload transport substitution**:
call the real production config decoder first, then substitute only the Unix socket
path into scratch storage. Actual CLI/admission/runtime/orphan sweep/listener code
runs unchanged with a fake Docker executable at PATH. Separate unmodified source
and newly built installed-bundle subprocesses prove pre-config marker/occupancy
refusal and read-only mapping preflight with the real decoder. These are hermetic
source/artifact proofs, not a real installed-runtime or host authority proof.
Unix socket binds are denied by the default sandbox; the final hermetic /tmp socket
run was authorized with escalation. No host service or production store was used.

## Watched production omissions

Each injected production fault below exited **1**; all original files were restored.
The [mutation driver](evidence/solver-runtime-admission/mutations.py.txt) and individual
logs retain commands and observations.

| Fault                                            | Observed failed acceptance                                     |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Remove normalized state spelling guard           | Alias reaches runtime callback                                 |
| Remove state directory enumeration               | Execute/write-only state reaches callback                      |
| Change runtime lock to another path              | Ready CLI loses expected contention                            |
| Substitute legacy lock acquisition               | Foreign symlink evidence is no longer refused                  |
| Remove retained marker admission                 | Both actual CLIs read missing config instead of refusing owner |
| Change owner runtime lock to another path        | Protected work enters during paused actual startup             |
| Remove entry owner checks                        | Changed pending bytes allow protected callback                 |
| Omit runtime descriptor from checked owner locks | Replaced runtime inode passes owner boundary                   |
| Remove callback completion owner check           | Changed marker returns successful completion                   |
| Remove post-readiness lifetime wait              | Ready CLI no longer holds runtime lock (both signals)          |

## Focused tooling

- `NX_DAEMON=false bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`: passed. [Output](evidence/solver-runtime-admission/typecheck.log.txt).
- `NX_DAEMON=false bunx nx run tool-remote-scripts:lint --skip-nx-cache`: passed. [Output](evidence/solver-runtime-admission/lint.log.txt).
- `NX_DAEMON=false bunx nx run tool-remote-scripts:build --skip-nx-cache`: passed with three dependencies. [Output](evidence/solver-runtime-admission/build.log.txt).
- `bun node_modules/@fission-ai/openspec/bin/openspec.js validate cross-project-dependencies --json`: valid with existing long-requirement warnings. [Output](evidence/solver-runtime-admission/openspec.log.txt).
- Changed-file Prettier and `git diff --check`: passed before commit.

Nx reported denied plugin-worker sockets and ran plugins in the main process.
No required check was skipped because of that fallback. An initial fixture build
option failed typecheck and a redundant test conditional failed lint; both were
corrected before the retained passing checks.

## Limits

S1/S2/O4 and parent 10.2 remain open. A pre-existing unguarded supervisor can still
run without this lock. This packet neither inventories/stops/drains those processes
nor proves managed attempts terminal, effective systemd/manual restart authority,
continuous full participant exclusion, compatible restoration, storage activation,
or a writable activation CLI. The owner callback must contain all protected work;
returning it relinquishes runtime exclusion. SIGTERM/SIGKILL release only this
process descriptor, not proof that existing managed solver attempts are terminal.
Independent review and exact-SHA canonical h2/h4 host gate remain required and
were not run by this implementation packet. No h1 tests or live host mutations.
