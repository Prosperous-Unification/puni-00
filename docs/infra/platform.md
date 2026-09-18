# Platform reconciliation

Operator commands and what has been tested: [infrastructure operator guide](README.md).

Ansible installs k3s and bootstraps Flux. Flux then owns every long-lived
platform object through one ordered graph per cluster. Do not apply the platform
manifests from Ansible or by hand. Platform clusters reconcile these stages:

| Stage           | Path under `infra/platform/`       | Waits for        |
| --------------- | ---------------------------------- | ---------------- |
| `target`        | `target` (applies nothing)         | none             |
| `controllers`   | `networking`                       | target           |
| `storage`       | `storage/<environment>`            | controllers      |
| `policy`        | `policy` (namespaces, admission)   | controllers      |
| `secrets`       | `secrets/<cluster-id>` (SOPS only) | policy           |
| `platform`      | `registry/<environment>`           | storage, secrets |
| `observability` | `observability/<environment>`      | platform         |
| `alerts`        | `alerts/<environment>`             | observability    |
| `backup`        | `backup/<environment>`             | alerts           |

Workers clusters carry only `control-plane` and `execution` nodes, so they reconcile
`target`, `storage` and `policy` (both after target), `secrets`, and `telemetry`
(`telemetry/<environment>`, after storage and secrets). The telemetry agent is an
OTel DaemonSet that reads pod logs and host metrics and ships them over OTLP to the
platform cluster's `otel-gateway` NodePort (30417); workers run no
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
Secret; the fleet check refuses cross-cluster substitution. Production uses the
hcloud storage controllers, while local clusters use the k3s local-path class.

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
Node containerd trust (`/etc/rancher/k3s/registries.yaml` with that CA and
credential) and the private-network endpoint are not yet configured by any
role; until they are, the existing external registry stays authoritative.

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
