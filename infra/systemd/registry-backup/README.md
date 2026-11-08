# Registry maintenance installation and recovery

**Source staging — 2026-11-08:** Registry lifecycle libraries and manual provisioning
sources are retained for future coordinated activation. Supported publish, copy,
Compose and Kubernetes commands keep current-main routing and legacy persisted
writer versions; they do not select managed adapters. Explicit managed helpers
require trusted enrollment. Historical installed receipts below do not establish
current readiness. Managed procedures remain attended future operations; this
source merge performs no installation, adoption or production action. Full native,
provider, storage, backup, isolation, recovery and delivery acceptance stays open.

These units are staged, disabled examples for the shared registry authority. Activation
requires the completed provider-budget admission and installed recovery drill. The
current `registry-backup-admission.ts` deliberately refuses with
`backup-budget-unavailable` until that separate policy is implemented and verified.
The S3 raw-version provider is implemented with controlled transport tests; live
provider compatibility and physical accounting remain unverified. A staged unit or
an unenrolled recovery target is not evidence that backup or recovery works.

## Installation boundary

Build the authority and maintenance bundles from one reviewed commit with the
`tool-fleet:build` Nx target. The explicit Ansible `registry_maintenance` tag in
`infra/ansible/playbooks/registry.yml` stages seven SHA256-pinned bundles, the pinned
Distribution executable, the root helper wrapper, scoped sudo rule and units. It
requires actual enrollment and artifact hashes; it neither enables timers nor
advances Flux sources. The ordinary storage/authority roles must already have
provisioned UID/GID59001, independently bounded registry and canonical journal,
the canonical lock location and the pinned Bun runtime.

Run the explicit `registry_authority` stage first with the same
`puni_registry_maintenance_configuration` and authority bundle hash. That role
copies Bun, the bundle and configuration into a private candidate directory,
checks candidate artifact pins, and invokes its read-only `--validate-installation`
mode. It publishes the configuration before the authority artifacts only after
validation succeeds; validation failure keeps the preceding active files intact.
The accepted Bun SHA is the same fixed pin used by maintenance and the backup
worker; a separately reviewed runtime version cannot be installed independently.
The maintenance role requires that exact validated configuration and authority
bundle before staging its own artifacts, and never rewrites the configuration.
Candidate schema/trust validation does not establish runtime resource, journal or
mount readiness; the installed activation drill must establish those separately.

The noncached `tool-fleet:rehearse:registry-installer` Nx target exercises the
actual authority role in an ordinary user's private root user/mount/network
namespace, or the maintenance configuration preflight component. Supply absolute
`--root`, `--ansible-playbook`, `--python` (the Ansible environment interpreter),
`--bun`, `--bundle` (the normal reviewed build), `--enrollment` (a synthetic
installation fixture), `--case` and a new `--output` directory. Bubblewrap is
required; the host root is read-only and writable installation paths are bounded
tmpfs mounts. Fault/removal switches are test-only inputs to the rehearsal;
stat-fact faults test actual Ansible predicates but do not simulate kernel inode
ownership. This target neither installs on the host nor proves the full sudo grant,
service, journal, or live Kubernetes boundary. Those remain the installed drill.

Root-owned `/etc/puni/registry-maintenance.json` is nonsecret, mode0644, and follows
`RegistryMaintenanceInstallation` in `registry-maintenance-installation.ts`.
Provision it from fresh server observations, including resource UIDs/spec hashes,
source artifact revisions/digests, machine/node identity, executable/config hashes,
PVC/PV/mount receipts, independent limits and the authorized maintenance owner.
Never manufacture a future UID or copy identity strings from an operator request.

Provision these trusted artifacts separately before staging the public enrollment:

- Fixed management/production kubeconfigs, Distribution readonly/deletion configs
  and their exact installed hashes. The readonly endpoint has deletion disabled;
  the deletion endpoint is an isolated authenticated loopback process. Both disable
  upload purging explicitly. Config paths and allowed shapes are checked in
  `registry-maintenance-installation.ts` and `registry-maintenance-server.ts`.
