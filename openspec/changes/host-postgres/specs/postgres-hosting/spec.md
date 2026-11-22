## ADDED Requirements

### Requirement: Database capabilities are placed under the two profiles

The fleet model SHALL define the capability `database` for platform clusters only. A node
that carries `database` SHALL be the control-plane node or SHALL carry nothing else.

#### Scenario: Workers node carries the capability

- **WHEN** a workers-cluster node declares `database`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires `database` and no present node carries it
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Declared fleet, minimal profile

- **WHEN** the desired state gives the control-plane node `database` beside
  `platform-services`
- **THEN** the placement check passes

#### Scenario: Declared fleet, full profile

- **WHEN** the desired state declares a database node
- **THEN** that node carries `database` and nothing else

#### Scenario: Database beside apps or monitoring

- **WHEN** the desired state gives a node `database` together with `product`,
  `nonproduction`, `ingress` or `observability`
- **THEN** the placement check fails and names the node

### Requirement: PostgreSQL runs where its capability is

The production cluster and its drill's throwaway cluster SHALL select `database`, and the
non-production cluster's drill `nonproduction`. A `database` node that is not the
control-plane node SHALL carry the taint
`puni.dev/role=database:NoSchedule`, which only that cluster's unit and the node agents MAY
tolerate. On the control-plane node the production claim MUST be on a bounded filesystem.
A non-production cluster MUST select `nonproduction`. Hosting SHALL NOT move any app's
data.

#### Scenario: Database agent without the taint

- **WHEN** the agent configuration of a node that carries `database` is rendered without the
  taint
- **THEN** the role test fails

#### Scenario: Unbounded claim on the server

- **WHEN** the inventory gives the control-plane node `database` and the production cluster's
  claim on that node names a class other than the bounded one
- **THEN** the delivery check fails and names the cluster

#### Scenario: Restore destination during a move

- **WHEN** the inventory names a move by restore and the destination server's claim is on the
  retaining class while the control-plane node still carries `database`
- **THEN** the delivery check passes

#### Scenario: Bounded claim fills

- **WHEN** a write to the bounded claim passes its size
- **THEN** the write fails and the host's free space is unchanged

#### Scenario: Scheduled drill beside the control plane

- **WHEN** the production cluster's drill job is not suspended while the inventory gives the
  control-plane node `database`, or is suspended once another node alone carries it
- **THEN** the delivery check fails and names the job

#### Scenario: Drill during a move

- **WHEN** both the control-plane node and the destination server carry `database`
- **THEN** the drill's schedule stays suspended, one attended drill pinned to the destination
  runs, and the schedule resumes only after the control-plane node no longer carries it

#### Scenario: Drill pod under the placement policy

- **WHEN** a drill starts a throwaway cluster in a database namespace
- **THEN** its pods select that namespace's capability and admission admits them

#### Scenario: Cluster on the wrong node

- **WHEN** the production cluster's node selector is not `database`, or the non-production
  cluster's is not `nonproduction`
- **THEN** the delivery check fails and names the cluster

#### Scenario: Another workload tolerates the database taint

- **WHEN** an object of the tree outside the production cluster's unit, other than the three
  node agents, tolerates the database taint
- **THEN** the delivery check fails and names the object

#### Scenario: Pod in the production database namespace selects another node

- **WHEN** a pod without the `database` selector is created in the production database
  namespace
- **THEN** admission denies it

#### Scenario: Operator CRD could be pruned

- **WHEN** a CloudNativePG CRD in the operator unit's render lacks `Prune=false` or
  `Delete=false`
- **THEN** the delivery check fails and names the CRD

#### Scenario: App environment defines a cluster

- **WHEN** a staging or production Application renders a PostgreSQL cluster, database or
  role
- **THEN** the delivery check fails and names the Application

### Requirement: Each app has a database and a role of its own

A PostgreSQL cluster SHALL give each app one database owned by one role, and a role MUST NOT
be able to connect to another app's database. Superuser access SHALL stay disabled. A role's
password SHALL come from OpenBao, at a path of its app and environment.

#### Scenario: Role reaches another database

- **WHEN** the owner role of one database connects to another database of the same cluster
- **THEN** PostgreSQL refuses the connection

#### Scenario: One role owns two databases

- **WHEN** two databases of the tree name the same owner role
- **THEN** the delivery check fails and names both

