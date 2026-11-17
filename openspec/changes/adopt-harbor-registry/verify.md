# Harbor adoption verification

## Status

Plan only. No source, manifest, host or cluster was changed. No task in tasks.md is done.
This record holds only what was run while writing the plan, on 2026-11-17, in a worktree at
`origin/main` `1b94e080b`.

## Failure proofs

No check exists yet, so there is nothing to break. Each slice in tasks.md names the fault it
must inject. This table is filled as slices land.

| Safety boundary | Injected fault and observing test | Observed proof |
| --------------- | --------------------------------- | -------------- |
| none yet        |                                   |                |

## Repository checks

| Command                                                                                                                               | Result                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                                       | 1523 packages installed                                                                                   |
| `./node_modules/.bin/openspec validate adopt-harbor-registry --strict`                                                                | `Change 'adopt-harbor-registry' is valid`, exit 0                                                         |
| `./node_modules/.bin/openspec validate --all --json`                                                                                  | 343 items, 343 passed, 0 failed (323 changes, 20 specs), exit 0                                           |
| `bunx prettier --check` on the seven changed files                                                                                    | `All matched files use Prettier code style!`, exit 0                                                      |
| `env -u CLAUDECODE bun test` on `adr-index`, `current-documents`, `check-documents-target`, `repo-namespacing-handoff` (tool-devsync) | 40 pass, 0 fail, 149 assertions, 4 files, 108.75 s. New files were staged first                           |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                                           | 37 pass, 0 fail, 89 assertions, 4 files                                                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                           | exit 0, empty stderr; 40 indexes, 2 review-debt entries, both in WBS libraries this change does not touch |
| `env -u CLAUDECODE bunx nx run tool-devsync:check:docs --skip-nx-cache`                                                               | `Successfully ran target check:docs for project tool-devsync`, 16.0 s, exit 0                             |
| `plaintext-secrets.ts` and `private-nesting.ts` on the seven changed files, `doc-caps.ts` (`tools/tool-git-hooks/src/hooks`)          | each exit 0                                                                                               |
| `git ls-tree --name-only origin/main docs/adr/`                                                                                       | highest ADR on `main` is 0078                                                                             |
| `gh pr view 935 --json files`                                                                                                         | open; adds `docs/adr/0079-openbao-is-the-platform-secret-store.md`. So no ADR file here                   |

Every row from the second to the hook row was repeated on the final tree with the same results,
except that the repeat of the tool-devsync tests left out `check-documents-target` (34 pass, 0
fail, 3 files) and `tool-rename-work-package` was not repeated.

## Primary sources read

Each read is cited beside the fact it supports in design.md.

| Read                                                                                                                                                                                                         | What it returned                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh api repos/goharbor/harbor-helm/releases`                                                                                                                                                                 | newest v1.19.4, 2026-10-16; v1.19.2 before it; no v1.19.3                                                                                          |
| `gh api repos/goharbor/harbor-helm/contents/Chart.yaml?ref=v1.19.4`                                                                                                                                          | `version: 1.19.4`, `appVersion: 2.15.4`                                                                                                            |
| `curl https://helm.goharbor.io/index.yaml`, `curl -I https://helm.goharbor.io/harbor-1.19.4.tgz`                                                                                                             | index head is appVersion 2.15.4; archive URL answers 200. The archive was not downloaded                                                           |
| `gh api repos/goharbor/harbor-helm/contents/values.yaml?ref=v1.19.4`, eight workload templates, `README.md`                                                                                                  | components, default volumes, commented resource examples, Trivy defaults, default secrets, UIDs 10000 and 999, tested Kubernetes up to 1.34        |
| `gh api repos/goharbor/harbor/releases` and the release bodies of v2.15.3, v2.15.4, v2.15.5, v2.16.0                                                                                                         | dates; the 2.15.3 advisory list and webhook change; the 2.15.4 webhook default; Distribution fork versions                                         |
| `gh api repos/goharbor/harbor/security-advisories`                                                                                                                                                           | 13 published 2026-10-06 and 1 on 2026-10-28; six High; all patched in 2.15.3                                                                       |
| `gh api repos/goharbor/terraform-provider-harbor` (releases, README, `docs/resources`)                                                                                                                       | v3.12.5; tested on Harbor 2.13 to 2.15 and Terraform 1.12 to 1.14; the resource list                                                               |
| Harbor source at tag v2.15.4: `api/v2.0/swagger.yaml`, `src/controller/config/controller.go`, `src/pkg/retention`, `src/lib/selector/selectors/doublestar/selector.go`, `make/photon/db/Dockerfile.base`     | robot create and secret refresh shapes; `readOnlyForAll`; retention template ids and the immutable mark; selector decorations; PostgreSQL 18 build |
| goharbor.io pages: installation prerequisites, project quotas, tag retention, tag immutability, garbage collection, robot accounts, backup and restore, metrics, webhooks, system settings, Helm upgrade, HA | the statements quoted in design.md                                                                                                                 |
| `gh api repos/distribution/distribution/security-advisories` and `releases`                                                                                                                                  | CVE-2026-41888, CVE-2026-35172, CVE-2026-85747 affect 2.8.x; fixed in 3.1.0 to 3.1.2                                                               |
| `gh api repos/goharbor/distribution/tags`                                                                                                                                                                    | `v2.8.3-harbor.4` exists                                                                                                                           |
| kubernetes.io node-pressure eviction page                                                                                                                                                                    | `oom_score_adj` per QoS class; eviction order                                                                                                      |

