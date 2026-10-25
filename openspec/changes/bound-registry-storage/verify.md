## Verification status

Implementation in progress, 2026-10-25. Policy, journal and physical-storage slices have independent
review approval. These receipts do not establish live capacity enforcement,
retirement, notifications or readiness for product adoption. Production has not
been migrated by this change. Remaining task checkboxes are authoritative.

## Policy — reviewed through 1566573f5

`bun test tools/tool-fleet/src/registry-policy.test.ts` exited 0 with **38 pass,
0 fail, 65 assertions**. The initial package run at 392e165b2 used
`bunx nx run tool-fleet:test`: **657 pass, 2 skip, 0 fail**, exit 0.

The initial implementation observed 37 production-path guard/dependency mutations
fail their covering tests. They covered capacity schema and actual usable limits,
byte/inode thresholds and reservations, root reserve, publisher exclusion, complete
history and graphs, duplicate/cyclic/dangling references, owner/timestamp validity,
newest-ten retention, environment rollback, unfinished/seven-day protections,
transitive shared content, cleanup targets and all-protected exhaustion.
Production guards carry adjacent `Proof:` comments naming the relevant negatives.

Review found floating multiplication could admit at exactly 90% for valid
safe-integer capacities. Four new tests initially failed with byte/inode admission
and premature 70%/80% classifications. The shared threshold now uses exact BigInt
arithmetic. Restoring the old multiplication made all four regressions fail again:

```sh
bun test tools/tool-fleet/src/registry-policy.test.ts -t safe-integer
```

Observed mutation output: **0 pass, 34 filtered out, 4 fail**, exit 1. Restored
production code passed the complete focused suite. Scoped re-review approved the
fix with no new important findings. Graph acquisition/freshness and live upload
integration remain later obligations.

