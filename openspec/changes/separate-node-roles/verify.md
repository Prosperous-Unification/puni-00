# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
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

No check exists yet, so there is nothing to break. Each slice that adds a check names the fault
it must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

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

Set for him by the planning session, each with its alternative in design.md, for him to
overrule by id: R34 (dev's delivery is a follow-up), R35 (the CI cluster is one trust zone),
R49 (break-glass by the provider's console), R50 (the CI server's size), R51 (no public
webhook), R52 (Tailnet Lock, `sshd` login), and the controller on the operator's laptop only
(decision 10).

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

| Finding                                                                                   | Outcome                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Going back after the new writer accepted edits                                            | Fixed: decision 7's rule, the comparison in A18, the rollbacks of A15 and A18 to A20, a requirement        |
| MLflow backed up by the apps' runner                                                      | Fixed: its own custody (slice 3.6), a reading first and a whole restore with a checked artifact (A15)      |
| h1claw deletable before its receipts; h4claw's inventoried container                      | Fixed: the same receipts whenever it is deleted; a signed list per retirement step (A21, A22, AH-A3)       |
| The trigger key readable from any branch; a gate at a chosen commit                       | Fixed: an environment that admits `main` only; the trigger identity cannot start a gate (CI change)        |
| The new cluster's keys on a host where gate code is root                                  | Fixed: the controller is the operator's laptop only (decision 10); the h2puni option is removed            |
| Automatic staging without the schema Job                                                  | Fixed by refusal: a source commit that changes the migration set is not published automatically            |
| CI stage ordering; inventory group; sync and rules for the `ci` project; network paths    | Fixed: CI-S2's inventory after A9, rules 2.4(a), (c) and slice 2.5 extended, two paths named (decision 12) |
| The gate submitted where its pod may not run; a Secret in the build namespace             | Fixed: the gate's template and Workflows are in the `-build` namespace; `report-status` posts the result   |
| Tailnet Lock and devices the operator makes; the CI cluster's route to the store          | Fixed: a signing action per step, a fallback that keeps the lock, the private listener named               |
| Conversation quoted in a public repository; review histories                              | Fixed: decisions are stated and dated; histories are removed from the four verify files                    |
| Private addresses in the public inventory                                                 | Kept as decided on 2026-11-21 (R5), with its alternative, a private inventory; no new kind of identifier   |
| The telemetry gateway's NodePorts against the ban; a forwarded port on a public interface | Fixed: a drop before destination NAT (slice 1.8), the ban in every project, two exemptions by name         |
| SQL flows of the dump and drill jobs; isolation proved by a refused listing               | Fixed in `host-postgres` and in A18: the two flows allowed, a read refused by authorisation                |
| A late build replacing a newer render                                                     | Fixed: the render step refuses a source commit that is not a descendant (slice 3.7)                        |
| Automatic staging for two apps left to another owner; empty dev namespaces                | Stated: one milestone per app with a recorded waiver where the path does not exist; dev is the follow-up   |
| A build beside a gate against "waits behind"; pod priority and the kernel's kill          | Fixed: a build waits in phase 1, by quota (CI change, decision 5)                                          |
| No fallback if the gate cannot run in a pod                                               | Fixed: the host form of the gate, started by a Workflow (CI change, decision 6)                            |
| No alert before the trigger key expires or for a stale pin                                | Fixed: slice CI-S9                                                                                         |
| Rule letters, the console password, policy rows for operator tags, a single signer        | Fixed in place                                                                                             |

Not changed, with the reason: nothing was found wrong against source in either review.
