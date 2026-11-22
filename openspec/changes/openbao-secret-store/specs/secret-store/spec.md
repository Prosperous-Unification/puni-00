## ADDED Requirements

### Requirement: Secrets reach pods only through namespace-scoped sync

Store-sourced Secrets SHALL be delivered only by External Secrets Operator into Kubernetes
Secrets. Each `ExternalSecret` SHALL reference a `SecretStore` in its own namespace and SHALL
use `deletionPolicy: Retain` and `creationPolicy: Orphan`. The secret rules MUST refuse
`ClusterSecretStore`, `ClusterExternalSecret`, `PushSecret`, `ClusterPushSecret`, generators,
the OpenBao agent injector and the CSI provider anywhere under `infra/argocd`.

#### Scenario: A cluster-wide store is committed

- **WHEN** a manifest under `infra/argocd` declares a `ClusterSecretStore`
- **THEN** `tool-fleet:check` fails naming the manifest and kind

#### Scenario: An ExternalSecret references another namespace's store

- **WHEN** an `ExternalSecret` in `velero` references a store outside `velero`
- **THEN** `tool-fleet:check` fails before the unit can be synced

#### Scenario: An ExternalSecret would delete its Secret

- **WHEN** an `ExternalSecret` sets `creationPolicy: Owner` or a `deletionPolicy` other than `Retain`
- **THEN** `tool-fleet:check` fails naming the `ExternalSecret` and field

### Requirement: Sync objects live only where the plan puts them

Every `SecretStore` SHALL be an object of the `secret-sync` unit. An `ExternalSecret` SHALL be
an object of `secret-sync` or of a staging or production overlay. No Vault-kind issuer SHALL
exist under `infra/argocd`.

#### Scenario: An ExternalSecret in another platform unit

- **WHEN** an `ExternalSecret` is added to the source path of the `prometheus-stack` unit
- **THEN** `tool-fleet:check` fails naming the unit and object

#### Scenario: A SecretStore in an app overlay

- **WHEN** a staging overlay renders a `SecretStore`
- **THEN** `tool-fleet:check` fails naming the overlay and object

### Requirement: Only a namespace's reader can read its paths

The store SHALL admit, through Kubernetes auth, only the `secret-reader` service account of a
namespace, with audience `openbao` and from m1plat1's pod subnet, and only to that namespace's prefix:
`kv/platform/<namespace>/` for a platform namespace and
`kv/tenants/<tenant>/<environment>/<namespace>/` for a tenant's, computed from the namespace's
labels. Every role SHALL carry `token_bound_cidrs`.

#### Scenario: Cross-environment read

- **WHEN** the reader of a staging namespace requests a path under `kv/tenants/puni/production/`
- **THEN** the store denies the request and records it in the audit log

#### Scenario: Another account in the same namespace

- **WHEN** a workload account in a reading namespace presents a valid token to that namespace's role
- **THEN** login is denied

#### Scenario: A rendered role binds two namespaces

- **WHEN** the store declaration gives one role two bound namespaces, or a policy a path that the namespace's labels do not give
- **THEN** `tool-fleet secret-store plan` refuses, naming the role or policy

#### Scenario: A role without bound CIDRs or audience

- **WHEN** the declaration gives a Kubernetes auth role no `token_bound_cidrs` or no audience
- **THEN** `tool-fleet secret-store plan` refuses, naming the role

#### Scenario: A pod runs as a secret reader

- **WHEN** a pod in any namespace names `secret-reader` as its service account
- **THEN** the admission rule refuses it

### Requirement: A database namespace reads only the owner passwords it serves

The one cross-namespace grant SHALL be a database namespace's read of an app's
`<app prefix>/database-owner` path, for an app whose tenant and environment the declaration
says that database namespace serves.

#### Scenario: A database grant across environments

- **WHEN** the declaration grants `postgres-nonproduction`, which serves staging, the
  `database-owner` path of a production app
- **THEN** `tool-fleet secret-store plan` refuses, naming the grant

#### Scenario: A database grant to a runtime path

- **WHEN** the declaration grants a database namespace an app path that does not end in
  `database-owner`
- **THEN** `tool-fleet secret-store plan` refuses, naming the path

### Requirement: The CI cluster reads only its own mount

