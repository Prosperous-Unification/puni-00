## ADDED Requirements

### Requirement: One node role per host

Every fleet host SHALL hold exactly one node role: platform services, continuous integration,
observability, production apps, non-production, database, agents, or workstation. A host's
capabilities MUST be those of its role, and no node SHALL carry both `product` and
`nonproduction`. The continuous integration role covers gates and image builds only; no app
and no database SHALL run on a continuous integration host.

#### Scenario: Declared fleet

- **WHEN** the desired state of the rebuilt production cluster is decoded
- **THEN** the platform node carries `control-plane` and `platform-services`, the observability
  node carries `observability`, the production apps node carries `product` and `ingress`, the
  non-production node carries `nonproduction` and `ingress`, a database node, once declared,
  carries `database` alone, and no node carries the capabilities of two roles other than
  `ingress`

#### Scenario: Production and staging on one node

- **WHEN** the desired state gives one node both `product` and `nonproduction`
- **THEN** the placement check fails and names the node

#### Scenario: Gate host listed as a k3s node

- **WHEN** an inventory lists one host under `gate_hosts` and under a k3s group
- **THEN** the placement check fails and names the host

### Requirement: The agents host and the workstation stand outside the cluster

An agents host and a workstation SHALL be outside the cluster and the gate pool, each on a
server of its own. An agents host MUST NOT hold a cluster credential or a key of the
cluster's backups, and MUST NOT be on the cluster's private network. A workstation MAY hold
the operator's credentials and MUST NOT accept a login from any automation.

#### Scenario: Agents host or workstation listed elsewhere

- **WHEN** an inventory lists an agents host or a workstation under a k3s group, under
  `gate_hosts` or in the other's group, or the desired state names one as a node
- **THEN** the placement check fails and names the host

#### Scenario: Agents host on the private network

- **WHEN** an agents host's address is among the enrolled private addresses
- **THEN** the placement check fails

#### Scenario: Automation key on the workstation

- **WHEN** the workstation's authorized keys include a key of a gate caller, the build user
  or the agents host
- **THEN** the placement check fails and names the key's owner

### Requirement: Platform services, non-production and database capabilities

The fleet model SHALL define the capabilities `platform-services`, `nonproduction` and
`database` for platform clusters only.

#### Scenario: Workers node carries one

- **WHEN** a workers-cluster node declares `platform-services`, `nonproduction` or `database`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires one of the three and no present node carries it
- **THEN** the fleet decoder refuses the fleet

### Requirement: The control plane runs on a tainted platform node

In a platform cluster that requires `platform-services`, the control-plane node SHALL carry
`platform-services`, MUST NOT carry `product`, `nonproduction` or `ingress`, and SHALL be registered
with the taint `CriticalAddonsOnly=true:NoSchedule`, which the components k3s packages
tolerate.

#### Scenario: Server on the production apps node

- **WHEN** the desired state gives the control-plane node the capability `product` or `ingress`
- **THEN** the placement check fails and names the node

#### Scenario: Server without the taint

- **WHEN** the server configuration of a `platform-services` node is rendered without the taint
- **THEN** the role test fails

#### Scenario: One tainted node

- **WHEN** a cluster of one server registered with the platform taint and the enrollment taint
  is validated
- **THEN** enrollment validation passes, and CoreDNS, the metrics server and the volume
  provisioner are Ready afterwards

#### Scenario: Enrollment patch replaces tolerations

- **WHEN** the enrollment play's CoreDNS step replaces the Deployment's toleration list
- **THEN** the play's contract test fails

### Requirement: Workloads are pinned to their role and environment

Every pod template that the rebuilt cluster's tree renders SHALL select a node capability,
except three node agents that run on every node: the node exporter, the OTel collector and the
Velero node agent. Only workloads that select `platform-services`, and those three agents, MAY
tolerate the platform taint. A staging workload SHALL select `nonproduction` and a production
app workload SHALL select `product`, so that the two run on different nodes.

