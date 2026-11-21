## ADDED Requirements

### Requirement: One node role per host

Every fleet host SHALL hold exactly one node role: platform services, continuous integration,
observability, or production apps. A host's capabilities MUST be those of its role. The
continuous integration role covers gates and image builds only; no app and no database SHALL
run on a continuous integration host.

#### Scenario: Declared fleet

- **WHEN** the desired state of the rebuilt production cluster is decoded
- **THEN** the platform node carries `control-plane` and `platform-services`, the observability
  node carries `observability`, the production apps node carries `product`, `staging` and
  `ingress`, and no node carries the capabilities of two roles

#### Scenario: Gate host listed as a k3s node

- **WHEN** an inventory lists one host under `gate_hosts` and under a k3s group
- **THEN** the placement check fails and names the host

### Requirement: Platform services and staging capabilities

The fleet model SHALL define the capabilities `platform-services` and `staging` for platform
clusters only.

#### Scenario: Workers node carries one

- **WHEN** a workers-cluster node declares `platform-services` or `staging`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires one of the two and no present node carries it
- **THEN** the fleet decoder refuses the fleet

### Requirement: The control plane runs on a tainted platform node

In a platform cluster that requires `platform-services`, the control-plane node SHALL carry
`platform-services`, MUST NOT carry `product`, `staging` or `ingress`, and SHALL be registered
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
tolerate the platform taint. A staging workload SHALL select `staging` and a production app
workload SHALL select `product`, so that staging can move to a node of its own without a
manifest change.

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

#### Scenario: Staging workload selects the production label

- **WHEN** a pod template of a `staging` Application does not select `staging`, or one of a
  `production` Application does not select `product`
- **THEN** the check fails and names the workload

#### Scenario: Running placement

- **WHEN** the rebuilt cluster is observed with all three nodes joined
- **THEN** every Argo CD, OpenBao and cert-manager pod runs on the platform node, every Traefik
  pod runs on the production apps node, and no app pod runs on the platform or observability
  node

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

A staging Application SHALL sync automatically from `main` with pruning, self-healing and
retry. A production Application and a platform unit SHALL track `main` with automated sync off
and change only when a person syncs them. The root Application SHALL manage only Application
and AppProject objects, self-heal and never prune. No Application file SHALL carry an
`operation` block. The delivery check SHALL run inside a check that `main` requires.

#### Scenario: Merge to a staging overlay

- **WHEN** a change to a staging overlay is merged to `main`
- **THEN** Argo CD applies it without operator action

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

#### Scenario: Project reaches the other environment

- **WHEN** the `staging` or `production` project admits a cluster-scoped kind, a Namespace, or
  a namespace of the other environment
- **THEN** the delivery check fails

#### Scenario: Staging claims a production name

- **WHEN** an Ingress or Certificate of a staging Application names a host that a production
  Application names, or the reverse
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

### Requirement: The interface syncs production and nothing else

The Argo CD interface MUST have no public route. Its one local account SHALL read every
Application and MAY sync Applications of the `production` project only, at the revision the
Application names, and MUST NOT roll one back. The built-in `admin` account MUST be disabled. Platform units SHALL be
synced by the sync playbook with the node's credential.

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

- **WHEN** the sync playbook is given a unit of the `staging` or `production` project
- **THEN** it refuses before syncing anything

### Requirement: Delivery cannot delete data

Every PersistentVolumeClaim in the rebuilt cluster's tree, every namespace that holds one, and
every custom resource from which an operator creates claims SHALL carry the sync options
`Prune=false` and `Delete=false`. No Application SHALL carry the resources finalizer.

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

- **WHEN** a staging store is to be restored from a backup of a production store
- **THEN** the move stops; a staging restore names its source file, and only the dev store's
  file is accepted

### Requirement: Gates do not stop

A gate host SHALL NOT be deleted before the new CI host is calibrated.

#### Scenario: Successor not calibrated

- **WHEN** the new CI host has no recorded calibration
- **THEN** neither old gate host is deleted

### Requirement: The solver is bound per environment

On the rebuilt cluster the admission policy SHALL trust one solver namespace, one host
directory and one node selector for each environment, with a parameter ConfigMap of its own,
and each environment SHALL have its own solver supervisor.

#### Scenario: Staging backend mounts production's directory

- **WHEN** a pod in the staging solver namespace mounts the production solver directory
- **THEN** admission denies it

#### Scenario: Image trusted for the other environment only

- **WHEN** a pod in the staging solver namespace runs an image that only production's list
  names
- **THEN** admission denies it

#### Scenario: Third trusted namespace

- **WHEN** a namespace other than the two solver namespaces carries the trusted label
- **THEN** admission denies it

### Requirement: Builds triggered by a merge never run code from a pull request

A workflow whose job runs on the CI host's build runner SHALL be triggered only by a push to
`main` or a manual run, SHALL start its build through the host pool's launcher, and MUST NOT
pass a GitHub secret to the registry push.

#### Scenario: Pull request trigger

- **WHEN** a workflow that names the build runner's label has a `pull_request`,
  `pull_request_target` or `issue_comment` trigger
- **THEN** the workflow check fails and names the workflow

#### Scenario: Build outside the pool

- **WHEN** a job on the build runner's label does not start through the host pool's launcher
- **THEN** the workflow check fails
