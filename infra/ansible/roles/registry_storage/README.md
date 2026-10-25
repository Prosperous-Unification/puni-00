# Bounded registry storage

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
drop wrapper; installing that wrapper and reading the durable write fence belong
to the admission slice. Neither journal creation nor a permissive fence is part
of storage provisioning. Physical readiness alone is not rollout readiness.

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
