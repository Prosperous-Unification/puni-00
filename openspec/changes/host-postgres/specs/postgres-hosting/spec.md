## ADDED Requirements

### Requirement: Database is a node role of its own

The fleet model SHALL define the capability `database` for platform clusters only, and a
node that carries it SHALL carry no other capability. This is the sixth node role, which
the `node-roles` capability names.

#### Scenario: Workers node carries the capability

- **WHEN** a workers-cluster node declares `database`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires `database` and no present node carries it
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Declared fleet

- **WHEN** the desired state of the rebuilt production cluster declares a database node
- **THEN** that node carries `database` alone

### Requirement: PostgreSQL runs on nodes reserved for it

The production PostgreSQL cluster SHALL run on a node that carries only the capability
`database` and is registered with the taint `puni.dev/role=database:NoSchedule`, which only
pods of that cluster's unit and the named node agents MAY tolerate. A non-production cluster MUST run on the
non-production node, and the operator and its backup plugin on the platform node. Hosting
PostgreSQL SHALL NOT move any app's data.

#### Scenario: Database node carries a second capability

- **WHEN** the desired state gives a node `database` together with another capability
- **THEN** the placement check fails and names the node

#### Scenario: Database node without the taint

- **WHEN** the agent configuration of a node that carries `database` is rendered without the
  taint
- **THEN** the role test fails

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

- **WHEN** a production bucket is listed with the non-production database key
- **THEN** the object store refuses, and the step does not complete otherwise

#### Scenario: Velero schedule includes a database namespace

- **WHEN** a Velero schedule in the tree includes a database namespace
- **THEN** the delivery check fails and names the schedule

### Requirement: A restore is proven before production data arrives

Every cluster SHALL be dumped per database every night. The production cluster SHALL be
restored every week into a throwaway cluster whose storage is reclaimed with it, watched by
an alert. A drill MUST NOT archive WAL or leave a copy of the data on the node. No production
data SHALL be written before one restore and one single-database rollback have a receipt,
and no staging data before one restore of the non-production cluster has.

#### Scenario: Restore drill fails or is absent

- **WHEN** the weekly restore fails its sanity queries, or no drill result exists
- **THEN** an alert fires, and the throwaway cluster is deleted

#### Scenario: Drill leaves a volume

- **WHEN** a drill ends and a volume of its throwaway cluster remains, Released or as a
  directory on the node
- **THEN** the drill reports failure

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

#### Scenario: Production data before a proven restore

- **WHEN** an app's port would write production data and no receipt of a restore and a
  single-database rollback exists
- **THEN** the port does not proceed
