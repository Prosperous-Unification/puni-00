## ADDED Requirements

### Requirement: Verified bounded mount before start-up

The bound-only start-up guard SHALL verify the registry and journal mounts against
their root-owned identity receipts before it starts Distribution. It MUST check the
receipt metadata, the mounted device, the ext4 filesystem type, the statfs
filesystem ID and the capacity limit, exactly as the lifecycle guard's
`verify_mount` does. Any failed check MUST stop the guard with a non-zero exit before
Distribution starts and before any file is written.

#### Scenario: Registry path is a plain directory

- **WHEN** the registry path is a directory on the root filesystem instead of the bounded ext4 mount
- **THEN** the guard exits non-zero, Distribution never starts, and the directory stays empty

#### Scenario: Wrong filesystem on the receipt's device

- **WHEN** a different ext4 filesystem is mounted on the device named by the registry receipt
- **THEN** the guard exits non-zero at the filesystem ID check

#### Scenario: Mount check stays identical to the lifecycle guard

- **WHEN** the `verify_mount` function differs by any byte between the bound-only guard and the lifecycle guard
- **THEN** the drift test fails

### Requirement: Latched write fence at ninety percent

The guard SHALL serve Distribution writable only while no latch file exists and the
registry filesystem's used blocks and used inodes are both below 90% of their totals.
When a measurement reaches 90%, the guard SHALL write the latch and restart
Distribution read-only. A failed, malformed or partial measurement MUST be treated as
read-only. The latch MUST keep the registry read-only across container restarts, Pod
replacement and host reboot, whatever later measurements show.

#### Scenario: Push below the fence

- **WHEN** the registry filesystem is below 90% of blocks and inodes and no latch exists
- **THEN** a blob upload is accepted with HTTP 202

#### Scenario: Push at the fence

- **WHEN** used blocks reach 90% of the registry filesystem
- **THEN** the guard writes the latch, a new upload gets HTTP 405, and a pull of an existing manifest by digest still succeeds

#### Scenario: Inode fence despite free bytes

- **WHEN** used inodes reach 90% while used blocks are below 90%
- **THEN** a new upload gets HTTP 405

#### Scenario: Fence stays latched across restart

- **WHEN** the latch exists and the guard restarts after usage has fallen below 90%
- **THEN** Distribution starts read-only and uploads get HTTP 405

#### Scenario: Measurement cannot be read

- **WHEN** the filesystem measurement fails or returns a malformed line
- **THEN** Distribution runs read-only

### Requirement: Deletion disabled

The bound-only Deployment patch SHALL set `REGISTRY_STORAGE_DELETE_ENABLED=false` and
keep upload purging off, so no client request can delete stored content.

#### Scenario: DELETE of an existing manifest

- **WHEN** an authenticated client sends DELETE for an existing manifest digest
- **THEN** the registry answers HTTP 405 and the manifest stays pullable

### Requirement: Saturation stays inside the bound

Filling the registry filesystem SHALL NOT reduce free space on the host root
filesystem, because the backing file is fully allocated at provisioning.

#### Scenario: Saturation leaves the host root reserve intact

- **WHEN** a disposable bounded fixture is written until ENOSPC
- **THEN** host root available bytes stay within the fixture's measurement noise and the fixture's backing allocation is unchanged

### Requirement: Backup of the bounded store

The pre-lifecycle backup runner SHALL back up the bounded store when the registry
Deployment uses claim `registry-bounded` and its PV has
`spec.local.path: /var/lib/puni-registry/registry/contents` on a mounted filesystem.
It MUST refuse, before changing any Flux or Deployment state, when the claim, PV
source type or path differs, or when the path is not on a separate mount.

#### Scenario: Bounded path backup succeeds

- **WHEN** the runner runs against the bounded Deployment, PVC and PV
- **THEN** it records a snapshot ID with non-zero processed bytes, `restic check --read-data` passes, and Flux and replica state are restored

#### Scenario: Unmounted bounded path is refused

- **WHEN** `/var/lib/puni-registry/registry/contents` is on the same device as `/var/lib/puni-registry`
- **THEN** the runner exits non-zero without suspending Flux or scaling the registry

#### Scenario: Old claim is refused

- **WHEN** the Deployment still uses claim `registry` with a `hostPath` PV
- **THEN** the bounded runner exits non-zero without suspending Flux or scaling the registry

### Requirement: Content-preserving switch and rollback

Moving the registry to the bounded store SHALL preserve every stored file and every
tag's manifest digest. The old PVC MUST stay untouched until the owner retires it.
Removing the bound-only root patch SHALL return the Deployment to the previous store.

#### Scenario: Copy verified by digest

- **WHEN** the existing store is copied into the bounded filesystem
- **THEN** the sorted SHA256 lists of both trees are equal, every blob's data hashes to its digest, and after the switch every tag resolves to the same manifest digest as before

#### Scenario: Rollback restores the previous store

- **WHEN** the bound-only root patch is removed and Flux reconciles
- **THEN** the Deployment mounts claim `registry` again and every tag resolves to the digest recorded before the switch

### Requirement: k3s ordered after storage without a hard dependency

The storage role SHALL accept `puni_registry_storage_k3s_dependency` with value
`requires` or `wants`. With `wants`, k3s SHALL start after the storage unit finishes
even when that unit fails. Any other value MUST fail before host writes.

#### Scenario: Storage unit fails with wants

- **WHEN** the dependency is `wants` and `puni-registry-storage.service` fails
- **THEN** k3s still starts, and the registry Pod exits at its mount check

#### Scenario: Unknown dependency value

- **WHEN** the dependency variable is any value other than `requires` or `wants`
- **THEN** the role fails its assertion and writes no k3s drop-in
