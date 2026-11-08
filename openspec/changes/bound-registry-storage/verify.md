## Verification status

Latest continuation: [durable backup effect consumption](#durable-backup-effect-consumption--2026-11-01).

Implementation in progress, 2026-10-25. Policy, journal, physical-storage, capacity/fencing, publication and manifest-census slices have independent
review approval. Deployment code review and corrected native smoke/Caddy checks passed. These receipts do not establish live capacity enforcement,
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

## Capacity and write fencing — reviewed through aaef2aab7

Initial public commit 72203f811 and private commit 974eb61 stage measured admission,
explicit journal v2 upgrade, a fixed authenticated host wrapper and a nonroot
Distribution supervisor. The authority grants a derived 30-second writable permit,
renewed every 10 seconds and checked each second. Permission binds boot identity,
monotonic time and canonical journal hash; ordinary healthy renewal leaves the
journal revision unchanged. Explicit reconciliation below 70% is required to reopen.
No live account, authority service or production volume was activated.

```sh
REGISTRY_STORAGE_SSH=/tmp/puni-registry-ssh \
REGISTRY_STORAGE_HOST=10.1.0.4 \
REGISTRY_TEST_BUN=/var/tmp/puni-registry-runtime-93kam935/bun \
bunx nx run tool-fleet:test:registry-capacity
```

The exact-source initial native run exited 0: **1 pass, 0 fail, 23 assertions**,
74.75 seconds. It used the actual command wrapper as UID 59001 and pinned
Distribution on loopback with separate disposable registry, journal and scratch
ext4 volumes. HTTP upload responses were 202 with valid permission and 405 after
checker death beyond the production 30-second lifetime, expired restart, canonical
hash drift, journal corruption, actual byte exhaustion and inode pressure. Killing
PID1 removed its listener and container task. Repairing/freeing storage alone did
not reopen writes. Oversized admission left no publication reservation; competing
publisher and malformed-request refusal preserved the existing healthy writer.

Actual registry ENOSPC still allowed an independent journal failure receipt.
Journal ENOSPC stopped writes and required reconciliation after space was freed.
The scratch fixture rejected registry/root aliases and excess bytes/inodes, reached
real ENOSPC, and measured reserved ext4 blocks unavailable to the service UID.
Observed removals admitted forbidden HTTP writes for missing/expired permission,
unsafe scratch aliases/identity/receipt metadata/maximum, and an extra fixed-wrapper
argument. Focused source removals made freshness, low-water and journal-heartbeat
headroom tests fail. These production checks carry adjacent proof references.

Defensive regressions also caught stale revocation acknowledgement reuse and a
legacy upgrade that could hide inconsistent unfenced maintenance. Both tests first
failed, then passed after correction. The final journal/capacity focused suite had
**38 pass/274 assertions**; a prior combined policy suite had 75 passing cases.
Affected lint, typecheck, strict infrastructure TypeScript, ShellCheck, public
infrastructure checks and private fleet rendering/policy checks passed. Four
classification cases passed 40 assertions after two missing pressure-unit selectors
were added; the actual source-checksum staging negative and removal proof passed.

The changed supervisor passed the physical-storage regression target in 46.78
seconds: **3 pass, 0 fail, 32 assertions**, including private/public payload equality
and Restricted server admission dry-run. A fixture-only guard-removal test had
created an authority observation on its underlying directory; the provisioner
correctly refused it. Cleanup now names that exact mutation-owned observation.
A second fixture issue used an invalid trailing-underscore container ID; names now
use UUIDs. Neither failed run was counted as success. Final fixtures dtscb_kb and
urcxlldz, exact loops/containers and both temporary verified Bun runtimes were removed.

Independent review identified one Important defect: startup read only the
first line of a permit while authority validation covered the whole file. A valid
record followed by corrupt trailing content was authority-rejected but accepted by
the supervisor. The new native regression reproduced HTTP202 where405 was required.
Fix commits 8e4142463 (public) and 7f4756293 (private) validate one complete record
against the size of the same open inode, then enforce canonical single-space
representation before existing boot/time/hash checks. The focused native test
`registry-capacity.test.ts -t 'one complete writable permit'` first failed with
HTTP202 instead of405, then passed **1 test/16 assertions** in 28.34 seconds.
Nine malformed forms returned405: trailing content, blank second line, unterminated
suffix, missing newline, doubled/leading/trailing space, embedded NUL and trailing
NUL. Restart remained readonly; both valid transition-hash positions returned202.
Removing byte-count validation admitted trailing content and a blank second line;
removing canonical comparison admitted double spaces. All three returned202.
The new production checks name those observed witnesses in adjacent proof comments.

Both owned fixtures w251b0yy and gmt5ot7y were removed with their exact loop devices,
containers and listeners. Public/private equality and staged patch/hold checks
passed **1 test/12 assertions**. Changed-file lint, strict TypeScript, ShellCheck,
format and normal hooks passed. Unchanged full capacity/storage suites were not
repeated for the scoped parser fix. Independent re-review accepted the original
finding's correction but found a new open-failure path: compound shell redirection
could fail and continue with the previous iteration's record because the function
runs as an if-condition. Focused shell reproductions confirmed this. Explicit
failure propagation is now in public aaef2aab7/private b7e234415. The native test
first observed HTTP202 instead of405 after an earlier valid iteration and a
deterministically injected open failure. With the fix it returned405; removing
only the explicit failure propagation restored202. The next poll was held so it
could not hide stale-record reuse. The actual missing-file error was also required.

The final focused native matrix passed **1 test/18 assertions** in 34.53 seconds,
including all prior malformed-record and valid-transition cases. Equality and
staged-patch checks passed **12 assertions**; changed-file static checks and normal
hooks passed. Fixtures 710789k_ and _gqxlvxm were fully removed with their loop
devices, containers, listeners and injected stat shim. Scoped re-review approved
fix round2: every finding addressed, no new Important or Critical breakage. Actual
builder provisioning/export integration belongs to task3.1; full gate and live
activation remain pending.

## Publication — reviewed

Public implementation commit 9259fe99b adds explicit trusted publication
enrollment, bounded OCI export and managed copy/import through the shared
publication authority. Selected malformed/missing enrollment refuses; legacy
unenrolled publishing stays supported. Image roots remain manifests/indexes,
with their verified transitive closure. One complete required repository set is
reserved before target uploads, and partial failure retains ownership/reservation.
Complete publication returns an exact durable bundle receipt and frees its slot.
No private companion or production settings changed in this slice.

The actual pinned Dagger 0.21.9 SDK/CLI and engine exported a tiny image on h4
under the canonical heavy lock and explicit resource admission. The retained
8,192-byte OCI archive contains root
`sha256:27ddb6fd651405cb8f8b78089a405d330cff8e3154dde0b8bd90febfcd95d7ed`.
The exporter also emits Docker compatibility metadata; OCI index/closure remains
authoritative. The common writer uses those exact bytes, rehashes content,
validates returned manifest digests and verifies the stored target closure.

```sh
REGISTRY_STORAGE_SSH=/tmp/puni-registry-ssh \
REGISTRY_STORAGE_HOST=10.1.0.4 \
REGISTRY_TEST_BUN=/var/tmp/puni-registry-runtime-uu926qx5/bun \
bunx nx run tool-fleet:test:registry-publication --output-style=static
```

Restored-source native output: **2 pass, 0 fail, 16 assertions**, 27.45 seconds.
Actual pinned Distribution and the fixed authority wrapper running as UID 59001
produced a complete three-tier receipt and released its publisher slot. An
oversized eight-repository envelope made no POSTs. A deliberate third-tier 503,
after the first two target closures were verified, retained the unfinished bundle,
failed owner and reservation. Scratch saturation, wrong/missing mounts, cross-mode
refusal and trusted enrollment negatives are included. An actual 2 MiB export
against a 1 MiB declared envelope was refused.

Observed removal proofs cover content/tar/descriptor validation, complete required
tiers, durable receipts, registry identity, pressure and scratch admission,
continuation origin, redirects, manifest receipts, target closure, arithmetic
bounds and authority responses. Removing publication orchestration allowed three
complete native uploads with zero durable bundles; the covering test failed.
Removing the post-export budget check admitted the oversized file. Removing the
storage mode check created a scratch backing file from ordinary registry provision
before a later error; the negative required refusal before that write. Native
enrollment guard removals admitted their exact unsafe configurations. Production
checks name these observed witnesses in adjacent proof comments.

An earlier scratch test failure was traced to generated Python line 19, an exact
shared-host free-byte equality assertion; line 18 had already verified ENOSPC.
The corrected test requires unchanged owned backing allocation and at least
20 GiB root reserve. It does not assume unrelated host writes stop during a test.

The first affected test command exited 1: Dagger **68 pass/119 assertions**;
fleet **720 pass, 2 skip, 1 fail/2643 assertions**. The failure was a stale raw
workload image count: Task3's storage-patch.yaml added an approved reference,
giving 11; excluding exactly that patch gave 10. Only the expected count/comment
changed. The subsequent entire platform test file passed **88 tests/184
assertions** in 9.44 seconds. The original full-suite run is not reported as passing.
The two real-restic opt-in skips remain explicit.

The shared physical-storage regression passed **1 test/16 assertions**, 41.45
seconds; two unchanged tests were filtered. Both projects' lint/typecheck targets
passed all four tasks uncached. Native strict TypeScript, ShellCheck, formatting
and normal hooks passed. Self-review restored legacy copy CLI JSON-line output;
its focused follow-up passed **18 tests/41 assertions**. The wrapper/per-tier
contract tests passed **2 tests/11 assertions**. No product build or full host
gate was run. Historical output contains inherited color-setting and deprecated
Docker stop-option warnings; future harness/environment cleanup is in the fix.

All owned h4 fixture paths, loop devices, containers and the verified temporary
Bun runtime were removed. The newly introduced pinned Dagger engine image was
verified unused and removed without force. Final root available bytes were 123228643328. No production PVC or product registry reference changed.

Independent review found one Important receiving-boundary defect: source
manifest/error bodies and authority stdout/stderr could be buffered before bounds
were enforced, while target verification checked its known size only at EOF.
Fix `044baa74a` adds bounded reception before buffering/hashing, HTTP cancellation,
and subprocess termination and reaping. The final covering run passed **25 tests,
71 assertions** in 341 ms. Four deliberate removals made the covering tests fail:
receiving byte limit, reader cancellation, child termination, and an oversized
managed response with real journal ownership. The latter confirms failure retains
its unfinished bundle and reservation. Production proof comments identify these
observed failures.

Actual HTTP producers stopped after 4325376, 73728 and 8192 bytes respectively;
overflow chunks never reached buffering or hashing. Actual stdout/stderr emitters
were killed with SIGKILL, their exited promises settled, and their PIDs were absent.
Both affected projects passed all four lint/typecheck tasks uncached in 12.5 seconds;
after the final ownership test, typecheck passed again. Native strict TypeScript,
ESLint, Prettier, ShellCheck, diff checks and normal commit hooks passed.

The real `copyImages` path passed a native proof: **1 test/13 assertions** in
27.31 seconds, using pinned source and target Distribution instances, trusted
enrollment/scratch checks and the real authority CLI as UID 59001. It copied the
retained OCI root into a complete three-tier durable bundle and cleaned its scratch.
Only the SSH transport was replaced by a fixture adapter; installed production SSH
access remains unverified. The first fixture run exposed that adapter intercepting
a legitimate stat command; it was corrected to pass non-SSH calls through.
Both owned fixture directories, all four mounts/loops, source/target processes and
the hash-verified temporary Bun runtime were removed. Final root available bytes
were 123291512832. Production services and product references were unchanged.

The scoped independent re-review approved both spec compliance and task quality:
all original findings addressed, no new blocking findings. Saved receipts and the
fix diff were checked without rerunning suites. Future commands clear conflicting
color variables and the retained Dagger harness uses `docker stop --timeout`;
historical warning-bearing output remains intact. Public implementation range is
`9efd6665e..044baa74a`; private fleet remains `b7e234415`. Full product build,
installed-authority SSH, full host gate and production activation are not claimed.

## Deployment integration — reviewed code and native checks complete

Task 3.2 is complete for its reviewed implementation and scoped proofs. Initial implementation commits are public
`89fd22613838abf43d2c9598f19171f315593e93`, private website
`1a3cc1139e9d115945a7c5dccb8febf483911595`, and private fleet
`58831dbb4c62d8d5b425f2423592dd171599bf38`. Independent review found four
Important defects: Kubernetes discovery omits nonpreferred served API versions;
the private artifact client omits credentials required by native publication;
the private reader confuses registered configuration identity with its owning
Git directory; and the Compose reader rejects the supported service-free dev
base. Fix round 1 addressed all four defects in public
`7f6c436dc9c50ecc64d50158581a8ad87837f473` and private website
`d4ead6ef7e518a76878d649773975d07336a92b8`. Independent scoped re-review
passed spec compliance and code quality, with no new Critical/Important finding.
The fixes passed 30 distinct public and six distinct private tests, actual
publication/collector boundary rehearsals, and eleven deliberate safety-check
removal boundaries. Initial static-check failures were corrected and the affected
checks passed. No activation approval or installed-proof claim follows from this
code review.

Read-only manifest census proceeded from the reviewed contracts while the native
smoke was queued. The corrected proof has now passed; final installed integration
and activation evidence remain required under Task 5.2.

The configured public test targets passed: fleet **770 pass, 2 skip, 0 fail**
and deploy **846 pass, 0 fail**, using
`bunx nx run-many -t test -p tool-fleet tool-deploy --parallel=2 --skip-nx-cache --output-style=stream`.
The exact remote-script source command from its project directory,
`bun test src --preload ../test/scratch/preload.ts --timeout=10000`, passed
**804 tests, 2 skips, 0 failures**. Its separate `test:caddy` dependency was
initially unrun; the parent later ran its exact pinned-container command successfully
as recorded below. The fleet skips are opt-in native restic cases; the
remote-script skips are opt-in native Docker solver-cleanup cases. Public
lint/typecheck/build completed all 16 tasks; private website checks completed
all five tasks, and private fleet test/lint/typecheck completed all three.
These receipts precede the review fixes and do not verify those changes.

The pinned Bun 1.4.2 website test target passed **173 tests, 728 assertions**;
a subsequent source-parser check passed **17 assertions**. The actual private
client/public bundled authority rehearsal passed durable promotion-receipt
repair and the native private reader contract. Its observations remain fixture
ports, and the independent review identified the unexercised registration and
publication boundaries above. These checks do not prove installed adoption.

Two earlier failures remain recorded as failures: the aggregate public test
invocation selected generated duplicate tests and exposed a real missing
unmanaged dependency in a replay fixture; the initial private suite had six
cleanup-hook failures after asynchronous Docker removal. The replay fixture was
corrected, and bounded checked cleanup convergence preceded the passing private
rerun. Neither original command is counted as green.

The corrected native Compose proof passed under the canonical h4 heavy lock
on Docker 29.1.3: success, intentional failure and SIGTERM cancellation each left
no smoke container or `.registry-smoke-*` snapshot. The fixture used 336484 bytes;
root free was 121681129472 bytes. The newly introduced 42863256-byte Bun image,
exact network and directory were removed, and a separate read-only audit confirmed
the fixture, network, containers and image absent. A prior three-hour lock wait
expired with native 75 before payload; its two hash-verified transport files were
removed before one longer-budget attempt. An earlier invocation swallowed a
failing `find` status and remains unaccepted as complete cleanup proof. The passed
artifact has reviewed behavioral equivalence to the committed functions; a fresh
diff of all three source modules against reviewed commit 7f6c436dc was empty.
This is scoped function behavior, not exact final installed bundle identity.

The parent also ran `bun run tools/tool-remote-scripts/caddy/run.ts` with `CI=1`
through the actual pinned Caddy 2.10.2 container: **2 pass, 0 fail, 78 assertions**,
exit 0, on local Docker 29.7.2 and Bun 1.4.4. A transparent Docker audit wrapper
recorded only the fixture's commands and executed the real CLI with unchanged
arguments. Exact container creation/cleanup events and the scratch directory were
verified; the borrowed pinned image was preserved. The pinned image declares no
anonymous volumes. This closes the earlier separate dependency gap; it does not
replace the final canonical host gate. Task 5.2 still requires the exact-revision installed proof,
authenticated SSH reader transport, actual global Docker ownership census,
compatible catalog rollout and full canonical host gate. No live product pins,
registry storage, cleanup service or protection enrollment changed in this slice.

## Manifest census and planning — reviewed through 4f2427d89

Task 4.1 is complete at `4f2427d895c62ecd82311145c8ba217f66fdb486`, following
initial implementation `3bf1a2c63d7cb090949a4006cf6e6b295fe34e95` from
`01c0308db891e4f3c984643b99eb54008ad2f0c9`. Physical content hashing and
revision/link validation are independent of API catalog, tag and manifest reads.
Every stored revision's dependencies are required. Repository revision identity
is separate from globally shared content; all validated consumer/recovery roots
remain protected. Plans bind journal obligations, runtime/storage identity and
physical census, and require a fresh verified inventory before execution.

`NX_DAEMON=false bunx nx run tool-fleet:test --skip-nx-cache` exited 0 with
**805 pass, 2 existing restic skips, 0 fail, 2994 assertions** across 63 files.
Uncached fleet lint/typecheck/build and scratch build passed. The final proof-fix
focused suite passed **39 tests, 91 assertions**; lint, typecheck, formatting,
diff checks and normal hooks passed. No runtime behavior changed in the fix.

The exact Distribution 2.8.3 image supplied the amd64 executable with SHA256
`8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37`.
Its disposable native fixture passed **14 checks** with 102 repositories,
102 tags and 104 to 103 revisions: actual catalog pagination, untagged child/shared
content, missing required dependencies, same-size physical corruption, truncated
tag responses, retag/delete/offline GC and fresh retained-content reads. Fixture
allocation was 11354112 bytes; root free was 143005036544 bytes. The successful
fixture was independently confirmed absent. Source observations and capacity were
explicit synthetic ports, so this is not installed-consumer or live-capacity proof.

Initial proof evidence contained 24 mutation cases. Review found four adjacent
claims stronger than their actual outcomes. The original logs were preserved;
six isolated follow-ups now prove same-length corruption, an independently owned
size mismatch and separate unverified-census/changed-identity/changed-protection
cases. Five removed checks admit invalid input; the child-revision check instead
reaches an independent media-type refusal, now described accurately. These are
follow-up cases, not 30 distinct safety checks. Scoped re-review closed every
Important finding and found no new blocking issue.

One Minor remains for final whole-branch review: digest-only policy operation
selection conservatively retains repository aliases sharing a directly protected
root digest. Repository-specific reclaim claims must preserve that limitation
until it is triaged. It does not delete retained content.

Failed native fixture evidence was archived and verified before exact cleanup;
the extracted executable and compressed archive remain review artifacts. The
extraction-created anonymous Docker volume was attributed to the exact stopped
fixture container, checked unused/empty and normally removed. No shared prune or
production storage operation occurred. Task 4.2 still owns fenced execution,
verified backup, partial-deletion recovery and runtime identity adapters. The
full host gate and installed/live proofs remain pending. Task 3.2 has its corrected native
smoke and Caddy receipts; final installed proofs remain pending.

## Checks and unverified work

For each completed slice and fix, the affected files passed ESLint, Prettier and
`git diff --check`; `bunx tsc --build --force tools/tool-fleet/tsconfig.json` exited 0. Normal commit hooks ran without bypass. Tool Wiki returned inactive/uncertified
because the external activation root is not provisioned; no certification is claimed.

The two package skips were the pre-existing opt-in real-restic full-transfer/corrupt
pack and partial-source scenarios. They require the pinned real binary and remain
unverified for this implementation. No exact-revision full host gate has run for
this branch's new safeguards. Complete OCI lifecycle, live notification delivery, cutoff, staged migration
and independent recovery receipts remain pending. Earlier registry activation evidence does not prove this change.

## Requirement completion audit

This is a requirement-level checkpoint, not a completion claim. Every row still
needs final integrated and live evidence before the goal can be marked complete.
Prior slice receipts retain their original snapshot scope. All 19 current delta
requirements are listed; narrower local proofs do not replace the final audit.

| Requirement                                             | Prior slice receipts and remaining work                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enforced registry storage boundary                      | Physical fixtures and scoped review passed; production provisioning/startup pending.                                                                                                            |
| Publication admission and pressure response             | Authority/supervisor and publication/copy proofs reviewed; corrected permission sampling tested locally and natively; live activation pending.                                                  |
| Protect images before referring to them                 | Publication and deployment code reviewed; native and installed proofs pending.                                                                                                                  |
| Complete trusted consumer inventory                     | Adapter code reviewed; installed readers and complete native registry census pending.                                                                                                           |
| Release-aware retirement eligibility                    | Policy and bound census/plans reviewed; serialized execution and live retirement pending.                                                                                                       |
| Complete image dependency closure                       | Complete census/closure code and native proof reviewed; live integration pending.                                                                                                               |
| Serialized recoverable maintenance                      | Durable authority reviewed; coordinated backup/delete/GC/recovery integration pending.                                                                                                          |
| Bounded backup lifecycle                                | Budget, retention and isolated post-prune restore pending.                                                                                                                                      |
| Proven monitoring and adoption                          | Real alert destination/delivery, missed-check proof and staged adoption pending.                                                                                                                |
| Durable bounded alert delivery                          | Local source capture/outbox/sender prerequisite accepted after scoped review; enrolled storage, actual destination, independent observer and live receipts remain pending.                      |
| Physical backup accounting                              | Provider version/multipart census and budget admission pending.                                                                                                                                 |
| Durable backup effect consumption                       | Prior local durable-consumption implementation and fault proofs reviewed; physical funding, installed access and exact-revision integrated evidence remain pending.                             |
| Early pressure response                                 | Threshold policy reviewed; periodic service/retirement/notification integration pending.                                                                                                        |
| Per-environment rollback coverage                       | History/protection code reviewed; native fourteen-promotion/two-environment fixture passed; installed proof pending.                                                                            |
| Independent journal capacity and durable fences         | Independent journal/HTTP fence proofs and parser review passed; live activation pending.                                                                                                        |
| Mandatory installed selection and compatible artifacts  | Catalog and artifact boundaries reviewed in deployment slice; actual installed catalogs, all entrypoints and private Bun compatibility still require exact-revision proof.                      |
| Source-proved owning history and authenticated repair   | Owning-history and authenticated resume code reviewed; live initialization/transfer and lost-owner-persistence repair remain unverified.                                                        |
| Registry-wide Docker coverage and environment ownership | Registry/global and Compose projection code reviewed; complete installed SSH/UID/catalog census, including stopped containers and shared-environment retirement, pending.                       |
| Consumer completion precedes promotion                  | First-start/release/Compose/private completion code reviewed and smoke behavior exercised; exact installed smoke, locked retries and downstream private Flux/runtime completion proofs pending. |

## Named scenario completion audit

All 55 current named scenarios remain unverified for final adoption. Prior scoped
receipts preserve their snapshot and modeling limits. Record the exact deployed
revision, command/receipt, observed outcome and failure witness before marking
an integrated scenario complete. The linked specification is the behavior contract.

| Scenario                                                                                                                                                                                   | Evidence still required for final adoption                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Storage fills without consuming the host root filesystem](specs/registry-storage-lifecycle/spec.md#scenario-storage-fills-without-consuming-the-host-root-filesystem)                     | Actual bounded-volume exhaustion and host-root reserve measurements from the final rehearsal.                                                                                                                         |
| [Registry mount is missing](specs/registry-storage-lifecycle/spec.md#scenario-registry-mount-is-missing)                                                                                   | Installed startup refusal with the mount missing or replaced; verify no registry content reaches root.                                                                                                                |
| [A large publication would cross the cutoff](specs/registry-storage-lifecycle/spec.md#scenario-a-large-publication-would-cross-the-cutoff)                                                 | Actual publication entrypoint refusal before its first upload, with the specified reservation and measured capacity.                                                                                                  |
| [Two publishers compete for the remaining space](specs/registry-storage-lifecycle/spec.md#scenario-two-publishers-compete-for-the-remaining-space)                                         | Concurrent installed publishers sharing the real authority; receipts show one admitted slot and no double-spent reservation.                                                                                          |
| [Permission checking overlaps an authority update](specs/registry-storage-lifecycle/spec.md#scenario-permission-checking-overlaps-an-authority-update)                                     | Final-source actual authority update across sampling converges within three attempts; revoked/expired/stably mismatched/churning permission refuses. Removal witnesses and installed guard regression remain pending. |
| [Pressure cannot be resolved safely](specs/registry-storage-lifecycle/spec.md#scenario-pressure-cannot-be-resolved-safely)                                                                 | Protected-content reads, persistent admission refusal and delivered capacity alert at the configured destination.                                                                                                     |
| [An old release still serves an environment](specs/registry-storage-lifecycle/spec.md#scenario-an-old-release-still-serves-an-environment)                                                 | Complete installed desired-state census including a scaled-to-zero consumer, followed by retained-closure verification.                                                                                               |
| [Deployment crashes before switching traffic](specs/registry-storage-lifecycle/spec.md#scenario-deployment-crashes-before-switching-traffic)                                               | Actual interrupted deployment and restart/reconciliation receipts preserving candidate and rollback ownership.                                                                                                        |
| [A consumer cannot be inspected](specs/registry-storage-lifecycle/spec.md#scenario-a-consumer-cannot-be-inspected)                                                                         | Destructive orchestration refusal for missing, unreadable and malformed registered evidence; observe no deletion.                                                                                                     |
| [Partial publication never became a release](specs/registry-storage-lifecycle/spec.md#scenario-partial-publication-never-became-a-release)                                                 | Final-source partial three-tier publication, trusted abandonment/grace evidence, exact cleanup and preserved shared protections. Earlier Task8 native receipts are development evidence.                              |
| [Ten release bundles share tiers](specs/registry-storage-lifecycle/spec.md#scenario-ten-release-bundles-share-tiers)                                                                       | Integrated repeated retirement preserves shared retained closures and can later reclaim newly unprotected residual content. Earlier policy/native receipts are scoped.                                                |
| [An untagged platform image belongs to a protected index](specs/registry-storage-lifecycle/spec.md#scenario-an-untagged-platform-image-belongs-to-a-protected-index)                       | Final-source offline GC followed by complete retained index/platform/blob verification and an uncached pull.                                                                                                          |
| [Protection changes after planning](specs/registry-storage-lifecycle/spec.md#scenario-protection-changes-after-planning)                                                                   | Actual authority revision change followed by stale-plan refusal before manifest deletion.                                                                                                                             |
| [A process dies during garbage collection](specs/registry-storage-lifecycle/spec.md#scenario-a-process-dies-during-garbage-collection)                                                     | Real process termination after deletion, terminal descendant cleanup, durable restart fence and verified recovery. An injected callback exception does not prove process death.                                       |
| [Reclamation timestamps contradict durable chronology](specs/registry-storage-lifecycle/spec.md#scenario-reclamation-timestamps-contradict-durable-chronology)                             | Local chronology restoration independently reviewed with 217 current broader tests and nine predicate-removal proofs; installed/exact-revision integration remains unverified.                                        |
| [An unrelated restricted process exposes no mount rows](specs/registry-storage-lifecycle/spec.md#scenario-an-unrelated-restricted-process-exposes-no-mount-rows)                           | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [A restricted process hides access to registry storage](specs/registry-storage-lifecycle/spec.md#scenario-a-restricted-process-hides-access-to-registry-storage)                           | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Backup retention cannot satisfy its budget](specs/registry-storage-lifecycle/spec.md#scenario-backup-retention-cannot-satisfy-its-budget)                                                 | Real budget admission, preserved last-verified snapshot and recovery pins, no destructive retirement, and visible capacity refusal.                                                                                   |
| [Backup recovery coverage is incomplete](specs/registry-storage-lifecycle/spec.md#scenario-backup-recovery-coverage-is-incomplete)                                                         | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Backup storage paths change](specs/registry-storage-lifecycle/spec.md#scenario-backup-storage-paths-change)                                                                               | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Monitoring stops](specs/registry-storage-lifecycle/spec.md#scenario-monitoring-stops)                                                                                                     | Independent five-minute missed-check delivery plus installed publication refusal of stale measurements; metric/log emission alone is insufficient.                                                                    |
| [Healthy pressure observation leaves canonical history unchanged](specs/registry-storage-lifecycle/spec.md#scenario-healthy-pressure-observation-leaves-canonical-history-unchanged)       | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Local status cannot refresh an old observation](specs/registry-storage-lifecycle/spec.md#scenario-local-status-cannot-refresh-an-old-observation)                                         | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Maintenance holds the canonical command lock](specs/registry-storage-lifecycle/spec.md#scenario-maintenance-holds-the-canonical-command-lock)                                             | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Future observations use chronological ordering](specs/registry-storage-lifecycle/spec.md#scenario-future-observations-use-chronological-ordering)                                         | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Reservation totals remain separate from physical usage](specs/registry-storage-lifecycle/spec.md#scenario-reservation-totals-remain-separate-from-physical-usage)                         | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Historical backup verification retains its origin](specs/registry-storage-lifecycle/spec.md#scenario-historical-backup-verification-retains-its-origin)                                   | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Healthy reports follow an undelivered cutoff](specs/registry-storage-lifecycle/spec.md#scenario-healthy-reports-follow-an-undelivered-cutoff)                                             | Local durable preservation/restart behavior reviewed; enrolled-host incident retention and actual destination receipts remain required.                                                                               |
| [Pressure moves between thresholds without normal recovery](specs/registry-storage-lifecycle/spec.md#scenario-pressure-moves-between-thresholds-without-normal-recovery)                   | Local reporter/fence/reopen sequence and replacement mutations reviewed; installed same-episode and delivered-receipt evidence remain required.                                                                       |
| [Sender recovers a failure missed before enqueue](specs/registry-storage-lifecycle/spec.md#scenario-sender-recovers-a-failure-missed-before-enqueue)                                       | A killed ordinary producer and separate sender reach an owned receiver; installed unattended recovery and complete effect-replay evidence remain required.                                                            |
| [Sender stops after possible submission](specs/registry-storage-lifecycle/spec.md#scenario-sender-stops-after-possible-submission)                                                         | Local acceptance/kill/restart identity and allowance tests reviewed; real-destination lost-acknowledgement and bounded-retry evidence remain required.                                                                |
| [Notification response is not the selected protocol acknowledgement](specs/registry-storage-lifecycle/spec.md#scenario-notification-response-is-not-the-selected-protocol-acknowledgement) | Conditional acknowledgement/rejection/redirect and stale-binding tests reviewed; actual selected-protocol and destination evidence remain required.                                                                   |
| [Established alert state disappears](specs/registry-storage-lifecycle/spec.md#scenario-established-alert-state-disappears)                                                                 | Local missing/unreadable/schema/identity refusals reviewed; actual enrolled-storage and root-marker loss proofs remain required.                                                                                      |
| [Directory access recovers after uncertain alert finalization](specs/registry-storage-lifecycle/spec.md#scenario-directory-access-recovers-after-uncertain-alert-finalization)             | Local compound sync/actual-EACCES fresh refusal reviewed under the bounded two-marker protocol; native durability and installed recovery evidence remain required.                                                    |
| [Alert spool is full](specs/registry-storage-lifecycle/spec.md#scenario-alert-spool-is-full)                                                                                               | Local critical reserve, bounded fault and exhaustion behavior reviewed; actual dedicated-storage exhaustion and source-failure delivery remain required.                                                              |
| [Retry would clear a maintenance failure](specs/registry-storage-lifecycle/spec.md#scenario-retry-would-clear-a-maintenance-failure)                                                       | Local common retry-boundary capture and stable-attempt proofs reviewed; installed backup/cleanup failure and complete-owner delivery remain required.                                                                 |
| [Alert storage profile is not established](specs/registry-storage-lifecycle/spec.md#scenario-alert-storage-profile-is-not-established)                                                     | Actual file IO with modeled profile/counter refusals reviewed; dedicated backing, quota, root enrollment and installed exclusion facts remain required.                                                               |
| [Sparse or metadata-heavy source exceeds its envelope](specs/registry-storage-lifecycle/spec.md#scenario-sparse-or-metadata-heavy-source-exceeds-its-envelope)                             | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Source changes after snapshot admission](specs/registry-storage-lifecycle/spec.md#scenario-source-changes-after-snapshot-admission)                                                       | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Logical backups fit but retained object versions do not](specs/registry-storage-lifecycle/spec.md#scenario-logical-backups-fit-but-retained-object-versions-do-not)                       | Complete enrolled-provider version and multipart accounting followed by physical-budget refusal.                                                                                                                      |
| [Worker dies after consumption](specs/registry-storage-lifecycle/spec.md#scenario-worker-dies-after-consumption)                                                                           | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Repeated preparation cannot mint another reservation](specs/registry-storage-lifecycle/spec.md#scenario-repeated-preparation-cannot-mint-another-reservation)                             | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Effect state would spend canonical failure headroom](specs/registry-storage-lifecycle/spec.md#scenario-effect-state-would-spend-canonical-failure-headroom)                               | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Effect ledger disappears after enrollment](specs/registry-storage-lifecycle/spec.md#scenario-effect-ledger-disappears-after-enrollment)                                                   | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Canonical recovery rotates the token](specs/registry-storage-lifecycle/spec.md#scenario-canonical-recovery-rotates-the-token)                                                             | Later scoped receipts describe local prerequisites; final integrated/installed and applicable real-destination evidence remain unverified.                                                                            |
| [Usage crosses the cleanup threshold](specs/registry-storage-lifecycle/spec.md#scenario-usage-crosses-the-cleanup-threshold)                                                               | Integrated pressure-triggered cleanup preserves the protected 75%, reports the unreachable target and does not weaken protection.                                                                                     |
| [An environment has not deployed the newest product releases](specs/registry-storage-lifecycle/spec.md#scenario-an-environment-has-not-deployed-the-newest-product-releases)               | Installed environment history/consumer evidence and retirement preserving its older rollback closure.                                                                                                                 |
| [Registry storage fills during an upload](specs/registry-storage-lifecycle/spec.md#scenario-registry-storage-fills-during-an-upload)                                                       | Actual upload ENOSPC with an independently writable bounded journal, failure receipt and persistent fence after restart.                                                                                              |
| [Canonical receipt clock moves backwards](specs/registry-storage-lifecycle/spec.md#scenario-canonical-receipt-clock-moves-backwards)                                                       | Local chronology restoration independently reviewed with 217 current broader tests and nine predicate-removal proofs; installed/exact-revision integration remains unverified.                                        |
| [Canonical receipt clock advances across year formats](specs/registry-storage-lifecycle/spec.md#scenario-canonical-receipt-clock-advances-across-year-formats)                             | Local chronology restoration independently reviewed with 217 current broader tests and nine predicate-removal proofs; installed/exact-revision integration remains unverified.                                        |
| [An adopted target loses its environment selector](specs/registry-storage-lifecycle/spec.md#scenario-an-adopted-target-loses-its-environment-selector)                                     | All installed mutating entrypoints with the selector unset still enforce the trusted catalog and managed receipt before effects.                                                                                      |
| [Promotion succeeds but owner persistence is lost](specs/registry-storage-lifecycle/spec.md#scenario-promotion-succeeds-but-owner-persistence-is-lost)                                     | Authenticated installed resume returns the original promoted receipt, repairs source history and leaves deployment effects and authority unchanged.                                                                   |
| [Durable evidence crosses accepted ISO year formats](specs/registry-storage-lifecycle/spec.md#scenario-durable-evidence-crosses-accepted-iso-year-formats)                                 | Local chronology restoration independently reviewed with 217 current broader tests and nine predicate-removal proofs; installed/exact-revision integration remains unverified.                                        |
| [One of two environments sharing an image retires](specs/registry-storage-lifecycle/spec.md#scenario-one-of-two-environments-sharing-an-image-retires)                                     | Actual complete Docker census including stopped containers and exact environment ownership; retirement of A preserves B and its global roots.                                                                         |
| [Managed Compose smoke fails after all tiers commit](specs/registry-storage-lifecycle/spec.md#scenario-managed-compose-smoke-fails-after-all-tiers-commit)                                 | Exact installed artifact, real whole-environment lock, failed smoke and full-candidate retry without repeated committed swaps or migrations.                                                                          |

## Permission sampling development proof

The old production guard failed a controlled actual-authority interleaving:
`executeRegistryCommand` advanced the journal with the real flock, fsync and
permit publication while the guard paused before hashing. It returned readonly
although the current permit was fresh; an immediate new sample succeeded. This
proves a read-pair defect independently of the earlier native HTTP failure, whose
cause remains unknown.

`bun test tools/tool-fleet/src/registry-permit-coherence.test.ts` produced a legal
old-source RED (6 passing, 6 failing), then corrected-source GREEN and restored
GREEN (15 passing, 41 assertions). Actual shell, files, boot/uptime, schema-3
commands and authority persistence are exercised. Capacity and metadata UID/GID
are modeled. Near-expiry fields are injected, with actual uptime advancing about
three seconds; this is not the thirty-second checker-death or native HTTP proof.

Eleven isolated guard mutations produced the expected behavioral failures:
fourth-attempt acceptance, missing changed-pair retry, absent final revalidation,
swallowed final-read failure, boot, expiry, permission mode, complete record,
canonical spacing, checksum exit status and checksum mismatch. The checksum
status fault prints the actual matching digest before exiting nonzero. The mode
fault remains readable, and the stat shim preserves real mode/type/link count.
Restored source SHA-256 is
`959a46958726b18d510a5b46907a85e912f5aa303fe7543810f9eaf1307ee326`;
only adjacent proof comments differ from the mutation receipt's original source.
The parent read all raw witnesses and verified their hashes in
`/tmp/task8-parent-coherence-removal-audit.json`; source/test hashes were checked
independently after the worker's terminal restoration checkpoint.

Initial fixture-permission and shell-syntax failures are retained as setup
failures. Exactly twelve owned fixtures from the syntax failure were removed
with inode/owner/path checks; an independent census confirmed their absence.
Corrected-source native guard regression, installed adoption and the complete
scenario audit remain pending. These local results do not close Task 4.2.

## Guard native development regression

The corrected startup guard was exercised as UID/GID59001 with pinned Distribution
inside disposable private mount/PID/UTS/network namespaces. Grammar run HOST19
terminated successfully in54.302seconds:18 named cases covered nine malformed
records, restart, both accepted journal hashes, mode/owner refusals and real HTTP202
witnesses after removing the failed-open, record-length and spacing checks.
The failed-open barrier pauses after checksum/final-B metadata, then holds the
next poll while observing the resulting HTTP405; removing propagation observes202.

Expiry run HOST21 terminated successfully in47.413seconds. Actual boot/uptime
permission expiration and restart returned405; removing expiry returned202.
Stable journal-hash mismatch returned405; removing its comparison returned202.
Both runs restored the copied startup source and reaped their guard groups.
Worker and independent parent audits confirmed the exact fixture paths, owned
processes/descriptors, loop backing associations and mounts were gone, with host
identity unchanged and more than20GiB root space available. The parent's mount
census covers its observer namespace; the worker separately checked process views.

The journal and permissions in these two runs are synthetic. Each entire namespace
and filesystem set is disposed; no authority is initialized. These are not actual
checker-process-death, authority interleaving, Docker-engine or installed-controller
proofs. The earlier HOST20 expiry run remains a failure after its checksum case
hit an unidentified transport error. An independent byte-identical Bun1.4.4 local
server-close probe demonstrated ECONNRESET; a fixture-only bounded handling change
passed six extracted-helper tests and five removal witnesses, with fetch/clock/sleep
modeled. HOST21 success does not establish HOST20's cause. Full matching-backup,
retirement/recovery integration and final deployed scenario audit remain pending.

## Native collection-dispatch evidence proof

Normal HOST25 completed17 grouped populated-registry checks: managed partial
publication, a verified matching registry/journal backup, exact deletion/staging
discard, offline GC and retained-content API reads. Missing retirement receipts
and mismatched snapshot lineage refused before a native GC child was created;
the valid case launched exactly one pinned Distribution GC child.

HOST26 removed only the actual collect-dispatch call to
`requireRegistryCollectionEvidence(journal)`. Its otherwise identical isolated
workflow recorded `{ "fault": "absent", "refused": false, "gcStarted": true }`
before failing the assertion. The observer increments only after the native spawn
returns a valid child PID, preserves that child and every argument, and emits its
fixed observation before assertion or error propagation. This proves the caller
invokes the admission check on the real root GC path. A nonzero exit alone was
not counted: the earlier HOST24 attempt never reached GC and remains inconclusive.

The injected fault cleared `journal.retirements`; a physical verified backup still
existed. This proves durable retirement-receipt admission, not absence of all backup
content. The mutation failed as expected after101.343seconds, and its synthetic
controller state remained suspended with the writer replicas stopped and service
withdrawn. Both worker and parent cleanup audits found the exact owned fixtures
gone. After both audits, the original source was restored byte-for-byte to SHA256
`7a5d6c4689f2c9ba5789f26192c58d96faf5418c5ff37ed54afe1814045791ea`,
with the actual admission call present once; the parent independently checked it.

HOST24 also exposed ESRCH while the guard observer read a child's proc environment.
The fixture now models that specific disappearing-process outcome as transition
or exited, alongside ENOENT; ten exact-closure tests and three removals preserve
access/unknown/invalid-identity refusals. Proc reads/lifetime are modeled in those
unit tests; the native run supplied the observed ESRCH boundary. This does not
identify HOST22's earlier monitor failure or alter production writer admission.

These runs use tiny enforced storage, minimal OCI content, synthetic Kubernetes,
consumer and local-provider ports, and explicit accelerated retirement/discard
clocks. They do not complete Task4.2, real Docker/index coverage, process-kill
recovery, physical ENOSPC/rebind proofs, real-provider budgeting or installed adoption.

## Retained multi-platform index rehearsal

HOST30 reached all four managed OCI index publications, each with a complete
bounded18-event HTTP receipt, three actual authority promotions and retirement.
The actual matching registry/journal backup, API unlink, staging discard, native
offline GC and retained-content checks passed before Docker startup. The checks
preserved three indexes, their six untagged child manifests and shared layer
content, and confirmed absence of the eligible unpromoted release. This uses
synthetic consumer/controller/provider ports and a trusted accelerated fixture
clock. It does not independently isolate current-plus-two rollback from the newest
ten promotions or prove shared-root repeated retirement.

The full run FAILED at the first amd64 Docker daemon startup, before any pull.
Its pinned Docker29.1.3 stack maps to an initialization refusal about missing
devices cgroups followed by a nil events-service shutdown panic in the upstream
source. The chroot had no cgroup filesystem. This is primary-source line
correlation, without independently identical Ubuntu package-source provenance.
The earlier HOST29 HTTP failure did not reproduce; its status and cause remain
unknown. Both HOST30 resource audits passed, and all90 source/nine payload pins
matched after termination. No Docker pull or complete Task4.2 success is claimed.

## Read-only cgroup-view prerequisite

The first separate mount-only proof FAILED in2.715seconds at its superblock
check. A fresh private cgroup namespace and cgroup2 mount exposed actual
per-mount `ro,nosuid,nodev,noexec`, a read-only statvfs view and namespace root `/`,
while the shared superblock retained its host read-write flags. The check refused
before the no-body write-open probe or the held-view host comparison. The receipt's
false held-view flag means that stage was not reached. Both normal unmounts
succeeded. Worker and independent parent audits confirmed exact tree, namespace,
process, descriptor, mount, backing-reference and lock cleanup, unchanged host
namespace/mount flags, and more than20GiB free root space. All14 frozen artifact
pins matched afterward.

The prerequisite requirement was corrected: enforce per-mount read-only access,
actual `EROFS` on `O_WRONLY` without writing, and unchanged shared-superblock
flags and host state before/during/after. The [Linux mount contract](https://man7.org/linux/man-pages/man2/mount.2.html)
permits per-mount read-only access over a read-write superblock and warns that
shared-superblock remount changes affect other mounts. No superblock remount,
controller write, process migration or delegation is allowed.

The corrected mount-only proof then passed in2.495seconds. Actual write-open
returned `EROFS` without writing, the private mount stayed read-only over the
unchanged shared superblock, and host state matched before, while the view was
held open, and afterward. Both normal unmounts and separate worker/parent exact
resource-cleanup audits passed; all16 frozen artifact pins still matched. This
proves the read-only view prerequisite. The subsequent Docker proof remains
pending; no new production safeguards have been activated.

The integrated HOST31 run subsequently passed its read-only cgroup checks,
92 periodic host-state comparisons and normal cgroup/proc teardown. It FAILED
before promotions, retirement, GC or Docker: three publications completed with
18 HTTP events each; the fourth received HTTP405 on its first blob-upload POST.
The actual guard or lease decision causing that refusal remains unknown. Both
resource-cleanup audits passed and all90 source/nine payload pins matched after
termination. This does not identify HOST29's earlier failure or establish a
successful Docker pull. Bounded guard-decision correlation is the next diagnostic.

## Guard-decision diagnostic and Docker unpacking boundary

A separate fixture copy instruments the pinned startup script with 25 marked
assignment/output lines. Removing those lines reconstructs the production script
exactly; its original SHA remains unchanged. Both artifacts are independently
verified before the UID 59001 guard starts. The transformed copy has SHA256
`f763d7de403239c8c3231be1a52e7b6d35605c9f95eae8cb012442ee0bbf4760`.
Sixteen local tests with 70 assertions compare actual shell outcomes for valid, malformed,
hash, expiry, final-open, final-read and revoked-file cases; UID/GID metadata are
modeled. Twelve separate guard removals produced behavioral assertion failures.
The strict parser bounds bytes/count, rejects malformed or inconsistent records
and reports unrelated stderr as a boolean without reflecting its contents.

HOST32 failed after 118.511 seconds at the first amd64 Docker pull. All four managed
publications, three promotions, retirement, actual matching backup/deletion/GC and
retained-content assertions passed first. Eleven valid decision records included
an initial missing-permit refusal followed by allowed decisions, including
successful second/third samples. There was no sample exhaustion or HTTP 405. These
records describe desired state after sampling, not a server acknowledgement or
continuous admission guarantee. HOST31's refusal remains unexplained; no guard
behavior was changed or claimed fixed.

Docker started, but layer registration returned
`remount /, flags: 0x84000: invalid argument`. No successful pull or arm64 attempt
is claimed. The [pinned upstream unpacking path](https://raw.githubusercontent.com/moby/moby/docker-v29.1.3/vendor/github.com/moby/go-archive/chrootarchive/chroot_linux.go) changes root mount propagation
before switching roots, while the frozen fixture created its chroot root only as
a directory. This is a concrete source-level incompatibility and a matching native
error, without exact Ubuntu binary/kernel-source provenance. A correction that
mounts only the owned empty test root onto itself is being prepared for review.

Both Docker processes exited cleanly during requested teardown. Normal cgroup/proc
unmounts, 227 periodic host-state comparisons, both exact resource-cleanup audits
and post-terminal checks of 91 source and nine payload pins passed. The full lifecycle,
uncached platform pulls, remaining failure proofs and installed adoption stay open.

HOST33 passed the owned-root mount and actual `0x84000` propagation preflight,
preserved the read-only cgroup view, and normally unmounted the owned root last.
The run failed before promotions, retirement or Docker. Three publications passed;
the fourth reset during a blob-start POST from uptime 3176307.070 to 3176307.090,
overlapping a validated `sample-limit`, final-sample, attempt-three read-only
decision at uptime 3176307.08. This establishes an actual exhaustion decision and
transport correlation, without treating desired mode as acknowledgement or
attributing HOST31's earlier refusal. Both cleanup audits and all 91 source/nine
payload pin checks passed afterward.

The permission-overlap contract was refined before implementation: a fully
validated final permission that authorizes the sampled checksum can succeed despite
a changed initial record. Only changed valid samples without that authorization
can retry, still capped at three; stable mismatch and all final validation failures
refuse. Current/next hash preparation, next-only reopening and revocation before a
fenced replacement remain unchanged. The controlled counterexample and corrected
implementation are recorded below; installed adoption remains pending.

## Final-permission correction and successful platform pulls

Before changing the guard, two actual-authority interleavings failed against the
old implementation: a compatible commit before checksum needed two samples instead
of one, and three queued compatible commits exhausted the old three-sample rule.
The fixture uses actual journal/flock/fsync/permit updates with modeled capacity
and UID/GID metadata. This establishes the predicate defect independently of the
unexplained earlier HTTP refusals.

The corrected coherence suite passed **27 tests/79 assertions**; together with the
unchanged diagnostic-parser suite it passed **43 tests/149 assertions**. Actual
commits after checksum with disjoint final permission converge in two samples when
quiet, or refuse after three unproved attempts. Six isolated mutations failed the
precise covering assertions: fourth attempt, stale initial permission, retrying a
stable mismatch, omitted final read, omitted changed-record retry and omitted
final checksum match. Stable-mismatch retry removal proves immediate refusal,
not acceptance of an unsafe grant. Final metadata/boot/revocation/expiry and
checksum-status negatives remain covered. Library/spec typechecks, shell syntax,
ShellCheck and scoped formatting passed; these are not the full host gate.

Normal startup SHA256 is
`020d445290293563758ac52529abb65e7a3bb633bd75414564d411eb7824a220`.
The separately bound diagnostic copy is
`ff8846339c0cf636cd0e116e2086d58328b7aff34cbb27f7aadf23735c3768d1`;
removing its marked lines reconstructs that normal script exactly. Diagnostic
records still describe desired state, without proving server acknowledgement.

HOST34 passed in **117.029 seconds**, exit0 without timeout. All four managed OCI
index publications, three promotions, matching registry/journal backup, exact
retirement, API unlink, offline GC and retained-content checks passed. Six untagged
platform children and their shared layer survived. Two independently empty Docker
stores then pulled amd64 and arm64 images, checked their selected configurations,
unpacked two layers each and verified the expected files. Both owned Docker
process groups terminated successfully with no cleanup failures.

This run uses synthetic Kubernetes/consumer/history/provider admission and an
accelerated eight-day retirement authority clock. Eleven valid guard observations
include an initial missing-permission refusal followed by allowed first-attempt
decisions; they do not count actual authority crossings or prove continuous mode.
The owned-root propagation check, read-only cgroup view and actual EROFS write-open
refusal passed. All222 periodic host root/cgroup snapshots and the final snapshot
matched. Normal teardown unmounted the owned root last and detached all four loops.

Independent worker and controller audits found the exact fixture, its three
namespaces, process/descriptor references, loop backing and outside lock processes
absent. The worker scanned all process mount views; the controller scanned its
observer mount view and namespace descriptors. Both verified host state and more
than20GiB root reserve. All91 source and nine payload pins matched after termination.

The complete Task4.2 remains open: unsafe-GC and partial post-unlink failure witnesses;
owner/root interruption and backend-lock recovery; killed GC/restore; physical
registry ENOSPC with independently healthy journal; verified recovery rebind and
ordinary CLI continuation; remaining R5 proofs, affected checks and independent
review. Corrected-source guard negatives are recorded below. Backup budgeting, delivered monitoring, installed scenario
audit and the final exact-revision host gate are also incomplete. No new production
storage safeguards have been activated.

## Corrected-source grammar, expiry and teardown regression

HOST35 passed **18 actual HTTP guard cases/135 upload probes** in55.451 seconds
using UID/GID59001 and pinned Distribution. Cases include failed final permission
open, malformed record bytes, both permitted hash positions, wrong owner/mode,
restart and parser-removal witnesses. The synthetic journal/permit was never
initialized as an actual authority. All owned guards terminated and the normal
startup bytes were restored.

The worker found a fixture teardown omission before claiming normal cleanup:
its optional cgroup-unmount flag covered index mode but omitted the two guard
modes. Namespace destruction removed the private cgroup view; both independent
resource audits found no remaining references. HOST35 therefore proves its guard
behavior and final resource absence, without claiming explicit cgroup-before-proc
unmount. Its96 periodic host root/cgroup snapshots and final comparison matched.

The fixture caller was corrected to include exactly the two mounted guard modes.
Tests execute the actual caller expression with only the privileged reaper
substituted: **3 pass/2 fail** before correction, **5 pass/10 assertions** afterward.
Removing either inclusion separately produced **4 pass/1 behavioral failure**;
restoration returned5 pass. Production guard bytes and all execution bounds stayed
unchanged. HOST35 was not repeated to obtain a different cleanup receipt.

HOST36 then passed **4 actual guard cases/18 upload probes** in46.914 seconds.
An actual30-second unrenewed permission expired to HTTP405 and restart preserved
that refusal; removing expiry admitted HTTP202. A stable checksum mismatch returned
HTTP405; removing the corrected final-checksum predicate admitted HTTP202. Source
restoration and owned-guard termination passed. This is synthetic permit
nonrenewal, not actual checker-process death or installed control-plane proof.

HOST36 explicitly unmounted the cgroup view before proc, then unmounted its owned
root last. All85 periodic host root/cgroup snapshots and final comparison matched.
Both independent audits found its exact fixture, three namespaces, descriptor and
mount references, loop backing and outside lock processes absent, with host state
unchanged and more than20GiB root reserve. All91 source/nine payload pins matched
after termination. These corrected-source regressions complete the scoped guard
checks; the remaining Task4.2 lifecycle and installed acceptance work above remains
open.

## Fourteen-release retention across two environments

The local authority fixture passed **11 tests/51 assertions**, using actual
journal/flock/fsync/publication/enrollment/deployment transitions with modeled
capacity, image verification, consumer observations and clock. Fourteen original
promotion receipts establish old environment history3,2,1 and new history14 through4.
The pure production planner selects only release4 when current-consumer roots are
explicitly modeled as3 and14. Reducing its rollback-history cutoff from three to
one wrongly adds releases1 and2 to retirement; the exact policy was restored.
Native deployment protections remain intact, so this isolated negative does not
claim a one-line bypass of the complete native system.

Fifteen additional scoped fixture-predicate removals failed their covering
assertions: ordered/complete/count history evidence; promoted/count and unfinished
publication/reservation/deployment/staging/orphan census checks; history-mode
teardown/direct dispatch; and required census receipt. Their inputs or privileged
reaper are substituted locally. An initial count-removal run passed because an
inconsistent history masked its fault; it is preserved as inconclusive. The
corrected consistent thirteen-release case fails when the count check is removed.
Library/spec typechecks and scoped formatting passed. Removing the sole added
policy Proof comment reconstructs the exact tested normal policy bytes.

HOST37 passed in **169.687 seconds**, exit0 without timeout. All fourteen managed
OCI index publications had complete18-event HTTP observations and all fourteen
actual promotions completed. Promotion and retirement used real authority clocks
and untouched original receipts. The complete pre-effect physical/API census
confirmed promoted bundles, settled deployments and no unfinished or staged work.

The older environment retained current release3 and priors2 and1 outside the
newest-ten window5–14. Only release4 retired, removing its three manifests after
verified matching backup, API unlink and offline GC. All thirteen retained indexes,
twenty-six untagged platform children, configurations and layer contents remained
readable with matching hashes. Original bundle/environment provenance remained
unchanged, and the terminal journal retained its fence and verified backup.

Kubernetes, complete consumer/history observations and local provider admission are
synthetic. The inherited outer introductory label still mentions the older Docker
and accelerated-clock fixture; the actual fixed selector, source and history
receipt establish that this mode used real clocks and did not repeat Docker pulls.
The original receipt is preserved; the label will be corrected for later packets.

Normal teardown unmounted cgroup before proc and the owned root last. All326
periodic host root/cgroup comparisons and the final comparison matched. Both
independent audits found the exact fixture, its three namespaces, process and
descriptor references, loop backing and outside lock processes absent. The worker
scanned all process mount views; the controller scanned its observer mount view
and namespace descriptors. Host state matched and root reserve exceeded20GiB.
All93 source/nine payload pins matched after termination.

Interruption and recovery, physical exhaustion, remaining R5/check/review work,
backup budgeting, delivered
monitoring and installed adoption remain incomplete. Task4.2 and the overall goal
remain open.

## Shared independent roots and fresh repeated retirement

The local byte fixture establishes two complete older publications sharing exact
repository/rootA with distinct unique rootsB1 andB2, plus a different currentC.
The local two-retirement authority test passed **1 test/16 assertions**: actual
initialize/enroll/reserve/finish/promote/protect/upgrade, journal/flock/fsync,
physical census, coordinator sessions and durable retirement receipts. HTTP,
barriers, capacity/image/reader observations, backup verification and GC effects
are modeled; filesystem unlink is real. It uses the original protection token,
distinct operation/snapshot identities, fresh census hashes and unchanged original
bundles/history. Replacing the production residual-root filter with blanket
exclusion of prior retired operations strandsA: the second plan incorrectly
becomes empty. Restoration returns1 pass/16 assertions. This negative proves
residual-reclamation liveness, without claiming unsafe current-image deletion.

Scoped route/teardown/operation-identity removals each failed actual caller tests.
The affected suite passed **60 tests/199 assertions** before the fixture tag
boundary adjustment below; the amended focused suite passed **12 tests/53 assertions**.
Library/spec typechecks and formatting passed. Initial callback type failures
were retained and corrected by preserving the uploader ownership callback while
awaiting its return. Production inventory/policy and normal startup bytes remained
identical to the prior native packet.

A small independent probe of the pinned Distribution binary confirmed HTTP200
with explicit tags:null for an owned empty tag directory. The new fixture now
models that known empty response while still requiring exact tags for retained
images. Missing/malformed fields, wrong name/status and retained-null refuse;
four separate predicate removals fail those assertions. The probe stopped its
exact process and removed its owned directory. This component probe is not an
actual deletion or GC result.

HOST38 passed in **172.781 seconds**, exit0 without timeout. Three actual managed
publications produced complete36/36/18-event HTTP observations. An actual current
promotion and independent protection retainedA. The first fresh maintenance
backed up and verified the matching registry/journal pair, unlinkedB1/B2 and ran
offline GC: six unique manifest revisions retired whileA andC survived.

After a legitimate canonical protection-token release, a distinct second
maintenance used a fresh backup identity, census and plan. It retiredA and its
two platform manifests from the same two original partially retired operations.
Both original publication bundles and environment history stayed unchanged.
Repository tags, retained configuration/layer hashes and exact removed-content
absence passed after each epoch; currentC and the shared layer survived.

Only post-publication authority time advances synthetically by eight days for
both retirements and the intervening release. The root refreshes its fixed
timestamp before each sequential owner process; original uploads, promotion and
protection acquisition use real time. Kubernetes, complete readers and local
provider admission are synthetic. This does not prove elapsed grace, installed
control-plane behavior or the complete Task4.2.

Normal teardown unmounted cgroup before proc and the owned root last. All332
periodic host root/cgroup comparisons and the final comparison matched; all four
loops detached and the canonical lock released. Both independent audits found the
exact fixture, three namespaces, process/descriptor references, loop backing and
outside lock processes absent, with matching host state and more than20GiB root
reserve. Worker mount census covers all process views; the controller covers its
observer view and namespace descriptors. All95 source/nine payload pins matched
after termination. The172.781-second result remains within the existing180-second
inner bound and does not authorize extending it or adding more work to this case.

Unsafe-GC and partial post-unlink tag-cleanup witnesses, actual interruption and
backend-lock recovery, killed GC/restore, physical registry ENOSPC with independent
journal, verified rebind/offline journal/current obligations and ordinary CLI
continuation remain pending, along with the full checks, independent reviews,
backup budgeting, delivered monitoring and installed adoption.

## Backup interruption rehearsal: failed before fault receipt

The new fixture's local suite passed **25 tests/120 assertions**, including exact
process identities, orphan-parent handling, bounded terminal receipts and specific
waitpid error handling. Twenty-eight independent predicate removals failed the
corresponding assertions; these are modeled component proofs. An initial duplicate
record mutation was masked by another check. Its corrected extra-empty-record
witness failed independently. The initial raw log was overwritten; its original
tool transcript remains, and no separate preserved raw file is claimed.

HOST39 owner-loss rehearsal failed in **63.560 seconds**, exit1 without timeout.
Initialization and the baseline backup completed; a fresh backup snapshot began.
The fixture emitted an unknown failure at the aggregate wrapper around owner exit,
stdout, stderr and interruption monitor outcomes. That location does not identify
the nested cause. No selected owner-kill receipt, pending interrupt, controlled
restic exit, backend-lock reconciliation or retry was established. Guardian-loss
and deadline packets remain held. Diagnostic preparation will expose only fixed
outcome slots and sanitized numeric locations before preserving the same failure.

Normal outer teardown unmounted cgroup before proc and the owned root last,
detached all four loops and released the canonical lock. All115 host root/cgroup
periodic comparisons and the final comparison matched. Both independent cleanup
audits found the exact fixture, three namespaces, process/descriptor references,
loop backing and outside lock processes absent. Worker mount checks cover all
process views; controller mount checks cover its observer view. Host namespace
and cgroup flags matched the prior baseline, root reserve exceeded20GiB and all97
source/nine payload pins matched after termination. These cleanup results do not
convert the failed interruption rehearsal into a behavioral pass.

The diagnostic-only HOST42 run also failed, in **63.143 seconds**, exit1 without
timeout. It identified the rejected outcome as the interruption monitor and mapped
the exact bundle frame to the production process reader's combined root-UID,
root-GID and live-state requirement. This identifies the rejecting predicate,
without identifying the candidate or failed field. No selected fault or controlled
backup termination is established. The fixture now needs an exact-input role and
state diagnostic before a functional correction can be justified.

HOST42 normal teardown, all114 host comparisons and the final comparison passed.
Both independent audits found the exact fixture, three namespaces, process and
descriptor references, loop backing and outside lock processes absent; host state
and the20GiB reserve matched their required checks. The worker additionally checked
all process mount views and its queue label. All97 source/nine payload pins matched.
The diagnostic boundary's local extracted-body test passed18 assertions; removing
either original-error or reporter-error preservation failed its exact assertion.
These modeled tests and cleanup results do not establish native interruption
success.

HOST44 supplied the exact rejecting input: a worker-thread child encountered before
backup-command filtering had root UID/GID but stateZ. The strict live-process
reader correctly refused that zombie. Its former command remains unknown. The
run failed in **60.190 seconds**, exit1 without timeout, before establishing the
selected fault. The fixture's next correction selects exact pinned backup argv
before applying the unchanged live-root and process-identity checks; this does
not turn nonmatching children into evidence of worker or process-group absence.
A separate owned local fork confirmed stateZ with an empty command line, then was
reaped and its proc entry disappeared. That component observation does not
establish the failed host child's former command or native cancellation behavior.

Before HOST44, all eight process-reader call sites gained fixed-role, root-UID,
root-GID and state observations from the original read inputs. The existing strict
parser and read count stayed unchanged; logging failures preserve both errors.
The extracted caller/parser tests passed **3 tests/60 assertions**. Eight earlier
independent diagnostic removals and two direct-call bypass removals failed actual
assertions. The extracted observer body retained identical TypeScript AST kinds,
token text and child order, so those eight removals were not replayed. This is
modeled diagnostic evidence, not a native interruption pass. A prepared HOST43
packet was superseded and never accepted or executed.

HOST44 normal teardown, all111 host comparisons and the final comparison passed.
Both independent cleanup audits and all97 source/nine payload pins passed with
more than20GiB reserve. The worker covered all process mount views and its queue
label; controller mount scope remains its observer view. Actual owner/guardian
loss, deadline, cancellation and backend-lock recovery acceptance remain open.

## Selector correction and approved owner-loss rehearsal

The fixture now reads bounded candidate argv before applying the unchanged strict
process checks. It excludes empty or unrelated argv from fault-target selection,
then requires the selected process's fresh root identity, parent, group and argv.
A changed argv after preselection refuses instead of silently becoming a nonmatch.
Ten selector cases passed18 assertions, including one preselection ENOENT followed
by successful convergence. The affected five-file suite passed **28 tests/189
assertions**; both typechecks and formatting passed.

Four independent removals failed their exact assertions: removing preselection
reached the unrelated zombie refusal; removing the byte bound lost its explicit
refusal while a later bounded-loop refusal remained; removing the fresh argv
comparison wrongly accepted a changed command; removing existing ENOENT handling
broke the convergence case. The initial RED suite's UID/Z cases were masked by the
unrelated zombie and are not independent selected-identity witnesses. One initial
expected error string was corrected to match the existing parser text. No
production process validator, timer or cancellation behavior changed.

HOST45 was frozen before execution. Independent build bytes, all97 source/nine
payload pins, archive membership, coordinator bindings and all six reviewed diffs
matched. Automatic approval review initially rejected its launch before process
creation, requesting explicit authorization for transferring the private package
to the private host, acquiring the shared heavy lock and terminating owned test
processes. That attempt created no session and no workaround was attempted. The
user subsequently explicitly approved the reviewed h4claw rehearsal. Fresh pins
and duplicate-run checks passed, then the original driver launched exactly once.
The initial approval rejection was separate from the subsequent native run
recorded below.

The approved HOST45 run failed in **134.594 seconds**, exit1 without timeout.
The selector correction progressed to the intended fault: the actual owner exited137,
the actual contention probe exited0, and the monitor observed pending SIGINT,
the worker's held canonical descriptor and eventual exact process-group absence
within598ms. These are observed time points, not continuous exclusion sampling.
The durable fence and prior verified-backup assertions passed. The subsequent
contender-acquire command exited1; its reported frame identified the generic
owner-stage assertion, not the underlying error. The controlled restic130 receipt,
lock cleanup, reconciliation and verified retry assertions were not reached.
The complete rehearsal therefore failed.

Normal teardown, all255 host root/cgroup comparisons and the final comparison
passed. Both independent cleanup audits found the exact owned fixture, all three
namespaces, process/descriptor references, loop backing and outside lock processes
absent. Root reserve exceeded20GiB and all97 source/nine payload pins matched.
Worker mount census covered all process views; controller mount census covered
its observer view, with namespace descriptors checked separately.

A separate local reproduction used the actual canonical journal, flock/fsync,
write-permit and check-capacity implementations with modeled capacity. Its
measurement callback ran under the actual lock and the fence remained set.
Providing an ordinary-supervisor permit port without starting that supervisor
necessarily failed its readonly acknowledgement; two unchanged35-second waits
produced a70.332-second refusal. The exact owned local fixture was removed after
inode/owner checks and no child processes were created. This establishes an
independent fixture contract incompatibility, without authenticating HOST45's
omitted child-stderr cause.

The offline T2 correction omits only that optional ordinary-supervisor
port while retaining the actual canonical lock, journal, physical measurements,
fence and group-absence callback. This is an explicit fixture substitution;
ordinary CLI/permission and image continuation remain mandatory separate Task8
acceptance. Failed owner diagnostics use the existing bounded receiver so
later failures expose validated clues while retaining failure status.

## Owner-loss cancellation and verified retry

The corrected offline T2 caller invokes the actual canonical journal/flock and
check-capacity implementation, retaining its group-absence callback and physical
capacity checks. Only the optional ordinary-supervisor port is omitted. Local
RED tests exposed both the missing-supervisor dependency and discarded owner
diagnostics; an intermediate unfenced test setup was corrected using the actual
maintenance upgrade and a deliberately failed maintenance callback. The final
affected six-file suite passed **30 tests/202 assertions**; both typechecks and
formatting passed. Three scoped removals failed the actual caller assertions:
restoring the absent supervisor dependency, dropping the bounded parsed diagnostic
and losing the original stage failure when its reporter throws.

HOST46 passed in **97.628 seconds**, exit0 without timeout and empty stderr.
The actual owner exited137 after the fixed kill; the contention probe exited0.
The monitor observed pending SIGINT, the worker's held canonical descriptor and
exact process-group absence within620ms. The subsequent offline T2 authority
acquisition succeeded after group absence. These are two sampled authority points,
not a continuously observed exclusion interval.

The root-owned bounded terminal receipt bound the exact worker and restic PID to
controlled restic exit130 with no terminating signal. The previous verified
backup and durable fence survived. The backend lock was absent before legitimate
reconciliation; that reconciliation removed no backend lock version, settled the
interrupted attempt, then a fresh snapshot and verification completed. A distinct backup became the journal's last verified backup with no prepared
attempts or residual locks, and service restoration completed. This establishes the scoped owner-loss
case against the real guardian/worker/restic and journal, while Kubernetes,
complete readers, provider admission and the offline T2 optional supervisor port
remain explicitly substituted. Ordinary CLI/permission behavior and installed
adoption are not established by this case.

Normal teardown, all183 host root/cgroup comparisons and the final comparison
passed. Both independent cleanup audits found the exact fixture, all three
namespaces, process/descriptor references, loop backing and outside lock processes
absent; root reserve exceeded20GiB and all97 source/nine payload pins matched.
Worker mount census covered all process views and its queue label; the controller
covered its observer mount view plus process and namespace descriptors.
Guardian-loss and deadline cases are being prepared as separate fixed selectors
of the same build, without changing timers or increasing containment budgets.
The full Task8 and Tasks9–11 acceptance remains incomplete.

## Guardian loss and forced cleanup

HOST47 passed in **101.928 seconds**, exit0 without timeout and empty stderr,
using the same97 source pins and exact build as HOST46. Only the fixed Python
selector and receipt labels changed. The fixture killed the exact current root
guardian while restic was stopped at its ciphertext-lock boundary. The owner
returned1; the worker observed control EOF, became the exact PID1 orphan, retained
the canonical descriptor and received pending SIGINT. The nonblocking
probe confirmed contention while that descriptor was held. Forced cleanup completed with
exact process-group absence after **5.068 seconds**.

After group absence, the offline T2 authority callback ran. The root-owned
terminal record bound the exact worker/restic identity to exit137
with SIGKILL. The previous verified backup and fence survived, and the exact
backend lock remained. Legitimate reconciliation recorded removal of that lock,
then a fresh snapshot/verification completed with no prepared attempts or residual
locks. This proves the scoped guardian-loss path, not foreign-lock or provider-version
history preservation, timer-removal behavior, ordinary permission integration or
installed adoption. Kubernetes/readers/local provider admission and the offline
T2 ordinary-supervisor omission remain explicit substitutions.

Normal teardown, all192 host root/cgroup comparisons and the final comparison
passed. Both independent audits found the exact owned fixture, all three
namespaces, process/descriptor references, backing associations and outside lock
processes absent, with more than20GiB reserve. All97 source/nine payload pins
matched after termination. Worker mount census covers all process views and the
queue label; controller mount census covers its observer view and namespace
descriptors. The deadline case retains the same build and containment budgets.
Its120-second native-fixture deadline tests the actual root-control mechanism;
the installed production CLI's one-hour setting remains unchanged. Source review
confirmed the census readonly helper closes before the held snapshot begins, so
its earlier timer does not overlap this deadline test.

## Root deadline before owner cancellation

HOST48 passed in **151.380 seconds**, exit0 without timeout and empty stderr,
using the same build and97 source pins as the owner/guardian-loss cases. It
performed no baseline backup or retry: lastVerifiedBackup began and remained null.
The actual snapshot failure recorded ownSignalAborted:true, rootDeadline:true,
ownerCancellation:false and other:false. Pending SIGINT, the held canonical
descriptor and exact process-group absence were observed within **122.220 seconds**
of the held effect. T1 contention and subsequent offline T2 acquisition passed;
the exact backend lock and fenced active maintenance evidence remained.

The final receipt explicitly records deadline-before-owner cancellation and no
reconciliation/retry. This case does not assert an exact restic137 terminal
receipt and does not establish elapsed enforcement of the production CLI's
one-hour setting. Kubernetes/readers/local provider admission and the offline T2
ordinary-supervisor omission remain declared substitutions.

Normal teardown, all291 host root/cgroup comparisons and the final comparison
passed. Both independent audits found the exact fixture, all three namespaces,
process/descriptor references, backing associations and outside lock processes
absent, with more than20GiB root reserve. All97 source/nine payload pins matched;
worker mount census covered all process views and its queue label, and controller
mount census covered its observer view and namespace descriptors.

The three scoped interruption cases now pass. A separate R5 negative is being
prepared to remove only the compiled root timer's abort/cancel statements from an
immutable test payload while leaving production source intact. It must observe a
specific missing-deadline predicate, execute a fresh-identity-bounded owned rescue
and verify actual cleanup before its expected failure. Generic nonzero exit or
outer timeout will not count as a proof. The remaining Task8 failure matrix,
ordinary CLI/permission/image continuation, full validation/reviews and Tasks9–11
remain incomplete.

## Compiled deadline removal is detected

HOST49 is an **expected negative**, not a successful normal maintenance run. The
normal source and independently rebuilt bundle were preserved. Only the actual
shared root supervisor timer callback's abort and reader-cancel statements were
removed from an isolated compiled payload:110 bytes, with timer creation, cleanup
and every other byte unchanged. Production control source was never mutated.

The run returned1 in165.312 seconds without timeout. At130.580 seconds the exact
stopped restic had no pending SIGINT; fresh process identities and the same held
canonical descriptor were verified. The fixture explicitly terminated its exact
owned owner process, then observed owner termination and exact group absence at
135.627 seconds. The resulting snapshot failure identified owner cancellation,
with rootDeadline:false. Both rescue receipts were present and the monitor frame
mapped to the unique missing-deadline error, rather than a generic aggregate or
outer timeout. This proves the missing-signal check detects removal of the actual
compiled deadline effect. It establishes no production one-hour elapsed timing,
T2 acquisition, reconciliation, baseline backup or retry.

Normal teardown and319 host root/cgroup comparisons plus the final comparison
passed. The controller's independent cleanup returned0. The original worker
audit's complete success receipts and empty stderr survived, but its terminal
status was lost; that observation remains explicitly unknown in the unchanged
original receipt. One fresh bounded read-only confirmation returned0 with empty
stderr and durably recorded status. Both audit duties now confirm the exact
fixture, all three namespaces, descriptor/backing references and outside lock
processes absent, with more than20GiB reserve. Worker mount census covers all
process views and its queue label; controller mount census covers its observer
view and namespace descriptors. All97 normal source/nine payload/archive pins
matched after cleanup. The unsafe compiled artifact remains isolated evidence
and is not a base for subsequent builds.

The next two separately prepared cases target unsafe untagged GC and an actual
post-unlink tag-cleanup failure. Their native execution and the remainder of
Task8, full validation/reviews and Tasks9–11 are still incomplete.

## GC and partial-deletion preparation; admission failure

The two new fixed fixtures use actual managed publication of one expired
single-platform image and one explicitly protected OCI index. They create no
deployment-history claim. Kubernetes/readers/provider admission remain synthetic,
and only retirement authority time advances eight days after publication.

The restored local suite passed85 tests with247 assertions across seven files;
after adding schema-validated native process receipts, the affected controller
suite passed18 tests with22 assertions. Explicit library/specification type checks
returned0 with empty logs, and format checks passed. The separately observed
actual owned Bun child returned137 after SIGKILL with exitCode:null; its exact
process group was absent. The tag fixture now requires observed termination and
group absence before restoring its faulted file permissions.

Forty-eight initial guard removals produced44 assertion failures and four
inconclusive results. The inconclusive cases targeted the wrong cleanup caller or
had inputs still refused by another check. Seven focused follow-ups supplied
independent order/count/root/cleanup witnesses, a genuinely pending child-promise
check and original-publication-error preservation. Each failed its intended
assertion with the guard removed; normal source was restored. The original
resolved-promise terminal mock is superseded. Owner/byte/inode precondition
removals prove loss of the precise early refusal, while later defenses can still
refuse; they do not demonstrate complete unsafe-operation success. Removing both
native receipt emissions also failed their exact output assertions, followed by
a restored controller pass. Full Task8 R5 inventory remains incomplete.

HOST50 used the independently reproduced normal261-module build, with the timer's
abort/cancel statements intact. It returned1 without timeout in3.618 seconds at
canonical-lifeline readiness. The frozen coordinator's failure location precedes
workload creation and archive delivery, so the registry workload did not run.
This is an admission failure, with no GC or partial-deletion evidence. The
coordinator drained but discarded the wrapper status/stderr; the original cause
remains unknown. A later lock observation cannot authenticate that cause.

Both bounded read-only admission audits returned0 with empty stderr and durable
status. The exact marker was absent from process arguments and canonical label/
queue records. The worker also observed no Task8 fixture paths, backing references
or mounts in its observer view. Host namespace/cgroup/hostname baselines matched
and root reserve exceeded20GiB. No runtime namespace or PID identities were
emitted, so these audits do not invent the usual three-namespace cleanup proof.
All100 normal source/nine payload/archive pins matched after termination.

Only coordinator diagnostic preparation is released: bounded fixed stage/status/
known-reason reporting, preserving the original failure and existing containment.
No retry or tag-cleanup run is approved by this record. Both native witnesses,
partial-state census/recovery, full Task8 validation/review and Tasks9–11 remain
incomplete. Production safeguards have not been activated by this work.

## Unsafe GC is detected after a zero exit

HOST52 completed the deliberately unsafe-GC witness in105.183 seconds, controller
exit0 without timeout or stderr. The actual Distribution GC child returned0, but
`--delete-untagged` removed a platform manifest's repository revision link despite
its parent index being explicitly protected. The actual retirement owner returned1
in retained-content verification. Its frame24661:26 mapped to the unchanged
inventory throw, `Missing child manifest revision`, in the independently reproduced
normal bundle. This was the production inventory check, not the fixture's error
classifier.

Acceptance combined the actual GC PID/zero exit, completed collection followed by
readonly verification, the exact failure marker/frame, independent missing-child
revision observation, matching verified backup and durable failed fence. The index
root's API content hash still matched; that read alone does not prove its whole
image closure remains usable. No service-restoration action followed the fault.
Original managed-publication provenance survived. Kubernetes/readers/provider
admission and the post-publication eight-day authority clock remain explicit
substitutions; this case creates no deployed-environment, elapsed-grace, uncached
Docker-pull or completed-recovery claim.

All199 host root/cgroup comparisons and the final comparison passed. Teardown
unmounted the private cgroup before proc, removed the root mount last, detached
all four loops and released the canonical lock. Both independent audit duties
confirmed the exact fixture, three namespaces, descriptor/backing references and
outside lock identities absent, with more than20GiB reserve. The worker covered
all process mount views and its queue label; the controller covered its observer
mount view and namespace descriptors. The worker's remote audit child status0
was durably recorded; its final wrapper-poll observation was lost and remains
unknown. The controller observed its independent command return0. All100 normal
source/nine payload/archive pins matched afterward.

The added launcher diagnostics also passed11 local cases and nine exact removal
witnesses. Actual local canonical-lock contention was tested with explicit
identity/private-path substitutions; oversized already-drained output was a
modeled dependency fault. The failed large-child-output intermediate is preserved
as inconclusive. Neither those local results nor HOST52 identify HOST50's lost
startup cause. Only fixed stage/status/reason reporting and reporter-error
aggregation changed; lock timing, admission, ownership and the registry payload
remained unchanged.

This closes the unsafe-flag counterfactual only. The tag-cleanup case, partial-state
census/recovery, remaining Task8 failures and validation/review, backup budgeting,
monitoring and installed adoption remain incomplete.

## Exact deletion status and native local backup boundaries

A scratch copy of the current production `maintainRegistry`, with only its
relative imports relocated, passed four tests and32 assertions against an actual
local HTTP server, journal, kernel flock and physical census. HTTP500/404 are
refused by the earlier unchanged HTTP request helper; HTTP200/201 reach the
strict deletion-status check, which requires202. Removing only that check in the
copy produced two failures:200/201 wrongly persisted accepted deletion state.
Later physical reconciliation still refused, so this does not demonstrate verified
deletion, completed retirement or GC. Restoring the exact copy passed4/32 again.
The original production file was never edited. Copy/import/mutation/log hashes
were independently reconstructed. Capacity, backup, readers and image admission
were modeled; publication age used a synthetic eight-day authority clock, physical
seed content and actual reserve/finish receipts. No actual publication or elapsed
grace is claimed. The four cases are now integrated in
`tools/tool-fleet/src/registry-maintenance-delete-status.test.ts`; the accurate
production `Proof:` comment remains pending the frozen rehearsal's closure.

The existing enabled native backup-store test was also run against current source:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/task8-restic-native/restic bun test \
  --preload ./tools/test/scratch/preload.ts --timeout 30000 \
  tools/tool-fleet/src/registry-backup-store.test.ts
```

It returned0 with3 tests/12 assertions: the pinned restic binary backed up both
contents roots, verified the captured journal, restored the two subtrees and
refused a corrupted pack; loader-environment and missing-authority refusals also
passed. The actual inherited kernel flock and child lifecycle were exercised.
Admission was modeled and source/target directories were ordinary local
directories. This proves no physical quota, provider history, root guardian, UTS
isolation or installed recovery. The exact fixture and test root were independently
absent afterward.

A separate scratch native probe passed1 test/29 assertions using the same pinned
restic and current production store/lock functions. While an actual restic process
held an encrypted foreign lock, reconciliation refused its unmatched durable owner
before origin exclusion or deletion; the raw local census and ciphertext remained
unchanged. Ordinary effect admission refused the visible lock before repository
inspection, while reconciliation's bounded read-only repository inspection passed.
A second initialized repository was refused against the first repository's pinned
identity. A deliberately corrupt encrypted lock with a matching ciphertext-hash
filename failed actual decryption and remained untouched. No origin-exclusion or
removal callback ran. Provider versions, root-attempt metadata and origin ports
were modeled; no native provider-history or successful recovery claim follows.

The lock-holding fixture deliberately waited on empty input; closing that input
produced terminal3 with the exact no-data-read error, rather than a successful
backup. Initial setup failures are preserved: interruption with an open input,
empty-input status mismatch, a local Bun pipe-write `EPERM`, and a strict census
observing initial lock-file publication. The final fixture waits at most five
seconds for its owned lock publication before running the unchanged strict
production census. All owned children were terminal and authority closed before
removal; the exact final fixture was independently absent. No independent
PID/start census is claimed.

The native probe is now integrated in
`tools/tool-fleet/src/registry-backup-encrypted-lock.test.ts`, enabled by the same
`PUNI_TEST_RESTIC_BINARY` setting. Its corrected stream close is awaited; a fresh
enabled run passed1/29. The ordinary run visibly skips this native case when the
binary is not selected. The deletion-status cases passed4/32, the tool-fleet spec
typecheck passed, and scoped ESLint and formatting passed for both new files.
Initial integration typing/schema failures and the16-error lint failure are
preserved. Only the two new test files changed; all100 frozen rehearsal source,
nine payload, archive and packet bindings remained unchanged. The exact native
fixture and test root were independently absent; no independent PID/start census
is claimed.

A separate exact-copy check bound the current backup-attempt lineage guard to
all15 rejection cases, including the newer PID-namespace comparison. Current
source and existing tests were copied with reversible import relocation. Normal
27 tests/32 assertions passed; removing only `requireRegistryBackupAttempt`'s
compound condition and throw caused15 missing-refusal failures while the other12
tests passed. Restoring the exact copy passed27/32 again. Original source stayed
intact throughout. Guardian observations use modeled kernel read ports; this is
no proof of a root caller's mandatory invocation, installed IPC, or provider effects.

Remaining Task8 native failures, partial-state recovery, production proof comments,
full validation/review and Tasks9–11 remain incomplete. These checks have not
activated production safeguards.

## Partial tag-deletion rehearsal stopped before DELETE

HOST53 returned1 without timeout in96.588 seconds. The managed expired publication,
protected index publication and explicit protection succeeded. The retirement owner
returned1 after the fixed root dispatcher entered `serve-deletion`. The HTTP trace
contains reads but no DELETE; the tag-fault observation receipt was absent. The
intended HTTP500-after-revision-unlink witness remains unverified.

Owner frame27700:22 maps to the generic authenticated root `effect-failed` response
in the frozen normal bundle. Controller frame21059:40 maps to reading the absent
`deletion-fault.log`. Neither identifies the underlying root exception. The fixed
classifier's retained-stage label does not establish that retained verification or
GC ran. The original cause remains unknown; several pre-dispatch, guard, open and
metadata paths can precede the missing receipt. No functional fix follows from
choosing one without evidence.

The outer teardown unmounted the private cgroup before proc, removed its root mount
last, detached all four owned loops and released its canonical lock. All180 periodic
host root/cgroup comparisons and the final comparison passed. Both independent
read-only audits returned0 with empty stderr. They confirmed the exact fixture,
three namespaces, descriptor/backing references and three outside PID/start
identities absent, with more than20GiB host reserve. The worker covered all process
mount views and its queue label; the controller covered its observer mount view
and namespace descriptors. All100 normal source/nine regular payload/archive and
script bindings matched at closure. The earlier tool cancellation occurred before
dispatch; a fresh admission check and normal review preceded this single actual run.

This closes the failed run and its cleanup. Local fixture diagnostic preparation is
released: fixed failure stages and bounded owned-link metadata, preserving original
errors, topology admission and all functional predicates/lifetimes. It does not
authorize a new native run before packet review. The tag-failure witness, subsequent
strict census/recovery and remaining Task8/9–11 acceptance stay incomplete.

## Additional current guardian boundaries

Fresh exact-copy checks against the current guardian reader passed modeled input
cases, then independently removed each selected guard. The PID bound lost two
refusals, raw observation-size bounds lost four, and stat identity/grammar lost
three: invalid inputs returned a guardian identity. The restored input suite
passed14 tests/14 assertions. A separate machine-change input extends the existing
double-observation race suite: normal/restored28 tests/33 assertions passed, while
removing only its final comparison lost the four PID/boot/namespace/machine race
refusals. Earlier exact root-credential/liveness and mounted-proc checks retain
their separately recorded three/one removal witnesses.

The explicit incomplete-fields check had a different result: removing it left all
14 input cases passing because the final required-start-ticks schema still refused
the truncated record. This is a duplicate validation, not an independent safety
proof; consolidation is queued after diagnostic isolation with the final schema
and truncated-input negative retained. Overlong namespace input also remains
schema-refused when the raw-size guard is removed. All these observations use
modeled read ports and preserved source copies; they establish no actual kernel,
root caller, installed IPC or provider behavior. Repository integration of the new
input/race cases and production proof comments remains pending.

## Pinned Distribution tag permissions under the ordinary umask

A separate local probe ran the exact pinned Distribution binary against two tiny
owned repositories. Each real loopback listener was bound to its owned process
through the kernel socket inode before requests were sent. Blob and manifest PUTs
returned201 and produced the same71-byte digest links. With umask022, tag and
revision links were0644; with077, both were0600. The original fixture's0644-only
metadata condition rejects that second legitimate case. The production startup
script already sets umask077; this probe did not execute that whole script.

The probe used ordinary local directories and UID/GID1000, not the privileged
maintenance topology. Both controlled server groups were terminal and absent, the
exact fixture was independently absent, and allocation stayed below1MiB with the
required root reserve. The initial sandbox socket denial happened before a server
started; the same script then passed normal tool review and ran successfully.

This supplies a concrete fixture counterexample, while HOST53's unobserved original
exception remains unknown. The next candidate must accept only known safe original
modes0600/0644, require the same mode at ready, restore that exact mode only after
server/group termination and independently verify the physical restored mode.
Local mode/drift/restoration negatives and packet review precede any new native run.
Production permissions, writer fences and protected-content rules are unchanged.

## Partial tag fixture mode correction and HOST54 review

The private fault fixture now admits only original0600/0644, requires the same
mode at ready and restores that exact original after confirmed server termination
and group absence. Descriptor fstat verifies restoration; the controller separately
checks its strict receipt and actual path lstat. Production startup and writer
predicates are unchanged. HOST53's hidden original cause remains unknown.

Affected tests passed73 tests/398 assertions, with library/spec typechecks and
six-file formatting passing. Eight exact guard-removal or dependency faults each
produced behavioral failures, including unsafe0666, ready-mode drift, no-op or
widening restore, removed observation, receipt enum/equality and physical mode.
Restored source differs from tested snapshots only by five adjacent proof comments.
Full affected lint still fails92 errors; no asynchronous lifetime checks were
removed to appease static flow analysis. Full Task8 validation remains required.

Independent controller review verified71 current mode-evidence pins and146 prior
diagnostic pins, using the preserved diagnostic snapshots for superseded mutable
source paths. It reconstructed all mutation hashes and checked actual assertion
failures, including the two corrected receiver tests whose initial harness masked
acceptance. An independent261-module build is byte-identical to the frozen normal
bundle db0162e8cb4995cb99a68eae186366f4db3154a7e58ca0f0f63a59c1646f9c99.
All100 source pins, nine regular archive payloads, actual embedded helper and outer
script matched. Exactly three private runtime source files changed from HOST53.

The reviewed manifest415174bd0a649882d8f75af9dd07548e367e174c3220326e7215643fc8a09723
is authorized for one isolated HOST54 rehearsal after fresh lock availability,
pins and output-absence checks. The same896MiB aggregate storage envelope,21GiB
preflight/20GiB remaining reserve, private namespaces and bounded lifetimes apply.
This records preparation and review only: actual DELETE500 after revision unlink,
unchanged tag bytes, pending deletion, failed fence, matching verified backup and
protected-content verification still require native evidence. Source remains frozen
through terminal execution and both independent cleanup audits. No production
safeguard activation or full Task8 completion is established here.

## Native partial tag-deletion failure and cleanup verified

HOST54 returned0 without timeout in94.896seconds. Its complete HTTP observation
contains the actual manifest DELETE500. The expired revision link was absent,
while the original dangling tag bytes remained. The root fixture observed an actual
UID59001 server, its exited137/SIGKILL settlement and exact group absence before
restoring the original0600 mode. Descriptor and independent path checks both
confirmed0600. The controller required a pending deletion, no completed retirement,
no GC, a durable failed fence and matching verified backup. A fresh read-only
server returned200 with the expected hashes for every protected index manifest
and blob. The classifier's generic stage label is not used as phase evidence.

This run used actual managed publications and explicit index protection with
modeled Kubernetes/readers/provider admission and retirement-only clock advancement
of eight days. It proves neither deployed environment history, real elapsed grace,
uncached Docker pulls, strict partial-state census nor successful recovery. HOST53's
unobserved original exception remains unknown.

Normal teardown unmounted private cgroup before proc and the root mount last,
detached all four exact loops, removed the owned fixture and released the canonical
lock. All178 periodic host root/cgroup comparisons and final host/UTS comparisons
matched. Both independent read-only cleanup audits returned0 with empty stderr.
The worker scanned all process mount views and its queue label; the controller
independently checked namespace/path descriptors, backing references, its mount
view and the three outside PID/start identities. Both found the exact fixture,
three private namespaces and owned lock record absent with115064688640 bytes of
host reserve. The full100-source/nine-payload packet still matched at closure.

The controller independently read the full raw result and both audit outputs and
verified all worker receipt pins and its embedded remote audit. The source freeze
is released for the next local strict partial-census/recovery slice. This closes
only the scoped failure witness; successful recovery, GC/restore process kills,
physical registry ENOSPC with healthy journal, installed continuation, complete
R5 bindings, lint and all remaining Task8/9–11 validation/activation remain required.

## Local strict partial-state census and recovery regression

The first new regression runs existing production maintenance and recovery flows
against actual journal/flock and physically seeded image trees. A modeled DELETE
physically unlinks the expired revision then returns500. The subsequent production
census refuses the dangling current tag before any registry API request. Removing
only the current-tag/revision membership loop causes eight requests where zero is
required; the negative fails on that observable boundary. Restoring exact source
passes the focused test with12 assertions. This is not proof that the mutated
census succeeds: a later check may still refuse it.

The initial two-test run passed51 assertions. Its recovery case invokes
`stageRegistryRecovery` and the existing server verifier through the actual held
maintenance session. It checks canonical-lock contention/inode preservation,
matching staged journal bytes, current protections and publication provenance,
rebind to the recovered target, unchanged damaged original store and a fenced
activation handoff. The existing flow already passes, so no behavioral RED or
production recovery fix is claimed. An earlier socket denial prevented the local
HTTP listener; the same test then ran through normal tool review.

These are local regressions with copying backup, modeled device/capacity/runtime
and consumer ports, and HTTP bodies supplied from a contents map. They establish
neither actual Distribution restore serving, independent mounted storage, installed
activation nor ordinary CLI/permit continuation. Newer-obligation cases, final
scoped lint/types/format and the native recovery packet remain pending. The earlier
closed HOST54 failure proof is preserved independently.

## Modeled newer obligations during recovery projection

The expanded local regression passed four tests/73 assertions. Two added cases
model a trusted current authority view newer than the captured snapshot, then call
production recovery projection and census under the real held canonical flock.
A new protection over an existing backed-up closure is preserved and accepted;
a required root absent from the snapshot is preserved and refused. The actual
canonical journal is not rewritten to manufacture these modeled current views.
These cases verify projection/census behavior, not concurrent protection mutation
through a serialized live maintenance operation or the entire recovery verifier.

The test's spec typecheck returned0 with empty output. Final scoped ESLint returned0
with zero errors/warnings and formatting returned0 unchanged. Initial type and lint
failures remain recorded. The inventory source differs from the exact guard-removal
normal snapshot only by the accurate adjacent proof comment; its runtime behavior
is unchanged. The native recovery fixture remains in preparation, with actual
independent mounts, restic restore, server verification and activation continuation
still requiring their own evidence.

## Native recovery caller preparation and HOST55 review

The fixed recovery selector now reuses the actual partial-deletion seed, runs a
strict census under the original held retirement session, and invokes existing
`stageRegistryRecovery` with its server verifier. The controller requires exact
pre-API refusal, matching backup and offline journal, current obligation arrays,
canonical lock identity, restored revision, preserved original damage and a fenced
handoff. It leaves desired-state activation and ordinary publication unverified.

Local caller tests first failed for the missing behavior and then passed. A review
found that checking the entire action log would reject a legitimate bootstrap
backup restart. The real prefix reproduced that failure; corrected checks verify
append-only history and inspect only each relevant suffix, still rejecting later
service restoration. Matching-message non-Error and aggregate inputs cannot forge
the census marker, and cleanup/reporting failures retain the original cause.

The affected suite passed125 tests/557 assertions across seven files. Library and
spec typechecks returned0 with empty outputs; the three new tests and partial
census helper are lint-clean. Legacy runtime lint still fails38+26+5 findings, and
older test lint debt remains unresolved. Full Task8 validation is incomplete.

Independent review reconstructed22 original and five follow-up exact local
counterfactuals. One original TypeError is explicitly limited evidence and replaced
by a precise assertion follow-up. The remaining assertion/refusal/dependency cases
are valid only for extracted actual fixture bodies with modeled ports; they do not
prove native privilege, process lifetime or physical recovery. The current source
transfer preserves those checks through formatting, import order and typed boundary
cleanup. All258 covering pins,100 registry source pins and nine regular archive
payloads match. An independent262-module build is byte-identical to the packet.

HOST55 is authorized once after fresh canonical lock availability, pins and output
absence checks, using final manifest9f482eb3980f4c858e39cad768ee4c776aef9da585a4006f5ede1417552a3c04.
A stale selector/clock metadata label was corrected before execution; source and
payload bytes did not change. The896MiB aggregate envelope,21/20GiB host reserves,
private namespaces, read-only cgroup view and all existing deadlines are unchanged.
This is preparation and review only. Source stays frozen until actual execution
and both independent cleanup audits finish; no production activation is authorized
by this rehearsal result alone.

## HOST55 stopped at the readiness observer before publication

HOST55 returned1 without timeout after46.983seconds. Initialization, the bootstrap
backup and reopening completed. Publication had not started when the readiness
observer failed. No tag fault, strict partial census or recovery was reached.
The recovery witness remains unverified.

The frozen bundle frame25605:41 maps to reading an unselected candidate process's
`/proc/<pid>/cmdline` inside `waitMode`. The bounded classifier maps
`process-absent` exclusively to Error.code ESRCH. Candidate identity and lifetime
were not captured, so this is no proof that a selected Distribution process died.
The observer already retries ENOENT, connection refusal and timeout/abort; ESRCH
currently propagates. Local correction will test bounded retry for this expected
candidate-observation outcome while retaining full argv/UID/mode/HTTP readiness,
unknown-error refusals, parent-lifetime checks and the existing timeout.

All83 periodic host root/cgroup comparisons and the final host/UTS comparisons
matched. Normal teardown removed cgroup before proc and the root mount last,
detached all four owned loops and released the canonical lock. Both independent
cleanup audits returned0 with empty stderr. The worker covered all process mount
views and its queue record; the controller separately covered descriptors, backing
references, its mount view and the exact outside PID/start identities. The owned
fixture and three private namespaces were absent, with over20GiB host reserve.
All100 registry sources, nine payloads and262 independently observed build inputs
still matched after execution and the controller audit. Executed registry sources
were copied before new edits; final receipt changes contain only closure metadata.
This closes the failed run and releases local readiness-observer work. No retry or
new native run is authorized by that release; full recovery and activation remain
required.

## Bounded readiness correction and HOST56 review

The private readiness observer now retries ESRCH from candidate observation under
its existing ten-second deadline. That result never means ready: a later complete
argv/environment/UID observation and HTTP200 are still required. The executed55
source differs only by that retry category, two adjacent proof comments and a line
wrap. Production startup, deadlines, sleeps and process lifetimes are unchanged.

The focused regression first failed two cases with the original behavior, then
passed eight tests/83 assertions. The final readiness/process-observation suite
passed 18 tests/118 assertions. Separate exact counterfactuals remove the ESRCH
category, deadline and Error-shape check: each causes an observed assertion failure.
The deadline case reaches an explicit modeled sleep rescue, rather than a test
runner timeout. Proc reads, HTTP and clock are modeled; no actual ten-second or
kernel-lifetime proof is claimed. Library/spec checks returned0 with empty output,
the new test is lint-clean and formatting passed. Runtime guard-module lint was
not run in this slice; all existing Task8 lint debt remains required work.

Independent review verified all 52 covering pins, 100 registry source pins, nine
regular archive payloads and 262 actual build inputs. Its build matches the frozen
bundle byte for byte, and the compiled diff contains only the ESRCH literal. The
inner/workload/runtime payloads are unchanged from executed55. The actual helper,
outer script, private namespaces, read-only cgroup view, four filesystems, 896MiB
envelope, 21/20GiB host reserves and all existing deadlines remain unchanged.

One HOST56 run is released using manifest
59eb7e8359d8fc378db4585dd60d1294a30942adca442261e93860c9a7f85b85,
after fresh canonical availability, pins and output absence. Its recovery acceptance
is unchanged: actual tag500, strict pre-API partial census and matching-pair verified
recovery must finish at a fenced handoff. This preparation proves neither native
recovery nor activation. Source remains frozen through execution and both cleanup
audits; a further run requires a separately reviewed concrete change or disposition.

## Native partial-state recovery reached a verified fenced handoff

HOST56 returned0 without timeout in145.176seconds. Managed publication and explicit
index protection succeeded. The real manifest DELETE returned500 after revision
unlink; original tag bytes remained, and mode0600 was restored only after the actual
server exited137/SIGKILL and its group was absent. The same retirement's strict
census returned1 with the exact missing-revision refusal and zero HTTP events.
Frozen frame22223:24 maps directly to that inventory check, independently of the
generic diagnostic stage label.

The existing held-authority recovery then returned0. Actual restic restored the
matching registry/journal pair on independently verified target filesystems; the
restored server produced20 successful GET observations while production census and
content verification checked required digests. The controller checked the matching
offline journal hash, unchanged current protections/history/bundles, canonical lock
inode/device, restored revision and preserved damaged original store. Recovery
ended at a restored, fenced handoff. No post-failure GC or serving restoration ran.
Desired-state activation and ordinary CLI/permit continuation remain unverified.

The drill used four real bounded filesystems, pinned Distribution/restic, actual
privilege transport and canonical authority. Kubernetes/readers/provider admission
were synthetic and the post-publication authority clock advanced eight days between
terminal commands. Explicit protection does not establish deployed-environment
history; no Docker replay, actual ten-second expiry or ESRCH occurrence in this run
is claimed.

All278 periodic host root/cgroup comparisons and final host/UTS comparisons matched.
Normal teardown unmounted cgroup before proc and root last, detached four loops,
removed the exact fixture and released the canonical lock. Both independent audits
returned0 with empty stderr. They found the owned path, three namespaces, references
and outside PID/start identities absent; worker all-process mount/queue checks and
controller descriptor/backing/mount checks completed, with over20GiB host reserve.
All100 registry/nine payload/262 build-input hashes still matched at closure, and
executed registry sources were preserved before edits. This closes the scoped
recovery proof. Process-kill recovery, physical ENOSPC, serving activation, complete
R5/lint/gates/review and Tasks9–11 remain required.

## Resumed implementation and selected alert destination — 2026-10-29

The user resumed the original full goal after an explicit pause. Task4.2 and
Tasks4.3/5.1/5.2 remain incomplete; no production safeguard activation or final
exact-revision host gate has occurred. The next local work is GC/restore process
interruption evidence, followed by the remaining recovery, ENOSPC and operational
continuation proofs. Native partial-recovery HOST56 stays closed and is not rerun.

Parent independently reconstructed the saved GC fixture counterfactual sources
and checked all referenced hashes:27 cases contain21 distinct textual deltas;
19 followups strengthen observations for13 of those same deltas. The stronger
witnesses show forbidden native-spawn effects or false kill receipts, while the
eight unreplaced originals cover PID signaling, stop-loop rescue, spawn restoration,
exit-rejection rescue, cause retention and omitted signals. These are modeled
private-fixture observations, not actual registry child interruption. The pending
terminal-timer proof and final source transfer/checks remain necessary. Evidence:
`/tmp/task8-parent-collection-prior-removals-review.json`, SHA256
`0c5b48a12002c848b583f88f048174f20c9f8a47b95cad05921290d2a6979dea`,145pins.

The user selected Slack `#puni-alerts`. On2026-10-28 the shared h3mon dev
Alertmanager was configured through an owner-only persistent secret file; binary
configuration validation and reload succeeded. A synthetic firing/recovery test
produced two completed requests and latency observations with zero failed requests
or notifications, then cleared its test alert. All13 existing Prometheus rules
were healthy and four scrape targets were up. Receipt:
`/tmp/puni-slack-final-verification.json`; protected host evidence:
`/home/monitor/puni-dev-observability/evidence/slack-20261028/`. Fresh read-only
inspection on2026-10-29 returned0 and confirmed the loaded `slack-puni` receiver.
Operator visibility, registry-specific warning/cutoff/failure scenarios, independent
five-minute missed-report delivery and source-renderer preservation are unverified.
The existing renderer still defaults to `local-only`; Task5.1 must preserve the
authorized destination on deployment. No additional test message was sent during
this resumption check. The provider accounting bound remains unresolved.

## Local GC interruption wrapper proof package

The extracted actual private GC wrapper passed38tests/300assertions with modeled
process, proc, clock, terminal and dispatcher ports. Library/spec type checks
returned0 with empty output; ESLint returned0 with no errors or warnings for the
two new files. Existing Task8 lint debt remains unresolved. The final source
transfer added16 adjacent proof comments only; parent independently stripped those
lines and compared the frozen source. A parsed TypeScript comparison confirmed
that the test transfer changed formatting and removed one redundant assertion.

The pending-terminal negative removes the actual Promise.race timer. An injected
five-millisecond callback represents the requested five-second timer, while an
independent fifty-millisecond rescue settles the modeled child. Removing the timer
loses the required second SIGKILL rescue and fails an actual signal assertion in
52milliseconds; the restored focused case passed ten assertions. This proves the
modeled timeout dependency, not a native five-second lifetime or actual GC kill.

Parent checked all189 covering pins and read the raw final checks and exact source
diff. Covering receipt: `/tmp/task8-collection-final-covering.json`, SHA256
`6bf7af0f9755bdecacd76aa9cb0eab6e5fdb11b9fe2dfd75feffcde2ec0dbf43`.
Parent review: `/tmp/task8-parent-collection-final-review.json`, SHA256
`4f047faedd0b777495712f9c60b5db3b80838691cbbf86c59495a17194c3e177`.
The proof-comment wording for the modeled zero exit is being narrowed; no runtime
change is requested. Restore one-shot state/caller proofs, native integration and
actual process kills remain pending. This is not the complete Task4.2 review.

## Restore one-shot state prerequisite proved locally

The state-only snapshot passed44tests/118assertions. It uses actual owned files,
descriptors, symlinks, hardlinks, inode replacement and writes; root credentials,
the fixed-path mapping and injected I/O failures are modeled. Armed and consumed
records bind operation, snapshot, both original source paths and both recovery
targets. Consumed lineage retains the killed worker rather than requiring a fresh
retry worker to have the same PID. Missing, unreadable, malformed, changed or
wrongly owned state refuses; no absence-to-consumed fallback exists.

Parent independently reconstructed20 exact removals with19 distinct textual
deltas and read every raw failure. Nineteen fail assertions; omitting truncation
causes a precise refusal of the valid padded consume operation. Removing terminal
validation or current-worker membership writes a forbidden consumed record before
later inspection still refuses: those witnesses prove prevention of the write,
not end-to-end success. Close-error aggregation cases prove cause retention.
Symlink-following and descriptor-close removals expose actual unwanted opens and
missing closes, with independent cleanup of test-owned descriptors.

The state-only library/spec checks returned0. The subsequent complete-lint check
returned0 for both files after the equivalent quote-escape correction; earlier
final-lint/attempted-autofix outputs remain1 and are preserved. Source transfer
adds19 Proof comments only, and parent independently compared the parsed test
shape. Covering receipt `/tmp/task8-restore-state-covering.json`, SHA256
`fdcaaaf2f3de7664ab90376959074d684d1076c28e173a6c4aa9bb77a247a573`,
has138 verified pins. Parent review `/tmp/task8-parent-restore-state-review.json`,
SHA256`c86f145c3772dbd02f3f39cb9a96c8cec623118e4ee4d5268fd16ee4b6e0a7a1`.

The first private restic capture tests failed on missing STOP/KILL signals, then
passed2tests/21assertions. They preserve the returned child and native options,
model childPID73 in workerPGID42, require137/SIGKILL before consuming state, and
forward both restore calls without signals for a valid historical consumed record.
Capture negatives, admitted-callback/controller wiring and native execution remain
pending. These local results prove no actual restic kill or partial extraction,
and do not complete Task4.2, the full failure matrix, or production adoption.

## Restore capture prerequisite and controller integration status

The state/capture pair passed86tests/393assertions (44state and42capture cases).
Library/spec checks returned0 with empty output; the three new/changed files were
lint-clean. Parent checked150 covering pins and independently reconstructed all32
removals, representing22 textual deltas. Every case failed an actual assertion.
Invalid identity/terminal cases demonstrate forbidden modeled consume calls, not
bypass of the independently verified real state writer. The timer uses the existing
five-millisecond model and fifty-millisecond rescue; no native elapsed-time claim
is made. Unexpected-success removal propagates undefined rather than an Error;
its witness is error handling, not successful native completion.

Parent confirmed the pre-capture prefix is byte-identical, capture changes are
Proof comments only, and the test matches its removal baseline byte for byte. The
accepted state declarations remain AST-equal; an additional parent audit explicitly
requires all three declarations and rejects missing declarations or a removed UID
guard. Covering receipt `/tmp/task8-restore-capture-covering.json`, SHA256
`7deb763c93576fd9c427b16f4f3aef72be5c03a16db2d9986bfe5d2f16f8554c`;
parent review `/tmp/task8-parent-restore-capture-review.json`, SHA256
`b77d698f1c14130ef21ece33a96aa5065a24f99cbad03173888968d520859fe5`.

The caller's first local regression passed9tests/56assertions after a2pass/7fail
red. It selects only the exact private restore-kill mode and derives recovery
lineage after admission. Controller integration is still in progress: an earlier
26-case green used an incorrect nested inspection model and is superseded. The
type check exposed that mismatch; a corrected flat-shape test failed at the actual
controller access before the access was fixed. Final controller/removal/source
checks and native evidence remain pending.

The restore-kill drill is explicitly a two-fault sequence: reuse the already
verified partial-tag-deletion setup to enter fenced recovery, then interrupt the
actual restic child and verify same-operation retry. The previous no-tag preference
for this mode is superseded; the old tag proof is setup, not new coverage. GC-kill
remains a separate case with normal deletion and unchanged production GC admission,
with no tag or unsafe-GC substitution. Both modes retain the existing resource and
lifetime caps, matching-pair verification, cleanup audits and remaining full-scope
requirements. No new native run or production activation is yet released.

## Interruption controller proof review

Parent verified all eleven immutable integration snapshots under
`/tmp/task8-interruption-wiring-normal-snapshots.json` (SHA256
`b966e131fb46d4679b3ce3aa40d86298b7ab7efdc573c01840bf1fb720c21f7d`).
The four source changes were compared with the executed HOST56 copies. GC uses
normal verified deletion before interruption; restore uses the explicit two-fault
sequence. The restore diagnostic must be absent before the attempt and match the
consumed worker. Recovery preserves current obligations, the matching offline
journal, canonical lock and old store, and still stops at a fenced handoff.

Parent independently reconstructed all 45 counterfactual cases from those frozen
sources: 44 distinct textual deltas. The initial run produced 42 assertion
failures and one required-positive selector refusal. Two cases passed and were
preserved as inconclusive. Correcting the GC group's modeled observation exposed
false acceptance after removing the guard; the focused normal/removed/restored
sequence passed/failed/passed. The null-lineage followup observes only loss of its
fixed diagnostic: later traversal still refuses via TypeError. It is not an
independent safety barrier. Diagnostic aggregation cases prove cause retention,
not loss of a destructive-effect refusal.

Original receipt `/tmp/task8-interruption-integration-removal-receipt.json` binds
150 artifacts; the focused followup receipt binds fourteen. Parent checked every
pin, exact mutant hash, selected test outcome and both followup test diffs.
Followup receipt SHA256
`3f2e4741317f7b26b38664e95b36666c5f64d18149f669037878f6b556b69f08`;
parent review `/tmp/task8-parent-integration-removals-review.json`, SHA256
`4eb2a441298e164000f27a2c5bdf876db88edcb27d9d839e8c638f6665bfdc0f`.
These are extracted actual fixture callers with modeled authority, process and
HTTP ports; the selector case also uses owned local files. They prove no native
GC or restic kill. Final comment/source transfer, current checks and the next
frozen host packet remain pending. HOST56 is closed and will not be replayed.
Task4.2, Tasks4.3/5.1/5.2 and production activation remain incomplete.

## Guardian final-schema dependency

The parent checked another previously unbound production dependency in isolated
copies of current `registry-backup-attempt.ts` (SHA256
`3dc3be0581bc9e7617eed1327936227008e61cd05cf3598f6c8218c214238a8b`).
Only the ArkType import was relocated for execution. Seven tests/eight assertions
passed: one stable valid identity and six malformed cases covering zero,
leading-zero or nondecimal start ticks, a zero PID namespace, malformed boot ID
and malformed machine ID. Removing only the final
`RegistryBackupGuardian.assert` call caused all six invalid promises to resolve,
producing one pass/six assertion failures. Restoring the exact normal copy passed
all seven tests again.

Receipt `/tmp/task8-parent-guardian-schema-receipt.json`, SHA256
`e922d58fb465abd6690f9a9cd873a99c2dda774998c5c9344c6936444e0b48f3`,
binds eleven source/test/raw-output artifacts. Parent inspected every raw failure,
normal/restored summaries, all pins and the exact sole schema-call delta. All
identity reads are modeled; no kernel, root-peer, IPC or caller-omission proof is
inferred. Shared runtime source was unchanged. Repository test integration and
precise adjacent Proof annotation remain pending alongside the earlier guardian
input/race integrations; this is one dependency with six subcases, not six
independent guard removals.

## HOST57 actual GC interruption and staged recovery

The exact frozen GC packet ran once on h4claw, exited zero without timeout in
138.5659 seconds, and preserved its raw stdout at
`/tmp/task8-host-namespace-57.stdout.log` (SHA256
`04512db5416590929a34765ca21bb1563f9c0ffca4efe77f7d2646101ca88cc7`).
Normal manifest deletion returned202. The actual admitted GC child, PID/group9305
with start ticks342443995, exited137/SIGKILL; both process and group were absent
before recovery. Collection entered but did not complete. The failed operation
remained fenced with its matching backup. Same-operation recovery completed with
twenty HTTP200 verification reads and a staged fenced handoff, preserving current
obligations, the matching offline journal, canonical lock and old damaged store.
No tag fault or unsafe GC flag was used. The failure frame27840:22 maps to the
generic authenticated helper-refusal throw; it is not independent kill evidence.
No partial GC progress before interruption is claimed.

The worker's all-process cleanup audit and the parent's separate read-only audit
both returned zero with empty stderr. Exact fixture, backing associations, owned
namespaces/descriptors/mounts, outside lock processes and owned lock records were
absent. The parent audit covers its observer mount namespace; the worker also
checks all process mount views. The run recorded269 successful periodic host mount/cgroup checks,
cgroup-before-proc and root-last unmounts, four detached loops and lock release. Fresh checks matched102 executed source files,264 build inputs and nine
payloads; both independent102-file source snapshots were preserved.

Immutable closure `/tmp/task8-parent-host57-closure.json`, SHA256
`5493947e3f7032fb34d84b92e98f15d160829269a16b9fc056e27ef4ba210ef5`,
binds21 artifacts and the original worker receipt. This proves the declared
private four-filesystem interruption/recovery slice only. Kubernetes, readers and
provider admission remain modeled; the retirement clock advances eight days.
Serving activation, ordinary CLI/permit continuation, physical ENOSPC, remaining
failure proofs, lint/gates/review and Tasks4.3/5.1/5.2 remain incomplete. The separate
restore-interruption packet is released only after this cleanup closure, with all
source/payload/input bytes still frozen.

## HOST58 actual restore interruption and recovery retry

The frozen restore packet ran once, exited zero without timeout in167.3272seconds,
and preserved raw stdout at `/tmp/task8-host-namespace-58.stdout.log` (SHA256
`291b0c542219d66c905076c075b94cd2d64b442106f9dc6d02c49bef608e34a6`).
Its explicitly declared two-fault setup reused tag-cleanup500 solely to enter
fenced recovery. The strict dangling-tag census refused before any API event.
The first recovery attempt then failed after actual restic child14192, start
ticks342501165, exited137/SIGKILL in worker14126's process group. Consumed state,
terminal log and the current bounded diagnostic matched that worker; child,
worker and group were absent before retry. The failed restore made no verification
HTTP requests. A fresh worker retried the same operation, completed recovery and
made twenty successful verification reads while retaining the fenced handoff.
There were two restore entries, one completion and one lock-reconciliation
completion. No partial extraction is claimed, and the tag setup is not recounted
as new independent coverage.

The frozen backup-worker frame20766:22 maps to the actual nonzero backup-member
exit refusal; census frame23514:24 maps to the missing manifest revision. The
owner's generic helper-refusal frame27840:22 alone does not prove interruption.
Current obligations, matching offline journal, canonical lock and old damaged
store remained protected. The run recorded326 successful periodic host
mount/cgroup checks, normal cgroup-before-proc/root-last unmounts, four detached
loops and lock release. Both independent cleanup audits returned zero with empty
stderr and found the exact owned resources absent.

Immutable closure `/tmp/task8-parent-host58-closure.json`, SHA256
`fb66fee9933ffb8fc81435f634915df60939ab3c64cb5cc732e16286a595d8ba`,
binds twenty artifacts and the original worker receipt. Fresh102-source,
264-input and nine-payload checks matched. The worker's102-file archive and the
parent's already preserved HOST57 archive both match the byte-identical HOST58
source map; no duplicate parent HOST58 archive is claimed. Source freeze was
released only after both audits and this preservation check. No replay or next
native run was released. The private fixture retains modeled Kubernetes, readers
and provider admission plus its advanced retirement clock. Full Task4.2 and all
remaining budget, monitoring, adoption, validation and review work remain open.

## Final origin reobservation dependency

Parent checked the previously unbound final call in
`proveRegistryBackupOriginStopped`, using an exact copy of current source
`7b1544076e1ef5aaead4581e06ad7c22be736850070c5a89626e6f67e264efa6`
and its attempt dependency3dc3be05. Both match the executed HOST58 source map;
only imports were relocated. The earlier two origin/process observations remained
unchanged. Seven tests/seven assertions passed normally. Omitting only the final
`await origin()` caused all six third-observation faults to resolve: changed
machine, boot, PID namespace or proc view, and missing or unreadable machine ID.
The resulting run had one pass/six assertion failures. Restoring the exact normal
copy passed all seven tests again; shared runtime sources and tests were untouched.

Receipt `/tmp/task8-parent-origin-final-receipt.json`, SHA256
`fb6b9b3f2dfbd6c9e5b5c9a90b071876cfac7cc38d78e142ee344f2946dd4fc6`,
binds thirteen source/test/raw artifacts. Parent read all failure output and both
normal/restored summaries, checked every pin and inspected the sole call-omission
diff. These are modeled origin, absence and I/O observations through the actual
production function. No actual kernel absence, canonical-lock acquisition, IPC
or provider mutation is inferred. This is one dependency with six subcases;
repository case integration and its precise adjacent Proof remain pending.

## Full maintenance caller without a derived readonly ACK

The added regression exercises existing `maintainRegistry` with actual journal
files and flock, plus an empty-catalog loopback server. Capacity, ACK ENOSPC,
writer census and backup engine remain modeled. With the writer stopped, it
reaches a new matching verified backup and the deliberately controlled refusal
before service restoration; it makes zero derived-ACK calls. A surviving writer
prevents census and snapshot, preserving the prior verified backup. The nested
competing journal command is refused while snapshot holds the same authority.

Two exact counterfactuals were reconstructed and their complete raw failures
reviewed. Inserting a forbidden ACK dependency causes both cases to fail at the
modeled ENOSPC outcome. Omitting the first stop check prematurely persists
`stopped` instead of `fenced`; the later census still refuses backup. That is a
durable phase witness, not unsafe snapshot success. Complete checks passed eight
tests/59 assertions, spec typecheck and final lint. A subsequent test-only removal
of an impossible undefined alternative is explicitly recorded; its null refusal
remains. Initial sandbox EPERM and the mistaken expectation that a successfully
superseded backup remain last-verified were setup/test defects, not production RED.

Covering receipt `/tmp/task8-pressure-caller-covering.json`, SHA256
`713342f015e36cb6aa4af248f489610162beb34bd960b689e805f4e064df73f9`,
binds62 artifacts. Parent checked every pin, both sole deltas, full source/test
transfers and check provenance; production changes only two accurate Proof
comments. Parent review `/tmp/task8-parent-pressure-caller-review.json`, SHA256
`c52d558727dacf5c8a9a427365007ad472cdf230ce3ac3f3065e2a5652768d51`.
No physical exhaustion, native writer shutdown or restic proof is inferred here.

## Disposable volume filler prerequisites

The fixed filler is limited to the owned128MiB registry filesystem, outside its
snapshotted contents. It requires the exact private PID1 mode, verified identity,
separation from journal/root devices, fresh exclusive file creation, bounded write
progress, explicit ENOSPC and retained descriptor/path identity. All these local
filesystem/process/write observations are modeled; no physical volume was filled.
The final suite passed37tests/118assertions, with complete library/spec/lint checks
returning zero and empty output. Thirteen original exact guard/dependency edits
all caused actual assertion failures. A separate O_EXCL-only omission falsely
accepts an existing filler; EACCES preserves its original cause without closing an
unowned descriptor. No independent O_NOFOLLOW proof is inferred.

Scope limits remain explicit: wrong file device allows three modeled writes
before later refusal; progress omission isolates zero writes, with other bad
counts caught later; loop omission reaches the129th modeled rescue attempt, not
proven bytes beyond128MiB. Cause aggregation proves original-error retention.
The redundant journal-path comparison was consolidated into the existing validated
literal installation boundary. Final source otherwise differs only by comments
and formatting, and the final test equals the exclusive-proof baseline. An earlier
formatting-sensitive comparator failed and its prematurely assembled cover is
preserved as unaccepted evidence.

Covering receipt `/tmp/task8-volume-covering.json`, SHA256
`4145e4ba2a2219008e558d27c7127f6712972ae906aeb22da6774373333740e2`,
binds109 artifacts. Parent checked every pin, reconstructed all thirteen deltas,
read their failures and the exclusive followup, and inspected the source/test
transfer. Parent review `/tmp/task8-parent-volume-review.json`, SHA256
`6574e4e17004748bf6d8b1a47ff065dd14e2089f04bc048d635db8f68470a1a3`.
Current ACK allocation, direct-writer lifetime, synthetic stop-patch integration
and native ENOSPC evidence remain pending. No HOST59 execution is released.

### Local ACK and writer prerequisites for physical volume exhaustion

The ACK allocation helper's original covering receipt is
`/tmp/task8-ack-covering.json` (`92b98fa3`, 98 pinned files). The FIFO followup is
`/tmp/task8-ack-fifo-covering.json` (`2f7721a2`, 42 pinned files). Parent checks
`f09b84` verified every pin; `31ef11` independently compared four complete ordered
source/test syntax trees, with comparator negatives for removed UID admission,
missing function and malformed syntax. The resulting parent acceptance receipt is
`/tmp/task8-parent-ack-review.json` (`75a7e687`). Final helper/test snapshots are
`cfc0909e` / `53aa8cf9`; the complete suite reports 37 tests, 108 assertions, with
library types, spec types and scoped lint exiting zero without diagnostics.

The original 13 removal deltas cover modeled admission, records, correlation,
allocation errors and close behavior. Metadata and record symlink cases can still
refuse later; close aggregation proves cause retention. Removing only record-read
`O_NONBLOCK` needs an independent modeled 50 ms writer rescue before nonregular
metadata refusal. It does not cause unsafe ACK acceptance. A separate owned local
Bun FIFO experiment (`/tmp/task8-parent-ack-fifo-contract.json`, `b95441f4`) confirmed
that the blocking open waits for a writer and adding `O_NONBLOCK` permits immediate
metadata inspection. This establishes the local primitive contract, without a
host pressure or production startup lifetime claim.

The writer covering receipt is `/tmp/task8-writer-covering.json` (`da744b6f`,
141 pinned files), freshly checked in `2e5814` and `8339dd`. Parent read the complete
source/tests and diffs, reconstructed all 16 main source deltas and read their raw
assertion outcomes (`1ae4ce`), then inspected the separate sole `SIGTERM` omission
and restored run (`57ba98`). A fresh parent run of immutable final copies
(`3fcbaf`) passed 33 tests with 294 assertions. Final library/spec type checks and
scoped lint report zero with empty diagnostics. Independent complete ordered syntax
comparison (`27e6e5`) checked both transfers after explicit import ordering, void
callback blocks and constant string array allocation normalization; three negative
controls reject meaningful changes. Parent acceptance is
`/tmp/task8-parent-writer-review.json` (`f169a82f`).

These writer tests model subprocess, proc, HTTP, timer and stream ports. Removing
memoization makes a required second close refuse; the setup aggregate delta loses
the original cause. The drain deadline uses a 5 ms modeled callback for the 5000 ms
production argument and a separate 50 ms rescue. Signal omission needs that
independent terminal rescue. No actual child, physical ENOSPC, selected stop-patch
binding, or native host launch is established by these local prerequisites. A
subsequent PID boundary followup is recorded below. Task 8 remains incomplete.

The subsequent PID/proc-read followup is
`/tmp/task8-writer-pid-covering.json` (`a314cdf7`, 25 pins checked by `f0a817`).
Complete source/test diffs and raw removal output were inspected in `ae91f3`.
Removing the PID guard still refuses through the modeled listener's positive
assertion and triggers owned cleanup; the negative loses its zero-signals
assertion. It does not demonstrate a false successful stop or a proc-read effect.
Separate modeled `ENOENT` and `EACCES` cases preserve the original proc-read failure
and close the owned capability. Parent independently ran all three added cases
from immutable final copies (`d1d745`: three tests, 27 assertions) and checked both
complete syntax transfers and the exact omitted-predicate hash (`cb0a46`). Worker
final output is 36 tests, 321 assertions, with spec types and scoped lint exiting
zero without diagnostics; runtime changes only the precise proof comment. Parent
acceptance is `/tmp/task8-parent-writer-pid-review.json` (`0cb0db5d`). This remains a
modeled prerequisite, without an actual kernel PID or host lifecycle claim.

Before this PID addendum, strict change validation (`0ed8e4`) reported one valid
change and no issues. Earlier scoped Prettier (`34a765`) and whitespace
check (`3eba04`) succeeded. These document checks do not establish runtime or
whole-branch completion.

### Selected stop coordinator and shared record reads

`/tmp/task8-stop-covering.json` (`baa65c39`) binds 134 artifacts, independently
checked by `9f8736` and `567c62`. Parent read the complete coordinator and tests,
reconstructed all twelve original source deltas and the two corrected model
followups, and inspected the raw assertion outcomes (`37a0aa`). The final
PID/start-only terminal delta was separately reconstructed and reviewed
(`57a03a`, `567c62`). A fresh independent run of immutable final copies (`8c6fc7`)
passed 22 tests and 74 assertions. Stable library/spec types and scoped lint
returned zero with empty diagnostics; earlier checks overlapping a mutation window
are preserved as unaccepted provenance. The exported return type's local interface
caused TS4060 and was moved to module scope without changing runtime behavior.

Parent checked the complete emitted runtime syntax after removing only the
approved duplicate group-absence predicate and erasing types (`c8d2cc`); three
runtime comparator controls detect changed allocation classification, consumed
state and PID equality. The final test equals its consolidated tested baseline.
The actual writer capability retains group-absence verification; its deliberately
false internal-return test and duplicate coordinator predicate are superseded.
Old or malformed request omissions demonstrate forbidden reads/live/probe effects
before later refusal, while error aggregation demonstrates original-cause
retention. Two initially masked model subcases were corrected and only their
specific deltas repeated. The accepted parent receipt is
`/tmp/task8-parent-stop-review.json` (`61e7df88`). This establishes same-process
coordination with modeled writer/probe/request observations, without Unix, API,
physical-pressure or complete R5 coverage claims.

The shared bounded record reader was mechanically extracted from the ACK helper.
`/tmp/task8-record-covering.json` (`b40371f9`, 25 pins checked by `9a0692`) preserves
the exact descriptor body, including NONBLOCK/NOFOLLOW, ownership, metadata, size,
read and required-close checks. ACK topology admission stays before its calls;
only the shared name and already-validated fixed literal paths change. Tests
continue to execute the actual shared body. Parent ran the affected immutable
suite (`13cb95`: 37 tests, 108 assertions), checked complete reader/caller/test
syntax transfers with three runtime controls (`6e3da1`), and inspected zero/empty
library/spec/lint receipts (`1f4d94`). Parent acceptance is
`/tmp/task8-parent-record-review.json` (`575f1d01`). The earlier thirteen mutation
proofs and FIFO followup transfer through exact body identity; they were not
replayed or counted as new proofs. Unix transport admission and native pressure
integration remain pending.

A separate owned UID1000 Unix-socket primitive probe was inspected in `e3274a`.
Its source is `/tmp/task8-pressure-socket-probe.ts` (`154bd6ff`), with successful
receipt `/tmp/task8-pressure-socket-allowed.exit.json` and raw pins checked in
`6122b5`. Actual output reports socket mode 0600, a completed local request,
resolved `stop(true)`, socket removal and absent owned directory. Initial sandbox
listen EPERM is preserved as an environment refusal, followed by the authorized
successful component probe. This confirms the pinned Bun primitive only. It does
not establish root-only adapter admission, UID59001 exclusion, replacement-safe
unlink, API binding, or native host lifecycle behavior.

### Private socket adapter prerequisites

The adapter's first immutable body exposed a failed-arm state bug: invalid arming
threw after publishing a selected wrapper whose coordinator was still in bootstrap.
Parent reproduced an HTTP 200 bootstrap response after this failure (`c8cedf`),
using the actual adapter, real coordinator/parser and modeled native ports. Exact
executed inputs are pinned by
`/tmp/task8-parent-socket-arm-actual-inputs.json` (`cc14208b`). The added repository
regression failed with expected 500/actual 200, then passed after a narrow fix that
retains the writer, records/aborts the arm failure, and refuses subsequent handlers
before parsing. Both raw hashes were checked in `4dfa6d`.

The final covering receipt is `/tmp/task8-pressure-socket-covering.json`
(`4ea63c4f`, 103 pins independently checked by `1ca204` and `104125`). Parent read
the complete normal source/tests, independently ran 33 cases with 322 assertions
(`feadee`), and reconstructed nineteen exact source deltas with all raw pins
(`05c6c8`). Eighteen produce assertion losses; skipping server stop instead makes a
required successful cleanup refuse the remaining socket. Lookup EACCES reaches
forbidden server creation before a later refusal. Cause cases retain original
failures without establishing physical cleanup. Deadline tests schedule the
10000 ms callback at 5 ms with an independent 50 ms rescue, rather than proving
elapsed host timing or relying on runner timeout.

Final helper/test snapshots are `3407448e` / `6f70efd6`. Parent checked their full
diffs and independently compared complete ordered emitted syntax (`6cb327`),
including three runtime comparator negatives. Source changes only accurate proof
comments; test changes are import order, a void callback block and erased types.
Final library/spec/scoped lint receipts are zero with empty diagnostics (`ac8b50`),
and the final run reports 33 tests/322 assertions (`104125`). Earlier spec and lint
failures remain preserved. Parent acceptance is
`/tmp/task8-parent-socket-review.json` (`34999d8f`). Root/socket/metadata/child ports
remain modeled. Actual UID0 admission, UID59001 exclusion, fixed ACK-child
termination, parsed API binding and native physical pressure still require the
subsequent integration and host rehearsal. No HOST59 launch has been released.

### Fixed ACK launcher and rejected-exit cleanup

The first launcher package, `/tmp/task8-pressure-probe-covering.json` (`f3d04f7f`),
was preserved as unaccepted after parent found a cleanup gap (`78da6f`). With the
actual launcher and unchanged actual waiter bodies, modeled exit-observation
rejection unwound the waiter's abort listener before the launcher aborted its
signal. The modeled captured child remained live. The shared waiter matched its
archived/current source (`20209093`, checked by `633d18`); no kernel process was
created by this reproduction.

The narrow correction observes fulfilled direct exit separately. On rejection
without confirmed direct death it signals only the captured child, then observes
the exact group under a bound. Only ESRCH establishes absence; live, unreadable or
unknown observations produce explicit cleanup uncertainty while preserving the
original failure. A fulfilled direct exit does not certify group absence: the
original waiter's group-cleanup refusal remains fatal for outer owned teardown.
The shared waiter is unchanged.

Corrected cover `/tmp/task8-pressure-probe-lifetime-covering.json` (`43b799fb`)
binds 141 checked artifacts. Parent read the complete source/tests and final diff,
reconstructed the original thirteen guard deltas and precise post-cancel followup
(`f06cf5`, `907efd`), and reviewed eight new exact fallback deltas (`78b974`).
Parent independently ran 25 tests/187 assertions (`8866f9`) before one duplicate
assertion was removed; the final run has 25 tests/186 assertions (`546bd9`). Final
library types and complete spec/lint checks are zero with empty diagnostics;
earlier failed lint provenance remains. Complete independent runtime syntax
comparison (`b4b7bf`) verifies the explicit fallback addition, unchanged existing
nineteen-case tests and waiter, and final type/comment-only transfers, with three
runtime comparator negatives. Final source is `5ef4c38a`, lifetime tests
`34fcc249`, existing tests `678fab05`. Parent acceptance is
`/tmp/task8-parent-probe-review.json` (`0ee67ae5`).

Scope remains modeled process/FFI/root/spawn/group observations with the actual
waiter and real stream/abort logic. The primary-cause delta loses errors-array
membership while its cause property remains. Cleanup-uncertainty removals still
fail the original action. Deadline tests use a virtual clock and independent
sixth-sleep rescue; other cancellation cases use a 50 ms rescue. These do not prove
native timing, actual child termination, UID59001 exclusion, installed alias
identity, API wiring or physical exhaustion. Native integration remains pending.

### Required Unix stop hook in the synthetic API

The API captures the validated Deployment UID and pre-advance resourceVersion for
zero-replica registry patches. In the exact pressure workload it requires the
fixed Unix endpoint, HTTP 200 and a complete bounded bootstrap/pressure receipt
before writing the proposed state or printing a response. Existing fixture modes
and restore-to-one behavior remain explicit. Bootstrap certifies no pressure effect.

`/tmp/task8-pressure-api-covering.json` (`a2f36d6b`) binds 78 artifacts checked by
`b038d8` and `f53074`. Parent read the complete source/tests and final diffs,
reconstructed twelve exact source deltas with raw outcomes (`5ba245`), and ran both
the normal twenty cases (`05d623`: 20 tests, 177 assertions) and exact final suite
with eighteen existing cases (`9cf989`: 38 tests, 202 assertions). Complete ordered
runtime syntax comparison (`92488c`) checks the source and explicit test callback
normalizations, with three runtime negatives. Final source/test are `41b3cdef` /
`4e8fcf18`. Initial library/spec checks and final complete spec/lint checks are
zero with empty diagnostics (`20f5d1`); the earlier five test lint failures remain
preserved. Parent acceptance is
`/tmp/task8-parent-pressure-api-review.json` (`55b0a06e`).

The write-order mutation writes the proposed revision before a held or missing
endpoint permits completion. Deadline/fetch/body mutations need independent 50 ms
rescues; some still refuse afterward. These tests model fixed files, root identity
and Unix transport while executing the actual parser/main and bounded reader. They
prove state-file write ordering, with no fsync or physical durability claim.
Requested ten-second deadlines are scheduled at 5 ms in the tests. Actual dispatch,
pre-fill epoch setup, controller integration and native pressure evidence remain
pending; no HOST59 run is released by these local checks.

### Fixed pressure owner route

The exact `pressure-ack` owner prefix dispatches the allocator and returns before
ordinary owner setup. Cover `/tmp/task8-pressure-owner-covering.json` (`60be0dd8`)
binds 53 artifacts. Parent independently ran five tests/ten assertions (`ee1529`),
read the complete prefix boundary and reconstructed three exact source deltas.
The first allocator-omission test was masked by its logger parsing undefined;
the preserved followup uses a raw logger with the exact same mutant (`9d02a5`)
and observes the missing call/receipt and wrongly successful prefix after a
modeled allocator failure. It does not prove whole-pipeline success. Removing
exact mode selection or return loses the required dispatch/ordinary-prefix
boundary. Final source reverses byte-exactly to the tested normal after removing
one proof comment. Final spec and complete lint checks are zero with empty
diagnostics; earlier lint provenance remains. Parent acceptance is
`/tmp/task8-parent-pressure-owner-review.json` (`f16faed5`). Installation, allocator
and identity are modeled; root admission and actual UID59001 allocation remain
native integration work.

### Fresh pre-fill epoch and ACK descriptor identity

The fixed pre-fill helper rotates the existing fixture instance only after the
publication guard has closed and while the captured direct writer remains live.
It validates the existing descriptor, bounded bytes, boot and named identity;
legitimate old-ACK absence requires an actual Error/ENOENT. A present prior ACK
requires validated bounded content and stable named identity before removal.
The filler is untouched. Rotation and old-ACK removal precede physical filling;
neither creates an ACK under ENOSPC nor releases pressure.

Parent found an ABA gap in the first epoch package (`de2828f8`). With the actual
reader and epoch bodies but modeled files, the named target was inode9/UID0 while
the opened validated descriptor was inode10/UID59001. The helper returned success
and unlinked the unvalidated named target (`0b21ae`;
`/tmp/task8-parent-epoch-ack-identity-observation.json`). That whole package remains
unaccepted and preserved. The correction requires the shared ACK reader's open
descriptor device/inode to match the captured named removal target before bytes
return; the caller passes that identity and retains its final named-path check.
Instance/request reads retain their existing interface and behavior.

Corrected cover `/tmp/task8-pressure-epoch-identity-covering.json` (`8979c99b`)
binds 171 checked artifacts. Parent reconstructed all twenty original epoch
mutants and their forty raw pins, read their assertion failures, and reconstructed
the two exact coupled identity deltas. Their exact definitions and outcomes are
pinned by the parent acceptance receipt below. Removing the
reader binding or substituting the caller's inode permits the modeled forbidden
unlink; missing expected identity also becomes accepted. Parent inspected full
final source/tests and independently compared six complete ordered emitted-runtime
pairs with three comparator negatives (`11b15e`). Original epoch runtime differs
only by the explicit ACK identity argument; final optional-chain normalizations
preserve refusal under native numeric Stats and precise trusted journal schemas.
The initial comparator mismatch was the parent's omitted trailing comma in its
explicit call normalization, corrected without source changes.

The independent final suite (`d722bb`, `254ac1`) has 94 tests/367 assertions:
37 existing ACK, 36 epoch, four actual-reader/epoch identity and seventeen handoff
cases. Receipt is `/tmp/task8-parent-epoch-identity-run.json`. Final combined
library/spec/scoped lint checks are zero with empty diagnostics; earlier type and
lint failures are preserved. Final reader/epoch are `5c091586` / `d7f0ead2`.
Parent acceptance is `/tmp/task8-parent-epoch-review.json` (`2e51624b`). All root,
filesystem and writer effects remain modeled. Boot-check omission opens/closes
before later refusal; prewrite identity omission writes before the final path
check refuses; the primary-cause mutant loses errors-array membership while the
cause property remains. These are the actual proof limits.

### Selected controlled failure and lifecycle dispatch

The selected pressure backup deliberately fails before serving only after its
matching verified backup exists. The fixed root wrapper uses the inherited
canonical descriptor and journal to invoke the unchanged production
`assert-stopped` action, requires its verified receipt, writes a separate root-only
controlled-failure receipt and throws. Bootstrap and recovery actions retain
their normal dispatch. The production stopped-state implementation was inspected
and matched archived/current source `812167d4`; it retains the real writer census.
This is an explicit second fault after backup, with no claim of ENOSPC corruption
or complete restore-service validation.

Handoff cover `/tmp/task8-pressure-handoff-covering.json` (`360fea98`) binds 84
checked artifacts. Parent read source/tests, reconstructed nine exact deltas and
raw failures (`fedd09`), independently ran seventeen tests/49 assertions (`18488e`),
and confirmed those cases in the exact final 94-test suite. Full final runtime
transfer is included in `11b15e`. Final combined scoped lint/spec/library checks
are zero; earlier optional-chain lint failures remain preserved. Parent acceptance
is `/tmp/task8-parent-handoff-review.json` (`07a34211`). Fixed-action mutants prove
argument forwarding, lineage mutants use nonnull wrong values, and cause mutants
prove errors-array membership; modeled root/action/file ports are not a native
root-action execution.

Lifecycle cover `/tmp/task8-pressure-lifecycle-covering.json` (`ba2729c6`) binds
61 checked artifacts. The actual owner starts one fresh `native-volume-backup`
with `recover:false`; recovery reuses that operation with the production recovery
verifier composition. Only the exact full mode, restore-service action and selected
operation dispatch the controlled handoff. Parent read the complete change/tests,
reconstructed all twelve scoped mutants and raw failures, and
independently ran fifteen tests/44 assertions (`bfb31b`). The local direct import
uses the exact TypeScript-parsed function from the immutable host; source-reading
tests use the complete byte-exact host snapshot. Full source/test emitted runtime
matches the tested normal and three controls are detected. Receipt is
`/tmp/task8-parent-pressure-lifecycle-run.json`; acceptance is
`/tmp/task8-parent-lifecycle-review.json` (`4ba1e2f6`). Library/spec and new-test lint
checks are zero with empty diagnostics; existing native-host lint remains open.
Direct-route/return omissions lose required positive behavior; verifier/argument
mutants are forwarding assertions and aggregate mutations concern array membership.
Installation/authority/runtime/action/HTTP effects remain modeled.

After the selected pressure owner is authoritatively terminal, recovery may need
another idempotent replicas-zero patch. The consumed bridge remains one-shot and
must close successfully with its socket/listener absent. The controller freshly
requires the owned writer/group to be absent and the exact failed operation with
its matching verified backup fence. Only then may it start a new unarmed,
bootstrap-only bridge for recovery. It preserves the completed pressure receipt
separately, creates no new writer/instance/ACK probe, retains the filler, and uses
an allocator callback that throws if unexpectedly reached. The unchanged real
production census after the recovery patch remains mandatory. Any uncertain
teardown aborts this transition. This avoids treating a repeated stop as fresh
pressure evidence; a revived writer or an overwritten receipt would invalidate it.

These acceptances cover local prerequisites only. Controller/main/cgroup routing,
physical byte and inode exhaustion, actual uploads, native cleanup, semantic R5
inventory reconciliation, the full original Task8 base review, Tasks9-11,
exact-revision host gate and live activation remain incomplete. HOST59 is not
released, and closed HOST57/58 are not replayed.

### Full-volume controller and fixed main route: local acceptance

The pressure controller joins the reviewed helpers through one fixed private
workload. It publishes a protected index, closes the publication guard, binds the
fresh direct writer and epoch, fills only the owned volume outside its snapshotted
contents, and requires the selected allocation failure and writer absence. It
retains the matching verified backup fence through the separate controlled
pre-serving failure, then stages same-operation recovery through a new unarmed
bridge while preserving filler, current obligations, authority lock and old content.
The exact main selector and mounted-cgroup cleanup inclusion have separate caller
cases. These local cases model native filesystem, process, authority, publication,
backup, recovery and cleanup effects; actual host execution remains separate.

Parent independently ran the initial immutable controller/routes suite with 66
cases/430 assertions, then reconstructed all 37 original exact source deltas and
74 raw pins. One setup-owner delta broke syntax and is preserved as invalid.
The corrected balanced omission observes the bootstrap refusal becoming success;
a separate required-handoff dependency break observes both ENOENT and EACCES
becoming success. The other 36 original deltas have actual assertion failures.
Parent audit `/tmp/task8-parent-pressure-controller-counterfactual-review.json`
(`827e7f4d`) binds all 38 valid behavioral counterfactuals and the invalid original;
the original batch was not replayed. Protection and action-prefix/phase omissions
reach forbidden next stages before later refusal. Action-log checks prove prefix
continuity and required/forbidden membership, without temporal ordering within a
suffix. Primary/reporter deltas concern errors-array membership while the primary
cause property remains.

After two transient worker capacity failures, parent took sole source ownership;
no active controller script remained. Parent moved three proof comments to their
correct adjacency and sorted the added pressure import. Complete ordered emitted
runtime comparison covers four pairs with three comparator controls; its only test
extension is two explicit required-handoff fault cases. The import-only followup
transfer (`/tmp/task8-parent-pressure-controller-final-transfer.json`) proves the
test-observed bodies byte-identical and detects two additional runtime controls.
The exact final local suite (`1ecec4`) passes 68 tests/446 assertions; the interrupted
worker's broader affected run passes 100 tests/539 assertions. These overlapping
counts are separate runs, not additive coverage.

Final new scoped lint and formatting pass (`d4623f`); library/spec receipts are
zero with empty diagnostics. The earlier suppression-adjacency lint failure is
preserved. The complete native host lint still fails with 26 errors (`05aac5`),
after fixing the new import-order error from its initial 27; it is not a passing
runtime gate. Final controller/test/host/routes are `3886ac54` / `684c31d5` /
`a5f4153c` / `4942b122`. Cover `/tmp/task8-pressure-controller-covering.json`
(`1173f5e7`) binds 193 artifacts; local acceptance is
`/tmp/task8-parent-pressure-controller-review.json` (`76770cf4`). Full Task8
semantic proof reconciliation, runtime lint, formal original-base review,
exact-revision host gate and production adoption remain incomplete.

### HOST59: pressure rehearsal failed safely; cleanup verified

The new frozen packet used 111 registry sources and 274 actual host/API build
inputs. Normal host and API bundles were independently rebuilt byte-exactly.
Manifest `ae8ecce6`, driver `3bd7396a` and archive `3e0764a6` retain the preceding
owned fixture's 896 MiB envelope, root reserves, private namespaces, read-only
cgroup view, canonical zero-wait heavy lock and deadlines. Outer runtime syntax
matches HOST58 except payload hashes; the workload changes only its exact mode.
The inner adds a fixed three-alias readback observation and scenario label. This
is a new physical-pressure attempt, with no replay of closed HOST57/58.

The single run (`/tmp/task8-host-namespace-59.exit.json`) exited 1 after 59.08
seconds without timeout. Native readback confirmed proof.js, backup-worker.js and
host.js all had the new normal bundle hash `762f2b88`. Initialization, baseline
backup, writable reopen, protected publication and protection completed. The
pressure-backup owner exited 1 and the root action trace ends at fence:entered;
all four synthetic owners acknowledged suspension and the service was withdrawn,
but the Deployment remained at one replica. The controller reported failure at
backup-under-pressure and produced no completed selected pressure-stop receipt.
The existing bounded diagnostic identifies the generic root refusal and the
outer cleanup aggregate, without its inner bridge cause. The exact failing
integration boundary still requires diagnosis; this run does not prove no-ACK
backup or recovery success.

Native teardown reported the workload reaped, cgroup unmounted before proc,
owned root unmounted last, four loop devices detached and the fixture removed.
It observed 110 unchanged host-root/cgroup samples and an unchanged final view.
Both distinct read-only cleanup audits then exited zero with empty stderr:
full process/mount/FD/backing census (`aecc291f` stdout) and separate observer audit
(`706eb00c` stdout). They verified the exact outside PID/start identities and lock
marker absent, no owned namespace or backing references, unchanged host identity
and more than 20 GiB root reserve. These audits close this failed attempt; they
do not turn its exit 1 into a successful pressure proof.

All 111 source hashes, 274 build inputs, configuration and nine payload artifacts
were rechecked after both audits. Private pre-execution source/input archives
remain pinned by `c6947f44` / `42efff33`. Parent closure is
`/tmp/task8-parent-host59-closure.json` (`327c3bc3`), which preserves the exact raw
stdout `7d9b40e2` and stderr `73762a1e`. HOST59 is closed and its source freeze is
released for a diagnosed correction. No production safeguard was activated.

### Actual terminal characterization and bounded nested failure clues

A small local rootless probe used the exact pinned Bun 1.4.4 binary (`10702245`),
pinned Distribution binary (`8be11cd3`), actual production child waiter and exact
owned-listener predicate. SIGTERM produced exit143/SIGTERM with the group absent
(`052534`). That tuple satisfies the API's terminal-tuple predicate; the probe's
`apiReceiptAccepted` label refers only to that predicate, not complete API receipt
validation. It does not prove UID59001/private-PID1 or full-volume behavior. The
first sandbox attempt was EPERM for loopback access, not an application RED.
The permitted retry and its private temporary repository were cleaned up.

The controller failure report now observes at most sixteen distinct causes through
the existing fixed-category/numeric-frame redactor. It bounds child traversal and
cycles while preserving original failure identity and reporter aggregation. Three
new cases failed before implementation because the nested clues were absent, then
all 53 controller cases passed with 417 assertions. The affected controller/routes/
redactor suite passes 93 tests/577 assertions. Five exact counterfactuals observed
17 versus 16 clues, repeated cyclic observations, loss of the nested numeric frame,
loss of aggregate children, and an unreadable seventeenth child causing reporter
refusal when the child slice was omitted. The last case is not proof of unbounded
output. Actual formatter composition replaces the prior constant formatter double.

Cover `/tmp/task8-pressure-diagnostics-covering.json` (`1164b0b7`) binds fifty
artifacts. Final library/spec/scoped lint pass; earlier import-group lint failure
is preserved. Complete ordered runtime transfer compares source/tests with three
runtime controls. The checked transfer separates raw file and normalized syntax
hashes; its earlier trailing-comma comparator mismatch and incorrectly labeled
normalized test hash remain preserved as unaccepted metadata. Only the native
controller changed since HOST59, to `8af6d84b`; tests are `5e459de2`. This improves
failure observation and does not correct the selected stop failure.

### HOST60: ACK child nonzero terminal identified; cleanup verified

The new diagnostic packet retained the same isolation, 896 MiB storage envelope,
root reserves, canonical zero-wait heavy lock and deadlines. Manifest `ebe5906d`,
driver `3057464f`, archive `1c9ad4a1` and normal bundle `7178c17b` bind 111 registry
sources and 274 actual build inputs. Independent host/API rebuilds were byte-exact;
the API bundle remained `29fb02f9`. Both source/input archives were captured before
execution. The only new native behavior was bounded nested failure observation.

The single run exited1 after 60.24 seconds without timeout. The new native alias
readbacks matched `7178c17b`. It failed at backup-under-pressure again, but five
redacted nested frame clues now locate the ACK subprocess waiter's nonzero-exit
branch. In that exact executed source the throw follows group-absence convergence
and the selected signal's abort check. The actual child exit code and underlying
ACK application refusal were not exposed. This is a narrower observed failure
boundary, not a successful stop/backup/recovery proof.

The launcher has two source-level paths that can lose the remaining diagnostic:
it aborts the bounded streams on waiter rejection, and its rejected-outcome branch
discards any fulfilled stderr bytes while aggregating rejected causes. Which stream
state occurred in HOST60 is unobserved. The next correction must preserve failure
and uncertain-cleanup cancellation while retaining the existing bounded redacted
child diagnostic. No allocator or pressure fix follows from an unproved hypothesis.

Native teardown reported no remaining namespace processes, removed fixture, normal
unmount order and detached loops. It observed 112 unchanged host-root/cgroup samples
and an unchanged final view. Full-process and separate observer cleanup audits both
exited0 with empty stderr (`a94ac88a` / `2fbe8b3d` stdout). They verified owned path,
namespace, descriptor, backing and lock references absent, unchanged host identity
and more than 20 GiB root reserve. Every source, build input, configuration, payload
and private archive pin was rechecked after both audits. Closure
`/tmp/task8-parent-host60-closure.json` (`2ca78273`) retains raw stdout `806122c9`
and stderr `180da433`. HOST60 is closed as failed, its source freeze is released,
and no production safeguards are activated.

### ACK failed-child diagnostics: bounded drain and strict observation

The actual launcher and actual owned-child waiter reproduce diagnostic loss with
controlled streams: the terminal-failure case failed because cancellation arrived
before stderr delivery. The new launcher permits draining only for the trusted
waiter's exact nonzero-terminal error after a fulfilled direct exit and while the
selected signal remains active. The actual waiter throws that error only after
its group-absence convergence and abort check. Rejected exit observation,
unconfirmed group, EPERM and selected cancellation still cancel immediately;
the existing captured-child fallback and bounded group observation are unchanged.

Failure observation uses the existing strict redactor on at most 4096 stderr
bytes, or marks the stream unavailable. It emits only fixed categories and numeric
frames, then preserves the original refusal. A reporter failure retains both
failures. Zero exit with diagnostics remains a refusal. Eleven new cases passed
with 81 assertions after the original targeted RED. Eight exact counterfactuals
observed lost confirmed-terminal output, inappropriate draining under uncertain
cleanup, reflected private text without the redactor, false empty observation,
missing required reports, lost original/reporter array membership and missing
zero-exit diagnostics. Clock/group/child/spawn/FFI and admission remain modeled;
the tests use controlled real streams and the actual reader/redactor. Their
100ms rescue does not prove native ten-second timing.

Final affected checks pass 122 tests/1007 assertions, scoped launcher/test lint,
and library/spec typechecks. The initial one void-callback lint failure is retained;
an explicit callback block corrected it. Complete whitespace-only Bun emission
matches the launcher before/after comments and formatting. Three changed-runtime
controls differ. The test-harness transfer explicitly records its sole callback
block normalization. Cover `/tmp/task8-pressure-probe-observation-covering.json`
(`e2abb5b6`) binds sixty artifacts and the observed failures; final launcher is
`07758953`, new test `762f3156`, and the actual waiter remains `20209093`.
This local correction improves diagnosis; the underlying native ACK refusal is
still unknown before a new native run. No production safeguards are activated.

### HOST61: small ACK allocation succeeds after filler ENOSPC

Manifest `63ad416b`, driver `0541434c` and archive `8947e273` bind the new normal
bundle `62b4ceb3` and unchanged API bundle `29fb02f9`. The only runtime source
change since HOST60 is the launcher's bounded diagnostic preservation. Complete
111-source/274-build-input freezes and private archives preceded execution;
independent host/API rebuilds matched byte-for-byte. The inner and workload are
byte-identical to HOST60; outer syntax differs only in expected payload hashes.
The existing isolation, heavy lock, 896 MiB envelope and deadlines remain intact.

The one run exited1 after 60.73 seconds without timeout (`5d7805`). Native readback
matched all three installed aliases to `62b4ceb3`. The new failure observation
retained child exit1 and a valid bounded redacted frame at bundle27829. Inspection
of that exact pinned bundle maps the frame to
`Current fixture ACK allocation unexpectedly succeeded`: the ACK file opened and
its request write succeeded after the earlier filler ENOSPC. The rejection is
correct. A preceding large-file ENOSPC alone did not establish failure of this
small fresh allocation. The reason it still fit remains unproved; neither a
preallocation-release explanation nor an allocation-granularity explanation is
established by this run. No allocation guard was weakened, and this is not a
successful pressure-stop, new backup or recovery proof.

Teardown observed the workload terminal, no remaining namespace processes,
normal unmount order, four detached loops and the fixture removed. All 114 periodic
host-root/cgroup samples and the final view remained unchanged. Both distinct
read-only cleanup audits exited0 with empty stderr: full-process/mount/FD/backing
census stdout `6c00db5f`, and independent observer stdout `4a174578`. They confirmed
the exact owned root, namespace and outside PID/start identities absent, no owned
lock record or backing references, unchanged host identity and 113826820096 bytes
root reserve. Sources, actual inputs, configuration, nine payloads and private
archives were rechecked after both audits. Closure
`/tmp/task8-parent-host61-closure.json` (`e285f11b`) pins raw stdout `66a6d587`
and stderr `fa977c7c`. HOST61 is closed as failed, its runtime freeze is released,
and no production safeguards were activated. The next investigation concerns the
filler's exhaustion guarantee for the actual small allocation, not ACK acceptance.

### HOST62: residual space survives large-write ENOSPC

An independent Python probe used the existing owned h4claw namespace, enforced
128 MiB ext4 registry volume, separate journal/root, read-only cgroup view,
canonical zero-wait heavy lock and the same 896 MiB allocation envelope. It kept
the entire isolation preamble and cleanup, replacing only the Bun application
exec with a fixed allocation diagnostic. The inner replaced irrelevant authority
stage receipts with a named diagnostic outcome. The inherited native bundle was
installed but never executed. This is filesystem diagnosis, not an authority,
current-request ACK, writer-stop, backup or recovery proof.

The single run exited0 in 4.96 seconds without timeout. A one-MiB write eventually
returned ENOSPC after 105906176 bytes. Counters still showed 55 available 4096-byte
blocks. They stayed identical before fsync, after fsync and after close. A fresh
UID59001 file then accepted 111 bytes and fsync succeeded; 54 blocks remained.
Thus this run observes residual small-allocation capacity, rather than space
released by flush/close or only a buffered-write success. It does not identify a
kernel allocator implementation defect. The [ext4 documentation](https://www.kernel.org/doc/html/latest/admin-guide/ext4.html)
was consulted for allocation semantics; no mount option changed.

Manifest `142471ee`, driver `a3c0ff41`, archive `ff7d9a27`, raw stdout `fd7e1e1a`
and empty stderr bind the experiment. Three periodic host-root/cgroup samples and
the final view remained unchanged. Both cleanup audits exited0 with empty stderr:
full-process census stdout `90e42ee2`, independent observer stdout `5927d042`.
They confirmed exact owned root/process/namespace/lock/backing references absent,
unchanged host identity and 113826754560 bytes root reserve. Every frozen source,
input, configuration, payload and private archive was rechecked afterward.
Closure `/tmp/task8-parent-host62-closure.json` (`14af2c0f`) releases the freeze.
HOST62 is closed for this narrow diagnostic scope and will not be replayed.

### Filler regression: bounded smaller writes before an exhaustion receipt

The original actual filler body returned a pressure receipt while an independent
modeled allocator still had 4207 bytes available. The targeted regression failed
before implementation. The filler now halves its requested write size after
ENOSPC, down through one byte, and accepts exhaustion only at that final size.
It preserves the 128 MiB total-byte ceiling and adds a 256-call ceiling for partial
write convergence. Unknown and code-shaped non-Error failures still propagate;
reported progress must fit the current smaller request. The same file stays
retained, outside captured contents, with required identity checks, fsync and close.
No ACK classification, writer lifecycle, census or pressure-release rule changed.

All 44 filler cases pass with 154 assertions, including residual space, partial
writes, unknown/non-Error tail failures and call/byte bounds. The affected pressure,
ACK, bridge and diagnostic suite passes 178 tests/1083 assertions. Scoped lint and
library/spec typechecks pass. Six exact counterfactuals observed residual 4207 bytes,
111 bytes when stopping at 4096, an independent 257th call after call-bound omission,
an extra 129th zero-length request after byte-bound omission, false ENOSPC receipts
for unknown/non-Error failures, and accepted oversized tail progress. The byte-bound
case proves an extra attempted call before later refusal, not allocated bytes beyond
the cap. Local filesystem ports remain modeled; HOST62 supplies the independent
physical observation, not native validation of this new implementation.

Cover `/tmp/task8-volume-tail-covering.json` (`706354af`) binds 42 artifacts. Final
filler source is `3de6e1cd`; complete whitespace-only Bun emission is unchanged after
adding the observed proof comments, with three changed-runtime controls. The final
six counterfactuals use the exact formatted test snapshot. A new full native pressure
run remains necessary before claiming the selected-stop/backup/recovery correction.

### HOST63 packaging correction before execution

The first derived build script retained a dynamic `61` output-name literal. It
produced the new bundle under old generated filenames; the subsequent previous-pin
check refused before any host run. Those first build receipts and wrong-output
artifacts are retained as unaccepted. The corrected script writes actual `63`
filenames, and its independent host/API rebuilds match byte-for-byte.

The original HOST61 bundle was restored from its unchanged frozen archive, with
its exact `62b4ceb3` hash. Its normal metafile was recovered using preserved fields
and the original input ordering recorded in the frozen manifest; its original raw
SHA `aa6c530f` matches exactly. Earlier serialization/order candidates failed the
hash check before any writes. All HOST61/HOST62 payload and normal-metafile pins
were then revalidated. The old independent-rebuild metafile had no recorded raw
hash; its replacement carries the same recovered input graph and rebuild output
name. Historical byte-exact rebuild metadata is not claimed. Raw host receipts,
source archives and transport archives were unchanged. The repair is recorded in
`/tmp/task8-host63-output-repair.json`; no earlier host attempt was replayed.

### HOST63: stop and backup advance; later receipt comparison refuses

The corrected packet binds manifest `ec51a772`, driver `228fcddd`, archive
`7028f04c`, normal bundle `51b07f1a` and unchanged API bundle `29fb02f9`.
The only runtime source change since HOST61 is the filler correction. Independent
host/API rebuilds matched exactly; all 111 sources, 274 actual build inputs,
configuration and private archives preceded execution. The initial input-freeze
scope text accidentally retained a HOST61 label; its hashes describe the current
HOST63 inputs, checked against the corrected builds and source freeze. That label
is metadata error, not historical HOST61 build evidence. No frozen record is edited
retroactively. The normal inner/workload remain byte-identical to HOST61.

The single run exited1 after 84.62 seconds without timeout. Native installed-alias
readbacks matched `51b07f1a`. This time the selected bridge produced a receipt:
its actual current-request UID59001 allocation probe observed ENOSPC and its exact
owned writer closure completed before the real stopped census. The synthetic
Deployment reached zero replicas and its service was withdrawn. The second root
backup snapshot and backup verification actions completed under pressure; nineteen
bounded GET observations completed with HTTP200 and no pending requests.

The controller then failed at bundle28631, the combined comparison of selected
writer PID/start, instance hash, request hash against the later request file, and
request freshness. The individual mismatching field was not emitted. Source
inspection shows `persistJournal` revokes on every fenced persistence, and
`createWritePermit.revoke` generates a new request UUID. Later request rotation
is therefore a concrete next hypothesis. It is not a directly observed failed-field
value. The next regression must preserve independent selected-request binding at
the allocation witness, rather than simply delete the comparison or trust the
probe's hash. Staged recovery was not invoked; complete pressure success and
matching final canonical backup lineage remain unproved by this controller run.

All 161 periodic host-root/cgroup samples and the final view stayed unchanged.
Native cleanup reported normal unmount order, terminal workload, no namespace
processes, four detached loops and removed fixture. Both distinct cleanup audits
exited0 with empty stderr: full-process census stdout `6b43fd2e`, independent
observer stdout `41cfb7a6`. They confirmed the exact owned root, PID/start pairs,
namespaces, lock records, file descriptors, mounts and backing references absent,
unchanged host identity and 113717338112 bytes root reserve. Every source, input,
configuration, payload and private archive was rechecked after both audits.
Closure `/tmp/task8-parent-host63-closure.json` (`23f705fb`) pins raw stdout
`51d22165` and stderr `4bf595cd`. HOST63 is closed as failed, its source freeze is
released, and no production safeguard was activated. Full Task8 review, the
remaining scenarios, backup budgeting, alert adoption and exact-SHA gate remain open.

### Selected-request correlation: observe at allocation, retain across later revocations

Source tracing connects every fenced `persistJournal` call to `permit.revoke`,
which generates a fresh readonly-request UUID. A new controller regression
reproduces HOST63's combined refusal by returning a correctly bound selected-stop
receipt, then advancing the live request as later maintenance would. It fails
before implementation. A second regression observes the original callback never
capturing a selected snapshot, using the actual `createWritePermit` revocation
implementation and real local files. A third observes a modeled receipt accepted
without an independent selected callback. All three are genuine test REDs. The
third wrapper's overly specific wording sentinel failed after persisting the
correct failed-test receipt; the receipt was separately audited rather than
misclassified as a parser or runtime failure.

The controller now independently reads the bounded request inside the selected
allocation callback before invoking the ACK subprocess, with cancellation checks
before and after the read. Only a successful probe publishes that captured value.
It compares the returned receipt's PID/start, instance, request hash and freshness
against this snapshot. It no longer rereads a future request and treats it as the
earlier allocation witness. The stop coordinator still independently validates
its own current request, instance, probe hash and exact writer terminal identity;
none of those checks was removed. Missing selected capture remains a refusal.

Sixty-one controller/callback cases pass with 485 assertions. The affected suite
passes 171 tests/1117 assertions. After correcting a test-only optional AST argument
access from indexed syntax to `.at(1)`, its six callback cases pass with 46 assertions;
scoped lint and spec typecheck pass, and the library typecheck passes. The initial
unnecessary-condition lint failure is retained. The local coupled test uses actual
revocation writes and real files, with request-path mapping, unreadability, abort
placement and ACK subprocess effects modeled; it does not prove native UID59001
record metadata or native process lifecycle.

Seven exact counterfactuals observe rejection after a late live-file reread, loss
of the captured snapshot, an extra read before pre-existing cancellation, acceptance
after cancellation during the read, false acceptance of modeled unreadability when
the independent read is replaced, and acceptance of a mismatched receipt hash.
Removing only the missing-capture clause instead changes the refusal to TypeError;
that is diagnostic-only evidence, not independent safety enforcement. The missing
real-file case under read substitution changes failure identity to the probe read;
no missing-file false-success claim is made. Proof comments state those limits.

Cover `/tmp/task8-request-correlation-covering.json` (`a9fb5c4c`) binds 63 artifacts.
Final controller is `fff864f8`; complete whitespace-only Bun runtime emission matches
before/after proof comments with three changed-runtime controls. The counterfactuals
pin their exact pre-accessor-fix test snapshot. A new native run is still required.
The HOST64 builder now constructs filenames from one version variable and refuses
all existing output names before building, preventing the prior filename collision.

### HOST64: full-volume no-ACK backup and staged fenced recovery pass

The new packet binds manifest `a1e7ccef`, driver `84a8e24f`, archive `c654aeca`,
normal bundle `3b63368e` and unchanged API bundle `29fb02f9`. Its only runtime
source change from HOST63 is selected-request correlation. All 111 sources, 274
actual build inputs, configuration and private archives were frozen before
execution. New normal and independent rebuilds matched exactly. All output names
were required to be fresh before building, and previous HOST63 artifacts remained
unchanged. The inner/workload are byte-identical to HOST63; outer runtime syntax
differs only in expected payload hashes, with the same coordinator helper and
version/manifest-only driver derivation.

The single run exited0 in 118.72 seconds without timeout and with empty stderr.
Fresh native reads matched all three installed aliases to `3b63368e`. The actual
UID59001 allocation probe failed its current-request ACK write with ENOSPC. Its
receipt names writer4275/start344924300, terminal143/SIGTERM and absent group.
The filler remained 105889792 bytes on the separate bounded registry filesystem,
outside the captured contents. A new matching verified backup was retained, with
snapshot `34a9e26c` and offline-journal hash `ba4a0054`. A separate explicit
pre-serving refusal preserved the failure fence after that backup.

The same-operation recovery then exited0. Nineteen backup and thirteen recovery
HTTP GETs completed with status200, no pending requests and no truncation. Before
the positive controller receipt, actual postconditions verified four distinct
filesystems, matching backup/handoff identities, unchanged current obligations,
same canonical lock, the restored offline-journal hash, protected revision bytes
in both old and restored stores, retained filler, and staged fenced recovery.
Serving activation remains pending. Kubernetes termination, readers and provider
admission are synthetic; authority, Distribution, filesystem allocation, backup
and recovery are actual. This does not establish startup-shell ACK behavior,
elapsed grace timing, actual upload/inode exhaustion, ordinary CLI adoption,
production activation, monitoring or the full Task8/final gate.

All 229 periodic host-root/cgroup samples and the final view stayed unchanged.
Native teardown observed terminal workload, no remaining namespace processes,
normal unmount order, four detached loops and removed fixture. Both distinct
cleanup audits exited0 with empty stderr: full-process census stdout `beeedf2e`,
independent observer stdout `d1a24f98`. They verified exact root, PID/start pairs,
namespaces, lock, descriptor, mount and backing references absent, unchanged host
identity and 113747406848 bytes root reserve. Every source, input, configuration,
payload and private archive was rechecked after both audits. Closure
`/tmp/task8-parent-host64-closure.json` (`60990f60`) pins raw stdout `240b325b`
and empty stderr. HOST64 is closed for this successful scope; its source freeze
is released. It will not be replayed merely for observation.

### Fresh remaining runtime lint inventory

A read-only ESLint inventory covered 95 modified/untracked non-test runtime files
under `tools/tool-fleet/src`, yielding 313 errors, zero warnings, across 57 files.
The command, source pins and JSON output are preserved under
`/tmp/task8-runtime-lint-inventory64.*` (`3dd55d2d` exit-receipt hash). This replaces
the incomplete historical debt count; it is not a passing full gate. The native
host's 26 errors remain part of this inventory. Required lint remediation,
remaining exhaustion/CLI scenarios, semantic R5 reconciliation, formal Task8
review, backup accounting, alert adoption and exact-SHA activation checks remain
open. No production safeguards were activated by these disposable rehearsals.

## Task8 project regressions and host bootstrap ordering — 2026-10-29

After HOST64 closure, six alias-to-interface conversions and three explicit type
imports removed nine lint errors across seven files. The interface changes
preserved complete standalone runtime emission. Three type-import edits changed
standalone import linking; their evidence is instead the independently rebuilt
complete native entrypoint, byte-identical to executed HOST64 (`3b63368e`). This
was checked before the subsequent command-bootstrap change below and does not
claim the current full native program is still byte-identical. Initial and final
transfer attempts, controls, source snapshots and type checks remain under
`/tmp/task8-lint-types/`; the final transfer receipt distinguishes these scopes.

The first full tool-fleet run then reported2049 passes, two skips, two failures
and one error across164 files. One failure was the QEMU lifecycle timeout. Two
registry tests permanently enabled Linux child-subreaper state in the shared Bun
runner, allowing it to adopt later mock daemons whose zombies prevented the lab's
stop observer from completing. An independent native preload observed flag0
before the tests and flag1 after them; the inherited-state assertion failed.
The first exit-event probe did not observe teardown under Bun; only the later
preload `afterAll` observations establish the final flag.

`scopeMaintenanceReaper` now captures/restores the inherited flag around each test
in the two direct users and both native backup-store consumers. Production child
lifetime checks and the lab provider are unchanged. Omitting the native restore
call made teardown fail and independently left flag1. Restored combined execution
passed50 tests with two optional native skips, including the exact lab lifecycle
in5.37seconds and final flag0. Both optional tests were subsequently enabled with
pinned restic `20d41426`: four backup tests passed, zero skipped, final flag0.
Before rerunning lifecycle tests, the normal provider `down` cleaned only failed
mock lab `e2e-2318837` under `/tmp/fleet-qemu-lab-Ndz1qK`. A host-namespace audit
confirmed all four captured PIDs absent, no members of either captured process
group and no other process argument references to that exact root.

The other failure was the existing actual CLI negative for raw schema3 promotion.
Fixed-installation loading raised ENOENT before the core command schema could
reject the malformed request. `executeRegistryCommand` now also accepts deferred
host ports, resolved after its existing request validation and before lock/state
effects. The CLI supplies a memoized loader retaining the fixed installation and
canonical-directory checks. The loader caches installed ports for monitor iterations;
ordinary monitor continuation remains unverified. No configurable installation
path or request-supplied host capability was added.
Existing object-port callers retain their prior path.

Three added command tests and the actual CLI regression first produced three
failures and one passing negative, then all four passed. Exact ordering faults
showed that early bootstrap masks malformed input with the injected host failure,
and bootstrap inside the lock leaves `authority.lock` despite preserving the
original failure. Restored execution passed five focused cases with final native
flag0. Adjacent Proof comments preserve complete emitted runtime, with real
side-effect controls. Import sorting preserved all non-import statements.

The final configured project command was
`bun test --preload ../test/scratch/preload.ts --timeout=30000`, run from
`tools/tool-fleet` with `PUNI_TEST_RESTIC_BINARY=/tmp/task8-restic-native/restic`.
It exited0:2056 passes, zero failures/skips,8756 assertions,164 files,97.89seconds.
All333 captured TypeScript/config pins matched at terminal observation. Formatting
then changed only two test import blocks; complete standalone emitted runtime
remained equal, and side-effect controls differed. All eight touched files now
pass Prettier. Library/spec type checks exited0. The nine non-TypeScript fixture
pins from the preceding project run still match; they were not recaptured before
this final run and are not included in its333-pin claim.

Fresh runtime lint covers the prior95 files plus the new test helper:303 errors,
zero warnings across96 files. The selected existing test files also retain lint
debt; this is not a passing lint gate. Full source/log/snapshot bindings are in
`/tmp/task8-bootstrap-isolation-covering.json`, SHA256
`5af482bed8602795190db2008f010fafe098683385a8cae4f1f268da9da0b230`,132pins.
The project receipt is `/tmp/task8-project-after-bootstrap/exit.json`; bootstrap
and native-state counterfactuals are under `/tmp/task8-command-bootstrap/` and
`/tmp/task8-suite-isolation/`.

The original17 requirements/24 scenarios remain intact. Task4.2/Task8 remains in
progress; actual upload/inode exhaustion, ordinary supervisor/CLI serving
continuation, complete semantic R5 reconciliation, runtime/test lint cleanup,
formal original-BASE Task8 review, Tasks9–11 and the exact-SHA host gate remain
required. This local work made no production configuration or safeguard change.

## Task8 import and void-callback lint remediation — 2026-10-29

This continuation removed55 required lint findings across45 runtime/fixture files.
Exactly43 import-order diagnostics were fixed through the import-sort rule alone.
The rewrite verifies complete non-import syntax, import binding multiplicity and
side-effect-only import order before and after Prettier; added-statement and
added-binding controls differ. Normal dependency evaluation order may change, so
this is not a whole-program byte-equivalence claim.

Twelve shorthand callbacks whose original expression types are `void` now use
statement blocks. The original compiler signatures are eleven `void` and one
`Promise<void>`; callers consume effects or await completion. Full syntax-tree
comparison permits only the expression-arrow/block normalization and includes
literal contents, type syntax and declaration flags. Side-effect, type and
const-to-let controls differ. No guard, signal, cancellation bound, fsync, lock or
refusal branch was removed. This is a mechanical callback rewrite, not an emitted
byte-equivalence claim. Nine files have callback edits; seven overlap the import
set, making45 distinct edited files.

The first printer-based callback comparison stopped on an object literal's
multiline/trailing-comma layout in `registry-maintenance-host.native.ts`. Its raw
normalized copies and before/after sources are retained. The structural comparison
resolved that formatting difference and verified all twelve typed callbacks;
the failed printer attempt is not reported as a successful comparison.

Final checks against stable source:

- Complete configured tool-fleet command, with pinned native restic enabled:
  2056 passes, zero failures/skips,8756 assertions across164 files,104.83seconds.
  The runner exited0 and all333 captured TypeScript/config pins still match.
- Library and spec type checks: exit0, empty stdout/stderr.
- Prettier: exit0 for all45 edited files.
- The configured Bun build compiled all11 production CLI entrypoints. The first
  observer searched only the output root and missed Bun's nested files. Corrected
  recursive discovery and a fresh repeat both found11 outputs, byte-identical
  between the two builds. The verified build receipt exits0. Neither build was
  installed or executed as a production service.
- Fresh96-file runtime lint inventory:248 errors, zero warnings; no import-sort
  or confusing-void findings remain in this inventory. Test-file lint and other
  project/full-repository gates are not certified by this runtime-only result.

The initial check wrapper also stopped before its first type-check launch because
it expected44 edited files. The actual43+9 union is45, including the native host
and process helper outside the import set; that observation was corrected before
running the recorded checks. Wrapper failures are retained separately from the
successful tool commands.

`/tmp/task8-layout-covering.json`, SHA256
`a2d6093e1357c06a05691562250f80332984df9adad5b73e9b67f2249bbb0b75`,216pins,
binds the exact transformations, source snapshots, controls, check receipts,
logs and both build outputs. The project run is recorded under
`/tmp/task8-project-after-layout/`; check receipts are under
`/tmp/task8-layout-checks/`. The two owned build archives are owner-only. Earlier
source-bound packages remain historical records; their old live-source pins are
not claimed to match after this approved cleanup.

Task8/4.2 remains in progress. The original17 requirements/24 scenarios, remaining
248 runtime errors and test lint, semantic R5 reconciliation, actual upload/inode
exhaustion, ordinary supervisor/CLI serving continuation, formal original-BASE
review, Tasks9–11 and the exact-SHA host gate remain required. There was no h4
rehearsal, closed successful-scope replay or production safeguard activation.

## Task8 indexed Array-read typing — 2026-10-29

Thirty-three nonnegative literal-index reads in19 runtime/fixture files now use
`Array.at`. The original receivers were compiler-verified ordinary Arrays, not
tuples; their producers include split/filter results, filesystem listings,
validated journal arrays and `process.argv`. This represents possible absence in
the type while retaining the same index on ordinary owned arrays. One unrelated
`unknown[]` read inside a schema assertion was excluded, as were tuple and optional
chain element accesses. The listener's inner Array read changes while its existing
outer optional access remains intact.

All guard/loop/switch/ternary conditions remain structurally unchanged. Complete
syntax trees otherwise match under only positive-index Array-at/index
normalization, including literal contents, type syntax and declaration flags.
Wrong-index and added-effect controls differ. These are mechanical transfer
checks, not additional R5 guard-removal proofs or emitted-byte equivalence.

The first full run exited1:2053 passes, three failures,8750 assertions. All three
failures were the existing actual-main route tests: their source extractor still
required the old `process.argv[2]` spelling. Only that extraction literal changed
to `process.argv.at(2)`. The entire actual main body and all original effect/failure
assertions remain exercised. The affected lifecycle file passed18 tests and50
assertions before the complete suite was rerun. The failed run remains preserved.

Final configured tool-fleet execution, with pinned native restic enabled, exited0:
2056 passes, zero failures/skips,8756 assertions across164 files,108.95seconds.
All333 captured TypeScript/config pins matched during and after the final run.
Library/spec checks exited0; the spec check was repeated after the test-anchor
change and again exited0. Formatting passed for19 runtime files and the changed
test. All11 configured production CLI entrypoints built successfully into an
owner-only temporary archive; they were not installed or activated.

Fresh96-file runtime lint reports200 errors, zero warnings. The only rule-count
change is48 fewer `no-unnecessary-condition` findings; that rule now has46 remaining
findings. No other rule count increased or decreased. Runtime lint remains failing,
and test-file/full-repository lint remains uncertified.

`/tmp/task8-array-covering.json`, SHA256
`6e243dc9715ccc24d8f9957646682eeecf609d1c35bdfa2feeca98d56941a1c7`,108pins,
binds the exact edits, snapshots, controls, both full-suite runs, final check logs
and compiled outputs. Runtime transfer is under `/tmp/task8-array-reads/`; current
lint/check receipts are under `/tmp/task8-array-checks/`. The final project receipt
is `/tmp/task8-project-after-array-final/exit.json` (stdout `f6e40a39`, stderr
`6960d3ec`). Earlier live-source proof packages are historical after these edits.

The original17 requirements/24 scenarios and Task8/4.2 scope remain intact. Runtime
and test lint, complete semantic R5 work, guardian supplement integration/R2 naming,
actual upload/inode exhaustion, ordinary supervisor/CLI serving continuation,
formal original-BASE review, Tasks9–11 and the exact-SHA host gate remain required.
No h4 rehearsal, closed successful-scope replay or production activation occurred.

## Task8 untrusted value typing — 2026-10-29

Twenty-four type-only annotations across13 modules removed31 lint findings:
13 decoded-JSON response envelopes receive an explicit unknown state context before
the existing canonical validator, seven promise rejection parameters are `unknown`,
and four mapped return types preserve decoded values or rejection reasons as
unknown. No validator, trusted-state assertion, unsafe cast, exception conversion,
field access, signal, lock, branch or execution order was added or removed.

Every edited module's complete emitted JavaScript is byte-identical before/after
formatting; added-effect controls differ. All11 production CLI build outputs also
match the immediately preceding Array-read build byte-for-byte. This does not
claim equality to historical HOST64. Return types become precise without changing
the original rejected values or their identity.

The first read-only edit selector assumed that every canonical response envelope
contained a direct JSON decode. It stopped before any source write when it met a
valid envelope with another producer. Selection was restricted to the direct JSON
decode cases, enforcing the exact13-target count; other parser calls were unchanged.
The separate virtual-source prototype confirmed the unknown context clears its
unsafe-assignment finding while preserving emitted runtime.

Final configured tool-fleet command, with pinned native restic enabled, exited0:
2056 passes, zero failures/skips,8756 assertions across164 files,103.98seconds.
All333 captured TypeScript/config pins matched during and after execution. Library
and spec checks exited0 with empty output; formatting passed all13 files. The11
production entrypoints built into an owner-only temporary archive and were not
installed or activated.

Fresh96-file runtime lint remains failing at169 errors, zero warnings. Compared
with the previous inventory, unsafe assignments decrease20, unsafe returns four
and unknown rejection-parameter findings seven; no other rule count changes.
Remaining unsafe assignments include native spawn interposition and one raw fixture
journal/token read. Their boundaries require separate review; no blanket cast or
lint suppression was introduced here. Test/full-repository lint remains uncertified.

`/tmp/task8-unknown-covering.json`, SHA256
`1654d0e799aa1d84657cd15fd5ab76d55c99e4395400b7e12e10df6eb631d999`,90pins,
binds source snapshots, emitted-code controls, build equality, terminal checks and
raw logs. The final project receipt is
`/tmp/task8-project-after-unknown/exit.json` (stdout `3415d09d`, stderr `e504ac5e`).
Current lint/check receipts are under `/tmp/task8-unknown-checks/`.

The original17 requirements/24 scenarios and Task8/4.2 remain incomplete. Remaining
runtime/test lint, semantic R5 reconciliation, guardian supplement integration/R2
naming, actual upload/inode exhaustion, ordinary supervisor/CLI serving continuation,
formal original-BASE review, Tasks9–11 and the exact-SHA host gate remain required.
There was no h4 rehearsal, closed successful-scope replay or production activation.

## Task8 native call and callback capability typing — 2026-10-29

Six local return-type assertions across three fixture modules recover the captured
`Bun.spawn` contract erased by `Reflect.apply`. Each target was verified to call
a const captured from `Bun.spawn`, with the original receiver and argument forwarding.
Each assertion has an adjacent comment naming that trusted callable boundary;
stdio remains opaque. No decoded/untrusted payload was asserted. Native child
identity, existing PID/exit/signal checks, throws and returned capabilities remain
unchanged. This removed37 unsafe-assignment/member/call/argument/return findings.

Seven method-reference findings came from six callback declarations in five other
modules. Their implementations were reviewed as closure-backed capabilities.
The first `this: void` representation passed type checking and removed those seven
findings, but the repository's default invalid-void rule rejected it six times.
That intermediate lint run remains failing at131 errors and is not certified.

The final representation uses five function-valued property signatures and an
explicit channel result type with a function-valued frame callback. The original
inferred channel fields and actual method implementations remain intact. No
function is rebound, and no lint policy or suppression changed. This removes all
seven unbound-method findings without the six invalid-void errors.

All eight edited modules emit complete JavaScript byte-identical to their saved
pre-change sources; added-effect controls differ. All11 final production CLI
build outputs also match the preceding unknown-boundary build byte-for-byte.
This does not claim equality to historical HOST64 or add R5 guard-removal coverage.

Final configured project execution with pinned native restic exited0:2056 passes,
zero failures/skips,8756 assertions across164 files,100.57seconds. All333 captured
TypeScript/config pins matched during and after the run. Library/spec checks
exited0 with empty output. Formatting passed the three native-call files and five
callback-contract files;11 production entrypoints built successfully into private
temporary archives. Earlier full runs for the return assertions and intermediate
receiver spelling also passed, but their lint inventories remain historical.

Fresh96-file runtime lint reports125 errors, zero warnings:44 fewer than the
169-error baseline. The remaining untyped JSON observations are confined to the
sudo fixture's contender output and journal/token read and require separate
boundary work. Test/full-repository lint remains uncertified.

`/tmp/task8-capability-covering.json`, SHA256
`27f10d09f242ac3b4728d15f489c953af60b7f99f24b2433ca94288d427fc1ae`,158pins,
binds the final eight sources, snapshots, controls, all three check/run stages,
rejected receiver representation and production build equality. The final project
receipt is `/tmp/task8-project-after-function-capabilities/exit.json` (stdout
`55913c96`, stderr `ff021366`). Current lint/check receipts are under
`/tmp/task8-function-capability-checks/`.

The original17 requirements/24 scenarios and Task8/4.2 remain incomplete. Remaining
runtime/test lint, semantic R5 reconciliation, guardian supplement integration/R2
naming, actual upload/inode exhaustion, ordinary supervisor/CLI serving continuation,
formal original-BASE review, Tasks9–11 and the exact-SHA host gate remain required.
No h4 rehearsal, closed successful-scope replay or production activation occurred.

## Task8 contender observation boundary — 2026-10-29

The actual sudo-fixture caller previously accepted missing or false acquisition
observations, truthy non-boolean fence observations and foreign fields. Two valid
cases also decoded stdout twice. The initial regression run demonstrated eight
false acceptances and two decode-count failures:12 passes/10 failures. The caller
now requires the producer's exact three-field proof: `acquired: true`,
`effect: 'absent-under-lock'`, `fenced: true`, without extra keys. It decodes once.
Failed-exit and diagnostic checks still run before decoding; the early-drop
nonzero-marker route remains unchanged.

The final25 focused tests/32 assertions execute the actual caller block and two
actual producer-expression cases with modeled observations. Seven exact omissions
independently remove acquisition, fence, effect, extra-key, exit, diagnostic or
decoder enforcement. Every omission produces a false acceptance in the actual
caller and a failing refusal assertion. Adjacent Proof comments retain this scope.
These tests execute no privileged sudo/flock/process effects. Complete emitted
code is unchanged by the subsequent Proof-comment transfer; its effect control
is detected. The behavioral validator change itself is intentional.

The final configured project run exited0:2081 passes, zero failures,8788 assertions
across165 files in102.86seconds;334 TypeScript/config pins stayed unchanged.
Library/spec checks, formatting, scoped new-test lint, all11 production CLI builds
and native fixture compilation exited0. Production CLI output matches the previous
capability-typing build. Native compilation alone establishes no executed native
proof or equality with historical HOST64. Runtime lint still fails:123 errors,
zero warnings across96 files, two fewer than before. Whole-test/repository lint
and the exact-SHA host gate remain unverified.

`/tmp/task8-sudo-observation-covering.json`, SHA256
`8b6bd3e56eb1fbf5e9963897af0b0e8b89e373adf940fb17c068f9843d7160d6`,105pins,
binds both final sources, original/changed snapshots, seven final omission cases,
raw logs, terminal checks and output hashes. Project receipt:
`/tmp/task8-project-after-sudo-observation/exit.json`; boundary artifacts:
`/tmp/task8-sudo-observation/`; check receipts:
`/tmp/task8-sudo-observation-checks/`.

Fresh read-only h3mon inspection at2026-10-29T19:59:25Z confirmed the running
Alertmanager's loaded `slack-puni` receiver, `#puni-alerts`, recovery notifications
and matching protected secret. It reported46 Slack requests and zero failed
requests. No new notification was sent. Source-renderer preservation, registry
alert scenarios and independent missed-report delivery remain unfinished.

Task8/4.2 and the original17 requirements/24 scenarios remain incomplete. No new
h4 rehearsal, closed-success replay, production activation or final review occurred.

## Task8 canonical journal observation boundary — 2026-10-29

The sudo logging-evidence scanner previously accepted a36-character token inside
an unchecked journal. Its initial16-case regression run produced7passes/9failures:
a token-only envelope, wrong revision/schema, extra field, malformed UUIDs,
inconsistent fence, unfenced recovery and foreign maintenance evidence all received
successful certification. It now uses the existing complete canonical journal
response parser. An absent maintenance token refuses before reading log files.

The scanner tests use actual canonical authority writes, ordinary owned files and
the actual scanner code, including plain/gzip token leaks and absent, unreadable
and malformed journal refusals. They execute no sudo or privilege effects.
Removing the canonical parser falsely certifies the token-only journal. Removing
the owner guard enumerates logs before later undefined-token refusal; that witness
proves early refusal, not successful false certification. Both exact omissions
failed again against the final tests. The adjacent Proof-comment transfer emits
identical complete JavaScript and detects an injected-effect control.

The first new-test lint run exposed16errors: import order, await-free async
capacity callbacks and awaiting Bun matchers whose declarations return void.
The final test explicitly awaits the operation, returns a caught Error only for
an actual refusal, and throws when the operation resolves. The positive assertion
awaits the scanner directly. No rule or suppression was weakened. New-test lint,
library/spec types and formatting now exit0 with the final sources.

Final complete configured project execution exited0:2097passes, zero failures,
8821assertions across166files in99.31seconds; all335TypeScript/config pins stayed
unchanged. The earlier2097-pass run predates the assertion correction and remains
historical. All11production CLI builds exit0 and match the preceding contender
build byte-for-byte. Native fixture compilation exits0; no privileged execution,
HOST64 equivalence or installed-boundary proof is inferred from compilation.
Runtime lint still fails with120errors/zero warnings across96files, three fewer
than the previous123-error inventory. Whole-test/repository lint remains open.

Automatic approval review intermittently failed to refresh its access token.
Six checks initially could not execute; library/spec later succeeded while four
still could not execute. All four eventually ran through normal approval review.
No alternate execution bypass was attempted. The new-test lint failure above was
then repaired and independently checked. This infrastructure blocker is resolved.

`/tmp/task8-sudo-journal-final-covering.json`, SHA256
`8435f2ed28de0c2b1ff44201e7d2247b15c38a327e510d018c7a2a8a00ef01f5`,88pins,
binds current sources, both test versions, failed/final omission witnesses,
checks, prior/final project logs and compilation outputs. Final project receipt:
`/tmp/task8-project-after-sudo-journal-final/exit.json`; final check receipts:
`/tmp/task8-sudo-journal-final-checks/`. Runtime lint/native/CLI build receipts
remain `/tmp/task8-sudo-journal-checks/`, verified against the unchanged runtime
source. Optional-chain triage records four unsafe suggested rewrites; no such
runtime rewrite was applied. Strict OpenSpec validation still returns valid with
no issues. All17requirements/24scenarios remain intact.

Task8/4.2 and Tasks9–11remain incomplete: physical upload/inode exhaustion,
ordinary supervisor/CLI serving continuation, full semantic R5 reconciliation,
guardian supplement/R2 naming, remaining lint, whole original-BASE review,
backup physical bounds, persistent monitoring/watchdog, fresh target adoption and
the exact-SHA host gate remain required. No new h4drill, closed-success replay,
production safeguard activation or product migration occurred.

## Task8 aggregate failure causality — 2026-10-29

Twelve AggregateError constructors across four native/private fixture modules now
attach the directly caught error as their cause. Eleven previously omitted it;
one root diagnostic aggregate pointed at the outer operation failure instead of
the directly caught diagnostic failure. Original ordered errors arrays and their
identities remain intact, including the primary operation failure. No safety
condition, signal, process effect, timeout, cleanup order or refusal changed.

Fifteen evaluations of the actual selected constructor expressions cover the12
constructors plus successful/failed publication branches. Before the correction,
all15retained their ordered errors but failed the direct-cause assertion. After
correction and formatting, all15retain both ordered errors and direct catch
identity. This is constructor-boundary evidence with modeled Error identities;
it does not reproduce actual native reporting failures or add guard-removal proofs.

A complete emitted-module comparison becomes byte-identical only after normalizing
AggregateError options in both saved and final versions. An injected effect is
detected. Raw complete module byte equality is not claimed because the cause
property intentionally changes. Existing lifecycle checks and all other expression
arguments remain untouched.

The complete configured project run exited0:2097passes, zero failures,
8821assertions across166files in105.27seconds. All335captured TypeScript/config
pins stayed unchanged. Library/spec types, four-file formatting, four changed
fixture entrypoint compilations and11production CLI builds exited0. The11CLI
artifacts match the preceding journal-boundary build byte-for-byte. No privileged
fixture was executed, and no equivalence to HOST64 is claimed.

Runtime lint still fails:108errors/zero warnings across96files. The only rule-count
change is preserve-caught-error:12to0; the other108findings remain. Test-wide and
full-repository lint remain unverified. No lint policy or suppression changed.

`/tmp/task8-error-causes-covering.json`, SHA256
`54a86475ddde9e1ee77806dc15761b7d002a4d0da9b0c4340a6622ba9963991f`,59pins,
binds the four current sources, original snapshots, constructor RED/GREEN cases,
normalized transfer controls, terminal checks and compiled outputs. Full project
receipt: `/tmp/task8-project-after-error-causes/exit.json`; current lint/checks:
`/tmp/task8-error-causes-checks/`. Two initial read-only constructor selectors
refused before any source write; the final selector locates the linted throw or
options span and resolves its exact lexical catch binding.

The original17requirements/24scenarios and Task8/4.2 remain incomplete. Physical
upload/inode exhaustion, ordinary supervisor/CLI serving continuation, full R5
reconciliation, guardian supplement/R2 naming, remaining lint, full original-BASE
review and Tasks9–11plus the exact-SHA gate remain required. No new h4drill,
closed-success replay, production activation or product migration occurred.

## Task8 production server cleanup failure preservation — 2026-10-29

The production isolated-server caller previously threw from authentication cleanup
in finally, replacing the original server/readiness failure when both failed.
The initial actual-caller regression reproduced nine masked failures:5passes and
9failures across14cases. The caller now captures a typed success/failure outcome,
settles the same child lifetime, readiness and diagnostic promises, performs the
same authentication identity check/unlink, then preserves the original thrown
value. Concurrent execution/cleanup failures produce an ordered AggregateError
containing both values, with the directly caught cleanup error as cause. This also
preserves undefined, null and non-Error throws without mistaking them for success.
The symbol's JSDoc records this contract.

Seventeen new actual-caller tests cover readiness/spawn failures with successful,
metadata-failed, identity-mismatched or unlink-failed cleanup; non-Error spawn
failures; ordinary readonly behavior; successful collection and collection failure
without authentication creation/cleanup. Process/artifact/auth/HTTP ports are modeled.
The existing real owned-child settlement test also passes, confirming its actual
child/group and both pipes settle before return. These scopes do not establish
installed credential behavior or a new Distribution acceptance proof.

Three exact omissions fail the final actual-caller tests. Omitting final primary
rethrow falsely acknowledges a failed spawn after successful cleanup. Omitting
aggregation loses the primary readiness failure during failed unlink. Omitting
the retained identity check reaches modeled unlink for a changed inode. Adjacent
Proof comments name these observed scopes; final comment/JSDoc transfer emits
identical runtime to the omission-tested source and detects an injected effect.

The new test's first lint run found five errors in modeled unknown rejection
reasons, void callbacks and an AggregateError array read. Final readiness/lifetime
model boundaries explicitly require Error; non-Error spawn cases remain covered.
Void callbacks use blocks and the array read is unknown before validation.
New-test lint and library/spec types now exit0. Two text selectors for an added
assertion refused before writing; the inspected unique phased-call anchor was used.
No production validator, lint policy or suppression was weakened.

Full configured project execution exited0:2114passes, zero failures,
8932assertions across167files in97.00seconds. All336captured TypeScript/config
pins remained unchanged. Formatting and all11production CLI builds pass. Only
registry-maintenance-host-cli.js changes, as expected from its imported server;
the other ten artifacts match the preceding build. Runtime lint still fails at
107errors/zero warnings across96files: no-unsafe-finally decreases14to13, and all
other rule counts are unchanged. Test-wide/full-repository lint remains open.

`/tmp/task8-server-cleanup-covering.json`, SHA256
`79e6f962d22a6acac264cc1a737889b3bf2c96d55d5444de5e13b02ff675e948`,63pins,
binds the two current sources, original server, failed/final tests, three omission
cases, final comment transfer, terminal checks, full project logs and11CLI outputs.
Project receipt: `/tmp/task8-project-after-server-cleanup/exit.json`; check receipts:
`/tmp/task8-server-cleanup-checks/`. No h4drill, privileged fixture replay,
HOST64 byte-equivalence, production activation or product migration occurred.

The full original17requirements/24scenarios and Task8/4.2 remain incomplete.
Remaining physical upload/inode exhaustion, ordinary supervisor/CLI serving
continuation, R5 reconciliation, guardian supplement/R2 naming, lint, original-BASE
review, Tasks9–11and the exact-SHA host gate are still required.

## Task5.1 authorized receiver persistence source — 2026-10-29

Task8source was left unchanged while an independent monitoring dependency advanced.
The deployed dev renderer is owned by the separate dev-observability lineage and
absent from this registry branch. A native managed worktree at
/home/df/.codex/worktrees/3005/puni-00 uses detached base
5d27b7de430c61dc0317ed9ab530a4d8a59e8c78; no unrelated code was imported here.
The worktree operation9a31c557-a7a6-41f1-9c11-2b261e665df5 completed normally.

Normal rendering now preserves the already authorized slack-puni/#puni-alerts
receiver, recovery notifications and the persistent secret-file reference. It
emits no webhook value. Exact policy refuses local fallback, changed/missing/extra
notifications, inline secrets, route overrides and other transports. Fifteen new
receiver tests initially produced11passes/4failures; removing the final actual
renderer guard made all14refusal cases falsely emit deployment inputs. The adjacent
Proof comment retains this scope. The owning proposal/design/delta spec/runbook
and pending follow-up tasks were updated; secret-readiness and live adoption remain
explicitly incomplete.

The owning project baseline passed334tests. Final uncached Nx tests passed349,
zero failed,640assertions across12files in9.12seconds;33captured source/config
pins stayed unchanged. Uncached lint with the required project graph, forced-build
types, package build, formatting and strict dev-observability validation all pass.
An earlier uncached test run had341passes/8failures from a confirmed unrelated
Bun listener on3100 in the f7f1/tool-remote-scripts worktree. It was not touched;
a fresh socket check proved the port free before the single successful rerun.
The failed run and Nx flaky-task warning remain visible.

Read-only checks against running Alertmanager0.34.0 confirmed candidate syntax and
matching loaded receiver/channel/secret-reference/recovery bindings; remaining
parsed-config differences were loaded defaults. Critically, amtool check-config
also returns0 for missing/unreadable api_url_file paths. It cannot establish secret
availability. A separate actual protected-file read/format/metadata check must be
implemented before deployment. Existing immutable a1ffe27e7/c811f34bf runtime pins
also require an owned new release; expected hashes must not be rewritten merely to
hide prior manual receiver drift. No live configuration changed, message was sent,
secret read out/changed, service restarted or registry safeguard activated.

`/tmp/task10-slack-persistence-covering.json`, SHA256
`3069e1523d213e9cb8931577b52e9887a411f13c993c313c554b116088837725`,148pins,
binds current owning sources/docs, RED/GREEN/removal evidence, both full runs,
Nx checks, build copies and binary characterization. Source changes are local and
uncommitted in3005; this does not complete Task5.1, its actual warning/cutoff/failure
and independent missed-report delivery scenarios, or any remaining Task8/9/11work.
The original17requirements/24scenarios and exact-SHA gate remain mandatory.

## Task5.1 protected-secret runtime readiness — 2026-10-29

The owning observability worktree3005 now requires protected Slack secret readiness
in the authenticated h3runtime snapshot. Its fixed reader selects one inspected
running Alertmanager container, validates project/service/64hex ID and its single
writable named persistent volume, then executes against that captured ID. A named
container cannot silently redirect this read after inspection. Only the fixed
secret is opened; canonical descriptor path, UID:GID65534:65534/mode0600/single link,
1025byte read cap,1024byte acceptance cap and one exact authorized-workspace URL
plus newline are required. The eight-second command emits no secret bytes into
the snapshot. The TypeScript boundary requires slackSecret:verified and returns
that nonsecret marker with the existing sixty-second observation expiry.

Thirty-three new tests cover actual Python/shell behavior on ordinary files,
container/mount refusals, the actual snapshot field expression and TS validation.
Docker transport/path and UID:GID role are modeled locally; a separate read-only
live test executes the exact final reader through the real inspected container.
Eleven exact omissions show false certification/unapproved execution, or the
separately named actual FIFO blocking and excess-read witnesses. The FIFO fault's
independent fixture kills/reaps only its own new process group. Missing and
unreadable file faults are distinct. Guard comments and Python/TypeScript transfer
controls bind these scopes without claiming a new notification or host mutation.

The live final reader passed at2026-10-29T21:05:41Z, source SHA256
f042435f1b36ed7fd5ae73511b75cce7583637078c685979276b83e13708a76a.
It returned only verified/notificationSent:false. This establishes current file
material and readability, not webhook deliverability or adopted release state.

Uncached owning-project lint, forced-build types, package build, formatting and
strict OpenSpec validation pass. A busy host port3100 was untouched. An initial
private-network run retained user-namespace capabilities and had379passes/3failed
permission tests; that result remains failing. The corrected private runner keeps
UID1000, drops every effective/permitted/inherited/bounding/ambient capability and
sets no-new-privs before testing. The full target then passed382tests, zero failed,
758assertions across13files in9.87seconds with49package inputs/configs unchanged.
A read-only post-run namespace audit found no remaining owned process. No host
interface, unrelated listener or old service was modified.

`/tmp/task10-slack-secret-covering.json`, SHA256
`a37ad4b02d5d59c6f51798dbfb75a34ed9730f638dbe1519aa88c1a367843c46`,219pins,
binds final owning sources/docs, real-file/marker regressions,11omissions,
failed/final test setups, all checks, live reader receipts, capability/namespace
proofs and build copies. The prior148pin source capsule is historical after these
authorized changes. Worktree3005 remains local/uncommitted on detached5d27b7de;
registry runtime sources remain unchanged with the preceding2114-test/107-runtime-
lint-error scope. New owned release and immutable-manifest reconciliation, final
review/gates and actual redeployment persistence remain pending. Do not edit old
expected hashes to silence manual receiver drift. Registry warning/cutoff/failure
and independent five-minute missed-report delivery, and the full original
17requirements/24scenarios/Tasks8–11 remain required. No registry activation occurred.

## Task5.1 continuation — owned Slack release evidence, 2026-10-29

Implemented the notification-release renderer, strict trusted-policy validation
and actual mounted-file producer in the separate owning monitoring worktree
/home/df/.codex/worktrees/3005/puni-00. Local commit
6a058008077aed53c9c3aaf6499932fd2df6879c contains exactly15authorized files on base
5d27b7de430c61dc0317ed9ab530a4d8a59e8c78; the owning tree is clean. Normal hooks
passed format, lint, plaintext-secrets and private nesting. Tool Wiki explicitly
reported inactive/unprovisioned/certified:false; that is not certification.
Nonmatching doc-cap and migration hooks were explicitly skipped. No push or merge.

The release contains only Alertmanager config, its retained-volume overlay and
manifest at releases/slack-<full40hexsource>. The authenticated runtime reader
requires the inspected owned service's actual readonly bind mount, fixed bounded
regular/canonical/singly-linked files, monitoring UID/GID and0644. TypeScript
requires exact source/path/schema and measured/declared hashes equal to trusted
rendering, preserving both original manifest inventories. Source metadata does
not prove review/gating or authorize apply. The new fixture is modeled evidence.
All21new guard omissions fail actual tests; all11existing protected-secret proofs
also fail after sharing the container/volume selector. Scope distinguishes false
certification from excess reads, a symlink open, descriptor leaks and an owned FIFO
blocked/killed/reaped by its exact test supervisor. Adjacent Proof comments transfer
by Python AST and complete emitted TypeScript equality with injected-effect controls.
The first filesystem RED attempt had a corrected stdin harness error and is not
claimed as a production behavioral failure.

Uncached full owning-project tests passed434/0/886assertions/15files/13.22s in a
private network namespace at UID1000, zero capabilities and no-new-privs.60named
package/root-config/doc inputs remained stable during checks. A final test-only
interface spelling changed no emitted test runtime; equality/effect controls bind
the suite through that change. Final uncached lint, forced-build types, build,
format and strict owning OpenSpec validation passed. Post-run lsns found no process
in exact test namespace4026533446. No unrelated listener/process was modified.

Fresh h3 inspection found only the known manually changed old Alertmanager config
drifting; its saved original matches the original manifest and c811f34bf has no
drift. Actual Compose5.5.0 read-only merge preserves the persistent store and all
five other services, changing only the config mount. The final live reader at
21:43:22Z verifies the secret and refuses the current old mount as not adopted.
No message, secret/config write, reload, restart or registry operation occurred.

Cover /tmp/task10-slack-release-covering.json has284pins, SHA256
006b40b712a50a92284b527782acceb0374811984afc6ea52e06ed13f8dd98ec.
Postcommit audit /tmp/task10-slack-release-postcommit.json confirms exact15files,
clean tree and all284pins current. Raw evidence is under /tmp/task10-slack-release/;
the owner OpenSpec/runbook records the staged transition and all limitations.
A read-only h4gate preparation at21:49:46Z found the canonical puni1 gate tree clean,
implementation base present, no heavy-lock holder,12733177856B available memory
and113657602048B disk. This is not a gate run; no fetch/checkout/gate was started.

Next: review/gate exact monitoring commit, stage/adopt only Alertmanager, restore
its now-unmounted original config from the verified backup without changing either
old manifest, then prove actual firing/resolved delivery across another recreation.
Task5.1 also still requires registry warning/cutoff/failure and independent five-minute
missed-report delivery. Full original17requirements/24scenarios remain in force;
Task4.2,4.3,5.1,5.2 stay unchecked. Registry runtime source/current107lint findings,
provider physical-budget unknown, final original-BASE review, exact-SHA full gate,
full lifecycle/remaining recovery proofs and live safeguard activation remain.
Closed native h4scopes57/58/62/64 were not replayed. No product migration or
Victoria retirement. Goal remains active; this continuation made implementation
progress and did not satisfy the full goal.

## Task4.2 continuation — backup-worker pipe lifetime, 2026-10-29 UTC

The actual runRegistryBackupWorker caller ignored the possibly asynchronous results
of FileSink.write and FileSink.end. Its finally-close could also replace the primary
backup/admission failure. Seven new actual-function regressions reproduced this:
10existing passes and7failures. Process/artifact ports are modeled; this is not a
new native h4proof. A side observer handles only each known modeled rejection so
bypassing the worker await fails the actual function assertion without creating an
unrelated global unhandled-rejection failure. The rejected-write tests keep the
modeled terminal group pending until interruption; the bypass reaches the explicit
100ms upstream deadline instead of the exact original write failure.

The worker now awaits write and closure, retaining the allSettled lifetime/output
collection before closing the control pipe. A typed completion outcome carries the
primary failure through cleanup. Successful work plus failed closure refuses;
dual failure keeps both errors in AggregateError.errors and the original worker
failure as direct cause. Clean closure cannot acknowledge failed work. Existing
fixed admission codes and complete receipt parsing remain intact. Array.at keeps
the existing missing-outcome guards rather than deleting them for tuple narrowing.

All17worker tests pass, including exact Error/non-Error write failures, pending
closure, asynchronous close rejection, synchronous/asynchronous dual failures and
fixed admission refusal with failed cleanup. Five exact omissions break the actual
worker tests: write-await, close-await, compound retention, primary refusal and
direct-cause identity. Final adjacent Proof comments transfer by complete emitted
runtime equality with an injected-effect control. Raw attempts and final proofs
are under /tmp/task8-worker-pipe/. Precise spy capability types and real Promise
assertion chains remove touched-test lint errors without changing runtime policy.
The single test-only reject-errors exception names the modeled non-Error boundary.

Completed the required R2rename from registryBackupFailureStage to
findRegistryBackupStage in both production modules and the two caller tests.
Four-file alpha normalization allows only that exact identifier/injection-port
string and named-import ordering; complete emitted runtime matches with independent
injected-effect controls. The diagnostic test subsequently uses explicit Promise
assertions to satisfy lint while retaining synchronous and asynchronous failure
coverage. Both current production modules still match their rename proof.
No public protocol, diagnostic shape or failure identity changed through the rename.

Full configured project tests passed2121, zero failures,8977assertions across167files
in101.21seconds, with336TS/config input pins stable. This used the real pinned test
restic20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639.
Full library/spec types, all3touched tests' uncached lint, six-file formatting,
worker compilation and all11production entrypoint builds exited0. Only
registry-maintenance-host-cli.js differs from the previous11-output build; artifacts
are private and were neither installed nor executed. Current registry runtime lint
still FAILS:101errors, zero warnings across96files, down from107 through2floating
pipe effects and4unnecessary tuple-condition reports. No rule count increased.
No whole Task4.2 completion, current HOST64byte identity or fresh native lifecycle
proof follows from these model-backed error-path changes.

The new covering manifest /tmp/task8-worker-pipe-covering.json has464pins and SHA256
a2abe843995102df7d09bbfde72545441ba1dc1f250390d74afbda8ddf21a211.
It binds the full336-input suite, current six-file component, all5omissions,
rename/transfer proofs, failed/final focused lint, both typechecks and all compiled
artifacts. Final verification found all464pins current. Registry HEAD remains
6c0d58e45db2f85b55f007f89888f32590b41837; source remains uncommitted within the
original Task8BASEf81933f1947e9689dd0fd980f470a4f33146cf03 scope.

## Task5.1 continuation — exact monitoring-source gate in progress

The validated local monitoring commit6a058008077aed53c9c3aaf6499932fd2df6879c
was transferred as a private Git bundle to h4claw, requiring its exact existing
5d27b7de430c61dc0317ed9ab530a4d8a59e8c78 prerequisite. Bundle SHA256 is
3bdce27b5d7751a85b6e3a1b71cbb8785a5007f399eed3ef0cb5442bdded23f0.
Only refs/puni-gates/slack-6a0580080 was imported; no public push or manual source
checkout occurred. The canonical gate checks out its SHA under the host-wide lock
in the clean /home/puni1/puni-00-gate-tbf tree as puni1.

Its owned transient unit is
puni-slack-gate-6a0580080-20261029T215511.service, started21:55:13Z, main supervisor
PID3909022. The cgroup delegates only this run, bounds tasks4096/runtime3h and
uses control-group termination with60s stop grace. Start/log/durable exit receipts
live in /home/puni1/.cache/puni-slack-gate-6a0580080-20261029T215511.
The exact printed running-on source line is confirmed. Fresh systemd polling at
22:17:19Z still shows active/running/PID3909022 and no exit receipt. Result:success
while active is not a completed gate result. Poll this exact handle; do not restart
because a poll times out or the log is quiet. The local observer also consults the
durable exit receipt if systemd unloads the finished transient unit.

Local control/evidence is under /tmp/task10-slack-gate-6a0580080/, including poll.py,
started.json, source bundle, launch/observation receipts and a local3file release
packet pinned to the exact commit. Only the gate/source import touched h4claw;
no h3config/secret/service was changed and no notification was sent. The owning
worktree remains clean and all284monitoring implementation-cover pins still match.
After gate success and integration review, fresh predecessor checks must precede
the AM-only ownership transition, restoration of its now-unmounted original config
without manifest rewrites, and actual firing/resolved delivery across recreation.
No live adoption is claimed here. The full original17requirements/24scenarios,
Tasks4.2/4.3/5.1/5.2 and all remaining lifecycle/provider/accounting/monitoring/fresh
capacity checks remain active and incomplete. No old closed native scope was replayed.

## Task4.2 continuation — guardian/origin proof integration and PID consistency

Integrated the previously isolated guardian input/schema/machine-race and final
origin-read cases into the paired repository tests. They now call the production
exports directly. All process, identity and absence reads in these tests are
modeled; no new kernel, IPC, canonical-lock or provider effect is established.
The original guardian source differed from its historical copy only by the
already recorded fields.at(19) spelling; origin source initially matched exactly.
Both previous isolated receipts remain historical evidence, not fresh native runs.

The first integrated tests passed against the existing code. A passing control
that restored the explicit incomplete-field guard still passed, confirming it has
no independent witness. The implementation now relies on the required final schema
for truncated start ticks. That schema's omission falsely returns six malformed
identities plus the truncated record. Stable observation tests also require all
twelve identity reads and the origin's third epoch after two absent-process passes.
Exact ENOENT/EACCES failures remain distinct and preserve their original objects.

Integration exposed another concrete inconsistency. Both live-reader interfaces
require positive int32 PIDs, but the shared persisted guardian schema accepted larger
safe integers. Actual prepareRegistryBackupAttempt and proveRegistryBackupOriginStopped
accepted2147483648 and9007199254740991 with modeled origin/process-absence ports;
the latter returned stopped after16reads. This establishes the helper/constructor
contract gap, not an exploit through the full canonical authority or kernel.
Reproduction is retained in /tmp/task8-guardian-pid-bound/.

New actual-caller regressions produced1pass/4failures before the fix: two invalid
constructors and two persisted-origin cases. The shared guardian schema now uses
the same inclusive positive int32 range as the live readers. Malformed stored
attempts therefore refuse before any origin reads. Both accepted endpoints1and
2147483647 remain covered. This preserves valid metadata and restores the existing
reader contract; no stored-state field, migration or public success payload changes.
With this defense present, removing the earlier guardian input guard now permits
forbidden reads before schema refusal, rather than returning an oversized identity.
The adjacent proof annotation and final evidence use that narrower observed scope.

Eleven final dependency omissions break54selected tests: shared PID range,
guardian input, raw size, stat grammar, mounted proc, root credentials/liveness,
final schema, identity comparison, second reader, origin input and final origin
reader. One dependency has multiple subcases; these are not54independent guards.
The restored paired suite passes86tests/117assertions. Raw namespace oversize still
schema-refuses without the raw-size guard; second/final-reader positives expose
missing epochs as freshness failures. All other stated false identities/proofs use
modeled reads. The first final-matrix preparation failed on a stale comment anchor
before mutation; its artifacts remain preserved and are not counted as a witness.
The corrected final matrix restores both source files and all86tests pass again.

Final proof comments preserve complete emitted runtime with injected-effect
controls. A separate whole-module comparison allows only the duplicate-field guard
removal and the shared PID upper bound; origin runtime is unchanged. Current source
SHA256s are8f8086e8c5d4d2a05a918532c22781f2553000edb4fa7fcff4034bda490f36bc
for registry-backup-attempt.ts and
2b64c5e09d632afe82ec5bdb46e109db63518e8f01d89414c3b83b7137517e6a
for registry-backup-origin.ts.

The first integrated full suite passed2162/0/9041assertions. After the PID fix,
the final configured suite passed2167, zero failures,9049assertions across167files
in97.37seconds, with336TS/config inputs stable. Both full typechecks, both touched
tests' uncached lint, formatting, guardian compilation and all11production builds
exited0. All11outputs differ from the prior worker-pipe build through the shared
schema; nothing was installed or executed. Current full96-file runtime lint still
FAILS with101errors/0warnings. The original scope remains; this is not a complete
Task4.2 or current HOST64byte-equivalence claim.

Cover /tmp/task8-guardian-integration-covering.json has547pins, SHA256
a38d8bbe5b553df20f31f6dc869713ccd13d758b6a695fd9a0080c8570249805.
It binds current copied four-file source, full336-input run, original/final tests,
all eleven omissions and passing redundancy control, scope/comment transfers,
pre-fix PID reproduction and failed/final checks/builds. Earlier worker-pipe evidence
is retained and its implementation is unchanged; older live-source cover pins for
the four intentionally edited files are historical. The guardian supplement
integration/consolidation and prior diagnostic R2rename are now complete locally;
the remaining semantic R5 inventory, runtime/test lint, ordinary startup/serving
continuation, upload/inode exhaustion, full original-BASE review and registry gate
remain. Tasks4.2/4.3/5.1/5.2 stay unchecked, with all original17requirements and
24scenarios in force.

The SAME h4 monitoring gate remains pending. At23:24:04Z, exact unit
puni-slack-gate-6a0580080-20261029T215511.service is active/running with MainPID3909022,
confirmed source6a058008077aed53c9c3aaf6499932fd2df6879c and no exit receipt.
Its main target batch and Dash checks have advanced; a completed gate result is
still unverified. Continue polling the existing handle and durable exit record;
never launch a replacement for a quiet log or observation timeout. No h3write,
reload, restart, notification or live adoption occurred in this continuation.

## Mechanical regex/scalar cleanup and monitoring gate repair — 2026-10-30

Three non-global kernel-status regex calls now use exec instead of String.match;
upload-census size and permit timestamp interpolation use explicit String(number).
Only those six substitutions across three modules changed. No guard, branch,
Promise lifetime or refusal was removed. Complete emitted-module comparison against
exact transformed predecessors passed, and injected-effect controls differed.
These are local scope checks, not a new native-execution equivalence certificate.
Initial formatting refused one wrapped template; Prettier corrected only layout.

The configured full fleet suite, with the same hash-verified real restic fixture,
passed2167, zero failures,9049assertions across167files in100.84seconds. All336
named TypeScript/config pins stayed unchanged throughout validation. Library and
spec types and final format passed. All11CLI builds passed the corrected recursive
artifact census. The first build itself returned0, but its receipt collector used
nonrecursive glob and refused the nested outputs; that failed wrapper is retained.
A separate corrected collector/build run passed. No artifact was installed or run
on a live registry. Runtime lint remains failed:95errors/0warnings across96files,
six fewer than101. Broad test lint, semantic R5 audit and formal Task8 review remain.

Current cover `/tmp/task8-scalar-regex-covering.json` has604pins and SHA256
`eee7743afdb47726470a4d1737a00c8959d03defcefbf095b25a51b698e80641`.
Its predecessor547-pin cover is retained with its original identities; exactly
these three live-source pins intentionally changed. This append-only record is
outside that cover. Task8 remains incomplete and the original BASE remains
f81933f1947e9689dd0fd980f470a4f33146cf03.

The separate monitoring owner tree3005 now has clean commit
18a49644572da5e6f987a249c47c6cf9d927ce08. The old canonical6a0580080 gate ended
at23:35:24Z with exit1: eleven Burokrat pilot failures shared an overlapping test/
fixture classification. Production classification reproduced it. Moving the
byte-identical fixture to tools/tool-observability-stack/fixtures/runtime.json and
updating three test imports cleared full-policy classification; no classifier or
policy was relaxed. Normal hooks initially refused documentation format; after
formatting, the correction committed with all matching hooks passing. Tool Wiki
remained explicitly inactive/unprovisioned, not certified; nonmatching migration/
doc-cap checks skipped.

Fresh uncached monitoring tests434/0, lint, types, format and strict spec passed.
The focused production pilot passed23/24, including all11 formerly failing cases;
one later temporary Git checkout failed to write files on the approximately1.8GB
free local filesystem. That run is not a complete pilot pass. The full canonical
h4 gate must still establish its result on the inspected113GB-free host. Its first
launch wrapper refused an old receipt-directory collision before import or unit
creation; corrected exact identifier substitutions and embedded-script equality
checks preceded the one actual new launch. All failed attempts remain preserved.

The new owned unit is
puni-slack-gate-18a496445-20261029T234954.service, started23:53:00Z as puni1,
MainPID54437, canonical tree/home/puni1/puni-00-gate-tbf. Latest23:58:34Z poll is
active/running with no exit receipt and the exact18a496445 source line present.
This is not a gate pass. Its private source bundle SHA256 is
`df26bf73f9888bc34e1a51a66fa7a8e9d1476331850a6c64bc57df47db59c038`.
Local archive `/tmp/task10-slack-gate-18a496445` includes the poller, three rendered
release files and durable start evidence; remote receipts live under
/home/puni1/.cache/puni-slack-gate-18a496445-20261029T234954.
Monitor only this handle; do not restart for quiet output or transient observation
failure. It has a three-hour runtime bound and owns the canonical heavy lock.

Read-only h3 predecessor inspection at23:55:30Z passed: current owned Alertmanager
bb6f6d736033e278afefd87a5041d0b66ceb371604c9e2456565816fb8e579e6,
image user nobody, protected secret verified, loaded authorized #puni-alerts receiver,
all other preserved services/configs unchanged. Only the known manual old-config
hash drift remains. No notification, remote file change, secret write or service
restart occurred. The versioned18a release exists only locally. Monitoring cover
`/tmp/task10-slack-fixture-layout-covering.json` has374pins, SHA256
`4b65728dff4011406a60d41bf61c159a1968cbc18aea289f938aca2ea9fbafca`.
Its scope records the one failed focused pilot and active gate, not certification.

The goal remains active:17requirements/24scenarios,7/11slices checked. Task8 still
needs ordinary supervisor/current-ACK/grace and consumer/permit-serving proofs,
actual upload/inode exhaustion, semantic guard audit,95runtime and broad test-lint
resolution, full original-BASE review and exact registry gate. Task9 provider
physical billing bound/accounting remains unknown; the production admission/version
adapters remain fail closed. Task10 still needs successful monitoring gate, owned
Alertmanager transition, restoration of the unmounted original config without
rewriting manifests, firing/resolved persistence after a second recreation, registry
failure/capacity delivery and the independent five-minute missed-report monitor.
Task11 still requires fresh capacity/enrollment, catalog/stopped-Docker/controller/
artifact/sudo/independent-restore/current-obligation and full scenario verification.
No live registry safeguards, Victoria retirement or product migration is claimed.
Closed native57/58/62/64 scopes were not replayed; no65packet or source freeze exists.

## Owner observation failures remain attributable — 2026-10-30

Actual extracted native-fixture owner code reproduced two error-loss bugs with
explicit modeled effect ports. Final retirement lost the first reporting failure
when maintenance, its fixed reporter and HTTP observation all failed. Its aggregate
also made a secondary observer primary. The population branch's finally observer
could replace either publication failure or output failure. These are fixture-owner
failures; no new production-registry behavior or recovery success is claimed.

Six retirement cases first yielded21pass/3fail in the owning file. Six additional
population/output cases yielded4pass/2fail under that selected pattern. The final
owner now separately settles operation and observation, always completes required
HTTP observation, preserves the original failure, and aggregates every secondary
reporting failure. Healthy reporters preserve exact original error identity;
observation-only failure remains its own error. Success still follows the existing
completion path. No new lint suppression was added.

Seventeen independent omissions produced48 expected failing case executions:
retirement9/27, population8/21. These are not48 different guards or tests. They
cover skipped reports/HTTP observation, dropped collector errors, missing refusal,
missing aggregate members, replaced primary cause and skipped final rethrows.
Retirement omissions were revalidated after the population change. Adjacent Proof
comments explicitly limit these witnesses to modeled caller effects. Complete
emitted-module comparison proves only the two intended completion blocks changed;
final comments match the omission-tested runtime, injected effects differ, and
existing test runtime is unchanged. Twelve regression cases were added to the
existing lifecycle test file; no new test file was needed.

The intermediate retirement-only full suite passed2173/0. Final configured fleet
suite passed2179/0,9146assertions across167files in102.18seconds, using the pinned
real restic fixture. All336 named source/config inputs stayed unchanged throughout
each scoped check and the final run. Library/spec types, changed-file test lint,
format and all11production CLI builds passed. Those11 outputs are byte-identical
to the immediately preceding scalar/regex build. The changed standalone native
fixture separately compiled toSHA256
`b0f74742439b195838f260c3a800afc119ef75b15d13b4ec8da61ffc4b546866`;
it was not installed or executed. This is not native64 equivalence. Runtime lint
still fails93errors/0warnings across96files, two fewer unsafe-finally findings.
Broad test lint and whole semantic guard review remain unverified.

Current cover `/tmp/task8-retirement-observation-covering.json` has774pins, SHA256
`4b1c15597e1f96dc0da6f39228ad6ffcf64ff1e898372aea6a6e59978af878a4`.
Its predecessor604-pin cover remains historical for exactly two intentionally
changed live source/test pins. Final source identities are host-native
`3a22b4ab58adf0d2ebb00880fe892c03f4bb024b6890e490905e315cb6ac57b1`
and lifecycle test
`0c03f29dd681478be60ed79a766c033a881058465fb97809ee78a48967344bbc`.
Raw red/green runs, both omission matrices, restored sources, complete-module scope
controls and failed/final lint/check receipts remain under the named archive.

The same separate monitoring gate remains active: exact source18a496445, unit
puni-slack-gate-18a496445-20261029T234954.service/MainPID54437, no durable exit
receipt. Its full40hex source line remains present. Poll details are retained in
/tmp/task10-slack-gate-18a496445; the prior6a gate is terminal failed, never live.
No Slack notification, Alertmanager recreation or h3 configuration write occurred
in this continuation. Versioned ownership/persistence proof still awaits gate
success and integration review.

Source inspection also clarified future notification evidence: the pinned0.34.0
request counter increments after the notifier returns, while the notification
pipeline counter increments before it runs. Request/failure increments are separate
and not group-specific. Preparatory notes with primary sources and attribution
limits are under the gate archive's delivery-evidence-notes.md. They are not a
live delivery result or permission to infer individual delivery from one counter.

The full objective is unchanged:17requirements/24scenarios,7/11 reviewed slices,
Task8/4.2 and Tasks9–11 incomplete. Original Task8 BASEf81933f1947e9689dd0fd980f470a4f33146cf03
and registryHEAD6c0d58e45 remain unchanged; Task8 source remains uncommitted with
empty index. Actual upload/inode exhaustion, ordinary startup/current-ACK/grace,
consumer CLI/permit-serving continuation,93runtime/broad test-lint resolution,
full semantic R5 and original-BASE review, exact registry gate, provider physical
budget, monitoring/watchdog delivery and final adoption/recovery audits remain.
Closed h4native57/58/62/64 scopes were not repeated; no65packet/source freeze,
registry activation, Victoria retirement or product migration occurred.

## Supervisor acknowledgement evidence and elapsed grace — 2026-10-30

The current populated native producer now samples the installed supervisor instance
and prior request before publication, then rereads the instance, current request,
acknowledgement and kernel boot identity after readonly convergence. The shared
verifier requires canonical requests, unchanged instance, actual boot identity,
a fresh nonce and acknowledgement bytes exactly equal to the current request.
Only derived hashes enter its output. Existing bounded descriptor reads retain
metadata, canonical-path and acknowledgement-inode validation. This prepares a
native observation; the changed producer has not been installed or executed.

The owning observation file passes54 cases, including37 correlation cases and
7 producer cases using actual extracted caller code with modeled file/effect ports.
Nine independent omissions yield34 unique failing case executions. Bun's repeated
inline/summary failure lines are deduplicated; the initial68-line count remains
historical and is not68 cases. A separate real-file, real-clock test executes the
production readonly confirmation function for35.1255seconds. Shortening its actual
polling window to one iteration refuses near1second and fails the elapsed assertion.
That test has a synthetic supervisor instance and no supervisor process; it does
not prove installed supervisor startup or serving continuation. Its explicit45s
budget leaves the configured30s default unchanged. An early missing-import failure
is retained separately and is not the timing counterfactual.

Final configured fleet tests passed2224/0,9251assertions across167files in142.31s,
with all336 source/config pins stable. Library/spec types, both touched test files'
lint, formatting and all11 production CLI builds passed. The production outputs
remain byte-identical to the preceding local build. The changed standalone native
producer compiled to acaa62685ef858c73ec695671ed9695bd758cb451daf8592904ccff553e380ad;
compilation is not native64 equivalence. Runtime lint remains93errors/0warnings
across96files. Broad test lint, semantic R5 inventory, full original-BASE review and
exact registry SHA gate remain outstanding. Awaited rejection checks were preserved
through the touched-test lint repairs; initial failed checks remain in the archive.

Cover /tmp/task8-supervisor-ack-covering.json has943pins, SHA256
8ce28c70ffe87f868bac9d2bd493ba47df7ea96158007bfb5c1705ec4308e51e.
All943 were freshly verified at01:16Z. Its774-pin predecessor remains historical
for exactly five intentional source/test edits. Current sources, raw red/green and
omission runs, emitted-module scope controls and final check receipts are retained
under /tmp/task8-supervisor-ack. No new file was added to the native runtime graph.

The existing monitoring gate still runs exact18a49644572da5e6f987a249c47c6cf9d927ce08
in puni-slack-gate-18a496445-20261029T234954.service, MainPID54437. The01:16:21Z
poll had no terminal receipt. Do not restart it or infer success from active-unit
Result=success. The same gate handle remains authoritative.

Fresh readonly h3 inspection at01:16:53Z verified the actual protected Slack secret,
loaded #puni-alerts receiver and send_resolved policy through the existing container.
The only original-release drift remains the already authorized manual Slack config;
old manifests and the saved original remain unchanged. No notification, recreation
or h3 write occurred. Existing firing/recovery delivery evidence remains historical;
versioned deployment ownership and persistence still await gate success and live proof.

Before a future populated-mode native run, review its transport and cgroup cleanup:
the existing mode-specific cleanup caller intentionally tested false for the older
populated transport. A modern mounted-cgroup transport cannot simply inherit that
choice. No65packet, source freeze or new host execution exists. The full goal retains
17requirements/24scenarios and seven reviewed slices; Task8/4.2 and Tasks9–11 remain
incomplete. Original BASEf81933f1947e9689dd0fd980f470a4f33146cf03 and registry
HEAD6c0d58e45db2f85b55f007f89888f32590b41837 are unchanged. No registry activation,
Victoria retirement, provider physical-budget resolution or product migration occurred.

## Clock restoration preserves the original failure — 2026-10-30

The actual withRegistryFixtureTime callback/restoration double fault reproduced a
lost operation error: the restoration setter error escaped from finally alone.
The new regression initially yielded5pass/1fail. The fixture now settles its
callback and restoration separately, preserves a single callback failure exactly,
and aggregates both failures with the original operation as cause. Normal callback
values still return after restoration. Only that existing function changed; its
complete module prefix and suffix remain byte-identical. The other upload-grace
finally path remains outstanding and is not covered by this fix.

Two new cases inject a throwing setter on actual Date.now, then restore its original
property descriptor in test cleanup. All six owning tests pass. Seven independent
omissions each produce one expected assertion failure: success/failure restoration,
compound outcome, either aggregate member, primary cause and callback return.
Relocated source copies change only dependency resolution; original source is not
mutated for those experiments. These are local clock/callback proofs, not host,
provider, supervisor or serving proofs. Existing rejection assertions now explicitly
await operations and capture their errors; no wait was discarded to silence lint.

Final configured fleet suite passed2226/0,9258assertions across167files in147.79s.
All336 source/config pins stayed stable during each final check. Library/spec types,
touched-test lint, format and all11 production builds passed. All11 production
outputs remain byte-identical to the preceding build. The standalone native fixture
compiled to6663ad725b4dd4bdf92fb93a30472508652e1a101f5be7da1034ec72b3e21740;
it was not installed or executed. Runtime lint still fails92errors/0warnings across
96files. This reduces one unsafe-finally finding; no whole-tree or native success
is inferred. Initial lint failures and their corrections remain preserved.

Current cover /tmp/task8-clock-restoration-covering.json has1016pins, SHA256
`a22eb67c8c64e0a5f4d220b872cf7b1ae5843a1e3ad41b4ee5d5028fc45f01ba`.
Its943-pin predecessor is historical for exactly the two intentionally edited clock
source/test files. Raw attempts, seven omissions, restored copies, final checks and
whole-function scope comparison are under /tmp/task8-clock-restoration. Registry
HEAD and original Task8 BASE are unchanged; index remains empty.

Direct parent integration review of the clean monitoring source18a496445 and its
sixteen-file original implementation diff found no blocker for the specified
canonical-source Alertmanager-only transition. This is not independent review or
an exact-SHA gate pass. Report/pins: /tmp/task10-slack-gate-18a496445/integration-review.*.
The last gate poll at01:21:34Z remains active/MainPID54437 with no terminal receipt.
The374 monitoring evidence pins were freshly verified. No monitoring source or live
service changed in this continuation.

Automatic approval review rejected a supplementary exact-credential comparison
before execution because the command would send a webhook-derived hash to h3.
No comparison hash was sent, and the command was not retried or worked around.
That optional check is skipped. Protected-secret readiness and the loaded receiver
were separately verified by the earlier readonly inspection. Existing two completed
firing/recovery Slack requests with zero failures are retained historical evidence;
human channel visibility was not established. Persistence across versioned release
recreation remains pending. Rejection record is under the same gate archive.

Goal remains active with17requirements/24scenarios and seven reviewed slices.
Task8/4.2 and Tasks9–11 remain incomplete: native upload/inode/current-supervisor and
consumer continuation proofs,92 runtime errors/broad test lint, full semantic/original-
BASE review and registry gate, provider physical budget, monitoring/watchdog delivery,
capacity/enrollment and activation/recovery audits. No65packet/source freeze, live
registry activation, Victoria retirement, product migration or provider-budget claim.

## Monitoring gate launcher environment and populated cgroup preparation — 2026-10-30

The earlier monitoring gate18a496445 is terminal failed, not live. Its durable
receipt ended01:39:03Z with exit1, and the12:35:55Z observation found MainPID0,
failed/failed and an empty control group. All ordinary tests/build/types/lint steps
had reached the final solver-image-smoke. Baseline and shared-person actual image
checks passed; two exceptional cleanup process cases passed. The real orphan case
failed before its first managed child could start because systemd-run --user could
not connect: XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS were absent in the
background system service. The25second until timeout was secondary to that recorded
connection failure. No source validation or deadline guard was relaxed.

Full terminal log is retained at /tmp/task10-slack-gate-18a496445/terminal-gate.log,
296092bytes, SHA2563cf52081f586b9ef08dab335013053c949cf14a95f8af0a7bd2bb37279c21bf7.
A readonly Docker audit proved the known failed solver/image containers and three
exact invocation tags absent. Its scope is explicit and is not a host-wide cleanup
certificate. The existing user995 manager answered through its protected runtime
folder/socket. A uniquely owned real calendar timer then executed /usr/bin/true
successfully with corrected environment and both timer/service were verified inactive
after stop. The original missing-environment failure remains preserved.

A new canonical full gate now runs the SAME reviewed commit
18a49644572da5e6f987a249c47c6cf9d927ce08. Unit: puni-slack-gate-18a496445-userbus-20261030T124047.service.
Started12:41:20Z, MainPID436308, RuntimeMax3h. Both user-bus variables are supplied
from the existing puni1 runtime; no private replacement bus or new manager was made.
The12:43:14Z poll confirmed active/running, the exact printed40hex source and no
terminal receipt. The old unit must never be polled as the live attempt. Current
pointer is /tmp/task10-slack-userbus-current.json; poll /tmp/puni-slack-gate-18a496445-userbus-20261030T124047/poll.py.
The canonical tree stays under its normal host-wide lock; no checkout was performed
outside that lock, no source was reimported and no public ref was changed.

The owning monitoring worktree remains clean at18a. All374 prior monitoring
validation pins still match. Direct parent integration review covers its16file
implementation diff, without claiming independent review or host-gate success.
The rendered three-file18a release was freshly matched against trusted source.
Readonly actual Compose merge changed only the Alertmanager config bind source,
preserving five other services and the retained store. Actual pinned amtool accepted
the new config, separately from the protected-secret readiness reader. Current
manual632byte non-secret config was saved locally for rollback, distinct from the
original pre-Slack backup. Fresh h3 inspection12:36:08Z retained the same container,
secret readiness, loaded receiver/recovery policy, original manifests and the one
known authorized manual config drift. No host staging, recreation or notification
occurred. Full ownership/persistence/delivery proof still awaits a passing gate.

The populated registry rehearsal is being adapted to the already reviewed modern
transport. That transport uses a private cgroup namespace and readonly cgroup2 mount;
its old populated cleanup selection was false for a legacy transport. Updating the
existing expectation to true first failed13pass/1fail. Adding only its mode to the
actual reaper caller produced14pass/0fail. Privileged unmount is modeled in that
owning test and remains unexecuted for the new source. The actual native dispatch
and upload-clock PID1 argv remain prove-populated; direct fixture dispatch authority
was not widened. Before native use, a newly reviewed packet and fresh capacity/lock
checks are still required. No65packet or source freeze exists yet.

Final configured fleet suite passed2226/0,9258assertions across167files in147.21s,
with all336 source/config pins stable. Lib/spec types, touched-test lint, formatting
and all11 production builds passed; all11 outputs are byte-identical to the preceding
build. Runtime lint remains92errors/0warnings across96files. The standalone native
fixture compiled to8feb0771bc3bb2e1e2ece8dcec0e5131cb01f984c906b2f8a88e6922efab1e50;
it was neither installed nor executed. One exact omission fails only the populated
caller case with final lint-corrected tests. Complete emitted-module comparison proves
that removing the new selection recreates the old module, with an independent
changed-predicate control. Initial scope-script uniqueness failed because it scanned
routing and cleanup together; the corrected comparison scopes the actual caller.
That harness failure is retained and is not a safety witness. Five preexisting owning-
test lint findings were fixed with explicit typed evaluation/awaited Promise ports;
a narrow test-only eval exception names the modeled privileged boundary.

Registry cover /tmp/task8-populated-cgroup-covering.json has1086pins, SHA256
43fbd35cf968e107b490ea58a906b64c315d74dd702cb09bcc287330469e486c.
Its1016-pin predecessor is historical for exactly two edited native-host/test pins.
Raw attempts/final checks/comparison sources are under /tmp/task8-populated-cgroup.
The gate-host runbook now records the required background user-manager environment.
A separate /tmp/task10-slack-userbus-transition-covering.json binds the rollback,
release/merge/binary preparation, terminal failure, actual timer probe and new handle.

This continuation is progress. Goal remains active at the original17requirements/
24scenarios, seven reviewed slices; Task8/4.2 and Tasks9–11 remain incomplete.
Actual upload/inode/current-supervisor/consumer continuation proofs,92 runtime and
broad test lint, full semantic/original-BASE review and registry SHA gate, provider
physical budget, operational monitoring/watchdog delivery, fresh capacity/enrollment
and adoption/recovery audits remain. Original Task8 BASE and registry HEAD are
unchanged; index remains empty. Closed57/58/62/64 scopes were not replayed. No registry
activation, Victoria retirement, product migration or provider-budget success claim.

## Upload clock completion retains all failures — 2026-10-30

The remaining finally block in proveRegistryUploadGrace could replace its failed
action with a clock/report failure and could lose a false-clock observation when
the report write also failed. Eight actual completion-tail combinations, with
clock/action/file effects modeled, first yielded10pass/4fail in the owning clock
file. The fix always observes completion, preserves a sole original action failure
exactly, and retains every compound cause in order. False clock plus failed report
also refuses after a successful action. Healthy completion returns the original
value only after its required observation. Root/namespace/census/real-age preparation
is byte-identical; those guards were not relaxed or executed by these new cases.

Lint exposed the external filesystem rejection boundary as unknown. Three additional
undefined/null/string fault cases first failed14pass/3fail. That boundary now keeps
ordinary Errors exactly and wraps malformed rejection values with a fixed Error and
original own cause. Internal observer failures are Error[]; no production lint
suppression or unsafe cast was added. A shared test loader executes the actual
completion tail with explicitly modeled effects. The six preexisting actual-clock
cases retain identical emitted runtime. All17 owning cases pass.

Fifteen isolated omissions produce60 unique failing case executions: success/failure
observation, clock refusal, report retention/call, original aggregate member/cause,
compound/single refusals, observer primary cause, returned value, malformed wrapping/
cause and ordinary Error identity. These are not60 distinct tests or guards.
Each selected failure is an observed assertion; parser/reference/type errors are
excluded. The final source is separately typechecked; runtime counterfactuals may
intentionally violate its static types when removing a boundary. Privileged root,
namespace, actual young-upload retirement and native clock behavior are not certified
by these modeled tail cases. The existing native requirement remains pending.

Final configured fleet suite passed2237/0,9366assertions across167files in148.65s,
with all336 source/config inputs stable during every configured check. Library/spec
types, touched-test lint, format and all11 production builds passed. All11 production
outputs are byte-identical to the preceding build. Runtime lint still fails91errors/
0warnings across96files. Broad test lint and whole semantic/original-BASE review
remain open; the proof inventory now links only this newly bound completion group.

After those checks, only the owning symbol's JSDoc changed. Complete emitted-module
equality binds the tested4dbb601872d5d15e35e35de4d75141118d03089bbbd1ad8c6fa158337c679a14
source to final933306ddf5e1e0383d6f7199592085432002728a4128a1f7deab368a154399df;
an injected effect control differs. The final source/test scoped lint also passed.
The standalone native fixture compiled to
3f10cb909fa61b45a4947caa81b2dee7a930ce796335e09aebe88c859c524532,
without installation or execution. No native64 equivalence is claimed.

Current cover /tmp/task8-upload-clock-observation-covering.json has1216pins, SHA256
21cec4c540459ead09d03244708f983898db241a2e779a7a457a8ceeb887da98.
Its1086-pin predecessor is historical for exactly two intentionally changed clock
source/test files. Raw initial failures, green cases, all15 omissions, module/test
scope comparison and final configured receipts are under
/tmp/task8-upload-clock-observation. The current Task8 proof inventory is included;
its historical737-candidate catalog still is not an exhaustive completed audit.

The corrected monitoring gate remains the exact saved puni-slack-gate-18a496445-userbus-20261030T124047.service,
MainPID436308. Its13:09:29Z poll reported active/running, exact printed18a source and
no terminal receipt. Use /tmp/puni-slack-gate-18a496445-userbus-20261030T124047/poll.py through
/tmp/task10-slack-userbus-current.json. The original18a launcher gate remains terminal
failed01:39:03Z; it must not be restarted or described as live. No new monitoring
source, h3 configuration write, notification or host rehearsal occurred here.

This continuation is progress. Full objective remains17requirements/24scenarios,
seven reviewed slices, Task8/4.2 and Tasks9–11 incomplete. Actual upload/inode/current-
supervisor/consumer continuation proofs,91 runtime/broad test lint, complete semantic/
original-BASE review and registry SHA gate, provider physical budget, monitoring/
watchdog delivery, fresh capacity/enrollment and adoption/recovery audits remain.
Original registry BASE/HEAD and empty index are unchanged. No65packet/source freeze,
registry activation, Victoria retirement, product migration or provider-budget claim.

## Keep asynchronous lifetime guards through type checking — 2026-10-30

Thirteen no-unnecessary-condition findings treated callback-updated booleans and
native child status getters as fixed across awaits. Three fixture modules now
restore only their already declared boolean/nullable domains at those reads.
Adjacent Boundary comments identify the internal callback or captured native child;
no untrusted input was narrowed, no runtime guard/value read was removed, and no
new generic process API or production lint suppression was added.

Complete emitted JavaScript is byte-identical before/after for all three modules,
both before application and after formatting. Each equality check also observes an
independent changed-guard effect control. The full standalone274-module native bundle
is byte-identical to the preceding3f10cb909fa61b45a4947caa81b2dee7a930ce796335e09aebe88c859c524532
build, and all11 production CLI outputs are byte-identical. This binds the preceding
2237/0,9366assertion full-suite evidence through the type-only change; it is not a
new full-suite run, new native success or native64 equivalence.

Fresh owning tests passed121/0,609assertions across five files in0.447s. Library/spec
types, three-file formatting and all11 production builds passed. All336 named source/
config inputs stayed stable throughout each configured check. Runtime lint still
fails78errors/0warnings across96files, down13 from91; only no-unnecessary-condition
counts changed. Broad test lint remains pending. No new test file was added.

Current cover /tmp/task8-async-narrowing-covering.json has1270pins, SHA256
4c785a117038b307ad963feeb4951e90b636d46f18402eb41c681043a42d9a41.
The prior1216-pin cover is historical for exactly the three intentionally changed
live fixture-source pins. Proposed/final complete-module comparisons, effect controls,
source snapshots, owning tests, types/lint/build receipts and bundle comparison are
under /tmp/task8-async-narrowing. Existing proof scopes stay unchanged; equality is
not new individual guard-removal or full semantic-audit coverage.

The corrected full monitoring gate still uses puni-slack-gate-18a496445-userbus-20261030T124047.service,
MainPID436308, exact source18a496445. Its saved poller remains /tmp/puni-slack-gate-18a496445-userbus-20261030T124047/poll.py;
/tmp/task10-slack-userbus-current.json is the current handle pointer. The old18a
missing-user-bus attempt remains terminal failed, never live. No gate restart,
monitoring source edit, h3 config write, notification or new host rehearsal occurred.

Goal remains active at the original17requirements/24scenarios and seven reviewed
slices. Task8/4.2 and Tasks9–11 remain incomplete: native upload/inode/current-supervisor
and consumer continuation,78 runtime/broad test lint, full semantic/original-BASE
review and registry SHA gate, provider physical accounting/retention, monitoring/
watchdog delivery, fresh capacity/enrollment and adoption/recovery audits. Registry
BASE/HEAD and empty index are unchanged. No65packet/source freeze, registry activation,
Victoria retirement, product migration or provider-budget success claim.

## Preserve callback observation flags and measure broad test lint — 2026-10-30

Four more native-fixture booleans now retain their declared boolean domain at
initialization: authority acquisition, sudo contender observation, history census
and emitted diagnosis. Their internal callbacks perform the assignments while the
owner awaits or observes failure. Only type widening and adjacent boundary comments
were added. Every initializer remains false and every runtime guard/read remains.
This also preserves existing raw-source caller-test anchors.

Complete emitted modules are byte-identical before/after, both in the proposed
version and after formatting, with independent changed-state effect controls.
The complete274-module native bundle still equals
3f10cb909fa61b45a4947caa81b2dee7a930ce796335e09aebe88c859c524532;
all11 production CLI outputs also match the preceding build. The prior2237/0,
9366assertion full suite transfers through this identity; it is not a fresh full
run or a native64/installed proof. Fresh owning tests passed149/0,552assertions
across11files in1.222s. Library/spec types, format and builds passed on336stable
source/config inputs. Runtime lint remains74errors/0warnings across96files,
down4; other rule counts are unchanged.

The previously unmeasured broad owning-test lint was run on all167 fleet test files.
It failed652errors/0warnings with every input unchanged. Largest groups are156
require-await,129 confusing-void-expression,98 await-thenable,51 unsafe-member-access,
42 unsafe-call and34 import-sort findings. These are additional required findings,
not part of the74 runtime count, and none was waived or automatically fixed.
Raw full report, input pins, command and rule summary are under
/tmp/task8-broad-test-lint. This changes the next validation work from unknown to a
concrete inventory. Test fixes must preserve actual asynchronous operations and
required refusal/cleanup assertions.

A small pinned-Bun investigation ruled out one unsafe type-only shortcut. The
hypothesis that promise matchers return Promises despite void typing failed all
8 API probe cases: those tested calls returned undefined on Bun1.4.4/38afee6c8.
Two further deferred rejects/resolves timing probes passed and observed operation
settlement plus its callback before the matcher returned undefined, at approximately
10ms. These are API measurements, not new production safety witnesses. No Promise
casts were applied. [Current Bun examples](https://bun.com/docs/lint/rules/bun-test/prefer-expect-resolves)
show awaited matcher usage; that does not establish its pinned runtime return type.
The retained probe prevents treating this uncertainty as a verified promise contract.
Future test cleanup should keep explicit operation waiting rather than cast void to
Promise or blindly remove waits. No general matcher behavior across versions is claimed.

Current registry cover /tmp/task8-async-observation-flags-covering.json has1333pins,
SHA256432b4c1cab4baf28a3044251e9ada5cbb8ba0a132642d576128bddf136d0f6de.
Its1270-pin predecessor is historical for exactly four intentionally edited native
fixture sources. The separate matcher investigation cover
/tmp/task8-bun-matcher-contract-covering.json binds its retained attempts and notes.
No source/test file was added by the type-only change; the read-only probes are in/tmp.

The corrected exact18a monitoring gate remains puni-slack-gate-18a496445-userbus-20261030T124047.service,
MainPID436308. Poll13:39:33Z confirmed active/running, exact source and no exit receipt;
the first main batch had completed and Burokrat/Dash work was running. Use
/tmp/puni-slack-gate-18a496445-userbus-20261030T124047/poll.py through the current pointer. The original18a
missing-user-bus attempt remains terminal failed, never live. No h3 write, notification,
monitoring source change, new native packet or host rehearsal occurred.

Goal remains active at17requirements/24scenarios and seven reviewed slices. Task8/4.2
and Tasks9–11 remain incomplete: native upload/inode/current-supervisor and consumer
continuation;74 runtime and652 broad test-lint errors; complete semantic/original-BASE
review and registry SHA gate; provider accounting/retention; monitoring/watchdog
and persistence/delivery; fresh capacity/enrollment and adoption/recovery audits.
Registry BASE/HEAD and empty index are unchanged. No65packet/source freeze, registry
activation, Victoria retirement, product migration or provider-budget success claim.

## 2026-10-30 explicit asynchronous test assertions

Converted 98 explicitly awaited Bun matchers across 32 existing fleet test files.
The operation is now awaited through test-only requireRejection/requireResolution;
existing matcher arguments and non-async modifiers are retained. Rejection receipts
preserve the exact cause, including primitive/nullish values and AggregateError,
and provide the exact synchronous rethrow for toThrow. Native Promise admission
matches the measured pinned-Bun input contract and refuses thenables without reading
then. No void-to-Promise casts or blanket await removal were used. The 174 existing
matchers without an outer await were left unchanged.

The rejection helper began with 10 failing cases, then gained six strict-input
cases that failed before admission was implemented. Resolution began with six
observed failures among seven cases. Final helper tests passed 23/0 with 64
assertions. Six isolated omissions produced 35 distinct failing-case executions:
native admission8, awaited rejection7, cause retention7, exact rethrow6, fulfillment
refusal3 and awaited resolution4. These are test-helper witnesses, not new
production-path registry safety proofs. Scoped helper lint passed with no errors.
The AST conversion was reviewed before application. A separate structural
normalizer verified all 98 conversions and retention of original import bindings,
including nested assertions. Only import sorting was automatically fixed.

Fresh configured fleet tests passed 2260/0, 9430 assertions, 168 files in 147.66s.
Library/spec typechecking, format and the 11-CLI production build passed with all
338 selected source/config inputs stable. All 11 actual nested production outputs
are byte-identical to the preceding build. The first comparison used a nonrecursive
glob, found zero root-level outputs and refused; the corrected recursive inventory
is the recorded comparison. No new native fixture run or installed-binary claim.
Runtime lint still fails 74 errors across 97 files. Broad test lint fails 436 across
168 files, down from 652; all 98 await-thenable findings are gone. Remaining failures
are required work and are not waived.

Evidence: /tmp/task8-assertion-rejections and
/tmp/task8-assertion-rejections-covering.json, 1503 verified pins,
SHA256 aa06ed2654d6b2ca56a12a54e14ffbf195472b8688ad2457c8c8e4693d649622.
Exactly 32 inherited test-source pins were deliberately replaced after matching
their before snapshots to the previous cover. Two new helper/test files are included.
Registry HEAD6c0d58e45, original BASEf81933f and empty index are unchanged.

The Slack predecessor check at14:12:47Z again verified the exact running
Alertmanager, protected secret, #puni-alerts/recovery policy, preserved service
inventory and the sole known old-config drift. No notification or host mutation
occurred. Corrected monitoring gate18a userbus unit remains active at14:19:42Z,
MainPID436308, exact source confirmed and no exit receipt. The clean3005 source
and both monitoring evidence covers remain unchanged. Versioned adoption waits
for actual terminal gate success; the old missing-bus gate is terminal failed.

Goal remains active: 17 requirements/24 scenarios, seven reviewed slices, Tasks8–11
incomplete. Remaining work includes native upload/inode/current-supervisor and
consumer continuation, runtime/test lint, whole original-BASE review and registry
SHA gate, provider physical accounting/retention, persistent notification adoption,
watchdog and final capacity/enrollment/recovery audits. No registry activation,
Victoria retirement, provider-budget success or product migration is claimed.

## 2026-10-30 versioned Slack adoption completed

The corrected full canonical h4 gate for monitoring commit
18a49644572da5e6f987a249c47c6cf9d927ce08 finished successfully at14:26:40Z.
The owned userbus unit is inactive/dead with MainPID0; its exit receipt is0 and
its log prints the exact source once. Terminal294199byte log SHA256
6a8a5b8d8c15b5f47e237033784a59d826981be3c0df2f642f2d10dd13242447
is retained in /tmp/puni-slack-gate-18a496445-userbus-20261030T124047.
This gate is terminal, not a pending handle. The original missing-bus gate remains
a separate historical failure. Clean monitoring source and402 inherited evidence
pin entries were verified before application.

After fresh predecessor/rollback/capacity validation, exclusively staged the three
reviewed non-secret release files as monitor1001:1001/0644 under the exact
slack-18a versioned directory. Actual staged Compose merge changed only the
Alertmanager config bind; the pinned running amtool accepted the actual staged
configuration, and the protected secret reader independently passed. Recreated
only Alertmanager with the retained base plus versioned overlay and no dependencies.
The old unmounted config was then restored from the hash-verified original backup;
both original manifests and their complete inventories again match. The first
restoration as monitor refused the root-only backup before replacement creation;
the existing authorized root route completed it with explicit monitoring UID/GID
and0644. A local preparation placeholder syntax failure was caught before any
remote staging and preserved; the corrected actual local positive/collision
rehearsal passed. Neither refusal was treated as success or bypassed.

First recreated container71162f00f749 and forced second container0d5b1bc694ab
were both verified against actual mounts, immutable rendered hashes, loaded single
#puni-alerts/recovery policy, protected secret and named store created2026-10-25.
All seven shared services and five other owned services retained their identities,
start times and restart counts. Full actual runtime preflight passed after the
initial restoration, immediately before the second recreation, and after it. It
used actual authenticated h3/h1 snapshots, h1-to-h2 dev inspection and unchanged
local candidate files; no fabricated snapshots or hash substitutions.

Each actual recreation was followed by a uniquely grouped controlled firing and
recovery test. Each pair recorded two stable completed Slack requests/latency
observations and zero request or terminal failures; total four completed requests.
The single receiver, exact container identity, quiescent baseline, group attribution
and counter reset/concurrency guards bounded that inference. This is successful
pinned-notifier completion evidence, not a Slack message ID or human-read claim;
no Slack read scope was added. Final actual inspection14:44:18Z found container
0d5b1bc694ab running, correct policy/store/secret, both final request counters2,
failures0, no active alerts, and all other services preserved. The webhook value
was never printed, committed or hashed for an outbound comparison.

Current monitoring capsule /tmp/task10-slack-adoption-covering.json has540 verified
pins, SHA256 dabcea2ced8a98da8bfd5a2158cee26df5505fe8c58e07ab47d04c6292138647.
The monitoring worktree remains clean at18a; current adoption pointer is
/tmp/task10-slack-adoption-current.json. Its OPERATIONS.md preserves the mandatory
versioned overlay for every future recreation from the retained old base. Integration
into the registry development branch remains separate work. Fresh preflight's
shape-pending binary/health/retention/live-recheck list is retained; this adoption
does not close those stack-wide checks.

The registry assertion capsule remains1503pins aa06ed2654d6b2ca56a12a54e14ffbf195472b8688ad2457c8c8e4693d649622,
with2260/0 fleet tests and remaining74 runtime/436 test lint errors. Goal remains
ACTIVE; seven reviewed slices and Tasks8–11 incomplete. Specific registry warning,
cutoff, cleanup and backup-failure Slack delivery and the independent missed-monitor
watchdog remain. Native upload/inode/current-supervisor/consumer proof, whole
original-BASE review and registry gate, provider physical accounting/retention,
fresh final capacity/enrollment and recovery/activation audits also remain. No
registry safeguard activation, Victoria retirement, product migration, provider
budget success or final-goal completion is claimed.

## 2026-10-30 required-guard and test assertion types

Runtime lint is49 errors across97 files, down from74; test lint is411 across168,
down from436. All25 no-unnecessary-condition runtime findings were removed by
widening the relevant observation/index types while retaining every emitted guard.
Twelve runtime/native/fixture modules changed only types and adjacent boundary
comments. Five test files lost25 lint-proven redundant non-null assertions. There
are no new runtime guards or behavior changes and no new production-path proof claim.

Complete emitted JavaScript modules are byte-identical for all17 files, both at
proposal and after formatting, with guard/test-skip effect-difference controls.
All11 production CLI outputs match the preceding build. The rebuilt274-module
native bundle remains3f10cb909fa61b45a4947caa81b2dee7a930ce796335e09aebe88c859c524532;
it was compiled only, never installed or executed. Prior2260/0 full fleet tests,
9430 assertions/168files, transfer through complete executable identity; this is
not a fresh full-suite run. Initial owning tests passed141/0,765assertions/14files;
after three type-annotation refinements46/0,352assertions/3files; final test-only
cleanup57/0,106assertions/5files. The runtime test scopes overlap and must not be
summed as unique cases. Library/spec typechecking, scoped formatting and production
build passed with338 stable selected inputs. Final test-spec typechecking passed
again after the five test-only changes.

The first lint pass retained54 findings: exact diagnostic columns identified the
parsed detached literal and missing argv slot rather than the captured server/UID
primitive; descriptor uncertainty belonged at its guard read rather than an
assignment whose declared receiver already allowed undefined. Three annotations
were corrected; all original reports are retained. Final49 is authoritative, with
no new unnecessary assertions/conditions. The five test edits were limited to the
single no-unnecessary-type-assertion fixer and reviewed before application; no
other automatic lint fixes or waivers were applied.

Evidence: /tmp/task8-index-types and /tmp/task8-test-type-assertions.
Current registry cover /tmp/task8-index-types-covering.json has1690 verified pins,
SHA256 bfe2264275dbebb4aedb023c01fa86eb3d5b8f026d893de1e25dea43e4d64160.
Exactly17 inherited source pins were replaced after their before snapshots matched
the preceding1503-pin cover; all other inherited pins remained unchanged. Registry
HEAD6c0d58e45, original BASEf81933f and empty index are unchanged. Monitoring540-pin
adoption evidence and clean18a worktree are unaffected.

Goal remains active:17requirements/24scenarios, seven reviewed slices, Tasks8–11
incomplete. Required runtime/test lint still fails49/411; native upload/inode,
current-supervisor and consumer continuation, whole original-BASE review and registry
SHA gate, provider physical accounting/retention, registry-specific alert delivery
and missed-monitor watchdog, final capacity/enrollment and recovery/activation
remain. No new namespace packet, native host run, activation or product migration.
Next functional cleanup investigation is the standalone native writer fixture's
unawaited stdin closure and throwing finally; its C protocol and actual failure
interleavings must be checked before any repair. That behavior is not fixed or
proved by this type-only slice.

## 2026-10-30 native writer completion and compiler

The standalone native writer rehearsal no longer loses an operation failure when
EOF, process cleanup, binary observation or workspace removal also fails. It awaits
stdin closure and runs every cleanup observation, retains exact Error identity,
wraps unexpected primitive I/O failures with their original cause, and emits ordered
AggregateError members with the original first failure as cause. Compiler failure
now removes its created workspace. A rejected dead-process census, including
undefined, cannot be treated as absence; a nonempty dead census also refuses.

Tests invoke the actual native entry in separate Bun processes, compiling the
unchanged C pthread fixture and reading actual owned kernel processes. Filesystem,
EOF, terminal and census faults are modeled at their external boundaries, with real
child creation, EOF, reaping and workspace operations retained. Literal compiler,
parent and descendant counts prevent silently skipping either kernel case. The
final pre-fix run observed6pass/11fail across17cases; repaired completion plus the
existing writer-census tests passed25/0. Eighteen isolated counterfactuals produced
113 unique failing variant/test executions. A separate audit required each named
dependency's expected failing assertion, excluding packaging/harness failures.
These counts are not113 distinct tests or18 distinct guards. The global historical
737-candidate R5 catalogue still requires semantic reconciliation.

Fresh configured fleet tests passed2277/0,9447assertions/169files in147.15s on341
stable source inputs, explicitly including the C source. The preceding340-input
run also passed but omitted that newly executed dependency from its pin list; it
is retained as historical and superseded by the341-input run. Library/spec types,
format, focused strict OpenSpec validation and builds passed. Runtime lint remains
44errors/98files, down5; broad test lint remains411errors/169files. New native entry,
fault harness and test file pass scoped lint with zero errors. The narrowly
suppressed primitive-rejection rule belongs only to the deliberately invalid fault
port, with its adjacent boundary comment; required runtime/test findings are not
waived. Final adjacent Proof comments preserve the complete tested emitted module,
with a changed-guard effect control. All11 production CLI outputs and the separate
274-module privileged host bundle remain byte-identical; the latter is still
3f10cb909fa61b45a4947caa81b2dee7a930ce796335e09aebe88c859c524532,
compiled only. This does not transfer the new standalone run into a privileged
lifecycle/volume/ordinary-supervisor or consumer-continuation proof.

Actual standalone execution without fault hooks passed both owned kernel cases
locally and onh4 as995/puni1 using the exact candidate source041be22d26191e9691809a018bcea411478656366c665128d4fc61193a0d2098.
H4 initially lacked /usr/bin/cc (exit127). A reviewed fresh package plan admitted
only gcc/libc6-dev and33 new dependencies, zero upgrades/removals, with a root reserve
check. The durable installer completed with no existing installed package version
changes, compiler15.2.0 executable as the gate user, and110797484032 root-free bytes.
The oneshot launch observation timed out after10s while apt continued under its
owned service; the same exact unit was inspected to its successful exit receipt,
without duplicate installation or interrupting dpkg. The actual gate-user proof
then exited0 with checks2 and both owned groups reaped. Both transient units were
garbage-collected. Their terminal default MemoryMax/TasksMax values do not prove
observed active resource-limit enforcement; invocation limits were requested and
no pressure/exhaustion claim is made. Full host service preservation was not
independently audited by this compiler bootstrap.

The gate_host role now declares gcc/libc6-dev so future hosts obtain the test
prerequisite, with the runbook updated beside it. Existing controller Ansible was
found at /tmp/puni-registry-ansible/bin/ansible-playbook despite not being on PATH.
Actual gate-host playbook syntax check passed with core2.21.3 and a local placeholder
inventory; existing Ansible caller tests passed24/0,177assertions. These overlap
the full suite and are not additional unique cases. Full live gate-role convergence
was not rerun, and the final registry exact-SHA host gate remains required.

Evidence /tmp/task8-writer-completion and covering file
/tmp/task8-writer-completion-covering.json:2013 verified pins,
SHA2565236890c6e0bb01f48b71ef36de1e5fc0d6caad64022531d9a75d26dc6faf896.
Exactly three inherited source pins changed: standalone native entry, gate-host
runbook and scoped proof inventory. Two test sources, the C dependency, role package
declaration, counterfactual copies and host receipts are included. HEAD6c0d58e45,
original BASEf81933f and empty index are unchanged. Monitoring540-pin adoption
capsule and clean18a monitoring worktree are unaffected; no Slack message was sent.

Goal remains ACTIVE,17requirements/24scenarios and seven reviewed slices. Tasks8–11
remain incomplete:44 runtime/411test lint findings; native upload/inode/current
ordinary-supervisor and consumer continuation; full semantic/original-BASE review
and registry gate; provider physical accounting/retention; registry-specific Slack
alerts and the independent missed-monitor watchdog; final capacity/enrollment,
recovery and activation audits. No65packet, new privileged namespace/pressure run,
registry safeguard activation, product migration or Victoria retirement occurred.

## Population fixture cleanup — 2026-10-30T17:10:39.866813+00:00

The actual population caller now uses fixture-owned scratch completion, retaining
the exact original rejection and ordered diagnostic/cleanup errors. Its four
changed/new files are scoped-lint clean; the guard and omission bindings are in
the [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#population-scratch-completion).

Commands recorded by `/tmp/task8-population-scratch/run-checks.py` and its local
socket retry:

- `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`, with the pinned restic fixture: **2295 pass,0 fail,9502
  assertions,170files**,344 unchanged inputs including the executed C source.
  The earlier sandbox run remains FAILED (2137 pass,149 fail), including EPERM
  on local test sockets. The separate unrestricted-local retry is the passing
  receipt; the failed run was neither deleted nor treated as a product proof.
- `bun ./node_modules/.bin/tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit`
  and the corresponding `tsconfig.spec.json` command: exit0.
- Scoped Prettier, four-file ESLint and strict `openspec validate
bound-registry-storage --strict --json`: exit0.
- Required broader lint remains FAILED:43 runtime errors across100files and411
  test errors across170files. No waiver; full repository checks and the exact
  registry SHA host gate remain outstanding.
- The declared production build:11 CLI bundles, all byte-identical to the prior
  writer-completion build. The separate host fixture build is275modules,
  SHA256`f6cf682b1eb2d7cb29922ce5b5c1f7e2dfd75a73f7d6e1d19c03297501e64c30`;
  compiled only, never installed/executed. A new privileged rehearsal is required.

Focused RED12pass/6fail -> GREEN18pass/0fail;15 counterfactuals and77 unique
failing variant/test pairs, each with its required named witness. The first
isolated packaging import error was rejected as setup failure and is not counted.
Archive:`/tmp/task8-population-scratch`; cover:
`/tmp/task8-population-scratch-covering.json`. Full17requirements/24scenarios
remain the objective; Tasks4.2,4.3,5.1,5.2 are incomplete, with no safeguard
activation or product migration.

## Index/tag completion — 2026-10-30T17:33:21.032620+00:00

Index publication, cleanup and required reporting errors now survive in order;
tag descriptor completion preserves its existing outcomes without throwing from
finally. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#index-and-tag-completion)
records exact counterfactual witnesses and their modeled/native limits.

- Final-harness old index:9pass/9fail. Repaired index completion18/0, plus existing
  index HTTP3/0 and tag36/0:57pass,348assertions. Old tag baseline36/0.
- Fresh full fleet command recorded by `/tmp/task8-index-completion/run-checks.py`:
  `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`, local sockets enabled and pinned restic fixture. **2313pass,
  0fail,9520assertions,171files,143.93s**,346 stable selected inputs including C.
- Library and spec `bun ./node_modules/.bin/tsc --project
tools/tool-fleet/tsconfig.{lib,spec}.json --noEmit`: both exit0. Four affected
  files pass scoped Prettier; index caller/new harness three-file ESLint exits0.
  The tag file retains two pre-existing optional-chain lint findings.
- Required broader lint remains FAILED:38runtime errors/101files,411test errors/
  171files; no waiver. Four unsafe-finally findings and one optional-chain finding
  removed; Docker still has one unsafe-finally finding. Full repository validation
  and the exact registry SHA host gate remain outstanding.
- Strict `openspec validate bound-registry-storage --strict --json` and the
  declared11-entrypoint production build exit0. All11 CLI output bytes equal the
  preceding population-scratch build. Separate privileged host build275modules,
  SHA256`5447a6cb410b31072b5614a451db054bc9dd035dc56ea45428c66e9f17e2d1a4`,
  compiled only, not installed/executed; prior native bundle equivalence does not
  transfer. No new host rehearsal or safeguards activated.
- All18 targeted counterfactuals fail their exact required named witness. Initial
  malformed positive trace and a runner classification false positive were rejected
  as setup/audit issues, retained separately and not counted as safeguard negatives.

Archive:`/tmp/task8-index-completion`; cover:
`/tmp/task8-index-completion-covering.json`. Full17requirements/24scenarios remain
the goal; Tasks4.2,4.3,5.1,5.2 are incomplete, without product migration.

## Docker proof completion — 2026-10-30T18:02:09.416087+00:00

The Docker proof caller now preserves every required failure in phase order and
always observes owned-child cleanup before completion. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#docker-proof-completion)
records exact fault witnesses and synthetic/kernel limits.

- Initial actual-caller cases5pass/12fail before repair; final-harness old source
  6pass/13fail. Private copied-source repaired baseline19pass,0fail,199assertions.
  19 targeted counterfactuals each fail their exact named witness. A successful
  modeled two-platform control uses four real substitute daemons and real printf
  command children; all groups are absent/terminal at caller completion. It is not
  a real Docker-daemon/image-pull or privileged namespace proof.
- Actual five-second fallback positive about5.15s; disabling it reaches the10s
  substitute watchdog and fails the8.5s bound at10.31s. Recorded caller outcome
  precedes independent rescue of any remaining already-owned capabilities.
- Fresh full fleet command in `/tmp/task8-docker-completion/run-checks.py`:
  `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`, local sockets enabled with pinned restic fixture. **2332pass,
  0fail,9719assertions,172files,162.56s**,349 stable selected inputs including C.
- Library/spec TypeScript, four-file scoped Prettier, three-new-file ESLint,
  strict `openspec validate bound-registry-storage --strict --json`, declared
  11-entrypoint production build and separate privileged-host compilation exit0.
  All11 CLI bundles are byte-identical to the prior index-completion build.
- Required broader lint remains FAILED:37runtime findings/103files,411test
  findings/172files, no waiver. `no-unsafe-finally` is now0 in this required runtime
  set. The actual Docker caller retains one existing optional-chain finding.
- Changed host bundle275modules,1262219bytes,
  SHA256`7db1fd24084c2d421d36b1d64b94bd32c1fb3d421ee54bdd57d724f6c0c13a42`,
  compiled only, never installed/executed. Full repository checks, original-BASE
  review, normal commits and exact registry SHA host gate remain outstanding.

Archive:`/tmp/task8-docker-completion`; cover:
`/tmp/task8-docker-completion-covering.json`. Full17requirements/24scenarios remain
the goal; Tasks4.2,4.3,5.1,5.2 incomplete. No65packet, new privileged host rehearsal,
safeguard activation or product migration.

## Runtime lint and callback contract — 2026-10-30T19:18:41.380812+00:00

Runtime lint now exits0 across105 selected runtime files, resolving the remaining
37findings without a waiver. Broad test lint still fails with242errors/174files
(previous411), including5 test unsafe-finally findings. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#runtime-lint-and-callback-contract)
records exact negative witnesses and modeled/native limits.

- Fresh full fleet: `bun test --preload ../test/scratch/preload.ts --timeout=30000`
  from `tools/tool-fleet`, with local test sockets and pinned restic fixture:
  **2371pass,0fail,9805assertions,174files,168.61s**. All353 selected input pins,
  including C/restic, remain stable. Selected pins are not exhaustive dependency
  closure. Initial runs before the final no-child assertion also passed and are
  retained separately; the latest source is bound by `checks-complete`.
- Library/spec TypeScript,66-file scoped Prettier and all11 declared production
  builds pass. All11 bundle bytes changed; there is no unchanged-native-proof
  transfer. Separate host bundle276modules/1262402bytes,
  SHA256`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`,
  compiled only, never installed or executed.
- Private packaging91/0/214 across9files;24targeted mutations/33exact failing
  variant-test pairs. Initial no-child mutation passed, so the test was strengthened
  to require its exact refusal/null receipt; the same final mutation now fails.
- Mechanical inverse AST equality retains159 callback bodies in31 existing modules,
  excluding the explicitly recorded added tests and import/parenthesis formatting.
  The fresh native Promise contract has19actual adapter/runtime-port cases. A local
  Bun probe falsified `Promise.try` replacement for native Promise identity/order.
- Strict `openspec validate bound-registry-storage --strict --json` passes.
  Full repository checks, original-BASE review, normal commits and exact registry
  SHA host gate remain outstanding. Five unsafe-finally findings in test harnesses
  and remaining semantic R5 obligations are not waived.

Archive:`/tmp/task8-runtime-lint`; cover:`/tmp/task8-runtime-lint-covering.json`.
Tasks4.2,4.3,5.1,5.2 remain incomplete within17requirements/24scenarios. No new
privileged host rehearsal, provider implementation, notification, activation or
product migration occurred in this slice.

## Fixture completion — 2026-10-30T19:35:33.532929+00:00

The five test unsafe-finally findings are resolved using an exact-outcome fixture
completion boundary. Required runtime lint passes106files; test lint remains
FAILED231errors/175files (previous242), no waiver. Unsafe-finally is0 in both sets;
this static result does not certify all completion or rescue paths. The [proof
inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#fixture-completion)
records real-file, modeled-error and actual-caller limits.

- Finally-based helper9pass/4fail; repaired helper13/0/42. Owning3-file scope
  44pass/0fail/138assertions, including two actual permit caller metadata regressions.
  Eleven targeted helper variants fail11 exact named witnesses. The exact original
  whole permit caller separately fails the operation-plus-cleanup regression.
- Fresh full fleet command in `/tmp/task8-test-completion/run-checks.py`:
  `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`, local test sockets and pinned restic: **2386pass,0fail,
  9857assertions,175files,165.36s**,355 stable selected inputs including C/restic.
  This is not exhaustive dependency closure or privileged host readiness.
- Library/spec TypeScript, four-source Prettier, four-source scoped ESLint, strict
  OpenSpec and11 declared production builds pass. All11 production bundles and the
  276-module host bundle remain byte-identical to the preceding runtime-lint build;
  host SHA256`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`.
  Compiled only, never installed or executed. No new native proof is claimed.
- Original fixed worker/shell text and command construction are preserved. Earlier
  callback-body equality applies to its recorded source; these two test caller
  bodies have intentionally changed and do not inherit that whole-body claim.

Archive:`/tmp/task8-test-completion`; cover:`/tmp/task8-test-completion-covering.json`.
Full repository gates, original-BASE review, normal commits, semantic R5 inventory,
native/current-supervisor/consumer, provider accounting, registry alerts/watchdog
and activation work remain incomplete. Tasks4.2,4.3,5.1,5.2 remain open within the
full17requirements/24scenarios. No new host rehearsal, notification or migration.

## Whole-module collection/protection observations — 2026-10-30T20:01:37.597533+00:00

Two dynamic source-extracted harnesses are replaced by isolated actual module
imports, retaining all ten prior scenarios and adding eleven guard/dependency
cases. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-collection-and-protection-observations)
records exact faults and modeled-effect limits.

- Fresh original baseline10/0/31; final copied whole-module baseline21/0/115 across
  2files. Nineteen targeted private source variants fail23 exact named witnesses.
  No native GC/privilege/provider effect is forwarded; original failures and spawn
  restoration are observed inside the isolated worker before outer restoration.
- Fresh full fleet `bun test --preload ../test/scratch/preload.ts --timeout=30000`
  from `tools/tool-fleet`, local test sockets/pinned restic: **2397pass,0fail,
  9941assertions,175files,175.28s**,357stable selected inputs including C/restic.
  This is not exhaustive dependency closure or privileged host readiness.
- Library/spec types, four-source format and11production builds pass. Required
  runtime lint0/108files; test lint stillFAILED227/175 (was231), no waiver. Both
  unsafe-finally counts remain0;20implied-eval sites remain in other test harnesses.
- Actual collection/protection source is unchanged. All11 CLI and276-module host
  bundle bytes equal the preceding build; host
  SHA256`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`,
  compiled only, not installed/executed. Historical whole-module callback-body
  equality is source-bound and does not transfer across intentional test rewrites.

Archive:`/tmp/task8-module-admission`; cover:`/tmp/task8-module-admission-covering.json`.
Full repository/host gates, original-BASE review, semantic R5 inventory, native
ordinary supervisor/consumer proof, physical provider accounting/restore/prune,
registry alerts/watchdog and adoption remain required. Tasks4.2,4.3,5.1,5.2 remain
incomplete within the full17requirements/24scenarios; no migration or activation.

## Mechanical test forms — 2026-10-30T20:31:41.802772+00:00

Sixty-four findings are resolved in17 test files while preserving callback outcomes,
guards, assertion calls and primitive fixture bytes. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#mechanical-test-callback-and-template-forms)
records the compiler/runtime/AST evidence and its limits.

- 21 empty arrows:16async stubs retain fresh native Promise behavior through the
  existing adapter;5sync stubs return undefined.31void expression callbacks retain
  their calls in blocks.12template expressions are restricted to number/string/
  undefined types with a compiler-resolved native String binding.
- Private callback probe194/0/767 reaches all31sites:30undefined returns,59throws,
  zero unexpected values. Initial sandbox145/49 listen-EPERM attempt is retained,
  not counted as success. Owning17changed files plus callback contracts:213/0/824.
- Whole-module canonical AST comparison passes17files/64sites; changed literal
  and omitted guard-call controls both fail its named comparison. Only recorded
  syntax forms are normalized; no general intrinsic/source reflection equivalence.
- Fresh full fleet `bun test --preload ../test/scratch/preload.ts --timeout=30000`
  from `tools/tool-fleet`, local sockets/pinned restic: **2397pass,0fail,
  9941assertions,175files,180.71s**,357stable selected inputs incl C/restic.
  Library/spec types,17-file format, strict OpenSpec and11production builds pass.
- Required runtime lint0/108; broad test lint stillFAILED163/175 (previous227),
  no waiver. Empty-function/confusing-void/restricted-template findings now0;
  unsafe-finally remains0 in both sets.20implied-eval and remaining unsafe boundary
  findings still require work. Full semantic R5 certification remains open.
- Production source,11CLI and276-module host bundle bytes unchanged;
  host SHA256`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`,
  compiled only, never installed/executed. No new privileged/native readiness proof.

Archive:`/tmp/task8-test-style`; cover:`/tmp/task8-test-style-covering.json`.
Full repository/host gates, original-BASE review, normal commits, semantic/native
proofs, bounded provider backups/recovery, registry alerts/watchdog and activation
remain required. Full17requirements/24scenarios retained; Tasks4.2,4.3,5.1,5.2 open.
No new host rehearsal, notification, safeguard activation or product migration.

## Typed test input and failure reports — 2026-10-30T21:14:12.991662+00:00

Eleven existing tests and one new fixture reader are changed. Exact API spy types,
five string-array annotations and unknown JSON inputs before the existing journal
validator remove unsafe boundaries. The initial eight-module type-only stage
emitted identical JavaScript; that receipt precedes intentional assertion/return
rewrites and formatting. Final emitted bytes match in five of the six remaining
type-only modules; the selector differs by array line wrapping. No blanket final
eight-module byte/AST identity is claimed. Bun1.4.4's actual mockRestore returns
the spy; the hook preserves that opaque return and receiver through a typed native
call rather than assuming the declaration's void means undefined.

Three ArkType readers validate only fields consumed by the deterministic index,
manifest and configuration assertions. Additional OCI fields remain present;
semantic hashes/platform/layer history and actual system-tar checks stay in the
original two fixture cases. Three valid/28 malformed cases were added: identity
readers yielded5pass/28fail, actual readers33pass/0fail/62assertions. Final private
proofs on formatted source exercise17bypass/field-weakening variants, producing
42exact named failing variant/test pairs. These are boundary type checks, not a
general OCI validator or42distinct certified production safety guards.

Owner outcome assertions compare complete JSON records, including original mode,
ordered slots, category/location and privacy/bounds. Contender and index reports
use unknown root partial matchers retaining every previously compared field;
process observations keep their complete root equality. Original failure/reporter
identities remain asserted. Three private actual-boundary baselines pass; ten
targeted report mutations each fail their exact named case, including omitted/
corrupt fields and an extra owner root field. Owner/invoke bodies remain extracted
and native effects modeled; the index reader is imported whole. Full transport,
source-extraction and semantic R5 obligations are still open.

Fresh full fleet:2428pass/0fail,9966assertions/175files/177.14s on358stable
selected inputs including C and pinned restic. Library/spec types,14candidate-file
format, strict OpenSpec and11CLI builds pass. Runtime lint0/109files; broad test
lint stillFAILED98/175 (was163), no waiver. Both unsafe-finally counts remain0;
20implied-eval sites remain. Eleven CLI bundles and276-module host bytes remain
equal to the previous cover, host SHA256
`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`.
Compiled only; no new privileged host proof, registry activation or product migration.

Archive:`/tmp/task8-test-json`; cover:`/tmp/task8-test-json-covering.json`.
Initial schema proof and intermediate type/return/format observations are retained;
final decoder/report proofs pin the current formatted sources. Full repository/
exact-SHA host gates, original-BASE review, commits, semantic R5, native ordinary
supervisor/consumer, provider bounds/restore/prune, registry alarms/watchdog and
adoption remain required. All17requirements/24scenarios and7/11reviewed slices
retained; Tasks4.2,4.3,5.1,5.2 incomplete. GoalACTIVE.

## Canonical journal reads and complete observed records — 2026-10-30T21:25:27.204749+00:00

Seven existing tests now validate their JSON/error boundaries without changing
production source. Backup-session reads use the existing canonical authority
response parser on unknown disk JSON before inspecting or injecting faults.
The duplicate guardian and five corrupt reconciliation scenarios still write the
faults to disk, then invoke the actual read command; no expected refusal is replaced
with a test-side parser failure. Unknown asymmetric matchers remain opaque values.
The native restic snapshot list is compared as an opaque complete array with the
same exact hostname/count and permitted extra snapshot fields, retaining actual
snapshot/restore/corrupt-pack behavior.

Two population diagnostics now compare all three complete ordered root reports,
including timeline and HTTP evidence. The previous category/frame/privacy checks
remain, with stronger missing/extra/reordered record refusal. Contender and deadline
assertions inspect opaque error members with partial object matchers, preserving
the same required messages and exact reporter/dependency identities. Deadline
observations validate required stage structure before their existing comparisons.
Modeled owner outcome maps retain exact Error instances; the map values are
narrowed explicitly before rejecting/throwing them.

The real unprivileged socket bootstrap validates kind, nonce and field closure.
Its new early-refusal path also settles the pending authentication: the existing
fixture-completion helper independently closes both sockets and the descriptor,
then awaits the exact rejection observation. A failure in one cleanup does not
skip later cleanup, and the operation failure remains observable. Existing FD0
transfer/held-lock/descriptor-leak scenarios remain real local kernel operations;
they do not represent sudo/root or privileged host startup evidence.

Four private actual-boundary baselines pass. Sixteen targeted source faults produce
24exact named failing variant/test pairs: missing/corrupt/reordered population
records, malformed bootstrap kind/nonce/extra field, wrong acknowledgement kind,
changed primary/secondary aggregate messages or member, and malformed rescue stage.
Malformed bootstrap cases fail without unhandled rejection or timeout witnesses.
Population/channel helpers are imported whole; contender/deadline bodies remain
source-extracted with modeled owner/rescue effects. These are bounded regression
witnesses, not16distinct certified production guards or full semantic R5 coverage.

Intermediate owning63/0/245 across7files passed before the final cleanup rewrite;
its source pins remain archived and are not claimed current. Final full fleet
passes2428/0/9966assertions/175files/179.17s on358stable selected inputs incl C/
pinned restic. Library/spec types,7file format, strict OpenSpec and11CLI builds pass.
Initial TypeScript caught a duplicate import; that failed output is retained and
the final source passes. Runtime lint0/109; broad test lint stillFAILED58/175
(was98), including20implied-eval sites. Both unsafe-finally sets remain0; no waiver
or exhaustive semantic R5 claim.

Eleven production CLI bundles and276-module host bytes remain equal to the prior
cover; host SHA256`91b9d0b7d656e9694aec44def45c2af2d6dff0f8e354d45549fa6eccb48656f2`.
Compiled only, no host execution/65packet, notification, activation or migration.
Archive:`/tmp/task8-test-records`; cover:`/tmp/task8-test-records-covering.json`.
Full17requirements/24scenarios,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain
open as before. Remaining test lint, full semantic R5/native/consumer, provider
bounds/restore/prune, registry alarms/watchdog, original-BASE review, normal commits,
exact-SHA full host gate and adoption remain required. GoalACTIVE.

## Precise fixture inputs and direct native predicates — 2026-10-30T21:40:38.802705+00:00

Ten existing tests and three native fixture modules are changed. Fourteen prior
non-dynamic lint findings are resolved without deleting missing-state checks or
assertions: explicit primitive coercion, unused bindings, unknown asymmetric matcher,
opaque intentional non-Error transport values, precise first-element access and
equivalent null checks. The modeled inventory runtime validates only the plan
fields it consumes instead of asserting unknown JSON has the full retirement-plan
type. The actual held controller remains responsible for full plan authorization.

Two source-evaluated predicate tests now call actual helpers used by their native
callers: shared retirement mode selection and exact-one history census admission.
All original cases remain; four cases additionally distinguish prefix/suffix/CRLF
receipt text and preserve the existing final-line-without-LF admission. The entire
host/shared/history modules compare as equal canonical JS ASTs and token streams after
expanding only the two exact extracted helper sites and their import binding.
Changed shared argument and omitted history-call controls fail forwarding checks;
a third changed-message control fails the actual whole-module AST/token comparison. This is bounded refactor compatibility, not arbitrary source/intrinsic
identity or native execution evidence.

The first full suite2418pass/14fail exposed two source-extracted owner harnesses
that had not received the newly imported selector. Both now receive the actual
helper; all original request/error/HTTP cleanup assertions remain. Targeted owner
tests30/0/147 pass, followed by the final full suite below. Initial lint38 also
identified a now-unused import; final lint36 contains only18implied-eval and18
unsafe dynamic-call findings. Other preexisting fixture extraction/test directives
remain outside this reported count and outside any full semantic R5 claim.

Three private baselines pass. Fifteen private faults produce18exact named failing
variant/test pairs. Eight helper faults cover exact receipt count/text and both
shared operation identities/unknown modes. Three changed persisted-plan producers
are refused earlier by the real journal exact-plan receipt guard; they are not
counted as decoder-boundary evidence. Four separate modeled reader-input faults
reach the actual local ArkType readers at precise TraversalError fields/frames
before their private destructive callbacks. An initially wrong expected boundary
and a literal-source diagnostic assumption are preserved failed, then classified
against actual terminal logs without replay. Provider/runtime/consumer operations
remain modeled; these are not15distinct certified safety guards or full R5 proof.

Final full fleet:2432pass/0fail/9970assertions/175files/176.06s on358stable
selected inputs incl C/pinned restic. Library/spec types,13file format, strict
OpenSpec and11CLI builds pass. Runtime lint0/109; required broad test lint still
FAILED36/175 (was58), no remaining finding waived. Both unsafe-finally sets0.
Eleven CLI bundles remain byte-identical to the prior cover. The276-module host
bundle changes after helper extraction: SHA256`5e9cf5dd9949cbdcc78a2ca9d59f0902cab0c6092518317955f81a426620e30c`,
1262587bytes. Compiled only, never installed or executed; prior host proof bytes
must not be claimed current. No new65packet/hostrun, notification, activation or
product migration.

Archive:`/tmp/task8-test-precision`; final checks:`checks-final`; cover:
`/tmp/task8-test-precision-covering.json`. All17requirements/24scenarios and7/11
reviewed slices retained; Tasks4.2,4.3,5.1,5.2 remain incomplete. Full semantic R5,
remaining extraction/lint, native ordinary supervisor/consumer, provider bounds/
restore/prune, registry alarms/watchdog, original-BASE review, normal commits,
exact-SHA repository host gate and adoption remain required. GoalACTIVE.

## Whole-module backup observations — 2026-10-30T22:11:37.541698+00:00

Three extracted-function boundaries now import actual modules in isolated workers;
six reap cases added, original identity/forwarding/cleanup assertions retained.
The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-backup-observations)
records the modeled effect scope, exact old baseline, failures and remaining limits.

- Original baseline14/0/93; final private baselines14/0/66 for the three targeted
  boundaries.28SUT variants/35exact named failing pairs; not distinct guard counts.
- Whole native module AST unchanged after two export modifiers are normalized;
  changed errno/omitted close controls fail the actual comparison.
- Initial full2437/1 found a dependent source-slice boundary; repaired contender
  cases2/0/12 pass. Wrong-directory format attempt failed; final root checks pass.
- Final `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`:2438pass/0fail/9983assertions/175files/185.40s,360stable
  selected inputs incl C/pinned restic. Library/spec types,6file format, strict
  OpenSpec and11CLI builds pass; runtime lint0/111, broadtest stillFAILED30/175.
- Fifteen reported implied-eval and15dynamic-call findings remain; other existing
  extraction/directives and full semantic R5 also remain. Unsafe-finally0 in both
  sets. New worker transport/scaffolding is not comprehensively certified.
- All11CLI/276module host bytes unchanged; host5e9cf5dd...1262587bytes compiled only.
  No new privileged host/provider run, notification, activation or product migration.

Archive:`/tmp/task8-backup-observers`; cover:`/tmp/task8-backup-observers-covering.json`.
Full17requirements/24scenarios and Tasks4.2,4.3,5.1,5.2 remain incomplete; full
repository/exact-SHA host gate, original-BASE review, native/provider/monitoring and
adoption obligations are still required. GoalACTIVE.

## Whole-module backup process observations — 2026-10-30T22:47:57.303400+00:00

The actual process reader and selector replace two extracted test boundaries;
three additional identity/non-Error cases close observed coverage gaps. The
[proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-backup-process-observations)
records models, retained assertions, failed probes and limits.

- Two private baselines: 14 cases/80 assertions. Twenty actual SUT mutations fail
  twenty required named cases. Both bridge terms now have separate witnesses.
- Four separate transport runs demonstrate failed-exit and unexpected-stderr
  refusal and matching bypass admission. Full scaffolding/R5 is not certified.
- Native AST unchanged after two added exports are normalized; two changed-body
  controls fail. Eleven CLI and 276-module host build bytes remain unchanged.
- Final `bun test --preload ../test/scratch/preload.ts --timeout=30000` from
  `tools/tool-fleet`: 2441/0/9989 assertions, 175 files, 198.88s, 362 stable inputs.
  Library/spec types, five-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint: 0 errors/113 files. Test lint still fails: 26 errors/175 files,
  13 implied-eval and 13 unsafe dynamic calls. Both unsafe-finally sets are zero.
- Invalid syntax/setup probes are retained and excluded from semantic evidence.
  No privileged execution, provider experiment, new notification or activation.

Archive: `/tmp/task8-backup-process`; cover: `/tmp/task8-backup-process-covering.json`.
Full 17/24 scope, 7/11 reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Original-BASE review, exact-SHA gate and native/provider/monitoring/adoption work
remain required. Goal active; no product migration.

## Whole-module server cleanup observations — 2026-10-30T22:56:26.398270+00:00

Two extracted server harnesses and one implied-eval suppression are replaced by
actual-module worker observations. The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-server-cleanup-observations)
records preserved cases, modeled boundaries, native group evidence and limits.

- Original18/0/116; migrated18/0/136; private modeled baseline17/0/123. Actual
  owned Bun group, both pipes and cleanup are observed before worker rescue.
- Ten actual server mutations fail ten named cases; four separate protocol
  refusal/bypass runs. Full R5/scaffolding certification remains open.
- Initial migrated17/1 found the worker's incorrect signal/exit observation.
  Corrected without changing the server; failed run and lint preparation retained.
- Final fleet2441/0/10009 assertions/175files/200.74s,364 stable selected inputs.
  Library/spec types, four-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/115; test lint still fails24/175 (12 implied-eval,12 unsafe calls).
  Both unsafe-finally sets0. No new waiver; other existing extraction remains.
- Four production module files, eleven CLI outputs and276-module host bytes equal
  the prior cover; no new privileged host/provider run or safeguard activation.

Archive `/tmp/task8-server-observation`; cover `/tmp/task8-server-observation-covering.json`.
Full17/24 scope,7/11 reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active, no product migration or new notification.

## Whole-starter guard process observations — 2026-10-30T23:03:18.842342+00:00

The actual guard starter replaces an extracted observer closure. The
[proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-starter-guard-process-observations)
records original cases, modeled privilege/lifetime, stronger census input control
and remaining limits.

- Original10/35 included twenty source-shape assertions, now removed. All ten
  behavior cases retained; six new races/census cases; owning/private16/40 pass.
- Twelve actual-module variants fail twelve named pairs. The initial census-bound
  result was diagnostic-only; a separate widened modeled input proves false mode
  acceptance when the actual bound is removed. Full R5 remains open.
- Four protocol refusal/bypass runs; actual starter/classifier bytes and eleven
  CLI/276-module host outputs unchanged. No new privileged host acceptance proof.
- Final fleet2447/0/10014assertions/175files/203.15s,366 stable selected inputs.
  Library/spec types, three-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/117; test lint still fails22/175,11 implied-eval+11unsafe calls.
  Both unsafe-finally sets0; other extraction/directives remain required.

Archive `/tmp/task8-guard-process`; cover `/tmp/task8-guard-process-covering.json`.
Full17/24 scope,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active; no new notification, activation or product migration.

## Whole-module native owner outcomes — 2026-10-30T23:11:44.393836+00:00

The actual native owner module replaces an extracted test boundary. The
[proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-native-owner-outcomes)
records identity/settlement observations, setup failure, export comparison and limits.

- Original1case/3samples/13assertions retained; six added cases; private7/37 pass.
  Exit/stdout/stderr are independently held to observe settlement before release.
- Twelve actual owner mutations fail twelve named pairs; four protocol runs.
  Spawn/proc/monitor/signal remain modeled; comprehensive R5 remains open.
- Native body AST equals before after one added export is normalized. Two actual
  changed-body controls fail. Native bundle differs only by that final export entry;
  exact byte comparison after its removal and changed-message control are recorded.
- Final fleet2453/0/10038assertions/175files/209.45s,368 stable selected inputs.
  Library/spec types, four-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/119; test lint still fails20/175,10implied-eval+10unsafe calls.
  Both unsafe-finally sets0. Eleven CLI bytes unchanged; native host1d9da33f...
  1262605bytes, compiled only. No new privileged host acceptance or activation.

Archive `/tmp/task8-owner-outcomes`; cover `/tmp/task8-owner-outcomes-covering.json`.
Full17/24 scope,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active; no new notification, activation or product migration.

## Whole-caller contention and reporting failure — 2026-10-30T23:29:22.204815+00:00

Actual callers replace two extracted contender/reporting boundaries. The
[proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-caller-backup-contention-and-diagnostic-preservation)
records real owned-journal scope, modeled probes and the reproduced masking bug.

- Original2/12; RED6/1 lost the stage/refusal aggregate when both reporters failed.
  The outer diagnostic now preserves ordered original/reporting failures and cause.
  Final owning/private7/50; five additional reporter/group cases.
- Fourteen actual mutations fail fourteen named pairs, including old outer catch
  restoration. Four separate protocol refusal/bypass runs. Full R5 remains open.
- Entire native AST differs only by the exact preserved outer-catch delta after
  comments/types are erased; two comparison controls fail. No guard is weakened.
- Initial full2306/149 failed on ENOSPC with370 stable inputs. Failed logs retained;
  pruning only regenerable Bun cache older than one day recovered space for retry.
- Final fleet2458/0/10076assertions/175files/217.34s,370stable selected inputs.
  Library/spec types, four-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/121; test lint still fails16/175 (8implied-eval+8unsafe calls).
  Both unsafe-finally sets0; existing extraction/directives remain required.
- Eleven CLI bytes match. Native276-module bundle a138898d...1262812bytes reflects
  the intentional catch fix; compiled only, no new privileged acceptance proof.

Archive `/tmp/task8-backup-contender`; cover `/tmp/task8-backup-contender-covering.json`.
Full17/24scope,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active; no new notification, activation or product migration.

## Whole-module unsafe collection dispatch — 2026-10-30T23:52:42.495201+00:00

The actual unsafe collection fixture replaces its extracted test boundary. The
[proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-unsafe-collection-dispatch)
records preserved checks, modeled authority, intermediate gaps and final scope.

- Original13/49; final17/72, four additional opaque/reporting cases. Three missed
  error-case child-identity assertions were restored after a conditional-copy
  control passed; failed-exit/pending copy controls now fail their named cases.
- Final23actual mutations/23named pairs; four protocol refusal/bypass cases.
  No real GC/native authority is forwarded; full R5 remains incomplete.
- Final fleet2462/0/10099assertions/175files/219.81s,372stable selected inputs.
  Library/spec types, three-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/123; test lint still fails14/175 (7implied-eval+7unsafe calls).
  Both unsafe-finally sets0; other extraction/directives remain required.
- Actual production module and11CLI/276module native bytes unchanged. Host
  a138898d...1262812bytes compiled only; no privileged acceptance or activation.
- Intermediate type/selector/reentry failures retained and qualified in inventory;
  final evidence comes only from final checks and preserved-assertion corpora.

Archive `/tmp/task8-unsafe-dispatch`; cover `/tmp/task8-unsafe-dispatch-covering.json`.
Full17/24scope,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active; no new notification, activation or product migration.

## Whole-module tag cleanup observations — 2026-10-31T00:15:41.891923+00:00

The actual tag-cleanup helper and diagnostic association replace extracted source.
The [proof inventory](../../../.superpowers/sdd/bound-registry-storage/task-8-proof-inventory.md#whole-module-tag-cleanup-observations)
records real file/descriptor scope, modeled authority and pre-rescue observations.

- All36 cases retained: original318assertions, owning/private528. Sixteen explicit
  no-ready assertions protect early refusal; exact0600/0644 restoration retained.
- Twenty-four actual mutations fail24named pairs; four protocol refusal/bypass
  runs. Physical mode and closure observations precede worker rescue.
- Final fleet2462/0/10309assertions/175files/237.31s,374stable selected inputs.
  Library/spec types, three-file format, strict OpenSpec and CLI/host builds pass.
- Runtime lint0/125; test lint still fails12/175 (6implied-eval+6unsafe calls).
  Both unsafe-finally sets0; existing extraction/directives and full R5 remain.
- Actual module,11CLI/276module native bytes unchanged. Host a138898d...
  1262812bytes compiled only; no new privileged server/group acceptance proof.

Archive `/tmp/task8-tag-observation`; cover `/tmp/task8-tag-observation-covering.json`.
Full17/24scope,7/11reviewed slices and Tasks4.2,4.3,5.1,5.2 remain incomplete.
Native/consumer/provider/monitoring, original-BASE review, exact-SHA gate and adoption
remain required. Goal active; no new notification, activation or product migration.

## Whole deletion controller and protected-content observations — 2026-10-31T00:36:18.083893+00:00

Replaced the remaining extracted controller function in
`registry-deletion-controller.test.ts` with the actual whole
`registry-maintenance-deletion.native.ts` module. Its private protected-content
verifier now runs too. The disposable worker uses real fresh files, journal/action
bytes, lstat and SHA256 response checks. Setup, journal decoding, owner/guard and
server responses remain modeled; this does not establish native retirement,
ordinary serving, installation authority or full journal admission.

All22 original cases remain. Four new protected-status/content cases bring the
owning/private suite to26pass/0fail/84assertions (original22/28). Successful cases
require the literal protected manifest/blob request sequence, both guard closes,
owner command order and final proof. Twenty actual controller mutations fail20
required named pairs, including protected status/digest, missing manifest/blob
reads and each guard close. Four protocol runs independently refuse stderr/exit
faults and admit the same valid response when only the corresponding guard is
removed. These are scoped witnesses, not exhaustive R5/scaffolding certification.

Initial permission mutation passed because umask changed the intended0666 file
to0644 and a later comparison refused it. Retained failed experiment in
`/tmp/task8-deletion-controller/counterfactuals/tag-modes`; explicit real chmod
makes original/receipt/physical modes agree, and the final mutation is caught.
The first full suite ran inside the restricted sandbox:2308pass/149fail, with
socket and other EPERM denials, stable376inputs. It is not a passing check.
The first authorized rerun was2465pass/1fail in the existing Docker completion
reporter case. Its old diagnostic labels do not recover that underlying error,
but a private100ms pause between marker creation/write reproduces the same early
unexpected failure as `Substitute readiness bytes differ`. The disposable engine
now writes a sibling then renames it. The same pause before rename preserves the
primary, operation reporter, both engine reporters and summary failure, with both
real groups terminal/absent. Initial green proof wrongly expected only one engine
diagnostic; its retained output had both. The corrected independent literal check
passes. This changes only the test engine fixture; no Docker/server is deployed.

A fresh authorized execution completed 2466pass/0fail/
10365assertions/175files on376stable selected inputs. Library/spec types,
four-file format, eleven CLI builds and strict change validation pass. Runtime
lint0/127; broad test lint still fails10/175 (five implied-eval/five unsafe calls),
unsafe-finally0. Production deletion source and all11CLI bytes are unchanged;
prior compiled native bundle retained, no new native build or execution.

Archive `/tmp/task8-deletion-controller`, final checks `checks-after-readiness`, cover
`/tmp/task8-deletion-controller-covering.json`. All owned jobs terminal. Goal stays
active at full17requirements/24scenarios,7/11 reviewed slices. Tasks4.2/4.3/5.1/5.2,
full semantic R5/original-BASE review/exact registry SHA gate, native current ACK/
startup/upload/inode/consumer continuation, provider accounting and restore/prune,
registry Slack alarms/watchdog and final adoption remain incomplete. No safeguards
activated, new notification/provider/privileged host run or product migration.

## Whole native deletion owner reporting — 2026-10-31T00:51:07.489508+00:00

Replaced both Function/source-extracted reporting paths in
`registry-deletion-failure.test.ts` with calls to the actual whole native owner.
The only native source change exports its existing `owner` function. The full
source equals its predecessor after removing that one export; two deliberate
body changes are refused by the same comparison. The native bundle differs only
by that final export entry; an altered-body control is refused. The fixture still
requires UID/GID59001. No kernel identity or native admission proof is inferred
from the modeled caller.

All13 original cases remain (five classifier cases plus eight owner cases).
Thirteen new cases bring the owning/private suite to26pass/0fail/187assertions,
from13/22. Exact ordinary/aggregate/null/undefined/opaque failure identity survives;
required HTTP finalization follows category reporter failure. Tests require exact
member order/primary cause for maintenance, existing observer cause for publication,
sole observer refusal, protected-kind dispatch, admitted operation/runtime/backup
identities, successful fenced completion and UID/GID refusals. Nineteen whole-module
mutations fail19required named pairs; four protocol experiments independently
refuse stderr/exit faults and admit the same valid response after only its guard
is removed. These are scoped witnesses, not exhaustive R5/scaffolding certification.

Installation, authority/runtime, journal responses, publication/maintenance and
HTTP observation effects remain modeled. The actual fixture clock constructor
runs on a fixed test Date.now and an eight-day offset; the first model used a
one-day offset and13owner cases correctly failed before maintenance. It was
corrected rather than bypassing the real clock guard. Mock publication receipts
now satisfy the real3/4-blob contract. Initial type/import/unbound-method findings
were corrected with object identity comparison, sorted imports and exact kill
property restoration. Preparation refusals did not count as successful checks.

Fresh full fleet: 2479pass/0fail/10530assertions/175files on378stable
selected inputs. Library/spec types, four-source format, eleven CLI builds and
strict change/all-OpenSpec validation pass. Runtime lint0/129. Broad test lint still
fails6/175: three implied-eval/unsafe-call pairs, unsafe-finally0. Remaining reported
sites: backup deadline, selected/pre-kill backup process observation and permit
HTTP. Other extraction/directives and comprehensive semantic R5 remain open.

All11CLI bytes equal the predecessor. Compiled-only276module native bundle SHA256
`99c486d622fd911978d3bcc2a772c5c9ef05fef3c676ea1032f0aca804a01938`, 1262821bytes; never installed or executed.
Archive `/tmp/task8-deletion-reporting`, cover
`/tmp/task8-deletion-reporting-covering.json`, final checks `checks-final`.
All owned jobs terminal. Full17requirements/24scenarios and7/11reviewed slices stay
intact. Tasks4.2/4.3/5.1/5.2, original-BASE review/exact registry SHA gate, native
upload/inode/current ordinary ACK/startup/consumer continuation, provider budget/
restore-prune, registry Slack alarms/watchdog and operational adoption remain
incomplete. No new remote run, notification, provider change, safeguard activation
or product migration.

## Whole backup interruption, deadline rescue and guardian roles — 2026-10-31T01:11:33.844254+00:00

Replaced both remaining backup Function/source-extracted paths with the actual
whole `interruptRegistryBackup` module and its selector, guardian/owner identity,
held-descriptor, interrupt and reaping helpers. Only proc/filesystem text/listings,
FD metadata, journal response decoding, clock, signals and waitpid are modeled.
No filesystem mutation, subprocess, signal or native-library call is forwarded.
The elapsed130second limit is exercised with a modeled monotonic clock, not an
actual130second deadline. Kernel locking/signaling/authority and full journal
admission remain separate native obligations.

All28 original cases in the two owning test files remain, including22deadline
cases and both role routes. Two caller refusals and a transient worker read bring
the owning/private suite to31pass/0fail/245assertions, from28/165. Required process
and descriptor reads, exact injected errors, missing-deadline reason first,
normal pending-interrupt success, stop/group probes, reaping finalization and
native-library close calls are observed through the actual helpers. Role bypasses
still call a refusing guardian parser but lose the required bounded role/input
diagnostic; they are observation-path witnesses, not unsafe-signal admission.

A private mutant removing the earlier worker census initially passed the old
persistent-worker test: the later descriptor helper independently refused the
same persistent identity change. That pass is retained as a limitation, not a
negative proof. The new worker-read case models temporary unreadability before
the fresh restic census; the later descriptor read is healthy. The same mutant
now fails this named case. No safety check was removed to make the baseline pass.
Twenty-six actual module mutations fail26required named pairs; four protocol
experiments refuse stderr/exit faults and admit the same response when only the
matching receiver guard is removed. Full semantic R5/scaffolding certification
is not inferred. One initial unsafe Reflect return was changed to an explicit
unknown boundary; counters are named ownerReads/descriptorReads rather than checks.

Fresh full fleet: 2482pass/0fail/10610assertions/175files on380stable
selected inputs. Library/spec types, four-source format,11CLI builds and strict/
all OpenSpec validation pass. Runtime lint0/131; test lint still fails2/175, one
implied-eval/unsafe-call pair in permit HTTP. Both unsafe-finally inventories0.
Other unreported extraction/directives, full original-BASE review and exact-SHA
repository gate remain. Actual interruption source, all11CLI bundles and the
276module native bundle bytes equal the predecessor. Compiled native SHA256
`99c486d622fd911978d3bcc2a772c5c9ef05fef3c676ea1032f0aca804a01938`, 1262821bytes, not installed or executed.

Archive `/tmp/task8-backup-deadline-observation`, final checks `checks-final`,
cover `/tmp/task8-backup-deadline-observation-covering.json`. All owned jobs terminal.
Goal remains full17requirements/24scenarios,7/11reviewed slices. Tasks4.2/4.3/5.1/5.2,
native upload/inode/current ordinary ACK/startup/consumer continuation, provider
budget/restore-prune, registry Slack alarms/watchdog and adoption remain incomplete.
No new remote/provider run, notification, safeguard activation or product migration.

## Shared native permit HTTP probe; reported lint inventory closed — 2026-10-31T01:41:43.151535+00:00

Replaced the final reported Function/source-extracted HTTP test with the actual
`createRegistryPermitHttpProbe` in `registry-permit-http.fixture.ts`, which the
native guard rehearsal now calls too. Its Promise-forwarding wrapper keeps the
native diagnostic step. The helper retains private expected/status/cumulative
counter state and returns copied diagnostic snapshots. The6second bound resets
per call. The existing post-response count refuses after observing upload257;
that257th request has already occurred. No pre-request quota or new registry
storage protection is inferred from this fixture limit.

All6 original behavior cases remain (the duplicate non-Error case has a distinct
suffix). Nine new cases bring owning/private tests to15pass/0fail/69assertions,
from6/24 including twelve former source-delimiter assertions. Actual AbortSignals,
Response bodies and stream reader run; fetch/clock/sleep remain modeled. Tests
cover resets/refusals/timeouts, unknown/non-Error identity, immediate/pre-call
cancellation, requested and unexpected status, absent/malformed upload UUID,
response byte bound, body failure, cumulative counter and copied snapshot.
Eighteen actual helper mutations fail18required named pairs; four protocol
experiments refuse stderr/exit faults and admit the same valid response after
only the matching receiver guard is removed.

The first body-failure test wrongly expected a sole error. The actual stream
reader's cancel on an already errored stream rejects too, retaining the exact
original twice in AggregateError.errors and as cause. Corrected assertions check
that existing contract; production stream behavior was not changed. Initial
worker import/require-await findings were corrected. The equivalence checker
initially included SourceFile.text, so it compared unchanged raw text rather than
the reconstructed AST; its projection now includes only structural nodes and
literal/identifier text. Eight deliberate body/dependency/caller changes are
refused. The actual HTTP body equals the original after only signal-reference
mapping and moving the diagnostic step to the synchronous forwarding caller.
Reconstructing the explicit imports/state/snapshot/counter bridge yields the
complete original native AST. This is scoped mechanical equivalence, not a real
six-second network/guard/kernel test or full semantic R5 certification.

Fresh fleet: 2491pass/0fail/10655assertions/175files on383stable selected
inputs. Runtime lint0/134 and broad test lint0/175, warnings0; reported implied-eval,
unsafe calls and unsafe-finally0. Library/spec types, five-source format,11CLI
builds and strict/all OpenSpec pass. Other unreported extraction/directives,
comprehensive semantic R5, original-BASE review and exact-SHA gate remain.
All11CLI bytes equal the predecessor. The277module native fixture changed as
expected for the shared helper: SHA256`32a599076eddb3aed5dce51fa322b2a8c08cf647dcaed2b59c80bce416cb3425`,
1263195bytes, compiled-only, not installed or executed. Earlier native source
identity does not certify this current closure.

Archive `/tmp/task8-permit-http`, final checks `checks-final`, cover
`/tmp/task8-permit-http-covering.json`. All owned jobs terminal. Full17requirements/
24scenarios,7/11reviewed slices and Tasks4.2/4.3/5.1/5.2 remain. Native upload/inode/
current ordinary ACK/startup/consumer continuation, provider budgets/restore-prune,
registry Slack alarms/watchdog and operational adoption are incomplete. No new
remote/provider run, notification, safeguard activation or product migration.

## Native ordinary ACK synchronization and populated lifecycle — 2026-10-31T02:14:11.460997+00:00

HOST65 failed after the real population owner returned0. HOST66's disposable
post-build category/frame diagnostic located the strict supervisor correlation
refusal; HOST67 added only five booleans. Captured/current instance, actual boot
and nonce freshness were true, ACK equality false. The final abandoned-publication
journal write rotated the request while already fenced; it need not wait for a new
ACK. Readonly process readiness alone therefore sampled the prior acknowledgement.
All three failed runs are closed with two independent cleanup audits each and
post-audit source/input/payload/snapshot rechecks. Their original packets were not
replayed. Diagnostic copies never emitted raw records, error text or credentials.

The native owner now binds the actual population receipt, awaits the existing real
`executeRegistryCommand(directory, {command: 'check-capacity'}, ports)` operation,
then emits success. That authority path already creates a fresh request and waits
for its matching readonly ACK. The strict instance/boot/fresh-nonce/descriptor-bound
verifier is unchanged. Reconstructing this one owner block yields every original
native source byte. All11 production CLI bundles remain byte-identical.

Six earlier extracted-source publication/observer/output scenarios are preserved
as nine tests through the actual whole owner in the existing disposable worker.
Installation, authority confirmation, publication, HTTP monitor and output are
modeled; no native effect is forwarded. New cases cover confirmation failure,
combined confirmation/observer failure and a held confirmation. Initial unchanged
implementation:2pass/7fail, missing required confirmation. Five actual owner edits
(missing await, wrong command/directory/ports, early receipt) fail their named case.
The preserved output/observer aggregate-cause assertion also fails a sixth actual
edit making the observer primary. Exact failure identities/members/causes and
required observer finalization remain checked. Native execution is separate.

HOST68 ran the unmodified current-source bundle
`ea362d5fe744d380cb636f44680802f85b88b07f0a00e62adb19c42102a19588`
(1263317bytes,277transitive inputs,90native source files), with two independent
byte-identical host/API builds. Actual pinned startup guard ACK correlation passed;
the actual managed partial publication, ordinary writable/readonly DELETE refusals,
root retirement/offline GC, retained HTTP verification and fenced verified terminal
state passed17checks in108.32seconds. Absent and mismatched snapshot receipts each
refused before native GC, then the admitted path started GC. Real-time upload grace
refused with unchanged staging; discard alone used the declared synthetic offset
691150477ms and restored its clock. This does not prove seven elapsed days, Docker
engine pulls, actual consumer CLI, cluster termination or provider admission.
Population HTTP capture was capped64events/truncated=true/pending0; it is not an
exhaustive trace. Guard timeline11samples was not truncated.

Containment stayed896MiB maximum,21GiB root preflight/20GiB retained, canonical
WAIT0 lock and120/180/240/270/300second deadlines. Four owned loops detached;
208host root/cgroup samples remained unchanged. Both independent cleanup audits0
with empty stderr confirmed no owned fixture/loop/process/namespace/descriptor/
mount/lock references, preserved host namespaces and at least20GiB root reserve.
Closure `/tmp/task8-host68/closure.json` seals the post-audit graph/source/payload/
private snapshot recheck. Never replay68 merely for observation. Three test-only
inputs were strengthened afterward; all277native graph inputs remain unchanged.

Final fresh fleet:2494pass/0fail/10703assertions/175files on383stable
selected inputs. Runtime lint0/134, test lint0/175 and warnings0; library/spec types,
four-source format and11CLI builds pass. Initial focused invocation included a
nonexistent deletion-diagnostic path that Bun did not collect: its actual result
was87tests across2files, not3. The complete fleet includes the actual deletion
failure tests. An initial parallel build preparation stopped before compilation
because its parent archive directory was absent; the subsequent build ran and
produced all11outputs. Full repository/exact-SHA gate remains unrun.

Archive `/tmp/task8-ack-confirmation`, final checks `checks-closed`, current cover
`/tmp/task8-ack-confirmation-covering.json`; strict/all OpenSpec and final record
format/seal are recorded alongside. Full17requirements/24scenarios,7/11reviewed
slices and Tasks4.2/4.3/5.1/5.2 remain incomplete. This closes a current ordinary
startup/ACK positive, not Task8 or operational adoption. Native upload/inode and
consumer/permit-serving continuation, comprehensive semantic R5/original-BASE
review, provider budgets/restore-prune, registry Slack alarms/watchdog, final gates
and adoption remain. No live safeguards activated, product migration, new provider
experiment, Slack message or outbound support message occurred.

## Physical inode pressure and explicit native allocation mode — 2026-10-31T03:29:06.608383+00:00

The owned native fixture now selects bytes or inodes through required
`PUNI_REGISTRY_FIXTURE_ALLOCATION` admission in the existing `prove-volume-full`
route. Ordinary owner and backup-worker routes are unchanged. The direct typed
controller retains its byte default. Missing or unknown native allocation values
refuse; the argv, namespace checks, writer selectors and root/journal admission
are unchanged. The original byte allocator remains intact.

The new inode allocator requires the fixed root/PID1 fixture command, registry
contents and receipt paths, independently measured device identity and128MiB
maximum. It refuses a filesystem above16384inodes or already saturated. It creates
an exclusive0700owned directory outside contents and at most16384exclusive0600
empty files, checking actual numeric inode/device/owner/type/link/mode/size and
awaiting descriptor closure even on a failed metadata read. Only ENOSPC from open
qualifies. Its retained verifier requires zero free inodes, at least64MiB byte
headroom, exact directory identity, exact sorted names/count and every captured
file inode/metadata. The controller awaits this verifier before backup and again
after staged recovery. Filler remains until the outer namespace cleanup.

The disposable whole-module worker models filesystem/identity/counters and rejects
unmodeled effects. Initial missing implementation and missing retained verification
both produced observed RED cases. Final owning four-file suite:199pass/0fail/
1082assertions. The new inode file has67cases including10allocation-parser cases.
Fifty-seven actual helper variants and seven actual controller/native-route
variants each fail their named test; all source restored. The57include every
initial48variant witness plus retained identity/name/count/metadata/read/await and
input admission checks. Some witnesses prove a missing observation or early refusal,
not unsafe admission. Twenty adjacent scoped Proof comments bind the observed
faults; reconstruction after removing only those comments recovers the proved
runtime bodies. These64variants are not comprehensive semantic R5 certification.

Independent twin builds agree byte-for-byte for host and API. Current host bundle
`cd14fddfaa19a8c29fe83d446466cfa937df77898022195bd3bb0ea442162c6c`
is1269286bytes,279actual graph inputs and92native sources. All387selected inputs,
configuration, graph resolution, payload and private copies are frozen and checked.
All11production CLI outputs remain byte-identical to the ACK predecessor.

HOST69 refused during inode filler admission after actual initialization, backup,
index reopen, protected publication and protection succeeded. Its compiled frame
binds the initial filesystem identity/maximum/inode-cap/already-full predicate;
no inode exhaustion or recovery is claimed for69. A subsequent read of the installed
mke2fs primary manual and an explicit no-write `mkfs.ext4 -n` calculation against
/dev/null reported32768inodes for the original128MiB recipe and8192with `-N8192`.
The first manual matcher refused before running a calculation because the installed
text says “file system”. HOST70 changed only the owned registry filesystem's inode
geometry to8192; it increased no byte limit, allocator bound, reserve or deadline.

HOST70 passed in122.62seconds with8120owned empty files on8192total inodes,
111988736available bytes and actual ACK open ENOSPC. The allocator's successful
verification guarantees zero free inodes; that used counter is not emitted as a
separate field. Exact selected writer4256/start357385660 stopped by SIGTERM143,
with its group absent. Actual Distribution/authority/restic completed a new matching
verified backup and same-operation staged fenced recovery, retaining the filler
and all obligations. Backup/recovery HTTP had19/13GET200events, pending0 and no
truncation. HOST71 used the same current bundle with explicit bytes selection and
all four original filesystem recipes. It passed in122.34seconds:105889792byte filler,
actual ACK write ENOSPC, exact writer4258/start357441830 stopped143/group absent,
matching verified backup and staged recovery with filler and obligations retained.
Both proofs explicitly leave serving activation pending; Kubernetes termination,
reader/provider inputs remain modeled. Neither proves a real upload exhausting
storage, ordinary serving activation, or startup ACK during saturation. The prior
ordinary startup/ACK positive is HOST68 on its earlier recorded bundle; it was not
silently rerun on this one.

Containment is unchanged:896MiB maximum owned filesystems/runtime,21GiB preflight/
20GiB retained root reserve, private namespaces, readonly cgroup view, canonical
WAIT0 heavy lock and120/180/240/270/300second deadlines. HOST69/70/71 respectively
observed91/236/236unchanged host root/cgroup samples. Every run detached four loops,
removed its exact fixture and released owned lock identities. All six independent
worker/parent cleanup audits exited0with empty stderr. Their closure receipts
rechecked current graph/source/configuration/payload/private copies AFTER both
audits; no live proof job remains and the source freeze is released. Never replay
these packets merely for observation. Closures: `/tmp/task8-host69/closure.json`,
`/tmp/task8-host70/closure.json`, `/tmp/task8-host71/closure.json`.

Transport review found drivers65–69 retained an old literal task8-host65 path in
one additional prelaunch private-snapshot reader. Their actual current source,
configuration, graph and payload guards were correct; current private copies were
checked at creation and in post-audit closures, but that extra prelaunch reader
checked65copies. HOST70/71 now bind the actual69snapshot metadata as manifest
artifacts and read its pins through those manifest paths. No old65literal remains.
Seven no-SSH prefix experiments provide two corruption refusals, three matching
removal/old-reader acceptances and two controls. They stop before workload receipt
creation or SSH spawn. This explicitly corrects the earlier prelaunch scope claim.

Full fleet:2568pass/0fail/11033assertions/176files in269.32seconds on387stable
selected inputs. Runtime lint0/137, test lint0/176, warnings0; library/spec types,
eight-source format and11CLI builds pass. Initial import/type findings were fixed
before those final checks. Strict change/all OpenSpec and forced formatting of all
four records are recorded alongside the final seal. The full repository and exact
registry SHA canonical-host gate remain unrun; semantic R5 and original-BASE formal
review remain open. Archive `/tmp/task8-inode-pressure`; current cover
`/tmp/task8-inode-pressure-covering.json`.

Full17requirements/24scenarios and7/11reviewed slices are unchanged. Tasks4.2/4.3/
5.1/5.2 remain incomplete. Physical inode pressure is now proved in the owned
fixture; actual upload exhaustion and consumer CLI/permit-serving continuation,
provider bounds/isolated restore-prune, registry alarm delivery/independent watchdog,
review/commits/exact-SHA gate and operational adoption remain. No new provider
experiment, Slack notification, outbound support message, safeguard activation or
product migration occurred. A separate read-only monitoring check at03:27:59Z
observed the same Alertmanager container,12completed Slack requests,0failed and
0active alerts; it neither read the webhook nor sent a notification.

## Upload-exhaustion interception: local handler proof only — 2026-10-31T03:42:09.561290+00:00

Added `registry-upload-pressure.fixture.ts` with an actual one-shot Request handler
and its test file. It selects only the fixed pressure/full blob PUT, requires one
matching digest and a valid upload UUID, reads at most the declared body size and
verifies exact size/hash. It consumes selection before the first stream await,
awaits the caller's bounded allocator, then forwards the exact bytes. Only a real
upstream500body containing “no space left on device” produces a witness. The
response's bytes/status/headers are preserved. Other requests pass through without
an exhaustion witness. Every caught error and repeated body invalidates verification.
No error status or ENOSPC response is injected by this helper.

The new tests exercise actual Request/Response objects, the actual bounded reader
and real unfinished streams; allocator/upstream effects are modeled. Initial
implementation-absent run:0pass/18fail. Final new file:24cases. Together with actual
HTTP upload-ownership and durable publication tests:38pass/0fail/126assertions in
three files on389stable selected inputs. Library/spec types, two-file format and
scoped lint0errors/0warnings pass. The first type check required owned Buffer copies
at DOM BodyInit boundaries; test-only import/void-return/rejection assertions were
corrected rather than suppressed. Both early failed checks remain archived.

Twenty-one edits to the actual handler each fail their named test. Covered faults:
retained fetch failure, method/repository route, one-shot/early selection, UUID,
digest count/value, request byte bound, exact size/hash, missing allocation/await,
forwarded body, response byte bound/status/ENOSPC text, completed observation,
retained cause and verification failure/completion guards. The unfinished-stream
cases supply one overflowing chunk without closing; raising the bound requires an
independent50ms rescue and fails the exact overflow/cancellation assertion. These
prove call-site bounds rather than relying on the later digest check to refuse the
same oversized body. Fourteen scoped adjacent Proof comments bind observed faults;
removing only them reconstructs the exact mutation-tested runtime. A comment initially
matched the similar fetch guard; its placement was corrected to verify and checked
again after formatting. This is scoped evidence, not comprehensive semantic R5.

This helper is NOT yet called by the native fixture or a production entrypoint.
All279inputs of the prior cd14native graph remain byte-identical; no new native
bundle was built/installed/executed. Fresh builds of all11production CLI outputs
pass and remain byte-identical to the predecessor. No privileged proof job or new remote/provider run,
notification, activation or product migration occurred. The prior2568-case complete
fleet remains historical for the predecessor; it was not rerun for this isolated
uncalled fixture helper. Full repository/exact registry SHA gate remains unrun.

Next: connect a fixed managed publisher and loopback listener in the existing
private PID1 pressure route, with explicit scenario admission. Fill after the real
schema4 UUID ownership acknowledgement and before forwarding the selected body;
require Distribution's real ENOSPC response, canonical failed publication,
reservation/ownership and persistent fence. Then close the exact owned writer and
restart the actual ordinary guard read-only with the filler retained, proving a
subsequent write refusal and preserved protected reads. Keep35second correlated ACK
failures as failures; do not fabricate ACK or shorten production windows. Existing
`begin-maintenance` refuses an unresolved publication, so do not append backup to
that failed publication by clearing its ownership. This upload/restart scenario is
an additional proof; existing70/71backup/recovery proofs remain separate obligations.
Use a new frozen h4 packet, unchanged approved bounds and both cleanup audits; no
replay merely for observation.

Archive `/tmp/task8-upload-pressure`, final checks `checks-final`; covering record
`/tmp/task8-upload-pressure-covering.json`. Full17requirements/24scenarios,
7/11reviewed slices and four open tasks are unchanged. Physical upload exhaustion,
consumer serving, semantic R5/original-BASE review/commits/gate, provider budget/
restore-prune, registry alerts/watchdog and operational adoption remain incomplete.

## Managed upload integration and closed native response refusals — 2026-10-31T04:18:18.462590+00:00

The fixed pressure/full OCI artifact now supplies config, layer and manifest through
actual file writes and `verifyContent`. The real shared managed producer, journal
and uploader are used by `publishRegistryPressureUpload`; no failed operation is
converted to success. Local integration observes the actual schema4 UUID writing
record and reservation in the canonical journal before the modeled allocator runs,
then the real HTTP error path records failed publication, an unfinished bundle,
retained reservation and fence. Bootstrap eligibility/capacity and upstream ENOSPC
are modeled in that local test; it does not prove physical pressure or ACK behavior.
The actual occupied-file negative fails when exclusive creation is removed; the
runtime was restored and its adjacent Proof comment recorded. The original one-shot
handler body is byte-identical to its21-mutation predecessor, including all14Proof
comments; mechanical binding is `/tmp/task8-upload-native/handler-body-transfer.json`.
Those21witnesses do not certify the new controller.

`registry-upload-host.native.ts` adds the independent upload/restart scenario.
The existing exact prove-volume-full PID1 route accepts explicit allocation value
upload; bytes/inodes continue through the original strict parser/controller. The
new pressure-upload owner uses checked private scratch and the fixed managed client.
Route tests initially6pass/2fail because upload was refused; after wiring all8pass.
The controller seeds/protects the existing index, starts the captured direct writer,
requires canonical UUID ownership before the bounded root filler and forwards the
selected body to actual Distribution. Its intended terminal checks retain the failed
publication/reservation/fence, close the writer, restart the actual ordinary guard
readonly, refuse a POST and read all7protected digests while preserving the journal,
filler and pressure. Unresolved publication is not cleared to append maintenance.
These intended checks are not yet a successful physical upload/restart proof.

HOST72 executed bundle
`dfc562ad133206d1ace0a0f9cc65142a6d9b32e5bbbfa699508332799493efde`
(1287372bytes,281graph/94native/391selected inputs). It failed at managed-upload
in118.74seconds without timeout after five bootstrap/protected owners returned0.
The original single diagnostic located only completeRegistryFixture's AggregateError
at compiled24859. Both cleanup audits0/empty stderr closed;228host root/cgroup
samples unchanged. No upload exhaustion, canonical failure receipt or restart success
is inferred from that top wrapper. Closure `/tmp/task8-host72/closure.json`.

A whole-controller disposable worker reproduces direct and aggregate bootstrap
errors without forwarding native effects. Initial1pass/1fail: aggregate reported
wrapper703instead of primary901. The controller now observes only the immediate
AggregateError.cause through the existing fixed-category/numeric-frame redactor,
while rethrowing the original failure unchanged. Final2pass/6assertions. Removing
this diagnostic selection and its Proof comment reconstructs every executed72
controller byte; no upload, pressure, ownership, restart or cleanup guard changed.
This is a one-level clue, not unbounded cause traversal or authenticated provenance.

HOST73 executed the current diagnostic-improved bundle
`1b9103468d3b9196dc4f7d718a18aba9f32b517ab1aa93538bee74d6a18bca6d`
(1287467bytes,281graph/94native/393selected inputs). It failed at managed-upload
in119.53seconds without timeout. The primary compiled30345is the unchanged predicate
requiring response500and text “no space left on device”, after the allocator and
forward awaits. This location does not distinguish which response predicate failed
and is not a complete physical failure receipt. The response status/structure were
not emitted, so neither an error-format mismatch nor a proxy failure is established.
Both independent cleanup audits0/empty stderr;230host root/cgroup samples unchanged.
Closure `/tmp/task8-host73/closure.json`. Both runs detached4loops, removed their
exact fixture/namespaces/FDs/mounts/owned lock identities and rechecked current graph,
source/config/payload/private copies AFTER both audits. Source freeze released;
no live proof job remains. Never replay72/73merely for observation.

The same approved containment held:896MiB maximum owned filesystem/runtime storage,
21GiB root preflight/20GiB retained reserve, WAIT0 canonical lock, private namespaces,
readonly cgroup view and120/180/240/270/300second deadlines. All79borrowed runtime
artifacts matched fresh read-only preflights. Twin independent host/API builds were
byte-exact. All11fresh production CLI outputs remain byte-identical to predecessor;
no live installation/adoption or product migration occurred.

Complete fleet before the diagnostic-only change:2598pass/0fail/11156assertions/
178files in272.89seconds on391stable inputs. Current owning suite127pass/0fail/
823assertions/5files on393stable inputs. Current runtime lint0/140, test lint0/179,
warnings0; library/spec types, seven-source format and11CLI builds pass. Full fleet
was not repeated for the diagnostic-only change; its exact runtime reconstruction
and fresh direct/aggregate tests delimit the evidence. Strict/all OpenSpec and
forced final four-record formatting are recorded alongside the final seal. Exact
registry SHA full repository gate remains unrun.

New-controller adversarial R5 review remains OPEN. Its18mechanical throw sites are
not distinct or exhaustive guards; compound predicates, native owner coupling,
proxy lifetimes, cleanup/reporting failures, required calls and awaits still need
production-path negative/removal reconciliation. `controller-negative-queue.json`
is a queue, not proof. A first local test treated the verifier's Blob as bytes;
corrected to its actual contract. A journal-write expectation initially omitted
server timestamp at, and the transport error prefix is Managed registry request,
not the later action label. Those expectations were corrected; native behavior was
not weakened. Root-directory preload/format invocations were corrected to the tool's
actual cwd before final checks. Initial types/import/unknown-boundary findings were
fixed without new suppression. A73closure preparation referenced72manifest and
refused before writing a closure; fixed to73and all checks rerun successfully.

The current72transport prefix was also exercised without SSH. Two corruptions
refuse; removing each corresponding hash/binding admits that fault. Restoring the
old65reader now refuses missing inputs metadata because72uses source/inputs labels;
the transplanted expectation of acceptance from70's source/build-input labels was
wrong. Its failed raw attempt is retained, then an explicit refusal control passes.
Seven checked controls/eight total prefix executions, two corruption refusals/two
matching removal acceptances/one wrong-reader refusal/two normal/restored controls.
Only owned test copies changed and were restored; actual packets/snapshots unchanged.

Next: add bounded response-status/size/fixed-indicator observation without raw
body/header/token output or any relaxed admission predicate, then use a new frozen
packet to identify the real response. Only evidence from that response can justify
an error-schema or proxy fix. Preserve failed ownership,35sACK windows, all bounds
and both cleanup audits. Actual successful upload/restart and consumer serving,
new-controller/full semantic R5/original-BASE review/commits/exact-SHA gate, provider
bounds/isolated restore-prune, registry-specific Slack alerts/independent watchdog
and operational adoption remain. Full17requirements/24scenarios,7/11reviewed slices
and Tasks4.2/4.3/5.1/5.2 remain incomplete. No provider experiment, outbound support
message, Slack notification, safeguard activation or product migration occurred.

Archive `/tmp/task8-upload-native`, current checks `checks-closed` and historical
pre-diagnostic complete fleet `checks-final`; cover
`/tmp/task8-upload-native-covering.json`.

## Structured upload ENOSPC and ordinary read-only restart — 2026-10-31T04:55:22.320903+00:00

The response-format assumption in the previous mocked upstream was incorrect.
Observation-only HOST74 preserved all admission predicates and observed HTTP500,
238 bounded bytes, `hasEnospcText:false`, `hasErrno28Pattern:true`; it then refused
at the original predicate. Its closure is
`/tmp/task8-host74/closure.json`, SHA
`acd65b47ccce4c7dbd9728b217dacc09dd553f5d1147a3e9c507744beb3d89f1`.
No numeric-pattern admission or successful upload/restart is attributed to74.
The exact runtime reconstruction applies only to this observation-only stage.

Pinned primary source: [Distribution error envelope](https://github.com/distribution/distribution/blob/v2.8.3/registry/api/errcode/errors.go),
[storage driver errors](https://github.com/distribution/distribution/blob/v2.8.3/registry/storage/driver/storagedriver.go),
[driver wrapping](https://github.com/distribution/distribution/blob/v2.8.3/registry/storage/driver/base/base.go)
and [blob upload handler](https://github.com/distribution/distribution/blob/v2.8.3/registry/handlers/blobupload.go).
The new `registry-upload-error.fixture.ts` validates unknown JSON once using an
exact one-error tuple, UNKNOWN/unknown error, direct syscall or filesystem-driver
wrapper, allowed open/write/mkdir, numeric28, no extra keys, bounded absolute path,
canonical normalization and the exact owning upload path. It returns operation and
errno only. Persisted journal validation independently requires the exact managed
HTTP500 prefix and the same structured selected-upload validation. Existing4096B
HTTP and1024B journal limits remain. The HTTP route retains status500 validation;
plain text, bare Err28, wrong origin, wrong upload and malformed envelopes refuse.
No duplicate UUID fallback, suppression, unchecked cast or raw body output added.

Test development: observation additions initially24pass/8fail, then32/115;
parser first0pass/41fail, then41pass, finally46cases. Corrected client/HTTP models
initially29pass/7fail. Final parser/HTTP/client focused suite83pass/0fail/
198assertions across3files. These use actual local journal/managed publisher/HTTP
but modeled capacity/upstream, and do not establish kernel pressure by themselves.
`counterfactuals/proofs.json` records seven actual observation source mutations;
`error-counterfactuals/proofs.json` records19 actual parser/message/HTTP-wiring
mutations, all named failures with restored source. They cover errno, operation,
path schema/length/extras, driver identity/extras, API code/message/extras,
envelope extras/cardinality, schema binding, selected prefix/canonicality, stored
origin/delegated parser and live HTTP status/parser calls. Six adjacent new Proof
comments were added after those failures; comment removal reconstructs the exact
mutation-tested bodies. The old21handler mutation transfer was byte-exact only
before the response validation changed. New-controller await/cleanup/reporting/
caller and full semantic R5 remain open;18mechanical throw sites are not an
exhaustive or distinct guard inventory.

Current complete `tools/tool-fleet` suite with real local sockets and pinned restic:
2655pass,0fail,11241assertions,180files,275.33seconds; ended
2026-10-31T04:47:31.747162Z. All395selected source pins stayed unchanged. Runtime
lint141files and test lint180files each0errors/0warnings; library/spec tsc,
six-source Prettier and11CLI builds exit0. A separate explicit final comparison
found all11CLI hashes equal the previous cover. Earlier operation-array typing,
obsolete always-false test branches and one reconstruction-only blank line were
corrected; final checks cover the corrected source. Exact repository SHA gate is
still unrun.

Current HOST75 independently twinned build:1289728bytes,
`da7fcf17696be421f414f38547c12bb0d11e55539568144cd13f0b18f43c8683`,
282actual graph inputs/95native sources/395selected. API twin unchanged10546B,
`29fb02f9a653984b1f97ab24a4660b09b5ca7c0e11dd17789a8f8185b116d052`.
Manifest SHA`96bd552d168e613d36f56f16870d8eb952499111ab68f0f163b0ba664f6f390e`;
driver SHA`b23530777dc1fd28a273eaf19e8f826bc48f7f1c1bd94baf31a6de49bd8fd929`.
75terminal exit0/no timeout in121.95771349198185seconds, empty stderr.
The16byte actual upload body failed at filesystem write with errno28; upstream
response remained500/238bytes. Real managed publisher recorded the upload UUID
before bounded filling. Independent canonical failure/unfinished bundle/reservation
and fence persisted; selected writer4258/start357962000stoppedSIGTERM143 with
process group absent. Actual ordinary startup read-only restart refused POST405
and returned all seven protected digests. Canonical failure journal stayed equal,
105857024B filler remained, filesystem available bytes12288. Source/authority/
uploader/Distribution/filesystems are actual; bootstrap Kube/readers/provider
are modeled. No consumer engine, ordinary writable serving, combined backup/recovery
with unresolved publication, installed adoption or product migration claim.

Containment unchanged: four ext4 loops320MiB, runtime256MiB plus Docker runtime
256MiB plus auxiliary64MiB=896MiB; root21GiBpreflight/20GiBretained; private
PID/mount/network/UTS/cgroup, loopback-only, read-only cgroup view; heavy lockWAIT0;
root120/inner180/outer240/coordinator270/driver300second deadlines. HOST74/75had
233/234unchanged host root/cgroup samples; four loops each detached and exact
fixture/namespaces/FDs/mounts/owned lock absent. All four independent cleanup audits
exit0/empty stderr. Final75closure rechecked all current graph/source/config/
payload/private copies after both audits; freeze released. Closure
`/tmp/task8-host75/closure.json` SHA
`4d80376c3818ba87e310a834362fe4b18a04ca3d6ace2a7e05a2b6f150adb921`.
Never replay either exclusive operation merely to observe it.

Remaining: real consumer CLI/engine and ordinary writable permit-serving; full new
controller/semantic R5/original-BASE review; normal commits/exact-SHA canonical gate;
provider billable bounds and isolated restore/prune; registry-specific Slack alerts
and independent five-minute missed-monitor watchdog; operational enrollment and all
24scenarios. Four authoritative task boxes remain unchecked. No provider experiment,
Slack/support message, live safeguard activation or product migration occurred.
Archive `/tmp/task8-upload-response`, native archives `/tmp/task8-host74` and
`/tmp/task8-host75`; final cover `/tmp/task8-upload-response-covering.json`.

## Current native consumer-engine pulls — 2026-10-31T05:01:06.719999+00:00

HOST76 executed unchanged current75bundle da7f,282graph/95native/395selected.
Four actual managed OCI index publications, three promotions, matching backup,
exact eligible retirement/API unlink/offline GC and retained closure passed. Two
independently empty bounded private Docker VFS stores pulled amd64/arm64, checked
selected configs/diffIDs and unpacked two layers/expected files each. Both daemon
cleanups terminal,zero failures. Six untagged platform children and shared layer
remained; three eligible manifests retired. Kube/consumer-history/provider and
eight-day retirement clock remain modeled. This closes current-bundle engine
pulls, not actual installed consumer inventory, fixed maintenance CLI continuation,
ordinary writable permit-serving/recovery activation or live adoption.

Run117.876seconds,exit0/no timeout,empty stderr;227host root/cgroup samples unchanged.
Same896MiB/root reserve/WAIT0/private namespaces/read-only cgroup/deadlines. Both
independent exact cleanup audits0/empty stderr; four loops detached, fixture/
namespaces/processes/FDs/mounts/backing/lock absent. Current graph/config/payload/
private copies rechecked after both audits; freeze released. Closure
`/tmp/task8-host76/closure.json`,SHA
`c51cccf3f197e61340992177f2c2ec4121bcee8f87167a0892e5f30d76ee913c`.

No source changed after2655/0/11241fleet suite and runtime/test lint0/141+0/180;
all395source pins rechecked. Full controller/R5/original-BASE review, fixed CLI and
writable-serving continuation, commits/exact-SHA gate, provider budgets/restore-prune,
registry-specific alerts/watchdog and adoption remain. Full17requirements/24scenarios,
7/11reviewed and four authoritative tasks incomplete. No notification, provider
experiment, support message, live activation or migration. Detailed scope/packet in
verify.md. Current cover `/tmp/task8-consumer-native-covering.json`.

Manifest `/tmp/task8-host-namespace-proof-manifest-76.json`,SHA
`1ab243960751dc83d8a4462f1e96939e4feb79a4c81beb7aec14d3c224e60c95`;
driver SHA`1f2003a899e6cbb58a8a979be15084bdc8b3badc731d666e057f2a3ccf99a86a`.
Derivation from75: native host/API bytes and282input graph unchanged, outer only
EXPECTED literal, inner only success label, workload only prove-index argv and
removal of upload selector. All four default filesystem geometries and every
bound/deadline unchanged. Twin75builds are reused only after full input/config/
compiler/resolution equality checks and private snapshots, not silently rebuilt.
No source runtime change, so no new production guard or R5comment introduced.
No host Docker socket, cgroup writes, process migration, container execution or
product data involved. The actual engine pull does not independently prove the
synthetic consumer/history inventory or current-plus-two versus newest-ten rule.
Guard decision records describe desired mode, not continuous serving or ACK proof.
Historical34same scenario remains distinct from this current-bundle execution.

Native stdout SHA
`27af001e54754d3fe0d55fdc80a109753a6fd8003cd71260d1cabf064780dcb2`.
Owned fixture `/var/tmp/puni-task8-proof-087dba7a2d264ce4` was removed; exact
outside lock/runuser/wrapper/lifeline identities absent. Root reserve remained
above20GiB. Worker/parent independently verified their declared observation scopes;
worker scans all process mount views, parent its observer view and descriptors.
All required native and audit operations are terminal. Never replay76for observation.
The full repository exact-SHA gate and formal original-BASE review remain unrun.

## Fixed serving CLI runner: local completion proof — 2026-10-31T05:15:48.884504+00:00

Added `registry-serving-cli.fixture.ts` and its eight-case real-process test suite.
The fixed runner selects only installed status or journal-reopen binaries as
UID/GID59001, with fixed paths/owner/environment and a10sdeadline. Its completion
waits for the exact detached group and both bounded pipes, cancels on stream
failure and preserves ordered terminal/stdout/stderr failures. Normal stdout2MiB
and stderr64KiB bounds are tested with actual overflows; failed/late streams are
explicitly modeled in three cases. No captured output is logged.

Thirteen actual source removals each failed its named test; final series after
all test typing/matcher corrections is `counterfactuals-final/proofs.json`.
Source restored; five adjacent Proof comments recover the exact first-series
mutation-tested body when removed. Fresh owning32pass/0fail/106assertions/5files
on397stable inputs; runtime lint142files/test lint181files each0errors/0warnings;
library/spec types,two-source format and11CLI builds pass. All11CLI bytes equal
predecessor. Prior full2655fleet suite covers the unchanged original395inputs;
it was not rerun for this previously unused fixture runner. Actual75/76native
282graph/95sources/config/395selected pins still match. The new runner is NOT yet
imported into that native bundle or called by production/native serving.

Canonical detail and next packet constraints: verify.md, “Fixed serving CLI runner”.
Archive `/tmp/task8-serving-cli`; cover `/tmp/task8-serving-cli-covering.json`.
No new native rehearsal/provider experiment/Slack notification/support message/
activation/product migration. Installed CLI execution and ordinary post-maintenance
writable serving remain unverified. Full17requirements/24scenarios,7/11reviewed,
four incomplete tasks and original-BASE/full controller/R5/gate obligations remain.

Initial module-absent RED was a collection error and is not claimed as the final
behavioral RED. An explicit unimplemented completion scaffold then gave0pass/5fail
at actual output/exit/terminal assertions with exact local-child rescue afterward.
The implementation initially gave2pass/3fail because the test incorrectly treated
Bun exitCode:null as live after SIGKILL. Actual awaited exit137, signalCodeSIGKILL
and process-group absence proved terminal cleanup; tests now use those observations.
Later errored ReadableStreams also rejected cancel, as required by the existing
readRegistryBytes read-plus-cancel AggregateError contract. Tests explicitly retain
those nested identities and ordered terminal/pipe causes rather than weakening the
stream reader. Circular test subprocess inference and ArrayBufferLike typing were
corrected without runtime changes; three lint-invalid awaited rejection matchers
became explicit fulfilled/rejected observed states. Final all-selected checks cover
these corrections with no suppression or production unchecked cast.

The thirteen actual variants remove terminal await, stdout bound, stderr bound,
stream-failure cancellation, compound refusal, compound order, compound cause,
terminal refusal, late stdout refusal, late stderr refusal, stdout observation,
stderr observation and caller cancellation. Each records a named assertion failure,
not a collection/timeout error; the exact source is restored in finally. Final
counterfactual series repeats all thirteen after the final test changes. Five
Proof comments document observed scopes; this is completion-layer evidence only,
not complete fixed-runner timer/argv/installation or native caller R5 certification.
The normal installed binary paths and10srunner timer still need the actual owned
fixture execution. The child helper uses the existing native group/reaper contract;
local tests start no grandchildren, while its existing process tests remain included.
All local child operations and validation sessions are terminal; no privileged job
was launched this slice.

Next implementation: a separate fixed `prove-serving` native route, rather than
adding work beyond the120sroot deadline of the already117.876s index-engine drill.
Use current actual fixture initialization/bootstrap backup and a protected managed
seed, stop its guard, then another actual verified backup. Cold-start the ordinary
guard and establish POST405 before any reopening. Install manifest-bound ordinary
status and journal CLI artifacts from fresh standard builds, run them as59001,
require status to match independently read canonical identity/revision/fence/backup,
then issue explicit reopen with that exact revision. Wait for actual writable mode
and publish fresh managed index content, checking canonical completed ownership,
retained seed closure and final status. This establishes post-maintenance ordinary
serving; it does not substitute for Task11desired-state recovery-volume activation.
Kubernetes/consumer/history/provider remain explicitly modeled in the owned fixture.
Do not clear unresolved publication to start maintenance or open production backup
admission. Extend actual fixed caller/cleanup tests, supply local refusal/removal/
await/reporting proofs, freeze the complete actual new graph and private copies,
then execute a new packet with all existing896MiB/root-reserve/WAIT0/private-namespace/
read-only-cgroup/deadline bounds and both audits. Do not widen bounds or replay75/76
for observation. Include added ordinary CLI bytes in the existing256MiB runtime cap;
verify capacity from actual bytes rather than assuming it fits. Complete full native
controller/R5/original-BASE review and exact-SHA gate before installed activation.

The latest safe Slack-only status was05:02:23Z, unchanged running container,
12completed requests,0failed,0active alerts; no secret read or new notification.
Evidence prefix `/tmp/puni-slack-status-safe-20261031T0503` (filename label only;
authoritative checkedAt is05:02:23Z). No Slack read/send scope was added.

## Ordinary CLI serving rehearsal and independent Task8 findings — 2026-10-31T06:07:08.512640+00:00

The fixed serving runner now also selects the ordinary backup CLI, with a90s
backup child deadline inside the unchanged120sroot proof; status/reopen remain10s.
It supplies no path/owner/environment from caller input. Normal backup picks a new
operation UUID, so the bootstrap operation is never reused. Its local protocol
negative first observed2pass/1fail against the old status/reopen-only selector.
The new full controller initially0pass/39fail. Additional missing seed-closure/
backup-revision/target/fence/verified-pair tests observed43pass/6fail before their
checks; final controller has61modeled-native cases, routes6 and CLI runner11.
Root route RED1pass/5fail preceded exact prove-serving admission, direct-action
selection, awaited controller and mounted cgroup cleanup. Bootstrap Kubernetes,
consumer/history and provider remain modeled; schemas, completion and diagnostics
are actual in local controller cases.

All33actual controller assert-call removals and11route/await/guard-cleanup/read-loop/
report/binary-selection variants fail named tests; source restored. A first seed-
protection removal still passed because a later same-stage consistency check masked
it. The corrected witness removes protection consistently from every modeled state
and asserts backup never starts; the complete final33series then failed each named
negative. These are33whole assertion calls, not33distinct/exhaustive semantic guards.
The original13CLI completion variants transfer only to its byte-identical prefix;
new wrapper action/timer/caller terms are separate.42adjacent Proof comments bind
observed scopes. Initial comment/edit preparation refused ambiguous indentation;
partially added comments were stripped, exact source hashes checked, then anchored
placement applied. Initial lint caught import order, nested-catch cause placement,
nullable test-state inference, unnecessary async and unsafe-finally test release.
Fixes use no suppression: ordered failure aggregation now occurs outside the inner
reporting catch, explicit missing-state type remains, modeled owners return promises,
and release validation happens before finally. Final33+11series covers corrected
runtime and tests; final comment-only wording transfer is recorded separately.
Two formatting attempts used the wrong cwd and refused; root-cwd formatting and all
final checks passed. None of these initial failures is hidden as a passing check.

Fresh owning145pass/0fail/523assertions/6files. Complete fleet2733pass/0fail/
11494assertions/183files,271.44s, ended2026-10-31T05:44:25.809732Z, with all400selected
inputs unchanged. Selected lint143runtime/183tests0errors/0warnings; additionally
whole-source lint396TypeScript files0errors/0warnings, all396pins unchanged. Both
tsc projects,six-source format and11CLI builds exit0. All11standard release bytes
are unchanged from predecessor. Full exact-SHA repository host gate remains unrun.

Initial native build twinned host/API and three standalone CLI entrypoints, then
correctly REFUSED because standalone CLI bytes differ from the normal11entry release
build. No host execution occurred from those artifacts. They remain immutable as
unused diagnostics. Two complete standard11entry builds then matched every checked
release output and their input graphs. The actual rehearsal installs those exact
standard backup/status/journal outputs, not the standalone substitutes. Host native
bundle `e6351b0654d5ae713fdd548159bdb1cc740d34d0b96b9671422b0c4bee47d977`,
1302818B. Actual union302graph inputs/115native sources/400selected inputs, including
all standard-entry influences. Standard3CLI payload1627456B is counted within the
existing256MiB runtime cap. API remains10546B/29fb02f9a653984b1f97ab24a4660b09b5ca7c0e11dd17789a8f8185b116d052.

HOST77 manifest SHA
`c08f897b1f964b26818e349002671de7e75f34eb74a45095b159dd722e97413f`;
driver SHA`6d6bf8c2af34e0986d7760208924910f0d81cd9d6703cd405678617d98ff0b44`.
Derivation from76: outer only EXPECTED, inner success label plus three fixed ordinary
CLI installs/counts/receipts, workload only prove-serving argv. All four default
filesystem recipes and every bound/deadline unchanged. Terminal exit0/no timeout,
90.63776711607352s, empty stderr. Actual ordinary backup completed a new matching
canonical operation/snapshot pair; cold actual ordinary guard POST405 preceded
ordinary journal CLI reopening at the independently read exact revision. Actual
writable guard, fresh completed managed index publication and all7protected+7fresh
digest reads passed. Actual standard CLIs/authority/Distribution/guard/mounts/restic;
Kube/consumer-history/provider modeled. This closes ordinary post-maintenance serving
in the owned fixture, not recovered-volume desired-state activation/live adoption,
nor the independent review gap about production per-platform OCI client pulls.

Same four ext4 loops320MiB+runtime256MiB+Docker runtime256MiB+auxiliary64MiB=896MiB,
21GiBroot preflight/20GiBretained, WAIT0heavy lock, private PID/mount/network/UTS/
cgroup, loopback-only/read-only cgroup and120/180/240/270/300sdeadlines.
Actual runtime244368202B<256MiB and Docker174875616B<256MiB. All172host root/cgroup
samples and after-state matched; four loops detached. Both independent audits
exit0/empty stderr verified exact fixture, namespaces, processes,FDs,mounts,backing
and lock absent with root reserve retained. After both audits, all current302graph/
115source/400selection/config/payload/private copies rechecked; freeze released.
Closure `/tmp/task8-host77/closure.json`, SHA
`b5dc9bf3460d4733ae731401ed63cc1afc0e2ae43c4dacd76de9d87bbdb9dca8`.
Never replay77for observation.75upload/read-only restart and76engine pulls remain
historical executions on the preceding da7f bundle, with their scoped source/evidence
bindings; do not silently transfer complete execution to e635.

A clean-context read-only reviewer was dispatched under
[requesting-code-review](/home/df/.codex/skills/requesting-code-review/SKILL.md).
Parent remains sole editor. The initial partial pass was continued on the same
reviewer; its final covered production maintenance/runtime/root control/process/
recovery/backup-lock/authority/journal/inventory/policy/publication and selected
installer/deploy contracts, but not every untracked test/fixture/compound predicate
or original caller. Verdict: six Important findings; NOT Task8 approval.
`/tmp/task8-serving-host/review.json` records scope and pending findings:

1. Stage/validate required maintenance enrollment before authority bundle replacement.
2. Resolve actual hostPath/storage identities so pending aliases cannot evade writer
   exclusion; test actual stopped action. Existing production classifier RED uses a
   real temporary symlink: directBlocked=true,aliasBlocked=false,same canonical path
   and device/inode=true; exact fixture removed. It launches no Kubernetes pod or
   root maintenance action, so the full pending-writer race remains to prove.
3. Add the approved bounded uncached OCI client pull per retained platform to the
   production success path; fixture Docker pulls and HTTP closure reads cannot
   substitute or weaken that requirement.
4. Preserve primary+cleanup failures in maintenance census/delete/retained/recovery
   finally blocks, recovery verifier, and runtime-open catch; add actual caller
   dual-failure/cleanup-omission negatives.
5. Persist operation-bound before/after reclaimed-byte/free-inode measurements before
   restoration; current final measurement is discarded.
6. Execute the actual isolated installer guard against UID/mode/link/checksum/path/
   missing/aliased artifacts and installed bundle faults, plus removals reaching a
   safe modeled grant. Existing static stat-pin/order/string assertions are not
   production-path predicate proofs.

For the alias finding, the reviewed [upstream hostPath setup](https://github.com/kubernetes/kubernetes/blob/v1.35.0/pkg/volume/hostpath/host_path.go)
rejects backsteps. Therefore a textual dot-dot example is not accepted as evidence
of a mountable writer; the actual local reproduction uses an ordinary symlink with
no backstep. This is upstream-source context, not a claim about the exact installed
cluster version or an executed kubelet mount. Canonical paths alone also do not
settle bind aliases, mutable paths or ancestor exposure; inspect actual callers,
node selection and filesystem observations before implementing the fix. Preserve
ordinary unrelated hostPath workloads rather than substituting a perpetual block.

Four sampled historical plain logs still need current source-bound receipts or
fresh removal revalidation: repository-status,upload-size,residual-eligibility and
receipt-capacity logs listed in review.json. A green test log alone is not transfer
proof. Full original-BASE semantic/R5/extraction/directive review and new caller/
timer/cleanup/reporting negatives remain. All six review issues must be fixed and
re-reviewed before normal commits/exact registry SHA gate. Full17requirements/
24scenarios,7/11reviewed and Tasks4.2/4.3/5.1/5.2 stay incomplete. Provider billable
bounds/isolated restore-prune, registry-specific alerts/independent watchdog and
operational adoption remain. No provider experiment, Slack/support send, live
safeguard activation, product migration, push/PR/merge occurred.

Archive `/tmp/task8-serving-host`; current cover `/tmp/task8-serving-host-covering.json`.

## Pending pod filesystem identity and unresolved claims — 2026-10-31T06:47:25.449508+00:00

The actual root stopped-action caller now awaits filesystem identity classification
for ordinary and enrolled recovery storage. Literal PVC/path declarations are
separate from physical writer absence. Pending and unscheduled hostPaths are
resolved with real device identity (including capacity-consuming siblings) and
canonical ancestor device/inode tuples. A host-root magic-link alias on another
device is covered; assigned-other-node hostPaths are not sampled locally.
Missing/unreadable metadata, relative paths and malformed node evidence refuse.

A follow-up review found alternate PVCs could name PVs with the same physical
backing. Unknown target-node or unscheduled PVCs and generic ephemeral claims now
refuse with an explicit backing-path-evidence error. This is a deliberate
conservative limitation: even an unrelated local PVC blocks maintenance until its
backing paths are proven; no general PV resolution or arbitrary root API read
capability was introduced. Installed registry claims remain blockers across nodes.
Assigned-other-node unfamiliar PVC/ephemeral claims remain outside the local audit.

The production stopped-action regression was RED before the identity fix: 1pass/
8fail. The first direct-path GREEN was19pass/0fail, then focused27pass. Alternate
PVC RED was1pass/2fail; generic ephemeral RED1pass/1fail. Final focused control is
32pass/0fail/102assertions across3files. Archive `/tmp/task8-pod-writers` contains commands,
stdout/stderr, terminal receipts, source pins and isolated mutation scripts.
`removals-final/proofs.json` has18named removals plus positive control;
`additional-removals/proofs.json` adds7node/caller/recovery/ancestor/all-store
removals. All25each failed the intended test, exit1. The control production hashes
match canonical source exactly (`removal-source-binding.json`); these are named
proofs, not an exhaustive inventory of distinct semantic R5 checks. Adjacent Proof
comments name observed faults. The earlier pre-comment16proof transfer is explicit
in `proof-comment-transfer.json` and its two exact diffs; refreshed final proofs
bind executable bytes including comments directly.

Corrections retained: a removal-runner initially misclassified the test's displayed
source line as a harness error; v2 matched actual error lines and completed. A
schema-field omission did not remove ephemeral recognition because unknown fields
are retained; the actual ephemeral collection removal failed as intended. Initial
lint/typecheck caught test import/assertion style and an invalid fixture literal
receipt path; these were corrected before the final checks. Failed preliminary
runs remain archived, not counted as successful proofs.

Final complete fleet run on404selected stable inputs:

```text
and closes before reporting: aggregate [0.41ms]
(pass) partial census preserves exact failure and closes before reporting: success [0.61ms]
(pass) partial census preserves exact failure and closes before reporting: close [0.54ms]
(pass) partial census preserves exact failure and closes before reporting: report [0.57ms]
(pass) partial census preserves exact failure and closes before reporting: evidence [0.74ms]

 2755 pass
 0 fail
 11575 expect() calls
Ran 2755 tests across 185 files. [277.40s]
```

After that full run, the test factory was mechanically renamed pod→createPod to
follow R2 and formatted. Exact replacement+Prettier reproduction is pinned in
factory-transfer.json; focused32tests, test lint and full spec typecheck were
rerun on the renamed file. Production bytes are unchanged.

All400owning TypeScript files lint with0errors/0warnings. Production/test types,
six-file format and11normal CLI builds pass. Only
`registry-maintenance-host-cli.js` differs from the preceding serving-host release;
the other10CLI artifact hashes are unchanged. These are local checks, not the
required final exact-SHA host gate. HOST77 remains closed historical proof on the
preceding source graph; its root-action artifact is not the new host bundle, so
no full native execution transfer or activation is claimed.

The same read-only reviewer independently accepted both the direct hostPath fix
and the conservative unknown-PVC follow-up, while explicitly limiting the review
to this writer-exclusion slice. Actual Kubernetes/PV/bind mounts, mount auditing,
root authorization and process census are modeled in the stopped-action worker;
the classifier itself and symlink/proc filesystem metadata are real. No live pod,
root action, registry restart, safeguard activation or product migration occurred.
The wider task8review is not approved. Five Important findings remain: authority
installation ordering, bounded actual per-platform client pulls, preservation of
primary+cleanup failures, persisted measured reclamation, and actual Ansible
installer predicate/removal proofs. Full original-BASE/caller/extraction/semantic
R5 review, four historical source-unbound logs, normal commits and canonical
exact-SHA host gate remain. Task8and Tasks9–11 remain unchecked; full goal is still
17requirements/24scenarios with7/11reviewed slices.

Slack status was read-only checked at2026-10-31T06:30:59.456511Z: existing retained
Alertmanager identity running,12completed Slack requests,0failed,0active alerts.
No notification was sent and no webhook was read. Generic Slack adoption18a is
already operational; registry-specific delivery and independent five-minute
missed-monitor watchdog remain Task10. No Victoria/Netdata/provider/support-send
change occurred. Task9billable bounds/retention/prune/isolated restore and Task11
fresh enrollment/rehearsal/all24scenarios/final host gate remain.

## Authority configuration staging and fixed runtime alignment — 2026-10-31T07:43:40.078434+00:00

The authority role now requires maintenance enrollment, stages its runtime/bundle
and nonsecret configuration in a private root directory, checks candidate artifact
metadata and hashes before executing them, and invokes the candidate's read-only
`--validate-installation` mode. Only a verified acknowledgement permits publication:
configuration precedes active artifacts. Candidate cleanup runs through `always`.
The maintenance installer no longer rewrites that enrollment. Its new
`installed-authority.yml` preflight requires the pinned runtime/bundle and exactly
matching root-owned configuration before staging maintenance artifacts, then invokes
the same read-only parser. This is trusted-file/schema validation; journal, mount,
controller and current runtime identity binding remain required by Task11. Publication
uses ordered individual file copies; it is not a transactional release switch.

The same read-only reviewer accepted the missing/malformed-config ordering fix and
found a runtime mismatch: authority accepted any declared SHA while maintenance and
the backup worker required Bun SHA10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235.
A functional alternate Bun (inert ELF footer) actually passed candidate validation
and installed before this correction. Authority now requires that exact shared hash
before writes. Wrong-runtime RED was Ansible0/refusal-test failure; GREEN was
Ansible2, identical active files and usable prior fixture. Reviewer confirmed this
fix, with no new concrete issue in that narrow pass. This is not Task8approval.

Actual Ansible2.21.3 and Bun1.4.4 execute the authority role inside an ordinary user's
private root user/mount/network namespace, with read-only host root and512MiBusr
plus small/etc/run/root tmpfs limits. The preceding fixture command is synthetic;
no live authority/journal/pressure service, registry, real root grant or Kubernetes
resource is exercised. Baseline missing/malformed configurations both installed
unexpectedly (Ansible0) before the role fix. A valid candidate was RED against the
old authority's unsupported validation mode before the CLI implementation. Maintenance's
actual enrollment/runtime/write component also accepted a differing malformed
proposal before removing its config writer and adding the preflight.

Final source-bound matrix `/tmp/task8-installer-config/native-final3/proofs.json`:
23cases on the exact normal-build authority artifact,13expected successful tests
and10intentional refusal-test failures after check removal, all matched. Six base
cases cover missing/malformed/valid authority, wrong runtime, and matching/differing
maintenance preflight. Seven guarded cases cover isreg/UID/GID/nlink/mode/checksum
stat-fact faults and wrong command acknowledgement. Each selected predicate removal
then allowed Ansible0 and made its test fail. Additional omissions remove candidate
validation, maintenance configuration binding and `always` cleanup; the latter
leaves an actual candidate directory and fails the installation test. Metadata
faults explicitly change observed Ansible facts, not kernel inode ownership. The
maintenance component omits other maintenance prerequisites and does not prove the
full sudo installation. The direct CLI argc removal (`cli-final/`) independently
fails the additional-arguments test. These11named removals plus runtime RED/GREEN
are scoped proofs, not an exhaustive semantic R5 inventory.

The noncached Nx target `tool-fleet:rehearse:registry-installer` was actually run:
namespace valid installation succeeded,8s/cache0of1. Use `--enrollment`, because Nx
consumes `--configuration` itself. Required Ansible interpreter/paths, fixture and
new output directory are explicit; missing tools do not skip. `registry-installation.native.py`
contains source pins/deadlines/read-only-root checks and candidate/fault observations.
The shared installation fixture was extracted from the existing parser tests; the
new CLI tests verify invalid validation arguments refuse before trusted-state reads.
Runbook and technical design document these boundaries without changing the original
17requirements/24scenarios or declaring live readiness.

Final fleet validation,429stable inputs including all402owning TS files and role
inputs:

```text
eporting: aggregate [0.38ms]
(pass) partial census preserves exact failure and closes before reporting: success [0.38ms]
(pass) partial census preserves exact failure and closes before reporting: close [0.35ms]
(pass) partial census preserves exact failure and closes before reporting: report [0.37ms]
(pass) partial census preserves exact failure and closes before reporting: evidence [0.28ms]

 2757 pass
 0 fail
 11581 expect() calls
Ran 2757 tests across 186 files. [281.91s]
```

Owning24/0/57assertions/4files; full402TS lint0errors/0warnings; production/test types,
10file formatting, Python syntax and11normal CLI builds pass. Final authority bytes
are identical to initial GREEN artifact bytes. Registry playbook syntax passes
using the repository Ansible configuration and dummy inventory; host-pattern warnings
are expected there and do not prove live host matching. Required canonical exact-SHA
h2/h4host gate remains later, after remaining review issues/normal commits. No such
gate, live safeguard activation, product migration, push/PR/merge or notification was
performed this turn.

Corrections are retained: preliminary namespace mountpoint/filename setup failed
before the actual RED cases; loop callback failures require `failed:` as well as
`FAILED!`; the first validation input list named a nonexistent ESLint config and no
checks started until corrected to eslint.config.js. The first syntax call omitted
the repository role configuration; the configured final invocation passed. Nx's
reserved configuration flag was renamed as above. Final native preflight refused
below its1GiB scratch reserve while the live fleet suite ran; the reserve stayed
unchanged. After the suite, zero-only blocks in the generated alternate binary were
reclaimed with unchanged SHA/size, and11identical immutable build copies were
hard-linked after verifying bytes, freeing6MiB without changing worktree or earlier
sealed artifacts. A default-sandbox network-namespace attempt then failed at loopback
NETLINK_ROUTE setup before worker execution; authorized private-namespace execution
outside that syscall sandbox completed all23cases. No automatic approval rejection
occurred. Native failed attempts were terminal and retained, never counted as passes.
The per-run build directories are immutable; do not rebuild in-place through their
verified hard links. Local disk remains close to the scratch reserve; do not delete
broad archives or weaken admission. Prefer a controlled gate-host workspace or
reviewable capacity repair if later work cannot fit.

Four Important findings remain: bounded actual per-platform client pulls; ordered
primary+cleanup error preservation; persisted measured reclamation receipt; and
actual installer sudo/bundle predicate+removal proofs (including kernel metadata and
safe grant), with new installed-authority/final artifact predicates in that remaining
R5 inventory. Full original-BASE/caller/extraction/semantic review and four historical
source-unbound logs remain. Tasks4.2/4.3/5.1/5.2 stay unchecked;7/11reviewed slices.
Task9billable bounds/retention/prune/isolated restore, Task10registry-specific Slack
and independent watchdog, and Task11fresh capacity/enrollment/all24scenarios/exact
host gate/activation remain. Support outbound approval remains pending; do not send
or reask because time passed. No new Slack message or secret/helper/key read occurred.

## Operation and cleanup failure preservation — 2026-10-31T08:42:21.210290+00:00

`completeRegistryOperation` records operation and cleanup outcomes separately. It
awaits cleanup before settling, rethrows either sole value unchanged (including
undefined/null/string/nested AggregateError), and aggregates dual failures in
operation/cleanup order with the original operation as cause. Successful values
are preserved. All five maintenance server lifetimes, the recovery verifier's
server lifetime and runtime-open error cleanup use it. Callback closures preserve
the close receiver. Successful runtime open still transfers ownership to its caller;
no cleanup failure can reach success-only service restoration.

The initial actual-caller RED reached all9target dispatch paths and returned only
the cleanup sentinel:0pass/9fail. First GREEN72/0 was expanded to150cases over9paths
and16outcomes plus6actual malformed-JSON/lost-owner branches. The matrix covers both,
either and neither failure, sole and dual nullish/string/nested values, a gated
close and real file/socket cleanup. The initial schema4 snapshot and restored-file
parser/projection are actual code; ongoing authority/barriers/inventory/plans/root
connection and physical mount observations are modeled. These are caller/error
control-flow proofs, not live journal authority, root transport, mount or registry
maintenance readiness. Separate existing real journal/HTTP lifecycle/recovery tests
remain in the owning run.

Final scoped removals: `/tmp/task8-close-errors/removals-final/proofs.json` has one positive
36casecontrol and21individually failing variants. Twelve cover omitted work/cleanup,
unawaited close, missing/reversed members, missing/replaced cause, wrapped/dropped
sole work/cleanup failures and discarded return values. Nine restore legacy finally
semantics individually at five maintenance callers, recovery and three runtime
serve-action paths (seven source call sites). Each mutant exits1with exactly its
intended test failing; no module/setup error was counted. Current four production
source hashes match the positive control. Adjacent Proof comments name observed
faults. This is a named proof set, not an exhaustive semantic R5 inventory.

The first mutation run found a redundant sole-work branch: the failure-array fallback
still rethrew the same value after that branch was removed. The helper was simplified
to explicit operation/cleanup unions, and all21variants then failed correctly. Early
rewriting refused an unexpected match count before editing callers; the exact five
close blocks were then selected by indentation. Initial lint caught fixture void gate
arguments, a closure boolean narrowing and Promise.reject(unknown); these were fixed
with undefined gates, observable lifetime state and a synchronous rethrow callback.
Preliminary failed attempts remain archived and are not counted as successful proofs.

Final validation on432stable inputs/all405owning TS files:

```text
eporting: aggregate [0.36ms]
(pass) partial census preserves exact failure and closes before reporting: success [0.36ms]
(pass) partial census preserves exact failure and closes before reporting: close [0.49ms]
(pass) partial census preserves exact failure and closes before reporting: report [0.50ms]
(pass) partial census preserves exact failure and closes before reporting: evidence [0.32ms]

 2907 pass
 0 fail
 12877 expect() calls
Ran 2907 tests across 187 files. [330.30s]
```

Owning183/0/1481assertions/5files includes all150new cases. Full405TS lint0errors/
0warnings; production/test types,six-file format and11normal CLI builds pass. The
changed CLI artifacts are activate/recover/retire/status/backup; the other6are byte
identical to the predecessor. Historical HOST77remains proof on its prior graph,
without automatic current-client execution transfer. Final exact-SHA canonical h2/h4
host gate remains later. No live root/registry/provider operation, activation, product
migration, notification, secret/helper/key read, push/PR/merge or normal commit occurred.
The independent read-only reviewer accepted both original integration and the final
two-union simplification, finding no new concrete defect in this narrow slice. That
review does not approve Task8as a whole.

Three Important findings remain: actual bounded uncached per-platform OCI client
pulls, persisted measured reclamation receipt, and actual installer predicate/kernel
metadata/safe-grant proofs. Full original-BASE/caller/extraction/semantic R5 review
and the four historical source-unbound logs remain;7/11reviewed slices and all four
task boxes4.2/4.3/5.1/5.2stay incomplete. Task9billable provider bounds/retention/
prune/isolated restore, Task10registry Slack/independent watchdog and Task11fresh
capacity/enrollment/all24scenarios/current artifact gate/activation still remain.
Full goal remains17requirements/24scenarios. No provider experiment or generic Slack
notification was replayed. Local scratch remains near reserve; preserve old evidence
and immutable hard-linked prior build outputs, and do not weaken admission or clean
broad directories. Support outbound approval remains pending without time-based retry.

## Measured reclamation before restoration — 2026-10-31T09:26:25.014238+00:00

The held journal authority now records allocated bytes, inodes, host root free bytes,
filesystem dimensions and observation time before retirement planning and after offline
collection plus retained-content verification. Each sample names its acknowledged
journal revision. The completed receipt binds the same operation, original store,
verified snapshot and exact persisted plan hash. Reclaimed byte/inode values are signed
before-minus-after differences: growth is reported as negative, never clamped away or
inferred from planned manifest/tag removal. The baseline is persisted before collecting
the projected plan census, so its revision change cannot stale that plan.

Only the authority's dedicated measureReclamation method can create or finish this
receipt. Wrong phases, duplicate baselines, invalid dimensions/counters, stale or
backwards observations and changed filesystem dimensions refuse. Generic evidence
recording cannot invent, replace or erase it. Canonical reads reject corrupt lineage,
ordering, deltas and plan binding. The final measurement must be no older than sixty
seconds and at the exact immediately preceding authority revision before verified
maintenance/restoration. Both the maintenance caller and fixed root restore-service
entrypoint enforce restoration evidence; the root check precedes storage selection
and Kubernetes adapter creation. File/directory fsync failure prevents restoration.

The new optional receipt admits pre-measurement, backup and older schema4 evidence
without fabricating measurements. Ordinary retirement cannot authorize restoration
from absent or incomplete evidence. Independently restored storage instead requires
the existing exact verified recovery receipt; it does not claim GC savings from the
preserved original volume. New source-owned contracts live in registry-reclamation.ts
and the maintenance/session/restoration JSDoc; no new operational approval is inferred.

Actual caller RED: two retirement cases reached offline collection without their
baseline and failed the expected missing-measurement assertions. A second boundary RED
showed missing evidence reaching the modeled first privileged effect because the
check ran after adapter creation; moving it ahead of all host adapters fixed that
ordering. Preliminary setup/cwd errors and the initial wrong fixture installation
path/recovery-state label are archived and excluded from successful proof counts.
The fixture now uses the existing fixed journal path and valid unenrolled state.

Final removals: `/tmp/task8-reclamation/removals-final2/proofs.json` contains one
50-test positive control and35individually failing mutants, each exit1with exactly
one intended test failure and no counted setup/module error. Five production source
hashes and402unchanged supporting TS inputs bind the matrix to the final copied
source tree. Named removals cover omitted baseline/final measurement/acknowledgement,
measurement and duplicate-baseline phases, observation age, generic record tampering,
verification/caller/root/canonical-read gates,16lineage predicates, restoration
age/revision/capacity, invented deltas and measurement parser/usage consistency.
These35named removals are not an exhaustive semantic R5 catalogue. Adjacent Proof
comments name their observed production-path faults; no canonical source was mutated.

The actual journal-backed tests cover50maintenance cases, including growth, failed
and slow measurements, fsync failures, erased/changed evidence,16completed-receipt
corruptions,2before-only corruptions, duplicate/premature sampling and expiry at both
verification boundaries. The isolated actual root action receives14receipt/clock
variants; its positive reaches a sentinel first trusted effect and negatives stop
before it. Kernel mount observations, physical GC and Kubernetes effects remain
modeled. The existing150cleanup cases retain their original exact failure/lifetime
assertions with an explicitly modeled new session method.

Final validation on434unchanged pinned inputs/all407owning TS files:

```text
eporting: aggregate [0.16ms]
(pass) partial census preserves exact failure and closes before reporting: success [0.37ms]
(pass) partial census preserves exact failure and closes before reporting: close [0.32ms]
(pass) partial census preserves exact failure and closes before reporting: report [0.28ms]
(pass) partial census preserves exact failure and closes before reporting: evidence [0.26ms]

 2949 pass
 0 fail
 13086 expect() calls
Ran 2949 tests across 187 files. [405.40s]
```

Owning lifecycle/recovery validation:

```text
(pass) partial manifest unlink refuses complete census before API and preserves failed authority [139.00ms]
(pass) held production recovery verifies matching staged journal and keeps original store fenced [160.79ms]
(pass) current newer backed protection survives projection before restored census [63.64ms]
(pass) current newer missing protection survives projection before restored census [59.61ms]

 252 pass
 0 fail
 1757 expect() calls
Ran 252 tests across 7 files. [98.91s]
```

Full407TS lint0errors/0warnings; production/test types, eight-file format and11normal
CLI builds pass. Changed artifact names versus the predecessor: registry-lifecycle-cli.js, registry-backup-worker-cli.js, activate-registry.js, registry-flux-reader.js, registry-reader-host.js, registry-maintenance-host-cli.js, registry-journal-cli.js, recover-registry.js, retire-registry.js, registry-maintenance-status.js, backup-registry.js.
All11artifacts changed. This does not transfer closed HOST77or
other historical native execution to the current full artifact graph. Exact registry
SHA canonical h2/h4gate and current native adoption proofs remain later.

The first frozen fleet run also passed2949/0/13086assertions/187files, but its fixture
contract did not pass production typing and one test condition needed lint correction.
Final checks and the supported removal matrix were rerun after those corrections;
only their final2receipts support this current-source validation claim. Earlier checks
remain diagnostic evidence. Read-only independent reviews found no concrete defect
in the scoped design/integration, without running tests or approving Task8as a whole.

Local free space fell to zero during unrelated filesystem activity, preventing a
sandbox launch. Read-only usage inspection completed; no old archives or other work
were deleted. Eight named completed logs from this turn were losslessly compressed,
with original/gzip hashes and38946bytes saved. Available space subsequently recovered
independently to over4GiB. The native fixture's1GiBreserve was never lowered; no native
rehearsal was attempted. The only remote action was a read-only h4temporary-capacity
probe. No live registry/root effect, provider experiment, Slack message, secret read,
product migration, activation, normal commit, push, PR or merge occurred.

Two Important Task8findings remain: actual bounded uncached representative OCI client
pulls per retained platform, and actual installer predicate/kernel metadata/safe-grant
proofs. Full original-BASE/caller/extraction/semantic R5 review and four historical
source-unbound logs remain;7/11reviewed slices and tasks4.2/4.3/5.1/5.2remain unchecked.
Task9billable bounds/retention/prune/isolated restore, Task10registry-specific Slack
and independent watchdog, and Task11fresh capacity/enrollment/all24scenarios/current
artifact gate/activation remain. Full goal still covers17requirements/24scenarios.
Support outbound approval remains pending without time-based retry. Next coherent
slice is real bounded per-platform client pull verification, then installer proofs.

Evidence archive: `/tmp/task8-reclamation`; planned covering closure:
`/tmp/task8-reclamation-covering.json`, predecessor
`/tmp/task8-close-errors-covering.json` SHA
f950e18d29a2e30ce776ae2a46b2f80af577599ad1f075e6d2c99414e0c219aa,28819pins.

## Real OCI client feasibility and root-action continuation — 2026-10-31T10:02:41.040360+00:00

The previous turn was PROGRESS: reclamation implementation/seal
`/tmp/task8-reclamation-covering.json`, SHA
5cbe226b4aa0e6f9926e7d33fa8c4f0f7cffc6cb75ffafa34d3afaabc11bf6d0,
29304pins. All predecessor pins were freshly verified before this work. No production
TypeScript, installation manifest, runtime artifact or task checkbox changed here.
The prior2949fleet tests/407TS lint/types/format/11builds remain evidence on their
unchanged code graph; the added design/evidence documents are checked separately.

Crane v0.22.1 official release checksums were downloaded and their checksum-file hash
verified against the primary release asset metadata. Exact extracted clients:

- linux/x86_64:8e75c326adb43b053cfd78b9b987663f8f4fe4557f4d3915905643f25c730992.
- linux/arm64:1799f559c299f068951822a5efe6689ebab6974f2054d5562e60798fa9db6a55.

Only x86_64was executed. The arm64client artifact is captured, not an execution claim.
The existing Distribution2.8.3image was fetched by its exact pinned manifest digest;
only the registry executable was extracted and matched the already-required
8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37hash.
No live image/registry/container was inspected or changed for extraction.

Two local setup attempts exited32before the OCI client ran: direct user-namespace
readonly bind remount and bubblewrap tmpfs-inode remount refused. Their host mount
and scratch audits found no leaks. A further isolated readonly-remount diagnostic
also refused; these setup diagnostics are not successful client or production proofs.
The scratch bounds were retained. The already-authorized h4host was checked fresh:
x86_64, namespace tools available and8,073,506,816temporary bytes available.

Exactly five explicit probe files (136,734,304bytes) were staged into a newly created
private root-owned h4temporary directory with per-file hashes and no collision
adoption. The stage required a remaining1GiBtemporary reserve. A transient service
limited the native fixture to512MiBmemory,128tasks,150seconds runtime and10seconds
stop timeout. The child ran in private mount/network/PID namespaces, with readonly
host root and a64MiB/4096-inode tmpfs. It had only its private loopback. The registry
served only synthetic fixtures from that tmpfs in readonly mode; the client used a
private synthetic authentication file, fresh OCI output per pull and no layer cache.

Actual native observations, all six expected:

| Case                                              | Client exit | Independently verified output                            | Expected |
| ------------------------------------------------- | ----------: | -------------------------------------------------------- | -------- |
| fresh amd64 index pull                            |           0 | selected manifest/config and all3blob hashes/sizes match | success  |
| fresh arm64 index pull                            |           0 | selected manifest/config and all3blob hashes/sizes match | success  |
| unavailable riscv64 platform                      |           1 | no successful layout                                     | refusal  |
| arm64 layer removed after earlier successful pull |           1 | no successful layout despite prior client success        | refusal  |
| config bytes corrupted under their old digest     |           1 | no successful layout                                     | refusal  |
| restored amd64 content, another fresh output      |           0 | selected identities and all3blob hashes/sizes match      | success  |

The namespace process audit found0remaining children; the parent mount audit found
no host mount leak, and the mountpoint exposed no surviving scratch files after
namespace exit. The transient service exited0in2.259seconds, using2.305CPU seconds
and reporting49.7Mpeak memory. A separate authenticated read-only audit checked all
five staged asset hashes unchanged, unit unloaded/inactive/MainPID0/no cgroup, no
owned executable process, no host mount and an empty scratch mountpoint. That exact
root directory was then removed only after checking its saved device/inode, file
set, stopped unit and absent mounts. Final receipt confirms0temporary artifacts.
No remote process, mount, unit or staged binary is left active for this probe.

Evidence is `/tmp/task8-platform-pulls`: release receipts, exact probe sources,
failed local setup diagnostics, h4stage/run/audit/cleanup logs and JSON. The probe is
explicitly throwaway feasibility. Its64MiBfilesystem is not a production capacity
choice, its tiny valid layers are not all-image/runtime-unpack coverage, and it does
not exercise current registry CLI adoption, installed sudo, retained lifecycle,
recovery activation or provider/Slack delivery. Do not transfer it to those claims.

The read-only reviewer recommended a sequential fixed root action after the existing
inventory server closes, rather than listener adoption or concurrent control routing.
It must own a fresh readonly server, client, bounded scratch and terminal cleanup;
derive complete physical platform coverage without root consumer-reader execution;
verify produced identities; and persist an authenticated coverage receipt required
by verified/restoration gates. The implementation continuation is recorded in design.md.
No production pull action, software installation or caller wiring was implemented
in this feasibility step. The actual-client Important finding remains open.

All17requirements/24scenarios and7/11reviewed slices remain. Tasks4.2/4.3/5.1/5.2
stay unchecked. Two ImportantTask8findings remain: production bounded actual
per-platform pulls and actual installer predicate/kernel/safegrant proofs. Full BASE/
caller/extraction/semanticR5 review, four historical source bindings, normal commits
and exact registry SHA canonical gate remain. Task9backup billable bounds/retention/
prune/isolated restore, Task10registry Slack/watchdog, and Task11fresh capacity,
enrollment/rehearsal/activation remain. No product migration, live registry action,
provider experiment, notification, secret read, normal commit, push, PR or merge.
Support outbound approval remains pending; no time-based retry is authorized.

Next step: implement the sequential root client action, real scratch admission and
durable receipt through ordinary and recovery callers, beginning with explicit TDD
negatives for missing/contradictory platform coverage and absent/stale completion.
Planned covering closure: `/tmp/task8-platform-pulls-covering.json`.

## Actual client executor components — 2026-10-31T11:29:03.895964+00:00

Classification: PROGRESS. The preceding read-only Slack status check did not close
any remaining registry requirement; this turn takes the next available safe action.
All17requirements/24scenarios and7/11reviewed slices remain. Tasks4.2/4.3/5.1/5.2
are unchecked; no production action, journal gate, installer adoption or live
activation is inferred from these component proofs.

Eight new TypeScript files implement and test `registry-client-layout`,
`registry-client-pull` and `registry-client-workspace`. The executor verifies its
root PID1 worker, private loopback, finite cgroup limits, actual readonly root mount,
inherited canonical FD3, pinned Crane artifact, independent enrolled ext4 scratch,
byte/inode admission and20GiBhost-root reserve. It creates fresh per-pull output,
private credentials and bounded temporary state, runs UID/GID59001 Crane with a
five-minute deadline and bounded discarded diagnostics, reaps its group, verifies
selected manifest/config/platform and all expected blob hashes/sizes, then closes
and removes the job. These checks exist; their complete negative/removal matrix
is still required before Task8approval.

The first actual h4executor run failed at the real Crane output: its image descriptor
adds `artifactType` from the image config media type. The pinned implementation's
[descriptor derivation](https://github.com/google/go-containerregistry/blob/v0.22.1/pkg/v1/partial/with.go#L309-L323)
explains the field. A regression was observed failing before allowing only supported
image config markers that match the verified manifest. Unknown/non-image and
mismatched markers still refuse. The failed fixture's outer loop-audit parser also
failed on empty `losetup --associated --json` output; subsequent audit uses the
complete JSON loop listing and exact backing-file equality, with no empty default.
Its assets were independently checked and the exact stopped workspace removed.

Read-only review found a privileged pathname-replacement race beneath UID59001-owned
scratch. A root-owned0711pool and anchored cleanup fixed the immediate parent race;
follow-up review found that returning a canonical pathname still let an ancestor
replacement redirect setup. The final implementation uses the held job FD for all
root setup, inherits that job as client FD4, and opens verification output relative
to that same capability. The authority lock remains FD3. Cleanup audits the tree,
uses no-follow opened directory descriptors and anchored unlink/rmdir, and retains
operation/cleanup failures through `completeRegistryOperation`. All opened descriptors
close on success or rejection. The caller still owes whole-filesystem/namespace
teardown if content ownership cannot be acknowledged.

Final h4run:11expected cases on a fully allocated64MiBext4image with16384inodes,
private mount/net/PID namespaces, readonly host root and only loopback, under a
512MiB/128-task/130-second transient unit. It exercises actual pinned Distribution2.8.3
and Cranev0.22.1x64, including amd64 and arm64 target images; the arm64 executable
was not run. Cases: fresh amd64/arm64/repeat success; client-exit-zero wrong selected
leaf refusal; missing layer after a prior success refusal; real artifact-owner and
scratch-mode drift; wrong scratch receipt UUID; blocked-client cancellation/reaping;
success after cancellation; and pool pathname replacement during executor setup.

The concurrent replacement was observed while the job was mode0700, before granting
client access. Actual pull/verification/cleanup completed through the held job;
the replacement directory's foreign sentinel was unchanged. The final unit exited0
in1.755seconds, CPU2.462seconds, memory peak230.7M. It had0remaining descendants,
0host mount leaks,0associated loop devices and empty mountpoints after namespace
exit. A separate audit checked all5staged asset hashes unchanged, unit not-found/
inactive/MainPID0, no mount/loop, exact named file set and workspace device/inode
before deleting only those owned artifacts. All three native workspaces are closed;
none may be replayed or polled as live.

Current native bundle SHA256:
`d7c2276413412d26f8ad6c9970d34dac35668ae411a9041a7b65399930a314fd`.
A fresh build after Proof comments equals the exact executed bundle. Final source
bindings also compare the eight proof inputs' normalized TypeScript ASTs to the
isolated removal controls; only comments/format differ. Evidence:
`/tmp/task8-client-executor/native-third-source-binding.json`,
`final-source-bindings.json`, `h4-native-third.*.log`,
`h4-third-closure.stdout.json` and `removals-final/proofs.json`.

Eight individually failing removals have passing controls: layer digest equality,
descriptor size equality, config platform equality, artifact marker agreement,
root pool mode, real hardlink refusal, setup path capability and cleanup parent
capability. The removal exercise caught a hardlink fixture whose group-write mode
could mask the link guard. The fixture now explicitly creates mode0600content; the
hardlink-only mutant then fails. Adjacent Proof comments name these observed checks.
These8are a scoped witness set, not exhaustive R5coverage.

Local final focused tests:51pass/0fail/78assertions across3files; root-user-namespace
workspace coverage includes real symlink/hardlink/FIFO faults, renamed-prefix setup,
cleanup and no retained descriptors. Library/spec typechecks and eight-file lint
pass. The attempted extra filename `registry-operation-completion.test.ts` did not
exist; Bun ignored that unmatched filter. No helper-caller test coverage is claimed
from it. Full fleet2949/0 and11CLIbuild results belong to the preceding source graph;
they were not rerun or transferred to new caller/integration claims. Final forced
format, strict/all OpenSpec, diff and source checks are recorded by this turn's
final checks, not inferred from this prose.

Remaining: sequential fixed root action and readonly source/listener bootstrap;
physical platform coverage planning; authenticated terminal pull receipt; immutable
journal/session ownership and ordinary/recovery restoration gates; installed Crane/
worker/scratch enrollment; full executor/installer kernel negatives and removals;
complete original BASE/caller/extraction/semanticR5review and exact registry SHA host
gate. Task9provider billable bounds/retention/prune/isolated restore, Task10registry
Slack delivery/independent missed-monitor watchdog and Task11fresh capacity/enrollment/
full rehearsal/activation remain. The exact current integration is not operational.
No product migration, live registry mutation, provider experiment, generic notification,
secret read, normal commit, push, PR or merge. Support outbound approval stays pending.

Next action: implement the agreed sequential root action and physical platform plan,
then connect its authenticated terminal completion to verification/restoration in
ordinary and recovery callers. Planned covering closure:
`/tmp/task8-client-executor-covering.json`.

## Physical client platform planning — 2026-10-31T12:00:44.068296+00:00

Classification: PROGRESS. The previous turn implemented bounded client components,
closed the privileged pathname race and produced51focused tests/11native cases/
8removals. This continuation preserves all17requirements/24scenarios and7/11reviewed
slices. Tasks4.2/4.3/5.1/5.2 remain unchecked; no root action, durable completion,
installer/caller adoption or live activation is inferred.

New `registry-client-plan.ts` derives direct and index-platform jobs for every
repository-qualified physical revision, including untagged children and repeated
content in different repositories. It verifies descriptor digest/size/media, required
revision/layer links, config platform/rootfs and supported relationships. It rejects
missing/contradictory metadata, unexpressible feature ambiguity, unsafe byte/inode
arithmetic and unselectable nested routes. The complete physical census is rehashed
before acknowledging the revision/store/path/census/filesystem binding. A trustworthy
empty census produces exact empty coverage; missing storage never does.

`collectRegistryStoredContent` in the existing inventory module reuses its streaming
CAS/link scanner without consumer-reader execution or HTTP. New optional cancellation
checks preserve existing callers; bounded metadata retains original bytes for fatal
UTF8 decoding. Existing inventory behavior remains the default inspect-upload mode;
client planning selects reject-upload mode for both censuses. Existing callers/tests
were read before changing this shared path.

Review caught two gaps, each reproduced before its fix. First, staging was rejected
only after hashing an owned upload whose reader lacks this AbortSignal. The planner
now refuses presence before entering that reader; the schema4-owned unreadable-body
regression observed old EACCES versus new controlled upload-free refusal. Second,
propagating an outer v8 hint could validate an inner index using a different selector.
Candidates now retain the full route and check the final selector at every edge.
An outer arm64/v8 descriptor pointing to an inner arm64 descriptor without v8 was
initially acknowledged; the fixed planner refuses. This matches pinned Crane's
[actual matching](https://github.com/google/go-containerregistry/blob/v0.22.1/pkg/v1/remote/index.go#L162-L177),
which selects the first matching child and defaults an absent platform. Both issues
received read-only code follow-up with no further concrete defect reported; this is
not full Task8approval or independent validation of the entire native drill.

Planner tests:35pass/0fail before the broader final run. Real fixtures cover full
repository/index coverage, no consumer getter access, unknown metadata, shared media,
missing child/links/config, layer corruption, unreadability, exact cancellation,
nested routing, unsafe allocation/overflow, fatal UTF8 and metadata cap. The recensus
negative delegates actual filesystem opens while inserting a real orphan at metadata
read time; it verifies the planner rejects the changed physical census.

Thirteen individually failing removals have passing controls, source-bound in
`/tmp/task8-client-plan/removals-final/proofs.json`: descriptor size, repository
revision, config platform, ambiguity, final nested selector, shared media, rootfs,
terminal recensus, fatal UTF8, metadata cap, staging prehash, allocation unit and
physical-envelope overflow. Eleven removals acknowledge invalid input; repository
revision and staging prehash instead lose their controlled early boundary and reach
a later layer-link error or body EACCES. The latter are ordering/diagnostic witnesses,
not invalid-success claims. These13are not exhaustive R5coverage.

Mutation testing exposed two harness weaknesses. The first UTF8 fault altered the x
in linux, allowing platform validation to mask lossy decoding; it now corrupts only
an opaque comment. Removing the metadata limit by passing undefined also disabled
buffering, causing a later empty-JSON failure; the corrected mutant raises only the
limit while retaining buffering. Failed preliminary proof directories remain
archived and are excluded from the successful13case witness set. Adjacent production
Proof comments name only observed cases; normalized TypeScript AST equality binds
the final commented source to the actual controls.

Two h4native executions each ran23expected cases. The final exact-source execution
uses bundle SHA256 `b111d02f2b3f77c0cac589178c6d1e931aadc79df728e0d695eac37ce8c68b48`.
It executed all4jobs of a complete amd64/arm64 physical plan and all6jobs of its
selectable nested-index extension with the actual UID/GID59001pinned Crane client,
then proved both planner and client reject the outer-v8/inner-unspecified case.
The11prior executor cases also pass, including cancellation, fresh pulls after
prior success, client-exit-zero wrong-leaf refusal and pool pathname replacement
while the job is still mode0700. The native driver uses its real synthetic source
and no HTTP/consumer mocks. Source binds are in `final-source-bindings.json`.

The final transient unit had512MiBmemory/128tasks/130seconds maximum, private
mount/net/PID namespaces, readonly host root, only loopback and a fully allocated
64MiBext4image with16384inodes. It exited0in2.807seconds, CPU3.772seconds and264.8M
peak memory, with0children,0host mounts,0associated loops and empty mountpoints.
Independent post-run audits checked the5staged hashes, unloaded/inactive/MainPID0unit,
exact file set and workspace device/inode before deleting only named owned files.
Both native workspaces are closed and removed. The arm64 executable was not run;
the x64 client retrieved arm64 images. The source fixture is readonly Distribution
configuration, not proof of the complete future readonly source-bind bootstrap.

Full fleet tests, all418owning TypeScript lint, library/spec types, changed-source
format and11normal CLI builds have fresh per-command receipts under
`/tmp/task8-client-plan/checks/`. The full test process was still running when this
section was first written; the final covering receipt must require its terminal
exit and source stability before stating pass. All11builds use a new output tree;
old hard-linked installer artifacts were never rebuilt in place. Earlier HOST77/
other native graphs do not transfer to newly built installed CLI artifacts.

Remaining: fixed root action/namespace and readonly listener/source bootstrap;
authenticated immutable terminal pull receipt; parent census/coverage comparison;
journal/session verified/restoration gates for ordinary retirement, staged recovery
and activation; installed Crane/worker/dedicated root-owned scratch enrollment; full
executor/installer kernel/removal matrices; original BASE/caller/extraction/semanticR5
review and exact registry SHA host gate. Task9provider billable bounds/retention/prune/
isolated restore, Task10registry Slack/independent watchdog and Task11fresh capacity,
complete lifecycle/enrollment/activation remain. No product migration, live registry
mutation, provider experiment, generic notification, secret read, normal commit/push/
PR/merge. Support outbound approval stays pending. Next: connect the planner/executor
inside the agreed sequential root action, then settle only authenticated terminal
completion and gate all ordinary/recovery restoration paths.

Planned covering closure: `/tmp/task8-client-plan-covering.json`.

Final runtime validation for physical planning: full fleet3035pass/0fail,
13181assertions across191files in356.55seconds. The test receipt reports444stable
inputs and418owning TypeScript files. Full418file lint has0errors/0warnings;
library/spec types, four-file source format and11CLIbuilds exit0. These are current
local checks, not the exact-revision canonical host gate or installed activation.
Both final native and local proof bindings remain source-bound; no ordinary or
recovery completion receipt was persisted by these component tests.

## Task4.2 continuation — actual client namespace and fixed worker integration, 2026-10-31 UTC

Classification: PROGRESS. The original17requirements/24scenarios and7/11reviewed
slices are unchanged. Tasks4.2/4.3/5.1/5.2 remain unchecked. No registry safeguard
activation, product migration, normal commit/push/PR/merge, provider experiment,
notification or support message occurred.

The actual client body now owns physical planning, a fresh readonly Distribution
server, every uncached platform pull, exact layout verification, credential/cache
cleanup and a fresh recensus before projecting completion. The nonsecret completion
binds operation, snapshot, store, authority revision, physical census, complete plan,
coverage, revisions and pinned client. Its factory alone supplies no authentication.

The bootstrap checks root PID1, actual finite cgroup limits, loopback-only interfaces,
three fresh namespace identities and fresh procfs. It verifies fixed utilities, makes
propagation private and remounts visible mounts readonly, leaving only enrolled scratch
and bounded private authentication writable. Kernel mountinfo contains hidden mounts:
the failed original attempt tried remounting a kubelet path hidden by private `/var/lib`.
Descriptor mount IDs now distinguish real visible mounts from proven covered entries;
missing paths within their own lineage, unknown IDs and permission/I/O failures refuse.
Redundant root self-binds were removed. The fixture also had to inherit its authority
lock before cloning the worker mount namespace; opening it inside the worker correctly
made the containing mount busy during readonly conversion.

Native1340 exercised12expected cases under512MiB/128tasks/130seconds with a fully
allocated64MiBext4scratch image: actual four-pull completion; missing snapshot and
missing layer; an actual Crane failure followed by a fresh successful retry; empty
coverage; namespace bootstrap; an actual root source-write refusal withEROFS; pulls
inside the readonly view; cancellation of an observed SIGSTOPped Crane with exact
owner cause and complete cleanup; fresh retry; and empty coverage after bootstrap.
It finished0 in11.265seconds with297.8Mpeak. Independent closure verified six terminal
facts: unitnotfound/inactive/MainPID0, five unchanged staged assets, no mount leak, no
loop device, empty scratch-parent view and exact owned workspace removal. The current
bootstrap/body rebuild was byte-identical to the executed bundle
`80a555c0516b6dd3b7df345a672f5c8069690b3ff30d78cee57eeaa2a092251b`.
Evidence: `/tmp/task8-client-action/bootstrap-inherited/`, including
`source-binding.json`, `current-rebuild-binding.json` and `h4-closure.stdout.json`.
This component proof does not establish the new outside launcher or durable settlement.

The root dispatcher now has fixed `verify-images` and `verify-recovery-images` actions.
Its stopped-writer/controller audit precedes launch. Recovery additionally requires
canonical preparation, snapshot/old-store/installed-target lineage and fresh volume,
mount and Distribution identities. A new fixed no-argument CLI reuses the existing
FD3 authority supervisor after a bounded namespace-origin preamble. The outside
launcher pins its tools/worker, computes independent before/after physical plans,
creates an owned finite systemd scope and fresh mount/net/PID namespaces with procfs,
and returns completion only after child/pipe/scope teardown. Owner cancellation uses
the kept pipe with five-second escalation. Legacy installation readability does not
grant enrollment in this new client action.

Focused review found and corrected two gaps. Actual dispatcher tests showed changed
prepared mount/Distribution identities reaching the worker before the new comparison;
both now refuse. The actual launcher with modeled kernel ports reproduced an owner
abort racing EPIPE, losing the original reason; it now retains owner and pipe causes
in order after scope cleanup. Further review exposed the same loss when cancel-write
succeeds but child/stdout/stderr/send fails: four additional observed negatives now
retain owner and all concurrent causes, including nested stream read/cancel failures.
All eight launcher checks pass.19individual removed predicates fail the real origin,
mount-lineage and prepared-field tests; source/test hashes and outputs are in
`/tmp/task8-client-action/mutants-current/receipts.json`. The origin deadline and
cancellation-dual-failure tests also followed observed RED→GREEN. These proofs are
not the entire installer/kernel/R5matrix.

The first broad run observed the launcher cancellation defect while it was being
fixed and omitted two opt-in restic tests. The next run enabled the pinned restic
binary and finished3108pass/1fail/0skip: an existing authority fixture's one-second
child-readiness window expired. An isolated run passed; injecting a1500mschild
startup reproduced the original failure. A bounded five-second wait passed the same
injected delay with all seven kernel-lock/recovery assertions unchanged. The stable-source full run finished3109pass/0fail/0skip with13289assertions across
202files in551.50seconds. Its source binding precedes the later two-file cancellation
aggregation refinement. The current complete client/control graph subsequently passed
173tests/0fail with268assertions across16files; current library/spec types and the
two-file lint delta pass. A fresh whole-fleet run on that final refinement remains
unperformed. Lint440files, library/spec
types, changed-source format and all12CLIbuilds have fresh successful receipts under
`/tmp/task8-client-action/checks-final/`; old hard-linked installer artifacts were not
rebuilt in place. These local checks do not establish the exact-SHAcanonical host gate.

Native1350 staging mistakenly required20GiBfree on `/tmp`, so it refused before any
asset transfer. A premature launch then exited2 because its runner was absent; no
worker started. Independent audit removed the exact empty directory and observed
unitnotfound/inactive/PID0. Fresh measurement showed root110506405888available bytes
on device2049 and independent `/tmp`8073506816available of8180436992bytes on device36.
The next fixture preserves20GiBon root and1GiBon temporary storage separately.
Native1360 refused a doubly wrapped synthetic source pin before launching any client
scope. Its exact six assets were audited and removed. Native1370 was staged but never
executed; all six assets were independently verified and removed before rebuilding.
Native1380/1390 created real client scopes, then correctly refused a synthetic
enrollment mode600where the existing contract requires644. Both scopes became
notfound/inactive with empty cgroups without forced cleanup; their exact workspaces
were audited and removed. The diagnostic1390worker copy logged only fixture errors
and is not a production artifact. Corrected1400used the normal-redaction standalone
worker and completed four actual pulls through the actual parent/scope/CLI/C4control
path in4.008seconds; independent closure removed its six unchanged assets with no
mount/loop/workspace leak. Native1410then used the exact worker from the normal12-CLI
build: SHA256 `7a8e11f669f6a453f2c1d89812ba6fbf230079744544c7087402fed9cc428c9b`.
It completed the same four actual pulls in3.922seconds,419.5Mpeak; the scope was
notfound/inactive with empty ControlGroup and forcedCleanupfalse. Evidence lives in
`/tmp/task8-client-action/launcher-release/`, bound to the current normal build under
`checks-current/`. Its independent closure finished0: the outer unit and owned client scope were
notfound/inactive, all six staged assets matched, no mount/loop remained, and the
exact device/inode/file-set workspace was removed. The latest12CLIbuild has current
source/output receipts under `checks-current/`. The fixture installation/resources are synthetic and
bypass dispatcher Kubernetes/device auditing and durable session receipt settlement.

Remaining: native launcher cancellation/EOF/kill/scope failure matrix; durable
client attempt/scope/job ownership and interrupted scratch recovery; immutable
authenticated session completion and parent retained-census binding; ordinary,
staged-recovery and activation verified/restoration gates; actual installed worker,
Crane and independent scratch enrollment; full installer/kernel/removal proofs;
original-BASE/caller/semantic review and four historical source-unbound proof logs;
normal integration commits and exact registry-SHAcanonical gate. Task9provider physical
budgets/retention/prune/independent restore, Task10registry-specific Slack alerts and
independent missed-monitor watchdog, and Task11fresh capacity/full lifecycle/adoption
remain. Existing generic Slack delivery is operational; it does not close Task10.
Hetzner support outbound approval remains pending and is not re-requested by elapsed time.

Current checkpoint: `/tmp/task8-client-action-covering.json` covers this continuation's
current source snapshot and artifacts, with the earlier planner cover linked as
history. It does not assert that all inherited historical pins were revalidated,
that every new safety predicate has its complete kernel/removal proof, or that
Task4.2 is complete. The next implementation step is durable client attempt/scope/job
ownership, authenticated immutable receipt settlement and ordinary/recovery/activation
restoration gates. The full original goal remains active.

## Durable client completion and restoration — 2026-10-31

**PROGRESS, goal active.** The scope remains 17 requirements, 24 scenarios and
7/11 reviewed implementation slices. Task4.2 remains unchecked, along with
Tasks4.3,5.1,5.2. No product was migrated and no installed source pin, timer or live
registry safeguard was activated in this continuation.

The parent now independently reads a real client pull plan and binds its journal
revision, store/path, filesystem, physical census and repository-qualified revisions
to the complete retained API/consumer inventory. Current and recovery root actions
remain fixed; no plan, paths, arguments or environment are added to request JSON.
Only the authenticated root terminal transport can call `settleClient` after process
exit, bounded diagnostic drain and terminal EOF. Generic evidence updates cannot
invent/erase/replace completion. Canonical reads check operation, registry,
snapshot, target, revision upper/lower bounds and parsed timestamps; extended-year
canonical ISO dates cannot exploit lexical ordering.

Ordinary maintenance, staged recovery and activation invoke clients after closing
the retained HTTP server. Journal verified/restored/completed phases, recovery
handoff and parent/root restoration require saved fresh completion. Root checks
again after stopped observations and before replicas/service/owner reopening. Its
Kubernetes adapter runs the captured restoration guard synchronously immediately
before each native mutation spawn, after the resource GET. Cloned recovery
candidates omit an old-store completion without changing canonical source evidence;
a matching new target receipt survives the actual verified handoff.

Independent review found and reproduced the revision-floor/extended-year clock
gaps, projected old-store receipt blocker and expiry during root observations and
pre-patch GET. All were fixed. The final focused review reported no further
substantive issue and freshly passed15 mutation/restoration tests. Its sandbox
could not exercise listener-based partial recovery; the escalated owning runs did.
The schema extension also initially lost its unknown-key rejection through
ArkType.merge; a real host extra-receipt negative exposed this, and the completion
schema now explicitly rejects undeclared fields.

Evidence is under `/tmp/task8-client-journal/`:

- `checks/test.{start,exit}.json` and logs bind474 inputs/448 owning TypeScript files
  to **3187 pass,0 fail,0 skip,13573 assertions,207 files,526.98s**. Sources stayed
  unchanged for that full run. It used the pinned actual restic fixture binary.
- Three subsequent fixture typing corrections changed only
  `registry-client-mutation.test.ts`, `registry-client-restoration.test.ts` and
  `registry-client-runtime.test.ts`: artifact-verifier mock return type, optional
  receipt-reference narrowing and reference-identity matcher typing. No production
  source changed. `full-to-current-delta.json` records this exact set. There was no
  second full fleet run after these three test-only corrections.
- `checks-final/` binds the current474 inputs to passing production/test types,
  lint across448 files with0 errors/0 warnings, full owning-source formatting and
  the normal12-CLI build. All12 outputs are byte-identical across pre/post-correction
  builds. Current worker SHA256 is
  `f8104caa0ac2b4577272dd129adcd153468a671f2c2de2f69786411d2b465443`.
  Current client+host graph: **248 pass,0 fail,508 assertions,21 files**;
  exact three-file delta: **22 pass,0 fail,67 assertions**.
- Whole-store OpenSpec validation passed **284/284**, and `git diff --check` exited0.
- `mutants-release/receipts.json` binds25 guard/dependency-removal witnesses to
  current source/test hashes; all failed their covering production-path tests.
  These include immutable generic recording, session revision/store/phase,
  canonical and recovery lineage, parent census/repository binding, authenticated
  post-EOF settlement, extra fields, ordinary client invocation, projected old-store
  removal, root age/census/retained checks, delayed reopening and post-GET native
  mutation admission. Adjacent Proof comments identify the injected faults.
- `mutants-historical/receipts.json` replaces four previously source-unbound logs
  with fresh current source/test receipts: repository HTTP status, upload size,
  residual eligibility and future retirement/failure receipt capacity. All four
  actual covering negatives failed with their respective guard/dependency removed.
  The historical logs remain history rather than current standalone proof.
- Initial RED/GREEN logs include `session-red.log`, `host-red.log`, `gate-red.log`,
  `caller-red.log`, `project-red.log`, `root-delay-red.log`, `mutation-red.log` and
  their owning green/current checks. An earlier696-test integration run passed695
  and failed the existing deadline fixture's one-second startup-marker wait;
  the wait is now bounded at five seconds, while its actual500ms deadline,
  exclusion and no-escaped-child assertions remain. The full fleet pass includes
  that native cancellation/deadline regression.

The older Distribution/GC component rehearsal explicitly models client completion;
it proves no client execution/isolation/authenticated settlement. Native1410's
previous worker success is historical, not execution evidence for the current
worker bundle. No new remote rehearsal or live mutation was performed here.

Remaining Task4.2 work: durable client attempt/scope/job ownership and interrupted
scratch recovery; native launcher cancellation/EOF/kill/scope failure matrix;
actual installed Crane/worker/independent scratch enrollment and complete
installer/kernel/removal proofs; full original-BASE/caller/extraction/semantic R5
review; normal integration and exact registry-SHA canonical gate. Fresh external
backup physical accounting/retention/prune/independent restore, registry-specific
Slack alerts and independent missed-monitor watchdog, and complete lifecycle/
capacity/adoption certification remain Tasks4.3/5.1/5.2. Generic Slack delivery does
not close registry monitoring. Hetzner support outbound approval remains pending;
no support message or Slack test was sent in this continuation.

Unrun required completion checks remain explicit: the new full installed native
lifecycle/failure matrix, independent off-node restore, final workspace-wide CI
and secrets/migration checks, and exact-SHA h2/h4 canonical gate. Current local
fleet/client checks and normal CLI compilation do not substitute for them. No task
checkbox or goal-complete status is inferred from these component results.

Current cover: `/tmp/task8-client-journal-covering.json`, linking the prior
`/tmp/task8-client-action-covering.json` as history without asserting revalidation
of all inherited historical pins. Next work is durable native client custody and
interrupted scratch recovery, followed by installed lifecycle certification.

## Durable client custody and native interruption recovery — 2026-10-31

**PROGRESS, goal active.** Scope remains 17 requirements, 24 scenarios and 7/11
reviewed slices. Tasks4.2,4.3,5.1,5.2 remain unchecked. No product migration,
production safeguard activation, timer enablement, normal commit/push/PR/merge or
canonical exact-SHA gate occurred in this continuation.

One root-private `.client-attempt.json` is now atomically published in the dedicated
bounded scratch pool before the outside launcher creates its unique systemd scope.
The held pool inode, operation/registry/snapshot, source plan/revision/store,
installed tool/scratch profile, hashed capability and actual guardian bind custody
without changing the canonical journal revision or persisting credentials. Linux
anonymous-file write/fsync/link/directory-fsync publication has no named-partial
fallback. Actual SIGKILL before publication leaves no named state. Fresh metadata
admission and stopped-writer/target audit precede allocation and execution.

The worker independently derives plan/profile/token facts and checks its actual
scope, boot, machine and nonfuture attempt window before server or pull effects.
Success requires only the protected record to remain. A same-operation fenced retry
recovers audited anchored jobs only after its exact recorded scope is independently
not-found/inactive with no control group. Missing ownership with nonempty scratch,
foreign lineage, changed metadata, unknown entries and unsafe traversal refuse and
retain uncertain state. The next attempt always mints a fresh nonce. Error and
cleanup causes remain observable together; authenticated terminal completion still
owns canonical settlement.

Broader caller review reproduced two additional failures with real held sessions:
reader cancellation could replace the execution failure and skip reader release;
canonical reread could replace the operation failure before durable recovery was
attempted. New regressions failed before either fix. The supervisor now observes
cancellation rejections immediately, collects their outcomes and unconditionally
releases the reader while preserving ordered failures. The journal includes
reread/schema/ownership/persistence in recovery failure aggregation. Actual missing,
unreadable, malformed and wrong-schema files preserve Error/null/undefined original
rejections as first aggregate member and cause. The adjacent lint exceptions name
why recovery's secondary error must not replace that original causal boundary.
The reviewer reran15 targeted cases and found no new cleanup issue. This trace is
not a claim that every original-BASE extraction/R5 boundary is certified.

Evidence under `/tmp/task8-client-custody/`:

- `checks-portable/` binds 483 inputs / 457 owning TypeScript files to the current
  full fleet run: **3254 pass, 0 fail, 0 skip, 13747 assertions, 211 files, 525.27 seconds**. Production/test types, lint across 457 files with 0 errors /
  0 warnings, owning-source formatting and the normal 12-CLI build passed against
  the same source pins. No source changed during the full run.
- The current client+host graph passed 300 tests across 24 files. The additional
  actual supervisor/journal/admission/worker regression group passed 47 tests across
  four files. The real root-user-namespace store fixture exercises 29 filesystem
  cases, including foreign publication before named allocation, corrupted pool/
  record identity, private metadata and anonymous writer SIGKILL.
- `mutants-final/receipts.json` records 27 current-source guard/dependency-removal
  failures, and `mutant-cancel-observation-final/receipt.json` records the actual
  interruption test failing on an unobserved cancellation rejection during 20 ms of
  owned teardown. The 27 include independent facts/context/profile, real pool/
  record/owner/scope/empty checks, publish/admit ordering, worker validation calls,
  fresh machine/scratch/root reserve/barrier/cancellation admission and both
  failure-preservation fixes. Each production boundary has its adjacent Proof
  comment. Logical mutation hashes are recorded before deterministic import rewriting;
  separate executed module/test hashes and staged TypeScript pins identify the bytes
  actually executed. The journal malformed-JSON negative deliberately produces a caught
  JSON SyntaxError; it is an expected input fault, not a module syntax failure.
- `native-{cancel,eof,scope-kill,parent-retry}-reviewed/` each stage the normal
  worker artifact and run the actual outside launcher, systemd scope, CLI, fixed
  control protocol, namespace bootstrap, custody store and pinned Crane pulls on
  disposable h4 storage. Each interrupted attempt rejects completion, its retry
  uses a fresh scope and performs four actual repository/platform pulls, and
  independent closure verifies terminal exact units, no host mount/loop leak,
  empty scratch and removal of the exact staged workspace. Parent SIGKILL
  additionally proves the inherited authority remains busy while the scope is
  frozen, preserves the durable record/partial job, then recovers it after exact
  scope termination. These four cases use a 1 GiB outer observer harness while the
  production inner scope remains 512 MiB / 128 tasks. The earlier1720 outer 512 MiB
  harness OOMed before its interruption checkpoint; its exact failed workspace
  was independently audited/removed, and that failed run is not positive evidence.
- `current-native-builds-portable/receipts.json` recompiles all four drivers and compares
  both driver and worker bytes with what h4 executed. All match current source.
  Current normal worker SHA256 is
  `629e6334ba88cd7df005b7ca601c0ae8975ba3280b7ac8bff6819e36ccb9b47b`.
- Earlier `checks-final/` passed 3229 tests before the two review fixes. The later
  `checks-reviewed/` run passed 3224 and failed 30 inventory tests after actual local
  root ENOSPC, with about 474 MiB free; its test scratch was removed. This run is
  retained as failed evidence. No registry logic was changed to hide those failures.
  A first separate-filesystem run (`checks-runtime/`) then passed 3243 and failed 11
  fixtures: six copied the root mount for a different scratch filesystem, four
  assumed directory enumeration order, and one hardcoded a `/tmp` owned prefix.
  The corrected fixture uses the kernel descriptor mount ID, asserts the underlying
  missing/unreadable errno, sorts before exact directory-set checks, and derives
  the owned prefix from `tmpdir()`. The affected three-file suite passed 56 tests.
  Review confirmed these changes preserve the test contracts without changing
  production writer checks or recovery behavior. The final run uses the private
  executable runtime scratch recorded in
  `runtime-scratch.json`, on a separate approximately 3.1 GiB tmpfs with over 2 GiB
  admitted headroom and over 8 GiB available host memory. Short canonical paths
  preserve Unix socket limits. It does not delete shared disk files or establish
  production registry/scratch capacity.
- Whole-store OpenSpec validation and current diff/document checks: OpenSpec284/284, Markdown formatting and git diff --check passed; final receipts are captured in this archive.

These native fixtures use a synthetic 64 MiB enforced filesystem and model canonical
installation resources and the dispatcher controller/target audit. They do not
prove actual installed scratch capacity, controller exclusion, enrollment/Crane/
worker provisioning, canonical session settlement, external backups or the complete
registry lifecycle. No live registry source pin or safeguard was adopted from them.

Unrun required completion checks include the full installed lifecycle and independent
off-node restore, workspace-wide CI/secrets/migration checks, and the exact-SHA
h2/h4 canonical gate. Local fleet checks and component drills do not substitute.

Next Task4.2 work is actual pinned client/worker and independently bounded scratch
provisioning through the host installer, with representative-image capacity,
installed controller/target/authority and removal proofs, followed by full caller/
extraction/R5 review, integration and the exact registry-SHA canonical gate.
Task4.3 still needs provider physical accounting, retention/prune bounds and kept
snapshot independent restore. Task5.1 still needs registry-specific Slack delivery
and an independent missed-monitor watchdog. Task5.2 still needs the complete
lifecycle/capacity/adoption certification. The old PVC remains preserved. No
support message or Slack notification was sent; pending outbound approval is not
inferred from elapsed time.

Current cover: `/tmp/task8-client-custody-covering.json`. It links the preceding
client-journal cover as history without asserting revalidation of every inherited
historical pin.

## Task4.2 continuation: bounded client-pull storage provisioning — 2026-10-31

This continues the existing17 requirements/24scenarios; seven of eleven reviewed
implementation slices remain checked. Task4.2 and all other open slices stay open.
The client-worker implementation checkpoint above is historical evidence, not proof
that its host installation or the complete lifecycle is operational.

Implemented the separate `provision-pulls`, `mount-pulls` and `verify-pulls` modes,
explicit Ansible enrollment and boot unit. Inputs require reviewed byte/inode
ceilings; no production capacity or UUID is invented. Formatting applies the inode
ceiling and verifies actual capacity. The pool is root:root0711. Canonical storage
must verify, share its directory and retain its root reserve before pull allocation
or identity receipt writes. Pull receipts live on the verified journal. Existing
registry and builder modes remain separate. The uncached
`tool-fleet:test:registry-pulls` target requires explicit root fixture transport.
No role was applied to production, timer enabled, product migrated or old PVC
removed by this continuation.

Physical and role evidence is archived under `/tmp/task8-client-installation/`:

- Original unsupported-mode RED: `pulls-storage-red.log`. Expanded23case native
  GREEN: `pulls-native-final.log`, through the actual uncached Nx target, 1pass,
  0fail. Its remote receipt binds exact executed helper/native hashes and confirms
  private workspace removal, no loop leaks and no host mounts. It exercises
  malformed input refusal before backing allocation, cross-mode refusal, root-pool
  metadata, unprivileged parent-write refusal, actual byte/inode ENOSPC, identity,
  trim exclusion, idempotency, canonical reserve/directory mismatch and missing
  pull/journal mounts. The exclusive fixture allocates224MiB across five loops.
- Nine current physical guard/dependency removals:
  `physical-mutants-final/receipts.json`. Each actual native negative fails with
  its relevant predicate or format-time `-N` dependency removed; executed bytes,
  worker failure and exact workspace/loop/mount cleanup are recorded. Failures
  include input owner/inodes/keys, canonical directory/reserve/verification,
  physical inode ceiling, pool ownership and inode formatting. Adjacent `Proof:`
  comments identify the observed faults.
- Eight real-Ansible pull guard removals are recorded in
  `role-mutants-complete/receipts.json`: enrollment, byte/inode assertions,
  canonical task presence, canonical status/output, and provision status/output.
  Each removed guard lets actual Ansible accept the selected bad condition and
  therefore fails the original refusal assertion. These component tests model
  only the already verified physical-command port and unavailable system manager;
  ext4 behavior is covered by the native fixture above.
- First removal sweep retained one exact workspace when lazy loop detach had not
  yet disappeared. It was inspected by backing identity and source hashes, found
  without loops/mounts, and removed exactly; closure is recorded in
  `failed-witness-workspace-closure.json` from tool session41630. The fixture now
  polls the owned attachment state for at most5seconds after detach. That failed
  sweep is historical and is not counted as a guard witness.
- Existing registry regression first passed its storage checks but failed while
  detaching a pre-remount loop snapshot (`registry-storage-regression.log`). The
  fixture now reads its current mount source immediately before sparse backing
  manipulation. Corrected `registry-storage-corrected.log`: 1pass, 0fail,
  16assertions,43.71s, exact workspace absent. Existing builder regression on the
  final helper: `builder-storage-final.log`, 1pass,0fail,4assertions,2.26s,
  exact workspace absent.

The first complete host-suite invocation finished16pass/2fail. One failure was an
omitted pinned kubectl environment variable; the other was an old fixture using a
dummy Bun script that the tightened runtime pin correctly rejects. The readiness
case passes with checksum/version-verified kubectlv1.36.4
(`readiness-pinned-final.log`:1pass,0fail,13assertions,53.86s). The authority case now
uses the real pinned Bun, actual built CLI and existing private root-user-namespace
installer rehearsal: valid installation succeeds; wrong bundle hash and malformed
enrollment preserve the prior usable authority and leave no candidate directory
(`authority-host-corrected.log`:1pass,0fail,14assertions,27.59s).

The source-ordering witness in `authority-source-proof-build/` shows wrong-bundle
refusal at the pre-write guard. Removing it moves refusal to the later candidate
artifact check and makes the expected-boundary assertion fail. Both paths preserve
the prior authority; no claim that removing one guard bypasses all later checks is
made. The earlier dummy-runtime test and its now-obsolete proof wording were
replaced. A supplemental source witness initially used an older flat build output;
that archive is historical. The current witness pins the fresh normal Nx output
at `dist/tool-fleet/tools/tool-fleet/src/registry-journal-cli.js`. A proof-copy startup failure after the new fixture import was added is
recorded in `role-mutants-reconciled.log`; it is not a behavioral witness. The
corrected proof harness includes that import explicitly.

Independent read-only review found no concrete correctness/safety findings in the
pull provisioner, role/unit, physical cleanup or corrected authority fixture.
Shell syntax, embedded/native Python syntax, ShellCheck, changed-test ESLint,
strict infrastructure-test types, owning fleet types and the normal twelve-CLI
build pass. Strict OpenSpec validates this change; all284 OpenSpec items pass.
Final all-host-suite and source-pin checkpoint receipts follow below.

Not performed here: complete installed client-worker/Crane/tool/physical-profile
enrollment, full lifecycle and every caller rehearsal, provider physical backup
accounting/prune/independent restore, registry alert failure delivery and independent
watchdog, final exact-SHA host gate, commit/push/integration or live activation.
The previous3254pass full-fleet run remains historical; its source pins are
revalidated separately and do not substitute for the required final lifecycle gate.

Final provisioning checkpoint: the uncached complete host target with pinned
Ansible and kubectl passes18/18 cases, zero failures,232assertions,263.90s
(`hosts-pinned-final.log`). All nine physical and eight role removal receipts bind
the final executed source/test/fixture bytes; the additional authority source-order
proof uses the actual fresh Nx build output. h3/h4 public-tool inventories were
read without changes; their `ip` binaries differ, so future client enrollment must
use host-specific measured pins. No production capacity was allocated.

The checkpoint `/tmp/task8-client-installation-covering.json` links this evidence
to the earlier client-custody cover while retaining its full-fleet results as
historical. Required complete installed-client, provider, monitoring, lifecycle,
exact-SHA gate and activation work remains outstanding; the goal stays active.

## Task4.2 continuation: client artifact and physical-profile preflight — 2026-10-31

The full scope remains17requirements/24scenarios, seven of eleven reviewed slices;
Task4.2,4.3,5.1,5.2 stay open. This component adds the read-only
`verifyRegistryClientInstallation` and authority CLI
`--validate-client-installation <trusted-candidate>`. It verifies eight fixed
artifacts, canonical storage receipts including explicitly enrolled recovery stores,
exact scratch UUID/byte/inode bounds, filesystem separation and root:root0711 pool.
The shared artifact verifier optionally requires exact mode and root GID on the
same no-follow descriptor whose bytes it hashes. Legacy callers retain their
existing contract. Zero download admission allows a full owned pool during recovery
installation. The existing schema-only candidate CLI remains available.

The actual maintenance Ansible role still accepts its original seven bundles;
eighth-bundle/Crane installation, measured host-tool pin checks and mandatory
pre-grant validation are pending. Native fixtures directly stage artifacts. This
checkpoint is not a claim that client installation or the complete lifecycle is
operational; the full goal remains active and production is unchanged.

Evidence is archived under `/tmp/task8-client-artifacts/`:

- Pre-implementation RED:24 profile cases failed for the absent validator;
  `profile-red.log`. The first validator passes24 cases (`profile-green.log`).
  Recovery coverage extends this to31 profile cases. CLI RED shows two new-mode
  argument cases failing against the old CLI, while its original two pass
  (`cli-red.log`). The actual root executable wrong-mode negative initially fails
  because its correct hash was accepted (`mode-red.log`).
- Targeted implementation GREEN:44 cases,0fail,83assertions across profile,
  CLI and descriptor suites (`profile-mode-green.log`). Independent review also
  runs the nine existing schema cases. Its initial sandbox metadata failures see
  remapped owner65534; the real-host ownership rerun passes all descriptor cases.
  Review finds no concrete correctness/safety defects. Five fixture lint errors
  were corrected; owning strict types and complete source lint pass afterward.
- Twelve current source-bound removal/dependency witnesses:
  `profile-mutants-final/receipts.json`. Omitting artifact checks, canonical
  measurement, each canonical UUID/byte predicate, scratch UUID/byte/inode
  predicate or pool kind/UID/GID/mode predicate makes the corresponding actual
  function-body refusal test fail. Charging one download byte makes the full-pool
  positive fail. IO ports are modeled only in separate child fixtures; the actual
  native run below covers mounted filesystems and real binaries.
- Same-descriptor mode/root-group guard removal is observed with a real root-owned
  `/usr/bin/true` artifact: removing the guard accepts the wrong required mode and
  fails the original rejection (`mode-mutant-final/receipt.json`). Native worker
  GID drift independently refuses. Adjacent production `Proof:` comments name
  these observed faults.
- Final actual h4 native run: `native-final/native.stdout.log` and stderr. It
  exercises all23 existing storage cases, then22 installation cases with the
  actual pinned Bun, current compiled authority/worker, Crane and host tools.
  Valid profile and physical-ENOSPC/full-pool validation succeed. Worker hash,
  mode/GID, missing Crane, host-tool pins, scratch UUID/bytes/inodes, pool metadata,
  missing journal receipt, registry identity and missing pull/journal mounts
  refuse. Legacy schema remains readable while new client effects refuse.
  No journal file is created. The exact source-composed fixture, five-loop224MiB
  filesystems and executed artifact hashes are recorded; its workspace is removed
  with no loop or host-mount leaks. The actual recovery-store path is covered by
  modeled boundary tests here, not a new native recovery-target rehearsal.
- Final native CLI removal proof:
  `native-final/cli-mutant-native.stdout.log` and stderr. A source mutant omitting
  only the call to physical client validation returns `verified` for an altered
  worker. The actual native negative therefore fails at the marked changed-worker
  boundary (workerExit1); it cleans all owned filesystems/workspace. The production
  call has its observed adjacent `Proof:` comment.
- The first native artifact precedes final formatting; a bundle diff shows only
  object-layout formatting. It is retained as historical evidence. The final
  native run repeats against the exact final compiled bytes. Both source stages
  (six public binary/config files each, about121MB) are checked by exact directory
  device/inode, claim, root metadata and all hashes before removal. Closures are
  `stage-closure.json` and `native-final/stage-closure.json`; no shared files are
  deleted.

The uncached full owning target finishes3286pass,2skip,0fail,13777assertions,
212files,538.74s (`fleet-final.log`). Its498 source inputs remain unchanged
throughout. The two skips require explicit `PUNI_TEST_RESTIC_BINARY`; their
completion is recorded below rather than hidden or counted as passes in this run.
The pinned restic0.19.1 executable is hash/version verified before that separate
run. Normal twelve-CLI build, owning types and complete source lint pass. Remaining
format/OpenSpec, native-backup completion and checkpoint source pins follow below.

Not performed: actual Ansible client artifact wiring, complete installed client
lifecycle/callers, provider physical backup accounting and bounded prune/independent
restore, registry-specific alert delivery and independent watchdog, the final
exact-SHA canonical host gate, commit/push/integration or production activation.
No product is migrated and the old PVC is preserved. The next Ansible steps are
recorded in `ansible-continuation.md` in the evidence archive.

Native-backup completion on the unchanged checked code:
`backup-native-completion.log` records2pass,0fail,39assertions,19.17s with the
hash/version-verified pinned restic. Both owned repositories are removed after
child/lock closure. Thus all3288 cases collected by the broad run have passing
execution evidence across that run and the explicit native completion; the broad
run itself still records its two skips. No broad rerun is represented as having
zero skips. The498 frozen inputs drift only in the three documentation files
updated after the tests; owning runtime/test/build inputs remain unchanged.

The final checkpoint is `/tmp/task8-client-artifacts-covering.json`. It records
current source pins, final executed artifacts,15 source-bound guard/dependency
witnesses, both clean native filesystem runs, exact binary-stage closures and the
independent review. All outstanding goal work listed above remains required.

The root-GID predicate also has its independent removal witness:
`group-mutant/receipts.json`. A real root executable is opened and hashed through
the actual verifier, with only its descriptor stat group modeled as59001. The
current guard refuses; removing only the GID predicate admits it and fails the
negative. Actual GID drift on the installed worker is separately refused in the
h4 native run. This distinguishes the modeled stat port from the native fault.

## 2026-10-31: actual Ansible client installation

Task4.2 remains open. This checkpoint implements the client artifact installation
slice through the actual `registry_storage` authority and maintenance tasks. It
does not establish the complete installed maintenance lifecycle or live enrollment.
The full goal remains17 requirements,24 scenarios and7/11 reviewed slices; Tasks4.2,
4.3,5.1 and5.2 remain open.

Evidence is archived under `/tmp/task8-client-role/`; the covering record is
`/tmp/task8-client-role-covering.json`. Previous runtime evidence remains historical
in `/tmp/task8-client-artifacts-covering.json` (SHA256
`425338ad4906505a4a2201896f6156388eb9f709732313be7a7c03b8d617173a`).

- The actual old role rejects the required eighth bundle (`red.stdout.log`). The
  new role requires exact enrolled artifact keys, configuration/worker SHA binding
  and an explicit pinned Crane source. Source kind/hash and nonempty16MiB bundle
  limits precede host copies. Canonical/pull storage verification and the authority's
  installed-profile validation must both succeed and return exact acknowledgements
  before the root wrapper/sudo grant. Existing unenrolled staging uses seven bundles.
- Actual h4 controller execution uses frozen Ansible core2.21.3 packages and native
  Python3.14.4. This is not a claim that the full pinned controller image ran.
  Private mount overlays contain role writes; disposable enforced filesystems
  contain canonical/pull state. The host's readonly alternatives bind preserves
  its actual default sudo parser. No controller package is installed globally.
- `cases.json`, `valid/stdout.log` and `case-empty-worker/stdout.log` record21 cases:
  valid/idempotent, legacy and19 refusals. Faults cover artifact keys/binding,
  missing or bad sources, empty/oversized worker, tool/pool pins, altered installed
  worker/missing Crane, pool permissions, sparse physical backing and command
  acknowledgements/status. Stat-kind and command-output/status faults model those
  producer ports; source bytes, installed files and physical faults are actual.
  Every refusal keeps the grant absent; early source refusals also precede the
  maintenance installation directory. Each worker removes its exact disposable
  workspace with no loop or host-mount leaks.
- `mutants.json` plus `minimum-mutant.json` record13 actual role guard/dependency
  removals. Each original boundary observer fails when its guard is omitted;
  binding/source failures caught later are distinguished from reaching a grant.
  `proof-sources/` preserves executed task bytes. Adjacent `Proof:` comments were
  added after observations; `annotation-equivalence.json` proves parsed task
  objects equal the executed sources before comments.
- The shipped non-cached Nx target runs final enrolled and legacy roles against
  fresh normal twelve-CLI builds: `shipped-final-valid-target.log` and
  `shipped-final-legacy-target.log`. Valid installs eight bundles and Crane,
  preserves the journal and reports no changes on its second apply. Legacy installs
  seven bundles without client artifacts. Both terminal receipts and stage closures
  verify removal of owned workspaces, mounts, loops and every staged source.
- Review first found a transfer deadline beginning after blocking pipe writes.
  The corrected RED (`transfer-red2.log`) exceeds its outer watchdog with a
  deliberately stalled reader; the earlier `transfer-red.log` is an invalid
  harness EOF failure. Packaging into an owned local temporary file moves the
  transport deadline before any upload; the persistent
  `registry-client-role-transfer.test.ts` passes, reaps owned transport children
  and reports the exact preserved remote stage (`transfer-green.log`).
- Stage cleanup previously deleted known sources before rejecting an unknown
  directory symlink. `closure-symlink-red.log` observes this; the final preaudit
  rejects it with known sources and the outside sentinel preserved
  (`closure-symlink-green.log`). Both exclusively owned test directories close.
- Review then found inherited umask000 could create writable nested staging
  directories. `stage-modes-red.log` observes0777 and premature deletion;
  `stage-modes-green.log` observes0700 under the same umask and refusal before
  deletion for a deliberately writable directory. Explicit umask077, root-private
  stage creation and staging/worker/closure ancestor audits protect staged sources.
  The actual worker prelude refuses directory symlink, UID59001 and mode0777
  faults; removing its combined directory guard admits each
  (`worker-custody-proofs2.log`). Only the base physical worker is modeled in these
  small prelude tests; final shipped runs separately execute actual storage/roles.
  The actual staging receiver also refuses chmod0777 injected after parent creation
  and before member writes; omitting its directory audit writes the same source
  (`stage-directory-guard-proof.log`). Both exclusive partial stages close.
  Final Python proof comments follow the observations; executed driver/worker
  copies and `python-annotation-equivalence.json` preserve exact hashes and prove
  parsed Python/embedded receiver semantics unchanged after those comments.
  An initial proof harness assumed independent predicates for a symlink whose
  mode also violates custody; that invalid attempt is retained in
  `worker-custody-proofs.stderr.log`. Its identified five-byte fixture is closed
  after exact inode/metadata/tree/hash checks (`custody-recovery-closure.json`).
- The original prototype stage of1914 files is closed by exact device/inode,
  complete claim, full entry audit and source hashes
  (`prototype-closure.stdout.log`). Seventeen source-equivalent YAML bytecode
  caches created during the early prototype were individually validated and
  removed (`cache-closure.json`); final workers disable bytecode writes before
  importing staged packages. No shared cleanup is performed.

Fresh focused verification passes8 tests,0fail,37assertions
(`targeted-after-stage-fix.log`), including the new deadline regression and seven
existing maintenance unit/installer contracts. Owning uncached typecheck and full
source lint pass (`types-final.log`, `lint-final.log`). The final normal12 artifacts
are byte-identical to the previous checkpoint (`build-equivalence.json`). Existing
owning runtime/test sources retain their prior hashes; the earlier3286pass/2skip
broad run plus explicit2-case native completion remains historical evidence, not a
new broad run or a zero-skip claim. Strict change validation and all284 OpenSpec
items pass. Format verification and final covering pins are recorded with the
checkpoint after the final documentation check.

Not performed: complete installed maintenance/caller lifecycle, provider physical
backup accounting and bounded prune/independent restore, registry alert delivery
and independent missed-check watchdog, final exact-SHA canonical host gate,
commit/push/integration, live safeguard activation or product migration. The old
PVC is preserved. The next work is the original Task4.2 installed lifecycle through
the actual root helper and callers; this installation component does not replace it.

### 2026-11-01 — installed runtime prototype; normal-helper refusal remains

Task4.2 remains open. The prototype and native evidence live under
`/tmp/task8-installed-client/`; this runtime fixture is not yet shipped in the
repository. `native-h3-pid` exits0 after actual Ansible installation and unchanged
repeat convergence, actual UID59001 authority/sudo/root-dispatcher execution, four
real Crane pulls, durable canonical acknowledgement and a controlled checkpoint
that retains the failure fence. Its outside root observer confirms the exact
captured systemd scope is terminal without repair and the pull pool is empty.
The native receipt confirms removal of the disposable workspace without loop or
mount leaks; exact source-stage closure also succeeds.

That positive uses the diagnostic host bundle. The other seven maintenance
bundles match its normal build; the diagnostic changes add PID/byte-count error
context and a bounded private causal report before rethrowing. A read-only reviewer
found no further concrete defect in this scoped evidence. Synthetic Kubernetes
responses, private PAM configuration and initial backup history remain explicit
fixture inputs; this does not prove the complete maintenance lifecycle.

The subsequent `native-h3-normal-final` uses all twelve normal CLI artifacts,
byte-identical to the prior sealed client-role checkpoint. It exits1 before
client launch: the writer census refuses an incomplete process mount observation,
and the canonical journal stays failed/fenced with resume phase reconciled.
Earlier causal diagnostics independently locate that refusal in the writer
census. Its cause remains unresolved; no production check was weakened or changed.
A local process-exit experiment yielded EINVAL instead of an empty mount table,
and a separate host process observation found no empty tables; neither explains
or clears the failed rehearsal. Do not count the diagnostic positive as normal
artifact readiness. All504 previously sealed repository source pins still match
before this verification-record update.

The complete installed lifecycle, provider backup accounting and bounded
prune/independent restore, alert delivery/watchdog, final exact-SHA host gate and
live safeguard activation remain unverified. This checkpoint does not mark any
additional implementation slice complete. No product migration, old-PVC removal,
commit, push or live registry change was performed. Broad repository tests, lint,
typecheck and the host gate were not rerun for this evidence-only update.

The failed normal run and earlier diagnostic failures are preserved in their
local evidence archives. Their remote disposable workspaces and source stages
are closed after exact claim, tree, ownership, inode and hash audits. The normal
run closure detaches exactly five owned inactive loop devices and independently
confirms no active client scopes or host mounts before removal.

### 2026-11-01 — mount selection and restricted-view review

Task4.2 remains open. The preceding continuation made concrete progress: the
checked-in restricted-view census and real-kernel chroot fixture now exist, and
`/tmp/task8-installed-client/writer-owning-tests.log` records3300pass,2skip,0fail.
That broad run is historical evidence; its two restic-dependent tests are not
passes and the normal installed lifecycle has not been rerun on the changed code.

This continuation independently found the local sandbox's covered and visible
`/proc` mounts at the same pathname. The old longest-path selector chose device
0:26 while the actual descriptor resolves to0:97. A fresh focused run produced
15pass/6fail before the fix, refusing `Registry mount is absent from process
namespace`. The selector now uses the actual storage descriptor's kernel mount
ID and stat device, verifies the corresponding path, and closes the descriptor
before scanning processes. Final focused checks and guard witnesses are recorded
in the component report `/tmp/registry-mount-selection-20261101.md`.

The independent read-only review in
`/tmp/registry-writer-review-20261101.md` identifies two unresolved static
counterexamples to the separate empty-view admission policy: root/cwd can share
dev/inode through different bind mounts, and retained filesystem-changing
capabilities can invalidate confinement. Neither is an observed runtime proof in
this continuation. They must be resolved and proved before readiness or activation.
The prepared alias fixture previously omitted `alias` from its mode list; its
`chroot-alias-red` archive actually ran the original ten modes and is not an alias
negative. The corrected prototype includes that mode and builds successfully.

The remote corrected proof did not execute. Automatic approval review rejected
root execution through `/tmp/puni-registry-ssh` to10.1.0.2 because destination and
source-payload authorization were not established for that action. Explicit user
approval was requested and remains pending. No alternate remote execution route
was used. No live registry, product, PVC or remote fixture was changed this turn.

Full installed maintenance/recovery, physical provider backup accounting and
bounded prune/independent restore, monitoring delivery/watchdog, the final exact-SHA
host gate and live activation remain required. No additional task is checked off.

Fresh component verification finishes37pass,0fail,68assertions in the writer
suite (`/tmp/registry-writer-focused-final-20261101.log`). The implementer's
caller-completion run finishes54pass,0fail, and its local two-case kernel thread
rehearsal confirms both owned child groups reaped. Six named guard/dependency
removals fail the original observers; missing/unreadable descriptor observations
and ordered dual observation/close failures are distinguished. The independent
scoped review accepts this additive correction while leaving both empty-view
findings open. Owning typecheck, scoped two-file lint and formatting pass; their
commands/output and exact final source hashes are in the component report.

The normal uncached `tool-fleet:build` Nx target succeeds. Its existing ignored
output directory also contains four earlier top-level artifacts, which were
preserved. Replaying the exact configured build command with only a fresh owned
output path emits exactly twelve new CLIs; source/artifact pins are in
`/tmp/registry-writer-build-pins-20261101.json`. No stale directory artifact is
represented as a fresh output. Strict change validation passes1/1 and all OpenSpec
validation passes284/284. Updated-document formatting and `git diff --check` pass.
The corrected alias prototype was rebuilt from the current writer source; it has
not been executed remotely.

Not rerun for this component: the full fleet test suite, full source lint,
repository-wide format/test/lint/typecheck/build gate, remote chroot/installed
lifecycle, restic-dependent cases, provider prune/restore or live alert delivery.
These remain required at their owning implementation/activation checkpoints.
The backup-readiness audit in `/tmp/registry-backup-readiness-20261101.md` confirms
both production budget/provider ports still refuse. It identifies the next real
provider census/admission slice and the need to verify repository identity and
locks before any destructive prune effect, rather than placing pruning in the
current repeated pre-verification admission callback.

### 2026-11-01 — restricted-view path, credential and descriptor authority

The previous goal turn is PROGRESS: its descriptor-selected mount correction and
proofs changed production state. This continuation implements the remaining
static path/credential corrections; Task4.2 remains open and no task is checked off.

Root/cwd are now observed through held read-only directory descriptors. Their
actual descriptor mount IDs must agree in addition to device/inode, host-root
filesystem and storage separation constraints. Nested operation/cleanup ownership
closes both descriptions before the process descriptor census and preserves
simultaneous observation/close errors. Local Node/Bun exposes O_DIRECTORY but not
O_PATH, so missing directory read permission refuses; there is no invented flag
or pathname-stat fallback. `/tmp/registry-writer-path-identity-20261101.md` records
30 new caller regressions, baseline0pass/30fail, final67pass, and11 individually
failing guard/dependency witnesses. The alias ID port is modeled; this does not
establish an actual bind-mounted sentinel-write proof.

`assertUnprivilegedProcess` validates the initial and final status samples used
by the empty-view audit. Every UID must be nonzero and valid uint32; effective,
permitted and ambient capabilities must be empty; NoNewPrivs must be1. Inheritable
and bounding masks are syntax-validated but can retain bits. Required fields must
be unique, single-line and complete. The1MiB UTF-8 text limit bounds parser work,
not read allocation. Source-owned JSDoc links the kernel NoNewPrivs contract and
capability/status documentation. First caller RED returned false absence; final
combined147pass follows14 modeled production-path removal witnesses, including
both status samples. Detail: `/tmp/registry-writer-privileges-20261101.md`.

Independent review then found that current credentials do not exclude authority
retained in descriptors. Empty views now classify every surviving non-directory
FD before storage-device filtering, rejecting namespace, anonymous-inode and PID
filesystem classes. Actual local namespace, eventfd and pidfd objects each produced
false absence before this change. The current kernel reports pidfds as PIDFS
(0x50494446), not the older anonymous-inode class; both representations are covered.
The1MiB status limit, descriptor types and disappearance handling retain explicit
negative coverage. Eleven further removals fail the original observers; final
writer/profile cases169pass. Actual objects and statfs classification are real;
their process-census status/root/cwd port remains modeled. An eventfd proves
conservative opaque-class refusal, not that an eventfd grants namespace authority.
Report: `/tmp/registry-writer-descriptor-authority-20261101.md`.

The independent combined review is
`/tmp/registry-writer-isolation-review-20261101.md`. Its initial path/credential
findings are corrected in source; its namespace-authority finding prompted the
classification above. A further privileged-proof review was blocked by the tool's
cybersecurity filter. That extension was stopped rather than rephrased or routed
through another reviewer. Socket descriptor authority completeness and the final
native authority proof therefore remain unverified; no complete isolation review
or activation approval is claimed from these local corrections.

The checked-in native fixture now prepares13 enumerated modes, including the
previously omitted bind-alias case and retained-effective/permitted-capability
cases. Readiness frames check actual root/cwd identities and credential profiles.
Owned write paths stay in an accessible subtree without loosening root0700
workspace custody. Capset/get ABI is checked if run. The proc-magic case uses a
same-UID/dumpable supervisor handshake; mmap retains trackfd=False. Python syntax,
Bun bundling and the expected non-root entry refusal were observed. All13 root
cases, actual writes, ABI/proc premises and removal witnesses remain UNRUN. The
exact local /usr/bin/python3 is3.12 and lacks trackfd=False; no compatibility
fallback was added. A proposed15-mode extension was stopped before any source
edits; the sealed13-mode source hashes still match. Preparation:
`/tmp/registry-writer-chroot-preparation-20261101.md`.

The prior automatic rejection of root proofs through the existing SSH helper to
10.1.0.2 is still in effect and explicit user approval remains pending. No remote
root command, alternate route, new remote fixture, live registry change, product
migration, PVC deletion, commit, push or notification was performed here. Local
unprivileged descriptor and thread experiments are distinct from those root proofs.

Backup research is now linked beside the design at
[registry backup accounting](../../../docs/findings/registry-backup-accounting.md).
It follows official S3 pagination, versioning/deletion, restic0.19.1 and provider
billing sources. Neither the registry's current provider identity nor a complete
fresh physical/billable-byte upper bound was authenticated in this continuation.
Payload Size alone cannot substitute for metadata, versions and multipart
accounting. Current provider/admission stubs remain closed. No transport dependency,
prune effect or new billing guarantee was installed; Task4.3 remains required.

Full installed maintenance/recovery and its actual retained-content pulls,
complete physical backup admission/retention/prune/independent restore,
notification delivery/watchdog, the final exact-SHA host gate and live activation
remain required. These local guards and research do not replace any of that scope.

Fresh final owning verification: `PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1
bunx nx run tool-fleet:test --skip-nx-cache` completes3450pass,0fail,0skip,
14110assertions across214files in562.30s. The binary's fixed lock SHA256 and
restic0.19.1 version were checked before the run and its hash remained unchanged
afterwards. Both previously conditional encrypted-lock and verified-snapshot/
corrupt-pack native tests ran and passed; no two-skip substitution is made.
All480 recorded owning source/configuration pins remain unchanged throughout.
Output: `/tmp/registry-isolation-owning-tests-20261101.log`; pins:
`/tmp/registry-isolation-owning-inputs-20261101.json`.

The final uncached owning lint/typecheck/normal twelve-CLI build also succeeds:
`bunx nx run-many -p tool-fleet -t lint,typecheck,build --skip-nx-cache`,49.1s,
`/tmp/registry-isolation-owning-final-checks-20261101.log`. The first attempt to
launch this check never created a process because automatic permission review
timed out; the one explicitly permitted identical retry ran successfully. A
separate fresh output directory contains exactly12CLI builds from the configured
command, pinned in `/tmp/registry-isolation-build-pins-20261101.json`. Earlier
ignored dist artifacts were preserved. Initial focused/caller coverage164pass
and the two-case local kernel thread rehearsal also pass; later namespace-class
regressions are included in the final3450-case owning run.

Strict change validation1/1 and all OpenSpec validation284/284 pass; explicit
format checks cover the five changed TypeScript files and four affected documents.
Python fixture syntax is checked without executing it or writing bytecode.
`git diff --check` passes. The extra benign changed-code review in
`/tmp/registry-descriptor-code-review-20261101.md` finds no blocking ordering,
cleanup, type or error-propagation defect and independently runs22added cases,
0fail,52assertions. It is distinct from the stopped additional privileged-proof
analysis; no flagged request was rephrased or retried. This scoped review does
not establish complete descriptor authority. Its regular/FIFO controls cover
cross-device acceptance, not same-device writable-descriptor behavior under a
real restricted root; the pending native descriptor/mapping cases own that proof.

Not performed: the13-mode root rehearsal or its native guard-removal matrix,
complete descriptor-authority/installed lifecycle proof, actual provider physical
accounting and bounded prune/independent restore, live alert delivery/watchdog,
repository-wide exact-SHA host gate, commit/push/integration or production activation.
No new registry safeguards are claimed live from this checkpoint. All four open
slices and the original no-product-migration constraint remain unchanged.

## Authenticated S3 census and raw-lock adapter — 2026-11-01

Task 4.3 prerequisite implemented in the existing isolated worktree, based on
`6c0d58e45db2f85b55f007f89888f32590b41837`. Task 4.3 remains unchecked; the full
change remains 7/11. Official `@aws-sdk/client-s3` is pinned exactly to 3.1161.0
in package.json and bun.lock. `bun install --frozen-lockfile --ignore-scripts`
exited 0: 1,826 installs/1,673 packages checked, no changes. Lifecycle scripts
were deliberately not run for this local dependency check; the eventual canonical
host gate still owes its normal frozen install and complete gate.

`createRegistryS3Store` now uses actual SDK signing/commands through a bounded
Request/Response port. It enumerates all scoped object versions/delete markers,
unfinished uploads and parts, and performs exact-version GET/DELETE. Explicit
credentials/region/defaults exclude ambient SDK discovery. Strict XML validation
precedes SDK coercion; absent repeated collections mean empty only after required
scope, root and truncation validation. Finite bounds cover response headers/body,
aggregate bytes/records/requests and request/method cancellation deadlines. SDK
construction, destruction, response cancellation and cleanup failures are covered;
cleanup is awaited, so abort deadlines are not unconditional return-time promises.

The root adapter derives scope from trusted repository configuration, forwards the
installed journal path and original signal, and checks the held canonical authority
before EVERY wire request. Full prefix census, every current/history lock ciphertext
read and metadata bookends share one cancellation deadline. Exact ciphertext size,
SHA256/name and stable complete history are required. Visible-only exact deletion
requires fresh identity and recensus proving that version disappeared. Existing
dead-attempt ownership/origin exclusion remains mandatory. Provider transport is
implemented; `admitRegistryBackup` remains closed. `payload-only` totals exclude
provider metadata/minima and never authorize the physical 100 GiB budget.

Production-consumer RED/GREEN evidence includes actual signed empty/paginated
successes, malformed HTTP-200 XML, missing scalars/continuations, wrong scope,
noncurrent history, multipart parts, byte/count/request overflow, cancellation,
lost authority during a versioning preflight and changed metadata/ciphertext.
The root UID, inherited kernel-lock and timer authority seams are modeled. These
tests do not prove actual root authority, native provider semantics or billing.

| Boundary / injected fault                                                                                                                                                                                              | Observed proof                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing version ID/size or lexical empty scalar defaults, malformed root/DTD/attributes, wrong scope/encoding, duplicate/latest history, missing pages, parts progress, safe totals and response/record/request bounds | Disposable production SDK copies failed their controlled wire tests with guards removed or dependencies broken; adjacent Proof comments identify the tests. Original evidence: `/tmp/registry-backup-s3-census-20261101.md` and `/tmp/registry-s3-mutations/`, `/tmp/registry-s3-lifecycle-mutations/`. |
| Method cancellation timer removed                                                                                                                                                                                      | Actual SDK wire test timed out at its 65-second watchdog, rather than observing the required 60-second cancellation; original green took 60.16 seconds. `/tmp/registry-s3-total-deadline-{green,mutation}.log`.                                                                                         |
| SDK constructor/destructor or simultaneous operation/cleanup failure, body cancellation and primary/cause ordering broken                                                                                              | Isolated SDK consumer children and controlled streams failed their covering tests; final cleanup/error tests pass. No external diagnostic text is retained.                                                                                                                                             |
| Ambient SDK configuration dependence                                                                                                                                                                                   | Poisoned fake configuration child was observed RED, then GREEN after explicit SDK defaults. No file-access trace establishes whether earlier development calls attempted ambient config reads; real credentials/helpers were not intentionally inspected.                                               |
| Ten cursor direction/cycle/page-key-order/echo guards removed                                                                                                                                                          | 10/10 isolated SDK consumer negatives failed, including empty truncated pages and request-count assertions before followup. `/tmp/registry-s3-round1-mutations/report.json`.                                                                                                                            |
| Invalid returned-page cursor membership requirement reintroduced                                                                                                                                                       | Both official-contract success controls failed. These two observations establish compatibility regressions, not valid safety guards. The old membership-specific negative/proof is RETIRED; do not describe the original 49 observations as 49 valid safety proofs.                                     |
| Root authority, cancellation, scope, revision/ownership, shared cycle deadline, ciphertext/hash/size/count/metadata bounds, stable history, exact visible deletion and forwarding fields removed/broken                | 22/22 disposable production consumer mutations caught; `/tmp/registry-provider-proofs-20261101/proofs.json`. Count/serialized-size wrapper witnesses deliberately inject an oversized SDK producer; they are dependency faults, not real-wire provider observations.                                    |

Independent review found one P2 compatibility error: requiring each supplied
continuation tuple to appear in its preceding page. AWS documents first-unreturned
version cursors. Round 1 removed that assumption for versions and multipart uploads,
retaining opaque IDs and explicit scope/echo/direction/cycle/duplicate/bounds checks.
Five positive controls failed before the correction. Re-review accepted the fix
with no new concrete defect: 25 pass, 0 fail, 56 assertions, 101 deliberately
filtered cases; frozen hashes unchanged. Review report:
`/tmp/registry-backup-s3-review-20261101.md`.

Focused final integration after the correction: 167 pass/0 fail/442 assertions,
one deliberately filtered unchanged actual 60-second timer case. The complete
owning test target below is required to cover that case. Earlier scoped provider
integration ran 200 pass/0 fail/505 assertions with the prior core revision; this
is historical scope evidence, not the final-source owning receipt.

Fresh parent checks on the frozen owning source/config:

```sh
NX_DAEMON=false bunx nx run tool-fleet:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:build --skip-nx-cache
bunx openspec validate bound-registry-storage --strict --json
bunx openspec validate --all --json
```

All exited 0. Lint had no findings; forced TypeScript build had no diagnostics.
The owning build bundled 517 modules. A second build using the exact configured
entrypoint list and a fresh output directory produced exactly 12 expected JS
entrypoints; every artifact was below the 16 MiB staging cap. The actual backup
worker was 1,704,065 bytes. Existing unrelated legacy dist files were preserved.
Strict OpenSpec: 1/1; all OpenSpec: 284/284 (266 changes, 18 specs), no failures.
Logs: `/tmp/registry-s3-owning-{lint,typecheck,build}-20261101.log`,
`/tmp/registry-s3-cli-build-20261101.log`,
`/tmp/registry-s3-openspec-{change,all}-20261101.json`.

Frozen source SHA256:

| File                                | SHA256                                                           |
| ----------------------------------- | ---------------------------------------------------------------- |
| registry-s3-census.ts               | 3590af434efa1e828e32471c1bd9cfb12bab5daa14fc06c0da660cd4b1ef5b3a |
| registry-s3-census.test.ts          | 6bfc1c2c39d0fc0b7662ff2a78e9932eaba3dd50a936e92e096e8cef336baa3f |
| registry-s3-census.fixture.ts       | 8fa2298039304ed14120cb4c35fce325554b2f99436beb58e0e6bf8d39587099 |
| registry-s3-lifecycle.fixture.ts    | b40b045ddb8eac18de895da654141043de2902037f7946070d5b9a7edbf312c2 |
| registry-backup-provider.ts         | f0c18713f3e8ebeb211af73d557d570437a22fd89b401fb1bcdec307789053da |
| registry-backup-provider.test.ts    | 8e968afb358ce57febb40e1e45cb5286939a231ca4f370e15fcdfea818e534d8 |
| registry-backup-provider.fixture.ts | e3f7deba17742ef359910daed11c9d7b9f53b9c068f56fc1255d2484dbb9f775 |
| registry-maintenance-backup.ts      | 76ea43a2a847299440b72f3268b15f96cfdf1f11989298772a3e78f797958ab2 |

No live bucket/provider/notification call, remote/root proof, product migration,
PVC change, activation, commit or push was performed. The earlier automatic
approval rejection for remote root proofs remains pending the user's response;
no alternate remote/root route was attempted. A proposed permanent removal of
wrapper count/metadata guards was also rejected automatically and did not run;
the guards remain and broken-producer tests prove them. Prior privileged-proof
work stopped by the cybersecurity filter was not resumed.

Remaining required work: actual provider scope/authentication and conservative
physical billing contract; source/new-content and prune/repack workspace bounds;
100 GiB admission, seven daily/four weekly coverage, explicit recovery pins and
last-verified protection; exact retention/reclamation plus kept post-prune restore;
complete native isolation/authority proofs, installed recovery and monitoring
delivery, complete lifecycle rehearsal, exact-SHA canonical host gate and activation.
Payload census and local fixtures close none of these remaining obligations.

Final owning test receipt for the frozen S3 continuation:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 NX_DAEMON=false bunx nx run tool-fleet:test --skip-nx-cache
```

Exit 0: **3,618 pass, 0 fail, 0 skip, 14,556 assertions, 216 files, 660.00
seconds**. Log `/tmp/registry-s3-owning-tests-20261101.log`. All **489** owning
source/config pins in `/tmp/registry-s3-owning-source-pins-20261101.json` were
unchanged through target completion. No cached test result was used.

Fresh restic pin before launch:
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`;
`restic 0.19.1 compiled with go1.26.4 on linux/amd64`. Both conditional real-restic
cases actually ran: encrypted foreign-lock preservation/current-repository and
ciphertext refusal (8,246.03 ms), and both backup content roots/matching-journal
verification plus corrupt-pack refusal (10,578.31 ms). This does not establish
post-prune restore or physical S3 semantics. The actual S3 whole-method deadline
case also ran and passed at 60,004.74 ms; it was not filtered or replaced by fake
clock advancement in this owning run.

Prettier checked 369 changed tracked/untracked supported files; all passed. These
include new untracked SDK/provider files that `git diff --check` alone cannot
cover. The appended verification record receives a final formatting check after
this receipt. `git diff --check` passed. These are owning/local receipts, not the
required exact-SHA canonical host gate or activation evidence. All four remaining
task boxes stay open.

## Snapshot catalogue and retention inspection — 2026-11-01

Read-only Task 4.3 prerequisite implemented and independently accepted in the
existing isolated worktree at base HEAD `6c0d58e45db2f85b55f007f89888f32590b41837`.
Overall progress remains **7/11**; Task 4.3 is unchecked. Physical admission still
refuses. No prune, forget, snapshot DELETE or budget grant was introduced.

`store.inspectRetention` verifies the immutable configured repository, held
authority, unfiltered authenticated restic catalogue and complete stable raw S3
snapshot-version/marker bookends. Every current visible object must match one
logical full snapshot ID. Last-verified roots, bytes, time and exact dumped journal
SHA256/revision must agree. Required protection inputs are copied before callbacks;
repository and authority are rechecked before return. One 60-second cycle signal
covers provider observations and existing bounded subprocess cleanup. Deadlines
initiate cancellation; delayed dependency cleanup is not a hard-return guarantee.

Root-only hash-pinned backup configuration now requires explicit unique full
`recoveryPins`, including an explicit empty list, bound to the immutable repository.
Preflight and snapshot creation inspect retention after admission and existing raw
lock/repository verification, before preparation/new snapshot. Normal restic list
locks themselves write provider content; inspection grants no write/prune authority.
Verify/restore/reconcile retain their prior flow. Provider observation uses the
actual SDK full census with original authority checks and combined root/retention
cancellation; exact snapshot names, unfinished uploads and finite output bounds
are checked. The disposable local observer is current-file-only, never production
fallback or evidence of S3 version semantics.

Selection keeps the latest exact point in seven represented UTC day buckets/four
Monday UTC week buckets, across stable registry hostname and registry path changes,
plus lastVerified and explicit pins. Incomplete coverage preserves ALL snapshots
and produces no eligible IDs; only independently admitted creation may build
coverage. Rulings and their costs are recorded in the SDD ledger/design. Two
explicit scenarios were added; fresh source count is **17 requirements and 28
scenarios**, superseding historical scenario-count notes. Logical selection is
not proof that effectful pruning preserves these protections.

Parent reproduced order-dependent canonical hashes for two distinct opaque IDs
(`é` and `e\u0301`) that localeCompare treated as equal. The production store
regression failed before exact code-unit ordering and passed afterward, preserving
the original IDs. A parent repeat also passed: `/tmp/registry-retention-parent-unicode-20261101.log`.
Actual pinned restic accepted year0000; an overstrict refusal and truncated signed
UTC dates were corrected with actual binary/consumer evidence. These witnesses
prove compatibility regressions, not desirable safety checks.

Observed RED/GREEN starts: store method absent (0 pass/19 fail), provider/parser
port absent (64 pass/11 fail), root retention call absent (4 pass/6 fail), local
observer absent (9 pass/13 fail). Subsequent coherent witnesses also caught
mutable protection inputs, a final callback releasing held authority, and a future
sample time authorizing future points. Invalid early fixture counts, scratch
paths/permissions and too-short mutation watchdogs were corrected and excluded
from valid proof totals; no production guard was weakened to make them pass.

| Boundary / fault family                                                                                                                                                                                                                       | Observed evidence and scope                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory pin/receipt inputs, copied protection state, uniqueness/presence, full physical row/current completeness, snapshot parser/identity/ownership/paths, safe arithmetic, calendar/nanoseconds/bootstrap, repository and journal binding | 32/32 final-source disposable core faults caught via actual `store.inspectRetention` consumers; `/tmp/registry-retention-mutations/report.json`.                                                                                                                           |
| Final authority/repository, configured identity, canonical journal, oversized stdout, operation tag, independent coverage minima, permissive Date.parse and actual deadline                                                                   | 10/10 earlier extra core faults caught; `/tmp/registry-retention-mutations/extra-report.json`. The Unicode/year correction came later; the report states this revision scope rather than claiming every campaign was rerun.                                                |
| Unicode order, year0000/signed UTC compatibility regressions, future sample, receipt paths/bytes/journal/time and week/timezone policy                                                                                                        | 10/10 final-source faults/regressions caught; `/tmp/registry-retention-mutations/final-report.json`. Campaigns overlap and are not 52 unique safety checks.                                                                                                                |
| Actual retention deadline extended to 120 seconds                                                                                                                                                                                             | Real consumer hit its 65-second failure watchdog, after the original green observed approximately 60-second cancellation. This witness did not substitute a fake clock.                                                                                                    |
| Provider signal/scope/names/uploads/safe-byte/count/metadata/deadline/authority, required bounded unique pins, root call/lastVerified/configured-pin forwarding, local directory/read/hash/identity/authority/cancellation                    | 27/27 disposable faults caught; `/tmp/registry-retention-integration-proofs-20261101/proofs.json`. Oversized SDK/readdir producers and root/kernel/timer seams are explicitly modeled; other wire/local-file witnesses use actual signed SDK or ordinary-user files/flock. |

Adjacent Proof comments name observed tests. Required-pin absence is serialized
without a property; the missing-receipt witness requires its exact sentinel so a
different downstream refusal cannot masquerade as proof. Some redundant identity
or required-field protections are deliberately broken together; reports identify
that scope. No claim that every fault is a unique individually removed guard.
Implementation reports: `/tmp/registry-retention-store-20261101.md` and
`/tmp/registry-retention-integration-20261101.md`.

Frozen-source focused checks:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-backup-retention.test.ts tools/tool-fleet/src/registry-backup-store.test.ts
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-backup-retention-action.test.ts tools/tool-fleet/src/registry-backup-provider.test.ts tools/tool-fleet/src/registry-maintenance-backup.test.ts tools/tool-fleet/src/registry-backup-local.test.ts
```

Both exited 0: **44 pass/0 fail/0 skip/146 assertions/96.78 seconds**, then
**113 pass/0 fail/390 assertions/15.73 seconds**. Logs:
`/tmp/registry-retention-final-tests-20261101.log` and
`/tmp/registry-retention-integration-tests-final.log`.
Actual real-restic missing/corrupt/unreadable snapshot ciphertext case and existing
both-root backup/restore/corrupt-pack case ran. The real retention cycle deadline
ran at 60,004.58 ms. Binary freshly checked before/after native work and by parent:
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`,
`restic 0.19.1 compiled with go1.26.4 on linux/amd64`.

Independent combined review accepted with no concrete defect. Its fresh six-file
run passed **156/0 fail/534 assertions/51.82 seconds**, filtering only the permitted
unchanged actual 60-second retention-cycle case; both actual-restic cases ran.
Initial identical default-sandbox run failed ten positive subprocess consumers
because of the known controlled pipe restriction; that terminal failure was
followed by an approved scoped ordinary-user rerun on unchanged source. No remote
or root operation was part of the escalation. Review and test logs:
`/tmp/registry-retention-review-20261101.md`,
`/tmp/registry-retention-review-focused-escalated-20261101.log`.
All 14 source pins matched before/after. Existing untracked modified files had no
captured original byte copies; full source was reviewed without inventing a diff.

Fresh parent owning checks:

```sh
NX_DAEMON=false bunx nx run tool-fleet:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:build --skip-nx-cache
bunx openspec validate bound-registry-storage --strict --json
bunx openspec validate --all --json
```

All exited 0: lint no findings (64 s), forced TypeScript no diagnostics (3.6 s),
configured CLI build succeeds. A fresh output directory using the exact configured
entrypoint list contained exactly **12** expected JS artifacts, all below 16 MiB;
actual backup worker **1,718,326 bytes**. Legacy dist files were preserved.
Prettier checked **374** changed tracked/untracked supported files; all passed.
Strict OpenSpec **1/1**, all **284/284**, no failures; `git diff --check` passed.
Logs `/tmp/registry-retention-owning-{lint,typecheck,build}-20261101.log`,
`/tmp/registry-retention-cli-build-20261101.log`,
`/tmp/registry-retention-changed-format-20261101.log`,
`/tmp/registry-retention-openspec-{change,all}-20261101.json`.
The evidence append and any subsequent research note receive a final explicit
format/spec check after the full owning test receipt below.

Reviewed frozen source SHA256:

| Path                                                             | SHA256                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| tools/tool-fleet/src/registry-backup-local.fixture.ts            | aa53d90177a188110423f769c81179dd0002763d4e648b0f8ece57f730ff0f6c |
| tools/tool-fleet/src/registry-backup-local.test.ts               | b1dd7ab8ee61337f0806eb652a22e5390f7d6545458a481f6f1181fe89aa5506 |
| tools/tool-fleet/src/registry-backup-provider.fixture.ts         | f6b1a407b6f5a20d5ee26e0136d6065b201d40fe62bdf904736fe7c8911f2dbc |
| tools/tool-fleet/src/registry-backup-provider.test.ts            | b164c0236f551a84a79fc277ec05431cca30292ad31378378f5054e5e96477df |
| tools/tool-fleet/src/registry-backup-provider.ts                 | c53007c56ea46dae5142dd790fe9d7c0f18d7499ce04d6ec4a01f0c8e5e72750 |
| tools/tool-fleet/src/registry-backup-retention-action.fixture.ts | 95e021331cd9f3b8ce585c445c3226a94bff09282aa8212813c743edfb318191 |
| tools/tool-fleet/src/registry-backup-retention-action.test.ts    | da0f2d01a054d589111c66b617143833f0247490203cef07a7422c2397b5b5b6 |
| tools/tool-fleet/src/registry-backup-retention.fixture.ts        | 11b180751863817a04780d55db6fc5d1de3d41287e501c2d4d2db1fe67497ae5 |
| tools/tool-fleet/src/registry-backup-retention.test.ts           | 0587ada82e1204271766037dd73be50434172707a464a99823580f0a4ca2219a |
| tools/tool-fleet/src/registry-backup-retention.ts                | 86a7eb31aab35140d37c4ef8676dd476962a47f1ba8599c69ea0a9b49ca91756 |
| tools/tool-fleet/src/registry-backup-store.ts                    | 45d8e25d524788163016a9df9d2be92b8097a508b52036e55b3f491bedf3c561 |
| tools/tool-fleet/src/registry-maintenance-backup.test.ts         | 74c85b6964375801ac107df5e466d430ccd6be53bda5f8cea874fcf8ffa94b59 |
| tools/tool-fleet/src/registry-maintenance-backup.ts              | bb5caaad23e3c78da3439cb08ac09e7621f6f215959191c0799bc93cf750e2a9 |
| tools/tool-fleet/src/registry-maintenance-host.fixture.ts        | 655ca91b986a5e0e556bb174fdff976d0fa57354eb514a7f10fc728f0768e79d |

The parent full owning test target is being observed separately on **494** frozen
source/configuration files in `/tmp/registry-retention-owning-source-pins-20261101.json`.
Its terminal result is recorded below when available, with every deadline/native
case enabled. The scoped review filter does not substitute for that receipt.

Still required: authenticated live provider/scope and conservative physical billing
contract; source/new-content, restic-lock, download and prune/repack/local workspace
envelopes; physical 100 GiB admission; durable exact-ID effect authority, protected
logical/physical reclamation and retained post-prune restore; complete installed/
native isolation/authority/recovery, monitoring actual delivery, full lifecycle
rehearsal and exact-SHA canonical host gate/activation. Finite catalogue/stdout
limits do not establish physical download/workspace bounds.

No live provider/remote/root/notification call, credential/helper read, product
migration, PVC change, activation, commit or push was performed. The generated
root/native fixture received only `recoveryPins: []`; it and its native caller were
not executed. The earlier remote root proof auto-review rejection remains pending
the already requested approval; no alternate route or filter-stopped privileged
analysis was attempted. All four remaining task boxes stay open.

Final full owning receipt for the reviewed retention source:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 NX_DAEMON=false bunx nx run tool-fleet:test --skip-nx-cache
```

Terminal exit 0: **3,712 pass, 0 fail, 0 skip, 14,866 assertions, 218 files,
964.73 seconds**. Log `/tmp/registry-retention-owning-tests-20261101.log`.
All **494** source/configuration pins were unchanged through completion; no cached
test result or earlier source revision supplies this receipt. No timer filter was
used. Actual S3 method deadline: **60,005.15 ms**; actual whole retention cycle:
**60,014.15 ms**. All three conditional pinned-restic cases actually ran: encrypted
foreign-lock/current-repository/ciphertext refusal (**16,580.54 ms**), existing
both-root backup/restore/corrupt-pack refusal (**12,067.89 ms**), and new catalogue
missing/corrupt/unreadable ciphertext refusal (**15,012.98 ms**). These are local
ordinary-user evidence, not provider billing, root isolation or post-prune restore.

The separate [source/workspace research](../../../docs/findings/registry-backup-workspace.md)
is now linked from the accounting note and design. It follows pinned primary
restic/chunker/compression/MinIO/backoff sources and separates conditional
arithmetic from proposed inputs and unexecuted proofs. Exact binary plus allowlisted
environment fixes several defaults; absent explicit flags alone are not unknown
behavior. Logical sparse-file bytes, directory-entry/metadata/tree shape, historical
repository shape, composed retry/lock writes and open/unlinked scratch/memory
enforcement still need production evidence. A file/allocated-byte sum, target pack
size, no-cache flag or human prune dry-run cannot supply those complete envelopes.
No formula in that research opens admission or proves the 100 GiB limit.
Research handoff: `/tmp/registry-backup-workspace-research-20261101.md`; it performed
public source reads and scoped documentation formatting only, no runtime or safety
mutation experiment. Parent independently reread the pinned retry/backoff and
packer lifecycle source. Proposed record/effect interfaces remain unimplemented.

Final explicit format/spec checks include the appended receipt and new untracked
research note. These local owning receipts do not substitute for the unrun
exact-SHA canonical host gate, full lifecycle/installed proofs or activation.
Overall 7/11 and all four remaining task boxes are unchanged.

Final documentation recheck exited 0: Prettier checked **375** changed tracked/
untracked supported files, including the new workspace note; strict OpenSpec
**1/1**, all **284/284**; `git diff --check` passed. Final logs:
`/tmp/registry-retention-final-format-20261101.log`,
`/tmp/registry-retention-final-openspec-{change,all}-20261101.json`.
All **494** source/configuration pins still match. Only this verification receipt
is appended after those checks; its own formatting/whitespace is checked again.

## Stopped-source observation and phase admission — 2026-11-01

Task 4.3 has a reviewed source-observation prerequisite; the task remains unchecked.
Overall progress remains **7/11**. This continuation changes the actual store and
root action, their consumers, the source observation contract and its evidence.
It does not establish physical 100 GiB admission, bounded retention effects or
activation. Worktree `/home/df/.codex/worktrees/66b0/puni-00`, branch
`feat/registry-storage-workflows`, unchanged HEAD
`6c0d58e45db2f85b55f007f89888f32590b41837`.

`RegistryBackupAdmission` now discriminates inspection from snapshot requests.
Inspection carries independent source capacity inputs and covers normal restic
inspection lock effects; the misleading `maximumNewBytes` capacity sum is removed.
Snapshot admission additionally receives a typed source observation. Preflight
precedes writer fencing, so it deliberately does not scan a supposedly stable
source. The actual root snapshot action requires the canonical stopped phase,
fresh census and no prior operation snapshot. Store snapshot captures source and
explicit per-root limits before awaits, observes both roots, freezes the evidence
and retains a private expected hash. After snapshot admission and binary pin
validation it reobserves source/authority immediately before backup launch. A
callback cannot rewrite that baseline. Independent writer exclusion must still
hold throughout observation, copying and verification.

Required root configuration now supplies separate registry/journal `sourceLimits`:
logical bytes, entries, depth, fanout and accounted raw metadata. Missing limits
refuse snapshot creation; read-only direct store consumers may omit them. Absolute
parser caps are 1 PiB logical bytes, one million entries/fanout, depth 128 and
256 MiB accounted metadata per root. These are finite computation ceilings, not
defaults, process RSS enforcement, encoded-tree allowances or physical admission.

The Linux observer incrementally enumerates raw Buffer names, sorts bytewise,
uses raw symlink targets and caller-visible xattr names/values, counts hardlink
paths independently and charges logical sparse-file lengths. It records exact
root device/inode, canonical operation/registry/storage/revision/census, bounded
journal SHA-256, required finite native-width stat fields, raw length/count maxima,
sorted UID/GID sets and fresh chunk-reference bounds at the pinned 512 KiB minimum.
The return explicitly hashes `scope: contents-metadata-only` and
`xattrScope: caller-visible-only`. Linux enumeration may omit inaccessible xattrs;
complete reader visibility remains unproved. Atime is excluded consistently with
the current backup profile. Registry bodies are not read; the authority journal
is separately read/hashed with a 16 MiB bound. Awaited file/directory/libc cleanup
preserves primary and cleanup failures. Cooperative 60-second checks between
syscalls do not establish a hard blocked-kernel or memory bound.

The parent independently confirmed Bun 1.4.4 `opendir({ encoding: 'buffer' })`
returns raw Buffer names, including `ff`, rather than `Dirent.name`; the initial
provisional empty-enumeration interpretation was corrected. Ordinary-directory
receipts: `/tmp/registry-source-opendir-parent-20261101.log` and
`/tmp/registry-source-raw-dir-parent-20261101.log`. No libc dirent ABI was invented.

Ten existing source baselines were preserved before their edits; three files are
new. Full honest baseline diff, all 13 original/current/frozen pins and the exact
three-file review fix diff were checked by the independent reviewer. Artifacts:
`/tmp/registry-source-baseline-20261101`,
`/tmp/registry-backup-source-review-20261101.diff`,
`/tmp/registry-backup-source-pins-v2-20261101.json`,
`/tmp/registry-backup-source-freeze-v2-20261101`,
`/tmp/registry-backup-source-round1-20261101.diff` and implementer handoff
`/tmp/registry-backup-source-20261101.md`. The production physical adapter remains
byte-identical, SHA-256
`4091bcd331fb9d42a5afeffbc3c12f3600c6588dfcca67028a8c4443481612f4`, and
refuses every phase with `backup-budget-unavailable`.

Independent v1 review ran the six-file covering suite: **199 pass, 0 fail,
1 filtered, 788 assertions, 158.72 seconds**. It found two P2 boundary defects:
malformed journal read progress (`NaN`) created a verified actual snapshot, and
the initial root inode was coerced before stat validation. The second defect was
not a demonstrated snapshot bypass. Both were fixed together in review round 1.
Journal progress now must be a positive safe integer within the requested
remainder; root stat fields are validated immediately before identity conversion.
Ten actual-store malformed-progress negatives and two no-coercion root negatives
were observed RED on v1, then GREEN on v2: **12 pass, 0 fail, 100 assertions,
45.37 seconds**. They require the exact intended diagnostic, read/sample counts,
awaited cleanup, no snapshot grant and an authenticated empty snapshot catalogue.
A sentinel secondary read failure cannot substitute for the intended refusal.
A genuine three-byte partial-read positive creates/verifies an actual snapshot
and closes both journal observations: **1 pass, 7 assertions, 6.79 seconds**.
Logs `/tmp/registry-backup-source-round1-{red,green,root-red,partial}-20261101.log`.

Final v2 implementer covering command:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-backup-source.test.ts tools/tool-fleet/src/registry-backup-store.test.ts tools/tool-fleet/src/registry-maintenance-backup.test.ts tools/tool-fleet/src/registry-backup-retention-action.test.ts tools/tool-fleet/src/registry-backup-retention.test.ts tools/tool-fleet/src/registry-backup-provider.test.ts --timeout=120000 --test-name-pattern '^(?!.*whole retention observation cycle)'
```

Exit 0: **212 pass, 0 fail, 1 filtered, 895 assertions, 209.38 seconds**.
Only the unchanged actual retention-cycle timer is filtered; the parent full
owning target below owns its final unfiltered receipt. Log
`/tmp/registry-backup-source-round1-covering-20261101.log`.
Independent scoped re-review accepted both fixes, with no new defect in their
three-file diff. Its fresh source/actual-store subset: **47 pass, 0 fail,
33 filtered, 216 assertions, 68.66 seconds**; all 13 v2 pins unchanged. This
included every observer test, all 12 new negatives, the real partial-read control
and existing both-root backup/restore/corrupt-pack control. Review report and log:
`/tmp/registry-backup-source-review-20261101.md`,
`/tmp/registry-backup-source-review-round1-tests-20261101.log`.

R5: the initial frozen-v1 disposable control passed, then all 12 targeted faults
failed the intended production consumer assertions: required stat validation,
logical/entry/metadata/depth/fanout limits, same-device comparison, journal revision,
source reobservation, stat equality, final authority bookend and stopped phase.
Entry count removes both traversal/queue checks as one fault variant. Actual store
variants created snapshots when guards were removed; revision uses the production
observer, and stopped phase uses a modeled root-action port. Device/stat/authority
producers are controlled dependencies, not native kernel or installed proofs.
Index `/tmp/registry-source-proof-index-20261101.json`, runner
`/tmp/registry-source-prove-final.ts`; the reviewer inspected logs and did not
independently rerun mutations. Earlier alias-setup harness failure was discarded.

Round-1 disposable control passed; four condition faults broke the intended
consumers: safe-integer progress allowed NaN/absent counts to create snapshots;
missing remainder bound allowed excessive progress to create a snapshot; missing
positivity reached the forbidden second-read sentinel and failed the exact-error
assertion; missing immediate root validation broke no-coercion assertions.
Adjacent production `Proof:` comments name those observations. Index
`/tmp/registry-source-round1-proof-index-20261101.json`, runner
`/tmp/registry-source-round1-prove.ts`. Staged production source/store tests match
v2; the staged excessive-count fixture used `response.bytesRead + 1`, whereas
frozen v2 strengthens it to `length + 1`, with one other comment difference. The
logged mutant created an actual snapshot, so the watched failure is meaningful;
it is not represented as a mutation rerun using every final fixture byte.
The final stronger producer passes the fresh consumer/re-review suites.

The first broader default-sandbox run had 11 failures: one genuine missing
sourceLimits compatibility property and ten controlled subprocess stdout EPERM
failures. The property was fixed after baseline capture; identical ordinary-user
local escalation passed the unchanged subprocess consumers. No production check
was weakened. Native host/store fixture edits are solely the required config
literal; the source implementer/reviewer did not execute their native callers.
Existing local cases collected by the full owning target receive their separate
receipt below. Root-action tests model UID, artifact, store and provider ports.
Ordinary filesystem/restic tests do not prove host-root authority or independent
writer exclusion.

Fresh parent v2 checks:

```sh
NX_DAEMON=false bunx nx run tool-fleet:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:build --skip-nx-cache
bunx openspec validate bound-registry-storage --strict --json
bunx openspec validate --all --json
```

Owning lint, forced TypeScript and build each print Nx target success on v2.
Their sessions completed before context compaction; printed tool-contract success
is preserved in `/tmp/registry-source-v2-owning-{lint,typecheck,build}-20261101.log`.
No missing terminal handle is relabeled as a separately captured exit status.
A fresh temporary directory built the exact configured entrypoint list: **12**
expected artifacts, all below 16 MiB; backup worker **1,737,202 bytes**. Receipt
`/tmp/registry-source-cli-build-receipt-20261101.json`, build log
`/tmp/registry-source-cli-build-20261101.log`. Existing dist outputs were preserved.
Prettier passed **378** actual changed tracked/untracked supported files;
`git diff --check` passed. Initial strict OpenSpec exited 1 solely for the overlong
physical-backup requirement paragraph. Its equivalent shorter text then passed
strict **1/1** with no issues. Initial all-validation passed **284/284**; final
spec/document rechecks are recorded below. Actual source spec: **17 requirements,
30 scenarios**, including two new source-admission scenarios. Logs
`/tmp/registry-source-changed-format-20261101.log`,
`/tmp/registry-source-openspec-change-final-20261101.json` and
`/tmp/registry-source-openspec-all-20261101.json`.

Reviewed frozen v2 SHA-256:

| Path                                                             | SHA256                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| tools/tool-fleet/src/registry-backup-source.ts                   | 704b775d6314fc52c88e8bf786f50647112d4b8ecdbd87586f7fc7a2c23b8732 |
| tools/tool-fleet/src/registry-backup-source.test.ts              | f8a29284926d1a64c2bd0765305e89de7c04a2bdb763d4d4a7ed2539ed02f21b |
| tools/tool-fleet/src/registry-backup-source.fixture.ts           | ef084b26e7564b79cc87622b81e899b66cd9aaaaac94fa3d051403f1215257f0 |
| tools/tool-fleet/src/registry-backup-store.ts                    | 4ed97b880e440c308d170f34c35ff8d10bb65c8339a77f3f8fcf9020a6a46ff7 |
| tools/tool-fleet/src/registry-backup-store.test.ts               | 32d2aef5ba32f94924b3c65bde3c03fd48a192fb95076e8b7a096952f528b67c |
| tools/tool-fleet/src/registry-maintenance-backup.ts              | 13c7b899237e03702528235cfd98bb8790a792cbe109cfb9ff96943d54de43ab |
| tools/tool-fleet/src/registry-maintenance-backup.test.ts         | 2d997f5e3bc00bbd7eef73204d2da2dc9a8b93bcce75c9075e83160181584082 |
| tools/tool-fleet/src/registry-backup-retention-action.fixture.ts | ac28afcf87f89e44ce7fe33a101b4d31f18e0b8e6dd77da3218ea5c4deeca16c |
| tools/tool-fleet/src/registry-backup-retention-action.test.ts    | acbe6146b9647f289c18156950121839e31970e193983ddd1b491a53e8730226 |
| tools/tool-fleet/src/registry-backup-provider.fixture.ts         | 27f32ca6e3d2f83267039fd7f4fce660b6874dce2c3cf488b36da18d28320e54 |
| tools/tool-fleet/src/registry-maintenance-host.fixture.ts        | 368650904fc8175c148b183fed844983768e107f85750fc5077a582827a862ae |
| tools/tool-fleet/src/registry-maintenance.native.ts              | 4da295c7faf0727ed2ac6463fd6beab149c8d26cd8c9407884631ade192b47a0 |
| tools/tool-fleet/src/registry-backup-retention.test.ts           | 4af144b5a54e9b8e1536f60cdd8fe5731f372e4c8041ac75fef46e471b19e28f |

The parent full uncached owning test target is running on **497** frozen source/
configuration pins in `/tmp/registry-source-owning-source-pins-20261101.json`:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 NX_DAEMON=false bunx nx run tool-fleet:test --skip-nx-cache
```

Its terminal receipt will be appended below. No timer/native filter is applied.
Binary SHA-256 freshly checked before launch:
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`;
`restic 0.19.1 compiled with go1.26.4 on linux/amd64`.

The [workspace note](../../../docs/findings/registry-backup-workspace.md) now records
additional pinned Go/restic encoding research: the public binary is CGO-disabled,
so account names use the pure-file resolver, but immutable bounded account inputs
remain necessary. Invalid-UTF8 symlinks carry escaped and raw representations;
real ancestor metadata lies outside selected contents roots; reused parent content
references are not bounded by fresh chunking. Formulas remain conditional; no
serializer/runtime/reservation proof or physical allowance is implied. Public
binary build-info extraction used read-only Python because optional Go tooling is
absent; no host account/credential files were read by this research. Handoff
`/tmp/registry-backup-metadata-encoding-research-20261101.md`.

Still unverified: complete independent writer exclusion and reader/xattr visibility;
immutable bounded resolver/ancestor/serialization and historical parent-reference
profiles; complete repository/encrypted/compressed/retry/lock/multipart/provider
physical envelopes; durable reservation consumption/spend/retry authority; bounded
scratch bytes/inodes/open-unlinked files, CPU/memory/process limits; exact-ID
retention effects, protected physical reclamation and retained post-prune restore;
actual monitoring delivery, installed/native lifecycle/recovery, full rehearsal,
exact-SHA canonical host gate and activation. None is replaced by raw metadata
hashing or the local test receipts. Four remaining task boxes stay unchecked.

No remote or host-root operation, live provider/notification call, protected
helper read/hash/execute, previously filter-stopped authority work, product
migration, PVC change, activation, commit or push was performed. The earlier remote root proof auto-review rejection
remains pending the already requested destination/payload authorization; no
alternate route was attempted. This goal turn is implementation progress, not
completion or a wait-only blocked turn.

Final full owning receipt for reviewed source-observation v2:

The unfiltered uncached command above reached terminal **exit 0** on session
62958: **3,796 pass, 0 fail, 0 skip, 15,274 assertions, 219 files,
1,053.15 seconds**. Nx reports target success. All **497** source/configuration
pins remain unchanged. Log `/tmp/registry-source-owning-tests-20261101.log`.
No earlier or cached source revision supplies this receipt.

The actual whole S3 method deadline ran at **60,007.16 ms**, and the actual whole
retention-cycle deadline at **60,011.63 ms**. The conditional real-restic cases
actually ran with the pinned binary: encrypted foreign-lock/current-repository/
corrupt-ciphertext refusal (**9,766.13 ms**), both-root backup/restore/corrupt-pack
refusal (**12,841.74 ms**), genuine three-byte partial-read snapshot verification
(**6,195.62 ms**) and missing/corrupt/unreadable snapshot-ciphertext refusal
(**16,617.24 ms**). These are local filesystem/repository receipts, not live
provider physical accounting, installed isolation or a post-prune restore.

Final evidence formatting, strict/all OpenSpec and whitespace checks follow this
append. The accepted source prerequisite is complete within its reviewed scope;
Task 4.3 and the other three remaining task boxes remain open. Overall goal stays
active at **7/11**, without product migration or activation.

Final source evidence recheck exited 0: Prettier **378** changed supported paths;
strict OpenSpec **1/1**, all **284/284**; `git diff --check` passed. Logs
`/tmp/registry-source-receipt-final-format-20261101.log`,
`/tmp/registry-source-receipt-final-openspec-{change,all}-20261101.json`.
This final receipt receives its own formatting/whitespace check after append.
All **497** source/configuration pins still match; no completion/activation claim
is made for the remaining task scope.

The first check of this last receipt found only formatting differences after
append; the formatter was applied before its final explicit recheck. This does
not alter any tested source or specification behavior.

## Durable backup effect consumption — 2026-11-01

The Task 4.3 durable-consumption prerequisite is independently accepted for spec
compliance and code quality, with one nonblocking proof-clarity note below. This
is not acceptance of physical backup admission, full Task 4.3 or activation.
All four remaining original task boxes stay open; overall progress is **7/11**.
Worktree `/home/df/.codex/worktrees/66b0/puni-00`, branch
`feat/registry-storage-workflows`, unchanged HEAD
`6c0d58e45db2f85b55f007f89888f32590b41837`. No commit or push supplies these
receipts; exact saved source baselines and frozen pins identify the changed code.

The real root action opens a root-only `backup-effects/` sibling of captured
journal `contents/` on the existing bounded journal filesystem. It passes one
real effect port to every store command and the exact-version provider DELETE
boundary. Only controlled tests supply the explicit modeled override; the
unchanged production worker callsite supplies none. Persisting consumption does
not mutate captured contents or canonical source revision. Restoring contents
cannot recreate/refund spent authority; [ADR 0060](../../../docs/adr/0060-registry-backup-consumption-survives-content-restore.md)
records that trade-off. Missing established state/lock/whole directory refuses
runtime and provisioning convergence; only fresh backing receives initial state.
Existing-volume enrollment/upgrade and installed worker accessibility remain unproved.

Operation binding fixes registry/storage/repository/configuration/execution-profile
identity. Tokens belong to exact current canonical attempt/reconciliation lineage:
recovery legitimately rotates the operation token. A bounded fresh canonical read
uses the full existing parser/consistency validation before mutation. A claimed
larger revision cannot grant authority; changed tokens on an existing attempt and
older ports refuse. Current legitimate recovery retains spent operation slots.
Inspection has no snapshot-source grant. Its one snapshot transition binds exact
source SHA/revision/census and cannot replace that source binding. Identical
admission repeats mint no allowance or generation.

Each fixed restic descriptor is durably consumed after existing binary/authority/
final source checks and before actual spawn. Exact DELETE consumes after existing
fresh selection checks and settles only after full recensus confirms disappearance.
Recovery permission never grants normal lock-writing commands, forget or prune.
Store child exit, bounded output and cleanup precede terminal execution settlement;
this is distinct from semantic snapshot verification and never refunds liabilities.
Uncertain/spawn-failed/canceled/response-lost effects remain spent and nonreplayable.
The source-in-contents dependency fault is an unexpected copy during snapshot
binding while the actual sibling stays valid; final source reobservation refuses.
It is not mislabeled as a native placement or writer-exclusion proof.

The independent short sidecar flock follows common authority and is released
before child lifetime. Shared inherited authority descriptors alone cannot
serialize callers. Fixed state/lock/pending names, 1 MiB serialized state,
1,024 effects and forty bounded attempt/reconciliation lineages prevent unbounded
file/history growth; no automatic truncation or operation recycling exists.
Fresh whole-filesystem counters preserve sidecar replacement/future state plus
canonical replacement/failure headroom, using shared 16 MiB/64 KiB canonical
limits. Those pressure counters are modeled; a real canonical failure receipt
still persists after modeled sidecar refusal. No native ENOSPC guarantee follows.

File sync, atomic publication and directory sync precede ticket return.
Prepublication interruption leaves old state with explicit unresolved replacement
or durable cleanup, without inventing a published spent ticket. Published-state
acknowledgement ambiguity stays consumed. Awaited closure preserves simultaneous
primary/cleanup failures; required bigint stat fields are validated before
coercion/equality. Kernel calls and cleanup retain the existing cooperative,
not hard real-time, limits.

Lock re-inspection binds exact version plus deterministic semantics of the already
validated complete raw census. A real changed view consumes another bounded entry;
an identical view stays spent. Total lexical ordering separates composed/decomposed
opaque version IDs, and fixed property order prevents insertion-order views.
No per-call nonce substitutes for a census. Existing origin/ownership/ciphertext/
currentness/deletion predicates are preserved.

The production physical adapter is byte-identical, SHA-256
`4091bcd331fb9d42a5afeffbc3c12f3600c6588dfcca67028a8c4443481612f4`, and
unconditionally throws `backup-budget-unavailable`. A durable command ticket is
not a 100 GiB physical reservation. There is no completed funding producer,
physical release/recycling, forget/prune, protected reclamation or post-prune restore.

Exact review evidence: implementer report
`/tmp/registry-backup-reservation-implementation-report-20261101.md`, independent
review `/tmp/registry-backup-reservation-review-report-20261101.md`, saved originals
`/tmp/registry-reservation-baseline-20261101`, honest whole diff
`/tmp/registry-reservation-full-diff-20261101.patch`, and nineteen-file final freeze
`/tmp/registry-reservation-freeze-20261101/{pins.json,baselines.json,receipt.json}`.
Fifteen existing files have saved before-images; four files are new. The reviewer
freshly verified current/frozen/baseline pins, eighteen non-native proven-stage
pins, seventeen comment-free TypeScript printer comparisons and embedded Python
AST equality. The proof-stage/final byte differences are retained in
`/tmp/registry-reservation-proof-stage-final-20261101.patch` and are not called
identical. They contain Proof notes/formatting, with semantic comparison receipt
`/tmp/registry-reservation-proof-stage-final-ast-20261101.json`.
The sole native compatibility diff adds exactly one modeled import/property pair;
it was read only as that hunk, never executed or promoted to native budget proof.

Final frozen ordinary controls:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-backup-{reservation,enrollment,locks,provider}.test.ts --timeout=120000
```

Terminal exit 0: **149 pass, 0 fail, 490 assertions, four files, 26.64 seconds**,
`/tmp/registry-reservation-final-frozen-tests-20261101.log`, exec3055. Real local
restic creates/verifies a snapshot and restores both roots through durable
consumption while captured journal bytes/revision stay unchanged. Repeated restore
refuses before another command. Admission/canonical context is modeled; this is
pre-prune local restore, not bounded restore storage or provider physical evidence.
Binary freshly checked by parent before the full owning run: SHA-256
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`,
`restic 0.19.1 compiled with go1.26.4 on linux/amd64`.

Covering consumer command:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/registry-backup-{reservation,enrollment,source,store,retention,provider,retention-action,encrypted-lock,locks,session,worker,runtime}.test.ts tools/tool-fleet/src/registry-maintenance-backup.test.ts tools/tool-fleet/src/registry-callback.test.ts tools/tool-fleet/src/registry-restore-worker.test.ts --timeout=120000 --test-name-pattern '^(?!.*whole retention observation cycle)'
```

Terminal exit 0: **371 pass, 0 fail, one unchanged real retention timer filtered,
1,396 assertions, fifteen files, 231.76 seconds**,
`/tmp/registry-reservation-covering-20261101.log`, exec71369. This predates the
strengthened missing-budget test context and final Proof notes; production syntax
is unchanged and the frozen controls above reran that strengthened context.
Parent full verification below uses no timer filter. This scope distinction is
preserved rather than relabeling an earlier run as the final byte-identical suite.

TDD includes unavailable-authority real-child RED/GREEN, twelve malformed-stat
consumer RED/GREEN, kind/lineage, cleanup/token, malformed historical ticket and
both canonical-census regressions. Named logs under
`/tmp/registry-reservation-*-20261101.log` are linked in the implementation report.
Initial missing-export/assertion-syntax failures are discarded harness failures.

The final disposable proof command:

```sh
python3 /tmp/registry-reservation-proofs-20261101.py
```

Terminal exit 0 (exec44991). Clean copied-stage control: **107 pass, 0 fail,
302 assertions, four ordinary files**, with forty-two old provider cases filtered
by its recorded pattern. Then **37** guard/dependency variants each exited 1 at
required consumer assertions, and restored stage pins matched. Index, exact
patterns/patches, pins and logs:
`/tmp/registry-reservation-proof-logs-20261101/{index.json,pins.json,*.log}`.
The independent reviewer inspected every indexed failure diagnostic and selected
complete logs; no mutation suite was independently rerun by the reviewer.

| Injected fault                   | Required production-consumer assertion observed failing                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stable-binding`                 | operation effect authority refuses changed operationId; operation effect authority refuses changed registryId; 4 further named cases in index                                             |
| `attempt-token`                  | operation effect authority refuses changed tokenSha256                                                                                                                                    |
| `stale-port`                     | a stale action port cannot consume after a newer canonical attempt binds                                                                                                                  |
| `replay`                         | new canonical action attempt cannot refill a spent fixed slot; real child sees durable consumption and terminal execution never refunds it                                                |
| `directory`                      | trusted effect state refuses public-directory without consumption                                                                                                                         |
| `file-metadata`                  | trusted effect state refuses hardlink without consumption                                                                                                                                 |
| `short-lock`                     | a held short sidecar flock refuses a real store command even with shared canonical authority                                                                                              |
| `unknown-entry`                  | trusted effect state refuses foreign-entry without consumption                                                                                                                            |
| `headroom-threshold`             | effect consumption preserves canonical journal headroom under modeled bytes pressure; effect consumption preserves canonical journal headroom under modeled inodes pressure               |
| `canonical-headroom-term`        | modeled sidecar pressure refusal still permits the real canonical maintenance failure receipt                                                                                             |
| `effect-count`                   | bounded effect slots cannot refill after one thousand twenty four executions                                                                                                              |
| `record-bytes-pair`              | effect record cap refuses consumption before a real child                                                                                                                                 |
| `state-scope-schema`             | trusted effect state refuses malformed without consumption                                                                                                                                |
| `source-binding`                 | snapshot phase refuses changed-source rather than replacing its one source binding; snapshot phase refuses changed-census rather than replacing its one source binding                    |
| `snapshot-phase`                 | inspection and recovery bindings cannot authorize snapshot or normal lock effects                                                                                                         |
| `recovery-phase`                 | inspection and recovery bindings cannot authorize snapshot or normal lock effects                                                                                                         |
| `fixed-kind`                     | actual store refuses a descriptor whose claimed kind differs from its fixed slot                                                                                                          |
| `uncertainty`                    | an uncertain consumed effect blocks a different unused normal command slot                                                                                                                |
| `settlement`                     | a newer action cannot settle an older action consumed ticket                                                                                                                              |
| `required-metadata`              | actual store refuses missing path dev before sidecar metadata coercion; actual store refuses missing path ino before sidecar metadata coercion; 2 further named cases in index            |
| `canonical-lineage-read`         | actual canonical recovery rotates token without refilling spent store slots                                                                                                               |
| `file-sync`                      | effect file-sync failure never acknowledges consumption                                                                                                                                   |
| `directory-sync`                 | effect directory-sync failure never acknowledges consumption                                                                                                                              |
| `atomic-publication`             | real child sees durable consumption and terminal execution never refunds it                                                                                                               |
| `store-consumption`              | store refuses unavailable durable effect authority before a real child can launch                                                                                                         |
| `delete-consumption`             | actual SDK DELETE consumes durable authority: durable-missing                                                                                                                             |
| `delete-settlement`              | actual SDK DELETE consumes durable authority: durable-delete                                                                                                                              |
| `source-directory-dependency`    | real pinned restic snapshot consumes sibling state without changing captured journal source                                                                                               |
| `initializer-freshness`          | ordinary production enrollment preserves existing effect state and refuses every established absence                                                                                      |
| `initializer-entry-set`          | ordinary production enrollment preserves existing effect state and refuses every established absence                                                                                      |
| `initializer-file-metadata`      | ordinary production enrollment preserves existing effect state and refuses every established absence                                                                                      |
| `initializer-directory`          | ordinary production enrollment preserves existing effect state and refuses every established absence                                                                                      |
| `missing-budget`                 | missing recovery phase budget refuses before a real child despite valid vacant state                                                                                                      |
| `consistent-history`             | inconsistent duplicate ticket history refuses before a real child                                                                                                                         |
| `historical-ticket-grammar`      | actual store refuses malformed historical ticket identity before launching                                                                                                                |
| `canonical-census-normalization` | recovery inspection binds a deterministic complete census despite collation-equivalent version identities; recovery inspection does not invent a new census from property insertion order |
| `fresh-state-read`               | trusted effect state refuses missing without consumption                                                                                                                                  |

The table reports actual assertion failures, not thirty-seven independent
external-effect acceptance bypasses. Record-size removal combines the input-size
predicates as one witness. Missing-stat acceptance witnesses cover path/fd dev
and inode; other field negatives prove exact diagnostics/awaited closure. The
consumption-only rename fault reaches a real child that exits 91 after reading old
state. The source-copy fault reaches the final source-hash diagnostic. Cached
state permits forbidden consumption after an established state file is unlinked.
SDK consumption omission produces one forbidden DELETE where zero were required.
Initializer faults execute the actual new production Python function on ordinary
owned directories; eleven loss/alias/cap faults do not execute native provisioning.
The first setup/masked attempts were rejected, corrected and rerun, with archives
and scope in `/tmp/registry-reservation-rejected-proof-attempts-20261101.md`.
Some earliest rejected/harness logs were overwritten; no retained exact-byte claim
is invented for them.

Nonblocking P3 recorded for final whole-branch triage: the actual-child replay
assertion currently fails at later settlement inconsistency after its second
command runs. An explicit launch marker would make that evidence more direct.
The companion new-attempt consumer independently observes successful forbidden
consumption when replay protection is removed. The secondary settlement diagnostic
is not represented as an independent clean replay-success witness. This observation
requires no implementation fix for the accepted prerequisite and remains in the
same progress ledger for final review.

Fresh parent owning checks on all nineteen frozen source files:

```sh
NX_DAEMON=false bunx nx run tool-fleet:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run tool-fleet:build --skip-nx-cache
bunx openspec validate bound-registry-storage --strict --json
bunx openspec validate --all --json
```

All terminal exit 0. Lint no findings (72 seconds; standard Node color-environment
warning retained), forced TypeScript no diagnostics (4.9 seconds), configured build
success (499 ms). Exact configured entrypoint list built separately to a fresh
temporary directory: **12** expected artifacts, all below 16 MiB; backup worker
**1,759,123 bytes**. Existing dist outputs were preserved. Logs
`/tmp/registry-reservation-owning-{lint,typecheck,build}-20261101.log`,
`/tmp/registry-reservation-cli-build-20261101.log`, receipt
`/tmp/registry-reservation-cli-build-receipt-20261101.json`.
Prettier passed **383** actual changed supported tracked/untracked files;
strict OpenSpec **1/1**, all **284/284**, `git diff --check` passed. Actual source
spec: **18 requirements, 35 scenarios**. Logs
`/tmp/registry-reservation-changed-format-20261101.log`,
`/tmp/registry-reservation-openspec-{change,all}-20261101.json`.
Final appended evidence receives its own format/spec recheck below.

Reviewed final SHA-256:

| Path                                                             | SHA256                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| infra/ansible/roles/registry_storage/files/storage.sh            | c430cc7b698c29823b1a3f8893658c0248b9da8c365a4193de235e0b634db37e |
| tools/tool-fleet/src/registry-backup-encrypted-lock.test.ts      | cb2e7e63eb9292245c435eaf478c2f51c3e09655631cc6789f201bca33544da8 |
| tools/tool-fleet/src/registry-backup-enrollment.test.ts          | f527b75857ac1500a11d94af1640b979a381fb8940756b6fd98c70590f2b6ce0 |
| tools/tool-fleet/src/registry-backup-locks.test.ts               | e3289989839b243c674d9c0167396841c8346de5109e4dea6dc28504a565d0c9 |
| tools/tool-fleet/src/registry-backup-locks.ts                    | ff686ea3dc116ff2ef7a1d365994eea5c72b3344f871d77f4a61a652dbdf992d |
| tools/tool-fleet/src/registry-backup-provider.fixture.ts         | c58e69864f15c7ee7e50267b0483f7bca9ef6f0787ffe2d640f10e8d53e45434 |
| tools/tool-fleet/src/registry-backup-provider.test.ts            | 42d7f2a6f69e4165c1087e165a47fb6efd360876bef031cad9464e2dcfec192f |
| tools/tool-fleet/src/registry-backup-provider.ts                 | 86307de210b8d2a6bbfb918b3b4378f2e70a0e7a5d3a485b125c4c95906d0780 |
| tools/tool-fleet/src/registry-backup-reservation.fixture.ts      | 75b5f60c5df2dff65231bdc905933fde7cafbdf93ed02aa202be2f1c652fd087 |
| tools/tool-fleet/src/registry-backup-reservation.test.ts         | 410a58ffd8b72174cff0b5c86fb40fa1b4c854301e7c51a281cd5d55a85d18e8 |
| tools/tool-fleet/src/registry-backup-reservation.ts              | 393467ef0d7df755b5521da2bc5e6753dcb690b1468d1274ccb3ca3bbe523654 |
| tools/tool-fleet/src/registry-backup-retention-action.fixture.ts | 528edfde1e76da401443b9a27c25f49135378528dd72ac8d9cd020c8a30ecd82 |
| tools/tool-fleet/src/registry-backup-retention.test.ts           | ceb1fa0d1423ca36df5cf1bf38965cc0a28d8460a95e1d5378569dc91963d356 |
| tools/tool-fleet/src/registry-backup-source.fixture.ts           | d0917c9ff8bea8533035c414ac3fc1a0eaf742e6fccfe088d53c8bae9619be33 |
| tools/tool-fleet/src/registry-backup-store.test.ts               | 03a07d66aa7d45cf63974b851441a71c3b7ac5153cd60d060b3adbcab9338424 |
| tools/tool-fleet/src/registry-backup-store.ts                    | 05062acb5228b08f977411bc331dcd948ef094a1d4d873fdaf74d1d461f861a4 |
| tools/tool-fleet/src/registry-journal.ts                         | 9f0ec9f49d40977876284b87f59b28d9788d718ce469a90b7e9e33425cd0a406 |
| tools/tool-fleet/src/registry-maintenance-backup.ts              | a7abba556df885443ee21ae621dd641caadddeca1cb5cbfe1c4c51cf876f91b5 |
| tools/tool-fleet/src/registry-maintenance.native.ts              | 7797bb0a7d0d112f561661b15e564b4e7ece44df6af8e0d0732b9ce9f9c1e6f2 |

The full uncached unfiltered owning target is running as exec2300 on **502**
frozen source/configuration pins in
`/tmp/registry-reservation-owning-input-pins-20261101.json`:

```sh
PUNI_TEST_RESTIC_BINARY=/tmp/puni-restic-0.19.1 NX_DAEMON=false bunx nx run tool-fleet:test --skip-nx-cache
```

All 502 pins matched freshly after independent review and before launch. Terminal
receipt will be appended below; targeted filtered tests do not replace it.
Log `/tmp/registry-reservation-owning-tests-20261101.log`.

The user confirmed the bucket is Hetzner during this continuation. Parent reopened
the official overview/FAQ/supported-actions pages and updated the existing
[accounting note](../../../docs/findings/registry-backup-accounting.md). This resolves
provider identification only. Exact live endpoint/versioning/installed scope and
a complete conservative billed-byte formula remain unverified. No live bucket or
billing API was called, and the answer supplied no root/remote/live-call approval.

Still required for the original goal: actual provider billing and authenticated
live scope; complete source reader visibility and encoded/ancestor/account/parent
reference/repository/execution/retry/lock/multipart/workspace envelopes; physical
100 GiB funding and durable liability release/retry/recycling; bounded exact-ID
forget/prune, protected logical/physical reclamation and retained post-prune restore;
installed sibling access and existing-volume enrollment; complete native/isolation/
recovery and monitoring actual delivery; full lifecycle rehearsal, exact-SHA
canonical host gate and activation. None is replaced by this local ticket journal.
No product was migrated. No PVC change, remote/host-root/live-provider/notification
operation, protected helper/credential read/hash/execute, prior filter-stopped
authority analysis, activation, commit or push occurred. The earlier remote root
proof auto-review rejection remains pending its already requested destination/
payload authorization; no alternate path was attempted.

Final full owning receipt for durable backup effect consumption:

The unfiltered uncached command above reached terminal **exit 0**, exec2300:
**3,863 pass, 0 fail, 0 skip, 15,449 assertions, 221 files, 1,010.70 seconds**.
Nx reports target success. Log `/tmp/registry-reservation-owning-tests-20261101.log`.
All **502** source/configuration pins remain unchanged; no cached or earlier
source revision supplies this receipt.

The actual whole S3 method deadline ran at **60,005.83 ms**, and the actual whole
retention-cycle deadline at **60,004.67 ms**. All five explicit conditional local
restic cases ran: sibling-state snapshot/restore (**10,108.64 ms**), encrypted
foreign-lock/current-repository/corrupt-ciphertext refusal (**7,165.00 ms**),
both-root backup/restore/corrupt-pack refusal (**10,928.12 ms**), genuine partial
journal-read snapshot verification (**7,191.76 ms**) and missing/corrupt/unreadable
snapshot-ciphertext refusal (**14,587.68 ms**). These establish ordinary local
repository behavior, without claiming physical provider or enforced restore
storage bounds, installed isolation or post-prune restoration.

The accepted prerequisite checkpoint is complete within its reviewed scope.
Full Task 4.3, the other three original boxes, physical admission, monitoring,
canonical host gate and activation remain incomplete; overall goal stays active
at **7/11** without product migration. Final formatting/spec/whitespace checks
including this receipt follow below. The deferred replay-proof clarity note
remains for final whole-branch triage.

Final durable-effect evidence recheck exited 0: Prettier **383** changed supported
paths; strict OpenSpec **1/1**, all **284/284**; `git diff --check` passed. Logs
`/tmp/registry-reservation-final-format-20261101.log`,
`/tmp/registry-reservation-final-openspec-{change,all}-20261101.json`.
All **502** source/configuration pins still match. Only this final receipt is
appended after those checks; its own formatting/whitespace is checked separately.
The deferred P3, all four open task boxes and unverified activation obligations
remain recorded without a full-goal completion claim.

## Fresh local pressure reporting prerequisite — reviewed local scope

This continuation implements the local producer/status prerequisite of Task 5.1.
It does not complete Task 5.1 or activation. The same original four boxes remain
open; overall 7/11. Physical backup admission remains closed.

### Source and behavior

The final ten-file prerequisite (four new) is frozen at
`/tmp/registry-monitoring-freeze-v2-20261101/`; `pins.json` identifies exact current
source and the unchanged branch HEAD `6c0d58e45db2f85b55f007f89888f32590b41837`.
The full diff against the actual pre-edit files is `review.patch` (72,394 bytes).
The four-file first review correction is `fix.patch` (15,701 bytes). Parent and
worker freezes agree. No commit, push, installation or unit activation occurred.

The existing ten-second authority monitor now captures that invocation's actual
successful measurement, replaces a bounded volatile runtime report after command
authority releases, and retains the authenticated response and healthy canonical
bytes/revision. The existing thirty-second permission expiry remains unchanged.
Reports stay outside both captured roots. The two fixed cache files are each
bounded below 16 KiB; the writer reserves allocation/inode headroom. That headroom
proof uses modeled counters, not real filesystem exhaustion.

The actual status collector reuses the complete bounded canonical reader without
command flock or mutation authority. It binds observations by source, boot,
registry/store/path, revision, semantic hash, fence and actual measurement age.
Physical census, budget and absent completion dimensions remain explicitly
unavailable. Reservation output has count, byte/inode totals and entries. The
canonical zero-or-one reservation invariant makes its safe-integer totals exact.
Backup output retains original source identities and verification time; failure
cannot refresh the success age. See the
[staged contract](../../../infra/systemd/registry-maintenance/README.md).

### TDD, review and proofs

Implementation report: `/tmp/registry-monitoring-implementation-20261101.md`.
Ordinary-file behavioral RED/GREEN stages cover fresh observations, IO refusals,
status and process integration. Missing-module/export and initial sandbox/setup
failures are identified as such, rather than production-path safety evidence.

Independent review `/tmp/registry-monitoring-review-20261101.md` initially rejected
three Important issues: expanded-year future timestamps were classified fresh with
a negative age, reservation summaries were missing, and backup source identities
were omitted. The same implementer addressed all three in fix round 1. Eight new
failures were observed on V1 before correction. Numeric capture/future comparisons
now support chronological expanded-year ISO ordering. Independent scoped re-review
approved all three fixes with no new breakage; prerequisite spec/quality verdicts
are approved within the local scope only.

V2 proof evidence: `/tmp/registry-monitoring-proof-20261101/v2/receipt.json`,
`logs/08-final-faults.log` and `faults/summary.json`. All **28** isolated cases
produce their intended assertion failures, with original and mutated hashes
verified against final source. All 23 original cases were rerun on V2. The new
cases restore lexical time comparisons, omit reservation/backup source contracts
or refresh backup age from a later failed operation. Actual-reader acceptance
precedes status future rejection, preventing the earlier order check from masking
that boundary. The failed-operation mutant changes original age 301 seconds to
61 seconds and original 00:00 to failure 04:00; its post-failure assertion fails.

The initially weak pending test was masked by exclusive-create refusal; its logs
remain in the initial/weak archives. The final reader negative instead detects
wrong never-reported output for unresolved pending state. The cached-measurement
fixture uses a valid old sample and fails on 35 GiB expected versus 1 GiB observed.
No later null-capacity diagnostic supplies that proof. Compound metadata faults
prove actual mode/hardlink refusals, not independently tested foreign UID/GID
predicates. Unit/CLI dispatch mutations are source-contract checks; the separate
process tests exercise the exported production loop, not installed bootstrap.
Adjacent source `Proof:` comments retain these limits.

### Fresh verification on final source

Parent command:
`bun test --preload ./tools/test/scratch/preload.ts
./tools/tool-fleet/src/registry-journal.test.ts
./tools/tool-fleet/src/registry-capacity.test.ts
./tools/tool-fleet/src/registry-authority-host.test.ts
./tools/tool-fleet/src/registry-pressure-report.test.ts
./tools/tool-fleet/src/registry-maintenance-cli.test.ts
./tools/tool-fleet/src/registry-pressure-process.test.ts
./tools/tool-fleet/src/registry-maintenance-units.test.ts --timeout=30000`.
Terminal exit 0: **112 pass, 0 fail, 461 assertions, 7 files, 63.76 seconds**.
Log: `/tmp/registry-monitoring-final-covering-20261101.log`.
This includes a real ten-second check cycle, separate producer/status processes,
killed-producer staleness and status under actual same-user held maintenance.
Controlled sample values/clocks are model inputs, not installed measurements.

Parent uncached `NX_DAEMON=false bunx --no-install nx run tool-fleet:lint
--skip-nx-cache` exited 0. Log:
`/tmp/registry-monitoring-owning-lint-20261101.log`. No code lint diagnostics;
Node printed the existing environment warning that FORCE_COLOR overrides NO_COLOR.
The worker's final four-file lint and project
`bunx tsc --build --force tools/tool-fleet/tsconfig.json` both exited 0 on the same
frozen source; V2 receipt pins their logs. Typecheck was not redundantly repeated.

Parent uncached tool-fleet build exited 0 (299 ms), producing all 12 configured
entrypoints. Exact outputs/hashes are in
`/tmp/registry-monitoring-cli-build-receipt-20261101.json`; largest is
**1,759,274 bytes**, all below 16 MiB and newer than the V2 freeze. An initial
receipt script assumed flat output paths and failed on a missing file. The actual
compiler log preserves source paths below outdir; corrected receipt uses those
fresh nested outputs and does not use or remove older flat files. All ten source
pins remained unchanged. This proves local compilation, not installed execution.

The prior 3,863-test whole-project receipt belongs to the earlier source snapshot
and is not claimed for these changes. No full owning suite or exact-SHA host gate
was run for this prerequisite. Final scoped formatting, strict/all OpenSpec,
links, source pins and whitespace checks follow this record.

### Research and remaining requirements

Fresh Hetzner primary-source clarification is in
`/tmp/registry-hetzner-accounting-check-20261101.md` and the
[accounting note](../../../docs/findings/registry-backup-accounting.md). Provider
identity is confirmed; endpoint, installed scope and complete conservative byte
accounting remain unverified. The closed physical adapter stays byte-identical.
No provider request or additional billed-overhead claim was inferred.

Conditional public Slack protocol research is captured in
[monitoring delivery research](../../../docs/findings/registry-monitoring-delivery.md).
It identifies acknowledgement and retry ambiguity without selecting the actual
configured destination. No notification request, secret read or live channel
receipt occurred. The accepted five-minute dead-source path does not imply an
unrequested recursive watchdog requirement.

Still unverified: dedicated foreign UID/GID and installed ownership, real byte/inode
exhaustion, systemd/Ansible staging/syntax/activation, UID59001 installed execution,
native storage/privilege/installed bootstrap, durable delivery outbox and saturation,
rejected/ambiguous destination responses, actual warning/cutoff/cleanup/backup
notification delivery, independently hosted five-minute missing-check alert,
nightly retirement outcome wiring, full lifecycle rehearsal, exact-revision host
gate, physical funding/prune/reclamation/retained restore and activation. Existing
suspended platform stages and product/PVC state are unchanged. Pending root/helper
and outbound-support authorization is not supplied by the provider clarification.

The same ledger records a separate canonical/reclamation timestamp follow-up risk:
those existing schemas accept expanded years and canonical receipt code has lexical
comparisons. This is not yet a reproduced canonical-command defect; investigate
before full-goal completion rather than treating this report-only fix as an audit
of every timestamp use. No restricted proof-body or privilege investigation was
performed. Full goal remains active, with no narrowed completion claim.

Final checkpoint checks exited 0: all **16** supported scoped TypeScript/Markdown
files formatted; strict OpenSpec **1/1**, all **284/284**; `git diff --check` clean.
All **7** local links in the new monitoring documents exist. Current spec has
**18 requirements, 41 scenarios**. All ten final source pins and the closed
physical-admission SHA still match. Evidence: `/tmp/registry-monitoring-final-
{format-20261101.log,openspec-change-20261101.json,openspec-all-20261101.json,
integrity-20261101.json}`. The Jinja service template was checked by its source
contract, not Prettier or host systemd execution. This final receipt is checked
separately; no runtime/source behavior changed after the frozen verification.

## Canonical chronology restoration — reviewed local scope

The nine confirmed predicates now compare chronological instants while preserving
schemas, stored ISO strings, wire contracts, revisions, permit/effect behavior and
all unrelated source. This restores existing precise chronology guarantees. It
completes this bounded prerequisite, not Task 5.2 or activation; the original four
boxes remain open at 7/11.

### Reproduction and correction

Investigation: `/tmp/registry-canonical-clock-investigation-20261101.md`.
Actual ordinary publication commands admitted a numeric clock reversal with a token,
reservation and revision change, and rejected a valid one-millisecond advancement
across the four-digit/expanded-year boundary. Pressure receipts and maintenance
ownership showed the same comparison failure. The controlled maintenance callback
was entered before an intentional unfinished-operation error; that was not successful
maintenance. Reclamation canonical reads admitted reversed/future lineage, including
one fresh final receipt accepted by its separate owning predicate. No restoration
or physical authority effect was invoked.

Three initially static candidates were independently reproduced before editing:
backup-attempt lineage, retirement/publication provenance and deployment-event order.
The backup attempt's narrower schema correctly rejects expanded createdAt strings;
its actual defect was rejecting an ordinary valid creation time against a later
expanded canonical update. That schema remains unchanged. Negative expanded years
and supported chronological controls distinguish actual ordering from string spelling.

Only `registry-journal.ts`, `registry-reclamation.ts` and the new focused
`registry-chronology.test.ts` changed. The first file has six numeric comparisons,
the second three. Existing large test files and the accepted reporter are unchanged.
Honest pre-edit baseline: `/tmp/registry-canonical-clock-baseline-20261101/`;
new-test absence was recorded before creation in the proof directory.
Final parent freeze: `/tmp/registry-canonical-clock-freeze-20261101/`, three exact
pins/copies and `review.patch` (28,301 bytes). HEAD remains
`6c0d58e45db2f85b55f007f89888f32590b41837`, with no commit or push.

### TDD, independent proofs and review

Implementation report:
`/tmp/registry-canonical-clock-implementation-20261101.md`.
The initial actual-command/read RED observed **26 failures and 26 passes** before
production edits. The after-future reclamation case was initially masked by the old
after-before comparison. After correcting the other eight predicates it independently
failed as a wrongly fulfilled canonical read (**52 pass, 1 fail**); only then was
the ninth predicate corrected. Initial GREEN: **53 pass, 207 assertions**.
Supplementary final-harness restoration of all old predicates also failed; it is
not falsely described as the original pre-edit harness.

Final proofs are under `/tmp/registry-canonical-clock-proof-20261101/final/`.
`guard-proofs.json` binds the actual production-graph executable and nine individual
mutants. Each mutation replaces only its named predicate with false. Parent verified
original and mutant hashes; the reviewer also verified exact single-occurrence byte
replacement and source-to-bundle bindings. Pressure/publication identical expressions
are distinguished by pinned occurrence 0/1 and an asserted occurrence count of two.

All **nine** selected negatives fail at their intended assertions. Eight operations
wrongly fulfill; maintenance reaches the unique unexpected-callback sentinel instead
of clock refusal. Reclamation before-future, after-order and after-future are separately
isolated with all other identity/revision/plan/delta/time conditions valid. No later
freshness or unfinished-callback diagnostic masks them. Adjacent production `Proof:`
comments record the observed removals. These are ordinary same-user command/file
proofs; no permit adapter, native runtime or actual restoration is claimed.

Independent `/root/canonical_clock_review` approved spec compliance and code quality
with no Critical, Important or Minor findings. Report:
`/tmp/registry-canonical-clock-review-20261101.md`. Its focused outside-diff checks
confirmed finite accepted timestamps, unchanged narrower attempt parsing, lineage
validation before freshness, truthful awaited rejection helpers and real production
imports. It did not rerun tests or expand into excluded native/privilege analysis.
A parent focused caller read also confirmed retirement recency already uses numeric
Date.parse; inventory lexical sorts concern names/digests, not receipt time.

### Fresh broader verification

Parent final command:
`bun test --preload ./tools/test/scratch/preload.ts
./tools/tool-fleet/src/registry-chronology.test.ts
./tools/tool-fleet/src/registry-journal.test.ts
./tools/tool-fleet/src/registry-maintenance.test.ts
./tools/tool-fleet/src/registry-capacity.test.ts
./tools/tool-fleet/src/registry-authority-host.test.ts
./tools/tool-fleet/src/registry-pressure-report.test.ts
./tools/tool-fleet/src/registry-maintenance-cli.test.ts
./tools/tool-fleet/src/registry-pressure-process.test.ts
./tools/tool-fleet/src/registry-maintenance-units.test.ts --timeout=30000`.
Terminal exit 0: **217 pass, 0 fail, 946 assertions, 9 files, 79.84 seconds**.
Log: `/tmp/registry-canonical-clock-covering-20261101.log`.
This freshly covers current monitoring/status and maintenance/reclamation callers
in addition to the new chronology matrix. No native or installed fixture was run.

Uncached parent targets all exited 0 with `NX_DAEMON=false bunx --no-install nx run
 tool-fleet:<target> --skip-nx-cache`: lint **56.4 s**, full owning-project typecheck
**3.8 s**, production build **315 ms**. Logs:
`/tmp/registry-canonical-clock-owning-{lint,typecheck,build}-20261101.log`.
Lint has no code diagnostics; Node printed the known FORCE_COLOR/NO_COLOR environment
warning. The agent's scoped typecheck was not misrepresented as this full project check.

All **12** configured fresh nested build outputs are below 16 MiB; largest is
**1,759,490 bytes**. Artifact hashes and exact entry paths are in
`/tmp/registry-canonical-clock-cli-build-receipt-20261101.json`. Source pins remained
unchanged. The combined current monitoring/chronology snapshot has **12** unique
source/config files in
`/tmp/registry-canonical-clock-current-input-pins-20261101.json`; the known journal
change supersedes its older monitoring V2 hash, while other monitoring inputs remain
unchanged. The physical admission adapter still matches its closed SHA. Earlier
whole-project and mutation receipts retain their original snapshot scopes.

Final scoped formatting, strict/all OpenSpec, source-pin and whitespace checks follow
this record. No full owning test suite, exact-SHA host gate, native/installed
provisioning or activation receipt is claimed here.

### Remaining full-goal work

Delivery design is recorded at
`/tmp/registry-monitoring-delivery-design-20261101.md`. Inspected ordinary code has
a reusable real status collector, but no authenticated independent-host acquisition
route; installed status requires UID/GID59001. Actual destination/protocol/config
remain unverified. Conditional Slack source-event capture, bounded durable outbox
and sender CLI are a concrete next candidate; a modeled stdin principal cannot be
relabeled as installed source authentication. No new remote/root route was selected.
The existing five-minute dead-source requirement, real destination receipts and
observer failure visibility remain required, without recursive extra watchdogs.

Physical backup accounting/funding, bounded prune and retained restore, complete
native/installed/recovery proofs, full lifecycle rehearsal, exact-revision host gate
and activation remain open. Suspended platform stages, products and PVC state are
unchanged. No helper/secret/provider/notification/remote/root action occurred; pending
root proof and outbound support approval remain pending. Meaningful ordinary local
monitoring work remains, so this is concrete progress with the full goal active,
not completion or a blocked audit.

Additional bounded primary-source billing research is recorded in
`/tmp/registry-hetzner-billing-contract-20261101.md` and the existing accounting
note. Four focused queries plus directly relevant official pricing, terms, lifecycle
and repository sources found no complete accounting formula. New first-party
evidence explicitly says the dedicated utilization API is unavailable and documents
ongoing/aborted multipart listing followed by part listing. This rules out an
unsupported usage-API shortcut; it does not open physical admission. The bounded
public-source search is exhausted without a provider-owned conservative bound.
No support contact, account access or provider experiment occurred.

Final chronology checks exited 0: scoped format, strict OpenSpec **1/1**, all
**284/284**, whitespace clean; current spec **18 requirements, 45 scenarios**. All
**12** combined monitoring/chronology input pins remain matched. Source artifacts
and guard proofs remain frozen. The additional accounting note and this final
receipt receive a final formatting/whitespace check separately; no source changed.

## Source alert pipeline — initial implementation

Previous chronology turn was concrete progress; all twelve accepted current input
pins still match. Fresh OpenSpec apply is sdd-lean ready, 7/11 complete. The saved
delivery design now proceeds to actual source capture, durable bounded state and
a conditional sender with real local HTTP/process tests; no duplicate design or
protocol search. Exact implementation brief: `/tmp/registry-alert-implementation-brief-20261101.md`.
Honest thirteen-existing-file baseline: `/tmp/registry-alert-baseline-20261101/`.
The same delivery agent resumes; no passing implementation or delivery proof is
claimed yet. Parent selected constants and scope in design/ledger.

The requirement/scenario audit above now covers every current spec entry, including
the previously unlisted durable backup effect requirement and the new alert-state
contract. Old per-scenario evidence is retained; new local receipts are not
misrepresented as final installed/live proofs. No task checkbox is closed.

### Initial source freeze and open recovery concern

The parent broader ordinary run exited 0: **303 pass, 0 fail, 1,150 assertions,
11 files, 82.47 seconds**. Command: the prior nine-file chronology/monitoring
covering command above with `registry-alert.test.ts` and
`registry-alert-capture.test.ts` appended, the same scratch preload and 30-second
timeout. Log: `/tmp/registry-alert-parent-covering-20261101.log`. This is the
initial source snapshot, before independent review or any recovery correction.
No native, installed or external-destination proof is implied.

The implementer reported a material open concern: recovery of a durable canonical
failure after a crash before enqueue currently runs before the next maintenance
invocation, while the sender tick drains already captured alerts without rescanning
that failure. Independent review and a scoped correction remain required; the
passing run does not establish unattended recovery. Task 5.1 remains open.

The parent independently matched the exact ordered audit to all **19 requirements
and 53 scenarios**. Strict validation exited 0 with **1/1** valid and no issues;
receipt `/tmp/registry-alert-parent-strict-20261101.json`. Final all-spec validation,
source review, owning checks and exact-revision host gate are not claimed here.

### Independent review and first correction round

`/root/source_alert_review` returned **spec compliance: issues found; task quality:
needs fixes**, with **five Important, no Critical or Minor findings**. Full report:
`/tmp/registry-alert-review-20261101.md`. Beyond the unattended-recovery concern,
review reproduced fenced-normal rearming, cross-event Retry-After bypass after
exhaustion, and final-directory-sync uncertainty without a retained recovery
marker. It also identified missing mandatory pre-retry, attempt/horizon/spacing
and stale-acknowledgement guard-removal proofs. The old normal-recovery mutation
asserted the incorrect behavior and cannot support the resolved episode contract.

The original implementer is addressing these findings in scoped fix round 1,
brief `/tmp/registry-alert-fix-round1-20261101.md`. Its corrected-source evidence,
exact pins and scoped re-review remain pending. The initial candidate is not
accepted. Review used ordinary owned fixtures only, with modeled counters and
Response objects for its two new probes; no native or external delivery claim is
made. Parent preserved exact initial bytes at
`/tmp/registry-alert-review-freeze-v1-20261101/`.

### Provider clarification prepared locally

The accounting findings now contain a reviewable provider clarification draft:
`docs/findings/registry-backup-accounting.md#provider-clarification-draft`. It asks
for exact units/minima/rounding, complete metadata and version/marker/multipart
category rules, conservative census completeness and reclaim semantics. It
separates instantaneous stored-byte bounds from billing aggregation and monetary
charges. This synthesizes the already recorded evidence gaps; it does not repeat
the exhausted public search or establish a new provider guarantee.

Pre-edit findings bytes are preserved in
`/tmp/registry-alert-parent-baseline-20261101/`. Scoped Prettier write and check
both exited 0; the check reports all matched files formatted, log
`/tmp/registry-provider-draft-format-check-20261101.log`. Runtime tests are not
applicable to this documentation-only addition. No provider/account access or
outbound contact occurred. Support permission remains pending, and the physical
admission adapter remains closed. No task checkbox or goal status changed.

### Expanded correction proof inputs audited

The first round-1 mutation run executed 109 cases. Its runner flagged 107 as
behavioral failures and correctly rejected two setup failures: globally omitting
rename or marker removal also broke the fixture's counter-1 preparation before
the target transaction. Those initial receipts remain unproved.

The two corrected injections omit only the counter-2 target operation, leaving
fixture preparation intact. Their raw witnesses fail the intended actual directory
inventory assertion, observing `pending.json` or `fault.pending` respectively.
Two additional settlement mutations observe incorrect terminal classification.
The assembled final receipt set contains **111** flagged behavioral failures:
107 retained cases plus these four corrected/additional cases. This is not a
semantic review or final corrected-source acceptance claim.

Parent audits verified exact declared source spans, mutant hashes, 13 selected
runtime/test control pins and final receipt composition. Artifacts:
`/tmp/registry-alert-parent-round1-first-run-audit-20261101.json` and
`/tmp/registry-alert-parent-round1-final-input-audit-20261101.json`. The 493-file
copy manifest was not represented as a semantic audit; unrelated native proof
bodies were not inspected. Raw correction witnesses and metadata live under
`/tmp/registry-alert-proof-20261101/fix-round1/witness-corrections/`.

Final scoped static output, adjacent corrected-source proof bindings, the frozen
handoff and independent scoped re-review remain pending. The worker remains
active. Artifact names retain the original 2026-11-01 slice date; the corrected
witnesses ran after midnight on 2026-11-02 Europe/Kyiv (2026-11-01 UTC). No native,
installed or provider/destination action is established by these ordinary proofs.

### Round1 broader checks and remaining recovery finding

The parent matched the corrected 22-source snapshot to its independent freeze and
ran the prior 11-file covering command against it. Terminal exit 0:
**359 pass, 0 fail, 1,283 assertions, 11 files, 100.92 seconds**. Log:
`/tmp/registry-alert-parent-final-covering-20261101.log`. Uncached owning Nx lint,
typecheck and build also exited 0. Lint took 74 seconds with only the known
NO_COLOR/FORCE_COLOR Node environment warning; typecheck took 6.9 seconds and
build took 766 ms (525 modules, 13 entrypoints). Exact commands retain the prior
`NX_DAEMON=false bunx --no-install nx run tool-fleet:<target> --skip-nx-cache`
shape; logs `/tmp/registry-alert-parent-owning-{lint,typecheck,build}-20261101.log`.

All 13 configured nested CLI artifacts are fresh and below 16 MiB; largest
1,759,490 bytes. Receipt:
`/tmp/registry-alert-parent-cli-build-receipt-20261101.json`. An initial parent
audit-parser assertion incorrectly counted the output-directory argument as an
entrypoint; flag/value parsing was corrected before writing the successful receipt.
All 22 source pins, the three accepted chronology inputs and the closed physical
admission adapter hash matched afterward. These results apply to round1, not the
subsequent protocol correction.

Scoped reviewer `/root/source_alert_review` marked findings 1, 2, 3 and 5
ADDRESSED. Original Important finding 4 remains NOT ADDRESSED: after final sync
failure, actual same-user directory EACCES prevents marker recreation; restoring
only directory permissions lets a fresh reader trust state. Report:
`/tmp/registry-alert-rereview-round1-report-20261101.md`. The fixed-value fixture
`effect-count` file alone is not a cumulative replay detector; the accepted
no-maintenance-effects conclusion additionally relies on the read/capture-only
reconciler implementation. Installed and complete lifecycle replay proof remains open.

The original implementer is addressing only finding4 in fix round2. Parent
adjudicated a bounded protocol retaining pre-existing evidence through all
commit-critical IO, using the existing pending-file slot. Post-failure chmod or
new-marker allocation alone cannot establish that invariant. The last cleanup
unlink must succeed; its absence need not be durable because marker reappearance
causes conservative refusal after crash. The design records this distinction from
snapshot/commit durability. Exact compound RED is reproduced; corrected GREEN,
updated fault bindings, scoped checks and re-review remain pending. No contract
waiver, task checkbox closure, native proof or activation is claimed.

## Source alert prerequisite accepted locally

The scoped round2 review passed spec compliance and code quality, with original
finding4 ADDRESSED and zero new Critical, Important or Minor findings. Findings
1, 2, 3 and 5 retained their addressed round1 status. Report:
`/tmp/registry-alert-rereview-round2-report-20261102.md`. The accepted scope is the
ordinary local source prerequisite, not full Task 5.1, installation or activation.

Parent independently froze all 22 paths, with only `registry-alert-store.ts` and
its alert test changed from round1. Snapshot:
`/tmp/registry-alert-review-freeze-fix-round2-20261102/`; exact fix diff 28,302 bytes.
The protocol retains existing refusal evidence through every commit-critical IO
step. It uses the same six names and headroom; failure requires no new recovery
allocation. The final cleanup unlink must succeed, while crash reappearance of
that cleanup marker causes conservative refusal. The exact compound modeled-sync
plus actual same-user EACCES case now refuses a fresh reader after only directory
permissions return. This is not native durability or foreign-UID certification.

Worker final scoped tests: **147 pass, 0 fail, 351 assertions, two files, 14.68 s**;
all five scoped commands explicitly exited 0 in `fix-round2/final-verification-status.json`.
The active check inventory contains **118** observations: **21 fresh writer faults**
and **97 reused** prior observations bound to unchanged owning production/test AST
statements. Four obsolete recovery-allocation checks were retired with that branch.
This is not 118 newly executed faults or unchanged round1 whole-file runtime.
Rejected survivors, GC diagnostics and preliminary lint errors remain preserved.
Final mutation inputs match final source bytes exactly (`proof-final.diff` is empty).
Parent audit: `/tmp/registry-alert-round2-parent-input-audit-20261102.json`.

Fresh parent command: the prior 11-file covering command, unchanged, against this
snapshot. Terminal exit 0: **365 pass, 0 fail, 1,306 assertions, 11 files, 93.31 s**.
Log `/tmp/registry-alert-round2-parent-covering-20261102.log`. Uncached owning Nx
lint, typecheck and build each exited 0: **65 s**, **4.5 s**, **583 ms** respectively;
build bundled 525 modules. Logs
`/tmp/registry-alert-round2-parent-{lint,typecheck,build}-20261102.log`.
Lint emitted only the documented Node color-environment warning.

All **13** configured nested CLI outputs are fresh and below 16 MiB; largest is
1,759,490 bytes. Receipt:
`/tmp/registry-alert-round2-parent-cli-build-receipt-20261102.json`. All 22 source
pins, the three accepted chronology inputs and the closed physical admission
adapter hash match. The combined current reporting/chronology/alert snapshot has
**25** unique source/config pins:
`/tmp/registry-alert-current-input-pins-20261102.json`.

The ten alert scenarios above now identify reviewed local evidence separately
from required final adoption evidence. All 55 named scenarios remain unverified
for final adoption. Original task checkboxes remain **7/11**: 4.2, 4.3, 5.1, 5.2 open.
No complete owning test suite, exact-SHA host gate, installed/native acquisition,
real destination/channel receipt, complete physical owner proof or activation was
run or claimed. Independent five-minute monitoring, physical backup accounting/
funding/release/prune/retained restore, complete recovery rehearsal and host rollout
remain required. Products, the old PVC and unrelated platform-stage holds are
unchanged. No commit/push/provider/contact/credential/helper/root/remote action
occurred. Provider clarification is prepared locally; outbound approval is pending.

Final accepted-checkpoint validation exited 0: scoped Prettier check on **28**
relevant source/config/documentation files; strict OpenSpec **1/1**; all OpenSpec
**284/284**. Exact ordered audit independently matches **19 requirements and
55 scenarios**. All **25** combined current source/config pins still match.
Logs: `/tmp/registry-alert-final-scoped-format-check-20261102.log`,
`/tmp/registry-alert-final-strict-20261102.json`,
`/tmp/registry-alert-final-all-20261102.json`. This receipt-only addition receives
its own final formatting check; it changes no source or requirement contract.
The complete owning test suite and exact-revision host gate remain unrun.

## Remaining execution boundary audit — 2026-11-02

The accepted local prerequisite is unchanged: all25 current source/config pins
match. The previous goal turn was concrete progress. This audit checks the next
available work without substituting the local verdict for the full objective.

The owning test target is `bun test --preload ../test/scratch/preload.ts
--timeout=30000` in `tools/tool-fleet`. Its preload supplies scratch cleanup, not
an ordinary-only collection boundary. Collected wrappers such as
`registry-serving-routes.test.ts` and `registry-restore-worker.test.ts` import or
read/transpile selected native-fixture bodies; `registry-client-role-transfer.test.ts`
passes a native Python fixture to its subprocess driver. No native body was
inspected. The full target was **not run** under the current restriction against
unrelated native-proof-body inspection/execution. This does not claim those
wrappers would perform real privileged host effects; it identifies the unsupported
execution scope. The current365-case receipt remains a subset, not the full suite.
An adjacent scratch README lookup was absent; no missing runtime tool or fallback
was inferred from that optional documentation lookup.

| Original task | Required work still incomplete                                                                                                                         | Necessary facts or execution boundary                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2           | Installed/native maintenance, isolation, restore and failure proofs.                                                                                   | Approved installed-host proof execution and the remaining authority evidence; current native/privileged restrictions persist.                                                   |
| 4.3           | Physical funding, finite release/retry/recycling, prune effect authorization, actual reclaim and kept-snapshot restore.                                | Provider-owned conservative accounting and workspace bounds; positive admission remains unavailable and the existing root-helper surface is outside current ordinary-only work. |
| 5.1           | Actual configured delivery, independent authenticated acquisition/five-minute detection, installed storage/enrollment/TLS and complete owner evidence. | Real destination/configuration and installed-host facts; the conditional local adapter and owned HTTP receiver do not supply them.                                              |
| 5.2           | Complete lifecycle rehearsal, exact-revision host gate and activation.                                                                                 | Preceding unfinished requirements, permitted native/host execution and an exact reviewed source revision.                                                                       |

Fresh capability discovery exposed no connected Hetzner/Slack/monitoring tool.
A provider plugin search returned no Hetzner plugin; that search is not an
exhaustive directory. A Slack plugin was found but is **not installed**. One
optional suggestion was made for inspecting notification context; it is not a
required dependency, destination selection or authorization to send messages.
No installation or connection is claimed. Bounded accessible-Page queries for
`bound-registry-storage` and `Hetzner` returned no matches and no continuation;
that does not prove matching knowledge is absent elsewhere. Evidence:
`/tmp/registry-remaining-boundary-audit-20261102.json`.

No exhausted public billing search was repeated. No provider/account/support or
notification contact occurred. The clarification draft and prior outbound approval
request remain pending. The earlier remote root-proof request was rejected by
automatic approval review because its destination and payload were unconfirmed;
it was not retried and its protected helper was not read, hashed or executed.
The stopped privileged-authority analysis was not resumed or delegated.

The remaining work now requires external accounting/configuration/authorization
facts unavailable in the current ordinary scope. This is the **first genuine
blocked audit after the accepted source prerequisite**, not a claim that the goal
is complete or that its scope has changed. Goal status remains active pending
subsequent revalidation; no original task checkbox is closed.

## Configuration discovery and approved read-only host observation

After the user resumed the goal and asked which blockers could be resolved
independently, local nonsecret discovery resolved declared host identities and
monitoring ownership. The fleet inventory maps h4claw to 10.1.0.4 and h3mon to 10.1.0.2.
The private fleet README at revision 58831dbb4c62d8d5b425f2423592dd171599bf38
confirms storage is staged; held Kubernetes Alertmanager configuration does not
select the active independent host receiver. Recovery documentation supplies the
Helsinki S3 endpoint candidate, not the installed registry binding. Findings now
record this source chain without reading encrypted or credential files.

A concrete non-root h4claw metadata request was prepared, then separately approved
by the scoped execution mechanism. Both SSH commands exited 0 with strict existing
host-key trust and bounded timeouts. Observed UID 995 and machine ID matched the
inventory. Old root-run backup service/timer metadata reports a successful run
on 2026-11-02 at 02:37 UTC; the new pressure/retire/alert units are not found. A limited
system-unit-name search found only standard LVM/mdraid monitor units. It cannot
exclude container/user/cron/other-host monitoring. Receipt:
`/tmp/registry-h4-metadata-observation-20261102.json`; prepared request:
`/tmp/registry-host-metadata-request-20261102.md`.

These observations resolve actual installed rollout state without a root shell,
secret reads, helper execution or host mutation. They are concrete progress, not
a repeat of the previous no-progress audits. Prior blocked audit counts are not
applicable to this newly available safe path. The old 10.1.0.2 root-proof rejection
was not retried or bypassed. Endpoint/accounting guarantees and active monitoring
configuration still require further scoped evidence. No full task is closed.

A separately approved non-root h3mon metadata request failed at SSH authentication
(exit255) before any remote command. Its alias reported62.238.112.126; no machine
identity was verified. No alternate account/address/helper was tried. This is a
specific account/route-access blocker, not evidence that h3mon lacks monitoring
or that root is required. The actual h3mon receiver remains unobserved. Prepared
scope and receipt:
`/tmp/registry-h3-metadata-request-20261102.md`,
`/tmp/registry-h3-metadata-observation-20261102.json`.

A third approved non-root h4claw metadata command exited0 and located the older
backup service's environment-file reference, `/root/.puni/registry/backup.env`,
without opening it or printing environment values. This narrows future repository
identity observation to one known file. Systemctl rendered `LoadCredential` as
unprintable; no credential binding is inferred. The monitoring-host working
account/alias question is pending; no alternate login was attempted. Current25
source/config pins and the closed admission hash remain unchanged. Scoped
configuration-discovery formatting and strict OpenSpec validation passed before
this receipt-only addition; final formatting follows. No runtime/source test is
needed for these documentation-only changes.

## Repository identity extraction prepared, approval pending

The next configuration observation is now concrete: a fixed reader on the
identity-verified h4claw, fixed `/root/.puni/registry/backup.env`, and output limited
to one allowlisted Hetzner hostname plus the known registry bucket/prefix and URL
syntax. The pure parser passed22 synthetic cases including duplicate/malformed
assignments, embedded credentials and shell-like text; no fake credential was
emitted or command text executed. The prepared code reads no protected local file
during its fixtures. These are parser checks, not host/root metadata proof.

Submitting the exact root-over-SSH read to scoped approval was rejected before
launch. The rejection states that current authorization covers metadata, not
root access to credential-bearing configuration, despite allowlisted output.
No retry, indirect execution, root/helper action, secret read or provider request
occurred. The user has been asked to approve this exact prepared action or retain
non-root-only access. Artifact and code hash:
`/tmp/registry-repository-extraction-request-20261102.json`.

This turn prepared a reviewable next action and narrowed its real approval
boundary. It is concrete progress, not a newly observed installed endpoint or
completion of physical accounting. The monitoring-host account question remains
pending independently. No runtime source or task checkbox changed.

## Existing monitoring route observed — 2026-11-03

Task 5.1 remains open. The configured monitor account and inventory machine ID
were verified. Its Docker metadata query was denied; a separately scoped query
through the user-suggested root alias observed the running independent-host
Alertmanager and Prometheus containers, selected Compose/mount paths and
loopback-only published ports. No configuration or secret contents were read.

The monitor account could read the loopback receiver-name API and allowlisted
metrics. One receiver is named `slack-puni`; aggregate Slack attempts were 138,
with zero in each exposed failure counter. These are metadata and counters,
not channel identity or registry delivery receipts. The live Slack overlay is
later than the checked-in dev baseline, which described a local-only receiver.
Do not select a registry destination from that old baseline or held platform
configuration. Details and limits live in
[monitoring delivery findings](../../../docs/findings/registry-monitoring-delivery.md#live-docker-monitoring-route--2026-11-03);
receipt: `/tmp/registry-h3-monitoring-observation-20261103.json`.

This is new host evidence that narrows the next integration action. No alert was
sent, service changed, stopped proof retried, provider contacted or task closed.
The actual channel and registry-specific independent authenticated acquisition,
five-minute missing-source alert and destination receipts remain required.

## Loaded notification policy revalidated — 2026-11-03

The non-root status API observation returned the configured `#puni-alerts`
channel override and root receiver `slack-puni`, with no child routes or inhibition
rules. Typed secret redaction was checked against exact-version upstream source
and the observed response before output. No raw configuration response was saved,
credential file opened or notification sent. Receipt:
`/tmp/registry-h3-status-metadata-20261103.json`; source references and precise
limits live in the monitoring findings.

Historical verification above already records this destination's selection and
versioned adoption. These current reads refresh that existing evidence. They do
not prove new registry delivery, five-minute outage detection or full Task5.1.
The actual remaining receiver-preservation source integration is being prepared
in a new managed worktree at `/home/df/.codex/worktrees/1c66/puni-00`, clean base
`f6b2fec3326caa7cd23a71d76b3a36ce2ad613d3`. It integrates the two already reviewed
monitoring commits into maintained source without importing their unrelated
ancestors. Runtime and rollout claims await the actual integration checks and
review. Parent source changes and all eleven original task checkboxes remain
unchanged.

## Monitoring source companion prepared and reviewed — 2026-11-03

Task5.1 remains open. Draft PR833 carries the existing adopted receiver contract
onto maintained source, followed by the reviewed mounted-file checksum and fixed
readiness-output corrections. Current head is
`47be0234c7f8e18b8e882302e51d137857a18a14`. The original registry feature sources,
accepted 25-input local-alert checkpoint and all eleven parent task checkboxes are
unchanged. Details and scope limits live in
[monitoring findings](../../../docs/findings/registry-monitoring-delivery.md#maintained-source-integration--pr-833).

The final companion owning suite passed451/0 with980 assertions across15files;
uncached lint, forced types, asset-copy build, scoped format, strict owning
OpenSpec and normal hooks passed. Complete source review and scoped corrections
report0open findings. Parent audited7current CI-correction source pins,
11unchanged inputs and2exact omission/output mutations, with a separately checked
one-blank-line-only transfer from executed proof tests to final formatted tests.
The prior mounted-content correction has8source pins and7exact fault variants.
These source-path fixtures model Docker and never read actual credentials.

Actual remote Python CodeQL analysis2084276779 at this head has0findings; analysis
2084138050 at the prior head had1. The new whole-PR scan check initially reported
incomplete JavaScript configuration while that analysis was still running, so no
whole-CI green claim follows. The canonical h4 gate first exited64 before launch
because the commit was absent; an ordinary fetch resolved that specific condition
without checkout. The next exact-source canonical session is live, with no gate
completion result yet. Host gate, installed tool/container, adoption, required
registry deliveries and five-minute independent-source checks remain unverified.
No production deployment or parent full-task closure occurred.

## Companion CI green and installed nonsecret checksum observed — 2026-11-03

At `47be0234c7f8e18b8e882302e51d137857a18a14`, PR833's full workspace gate,
all four browser shards and aggregate gate/pixels/CodeQL checks passed. Expected
scope-selected docs/twilight and inactive trusted-wiki checks were skipped; no
Tool Wiki certification follows. No merge or source activation has occurred.

Separately approved read-only installed commands verified the checksum utility
on `/dev/null` in the existing Alertmanager container (default user nobody), then
verified the configured monitor UID1001's exact sudo/Docker path. That account's
checksum of the actual mounted public configuration matched the current trusted
renderer. Only its digest was emitted; the external credential file was not read.
Receipt: `/tmp/registry-monitoring-installed-checksum-observation-20261103.json`.
This closes installed utility/transport availability and the current positive
configuration-content observation only. Actual predecessor-mount replacement,
full protected-credential readiness, new helper adoption and registry delivery/
five-minute source-outage proofs remain unverified.

The canonical h4 queue session then terminated75 after its default30minute wait;
no gate payload ran. Fresh process-only metadata confirmed the holder2520786 was
still running Bun tests, including a CPU-active new child; it was not cancelled or
attributed to an operator from a shared account. One further canonical attempt
uses `HEAVY_LOCK_WAIT_SECONDS=3600`, a supported finite override that the gate keeps
out of payload environment. It targets the same exact source and checks out only
under the canonical lock. Its result remains pending. The initial missing-commit
exit64 and this queue timeout are failures, not successful host-gate evidence.
No full parent task checkbox was closed; original progress remains7/11.

## Monitoring companion gated and merged — 2026-11-03

The source companion is merged; Task 5.1 remains open. All eleven original task
checkboxes are unchanged: seven reviewed slices complete, with 4.2, 4.3, 5.1 and
5.2 still open. This supersedes the pending companion status in the preceding
dated checkpoints without changing their observed history.

The canonical h4 gate ran as `puni1` from
`/home/puni1/puni-00-gate-tbf`, using the finite 3600-second queue override. It
acquired the canonical lock after 752 seconds and printed exactly
`h2puni gate: running on 47be0234c7f8e18b8e882302e51d137857a18a14`.
Exec session 67223 terminated with exit 0 after all phases:

- Frozen Bun installation: 1806 installs across 1653 packages, no changes.
- OpenSpec: 319/319 passed, zero failed; existing oversized-requirement warnings
  remain. This is the all-change validation, not a strict-all claim.
- `nx format:check --all`: reached and passed under the gate steps' required
  `set -euo pipefail` sequencing before subsequent successful phases.
- Uncached test/lint/typecheck/build: 53 projects plus 10 dependency tasks,
  59 minutes 23 seconds.
- Uncached Twilight test/typecheck/build: two projects plus four dependency tasks,
  49 minutes 51 seconds.
- Uncached Burokrat source lint and Dash lint: 24.7 and 38.1 seconds.
- Solver image smoke: 3 minutes 59 seconds; baseline and shared-person answers
  succeeded, followed by three real-Docker orphan/exceptional-cleanup tests,
  zero failures and 15 assertions across two files.

Tool Wiki still reports inactive and `certified:false`. Docker builder/pip
notices and an initial curl reset before successful baseline checks remain in the
retained log; this is not a warning-free claim. Final receipt:
`/tmp/registry-monitoring-gate-final-receipt-20261103.json`. Full log:
`/tmp/registry-monitoring-gate-h4-47be0234c-wait3600-20261103.log`, 315917 bytes,
SHA-256 `4711759695db05b3716b0fc90ebfd8dce43196e573fb8002d3c8d82d884803ea`.
The earlier missing-commit exit 64 and default-queue exit 75 remain failed attempts.

`gh pr ready` and the normal squash merge of PR833, guarded by
`--match-head-commit 47be0234c7f8e18b8e882302e51d137857a18a14`, returned 0.
A fresh PR query proved `MERGED` into main at 12:09:45 UTC as
`d7070b0133e66c2fcc093a93cf9026e0cfec7289`. No admin override, hook bypass,
force push or branch deletion was used. Fetching main changed no local
checkout. A fresh Git ancestry check proved main contains the merged commit.
All 15 reviewed path blobs equal the candidate exactly; the merge patch contains
only those 15 paths. The actual parent
`2a561e7454a5b6eff6aa9309fc13a39b6e1412d4` had accumulated 17 commits affecting
64 other paths, all preserved without overlap. The preliminary audit's stale
expectation of only the two earlier package-name changes failed; the corrected
parent-based comparison passed and retained that failed expectation in its
receipt. Receipt: `/tmp/registry-monitoring-integration-merge-receipt-20261103.json`.

Candidate CI and CodeQL were green before merge. The actual merged main has its
own CI run `41633385782` and CodeQL run `41633384696`; both were observed running,
with workspace, Twilight and browser jobs active. Their final results remain
unverified. The candidate's h4 receipt is not a host gate for that later combined
main, the dirty registry implementation or the separate h2 host-pool rollout.

No monitoring service, registry safeguard or product was deployed by this source
integration; no credential was read or notification sent. Full credential
preflight, actual predecessor-bind fault, registry-specific delivery, independent
five-minute missed-source alert, installed lifecycle and physical backup budgeting
remain unverified. The original registry feature worktree and accepted source
checkpoint are preserved. See the linked monitoring findings for review and
installed nonsecret checksum evidence; those narrower observations do not close
these remaining requirements.

## Merged-main CodeQL verified — 2026-11-03

For merged source `d7070b0133e66c2fcc093a93cf9026e0cfec7289`, workflow
`41633384696` is completed/success with all four analysis jobs successful.
Fresh main-ref analysis metadata reports:

- Python `2085427337`: zero findings.
- Actions `2085424858`: zero findings.
- C/C++ `2085425962`: zero findings.
- JavaScript/TypeScript `2085507588`: 59 findings.

The actual merge parent `2a561e7454a5b6eff6aa9309fc13a39b6e1412d4` has
59 JavaScript findings in analysis `2085304182`. Equal counts alone were not used
as evidence of an unchanged baseline. Captured SARIF metadata excludes messages
and source snippets, retaining rule IDs, levels, exact locations/regions and
fingerprints. All 59 findings have nonempty partial fingerprints. Their complete
metadata multisets are equal: zero additions and zero removals. None of these
findings is located in any of the 15 reviewed source paths. This establishes an
unchanged JavaScript baseline, not a repository with zero findings.

Receipt: `/tmp/registry-monitoring-merged-main-codeql-receipt-20261103.json`,
including both metadata-file hashes and all analysis identities. No alert was
dismissed, scanner suppressed or unrelated source changed. Main CI workflow
`41633385782` remains running; its existing watch is live as exec 13495. CodeQL
success is separate from that still-unverified CI outcome, the candidate's h4
gate and the unverified installed registry lifecycle. Original task progress
remains 7/11, with 4.2, 4.3, 5.1 and 5.2 open.

## Merged-main CI failure and reviewed repair — 2026-11-03

The earlier running observations above are historical. Actual merged-main CI
`41633385782` completed with failure at 13:35:40 UTC. Workspace job `125908510261`
failed only `wbs-be-01:test`: 3904 passed, three skipped and one failed across 268
files. The delayed real receiver fixture failed at
`contained receiver phase expired: disposal-held` after 22110.33 ms against a
22000 ms preparation window. The owned child was still running; its sanitized
output contained only the Bun header. The exact slow inner operation and a
product SLO are unknown. All browser shards, Twilight and CodeQL completed
successfully; their success does not certify the failed backend target.

Read-only observer 13495 first terminated on a GitHub jobs-list HTTP 500 while
fresh workflow metadata still said running. Replacement observer 23091 later
terminated because the original workflow actually failed. Neither CI nor the
completed candidate h4 gate was restarted from an observation timeout. Receipt:
`/tmp/registry-monitoring-merged-main-ci-failure-receipt-20261103.json`.
The downloaded workspace artifact ID is `13233324914`; the complete
`nx-gate.log` SHA-256 is
`02e28e087a2f4eb447c558382b6e5c678614c5e1624ef012d12587a0dc9355d2`.

The separate ordinary fixture repair is published as
[PR 839](https://github.com/Prosperous-Unification/puni-00/pull/839). Independent
review approved `dedc8ca82dc31a1498953d81ab87b91f7ff85153` with no Critical or
Important findings. Its Minor evidence-description correction is committed as
`f04ac32c907e705f981983ae273115fca7944fce`; the emitted JavaScript remains
identical to the tested source. The delayed profile consistently budgets its
23000 ms declared delay at marker, child and parent levels; other profiles and
actual integration ownership/cleanup assertions are preserved.

Local evidence includes the complete ordinary boot file, 14 passed/zero failed
in 160.67 seconds, plus two actual behavioral negative controls with exact healthy
restoration. Uncached backend lint, forced typecheck/module check, build and
scoped formatting passed. This is not a rerun of the complete 3908-case backend
target. Normal owning OpenSpec validation passes with thirteen warnings; strict
owning validation fails on exactly the same thirteen requirement-length warning
identities as the main baseline. No validator mode or requirement was weakened.
The owning verification record and
`/tmp/runtime-dispatch-preparation-proof-20261103/local-validation.json` retain
raw source and log identities; independent review is
`/tmp/runtime-dispatch-preparation-review-20261103.md`.

Both commits used normal hooks; no hook bypass, force push or admin override was
used. Fresh PR CI and the exact committed-candidate canonical h4 gate remain
pending. The accepted registry implementation inputs are preserved; physical
backup admission remains closed. Provider billing bounds, installed lifecycle,
protected credentials, real delivery and independent missed-source proof remain
unverified. Original task progress remains 7/11: 4.2, 4.3, 5.1 and 5.2 stay open.

## Repair validation progress and finite gate queue — 2026-11-03

For PR 839 head `f04ac32c907e705f981983ae273115fca7944fce`, CodeQL workflow
`41660326494` completed successfully with all four analysis jobs successful. This
records workflow/job conclusions only, not a finding-free claim. All four browser
shards and the `pixels` aggregate in CI `41660331719` also completed successfully;
workspace and Twilight runtime batches remain running.

The 1230-byte ZIP artifact `ci-selection-1`, ID `13241307591`, was downloaded
without browser artifacts. Its selection includes full-module `wbs-be-01:test`
among 53 workspace projects plus both Twilight projects. The workflow's runtime
planner sends that module through its ordinary complete test target, whose Bun
command discovers `runtime-dispatch.boot.db.test.ts`. The synthetic merge SHA
`90d6f4de857525d801e4b1409b59f28e87ecf969` has exactly the expected main and
candidate parents. Its entire Git tree, `107f1754b1d4ab3fd36e49660ac93fee688f4e15`,
equals the candidate tree. Selection/source identity is verified; execution success
still requires the actual CI result. Receipt:
`/tmp/runtime-dispatch-preparation-ci-selection-receipt-20261103.json`.

Canonical h4 gate session 17119 actually exited 75 after its 1800-second queue
expired. Its sole output names the lock still held by PID 4025481; no candidate
payload started. A fresh canonical status query confirmed that holder before one
new exact-candidate attempt used the documented finite 3600-second queue budget.
The retry is live as session 44538, waiter PID 8936; observed queue age 26 seconds,
3574 seconds remaining. The launcher removes the queue variable's export
attribute before gate steps, so it does not change nested test behavior. No live
job was canceled, no lock bypassed and no source checked out before admission.
CI was not restarted. The failed queue attempt remains in the receipt and log.

Current receipt:
`/tmp/runtime-dispatch-preparation-publication-receipt-20261103.json`.
Retry log:
`/tmp/runtime-dispatch-preparation-gate-h4-f04ac32c9-wait3600-20261103.log`.
These narrower results do not close any original registry task or establish
installed lifecycle, physical backup budgeting, actual alert delivery or product
deployment. Tasks 4.2, 4.3, 5.1 and 5.2 remain open.

## Repair Twilight runtime and h4 admission — 2026-11-03

The Twilight runtime step in candidate CI `41660331719`, job `126001858545`,
completed successfully at 16:04:23 UTC. Its actual affected-mode Nx batch ran
`test`, `typecheck` and `build` for both Twilight projects plus four dependency
tasks, taking 57 minutes 7 seconds with zero of ten cache hits. Main suite
summaries report Dash 4356 passed/four skipped/zero failed across 141 files and
Burokrat 2588 passed/zero failed across 104 files. Nested child-fixture summaries
are not added to those totals. The affected-mode step label alone does not prove
lint: independent source lint belongs to the still-pending workspace execution.
The separate packed-package suite was observed running from 16:04:28 UTC; the full
Twilight job and workspace CI are not yet certified.

Artifact `nx-gate-log-twilight-1`, ID `13247212705`, is retained locally at
`/tmp/runtime-dispatch-preparation-proof-20261103/twilight-ci/nx-gate.log`:
4256484 bytes, SHA-256
`a0f00ec9c2f6f70a09dffd1cff6c97a43cb4f90d67f87cd4fe0846fc7b0f6663`.
Receipt: `/tmp/runtime-dispatch-preparation-twilight-ci-receipt-20261103.json`.

The existing canonical h4 retry, session 44538, acquired the lock after 1906
seconds and printed `h2puni gate: running on
f04ac32c907e705f981983ae273115fca7944fce`. Frozen Bun 1.4.4 verification checked
1806 installs across 1653 packages with no changes. Tool Wiki explicitly reports
inactive and `certified:false`. The exact candidate is now running under the
canonical lock; this admission/install receipt is not a final gate pass. The
original queue refusal remains recorded. No checkout preceded lock acquisition,
no live job was interrupted and the CI workflow was not restarted.

The full registry objective remains incomplete. Original tasks 4.2, 4.3, 5.1 and
5.2 are open, physical backup admission is closed, and installed lifecycle,
provider-accounting bounds, credential preflight and actual alert delivery remain
unverified. No product deployment or migration occurred.

The subsequent authoritative job query proved the packed-package phase completed
successfully at 16:09:42 UTC, and full Twilight job `126001858545` completed
successfully at 16:09:44 UTC. The exact-candidate canonical h4 gate also reports
normal OpenSpec validation 323/323 passed (304 changes, 19 specs). An initial
comparison incorrectly expected the earlier `47be0234c` candidate's 319 items and
failed; inspection of this exact candidate's actual summary corrected that stale
expectation without changing source or validation. Both outcomes are retained in
`/tmp/runtime-dispatch-preparation-gate-openspec-count-audit-20261103.json`.
This is normal full-repository validation, separate from the strict owning-warning
limitation above. Workspace CI and the complete canonical gate remain pending; the narrower
successes do not establish registry activation.

## Repair candidate CI verified successful — 2026-11-03

Original candidate workflow `41660331719`, attempt 1, completed successfully at
16:34:15 UTC for `f04ac32c907e705f981983ae273115fca7944fce`. Read-only watcher
5348 terminated with exit 0; it is no longer live and must not be restarted or
polled. Workspace job `126001858826` completed successfully at 16:34:05 UTC;
Twilight, its packed-package phase, all four browser shards, `pixels` and the
aggregate `gate` also passed. The separate exact-candidate CodeQL workflow and
all four analysis jobs passed as recorded above; no finding-free claim is made.

The downloaded workspace artifact proves the actual complete backend target:
3905 passed, three skipped, zero failed, 3908 tests across 268 files in 2390.18
seconds. The repaired real integration case appears as passed in 42309.96 ms.
This supersedes the earlier local fourteen-case scope limitation for candidate
CI; it does not certify the separate dirty registry feature branch or activation.

The actual workspace batch ran test/typecheck/build for 53 projects and nine
dependency tasks in 77 minutes 11 seconds, with zero of 143 cache hits. Its
independent affected-lint command returned 0; explicit uncached Burokrat source
lint returned 0. The workflow additionally passed format, solver image smoke,
heavy-work lock, gate head pinning, dev entrypoint, secrets/private-nesting/doc
checks, Compose validation, migration and corpus lint, normal OpenSpec and its
pinned schema-graph check. Three external Tool Wiki activation/audit steps were
conditional skips; Tool Wiki is not certified by this CI success.

Artifact `nx-gate-log-workspace-1`, ID `13249891896`, ZIP 543142 bytes, is retained
at `/tmp/runtime-dispatch-preparation-proof-20261103/workspace-ci/nx-gate.log`:
4012817 bytes, SHA-256
`8d5f00cab5d0f64c1c6897bed021cf781ceda33cd19691c94f5de85f0e19340d`.
Final workflow, backend-case, executed-command and scope receipt:
`/tmp/runtime-dispatch-preparation-ci-final-receipt-20261103.json`.

The exact-candidate canonical h4 gate remains running as session 44538. Candidate
CI success does not substitute for its final result. PR 839 remains unmerged;
no notification, registry lifecycle activation, product deployment or product
migration occurred. Original registry tasks 4.2, 4.3, 5.1 and 5.2 remain open.

## Repair canonical gate and maintained-source merge — 2026-11-03

Exact-candidate canonical h4 gate session 44538 completed with exit 0. The log
contains the single actual revision marker
`f04ac32c907e705f981983ae273115fca7944fce`. Frozen installation checked 1806
installs across 1653 packages with no changes. Normal OpenSpec passed 323/323;
the unchanged canonical steps then ran format `--all`, the complete main batch,
Twilight batch, both separate source lints and solver image smoke.

The main batch passed test/lint/typecheck/build for 53 projects plus ten dependency
tasks in 60 minutes 21 seconds, with Nx cache skipped. Twilight passed
test/typecheck/build for both projects plus four dependencies in 49 minutes 36
seconds, also uncached. Burokrat source lint passed in 25.5 seconds; Dash lint in
39.5 seconds. Solver smoke passed in 3 minutes 53 seconds, including actual
baseline/shared-person answers and three real-Docker orphan tests with fifteen
assertions, zero failures across two files. Tool Wiki remained inactive and
`certified:false`; the retained Docker/pip notices and initial curl reset do not
make this a warning-free claim.

The final log is
`/tmp/runtime-dispatch-preparation-gate-h4-f04ac32c9-wait3600-20261103.log`,
317576 bytes, SHA-256
`c150ac9d8d6c2854ef62338fdb65be8e53559e9b56297693a8d74bf78ee31faf`.
Receipt: `/tmp/runtime-dispatch-preparation-gate-final-receipt-20261103.json`.
The original exit-75 queue attempt remains a failed attempt; only its supported
finite retry ran and passed. Both host-gate and candidate-CI observers are terminal.

Fresh PR metadata proved the exact reviewed head, all seventeen check entries
complete, expected documentation/Tool Wiki conditional skips only, and zero
review threads with no next page. Normal `gh pr ready` and squash merge guarded
by `--match-head-commit f04ac32c907e705f981983ae273115fca7944fce` returned 0.
A fresh API query confirmed PR 839 merged into main at 20:08:38 UTC as
`91eac97bf739af228c38a6ca7633ea7c17821717`. No admin override, hook bypass,
force push, branch deletion or checkout movement was used.

The first post-merge audit expected the candidate's tested base
`d7070b0133e66c2fcc093a93cf9026e0cfec7289` to remain main's parent and failed.
Inspection of actual Git history identified parent
`415fd79026239a7641a15bd44188915121fed84b`: two intervening commits changed only
`libs/wbs/adapters/store-sqlite/src/step-node-attempt.db.test.ts`. No reviewed path
overlaps. The corrected parent-based comparison proves all three reviewed blobs
and the entire merge patch equal the candidate exactly; the unrelated main test
change is preserved. The resulting entire main tree therefore differs from the
older gated candidate by that preserved test change. Both audit outcomes and the
precise source/tree scope are retained in
`/tmp/runtime-dispatch-preparation-merge-receipt-20261103.json`.

Actual merged-main CI `41709822821` is running on
`91eac97bf739af228c38a6ca7633ea7c17821717`. CodeQL run `41709821884` uses the
dynamic `github-code-scanning/codeql` push workflow; three analysis jobs were
observed successful and JavaScript/TypeScript still running. Candidate receipts
are not substituted for these later outcomes, and no workflow was restarted.
Their terminal results and the full registry lifecycle remain unverified.

The original accepted registry feature inputs and worktree are preserved. Physical
backup admission stays closed; tasks 4.2, 4.3, 5.1 and 5.2 remain open. This source
integration performs no reserved prod deployment, registry lifecycle adoption or
existing-product migration. Installed/native authority proofs, provider billing
bounds, protected credential preflight and actual notification/recovery evidence
remain outstanding.

## Actual merged-main CodeQL verified — 2026-11-03

For actual combined main commit `91eac97bf739af228c38a6ca7633ea7c17821717`,
CodeQL workflow `41709821884` completed successfully (updated at 20:28:16 UTC).
Fresh job metadata proves all four analyses completed successfully: JavaScript/
TypeScript `126174653185`, C/C++ `126174653726`, Python `126174653731` and Actions
`126174653742`. This records workflow/job conclusions only; no finding count,
finding-free repository or unchanged-finding-baseline claim is made.

Receipt: `/tmp/runtime-dispatch-preparation-merged-main-codeql-receipt-20261103.json`,
including the captured metadata-file hash. The original main CI `41709822821`
remains running, observed by read-only session 41187. Actual main browser shards
3 and 4 passed; shards 1 and 2, workspace, Twilight and aggregate results remain
pending. No workflow or completed candidate gate was restarted. The original
registry activation tasks and implementation/credential/provider boundaries remain
unchanged; no activation requirement is closed by these narrower source checks.

## Actual merged-main Twilight verified — 2026-11-03

For actual main `91eac97bf739af228c38a6ca7633ea7c17821717`, Twilight job
`126175343675` in original CI `41709822821` completed successfully at 21:14:04 UTC.
The runtime step passed at 21:09:09 UTC. The actual batch ran test/typecheck/build
for both projects plus four dependency tasks in 56 minutes 48 seconds, with zero
of ten cache hits. Main suite summaries record Dash 4356 passed/four skipped/zero
failed across 141 files and Burokrat 2588 passed/zero failed across 104 files.
Nested child-fixture summaries are excluded from those counts.

The full-mode log separately proves Burokrat source lint success in 33.2 seconds
and Dash lint success in 51.1 seconds. The packed-package phase ran from 21:09:14
to 21:14:02 UTC and completed successfully. Artifact `nx-gate-log-twilight-1`,
ID `13271083240`, ZIP 374217 bytes, is retained at
`/tmp/runtime-dispatch-preparation-proof-20261103/main-twilight-ci/nx-gate.log`:
4248649 bytes, SHA-256
`9614b283f3f3a6516d979428de5e614c97dbcd504a8342afefe40c2a40527050`.
Receipt: `/tmp/runtime-dispatch-preparation-merged-main-twilight-receipt-20261103.json`.

Fresh actual main browser metadata also proves all four shards and the `pixels`
aggregate successful; receipt:
`/tmp/runtime-dispatch-preparation-merged-main-browser-receipt-20261103.json`.
Main CodeQL already passed as recorded above. Only workspace job `126175343656`
and the final CI aggregate remain pending, observed by the existing read-only
watcher 41187. No workflow was restarted, and none of the original registry
activation requirements is closed by these source-validation results.

## Actual merged-main validation complete — 2026-11-03

This supersedes the running observations above. Actual combined main
`91eac97bf739af228c38a6ca7633ea7c17821717` completed CI `41709822821`
successfully at 21:39:47 UTC. Workspace job `126175343656` completed successfully
at 21:39:41 UTC and aggregate job `126223188513` passed. Watcher 41187 exited 0;
all candidate/main CI and canonical-gate observers are terminal. No workflow or
completed gate was restarted.

The actual workspace batch ran test/lint/typecheck/build for 53 projects plus
ten dependency tasks in 83 minutes, with zero of 196 cache hits. Backend tests:
3905 passed, three skipped, zero failed, 3908 tests across 268 files in 2389.08
seconds. The repaired delayed real-integration case passed in 41879.10 ms. SQLite
tests: 2048 passed, one skipped, zero failed, 2049 tests across 153 files in 846.70
seconds. These are actual combined-main results, separate from candidate results.

Solver image smoke and the final heavy-work lock, gate head pinning, dev
entrypoint, secrets, private nesting, doc caps, Compose, migration lint, corpus
version lint, OpenSpec and pinned-CLI schema-graph checks all succeeded. The
three conditional Tool Wiki steps were skipped: diagnostic/non-certifying,
immutable external activation provisioning and externally activated push audit.
This does not certify Tool Wiki or establish a finding-free CodeQL baseline.
Actual main Twilight/package, browser and CodeQL conclusions are recorded above.

Workspace artifact `13272738721` is retained at
`/tmp/runtime-dispatch-preparation-proof-20261103/main-workspace-ci/nx-gate.log`:
4004286 bytes, SHA-256
`46db133f39df3401b748af742d6ce1d276a8bc23b648a7324a31ce995ee4566f`.
The raw log hash was independently rechecked during this reconciliation.
Final workflow/job/runtime receipt:
`/tmp/runtime-dispatch-preparation-merged-main-ci-final-receipt-20261103.json`.
This validates the maintained-source prerequisite, not the dirty registry feature
or live lifecycle adoption. No new runtime tests were needed for this documentation
reconciliation; full dirty-feature and installed activation checks remain unverified.

## Registry activation blocker audit — 2026-11-03

OpenSpec apply reports seven of eleven implementation tasks complete; 4.2, 4.3,
5.1 and 5.2 remain open. All 25 accepted ordinary source hashes were rechecked
against `/tmp/registry-alert-current-input-pins-20261102.json` without changes.
`admitRegistryBackup` still unconditionally throws `backup-budget-unavailable`;
its source SHA-256 remains
`4091bcd331fb9d42a5afeffbc3c12f3600c6588dfcca67028a8c4443481612f4`.
No backup grant, retention effect or snapshot was authorized by this audit.

Fresh selected nonsecret unit metadata at 22:00:15 UTC on verified h4 machine
`f592d9aa3f3547d0b08a4b8bdec81012`, non-root UID 995, reports
`LoadState=not-found` for `puni-registry-pressure.service`,
`puni-registry-retire.service`, `puni-registry-retire.timer`,
`puni-registry-alert-send.service` and `puni-registry-alert-send.timer`.
Receipt: `/tmp/registry-maintenance-unit-refresh-20261103T220015Z.json`.
No unit was installed or restarted. Earlier legacy backup-timer success does not
prove snapshot integrity, coverage or physical budget enforcement.

- **REG-B1:** The complete conservative provider stored/billed-byte contract is
  unavailable. The user deferred Hetzner follow-up. Payload census alone cannot
  open the 100 GiB budget; no repeated public search or provider contact occurred.
- **REG-B2:** The fixed protected-configuration reader remains unexecuted.
  Automatic approval review rejected reading the credential-bearing root backup
  configuration as exceeding the non-root metadata authorization. Exact approval
  remains pending; no protected file or alternate route was used.
- **REG-B3:** Native authority, installed bounded storage/runtime profiles and
  their required isolation/failure proofs remain incomplete. The existing stop on
  privileged/namespace/queued-descriptor analysis remains in force. The design
  requires verified storage and profiles before activation; a standalone planner
  or unverified root-filesystem fallback cannot satisfy the production boundary.

Task 4.2 still needs the complete installed retirement/recovery lifecycle; 4.3
needs physical funding, repository/source/profile bounds, protected reclamation
and retained post-prune restore; 5.1 needs actual destination and independent
five-minute missed-source delivery; 5.2 needs the complete disposable enforced
storage/fault rehearsal and exact-feature validation. No actual notification,
protected configuration read, native/provisioning execution, lifecycle activation,
prod deployment or existing-product migration occurred. The full objective is
incomplete; source CI success closes none of these four tasks.

## Approved repository observation resolves REG-B2 — 2026-11-03

Explicit user approval superseded the earlier rejected/pending status for the
fixed nonsecret repository-identity reader. The unchanged hash-pinned reader
completed on identity-verified h4 at 22:13:10 UTC via its existing root SSH alias,
after the non-root transport's sudo command failed before reader execution.
It established configured endpoint `hel1.your-objectstorage.com`, bucket
`puni-01`, prefix `backups/registry/restic-v1` and `https` syntax. Only those
four fields were emitted; credentials and full configuration were neither
printed nor retained. No provider or backup command, configuration mutation,
service restart, deployment or existing-product migration occurred.

The reader's exact contract, source hash, successful receipt and evidence limits
are recorded in [backup accounting](../../../docs/findings/registry-backup-accounting.md#approved-installed-repository-identity--2026-11-03).
REG-B2 is resolved. This does not resolve provider accounting, bucket versioning,
immutable repository identity, physical funding, installed/native storage or the
remaining lifecycle proofs. REG-B1 and REG-B3 persist; backup admission stays
closed and tasks 4.2, 4.3, 5.1 and 5.2 remain open. No runtime source changed.

## User-approved backup budget measure — 2026-11-04

The user explicitly retained the 100 GiB limit and requested counting files.
Updated the intent, design, delta spec, Task 4.3, registry glossary and linked
accounting/workspace findings: the measure is complete stored object/version and
uploaded-part sizes, including restic metadata files. Provider billing overhead,
minimum billable object sizes and rounding are outside this measure. A Hetzner
billing formula is no longer required; REG-B1 is resolved by the user's contract
change, while the approved repository read already resolved REG-B2.

The existing S3 census supplies the matching payload total. This review does not
claim that census alone implements admission: reserve new files, retries/versions
and prune coexistence before writes, preserve coverage/pins and require bounded
local workspace. Added delta-spec scenarios for unknown billing overhead with a
complete file reservation and refusal when reserved additions exceed 100 GiB.
Those scenarios describe required behavior, not newly executed runtime proofs.

Runtime source and the closed admission adapter are unchanged. Native authority,
installed storage/profile proofs, complete funded backup/prune/restore integration,
real alerts and full lifecycle validation remain required. Tasks 4.2, 4.3, 5.1
and 5.2 remain open; no backup command, provider call, destructive effect,
notification, service change, prod deployment or product migration occurred.

## Resumed activation audit after accounting clarification — 2026-11-04

The user reactivated the full goal. Previous-turn classification: progress, because
the explicit file-size budget choice changed the owning intent/design/spec/tasks
and removed REG-B1. Current OpenSpec apply again reports seven of eleven tasks
complete, with 4.2, 4.3, 5.1 and 5.2 open. The chosen object/version/part-size
measure remains present. The approved nonsecret repository observation is recorded
above; REG-B2 is no longer an approval blocker.

The production admission adapter still unconditionally refuses
`backup-budget-unavailable`; its current SHA-256 is
`4091bcd331fb9d42a5afeffbc3c12f3600c6588dfcca67028a8c4443481612f4`.
The reviewed contents observation excludes complete encoded/repository/profile
bounds, and the durable effect state remains explicitly `effect-lineage-only`.
Neither interface supplies complete funded backup/prune/restore admission.
A separate unconsumed planner would not satisfy the specified production boundary.
The required installed/native authority/profile evidence remains missing, and the
prior security-filter stop on the privileged-proof extension remains in force.
That work was not resumed, rephrased or delegated.

Earlier temporary identity, pin and audit receipts are unavailable under `/tmp`
in this resumed environment. The historical repository record is preserved;
missing raw evidence is not treated as a fresh validation or silently recreated.
No old gate/CI watcher was polled or restarted, and no live validation wait is
claimed. This is the first blocker audit of the resumed active goal; REG-B3
persists, with the full objective and all four open tasks unchanged.

Current audit receipt: `/tmp/bound-registry-storage-resumed-audit-20261104.json`.
No runtime source, native/helper/profile/provisioner, host configuration or task
checkbox changed. No provider/credential read, backup, retirement, notification,
service change, prod deployment or existing-product migration occurred.

## Draft publication and fixture hook correction — 2026-11-04

The user requested that all session work be freshly pushed to PRs or already
merged. The registry worktree contained 422 modified/untracked paths plus local
commits without a PR; the two clean private companion branches also lacked PRs.
They are being preserved as drafts, not claimed ready for activation or merge.
Prior dash plan PR 802, monitoring prerequisite PR 833, fixture repair PR 839 and
website dev-build PR 75 were freshly confirmed merged through GitHub metadata.

The first normal commit attempt refused eleven lint errors in the ordinary Dagger
ownership fixture. Replaced cross-project relative imports with the existing
`@tools/registry-publication` facade, awaited mock registration and used explicit
resolved promises for synchronous fixture ports. No production safety guard or
native authority implementation changed. Targeted fixture ESLint then exited 0.
The affected publication test file passed ten tests, zero failed, sixteen asserts.
Its initial sandbox run failed solely because localhost listen was denied; the
scoped allowed run exercised the owned HTTP receiver successfully. These tests
use modeled capacity/verification ports and do not run the stopped privileged
native proof. Full dirty-feature runtime/gate and installed proofs remain absent.

All inventoried publication files passed the repository plaintext-secret scan;
strict owning OpenSpec and whitespace checks passed. The normal commit hooks are
required and no bypass is used. Publication preserves the existing source and
explicitly unfinished lifecycle; it performs no host deployment or product migration.

## Installed legacy backup failure and source supersession — 2026-11-08

Previous-turn classification: progress. The complete sixteen-path PR 844 audit
proved its pinned monitoring snapshot already covered by merged PR 833 and the
reviewed verifier-output/mounted-config corrections on main. Six paths matched
exactly; the other ten contained the reviewed fixes/tests/documentation. PR 844
was closed as superseded, with its remote branch and clean detached worktree
retained. This does not establish live monitoring adoption or complete Task 5.1.
Audited main: `1815fd9df9e508156729e8f133f874be755a35ef`.

Fresh non-root metadata on identity-verified h4 at 2026-11-07 22:22 UTC still
reported all five required pressure/retirement/alert-sender units not found.
The legacy backup timer was active/waiting, but its service was failed:
`Result=exit-code`, `ExecMainCode=1`, `ExecMainStatus=1`, no restarts. The last
attempt started at 02:37:09 UTC and exited at 02:38:09 UTC that day.

A fixed two-minute, eighty-entry journal window contained six records. Bounded
classification using only the legacy runner's fixed failure grammar identified
`restic cat`, exit 130, timeout true, cancellation false. No raw journal message,
command arguments, credentials or configuration contents were emitted or retained.
Initial broad diagnostic categories matched nothing; those observations did not
establish a cause. The later exact command-category result narrows the failure
but does not establish why repository access timed out or prove a valid snapshot.

Credential-free HEAD probes at 22:25:46 UTC resolved both address families for
`hel1.your-objectstorage.com`; IPv4 and IPv6 each returned HTTP 200, in 0.022870
and 0.026504 seconds respectively. No bucket, object, repository or authenticated
request was made. Current DNS/TCP/TLS success cannot explain or rule out the
earlier authenticated repository failure. Last verified backup age/integrity and
fresh authenticated repository access remain unverified; no backup was restarted.

At 22:27 UTC the registry Deployment had one desired, ready and available replica.
Both root `puni-cluster` and child `platform` Flux suspensions were false. Platform
was ready at generation/observedGeneration 46. Root was not ready, with
`HealthCheckFailed`, generation 32 and observedGeneration -1. Root reconciliation
was not changed; prior documented held-stage health behavior does not authorize
removing holds. Replica availability does not prove every manifest/blob or an
uncached image pull, nor does it prove how the earlier backup attempt recovered.

Receipt: `/tmp/registry-installed-backup-observation-20261108.json`.
This turn produced new failure/readiness evidence without activation. The source
admission adapter still refuses; original tasks 4.2, 4.3, 5.1 and 5.2 remain open.
No native/provisioning/profile or stopped privileged-proof work was resumed. No
credential file was read, backup/retirement effect requested, service changed,
notification sent, prod deployed or existing product migrated.

### Authenticated repository diagnostic prepared, approval pending

The concrete next diagnostic is the existing pinned Restic 0.19.1 executable
`/root/.puni/tools/restic-0.19.1`, SHA-256
`20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`,
invoked only as `--no-lock --no-cache cat config` for the exact already observed
repository. A fixed remote wrapper checks machine identity and binary/config
metadata, loads only the selected installed credential environment internally,
sets a thirty-second deadline, and emits only nonsecret repository ID/format or a
fixed failure category. It requests no snapshot, restore, prune, deletion, cache
write, lock write or service change. This is a diagnostic, not production admission.

Prepared wrapper: `/tmp/registry-restic-readonly-probe-20261108.py`, SHA-256
`5dbdf8ac14127569c2e4d8e677db9db3cfa030843b407530e658c294f6186373`.
Its pure environment parser passed seven synthetic checks, including refusal of
foreign repository, duplicate/missing/ambiguous selected values and shell-shaped
repository input. These do not certify actual root, provider or process boundaries.

Automatic approval review rejected the command before execution: using protected
credentials for an authenticated external repository request exceeded the user's
earlier bounded identity/configuration authorization. No credential file or
repository was accessed by this attempted probe. No alternate route or indirect
execution was tried. Explicit approval was requested for this exact read-only
probe; the request remains pending independently of the stopped native proof.
The rejection is not evidence that the repository is unavailable or unsafe.

## CodeQL outcome and ordinary journal child transport — 2026-11-08

For published head `cc539b3175283ec88a622b6e76f1387bbc37268f`, CodeQL
workflow 42421038681 completed successfully at 22:38:35 UTC. All four analyses
succeeded; JavaScript/TypeScript took 6 minutes 42 seconds. Observer 76530 exited
0 and is terminal. The separate findings check 128549467025 failed with five
reported new alerts, including two high-severity alerts. Workflow success does not
establish a clean findings check. The scanner also could not retrieve the complete
PR diff because it exceeds 300 changed files; novelty attribution is not assumed
complete. No workflow was restarted and no finding was dismissed.

One alert concerned measured JSON interpolated into the evaluated child program
of the ordinary journal crash/lock test in `registry-maintenance-authority.test.ts`.
The child program is now constant and receives the same measured capacities as
JSON through its owned stdin pipe. Argument positions and all existing marker,
competing-process, crash, held-lock, retained-fence, recovery-token and cleanup
assertions remain unchanged. This is a test transport refactor; no production
journal, native isolation guard, root profile or provisioning behavior changed.
It does not decide whether the old path was exploitable.

The existing file passed 17 tests, zero failed, 46 assertions before the refactor
in 1.87 seconds and after it in 1.67 seconds. Targeted ESLint and whitespace checks
exited zero. These tests use owned ordinary files and child processes under the
caller; they do not execute the stopped privileged namespace/isolation proof.
No new production safety predicate was introduced, so no new production omission
proof is claimed. Scoped independent read-only review approved the transport
refactor with no actionable findings, confirming stdin EOF, measurement/argument
ordering and retained assertions; it did not rerun fixtures. Fresh remote CodeQL
is still required before claiming the specific alert resolved. The remaining four alert instances
are untouched; their metadata alone does not establish a defect or false positive.

The complete dirty-feature suite, exact-feature host gate, native/installed
profiles, funded backup/prune/restore integration and real alert/recovery proofs
remain unverified. The authenticated repository probe remains rejected before
execution with its exact approval request pending. No provider account request,
credential file read, backup, restore, retirement, service change, notification,
prod deployment or product migration was performed.

## Dormant source-stage index freeze — 2026-11-08

This receipt stages the complete retained source from
`e347fbf7adf555e75259ad520ffe7eef25e2a1b4` against main
`e52bc3928736334c97bed5eebb2e03268c930db3`. Historical managed caller
integration receipts above describe the retained prototype, not current default
routing. Supported publishers, copier, Compose deployment/swap and Kubernetes
coordinators retain main behavior and schema3/version2 writers. Managed helpers
and owner readers remain explicit; no installed/provider/native readiness follows.

All 517 retained additions remain. Thirteen restored runtime/test/active-manifest
paths match main bytes; only first-start/journal receive shared validation. The
four-argument copyImage declaration/body also matches main. Project targets, aliases,
package pins and policy catalogs preserve newer main entries. Source intent is 397 words.

### Source checks at index freeze

- Frozen Bun install: 1523 packages, 40.26s; newer main dependencies plus pinned S3.
- `bunx nx run-many -t typecheck -p tool-deploy,tool-dagger,tool-remote-scripts,tool-fleet,tool-devsync --parallel=2 --skip-nx-cache`: five passed, 4.5s after correcting extraction imports/symbols and newer-main fixture buffer types.
- Owning lint: all five projects passed after import sorting and void-arrow fixes.
- `bunx nx run-many -t build -p tool-deploy,tool-remote-scripts,tool-fleet --parallel=2 --skip-nx-cache`: three owners plus eight dependency tasks passed, 1.0s.
- Shared CI helper's devsync lint/typecheck/build plus nine dependency tasks passed, 9.8s. Its actual owning shellcheck rejected an incomplete-if fault with SC1073/SC1072; exact helper bytes restored.
- `bunx nx run-many -t test -p tool-deploy,tool-dagger,tool-remote-scripts,tool-fleet --parallel=2 --skip-nx-cache`: at this historical index freeze, deploy 879, Dagger 73, remote 820 and pinned-container Caddy 2 tests passed. Fleet's same execution remained pending; no fleet success is claimed by this freeze receipt. The normal local merge requires its eventual verdict, recorded with exact commit/index identity in the parent's frozen report. No second broad campaign was launched.
- Remote suite's two existing solver-Docker cases remain skipped without WBS_SOLVER_ORPHAN_IMAGE. Existing optional Restic and observability-lab selection remains unchanged; no new exemption or suite weakening.
- Complete changed toolchain fixture file: 34 pass/0 fail, 140 assertions, 104ms. Both selecting CI jobs execute one shared helper; both infra event filters select helper-only changes. Unrelated Twilight setup, docs routing, affected selectors and timeouts remain unchanged.
- Earlier focused controls: 74 legacy, 20 copy/Compose, 59 paired parser, 46 restored fault controls; all passed. Full scoped logs retain commands/timings rather than rewriting older evidence.
- Full tracked-tree secret, migration, private-nesting and doc-cap checks passed before the final helper addition; ordinary commit hooks and final source checks remain mandatory for that staged delta.

### Active rendering and failure proofs

Public-pinned kubectl v1.36.4 bytes matched the public toolchain lock
`8b8f088da2dab964f853b38464033b1be15ede2839eca751482357c45abdd05a`.
Actual local and production Kustomize renders match main byte-for-byte:
`63b0d0fd64173d2966ad81ff706265d9cfd1bd127e1266870ead2c828481a365` and
`5fb4f7130191e052d8ef562407d0ffbd88d2bfd53338745a83a8b12ba7c9bc68`.
Linking storage-patch.yaml in owned scratch rendered successfully and failed the
closure-equality predicate with exit 1. The dormant linked render retains deletion
and upload-purger disables; the active base keeps main's resources/settings.

Production-path guard removals observed real assertion failures, with exact source
bytes restored in finally blocks: 23 parser/ownership/transport guards; four remaining
legacy publish/deploy/execute/swap selection edges; closed backup admission; four
historical inline-CI command omissions; nine current shared-helper/job/filter
dependency omissions; and the owning build's broken-helper syntax fault. Current
helper proofs replace inline wiring evidence; neither describes host provisioning.
Unsupported-version and checksum fixtures were strengthened to isolate their own
guards from later binding/receipt refusals. Present/absent/unreadable/oversize owner
files, initialized genesis, sealed transfer, missing transferred destination, foreign
binding/history and migration/replay checks remain tested. Adjacent Proof comments
name the observing paths. Old integrated-coordinator acceptance remains historical
and explicitly outstanding for coordinated activation.

Backup admission still throws backup-budget-unavailable before storage effects.
100 GiB remains 107374182400 stored object/version/uploaded-part bytes, excluding
billing overhead; no complete physical-budget adapter or successful-budget receipt
is invented. The private first-install A→B policy/lineage gap remains open before
managed adoption without public producer-contract changes.

### Remaining acceptance

Required final source format, strict/all OpenSpec, source checks, normal local hooks,
independent full-main-delta review and exact-current-head GitHub gate/pixels/infra
verdicts remain mandatory. Local default Caddy succeeded under ordinary sandbox
escalation with no binary override; an earlier sandbox-only Docker permission
refusal remains historical, not a permanent tool block.

No stopped privileged chroot proof, named test:registry-* or rehearse:registry-*
target, installer main, enrollment, Secrets, installed audit/spool state, VM/storage
allocation, Flux action, publish/pin/rollback or production operation was performed.
The ordinary source suite includes local user namespaces/process/compiler fixtures;
those do not establish installed qualification. All physical/native/provider, backup,
isolation, protection, restore, monitoring, delivery and product-migration tasks stay
open. The exact-revision canonical host gate remains required before deployment and
adoption; this source-only phase neither invents a duplicate host gate nor claims
host qualification from CI.
