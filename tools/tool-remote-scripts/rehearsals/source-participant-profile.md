# B2 source profile measurement

This independent rehearsal measures the actual pinned source container and its four
application roles. It grants no admission, readiness or production restoration.
The public restoration wrapper remains absent. B1's `sourceRunning: unexecuted`
remains unchanged. No native execution is authorized by these files.

The TypeScript module exports rehearsal functions only; it is excluded from normal
CLI, production exports and gate execution. Its provider-dependent cases remain
**unexecuted** until a complete composite provider, runner, journal, encrypted
capture and cleanup packet has been independently reviewed at one exact SHA and
explicitly authorized by the user. The earlier privileged probe was rejected by
automatic approval review; the separate read-only h2 audit does not authorize B2.

## Finite integration contract

Stage B owns provisioning, the ownership journal, inherited channel implementation,
workflow and encrypted evidence archive. Source measurement owns the schema and
same-process analysis/observer path. No external pair or prerequisite manifest,
operator-selected PID/path/program/profile or expected-success callback is an
integration mechanism.

The root provider creates and independently reads back the canonical prerequisite
environment and actual source. It supplies a private inherited B2 packet, separate
from the B1 packet. The owned source receipt is `isolated-ci-owned-source` version1
with full `id`, fixed `name: wbs-dev-src`, `created`, immutable `imageId`, digest-pinned
`reference`, fixture `nonce`, `sourceSha`, `manifestSha256`, `dependencySha256` and
`configurationSha256`. A decoded receipt proves only packet structure. Creation,
source/dependency/config provenance and fresh Docker/kernel readback must be
established by the provider and independently checked against the genuine context.

FD3/FD4 preserve Stage B's fixed inherited private packet/raw-capture descriptor
policy. FD5/FD6 carry bounded private request/response frames. Every request has
exactly `version: 1`, `nonce`, monotonic `sequence`, and one `operation`:

- `capture-owned-source`: capture the one journal-owned source, stopped or running.
- `acknowledge-source-start`: durably journal intent and independently verify the
  exact existing source is parked with restart admission fenced. No create occurs.
- `stop-join-owned-source`: stop only the journal-owned source and join its original
  process/listener/helper resources; prove absence through independent readback.
- `finalize-evidence`: finalize the bounded private capture, retaining primary failure
  independently from cleanup proof. This ends the root instrument capture session;
  whole-archive encryption waits for the runner FD4 close/join and provider cleanup.

No frame contains a selected target, PID, path, argv, command or shell text. Targets
come only from the root provider's retained journal and fresh observations. Replies
join the same version/nonce/sequence/operation and contain a closed operation body
or finite refusal. Frames are at most8MiB and share Stage B's128MiB raw budget.
Channel failure enters independent cleanup; helpers and descriptors must close/join.

`SourceCapture` is a private bounded raw instrument record, not a granted profile.
It carries the owned source tuple, running state, bracketed container init identity
and PID/network/mount namespaces; up to256 observed processes with host/inner PID,
parent PID/start, own start, full UID/GID tuple, cgroup, actual NUL-decoded argv,
cwd, executable path/object/hash, namespaces and every application-owned listener
family/address/port/FD/inode; original output parent path/device/inode/mode/members
and actual output paths/kinds/modes/file hashes. All persistent launcher/watcher
processes must be included, with observed transient events separately retained by
the provider. Missing transient events stay missing; never infer them from scripts.
Raw argv/proc/output records stay private. The provider derives output-parent paths
from the fixed pinned startup manifest/output roots, never request path arguments.

Each running roster requires exactly one full init process observation joined to
its declared host PID/start, inner PID1 and container PID/net/mount namespaces.
Every observed ancestry path terminates at that row; only its external parent is
exempted. Init remains in the complete stable identity latch, and cannot acquire
an application role label. This labels synthetic fixture launcher evidence only;
the actual provider must prove a complete kernel census and observed launcher tree.

Role binding uses each retained configuration port plus the observed application
working directory and actual parent identity. Any missing/duplicate/foreign owner
of a required port refuses. This is a measurement label; no launcher grammar is
admitted by matching a working directory. Stable samples retain the complete
persistent roster and listener bindings; replacement never becomes a new baseline.

## Execution sequence requiring composite review

1. Provider journals newly created exact product/source identities and performs
   the finite owned setup starts required by the actual initial Running census.
   These precede genuine preparation. No fake Running metadata is permitted.
2. Non-root UID/GID1000 runner acquires one genuine outer owner, genuinely prepares,
   consumes once and retains the original deadline/context. Preparation parks source.
3. Independently compare packet/source pins with retained context and fresh owned
   source observations. Preserve original cold source/dependency/git ancestors and
   output-parent objects; invoke unchanged `context.source.inspectCold()`.
4. Journal/acknowledge parked-source start boundary. Same owner starts exactly the
   existing selected source full ID. No recreate, package installation or policy
   restoration. Reserve cleanup time from the original deadline before starting.