The CI cluster SHALL authenticate through its own JWT mount with a pinned validation key,
audience `openbao` and a bound service-account name and namespace, and read only
`ci/<tenant>/<namespace>/`.

#### Scenario: A token signed by another cluster

- **WHEN** a token signed by a key other than the CI cluster's pinned key is presented to its JWT mount
- **THEN** login is denied

#### Scenario: A platform role used through the node port

- **WHEN** a valid platform-cluster reader token logs in to its Kubernetes auth role through
  the node port from the CI server
- **THEN** login is denied, because the source is outside the role's bound CIDRs

#### Scenario: A CI reader asks for a platform path

- **WHEN** a CI namespace's reader requests a path under `kv/`
- **THEN** the store denies the request

### Requirement: An unavailable store stops secret changes, not running services

When the store is sealed, scaled to zero or unreachable, existing synced Secrets SHALL remain,
consumer pods SHALL start and restart with them, the sync playbook SHALL refuse only the units
that need `secret-sync`, and `OpenBaoSealed` or `ExternalSecretSyncFailed` SHALL fire once the
`alerts` unit runs.

#### Scenario: A forced sync during an outage

- **WHEN** OpenBao has zero ready replicas and an ExternalSecret is annotated with
  `force-sync=<now>`
- **THEN** the ExternalSecret reports Ready False with reason `SecretSyncedError`, and its
  Secret's data and `resourceVersion` are unchanged

#### Scenario: Store scaled to zero during a consumer restart

- **WHEN** OpenBao has zero ready replicas and a consumer pod is deleted
- **THEN** the replacement pod starts with the last synced Secret

#### Scenario: A sync during an outage

- **WHEN** OpenBao has zero ready replicas and the operator syncs a unit that needs `secret-sync` and then `eck-operator`
- **THEN** the playbook refuses the first, naming `secret-sync`, and syncs `eck-operator`

#### Scenario: Store pod killed

- **WHEN** the OpenBao pod is deleted
- **THEN** the replacement unseals from the cluster seal key with no human action

### Requirement: The store's pods run only on the platform server

Every pod template that the `openbao` and `external-secrets` units render, the Jobs included,
SHALL select `puni.dev/capability-platform-services` and tolerate
`CriticalAddonsOnly=true:NoSchedule`.

#### Scenario: A chart-rendered pod lacks the toleration

- **WHEN** the values of `external-secrets` drop the toleration from the certificate controller
- **THEN** the render test fails naming the pod template

### Requirement: The bootstrap set never depends on the store

The bootstrap set of design D10 SHALL be applied by the bootstrap playbook from SOPS decrypted
on the controller, and no `ExternalSecret` SHALL target a member of it.

#### Scenario: A bootstrap Secret is store-sourced by mistake

- **WHEN** an `ExternalSecret` targets `openbao-seal-key`
- **THEN** `tool-fleet:check` fails naming the bootstrap Secret

### Requirement: Store bring-up never pulls from a PUNI-operated registry

Every image of a unit in the `puni.dev/needs` closure of `secret-sync`, that unit included,
and of the units `argocd` and `tailscale-operator`, with the proxy image the latter's values
name, SHALL equal a digest-pinned `toolchain.json` entry from a declared upstream host, and the
secret rules MUST refuse any other image there.

#### Scenario: The Tailscale proxy image is served by Harbor

- **WHEN** the `tailscale-operator` unit's values set its proxy image to a Harbor host
- **THEN** `tool-fleet:check` fails naming the image and unit

#### Scenario: The OpenBao image is served by Harbor

- **WHEN** the `openbao` unit's values set the image repository to a Harbor host
- **THEN** `tool-fleet:check` fails naming the image and unit

#### Scenario: A unit joins the closure

- **WHEN** `openbao` gains a need on a unit whose image is tag-only
- **THEN** `tool-fleet:check` fails naming that unit's image

#### Scenario: A containerd mirror without fallback

- **WHEN** the inventory configures a containerd mirror for an upstream host without default-endpoint fallback
- **THEN** the Ansible check refuses it naming the host

### Requirement: Every store-sourced Secret is declared

Each `ExternalSecret`'s remote key SHALL lie under its namespace's prefix or a declared grant,
and each namespace that holds an `ExternalSecret` SHALL have a `secret-reader`, a `SecretStore`
in `secret-sync` and a role in the store declaration.

#### Scenario: A path outside the namespace's prefix

