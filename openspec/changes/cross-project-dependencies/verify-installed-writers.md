# Installed-writer file inventory prerequisite

Local packet at base `e28ccc53a`, isolated `/tmp/puni-installed-writers`,
2026-10-23. No live host calls, installation, process control, activation or
host-wide authority claim. Parent tasks 10.1/10.2 remain open.

## Scope and trust

The reviewed manifest is an explicitly supplied independent expectation, not
populated from installed discovery. It declares source/build commits, build ID,
per-role reviewed artifact digest and source/build classification, claimed host
location and distinct local reviewed/captured paths. The CLI binds exact manifest
bytes; the library also binds normalized fields. This is not cryptographic
attestation that an artifact was produced by a commit: review provenance and
capture freshness/host attribution remain external, explicit unknowns.

Fixed required slots cover prod/dev swap+smoke, durable dev poller/helper and
interpreter, declared manual/bootstrap/configure copies and captured launch/restart
configuration bytes. None establishes effective loaded authority. The report
always blocks activation and calls out unsupported solver supervisor
runtime/bundle/config/systemd/installer admission. It has no participant proof,
adoption receipt, owner marker publisher or process killer.

## Commands and observed results

- `bun test tools/tool-remote-scripts/src/lib/installed-writers.test.ts`: **35 pass,
  0 fail, 69 assertions**. Includes actual CLI success and member/environment,
  digest/interpreter substitution, accidental activation field, malformed identity,
  absent/unreadable capture, duplicate/alias/normalized alias/host alias/traversal/symlink/provenance/host path/
  version faults, plus deterministic between-pass content, same-byte inode and
  manifest drift. Drift preload changes real files after the first complete pass;
  it does not replace the observer or its comparisons.
- Initial stub: **11 fail, 2 pass**, missing implementation. The inode-replacement
  addition was independently watched red (**31 pass, 1 fail**) before adding
  observed path identity retention. Normalized capture aliases and duplicate declared host paths were watched red (**33 pass, 2 fail**) before closing those boundaries.
- `NX_DAEMON=false bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`:
  **exit 0**, scoped target passed.
- `NX_DAEMON=false bunx nx run tool-remote-scripts:lint --skip-nx-cache`:
  **exit 0**, scoped target passed. Nx fell back to in-process plugins because
  sandbox worker sockets were denied; no module-boundary warning in this run.
- `bunx --no-install openspec validate cross-project-dependencies --json`:
  **exit 0**, one valid change; pre-existing long-requirement warnings remain.
- `NX_DAEMON=false bunx nx run tool-remote-scripts:inspect-installed-writers --args='<fixture-manifest> <fixture-root>'`: **exit 0**, real Nx CLI path emitted blocked local capture inventory (synthetic reviewed expectations only).
- Changed-file Prettier and `git diff --check`: passed before commit.

The full direct remote-scripts unit invocation was also attempted:
`bun test src --preload ../test/scratch/preload.ts --timeout=10000` from
`tools/tool-remote-scripts`. Existing swap CLI tests encounter the canonical
`/home/puni1/wbs/state/edge.lock` ENOENT refusal before their expected invocation
validation messages. This packet does not alter swap or those tests. Observed exit 1: **1434 pass, 2 skip, 37 fail, 8181 assertions**, 1473 tests across 60 files in 223.49 seconds. Failures include the inherited backend/gateway/participant/activation invocation expectations, installed source/built recovery dispatch expectations, and installed-solver client/Unix-socket/peer-credential tests under the restricted local sandbox. This is not a clean configured project gate; the new focused tests pass separately. No broad rerun is claimed.

## Watched R5 production mutations

Each mutation was applied separately to production source, the actual focused
suite rerun and an assertion failure observed; the source was restored immediately.
Mutation procedure: delete only the indicated guard call (not its dependent IO)
or make the named literal/bypass change, run the focused Bun suite, then restore.

| Mutation                                                     | Observed failing production-path test                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Delete exact required-membership guard                       | omitted required prod-swap; actual CLI member/environment faults |
| Delete reviewed/captured digest equality                     | reviewed-byte mismatch; actual CLI hash fault                    |
| Bypass digest comparison only for dev-interpreter            | interpreter substitution, including actual CLI                   |
| Delete second-pass byte comparison                           | injected second-pass observation change                          |
| Delete closed-field comparison                               | accidental activation manifest field, including actual CLI       |
| Change activation literal to allowed                         | library and real CLI blocked-output assertions                   |
| Delete unique capture-path guard                             | real CLI same-byte reviewed/installed alias                      |
| Delete source/build/version identity guard                   | malformed source identity and real CLI version fault             |
| Delete relative path guard                                   | real CLI traversal resolving to unchanged bytes                  |
| Delete canonical/no-parent-symlink guard                     | real CLI same-byte capture through symlink parent                |
| Delete digest shape guard                                    | real CLI invalid digest diagnostic                               |
| Delete source/build origin guard                             | real CLI invented provenance                                     |
| Delete absolute declared host-path guard                     | real CLI relative host location                                  |
| Delete retained dev/inode/size/time/mode identity comparison | real CLI identical-byte inode replacement                        |
| Delete CLI manifest readback comparison                      | real CLI manifest changed after first complete pass              |

## Unverified obligations

No full h2/h4 exact-SHA gate, live installed inventory, effective cron/systemd/
Docker authority discovery, solver runtime admission, host process/manual-controller
census, prior-holder drain or continuous exclusion was performed. Positive local
captures prove only equality of supplied files. No complete Task 10.2, deployment
or activation readiness is claimed. Independent Astra review is pending.

## Independent-review corrections after c15a23e1a

Four reviewed counterexamples were reproduced through the real CLI before fixing:

- A comma-packed `prod-smoke,prod-swap` name with the prod-swap record/files omitted
  emitted an 11-member report. Membership now checks exact cardinality, distinct
  names and membership in the fixed name set. Closed record fields also compare
  exact keys rather than delimiter-joined strings.
- Distinct reviewed/capture paths pointing at one hardlinked inode emitted success.
  All distinct required observation paths now require distinct device/inode identities.
- A parent directory replaced by an outside symlink only while the real open ran,
  then restored before path readback, supplied expected external bytes and emitted
  success. Each opened descriptor now proves its device/inode/size/time/mode
  against the path observed before open and again against path/descriptor readback.
- The 64 MiB reader limit refused the real pinned local Bun interpreter, observed
  at 79,500,640 bytes. The bounded reader now allows at most 128 MiB. A positive
  CLI test copies the actual running Bun binary into separate reviewed/capture
  files and pins its digest; matching sparse artifacts of 128 MiB plus one byte
  supply the production oversized negative without consuming equivalent disk space.

The first two tests were watched red (**35 pass, 2 fail**), the transient-parent
race independently red (**37 pass, 1 fail**), and actual-Bun acceptance independently
red (**39 pass, 1 fail**). Corrected focused suite: **40 pass, 0 fail, 83 assertions**.

Watched separate production mutations deleted exact membership admission,
deleted cross-path inode refusal, removed descriptor/path binding before and after
read, and removed only the size predicate. Each made its named real CLI regression
test fail an assertion (the corresponding invalid capture emitted success); all
mutations were restored. Existing no-activation and host-authority limits remain.

Correction checks: scoped Nx typecheck and lint both exited 0; changed-file
Prettier and `git diff --check` passed; scoped OpenSpec validation exited 0.
No broad suite or host gate was rerun for these corrections. Independent review
of the correction remains required before integration.
