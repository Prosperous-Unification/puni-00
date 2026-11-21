# PostgreSQL hosting verification

## Status

Plan only. No source outside this change, no manifest, host, cluster or provider resource
was changed. No task in tasks.md is done. This record holds only what was read or run while
writing the plan, on 2026-11-21 and 2026-11-22, in a worktree at `origin/main` `b17861f83`.

## Where this came from

This change was decision 11 of `separate-node-roles` in that change's eighth and ninth
drafts, added on 2026-11-21 at the owner's request. Two reviews read it there: the eighth
(at `44ad4a908`) and the ninth (at `5c54a1707`); that change's verify.md records what each
found. The ninth recommended a split, and on 2026-11-22 the planning session moved this part
here. The split is its scoping, and the owner may overrule it. Text was moved, not rewritten,
except for the ninth review's findings below and for ids:

| In the ninth draft of `separate-node-roles` | Here                     |
| ------------------------------------------- | ------------------------ |
| R36 to R42                                  | PG1 to PG7               |
| Slices 4.1 to 4.5                           | PG-S1 to PG-S5           |
| A24 to A28                                  | PG-A1 to PG-A5           |
| Decision 11                                 | decision 3               |
| The database rows of decisions 1, 2, 3 to 9 | decisions 1, 2, 4 and 5  |
| Stage 6                                     | the database stage       |
| The third decision record                   | this change's one record |
| Open questions 1 and 2                      | open questions 1 and 2   |
| Rule (o), orders 18 to 20                   | unchanged                |

## Ninth review: what became of its findings here

| Finding                                                           | What became of it                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-3 The non-production cluster's drill did not exist at its step | Fixed: the `nonproduction-db` unit carries the drill CronJob, suspended, restoring in `postgres-nonproduction` on the non-production node; PG-A3 starts one run by hand; rule (o) and a scenario require it                                   |
| S3 No response step for the WAL and disk alerts                   | Fixed: decision 3 says what each of the three alerts calls for, the runbook of PG-S5 carries it, and PG-A3 follows it once                                                                                                                    |
| S3 A full drill reaches 78% of the disk, just under the 80% alert | Fixed: the root disk is at least 140 GiB, so a drill stays at or under 65%; the drill reads the filesystem first and does not start otherwise, with a negative; PG-A5's receipt includes the highest reading and stops if the 80% alert fired |
| S3 Rule (o) contradicts itself for the throwaway cluster          | Fixed: rule (o) holds a cluster of a database unit to a retaining class with an archiver, and a drill's throwaway cluster, marked by a label, to a reclaiming class without one                                                               |
| The split                                                         | Done as recommended                                                                                                                                                                                                                           |

The eighth review's findings on this part were fixed in the ninth draft and came across with
the text: the CRDs protected from prune, the drill on a reclaiming class, the 16 GiB server.

## Tenth review: what became of its findings here

A tenth review read the three changes at `cb5689194` and found no S1 and six S2. Those that
landed here:

| Finding                                                                                     | What became of it                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-2 The drill was denied by the plan's own admission clause, in both profiles              | Fixed: the capability `restore-drill` is withdrawn. A drill's throwaway cluster selects `database` (or `nonproduction` for the non-production cluster) and tolerates what its cluster tolerates, so the clause "a pod in `postgres` selects `database`" admits it (PG-S3, PG-S5) |
| The reviewer's opinion: a weekly restore on the production apps node is unwise as a default | Taken: nothing of this change lands on that node. While the server carries `database` the drill is attended and on demand; it is weekly on a database server. Decision 3 gives the three reasons                                                                                 |
| PG-S5 said "on the database node"; rule (o)'s throwaway sentence contradicted the drill     | Fixed: both name the capability of the drill's own unit                                                                                                                                                                                                                          |
| S3 etcd's metrics are not exposed; the bounded claim shares the root journal                | Stated in decision 2 and under Risks; core slice 1.2 adds `etcd-expose-metrics` to the server template                                                                                                                                                                           |
| S3 A static class cannot serve a replica on the database node                               | Stated: decision 4 and PG-A2 count on a restore with the writers stopped, and try a replica on a volume of the same class first                                                                                                                                                  |

