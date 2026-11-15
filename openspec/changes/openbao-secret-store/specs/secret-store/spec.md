## ADDED Requirements

### Requirement: Secrets reach pods only through namespace-scoped sync

Platform Secrets sourced from the secret store SHALL be delivered only by External Secrets
Operator into Kubernetes Secrets. Each `ExternalSecret` SHALL reference a `SecretStore` in its
own namespace and SHALL use `deletionPolicy: Retain` and `creationPolicy: Orphan`. The fleet check
MUST refuse `ClusterSecretStore`, `ClusterExternalSecret`, `PushSecret`, `ClusterPushSecret`,
cluster generators, the OpenBao agent injector and the CSI provider.

#### Scenario: A cluster-wide store is committed

- **WHEN** a manifest declares a `ClusterSecretStore`
- **THEN** `tool-fleet:check` fails naming the manifest and kind

#### Scenario: An ExternalSecret references another namespace's store

- **WHEN** an `ExternalSecret` in `observability` references a store outside `observability`
- **THEN** `tool-fleet:check` fails before Flux can apply it

#### Scenario: An ExternalSecret would delete its Secret

- **WHEN** an `ExternalSecret` sets `creationPolicy: Owner` or a `deletionPolicy` other than `Retain`
- **THEN** `tool-fleet:check` fails naming the `ExternalSecret` and field

### Requirement: Only a namespace's reader can read its paths

The store SHALL admit only the `secret-reader` service account, and only to
`kv/<cluster-id>/<namespace>/*` for the cluster and namespace its identity proves. Workers
clusters SHALL authenticate through their own JWT mount with a pinned validation key, audience
`openbao` and a bound service-account name.

#### Scenario: Cross-namespace read

- **WHEN** the `observability` reader requests `kv/platform-production/puni-registry/registry-auth`
- **THEN** the store denies the request and records it in the audit log

#### Scenario: Another account in the same namespace

- **WHEN** a workload account in `observability` presents a valid token with audience `openbao`
- **THEN** login is denied

#### Scenario: A token signed by another cluster

- **WHEN** a workers cluster presents a token to a JWT mount pinned to a different cluster's key
- **THEN** login is denied

### Requirement: An unavailable store stops secret changes, not workloads or reconciles

When the store is sealed, scaled to zero or unreachable, existing synced Secrets SHALL remain,
consumer pods SHALL start and restart with them, every Flux stage SHALL keep applying commits
that add no new `ExternalSecret`, and `OpenBaoSealed` or `ExternalSecretSyncFailed` SHALL fire.
No `dependsOn` MAY name `secret-store`.

#### Scenario: Store scaled to zero during a consumer restart

- **WHEN** OpenBao has zero ready replicas and a consumer pod is deleted
- **THEN** the replacement pod starts with the last synced Secret and an alert fires within its rule window

#### Scenario: A commit to a consumer stage during an outage

- **WHEN** OpenBao has zero ready replicas and a commit changes a manifest in `observability`
- **THEN** the `observability` Kustomization applies that commit and reports Ready

#### Scenario: A stage depends on the store

- **WHEN** a Kustomization lists `secret-store` in `dependsOn`
- **THEN** `tool-fleet:check` fails naming the Kustomization

#### Scenario: Store pod killed

- **WHEN** the OpenBao pod is deleted
- **THEN** the replacement unseals from the cluster seal key with no human action

### Requirement: The bootstrap set never depends on the store

The bootstrap set of design D10 SHALL come from Ansible, the operator, or SOPS in the private
fleet repository, and the fleet check MUST refuse `source: openbao` for any member of it.

#### Scenario: A bootstrap Secret is migrated by mistake

- **WHEN** `externally-provided.json` marks `velero-repo-credentials` as `source: openbao`
- **THEN** `tool-fleet:check` fails naming the bootstrap Secret

### Requirement: Stages before the store consume nothing from it

The fleet check MUST refuse `source: openbao` for any Secret consumed by a stage at or before
`secret-store`, and MUST refuse an `ExternalSecret` or Vault issuer in such a stage.

#### Scenario: A certificates-stage Secret is migrated

- **WHEN** `externally-provided.json` marks `otel-server-ca` as `source: openbao`
- **THEN** `tool-fleet:check` fails naming the consuming stage

#### Scenario: Cold rebuild with an empty cluster

- **WHEN** a fresh cluster reconciles with only the bootstrap set and the latest snapshot
- **THEN** the store restores, synced Secrets appear, and every stage reaches Ready without manual Secret creation

### Requirement: Every store-sourced Secret is declared

Each `externally-provided.json` entry with `source: openbao` SHALL have a same-namespace
`ExternalSecret` and `SecretStore`, and every `ExternalSecret` target SHALL be declared there.

#### Scenario: Declared but not synced

- **WHEN** an entry is `source: openbao` and no `ExternalSecret` targets it
- **THEN** `tool-fleet:check` fails naming the Secret

#### Scenario: Synced but not declared

- **WHEN** an `ExternalSecret` targets a Secret absent from `externally-provided.json`
- **THEN** `tool-fleet:check` fails naming the target

### Requirement: Store configuration is declared and drift is visible

After self-init, mounts, auth methods, roles and policies SHALL change only through the attended
`secret-store apply` command, which MUST refuse unknown live objects, and a drift job SHALL raise
`OpenBaoConfigDrift` when live configuration differs from the Git render.

#### Scenario: A policy added out of band

- **WHEN** an operator writes a policy directly to the store
- **THEN** the drift alert fires and `secret-store apply` refuses until the policy is declared or removed

### Requirement: The store is reachable only from the private network

The store's endpoint SHALL accept connections from the private network and refuse them from
public addresses.

#### Scenario: Public and private probes

- **WHEN** the same probe connects from a public address and from a private address
- **THEN** the public connection is refused and the private connection completes a TLS handshake

### Requirement: Snapshots restore only with the matching seal key

The store SHALL be snapshotted every 6 hours to two buckets with 30-day retention. A monthly
automated drill SHALL restore the latest snapshot into an empty instance with the cluster seal
key and read a canary, and an attended restore on a second machine SHALL use only the escrowed
key at P2 and after every rotation.

#### Scenario: Restore with the cluster seal key

- **WHEN** the drill restores the latest snapshot with the cluster seal key
- **THEN** the canary value reads back and the drill records success

#### Scenario: Restore with a wrong key

- **WHEN** the drill restores with a different 32-byte key
- **THEN** the instance stays sealed and the drill records the expected refusal

#### Scenario: The drill stops running

- **WHEN** the last successful drill is older than 35 days
- **THEN** `OpenBaoRestoreDrillStale` fires
