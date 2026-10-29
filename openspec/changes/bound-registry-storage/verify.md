## Verification status

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
The slice receipts above are narrower evidence and do not substitute for that audit.
All seventeen current delta requirements are listed, including the four installed
workflow and consumer-completion contracts added during deployment integration.

| Requirement                                             | Current evidence and remaining work                                                                                                                                                             |
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
| Physical backup accounting                              | Provider version/multipart census and budget admission pending.                                                                                                                                 |
| Early pressure response                                 | Threshold policy reviewed; periodic service/retirement/notification integration pending.                                                                                                        |
| Per-environment rollback coverage                       | History/protection code reviewed; native fourteen-promotion/two-environment fixture passed; installed proof pending.                                                                            |
| Independent journal capacity and durable fences         | Independent journal/HTTP fence proofs and parser review passed; live activation pending.                                                                                                        |
| Mandatory installed selection and compatible artifacts  | Catalog and artifact boundaries reviewed in deployment slice; actual installed catalogs, all entrypoints and private Bun compatibility still require exact-revision proof.                      |
| Source-proved owning history and authenticated repair   | Owning-history and authenticated resume code reviewed; live initialization/transfer and lost-owner-persistence repair remain unverified.                                                        |
| Registry-wide Docker coverage and environment ownership | Registry/global and Compose projection code reviewed; complete installed SSH/UID/catalog census, including stopped containers and shared-environment retirement, pending.                       |
| Consumer completion precedes promotion                  | First-start/release/Compose/private completion code reviewed and smoke behavior exercised; exact installed smoke, locked retries and downstream private Flux/runtime completion proofs pending. |

## Named scenario completion audit

All 24 named scenarios remain unverified for final adoption. The original 23 are
preserved; permission-update overlap was added after its controlled counterexample. This table identifies
the evidence still needed; it does not upgrade earlier scoped receipts into
integrated or installed proof. Record the final revision, command or receipt,
observed outcome and applicable failure witness for each row before completion.
The linked specification remains the behavior contract.

