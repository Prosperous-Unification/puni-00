## 1. Namespace boundary

- [x] 1.1 Bind separate namespaces and local permissions — tests: committed-overlay namespace assertions, namespace access authority and concurrent creation.
- [x] 1.2 Create and recover an owned namespace — tests: partial-create retry; negatives: foreign lab/slug/worktree, wrong trust, absent UID/labels and terminating namespace with guards removed.

## 2. Lifecycle integration

- [x] 2.1 Route up/status/down and discovery through owned namespaces while retaining shared Leases — tests: real command paths and namespace teardown.
- [x] 2.2 Delete only the inspected namespace, including its database — tests: two-environment teardown; negative: namespace replacement with UID precondition removed.
- [x] 2.3 Run scoped checks, OpenSpec validation and disposable cluster rehearsal; record failures and limitations in verify.md.

## 3. Review repair

- [x] 3.1 Refuse legacy workload resources independently of Pod presence before up/status/down — production command tests: twelve no-Pod PVC/Service/Ingress/NetworkPolicy refusals preserve resources, admission and Leases; negative: remove the resource-presence guard and watch all twelve fail.
- [x] 3.2 Reject malformed legacy lists and retain empty-list status/down behavior — production command tests: malformed-list refusal plus two empty-list positives; negative: remove the shape guard and observe ownership release.