- Root-only `/root/.puni/registry/backup.json` and `restic.password`, regular files
  mode0600 under root0700 parents. `parseRegistryBackupConfiguration` defines the
  bounded secret schema: pinned `/root/.puni/tools/restic-0.19.1`, separate password
  hash, immutable repository ID, required `recoveryPins` (up to 2,048 unique full
  snapshot IDs, including an explicit empty list), required per-root `sourceLimits`,
  repository endpoint and allowlisted provider fields. Source limits independently
  bound logical bytes, entries, depth, fanout and accounted raw metadata for registry
  and journal contents. These are computational ceilings, not defaults or physical
  backup allowances. Pins belong to that exact repository. Missing pins/limits
  refuse. Update configuration only after outstanding attempts are settled, since
  attempts bind its complete reviewed artifact hash.
  No password/keys belong in
  argv, unit environment, public enrollment, output or the authority runner's files.
- An already initialized encrypted off-node repository and independent escrow of
  recovery credentials. Maintenance does not initialize repositories or choose caller-supplied snapshot/restore
  paths. It may reconcile only exactly owned dead-attempt locks as described below. Provider retention/prune
  belongs to the separate bounded backup-store policy.

The helper is `/usr/local/libexec/puni-registry-maintenance-host`, with no arguments.
Its wrapper clears the environment and runs the fixed root-owned host bundle.
UID59001 reaches only this command through the scoped sudo rule. A private Unix
socketpair occupies FD0; the already-held authority description crosses it with
SCM_RIGHTS. The helper verifies the existing lock before acknowledging a nonsecret
nonce. The operation token follows only a kernel-authenticated current-root reply.
SO_PASSCRED checks each current sender; creation-time SO_PEERCRED is insufficient.
PTY/input-logging relays must refuse before any token or effect. Both sudo parsers
validate the basic shared policy before installation. See [the transport decision](../../../docs/adr/0076-registry-maintenance-transfers-the-held-authority-descriptor.md).
Installed sudo policy ordering, no-argument enforcement, credential denial, exact
binary hashes and real controller acknowledgements must be verified in the final
isolated installed drill. Local direct helper/component fixtures do not certify
those installed boundaries.

## Serialized maintenance

Backup, retirement, publication, deployment and recovery use the same canonical
journal flock. The authority keeps the same open-file description throughout
external work; the root helper retains its received descriptor and maps it to FD3
for native descendants. Finalization closes descriptors rather than issuing
`LOCK_UN` on a shared description. The private channel accepts one authenticated
bounded fixed-action request, then only cancellation/EOF.
Root owns independent deadlines and termination/reaping. Missing terminal cleanup
acknowledgement leaves failure/recovery ownership visible and prevents serving.

Each maintenance run records ownership and a durable write fence, captures prior
replicas/selector/Flux flags and reconcile annotations, then withdraws the endpoint.
It suspends `puni-cluster` before `platform`, and `fleet-helsinki` before
`registry-storage`, using fresh controller acknowledgements and immutable source
identities. It stops the Deployment, checks complete pod/endpoint observations and
independently proves host writer absence. A full registry cannot be required to
write a derived readonly acknowledgement before this proof.

A matching snapshot covers mounted registry **contents** and canonical journal
contents, never backing images. Required provider admission precedes effects.
Backup verification checks the exact snapshot pair and all retained repository
packs. It is repeated before destructive work; no age/sampling shortcut replaces
it. The last verified snapshot/store receipt survives later failure.

Retirement uses fresh complete physical/API/consumer/history evidence. Newest ten
successful bundles, current plus two prior environment releases, unfinished work
and explicit image obligations remain protected. Shared protected image closures
survive while unrelated eligible old tiers may retire. Abandoned publications require
owner reconciliation and seven days of grace. Schema4 declarations and durable
pre-body upload UUIDs can attribute partial content; unknown or unacknowledged orphan
content, unknown staging, incomplete stored images and unsupported metadata refuse.
Declarations alone never establish physical bytes or image presence.

The exact plan is durable before DELETE, including repository revisions, tags,
expected blob discards, never-uploaded roots and owned upload file hashes. Eventual
retirement/failure receipt capacity is admitted before unlink. HTTP202 is acceptance;
physical revision/tag removal must reconcile exactly. HTTP404 cannot certify an
unconfirmed deletion. Offline upload cleanup unlinks only the freshly verified
planned UUID files; partial unlink fails visibly. Verified retirement receipts retain
original bundles/history and may later record newly eligible surviving revisions.
Ordinary Distribution GC runs offline **without** `--delete-untagged`. Post-GC census,
uncached retained pulls and capacity checks precede restoration of captured service
and Flux state. Completion keeps the write fence until explicit low-water reopening.

## Interrupted backup attempts

