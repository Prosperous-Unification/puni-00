# Bounded registry storage

**Source staging — 2026-11-08:** Registry lifecycle libraries and manual provisioning
sources are retained for future coordinated activation. Supported publish, copy,
Compose and Kubernetes commands keep current-main routing and legacy persisted
writer versions; they do not select managed adapters. Explicit managed helpers
require trusted enrollment. Historical installed receipts below do not establish
current readiness. Managed procedures remain attended future operations; this
source merge performs no installation, adoption or production action. Full native,
provider, storage, backup, isolation, recovery and delivery acceptance stays open.

The explicitly tagged `registry_storage` role provisions two retained ext4
filesystems, 50 GiB and 1 GiB by default. It does not migrate the existing PVC.
Enrollment requires `puni_registry_storage_enrolled=true`, sufficient root reserve,
and an unoccupied static UID/GID (59001 by default). The no-login account is
`puni-registry-authority`; it is distinct from the endpoint's dynamic
`puni-registry` account. Existing conflicting identities are refused.

`storage.sh provision /etc/puni/registry-storage.json` creates only previously
unenrolled backing files, with real allocation and eager inode/journal
initialization. Missing backing files with an existing enrollment are refused.
`mount` requires enrolled backing files and mounts them at boot; `verify` requires
both mounts already present. All modes serialize through the storage directory's
lock and verify backing inode, UUID, allocated blocks, loop backing identity,
mount options and capacity. Device numbers are rediscovered each boot.

`nodiscard` alone does not preserve reservation: ext4 lazy initialization can issue
WRITE_ZEROES, which loop maps to hole punching. Eager initialization is therefore
required. The actual physical rehearsal observes the removed-option failure.
The helper also requires exact `noauto,nodiscard,X-fstrim.notrim` fstab entries;
these keep the scheduled `fstrim --listed-in` path from deallocating backing blocks.
Explicit privileged trimming outside that path is outside the supported workflow.

The storage service precedes and is required by k3s. The production startup script
also verifies the mounted device, actual statfs filesystem ID and capacity on
every container start. Its root-owned identity receipts reside in the journal
filesystem's `identities/` directory, exposed read-only through the journal PVC.
It does not rely on a hostPath fallback, a PVC request, or a loop number alone.

The registry content directory and journal `contents/` directory are mode 0700,
owned by the dedicated UID. Distribution runs as that UID with all capabilities
dropped and mounts the journal read-only. The authenticated host authority must
run the journal CLI as that same UID/GID, via a root-owned fixed-command privilege
drop wrapper, staged by the separately tagged authority play described below. Neither canonical journal creation nor a permissive fence is part
of storage provisioning. Physical readiness alone is not rollout readiness.

