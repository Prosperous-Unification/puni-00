## Context

This change is the second of three that together are the new setup plan, in one pull
request with [`separate-node-roles`](../separate-node-roles/design.md), which rebuilds the
cluster, and `add-agent-hosts`. It was decision 11 of that change's ninth draft and was moved out
on 2026-11-22, after a ninth review recommended the split; text was moved, not rewritten,
except where the review or the split required it ([verify.md](verify.md#where-this-came-from)).

Read at `origin/main` `b17861f83` on 2026-11-21. Today every app keeps its data in SQLite,
and nothing in the repository runs PostgreSQL for an app: no operator, no cluster, no
database node.

On 2026-11-22 the owner asked for the minimal setup that can grow (core R45, core decision
11). In that profile, which is built first, `platform-db` runs on the platform node; a
database server is the growth step it later moves to (PG8).

**Ids.** This change's own carry the prefix PG: assumptions PG1 to PG8, slices PG-S1 to
PG-S6, attended steps PG-A1 to PG-A5, and decisions 1 to 5 of this file. Every other id is
the core change's, [`separate-node-roles`](../separate-node-roles/design.md): R1 to R35, R45,
R46, A1 to A23, slices 1.1 to 3.8, rules 2.4(a) to (n), guards 1 to 6, and what is written "core
decision n". Rule (o) is this change's addition to that `delivery` family, and orders 18 to
20 continue that order table.

## Goals / Non-Goals

**Goals**

- PostgreSQL hosted on the rebuilt cluster with a backup and a proven restore, ready for the
  apps to move to (PG1).
- A node role and a sized budget for the production instance.
- Staging's databases apart from production's.

**Non-Goals**

- Porting any app from SQLite to PostgreSQL. Each port is a follow-up change (decision 5).
- Databases for client apps, a replica, and an offsite copy (decision 5).
- Anything of the cluster rebuild: the core change owns it, and none of its stages waits for
  this one.

## Assumptions

Fixed by the owner on 2026-11-21: that PostgreSQL is hosted, that every app uses it once it
is in place, that this session's plan holds where the brief differs, that the database
server is planned now and created when he chooses, and that it has 16 GiB; and on
2026-11-22 the minimal profile, in which that server is a later growth step. A row marked
**decided** records one of those; the rest are assumed and can be overruled by id.

| Id  | Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Alternative and its cost                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PG1 | **Decided.** The owner on 2026-11-21: "i'll also need you to include hosting postgres in the plan", and, asked who uses it, "i want everybody to use it once it's in place". Earlier the same day he had said "I want to use SQLite for as long as possible"; this reverses it. A brief from another session came with the request; he then said "this session supersedes the decisions from brief". Assumed: this change hosts PostgreSQL and ports no app. The three apps and MLflow arrive on SQLite as already planned and move in follow-up changes (decision 3); every SQLite-specific element of this plan holds until that app's port lands | SQLite kept, with continuous replication to object storage. Cost: one writer bound to one node stays, so deployments stop the backend and nothing fails over; far less work, and it remains the fallback for an app whose port proves too expensive |
| PG2 | **The full profile's database server.** A node role, `database`: one server, `h10db`, an agent of the new cluster that carries `database` and `restore-drill` and nothing else and is registered with the taint `puni.dev/role=database:NoSchedule`, with a root disk of at least 140 GiB (decision 2). **Decided:** the owner on 2026-11-21, "let's do db node at 16GiB": 8 vCPUs and 16 GiB; and "just plan for it for now, i'll evaluate the options": the server is created when he chooses, and nothing in stages 1 to 5 waits for it. Since 2026-11-22 it is a growth step (PG8, decision 4)                                                  | The production instance on the production apps node. Cost: the database shares a node with the public edge and with the apps it serves. Dedicated vCPUs from the start. Cost: paid before the first consumer exists                                 |
| PG3 | CloudNativePG runs PostgreSQL: operator v1.30.2 on the platform node, physical backups and WAL archiving through its Barman Cloud plugin v0.16.0. The in-tree Barman integration is deprecated and is not used (decision 3)                                                                                                                                                                                                                                                                                                                                                                                                                         | A hand-written StatefulSet with nightly dumps. Cost: no point-in-time recovery and no managed switchover when a replica comes                                                                                                                       |
| PG4 | One production cluster, `platform-db`, with one instance. Each app gets one database and one owner role, and no role can read another app's database. A cluster for client apps and a cluster per large client come later, each with its first consumer                                                                                                                                                                                                                                                                                                                                                                                             | A cluster per app. Cost: an instance's memory for each, on one server                                                                                                                                                                               |
| PG5 | Staging's databases are in a second cluster, `nonproduction-db`, one instance on the node that carries `nonproduction` (h7obs in the minimal profile), with a backup credential and bucket of its own. It needs no database server: it can run once that node carries the capability and the operator runs                                                                                                                                                                                                                                                                                                                                          | A second cluster beside `platform-db`. Cost: staging, which follows `main`, shares a disk and a kernel with production data                                                                                                                         |
| PG6 | Recovery targets for `platform-db`, assumed: at most 5 minutes of committed data lost when the node is lost (the WAL archive interval), 30 days of point-in-time recovery, logical dumps kept 90 days, and a full restore into a new cluster within 2 hours, to be replaced by the measured time of the first drill (PG-A5)                                                                                                                                                                                                                                                                                                                         | Hourly base backups without WAL archiving. Cost: up to an hour lost, which is what SQLite gives today                                                                                                                                               |
| PG7 | Harbor keeps the database its own change bundles, on the platform node. "Everybody" (PG1) is read as the apps and MLflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Harbor on `platform-db`. Cost: a registry that cannot serve a pull while the database node is down, and a start-up loop if a database image ever came from Harbor                                                                                   |
| PG8 | **Decided** by the owner's request of 2026-11-22 for the minimal setup that can grow (core R45): in the minimal profile the capability `database` is carried by the platform node, and `platform-db` runs there beside the control plane. Assumed, as the planning session's working-out of that: the instance starts at 2,048 MiB; its claim is on a bounded filesystem (slice PG-S6); its restore drill runs on the production apps node under a capability of its own, `restore-drill`; and the database server of PG2 is the growth step with the triggers of decision 4                                                                        | The database server from the start. Cost: one more server before any app has been ported                                                                                                                                                            |

## Decisions

### 1. The database role and its node

The core change's placement table names two capabilities and leaves them to this change:

| Capability      | What selects it                                    | Minimal profile (PG8) | Full profile (PG2) |
| --------------- | -------------------------------------------------- | --------------------- | ------------------ |
| `database`      | the instances of `platform-db` and its dump job    | h5plat, the server    | h10db, an agent    |
| `restore-drill` | the throwaway instance of a drill of `platform-db` | h6apps                | h10db              |

- Both are new capabilities, added to `CapabilitySchema`, `fleetCapabilities`,
  `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` by slice PG-S1, as slice
  1.1 adds the core's two.
- **Where `database` may sit.** On the control-plane node, beside `platform-services`, or on
  a node that carries nothing else but `restore-drill`. A production database is in the
  trust class of the secret store, which is why the server may hold it; it never sits with
  `product`, `nonproduction`, `ingress` or `observability`.
- **Why a drill has a capability of its own.** A drill restores a whole copy of
  `platform-db`: memory and a burst of disk writes. On the server that would compete with
  etcd, so in the minimal profile it runs where production data already is, on the
  production apps node. `restore-drill` may sit with `product` or with `database` and with
  nothing else.
- **The pods tolerate both taints they can meet.** The `Cluster` of `platform-db` and its
  dump job tolerate `CriticalAddonsOnly`, which the server carries (core R25), and the
  database taint below; the drill's throwaway cluster tolerates the database taint. A move
  between profiles then changes no manifest.
- **The taint is the full profile's.** A node that carries `database` and not
  `control-plane` is registered with the taint
  `puni.dev/role=database:NoSchedule` (PG2). The server gets no second taint: it already
  carries its own. The agent template already writes `node-taint`
  entries; slice PG-S1 adds this one for a node that carries `database`. Unlike the platform
  node's taint it is a key of our own: no packaged k3s workload has to run on an agent, so
  none has to tolerate it. Only pods of the `platform-db` unit and the three node agents may
  tolerate it: the unit's PostgreSQL instances with their backup sidecars, its dump and
  drill jobs, and a drill's throwaway instance (decision 3).
- The cluster's capability floor gains `database: 1` and `restore-drill: 1` in the revision
  that gives a node each. In the minimal profile that revision changes two nodes that have
  already joined, so the labels are applied by the core's capability play (slice 1.7).

### 2. Budgets

Memory in MiB, counted as core decision 2 counts it.

**What this change adds to nodes the core change sized, in the minimal profile.**

| Node            | Workload                                                     | Limit | Sum and margin after it                                         |
| --------------- | ------------------------------------------------------------ | ----: | --------------------------------------------------------------- |
| Platform        | CloudNativePG operator and the Barman plugin                 |   512 | 9,066; with reservations 11,882; margin 3,720                   |
| Platform        | `platform-db`: one instance and its backup sidecar           | 2,304 | 11,370; with reservations 14,186; margin 1,416                  |
| Platform        | The nightly logical dump                                     |   256 | margin 1,160 while it runs                                      |
| Production apps | A restore drill's throwaway instance and its sidecar, weekly | 1,280 | 7,296; margin 6,642 while it runs                               |
| Observability   | `nonproduction-db`: one instance and its backup sidecar      | 1,280 | counted in core decision 2's sum for that node, which A14 tests |

Every figure is assumed (256 each for the operator and the plugin; 2,048 and 256 for the
production instance and its sidecar; 1,024 and 256 for the others) and PG-A3 and PG-A4
measure them. The production instance starts at 2,048 MiB because nothing uses it yet.
That is the minimal profile's limit, and it is tight on purpose: with the dump running the
platform node keeps 1,160 MiB, so an instance that needs more than about 2,180 MiB takes the
margin under the 1,024 MiB the plan stops on everywhere. A port that needs more is
therefore the trigger for the database server (decision 4), unless the Harbor change's
measurement returns memory first; Harbor's 2,112 MiB is a planned figure too. The one
drill of PG-A3 adds a throwaway instance of 1,280 on the non-production node for its run.
Disk for `nonproduction-db`: one claim of 10 GiB (assumed).

**Database node, in the full profile** (PG2). 8 vCPUs and 16 GiB by the owner's decision,
with the reservations and allocatable of an app node, 13,938.

| Workload                                                    |     Limit | Source                                         |
| ----------------------------------------------------------- | --------: | ---------------------------------------------- |
| `platform-db`: one PostgreSQL instance                      |     4,096 | assumed; `shared_buffers` a quarter of it      |
| Its backup sidecar                                          |       256 | assumed                                        |
| Node exporter, OTel collector, Velero node agent            |     1,408 | sizing document                                |
| **Steady sum**                                              | **5,760** | margin 8,178                                   |
| Restore drill: a throwaway instance and its sidecar, weekly |     1,280 | assumed: 1,024 and 256                         |
| Nightly logical dump                                        |       256 | assumed                                        |
| **Peak sum**                                                | **7,296** | margin 6,642, if the drill and a dump coincide |

These are limits, and every figure but the node agents' is assumed: no app has run on
PostgreSQL here, and PG-A4 and PG-A5 measure. The margin is room for the `shared_buffers` a
ported app needs. What moves the server to dedicated vCPUs: commit or query latency that
follows the neighbours' load and not the database's own. CloudNativePG moves an instance by
adding a replica on the new node and switching over, so that change needs a second node for
a while and no restore.

Its disk, as a server of its own: one claim of 30 GiB for `platform-db`, which holds data and WAL, the same again
while a restore drill runs, and 30 GiB assumed for the system and images. A drill must stay
under the 80% alert, or it would raise that alert every week and hide a real one. With 65%
as the ceiling while a drill runs that is (30 + 30 + 30) / 0.65 = 139 GiB, so the root disk
is at least 140 GiB and PG-A1 stops on a smaller one. A drill also reads the node's
filesystem before it starts and does not start when the restore would pass that ceiling. The largest SQLite store today is 2.2 GB. A claim's size is a
request and not a bound: the provisioner is local-path, which enforces no size, and every
claim on a node is a directory of one filesystem. A separate WAL claim would separate
nothing there, and the operator cannot remove one once it is added (storage page at the
tag), so the clusters start without one. What bounds disk use instead is in decision 3.

**Disk in the minimal profile.** On the server `platform-db` would share the root
filesystem with etcd, OpenBao's store and Harbor. A database that fills it stops the control
plane, and the kubelet's eviction does not help: it ranks pods by what they write to their
own layers and `emptyDir`s, not by a local volume's use. So there the claim is bounded: a
preallocated filesystem of 30 GiB with a static `local` PersistentVolume on it, the way the
`registry_storage` role bounds the registry's store today (slice PG-S6). When it fills,
PostgreSQL stops and the host does not. The drill's 30 GiB land on the production apps
node, whose root disk the core change sizes for it (A16). The platform node's floor of 140
GiB in core decision 2 already counts the 30.

### 3. Operator, clusters, backups and observability

Requested by the owner on 2026-11-21 (PG1). A brief from another session came with the request;
where it differs from this plan, this plan holds, by his word. What the brief marked as from
memory was read in the CloudNativePG documentation at tag v1.30.2 and the Barman Cloud
plugin's at v0.16.0 ([verify.md](verify.md#cloudnativepg-behaviour)).

**What this change does and does not do.** It stands the service up: an operator, a backup
plugin, a production cluster on a node of its own, a non-production cluster, backups, alerts,
and a restore that has been seen to work. It ports no app. Until an app's own change lands,
that app keeps its SQLite store and everything this plan says about it.

**Operator and plugin.** Two platform units, synced on command, on the platform node with the
selector and toleration of core decision 1:

- `cnpg-operator`: the `cloudnative-pg` chart 0.29.2, which carries operator v1.30.2. Its
  CRDs are chart templates (`crds.create`), not a `crds/` directory, so rule 2.4(j) has
  nothing to add; but they need a patch, so the unit is a kustomize unit that inflates the
  locked archive, as Velero's does. The patch gives every CRD the annotation
  `Prune=false,Delete=false`. Without it, reducing the unit to its marker would prune the
  CRDs, and deleting a CRD deletes every `Cluster` and with it the claims. Argo CD treats
  Helm's own keep policy as `Delete=false` only (its Helm guide at the tag), so the
  options are set explicitly and rule (o) refuses a CloudNativePG CRD without them. The
  CRDs are large, so the unit uses `ServerSideApply=true`. The chart's own PodMonitor and
  Grafana dashboard are off: the dashboard is a subchart behind a condition, and the
  Prometheus stack here runs without Grafana. The operator watches every namespace; rule
  (o) refuses a `Cluster` outside the two database units.
- `barman-plugin`: the `plugin-barman-cloud` chart 0.9.0, plugin v0.16.0, in the operator's
  namespace, as its installation page requires. It needs operator 1.30 or newer and
  cert-manager, both present. It is the supported way to back up to object storage: the
  in-tree Barman integration has been deprecated since 1.26, 1.31 is the last minor release
  that carries it (backup page at the tag), and this plan never uses it.

**Clusters.** Each is a kustomize unit in the `platform` project: a `Cluster`, an
`ObjectStore`, a `ScheduledBackup`, a PodMonitor, and the `Database` and `DatabaseRole`
objects of its apps.

|                                     | `platform-db`                                                                                   | `nonproduction-db`                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Node                                | selector `database`, tolerating the platform and database taints: h5plat in the minimal profile | selector `nonproduction`: h7obs in the minimal profile        |
| Namespace and its environment label | `postgres`, `platform`                                                                          | `postgres-nonproduction`, `staging`                           |
| Instances                           | 1                                                                                               | 1                                                             |
| Storage                             | one claim of 30 GiB: bounded on the server (PG-S6), `puni-retain` on a database node            | `puni-retain`, one claim of 10 GiB                            |
| Backups                             | its own bucket and key                                                                          | its own bucket and key, which cannot read a production bucket |
| Serves                              | production databases                                                                            | staging databases; dev's, once the follow-up exists           |

- **Why staging has a cluster of its own** (PG5). Staging follows `main`, so a merged
  migration or a runaway query lands there first, and point-in-time recovery restores a whole
  cluster. On one instance either would reach production data. On the non-production node
  the staging cluster sits behind the same admission rule as every staging pod (slice 2.10:
  its namespace is labelled `staging`, so its pods must select `nonproduction`), behind the
  staging backup key, and on a disk that holds no production data. A second cluster on the
  database node would share that node's disk and kernel and would make its taint mean less.
- **One database and one owner role per app**, declared with the operator's `Database` and
  `DatabaseRole` resources (the second is new in 1.30). A role owns its database and cannot
  connect to another: the connect privilege of `public` is revoked on each database, and how
  that is declared is slice PG-S3's to establish. No shared tables. This
  change declares two databases, `canary-a` and `canary-b`, in each cluster, so that the units,
  the backups, the drill and the isolation negative have a subject; each port adds its own.
- **A single instance is a single point of failure**, also for every k3s or kernel upgrade of
  its node: the database is down for that reboot. Node-local storage binds the instance to
  its node; a lost node is a restore from object storage (PG6), not a reschedule. The replica
  is the follow-up's (decision 5), and moving the instance is replica then switchover.
- **Deleting a `Cluster` deletes its claims.** The storage class retains the volume's data on
  the node, and the two sync options keep delivery from deleting the object, but a `Cluster`
  deleted by hand is outside what delivery can protect; the backups are what remain.

**Placement and containment.** The operator makes the pods of a cluster, its instances and
the jobs that initialise or recover one, so no pod template of theirs is in the tree. Rule
(o) of the `delivery` check reads each `Cluster` instead: its `affinity.nodeSelector` names
the capability of its row above, and a drill's throwaway `Cluster` names `restore-drill`.
Only objects of the `platform-db` unit tolerate the database taint: the `Cluster`, from
which its instances and its jobs take theirs, the drill's throwaway `Cluster`, and the dump
and drill CronJobs. Of those only the live `Cluster` and the dump job also tolerate the
platform taint. The three node agents tolerate every taint and
run there as on every node (core decision 1). The scheduling page says the `affinity` section
applies to all the pods of a `Cluster`; that this covers its jobs is seen in slice PG-S3's k3d
test, which starts a cluster under the placement policy. The admission policy of slice 2.10
already denies a pod in `postgres-nonproduction` that does not select `nonproduction`; slice
PG-S3 adds the matching clause for `postgres`, which must select `database`. Each database
namespace has the `policy` unit's default-deny. What its own unit allows: the operator, the
scrape, port 5432 from the namespaces of the apps that have a database there (production to
`postgres`, staging to `postgres-nonproduction`), and egress to the API server, DNS and the
object storage endpoint, which an instance and its sidecar need. Rule 2.4(k) already refuses
a staging object that names a production namespace or Service, which now includes the
production database's.

**Secrets.** No superuser access is enabled, so no superuser Secret exists to guard. An owner
role's password is generated in OpenBao at a path of its app and environment. Two
ExternalSecrets read that one path: one in the database namespace, which the `DatabaseRole`
names as its `passwordSecret`, and one in the app's namespace, which is its connection Secret.
`secret-sync` gains a SecretStore for each database namespace, bound to that namespace's role
in the store, as for every other namespace. Rotation is a new value at the path: the operator
changes the role when its Secret changes, and the app reads the new one at its next restart.
Between the two refreshes the app can hold the old password; a rotation is therefore followed
by a restart of that app, and the port's change says how.

**Backups and recovery** (PG6).

- _Physical._ The plugin archives WAL continuously and a `ScheduledBackup` takes a base
  backup every night, both to the cluster's `ObjectStore`, with a 30-day recovery window that
  the plugin's retention enforces. PostgreSQL switches a WAL file at least every five
  minutes by the operator's default (from memory; slice PG-S3 sets it explicitly), which is the
  loss bound of PG6.
- _Logical._ In each cluster a nightly CronJob dumps each database on its own, connecting
  as that database's owner role, since no superuser exists; one app's data can then be
  handed over or put back without the rest. Dumps are kept 90 days by the planner of slice
  3.1, under a prefix of their own.
- _Credentials._ Each cluster has its own bucket and object storage key.
  `nonproduction-db`'s is separate from staging's SQLite backup key as well, and cannot
  read a production bucket (core decision 5); PG-A3's receipt repeats that refusal. Barman does
  not encrypt on the client as today's SQLite archive is encrypted: these backups rely on
  the bucket. Whether the provider encrypts at rest was not read, and it is listed under
  Risks.
- _Disk._ A claim does not bound PostgreSQL here: local-path enforces no size, and a
  node's claims are directories of one filesystem (decision 2). On the server the claim is
  therefore on a bounded filesystem of its own (slice PG-S6), and the three alerts below
  read that filesystem. What bounds disk use on a database node of its own: WAL is recycled
  once archived, and the alert on WAL not archived for
  10 minutes is the early signal; alerts at 80% and 90% of the node's filesystem; and the
  drill's volume, which is reclaimed (below). Past those the kubelet evicts at 10% free,
  and what it evicts is the only instance. A bounded filesystem per claim, as the Harbor
  change builds for its store, was weighed and not taken: it is a host role of its own,
  and this node has one tenant whose growth the alerts watch. It is the first thing to add
  when a second tenant comes. Each of the three alerts has a response in the runbook of
  slice PG-S5. WAL not archived: read the plugin's and the object store's errors, and
  restore archiving before the WAL fills the disk. 80%: find what grew, a drill's
  leftover, WAL or data, and remove or plan for it. 90%: stop the apps' writers, so that
  the instance is stopped by a person with its data intact and not by an eviction; then
  restore archiving or grow the disk.
- _Recovery is never in place._ The operator restores by bootstrapping a new cluster from the
  object store, to the end of the archive or to a point in time. So rolling one app back
  means restoring the whole cluster beside the live one and copying that one database
  across. Slice PG-S5 writes that as a runbook and PG-A5 runs it once.
- _The drill._ A weekly CronJob restores `platform-db` into a throwaway cluster on the node
  that carries `restore-drill`, runs sanity queries and deletes the cluster. In the minimal
  profile that is the production apps node, so that a restore's writes never share a disk
  with etcd. It does not start when the restore would take that node's filesystem above 65%
  (decision 2). The throwaway cluster's
  claim is on `local-path`, the class k3s packages, whose reclaim policy is `Delete`, so
  deleting the cluster removes the volume and its directory. On `puni-retain` every drill
  would leave a copy of production data on the node's disk. The job ends by checking that
  no volume of the throwaway cluster is left, Released or as a directory, and fails
  otherwise. Its result is read from the kube-state-metrics series of its CronJob, as the
  SQLite rule reads a backup job's, and its duration from the Job's start and completion
  times; a failed or missing drill is an alert.
- _The non-production cluster's restore_ is proven once, in PG-A3, before the tracker's
  port puts data there. The `nonproduction-db` unit carries the same drill CronJob,
  suspended: it restores into a throwaway cluster in `postgres-nonproduction` on the
  non-production node, on the reclaiming class, and PG-A3 starts one run of it by hand.
- _Velero stays out._ A file copy of a running PostgreSQL is not consistent. Velero's one
  schedule here names the registry namespace and copies its volumes by file
  (`defaultVolumesToFsBackup: true`); rule (o) refuses a schedule that includes a database
  namespace.
- _Offsite._ A copy at a second provider is recommended and not planned (decision 5).

**Observability.**

- Metrics: each instance serves them on port 9187, named `metrics`. The `Cluster` field that
  made a PodMonitor is deprecated at this version, so each unit carries its own PodMonitor;
  the Prometheus stack's selectors are open, so nothing else is needed. The plugin adds the
  backup timestamps under the prefix `barman_cloud_cloudnative_pg_io`.
- Alerts, as PrometheusRules that land with each cluster unit, since a rule lands with its
  subject (core decision 3): the instance's volume and its node's filesystem above 80% and above
  90%; WAL not archived for 10 minutes; no base backup for 26 hours; instance not ready; connections above 80% of the
  limit; a transaction open for more than 5 minutes; the restore drill failed or absent. The
  replica-lag rule lands with the replica. The exact series are read from the operator's
  default monitoring ConfigMap at the pinned version in slice PG-S4, not written from memory.
- Logs: the operator writes PostgreSQL's log as JSON to standard output, which the OTel
  collector already ships. The units set `log_min_duration_statement` to 500 ms,
  `log_lock_waits` on and `log_temp_files` to 0. Slice PG-S4 checks that the collector's
  redaction covers a connection string in a logged statement.
- Query statistics: `pg_stat_statements`, which the operator loads when one of its
  parameters is set, with a custom metrics query for the heaviest statements.
- No dashboard: the Prometheus stack here runs without Grafana, and the brief's interim
  scrape into Victoria is dropped with Victoria (R15).

**What it needs from other owners.** From pull request #935: a path, a policy and a role per
database namespace, and a way to generate a password at a path. From the fleet repository's
and the WBS overlays' owners: nothing until their port. From the owner: the two object
storage keys, his word on when `platform-db` starts, and later the server.

### 4. Order, stage and what is missing in source

**Order.** Four rows continue the core's order table, with the same meaning of Needs:

| Order | Unit               | Project  | Needs                                                                                                                         | First synced |
| ----: | ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ |
|    18 | `cnpg-operator`    | platform | `policy`                                                                                                                      | PG-A3        |
|    19 | `barman-plugin`    | platform | `cnpg-operator`; `cert-manager`, which issues the plugin's certificates                                                       | PG-A3        |
|    20 | `nonproduction-db` | platform | `policy`; `barman-plugin`; `storage`; `secret-sync`; `prometheus-stack`, for the PodMonitor kind; a node with `nonproduction` | PG-A3        |
|    20 | `platform-db`      | platform | `policy`; `barman-plugin`; `storage`; `secret-sync`; `prometheus-stack`; a node that carries `database`                       | PG-A4        |

They are numbered after the apps because no app needs them yet, not because they need the
apps: every need outside this change is of order 8 or lower. `nonproduction-db` needs no
database node, only the non-production one. The core's `platform` project holds these
units; its "Data survives delivery mistakes" rule extends to every `Cluster` and to the
operator's CRDs, which carry `Prune=false` and `Delete=false` and are removed by hand once
no object of their kinds is left.

**The database stage.**

| Needs                                                                                                                                                                                                                              | Receipt that ends it                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the core's stage 3 receipt; slices PG-S1 to PG-S6; for `nonproduction-db`, a node that carries `nonproduction` (A17) and slice 2.10; for `platform-db`, the owner's word, the capability on the server and its bounded claim (PG8) | both clusters Healthy with WAL archived; a base backup, a dump and one restore of each; the restore of `platform-db` timed; one database rolled back by the runbook; no volume of a throwaway cluster left |

It waits for no one and no one waits for it. It needs the alert and metrics units of the
core's stage 3 and nothing of stages 4 and 5, and nothing in stages 1 to 5 needs it: no app
reads PostgreSQL until its own port lands. The operator and the plugin may follow stage 3
at once. `nonproduction-db` follows A17, when a node carries `nonproduction` under slice
2.10's policies. In the minimal profile `platform-db` needs no new server: it starts when
the owner says so, after A17 and slice PG-S6, on the server (PG-A4). The owner said he will
evaluate when; that now means when to start it, and later when to give it a server.

**The growth step to a database server** (core decision 11). Trigger: a port needs the
production instance above about 2,180 MiB, the platform node's available memory falls under
1,024 MiB, or the control plane slows with the database's load (apiserver latency, or etcd's
slow-apply warnings in the server's log; whether etcd's own metrics are scraped on k3s was
not checked). Procedure: PG-A1 and PG-A2 create and join `h10db` with `database` and
`restore-drill`; the operator adds a replica of `platform-db` there, on `puni-retain`;
after it has caught up, a switchover makes it the primary and the old instance is removed;
the core's capability play then takes `database` from h5plat and `restore-drill` from
h6apps, and the instance's limit is raised to the full profile's 4,096 MiB. No restore and
no change to an app. That a replica may use another storage class than the primary was not
read; if it may not, the move is a restore from the archive into a new cluster on the
server, with the apps' writers stopped.

**What is missing in source.** Each row is an agent slice in [tasks.md](tasks.md).

| Gap                                                                                                                                                             | Slice |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No role or capability for a database node; the agent template writes one taint, the enrollment one                                                              | PG-S1 |
| No PostgreSQL operator, backup plugin or operand image is locked or has a unit                                                                                  | PG-S2 |
| No PostgreSQL cluster is defined; nothing checks where its instances run, that its WAL is archived, that it is scraped, or that Velero leaves its volumes alone | PG-S3 |
| No alert rule, log setting or query statistics for PostgreSQL                                                                                                   | PG-S4 |
| No logical dump, no scheduled restore drill, no way to roll back one database, and no storage class that reclaims a drill's volume is named                     | PG-S5 |
| The `registry_storage` role bounds one store, the registry's; nothing bounds a database claim that shares the server's disk                                     | PG-S6 |

**Secrets.** Three rows join the core's table of what the owner writes into OpenBao (core
decision 5):