#### Scenario: Workload without a role selector

- **WHEN** the delivery check reads a pod template whose node selector names no capability
- **THEN** the check fails and names the workload

#### Scenario: Toleration without the selector

- **WHEN** a pod template tolerates `CriticalAddonsOnly` or every taint, does not select
  `platform-services`, and is not one of the three named node agents
- **THEN** the check fails and names the workload

#### Scenario: Node agent

- **WHEN** the node exporter, the OTel collector or the Velero node agent is rendered with no
  capability selector and a toleration for every taint
- **THEN** the check passes, and the agent runs on the platform node

#### Scenario: Workload selects another environment's label

- **WHEN** a pod template of a `staging` Application does not select `nonproduction`, or one
  of a `production` Application does not select `product`
- **THEN** the check fails and names the workload

#### Scenario: Running placement

- **WHEN** the rebuilt cluster is observed with all four nodes joined
- **THEN** every Argo CD, OpenBao and cert-manager pod runs on the platform node, a Traefik pod
  runs on the production apps node and on the non-production node, every production app pod
  runs on the production apps node, every staging pod runs on the non-production node, and
  no app pod runs on the platform or observability node

### Requirement: Inventory and desired state agree for every production cluster

Each production cluster in the desired state SHALL be bound to one static inventory, and the
two MUST name the same nodes with the same machine ids, addresses and capabilities.

#### Scenario: Machine id differs

- **WHEN** a node's machine id in an inventory differs from the desired state
- **THEN** the placement test fails and names the node

#### Scenario: Node in one file only

- **WHEN** a node is present in an inventory and absent from its cluster's desired state, or
  the reverse
- **THEN** the placement test fails and names the node

### Requirement: The rebuilt cluster is delivered by Argo CD from a tree of its own

The rebuilt cluster SHALL be reconciled by Argo CD from `infra/argocd`. That tree MUST NOT
share a file with any path a Flux unit reconciles, except chart archives locked by digest, and
MUST NOT render a Flux object, read a remote base, or hold a Secret, encrypted or not.

#### Scenario: File shared with a Flux path

- **WHEN** a file is in the source closure of an Application and of a Flux unit under
  `infra/clusters`, and is not a locked chart archive
- **THEN** the delivery check fails and names the file

#### Scenario: Flux object rendered

- **WHEN** an Application source renders an object of a `toolkit.fluxcd.io` group
- **THEN** the delivery check fails and names it

#### Scenario: Secret in a source path

- **WHEN** a document with a `sops` key, or a Secret object, lies under an Application source
  path
- **THEN** the delivery check fails and names the file

#### Scenario: Install bytes changed

- **WHEN** the vendored Argo CD install manifest differs from its locked SHA-256
- **THEN** the toolchain check and the bootstrap playbook both refuse it

#### Scenario: Distribution in the tree

- **WHEN** an Application source renders a Distribution registry workload
- **THEN** the delivery check fails and names it

#### Scenario: Chart CRDs left out

- **WHEN** a kustomize unit inflates a chart whose archive has a `crds/` directory at any
  depth without `includeCRDs: true`
- **THEN** the delivery check fails and names the unit

#### Scenario: Release name changed

- **WHEN** a wrapper chart's release name differs from the release it replaces
- **THEN** the render-equality test fails

### Requirement: Secrets come from OpenBao

OpenBao SHALL be the first service synced after Argo CD and the units it runs under. Only the
Secrets that Argo CD and OpenBao themselves need SHALL be applied by the bootstrap playbook;
every other Secret a workload reads SHALL arrive through an ExternalSecret. Staging and
production SHALL read separate store paths.

#### Scenario: Secret without a provider

- **WHEN** a unit reads a Secret that no bootstrap entry, ExternalSecret, Certificate or
  operator-table row provides
- **THEN** the delivery check fails and names the Secret

#### Scenario: Store path of the other environment