## Review round (2026-11-17, second commit)

A review of the first commit raised ten findings and ten smaller notes. Each was checked against
its source before the plan changed. All were applied; none was rejected.

| Read                                                                                    | What it showed                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harbor v2.15.4 `src/controller/robot/controller.go`, `src/server/v2.0/handler/robot.go` | create always generates the secret and returns it; refresh accepts a supplied one of 8 to 128 characters; expiry is creation plus duration, recomputed only when the duration changes          |
| Harbor v2.15.4 `src/jobservice/job/impl/gc/garbage_collection.go`                       | with delete-untagged on, the job deletes every artifact without a tag, with no age check                                                                                                       |
| Harbor v2.15.4 `src/pkg/retention/policy/action/performer.go`                           | the delete action marks an artifact with an immutable tag and skips it. The first commit cited `job.go` for this                                                                               |
| Harbor v2.15.4 `src/pkg/blob/dao/dao.go`                                                | project usage is a sum over blobs associated with the project                                                                                                                                  |
| Chart v1.19.4 templates and `values.yaml`                                               | only jobservice and registry take `updateStrategy`; init-container values exist; one chart init container on the database; internal Valkey has no password; `harbor_registry_password` default |
| `gh api repos/goharbor/distribution/compare/v2.8.3...v2.8.3-harbor.2`                   | commit titles: Redis options, Go module migration, dependency bumps                                                                                                                            |
| kubernetes.io pod QoS page                                                              | Guaranteed needs CPU and memory limits equal to requests in every container                                                                                                                    |
| `docs/infra/gate-hosts.md` steps 2, 6, 7; `infra/platform/networking/traefik.yaml`      | pinned disk budget with 10 GiB calibration headroom; calibration runs unbounded; Traefik is Burstable on the host network                                                                      |

Checks rerun on the second commit's tree, same commands as above:

| Command                                                                 | Result                                    |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `./node_modules/.bin/openspec validate adopt-harbor-registry --strict`  | valid, exit 0                             |
| `./node_modules/.bin/openspec validate --all --json`                    | 343 items, 343 passed, 0 failed           |
| `bunx prettier --check` on the seven files                              | all formatted, exit 0                     |
| `env -u CLAUDECODE bun test` on the four tool-devsync document tests    | 40 pass, 0 fail, 149 assertions, 112.03 s |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`             | 37 pass, 0 fail                           |
| Burokrat `check-indexes working . HEAD`                                 | exit 0                                    |
| `env -u CLAUDECODE bunx nx run tool-devsync:check:docs --skip-nx-cache` | succeeded, 18.1 s                         |
| `plaintext-secrets.ts`, `private-nesting.ts`, `doc-caps.ts`             | each exit 0                               |

## Second review round (2026-11-17, third commit)

Five further findings and nine notes, each checked against its source and applied.

| Read                                                                 | What it showed                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Harbor v2.15.4 `src/pkg/retention/dep/client.go`                     | the retention candidate's push time is the artifact's or its newest tag's; grace counts from push |
| Harbor v2.15.4 `src/pkg/immutable/match/rule/match.go`               | the immutability matcher selects with `untagged` false                                            |
| Harbor v2.15.4 `src/lib/config/metadata/metadatalist.go`             | `self_registration` defaults to false                                                             |
| Chart v1.19.4 `templates/_helpers.tpl`, `values.yaml`                | internal Valkey gets an empty password; database probes time out at 1 second, three failures      |
| `k3s-io/kube-router` `pkg/controllers/netpol/pod.go`, default branch | a rule accepts every source of address type LOCAL to a pod                                        |
| Kubernetes v1.36.4 `pkg/apis/core/v1/helper/qos/qos.go`              | init containers are part of the QoS computation                                                   |

Checks rerun on the third commit's tree: the eight commands of the table above, same results
(tool-devsync document tests 40 pass in 107.13 s). The first attempt ran while the workstation's
root disk was full and failed for that reason: 2 failures in the document tests, 5 in
`tool-rename-work-package`, index check exit 1. After space was freed every command passed.
`check-documents-target.test.ts` left a scratch directory of about 2.8 GB under `/tmp` on each
run here; those from this work were removed by hand.

## Third review round (2026-11-17, fourth commit)

One finding and four notes, each checked against the plan's own text and applied.

- A rotation could reinstate an old secret: the names alternate, so the idle name's file from
  two rotations ago was still on disk. `apply --retire` now removes the retired name's file and
  `apply --rotate` refuses a file older than the live robot. Task 6.1 carries the negative; the
  injected fault is skipping the age comparison.
- `apply --retire` of a pull role refuses unless the declared namespaces' pull secrets name the
  new robot (task 6.2).
- A recovery unit runs the marker step at boot, so a host crash mid-backup does not leave the
  registry read-only until the next 01:30 (task 7.3). The runbook states the cost of a stale
  marker.
- The spec's port scenario says "registry pod address", because other hosts are meant to
  reach the host endpoint on 8443.
- The recovery runbook states that a restore from before a rotation brings back the retired
  robot name (task 10.1).

| Read                                            | What it showed                                              |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Harbor v2.15.4 `api/v2.0/swagger.yaml`, `Robot` | the robot model returns `creation_time` beside `expires_at` |

Checks rerun on the fourth commit's tree. The workstation's root disk was at 99%, so the set
was cut to what leaves no large scratch:

| Command                                                                                      | Result                          |
| -------------------------------------------------------------------------------------------- | ------------------------------- |
| `./node_modules/.bin/openspec validate adopt-harbor-registry --strict`                       | valid, exit 0                   |
| `./node_modules/.bin/openspec validate --all --json`                                         | 343 items, 343 passed, 0 failed |
| `bunx prettier --check` on the four changed files                                            | all formatted, exit 0           |
| `env -u CLAUDECODE bun test` on `adr-index`, `current-documents`, `repo-namespacing-handoff` | 34 pass, 0 fail, 109 assertions |
| Burokrat `check-indexes working . HEAD`                                                      | exit 0                          |

Not rerun on this tree: `check-documents-target.test.ts`, `tool-rename-work-package`,
`nx run tool-devsync:check:docs` and the three hooks run by hand. `current-documents.test.ts`
left a 5 MB scratch directory under `/tmp`, removed after the run.

## Not run

- No chart was rendered and no Harbor was started. Every memory figure in design.md is an
  estimate or a chart example.
- No ssh, no cluster access, no host command. The h4claw measurement in design.md was supplied
  to this plan and not repeated.
- No gate, no `nx run-many`, no `nx format:check --all`, no CI run.
- No ADR test for a new ADR: none was added.
- No image digest was resolved and no archive checksum was computed.
- The private fleet repository was read for its layout only. Nothing in it was changed.