Withdrawn ids: none. Withdrawn capability: `restore-drill`, with its placement rule, its
spec scenarios and the receipt lines that named it.

## Minimal placement profile (added 2026-11-22)

At the owner's request for the minimal setup that can grow (core R45), and unreviewed.

| What changed                           | From                          | To                                                                                          |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Where `platform-db` runs first         | a database server, `h10db`    | the platform node, which carries `database` (PG8); the server is a growth step (decision 4) |
| The database taint                     | on every node with `database` | on a node with `database` that is not the server; the pods tolerate both taints             |
| "A database node carries nothing else" | a rule                        | the server may carry `database`; a database node carries `database` and nothing else        |
| Where a restore drill runs             | the database node             | the node that carries `database`; attended while that is the server (see the tenth review)  |
| The production claim                   | `puni-retain`, unbounded      | on the server, a bounded filesystem and a static volume (new slice PG-S6)                   |
| The production instance's limit        | 4,096 MiB                     | 2,048 MiB on the server; 4,096 after the move                                               |
| PG-A1 and PG-A2                        | steps of the database stage   | growth-step steps; PG-A4 runs on the platform node                                          |

New ids: PG8 and PG-S6. Nothing was renumbered.

Read for it: `infra/ansible/roles/registry_storage` (a preallocated loop filesystem and a
static `local` PersistentVolume for the registry, which PG-S6 reuses). Not read: whether
CloudNativePG lets a replica use another storage class than its primary, on which the
growth step's replica-and-switchover path depends; whether the operator accepts a statically
provisioned volume for an instance (PG-S6's stop condition); how the kubelet ranks a local
volume's use for eviction beyond what the Kubernetes documentation says of `emptyDir`,
logs and writable layers (believed).

## Not carried over from the brief

Delivery by Flux; the interim scrape into Victoria; the Grafana dashboard, since the
Prometheus stack on the rebuilt cluster runs without Grafana; the `enablePodMonitor` field,
deprecated at the pinned version; `platform-db` as the home of staging data; the port of WBS
as part of this work; prices.

## CloudNativePG behaviour

Read on 2026-11-21 in the operator's documentation at tag `v1.30.2` (released 2026-11-17, the
current release), the Barman Cloud plugin's at `v0.16.0`, and the charts repository at
`cloudnative-pg-v0.29.2` and `plugin-barman-cloud-v0.9.0`. Nothing was run.

| Relied on                                                                                                                  | Where it was read                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Backup to object storage is supported through the Barman Cloud plugin; the in-tree integration is deprecated from 1.26     | `backup.md`, `wal_archiving.md`                                               |
| 1.31 is the last minor release with the in-tree integration                                                                | `backup.md`. The 1.30 release notes word the removal as "in 1.31.0"           |
| WAL archiving is a plugin with `isWALArchiver: true`; one at a time; the Barman plugin is the only supported one           | `wal_archiving.md`; the plugin's `usage.md`                                   |
| The plugin is installed in the operator's namespace, needs operator 1.30 or newer and cert-manager                         | the plugin's `installation.mdx`                                               |
| An `ObjectStore` resource holds the endpoint, credentials and a recovery-window `retentionPolicy`                          | the plugin's `usage.md`, `retention.md`                                       |
| A backup names `method: plugin`                                                                                            | `backup.md`; the plugin's `usage.md`                                          |
| Recovery is never in place: it bootstraps a new cluster, to the end of the archive or to a `targetTime`                    | `recovery.md`                                                                 |
| Metrics are served on port 9187, named `metrics`                                                                           | `monitoring.md`                                                               |
| `.spec.monitoring.enablePodMonitor` is deprecated; a PodMonitor is to be created by hand                                   | `monitoring.md`                                                               |
| The plugin's backup metrics carry the prefix `barman_cloud_cloudnative_pg_io`; the in-core ones are deprecated             | the plugin's `observability.md`; `monitoring.md`                              |
| A `Cluster` takes `affinity.nodeSelector` and `tolerations`, "for all the pods of a Cluster"; job pods are not named there | `scheduling.md`                                                               |
| Local storage is supported; a separate WAL volume can be added later and cannot be removed once added                      | `storage.md`                                                                  |
| A `Database` resource declares a database and its owner; a `DatabaseRole` resource declares a role, new in 1.30            | `declarative_database_management.md`, `declarative_role_management.md`, notes |
| A role's `passwordSecret` lives in the cluster's namespace, and the operator tracks a change of it                         | `declarative_role_management.md`                                              |
| PostgreSQL logs go to standard output as JSON; `logging_collector` and `log_destination` are fixed by the operator         | `logging.md`, `postgresql_conf.md`                                            |
| `shared_preload_libraries` is managed for common extensions such as `pg_stat_statements`                                   | `postgresql_conf.md`                                                          |
| The operator chart renders its CRDs as templates under `crds.create`; it has no `crds/` directory                          | the chart's file list and `values.yaml` at the tag                            |
| The operator chart has a subchart behind `monitoring.grafanaDashboard.create`                                              | the chart's `Chart.yaml` at the tag                                           |