- **WHEN** an ExternalSecret of a staging Application names a production store path, or the
  reverse
- **THEN** the delivery check fails and names it

#### Scenario: Store sealed

- **WHEN** OpenBao is sealed or unreachable
- **THEN** Secrets already in the cluster stay, running pods keep running, and a unit whose
  ExternalSecret has no value yet is not Healthy

### Requirement: Units are first synced in dependency order

Every Application SHALL carry the sync order and the needed units the design's unit table gives
it; a need MUST have a lower order, and so MUST the provider of a Secret a unit reads, except
for a Job that reads a Secret an operator makes for its own unit. The sync playbook SHALL sync
platform units in order and refuse a unit only while a unit it needs is not Synced and Healthy.
Staging Applications SHALL retry a failed sync with backoff.

#### Scenario: Order differs from the table

- **WHEN** an Application's sync order, needs or project is missing or differs from the unit
  table, or a need has the same or a higher order
- **THEN** the delivery check fails and names the Application

#### Scenario: Consumer before its Secret

- **WHEN** an Issuer that reads a Secret is ordered at or below the unit that provides the
  Secret
- **THEN** the delivery check fails and names the Issuer

#### Scenario: Secret made by an operator

- **WHEN** a unit reads a Secret that an operator makes for another unit and is ordered at or
  below that unit
- **THEN** the delivery check fails and names the unit

#### Scenario: Job reads its own unit's operator Secret

- **WHEN** a Job reads a Secret that an operator makes for a custom resource of the same unit
- **THEN** the delivery check passes

#### Scenario: Alert for something that is not there

- **WHEN** an alert rule selects a CronJob, namespace or cluster that no unit of the tree
  renders at that revision
- **THEN** the delivery check fails and names the rule

#### Scenario: Build from an empty cluster

- **WHEN** the sync playbook is given units on an empty cluster
- **THEN** it syncs them in table order and refuses a unit while a unit it needs is not Synced
  and Healthy

#### Scenario: Unrelated unit unhealthy

- **WHEN** a unit of a lower order is unhealthy and the unit to sync does not need it
- **THEN** the playbook syncs the unit

#### Scenario: Sync wave on an Application

- **WHEN** an Application carries a sync-wave annotation, or the rendered install restores the
  health check for `argoproj.io/Application`
- **THEN** the delivery check fails

#### Scenario: Two dependent staging units change in one merge

- **WHEN** one merge changes a staging unit and a staging unit that depends on it
- **THEN** both converge to Synced and Healthy by retry, with no ordering guarantee between them

### Requirement: Staging follows main; production and the platform change on command

A merge to `main` that touches an app SHALL reach staging with no command, through a build
that commits its rendered manifests to the pins repository. Production and platform
Applications SHALL change only when a person syncs them. The root SHALL manage only
Application and AppProject objects and never prune. The delivery check SHALL run inside a
required check. The tracker's poller MUST NOT be retired before the build path has its
receipt or the owner's waiver.

#### Scenario: Merge to an app

- **WHEN** a change to an app or to its staging overlay is merged to `main`
- **THEN** the build commits the rendered manifests to the pins repository and Argo CD
  applies them without operator action

#### Scenario: Poller retired with nothing in its place

- **WHEN** the dev poller is to be stopped and neither the build runner's receipt nor the
  owner's dated waiver exists
- **THEN** the staging step does not stop it

#### Scenario: Render reaches beyond staging

- **WHEN** a rendered staging directory holds a cluster-scoped object, a kind outside the
  staging project's list or a namespace that is not the app's staging one
- **THEN** the build refuses to commit it

#### Scenario: Merge to a production overlay

- **WHEN** a change to a production overlay or a platform unit is merged to `main`
- **THEN** its Application reports OutOfSync and the cluster does not change until it is synced

#### Scenario: Automation in the wrong place

- **WHEN** a production or platform Application other than the root has automated sync, or a
  staging Application lacks it
