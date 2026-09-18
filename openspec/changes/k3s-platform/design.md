# Design

F3, F6, F7, F9, F10, and F12 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md) implement this change. Ansible owns operating-system and k3s state. Flux owns controllers and long-lived Kubernetes objects after bootstrap, ordered through explicit dependencies.

Ordinary namespaces enforce Restricted Pod Security, quotas, dedicated service accounts, default-deny network policy, and no worker API token. The solver backend and source-run forge use separate trusted namespaces with admission limited to exact host roots, controller identities, approved digests, and capable nodes. Local k3d proves application/platform paths; disposable Ubuntu VMs prove Ansible/systemd/firewall/host-mount paths.

Recovery begins from recorded k3s token, SOPS key, toolchain, desired fleet, and backup manifests, then proves infrastructure and application state including known WBS rows, migrations, registry pulls, Elastic queries, and admission policy.

## Platform graph

Each platform cluster root reconciles nine Flux stages: `target`, `controllers`, `storage`, `policy`, `secrets`, `platform`, `observability`, `alerts`, `backup` ([platform](../../../docs/infra/platform.md)). `target` health-checks the immutable bootstrap marker `kube-system/puni-cluster-<id>` through the stage's own kubeconfig, which turns a wrong-cluster kubeconfig into a stopped graph. Secrets reach Git only as SOPS files per cluster; the committed directories are empty until an operator encrypts real values, so dependents fail closed. `alerts` follows `observability` because its custom resources need the monitoring CRDs. Workers clusters reconcile only `target`, `storage`, `policy`, `secrets` and `telemetry`: their nodes may carry only `control-plane` and `execution`, so an OTel agent DaemonSet ships logs and host metrics to the platform cluster's `otel-gateway` instead of running Elasticsearch, Prometheus, ingress, registry or Velero there. The validator rejects any stage whose workload selectors no node of that cluster purpose can satisfy.

Backups follow the store: SQLite through the byte-bound `backup-sqlite.ts` runner (`VACUUM INTO`, integrity and foreign-key checks, migration set, versioned upload, report), Elasticsearch through SLM, etcd through k3s S3 snapshots gated on token escrow, and remaining PVCs through Velero Kopia file-system backup ([recovery](../../../docs/infra/recovery.md)).

## Assumptions recorded without an interview

- The WBS database lives on PVC `wbs-data` at `/data/wbs.db` in namespace `wbs`, the backend pods carry `app.kubernetes.io/name: be-01` and run as UID 1000, and the release publishes ConfigMap `wbs/wbs-release` with key `revision`. The backup CronJob fails loudly until these exist.
- Workers telemetry crosses clusters as plain OTLP on the private network (`10.1.0.0/16`), admitted by `otlp-ingress`; mTLS for the gateway is an open item. Workers PVCs are not backed up by Velero; execution workloads are treated as disposable and k3s state is covered by etcd snapshots.
- Production object storage is Hetzner `hel1` (`hel1.your-objectstorage.com`, path-style), and the production registry endpoint is `registry.puni.internal` on the private network.
- Staging and product hostnames are `wbs-staging.bulletpoints.club` and `wbs.bulletpoints.club`; the ACME account email is `ops@bulletpoints.club`.
- `solverImages` holds the release's candidate and rollback backend digests, comma separated; the key replaces the former single `solverImage`.
- Local rehearsals use an in-cluster MinIO (`RELEASE.2025-09-07T16-13-09Z`, the last published community image) only as an S3 stand-in, a disposable age identity, and a Git smart-HTTP server for the rehearsal commit; none of these is a production component.
- Elasticsearch runs one node with zero replicas at stage 1; the index template sets `number_of_replicas: 0` so a single node stays green.

## Trusted image ownership

Flux creates `wbs-solver/puni-trusted-workload` once (`kustomize.toolkit.fluxcd.io/ssa: IfNotPresent`) and the WBS release coordinator owns `data.solverImages` afterwards. Letting Flux keep reconciling the ConfigMap would revert every release's candidate and rollback digests within one interval; moving the parameter out of Git entirely would lose the fail-closed initial state on a rebuilt cluster. With create-once ownership, a missing ConfigMap still denies every trusted pod (`parameterNotFoundAction: Deny`) until Flux recreates it, and the policy's parameter check denies any non-digest entry. The coordinator's exact contract is in [platform](../../../docs/infra/platform.md#trusted-image-ownership). The policy matches only namespaces labelled `puni.dev/trusted-hostpath`, so an absent parameter cannot block other namespaces; a second policy keeps that label on `wbs-solver` and `puni-forge`.
