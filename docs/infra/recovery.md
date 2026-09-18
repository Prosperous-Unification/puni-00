# Backup and recovery

Each store has its own consistent path. A filesystem copy of a live database
never replaces its application-consistent snapshot.

| Store                  | Path                                                         | Schedule      | Retention                                                       |
| ---------------------- | ------------------------------------------------------------ | ------------- | --------------------------------------------------------------- |
| WBS SQLite             | `sqlite-backup` CronJob: `VACUUM INTO`, verify, versioned S3 | hourly at :17 | noncurrent versions expire after 30 d; current objects are kept |
| Elasticsearch logs     | SLM `puni-daily` to repository `puni-snapshots`              | daily 01:30   | 365 d, at least 7, at most 400                                  |
| etcd (k3s state)       | k3s `etcd-snapshot` to S3, configured by the `backup` role   | `0 */6 * * *` | 28 snapshots per server                                         |
| Other PVCs (registry)  | Velero file-system backup with Kopia                         | daily 02:00   | 720 h                                                           |
| Platform configuration | Git plus the recovery secrets below                          | every commit  | Git history                                                     |

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

## Bucket lifecycle

Every backup bucket has versioning and one lifecycle rule: noncurrent versions
expire after 30 days. Current objects are pruned only by each tool's own
retention (SLM, Velero TTL, the k3s snapshot count); the SQLite prefix keeps
every current generation until an operator prunes it. The local rehearsal
store applies the rule in its bucket Job. For production, apply and read back
the same rule on each primary bucket once:

```sh
cat > lifecycle.json <<'JSON'
{"Rules":[{"ID":"expire-noncurrent","Status":"Enabled","Filter":{"Prefix":""},
  "NoncurrentVersionExpiration":{"NoncurrentDays":30}}]}
JSON
aws s3api put-bucket-versioning --endpoint-url https://hel1.your-objectstorage.com \
  --bucket puni-sqlite --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --endpoint-url https://hel1.your-objectstorage.com \
  --bucket puni-sqlite --lifecycle-configuration file://lifecycle.json
aws s3api get-bucket-lifecycle-configuration --endpoint-url https://hel1.your-objectstorage.com \
  --bucket puni-sqlite
```

Whether Hetzner Object Storage honours `NoncurrentVersionExpiration` has not
been observed; read the configuration back and list object versions after 31
days before relying on it.

## Off-region copy

The primary buckets (`puni-sqlite`, `puni-es-snapshots`, `puni-velero`,
`puni-etcd`) have versioning enabled. The off-region bucket has its own
versioning, object lock and lifecycle. Copy with `rclone copy`, never
`rclone sync --delete`, so a deletion or corruption in the primary never removes
retained generations from the copy.

## SQLite

The backup ships with the WBS release (`deploy/k8s/wbs/base/backup.yaml`): CronJob
`wbs-solver/sqlite-backup` runs the release's own backend image, because F6 admits a pod
beside `wbs-data` only with the backend's service account, controller label, product node and
a `solverImages` digest. The release coordinator rewrites its image with every backend
rollout. `tool-fleet:check` (family `wbs-backup`) requires its namespace, service account,
label, node, image, UID, PVC, database path (`/data/wbs.sqlite`) and release-record key to match
the backend in every overlay. Its Secret `wbs-solver/sqlite-backup-s3` and egress policy are
per-environment inputs.

Each run writes `sqlite/wbs/<timestamp>.db` and `<timestamp>.db.report.json`.
The report records the object version, SHA-256, size, source revision (`wbs-release`
`sourceSha`), applied migration names and hashes, and `restoreProcedureVersion:
sqlite-restore/1`, which is this section. The runner is `tools/tool-fleet/src/backup-sqlite.ts`;
the ConfigMap copy must match it byte for byte.

To restore, run the same runner in `restore` mode into a new volume in `wbs-solver`, as a pod
F6 admits: the backend image and identity. It downloads the report and snapshot, checks
SHA-256, `integrity_check`, `foreign_key_check` and the exact migration set, and refuses an
existing target. `bunx nx run tool-deploy:test:backup` runs exactly this Job in a k3d lab after
one CronJob run and reads the known row back:

