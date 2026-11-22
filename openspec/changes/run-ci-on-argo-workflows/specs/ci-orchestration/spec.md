## ADDED Requirements

### Requirement: CI runs on a cluster of its own purpose

The fleet model SHALL define a cluster purpose `ci` and a capability `ci`. A node of a `ci`
cluster MAY carry `control-plane` and `ci` together and SHALL carry nothing else. No node of
another purpose SHALL carry `ci`.

#### Scenario: Single-node CI cluster

- **WHEN** the desired state declares one `ci` cluster with one node that carries
  `control-plane` and `ci`
- **THEN** the fleet decoder accepts it

#### Scenario: CI capability on another cluster

- **WHEN** a `platform` or `workers` node declares `ci`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Platform capability on the CI cluster

- **WHEN** a `ci` node declares `product`, `ingress`, `observability`, `forge` or `execution`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Workers rule unchanged

- **WHEN** a `workers` node declares `control-plane` and `execution`
- **THEN** the fleet decoder refuses the fleet

### Requirement: Credentials cross from the platform cluster only

The platform cluster's Argo CD SHALL hold the one credential for the CI cluster. The CI
cluster SHALL hold no kubeconfig, token or Secret that authenticates to the platform
cluster.

#### Scenario: Registration

- **WHEN** the registration play has run
- **THEN** the platform cluster's `argocd` namespace holds a cluster Secret for the CI
  cluster, and the CI node holds nothing of the platform cluster

#### Scenario: Same server twice

- **WHEN** the play is given a platform kubeconfig and a CI kubeconfig that name one server
- **THEN** it refuses to run

### Requirement: Destinations are fixed per project

An Application of the project `ci` SHALL name the CI cluster as its destination and no
other. An Application of any other project SHALL name the in-cluster destination only. CI
Applications SHALL have automated sync off.

#### Scenario: Staging unit pointed at the CI cluster

- **WHEN** a staging Application names the CI cluster
- **THEN** the `delivery` check fails and names it

#### Scenario: CI unit pointed at the platform cluster

- **WHEN** an Application of project `ci` names the in-cluster destination
- **THEN** the `delivery` check fails and names it

### Requirement: No public path

The CI cluster SHALL accept no inbound traffic from the internet. Its tree SHALL hold no
Ingress, IngressRoute or Service of type LoadBalancer or NodePort other than an Ingress of
the Tailscale operator's class, and no EventSource of a type other than `calendar` and
`resource`, neither of which listens on a network. The
Argo Workflows server and the cluster's API SHALL be reachable over the private access
network only.

#### Scenario: Route list

- **WHEN** the CI tree is rendered
- **THEN** it holds no route of an ingress controller and no public Service

#### Scenario: Listening event source

- **WHEN** an EventSource under the tree is of a type that listens on a network
- **THEN** the `delivery` check fails and names it

### Requirement: Only a push to main starts a job by itself

A trigger workflow file SHALL start on `push` to `main` and on a manual dispatch on `main`
and on no other event. The key it joins the private access network with SHALL be a secret
of an environment whose deployment branch rule admits `main` only.

#### Scenario: Pull request

- **WHEN** a pull request is opened or updated, from a fork or from a branch
- **THEN** nothing starts on the CI cluster

#### Scenario: Push to a branch

- **WHEN** a commit is pushed to a ref other than `refs/heads/main`
- **THEN** no Workflow starts

#### Scenario: Workflow on a branch asks for the key

- **WHEN** a workflow on a ref other than `main`, from a fork or from a branch of the
  repository, names the trigger's environment
- **THEN** the provider refuses it the environment and no device joins the network

#### Scenario: Trigger file with another event

- **WHEN** a trigger workflow file names `pull_request_target`
- **THEN** the lint in `gate` fails, because the rule allows `push` to `main` and a manual
  dispatch on `main` and refuses the rest

### Requirement: The trigger identity starts staging builds only

The trigger identity SHALL be bound to a Role that may create, get, list and watch
Workflows in the tenant's ordinary namespace and nothing else, and SHALL have no binding in
a `-build` namespace. A `staging-build` SHALL fail unless its `sha` is on `main`. A gate
SHALL be started only by an operator identity or by the tenant's schedule.

#### Scenario: Trigger identity asks for a gate

- **WHEN** a device tagged `tag:ci-trigger` creates a Workflow in the tenant's `-build`
  namespace
- **THEN** the API refuses it

#### Scenario: Trigger identity asking for more

- **WHEN** a device tagged `tag:ci-trigger` reads a Secret or creates an object outside the
  tenant's namespace through the API server proxy
- **THEN** the API refuses it

#### Scenario: Build of a commit that is not on main

- **WHEN** a `staging-build` is submitted with a `sha` that `main` does not contain
- **THEN** its first step fails and nothing is pushed or committed

### Requirement: The trigger identity submits one template

A Workflow the trigger identity creates SHALL be admitted only if it references the
`staging-build` template and sets no parameter but that template's own. A push that
touches no source path of an app SHALL start nothing.

#### Scenario: Trigger identity asks for a report

