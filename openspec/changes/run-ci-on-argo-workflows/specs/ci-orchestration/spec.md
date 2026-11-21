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

### Requirement: One public path

The CI cluster SHALL accept inbound traffic from the internet on one host and one path, the
GitHub webhook, and on nothing else. The Argo Workflows server and the cluster's API SHALL
be reachable over the private access network only.

#### Scenario: Route list

- **WHEN** the CI tree is rendered
- **THEN** it holds exactly one ingress route, to the event source's Service

#### Scenario: Unsigned delivery

- **WHEN** a delivery arrives without a valid signature for the webhook secret
- **THEN** the event source refuses it and no Workflow starts

### Requirement: Only a push to main starts a job by itself

An EventSource SHALL subscribe to `push` and to no other event, SHALL have a webhook secret
and SHALL have no API token. Every Sensor SHALL filter on the repository and on
`refs/heads/main`.

#### Scenario: Pull request

- **WHEN** a pull request is opened or updated, from a fork or from a branch
- **THEN** nothing starts on the CI cluster

#### Scenario: Push to a branch

- **WHEN** a push to a ref other than `refs/heads/main` is delivered
- **THEN** no Workflow starts

#### Scenario: Event source that can manage hooks

- **WHEN** an EventSource under the tree sets `apiToken`
- **THEN** the `delivery` check fails and names it

#### Scenario: Event list by name

- **WHEN** an EventSource subscribes to `pull_request_target`
- **THEN** the `delivery` check fails, because the rule allows `push` and refuses the rest

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
whose name ends in `-build`, Traefik's host network excepted. A pod in a `-build` namespace
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
under `argo/`.

#### Scenario: Failed job

- **WHEN** a job's main step fails
- **THEN** its exit handler runs and records the failure

### Requirement: The old gate hosts stay until a gate passes here

No old gate host SHALL be deleted before a full gate has exited 0 through a Workflow on the
CI cluster, on a commit that also passed on an old host.

#### Scenario: Retirement without the receipt

- **WHEN** CI-A4 has no receipt
- **THEN** the core change's A21 and A22 do not start
