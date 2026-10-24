# Platform reconciliation

Operator commands and what has been tested: [infrastructure operator guide](README.md).

Ansible installs k3s and bootstraps Flux. Flux then owns every long-lived
platform object through one ordered graph per cluster. Do not apply the platform
manifests from Ansible or by hand. Platform clusters reconcile these stages:

| Stage           | Path under `infra/platform/`          | Waits for              |
| --------------- | ------------------------------------- | ---------------------- |
| `target`        | `target` (applies nothing)            | none                   |
| `controllers`   | `networking`                          | target                 |
| `storage`       | `storage/<environment>`               | controllers            |
| `policy`        | `policy` (namespaces, admission)      | controllers            |
| `secrets`       | `secrets/<cluster-id>` (SOPS only)    | policy                 |
| `certificates`  | `certificates/platform/<environment>` | controllers, secrets   |
| `platform`      | `registry/<environment>`              | storage, secrets       |
| `observability` | `observability/<environment>`         | platform, certificates |
| `alerts`        | `alerts/<environment>`                | observability          |
| `backup`        | `backup/<environment>`                | alerts                 |

Workers clusters carry only `control-plane` and `execution` nodes, so they reconcile
`target`, cert-manager-only `controllers` (`certificates/controllers`), `storage` and `policy` (both after target), `secrets`, `certificates` (after controllers and secrets), and `telemetry`
(`telemetry/<environment>`, after storage, secrets and certificates). The telemetry agent is an
OTel DaemonSet that reads pod logs and host metrics and ships them over OTLP to the
platform cluster's authenticated canary `otel-gateway` NodePort (30419); plaintext 30417 is temporary rollback state pending the [mTLS cutover proofs](otlp-mtls.md). Workers run no
Elasticsearch, Kibana, Prometheus, ingress, registry or Velero. `tool-fleet:check`
rejects any stage whose workloads select a capability the cluster purpose's nodes
cannot carry.

Every stage reconciles through its own `<cluster-id>-kubeconfig` Secret and
decrypts with `sops-age`. A missing `sops-age` Secret fails the first stage, so no
controller or privileged workload runs. The `target` stage health-checks the
immutable ConfigMap `kube-system/puni-cluster-<cluster-id>`, which only
`platform.yml` creates on that cluster; a kubeconfig that reaches another cluster
stops there and every later stage reports its dependency as not ready.
`alerts` is separate because PrometheusRule and Probe need the CRDs that the
`observability` stage installs. `tool-fleet:check` binds this graph, every
native kustomization's resource list, every chart archive and image digest, and
every plain workload image to `infra/versions/toolchain.json`. It also derives the
Secrets each cluster's graph consumes and requires `secrets/<cluster-id>/` to list
each one as a SOPS file or declare it in `externally-provided.json` (`operator` for
production, `rehearsal` for local test values), with nothing missing or stale.

Run `infra/ansible/playbooks/platform.yml` against the bootstrap server with the
exact cluster ID, toolchain-locked Flux URL/version/checksum, immutable Git commit,
read-only deploy key, reviewed SSH host keys and SOPS age key. All three secret
files must already exist on the host with mode `0600`. The bootstrap write
credential is intentionally absent from the steady-state playbook.

The four supported cluster IDs are `platform-local`, `platform-production`,
`workers-local` and `workers-production`. Each overlay binds its own kubeconfig
Secret; the fleet check refuses cross-cluster substitution. Local clusters and
`platform-production` use the k3s local-path class (`storage/production-existing-hosts` is
`storage/local`): the adopted h4claw and h3mon kubelets run no external cloud provider, so a
`puni-retain` volume stays on its node until the hcloud storage packet (WBS 070.8) moves it.
`workers-production` keeps the hcloud storage controllers.

