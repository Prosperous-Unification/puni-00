## ADDED Requirements

### Requirement: One trust class per host

Every fleet host SHALL hold one trust class, and a node's capabilities MUST be ones that
class allows. A node MAY carry `nonproduction` and `ingress` beside `observability`. No
node SHALL carry both `product` and `nonproduction`. No app and no database SHALL run on a
continuous integration host. The classes outside this change, and the one host that MAY
hold two, are defined by the changes `host-postgres` and `add-agent-hosts`.

#### Scenario: Declared fleet, minimal profile

- **WHEN** the desired state of the rebuilt production cluster is decoded as it is first built
- **THEN** the platform node carries `control-plane` and `platform-services`, the production
  apps node carries `product` and `ingress`, the observability node carries `observability`,
  `nonproduction` and `ingress`, and the placement check passes

#### Scenario: Declared fleet, full profile

- **WHEN** the desired state gives `nonproduction` and `ingress` to a node of their own and
  the observability node carries `observability` alone
- **THEN** the placement check passes with no change to any workload

#### Scenario: Production and staging on one node

- **WHEN** the desired state gives one node both `product` and `nonproduction`
- **THEN** the placement check fails and names the node

#### Scenario: Gate host listed as a k3s node

- **WHEN** an inventory lists one host under `gate_hosts` and under a k3s group
- **THEN** the placement check fails and names the host

### Requirement: Workloads are placed by capability under two profiles

A workload SHALL select a capability and MUST NOT name a server. The mapping from capability
to server SHALL live in the fleet's desired state and inventory alone, so that moving a
capability to another node changes no file under `infra/argocd`.

#### Scenario: Workload names a server

- **WHEN** a pod template in the rebuilt cluster's tree selects a node by host name
- **THEN** the delivery check fails and names the workload

### Requirement: A joined node's capabilities follow its inventory

The capability labels of a node that has already joined, and the host settings that depend
on its capabilities, SHALL follow its inventory through a play that touches no other label.
The play MUST refuse to remove a capability while a pod that selects it, other than a
DaemonSet's, is on the node, or while a retained volume of an environment that selects it
is bound to the node.

#### Scenario: Capability added to a joined node

- **WHEN** the inventory gives a joined node a capability and the capability play runs
- **THEN** the node carries the label, and it still does after the agent restarts

#### Scenario: Ingress added to a joined node

- **WHEN** the inventory gives a joined node `ingress` and the capability play runs
- **THEN** a non-root process on that host can bind ports 80 and 443

#### Scenario: Capability removed under a running pod

- **WHEN** the play would remove a capability while a pod that selects it, other than a
  DaemonSet's, is on the node
- **THEN** the play fails, names the pod and removes nothing

#### Scenario: Capability removed under a DaemonSet only

- **WHEN** the only pod on the node that selects the capability belongs to a DaemonSet
- **THEN** the play removes the label

#### Scenario: Capability removed while a volume is bound

- **WHEN** the play would remove a capability while a retained volume of an environment that
  selects it is bound to the node and its workload runs no pod
- **THEN** the play fails, names the volume and removes nothing

### Requirement: Every role has a minimum disk

Each role SHALL state the smallest root disk its server may have, and the step that creates
a server MUST stop before anything is installed when the server's disk is smaller, whatever
provider or product the server comes from.

#### Scenario: Server with the memory and not the disk

- **WHEN** a server created for a role reports a root disk under that role's minimum
- **THEN** the step stops and the server is not bootstrapped or joined

### Requirement: Monitoring outranks non-production on a shared node

The pods of the observability units and of MLflow SHALL carry a priority class above the
cluster default from their first start, and a pod in a staging or dev namespace MUST NOT
name a priority class.

#### Scenario: Observability pod without the class

- **WHEN** a pod template of an observability unit or of MLflow lacks the priority class
- **THEN** the delivery check fails and names the workload

#### Scenario: Non-production pod names a priority class

- **WHEN** a pod that names a priority class is created in a staging or dev namespace
- **THEN** admission denies it

#### Scenario: Node short of memory

- **WHEN** a node's available memory stays under the floor, or a container is killed for
  memory