- **THEN** the delivery check fails and names the Application

#### Scenario: Other kind in the root's path

- **WHEN** the root's source path holds an object that is neither an Application nor an
  AppProject, or the `root` project admits another kind or another destination
- **THEN** the delivery check fails and names it

#### Scenario: Operation in an Application file

- **WHEN** an Application file carries an `operation` block
- **THEN** the delivery check fails and names the file

#### Scenario: Application file edited

- **WHEN** a merge changes the source, values or destination of a production Application file
- **THEN** the Application object changes and its workloads do not, until it is synced

#### Scenario: Application file removed

- **WHEN** a merge removes an Application file
- **THEN** the Application object and its workloads remain, and the health check lists the
  Application as having no file

#### Scenario: Automation switched on in the cluster

- **WHEN** automated sync is enabled on a production Application by an edit in the cluster
- **THEN** the root restores the Application as `main` defines it

#### Scenario: Manual change on staging

- **WHEN** a managed object of a staging Application is edited in the cluster
- **THEN** Argo CD restores the state of `main` without operator action

#### Scenario: Manual change on production

- **WHEN** a managed object of a production Application is edited in the cluster
- **THEN** the Application reports OutOfSync, the edit stays until the next sync, and an alert
  fires when the Application has been OutOfSync for 24 hours

#### Scenario: Other revision or destination

- **WHEN** an Application names a revision other than `main` or a destination other than the
  in-cluster API
- **THEN** the delivery check fails and names the Application

#### Scenario: Project grants itself access

- **WHEN** an AppProject file carries `roles` or `syncWindows`, or a file in the root's path
  defines an object named like the root or its project
- **THEN** the delivery check fails and names the file

#### Scenario: One environment names another's Service

- **WHEN** a rendered object of a staging or production Application names a namespace of the
  other, or a Service in one
- **THEN** the delivery check fails and names the object

#### Scenario: One environment claims another's name

- **WHEN** an Ingress, a Traefik `IngressRoute` or `IngressRouteTCP`, or a Certificate of a
  staging or production Application names a host outside the list held for its namespace
- **THEN** the delivery check fails and names the host

#### Scenario: Change under the tree alone

- **WHEN** a pull request changes only a file under `infra/argocd`
- **THEN** the required check runs the delivery check over the real tree

#### Scenario: Field owned by another writer

- **WHEN** the release coordinator has rewritten `solverImages` in the trusted-workload
  ConfigMap and its Application is synced
- **THEN** the value is left as the coordinator wrote it

#### Scenario: Push without a pull request

- **WHEN** a commit is pushed to `main` directly
- **THEN** the repository ruleset refuses it

### Requirement: A project reaches only its own namespaces

The destinations of the `staging` and `production` projects SHALL be exactly their own
namespaces. Of the platform units only `namespaces`, `policy` and `secret-sync` MAY write into
an app namespace.

#### Scenario: Project reaches beyond its namespaces

- **WHEN** the destinations of the `staging` or `production` project include a wildcard,
  `argocd`, the store's namespace or any namespace not declared for it, or the project
  admits a cluster-scoped kind or a Namespace, or has no list of admitted namespaced kinds
- **THEN** the delivery check fails and names the project

#### Scenario: Platform unit writes into an app namespace

- **WHEN** a platform Application other than `namespaces`, `policy` and `secret-sync` renders
  an object into an app namespace
- **THEN** the delivery check fails and names the Application

### Requirement: Environments are contained at admission

Every namespace SHALL carry an environment label that only the `namespaces` unit may set.
The cluster SHALL deny a pod whose node selector is not its environment's, and a route or
Certificate whose host is absent, a wildcard or not on its namespace's list, which is kept
outside it. Every non-production namespace SHALL have a quota and a default-deny policy
from the `policy` unit, and its project SHALL admit only listed kinds.

#### Scenario: Staging pod selects the production node

- **WHEN** a pod is created in a staging namespace with the `product` selector
- **THEN** admission denies it