Ordinary `wbs` and `workers` namespaces enforce Restricted Pod Security and
default-deny networking. The `wbs-solver` and `puni-forge` namespaces admit their
narrow host-path exception through the committed admission policy. Solver pods
may mount only `/run/puni/solver` as a directory, and source pods may mount only
the roots listed in the `puni-trusted-workload` ConfigMap. Neither may request
privilege escalation, host networking, host PID, Docker sockets or an API token. Every solver container must use one of the one or two digests in
`solverImages` (the release's candidate and rollback, comma separated); the policy
matches whole entries, so a digest prefix is denied.
Apart from those exact host directories, the policy enforces the Kubernetes 1.36
[Restricted Pod Security Standard](https://v1-36.docs.kubernetes.io/docs/concepts/security/pod-security-standards/),
including pod, regular-container, init-container and ephemeral-container security
profiles plus host ports and probe or lifecycle hosts. Windows HostProcess requires
host networking, which this Linux-only trusted workload policy rejects.
The forge controller service account alone receives the namespaced pod-management
Role; ordinary authenticated users receive no trusted-namespace Role or service
account impersonation grant.

Run the committed admission probes with server-side dry-run after applying the
policy overlay. `solver-allowed.yaml`, `solver-rollback-allowed.yaml` and `forge-allowed.yaml` must succeed. Every
other YAML manifest in `infra/platform/conformance/admission/` must be denied with
its specific admission or Restricted Pod Security diagnostic:

```sh
kubectl apply -k infra/platform/policy
kubectl apply --dry-run=server -f infra/platform/conformance/admission/solver-allowed.yaml
kubectl apply --dry-run=server -f infra/platform/conformance/admission/forge-allowed.yaml
kubectl auth can-i create pods -n puni-forge --as=ordinary --as-group=system:authenticated
kubectl auth can-i impersonate serviceaccounts/dev-environment-controller -n puni-forge --as=ordinary --as-group=system:authenticated
kubectl auth can-i create pods -n puni-forge --as=system:serviceaccount:puni-forge:dev-environment-controller
```

The trusted-hostpath policy matches only namespaces labelled
`puni.dev/trusted-hostpath`; a second policy stops `wbs-solver` and `puni-forge`
from losing that label. Its binding denies when the parameter ConfigMap is absent
(`parameterNotFoundAction: Deny`), so a missing parameter blocks only trusted
pods, never `kube-system` or `flux-system`. Every `solverImages` entry must be a
digest-pinned reference; a tag entry denies every solver pod.

### Trusted image ownership

Flux creates ConfigMap `wbs-solver/puni-trusted-workload` once
(`kustomize.toolkit.fluxcd.io/ssa: IfNotPresent`) and never updates it afterwards.
The WBS release coordinator owns it from then on. Its contract:

- Write only `data.solverImages` on `puni-trusted-workload` in `wbs-solver`, as one
  or two distinct `registry/repository@sha256:<64 hex>` references separated by a
  comma with no spaces: the candidate first, then the rollback digest.
- Read the ConfigMap back and require the exact value before creating a solver pod;
  admission denies any pod whose image is not an entry, and denies every solver pod
  if an entry is not digest-pinned.
- Never delete the ConfigMap. If it is absent, admission denies every trusted pod
  until Flux recreates it from Git with the reviewed initial digests.

Changing `forgeImage` or `forgeWorktreeRoots` after creation is therefore an
explicit operation: patch the live ConfigMap in the same change that updates Git.

The ephemeral-container subresource needs an existing Pod. Create the approved
solver fixture only on a cluster where its product-capability selector is
intentionally unschedulable, require this dry-run patch to be denied, then delete
the pending Pod:

```sh
kubectl apply -f infra/platform/conformance/admission/solver-allowed.yaml
kubectl patch pod allowed-solver -n wbs-solver --subresource=ephemeralcontainers --type=merge --dry-run=server --patch-file=infra/platform/conformance/admission/solver-ephemeral-container-patch.json
kubectl delete pod allowed-solver -n wbs-solver
```

The three authorization answers must be `no`, `no`, then `yes`. For the live
network-policy probe, apply `receivers.yaml`, wait for both Deployments, then apply
`probes.yaml`. Both positive controls must complete: one proves the telemetry
allowance and one proves the denied destination is reachable. The worker probe
must fail specifically with `BackoffLimitExceeded`:

```sh
kubectl apply -f infra/platform/conformance/network/receivers.yaml
kubectl wait --for=condition=Available deployment/allowed-receiver -n observability --timeout=2m
kubectl wait --for=condition=Available deployment/denied-receiver -n wbs --timeout=2m
kubectl apply -f infra/platform/conformance/network/probes.yaml
kubectl wait --for=condition=Complete job/allowed-egress -n workers --timeout=2m
kubectl wait --for=condition=Complete job/receiver-control -n network-control --timeout=2m
kubectl wait --for=condition=Failed job/denied-egress -n workers --timeout=2m
test "$(kubectl get job denied-egress -n workers -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}')" = BackoffLimitExceeded
```

## Application sources

The platform graph above reads only `GitRepository flux-system/puni-platform`. Application
manifests come from a second source, the private fleet repository `puni-fleet`, which carries
its own Flux Kustomizations (`fleet-helsinki`, then one per application) and depends on the
platform's `policy` and `controllers` stages. Tenant namespaces such as `website-dev` stay in
`infra/platform/policy`, so the fleet repository adds workloads and allow rules only;
`tool-fleet:check` refuses a tenant namespace without Pod Security `restricted` enforced and a
`default-deny` NetworkPolicy.

The fleet source authenticates with its own read-only deploy key, never with a person's
credentials and never with a key that reads the product source. `platform.yml` does not create
it yet; on the server, with the key and its `known_hosts` as root-owned mode-0600 files, the
operator creates `flux-system/puni-fleet-auth` exactly as `platform.yml` creates
`puni-platform-auth`:

```sh
sudo k3s kubectl create secret generic puni-fleet-auth --namespace=flux-system \
  --from-file=identity="$FLEET_READ_KEY" --from-file=known_hosts="$FLEET_KNOWN_HOSTS" \
  --dry-run=client --output=yaml | sudo k3s kubectl apply -f -
```

`GitRepository flux-system/puni-fleet` then reads branch `main` of the fleet repository over SSH
with `secretRef: puni-fleet-auth`, and `Kustomization fleet-helsinki` applies its
`./clusters/helsinki` with prune and wait. The fleet Kustomizations decrypt with the same
`sops-age` Secret and bind the same `<cluster-id>-kubeconfig` as the platform stages, so one
escrowed age key covers both repositories. The repository URL is an operator input and is not
committed here; working copies of the fleet repository live in a nested checkout
(`bun run private:checkout puni-fleet`, [ADR 0036](../adr/0036-private-companions-are-nested-ignored-clones.md)).

## Secrets

Git carries platform credentials only as SOPS files under
`infra/platform/secrets/<cluster-id>/`, each listed in that directory's
kustomization and encrypted with `--encrypted-regex '^(data|stringData)$'` to the
cluster's age recipient. The check rejects a Secret anywhere else, a plaintext
value, and a non-`*.sops.yaml` resource. The committed directories are empty:
dependents that need a credential stay unready until the operator adds it. The
root `.sops.yaml` only covers `tools/tool-secrets`, so pass the recipient and
bypass it explicitly:

```sh
sops --config /dev/null --encrypt --age "$CLUSTER_AGE_RECIPIENT" \
  --encrypted-regex '^(data|stringData)$' --input-type yaml --output-type yaml \
  registry-auth.yaml > infra/platform/secrets/platform-production/registry-auth.sops.yaml
```

| Secret                           | Namespace       | Keys                                                                 |
| -------------------------------- | --------------- | -------------------------------------------------------------------- |
| `registry-auth`                  | `puni-registry` | `htpasswd` (bcrypt)                                                  |
| `registry-ca` (production)       | `puni-registry` | `tls.crt`, `tls.key` of the private registry CA                      |
| `alertmanager-puni`              | `observability` | `alertmanager.yaml`, including the real receiver and dead-man URL    |
| `elastic-s3-credentials`         | `observability` | `s3.client.default.access_key`, `s3.client.default.secret_key`       |
| `sqlite-backup-s3` (WBS release) | `wbs-solver`    | `endpoint`, `bucket`, `region`, `access-key-id`, `secret-access-key` |
| `velero-credentials`             | `puni-backup`   | `cloud` (AWS credentials file)                                       |
| `velero-repo-credentials`        | `puni-backup`   | `repository-password` (Kopia repository encryption)                  |
| `object-store-root` (local only) | `puni-backup`   | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                             |

A local rehearsal generates a disposable age identity, encrypts test values for
these Secrets and serves them as one extra commit on top of the reviewed SHA;
no age private key is committed.

## Registry

`registry/base` serves Distribution 2.8.3 over TLS with htpasswd authentication
and a separate plain-HTTP debug port (5001) for health probes. NetworkPolicy
`registry-ingress` admits 5000 from anywhere and 5001 only from the
`observability` namespace and the kubelet on the node. `registry/local`
issues a disposable CA and certificate through cert-manager.
`registry/production` issues `registry.puni.internal` from the escrowed
`registry-ca` Secret, so a rebuild keeps the chain that nodes and Dagger trust.
The standalone `infra/ansible/playbooks/registry.yml` configures the private
endpoint and per-node containerd trust without reprovisioning k3s. Its inputs,
Flux ownership, recovery custody and rollback are in [registry operation](registry.md).
The existing product registries remain authoritative until a separately verified migration.

Migrate by copying each image by tag without re-encoding it; the copier
verifies every blob digest and requires the target to report the source
manifest digest:

```sh
TARGET_USERNAME=puni-push TARGET_PASSWORD=... TARGET_CA_FILE=registry-ca.crt \
  bun tools/tool-fleet/src/platform-registry.ts copy \
  https://<existing-registry> https://registry.puni.internal:5000 wbs/be-01:<tag> ...
```

Garbage collection runs offline. Suspend Flux `platform`, set
`REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled": true}` and wait for the
rollout, confirm pushes return 405, then run
`registry garbage-collect /etc/docker/registry/config.yml` in the pod.
`flux resume kustomization platform` restores write mode and restarts the pod;
pull a kept image by digest before declaring success. Request manifests with
both the OCI and Docker v2 media types: a Docker-only `Accept` returns 404 for
OCI manifests.

## Certificates and DNS

Traefik is a host-network DaemonSet on `capability-ingress` nodes listening on ports 80 and 443
(the chart's own defaults are 8000 and 8443) behind a `ClusterIP` Service, since ServiceLB is
disabled. It runs as UID 65532, so the base role sets `net.ipv4.ip_unprivileged_port_start = 0`
on ingress nodes only; elsewhere the kernel default 1024 stays. Port 80 only redirects to HTTPS
permanently: Traefik answers 301 to `GET` and 308 to other methods. `tool-fleet:check` binds the
values, the rendered chart and the per-host sysctl; `bunx nx run tool-fleet:rehearse:traefik`
(add `-- --import-images` where containers have no route out) proves the bind refusal at 1024,
Readiness at 0 and the redirect on k3d. The Ansible role on a real kernel is proven only by the
QEMU lab.

Production has only the `letsencrypt-staging` ClusterIssuer, restricted to
`wbs.bulletpoints.club` and `wbs-staging.bulletpoints.club`. Add a production
issuer only after staging issuance succeeds for both names. Local clusters use
self-signed issuers and port-forwards only. Kibana, Prometheus and Alertmanager
have no Ingress; reach them over the private network or `kubectl port-forward`.

DNS for both domains stays manual at GoDaddy. Prepare every change as a
reviewed plan with the exact rollback and wait:

```sh
bun tools/tool-fleet/src/platform-dns.ts plan bulletpoints.club current.json desired.json
```

Lower the TTL of each changed record first, wait `propagationWaitSeconds`,
apply `changes` by hand, verify, and apply `rollback` if verification fails.

## Observability

ECK runs one Elasticsearch node (1 GiB heap locally, 2 GiB in production) and
Kibana; kube-prometheus-stack runs Prometheus (15 d, 8 GB), Alertmanager,
kube-state-metrics and node-exporter on port 9101, because Traefik's
host-network metrics entry point owns 9100 on ingress nodes. The OTel
collector DaemonSet reads `/var/log/pods` with checkpoints and a persistent
sending queue under `/var/lib/puni-otelcol` and no host ports. It runs as UID 0
with only `DAC_READ_SEARCH`, because k3s writes pod logs as `root:root 0640` and
a non-root UID receives no effective capabilities. NetworkPolicy `otlp-ingress`
admits OTLP from pods in the cluster and, through `otel-gateway`, from the private
network only (`10.1.0.0/16` in production). The collector also receives workers'
host metrics and remote-writes them to Prometheus. It redacts credential shapes in the
log body, and writes the `logs-puni.otel-<environment>` data stream. Its
`logs-otel@custom` component template applies ILM `puni-logs` (rollover 1 d or
10 GB, delete after 30 d), zero replicas and a 500-field mapping limit that
stores extra dynamic attributes unindexed. Alert routes and recipients come from
the `alertmanager-puni` Secret; `Watchdog` is the dead-man signal.
Store-specific backups and restores are in [recovery](recovery.md).

### Failure reports

A WBS service logs a failure as one pino JSON line whose `err` is the redacted,
bounded diagnostic report from `@shared/failures` (`LogRecord` in
`libs/wbs/adapters/observability/src/log-schema.ts`). The collector's filelog
operators parse a body that starts with `{` (`json_parser`, `on_error: send`, so
a body that does not parse ships as text) and lift a closed set of fields into
attributes; the body keeps the whole line. JSON whose `service` is not a WBS
service lifts nothing, and each field is lifted only when its value has the
declared shape, so a malformed value stays in the body and is never defaulted.

| Pino field          | Attribute               | Mapping           | Lifted when                                     |
| ------------------- | ----------------------- | ----------------- | ----------------------------------------------- |
| `service`           | `service`               | `keyword`         | `be-01`, `gw-01`, `fe-01` or `mcp-01`           |
| `level`             | `level`                 | `keyword`         | a level label (`trace` … `fatal`), not a number |
| `msg`               | `msg`                   | `match_only_text` | a string; credential shapes are redacted        |
| `time`              | `time`                  | `date` (ms)       | a number                                        |
| `err.occurrence_id` | `failure.occurrence_id` | `keyword`         | `[A-Za-z0-9_.:-]{1,128}`                        |
| `err.fingerprint`   | `failure.fingerprint`   | `keyword`         | `[A-Za-z0-9_.:-]{1,128}`                        |
| `err.v`             | `failure.v`             | `keyword`         | `corj/` and up to 32 version characters         |

`elastic/settings/failure-fields.json` maps these explicitly in
`logs-otel@custom`, so they stay indexed under the field limit. Like any
template change, the mapping applies from the data stream's next backing index:
the daily rollover, or at once with
`POST logs-puni.otel-<environment>/_rollover`. A test in
`wbs-observability` (`failure-mapping.test.ts`) fails when a lifted field is
missing from the mapping, is not declared by `LogRecord`, or when the
collector's service and level lists drift from the schema. Nothing beyond the
already redacted report is lifted; `fingerprint` is a hash of the failure's
kind and place, and the lines share the `puni-logs` 30-day retention.

The `kibana-objects` Job (`kibana/objects`) imports a data view over
`logs-puni.otel-*`, the Lens panels "Failures by fingerprint" and "Latest
occurrence per fingerprint", and the dashboard **Failures**, which opens on the
last 7 days. It waits for Kibana to report `available` (60 checks, 10 s apart),
imports with `overwrite=true`, and fails unless Kibana's verdict is
`success: true`. Its objects and script, like `failure-fields.json`, are
generated ConfigMaps whose names carry a content hash, so a change recreates the
Job (`force: enabled`). Fingerprint alerting is not part of this; the k3d proof
is in [the change's verify record](../../openspec/changes/log-failure-records/verify.md).

### Log loss

Two critical alerts, routed by the `alertmanager-puni` Secret like every
platform alert, cover log records the collector cannot deliver:

- `PuniLogRecordsDropped` fires when a collector pod's
  `otelcol_exporter_send_failed_log_records` for the `elasticsearch` exporter
  grew in the last 5 minutes, or appeared after an hour with no sample (the
  collector creates the counter at its first drop). Records, failure reports
  included, were dropped for good. It resolves once 5 minutes pass without a
  new drop, so the firing notification is the record of the loss. A counter
  that comes back after more than an hour without samples (a scrape outage that
  long) fires it once without a new drop.
- `PuniLogQueueFull` fires when the pod's persistent queue has been at its
  5000-request capacity for a minute. The queue blocks (`block_on_overflow`,
  stated in `collector.yaml`): the filelog receiver stops reading and resumes
  from its checkpoint, so nothing is dropped yet. Lines are lost only if the
  kubelet rotates a pod's log file away before the collector reads it, and no
  counter records that. `PuniLogBacklog` warns earlier, at 20 waiting requests.

What loses records, with the pinned collector-contrib 0.160.0:

- **A hung connection.** A bulk request whose connection to Elasticsearch
  hangs is abandoned when the exporter's 90 s request timeout expires, and a
  new connection's dial gives up sooner (`dial tcp …: i/o timeout`). The
  exporter does not retry either (`RetryOnError` refuses
  `context.DeadlineExceeded`) and has no `retry_on_failure`, so the persistent
  queue drops that batch and counts it in `send_failed`. Three 60 s black holes
  on k3d lost 51, 147 and 219 of 900 lines; a longer black hole loses more.
- **A long refusal.** A refused connection is retried, and the queue holds the
  backlog until it fills. Then intake stops, and only log rotation loses lines.

When `PuniLogRecordsDropped` fires:

1. Find the window: the collector logs `Exporting failed. Dropping data.` with
   `dropped_items` and the error (`i/o timeout` or `context deadline exceeded`).
2. Check Elasticsearch health and the path to it (`elasticsearch-es-http`,
   NetworkPolicy, node).
3. The dropped lines are still in the pods' `/var/log/pods` files until the
   kubelet rotates them. Read them there for the window if a failure report is
   needed; the collector's checkpoint has moved past them and will not resend.

When `PuniLogQueueFull` fires, restore Elasticsearch before the busiest pod's
log rotates; the backlog then drains without loss.

A test in `tool-fleet` (`platform-alerts.test.ts`) fails when a rule names a
collector metric missing from `conformance/alerts/collector-metrics.json`, the
exposition captured from the pinned image, or when the pinned image changes
without a new capture.

Follow-up: the loss ends when a collector-contrib release retries timed-out
bulk requests. The source audit now extends through v0.163.0 (released
2026-10-14, checked 2026-10-16): `esclient.go` still refuses
`context.DeadlineExceeded` and `factory.go` registers no `WithRetry`
([primary-source audit](../../openspec/changes/log-failure-records/verify.md#upstream-audit-2026-10-16)). Before
bumping the pinned image, rerun the 60 s hung-connection drill from the
[log-failure-records verify record](../../openspec/changes/log-failure-records/verify.md),
recapture the exposition, and keep the old version unless the drill shows zero
loss and every k3d negative still passes.

Cross-cluster OTLP certificate ownership, renewal and staged cutover: [mTLS runbook](otlp-mtls.md).
