## Context

**Plan only, 2026-11-17. Nothing here is implemented or installed.**

The [registry runbook](../../../docs/infra/registry.md) runs Distribution 2.8.3 on
h4claw at `registry.puni.internal:5000`. Its store is a local-path PVC (`registry`,
50 GiB request) on the host root filesystem. The request is not a limit.

[`bound-registry-storage`](../bound-registry-storage/proposal.md) staged three parts:

- the `registry_storage` role, which provisions two preallocated ext4 loop
  filesystems (registry 50 GiB, journal 1 GiB) and a boot unit;
- the start-up guard `infra/platform/registry/production/startup.sh` and its
  Deployment patch `storage-patch.yaml`;
- the managed lifecycle: journal authority, permits, admission, retirement and
  backup budgets. Tasks 3.0, 4.2, 4.3, 5.1, 5.2 and S4 are still open.

The guard cannot run without the lifecycle. After `verify_mount` passes for both
mounts, the supervisor loop serves writable only while `permits_writes`
(`startup.sh:39-93`) accepts `contents/writable.permit` in the journal. The permit
expires after 30 seconds and binds the boot ID. Only the lifecycle pressure service
renews it. That service needs maintenance configuration, alert enrollment and an
initialised journal. After any lapse, a reboot included, reopening needs a completed
maintenance run, and maintenance needs backup admission, which is not built. The
result is a registry that never accepts pushes.

This change activates the physical bound alone. The lifecycle stays dormant and can
take over later.

## Goals / Non-Goals

**Goals:** registry writes cannot reach the host root filesystem; pushes stop
cleanly before the bounded filesystem fills; existing content survives the switch,
verified by digest; nightly backups keep working; every step can be undone.

**Non-Goals:** see [proposal.md](proposal.md). In short: no lifecycle, no deletion of
any kind, no product migration, no edits to `bound-registry-storage`.

## Decisions

### 1. Bound-only guard as a separate script

New file `infra/platform/registry/production/bound-startup.sh`, with the same
arguments as `startup.sh`: identities directory, registry path, journal path, then
the Distribution command.

It reuses from `startup.sh`:

| Part                                 | Source lines         | Reuse                     |
| ------------------------------------ | -------------------- | ------------------------- |
| `verify_mount`                       | `startup.sh:9-34`    | Copied byte for byte      |
| Calls for `registry` and `journal`   | `startup.sh:35-36`   | Same                      |
| `stop_child` and the `trap`          | `startup.sh:99-106`  | Same                      |
| Supervisor loop, readonly env object | `startup.sh:107-132` | Same shape; new predicate |

It drops `permits_writes` (`39-93`), the `.authority-instance` record (`95-97`) and
the `readonly.request` handshake (`122-127`). Those belong to the lifecycle authority.

The new predicate is `is_below_fence`. Each loop iteration (one second):

1. If the latch file `$registry/.write-fence` exists in any form (file, directory,
   symlink, unreadable), return false.
2. Read `stat -f -c '%b %f %c %d' "$registry"`: total blocks, free blocks, total
   inodes, free inodes. A failed read, wrong field count or non-numeric field returns
   false.
3. Return true only if `used_blocks * 10 < total_blocks * 9` and
   `used_inodes * 10 < total_inodes * 9`.

The role formats with `-m 0` (`storage.sh:197`), so no blocks are reserved for root
and free blocks equal available blocks.

When the predicate fails because a measurement reached 90%, the guard writes the
latch (UID 59001, mode 0600, one line: used and total blocks and inodes). Then it
restarts Distribution read-only. If the latch write fails, for example on ENOSPC,
the guard stays read-only and retries next second. It never serves writable while a
measurement is at or above 90%.

**Latched** means: once written, the latch keeps the registry read-only across
container restarts, Pod replacement and host reboots, whatever later measurements
say. Only an operator with root on h4claw can remove it.

**Reopening.** Removing the latch while usage is still at or above 90% re-latches
within a second. This change provides no supported way to free space: DELETE is off,
garbage collection and upload purging are off. Reopening therefore means one of:
raise the bound (needs new tooling, see Open questions), or activate the lifecycle,
which brings retirement and garbage collection.

**Wrong mount.** `verify_mount` exits non-zero under `set -eu` before Distribution
starts. The Pod crash-loops and serves nothing. The mountpoint directories are
root-owned mode 0000 and refused if non-empty (`storage.sh:234-235`), so a missing
mount cannot receive writes from UID 59001 either.

