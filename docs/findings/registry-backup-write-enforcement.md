# Enforcing backup write liability

Research proposal, 2026-11-09, for full Task 4.3. Only tracked source and public
primary sources were inspected. No implementation, runtime, provider, credential,
installed or privileged evidence was gathered.

**Recommendation:** develop an operation-bound write relay with a fixed,
nonelastic reservation, using pinned Restic's REST backend over an owned Unix
socket downstream and the existing S3 provider/repository upstream. Durably debit
each possible upstream storage addition before dispatch. This supplies a real
execution ceiling despite unbounded lock creation. It does not by itself prove
that an admitted backup completes within that ceiling.

**Contract decision first:** replacing the current advance whole-command envelope
with an enforced abort ceiling requires an explicit OpenSpec design/contract
amendment. Without that amendment the relay is an additional protective boundary;
the missing static envelope still prevents admission. Do not silently reinterpret
the approved requirements or choose the ceiling as whatever space happens to remain.

## What the ceiling proves, and what it does not

The [spec](../../openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md#requirement-backup-budget-reservations)
requires additions/coexistence reserved before writes. The
[design](../../openspec/changes/bound-registry-storage/design.md#backups-and-monitoring)
also requires a conservative complete new-content/metadata/prune envelope before
backup and refuses unknown additions. A gate proves the following **safety**
invariant by induction, if every write passes through it:

```text
F = complete initial stored object/version/part bytes
R = other unreconciled liabilities, without credit for prospective deletion
C = explicit trusted execution-profile ceiling reserved before launch
F + R + C <= 107374182400
0 <= durable spent <= C
each possible addition of L bytes: persist spent + L <= C, then dispatch once
```

Thus actual additions cannot exceed `C`, independently of how many times Restic
creates/refreshes/retries a lock. `C` remains reserved as spending increases;
spending does not add another `C` to the initial budget. Lost responses and
post-debit crashes keep their full debit. Exhaustion fails/fences the operation
and preserves its prior verified recovery receipt.

This is not proof that `C` covers an unrestricted successful snapshot/prune.
The amendment must define an accepted execution/source class and its fixed
ceiling, preflight rejection of sources outside that class or known to exceed it,
and explicit failure behavior on unexpected exhaustion. Preserve the existing
before-files refusal when `F + R + C` does not fit. Shrinking `C` to free space and
starting a predictably oversized backup is unacceptable. Under the unchanged
contract, retain the original complete-envelope prerequisite instead.

## Current integration points

- [`admitRegistryBackup`](../../tools/tool-fleet/src/registry-backup-admission.ts)
  always refuses. [`executeRegistryBackupAction`](../../tools/tool-fleet/src/registry-maintenance-backup.ts)
  admits before opening `openVersions`; funding must first obtain the complete
  read-only census, not bootstrap with a normal-lock Restic command.
- [`RegistryS3Census`](../../tools/tool-fleet/src/registry-s3-census.ts) supplies
  the approved stored-size measure, but the public
  [`RegistryBackupVersionStore`](../../tools/tool-fleet/src/registry-backup-provider.ts)
  projects locks/snapshots and does not expose its whole-repository total.
- [`store.run`](../../tools/tool-fleet/src/registry-backup-store.ts) consumes a
  fixed command ticket before spawn and now binds `s3.retries=1` for S3 children.
  [`openRegistryBackupReservation`](../../tools/tool-fleet/src/registry-backup-reservation.ts)
  remains `effect-lineage-only`; terminal settlement grants no physical refund.
  Extend these actual paths, rather than adding an unconsumed budget calculator.

## Why REST over Unix is a supported smaller downstream seam

Restic 0.19.1 pins unixtransport 0.0.7 and registers it in its ordinary HTTP
transport. A concrete candidate URL is:

```text
rest:http+unix:///owned/private/relay.sock:/repository/
```

[`rest.ParseConfig`](https://github.com/restic/restic/blob/v0.19.1/internal/backend/rest/config.go#L29)
accepts the underlying URL; its trailing slash is required.
[`unixtransport.Register`/`roundTripAdapter`](https://github.com/peterbourgon/unixtransport/blob/v0.0.7/register.go)
split the socket pathname from the HTTP path at the colon, dial Unix, and discard
proxy configuration. Restic's
[tagged REST test](https://github.com/restic/restic/blob/v0.19.1/internal/backend/rest/rest_test.go#L123)
constructs this socket/path syntax. The
[manifest](https://github.com/restic/restic/blob/v0.19.1/go.mod) and
[transport registration](https://github.com/restic/restic/blob/v0.19.1/internal/backend/http_transport.go#L93)
establish the dependency/call path, not installed socket access.

The [REST API](https://github.com/restic/restic/blob/v0.19.1/doc/REST_backend.rst)
provides ciphertext POSTs, HEAD sizes, GET/Range reads, DELETE and v2 JSON
`name`/`size` lists. Implement all methods required by the admitted fixed commands;
reject repository creation/removal, config/key mutation and unknown routes.
Preserve errors: an unavailable S3 list must not become an empty REST catalogue.

Translate exactly between
[RESTLayout](https://github.com/restic/restic/blob/v0.19.1/internal/backend/layout/layout_rest.go)
and S3's
[DefaultLayout](https://github.com/restic/restic/blob/v0.19.1/internal/backend/layout/layout_default.go):
`data/<id>` maps to `<prefix>/data/<first-two-hex>/<id>`; config is `<prefix>/config`,
and keys/locks/index/snapshots remain their existing directories. Validate full
IDs, canonical type/path and the single bound upstream scope. Encryption stays
in Restic; preserve every ciphertext byte and the existing repository ID. This
is a proposed transport adapter, not a repository-format conversion or a new
backup provider. Compatibility still needs actual cross-backend read/check/restore.

Two important behavioral differences in
[`rest.Backend`](https://github.com/restic/restic/blob/v0.19.1/internal/backend/rest/rest.go):
Save uses POST with explicit Content-Length and GetBody; its client can follow
redirects. The relay must never emit/propagate redirects. Also it reports
`HasAtomicReplace=false`, so the
[outer retry wrapper](https://github.com/restic/restic/blob/v0.19.1/internal/backend/retry/backend_retry.go#L154)
attempts DELETE after a failed Save. Such cleanup must never hide a preexisting
retained object. Bind cleanup to keys newly created by this operation; reject
deletion of previously protected keys. Test lost successful POST replies, duplicate
POSTs, cleanup DELETE, and subsequent restore. A raw REST-to-S3 method proxy is
insufficient.

## Proposed production composition and non-bypass obligations

1. The existing root action retains the real, hash-pinned upstream S3 scope,
   static credentials and repository password custody. Keep the provider adapter's
   complete census/recovery path pointed at that upstream. Give the fixed Restic
   child only its owned REST URL and required repository password input; omit AWS
   and alternate backend/helper credentials. Never replace the trusted upstream
   configuration with the child-facing relay URL. No protected configuration
   observation or new provider permission is proposed.
2. Bind one relay session to operation, current canonical attempt/revision,
   configuration, actual upstream repository/scope, profile and consumed command
   ticket. Activate it only for that command's phase. Inspection can POST/delete
   only its own locks; snapshot additionally needs the existing immutable stopped
   source binding and last-moment reobservation. Future prune/restore receive
   distinct exact authorities. A socket pathname or arbitrary caller byte allowance
   alone grants nothing. Authenticate the intended caller; verify the socket and
   its private parent rather than adopting/unlinking an unknown old socket.
3. Before the child starts, persist `C` against the complete stable census and all
   outstanding liabilities. Serialize request debits with the existing durable
   state lock and file/directory sync. Debit before an upstream HTTP connection can
   send a write. Concurrent requests cannot overspend. Every actual retry requires
   another debit, including same-key/same-body replay; no refund on failure,
   cancellation, abort, DELETE or command settlement.
4. Validate finite exact body length, key/scope, permitted operation and bounded
   headers before forwarding. Bound actual streamed bytes to that declared length;
   reject unknown/oversize encodings rather than spooling an unbounded body. Also
   reserve finite request/object/part/marker counts so tiny writes cannot exceed
   census or journal metadata limits. Keep command tickets distinct from per-wire
   counters; the present 1,024-effect/1 MiB state cannot become an unbounded request
   log. Any new monotonic counter/in-flight representation needs explicit bounded
   persistence/recovery semantics, preserving canonical failure headroom and
   [ADR 0078](../adr/0078-registry-backup-consumption-survives-content-restore.md).
5. Credential isolation and fixed routing must actually make every authenticated
   storage-adding request pass the gate. Test direct-upstream/changed-route attempts
   and ambient credential poisoning. Retain all existing common authority, source
   writer-exclusion and installed-access prerequisites. Unix transport is not a
   substitute or workaround for any stopped privileged proof.

Fingerprint both transports: Restic binary/backend and fixed arguments, relay
artifact/protocol, upstream SDK/runtime, endpoint/scope, limit policy and durable
record version. The current S3 profile cannot masquerade as the new REST profile;
`s3.retries=1` is not applicable to its downstream REST backend. The public store
configuration currently allows a REST URL, but production `openVersions` only
supports the original HTTPS S3 configuration, so this split is new integration.

## Upstream dispatch, retries and multipart

Reuse the pinned official SDK signer/configuration conventions, not downstream
Authorization forwarding. `@aws-sdk/client-s3` is pinned to 3.1161.0 in
[package.json](../../package.json). The existing
[`createRegistryS3Store`](../../tools/tool-fleet/src/registry-s3-census.ts) disables
SDK retries/region following and validates exact endpoint/scope, but its transport
currently accepts GET/DELETE only. Its fetch-based census is not proof that a new
PUT has no hidden transport replay.

A concrete candidate is Bun's `node:https.request` with one explicitly created
fresh TLS socket, HTTP/1.1, no agent/proxy, no reconnect/redirect loop, and SDK
`maxAttempts:1`. The repository pins Bun 1.4.4 in
[.bun-version](../../.bun-version) and the versioned `solverBun` artifact in
[toolchain.json](../../infra/versions/toolchain.json). In that exact tag,
[`https.request`](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/js/node/https.ts#L33)
sets the HTTPS default agent and delegates to `http.ClientRequest`.
[`ClientRequest`](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/js/node/_http_client.ts#L180)
bypasses agent selection only when `agent` is null/undefined and
`createConnection` is a function; `agent:false` constructs an agent instead.
The [no-agent path](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/js/node/_http_client.ts#L386)
sets `Connection:close` and invokes the custom factory once with a once-guarded
completion callback. That factory must itself create only one TLS connection,
validate the fixed endpoint hostname, set HTTP/1.1 ALPN and pass the explicit
endpoint port: the no-agent constructor otherwise falls back to port 80.
The [socket error/end paths](https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/js/node/_http_client.ts#L519)
report errors, clear/free pending state and destroy/close without reconnecting or
resubmitting. **Inference/candidate, not an executed transport proof:** verify the
enrolled artifact matches this pin and run lost-reply wire negatives through the
actual custom factory before relying on one debit per dispatch. The inspected
JavaScript path alone does not certify native TLS/socket behavior, wrapper retry
policy or the installed binary. No separate Node runtime is proposed.

For single PUTs, debit complete ciphertext length on every dispatch. For a future
multipart implementation, debit each UploadPart attempt and conservatively reserve
the full assembled object again before each CompleteMultipartUpload dispatch;
parts and the final object may coexist in the accounting model. Keep upload IDs,
part numbers/lengths and completion lists operation-bound and bounded. Completion
can return an embedded error after HTTP 200:
[CompleteMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html).
Repeated part numbers overwrite parts, but do not earn automatic credit:
[UploadPart](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html).
Abort can race with in-flight parts and needs listing confirmation:
[AbortMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
Reject CopyObject/UploadPartCopy unless separately charged by copied-object size;
their request-body length is not their storage addition.
[CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html).

The first inspection slice can permit only single PUT lock objects and reject
multipart; that is a staged slice, not a reduced snapshot/prune endstate. Full
delivery must implement multipart accounting or prove/enforce an approved source/
object profile excluding every newly generated multipart object. Existing parts
always remain in the initial census.

## Local resources, retention and release remain independent

The relay limits remote additions after encoding. It cannot prevent Restic from
allocating a large tree/index, MD5 buffer or pack staging file before that request.
Bound actual source/repository traversal, maximum object, concurrent stream buffers,
scratch bytes/inodes, CPU and process/memory use separately. Retain full source
reader visibility/recovery correctness prerequisites; a byte counter does not prove
complete xattrs or a restorable snapshot. The tracked
[backup unit](../../infra/systemd/registry-backup/puni-registry-backup.service)
does not specify MemoryMax/TasksMax/RuntimeMaxSec. None is inferred from JS timers.
Kernel [cgroup resource controls](https://docs.kernel.org/admin-guide/cgroup-v2.html)
can enforce separate process/memory limits; they do not establish successful
completion. The gate's own bounded buffers/records and OOM/death cleanup must be
included. Preserve dedicated scratch and root reserve; no full-repository host-root
spool is proposed.

Retention still requires 7 daily/4 weekly represented periods, last verified snapshot
and explicit pins. Persist/revalidate the exact read-only retention plan; incomplete
coverage yields no deletion candidates. Forget/prune remain distinct authorized
effects. Charge all new packs/indexes/locks before their writes and never subtract
planned deletes. A relay budget is not permission to delete a protected snapshot.
Protect prior object visibility from REST retry cleanup as well as ordinary prune.
Keep fresh independent restoration of a retained snapshot after actual pruning.

Release is a separate authenticated reconciliation: establish terminal child,
relay and upstream in-flight work; perform complete stable object/version/part
censuses; then atomically replace the old baseline/liability with measured state.
No TTL, restored contents, successful HTTP status or new operation may refill it.
Uncertain in-flight requests retain their debits even after local death. Failed
restore/prune keeps failure/fence and original verified lineage; physical usage
alone cannot authorize a success receipt or service reopening.

## Alternatives and the next integrated TDD slice

| Alternative                                  | Assessment                                                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continue static whole-command bounds         | Preserves today's exact admission interpretation, but still lacks enforced total lock count and complete encoded/resource profiles. Useful estimates remain diagnostics, not permission.                                                           |
| REST/Unix relay with durable upstream debits | Recommended candidate: supported pinned downstream, no S3 verifier or local CA seam, original S3 repository stays authoritative. Requires REST cleanup/visibility compatibility and audited upstream transport.                                    |
| Downstream S3 facade                         | Also possible using supported explicit S3 HTTPS endpoint and scoped synthetic child credentials, with real credentials held by the gate. Adds SigV4 verification/re-signing, TLS trust, redirect and multipart framing work.                       |
| Fixed Restic/client patch                    | Could debit exact outgoing requests through a bounded authority channel while retaining S3 semantics. Adds a separately built/pinned fork, new IPC custody and a wire-level multipart/retry audit. A hook above retries is insufficient.           |
| Bounded local/remote filesystem              | Bounds its own filesystem, not retained S3 versions/retried exports. A complete mirror adds separately provisioned capacity; moving the authoritative backup off S3 changes the selected provider design. No purchase or provisioning is proposed. |

After recording the contract decision, implement **one funded inspection relay
slice in the real action/store path**: complete upstream census → persisted fixed
inspection reservation → existing command ticket → private REST/Unix relay →
actual pinned `snapshots` and last-verified `dump` → durable request debits before
single upstream lock PUTs. Production snapshot/prune admission stays closed until
their existing requirements pass. This is a consumed production seam, not a new
standalone planner.

The positive control uses owned ordinary files, the real durable ledger/admission/
relay/store consumers, actual pinned Restic and a controlled HTTPS S3 responder
with synthetic credentials. An existing encrypted repository must be listed and
its matching journal dumped through the mapping, with durable debit visible before
each upstream received body and no changed encrypted bytes/repository identity.
Separately complete two known-length request additions within a pre-reserved
ceiling, including a committed/lost reply; the next addition must not reach the
receiver. Removing debit/limit enforcement must permit the extra stored copy and
fail the assertion. Do not replace that witness with an argv or counter-function
test. A preflight oversize control sets `F + R + C` one byte over 100 GiB and must
observe no new backup file or lock PUT at all; no partial-fit ceiling is minted.

Required adjacent negatives cover persistence failure before send, crash after
debit, concurrent overspend, restart/token rotation without refill, upstream
redirect/lost response, stale source/phase, wrong scope/credentials, protected-key
cleanup and full census omission. Actual restoration, bounded scratch/cgroup
operation and installed non-bypass remain later independent evidence. This note
does not authorize or reopen stopped work. All proposed tests remain unexecuted.