- **THEN** an alert fires and names the node

#### Scenario: Other labels

- **WHEN** a node carries a label outside `puni.dev/capability-` that the inventory does not
  name
- **THEN** the play leaves it

### Requirement: Platform services and non-production capabilities

The fleet model SHALL define the capabilities `platform-services` and `nonproduction` for
platform clusters only.

#### Scenario: Workers node carries one

- **WHEN** a workers-cluster node declares `platform-services` or `nonproduction`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires one of the two and no present node carries it
- **THEN** the fleet decoder refuses the fleet

### Requirement: The control plane runs on a tainted platform node

In a platform cluster that requires `platform-services`, the control-plane node SHALL carry
`platform-services`, MUST NOT carry `product`, `nonproduction`, `ingress` or `observability`, and SHALL be registered
with the taint `CriticalAddonsOnly=true:NoSchedule`, which the components k3s packages
tolerate.

#### Scenario: Server on the production apps node

- **WHEN** the desired state gives the control-plane node the capability `product`,
  `ingress` or `observability`
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

Every pod template of the rebuilt cluster's tree SHALL select a node capability, except
three node agents that run on every node. Only workloads that select `platform-services` or,
as the change `host-postgres` defines it, `database`, and those agents, MAY tolerate the
platform taint. A staging workload SHALL select `nonproduction` and a production app
workload `product`, so that the two run on different nodes.

#### Scenario: Workload without a role selector

- **WHEN** the delivery check reads a pod template whose node selector names no capability
- **THEN** the check fails and names the workload

#### Scenario: Toleration without the selector

- **WHEN** a pod template tolerates `CriticalAddonsOnly` or every taint, selects neither
  `platform-services` nor `database`, and is not one of the three named node agents
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

- **WHEN** the rebuilt cluster is observed with its three nodes joined, in the minimal
  profile
- **THEN** every Argo CD, OpenBao and cert-manager pod runs on the platform node, a Traefik pod
  runs on the production apps node and on the node that carries `nonproduction`, every
  production app pod runs on the production apps node, every staging pod runs on the node
  that carries `nonproduction`, no app pod runs on the platform node, and no production app
  pod runs on the observability node

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

- **WHEN** the dev poller is to be stopped and neither the staging build path's receipt nor the
  owner's dated waiver exists
- **THEN** the staging step does not stop it

#### Scenario: Render reaches beyond staging

- **WHEN** a rendered staging directory holds a cluster-scoped object, a kind outside the
  staging project's list or a namespace that is not the app's staging one
- **THEN** the build refuses to commit it

#### Scenario: Render is empty, failed or holds a Secret

- **WHEN** the staging build's render is empty, its command fails, or it holds a Secret
  object
- **THEN** nothing is committed and the app's pins directory stays as it was

#### Scenario: First render of a stateful app

- **WHEN** a staging Application file of an app with a store is merged while the head of
  its source directory is not the zero-replica render
- **THEN** the step stops before any pod of the app starts on an empty claim

#### Scenario: Promotion of a base staging has not run

- **WHEN** an app's base or its production overlay differs between the commit staging runs
  and `main` in more than image digests
- **THEN** the promotion check refuses the promotion

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
Certificate whose host is not on its namespace's list. Every non-production namespace SHALL
have a quota and a default-deny policy, and SHALL enforce the `restricted` Pod Security
level unless it is an admitted solver namespace.

#### Scenario: Staging pod selects the production node

- **WHEN** a pod is created in a staging namespace with the `product` selector
- **THEN** admission denies it

#### Scenario: Privileged or host-path pod in a non-production namespace

- **WHEN** a privileged pod, or one with a `hostPath` volume, is created in a staging or dev
  namespace other than a solver namespace
- **THEN** Pod Security refuses it

#### Scenario: Non-production namespace without enforcement

- **WHEN** a staging or dev namespace of the tree, other than an admitted solver namespace,
  lacks the enforce label
- **THEN** the delivery check fails and names the namespace

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

A gate host SHALL NOT be deleted before a full gate has passed on the CI cluster.

#### Scenario: No gate has passed there

