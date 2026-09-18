# Design

F3, F6, F7, F9, F10, and F12 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md) implement this change. Ansible owns operating-system and k3s state. Flux owns controllers and long-lived Kubernetes objects after bootstrap, ordered through explicit dependencies.

Ordinary namespaces enforce Restricted Pod Security, quotas, dedicated service accounts, default-deny network policy, and no worker API token. The solver backend and source-run forge use separate trusted namespaces with admission limited to exact host roots, controller identities, approved digests, and capable nodes. Local k3d proves application/platform paths; disposable Ubuntu VMs prove Ansible/systemd/firewall/host-mount paths.

Recovery begins from recorded k3s token, SOPS key, toolchain, desired fleet, and backup manifests, then proves infrastructure and application state including known WBS rows, migrations, registry pulls, Elastic queries, and admission policy.

## Platform graph

Each platform cluster root reconciles nine Flux stages: `target`, `controllers`, `storage`, `policy`, `secrets`, `platform`, `observability`, `alerts`, `backup` ([platform](../../../docs/infra/platform.md)). `target` health-checks the immutable bootstrap marker `kube-system/puni-cluster-<id>` through the stage's own kubeconfig, which turns a wrong-cluster kubeconfig into a stopped graph. Secrets reach Git only as SOPS files per cluster; the committed directories are empty until an operator encrypts real values, so dependents fail closed. `alerts` follows `observability` because its custom resources need the monitoring CRDs. Workers clusters reconcile only `target`, `storage`, `policy`, `secrets` and `telemetry`: their nodes may carry only `control-plane` and `execution`, so an OTel agent DaemonSet ships logs and host metrics to the platform cluster's `otel-gateway` instead of running Elasticsearch, Prometheus, ingress, registry or Velero there. The validator rejects any stage whose workload selectors no node of that cluster purpose can satisfy.

Backups follow the store: SQLite through the byte-bound `backup-sqlite.ts` runner (`VACUUM INTO`, integrity and foreign-key checks, migration set, versioned upload, report), Elasticsearch through SLM, etcd through k3s S3 snapshots gated on token escrow, and remaining PVCs through Velero Kopia file-system backup ([recovery](../../../docs/infra/recovery.md)).

## Assumptions recorded without an interview

- The WBS database lives on PVC `wbs-data` at `/data/wbs.sqlite` in namespace `wbs-solver`, the backend pods carry `app.kubernetes.io/name: wbs-backend` and run as UID 10001, and the release publishes ConfigMap `wbs-release` with key `sourceSha`. The backup CronJob fails loudly until these exist.
- Workers telemetry crosses clusters as plain OTLP on the private network (`10.1.0.0/16`), admitted by `otlp-ingress`; mTLS for the gateway is an open item. Workers PVCs are not backed up by Velero; execution workloads are treated as disposable and k3s state is covered by etcd snapshots.
- Production object storage is Hetzner `hel1` (`hel1.your-objectstorage.com`, path-style), and the production registry endpoint is `registry.puni.internal` on the private network.
- Staging and product hostnames are `wbs-staging.bulletpoints.club` and `wbs.bulletpoints.club`; the ACME account email is `ops@bulletpoints.club`.
- `solverImages` holds the release's candidate and rollback backend digests, comma separated; the key replaces the former single `solverImage`.
- Local rehearsals use an in-cluster MinIO (`RELEASE.2025-09-07T16-13-09Z`, the last published community image) only as an S3 stand-in, a disposable age identity, and a Git smart-HTTP server for the rehearsal commit; none of these is a production component.
- Elasticsearch runs one node with zero replicas at stage 1; the index template sets `number_of_replicas: 0` so a single node stays green.

## Trusted image ownership

Flux creates `wbs-solver/puni-trusted-workload` once (`kustomize.toolkit.fluxcd.io/ssa: IfNotPresent`) and the WBS release coordinator owns `data.solverImages` afterwards. Letting Flux keep reconciling the ConfigMap would revert every release's candidate and rollback digests within one interval; moving the parameter out of Git entirely would lose the fail-closed initial state on a rebuilt cluster. With create-once ownership, a missing ConfigMap still denies every trusted pod (`parameterNotFoundAction: Deny`) until Flux recreates it, and the policy's parameter check denies any non-digest entry. The coordinator's exact contract is in [platform](../../../docs/infra/platform.md#trusted-image-ownership). The policy matches only namespaces labelled `puni.dev/trusted-hostpath`, so an absent parameter cannot block other namespaces; a second policy keeps that label on `wbs-solver` and `puni-forge`.

## F9 source-run development

`tool-fleet:lab` (`k3d-lab.ts`) owns k3d labs; `--lab-id` still routes to the VM lab. `tool-devsync:dev-env` serves one worktree as one Pod in `puni-forge`, rendered from `deploy/k8s/wbs/overlays/dev` and bound to its slug, worktree, image digest and URLs. An in-Pod supervisor keeps `bin/dev.sh` running and applies `RESTART_PATHS` from `sync.ts`; the forge image and overlay are recreate inputs. [Local lab](../../../docs/infra/local.md) has the commands and measurements.

Assumptions recorded without an interview:

- Environments share the one trusted namespace `puni-forge`, because the F6 admission matches that name; each gets its own labels, database volume, Service, Ingress and NetworkPolicy instead of its own namespace.
- On a lab it owns (label `puni.dev/lab-id` on `wbs-solver/puni-trusted-workload`), `dev-env` writes the forge image digest and exact roots into the admission parameters. Elsewhere those are reviewed policy changes and `dev-env` refuses.
- The solver runtime directory `/run/puni/solver` is admitted for the forge through the same exact-root list (`forgeWorktreeRoots`) and mounted read-only; F6 has no separate forge solver parameter.
- The forge image is `deploy/dev-src/Dockerfile`, the h2puni dev image, built without BuildKit attestations so an unchanged Dockerfile keeps one digest.
- "Foreign" means another owner UID, no shared root commit with the invoking repository, or not a Git top level. The owned prefix is the lab's `--worktree-root`.
- `app` keeps k3s's bundled Traefik and metrics-server as the light ingress and telemetry; `platform` and `fleet` disable bundled Traefik and ServiceLB on both clusters and stop after the locked Flux install, leaving the platform graph to the documented rehearsal.
- URLs are `http://<slug>.localhost:<port>`; browsers and curl resolve `*.localhost` to loopback, and Vite allows those hosts by default.
- Lab state lives under `.puni/fleet-labs/k3d/<id>/`, inside the existing ignore rule, because `.gitignore` is not F9's to change.
