# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
read or run while writing the plan, on 2026-11-21, in a worktree at `origin/main` `b17861f83`.

## Replaced drafts

1. Commit `6ec66e655` planned an in-place migration with assumptions N1 to N14: a new node
   joined the running cluster, Flux and cert-manager moved to it, and the control plane
   followed by a snapshot restore. The owner then changed the premise: the cluster is recreated
   from scratch.
2. Commit `cf86bd350` planned that rebuild on Flux with assumptions R1 to R18 and a staged,
   reversible switch. A review at that commit returned "not ready" with three findings of the
   first rank. The owner then made two more decisions:
   - "For the new from scratch plan let's use the ArgoCD", and that the cluster is rebuilt the
     way it is meant to be built, with nothing carried over for its own sake.
   - "we can make the switch unsafe that's ok / no prod users yet".

The third draft, commit `d5cef1bfd`, keeps the R ids that still mean what they meant. Reworded
then: R1, R2, R5, R6, R8, R10, R12, R13 and R17. Withdrawn: R14 (the old side kept for 14 days)
and R18 (certificates cross as Secrets). New then: R19 to R27. Attended steps were renumbered
A1 to A22 and agent slices grouped in three phases.

A second review read `d5cef1bfd` and returned "not ready" with two findings of the first rank
and nine of the second. This revision answers it. Changed: R2 (disk floor), R12, R13, R17, R20
(the cluster follows `main`; the deploy branch is gone), R22 (count), R23, R25 (the taint).
New: R28 and slice 3.5. The unit table then had thirteen waves. Attended steps keep their
numbers.

A third review read `54825ed5d` and returned "not ready" with no finding of the first rank and
six of the second. This revision answers it. Changed: R20 (what guards `main`, and the
`delivery` rules inside a required check). No assumption is new. The unit table has fourteen
waves: Harbor moved to a last wave of its own and `signals` moved one wave later. Open
question 14 and design decision 10 are new. Slices and attended steps keep their numbers.

## First review (at `cf86bd350`) and what became of its findings

Outcomes as the third draft recorded them. The second review, below, revised several: the
disk floor is 180 GiB, the taint and the h1claw pulls changed, and wave numbers moved.