#### Scenario: Dev pod without a selector

- **WHEN** a pod is created in a dev namespace with no capability selector
- **THEN** admission denies it

#### Scenario: Route claims another environment's host

- **WHEN** an `IngressRoute` in a staging namespace names a host on a production namespace's
  list
- **THEN** admission denies it

#### Scenario: Route without a host

- **WHEN** an Ingress or a Traefik route in an app namespace names no host, a wildcard or a
  host pattern
- **THEN** admission denies it

#### Scenario: Host list in the app's own namespace

- **WHEN** a ConfigMap shaped like the host list is created in an app namespace
- **THEN** the admission policy does not read it

#### Scenario: Certificate solver pod

- **WHEN** cert-manager creates an HTTP-01 solver pod in an app namespace
- **THEN** the pod carries that environment's selector and is admitted, and a solver pod
  without it is denied

#### Scenario: Issuer without a placed solver

- **WHEN** an ACME issuer has a solver whose pod template does not select the capability of
  the environment whose hosts it serves
- **THEN** the delivery check fails and names the issuer

#### Scenario: Certificate for an unlisted host

- **WHEN** a Certificate names a host that is on no list of its namespace
- **THEN** admission denies it

#### Scenario: Environment label changed

- **WHEN** a writer other than the `namespaces` unit sets or changes a namespace's environment
  label
- **THEN** admission denies it

#### Scenario: Non-production namespace without its floor

- **WHEN** a non-production namespace has no resource quota or no default-deny network policy
  from the `policy` unit
- **THEN** the delivery check fails and names the namespace

#### Scenario: Kind outside the project's list

- **WHEN** a staging Application is synced with an object of a kind its project does not list
- **THEN** Argo CD refuses the object

### Requirement: The interface syncs production and nothing else

The Argo CD interface MUST have no public route. Its one local account SHALL read every
Application and MAY sync Applications of the `production` project only, at the revision the
Application names, and MUST NOT roll one back. The built-in `admin` account MUST be disabled.
Platform units SHALL be synced by the sync playbook with the node's credential.

#### Scenario: Interface exposed or over-privileged

- **WHEN** the rendered install has an Ingress, a default role other than `role:readonly`, the
  `admin` account enabled, a grant of `sync` outside `production/*`, a grant of `override` or
  `rollback`, or no `server.rbac.rollback.enforce.enable`
- **THEN** the delivery check fails

#### Scenario: Account syncs production

- **WHEN** the local account syncs a production Application
- **THEN** the sync runs at the revision the Application names

#### Scenario: Account syncs elsewhere or another revision

- **WHEN** the local account syncs a platform or staging Application, names another revision
  for a production one, or rolls a production one back
- **THEN** Argo CD refuses

#### Scenario: Sync playbook given an app

- **WHEN** the sync playbook is given a unit of the `staging` or `production` project to sync
- **THEN** it refuses before syncing anything

#### Scenario: Removing an app's Application

- **WHEN** the playbook's removal mode is given a staging or production unit that has no file
  on `main` and whose live source is its marker alone
- **THEN** it deletes the Application object

### Requirement: Delivery cannot delete data

Every PersistentVolumeClaim in the rebuilt cluster's tree, every namespace that holds one, and
every custom resource from which an operator creates claims SHALL carry the sync options
`Prune=false` and `Delete=false`. No Application SHALL carry the resources finalizer. Every
claim in the tree SHALL be mounted by a backup job of its unit or be named, with a reason, in
the check's exemption table.

#### Scenario: Claim without a backup

- **WHEN** a rendered PersistentVolumeClaim is mounted by no backup job of its unit and is not
  in the exemption table
- **THEN** the delivery check fails and names the claim

#### Scenario: Claim without the options

- **WHEN** a rendered PersistentVolumeClaim lacks either option
- **THEN** the delivery check fails and names the claim

#### Scenario: Manifest removed