5. Capture bounded startup roster, bind all four roles from actual observations,
   and run actual `observeParticipantProcess` and
   `observeSourceParticipantListener` as UID/GID1000 against independently derived
   host PIDs. Root raw capture cannot substitute for helper permission success.
6. Repeat complete bindings against the latched identities; compare original output
   parents and invoke unchanged `context.source.inspectRunning()`. Unknown outputs
   or monitor refusal require a separate reviewed profile change, never a new
   allowlist or expected manifest. Only not-yet-observed roles may await the bounded
   startup window; permission/parsing/identity/pin errors refuse immediately.
7. Stop/join the exact owned source and helpers, independently prove process/listener
   absence, finalize private evidence, close/join channels, then release preparation
   and owner. Provider independently removes only journal-owned resources. Do not
   call inspectCold after generating outputs or restore restart/exposure policies.

Overall cleanup proof follows provider cleanup, outside the live-owner measurement
phase. An observed phase is not a measured receipt until both source stop/join and
provider cleanup are proved. Primary refusal survives cleanup failure.

## Results and privacy

Receipts use `status: measured | unsupported | unexecuted`, always
`admission: not-granted`, and independent `cleanup: proved | unproved`. Measured
requires actual complete evidence, unchanged monitor success, both same-UID helper
observations and proved cleanup. Unsupported uses a closed finite reason; provider
or authorization absence is unexecuted. Arbitrary errors/paths/argv/private captures
have no public serialization path. Public output contains only the fixed case/status/
reason/cleanup tuple and separately approved public hashes. Root retains raw evidence
only in the authenticated manifest-listed age-encrypted archive. Failed sealing
never publishes plaintext or changes a source case to measured.

## Verification status

Pure fixture records test decoding, ownership drift, missing/ambiguous roles,
foreign listeners, identity latching, parent replacement and closed public receipts.
They prove analysis behavior only. Actual source startup, Docker/kernel observations,
UID1000 permission behavior, source cold/running monitor compatibility, generated
outputs, transport lifecycle and attributed cleanup are **unexecuted**.

Short verification on 2026-10-24:

- `bun test tools/tool-remote-scripts/rehearsals/source-participant-profile.test.ts`:
  30 pass,0 fail,80 assertions. Records are explicitly pure fixtures; no source runtime was started.
- A local temporary tsconfig including only the two source rehearsal TypeScript files
  passed `bunx tsc --project /tmp/puni-source-profile-tsconfig.json`. The provider's
  tracked rehearsal tsconfig must include `source-participant-profile*.ts` on integration.
- Explicit ESLint passed with a local rehearsal tsconfig. Nx's module-boundary rule
  was skipped because no cached project graph was available; this is not full gate proof.
- Nineteen independent omissions of actual artifact checks each made a focused
  assertion fail, then original source was restored. Private local proof logs are
  `/tmp/puni-source-{capture-ownership-join,role-ambiguity,role-directory,stable-roster-latch,output-parent-object,public-reason-enum,measured-cleanup,stop-join-proof,capture-array-bound,partial-role-latch,original-context,closed-ownership-packet,channel-correlation,cold-running-separation,original-packet-pins,complete-roster-ancestry,provider-request-replay,raw-output-parent-coverage,raw-openapi-coverage}.log`.
  Logs contain synthetic test records only and are mode0600. Omission tooling is
  local verification scaffolding, not a provisioner or execution entrypoint.
- Full h2/h4 gate, native Docker/source/namespace/helper/transport runs, real monitor
  compatibility and independent teardown remain unexecuted. Parent owns broad gate
  sessions after the composite artifact is frozen.

The independent review of `58b6d41d9463a928d0e8ac41f63e3d111fe420b1` found
that missing/contradictory init rows could pass complete-roster validation. Its
three regressions were reproduced against the unchanged artifact (0 pass,3 fail;
expected-refusal assertions, not compiler failures), then repaired within these
same three files. The valid synthetic fixture now includes a full init row. Added
actual decoder/binder/latch cases cover missing/duplicate init, wrong declared or
observed start, wrong/borrowed inner PID1, foreign init namespace, internal init
parent, indirect ancestry escaping to a foreign root, and stable init executable
replacement. Eight independent check omissions each accepted the injected fault
and failed its focused assertion; restored source passed the controls. Private
mode0600 logs are `/tmp/puni-source-init-review-red.log` and
`/tmp/puni-source-{init-cardinality,init-start,init-inner-pid,init-external-parent,init-namespace,init-ancestry-start,init-role-label,init-stable-roster}.log`.
This repairs the source measurement analyzer only. The wire fields, genuine
context requirement, provider dependency, not-granted admission and all native/
transport/physical-cleanup unexecuted limits remain unchanged. The BuildKit ruling
was read for context; this checkpoint adds no builder or privileged helper work.
