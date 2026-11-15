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
A Kubernetes Secret written by External Secrets Operator from a secret store path.
_Avoid_: injected secret, mounted secret

**Bootstrap set**:
The credentials that must exist before the secret store can start or be recovered, and so are
never sourced from it.
_Avoid_: seed secrets, root secrets

**Secret reader**:
The dedicated service account a namespace's `SecretStore` logs in as; never the workload's own
account.
_Avoid_: workload identity, ESO account

**Cluster seal key**:
The static key that unseals one cluster's secret store and its snapshots.
_Avoid_: root token, recovery key, unseal share

**Recovery key**:
One of the shares that together authorize `generate-root`. It cannot unseal the store.
_Avoid_: cluster seal key, unseal key

**OpenBao namespace**:
An isolated area of the secret store with its own auth methods, policies and administrators,
one per organization; PUNI itself is the first.
_Avoid_: tenant namespace, Kubernetes namespace, organization
