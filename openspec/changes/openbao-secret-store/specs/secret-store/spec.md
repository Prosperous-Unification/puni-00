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

### Requirement: A namespace can read only its own paths

The store SHALL admit a `secret-reader` login only to `kv/<cluster-id>/<namespace>/*` for the
cluster and namespace its identity proves. Workers clusters SHALL authenticate through their own
JWT mount with a pinned validation key and audience `openbao`.

#### Scenario: Cross-namespace read

- **WHEN** the `observability` reader requests `kv/platform-production/puni-registry/registry-auth`
- **THEN** the store denies the request and records it in the audit log

#### Scenario: A token signed by another cluster

- **WHEN** a workers cluster presents a token to a JWT mount pinned to a different cluster's key
- **THEN** login is denied

### Requirement: An unavailable store stops changes, not workloads

When the store is sealed, scaled to zero or unreachable, existing synced Secrets SHALL remain,
consumer pods SHALL start and restart with them, stages other than `secret-sync` SHALL keep
reconciling, and the alerts `OpenBaoSealed` or `ExternalSecretSyncFailed` SHALL fire.

#### Scenario: Store scaled to zero during a consumer restart

- **WHEN** OpenBao has zero ready replicas and a consumer pod is deleted
- **THEN** the replacement pod starts with the last synced Secret and an alert fires within its rule window

#### Scenario: Store pod killed

- **WHEN** the OpenBao pod is deleted
- **THEN** the replacement unseals from the static seal key with no human action

### Requirement: The bootstrap set never depends on the store

The seal key, the store's server CA signing Secret, snapshot credentials, Velero credentials and
Alertmanager configuration SHALL come from SOPS or Ansible, and the `backup` and `alerts` stages
MUST NOT depend on `secret-sync`. The fleet check MUST refuse an `ExternalSecret` or Vault issuer
in any stage at or before `secret-store`.

#### Scenario: A bootstrap Secret is migrated by mistake

- **WHEN** `externally-provided.json` marks `velero-repo-credentials` as `source: openbao`
- **THEN** `tool-fleet:check` fails naming the bootstrap Secret

### Requirement: Every store-sourced Secret is declared

Each `externally-provided.json` entry with `source: openbao` SHALL have a same-namespace
`ExternalSecret` and `SecretStore`, and every `ExternalSecret` target SHALL be declared there.

#### Scenario: Declared but not synced

- **WHEN** an entry is `source: openbao` and no `ExternalSecret` targets it
- **THEN** `tool-fleet:check` fails naming the Secret

#### Scenario: Synced but not declared

- **WHEN** an `ExternalSecret` targets a Secret absent from `externally-provided.json`
- **THEN** `tool-fleet:check` fails naming the target

### Requirement: Snapshots restore only with the escrowed seal key

The store SHALL be snapshotted every 6 hours to two buckets with 30-day retention, and a monthly
automated drill SHALL restore the latest snapshot into an empty instance and read a canary.

#### Scenario: Restore with the escrowed key

- **WHEN** the drill restores the latest snapshot with the escrowed seal key
- **THEN** the canary value reads back and the drill records success

#### Scenario: Restore with a wrong key

- **WHEN** the drill restores with a different 32-byte key
- **THEN** the instance stays sealed and the drill records the expected refusal