- **WHEN** an `ExternalSecret` in `cattle-system` reads `kv/platform/puni-secrets/canary`
- **THEN** `tool-fleet:check` fails naming the `ExternalSecret` and path

#### Scenario: A reading namespace without a role

- **WHEN** an `ExternalSecret` is added in a namespace that the store declaration has no role for
- **THEN** `tool-fleet:check` fails naming the namespace

### Requirement: An empty store is never served

In `steady` mode the store SHALL refuse to start the server when the initialisation marker is
absent from its data claim. In `first-init` and `restore` modes the network listener SHALL have
no node port and no tailnet exposure, and the NetworkPolicy SHALL admit nothing to it. Once the
declaration records a cluster's first initialisation, the secret rules SHALL refuse
`first-init` for that cluster.

#### Scenario: The server was rebuilt from an etcd snapshot

- **WHEN** the `openbao` objects restored from etcd start in `steady` mode on an empty data claim
- **THEN** the server does not start, no connection to its listener is accepted and `sys/init`
  is unreachable

#### Scenario: Restore mode before init

- **WHEN** the store runs in `restore` mode, uninitialised, and ESO's controller connects to
  the Service
- **THEN** the connection is refused, and `bao operator init` succeeds only through
  `kubectl exec`

#### Scenario: First-init after initialisation

- **WHEN** the declaration records an initialisation date and the unit's mode is `first-init`
- **THEN** `tool-fleet:check` fails naming the mode

### Requirement: An empty store is never configured or snapshotted

The snapshot Job SHALL refuse to run when the canary value is absent. `secret-store apply`
SHALL refuse when it is absent, unless the declaration records no initialisation date.

#### Scenario: Apply during the first initialisation

- **WHEN** the declaration records no initialisation date and `secret-store apply` runs
  against a store without the canary
- **THEN** it applies, creating the `kv` mount

#### Scenario: Apply on a store that lost its data

- **WHEN** the declaration records an initialisation date and `secret-store apply` runs
  against a store without the canary
- **THEN** it exits nonzero naming the missing canary and writes nothing

#### Scenario: The initialisation date was never committed

- **WHEN** the store holds the canary and the declaration records no initialisation date for
  that cluster
- **THEN** `secret-store apply` exits nonzero naming the missing date

#### Scenario: Snapshot of an empty store

- **WHEN** the store is initialised without the canary and the snapshot Job runs
- **THEN** the Job fails naming the missing canary and uploads nothing

### Requirement: Cold rebuild restores the store before any consumer

A rebuild of the platform server SHALL restore the store in `restore` mode from the latest
snapshot before `secret-sync` or any consumer is synced, without operator OIDC login.

#### Scenario: Cold rebuild with an empty server

- **WHEN** an empty server is rebuilt from the etcd snapshot, the bootstrap set and the latest store snapshot
- **THEN** the store restores, synced Secrets appear, and the units of orders 4 to 7 reach Synced and Healthy without manual Secret creation

#### Scenario: Cold rebuild while Auth0 is unreachable

- **WHEN** the rebuild runs in `restore` mode and the Auth0 tenant cannot be reached
- **THEN** initialisation and restore complete, the init root token is rejected afterwards, and
  the escrowed shares produce a root token through the break-glass socket

#### Scenario: Synced Secrets are written again after a rebuild

- **WHEN** after the rebuild one synced Secret is deleted and one store value is changed
- **THEN** the Secret is recreated and the changed value arrives, each with a fresh
  `refreshTime`

### Requirement: Unauthenticated generate-root is reachable only inside the pod

The legacy `sys/generate-root/*` endpoints SHALL be enabled only on the server's unix-socket
listener, and every TCP listener SHALL keep them disabled.

#### Scenario: Generate-root on the network listener

- **WHEN** a caller sends `sys/generate-root/attempt` to the Service without a token
- **THEN** the store refuses it

#### Scenario: The option on a TCP listener

- **WHEN** the rendered server configuration sets `disable_unauthed_generate_root_endpoints =
false` on a TCP listener
- **THEN** the render test fails naming the listener

### Requirement: Store configuration is declared and drift is visible