## Journal — reviewed through 2b1119372

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-journal.test.ts
```

Final focused output: **27 pass, 0 fail, 225 assertions**, exit 0. Tests exercise
actual competing processes and kernel locks, SIGKILL before acknowledgement and
before replacement rename, stdin CLI requests, missing/unreadable/corrupt state,
file/directory fsync failure, stale owner/token/revision, physical replacement
allocation, reserved failure growth and recovery ordering.

The final initial package check, after completed-bundle ownership was corrected,
exited 0 with **679 pass, 2 skip, 0 fail, 2441 assertions**:

```sh
NX_WORKSPACE_DATA_DIRECTORY=/tmp/registry-journal-nx-497aeb4c4/workspace \
NX_CACHE_DIRECTORY=/tmp/registry-journal-nx-497aeb4c4/cache \
NX_DAEMON=false bunx nx run tool-fleet:test
```

A prior wrapper run exited 1 after passing tests because its Nx SQLite cache
transaction failed with a foreign-key error. The successful run above used a new
task-owned cache; shared cache state was not deleted or repaired. Package tests
were not repeated for the subsequent scoped journal recovery fixes.

The initial 24 observed production-guard mutations failed covering command tests:
request/journal bounds, revision/identity/reference validation, failure reserve,
trusted schema and read invariants, symlink/ownership/mode checks, expected
revision/token/owner, actual flock, file/directory fsync, measured replacement
capacity, maintenance exclusion/sequence, explicit publication reconciliation,
monotonic time and streaming stdin limits. Negatives use the actual command path;
missing state is never converted to an empty journal.

Independent review then reproduced two defects: a corrupted resume phase could
skip maintenance verification, and failed/crashed replacement files leaked
allocated capacity. Five new regressions first failed, then passed after the fixes.
The final 15 additional removal negatives all exited 1 with covering-test failure:

| Injected fault                                                                     | Observed failure                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Remove active/resume equality, operation phase membership or failed-state evidence | Corrupt recovery/read command unexpectedly succeeds           |
| Remove failed-write cleanup or crash-orphan unlink                                 | Allocated replacement remains in directory                    |
| Remove orphan directory fsync                                                      | Expected command refusal disappears                           |
| Permit unknown replacement names or nonregular/foreign/public/hard-linked files    | Unsafe replacement command unexpectedly succeeds              |
| Allow initialization with replacement evidence                                     | Initialization unexpectedly succeeds                          |
| Reclaim before validating canonical state                                          | Corrupt canonical state no longer preserves recovery evidence |
| Drop the cleanup cause or replace the aggregated failure                           | Expected EACCES/AggregateError is absent                      |

The crash test kills a real child after file fsync but before rename. Canonical
corruption preserves the orphan; restoring valid canonical state allows locked
reclamation without changing its revision or protections. Real EBADF write and
EACCES unlink failures, directory fsync failure and CLI reclamation are covered.
Scoped re-review approved both fixes with no new important issues. Physical mount
identity, persistent startup refusal and workflow adapters remain later tasks.

## Physical storage — reviewed through c15702ab2

Public implementation commits: 91ee4d90a, 8751ba853 and c15702ab2. Private fleet
commits a729b59 and 22d69e5 are local, unpushed, on `feat/bound-registry-storage`.
The private `registry-storage` Kustomization owns the new retained PV/PVC and guard;
public files are contracts. No production account, volume, PVC, policy or source
revision was changed by these tests.

```sh
REGISTRY_STORAGE_SSH=/tmp/puni-registry-ssh \
REGISTRY_STORAGE_HOST=10.1.0.4 \
REGISTRY_TEST_KUBECTL=/tmp/puni-registry-ansible/bin/kubectl \
bunx nx run tool-fleet:test:registry-storage
```

Final non-cached output: **3 pass, 0 fail, 32 assertions**, exit 0. This includes
native loop/ext4 saturation, private/public payload equality and real server-side
Pod admission dry-run under the unchanged Restricted namespace policy. No Pod was
created by that dry-run. Actual pinned Distribution ran separately in a disposable
container as UID/GID 59001, with zero permitted/effective/ambient capabilities,
NoNewPrivs=1 and a read-only journal mount.

Observed production-path negatives/removals cover root reserve, backing inode,
allocated blocks, exact trim exclusion, missing/wrong mounts, actual capacity and
filesystem identity. A wrong ext4 filesystem on the same reused loop device was
refused; removing the statfs FSID comparison admitted it. A 64 MiB registry fixture
hit ENOSPC before an 80 MiB write, while the separate journal still recorded failure.
No exhaustion test targeted the host root filesystem.

Testing exposed actual allocation loss from ext4 lazy inode initialization:
a 33,554,432-byte backing file retained only 31,465,472 allocated bytes despite
nodiscard. Eager inode/journal initialization retained full allocation through
30 convergences, 500 metadata write/delete cycles per volume, quiescence and remount.
Removing those flags reproduced the loss. The actual scheduled-trim selection
excluded the owned volumes; trimming only the fixture fstab retained allocation.

Review found identical receipt bytes bypassed root ownership/permission validation.
The new regression first failed because host verification accepted a receipt
chowned to the authority UID. The fix now checks regular-file type, root UID/GID,
0644 mode and a single hard link both before the host fastpath and at startup.
Ten unchanged-byte faults (owner, group, writable mode, symlink and hard link for
each receipt) all refuse; removing each host/startup guard admits the faults.
Scoped re-review approved the fix without new important findings.

Final fixture `/var/tmp/puni-registry-storage-proof-1drm2rv1` and its exact loop0/1
attachments were removed and verified absent, along with its named container/task.
Root available bytes during saturation were 122847547392 before and 122916225024
after; backing allocation stayed unchanged. Earlier owned fixtures also have
cleanup receipts in the implementation report. No host accounts were created.

Applicable checks passed: full existing host target **8 pass/168 assertions**, then
only affected ownership checks **3 pass/27 assertions** after the UID correction;
scoped lint, strict TypeScript, ShellCheck, public infrastructure checks and private
`fleet-check:check`. Actual classification CLI tests caught a missing .conf selector
and overlapping rehearsal selectors; the four policy cases now pass **40 assertions**
and observed selector-removal negatives. Normal commit hooks passed. The Tool Wiki
activation hook remains inactive and is not counted as certification.

The authenticated host authority wrapper and persistent pressure fence remain task
2.2. Real account creation, systemd boot ordering, full host gate, production
provisioning/migration and live startup/cutoff remain unverified until final rollout.

## Checks and unverified work

For each completed slice and fix, the affected files passed ESLint, Prettier and
`git diff --check`; `bunx tsc --build --force tools/tool-fleet/tsconfig.json` exited 0. Normal commit hooks ran without bypass. Tool Wiki returned inactive/uncertified
because the external activation root is not provisioned; no certification is claimed.

The two package skips were the pre-existing opt-in real-restic full-transfer/corrupt
pack and partial-source scenarios. They require the pinned real binary and remain
unverified for this implementation. No exact-revision full host gate has run for
this branch's new safeguards. Complete OCI lifecycle, live notification delivery, cutoff, staged migration
and independent recovery receipts remain pending. Earlier registry activation evidence does not prove this change.