The root ACK identifies a fresh guardian PID through current kernel credentials.
Before sending its one action request, the authority persists that guardian's
machine, boot, PID namespace and start identity, installed configuration hash and
one-use nonce. The root helper rereads the current canonical revision and verifies
its own identity before launching the fixed `backup-worker.js` through pinned
`/usr/bin/unshare --uts`. Neither the caller nor provider configuration can select
worker paths, arguments or loader environment. The worker verifies private UTS,
sets its nonce hostname and inherits the same held authority descriptor. Backup
passes the stable registry identity explicitly as snapshot `--host`, independent
of the temporary lock hostname. See [the backup lock decision](../../../docs/adr/0077-registry-backup-locks-identify-their-owning-attempt.md).

The worker's restic children stay in its existing process group. Cancellation sends
SIGINT with a fixed five-second grace, followed by SIGKILL when required; the
helper retains exclusion until terminal group cleanup. Exit130 never means backup
success. A kept-open control pipe and worker deadline independently cover root
helper disappearance. Missing terminal acknowledgement leaves the attempt pending
and the operation failed/fenced; no subsequent attempt reuses that nonce.

Retry first reserves bounded journal space for reconciliation and failure evidence.
The fixed `backup-reconcile` action derives pending attempts from canonical state;
requests cannot supply lock IDs. It requires complete raw visible/version history,
valid ciphertext hashes and exactly one visible latest object or delete marker per
represented key. Hidden historical locks are preserved and do not alone signify
active work. The census is bounded at65,536versions/64MiB metadata; exceeding either
bound refuses. Mutation receipts account for eligible exact removals, not unrelated
history. The root S3 adapter derives endpoint, bucket and prefix from trusted
repository configuration and requires explicit region/static credentials. Every
signed request rechecks the held canonical maintenance authority. Versioning must
be enabled; complete repository-prefix version/multipart census and exact-version
lock reads share a 60-second cancellation deadline. Ciphertext names, sizes and
hashes must match, and full metadata bookends must agree. Exact-version removal
requires a fresh visible lock identity and complete recensus confirming that
version disappeared. No local-storage fallback is available in production.
These checks do not establish a provider billable-byte bound; see
[backup accounting](../../../docs/findings/registry-backup-accounting.md).

Only fixed read-only `--no-lock cat config` and `--no-lock cat lock` inspection is
permitted. Complete raw pre/post census binds decrypted metadata to exact object
identity. Backup/check/restore retain normal restic locking. An immutable repository
ID mismatch refuses before effects. Exact lock ownership must match the durable
attempt hostname, and the origin machine/boot/PID namespace and mounted proc view
must agree before independently observing guardian and effect PID absence. A live,
reused, foreign, unreadable or ambiguous PID/lock refuses recovery. Remote origins
or changed boots need separately proven restart-excluding fencing; local absence or
network failure is insufficient. Never run blanket `restic unlock` or age-only cleanup.

Targeted deletion preserves unrelated versions and validates a complete recensus,
including any older version newly exposed by deletion. Only after terminal root
cleanup does the authority persist the exact reconciliation receipt and permit a
fresh attempt. Partial deletion or uncertain cleanup retains the durable fence.

## Source-bound snapshot admission

Repository inspection admission covers normal restic lock effects. Snapshot
admission additionally receives a typed source observation; source capacity is
never presented as maximum new physical bytes. Preflight runs before writer
fencing, so stable source observation occurs only at the stopped snapshot boundary.
The store binds the exact roots, canonical operation/revision/census and bounded
journal hash, then reobserves source/authority after admission immediately before
backup launch. Source drift or malformed dependency responses refuse before new
backup content. Independent writer exclusion must still hold throughout copying.

Observation preserves raw filename, symlink-target and attribute bytes, counts
every hardlink path, and measures logical sparse-file lengths independently from
allocation. It rejects unreadable/changed/unsupported/cross-filesystem entries and
traversal overages, validates stat fields before coercion and validates positive
bounded journal-read progress. Xattrs are explicitly caller-visible only; full
read-context visibility remains unproved. Raw metadata, fresh chunk-reference
counts and source hashes are not encoded tree, parent-reference, account-name,
ancestor, retry, workspace or provider bounds. Physical admission remains closed;
see [source/workspace findings](../../../docs/findings/registry-backup-workspace.md).

## Durable effect consumption (staged)

