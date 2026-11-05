Publication status: unexecuted operator draft. The three original source findings are closed by the [scoped source fix review](staging-service-fix-review-20261105.md); the separate [operator review](staging-service-operator-review-20261105.md) requires four draft corrections before preparation or native execution. The preserved builder is [staging-native-prepare-draft.py](evidence/staging-native-prepare-draft.py); its commit/hash placeholders intentionally prevent use. This publication changes repository inventory, so every future request needs a fresh inventory and metadata calculation. Historical draft figures and source hashes are not launch authority.

# Task110 one-attempt operator recipe — DRAFT, NOT RUN

Scope: staging service handoff qualification only. Preserve the failed a2f repair,
all old requests/fixtures/evidence, and full G141754548224. No raw/ISO payload,
drain, settlement, release, guest, engine, API, deployment or full-stack activity.

This plan and `/tmp/puni-staging110-prepare.py` are review drafts. They have not
constructed a request, created fixtures, inventoried current state, run helper
preflight, launched services, or been dynamically tested. Their checks are not
claimed proved. The script must refuse with its placeholders intact.

## Source freeze is a prerequisite

Root completes the narrow coordinator fix that acquires the actual request.state
admission lock before exact inventory/whole-ledger/capacity admission and holds it
across both cases, counter durability and cleanup. The exact owned dead child
must close its inherited duplicate. Complete the scoped negatives, R5 proofs,
typing, source review and normal source commit before any builder execution.

Root then fills only these three draft constants from that reviewed commit:
`EXPECTED_SOURCE_COMMIT`, `EXPECTED_SHARED_SHA`, `EXPECTED_THIN_SHA`. Record the
final builder SHA256 for independent review. The six other fixed helper hashes
are already explicit; a changed helper requires a newly reviewed recipe, never
an automatic refresh. There are exactly eight source roles and seven fixed tools.

The earlier shared92c5011d/thin7db65c85 freezes precede the admission-lock fix;
they are historical facts, not final launch authority. The script captures and
SHA/Git-verifies all eight source buffers before executing shared helpers. It
refuses a thin entry exceeding the reserved32768-byte capture envelope; root must
review a larger physical envelope before attempting preparation in that case.
Shared public cap remains98304 and its full32768-byte revision is charged.

## Prepare once on the proper host

Use the existing source/state owner and user manager, currently uid1000; do not
sudo the process to uid0. Root here means the coordinating operator, not Unix
ownership. Source, request, fixtures and both inventory roots must belong to the
effective operator. Installed runtime/tool pins must be root-owned.

Use the exact working directory below and retain the real XDG_RUNTIME_DIR and
DBUS_SESSION_BUS_ADDRESS. C locale, Python3.12 isolation and no-bytecode mode are
mandatory. The builder runs as `python -c`, so its `/tmp` pathname does not become
an uncovered `__main__.__file__`. No datetime/secrets/tempfile/extra discovery
imports are used; nonce generation is one `os.urandom(16).hex()` call.

```sh
cd /home/df/.codex/worktrees/aa39/puni-00
LANG=C LC_ALL=C /usr/bin/python3.12 -I -B -c 'exec(compile(open("/tmp/puni-staging110-prepare.py", "rb").read(), "<staging110-operator>", "exec"), {"__name__": "__main__"})' prepare
```

Do not run this until the source and builder have been reviewed and the proper
host execution is authorized. There is no attempt to execute it in this draft.
Existing `/tmp/puni-staging110-prepared.json` causes refusal: inspect provenance
instead of removing/replacing it unattended.

Preparation first captures sources/tools, checks exact commit/Git blobs and a
tracked-clean tree, and loads only verified source buffers. Git status disables
threaded index/preload/fsmonitor and optional locks under128MiB address space;
the production helper's own rev-parse/ls-tree checks stay unchanged. It then
holds the actual state admission lock while reading the complete ledger and
early two-root inventory/capacity. Original a2f G is required exactly once in
that complete ledger; it is never separately added a second time or credited.

Before any retained creation, measured packet metadata plus all new/future
allocation reserves must fit1MiB. The sole fixture subtraction is12 exact old
terminal-receipt-bound unchanged fixture file inodes totaling1544192bytes;
every directory, symlink, other file and every historical artifact stays charged.
The2MiB fixture bucket remains enforced. Both buckets remain charged in the
complete state/outside inventory and physical floors.

The fresh request goes only to the existing packet as request-NEWNONCE.json.
Two exclusive empty0700 directories are staging-NEWNONCE-live/dead. Their
observed fixed path/device/inode/owner/mode are the exact v2 request fields.
The `/tmp` preparation record supplies exclusive-mkdir lineage; no unverifiable
creator assertion is accepted.

The request is first allocated/written/fsynced as65536bytes of spaces. After
directory/packet sync and the final whole-ledger join, inventory freezes its
inode/blocks. Final JSON is padded and written once through the same descriptor;
size/inode/allocation must stay exact. Only this canonical request path omits
mtime/ctime in inventory. All other entry timestamps remain bound, including
the old accepted request, which is never rewritten or executed.