- **WHEN** a device tagged `tag:ci-trigger` creates a Workflow that references
  `report-status`, or a `staging-build` with a parameter that template does not take
- **THEN** admission refuses it

#### Scenario: Merge that touches no app

- **WHEN** a merge to `main` changes no source path of any app the tenant builds
- **THEN** no Workflow starts and the freshness check stays green

### Requirement: Jobs are submitted from templates that come from main

The controller SHALL run with `templateReferencing: Strict`. A Sensor's trigger SHALL
reference a WorkflowTemplate and SHALL NOT hold a Workflow's templates inline. No
ClusterWorkflowTemplate SHALL exist under the CI tree.

#### Scenario: Inline Workflow

- **WHEN** a Workflow with its own templates is submitted
- **THEN** the controller refuses it

#### Scenario: Overridden pod

- **WHEN** a submission sets `podSpecPatch`, `serviceAccountName` or `volumes`
- **THEN** the controller refuses it

#### Scenario: Inline trigger

- **WHEN** a Sensor's trigger carries a Workflow spec without `workflowTemplateRef`
- **THEN** the `delivery` check fails and names it

### Requirement: Privilege is confined to build namespaces

A privileged container, a host path or the host network SHALL appear only in a namespace
whose name ends in `-build`. A pod in a `-build` namespace
SHALL mount no Secret other than a registry pull configuration.

#### Scenario: Privileged pod elsewhere

- **WHEN** a privileged pod is created in a tenant's ordinary namespace
- **THEN** admission refuses it

#### Scenario: Secret in a build namespace

- **WHEN** a template in a `-build` namespace mounts a Secret
- **THEN** the `delivery` check fails and names it

#### Scenario: Gate pod

- **WHEN** the gate template is rendered
- **THEN** its pod is in the tenant's `-build` namespace and mounts no Secret

### Requirement: A job is admitted only if it fits

Every pod template under the CI tree SHALL select `ci` and SHALL set requests and limits.
Requests and limits SHALL come from the tenant's limits file and from nowhere else. At most
one gate SHALL run at a time.

#### Scenario: Number in a template

- **WHEN** a WorkflowTemplate holds a literal request or limit
- **THEN** the `delivery` check fails and names it

#### Scenario: No room

- **WHEN** a job's request exceeds what the node has free
- **THEN** its pod stays Pending and starts when room appears

#### Scenario: Second gate

- **WHEN** a gate is submitted while one runs
- **THEN** it waits on the semaphore

#### Scenario: Build beside a gate

- **WHEN** a `staging-build` is submitted while a gate runs, or a gate while a build runs
- **THEN** the second waits on the mutex the two templates share and starts when the first
  ends

### Requirement: A run is at the commit it names

The gate template SHALL clone the repository at its `sha` parameter into an empty volume and
SHALL fail unless the checked-out commit is that one. Its image SHALL be named by digest.

#### Scenario: Wrong commit

- **WHEN** the clone ends at a commit other than `sha`
- **THEN** the Workflow fails before the gate starts

### Requirement: A tenant is a directory

Every tenant-scoped object SHALL live in the tenant's two namespaces or under the tenant's
store path, cache claim and object-storage prefix. The tenant's unit SHALL render for
another tenant with no change but its name, repositories and limits file.

#### Scenario: Second tenant

- **WHEN** the unit is rendered for a fixture tenant
- **THEN** it renders, and no object of it names `puni`

#### Scenario: Another tenant's store path

- **WHEN** a tenant's service account reads a store path outside `ci/<tenant>`
- **THEN** the store refuses it

### Requirement: A result is recorded

Every WorkflowTemplate SHALL have an exit handler that runs whatever the outcome. Every
Workflow SHALL carry the labels `tenant` and `template`. A commit status SHALL use a context
under `argo/`. A report SHALL be made only for a finished `gate` or `staging-build`, once
for each Workflow UID.

#### Scenario: Failed job

- **WHEN** a job's main step fails
- **THEN** its exit handler runs and records the failure

#### Scenario: A finished report

- **WHEN** a `report-status` Workflow finishes
- **THEN** no report is started for it

#### Scenario: The same Workflow reported twice

- **WHEN** a second finish event arrives for a Workflow that already has its report
- **THEN** no second report is created

### Requirement: A report belongs to one source Workflow

A report SHALL carry its source Workflow's UID. An existing report SHALL count as that
Workflow's only when its UID equals the event's, and an event whose source Workflow no
longer exists SHALL start nothing.

#### Scenario: A name taken by another source

- **WHEN** a report of that name exists and its UID label differs from the event's
- **THEN** the trigger fails and the alert is raised

#### Scenario: An event after its Workflow expired

- **WHEN** a finish event arrives for a Workflow whose object has been removed
- **THEN** no report is created

### Requirement: The old gate hosts stay until a gate passes here

No old gate host SHALL be deleted before a full gate has exited 0 through a Workflow on the
CI cluster, on a commit that also passed on an old host.

#### Scenario: Retirement without the receipt

- **WHEN** CI-A4 has no receipt
- **THEN** the core change's A21 and A22 do not start