| Secret                                                     | Consumer                                                                               | New or carried         | Written in           | Source                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Object storage credential for `nonproduction-db`'s backups | its `ObjectStore`                                                                      | new                    | PG-A3                | a key and bucket of its own, separate from staging's SQLite backup key; it cannot read a production bucket |
| Object storage credential for `platform-db`'s backups      | its `ObjectStore`, the dump job                                                        | new                    | PG-A4                | a key of its own, limited to the database bucket if the provider can (not checked)                         |
| One owner-role password per app and environment            | the role's Secret in the database namespace and the app's connection Secret in its own | generated in the store | with each app's port | the port's follow-up change; this change makes them for the canary databases only                          |

**When a store has no off-host backup** (one row for the table of core decision 7).
`platform-db` and `nonproduction-db` are unprotected from their first sync until their
first base backup with WAL archived, in the same step (PG-A3, PG-A4). They are empty until
an app is ported, and a port may not write production data before PG-A5's restore receipt.

**Where images come from.** The CloudNativePG operator, its plugin and the PostgreSQL image
are pulled from upstream by digest, never from Harbor, as the core's other platform
services are.

### 5. Dependencies and follow-ups

**The core change.** This one needs from it: the non-production node and the admission
policies of slice 2.10; `secret-sync`, `storage`, `policy`, `cert-manager` and the
Prometheus stack; the retention planner of slice 3.1 for the dumps; the sync playbook; the
alert path to Slack. It gives back nothing the core's stages need.

