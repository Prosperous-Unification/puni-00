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
namespace, and only to that namespace's prefix: `kv/platform/<namespace>/` for a platform
namespace and `kv/tenants/<tenant>/<environment>/<namespace>/` for a tenant's, computed from
the namespace's labels. The one cross-namespace grant SHALL be a database namespace's read of a
declared owner-role key of an app in the same tenant and environment.

#### Scenario: Cross-environment read

- **WHEN** the reader of a staging namespace requests a path under `kv/tenants/puni/production/`
- **THEN** the store denies the request and records it in the audit log

#### Scenario: Another account in the same namespace

- **WHEN** a workload account in a reading namespace presents a valid token to that namespace's role
- **THEN** login is denied

#### Scenario: A rendered role binds two namespaces

- **WHEN** the store declaration gives one role two bound namespaces, or a policy a path that the namespace's labels do not give
- **THEN** `tool-fleet secret-store plan` refuses, naming the role or policy

#### Scenario: A database grant across environments

- **WHEN** the declaration grants a staging database namespace a production owner-role key
- **THEN** `tool-fleet secret-store plan` refuses, naming the grant

### Requirement: The CI cluster reads only its own mount

The CI cluster SHALL authenticate through its own JWT mount with a pinned validation key,
audience `openbao` and a bound service-account name and namespace, and read only
`ci/<tenant>/<namespace>/`.

#### Scenario: A token signed by another cluster

- **WHEN** a token signed by a key other than the CI cluster's pinned key is presented to its JWT mount
- **THEN** login is denied

#### Scenario: A CI reader asks for a platform path

- **WHEN** a CI namespace's reader requests a path under `kv/`
- **THEN** the store denies the request

### Requirement: An unavailable store stops secret changes, not running services

When the store is sealed, scaled to zero or unreachable, existing synced Secrets SHALL remain,
consumer pods SHALL start and restart with them, the sync playbook SHALL refuse only the units
that need `secret-sync`, and `OpenBaoSealed` or `ExternalSecretSyncFailed` SHALL fire once the
`alerts` unit runs.

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
SHALL equal a digest-pinned `toolchain.json` entry from a declared upstream host, and the
secret rules MUST refuse any other image there.

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

### Requirement: An empty store is never served, configured or snapshotted

In `steady` mode the store SHALL refuse to start on a data directory without a Raft database.
Once the declaration records the first initialisation, the secret rules SHALL refuse
`first-init` mode. `secret-store apply` and the snapshot Job SHALL refuse to run when the canary
value is absent.

#### Scenario: The server was rebuilt from an etcd snapshot

- **WHEN** the `openbao` objects restored from etcd start in `steady` mode on an empty data directory
- **THEN** the server does not start and the store answers no request

#### Scenario: First-init after initialisation

- **WHEN** the declaration records an initialisation date and the unit's mode is `first-init`
- **THEN** `tool-fleet:check` fails naming the mode

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
- **THEN** initialisation and restore complete, the init root token is rejected afterwards, and the escrowed shares authorise `generate-root`

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
IngressRoute or Service of type LoadBalancer SHALL name it.

#### Scenario: Paired probes

- **WHEN** the same probe connects to the NodePort from a public address, from another private address and from the CI server's private address
- **THEN** the first two are refused and the third completes a TLS handshake

#### Scenario: An Ingress for the store

- **WHEN** a manifest under `infra/argocd` adds an Ingress whose backend is the store's Service
- **THEN** `tool-fleet:check` fails naming the Ingress

### Requirement: Snapshots restore only with the matching seal key

The store SHALL be snapshotted every 6 hours to the platform backup bucket and the off-region
copy with 30-day retention. A monthly automated drill SHALL restore the latest snapshot into an
empty instance with the cluster seal key and read the canary, and an attended restore on a
second machine SHALL use only the escrowed key, in A7 and after every rotation.

#### Scenario: Restore with the cluster seal key

- **WHEN** the drill restores the latest snapshot with the cluster seal key
- **THEN** the canary value reads back and the drill records success

#### Scenario: Restore with a wrong key

- **WHEN** the drill restores with a different 32-byte key
- **THEN** the instance stays sealed and the drill records the expected refusal

#### Scenario: The drill stops running

- **WHEN** the last successful drill is older than 35 days
- **THEN** `OpenBaoRestoreDrillStale` fires