The future budget explicitly reserves65536bytes total projections,5*4096 tails,
32768 shared capture growth,32768 thin capture,32768 preparation/approval/attempt,16384 plan,
8192 review,16384 execution capture,16384 journal, and16384 directory/rounding.
Before creation it additionally reserves the65536 request,2*4096 empty directory
blocks and16384 preparation packet growth. After creation actual allocations
replace those last three projections. Actual measured totals govern refusal.
No size cap alone certifies an artifact's physical allocation.

## Freeze, independently review, then invoke once

After final binding, make no `.puni` or `.superpowers` writes until the source
invocation's terminal outcome. Do not copy this plan/reports, append logs, format,
test, commit, push, update task files, rewrite requests or produce packet captures
in that interval. Independent review writes only under `/tmp`.

```sh
LANG=C LC_ALL=C /usr/bin/python3.12 -I -B -c 'exec(compile(open("/tmp/puni-staging110-prepare.py", "rb").read(), "<staging110-operator>", "exec"), {"__name__": "__main__"})' review
```

This writes bounded `/tmp/puni-staging110-review.json` using actual existing
`authorize`, `verify_environment`, `check_loaded_runtime`, `inventory_roots`,
`read_reservations`, `observe_capacity`, `check_fixture` and `observe_unit` helpers.
It is a fresh technical preflight, not independent approval by itself. An
independent reviewer must inspect builder and source commit, all8 source and7
tool roles, fresh root-owned actual runtime closure, kernel, original padded FD
identity, both fixture identities/lineage, two-root digest, complete ledger/G,
50GiB+G+future backing,160MiB outside,10GiB staging and2.625GiB initial memory
floors, and the complete1MiB metadata projection. Runtime closure comes from
actual producer-used imports/maps after verified helper loading, never old pins.

After approval, root writes one private bounded `/tmp/puni-staging110-approved.json`
with exactly the following fields, substituting the reviewed values from the
preparation record: schemaVersion1, sourceCommit, nonce, requestSha256,
approved=true. Require0600 and single-link ownership; no request bytes change.
Keep the review report within8192bytes. If root wants more retained review text,
stop and revise/review the envelope before preparing any request.

```sh
LANG=C LC_ALL=C /usr/bin/python3.12 -I -B -c 'exec(compile(open("/tmp/puni-staging110-prepare.py", "rb").read(), "<staging110-operator>", "exec"), {"__name__": "__main__"})' launch
```

The launcher freshly repeats actual preflight while holding its own admission
lock, writes a one-use exclusive `/tmp` attempted marker, closes its own original
lock FD and invokes the corrected thin source CLI exactly once. The CLI must
independently acquire the actual state admission lock before its exact admission
and retain it through both sequential fresh units. No external wrapper substitutes
for this source safety property. Normal source races remain refusal, never retry.

The outer capture has4096bytes joint stream payload/16384bytes JSON allocation
envelope and21s transport timeout; source has its existing12s work/20s hard wall.
Output overflow, timeout, nonzero exit, unexpected stdout or any stderr refuses.
Only the original spawned CLI is killed/reaped by the outer capture. Native unit
cleanup belongs to the verified source's original-owned lifecycle. The output
capture is `/tmp/puni-staging110-capture.json`; it does not certify native success
by itself. Stop on every refusal; preserve all files and never replay this nonce.

## Terminal audit and publication

After terminal, independently join the two cases' durable/terminal projections
to the exact request/source/unit/PID/start/invocation/cgroup, real credentials,
queue exclusion/adoption/dead-sender refusal, process/native caps, authentic
pre-exit counter bodies, publication-before-ACK, original client exits, terminal
empty groups and repeated original-owned cleanup. Absent post-collection/provider
counters remain explicitly unavailable. Inspect actual timings and private stream
absence. Do not infer these outcomes from exit0 or a qualification marker alone.

Only then may root retain the bounded plan/preparation/review/capture/journal
artifacts in the packet, verifying actual allocated metadata stays under1MiB
and full two-root/G/floors still hold. A journal capture, if collected for the
two exact fresh units after terminal, has16384bytes total physical allowance;
bounded absence/unavailability is recorded explicitly and never zeroed. No
unbounded output or extra artifacts fit automatically. Preserve old evidence.
The25600-byte-scale builder stays under `/tmp`; its exact reviewed SHA is recorded
with preparation. Copying it into retained roots needs its own additional charge.
Record native outcome separately, normal commit and freshly push all work.
Service-handoff qualification alone leaves failed-settlement producer/reader,
old-inode drain, Task97 and canonical runtime acceptance4/11 outstanding.

## Operator review prerequisites

The [2026-11-05 operator review](staging-service-operator-review-20261105.md) requires four corrections before real preparation: preserve original admission-lock/path identity through builder observations; protect the original CLI immediately after spawn, including outer timeout cleanup; bind the exact reviewed executable builder buffer; and start wall/output bounds before bootstrap I/O. No preparation, request creation or native execution is authorized by this draft. Its source remains deliberately placeholder-blocked. The early metadata projection must be remeasured rather than copied from historical figures.
