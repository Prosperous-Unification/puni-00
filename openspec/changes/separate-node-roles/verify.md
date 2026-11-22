# Node roles verification

## Status

Slices 1.1, 1.2, 1.8 and 1.9 and the first revision of slice 1.3 landed on 2026-11-22, in source
and tests only, from `origin/main` `7a0279c7d`: no host, cluster or provider resource was
touched, and no playbook ran against a server. Their proofs are under
[Failure proofs](#failure-proofs) and their commands under
[Slices 1.1 to 1.9: commands](#slices-11-to-19-commands-2026-11-22). Everything else below was
read or run while writing the plan, on 2026-11-21 and 2026-11-22, in a worktree at
`origin/main` `b17861f83`.

## k3s behaviour

Read on 2026-11-21 for k3s v1.36.4+k3s1, the locked version.

| Relied on                                                                                            | Where it was read                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CoreDNS, the volume provisioner and the metrics server tolerate the key `CriticalAddonsOnly`         | `manifests/coredns.yaml`, `local-storage.yaml`, `metrics-server/metrics-server-deployment.yaml` at the tag |
| The same three tolerate nothing else but the control-plane taint                                     | the same files; `kubectl get deploy -n kube-system` on the live cluster                                    |
| k3s names `CriticalAddonsOnly` for a dedicated control plane                                         | k3s documentation, `datastore/ha.md` (its example uses the `NoExecute` effect)                             |
| Packaged manifests are applied again on start and when the file changes                              | k3s documentation, `installation/packaged-components.md`                                                   |
| A patched toleration does not last: the live CoreDNS lacks the enrollment toleration once patched in | the live Deployment, against `validate-enrollment.yml:79-83`                                               |
| `node-taint` is applied only when the node registers                                                 | k3s documentation, `cli/agent.md`                                                                          |
| The only DaemonSet on the live cluster is Traefik; Flannel and kube-proxy are not pods               | `kubectl get ds -A`                                                                                        |
| The enrollment probes are bound by `nodeName` and so are not held back by a `NoSchedule` taint       | `validate-enrollment.yml:108-114,152-158`                                                                  |
| Every server registers with the enrollment taint as well                                             | `roles/k3s_server/templates/config.yaml.j2:24-25`                                                          |
| The CoreDNS step is a strategic patch of `tolerations`, a list with no merge key                     | `validate-enrollment.yml:73-83`                                                                            |

Not run: a one-node cluster registered with both taints. Slices 1.2 and 2.7 own it.

## Argo CD behaviour

Read on 2026-11-21 from the documentation at the `stable` ref and from source at tag `v3.6.2`
(`VERSION` reads 3.6.2; the newest chart release is `argo-cd-10.18.2`).

| Relied on                                                                                                                                                                   | Where it was read                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Prune=false` and `Delete=false` are per-resource sync options; Helm's `helm.sh/resource-policy: keep` is treated as `Delete=false` only                                    | `docs/user-guide/sync-options.md`, `docs/user-guide/helm.md` at tag `v3.6.2`             |
| Charts are rendered with `helm template`; Argo CD owns the lifecycle                                                                                                        | `docs/user-guide/helm.md`                                                                |
| Helm hooks map to sync hooks; test hooks are skipped; delete policies differ                                                                                                | `docs/user-guide/helm.md`, "Helm Hooks"                                                  |
| A chart that generates random data renders differently each time                                                                                                            | `docs/user-guide/helm.md`, "Random Data"                                                 |
| `helm dependency build` runs only after a missing-dependency error                                                                                                          | `reposerver/repository/repository.go`, `util/helm/helm.go`                               |
| Symbolic links are refused only when they leave the repository root                                                                                                         | `reposerver/repository/repository.go`                                                    |
| Waves order resources; a wave proceeds when its resources are healthy                                                                                                       | `docs/user-guide/sync-waves.md`                                                          |
| Application health was removed in 1.8 and must be restored for waves across apps                                                                                            | `docs/operator-manual/health.md`, `cluster-bootstrapping.md`                             |
| App of apps is an admin-level tool; push access to its source is admin access                                                                                               | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| Automated sync does not prune or self-heal unless asked; self-heal retries                                                                                                  | `docs/user-guide/auto_sync.md`                                                           |
| Tracking is by annotation by default                                                                                                                                        | `docs/user-guide/resource_tracking.md`                                                   |
| `ServerSideApply=true`, `Prune=false`, `Delete=false`; the 262,144-byte limit                                                                                               | `docs/user-guide/sync-options.md`                                                        |
| `ignoreDifferences`, and the webhook `caBundle` example                                                                                                                     | `docs/user-guide/diffing.md`                                                             |
| Repository credentials as labelled Secrets; SSH host keys in a ConfigMap                                                                                                    | `docs/operator-manual/declarative-setup.md`, private repos guide                         |
| Self-management from a kustomize application; server-side apply for the install                                                                                             | `docs/operator-manual/declarative-setup.md`, `installation.md`                           |
| `policy.default`, `role:readonly`, local accounts, disabling `admin`                                                                                                        | `docs/operator-manual/rbac.md`, user management guide                                    |
| Deleting an Application without the finalizer leaves its resources                                                                                                          | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| `RespectIgnoreDifferences=true` acts only on an object that already exists                                                                                                  | `docs/user-guide/sync-options.md`                                                        |
| `Force=true` needs `Replace=true` and is ignored under server-side apply                                                                                                    | `docs/user-guide/sync-options.md`, "Force Sync"                                          |
| Retry with exponential backoff; self-heal retries after its timeout                                                                                                         | `docs/user-guide/auto_sync.md`                                                           |
| Child applications are not ordered or awaited without the health customization                                                                                              | `docs/operator-manual/cluster-bootstrapping.md`                                          |
| A kustomize source may inflate a Helm chart with `--enable-helm`                                                                                                            | `docs/user-guide/kustomize.md`                                                           |
| Cluster-scoped kinds are admitted to a project by an allow list                                                                                                             | `docs/user-guide/projects.md`                                                            |
| `sync` and `override` are separate actions; a revision other than the Application's needs `override` when `application.sync.requireOverridePrivilegeForRevisionSync` is set | `docs/operator-manual/rbac.md` at tag `v3.6.2`, read 2026-11-21                          |
| The CLI's `--core` flag talks to Kubernetes directly, not to the API server                                                                                                 | `docs/user-guide/commands/argocd.md` at the tag                                          |
| Automated prune refuses a source with no resources unless `allowEmpty` is set; `automated.enabled: false` switches automation off                                           | `docs/user-guide/auto_sync.md` at the tag                                                |
| Rollback is authorised by `sync` unless `server.rbac.rollback.enforce.enable: 'true'` is set in `argocd-cm`; it cannot run while auto-sync is on                            | `docs/operator-manual/rbac.md` at tag `v3.6.2`, "The `rollback` action", read 2026-11-21 |
| `argocd_app_info` carries `sync_status` and `health_status`                                                                                                                 | `docs/operator-manual/metrics.md` at the tag                                             |
| A second source referenced by `ref` is described for Helm value files, with the `$values` path prefix; nothing is said there for kustomize                                  | `docs/user-guide/multiple_sources.md` at tag `v3.6.2`                                    |

Not read or not provable from reading; slice 2.7 owns each:

- Whether helm itself follows a linked archive in `charts/`, and whether kustomize inflates a
  chart from a local archive without fetching.
- Whether self-management overwrites the password hash or the generated keys in
  `argocd-secret`.
- That the bundled health check keeps an ExternalSecret unhealthy until its value arrives. The
  health customization files were not read.
- That later changes in several children converge by retry in practice. The documentation says
  what waves order; it gives no guarantee for this case.
- That a Helm source includes the `crds/` directory of a wrapper's dependency, and that
  kustomize does with `includeCRDs: true`. Not read; rehearsal 2.7 reads the CRDs back.
- That the bundled health check for `cert-manager.io/Certificate` behaves as the Flux
  `healthCheckExprs` it replaces. Rehearsal 2.7/A14.
- That core mode can sync and wait with the node's credential alone, that the override
  setting is enforced in the interface, and that the rollback setting refuses the account.
  Rehearsal 2.7/A3.
- That an applied `operation` block starts a sync, and that a root without prune leaves an
  Application whose file was removed.
- That an automated root leaves an unautomated child unsynced and reverts an edit to its sync
  policy. Rehearsal 2.7/A3.
- Which fields need `ignoreDifferences` for these charts.
- Argo CD's memory on this cluster. 1,536 MiB is an assumption (R24).
- The ApplicationSet documentation was not read; the choice against it rests on the
  bootstrapping guide's description only.

## Minimal placement profile: rules changed and what was read

**Rules that changed.**

| Rule before the minimal profile                                                 | Now                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One node role per host                                                          | One trust class per host; two co-locations allowed in this change's scope (`nonproduction` and `ingress` with `observability`; `database` with the server); rule 1.2 |
| The server carries none of `product`, `nonproduction`, `ingress`                | The same, and none of `observability`                                                                                                                                |
| Only `platform-services` workloads and three agents tolerate the platform taint | Workloads that select `database` may too (change `host-postgres`)                                                                                                    |
| A node's capabilities are fixed when it joins                                   | A joined node's capability labels follow the inventory (slice 1.7), which A17 and every growth step use                                                              |

**Read in source for it.**

- `solver-supervisor-command.ts` and `solver-supervisor-lifecycle.ts`: the start-up sweep
  lists Docker containers with the label filter `wbs-managed-solver=true` and kills only
  those; pods under the k3s runtime are not in that list.
- `infra/ansible/roles/solver/tasks/main.yml`: the role installs the pinned `docker.io`
  package and asserts `product`; slice 3.8 already changes the assertion.
- `infra/ansible/roles/k3s_agent/templates/config.yaml.j2` and the server's: capability
  labels are `node-label` entries of the k3s configuration, and no playbook sets a label
  on a registered node (`grep` over `infra/ansible`).
- The k3s agent CLI page describes `--node-label` as "Registering and starting kubelet
  with set of labels". That a label added to the configuration later is not applied is
  believed and is slice 1.7's stop condition, not a reading.

**What the figures say against the trial size of the apps node.** On limits the production
workloads fill an 8 GiB node with nothing left for a solve (design decision 2). The owner
chose to try it; A19 and A20 measure, A19 stops before WBS is added, and the rescale has
triggers that are alerts as well.

**What the figures said against one co-location.** On the declared figures staging did not
fit beside the observability stack on 16 GiB: 972 MiB were left before the staging database
and any solve. Shown that, the owner chose a larger server (below); on 24 GiB the same rows
leave 5,442 MiB, or 2,498 with dev. A14's measurement stays the condition.

## cert-manager behaviour

Read on 2026-11-21 in the `ClusterIssuer` CRD of the locked chart archive
`infra/platform/charts/cert-manager-v1.21.2.tgz`. Nothing was run.

| Relied on                                                                                            | Where it was read                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| An HTTP-01 ingress solver takes `podTemplate.spec` with `nodeSelector`, `tolerations` and `affinity` | the CRD's schema for `spec.acme.solvers[].http01.ingress`                     |
| A solver is chosen by `selector.dnsNames`, `dnsZones` or `matchLabels`                               | the same schema; the staging issuer in the tree already selects by `dnsNames` |

Not established: that the solver pod is created in the Certificate's namespace for a
`ClusterIssuer` (believed), and the label its pods carry, which the Traefik allow of slice
2.10 names; both are read on k3d there.

## Failure proofs

Each row was watched on 2026-11-22: the fault injected, the named test failing, the fault
reverted and the test passing again. `node-roles.test.ts` ran with ansible-core 2.21.3, the
locked controller version, from `uvx`; the other tests with `env -u CLAUDECODE bun test`.

| Safety boundary (slice)                                                                                                                                                                                | Injected fault and observing test                                                                                                                                                                                                                                                                                            | Observed proof                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A workers node carries neither new capability (1.1)                                                                                                                                                    | `platform-services`, then `nonproduction`, added to `purposeCapabilities.workers`; `contracts.test.ts` `refuses a workers node that carries <capability>`                                                                                                                                                                    | 5 pass, 1 fail, once for each                                  |
| The server of a `platform-services` cluster carries none of `product`, `nonproduction`, `ingress`, `observability` (1.2)                                                                               | the comparison dropped; then the earlier three-name list; `contracts.test.ts` `refuses a platform-services server that also carries product` / `observability`                                                                                                                                                               | 5 pass, 2 fail; then 6 pass, 1 fail                            |
| Observability with `nonproduction` and `ingress` is accepted (1.2)                                                                                                                                     | the third trust class split in two; `contracts.test.ts` `accepts the minimal profile`                                                                                                                                                                                                                                        | 6 pass, 1 fail                                                 |
| No node carries `product` and `nonproduction` (1.2)                                                                                                                                                    | the rule applied to the server only; `contracts.test.ts` `refuses an agent that carries product and nonproduction` and `... in every cluster`                                                                                                                                                                                | 5 pass, 2 fail                                                 |
| No gate host in a k3s group (1.2)                                                                                                                                                                      | the gate-host comparison skipped; `placement.test.ts` `refuses a gate host in a k3s group`                                                                                                                                                                                                                                   | 5 pass, 1 fail                                                 |
| A `platform-services` server's configuration: taint, `+=` admission entry, etcd metrics; none of the first two elsewhere (1.2)                                                                         | in `k3s_server/templates/config.yaml.j2`: the branch removed; the etcd line dropped; `=` written; the entry written for every server; `node-roles.test.ts` `renders the platform taint ...` and `keeps the existing servers without an API server argument`                                                                  | 6/2, 5/3, 6/2 and 6/2 pass/fail                                |
| The CoreDNS step appends and keeps the packaged tolerations (1.2)                                                                                                                                      | the strategic patch restored from `HEAD`; `ansible.test.ts` `appends the enrollment toleration to CoreDNS ...`                                                                                                                                                                                                               | 0 pass, 1 fail                                                 |
| The inventory and `desired.yaml` agree on each node (1.3)                                                                                                                                              | the per-node comparison removed (names only); `placement.test.ts` `refuses a machine id that differs between the two files`                                                                                                                                                                                                  | 5 pass, 1 fail                                                 |
| The MTU input never exceeds what the interface reports (1.3)                                                                                                                                           | the assertion replaced by the 1280 minimum alone; `node-roles.test.ts` `refuses an interface that reports less than the private MTU`                                                                                                                                                                                         | 7 pass, 1 fail                                                 |
| The Tailscale package and repository key are locked; the previous lock stays decodable (1.8)                                                                                                           | each made optional; `CraneToolchainSchema` dropped from the retained union; `contracts.test.ts` `rejects a missing Tailscale package or repository lock`, `still decodes a retained crane lock ...`                                                                                                                          | 48 pass, 1 fail, each                                          |
| A separated host's firewall: SSH from the bastion alone, cluster ports from nodes alone, the bastion limited to `sshd`, stateful drops, public ports by `ingress`, the public drop in prerouting (1.8) | in `network/templates/k3s.nft.j2`: "retain SSH recovery" kept; SSH from the private range; 8472 from the private range; the bastion drop removed; `ct state new` dropped from the public drop; 80 and 443 for every host; the public drop removed; `node-roles.test.ts` `renders a separated firewall the judge accepts ...` | 6 pass, 2 fail each (8472 also broke the byte-equal case: 5/3) |
| SSH on the tailnet interface is refused (1.8)                                                                                                                                                          | the judge reads `iifname "<private>"` rules alone; `node-access.test.ts` `refuses SSH on the tailnet interface`                                                                                                                                                                                                              | 23 pass, 1 fail                                                |
| The existing inventories render byte-equal firewalls (1.8)                                                                                                                                             | the default branch's rule changed; `node-roles.test.ts` `renders the existing inventory's firewalls byte-equal`                                                                                                                                                                                                              | 6 pass, 2 fail                                                 |
| The console account is refused by `sshd` (1.8, 1.9)                                                                                                                                                    | `DenyUsers` dropped from `base/templates/sshd-console.conf.j2`, then from `bastion/templates/sshd.conf.j2`; `node-roles.test.ts`                                                                                                                                                                                             | 6 pass, 2 fail, each                                           |
| Each tag reaches exactly its row; no person is named (1.8)                                                                                                                                             | tag names compared only; the groups check skipped; `access-policy.test.ts`                                                                                                                                                                                                                                                   | 4 pass, 4 fail; 7 pass, 1 fail                                 |
| No bastion in a k3s group or among the gate hosts (1.9)                                                                                                                                                | the bastion group skipped; `placement.test.ts` `refuses the bastion in a k3s group or among the gate hosts`                                                                                                                                                                                                                  | 5 pass, 1 fail                                                 |
| `PermitOpen` follows the inventory's servers, at port 22 only (1.9)                                                                                                                                    | a literal list in `sshd.conf.j2`; the judge's port comparison widened to any port; `node-roles.test.ts` `forwards to every server the inventory adds`, `node-access.test.ts` `refuses a PermitOpen entry for a port other than 22`                                                                                           | 7 pass, 1 fail; 23 pass, 1 fail                                |
| `jump`: `AllowTcpForwarding local` and no tunnel (1.9)                                                                                                                                                 | the judge checks `PermitOpen` alone; `node-access.test.ts` `refuses jump forwarding other than local`                                                                                                                                                                                                                        | 23 pass, 1 fail                                                |
| `jump` has no login shell (1.9)                                                                                                                                                                        | the `shell` line dropped; `ansible.test.ts` `gives the bastion's jump user no login shell`                                                                                                                                                                                                                                   | 0 pass, 1 fail                                                 |
| The bastion's public port set is exactly {22}, metered per source; private 22 from the prober alone (1.9)                                                                                              | the judge checks that 22 is present; the IPv4 meter dropped and the private range admitted in `bastion.nft.j2`; `node-access.test.ts`, `node-roles.test.ts`                                                                                                                                                                  | 23/1; 6/2; 7/1                                                 |
| The read-back compares `sshd -T`, not the render (1.9)                                                                                                                                                 | the assertion compares the rendered options with themselves; `node-roles.test.ts` `fails the read-back when an earlier drop-in sets another PermitOpen`                                                                                                                                                                      | 7 pass, 1 fail                                                 |

The judges also ran on the production path: `check-ansible.py` in the locked controller image
`ghcr.io/prosperous-unification/fleet-controller:0.1.0`, built by `tool-fleet:controller-image`,
then `judgeAnsibleRenders` and the other ansible judges on its report: all empty for the
committed tree; with "retain SSH recovery" kept and the taint line removed in a copy of
`infra/ansible`, the two problems named above.

## Slices 1.1 to 1.9: commands (2026-11-22)

Run in the worktree at `feat/platform-node-lane-a` after `bun install --frozen-lockfile`.

| Command                                                                                                                                                                                                         | Result                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `env -u CLAUDECODE bun test` on `node-access`, `access-policy`, `placement`, `contracts`, `ansible`, `check` and `plan` (`tools/tool-fleet/src`)                                                                | 177 pass, 0 fail, 7 files         |
| `bun test --preload ./tools/test/scratch/preload.ts ./infra/ansible/tests/node-roles.test.ts`, with `PUNI_TEST_ANSIBLE_PLAYBOOK` and `PUNI_TEST_ANSIBLE_INVENTORY` pointing at ansible-core 2.21.3 run by `uvx` | 8 pass, 0 fail                    |
| `check-ansible.py` in the locked controller image, then the ansible judges of `check.ts` on its report                                                                                                          | every judge empty; 5 host renders |
| `bunx nx run tool-fleet:typecheck`; `bunx tsc -p infra/ansible/tests/tsconfig.json --noEmit`                                                                                                                    | both succeeded                    |
| `bunx eslint` on the changed `tools/tool-fleet/src` files                                                                                                                                                       | no problems                       |
| `bunx nx format:check --files=<changed files>`                                                                                                                                                                  | exit 0                            |
| `./node_modules/.bin/openspec validate --all --json`                                                                                                                                                            | 355 items, 355 passed, 0 failed   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                     | exit 0, empty stderr              |

Not run: the whole `tool-fleet` test suite (stopped at the coordinator's request to spare
the laptop; CI runs it), `tool-fleet:check` end to end and `check:faults`, no `check-faults.ts`
row for the new judges, and anything on a host: the Tailscale join and its second run, a live
`sshd -T` on the bastion, the console account against a live `sshd`, and every rehearsal case
of slice 2.7.

## Review amendments: proofs and commands (2026-11-22, after `4bb013d3b`)

A review of `4bb013d3b` found one lock-out (keys joined with a literal `\n`) and nine more
defects; each fix below was watched failing with its guard broken, then passing again.
`node-roles.test.ts` ran twice on the final tree: with ansible-core 2.21.3 from `uvx` (28 pass,
0 fail) and through `infra/ansible/tests/controller-run.sh`, the locked controller image, as
`infra-check.yml` now runs it (28 pass, 0 fail).

| Guard                                                                                | Injected fault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Observing test, result                                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Keys are a list, staged from a template loop and counted                             | `is not string` removed; the staged file written with `content: \|` and `join('\n')`                                                                                                                                                                                                                                                                                                                                                                                                                                          | `node-roles` `refuses keys given as one string`, `installs two keys on two lines`: fail each                                   |
| A fresh controller login confirms the change                                         | `failed_when: false` on it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `fails when a fresh connection is refused`: fail                                                                               |
| Bastion sshd confirm-or-revert                                                       | rescue's restore disabled; the whole-config `sshd -t` replaced by `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `puts the hand-made drop-in back when a fresh login fails`, `stops on an sshd configuration that does not validate`: fail each |
| Read-back: every option, `AllowUsers`/`DenyUsers` exactly                            | compared with the rendered options; `AllowUsers` comparison dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `fails the read-back when an earlier drop-in sets another PermitOpen or adds root`: fail each                                  |
| Console account after a read-back `DenyUsers`                                        | `denyusers` condition removed; `!= operator` removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `creates the console account only after sshd refuses it`, `refuses the console account's inputs`: fail each                    |
| Network: interfaces classified, private address, SSH source, ports by `ingress`, MTU | each condition removed or made true                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | the five `the network role's guards` cases: fail each                                                                          |
| Bastion inputs, keys, private interface, `nft -c`                                    | each condition removed; the check replaced by `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | the `the bastion's guards` cases: fail each                                                                                    |
| Tailscale tag, version, tags and expiry                                              | each condition removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | the three Tailscale cases: fail each                                                                                           |
| Policy decode refuses unknown keys                                                   | `'+': 'reject'` dropped from the grant schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `access-policy` `refuses Tailscale SSH rules, other sections and unknown grant keys`: fail                                     |
| Exact chains of the judges                                                           | the input-chain comparison skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `node-access`: 6 cases fail                                                                                                    |
| Templates, against the goldens and the judges                                        | 23 template faults (SSH public, from the range, on the tailnet; 8472 from the range; 2381 reject removed; the bastion drop, the IPv6 drop, the public drop removed; drops without `ct state new`; 80/443 for every host; the CI accept without `ip daddr`; the default branch changed; the taint line removed; etcd for every server; `=`; a literal `PermitOpen`; `AllowUsers` and `PermitRootLogin` dropped; the bastion meter dropped, the private range admitted, its IPv6 drop removed; the console `DenyUsers` dropped) | `renders every host byte-equal to its committed golden` or the named judge case: fail each                                     |
| otel-gateway ports bound to `otlp-ingress.yaml`                                      | one port changed in the inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `placement` `are the NodePorts of the production otlp-ingress Service`: fail                                                   |

Also checked: h4claw's rendered server configuration equals its rendering with the templates of
`7a0279c7d`, byte for byte, and both existing firewalls equal their earlier goldens;
`check-ansible.py` in the controller image with the `check.ts` judges: all empty;
`systemd-analyze verify` of the bastion unit: no output, exit 0, locally and in the image;
`unshare -rn nft -c` (locally) and `nft -c` (in the image) on every rendered ruleset: exit 0.
Touched TypeScript tests (eight files): 189 pass, 0 fail; `tool-fleet:typecheck` and
`tsc -p infra/ansible/tests` succeeded; eslint on the changed files: no problems.

Not read: whether the public interface `enp3s0` uses DHCPv6 or MLD. The read-only
`ssh m1 networkctl status enp3s0` was refused by this session's permission check, so no DHCPv6
or MLD accept was added and A26 reads it. Not run on a host: anything above.

## Owner decisions

Each row is a decision of the owner's, stated as a decision and dated; the assumption that
carries it is named. Assumptions that the planning session set for him are listed after the
table. No conversation is reproduced here.

| Date       | Decision                                                                                                                                                                           | Carried by        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-11-21 | The cluster is rebuilt from nothing on new servers, beside the old one, and delivered by Argo CD                                                                                   | R1, R19           |
| 2026-11-21 | The switch may be unsafe while there are no production users                                                                                                                       | R26               |
| 2026-11-21 | OpenBao is set up before everything it can precede                                                                                                                                 | R22               |
| 2026-11-21 | What merges to `main` deploys to staging; production deploys on command                                                                                                            | R20               |
| 2026-11-21 | Server sizes and names as recommended; the owner creates the servers; machine ids and private addresses follow the fleet file, which already publishes them for the existing nodes | R2 to R5          |
| 2026-11-21 | Dev and staging are two separate environments on a node apart from production; staging follows `main`, holds the tracker and promotes to production                                | R29, R33          |
| 2026-11-21 | h1claw may be deleted; the backup windows that follow are accepted; the escrow precedes it                                                                                         | R30               |
| 2026-11-21 | Alerts go to one named channel; its webhook is held by the owner outside this repository                                                                                           | decision 5        |
| 2026-11-21 | PostgreSQL hosting is planned, for every app once it is in place; the database server is bought later                                                                              | `host-postgres`   |
| 2026-11-22 | A host for OpenClaw and a remote workstation; one shared host in the minimal profile, 8 vCPUs and 16 GiB                                                                           | `add-agent-hosts` |
| 2026-11-22 | The minimal setup that can grow: separate only what is hard to scale out later; every server new, every old one retired                                                            | R45, R46          |
| 2026-11-22 | Production apps node at 4 vCPUs and 8 GiB as a trial; observability node larger than 16 GiB; staging and dev stay on it                                                            | R2                |
| 2026-11-22 | All plans are in one pull request                                                                                                                                                  | proposal          |
| 2026-11-22 | Harbor and the owner's own CI are built, not replaced by hosted services                                                                                                           | R10, R31          |
| 2026-11-22 | CI is orchestrated by Argo Workflows and Argo Events with Dagger; the host pool is not used on the new capacity                                                                    | R31, CI change    |
| 2026-11-22 | Everything is orchestratable by the `puni-user-platform` and multitenant                                                                                                           | R48               |
| 2026-11-22 | Tailscale is the access path; platform services are not exposed to the internet                                                                                                    | R47               |
| 2026-11-22 | Rancher Manager is included in the plan                                                                                                                                            | R54               |
| 2026-11-22 | The platform server is bought at 8 vCPUs, 32 GB and 200 GB, and a bastion at 1 vCPU and 2 GB; servers are named by his scheme                                                      | R2, R3            |

Set for him by the planning session, each with its alternative in design.md, for him to
overrule by id: R34 (dev's delivery is a follow-up), R35 (the CI cluster is one trust zone),
R49 (break-glass through the bastion, then the provider's console), R50 (the CI server's
size), R51 (no public webhook), R52 (Tailnet Lock, `sshd` login), R55 (the bastion as the
SSH path, Tailscale kept as the target for the interfaces), and the controller on the
operator's laptop only (decision 10).

## Read-only readings

| Reading                                           | Result                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubectl get nodes` capacity and allocatable      | h4claw and h3mon: 8 CPUs, 15,602 MiB; allocatable 13,299 and 13,939 MiB; about 150 GiB of node storage                                                               |
| `kubectl top nodes`                               | h4claw 3,291 MiB, h3mon 4,316 MiB                                                                                                                                    |
| Node labels                                       | h4claw: `control-plane`, `ingress`, `product`; h3mon: `observability`; no taints                                                                                     |
| Node selectors of every Deployment                | Flux, cert-manager and kube-system: `kubernetes.io/os` only; website: `capability-product`                                                                           |
| Memory limits per namespace, running pods         | flux-system 4,096; website-dev 768; website-prod 128; website-prod-logs 128; puni-registry 512                                                                       |
| Containers without a memory limit                 | cert-manager 3, Traefik 1, kube-system 2 on h4claw                                                                                                                   |
| Persistent volumes                                | two, class `puni-retain`, policy `Retain`, node affinity by host name to h4claw                                                                                      |
| Storage classes                                   | `local-path` is the default with policy `Delete`; `puni-retain` and `puni-local` have `Retain`                                                                       |
| Flux stages                                       | `target`, `controllers`, `storage`, `policy`, `secrets`, `platform` Ready; `observability`, `alerts`, `backup` not Ready                                             |
| Flux sources                                      | the platform source is pinned to one commit; the fleet source follows a branch and owns the website and registry-secret units                                        |
| `nproc`, `free -m`, `df -h /` on h2puni           | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                                                                                        |
| User timers on h1claw                             | hourly SQLite pull from h2puni, daily MLflow pull, daily remote prune, weekly restore drill, freshness alert; last run healthy                                       |
| The fleet repository's file list                  | its website overlay holds encrypted Secret files; its cluster directory holds Flux units. No content is quoted                                                       |
| `/dev/kvm` on the operator's laptop               | present; the laptop's disk was full, so no lab ran                                                                                                                   |
| Tolerations of the packaged components            | CoreDNS, `local-path-provisioner`, `metrics-server`: `CriticalAddonsOnly` (Exists) and the control-plane taint, nothing else                                         |
| DaemonSets on the live cluster                    | Traefik only, selecting `capability-ingress`                                                                                                                         |
| Rules on this repository's `main`                 | one active ruleset: `pull_request` with zero required approvals; `required_status_checks` `gate` and `pixels`, not strict; no rule against forced or deleting pushes |
| `infra-check.yml`                                 | runs `tool-fleet:check` on pull requests that touch its paths; it is not among the required checks                                                                   |
| `crds/` directories in the vendored archives      | Traefik 25 files, Velero 13; the other eight archives none                                                                                                           |
| CRDs in the Prometheus stack archive              | ten files under `charts/crds/crds/`                                                                                                                                  |
| Kinds under `infra/platform/policy` and `storage` | no cert-manager kind, so both can precede cert-manager                                                                                                               |
| WBS overlays                                      | `staging` and `prod` both render into `wbs` and `wbs-solver`                                                                                                         |
| Controller image                                  | installs `kubectl` only; no `sops`                                                                                                                                   |
| Helm release names                                | no `HelmRelease` sets `releaseName`; `otlp-ingress.yaml` selects `app.kubernetes.io/instance: otel-collector`                                                        |
| Roles of `bootstrap.yml` and `join.yml`           | `base`, `network`, `storage` and the k3s role; `registry_client` runs only from `registry.yml`                                                                       |
| Members of h1claw's hourly set                    | five per stamp, all pulled from h2puni: WBS production, WBS dev, `aivn-dev`, `aivn-cms-dev` and a configuration archive                                              |

Read for an earlier draft, in source at the same commit:

| Reading                                                             | Result                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solver-supervisor-image-map.ts`                                    | the caller list is closed: `be-01-blue`, `be-01-green`, `wbs-dev-src`, `k8s_wbs-solver_backend`. A rule's caller image may be null for `wbs-dev-src` only; for every other caller the decoder throws, under a `Proof:` comment (lines 55 to 61, read again for an earlier draft; an earlier draft misread this) |
| `solver-supervisor-image-map.test.ts`                               | a null caller image for `k8s_wbs-solver_backend` must throw                                                                                                                                                                                                                                                     |
| `roles/solver/tasks/main.yml`                                       | `maxManagedContainers: 4` is a literal; each mapped solver image is pulled by digest with the host's Docker, with no login and no CA step                                                                                                                                                                       |
| `solver-supervisor-docker-output.ts`                                | a pod's caller name is `k8s_<namespace>_<container>`                                                                                                                                                                                                                                                            |
| `solver-supervisor-lifecycle.ts`                                    | the start-up sweep kills every managed container on the node; the cap counts them node-wide                                                                                                                                                                                                                     |
| `solver-supervisor-config.ts`                                       | a solver container's memory limit is at most 512 MiB                                                                                                                                                                                                                                                            |
| `roles/solver`                                                      | asserts `product`; one uid (10001, the backend pod's), one sudoers entry, one tmpfiles link to `/run/puni/solver`                                                                                                                                                                                               |
| `roles/gate_host/tasks/main.yml`                                    | the gate user is added to the `docker` group, which the role's comment calls root-equivalent on the host                                                                                                                                                                                                        |
| `docs/infra/deployment.md`, `infra/ci/deploy-runner/job-started.sh` | the `puni-deploy` runner is to sit in a group limited to `deploy-k3s.yml@refs/heads/main`, and its hook fails any other workflow reference                                                                                                                                                                      |
| `infra/jobs/catalogue.json`                                         | `gate`, `release-build`, `test-queued`, `solver-image-publish`                                                                                                                                                                                                                                                  |
| `docs/infra/gate-hosts.md`                                          | a gate reserves the whole pool and may not be listed in `concurrencyEligible`                                                                                                                                                                                                                                   |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards. The rows
below were run again on this revision, on 2026-11-22.

| Command                                                                                                     | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `openspec validate <change> --strict`, for each of the four changes                                         | each `Change '<change>' is valid`, exit 0                                 |
| `openspec validate --all --json`                                                                            | 352 items, 352 passed, 0 failed                                           |
| `prettier --check` on the changed plan files of the four changes                                            | `All matched files use Prettier code style!`                              |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files. Changed files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                      |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                                               |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 395 words here; 361, 339 and 334 in the other three                       |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM, cluster or Argo CD rehearsal: slice 2.7 owns that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.
- This revision has not been reviewed. The ten reviews recorded above read earlier commits.

## Primary sources read

- For an earlier draft: the `ClusterIssuer` CRD in the locked cert-manager archive;
  `registry/production/issuers.yaml` again; the Argo CD sync-options and Helm guides and the
  CloudNativePG scheduling and storage pages at their tags; the Velero schedule's volume
  setting; the storage classes.
- For an earlier draft: the CloudNativePG and Barman Cloud plugin pages listed under
  "CloudNativePG behaviour"; the `k3s_agent` configuration template; the storage classes;
  the Velero schedules; the Prometheus stack's selectors and its Grafana setting.
- For an earlier draft: `solver-supervisor-image-map.ts` and its test, the `solver` role's
  tasks again, and the Argo CD multiple-sources guide at tag `v3.6.2`.
- For an earlier draft: the five supervisor sources and the `solver` and `gate_host` roles named
  under "Read-only readings"; `docs/infra/deployment.md` on the deploy runner and its hook;
  `docs/infra/recovery.md` on the h1claw sets.
- For an earlier draft: `infra/platform/policy/trusted-workloads.yaml`, the `solver` role's
  tasks, `deploy/k8s/wbs/base/backend.yaml` and both overlays' namespaces (the solver binding);
  `.github/workflows/ci.yml` and `deploy-k3s.yml` (triggers and the one self-hosted runner);
  `infra/jobs/catalogue.json` and the `concurrencyEligible` section of
  `docs/infra/gate-hosts.md`; the Argo CD RBAC guide at tag `v3.6.2` (rollback).

- `infra/fleet/desired.yaml`; `infra/ansible/inventory/production-existing-hosts.yml`; the play
  lists of `bootstrap.yml`, `join.yml`, `platform.yml`, `firewall.yml`, `backup.yml`,
  `restore.yml` and `validate-enrollment.yml`; the `k3s_server` and `k3s_agent` configuration
  templates; the `network` role's firewall template.
- `tools/tool-fleet/src`: `contracts.ts` (capabilities, the server-count rule), `platform.ts`
  (`validatePlatform`, stage dependencies and placement), `check.ts`, `health.ts`,
  `observability-source.ts`, `lab.ts`.
- `infra/clusters/platform/production`; every `HelmRelease` under `infra/platform`;
  `infra/platform/secrets/platform-production/externally-provided.json`; the policy namespaces;
  the registry issuers; the observability claims; `infra/versions/toolchain.json`.
- `docs/infra/README.md`, `fleet.md`, `platform.md`, `recovery.md`, `registry.md`,
  `enroll-h4claw-h3mon.md`, `gate-hosts.md`, `cutover-plan.md`, `observability-sizing.md` and
  `local.md`.
- `deploy/k8s/wbs/base` and its overlays.
- `openspec/changes/adopt-harbor-registry`: design decisions 2, 4 and 10, the assumption table
  and the task list.
- The Argo CD documentation and source listed above.
- For a review and the decisions of 2026-11-21: the design file of pull request #935
  at its branch (placement, seal, self-init, server certificate, bootstrap set, stage graph);
  `infra/controller/Containerfile`; `deploy/k8s/wbs/overlays/staging` and `prod`;
  `infra/platform/policy` and `storage` by kind; the Prometheus stack archive's file list;
  `observability/elastic/settings/settings.yaml` and `kibana/objects/job.yaml`; the four Argo
  CD pages named above at tag `v3.6.2`.
- For a review: `validate-enrollment.yml` and the `k3s_server` template's taints; the
  identity ConfigMap tasks of `platform.yml`; `alerts/base/rules.yaml` and the production
  overlay; `observability/base/signals.yaml`; `registry/production/issuers.yaml`;
  `policy/namespaces.yaml`; the archives' file lists; `.github/workflows/infra-check.yml`;
  `platform.test.ts`; `docs/infra/recovery.md` on the h1claw sets and the prune; the Harbor
  change's context and attended steps.
- For a review: every Flux unit under `infra/clusters/platform/production` with its
  `dependsOn`; the Flux annotations and `HelmRelease` fields under `infra/platform`;
  `policy/trusted-images.yaml`; the Velero `HelmRelease`; `certificates/platform/production`;
  `registry/production/issuers.yaml`; `docs/infra/cutover-plan.md` prerequisites and steps 6
  and 8; `tools/tool-deploy/src/k8s/first-start-source.ts`; the kubelet arguments in both k3s
  templates; `docs/infra/gate-hosts.md` on the controller's jump; the k3s manifests and
  documentation listed under "k3s behaviour".

## Private access and tenancy: what was set and what was read (2026-11-22)

**Set for him by the planning session, for him to overrule by id.**

| Id        | What                                                              | Why it was not left open                                                 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R49       | break-glass is the provider's console; no public SSH rule         | a rule had to be chosen for the firewall slice                           |
| R50, CI13 | the CI server is 12 vCPUs and 24 GiB                              | it blocked A9 and CI-A1                                                  |
| R51, CI11 | no public webhook; a trigger job joins the private access network | recommended to him on 2026-11-22 and unanswered; it is what R47 asks for |
| R52       | Tailnet Lock on, key expiry off for servers, login by `sshd`      | the join and the trigger depend on it                                    |
| CI12      | a result is written to GitHub as a commit status                  | it was the CI change's second open question                              |

**New in this change.** Decisions 12 and 13; a third decision record; assumptions R47 to
R52; task 0.7; slice 1.8; rules 2.4(q) and (r); the unit `tailscale-operator` at order 2;
step A24; three requirements. Slices are now 25 and attended steps A1 to A24. R17 has no
jump host any more; R2, R23, R31 and R45 are reworded. The risk "losing the platform node
loses the jump" is replaced.

**Read in Tailscale's documentation on 2026-11-22.**

| Read                                                                                                                                                                                                      | Page                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A device that is tagged when it first authenticates has key expiry disabled by default                                                                                                                    | "Tags"                                            |
| Tailnet Lock: a new device needs a signature from a trusted device, so the coordination service alone cannot add one; an auth key can be signed beforehand; disabling the lock needs a disablement secret | "Tailnet Lock"                                    |
| With Tailscale SSH on, Tailscale takes port 22 for connections that arrive from the tailnet; it is not enabled here, so `sshd` and its keys decide a login                                                | "Tailscale SSH"                                   |
| The Kubernetes operator exposes cluster workloads to the tailnet and the Kubernetes control plane over it, without a public endpoint                                                                      | "Tailscale Kubernetes Operator"                   |
| The API server proxy's `auth` mode impersonates a user as the Tailscale user and a tagged device as its name with its tags as Kubernetes groups; grants may add groups                                    | "Access the Kubernetes API server over Tailscale" |
| Enabling certificates publishes machine names and the tailnet's DNS name on a public ledger                                                                                                               | "Enabling HTTPS"                                  |
| Sharing gives a recipient outside the tailnet one device and nothing else                                                                                                                                 | "Share your machines with other users"            |
| Funnel proxies a device's resource from the internet through the vendor's relays                                                                                                                          | "Tailscale Funnel"                                |
| The policy file can be managed from a Git repository, validated and applied automatically                                                                                                                 | "GitOps for Tailscale"                            |
| OAuth clients with the `auth_keys` scope are limited to chosen tags; an auth key expires after at most 90 days                                                                                            | "OAuth clients", "Auth keys"                      |
| The vendor's GitHub Action creates an ephemeral, tagged device per job                                                                                                                                    | "Tailscale GitHub Action"                         |

**Not verified.** The package version to lock, which slice 1.8 records. Tailscale's UDP port
for direct connections, from memory. Whether the policy file's own `tests` section covers
what the repository's test asserts. The operator's chart values for the API server proxy
and for exposing a Service by Ingress. How a k3s server's certificate takes a tailnet name
beside its private address. That a provider's console gives a login when the network path
is closed, which A24 tests. Prices: the vendor charges per user, and no plan was checked.

**Tenancy read in source.** `infra/platform/policy/namespaces.yaml` carries Pod Security
labels and `puni.dev/trusted-hostpath`, and no tenant label; `CONTEXT.md` has no term
"tenant" and lists it as a word to avoid for an organization, so no term is added: decision
13 uses the word in its plain sense, for the unit a platform service isolates.

**Open items, and why none blocks.** Core: none. `host-postgres`: when `platform-db`
starts and when it gets a server wait for PG-A4 and PG-A1; Harbor's database is assumed
(PG7). `add-agent-hosts`: the host's region waits for AH-A1, and OpenClaw's state for
AH-A3. `run-ci-on-argo-workflows`: none; the tenant's repository list waits for CI-A3.

**Checks on this pass** are listed with the commit in the pull request's body.

## Reviews of this plan

Eleven reviews by the planning session's own reviewer and one by a second model read drafts
of this plan between 2026-11-21 and 2026-11-22. Their findings and what became of each are
in the pull request's history; draft and review ids are not carried here. The last two read
the commit `08507cb8e`, and this is what became of their findings.

| Finding                                                                                   | Outcome                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Going back after the new writer accepted edits                                            | Fixed: decision 7's rule, the comparison in A18, the rollbacks of A15 and A18 to A20, a requirement                  |
| MLflow backed up by the apps' runner                                                      | Fixed: its own custody (slice 3.6), a reading first and a whole restore with a checked artifact (A15)                |
| h1claw deletable before its receipts; h4claw's inventoried container                      | Fixed: the same receipts whenever it is deleted; a signed list per retirement step (A21, A22, AH-A3)                 |
| The trigger key readable from any branch; a gate at a chosen commit                       | Fixed: an environment that admits `main` only; the trigger identity cannot start a gate (CI change)                  |
| The new cluster's keys on a host where gate code is root                                  | Fixed: the controller is the operator's laptop only (decision 10); the h2puni option is removed                      |
| Automatic staging without the schema Job                                                  | Fixed, then designed: first by refusing such a commit, now by the staging schema hook of slice 3.9 (decision 9, R53) |
| CI stage ordering; inventory group; sync and rules for the `ci` project; network paths    | Fixed: CI-S2's inventory after A9, rules 2.4(a), (c) and slice 2.5 extended, two paths named (decision 12)           |
| The gate submitted where its pod may not run; a Secret in the build namespace             | Fixed: the gate's template and Workflows are in the `-build` namespace; `report-status` posts the result             |
| Tailnet Lock and devices the operator makes; the CI cluster's route to the store          | Fixed: a signing action per step, a fallback that keeps the lock, the private listener named                         |
| Conversation quoted in a public repository; review histories                              | Fixed: decisions are stated and dated; histories are removed from the four verify files                              |
| Private addresses in the public inventory                                                 | Kept as decided on 2026-11-21 (R5), with its alternative, a private inventory; no new kind of identifier             |
| The telemetry gateway's NodePorts against the ban; a forwarded port on a public interface | Fixed: a drop before destination NAT (slice 1.8), the ban in every project, two exemptions by name                   |
| SQL flows of the dump and drill jobs; isolation proved by a refused listing               | Fixed in `host-postgres` and in A18: the two flows allowed, a read refused by authorisation                          |
| A late build replacing a newer render                                                     | Fixed: the render step refuses a source commit that is not a descendant (slice 3.7)                                  |
| Automatic staging for two apps left to another owner; empty dev namespaces                | Stated: one milestone per app with a recorded waiver where the path does not exist; dev is the follow-up             |
| A build beside a gate against "waits behind"; pod priority and the kernel's kill          | Fixed: a build waits in phase 1, since by one shared mutex (CI change, decision 5)                                   |
| No fallback if the gate cannot run in a pod                                               | Fixed: the host form of the gate, started by a Workflow (CI change, decision 6)                                      |
| No alert before the trigger key expires or for a stale pin                                | Fixed: slice CI-S9                                                                                                   |
| Rule letters, the console password, policy rows for operator tags, a single signer        | Fixed in place                                                                                                       |

Not changed, with the reason: nothing was found wrong against source in either review.

The second model then read the commit `3f7b5f60b` against its own list. Six findings it
called resolved; this is what became of the rest and of what it added.

| Finding                                                                     | Outcome                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The comparison ran before the new writer stopped, and read `event_log` only | Fixed: stop first, then the `.dump` digest of the whole store; MLflow by metadata digest and artifact manifest                    |
| The trigger identity could submit `report-status` with chosen parameters    | Fixed: admission admits only `staging-build` with its two parameters (CI change, decision 2)                                      |
| The controller image built on any machine and pinned by digest              | Fixed: built on the controller; the keys are refused an image without a matching local build (decision 10)                        |
| The website's staging part could start without its migration contract       | Fixed, then read from source: the API migrates at its own start; its Deployment was read on 2026-11-22, so A18 waits on no answer |
| Receipts that publish messages                                              | Fixed: tasks 0.4, CI-0.3 and PG-0.3 record dated decisions with their owner, in neutral words                                     |
| A telemetry receipt in stage 2, before the receiver exists                  | Fixed: moved from CI-A2 to A14                                                                                                    |
| The drill's policy allowed SQL and storage, but it creates a `Cluster`      | Fixed in `host-postgres`: the API server and DNS for the drill, a Role for `Cluster` objects in its namespace                     |
| Dev deferred with no executable milestone                                   | Fixed: step A25 is the follow-up's first deployment into the reserved namespaces                                                  |
| A pull h1claw made standing in for the final backup                         | Fixed: the final backup is taken from the stopped store; an earlier copy only at an equal digest (decision 7)                     |
| A gate and a build in two namespaces kept apart by a namespace's quota      | Fixed: one mutex both templates name in the `-build` namespace; its overlap is rehearsed (CI change)                              |
| Every finished Workflow reported, the report included                       | Fixed: a filter on the `template` label and phase; the report is named after the Workflow's UID                                   |
| A prior per-app commit required of an empty pins repository                 | Fixed: A23 seeds a baseline for each app before the App exists                                                                    |
| Freshness compared with the tip of `main` though only app merges build      | Fixed: the latest commit that touches the app's source paths; an unrelated merge starts nothing                                   |

Read for this pass: `libs/wbs/adapters/store-sqlite/src/user.ts`, where an account is
written outside `event_log`; `docs/infra/cutover-plan.md`, whose `event_log` test this plan
therefore does not rely on; `infra/controller/Containerfile`, whose comments record two
builds that came out equal; and Argo Workflows' synchronization guide and types at the
pinned tag (the CI change's verify.md). Not verified: that `sqlite3 .dump` of an unchanged
store is byte-identical between two readings on the two hosts' `sqlite3` versions; A18's
first comparison, made before any edit, shows it, and a difference there stops the step.

## Three items closed after the merge (2026-11-22)

The merged plan left three things to named owners. Each is now designed, or a stated limit
with its condition. Nothing was changed on a host; one read-only reading was taken.

**MLflow's layout, read on the observability host on 2026-11-22, read-only.** MLflow v3.7.0
runs as one Compose service, started as `mlflow server` with
`--backend-store-uri=sqlite:////mlflow/mlflow.db`, `--default-artifact-root=/mlflow/artifacts`
and `--artifacts-destination=/mlflow/artifacts`. One named volume is mounted at `/mlflow`
and holds both. `mlflow.db` was about 1.07 GB. `/mlflow/artifacts` existed and held no
file. Slice 3.6 and A15 are written for that layout, and A15 reads it again before it
moves anything. In MLflow's source at that tag, `mlflow/store/db/utils.py` builds an
Alembic configuration, leaves out tables named `alembic_` when it lists its own, and
refuses an out-of-date schema in `_verify_schema`; `mlflow/store/db_migrations/alembic.ini`
sets no version table, so the revision is in Alembic's default table, `alembic_version`.
That table was not read on the store itself.

**How the website applies migrations, read in this repository.**

| Fact                                                                                                                                                      | Where                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The API opens the store at start; nothing else migrates                                                                                                   | `apps/website/be-01/src/server.ts:341`; `docs/website/request-retention.md:9`       |
| The constructor makes the ledger `schema_migration` and runs each catalogued migration the ledger lacks, in one immediate transaction with its ledger row | `libs/website/adapters/store-sqlite/src/store.ts:236-259`                           |
| An applied migration whose bytes changed stops the start                                                                                                  | `store.ts:246-248`                                                                  |
| The catalogue is fourteen named directories, each read for `migration.sql` and `down.sql`                                                                 | `migration-catalogue.ts:4-39`; `store.ts:240-241`                                   |
| A store that a newer release migrated additively still starts                                                                                             | `migration-rollback.test.ts:59-76`                                                  |
| Every `down.sql` restores the exact schema before it, in a test; no command applies one                                                                   | `migration-rollback.test.ts:27-40`; no caller outside tests                         |
| Maintenance commands open an existing file read-only or validated and refuse anything but the image's exact migrations and schema                         | `checked-database.ts:56-88`, `:96-110`                                              |
| The lock wait is bounded at five seconds, for two processes on one file                                                                                   | `checked-database.ts:21-22`; `store.ts:233-234`                                     |
| The migration lint runs on the store's path                                                                                                               | `lefthook.yml:27-29`                                                                |
| The request app is a browser application with no store                                                                                                    | `apps/website/fe-01/package.json:2`; no `bun:sqlite` under `apps/website/fe-01/src` |

**The website's Deployment, read on 2026-11-22** from the main branch of the private fleet
repository, by the planning session; nothing of it is copied here but these facts. The
website API runs one replica with the `Recreate` strategy, selects the `product`
capability, mounts one 2 GiB `ReadWriteOnce` claim of the retaining class, takes a snapshot
of the store in an init container before it starts, and is probed on `/health`. The site
and the app run one replica each and hold no store. Consequence, in design decision 9:
never a second writer during an automated staging sync, and a backup before every start;
A18's website part no longer waits on its owner for strategy and replica count. What
stays with that owner is the new cluster's staging directory for the website (R11).

**The WBS backend's identity, read on 2026-11-22 from source.** The backend's health
document is at `/health` (`libs/wbs/domain/contracts/src/http/infrastructure-shapes.ts:30`;
the probes in `deploy/k8s/wbs/base/backend.yaml`). The staging overlay's Ingress routes `/`
to the frontend and the `/api` prefix to the backend, and names the ACME staging issuer
(`deploy/k8s/wbs/overlays/staging/ingress.yaml`). So a read of `/health` on the staging
name reaches the frontend, and its certificate does not chain to a public root. Slice 3.9
adds a backend route under the API prefix and slice 3.5 names the public-name issuer.

**The schema path for WBS staging, from source and Argo CD's documentation.** Read:
`AGENTS.md` (Migrations); `apps/wbs/be-01/src/migrate-capabilities-cli.ts`,
`migrate-status-cli.ts`, `migrate-cli.ts`, `migrate-down-cli.ts` and
`migrate-capture-digest-cli.ts`; `deploy/k8s/wbs/base/backend.yaml` (startup migrations
off, `Recreate`, the writer label) and `storage.yaml` (`ReadWriteOnce`);
`tools/tool-deploy/src/k8s/execute.ts` (the schema Job's manifest and script);
`infra/platform/policy/trusted-workloads.yaml` (account, controller label, selector and
digest list for every pod of the solver namespace); `docs/infra/deployment.md` (the release
transaction, which suspends a Flux unit). In Argo CD's `docs/user-guide/sync-waves.md` at
v3.6.2: `PreSync` and `PostSync` hold hooks only; a `Sync` hook runs with the application
of the manifests; resources are ordered by phase, then wave, then kind and name, and the
next wave is applied when the one before is in sync and healthy; a failed hook marks the
operation failed; a hook without a delete policy is treated as `BeforeHookCreation`; and
a hook Job should carry no `ttlSecondsAfterFinished`. In `docs/user-guide/auto_sync.md` at
that tag: a retry policy exists, and the page states both that a failed sync of the same
commit is not attempted again and that with self-heal it is attempted again after the
self-heal timeout. Not verified: which of the two holds; that a `Sync` hook in wave -1
finishes before a Deployment in wave 0 is applied on this version; and that the hook's pod
and the serving backend hold the claim together on one node. Slice 3.9's rehearsal case
shows all three, and its stop keeps schema changes attended if one fails.

A review of that closing pass by Codex (`gpt-6.2-astra`, high effort, on 2026-11-22) found
the MLflow and website items closed and seven defects in the staging schema hook, all
folded here:

| Finding                                                              | What was read                                                                                                                                                                                       | Now                                                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The attended removal ran `--to` on a stamp before reading the ledger | `libs/wbs/adapters/store-sqlite/src/migrate-down.ts` (`migrationsToRollback`: every applied migration stamped after the baseline); `20260817130000_add_actual/down.sql` (drops `actual`)            | Fence, fresh backup, the two sets compared before any SQL, destructive statements on tables with rows to the owner (decision 9) |
| The hook skipped the coordinator's boot preflights                   | `tools/tool-deploy/src/k8s/execute.ts` (the two CLIs before the snapshot; `CAPTURE_ENV_FROM`); `apps/wbs/be-01/src/boot.ts` (refusal on an activated store); `backend.yaml` (`Recreate`, `envFrom`) | Both preflights on every run with the backend's own `envFrom`                                                                   |
| Exclusive access; ledger equality as the only proof                  | `execute.ts` (`writerPods` refusal); `libs/wbs/adapters/store-sqlite/src/db.ts` (busy timeout); `AGENTS.md`, Migrations                                                                             | SQLite's lock, stated with its cost; an acknowledged concurrent edit read in the rehearsal                                      |
| A retry of the same candidate recaptured partial progress            | slice 3.9 as it stood                                                                                                                                                                               | A record is never recaptured and never ends in exit 0                                                                           |
| The hook ran at bootstrap and during a hold                          | A18's order: the first sync precedes the restore                                                                                                                                                    | No hook in a zero-replica render; rule 2.4(w) holds both directions                                                             |
| No room counted for the snapshots                                    | `deploy/k8s/wbs/base/storage.yaml` (5 GiB); the dev store's 2.2 GB                                                                                                                                  | Staging's claim at 16 GiB; a free-space floor in the hook; disk minimums 233 and 90 GiB                                         |
| The rehearsal refused an added migration                             | slice 2.7                                                                                                                                                                                           | It refuses an edited one                                                                                                        |

Not verified: that the two preflight CLIs need nothing beyond the backend's `envFrom`
on the new cluster's overlay, which slice 3.5's owner renders; the busy timeout's length
against a real migration of the tracker; and the drizzle migrator's transaction
boundaries, on which the survival of a concurrent edit rests. The rehearsal reads the
last two.

## Rancher and the servers that exist (2026-11-22)

**What the first pass changed.** R54 and R55 are new; R2, R3, R17, R47, R49 and R52 are
reworded; decision 14 is new, and decisions 1, 2, 3, 5, 6, 7, 9, 11, 12 and 13 are amended;
slices 1.9 and 2.11, rules 2.4(x) and (y), and steps A26 to A28 are new; A1, A3, A4, A6,
A7 and A24 are amended; two requirements are new and one is amended. `h5plat` reads
`m1plat1` throughout, in this change and in `host-postgres`, whose platform-node margins
are recounted. No host was read or changed, and nothing outside the plan files.

**The servers, as the owner stated them.** m1plat1: 8 vCPUs, 32 GB, 200 GB, Ubuntu
26.04.1, 10.10.1.11, `free -g` showing 31 GiB, no host firewall, public SSH closed in the
panel firewall. m2bast1: 1 vCPU, 2 GB, 10.10.1.12; a `jump` user with no shell and a
`PermitOpen` of each server's private address and port 22; nftables admitting SSH in and
sending anything out. The private network 10.10.1.0/24 has an MTU of 1442. The panel
firewall refuses outbound traffic it does not allow once attached. The provider, the
public addresses and the prices are not written here.

**Read on 2026-11-22 for Rancher.**

| Read                                                                                                                                                                                                                                                                                                                                     | Where                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Twelve version lines; the newest is 2.15.x, whose newest page is v2.15.3                                                                                                                                                                                                                                                                 | https://www.suse.com/suse-rancher/support-matrix/all-supported-versions/                |
| "Supported Kubernetes Platforms for Rancher Manager": k3s lowest v1.34, highest v1.36; downstream K3s 1.34 to 1.36 provisioned and imported; Ubuntu 26.04 listed for K3s provisioned through Rancher; minors only, no patch builds                                                                                                       | https://www.suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-v2-15-3 |
| The same table for v2.14.7: k3s v1.33 to v1.35                                                                                                                                                                                                                                                                                           | https://www.suse.com/suse-rancher/support-matrix/all-supported-versions/rancher-v2-14-7 |
| The stable chart index: chart 2.15.3, app v2.15.3, created 2026-10-29, `kubeVersion: < 1.37.0-0`; 2.15.2 and 2.15.1 before it                                                                                                                                                                                                            | `https://releases.rancher.com/server-charts/stable/index.yaml`                          |
| GitHub releases: v2.15.3 published 2026-10-29, not a prerelease; v2.14.7 the same day                                                                                                                                                                                                                                                    | the `rancher/rancher` releases API                                                      |
| The archive `rancher-2.15.3.tgz`: SHA-256 `343888c66421a9f5666b562cdfeca751d63da994edbe7b1b36752f8ffcf5ecd4`                                                                                                                                                                                                                             | downloaded to a scratch directory, not committed                                        |
| `values.yaml`: `replicas: 3` by default; `networkExposure.type` `ingress`, `gateway` or `none`; `ingress.enabled`; `tls` `ingress` or `external`; `useBundledSystemChart`; `bootstrapPassword`; `extraTolerations`; `extraNodeSelectorTerms`; `webhook` and `fleet` values handed to those charts; `postDelete.enabled`; `resources: {}` | the archive                                                                             |
| `templates/secret.yaml` renders `bootstrap-secret` only when a password is in the values or found by `lookup`; `templates/deployment.yaml` sets `CATTLE_BOOTSTRAP_PASSWORD` only when the value is set; the default toleration is `cattle.io/os=linux` alone                                                                             | the archive                                                                             |
| `templates/ingate/issuer-rancher.yaml` renders a cert-manager Issuer only when TLS is not external and the source is `rancher`; the cert-manager check is a warning under `helm template`                                                                                                                                                | the archive                                                                             |

**Not read on the first pass**, and read on the second where the review table below says
so: Rancher's source for the bootstrap password, its system charts and its webhook. Still
not read: which charts `useBundledSystemChart` covers on 2.15; Rancher's upgrade path
between minors; its memory on this cluster. Decision 14 and slice 2.11 name what shows
each.

**Budget arithmetic.** 32,768 × 15,602 / 16,384 = 31,204 MiB. Platform limits 8,554 +
4,096 = 12,650; with reservations of 2,816, 15,466; margin 15,738. With `host-postgres`'s
512, 2,304 and 256: 12,666 while the dump runs; with its drill's 1,280 as well: 11,386.
On 15,602 the same rows would have left 136 before `platform-db` and been 2,936 short
with it. Disk: (40 + 30 + 30 + 10 + 30 + 5) / 0.8 = 181.25, so 182 GiB; 200 × 10⁹ bytes is
186.3 GiB.

**Set by the planning session on this pass, for the owner to overrule.** R55 in its
second form, one SSH rule through the bastion with the tailnet carrying no SSH; Rancher's
chart version, unit, values, order, budget and Fleet rules (R54's assumed part); the
browser shell left unused; the names of the servers not yet bought left as placeholders;
that a rehearsal on m1plat1 is followed by a reinstall rather than a new server (A1); the
5 GiB for Rancher's images, the 182 GiB floor and its 169 GiB exit.

**A review of that pass** (an independent reviewer, 2026-11-22) found three S1, twelve S2
and several S3 findings; each was checked against the sources below before it was folded
in.

| Finding                                                                                       | What was read                                                                                                                                                                                                                                                                                                   | Now                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The chart's pre-upgrade hook Job has no placement; Argo CD runs it as `PreSync` on every sync | `templates/pre-upgrade-hook-job.yaml` (no toleration, selector or affinity; `helm.sh/hook: pre-upgrade`); `scripts/pre-upgrade-hook.sh` (looks for RKE1 resources only)                                                                                                                                         | A kustomize unit deletes the five hook objects; rule 2.4(y) refuses a hook pod without placement; the rehearsal runs on a tainted server alone first                                                                                          |
| 6443, 10250 and 8472 had been widened to the whole private range                              | `roles/network/templates/k3s.nft.j2` (`@enrolled_ipv4`; input policy accept)                                                                                                                                                                                                                                    | The enrolled set stays; the bastion reaches TCP 22 alone; slice 1.8's negatives                                                                                                                                                               |
| Rancher starts pods its values do not place                                                   | `pkg/controllers/dashboard/systemcharts/controller.go` (webhook, remote dialer proxy, Turtles, system-upgrade-controller; values merged from `rancher-config` by chart name); `pkg/api/steve/clusters/shell.go`; `pkg/catalogv2/helmop/operation.go`; `fleetcluster.go`                                         | Turtles off, the shell refused at admission, placement forced at admission and checked by health, read again after A13 and A17 (the second review below corrected the first fold-in's `rancher-config` keys and hand-set agent customization) |
| Rancher can upgrade k3s                                                                       | `pkg/settings/setting.go` (`imported-cluster-version-management` defaults to true; a setting is read from `CATTLE_` and its name); the version-management controller; the system-upgrade-controller's enablement                                                                                                | Version management off by variable; health on upgrade plans and kubelet versions                                                                                                                                                              |
| Fleet's GitOps runs by default                                                                | `pkg/features/feature.go` (`continuous-delivery` and `turtles` default on)                                                                                                                                                                                                                                      | `features: continuous-delivery=false,turtles=false`; health on `HelmOp` and foreign `Bundle`s                                                                                                                                                 |
| The webhook is fail-closed for Namespace writes                                               | webhook v0.11.4 `pkg/admission` (failure policy `Fail`) and `pkg/resources/core/v1/namespace` (create and update outside `kube-system`); Rancher `pkg/ext` (`APIService` `v1.ext.cattle.io`)                                                                                                                    | Order note, alert, runbook step, removal order                                                                                                                                                                                                |
| TLS of the interface                                                                          | Tailscale's pages "Kubernetes operator cluster ingress" and "Expose a workload at layer 7", read 2026-11-22: an Ingress of class `tailscale`, a MagicDNS name with a valid certificate from Let's Encrypt, served on 443, the example backend on port 80; ports, backend protocol and websockets are not stated | A Tailscale-class Ingress in the `rancher` unit to port 80, `tls: external`                                                                                                                                                                   |
| A tailnet SSH path beside the bastion                                                         | the plan's own R17, R47, R52                                                                                                                                                                                                                                                                                    | One SSH rule (R55), `add-agent-hosts` amended, two keys                                                                                                                                                                                       |
| An interim API forward no step used                                                           | the plan                                                                                                                                                                                                                                                                                                        | Removed                                                                                                                                                                                                                                       |
| A26 without a way back                                                                        | the plan                                                                                                                                                                                                                                                                                                        | After the first 1.3 and two console logins; a timed restore cancelled by a second session; the host drop proved with counters                                                                                                                 |
| A24 still added a temporary rule                                                              | the plan                                                                                                                                                                                                                                                                                                        | The console repairs the bastion path; no rule                                                                                                                                                                                                 |
| No MTU input                                                                                  | the plan; the k3s templates                                                                                                                                                                                                                                                                                     | `puni_private_mtu` with a preflight assert; a do-not-fragment ping in A13                                                                                                                                                                     |
| Rule (y) and the bastion lacked negatives per item                                            | the plan                                                                                                                                                                                                                                                                                                        | One per item; an exact {22}; an earlier drop-in fixture                                                                                                                                                                                       |
| The disk was compared in rounded GiB                                                          | the plan                                                                                                                                                                                                                                                                                                        | Bytes, the filesystem's size; the 169 GiB exit                                                                                                                                                                                                |
| The bootstrap Secret is read first                                                            | `pkg/data/management/bootstrap_password.go` (Secret first, then the variable, else generated and written)                                                                                                                                                                                                       | The ExternalSecret plus `secretKeyRef`, which holds the pod until the Secret exists                                                                                                                                                           |
| The chart's PriorityClass is 1,000,000,000                                                    | `templates/priorityClass.yaml`                                                                                                                                                                                                                                                                                  | Deleted; the plan's class below the default                                                                                                                                                                                                   |
| The provider's name in the branch name                                                        | `git log`, the branch                                                                                                                                                                                                                                                                                           | A new branch and pull request                                                                                                                                                                                                                 |

Pushed back on, with the reason: the disk comparison uses the filesystem's size and not
the space available, because the floor's 30 GiB for the system already counts what the
installed system uses, and comparing what is available would count it twice.

**Not read on this pass.** The Tailscale operator's backend protocol for a port named
`https` and its websocket support; whether a Helm operation's pod can run on the tainted
server alone; the exact field names of `fleetAgentDeploymentCustomization`, from memory;
whether a negative PriorityClass value is admitted, believed from the Kubernetes API's
type.

**A second review** (2026-11-22, of `6e406410f`) found one S1, five S2 and several S3
findings. Each was checked against the unpacked Rancher v2.15.3 source before it was
folded in.

| Finding                                                            | What was read                                                                                                                                                                                                                                                                                                                                                                                                       | Now                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The bastion rule in the input hook does not stop forwarded traffic | `roles/network/templates/k3s.nft.j2` (input hook only)                                                                                                                                                                                                                                                                                                                                                              | Two prerouting rules before destination NAT: the bastion reaches TCP 22 to the host alone; a non-enrolled source reaches no pod, ClusterIP or NodePort, two exceptions by name; a rehearsal negative with a routed stand-in host |
| The remote dialer proxy never runs                                 | `templates/deployment.yaml` (`IMPERATIVE_API_DIRECT="true"`); `pkg/ext/rdp.go` (`RDPEnabled` is true only when the variable is not "true")                                                                                                                                                                                                                                                                          | Its `rancher-config` key and the system-upgrade-controller's are dropped; rule 2.4(y) holds the variable at "true"                                                                                                               |
| Detection only, for shell pods and placement                       | `pkg/api/steve/clusters/shell.go` (`GenerateName: "dashboard-shell-"`, namespace `cattle-system`); Kubernetes' admission-controllers page on `PodNodeSelector` (alpha since v1.5, disabled by default, namespace annotation `scheduler.alpha.kubernetes.io/node-selector`, a conflict is refused, no deprecation); k3s' server CLI page (`--kube-apiserver-arg` passes flags; default admission plugins not listed) | A shell denial and `PodNodeSelector` on three annotated namespaces, with a mutating policy as the fallback if k3s does not accept the flag (rehearsal); a kube-state-metrics alert                                               |
| Helm operation pods were said not to tolerate `CriticalAddonsOnly` | `pkg/catalogv2/system/system.go` (`AutomaticCPTolerations`, control-plane taints added when no tolerations are given); `pkg/catalogv2/helmop/operation.go` (`AddCpTaintsToTolerations`)                                                                                                                                                                                                                             | Corrected: they tolerate it on m1plat1                                                                                                                                                                                           |
| A hand-set Fleet agent customization                               | `pkg/cluster/agent_customization.go` (`GetFleetAgentAffinity` falls back to `fleet-agent-default-affinity`); `pkg/settings/setting.go` (the setting; `CATTLE_` and the name read from the environment); `fleetcluster.go` (control-plane taints for the local cluster)                                                                                                                                              | `CATTLE_FLEET_AGENT_DEFAULT_AFFINITY` in the values; A27 edits no Rancher object                                                                                                                                                 |
| The MTU assert ran after the role had set the link                 | `roles/network/tasks/main.yml` (`puni_private_mtu` required, at least 1280; a unit sets it)                                                                                                                                                                                                                                                                                                                         | The role asserts before it changes the link; preflight first in A26; the timer restores the MTU too                                                                                                                              |
| `rancher` did not need `namespaces` and `policy`                   | the order table                                                                                                                                                                                                                                                                                                                                                                                                     | Both added; A27 syncs them in order                                                                                                                                                                                              |
| Turtles off has a cost                                             | `pkg/rancher/rancher.go` (a warning that provisioning will not work)                                                                                                                                                                                                                                                                                                                                                | Recorded; A27 reads `CATTLE_FEATURES` and the namespace's absence                                                                                                                                                                |
| Session lifetime                                                   | `pkg/settings/setting.go` (`auth-user-session-ttl-minutes`, `auth-user-session-idle-ttl-minutes`, both 960 by default)                                                                                                                                                                                                                                                                                              | Both at 720                                                                                                                                                                                                                      |

Not changed: the reviewer accepted the size-against-floor comparison, the 169 GiB exit,
the −10 class, the 720-minute lifetimes and the deletion of the hook objects.

**A third review** (2026-11-22, of `b20a90128`) found three S2 and five S3 findings, all
folded in after a check:

| Finding                                            | What was read                                                                                                                                                                                                                            | Now                                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing put `PodNodeSelector` on m1plat1 before A3 | k3s `pkg/daemons/control/server.go` (`enable-admission-plugins=NodeRestriction` set by k3s) and `pkg/util/args.go` (a plain argument replaces the default, `+=` appends, each value emitted as its own flag), as fetched by the reviewer | The `+=` entry moves to slice 1.2, gated on `platform-services`, with negatives for `=` and for the old inventories; A27 reads the running arguments and a `--dry-run=server` pod |
| The prerouting drops were stateless                | the plan                                                                                                                                                                                                                                 | A chain at −150 that accepts established and related traffic first; drops match new connections; negatives for a server's connection to the bastion and its outbound traffic      |
| The prober's address is shared by masqueraded pods | the plan                                                                                                                                                                                                                                 | Egress default-deny for non-production with no allow to 10.10.1.12, held by rule 2.4(k); a host-network prober would not help                                                     |
| `PodNodeSelector` refuses only a same-key conflict | Kubernetes' admission-controllers page, read in the second pass                                                                                                                                                                          | Spec and slice reworded; a true conflict negative                                                                                                                                 |
| The mutating fallback's API version                | Kubernetes' mutating admission policy page, read 2026-11-22: stable and on by default since v1.36, `admissionregistration.k8s.io/v1`, no `runtime-config` flag                                                                           | Named in decision 14                                                                                                                                                              |

Also applied: the shell denial matches `metadata.generateName`; the controller mount for
`bastion.yml` carries the bastion's admin key; the idle session lifetime is 60 minutes, the
reviewer's figure, for the owner to overrule. A finding of this pass's own: the public
drop of slice 1.8 sat in the prerouting hook without a state match, which would have
dropped the replies to a server's outbound traffic; it now matches new connections only.

**A fourth review** (2026-11-22, of `adc0c7793`) gave the verdict "ready as a plan", with
four S3 wording fixes, all applied: slice 1.2's old-inventory negative now asks for no
`kube-apiserver-arg` entry, since every server gains `etcd-expose-metrics`; rule 2.4(k)
defines the non-production egress clause in slices 2.4 and 2.10, with "covers" defined and
the bastion's address read from the inventory, and a spec scenario; the prerouting chain
drops `ct state invalid` after accepting established and related traffic, and its other
drops stay on new connections because IPv6 neighbour discovery on the public interface is
not tracked; the spec says "new connections" from the bastion's address. The reviewer also
confirmed, in the Kubernetes and k3s sources it fetched, that `PodNodeSelector` is still
registered in v1.36.0 (`k8s_plugins.go`), that `--enable-admission-plugins` is a string
slice, so the repeated flags accumulate (`k8s_apiserver_opts.go`), and the k3s paths
`pkg/daemons/control/server.go:264` and `pkg/util/args.go:27`; the plan says so.