Fresh journal backing also receives root-only `backup-effects/` state outside
captured `contents/`. It shares the bounded filesystem and whole-volume capacity
accounting, preserving canonical replacement/failure headroom. Provisioning
convergence never resets established effect consumption if its state, lock or
whole directory disappears. Runtime absence refuses; restoring captured contents
does not repair this authority. See [ADR 0078](../../../../docs/adr/0078-registry-backup-consumption-survives-content-restore.md)
and the [staged worker contract](../../../systemd/registry-backup/README.md#durable-effect-consumption-staged).
Production physical admission and installed worker-access proofs remain incomplete.

The private companion is the sole owner of the new PVs, PVCs and guard ConfigMap.
The public production directory holds the reviewed startup and Deployment patch
contracts without adding them to its kustomization. The private staged root JSON
Patch appends a child-platform patch while preserving the public source pin and
unrelated Flux holds. The old PVC remains untouched. Activation requires the
remaining lifecycle safeguards, full branch gate, backup and verified migration.

Run the non-cached `tool-fleet:test:registry-storage` target with
`REGISTRY_STORAGE_SSH`, `REGISTRY_STORAGE_HOST` and `REGISTRY_TEST_KUBECTL` set.
It requires the isolated private companion for ownership/payload checks and a
root-capable fixture host with the pinned registry image already present. It
allocates only 64+32+32 MiB in an exclusive directory, proves saturation,
missing/wrong/reused-device startup refusal, reservation, idempotency and
read-only journal access, then removes only its own mounts/devices/files.

The separately tagged `registry_authority` play stages the root-owned authenticated
SSH command `/usr/local/sbin/puni-registry-authority` and pressure service. It accepts
only JSON stdin; executable, UID59001, and journal directory are fixed. Build the
exact reviewed CLI with `bun build --target=bun tools/tool-fleet/src/registry-managed-journal-cli.ts
--outfile <artifact>`. Supply explicit controller paths and SHA256 values for that
bundle and the pinned Bun executable through `puni_registry_authority_*` enrollment.
The role validates source hashes before host writes and installed hashes before the
wrapper is installed. It does not start or enable the pressure service.

Journal v1 requires the explicit `upgrade` command. This preserves ownership and
reservations, migrates to v2, and installs a fence requiring verified maintenance.
A missing journal never upgrades or initializes implicitly. Enrollment's storageId
is the root-owned registry receipt's stable filesystem UUID; boot-specific loop
numbers are checked against the refreshed receipt on each physical measurement.

The main-container supervisor checks a journal-hash-bound permit each second.
The permit expires thirty seconds after a fresh measurement, includes the host boot
ID and monotonic uptime, and cannot survive a reboot. The pressure service renews
every ten seconds without changing the journal revision on healthy heartbeats.
Normal durable mutations use a two-hash transition between validated writable
states; explicit reopening publishes only the proposed new hash. Any lost permit
requires explicit recovery: a healthy checker never reopens an existing fence.
Synchronous publication admission independently requires a measurement no older
than five seconds, counts reserved filesystem blocks separately, and charges byte
and inode reservations before returning an admission token.

Revocation stops and reaps the writable Distribution child, then starts the pinned
binary with its complete readonly configuration object. The supervisor writes a
receipt correlated to a fresh revocation nonce, its instance UUID and boot ID.
The authority requires that receipt before acknowledging a newly established live
fence. Failure to write/read the receipt is an explicit unconfirmed-fencing error;
permission remains revoked and the independent journal attempts a failure receipt.
Already-fenced maintenance phases can proceed using their own verified writer-stop
barrier, including when registry ENOSPC prevents service observations. A restart
cannot silently restore writable operation. `reopen` additionally requires settled
publication/recovery, completed verified maintenance, byte/inode use below 70%, and
at least 20 GiB host-root availability.

Builder export scratch is a separate contract in `admitBuilderScratch`. Task5 must
provision and attach an independently enforced volume before export, supply its
root-owned identity receipt, and bound the full byte/inode export envelope. Trusted
builder enrollment supplies `/` plus every co-located registry/journal path as
exclusions; the publishing adapter must prove cross-host separation. Missing paths
throw; the primitive never treats ENOENT as evidence that a filesystem is remote.
The adapter does not provision builder storage or intercept actual exports itself.

The non-cached `tool-fleet:test:registry-capacity` rehearsal additionally requires
`REGISTRY_TEST_BUN` to name a uniquely owned `/var/tmp/puni-registry-runtime-*/bun`
fixture on the SSH host. Stage the locally pinned Bun binary there after a 20 GiB
root-reserve precheck; the rehearsal compares its SHA256 with the local executable
before running it. Remove that exact runtime fixture after the test. Registry,
journal and scratch loops are 64+32+32 MiB and clean themselves up; no production
PVC, secret, Service, account or Flux resource is changed. The test bundles the
actual CLI and exercises the fixed wrapper as UID 59001 and Distribution 2.8.3 by digest.

Pull verification uses a third, separately allocated filesystem. The explicitly
selected `registry_pulls` tag requires both storage and pull enrollment, static
UID59001, `puni_registry_pulls_bytes` and `puni_registry_pulls_inodes`; neither
capacity is defaulted. Measure the representative client envelope before selecting
production values. `provision-pulls`, `mount-pulls` and `verify-pulls` accept exactly
one `pulls` volume, with UID0 and an explicit positive inode ceiling. Formatting
sets that ceiling and verification checks the actual mounted inode count. The
pool's `contents/` is root:root mode0711; the unprivileged pull client cannot create
jobs in its parent.

Pull modes first verify `/etc/puni/registry-storage.json`, require the same storage
directory and refuse a weaker root reserve. The pulls receipt is written to the
verified journal filesystem at `journal/identities/pulls.receipt`. A missing pull
or journal mount fails verification before root-backed contents can be used.
`puni-registry-pulls.service` requires the canonical storage service and mounts and
verifies the enrolled pull pool at boot, before backup and retirement units.
Provisioning does not enable maintenance timers or enroll the client artifacts.

Run the non-cached `tool-fleet:test:registry-pulls` target with the same explicit
root fixture transport/host variables. Its private mount namespace and exclusive
directory allocate 224 MiB across disposable canonical and pull filesystems. It
checks byte and inode exhaustion, metadata, cross-mode refusal, canonical storage
and reserve agreement, trim exclusion, idempotency and missing mounts, then
verifies removal of its exact mounts, loops and workspace.

The built authority CLI also provides
`--validate-client-installation <trusted-candidate>` for reviewed client staging.
It verifies fixed artifacts, exact mode/root group, canonical ordinary/journal and
enrolled recovery receipts, pull capacity/identity/separation and root:root0711 pool
metadata. This read-only check accepts a full owned pull pool so recovery tools can
be installed before cleanup. Runtime custody still controls jobs and download
admission. Explicit client enrollment requires an eighth `client-worker` bundle
with the same SHA as the trusted configuration and a supplied Crane source matching
the fixed x64 pin. All bundle sources must be nonempty and at most16MiB. The role
installs Crane root:root0755 and the worker root:root0644, verifies canonical/pull
storage with the fixed helper, then requires the authority's exact `verified`
acknowledgement before installing the privilege grant. Both commands must succeed.
Absent/unenrolled clients retain the original seven-artifact staging contract.

The non-cached `tool-fleet:rehearse:registry-client-installation` target executes
the actual authority and maintenance roles in a private h4 mount namespace, with
disposable enforced storage and no system controller installation. Supply explicit
`--output`, `--transport`, `--host`, `--controller-packages`, `--bun`, `--crane` and
`--registry` paths; `--help` lists refusal cases and controlled guard removals. It
builds the current twelve CLI artifacts, verifies the staged source manifest and
closes only its exact owned fixtures. A transfer timeout preserves and reports the
remote stage for inspection. This installation rehearsal does not establish the
complete installed maintenance lifecycle or production enrollment.