Not read or not established: the default of `enableSuperuserAccess` (from memory: off); the
five-minute `archive_timeout` default (from memory); the exact metric names for connections,
open transactions and archiving age; what the plugin's sidecar and the operator use in memory;
whether the provider's object storage accepts Barman's requests or encrypts at rest; the
PostgreSQL major version to pin, which slice PG-S2 decides from the operator's supported list.

## Owner decisions

On 2026-11-21:

- "i'll also need you to include hosting postgres in the plan", with a brief from another
  session; then "this session supersedes the decisions from brief" (PG1).
- On who uses it: "i want everybody to use it once it's in place" (PG1). Earlier the same day
  he had said "I want to use SQLite for as long as possible".
- On the database server: "just plan for it for now, i'll evaluate the options" (PG2).
- "let's do db node at 16GiB" (PG2), after he was told that the smaller size left about 240
  MiB at its peak.

PG3 to PG7 are the planning session's: the operator, the layout, where staging's databases
run, the recovery targets, and that Harbor keeps its own database. He was told of the last
and did not object. Overrules of PG1 to PG7: none yet (task PG-0.1).

## Repository checks

Dependencies were not installed in the worktree. The binaries of the main checkout were used
through a temporary `node_modules` link, removed afterwards. Run on 2026-11-22 on this
revision.

| Command                                                                                                     | Result                                       |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `openspec validate host-postgres --strict`                                                                  | `Change 'host-postgres' is valid`, exit 0    |
| `openspec validate --all --json`                                                                            | 350 items, 350 passed, 0 failed              |
| `prettier --check` on the five plan files                                                                   | `All matched files use Prettier code style!` |
| `env -u CLAUDECODE bun test` on `adr-index`, `repo-namespacing-handoff`, `current-documents` (tool-devsync) | 34 pass, 0 fail; changed files staged first  |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                                 | 37 pass, 0 fail                              |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                 | exit 0, empty stderr                         |
| `plaintext-secrets.ts` and `private-nesting.ts` on the five plan files (`tools/tool-git-hooks/src/hooks`)   | each exit 0                                  |
| Intent word count of proposal.md, "Why" to "Constraints"                                                    | 321                                          |

## Checks not run

- `bun install --frozen-lockfile` and every Nx target. CI runs them.
- `check-documents-target.test.ts`: each run leaves about 2.8 GB under `/tmp`.
- No CloudNativePG operator, cluster, backup or restore was run, and no lab.
- This revision has not been reviewed since the split.

## Primary sources read

The CloudNativePG and Barman Cloud plugin pages listed above; the `k3s_agent` configuration
template; the storage classes; the Velero schedules; the Prometheus stack's selectors and
its Grafana setting; the Argo CD sync-options and Helm guides at tag `v3.6.2`; and the core
change's design, tasks and spec in the same pull request; and, for the minimal profile,
the `registry_storage` role's files and README.