**At 90%.** Distribution runs with `REGISTRY_STORAGE_MAINTENANCE_READONLY` enabled.
Pulls work. Pushes and uploads get HTTP 405. Uploads in flight at the switch are cut
off; their partial data stays in `_uploads`.

**Overshoot.** Between two samples an upload can add up to one second of throughput.
The loop filesystem's ENOSPC is the hard stop. The host stays safe because the
backing file is fully allocated.

**Why a separate file, not a mode switch.** A mode switch or a shared sourced library
edits `startup.sh`, which carries fifteen `Proof:` comments tied to lifecycle
rehearsals. Every one would need re-proving. A separate file duplicates
about 30 lines. A new test holds `verify_mount` byte-identical between the two
scripts, so any later change to the lifecycle copy fails that test until the
bound-only copy follows. The lifecycle guard, its tests and its `Proof:` comments stay
untouched.

### 2. Bound-only Deployment patch

New file `infra/platform/registry/production/bound-storage-patch.yaml`. It equals
`storage-patch.yaml` except that the command runs `/storage-guard/bound-startup.sh`.
It keeps:

- claim `registry-bounded` for `/var/lib/registry`;
- claim `registry-journal`, mounted read-only;
- the `registry-storage-guard` ConfigMap, which now carries both scripts;
- `REGISTRY_STORAGE_DELETE_ENABLED=false` and
  `REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING={"enabled": false}`
  (as `storage-patch.yaml:18-22`);
- UID/GID 59001 and `fsGroup: null`.

Neither new file joins `infra/platform/registry/production/kustomization.yaml`. The
existing test asserts that public rendering does not mention storage
(`infra/ansible/tests/registry-storage.test.ts:111-115`).

### 3. Journal filesystem as receipt carrier only

The journal filesystem is provisioned and mounted. Start-up needs it:

- receipts live in `journal/identities/*.receipt` (`storage.sh:266-274`);
- `verify_mount journal` checks the journal mount before trusting those receipts.

`provision` creates `contents/` empty, owned by UID 59001, mode 0700
(`storage.sh:250-255`), and a root-only empty `backup-effects/` (`storage.sh:57-62`).
The bound-only guard reads neither. Nothing writes `journal.json`, permits or
replacement files. A later lifecycle `initialize` refuses only when replacement files
exist (`tools/tool-fleet/src/registry-journal-core.ts:1979-1984`), so an empty
`contents/` keeps it possible.

### 4. k3s boot coupling: order, do not require

Today the role installs `k3s.service.d/registry-storage.conf` with
`Requires=` and `After=puni-registry-storage.service`.

| Option              | Storage unit fails at boot                                                                       | Other effects                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Keep `Requires=`    | k3s does not start. Website and every tenant are down.                                           | Stopping or restarting the storage unit also stops k3s.                    |
| `Wants=` + `After=` | k3s starts after the unit finishes. The registry Pod crash-loops at `verify_mount`. Tenants run. | No stop propagation. Ordering kept.                                        |
| Drop the drop-in    | Same as `Wants=`, but the Pod can start before the mount exists.                                 | The Pod may bind the empty mountpoint and keep it after the mount appears. |

**Recommendation: `Wants=` + `After=`.** The guard already refuses a wrong or missing
mount. A dead registry is a smaller failure than a dead cluster, and no product
depends on this registry yet.

Implementation: a role variable `puni_registry_storage_k3s_dependency` with values
`requires` (default, current behaviour) and `wants`. A new static file
`files/k3s-storage-wants.conf` holds `Wants=` and `After=`. The task picks the source
file by the variable. Any other value fails an assert before host writes. The
existing `k3s-storage.conf`, its task and the existing test assertion stay as they
are. This activation sets `wants`.

Recovery when the unit failed at boot: fix the cause, run
`systemctl start puni-registry-storage.service`, then delete the registry Pod so the
kubelet binds the mounted path again.

### 5. Migration: attended procedure, no new tool

The existing store is believed to hold only `activation/proof`, about 105 MB (the
last recorded snapshot processed 104,750,292 bytes). The smallest verifiable migration
is an attended copy with three independent checks. No new tool is written.

1. **Backup first.** Run the installed backup unit. Record the snapshot ID and a
   passing `restic check --read-data`.
2. **Record before-state through the API.** Catalogue, every tag's manifest digest,
   and the old PV's `spec.hostPath.path`.
