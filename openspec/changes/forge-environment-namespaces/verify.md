## Scope and tools

Base: public main `abb051cb5`; isolated checkout `/tmp/puni-forge-namespaces`. Host: `pop-os`, Bun 1.4.2. Frozen installation completed with `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-forge-bun-cache bun install --frozen-lockfile`: 1573 installs across 1447 packages, no lockfile change. The initial shared dependency symlink lacked `@noble/hashes`; it was replaced with this checkout's locked installation.

Pinned tools came from `infra/versions/toolchain.json`: k3d v5.9.0 and kubectl v1.36.4; both downloaded bytes matched the locked SHA256. Disposable cluster `puni-forge-lifecycle` used the locked `rancher/k3s:v1.36.4-k3s1@sha256:edad48e12bf81c3a09ac1c05c0c0ffaaa22145980b989d6fae84543a76b83657`, an explicit loopback API port and dedicated kubeconfig/context. The user's current context was not changed. No production cluster or production secret was used.

## Focused tests and checks

- `bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/k3s/dev-environment.test.ts tools/tool-devsync/src/k3s/forge-namespace.test.ts`: 47 pass, 0 fail, 114 assertions. Namespace binding initially failed against the old shared namespace; the new lifecycle tests failed against unimplemented functions before implementation.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --projects=tool-devsync -t test lint typecheck build`: lint, typecheck, build and six prerequisite builds passed. Initial test run: 527 pass, 59 fail because sandboxed loopback listeners returned EPERM; rerun outside that socket restriction is recorded below.
- `bunx @fission-ai/openspec@1.12.0 validate forge-environment-namespaces --json`: 1 passed, 0 failed.

## Disposable live rehearsal

The driver used the production namespace functions, `bindEnvironment`, admission store and uniqueness Lease builders. Concurrent alpha/beta Pods ran the locked busybox network-probe digest with namespace-local ServiceAccounts, RoleBindings, bound hostPaths, Services, Ingresses, NetworkPolicies and Bound database PVCs. Each shared-controller Pod-create permission returned yes; ordinary identity and namespace-local workload identity returned no. Repeating namespace creation preserved its UID. Removing a local RoleBinding changed controller permission to no; restoring it returned yes.

Alpha's self HTTP control served; alpha to beta was refused by NetworkPolicy. Removing beta's policy made the same request return beta's HTTP body, and restoring it refused again. A kube-system Pod with the ingress identity reached beta. The first probe expected a timeout only; k3s actually returned connection refused. The assertion was corrected to accept that modeled refusal, with policy-removal and permitted-ingress positives proving the cause.

Actual `runDevEnvironment` status and down commands used a lab-owned marker and admission ConfigMap. Status found beta in its namespace. Preexisting unowned reserved namespace adoption, status and down all refused, leaving it present. Kubernetes rejected namespace deletion after its inspected UID had been replaced. Alpha down removed its namespace and database PVC, admission root and two shared Leases while beta's running Pod, Bound PVC, root and Leases remained. Repeated alpha down and absent status succeeded; beta down retained the shared controller.

Evidence: [live output](evidence/lifecycle-live.txt). The synthetic busybox workload deliberately reported RECREATE REQUIRED because its supplied fingerprint differed from current source inputs.

## Failure proofs

Each mutation was restored before the next run. All ten mutated runs exited 1 because their named assertions failed; adjacent production Proof comments name the faults.

| Check                        | Injected fault                              | Observed negative                                                                                                            |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Workload namespace binding   | Removed bound metadata namespace assignment | Committed-overlay namespace assertion failed ([output](evidence/namespace-binding.txt))                                      |
| Namespace trusted shape      | Bypassed the namespace schema               | Wrong trust and missing UID adoption negatives failed ([output](evidence/schema-validation.txt))                             |
| Lab ownership                | Removed lab comparison                      | Foreign lab adoption negative failed ([output](evidence/lab-ownership.txt))                                                  |
| Slug ownership               | Removed slug comparison                     | Foreign slug adoption negative failed ([output](evidence/slug-ownership.txt))                                                |
| Worktree ownership           | Removed worktree comparison                 | Partial-create recovery accepted another worktree and its negative failed ([output](evidence/worktree-ownership.txt))        |
| Deletion pending             | Removed terminating-state guard             | Terminating namespace adoption negative failed ([output](evidence/termination.txt))                                          |
| Namespace replacement        | Removed UID deletion precondition           | Replacement was deleted and its negative failed ([output](evidence/uid-precondition.txt)); live API also refused a stale UID |
| Legacy environment migration | Removed legacy shared-namespace refusal     | Duplicate legacy environment negative failed ([output](evidence/legacy-refusal.txt))                                         |
| Network isolation            | Deleted beta's NetworkPolicy live           | The previously denied request returned beta; restored policy refused                                                         |
| Scoped controller permission | Deleted environment RoleBinding live        | Shared-controller positive changed from yes to no; restored binding returned yes                                             |

## Limits

The full source-image `dev-env up`, application database writes, browser/HMR and watcher/restart acceptance were not rerun; this rehearsal uses the locked network-probe image to isolate namespace behavior. Full repository Nx tests/lint/typecheck/build and the h2puni host gate were not run on this local host; project-scoped targets were used. Existing shared-namespace environments require prior-revision down before upgrading; there is no database transfer. The final formatting, project-test rerun, OpenSpec-all and cleanup outputs follow below.

## Final scoped outputs

- `bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/k3s/*.test.ts`: 63 pass, 0 fail, 143 assertions across five files. An earlier bare directory filter also selected generated `dist/out-tsc` tests and produced two alias-resolution errors; the explicit source-file glob passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all`: exit 0 with no output.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 193 passed, 0 failed (175 changes, 18 specs).
- `k3d cluster delete puni-forge-lifecycle`: exit 0, confirmed deleted; matching Docker containers, networks and volumes all listed zero entries. The ignored task kubeconfig and lab fixture were removed.

The escalated whole `tool-devsync:test` run finished in 584.86 seconds: 587 pass, 1 fail. Its only failure was the production index check rejecting then-untracked new change/source paths; the new files were staged afterwards and the complete index-test file was rerun. No other project test failed.

The complete `repo-namespacing-handoff.test.ts` rerun after staging passed: 15 tests, 0 failures, 20 assertions. Namespace and index suites, the nine scoped Nx lint/typecheck/build tasks, staged-tree formatting and all OpenSpec items were green before the normal commit. Lefthook was installed normally in this clone; no hook bypass was used.
