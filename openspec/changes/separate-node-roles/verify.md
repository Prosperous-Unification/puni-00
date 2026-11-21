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
   first rank. The owner then made two more decisions, quoted here:
   - "For the new from scratch plan let's use the ArgoCD", with "rebuild it the way it is
     supposed to be built / no legacy shit".
   - "we can make the switch unsafe that's ok / no prod users yet".

This draft keeps the R ids that still mean what they meant. Reworded: R1, R2, R5, R6, R8, R10,
R12, R13 and R17. Withdrawn: R14 (the old side kept for 14 days) and R18 (certificates cross as
Secrets). New: R19 to R27. Attended steps are renumbered A1 to A22 and agent slices are grouped
in three phases.

## Review findings and what became of them

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

Not read or not provable from reading; slice 2.7 owns each:

- Whether helm itself follows a linked archive in `charts/`.
- Whether self-management overwrites the generated keys in `argocd-secret`.
- The health Argo CD reports for a DaemonSet with no eligible node.
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

Recorded above under "Replaced drafts". Overrules of R1 to R27: none yet (task 0.1).

## Read-only readings

| Reading                                      | Result                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `kubectl get nodes` capacity and allocatable | h4claw and h3mon: 8 CPUs, 15,602 MiB; allocatable 13,299 and 13,939 MiB; about 150 GiB of node storage                         |
| `kubectl top nodes`                          | h4claw 3,291 MiB, h3mon 4,316 MiB                                                                                              |
| Node labels                                  | h4claw: `control-plane`, `ingress`, `product`; h3mon: `observability`; no taints                                               |
| Node selectors of every Deployment           | Flux, cert-manager and kube-system: `kubernetes.io/os` only; website: `capability-product`                                     |
| Memory limits per namespace, running pods    | flux-system 4,096; website-dev 768; website-prod 128; website-prod-logs 128; puni-registry 512                                 |
| Containers without a memory limit            | cert-manager 3, Traefik 1, kube-system 2 on h4claw                                                                             |
| Persistent volumes                           | two, class `puni-retain`, policy `Retain`, node affinity by host name to h4claw                                                |
| Storage classes                              | `local-path` is the default with policy `Delete`; `puni-retain` and `puni-local` have `Retain`                                 |
| Flux stages                                  | `target`, `controllers`, `storage`, `policy`, `secrets`, `platform` Ready; `observability`, `alerts`, `backup` not Ready       |
| Flux sources                                 | the platform source is pinned to one commit; the fleet source follows a branch and owns the website and registry-secret units  |
| `nproc`, `free -m`, `df -h /` on h2puni      | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                                                  |
| User timers on h1claw                        | hourly SQLite pull from h2puni, daily MLflow pull, daily remote prune, weekly restore drill, freshness alert; last run healthy |
| The fleet repository's file list             | its website overlay holds encrypted Secret files; its cluster directory holds Flux units. No content is quoted                 |
| `/dev/kvm` on the operator workstation       | present; the workstation's disk was full, so no lab ran                                                                        |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards.

| Command                                                                                                     | Result                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `openspec validate separate-node-roles --strict`                                                            | `Change 'separate-node-roles' is valid`, exit 0                           |
| `openspec validate --all --json`                                                                            | 349 items, 349 passed, 0 failed                                           |
| `prettier --check` on the six changed files                                                                 | `All matched files use Prettier code style!`                              |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files. Changed files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                      |
| `plaintext-secrets.ts` and `private-nesting.ts` on the six changed files (`tools/tool-git-hooks/src/hooks`) | each exit 0                                                               |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 395                                                                       |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM, cluster or Argo CD rehearsal: slice 2.7 owns that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.
- This draft has not been reviewed. The review recorded above read the second draft.

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
