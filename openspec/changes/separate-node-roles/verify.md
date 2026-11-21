# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
read or run while writing the plan, on 2026-11-21, in a worktree at `origin/main` `b17861f83`.

## Replaced draft

The first draft of this change (commit `6ec66e655`) planned an in-place migration with
assumptions N1 to N14: a new node joined the running cluster as an agent, Flux and cert-manager
moved to it, and the control plane followed by a planned snapshot restore. On 2026-11-21 the
owner changed the premise: the cluster is recreated from scratch, and no host carries load that
must stay where it is. This draft replaces the first one. Its assumptions are R1 to R18; no N
id is carried over.

Gone with the first draft: the snapshot-restore phase, the play that turned a server into an
agent, the fence kind for a server whose host stays up, the disk growth of the existing hosts,
the raised reservation on h3mon, and the need to withdraw h4claw from a gate pool while it
serves.

Kept from it: the capability `platform-services`, the node selectors for Flux and cert-manager,
the outside liveness probes, the budget sources, and the ADR number finding.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice in tasks.md names the fault it
must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Owner decisions

None recorded yet (task 0.1).

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
| Cluster identity ConfigMap                   | `kube-system/puni-cluster-platform-production`                                                                                 |
| Flux stages                                  | `target`, `controllers`, `storage`, `policy`, `secrets`, `platform` Ready; `observability`, `alerts`, `backup` not Ready       |
| Flux sources                                 | the platform source is pinned to one commit; the fleet source follows a branch and owns the website and registry-secret units  |
| Issuers and certificates                     | four ACME cluster issuers and five public website certificates Ready, all owned by the fleet source; `registry-tls` Ready      |
| `nproc`, `free -m`, `df -h /` on h2puni      | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                                                  |
| h3mon's kubelet summary                      | 11.0 GiB of memory available; 118 of 150 GiB of disk available                                                                 |
| User timers on h1claw                        | hourly SQLite pull from h2puni, daily MLflow pull, daily remote prune, weekly restore drill, freshness alert; last run healthy |
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
| `git ls-tree --name-only origin/main docs/adr/`                                                             | highest ADR on `main` is 0078                                             |
| `gh pr list` for open pull requests that add an ADR file                                                    | #935 and #948 both add a file numbered 0079. So no ADR file here          |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM or cluster rehearsal: slices 1.9 and 1.11 own that.
- No playbook was run. What the playbooks do was read from their sources and from the runbooks'
  records of earlier runs.

## Primary sources read

- `infra/fleet/desired.yaml`; `infra/ansible/inventory/production-existing-hosts.yml` and
  `platform.hcloud.yml`; the play lists of `bootstrap.yml`, `join.yml`, `platform.yml`,
  `backup.yml`, `restore.yml` and `validate-enrollment.yml`; the `backup` role's snapshot
  template; the `k3s_server` and `k3s_agent` configuration templates.
- `tools/tool-fleet/src/contracts.ts`: the capability union, `purposeCapabilities`, the cluster
  and provider schemas, and the server-count and floor rules of `decodeFleet`. The closed list
  of cluster ids in `platform.ts`, `recover.ts`, `platform.yml` and the `backup` role.
- `infra/clusters/platform/production`, `infra/platform/secrets`, `infra/platform/certificates`,
  `infra/platform/observability/base/coexistence.json`, `infra/terraform/README.md`.
- `docs/infra/README.md`, `fleet.md`, `platform.md`, `recovery.md`, `enroll-h4claw-h3mon.md`,
  `gate-hosts.md`, `cutover-plan.md`, `observability-sizing.md` and `local.md`.
- `deploy/k8s/wbs/base` and its overlays.
- `openspec/changes/adopt-harbor-registry`: design decisions 4 and 10, the assumption table and
  the task list.