```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: sqlite-restore, namespace: wbs-solver }
spec:
  backoffLimit: 0
  template:
    metadata:
      labels: { puni.dev/controller: wbs-backend, puni.dev/workload: sqlite-backup }
    spec:
      restartPolicy: Never
      serviceAccountName: wbs-backend
      automountServiceAccountToken: false
      nodeSelector: { puni.dev/capability-product: 'true' }
      securityContext:
        {
          runAsNonRoot: true,
          runAsUser: 10001,
          runAsGroup: 10001,
          fsGroup: 10001,
          seccompProfile: { type: RuntimeDefault },
        }
      containers:
        - name: restore
          image: <the running backend digest, from wbs-solver/wbs-release>
          command: [bun, /runner/backup-sqlite.ts, restore]
          env:
            - { name: RESTORE_REPORT_KEY, value: sqlite/wbs/<timestamp>.db.report.json }
            - { name: RESTORE_TARGET_PATH, value: /restore/wbs.sqlite }
            - { name: HOME, value: /tmp }
            - { name: BUN_RUNTIME_TRANSPILER_CACHE_PATH, value: '0' }
            # S3_ENDPOINT, S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
            # from Secret sqlite-backup-s3, as in the CronJob.
          securityContext:
            {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              runAsNonRoot: true,
              seccompProfile: { type: RuntimeDefault },
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

## etcd and cold restore

Snapshots live under `s3://<bucket>/<cluster-id>/`. A cold restore needs, from escrow, the
server token (the whole `/var/lib/rancher/k3s/server/token` line), the SOPS age identity and a
recovery manifest recorded when the snapshot was taken:

```sh
bunx nx run tool-fleet:recover -- record-manifest --cluster <id> --source-revision <git sha> \
  --snapshot <downloaded snapshot> --object-key <id>/<name> --token-file <escrow>/token \
  --sops-age-key-file <escrow>/age.agekey --stores stores.json > manifest.json
```

`stores.json` lists what the restore must prove: the SQLite report key and a known row, Velero
backups, the Elastic snapshot and a query, and registry image digests. Keep the manifest with
the escrowed secrets. To restore, first fence every original server (powered off or deleted)
and write that evidence to `fences.json`, then:

```sh
bunx nx run tool-fleet:recover -- verify-cold-restore --cluster <id> --manifest manifest.json \
  --token-file <escrow>/token --sops-age-key-file <escrow>/age.agekey \
  --snapshot <downloaded snapshot> --fences fences.json > plan.json
ansible-playbook -i <inventory> infra/ansible/playbooks/restore.yml -e puni_cluster_id=<id> \
  -e puni_restore_plan_path=plan.json -e puni_restore_snapshot_path=<snapshot> \
  -e puni_restore_token_path=<escrow>/token -e puni_node_name=<first replacement server>
```

`verify-cold-restore` refuses a missing or different token or SOPS identity, a snapshot whose
size or SHA-256 differs from the manifest (a corrupt archive), a snapshot from another
cluster's folder, a k3s version other than the lock, and any original server that is not
fenced. It never plans an empty bootstrap. `restore.yml` re-checks the placed token and
snapshot bytes against the plan before it stops k3s, moves the old datastore aside, runs
`k3s server --cluster-reset --cluster-reset-restore-path`, starts k3s and deletes the fenced
Node objects by exact name. The reset records the node's current IP as the etcd peer URL, so it
must run on the replacement server itself with its final address.

Then, in order:

1. **Volumes.** A node-local PersistentVolume still names the dead node. After checking its
   data survived, rebind it deliberately:
   `bunx nx run tool-fleet:recover -- rebind-volume --kubeconfig <k> --kubectl <path> --volume <pv> --to-node <node> --fences fences.json`.
   It refuses a CSI volume, a claim with another UID, an unfenced old node and a reclaim
   policy other than `Retain`. The platform's own claims use the default `local-path` class
   (`Delete`), so patch each to `Retain` first; never delete such a PV object otherwise.
2. **Stale attachments.** For CSI volumes (Hetzner), delete only the attachment of that exact
   volume on a fenced node:
   `bunx nx run tool-fleet:recover -- remove-attachment --kubeconfig <k> --kubectl <path> --volume <pv> --node <old node> --fences fences.json`.
   It re-reads the object and compares its UID before deleting. Never delete attachments to
   unstick a Pending pod on a live node.
3. **Controllers.** `flux reconcile ks puni-cluster --with-source`; every stage must reach
   `Ready` at the manifest's source revision.
4. **Applications.** Restore SQLite from the report into a new claim (below) and read the known
   row and migration set; pull each recorded registry digest; query Elastic; server-side
   dry-run `solver-allowed` (admitted) and `solver-alternate-path` (denied).
5. **Backups again.** Take an etcd snapshot, record a new manifest, and run
   `tool-fleet:health`; a restored cluster has no snapshot of its own until then.

A restore of etcd alone does not restore applications.

## Routine maintenance

`bunx nx run tool-fleet:maintenance -- plan --input evidence.json` plans one operation from
recorded evidence (`operation` selects it). Each refuses before any effect:

| Operation                 | Refuses when                                                                |
| ------------------------- | --------------------------------------------------------------------------- |
| `control-plane-expansion` | a member is not a healthy voter, no snapshot, target even or not larger     |
| `certificate-rotation`    | a member is unhealthy, no snapshot, one server without accepting the outage |
| `token-rotation`          | the new token is not escrowed; keeps the old one for older snapshots        |
| `sops-key-rotation`       | the new identity is not escrowed; rotates through a two-identity window     |
| `registry-recovery`       | an image is not a digest reference                                          |
| `forge-replacement`       | the old forge is not fenced or a worktree head is not pushed                |

## Scheduled verification and health

`wbs-solver/sqlite-backup-verify` (`deploy/k8s/wbs/base/verify-cronjob.yaml`, daily 03:45)
runs `backup-sqlite.ts verify`: it restores the newest report under `sqlite/wbs/` into scratch
and fails when that report was captured more than 26 hours ago or does not verify;
`PuniBackupJobFailed` covers it. It needs no volume, but only `wbs-solver` holds the backup's
Secret, runner and egress policy, so it carries the backend's admitted identity like the
backup, the release coordinator moves its image with every backend rollout, and
`tool-fleet:check` compares those fields.

`bunx nx run tool-fleet:health -- --cluster <id> --kubeconfig <k> --kubectl <path>` is
read-only (any kubectl verb but `get` throws) and exits 1 on a critical finding. Rules: target
marker, node Ready, etcd voter, newest etcd snapshot within 7 h, Flux objects Ready (suspended
is a warning), pods Ready, VolumeAttachments attached, claims Bound (Lost is critical), SQLite
backup within 2 h, Velero schedule within 26 h, latest backup Job per CronJob not failed,
certificates Ready with 14 days left. Elastic snapshot age is not observable through Kubernetes
and is not covered.

## Synthetic worker drills

`bunx nx run harness-example:package`, then
`bunx nx run tool-fleet:synthetic -- dispatch|reconcile|cancel --run <id> ... --journal <file>`
runs the fake-ACP harness as a bounded Job in `workers`. The journal stands in for Twilight's
authority outside the cluster. These are infrastructure proofs, not Twilight's M1 contract.

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

## Cold restore, measured

k3d on 2026-09-18, one server, embedded etcd, the full platform-local graph at a rehearsal
commit; commands and evidence in
[platform verification](../../openspec/changes/k3s-platform/verify.md#f10-recovery-and-maintenance-drills).
The source cluster was deleted (the fence); its local-path directory was kept on the host, as a
Hetzner volume outlives its server.

| Measure                                  | Result                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| etcd snapshot to S3                      | 0.50 s for 36 MiB, 6.9 s after the last write                              |
| Missing token, missing key, corrupt copy | each refused by `verify-cold-restore`, exit 1; `restore.yml` refused too   |
| Loss to API up on the replacement        | 5 min 06 s (includes one reset redone for a wrong peer IP, about 2 min)    |
| Loss to every application check passing  | 13 min 04 s: rows and 44 migrations, registry pull, Elastic hit, admission |
| Loss to every Flux stage Ready           | 17 min 53 s, delayed by a lab DNS entry k3d had not injected               |
| Worker cluster deleted to policy Ready   | 1 min 32 s; the in-flight run restarted once and completed at 2 min 22 s   |
| Worker node stopped to run complete      | 42 s after the out-of-service fence taint; nothing ran before the fence    |

RPO by store:

| Store                | RPO                                      | Observed                                              |
| -------------------- | ---------------------------------------- | ----------------------------------------------------- |
| etcd                 | snapshot interval, 6 h                   | on-demand snapshot held all state written before it   |
| WBS SQLite (S3)      | backup interval, 1 h                     | a row written 90 s after the backup was not restored  |
| WBS SQLite (volume)  | 0 when the volume survives and is fenced | the rebound volume held that row                      |
| Elasticsearch        | ingest delay; SLM daily for off-cluster  | the rebound volume held the injected event            |
| Registry, other PVCs | Velero daily, or 0 on a rebound volume   | image pulled by digest; Velero restore also completed |

## Residual single points of failure

- One server per cluster: its loss is a cold restore, not a failover; expansion to three is
  planned but not executed.
- One SQLite writer and one Elasticsearch node with zero replicas.
- The local rehearsal object store lives inside the cluster; only production object storage
  is outside the failure domain, and the off-region copy is not yet running.
- Platform claims use `local-path` with `Delete`; the `Retain` class `puni-local` is unused by
  them, so a careless PV deletion loses data.
- A kubelet enforces `emptyDir.sizeLimit` by eviction, not quota: the disk-exhaustion Job wrote
  about 2 GB into a 64 MiB scratch in 59 s before eviction.
- Escrow (token, SOPS identity, manifest) is an operator procedure; no second-machine check has
  run.
- The Git source and its deploy key: a restore cannot reconcile without them.