| Scenario                                                                                                                                                                     | Evidence still required for final adoption                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Storage fills without consuming the host root filesystem](specs/registry-storage-lifecycle/spec.md#scenario-storage-fills-without-consuming-the-host-root-filesystem)       | Actual bounded-volume exhaustion and host-root reserve measurements from the final rehearsal.                                                                                                                         |
| [Registry mount is missing](specs/registry-storage-lifecycle/spec.md#scenario-registry-mount-is-missing)                                                                     | Installed startup refusal with the mount missing or replaced; verify no registry content reaches root.                                                                                                                |
| [A large publication would cross the cutoff](specs/registry-storage-lifecycle/spec.md#scenario-a-large-publication-would-cross-the-cutoff)                                   | Actual publication entrypoint refusal before its first upload, with the specified reservation and measured capacity.                                                                                                  |
| [Two publishers compete for the remaining space](specs/registry-storage-lifecycle/spec.md#scenario-two-publishers-compete-for-the-remaining-space)                           | Concurrent installed publishers sharing the real authority; receipts show one admitted slot and no double-spent reservation.                                                                                          |
| [Permission checking overlaps an authority update](specs/registry-storage-lifecycle/spec.md#scenario-permission-checking-overlaps-an-authority-update)                       | Final-source actual authority update across sampling converges within three attempts; revoked/expired/stably mismatched/churning permission refuses. Removal witnesses and installed guard regression remain pending. |
| [Pressure cannot be resolved safely](specs/registry-storage-lifecycle/spec.md#scenario-pressure-cannot-be-resolved-safely)                                                   | Protected-content reads, persistent admission refusal and delivered capacity alert at the configured destination.                                                                                                     |
| [An old release still serves an environment](specs/registry-storage-lifecycle/spec.md#scenario-an-old-release-still-serves-an-environment)                                   | Complete installed desired-state census including a scaled-to-zero consumer, followed by retained-closure verification.                                                                                               |
| [Deployment crashes before switching traffic](specs/registry-storage-lifecycle/spec.md#scenario-deployment-crashes-before-switching-traffic)                                 | Actual interrupted deployment and restart/reconciliation receipts preserving candidate and rollback ownership.                                                                                                        |
| [A consumer cannot be inspected](specs/registry-storage-lifecycle/spec.md#scenario-a-consumer-cannot-be-inspected)                                                           | Destructive orchestration refusal for missing, unreadable and malformed registered evidence; observe no deletion.                                                                                                     |
| [Partial publication never became a release](specs/registry-storage-lifecycle/spec.md#scenario-partial-publication-never-became-a-release)                                   | Final-source partial three-tier publication, trusted abandonment/grace evidence, exact cleanup and preserved shared protections. Earlier Task8 native receipts are development evidence.                              |
| [Ten release bundles share tiers](specs/registry-storage-lifecycle/spec.md#scenario-ten-release-bundles-share-tiers)                                                         | Integrated repeated retirement preserves shared retained closures and can later reclaim newly unprotected residual content. Earlier policy/native receipts are scoped.                                                |
| [An untagged platform image belongs to a protected index](specs/registry-storage-lifecycle/spec.md#scenario-an-untagged-platform-image-belongs-to-a-protected-index)         | Final-source offline GC followed by complete retained index/platform/blob verification and an uncached pull.                                                                                                          |
| [Protection changes after planning](specs/registry-storage-lifecycle/spec.md#scenario-protection-changes-after-planning)                                                     | Actual authority revision change followed by stale-plan refusal before manifest deletion.                                                                                                                             |
| [A process dies during garbage collection](specs/registry-storage-lifecycle/spec.md#scenario-a-process-dies-during-garbage-collection)                                       | Real process termination after deletion, terminal descendant cleanup, durable restart fence and verified recovery. An injected callback exception does not prove process death.                                       |
| [Backup retention cannot satisfy its budget](specs/registry-storage-lifecycle/spec.md#scenario-backup-retention-cannot-satisfy-its-budget)                                   | Real budget admission, preserved last-verified snapshot and recovery pins, no destructive retirement, and visible capacity refusal.                                                                                   |
| [Monitoring stops](specs/registry-storage-lifecycle/spec.md#scenario-monitoring-stops)                                                                                       | Independent five-minute missed-check delivery plus installed publication refusal of stale measurements; metric/log emission alone is insufficient.                                                                    |
| [Logical backups fit but retained object versions do not](specs/registry-storage-lifecycle/spec.md#scenario-logical-backups-fit-but-retained-object-versions-do-not)         | Complete enrolled-provider version and multipart accounting followed by physical-budget refusal.                                                                                                                      |
| [Usage crosses the cleanup threshold](specs/registry-storage-lifecycle/spec.md#scenario-usage-crosses-the-cleanup-threshold)                                                 | Integrated pressure-triggered cleanup preserves the protected 75%, reports the unreachable target and does not weaken protection.                                                                                     |
| [An environment has not deployed the newest product releases](specs/registry-storage-lifecycle/spec.md#scenario-an-environment-has-not-deployed-the-newest-product-releases) | Installed environment history/consumer evidence and retirement preserving its older rollback closure.                                                                                                                 |
| [Registry storage fills during an upload](specs/registry-storage-lifecycle/spec.md#scenario-registry-storage-fills-during-an-upload)                                         | Actual upload ENOSPC with an independently writable bounded journal, failure receipt and persistent fence after restart.                                                                                              |
| [An adopted target loses its environment selector](specs/registry-storage-lifecycle/spec.md#scenario-an-adopted-target-loses-its-environment-selector)                       | All installed mutating entrypoints with the selector unset still enforce the trusted catalog and managed receipt before effects.                                                                                      |
| [Promotion succeeds but owner persistence is lost](specs/registry-storage-lifecycle/spec.md#scenario-promotion-succeeds-but-owner-persistence-is-lost)                       | Authenticated installed resume returns the original promoted receipt, repairs source history and leaves deployment effects and authority unchanged.                                                                   |
| [One of two environments sharing an image retires](specs/registry-storage-lifecycle/spec.md#scenario-one-of-two-environments-sharing-an-image-retires)                       | Actual complete Docker census including stopped containers and exact environment ownership; retirement of A preserves B and its global roots.                                                                         |
| [Managed Compose smoke fails after all tiers commit](specs/registry-storage-lifecycle/spec.md#scenario-managed-compose-smoke-fails-after-all-tiers-commit)                   | Exact installed artifact, real whole-environment lock, failed smoke and full-candidate retry without repeated committed swaps or migrations.                                                                          |

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
