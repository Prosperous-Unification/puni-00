# Read-only observability inventory and admission

Both the environment-parity and production-observability packets use
`tools/tool-fleet/src/observability-preflight.ts`. The exported
`ObservabilityPreflightRequest` is the closed request contract; the
`ObservabilityPreflightReceipt` is the safe evidence contract.

[Chart-role projections](observability-projections.md) provide independently validated
source ownership candidates; their declared placement names do not replace this inventory.

Run the uncached entrypoint with an operator-reviewed JSON request and the existing
owner-only pinned SSH transport:

```sh
bunx nx run tool-fleet:observability-preflight -- --request /operator/request.json --output /operator/new-receipt.json --ssh-transport /operator/transport.json
```

The operator supplies actual authorized target and Flux-controller context names. An
already-established API forward may be represented by that context; this command neither
obtains credentials nor infers API access from SSH. The request explicitly maps fleet id
`platform` to expected target marker `platform-production`. The candidate SHA binds the
reviewed request and selected artifact hashes. Target authority is the immutable ConfigMap
`kube-system/puni-cluster-${targetMarker}`, with exact name, namespace, value and reviewed
UID; declarative Flux configuration cannot substitute for it. Actual Flux source/applied revisions remain
separate observations, including when the candidate has never been deployed.

Use `phase: inventory` for first discovery: exact UID/owner pins and the candidate array
may be empty; `identityUID`, rollback fields and storage path may be empty strings. A
complete first inventory is always blocked for migration until its facts are reviewed.
Secret requests name only the specific resources and required keys to project. No Secret
values, kubeconfig contents, private keys, complete Docker inspect documents or raw
subprocess diagnostics enter receipts. Missing contexts, denied reads and malformed
projections refuse rather than becoming empty successful inventories.

Use `phase: cutover` to assess reviewed resource/immediate-controller UID pins, source paths,
the complete actual owning Kustomization/HelmRelease graph, recursive
`dependsOn` edges of the actual Flux kind (Kustomization or HelmRelease), and Ready
prerequisites at independently reviewed nonempty applied
revisions. Git source references bind kind, namespace and name; a shared prerequisite may
remain at its reviewed earlier revision. Helm chart sources bind
`spec.chart.spec.sourceRef`; Kustomizations bind `spec.sourceRef`. This adapter supports the
reviewed GitRepository identity used by native Fleet charts; absent/foreign chart sources
refuse. Actual controller UID cycles and recursive dependency cycles refuse; the root
Kustomization's label self-reference is the sole ownership self-reference exception. Helm applied chart evidence comes from the latest
successfully deployed history entry, never an attempted revision. The assessment also requires retained PV/PVC and Docker volume identities, required Secret keys and a fresh
owner-only rollback receipt pinned by operation id and SHA256. The safe Docker projection
also records image IDs, Compose project ownership and provisioning mount paths.

