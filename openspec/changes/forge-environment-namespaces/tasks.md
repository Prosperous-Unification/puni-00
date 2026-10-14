## 1. Namespace boundary

- [x] 1.1 Bind separate namespaces and local permissions — tests: committed-overlay namespace assertions, namespace access authority and concurrent creation.
- [x] 1.2 Create and recover an owned namespace — tests: partial-create retry; negatives: foreign lab/slug/worktree, wrong trust, absent UID/labels and terminating namespace with guards removed.

## 2. Lifecycle integration

- [x] 2.1 Route up/status/down and discovery through owned namespaces while retaining shared Leases — tests: real command paths and namespace teardown.
- [x] 2.2 Delete only the inspected namespace, including its database — tests: two-environment teardown; negative: namespace replacement with UID precondition removed.
- [x] 2.3 Run scoped checks, OpenSpec validation and disposable cluster rehearsal; record failures and limitations in verify.md.
