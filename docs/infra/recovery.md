# Backup and recovery

Each store has its own consistent path. A filesystem copy of a live database
never replaces its application-consistent snapshot.

| Store                  | Path                                                         | Schedule      | Retention                       |
| ---------------------- | ------------------------------------------------------------ | ------------- | ------------------------------- |
| WBS SQLite             | `sqlite-backup` CronJob: `VACUUM INTO`, verify, versioned S3 | hourly at :17 | bucket versioning and lifecycle |
| Elasticsearch logs     | SLM `puni-daily` to repository `puni-snapshots`              | daily 01:30   | 365 d, at least 7, at most 400  |
| etcd (k3s state)       | k3s `etcd-snapshot` to S3, configured by the `backup` role   | `0 */6 * * *` | 28 snapshots per server         |
| Other PVCs (registry)  | Velero file-system backup with Kopia                         | daily 02:00   | 720 h                           |
| Platform configuration | Git plus the recovery secrets below                          | every commit  | Git history                     |

## Recovery secrets

A restore needs secrets that no backup contains. Hold each in two independent
places outside every cluster: the operator password manager, and an
age-encrypted file on offline media whose identity lives on a hardware key.
Record a SHA-256 fingerprint of each value beside the escrow entry, never in git.

| Secret                                       | Needed for                               |
| -------------------------------------------- | ---------------------------------------- |
| k3s server token, per cluster                | etcd snapshot restore                    |
| SOPS age identity, per cluster               | every Secret in `infra/platform/secrets` |
| Object storage credentials, primary and copy | reading any backup                       |
| Velero `repository-password`                 | decrypting Kopia file-system backups     |
| Registry CA key pair and push credential     | keeping node and Dagger trust            |
| Flux read-only deploy key and SSH host keys  | reconnecting Flux to the repository      |

The `backup` role refuses to configure snapshots until
`puni_k3s_token_sha256` equals the SHA-256 of the server's
`/var/lib/rancher/k3s/server/token`, so a cluster cannot take snapshots whose
token is not escrowed. Escrow for the other secrets is an operator checklist
item: before first production use, restore one value of each from escrow on a
machine that never saw the original and compare fingerprints.

## Off-region copy

The primary buckets (`puni-sqlite`, `puni-es-snapshots`, `puni-velero`,
`puni-etcd`) have versioning enabled. The off-region bucket has its own
versioning, object lock and lifecycle. Copy with `rclone copy`, never
`rclone sync --delete`, so a deletion or corruption in the primary never removes
retained generations from the copy.

## SQLite

Each run writes `sqlite/wbs/<timestamp>.db` and `<timestamp>.db.report.json`.
The report records the object version, SHA-256, size, source revision, applied
migration names and hashes, and `restoreProcedureVersion: sqlite-restore/1`,
which is this section. The runner is `tools/tool-fleet/src/backup-sqlite.ts`;
the ConfigMap copy must match it byte for byte.

To restore, run the same runner in `restore` mode into a new volume. It
downloads the report and snapshot, checks SHA-256, `integrity_check`,
`foreign_key_check` and the exact migration set, and refuses an existing target:

```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: sqlite-restore, namespace: wbs }
spec:
  backoffLimit: 0
  template:
    metadata: { labels: { puni.dev/workload: sqlite-backup } }
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        {
          runAsNonRoot: true,
          runAsUser: 1000,
          fsGroup: 1000,
          seccompProfile: { type: RuntimeDefault },
        }
      containers:
        - name: restore
          image: docker.io/oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f
          command: [bun, /runner/backup-sqlite.ts, restore]
          env:
            - { name: RESTORE_REPORT_KEY, value: sqlite/wbs/<timestamp>.db.report.json }
            - { name: RESTORE_TARGET_PATH, value: /restore/wbs.db }
            - { name: HOME, value: /tmp }
            - { name: BUN_RUNTIME_TRANSPILER_CACHE_PATH, value: '0' }
            # S3_ENDPOINT, S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
            # from Secret sqlite-backup-s3, as in the CronJob.
          securityContext:
            {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              capabilities: { drop: [ALL] },
            }
          volumeMounts:
            - { name: restore, mountPath: /restore }
            - { name: runner, mountPath: /runner, readOnly: true }
            - { name: tmp, mountPath: /tmp }
      volumes:
        - { name: restore, persistentVolumeClaim: { claimName: wbs-data-restore } }
        - { name: runner, configMap: { name: sqlite-backup-runner } }
        - { name: tmp, emptyDir: {} }
```

Query the known row and `__drizzle_migrations` from the restored file, then hand
it to the WBS release transaction, which owns the single-writer swap
([deployment](deployment.md)). The same runner works outside the cluster:
`bun tools/tool-fleet/src/backup-sqlite.ts restore` with the same variables.

## Elasticsearch

Restore into a new name, search, then delete; never restore over a live data
stream:

```sh
POST _snapshot/puni-snapshots/<snapshot>/_restore
{"indices": ".ds-logs-puni.otel-<env>-<date>-<generation>", "include_global_state": false,
 "rename_pattern": "\\.ds-(.+)", "rename_replacement": "restored-$1"}
```

To stop Elasticsearch deliberately, suspend Flux `observability` and the
`elasticsearch` HelmRelease, annotate the Elasticsearch resource with
`eck.k8s.elastic.co/pause-orchestration=true`, and scale its StatefulSet.
Collectors keep queued logs on the node until it returns.

## etcd

Snapshots live under `s3://<bucket>/<cluster-id>/`. A cold restore stops k3s on
every server, then on the first server runs
`k3s server --cluster-reset --cluster-reset-restore-path=<snapshot> --etcd-s3 ...`
with the escrowed token in `/etc/rancher/k3s/server-token`, starts k3s, deletes
stale VolumeAttachments and rejoins the other servers. This path is prepared but
not yet drilled; the F10 cold-recovery drill proves it.

## Velero

Restore a namespace under a new name to inspect it before replacing anything:

```yaml
apiVersion: velero.io/v1
kind: Restore
metadata: { name: <name>, namespace: puni-backup }
spec:
  backupName: <backup>
  namespaceMapping: { puni-registry: registry-restore }
  restorePVs: true
```

A restored namespace keeps the source labels, including Flux ownership labels;
delete it after inspection.

## Measured drills

All figures come from the disposable k3d cluster on 2026-09-18; the evidence and
commands are in [fleet verification](../../openspec/changes/k3s-fleet/verify.md#f6-completion-and-f7-observability-and-backup-drills). k3d cannot measure node loss, Hetzner volumes or real
object-storage latency.

| Drill                                    | Result                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Unique log event to searchable           | 14.1 s from pod creation, redacted body, one hit                     |
| Failing endpoint to test receiver        | about 113 s from rule creation (probe 15 s, `for: 1m`)               |
| Elasticsearch stopped 5 min 27 s         | 1800 of 1800 events, no duplicates; backlog alert fired and resolved |
| Elastic snapshot restored under new name | 0.32 s for one backing index; injected event present                 |
| SQLite backup and restore                | known rows and all 44 migrations restored; existing target refused   |
| Broken backup credentials                | upload HTTP 403, Job failed, `PuniBackupJobFailed` delivered         |
| Velero FSB backup and namespace restore  | 7 s and 9 s for 2.2 MB; blob digest verified                         |
| etcd snapshot to S3                      | 0.43 s for 29.7 MB; wrong key exits 1                                |
