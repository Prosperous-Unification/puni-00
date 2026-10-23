# Supervisor installer shared edge admission — 2026-10-23

This bounded source packet completes the installer step left open by the
[local descriptor prerequisite](verify-solver-edge-handoff.md). It implements no
live installation, retained owner publication, activation, prior-holder drain or
installed-byte adoption. Parent Task 10.2 and the integrated host gate remain open.

## Operation and authority

Devsync now selects `--local` with explicit runtime `edgeLock: 'inherit'`. The
runtime verifies its inherited canonical description and maps it to child FD3;
the installer independently verifies that inherited description and maps it to
the publication shell's FD3. The shell compares that descriptor's device/inode
with canonical edge.lock. It never reopens the lock in local mode. Standalone
`--host=h2puni` execution takes canonical host edge.lock itself, without inheriting
client authority. Explicit `--local` and `--host` cannot be combined.

Both paths generate the same host operation. Hashes are captured before staging;
the config hash uses the exact bytes already validated. Each invocation creates
a distinct 0700 transport staging directory under the separate cache root. Remote SCP and local copies cannot substitute
changed bytes: all four staged hashes and the staged Bun version must match.
Canonical state/lock kinds and readability and both retained owner markers are
checked before publication. Inside admission, destination parents are created for first installation and
all four payloads are copied into private sibling directories on their destination
filesystems. Exact modes, all sibling hashes and sibling Bun version are verified
before any final rename. Supported transport Bun invokes node:fs renameSync,
which uses rename(2) without cross-device copy fallback. Admission covers each
rename, all four installed
hashes, systemd reload/enable/restart and at most forty active-service/socket
probes. Bun/bundle publish with 0755, config with 0600 and the unit with 0644.

Each rename is atomic; the four-file publication is not transactional. Failure
after publication begins prints partial/uncertain-state diagnostics with the
invocation staging identity and all four original expected hashes; any failed
transport or unspawnable command preserves that same evidence and requires inspecting installed bytes, invocation staging and
service readiness under edge.lock. No automatic rollback or success after a
lost SSH acknowledgement is inferred. Failed staging before the host operation
may leave its invocation-owned private directory for manual inspection.

## Production-path evidence

Tests use actual installer CLI entrypoints and generated shell. Fake SSH/SCP and
local shell/copy adapters remap fixed host paths into disposable `/tmp` trees;
service commands are substitutes. A real Unix socket supplies readiness. Real
flock competitors execute at replacements, staged/installed checksum reads and
service operations. The actual local CLI follows Bash-held FD8 through the
production devsync runner, installer Bun and publication shell FD3. Separate
foreign/missing-descriptor cases prove refusal without fallback; shell-foreign
FD3 is tested while another descriptor genuinely holds canonical edge.lock.

The real remote CLI runs twice and proves all eight upload paths are distinct
and each staging directory is 0700. Source-config changes during SCP and staged
config corruption refuse before publication. A lost acknowledgement after the
host operation reports uncertainty and never prints installed/ready success.
Independent readback corruption refuses before any service command. Partial
second rename, service failure, absent socket and inactive service all refuse;
readiness negatives observe exactly forty probes.

The initial argument test failed on unsupported `--local` before implementation.
The restricted sandbox initially denied disposable Unix socket creation with
EPERM; socket tests were rerun with narrowly scoped execution approval. No live
SSH endpoint, systemd service, Docker daemon or production path was used.

## R5 watched faults

Each mutation was applied to the production path alone, its selected Bun test
was observed failing, and the source was restored before the next fault. The
[watched guard log](evidence/solver-installer-admission/watched-guards.log) records
all thirty-four faults and their named failing tests. Adjacent `Proof:` comments link
production predicates to these observations.

| Independently injected fault                                                                                  | Observed failing acceptance                                                                               |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Omit state directory, state symlink, lock regular-file or lock symlink guard                                  | Each named canonical-kind negative fails independently                                                    |
| Omit lock readability                                                                                         | A genuine inherited lock made unreadable after acquisition is admitted                                    |
| Omit remote flock                                                                                             | Real replacement/hash/service competitor acquires canonical lock; positive refuses                        |
| Remove owner-marker refusal                                                                                   | All eight JSON/pending shapes are admitted; eight failures                                                |
| Replace state listing with absence                                                                            | Execute-only trusted state is admitted                                                                    |
| Remove staged hash or staged Bun version refusal                                                              | Corrupt staged config or correctly hashed unsupported Bun is admitted                                     |
| Remove installed hash readback, or move it after reload                                                       | Corruption is admitted, or a service command runs before refusal                                          |
| Remove each executable/config/unit chmod separately                                                           | Exact installed mode assertion fails for each omission                                                    |
| Remove socket readiness or shorten the forty-probe bound                                                      | Absent socket is accepted, or inactive-service probe count is wrong                                       |
| Remove local shell identity comparison                                                                        | Foreign FD3 is admitted while a separate FD holds canonical lock                                          |
| Remove installer admission or second child FD3 mapping separately                                             | Actual two-hop control loses its required inherited description                                           |
| Remove explicit host/local argument exclusion                                                                 | Mixed transport flags are accepted                                                                        |
| Make staging 0755 or reuse a fixed attempt ID                                                                 | Real SCP privacy validation or repeated real CLI path uniqueness fails                                    |
| Remove devsync inheritance or local installer propagation                                                     | Runtime contract or actual local CLI fails                                                                |
| Close remote lock before service operations                                                                   | Service competitor enters; positive fails                                                                 |
| Treat broken stat as two absent identities                                                                    | Broken identity-tool local negative is admitted                                                           |
| Remove reload, enable or restart separately                                                                   | Real CLI service command sequence fails for each omission                                                 |
| Omit attempt/hash failure evidence from the shared formatter, transport refusal or spawn exception separately | Generated publication failures, real upload refusal and thrown transport failure lose original identities |
| Remove partial-publication diagnostic                                                                         | Second-rename negative loses required uncertainty message                                                 |

