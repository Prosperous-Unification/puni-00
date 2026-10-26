# Read-only observability inventory and admission

Both the environment-parity and production-observability packets use
`tools/tool-fleet/src/observability-preflight.ts`. The exported
`ObservabilityPreflightRequest` is the closed request contract; the
`ObservabilityPreflightReceipt` is the safe evidence contract.

Run the uncached entrypoint with an operator-reviewed JSON request and the existing
owner-only pinned SSH transport:

```sh
bunx nx run tool-fleet:observability-preflight -- --request /operator/request.json --output /operator/new-receipt.json --ssh-transport /operator/transport.json
```

The operator supplies actual authorized target and Flux-controller context names. An
already-established API forward may be represented by that context; this command neither
obtains credentials nor infers API access from SSH. The request explicitly maps fleet id
`platform` to expected target marker `platform-production`. The candidate SHA binds the
reviewed request and selected artifact hashes. Actual Flux source/applied revisions remain
separate observations, including when the candidate has never been deployed.

Use `phase: inventory` for first discovery: exact UID/owner pins and the candidate array
may be empty; `identityUID`, rollback fields and storage path may be empty strings. A
complete first inventory is always blocked for migration until its facts are reviewed.
Secret requests name only the specific resources and required keys to project. No Secret
values, kubeconfig contents, private keys, complete Docker inspect documents or raw
subprocess diagnostics enter receipts. Missing contexts, denied reads and malformed
projections refuse rather than becoming empty successful inventories.

Use `phase: cutover` to assess reviewed resource/immediate-controller UID pins, source paths,
actual Flux sourceRef/dependsOn edges and Ready dependencies at declared
revisions, retained PV/PVC and Docker volume identities, required Secret keys and a fresh
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
exact reviewed controller UIDs, including ReplicaSet and ECK owner chains.

Storage observes statvfs free bytes/device identity on the reviewed path and retained Docker
volumes, validates retained PVC/PV capacity, node and local-path bindings, then charges only
new artifact-derived PVC and bounded ephemeral demand plus explicit headroom. New PVC
prerequisites must also be observed Bound under reviewed claim/PV UID pins. Existing used bytes are already
reflected in free space. Unknown paths, unsupported workload/storage shapes, hostPath mounts, unbounded emptyDir
capacity, unbounded Docker CPU/memory and deficits refuse. A second selected instance needs
its own artifacts, namespace and costs; future numeric allowances are planning evidence.

Receipts are exclusively created with mode 0600. Source observations and the aggregate
inventory must remain within the requested freshness window, at most 60 seconds. A complete
inventory and admitted capacity do not authorize route promotion: absent/unready selected
services remain blockers, and stored-signal/history/runtime acceptance belongs to the later
rehearsal and cutover tasks. No concrete live dev operation can be prepared from fixture evidence.