#### Scenario: Superuser access enabled

- **WHEN** a cluster in the tree enables superuser access
- **THEN** the delivery check fails and names the cluster

### Requirement: A PostgreSQL cluster is backed up and watched

Every PostgreSQL cluster SHALL archive its WAL continuously and take a scheduled base backup
through the Barman Cloud plugin, to an object store whose credential no other cluster reads,
and SHALL be scraped by a PodMonitor of its own. The in-tree Barman integration MUST NOT be
used, and Velero MUST NOT back up a database namespace.

#### Scenario: Cluster without WAL archiving or a schedule

- **WHEN** a cluster in the tree has no WAL-archiving plugin, no scheduled backup or no
  PodMonitor, or names the in-tree Barman integration
- **THEN** the delivery check fails and names the cluster

#### Scenario: WAL archiving stops

- **WHEN** a cluster has archived no WAL for ten minutes, or its archiving series is absent
- **THEN** an alert fires

#### Scenario: Base backup missing

- **WHEN** a cluster's last base backup is older than 26 hours
- **THEN** an alert fires

#### Scenario: Shared backup credential

- **WHEN** the object store of the non-production cluster reads the credential of the
  production one, or the reverse
- **THEN** the delivery check fails and names the object store

#### Scenario: Non-production key against a production bucket

- **WHEN** a named object of a production bucket is read with the non-production database
  key
- **THEN** the object store refuses with an authorisation error, while the same key reads
  one of its own objects, and the step does not complete otherwise

#### Scenario: Velero schedule includes a database namespace

- **WHEN** a Velero schedule in the tree includes a database namespace
- **THEN** the delivery check fails and names the schedule

### Requirement: A restore is proven before production data arrives

Every cluster SHALL be dumped per database every night. The production cluster SHALL be
restored into a throwaway cluster: weekly once a database node alone carries it, and by an
attended run while the control-plane node does. A drill MUST NOT archive WAL or leave a
copy of the data on the node. No production data SHALL be written before one restore and
one single-database rollback have a receipt, and no staging data before one restore of the
non-production cluster has.

#### Scenario: Restore drill fails

- **WHEN** a restore fails its sanity queries
- **THEN** an alert fires, and the throwaway cluster is deleted

#### Scenario: Weekly drill absent on a database node

- **WHEN** a database node carries the production cluster and no drill result exists for a
  week
- **THEN** an alert fires

#### Scenario: Drill without room in memory

- **WHEN** the node's available memory is under the drill's floor
- **THEN** the drill does not start and reports failure

#### Scenario: Drill leaves a volume

- **WHEN** a drill ends and a volume of its throwaway cluster remains, Released or as a
  directory on the node
- **THEN** the verifier, which may read volumes and nothing else, or the host reading
  reports it, and the drill counts as failed

#### Scenario: Drill on the non-production node

- **WHEN** the non-production cluster's drill runs on a node that carries `nonproduction`
  and not `database`
- **THEN** that node has the host reading installed before the drill, and a directory left
  there is reported

#### Scenario: Drill asked to judge its own cleanup

- **WHEN** the drill's ServiceAccount lists PersistentVolumes
- **THEN** the API refuses it

#### Scenario: Drill would raise the disk alert

- **WHEN** a restore would take the node's filesystem above the ceiling set for a drill
- **THEN** the drill does not start and reports failure

#### Scenario: Throwaway cluster on retained storage

- **WHEN** a throwaway cluster's claim names a storage class that retains
- **THEN** the delivery check fails

#### Scenario: Drill would write into the live archive

- **WHEN** a throwaway cluster carries a WAL archiver or the live cluster's name
- **THEN** the drill refuses to start

#### Scenario: Non-production cluster without its drill

- **WHEN** the non-production cluster's unit lacks its suspended drill job
- **THEN** the delivery check fails

#### Scenario: One database rolled back

- **WHEN** the production cluster is restored beside the live one to an earlier time and one
  database is copied back
- **THEN** that database holds its earlier state and every other database is unchanged

#### Scenario: Port while drills are attended

- **WHEN** an app's port would write production data while the production cluster's drill is
  still attended, and the owner has not said in writing that it stays so for that app
- **THEN** the port does not proceed

#### Scenario: Production data before a proven restore

- **WHEN** an app's port would write production data and no receipt of a restore and a
  single-database rollback exists
- **THEN** the port does not proceed