**Pull request #935 (OpenBao).** A path, a policy and a role per database namespace, and a
way to generate a password at a path (decision 3).

**Harbor.** It keeps its bundled database (PG7). If the owner overrules that, the Harbor
change needs: the chart's external database settings in place of the bundled one, a
database and owner role on `platform-db`, its memory figure and stop rule recomputed
without the database pod, its backup step replaced by the cluster's, and an order after
`platform-db`, which would then block the WBS units.

**Ports from SQLite to PostgreSQL (four follow-up changes; PG1).** Not designed here. Proposed
names and what each has to decide:

| Change                                                     | Decides                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port-wbs-to-postgres`                                     | the large one. Its first step is a count of raw SQL, SQLite-only features and synchronous database call sites, which is being taken separately and is not estimated here. Then: the driver and query layer, a new migration baseline, the data move for production and for the staging tracker, what replaces the SQLite backup and verify jobs, and whether the solver's node binding and `Recreate` still apply |
| `port-website-to-postgres`, `port-request-app-to-postgres` | owned with the release tooling's session: the same questions at smaller size, and where the connection Secret enters the fleet repository's overlays                                                                                                                                                                                                                                                              |
| `port-mlflow-to-postgres`                                  | MLflow's backend store on PostgreSQL, where its artifacts stay, and the move of the existing runs                                                                                                                                                                                                                                                                                                                 |

Each inherits these rules, which are requirements on the port and not slices here: schema
steps that run while the backend is stopped are fast (create or drop a table, add a nullable
column, rename, a small index); a long change is expand and contract (new structure,
backfill in small batches by the running app, switch reads, drop in a later release); a gate
check times each new migration against a production-size copy and fails above about 5
seconds, with a proof that a deliberately slow migration trips it; the backend answers 503
with `Retry-After` during its restart and the frontend retries. Each port also provides its
app's database, owner role and connection Secret as objects of the database units, moves its
staging copy first, removes its SQLite claim, backup jobs and custody rule only after its
PostgreSQL data has a base backup, and may not write production data to `platform-db`
before PG-A5's receipt exists. What ends with a port: for that app, R9's node-local SQLite
volume, `Recreate`, the hourly SQLite backup, its row in `sqlite-custody`, and guard 3's
prefix rule.

**Client databases and a replica (follow-up, proposed name `add-client-databases`).** A
cluster `clients-db` for small client apps, a cluster of its own for a large or sensitive
client, one database per client so that a handover is a dump and an offboarding is a drop;
and the second database node with a replica of `platform-db`. Triggers: the first client app
that needs a database; the first user who depends on uptime. An offsite copy of the backups
at a second provider belongs there too and is recommended; this plan names no provider.

## Decision record (becomes an ADR at merge)

It stays here until a number is free, as the core change's two do (task PG-0.2).

> # PostgreSQL is hosted on the platform cluster, and the apps move to it
>
> Every app kept its data in SQLite: one writer, on a volume bound to one node, so a
> deployment stops the backend and nothing fails over. On 2026-11-21 the owner had first said
> he wanted SQLite for as long as possible; later that day he asked for PostgreSQL hosting and
> said that every app uses it once it is in place.
>
> ## Considered options
>
> - SQLite with continuous replication to object storage. Far less work, and loss falls from
>   an hour to seconds. The one writer and its node stay, so deployments still stop the
>   backend. It remains the fallback for an app whose port proves too expensive.
> - A managed database at the provider or elsewhere: a meter and a dependency outside the
>   platform, which the owner ruled out for compute and data.
> - PostgreSQL on the production apps node: the database beside the public edge.
> - One cluster for staging and production: a merged migration reaches production data, and
>   point-in-time recovery restores both.
>
> ## Consequences
>
> Databases are a node role placed by capability. In the minimal profile, built first, the
> production cluster runs on the platform node, on a bounded filesystem, and its restore
> drill on the production apps node; a server that carries nothing else is the step it grows
> into, by a replica and a switchover. CloudNativePG runs that production cluster and one
> non-production cluster on the node that carries `nonproduction`. Each app has its own database and role. Backups are
> continuous WAL archiving, nightly base backups and nightly dumps per database; recovery
> restores a whole cluster beside the live one, so rolling one app back is a restore and a
> copy, practised by a drill. Targets: five minutes of loss at most, a restore within two
> hours until the first drill replaces that figure. One instance on one node is a single
> point of failure until a replica has a node. No app is ported by this decision: each port
> is its own change, the WBS one is large and unmeasured, and until a port lands that app
> stays on SQLite with everything that implies. Harbor keeps its own database, so that a
> pull never waits on the shared one.

## Risks / Trade-offs

- **PostgreSQL is hosted before anything uses it** (PG1). Until the first port lands it is
  a service with a canary and no consumer, which is how the registry stood for a month. The
  owner chose when to create its server for that reason (PG2).
- **One PostgreSQL instance on one node.** Its loss, and every reboot of its node, stops
  every app that has moved to it; a lost node is a restore of up to two hours (PG6).
- **The budgets are assumed.** No app has run on PostgreSQL here; PG-A4 measures (decision
  2).
- **In the minimal profile the production database shares a node with the control plane,
  the secret store and the registry** (PG8). Its memory is capped at a figure that the first
  real consumer will probably outgrow, which is the trigger for its own server. Its disk is
  bounded, so a full database stops PostgreSQL and not etcd; its I/O is not bounded, and a
  heavy query can still slow the control plane. Losing that node loses all four.
- **The move to a database server rests on one unread point**: that a replica may sit on
  another storage class than the primary. If not, the move is a restore (decision 4).
- **On a database server nothing bounds a database's disk use at its claim** (decision 3).
  Alerts and the kubelet's eviction threshold are the guards, and eviction stops the only
  instance. On the platform node the claim is bounded (PG-S6).
- **A restore drill copies production data onto a node every week**: the production apps
  node in the minimal profile. Its volume is reclaimed with the throwaway cluster, and a
  drill that leaves one fails loudly.
- **Database backups are not encrypted by the client.** They rely on the bucket and on a
  key of their own; what the provider does at rest was not read.
- **Two stores per app for a while.** Between an app's arrival on SQLite and its port, the
  plan carries both mechanisms, and the ports are four changes this one does not size.
- **A password rotation needs an app restart** (decision 3).
- **The drill's free-space guard is new.** A drill that does not start for lack of room
  reports as a failed drill, which is the alert that should follow.

## Open questions for the owner

1. When to start `platform-db` (PG8), and later when to give it a server (PG2). He said he
   will evaluate the options. In the minimal profile it needs no server to start; nothing
   waits for it.
2. Whether Harbor keeps its bundled database (PG7, the planning session's recommendation) or
   uses `platform-db`, which the words "everybody" could cover. Decision 5 lists what the
   Harbor change would need.

Not questions, but his to overrule by id: PG3 to PG6, the shape of the PostgreSQL service
and its recovery targets, and the working-out of PG8: the starting limit, the bounded
claim and where the drill runs.

## Not verified

- That the operator gives the job pods of a `Cluster` its node selector and tolerations,
  and that `Prune=false` on a CRD keeps it when its unit is reduced to a marker. Both are
  documented; neither was run.
- That the packaged `local-path` class exists on the new cluster with the reclaim policy
  `Delete` (read on the live cluster only), and that its helper pod can create and remove a
  volume on a node with the database taint.
- How the connect privilege of `public` is revoked declaratively on a database.
- Nothing of CloudNativePG was run. Read and not run: that a `Cluster` on a node-local
  `Retain` class starts on one tainted agent; that the plugin
  archives WAL to this provider's object storage; that `enableSuperuserAccess` is off by
  default at this version (from memory); that a `DatabaseRole` follows a changed password
  Secret without a restart of PostgreSQL.
- The exact metric names behind the PostgreSQL alerts, and the memory of an instance, its
  sidecar, the operator and the plugin.
- Whether the object storage provider encrypts at rest, and whether Barman's own
  server-side encryption options work against it.
- How long a restore of `platform-db` takes; PG6's two hours is a placeholder until PG-A5.
- That the operator chart's archive, which carries a subchart behind a condition, renders
  with the network disabled.
- That a suspended CronJob in the `nonproduction-db` unit, started by hand, restores into a
  throwaway cluster that the placement policy admits on the non-production node.