| Finding                                                             | Outcome                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 website cut-over without a freeze; one backup prefix           | Fixed: A19 stops the old writer, suspends its backup job and reconciler, restores one named stamp; own prefix (guard 3, slice 3.1) |
| S1-2 dev WBS and MLflow lose their backup                           | Fixed: A11 and A16 re-point h1claw's pull and need the first verified set from the new host (R13, guard 6)                         |
| S1-3 a pin advance on the old cluster could prune its registry      | Moot by design: no path the old cluster reconciles is edited (R21, spec requirement, slice 2.4's closure check)                    |
| S2-4 shared Flux overlay and cert-manager stage break workers, labs | Moot by design: the old slices 1.3 and 1.5 are gone; the new tree is separate                                                      |
| S2-5 unpinned workloads beside the secret store                     | Fixed with both: a platform taint (R25, slice 1.2) and a selector check with overlay patches (slice 2.4)                           |
| S2-6 staged joins cannot run as written                             | Fixed: create, then the 1.3 revision, then `firewall.yml` on existing members, then join (A13/A14, A17/A18)                        |
| S2-7 secrets and fleet source incomplete                            | Fixed: the secret table of design decision 5, namespaces before Secrets, the fleet Application in wave 9                           |
| S2-8 CI ordering and scope                                          | Fixed: stacks measured before pool init (A9, A10); the CI role defined as branch code; jump on h5plat (R17); A21/A22 need A10      |
| S2-9 hard-coded observability source binding                        | Fixed: slice 1.5                                                                                                                   |
| S2-10 observability disk not sized                                  | Fixed: 173 GiB floor decided before creation (R2, A13), growth measured in A15                                                     |
| S2-11 how carried certificates are created                          | Moot under R26: certificates and ACME accounts are issued anew after DNS                                                           |
| S3 keep `letsencrypt-staging`                                       | Fixed: slice 2.3                                                                                                                   |
| S3 slices without a named fault                                     | Fixed: every slice that adds a check names one; the header says so                                                                 |
| S3 A6 omits preparing the temporary server                          | Fixed: A7                                                                                                                          |
| S3 probes miss the CI host                                          | Fixed: slice 3.2                                                                                                                   |
| S3 the rehearsal names no host                                      | Fixed: slice 2.7                                                                                                                   |
| S3 unlimited preflight fails on h8ci                                | Fixed: every play is limited (tasks.md header)                                                                                     |
| S3 new etcd bucket needs versioning and lifecycle                   | Fixed: A6                                                                                                                          |
| S3 A16 lacks its fields                                             | Fixed: A20                                                                                                                         |

Made moot by the unsafe switch (R26), beyond S2-11: testing against the ingress address before
DNS, lowered record TTLs, the certificate carry-over rehearsal, and the 14-day retention of the
old side. What R26 does not relax is design decision 7's list of guards.

## Second review (at `d5cef1bfd`) and what became of its findings

| Finding                                                             | Outcome                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 WBS production loses its backup between A11 and A20            | Fixed: the h2puni pull stays until A22; the CI host gets a second set; freshness is judged per set (R13, guard 6, A11, A22)             |
| S1-2 wave 3 reads a Secret that arrives in wave 4                   | Fixed: waves re-derived from what each unit reads; the `otel-server` pair is its own unit one wave after its Secret (design decision 3) |
| S2-3 node agents contradict the taint rule                          | Fixed: a named exemption for three DaemonSets, with a negative for a fourth (design decision 1, slice 2.4(f), spec)                     |
| S2-4 k3s system pods do not tolerate a custom taint                 | Fixed by a simpler choice: `CriticalAddonsOnly=true:NoSchedule`, which the packaged components tolerate. Read, see "k3s behaviour"      |
| S2-5 the deploy branch cannot enforce "a gated commit of `main`"    | Removed by a simpler rule: the cluster follows `main` and the pull-request rules are the control (R20, task 0.6). Rollback is a revert  |
| S2-6 Flux-only apply semantics lost in render-equal copies          | Fixed: the inventory table in design decision 3, checks 2.3 and 2.4(i), rehearsal items (i)                                             |
| S2-7 A20 needs a Flux unit                                          | Recorded as a gap with an owner: slice 3.5 and R28; A20 cannot start before it                                                          |
| S2-8 waves order only the root's sync; break-glass is reverted      | Fixed: stated in design decision 3 and the spec; retry with backoff on every Application; break-glass disables the root first           |
| S2-9 projects and cluster-scoped resources; the root's own project  | Fixed: `apps` admits `ClusterIssuer` only; the playbook applies both AppProjects with the root (slice 2.5)                              |
| S2-10 A7 powers off the jump                                        | Fixed: the fallback jump is the target's own public SSH endpoint, which `k3s.nft.j2` keeps open (R17, A7)                               |
| S3 disk floor                                                       | Fixed: (114 + 30) / 0.8 = 180 GiB, against eviction at 10% and 15%                                                                      |
| S3 Traefik in an early wave                                         | Fixed: its Application lands with the production apps node (wave 11, A18); nothing earlier needs it                                     |
| S3 `argocd-secret` and server-side apply                            | Fixed: `ServerSideApply=true` on the `argocd` Application; rehearsal (d) asserts the hash and keys; fallback stated                     |
| S3 scenarios without negatives; one fault for several checks        | Fixed: slices 2.1, 2.4 and 3.1 name a negative and a fault per check                                                                    |
| S3 step fields                                                      | Fixed: A17 has a Stop; A21 and A22 need the pool owner's word and open question 8; guard 2 and task 0.5 name the same four secrets      |
| S3 app secrets, the seal key, the count                             | Fixed: the owner writes app Secrets into OpenBao in A19 and A20; the playbook's second run is tested (slice 2.5); the count is fifteen  |
| S3 chart lock                                                       | Fixed: one entry per chart version; a bump adds, never rewrites                                                                         |
| S3 data claim overstated                                            | Fixed: operator-created claims are named, their custom resources carry the options, and what delivery cannot protect is stated          |
| S3 hygiene: a quote, a location, new ids and addresses              | The quote is paraphrased and the location removed. Ids and addresses: disputed in part, see below                                       |
| S3 task 0.1 lets 2.7 start early; A9 restores production data on CI | Fixed: 2.7 follows 2.1 to 2.5; A9 and A11 restore the dev members only                                                                  |

Disputed in part: that slice 1.3 must not publish machine ids and private addresses. The fleet
model needs both in `infra/fleet/desired.yaml` and the inventory (`desired.yaml:21,26`,
`production-existing-hosts.yml:22-26,41-44` carry them for the two existing nodes), and
`require-enrollment-identity.yml` compares them at enrollment. Slice 1.3 follows that
convention and keeps public addresses and provider ids out of the repository. Whether the
inventory should move to the private repository first is open question 13.

## Third review (at `54825ed5d`) and what became of its findings

| Finding                                                             | Outcome                                                                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 the enrollment patch drops CoreDNS's packaged toleration       | Fixed: slice 1.2 makes the play append the enrollment toleration, with a negative for a replaced list. Dropping the taint is no longer an automatic fallback    |
| S2-2 nothing creates the identity ConfigMap                         | Fixed: `argocd.yml` creates it when absent and refuses another id (slice 2.5)                                                                                   |
| S2-3 the WBS first start against the root's self-heal and rule (b)  | Fixed: the root ignores `/spec/syncPolicy` of `wbs` only; rule (b) exempts that one Application and refuses any other; rehearsal (n)                            |
| S2-4 a restore into a claim a running Deployment holds              | Fixed: stateful apps land at zero replicas with the backup job suspended; the receipt's backup postdates the restore and shows a restored record (guard 1, A19) |
| S2-5 R20's control weaker than claimed                              | Fixed: today's rules stated; the `delivery` rules run as a real-tree test inside `gate`; task 0.6 covers both repositories before A2; the rest listed as a risk |
| S2-6 "Harbor blocks no stage" against wave 5                        | Fixed: nothing in the tree reads from Harbor, so it is alone in the last wave                                                                                   |
| S3 a revert orphans workloads                                       | Fixed: removal is two merges, stated in design decision 3 and in the rollbacks of A15 and A18                                                                   |
| S3 three Flux semantics missing from the inventory                  | Fixed: `healthCheckExprs`, chart `crds/` directories and the release name are rows; rule 2.4(j), slice 2.2's test, rehearsal (k) to (m). Velero citation fixed  |
| S3 freshness series and an absent-series negative                   | Fixed: slice 3.1 names the two kube-state-metrics series and fires on absence                                                                                   |
| S3 prefix refusal and h1claw's judgement of old prefixes            | Fixed: any prefix under `sqlite/` is refused; h1claw's owner confirms before A21                                                                                |
| S3 alerts that fire falsely from A15                                | Fixed: the WBS backup group lands with the `wbs` Application; the workers rule is not copied; a check refuses a rule with no subject                            |
| S3 `signals` reads operator-made Secrets                            | Fixed: `signals` is one wave after Elasticsearch; the provider rule knows four kinds of provider                                                                |
| S3 owners for four things                                           | Fixed: `registry-tls` is Harbor's; `website-prod-logs` is in the `namespaces` unit; OpenBao's namespace likewise; fleet and WBS overlays carry (f), (g), prefix |
| S3 no deadline for slice 3.2; no escrow for the Velero password     | Fixed: 3.2 before A15; A15 escrows the password before writing it                                                                                               |
| S3 the h1claw tarball mixes production env files                    | Fixed: unpacked on the controller; only dev paths reach the CI host (guard 6, A9, A11)                                                                          |
| S3 A21 removes the old fleet directory without the pin owner's word | Fixed: a precondition of A21                                                                                                                                    |
| S3 CoreDNS budgeted on the platform node but not pinned             | Stated: k3s packages it without a selector and reverts a patch; the budget counts it as the worst case                                                          |
| S3 Harbor's step ids collide with this plan's                       | Fixed: written as Harbor-A1, Harbor-A2a, Harbor-A9 and Harbor-A11                                                                                               |
| Not verified: where WBS images are pulled from                      | Stated in design decision 9; the host is not in the source read, so it is open question 14 and a precondition of A20                                            |

Nothing was disputed in this round.

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

| Every server registers with the enrollment taint as well | `roles/k3s_server/templates/config.yaml.j2:24-25` |
| The CoreDNS step is a strategic patch of `tolerations`, a list with no merge key | `validate-enrollment.yml:73-83` |

Not run: a one-node cluster registered with both taints. Slices 1.2 and 2.7 own it.

## Argo CD behaviour

Read on 2026-11-21 from the documentation at the `stable` ref and from source at tag `v3.6.2`
(`VERSION` reads 3.6.2; the newest chart release is `argo-cd-10.18.2`).

| Relied on                                                                        | Where it was read                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Charts are rendered with `helm template`; Argo CD owns the lifecycle             | `docs/user-guide/helm.md`                                        |
| Helm hooks map to sync hooks; test hooks are skipped; delete policies differ     | `docs/user-guide/helm.md`, "Helm Hooks"                          |
| A chart that generates random data renders differently each time                 | `docs/user-guide/helm.md`, "Random Data"                         |
| `helm dependency build` runs only after a missing-dependency error               | `reposerver/repository/repository.go`, `util/helm/helm.go`       |
| Symbolic links are refused only when they leave the repository root              | `reposerver/repository/repository.go`                            |
| Waves order resources; a wave proceeds when its resources are healthy            | `docs/user-guide/sync-waves.md`                                  |
| Application health was removed in 1.8 and must be restored for waves across apps | `docs/operator-manual/health.md`, `cluster-bootstrapping.md`     |
| App of apps is an admin-level tool; push access to its source is admin access    | `docs/operator-manual/cluster-bootstrapping.md`                  |
| Automated sync does not prune or self-heal unless asked; self-heal retries       | `docs/user-guide/auto_sync.md`                                   |
| Tracking is by annotation by default                                             | `docs/user-guide/resource_tracking.md`                           |
| `ServerSideApply=true`, `Prune=false`, `Delete=false`; the 262,144-byte limit    | `docs/user-guide/sync-options.md`                                |
| `ignoreDifferences`, and the webhook `caBundle` example                          | `docs/user-guide/diffing.md`                                     |
| Repository credentials as labelled Secrets; SSH host keys in a ConfigMap         | `docs/operator-manual/declarative-setup.md`, private repos guide |
| Self-management from a kustomize application; server-side apply for the install  | `docs/operator-manual/declarative-setup.md`, `installation.md`   |
| `policy.default`, `role:readonly`, local accounts, disabling `admin`             | `docs/operator-manual/rbac.md`, user management guide            |
| Deleting an Application without the finalizer leaves its resources               | `docs/operator-manual/cluster-bootstrapping.md`                  |
| `RespectIgnoreDifferences=true` acts only on an object that already exists       | `docs/user-guide/sync-options.md`                                |
| `Force=true` needs `Replace=true` and is ignored under server-side apply         | `docs/user-guide/sync-options.md`, "Force Sync"                  |
| Retry with exponential backoff; self-heal retries after its timeout              | `docs/user-guide/auto_sync.md`                                   |
| Child applications are not ordered or awaited without the health customization   | `docs/operator-manual/cluster-bootstrapping.md`                  |
| A kustomize source may inflate a Helm chart with `--enable-helm`                 | `docs/user-guide/kustomize.md`                                   |
| Cluster-scoped kinds are admitted to a project by an allow list                  | `docs/user-guide/projects.md`                                    |

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
  kustomize does with `includeCRDs: true`. Not read in this round; rehearsal (k) reads the CRDs
  back.
- That the bundled health check for `cert-manager.io/Certificate` behaves as the Flux
  `healthCheckExprs` it replaces. Rehearsal (l).
- That `ignoreDifferences` on the root with `RespectIgnoreDifferences=true` leaves a child's
  sync policy alone. Rehearsal (n).
- Which fields need `ignoreDifferences` for these charts.
- Argo CD's memory on this cluster. 1,536 MiB is an assumption (R24).
- The ApplicationSet documentation was not read; the choice against it rests on the
  bootstrapping guide's description only.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice that adds a check names the fault
it must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Owner decisions

Recorded above under "Replaced drafts". Overrules of R1 to R28: none yet (task 0.1).

## Read-only readings

| Reading                                      | Result                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubectl get nodes` capacity and allocatable | h4claw and h3mon: 8 CPUs, 15,602 MiB; allocatable 13,299 and 13,939 MiB; about 150 GiB of node storage                                                               |
| `kubectl top nodes`                          | h4claw 3,291 MiB, h3mon 4,316 MiB                                                                                                                                    |
| Node labels                                  | h4claw: `control-plane`, `ingress`, `product`; h3mon: `observability`; no taints                                                                                     |
| Node selectors of every Deployment           | Flux, cert-manager and kube-system: `kubernetes.io/os` only; website: `capability-product`                                                                           |
| Memory limits per namespace, running pods    | flux-system 4,096; website-dev 768; website-prod 128; website-prod-logs 128; puni-registry 512                                                                       |
| Containers without a memory limit            | cert-manager 3, Traefik 1, kube-system 2 on h4claw                                                                                                                   |
| Persistent volumes                           | two, class `puni-retain`, policy `Retain`, node affinity by host name to h4claw                                                                                      |
| Storage classes                              | `local-path` is the default with policy `Delete`; `puni-retain` and `puni-local` have `Retain`                                                                       |
| Flux stages                                  | `target`, `controllers`, `storage`, `policy`, `secrets`, `platform` Ready; `observability`, `alerts`, `backup` not Ready                                             |
| Flux sources                                 | the platform source is pinned to one commit; the fleet source follows a branch and owns the website and registry-secret units                                        |
| `nproc`, `free -m`, `df -h /` on h2puni      | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                                                                                        |
| User timers on h1claw                        | hourly SQLite pull from h2puni, daily MLflow pull, daily remote prune, weekly restore drill, freshness alert; last run healthy                                       |
| The fleet repository's file list             | its website overlay holds encrypted Secret files; its cluster directory holds Flux units. No content is quoted                                                       |
| `/dev/kvm` on the operator workstation       | present; the workstation's disk was full, so no lab ran                                                                                                              |
| Tolerations of the packaged components       | CoreDNS, `local-path-provisioner`, `metrics-server`: `CriticalAddonsOnly` (Exists) and the control-plane taint, nothing else                                         |
| DaemonSets on the live cluster               | Traefik only, selecting `capability-ingress`                                                                                                                         |
| Rules on this repository's `main`            | one active ruleset: `pull_request` with zero required approvals; `required_status_checks` `gate` and `pixels`, not strict; no rule against forced or deleting pushes |
| `infra-check.yml`                            | runs `tool-fleet:check` on pull requests that touch its paths; it is not among the required checks                                                                   |
| `crds/` directories in the vendored archives | Traefik 25 files, Velero 13; the other eight archives none                                                                                                           |
| Helm release names                           | no `HelmRelease` sets `releaseName`; `otlp-ingress.yaml` selects `app.kubernetes.io/instance: otel-collector`                                                        |
| Roles of `bootstrap.yml` and `join.yml`      | `base`, `network`, `storage` and the k3s role; `registry_client` runs only from `registry.yml`                                                                       |
| Members of h1claw's hourly set               | five per stamp, WBS production and WBS dev among them, all pulled from h2puni                                                                                        |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards. The rows
below were run again on this revision.

| Command                                                                                                     | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `openspec validate separate-node-roles --strict`                                                            | `Change 'separate-node-roles' is valid`, exit 0                           |
| `openspec validate --all --json`                                                                            | 349 items, 349 passed, 0 failed                                           |
| `prettier --check` on the five plan files and `CONTEXT.md`                                                  | `All matched files use Prettier code style!`                              |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files. Changed files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                      |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                                               |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 398                                                                       |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM, cluster or Argo CD rehearsal: slice 2.7 owns that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.
- This revision has not been reviewed. The three reviews recorded above read earlier commits.

## Primary sources read

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
- For the third review: `validate-enrollment.yml` and the `k3s_server` template's taints; the
  identity ConfigMap tasks of `platform.yml`; `alerts/base/rules.yaml` and the production
  overlay; `observability/base/signals.yaml`; `registry/production/issuers.yaml`;
  `policy/namespaces.yaml`; the archives' file lists; `.github/workflows/infra-check.yml`;
  `platform.test.ts`; `docs/infra/recovery.md` on the h1claw sets and the prune; the Harbor
  change's context and attended steps.
- For the second review: every Flux unit under `infra/clusters/platform/production` with its
  `dependsOn`; the Flux annotations and `HelmRelease` fields under `infra/platform`;
  `policy/trusted-images.yaml`; the Velero `HelmRelease`; `certificates/platform/production`;
  `registry/production/issuers.yaml`; `docs/infra/cutover-plan.md` prerequisites and steps 6
  and 8; `tools/tool-deploy/src/k8s/first-start-source.ts`; the kubelet arguments in both k3s
  templates; `docs/infra/gate-hosts.md` on the controller's jump; the k3s manifests and
  documentation listed under "k3s behaviour".
