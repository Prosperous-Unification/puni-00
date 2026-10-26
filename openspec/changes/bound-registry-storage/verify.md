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
