# Node roles verification

## Status

Plan only. No source outside this change and one glossary term, no manifest, host, cluster or
provider resource was changed. No task in tasks.md is done. This record holds only what was
read or run while writing the plan, on 2026-11-21, in a worktree at `origin/main` `b17861f83`.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice in tasks.md names the fault it
must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Owner decisions

None recorded yet (task 0.1).

## Read-only readings

| Reading                                      | Result                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `kubectl get nodes` capacity and allocatable | h4claw and h3mon: 8 CPUs, 15,602 MiB; allocatable 13,299 and 13,939 MiB; about 150 GiB of node storage |
| `kubectl top nodes`                          | h4claw 3,291 MiB, h3mon 4,316 MiB                                                                      |
| Node labels                                  | h4claw: `control-plane`, `ingress`, `product`; h3mon: `observability`; no taints                       |
| Node selectors of every Deployment           | Flux, cert-manager and kube-system: `kubernetes.io/os` only; website: `capability-product`             |
| Memory limits per namespace, running pods    | flux-system 4,096; website-dev 768; website-prod 128; website-prod-logs 128; puni-registry 512         |
| Containers without a memory limit            | cert-manager 3, Traefik 1, kube-system 2 on h4claw                                                     |
| Persistent volumes                           | two, class `puni-retain`, policy `Retain`, node affinity by host name to h4claw                        |
| Storage classes                              | `local-path` is the default with policy `Delete`; `puni-retain` and `puni-local` have `Retain`         |
| `nproc`, `free -m`, `df -h /` on h2puni      | 8 CPUs, 15,603 MiB, 127 of 150 GiB used (88%)                                                          |
| h3mon's kubelet summary                      | 11.0 GiB of memory available; 118 of 150 GiB of disk available                                         |

## Repository checks

Dependencies were not installed in the worktree: the laptop's disk was full. The binaries of the
main checkout were used through a temporary `node_modules` link, removed afterwards.

| Command                                                                                                     | Result                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `openspec validate separate-node-roles --strict`                                                            | `Change 'separate-node-roles' is valid`, exit 0                               |
| `openspec validate --all --json`                                                                            | 349 items, 349 passed, 0 failed                                               |
| `prettier --check` on the six changed files                                                                 | `All matched files use Prettier code style!`                                  |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail, 109 assertions, 3 files, 19.5 s. New files were staged first |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail, 89 assertions, 4 files                                       |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                                                          |
| `plaintext-secrets.ts` and `private-nesting.ts` on the six changed files (`tools/tool-git-hooks/src/hooks`) | each exit 0                                                                   |
| `git ls-tree --name-only origin/main docs/adr/`                                                             | highest ADR on `main` is 0078                                                 |
| `gh pr list` for open pull requests that add an ADR file                                                    | #935 and #948 both add a file numbered 0079. So no ADR file here              |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target, `tool-devsync:check:docs` included: no
  disk space. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No lab, VM or cluster rehearsal: slice 1.6 owns that.
- The k3s statements in design decision 4 were read from the documentation, not executed.

## Primary sources read

- `infra/fleet/desired.yaml`, `infra/ansible/inventory/production-existing-hosts.yml`, the
  `k3s_server` and `k3s_agent` role templates, and the play lists of `join.yml`,
  `bootstrap.yml`, `backup.yml`, `restore.yml`, `retire.yml` and `validate-enrollment.yml`.
- `tools/tool-fleet/src/contracts.ts`: the capability union, `purposeCapabilities` and the
  server-count rule of `decodeFleet`.
- `docs/infra/fleet.md`, `platform.md`, `enroll-h4claw-h3mon.md`, `gate-hosts.md`,
  `cutover-plan.md`, `recovery.md`, `observability-sizing.md` and `local.md`.
- `deploy/k8s/wbs/base` and its overlays; `infra/platform/networking/traefik.yaml`,
  `infra/platform/flux/install.yaml`, `infra/platform/registry/production/storage-patch.yaml`
  and `infra/platform/observability/base/coexistence.json`.
- `openspec/changes/adopt-harbor-registry`: design, tasks and proposal.
- k3s documentation, read 2026-11-21: High Availability Embedded etcd, etcd-snapshot, Backup
  and Restore, Managing Server Roles, Uninstalling K3s.