The bounded capacity adapter supports one explicitly selected node with retained Docker
coexistence and `rancher.io/local-path` storage. Selected hashed rendered Deployments or
StatefulSets must declare their exact kind, namespace, node, replicas and bounded resource
quantities. Source node selectors or supported required node affinity must match the observed
node labels; migration readiness also requires owned Ready pods actually scheduled there.
`nodeName` is refused for claims using `WaitForFirstConsumer`, because it bypasses binding
through the scheduler ([Kubernetes storage-class contract](https://kubernetes.io/docs/concepts/storage/storage-classes/#volume-binding-mode)). Kubernetes CPU requests, including init/overhead, are compared with allocatable;
finite limits remain evidence without prohibiting CPU overcommit. Retained/running Docker
CPU bounds are added outside Kubernetes scheduling. Memory uses observed current and candidate request/limit peaks, including bounded memory-backed scratch.
Bounded disk scratch and container ephemeral-storage limits are assessed without charging
the same shared scratch bytes twice. A writable root without a finite ephemeral limit and
an emptyDir without a size limit are concrete source blockers. Existing pods are deduplicated only through
exact reviewed controller UIDs, including ReplicaSet and ECK owner chains. Each candidate's
`replicaUIDs` must pin the complete active owned pod set. Cost normalization covers active pods on the explicitly
admitted nodes; unrelated other-node unbounded/unsupported pods remain safe inventory facts.
Candidate-owned off-node replicas remain placement/template blockers. Unknown demand on
an admitted node still refuses. Source and current pods share one
normalized named container/init/resource/overhead/volume-mount model. Application container
order is irrelevant; init order and StatefulSet ordinal/claim identity are preserved. Matching
existing replicas contribute current cost once. Missing, old-template, wrongly placed or
terminating replicas cannot satisfy candidate slots; their current cost remains and required
replacement demand is added. Partial or unreviewed sets can produce planning facts, never
migration readiness.

Storage observes statvfs free bytes/device identity on the reviewed path and retained Docker
volumes, validates retained PVC/PV capacity, node and local-path bindings, then charges only
new artifact-derived PVC and bounded ephemeral demand plus explicit headroom. New PVC
prerequisites must also be observed Bound under reviewed claim/PV UID pins. Existing used bytes are already
reflected in free space. Storage exemption is per exact reviewed Bound claim/PV UID,
requested size, capacity, Retain policy and filesystem/node binding, independent of replica
pins. Every source claim must be mounted by a named container; observed mount identity
must match the selected source. An omitted or mismatched claim remains new demand and a
readiness blocker. Unknown paths, unsupported workload/storage shapes, hostPath mounts, unbounded emptyDir
capacity, unbounded Docker CPU/memory and deficits refuse. A second selected instance needs
its own artifacts, namespace and costs; future numeric allowances are planning evidence.

The supported PodSpec subset requires finite CPU/memory requests and limits on every named
application and non-restartable init container. CPU/memory overhead is modeled on both source
and observed pods. RuntimeClass, pod-level resources, DRA resource claims, ephemeral containers,
restartable init containers, device mounts/resize semantics, extended resource quantities,
generic ephemeral PVCs, CSI, hostPath and unknown volume kinds are refused. The adapter does
not infer their costs or rewrite source manifests. Bounded emptyDir and local-path PVCs are
supported; ordinary ConfigMap/Secret reference volumes and projected Secret/ConfigMap,
fieldRef downwardAPI and serviceAccountToken reference metadata have zero separate storage
allowance. Projected resourceFieldRef and standalone downwardAPI volumes are refused. No
Secret or token contents are read. Safe projections preserve supported demand metadata and
mark unsupported provider shapes so they cannot silently become zero cost.

The sole admission-added normalization is a `kube-api-access-[a-z0-9]+` projected volume with
mode 0644, exactly the standard token (path `token`, no audience, explicit expiration at most
86400 seconds), `kube-root-ca.crt`/`ca.crt` and `metadata.namespace`/`namespace` sources. Every
app/init container must have exactly one read-only mount at
`/var/run/secrets/kubernetes.io/serviceaccount`, with no subpath. Each CA/namespace file must also have effective mode 0644: its explicit per-item mode
overrides the volume default. Projected Secret/ConfigMap key paths and downwardAPI metadata
preserve per-item modes, including explicit zero; normalization compares effective modes
using absence checks. Only that constrained
volume and mount are removed before comparison. Service account name and automount policy
remain part of the source/observed identity. Altered sources, extra/different mounts and a
different account stay mismatches. Other admitted mutations must fit the explicit model or
block; this preflight does not certify arbitrary API-admitted pod shapes.

Receipts are exclusively created with mode 0600. Source observations and the aggregate
inventory must remain within the requested freshness window, at most 60 seconds. A complete
inventory and admitted capacity do not authorize route promotion: absent/unready selected
services remain blockers, and stored-signal/history/runtime acceptance belongs to the later
rehearsal and cutover tasks. No concrete live dev operation can be prepared from fixture evidence.
