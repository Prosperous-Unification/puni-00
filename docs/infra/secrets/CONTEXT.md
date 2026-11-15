# Platform secrets

The language of where platform credentials live and how they reach workloads.
Terms only; decisions are in [ADR 0079](../../adr/0079-openbao-is-the-platform-secret-store.md)
and behaviour in the [openbao-secret-store](../../../openspec/changes/openbao-secret-store/design.md) change.

## Language

**Secret store**:
The OpenBao instance on the platform cluster that holds the canonical copy of every
store-sourced credential.
_Avoid_: vault, SOPS, Kubernetes Secret

**Synced Secret**:
A Kubernetes Secret written by External Secrets Operator from a secret store path. It outlives
both the store's availability and its `ExternalSecret`.
_Avoid_: injected secret, mounted secret

**Bootstrap set**:
The credentials that must exist before the secret store can start or be recovered, and so are
never sourced from it.
_Avoid_: seed secrets, root secrets

**Secret reader**:
The dedicated service account a namespace's `SecretStore` logs in as; never the workload's own
account.
_Avoid_: workload identity, ESO account

**Seal key**:
The static 32-byte key that unseals the secret store and decrypts its snapshots. Losing it loses
every snapshot.
_Avoid_: root token, recovery key, unseal share

**Recovery key**:
One of the shares that together authorize `generate-root`. It cannot unseal the store.
_Avoid_: seal key, unseal key

**Tenant namespace**:
An OpenBao namespace that holds one organization's secrets with its own auth methods and
policies. PUNI itself is tenant zero.
_Avoid_: Kubernetes namespace, organization
