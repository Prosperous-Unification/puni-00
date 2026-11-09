---
status: proposed
---

# Backup writes consume fixed reservations

Restic lock creation/refresh has no enforced finite whole-command count, so
cancellation timers cannot produce an honest static reservation. Propose a fixed,
nonelastic execution-class ceiling reserved in full before launch, with durable
stored-byte/count debits before every actual upstream dispatch. The class and
accepted input limits are independent of free space; unexpected exhaustion fails
fenced and retains the previous verified recovery. This changes admission to
permission for a bounded attempt, without asserting that every attempt succeeds.

Prefer a private REST/Unix relay while retaining the same authoritative encrypted
S3 repository and upstream Restic binary. It avoids a new downstream S3 signer/TLS
facade and an independently built Restic fork; moving to a filesystem instead
would change backup authority without bounding retained S3 versions. Static size
estimates remain useful diagnostics, but cannot replace enforcement. The relay
adds a transport and custody obligation: prove actual dispatch counts,
cross-backend compatibility and cleanup that cannot hide retained ciphertext.
Until qualification, independent resource/source evidence and complete durable
funding pass, physical admission remains closed. Retention coverage, recovery pins,
prune coexistence, post-prune restore and the no-product-migration scope remain
unchanged. See the owning [design](../../openspec/changes/bound-registry-storage/design.md#backups-and-monitoring)
and [source investigation](../findings/registry-backup-write-enforcement.md).
