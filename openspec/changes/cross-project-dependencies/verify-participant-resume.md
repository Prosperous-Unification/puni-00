# Participant restoration — local implementation evidence

Baseline `5e954ba39398b50db96276a0eff2356538a24259`, worktree
`/tmp/puni-participant-resume`, branch `feat/dependency-participant-resume`.
Bun 1.4.4 (`38afee6c8`). This is an incremental implementation checkpoint,
not completed P2b-3 acceptance or host authorization. Shared design/tasks/verify
remain parent-owned.

## Current source boundary

The existing fenced-only activation entry still returns its original summary
and discards restoration observations. A distinct internal path captures provisional
read-only monitors under the original complete/source/solver scopes and mints an
opaque original WeakMap key only after physical finalizers and fenced-complete
readback. A separate private WeakSet consumes it once. Copied/serialized/expired
objects cannot recreate authority. Descriptor ownership transfers only to that
actual key and releases without deleting durable evidence.

A new store observer uses fresh existing-only read-only SQLite connections,
original canonical parent/main identities, complete migration captures and the
full expected-authority union: selected exact ENABLED receipts, nonselected
DISABLED. Every SQLite/main FD closes before any awaited owner/census boundary.
The shared solver restoration sequence preserves P2a's activation:not-performed
contract and parked checks; its new readiness closure can later inspect the same
runtime without treating running application participants as parked.

Source restart input monitors are captured while the original observation/token
is live. The new monitor remains bound to the same outer owner after source
exclusion expires; it does not revive that token. Its MCP OpenAPI hash comes from
an actual separately invoked pinned emitter. Cold APIs stay strict. The running
scanner preserves all original inputs and original directory dev/inode/mode,
relaxing metadata only for direct parents of present fixed generated roots with
unchanged filtered membership. The output roster is PROVISIONAL until the required
actual pinned startup measurement and Astra High review. No measured production
output roster is claimed here.

## Fresh checkpoint output

- Original decoder/owner-record/DB-anchor baseline: 25 pass, 45 assertions, 137ms,
  `/tmp/puni-participant-baseline.log`.
- Native Docker-shape transition tests: 11 pass, including exact ID/config/mount/
  network/alias, manual start/address changes, no-op/restart and original retry count.
  `/tmp/puni-participant-transition-green.log`.
- Existing solver restoration suite after extraction: 41 pass, 149 assertions,
  2.64s, `/tmp/puni-participant-solver-extraction.log`.
- Separate cold/running tree: 12 pass, 11 assertions, 1.386s,
  `/tmp/puni-participant-source-tree-green.log`. Includes wrong/missing OpenAPI,
  unknown/modified/replaced inputs, parent swap, aliases and stale dist. A readable
  regular `.nx` root first passed the old scanner; the new directory-contract
  negative was observed RED before correction.
- Native pinned emitter plus original-token expiry/retained-owner test: 1 pass,
  3 assertions, 2.70s, `/tmp/puni-participant-source-inputs-green.log`.
- Actual SQLite store observer after the original finalizers: 1 pass,
  119 assertions, 51.31s, `/tmp/puni-participant-stores-green.log`; genuine receipt
  tampering and expired ownership refuse. No supplied activation-success value.
- First finalized preparation replay: 2 pass, 263 assertions, 101.30s,
  `/tmp/puni-participant-preparation-initial.log` (before product image preflight).
- Updated one-shot preparation with immutable image preflight and complete native
  readonly solver-mount projection: 1 pass, 130 assertions, 56.24s,
  `/tmp/puni-participant-preparation-image-green.log`.
- Product image/launch negatives: all 12 initially observed RED before their
  respective checks, then 12 pass, 24 assertions, 14.06s,
  `/tmp/puni-participant-image-readiness-green.log`. An independent positive accepts
  actual fixture image/launch observations. Image labels are trusted pinned-builder
  provenance, not independent measurement of loaded JavaScript.
- Native host process snapshot: 6 pass, 7 assertions, 207ms,
  `/tmp/puni-participant-process-green.log`. This is the non-root source-compatible
  procfs observation path, not the required root product namespace proof.
- Distinct health/capability decoders: 14 pass, 23 assertions, 41ms,
  `/tmp/puni-participant-health-green.log`. Product commit:null and exact source SHA
  are separate exact contracts, with private parser excerpts/cause chains removed.
- First configured graph-loaded lint/typecheck/build checkpoint: 7 targets pass
  (4 cache hits), 18.2s, `/tmp/puni-participant-first-static.log`. Later product
  image/health additions still need their configured replay.

Native delayed Unix socket and native emitter pipe writes failed under the tool
sandbox, then passed as narrowly authorized scratch-only tests outside it. Initial
failed outputs are retained in `/tmp/puni-participant-solver-baseline*.log` and
`/tmp/puni-participant-source-inputs-debug.log`; those failures do not prove source
regressions or successful native acceptance.

## Approved interface corrections and unresolved acceptance

The parent-approved product health ruling preserves the existing application
contract: prod images omit Git and report explicit commit:null. Actual immutable
image Config.Labels.WBS_SHA must independently equal the owner SHA; source health
continues requiring exact checkout SHA. No app/build behavior or fallback changed.
The private root product process observer must use the existing bounded exact-ID
Docker exec session/ACK/reap contract, explicit host NSpid mapping, actual listener
FD ownership and exact current collector opener joins. The privileged collector
must stay unchanged.

Automatic approval review rejected the disposable privileged `sudo unshare`
probe before execution because it exceeds the retained no-host/live-action scope.
Exact command/reason are in private `/tmp/puni-participant-namespace-rejection.md`.
The required root-owned process/private PID+network namespace proof is UNRUN;
no retry, indirect path, default unit/build/CI/gate execution or substitute fake ACK
is authorized. The standalone bounded fixture/cleanup is being prepared for review
before any later permission step.

Remaining: exact solver→BE→GW→source orchestration, process/socket/HTTP/readiness
composition, original-policy restoration, typed retained records, actual startup
output measurement, production-path watched mutations, composed success/failure
matrix, final configured checks, bundle smoke and independent review. No public
restoration CLI, serving write/reload, active policy, handoff, owner retirement or
ordinary-controller change exists in this checkpoint. P2b-4 and P3 remain mandatory.

## Incremental checkpoint replay

Configured graph-loaded Nx lint/typecheck/build after the image/health additions:
7 targets pass, 4 dependency cache hits, 18.0s,
`/tmp/puni-participant-checkpoint-static3.log`. The preceding replay failed one
unsafe array-spread lint diagnostic; the actual checked string projection fixes it
without changing the accepted launch contract. Formatting check passes in
`/tmp/puni-participant-checkpoint-format2.log`.

`tools/tool-remote-scripts/rehearsals/participant-root-process.sh` is a manual,
non-executable review artifact, absent from every project target. It requires an
explicit argument and independently authorized root invocation; it never escalates
itself. Its C init/child lifecycle has independent alarm and outer timeout bounds,
private PID/network/mount namespaces and exact scratch-file cleanup. Only shell
syntax and C `-fsyntax-only` have run. It is NOT an acceptance fixture yet: the
non-root coordinator, actual namespace/socket joins, production observer protocol
and negative matrix remain to be added and independently reviewed. No namespace
command in this artifact has executed. The retained automatic-review rejection
still applies, including indirect/default CI execution.