- **WHEN** a claim's manifest is removed from `main` and the Application is synced
- **THEN** the claim and its volume remain

#### Scenario: Unit reduced to its marker

- **WHEN** a unit's source is reduced to one marker ConfigMap and the unit is synced with prune
- **THEN** its workloads are removed and its claims remain

### Requirement: SQLite backups are kept and watched from inside the cluster

The cluster SHALL write each SQLite backup under a prefix that names the cluster and the
environment and lies outside `sqlite/`, apply the documented retention to it, and alert when a
backup job's last success is older than two backup intervals or its series is absent, without
depending on a host outside the cluster. Each alert rule SHALL land with the app it watches.
A staging backup job MUST NOT read the object storage credential of a production one.

#### Scenario: Shared prefix

- **WHEN** an app overlay of the rebuilt cluster sets the backup prefix to `sqlite` or to a
  path under `sqlite/`, or two overlays set the same prefix
- **THEN** the delivery check fails and names the overlay

#### Scenario: Shared credential

- **WHEN** a staging overlay reads the object storage credential that a production overlay
  reads
- **THEN** the delivery check fails and names the overlay

#### Scenario: Staging credential against a production prefix

- **WHEN** a production backup prefix is listed with the staging credential
- **THEN** the object store refuses, and the staging move does not start otherwise

#### Scenario: Retention

- **WHEN** the retention job reads a prefix
- **THEN** it keeps every stamp of the last 48 hours, the last of each UTC day for 60 days and
  the last of each UTC week for 52 weeks, deletes a snapshot only together with its report, and
  never deletes the newest report

#### Scenario: Snapshot without a report

- **WHEN** a snapshot has no report
- **THEN** the job keeps it and reports it

#### Scenario: Listing fails

- **WHEN** a prefix cannot be listed completely
- **THEN** the job deletes nothing and exits nonzero

#### Scenario: Stale backup

- **WHEN** a database's backup job last succeeded more than two backup intervals ago
- **THEN** the alert for that database fires

#### Scenario: Backup job gone

- **WHEN** the series of a database's backup job is absent
- **THEN** the alert for that database fires

### Requirement: Each node is watched from outside itself

Every k3s node and every gate host SHALL have a liveness probe that runs on a different node.

#### Scenario: Node without a probe

- **WHEN** the desired state names a present node, or an inventory names a gate host, that no
  probe on another node targets
- **THEN** the delivery check fails and names it

#### Scenario: Observability node stops

- **WHEN** the observability node stops answering
- **THEN** the probe on the platform node reports it, without depending on any service that
  runs on the observability node

### Requirement: Irreplaceable data is verified before its old host is deleted

A host that holds the WBS dev database, the WBS production database, the website data or the
MLflow store SHALL NOT be deleted until that store has a backup taken after its writer stopped,
a restore of it on the new side checked against that backup, and a verified backup made there
after the restore. A store SHALL be restored with its workload at zero replicas and its backup
job suspended.

#### Scenario: Restore differs

- **WHEN** the restored store differs from its backup
- **THEN** the move stops and the old host is kept

#### Scenario: No backup on the new side

- **WHEN** no verified backup of a moved store exists on the new cluster
- **THEN** the old host is kept

#### Scenario: Backup older than the restore

- **WHEN** the only backup on the new side predates the restore or holds no restored record
- **THEN** the old host is kept

#### Scenario: Production data offered to staging

- **WHEN** the file offered to a staging restore does not have the SHA-256 recorded for the dev
  store's final backup
- **THEN** the check fails and nothing is restored

### Requirement: Gates do not stop

A gate host SHALL NOT be deleted before the new CI host is calibrated.

#### Scenario: Successor not calibrated

- **WHEN** the new CI host has no recorded calibration
- **THEN** neither old gate host is deleted

### Requirement: The solver is bound per environment