The backup worker uses a root-only `backup-effects/` sibling of captured journal
`contents/` on the same bounded journal filesystem. Its one-use effect state is
independent of snapshot contents: restoration cannot recreate or refund consumed
tickets. Fresh-backing storage enrollment initializes it; runtime and provisioning
convergence refuse loss of established state, lock or the entire directory.
[ADR 0078](../../../docs/adr/0078-registry-backup-consumption-survives-content-restore.md)
records this recovery boundary.

Every fixed restic command and exact-version recovery deletion consumes durable
authority before launch. Repeated admission and canonical recovery token rotation
retain spent slots and uncertain liabilities. Tokens bind exact current canonical
attempts; old ports and token changes on existing attempts refuse. Sidecar writes
preserve canonical journal replacement/failure headroom and leave the captured
contents tree unchanged. Uncertain effects require reconciliation rather than
automatic replay or time-based refund.

This is staged consumption machinery. The production physical adapter remains
closed; complete provider/source/repository/workspace envelopes, physical liability
release and installed worker access still require proof. It supplies no permission
to forget or prune snapshots and establishes no live 100 GiB admission.

## Retention inspection

Before preflight preparation or new snapshot creation, the root action inspects
the complete unfiltered restic snapshot catalogue under the same authority. Exact
S3 snapshot versions/markers bookend the read; every visible object ID must match
the authenticated logical catalogue, and full historical metadata must stay
stable. Unknown/foreign records, unfinished snapshot uploads, absent pins, changed
repository identity or mismatched last-verified metadata/journal refuse before
preparation or a new snapshot. Normal restic listing locks write provider objects,
so this inspection requires prior physical admission/reservation.

The read-only plan groups snapshots by stable registry identity across storage
path changes. It keeps the newest point in seven represented UTC day buckets and
four Monday-based UTC week buckets, plus the last verified snapshot and configured
pins regardless of age. Incomplete coverage preserves every existing snapshot and
offers no deletion candidates; separately admitted backups may build coverage.
This is retention planning, not prune authority. Physical budget admission,
durable effect authorization, bounded prune/reclamation and a retained post-prune
restore remain required before activation. The units remain staged and disabled.

## Failure, recovery and activation

No failure path unconditionally reopens service or resumes Flux. Inspect the fixed
status command as the authority user; it reports operation/revision/fence/store,
last verified snapshot and `unenrolled|enrolled` recovery status without tokens:

```sh
sudo -u puni-registry-authority -- /usr/local/libexec/puni-registry-authority/bun /usr/local/libexec/puni-registry-maintenance/status.js
```

Preserve its exact operation ID and original kind. `recover.js` and `activate.js`
accept no arguments; bounded JSON stdin contains only `operationId`, `kind` and
`mode`. Modes are `retry`, `restore` and `activate`; activation uses `activate.js`.
Owner, token, current store, snapshot and target paths come from canonical/root
configuration. A retry cannot turn partial destructive state into success by
accepting404 or computing a replacement plan. Use verified restore when required.
Do not delete the canonical journal, lock, replacement evidence or old store to
make a retry pass.

Ordinary backup/retirement requires only the current registry and canonical journal.
A second full-sized cold store is not a standing prerequisite. Recovery explicitly
refuses `unenrolled` before extraction. Enroll real independent bounded targets only
when available and freshly verify their mount/device/filesystem/node/PVC/runtime
identities and host reserve. An enrollment string or path/capacity claim is insufficient.

Restore selects the exact canonical verified backup. It verifies/extracts registry
content into the new target and the matching snapshot journal into separate bounded
**offline staging**. The healthy canonical journal and lock stay in place. Reconcile
all current protections/history/newer obligations against restored content before
rebinding the registry store. Only this operation/snapshot's introduced retirement
receipts may clear; older or unrelated later receipts remain. Preserve the old store.
Missing/corrupt current authority or unprovable newer obligations cannot fall back
silently to an old snapshot.

Successful rebind remains active at `restored` / awaiting activation, fenced, with
four owners suspended and endpoint withdrawn. The recovery receipt identifies the
new store, matching staged journal hash/revision and required offline handoff. Before
continuation, the installation owner must coordinate desired PVC/guard/store pins,
source artifacts, builder scratch exclusions and complete consumer/catalog coverage.
Fresh desired/runtime agreement and retained reads are required again; then the
same session restores prior flags/annotations/service and completes fenced. Actual
ordinary CLI/permit/image verification must use the rebound canonical enrollment.