3. **Stop writers.** Suspend Flux Kustomizations `puni-cluster` and `platform`, scale
   the registry Deployment to 0, wait until no registry Pod exists.
4. **Copy.** `cp -a <old path>/. /var/lib/puni-registry/registry/contents/`, then
   `chown -R 59001:59001` on the destination. The old store stays untouched.
5. **Verify the copy offline.**
   - A sorted `sha256sum` list of every file, source and destination, compares
     equal with `diff`.
   - Every `blobs/sha256/<xx>/<digest>/data` hashes to its `<digest>`.
   - File count and byte total match.
6. **Switch.** Apply the bound-only root patch (decision 7), resume Flux, wait for the
   Pod to be Ready.
7. **Verify through the API.** `/proc/self/mountinfo` in the Pod shows the bounded
   ext4 device at `/var/lib/registry`. Catalogue and every tag's manifest digest equal
   step 2. An uncached pull of `activation/proof` by digest succeeds on a node.

**Rollback.** Remove the root patch and resume Flux. The Deployment returns to claim
`registry`, which still holds the old bytes. Pushes made after the switch are not on
the old store. Once the bounded store has new content, rollback needs a fresh copy
back, not a switch to stale bytes.

### 6. Backup runner

What is installed, per
[the activation record](../activate-platform-registry/verify.md#live-backup-and-recovery):

- The runner file has SHA256
  `ee41d36b1f52f65152bcdf6c061a1c4d02a2ef86b91c53c345bcd5aa806bc9bb`. That is the
  SHA256 of `tools/tool-fleet/src/backup-registry.ts` at commit `6e37b3fc7`
  (re-computed with `git show 6e37b3fc7:tools/tool-fleet/src/backup-registry.ts |
sha256sum`, see verify.md).
- The unit at that commit runs `/home/puni1/.bun-1.4.4/bin/bun
/root/.puni/registry/backup-registry.ts` as root
  (`git show 6e37b3fc7:infra/systemd/registry-backup/puni-registry-backup.service`).
- The runner reads `backup-registry.lock.json` beside itself. That lock file is
  unchanged between `6e37b3fc7` and main.

That runner pins the old store. It requires a Deployment volume with claim
`registry`, a PVC named `registry` and `pv.spec.hostPath.path` (lines 199-211 and
222-228 at that commit). The bounded PV is claim `registry-bounded` with
`spec.local.path: /var/lib/puni-registry/registry/contents`. After the switch the
installed runner refuses before scaling anything, so backups stop, visibly.

On main, `backup-registry.ts` is now a 12-line wrapper for the lifecycle
(`registryMaintenanceMain('backup')`), and the main unit runs as
`puni-registry-authority` from `/usr/local/libexec/`. Neither can run without the
lifecycle.

**Change.** Add `tools/tool-fleet/src/backup-bounded-registry.ts`: the `6e37b3fc7`
runner with one changed identity predicate.

- Deployment volume claim, PVC name and PV `claimRef.name` must be
  `registry-bounded`.
- The source is `pv.spec.local.path` and must equal
  `/var/lib/puni-registry/registry/contents`.
- The source's device must differ from the device of `/var/lib/puni-registry`, so an
  unmounted mountpoint is refused before Flux is touched.

Everything else stays: Flux suspension barriers, scale-down, restic pin, receipt,
compensation. Its test file ports the `6e37b3fc7` suite with the bounded fixture.

The operator installs it at the same host path, `/root/.puni/registry/backup-registry.ts`,
so the unit and timer stay unchanged. Rollback reinstalls the `6e37b3fc7` file, whose
hash is known.

### 7. Private fleet repository

The fleet repository owns the bounded PV/PVC, the guard ConfigMap and the root JSON
patch. Its staged copies are older than the public files: its `startup.sh` differs and
its root patch has no `env` block, so applying it today would leave DELETE on.
The required fleet change:

- carry `bound-startup.sh` and `bound-storage-patch.yaml` byte-identical to the
  public files, both in the `registry-storage-guard` ConfigMap generator;
- a new root JSON patch whose child patch equals `bound-storage-patch.yaml`;
- add the registry storage Kustomization to the cluster's kustomization;
- resync the lifecycle staging so the existing equality test in
  `infra/ansible/tests/registry-storage.test.ts:48-124` passes again.

A new public test asserts the bound-only equality the same way.

### 8. Capacity

| Quantity                           | Value                         |
| ---------------------------------- | ----------------------------- |
| Bound (registry filesystem)        | 50 GiB (53,687,091,200 bytes) |
| Journal filesystem                 | 1 GiB                         |
| Host root taken, permanently       | 51 GiB, preallocated          |
| Root reserve enforced at provision | 20 GiB (`storage.sh:188-190`) |
| Root free needed to provision      | at least 71 GiB               |
| Stop rule (attended)               | 70% = 35 GiB or 70% of inodes |
| Write fence (guard)                | 90% = 45 GiB or 90% of inodes |

The stop rule has no alert behind it. An operator reads usage after each publication.
At 70%, no new product is onboarded until the lifecycle is active or the bound is
raised.

Per-release image size is not recorded anywhere, so the runway cannot be computed.
The first product publication measures it: `df -B1` and `df -i` on the registry
filesystem before and after, plus the sum of new unique blob sizes from the manifests.

### 9. What is given up

| Given up                              | Consequence                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| Retirement, garbage collection, prune | Usage only grows. At 90% the registry stays read-only for good.    |
| Upload purging                        | Abandoned uploads accumulate inside the bound.                     |
| Publisher admission and reservations  | A push can start near 90% and be cut off mid-upload.               |
| Alerts                                | Nobody is told at 70% or 90%. The stop rule is manual.             |
| Backup budget and snapshot pruning    | The restic repository grows without limit or alert.                |
| Journal ownership and protections     | Later lifecycle enrolment must inventory every image from scratch. |
| Hard k3s dependency                   | A failed mount leaves k3s up and the registry down.                |
| 51 GiB of host root                   | Taken at provisioning, whether used or not.                        |

### 10. When the lifecycle takes over

The lifecycle replaces the bound-only guard when all open `bound-registry-storage`
tasks (3.0, 4.2, 4.3, 5.1, 5.2, S4) are done and its own activation runs. That
activation must: initialise the journal on the empty `contents/`, switch the root
patch to `storage-patch.yaml`, remove `.write-fence`, and inventory the images
published under the bound-only guard. It also decides the k3s dependency for itself.

## Alternatives considered

- **Finish the lifecycle first.** Six open tasks, including backup admission that
  throws today. Products wait for all of it, with the disk unbounded meanwhile.
- **Stay unbounded.** No work, but one runaway push can fill the root filesystem
  under k3s and every tenant.
- **Filesystem quota instead of a loop filesystem.** A project quota on the host
  root needs quota features on that filesystem; on ext4 they are enabled at mkfs or
  on an unmounted filesystem, which means root downtime. The root filesystem type on
  h4claw is not recorded in source. A quota also shares inodes and the journal with
  the host. The loop filesystem is already built and proven on fixtures.

No ADR. The decision is reversible at every step.

## Risks / Trade-offs

- The write fence is advisory to Distribution's own read-only mode. The real stop is
  ENOSPC inside the loop filesystem; the host stays safe either way.
- A stuck latch makes the registry read-only until a bound raise or the lifecycle.
  That is intended.
- Migration needs a short window with no registry. No product depends on it.
- With `Wants=`, a mount failure is quiet at the cluster level. The registry Pod's
  crash loop is the signal.

## Open questions

1. How the live root patch is applied to the `puni-cluster` Kustomization, who owns
   it, and whether a bootstrap reconcile overwrites it. Not in public source.
2. h4claw root free space now. Provisioning needs at least 71 GiB.
3. The live catalogue. Believed to be only `activation/proof`.
4. Whether the host still runs the `6e37b3fc7` unit and runner, with the recorded
   hash. Needs a read on the host.
5. Whether busybox `stat -f` in the pinned image supports `%f`, `%c` and `%d`, and
   whether heredocs in `verify_mount` work under `readOnlyRootFilesystem`. The
   rehearsal (task 1.2) must run the container read-only to settle both.
6. Whether DELETE of a missing digest returns 405 or 404 with delete disabled. The
   receipt uses an existing manifest digest, so this does not block.
7. Whether the kubelet sees a mount that appears after the Pod bound the empty
   mountpoint. The recovery step deletes the Pod regardless.
8. Real boot ordering on h4claw is unverified. An attended reboot would prove it, at
   the cost of a tenant outage. Owner decides.
9. Whether to enable Distribution's default upload purger (uploads older than seven
   days). It would reclaim abandoned uploads but is a deletion path the lifecycle
   design turned off. This design keeps it off.
10. How to raise the bound. `storage.sh` has no resize mode. A raise needs its own
    change.