On the rebuilt cluster the admission policy SHALL trust one solver namespace and one node
selector per environment, each with its own parameter ConfigMap. A node SHALL run one solver
supervisor with one pod caller. A supervisor SHALL accept only the caller names in its closed
list, and a rule without a caller image for the staging caller alone. No dev namespace SHALL
be admitted to the supervisor's host directory.

#### Scenario: Staging caller not listed

- **WHEN** a pod in the staging solver namespace calls a supervisor whose list lacks the
  staging caller name
- **THEN** the supervisor refuses it

#### Scenario: Production rule without a caller image

- **WHEN** the supervisor decodes a rule for the production pod caller whose caller image is
  null
- **THEN** it refuses the configuration

#### Scenario: Staging rule without a caller image

- **WHEN** the supervisor decodes a rule for the staging pod caller whose caller image is null
- **THEN** it accepts the rule, and a staging backend of any admitted digest is served

#### Scenario: Dev pod mounts the solver directory

- **WHEN** a pod in a dev namespace mounts the supervisor's host directory
- **THEN** admission denies it

#### Scenario: Image trusted for the other environment only

- **WHEN** a pod in the staging solver namespace runs an image that only production's list
  names
- **THEN** admission denies it

#### Scenario: Third trusted namespace

- **WHEN** a namespace other than the declared solver namespaces carries the trusted label
- **THEN** admission denies it

#### Scenario: Supervisor on a node with both environments

- **WHEN** the solver play targets a node that carries both `product` and `nonproduction`
- **THEN** the role's assertion fails before anything is installed

### Requirement: One executor on the CI host, and no build from a pull request

Every job on the CI host SHALL be a catalogue job admitted by the host pool. A workflow on
the build runner SHALL be triggered only by a push to `main` or a manual run at `main`, SHALL
build through the pool's launcher, and MUST NOT pass a GitHub secret to the build or write to
this repository. The runner SHALL refuse any other workflow reference. The identity that
writes staging manifests SHALL write the pins repository only and MUST NOT rewrite its
history.

#### Scenario: Trigger outside the allow-list

- **WHEN** a workflow that names the build runner's label has any trigger other than a push to
  `main` and a manual dispatch
- **THEN** the workflow check fails and names the workflow

#### Scenario: Pin writer installed elsewhere

- **WHEN** the repository list of the identity that writes staging manifests names any
  repository other than the staging pins repository
- **THEN** the runner step stops and the identity is removed

#### Scenario: History of the pins repository

- **WHEN** the rule against forced and deleting pushes on the pins repository's `main` has a
  bypass actor
- **THEN** the runner step stops

#### Scenario: Build of a commit that is not on main

- **WHEN** the commit a build was started for is not on `main` of its source repository
- **THEN** the build commits nothing to the pins repository

#### Scenario: Build outside the pool

- **WHEN** a job on the build runner's label does not start through the host pool's launcher
- **THEN** the workflow check fails

#### Scenario: Workflow from a branch

- **WHEN** a job reaches the build runner from a pull request, from a workflow file on a branch
  other than `main`, or from a manual run on another ref
- **THEN** the runner's job-started hook fails the job before any step

#### Scenario: Workflow writes to this repository

- **WHEN** a workflow that names the build runner's label grants `contents: write` or pushes
  to this repository
- **THEN** the workflow check fails and names the workflow

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

#### Scenario: Throwaway cluster on retained storage

- **WHEN** a throwaway cluster's claim names a storage class that retains
- **THEN** the delivery check fails

#### Scenario: Drill would write into the live archive

- **WHEN** a throwaway cluster carries a WAL archiver or the live cluster's name
- **THEN** the drill refuses to start

#### Scenario: One database rolled back

- **WHEN** the production cluster is restored beside the live one to an earlier time and one
  database is copied back
- **THEN** that database holds its earlier state and every other database is unchanged

#### Scenario: Production data before a proven restore

- **WHEN** an app's port would write production data and no receipt of a restore and a
  single-database rollback exists
- **THEN** the port does not proceed