- **WHEN** the CI cluster has no recorded full gate that exited 0
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

### Requirement: The staging build writes the pins repository only

Jobs run on the CI cluster that the capability `ci-orchestration` defines, and no pull
request starts a build there. The identity that writes staging manifests SHALL write the
pins repository only and MUST NOT rewrite its history. A build SHALL commit nothing for a
commit that is not on `main` of its source repository.

#### Scenario: Pin writer installed elsewhere

- **WHEN** the repository list of the identity that writes staging manifests names any
  repository other than the staging pins repository
- **THEN** the step stops and the identity is removed

#### Scenario: History of the pins repository

- **WHEN** the rule against forced and deleting pushes on the pins repository's `main` has a
  bypass actor
- **THEN** the step stops

#### Scenario: Build of a commit that is not on main

- **WHEN** the commit a build was started for is not on `main` of its source repository
- **THEN** the build commits nothing to the pins repository

### Requirement: Health and recovery read a cluster delivered by Argo CD

The fleet health check SHALL read Applications on a cluster whose delivery is Argo CD and
MUST NOT report the absence of Flux objects there as a failure. It SHALL fail on a Degraded
Application, on a staging Application that is OutOfSync and on an Application that has no
file, and SHALL list a production or platform Application that is OutOfSync with its age
without failing. The cold-restore verification SHALL accept such a cluster.

#### Scenario: Degraded Application

- **WHEN** an Application of the cluster is Degraded
- **THEN** the health check fails and names it

#### Scenario: No Application at all

- **WHEN** a cluster delivered by Argo CD returns no Application
- **THEN** the health check fails

#### Scenario: Production unit waiting for a sync

- **WHEN** a production or platform Application is OutOfSync
- **THEN** the health check lists it with how long it has been so and does not fail

#### Scenario: Restore drill on an Argo CD cluster

- **WHEN** the cold-restore verification runs against a restored cluster delivered by Argo CD
- **THEN** it reads the root Application and passes when that is present

### Requirement: Platform services have no public route

No unit of the `platform` or `ci` project SHALL define an Ingress, an IngressRoute or a
route of a Gateway, except the `traefik` unit and an Ingress of the Tailscale operator's
class.

#### Scenario: A platform tool given a public route

- **WHEN** a unit of the `platform` project defines an Ingress of Traefik's class, an
  IngressRoute or a Service of type LoadBalancer
- **THEN** the `delivery` check refuses the tree and names the object

#### Scenario: A tool exposed to the tailnet

- **WHEN** a unit of the `platform` project defines an Ingress of the Tailscale operator's
  class
- **THEN** the `delivery` check passes

### Requirement: No Service opens a public port

No unit of any project SHALL define a Service of type LoadBalancer or NodePort, except the
telemetry gateway and the secret store's private listener, each by name. Admission SHALL
deny one in a staging, dev or production namespace. A host of the new inventories SHALL
drop, before destination NAT, what arrives on its public interface for a port it does not
serve.

#### Scenario: A NodePort from the pins repository

- **WHEN** a staging render or a pins commit holds a Service of type NodePort
- **THEN** the render step refuses it, and admission denies it if it is applied

#### Scenario: A forwarded port on the public interface

- **WHEN** a NodePort Service exists on a new host and a connection arrives for it on the
  public interface
- **THEN** the host drops it, and the telemetry gateway's ports answer from an enrolled
  private address only

### Requirement: New hosts admit nothing public but what they serve

A host of the new inventories SHALL admit on its public interface only the ports its
inventory lists, which MUST be none unless the host carries `ingress`, and SHALL admit SSH
and the Kubernetes API on the tailnet interface only. An existing inventory's rendered
firewall SHALL NOT change.

#### Scenario: Public SSH on a new host

- **WHEN** the rendered firewall of a host of the new inventories admits port 22 on its
  public interface
- **THEN** the role's test fails

#### Scenario: An old inventory

- **WHEN** the firewall is rendered for an existing inventory
- **THEN** it is byte-equal to the rendering before this change

### Requirement: Access rules are one tested policy file