One Git declaration SHALL be the source of every mount, auth method, role, policy and password
policy, including the objects self-init creates. After self-init they SHALL change only through
the attended `tool-fleet secret-store apply`, which MUST refuse unknown live objects other than
OpenBao built-ins, and a drift job SHALL raise `OpenBaoConfigDrift` when the live configuration
differs. `tool-fleet secret-store generate` SHALL refuse to overwrite an existing path.

#### Scenario: Self-init objects are adopted

- **WHEN** `secret-store plan` first runs against a freshly self-initialised store
- **THEN** it reports the operator OIDC mount, role and admin policy as matching the declaration and refuses nothing

#### Scenario: A policy added out of band

- **WHEN** an operator writes a policy directly to the store
- **THEN** the drift alert fires and `secret-store apply` refuses until the policy is declared or removed

#### Scenario: A generated value already exists

- **WHEN** `secret-store generate` targets a path that holds a value
- **THEN** it exits nonzero and the value is unchanged

### Requirement: The store has no public route

The store SHALL be reached only in the cluster, on the tailnet through the Tailscale
operator, and on a NodePort admitted from the CI server's private address alone. No Ingress,
IngressRoute or Service of type LoadBalancer SHALL name it. The NetworkPolicy SHALL refuse an
enrolled node and pods masqueraded to its address even where the host firewall admits them.

#### Scenario: Paired probes

- **WHEN** the same probe connects to the NodePort from a public address, from a private
  address that is not a node, from an enrolled node, from a pod on that node and from the CI
  server's private address
- **THEN** all but the last are refused and the last completes a TLS handshake

#### Scenario: NetworkPolicy removed

- **WHEN** the `puni-secrets` NetworkPolicy is removed and the probe runs from an enrolled node
- **THEN** the connection is admitted, which shows the NetworkPolicy alone refuses it

#### Scenario: Host firewall removed

- **WHEN** the host firewall's prerouting rule is removed and the probe runs from a private
  address that is not a node
- **THEN** the NetworkPolicy still refuses it

#### Scenario: An Ingress for the store

- **WHEN** a manifest under `infra/argocd` adds an Ingress whose backend is the store's Service
- **THEN** `tool-fleet:check` fails naming the Ingress

### Requirement: Snapshots restore only with the matching seal key

The store SHALL be snapshotted every 6 hours to the platform backup bucket with 30-day
retention. A monthly automated drill SHALL restore the latest snapshot into an empty instance
with the cluster seal key and read the canary, and an attended restore on a second machine
SHALL use only the escrowed key, in A7 and after every rotation.

#### Scenario: Restore with the cluster seal key

- **WHEN** the drill restores the latest snapshot with the cluster seal key
- **THEN** the canary value reads back and the drill records success

#### Scenario: Restore with a wrong key

- **WHEN** the drill restores with a different 32-byte key
- **THEN** the instance stays sealed and the drill records the expected refusal

#### Scenario: The drill stops running

- **WHEN** the last successful drill is older than 35 days
- **THEN** `OpenBaoRestoreDrillStale` fires

### Requirement: Every alert has a source and fires on its fault

Each alert of design D11 SHALL name its metric source and SHALL fire when that series is
absent. The drift job SHALL have a staleness alert. Until the collector ships audit records,
the store SHALL write a second file audit device on a retained claim.

#### Scenario: A scrape disappears

- **WHEN** Prometheus can no longer scrape the store's metrics listener for 10 minutes
- **THEN** the absent-series companion of `OpenBaoSealed` fires

#### Scenario: The file audit device fails while stdout records

- **WHEN** the file audit device's claim is full and stdout still records every request
- **THEN** `OpenBaoAuditFileStalled` fires

#### Scenario: The drift job stops

- **WHEN** the drift CronJob has no successful run for 2 hours
- **THEN** `OpenBaoConfigDriftCheckStale` fires

### Requirement: A tenant's values are written only under its prefix

A tenant writer role SHALL be bound to the platform adapter's service account, with audience
`openbao`, its node's pod subnet, a 15-minute TTL, and a policy of create and update on
`kv/data/tenants/<tenant>/` alone. Mounts, auth methods, roles
and policies SHALL change only through the declaration and `secret-store apply`.

#### Scenario: A writer policy outside its tenant

- **WHEN** the declaration gives `tenant-writer-puni` a path under `kv/tenants/other/` or `sys/`,
  or a capability other than create and update
- **THEN** `tool-fleet secret-store plan` refuses, naming the role and path
