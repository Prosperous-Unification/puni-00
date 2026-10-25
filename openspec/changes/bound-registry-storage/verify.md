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

| Requirement                                     | Current evidence and remaining work                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Enforced registry storage boundary              | Physical fixtures and scoped review passed; production provisioning/startup pending.      |
| Publication admission and pressure response     | Authority/supervisor and publication/copy proofs reviewed; live activation pending.       |
| Protect images before referring to them         | Publication and deployment code reviewed; native and installed proofs pending.            |
| Complete trusted consumer inventory             | Adapter code reviewed; installed readers and complete native registry census pending.     |
| Release-aware retirement eligibility            | Policy and bound census/plans reviewed; serialized execution and live retirement pending. |
| Complete image dependency closure               | Complete census/closure code and native proof reviewed; live integration pending.         |
| Serialized recoverable maintenance              | Durable authority reviewed; coordinated backup/delete/GC/recovery integration pending.    |
| Bounded backup lifecycle                        | Budget, retention and isolated post-prune restore pending.                                |
| Proven monitoring and adoption                  | Real alert destination/delivery, missed-check proof and staged adoption pending.          |
| Physical backup accounting                      | Provider version/multipart census and budget admission pending.                           |
| Early pressure response                         | Threshold policy reviewed; periodic service/retirement/notification integration pending.  |
| Per-environment rollback coverage               | History/protection code reviewed; native and installed proof pending.                     |
| Independent journal capacity and durable fences | Independent journal/HTTP fence proofs and parser review passed; live activation pending.  |