The private access network's rules SHALL be one file in this repository that names tags and
the service's built-in groups and names no person. A server tag SHALL be granted no path to
another device, and the tag of the trigger job SHALL be granted the CI cluster's API server
proxy and nothing else.

#### Scenario: A server granted a path

- **WHEN** the policy file grants a server tag a path to any device
- **THEN** the policy test fails and names the grant

#### Scenario: The trigger job granted more

- **WHEN** the policy file grants `tag:ci-trigger` anything but the CI cluster's API server
  proxy
- **THEN** the policy test fails

#### Scenario: A person named

- **WHEN** the policy file names a person
- **THEN** the policy test fails

### Requirement: Every tenant-scoped namespace names its tenant

Every namespace of a `staging`, `production`, CI or database unit SHALL carry the label
`puni.dev/tenant`, and an object in such a namespace SHALL NOT carry another tenant's
label.

#### Scenario: A namespace without a tenant

- **WHEN** a namespace of the `staging` project has no `puni.dev/tenant` label
- **THEN** the `delivery` check refuses the tree and names the namespace

#### Scenario: An object of another tenant

- **WHEN** an object in a namespace labelled for one tenant carries another tenant's label
- **THEN** the `delivery` check refuses the tree

### Requirement: The controller's keys meet only an image the controller built

The age identity and the admin key SHALL be mounted only into a controller image whose
digest equals both the lock's and that of the controller's own build of the same commit of
`main`. An image built elsewhere SHALL NOT be given the keys on the strength of its digest
pin.

#### Scenario: Image built elsewhere

- **WHEN** the image at the locked digest has no record of a build of that commit on the
  controller
- **THEN** `fleet_ansible` refuses to mount the keys

### Requirement: An old writer does not restart over newer data

After an app's names point at the new cluster, the new writer SHALL be stopped before its
store is compared with the restored stamp, and the comparison SHALL cover the store's whole
durable state. The old instance SHALL be started again only when the two are equal, or
after the stopped writer's latest state has been restored onto the old side and checked.
The old and the new writer of one store SHALL never run at the same time.

#### Scenario: Going back after an edit

- **WHEN** an edit has been made on the new side and a rollback is considered
- **THEN** the new writer is stopped first, the comparison with the restored stamp reports
  a difference, and the old side is not started until the new side's final backup has been
  restored there

#### Scenario: An edit outside the event log

- **WHEN** the only write on the new side is a row in a table other than `event_log`
- **THEN** the comparison still reports a difference

#### Scenario: Going back before any write

- **WHEN** the stopped new store equals the restored stamp
- **THEN** the names may be pointed back and the old side started

### Requirement: A final backup is of the stopped store

A store's final backup SHALL be taken from the store after its writer has stopped. An
earlier copy SHALL stand in for it only when its digest equals that of the stopped store.

#### Scenario: An earlier copy offered as the final backup

- **WHEN** a copy taken before the writer stopped differs in digest from the stopped store
- **THEN** it is refused as the final backup

### Requirement: A staging render never moves backwards and carries no schema change

The staging build SHALL refuse to commit a render whose source commit is not a descendant
of the one the app's pins directory names. It SHALL refuse a source commit whose migration
set for the app differs from that of the commit staging runs, until an automated schema
path exists.

#### Scenario: Builds finishing in reverse order

- **WHEN** a build of an older commit finishes after a build of a newer one
- **THEN** its commit is refused and the pins directory keeps the newer render

#### Scenario: A merge that adds a migration

- **WHEN** the source commit adds a migration for the app
- **THEN** the render step refuses it and names the attended path

### Requirement: MLflow is restored whole before its old host is deleted

MLflow's backup SHALL hold its metadata store and its artifact store under one stamp, with
a manifest of every artifact's SHA-256. The old host SHALL NOT be deleted before both have
been restored together and one known artifact has been fetched through MLflow with its
recorded SHA-256.

#### Scenario: Metadata without artifacts

- **WHEN** a stamp holds the metadata store and no artifact archive
- **THEN** the verify job fails

#### Scenario: A known artifact after the move

- **WHEN** the recorded run's artifact is fetched from the new instance
- **THEN** its SHA-256 equals the one recorded on the old host