Installing a recovered canonical journal requires exclusion of **all** supported
clients and reconciliation of current obligations under an explicitly coordinated
offline handoff. The staged copy does not authorize replacing a live lock/journal.
Any online canonical-lock handoff requires separate reviewed design.

## Evidence and operation

Keep timers disabled until mandatory backup admission, installed sudo/controller/
mount/credential boundaries, independent off-node restore and coordinated continuation
have passed. Enabling units and advancing source pins belong to that activation step.
Systemd failures and the durable authority status are required signals; no external
notification service is supplied here. `KillMode=mixed` allows the parent/helper
cleanup interval, while kernel-held FD3 exclusion remains effective after parent death.

Native fixture entrypoints are `registry-maintenance-config.native.ts`,
`registry-maintenance.native.ts` and `registry-maintenance-writers.native.ts`.
They require verified pinned binaries and exact owned disposable resources. Their
logs state substituted source/runtime/capacity/clock boundaries; local fixtures are
not production deletion or installed privilege certification. Record failed probes,
terminal process outcomes and exact cleanup alongside passing checks. Preserve
uncertain cleanup evidence rather than claim serving or success.

The authority invokes only `/usr/bin/sudo.ws` (reviewed Sudo 1.9.17p2), with a
fixed hash and root:root, single-link, canonical 4755 metadata checked before
every spawn. The installer similarly pins `/usr/sbin/visudo.ws` for policy
validation. The host's default sudo-rs executable does not supply the required
`-C` descriptor transport and its parser rejects classic closefrom settings.
SCM_RIGHTS avoids those settings and the `-C` option entirely; no PATH lookup,
alternatives change or runtime fallback is allowed. Missing or upgraded binaries require explicit reviewed pin updates.
Actual transferred-lock, current-root authentication and command-specific policy behavior must pass the installed
drill; a help/version response alone is not evidence of descriptor inheritance.

The current client integration persists an optional nonsecret completion through
`RegistryMaintenanceSession.settleClient` only after the authenticated fixed root
transport has observed terminal completion, process exit, bounded diagnostic drain
and channel EOF. Generic evidence updates cannot invent, erase or replace it.
Canonical reads validate operation, backup, target, revision bounds and parsed
receipt time. Legacy absence permits reading historical journals and grants no
restoration permission. Parent planning independently binds physical census,
filesystem, repository-qualified revisions and journal revision to the complete
retained API/consumer inventory.

Ordinary maintenance, recovery staging and activation invoke their fixed client
action after closing the retained HTTP server. Verified/restored/completed phases,
recovery handoff and root service restoration require fresh saved client evidence.
Restoration checks freshness after controller observations, before each reopening
patch and again in the Kubernetes adapter immediately before native PATCH spawn,
after its resource GET. A cloned recovery candidate drops only a foreign-store
completion; canonical old-store evidence survives until successful target pulls
replace it. This avoids treating the old store's verification as target evidence.

The outside launcher now keeps `.client-attempt.json` in the independently bounded
root-owned pull pool. It atomically publishes and fsyncs ownership before scope
launch, admits metadata allocation, and refreshes the stopped-writer/target audit.
The root-private record binds the physical plan, tool/scratch profile, hashed
capability, actual guardian, pool inode and uniquely derived scope. The worker
independently checks those facts and its current cgroup/boot/machine before server
or pull effects. Never edit the record to bypass a failed verification.

A retry under the same canonical operation can recover its abandoned jobs only
after proving the exact recorded scope not-found/inactive with no control group.
Recovery audits held-directory paths and refuses unknown or unsafe entries. Missing
ownership with nonempty scratch also refuses. Success requires no remaining jobs;
uncertain scope or cleanup retains the record and original failures. A fresh retry
uses a new nonce and reruns admission. See the linked design and verification record
for the anonymous-file publication contract and observed failure witnesses.

These safeguards remain implementation work pending installed enrollment and
lifecycle certification. A current disposable h4 fixture has exercised four actual
pulls through the fixed root launcher/CLI and a parent-death retry, including a
retained authority lock, abandoned job recovery and independent scope/mount/loop
cleanup. Its64MiB synthetic filesystem and modeled controller/enrollment boundary
do not certify production capacity or durable canonical session settlement. The
older Distribution/GC rehearsal models client completion and proves no client
execution. The installed cancellation/EOF/scope-failure matrix, scratch/Crane/worker
provisioning, full lifecycle and exact-SHA gate remain required. Do not enable
timers from these component results.