## Checks and limits

- Focused restored scope: **81 pass, 0 fail, 443 assertions**. `bun test tools/tool-remote-scripts/src/install-solver-supervisor.test.ts tools/tool-remote-scripts/src/solver-supervisor-install-operation.test.ts tools/tool-devsync/src/solver-binding-runtime.test.ts tools/tool-devsync/src/solver-binding-command.test.ts`: see [restored output](evidence/solver-installer-admission/restored.log).
- Configured Nx lint and typecheck for `tool-remote-scripts` and `tool-devsync` pass. Initial direct ESLint lacked a cached project graph; after generating it with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, configured lint ran successfully with boundary checks available.
- Configured `tool-remote-scripts:build` passes, including its three build dependencies.
- Changed OpenSpec validation, explicit changed-file Prettier and packet-scoped `git diff --check` pass.

The existing locked dependency tree is reused by symlink because local disk has
less than 2 GiB free. This worktree and the dependency donor have matching bun.lock
SHA-256 `ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`.
No fresh frozen install was run. Full project test targets, independent Astra
review, full CI and isolated integrated-SHA host acceptance are not claimed.

## Astra P2 correction — destination-filesystem atomic publication

Review identified that plain `mv` from the original common `~/.local/lib` staging
root could copy/unlink into `~/.config` on a different filesystem. The corrected
transport root is private `~/.cache/wbs-solver/install-<uuid>`. Under canonical edge
admission the operation creates first-install final parents, creates one private
sibling directory per destination, copies each payload there, sets exact modes,
checks all four copied hashes and probes the copied Bun version before any final
replacement. Final publication invokes the verified transport Bun's native
`node:fs.renameSync`; it never asks a file utility to recover EXDEV by copying.
The transport Bun remains available throughout all four replacements.

The real cross-filesystem fixture places transport under `/tmp` and config/unit
under `/dev/shm`, first proves their device IDs differ, then requires each final
source to share the destination parent device and retain its inode after native
rename. Both this case and missing final parents failed against 66b79dfa; the
[pre-fix failures](evidence/solver-installer-admission/filesystem-red.log) are
retained. Both now pass. Copying in place instead of native rename, or publishing
the original transport paths, independently fails this control.

New preparation negatives inject a sibling copy failure, corrupt a copied config
and return an unsupported version only when the otherwise identical runtime is
probed at its sibling path. All refuse before any installed byte changes, and
created staging is removed. Collision refusal preserves a pre-existing sibling
owned by another attempt. Cleanup attempts every tracked path, reports failed
paths plus the attempt/original hashes, and returns failure even if publication
itself succeeded. Only directories recorded after successful mkdir are removed.
The first-install fixture also verifies parent modes and a real competing lock
at parent creation.

All original 34 watched faults were rerun against the corrected operation, with
mode mutations targeting destination siblings. The broken-stat fixture now
breaks only its identity-stat operation, preventing unrelated inode/private-mode
fixture checks from masking that negative. Transport hash/version negatives
assert their exact stage diagnostic so the new sibling guards cannot mask them.
Ten additional independent mutations cover sibling hashes/version/privacy,
collision ownership, cleanup status, use of sibling paths, native rename,
first-install admission/config privacy and verification before replacement.
The [corrected guard log](evidence/solver-installer-admission/filesystem-watched-guards.log)
retains all 44 observed failures; each mutation was restored.

No live installer, service operation, deployment or activation was executed.
Independent rereview and the integrated exact-SHA host gate remain open.

Correction verification: the same four-file focused command now passes **88 tests,
0 failures, 508 assertions**; [restored output](evidence/solver-installer-admission/filesystem-restored.log).
Fresh configured Nx lint/typecheck for both projects and the remote-scripts build
pass with `--skip-nx-cache`. Changed OpenSpec validation remains valid, and explicit
changed-file formatting and packet diff checks pass. Dependency reuse and the
unverified full CI/project-test/host-gate limits above remain unchanged.
