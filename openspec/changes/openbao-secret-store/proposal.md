## Why

The platform cluster that [`separate-node-roles`](../separate-node-roles/design.md) builds
decrypts nothing in the cluster: Ansible applies only the bootstrap Secrets Argo CD and the
secret store need, and every other Secret is an ExternalSecret from the first day (its R22).
Its step A7, the observability, Rancher, Harbor, CI and app steps after it, and the database
change all wait for a store with scoped, audited, revocable access that keeps one environment
and one tenant from reading another's.

## What Changes

Add OpenBao as the platform secret store and External Secrets Operator as the only path from
the store into pods, as the plan's Argo CD units `openbao`, `external-secrets` and
`secret-sync` (orders 4 to 6), synced on command. The store runs as one Raft voter on
`m1plat1`, the platform cluster's only server, tolerating its `CriticalAddonsOnly` taint. Each
namespace reads only its own path through its own `SecretStore` and role; a tenant is a path
prefix and a policy. The store auto-unseals from a static key in a small bootstrap set that
Ansible applies from SOPS on the controller, writes an audit record of every request, is
snapshotted to object storage with an automated restore drill, and is reached in the cluster
or on the tailnet, never publicly. Its bring-up never pulls from Harbor. Secret rules in
`gate` and an attended store planner enforce all of it.

## Outcome

Every Secret of the new cluster has one canonical copy with scoped, audited, revocable access;
a sealed or missing store stops secret changes but never a running or restarting workload; a
lost server is rebuilt with its store from a snapshot; the path to more voters, PKI and
short-lived credentials exists without redesign.

## Non-Goals

High availability (three voters); OpenBao PKI issuance, dynamic credentials, GitHub Actions
access and a second tenant (all phase 4 or later); any change to the old cluster, its workers
clusters, `tool-secrets` or host `.env` files; changing a live cluster in this change.

## Constraints

Design only; every live phase is attended and follows the plan's steps. The plan is
authoritative where the two differ. This repository is public: bootstrap ciphertext lives in
the private fleet repository, and no provider name, address or tailnet name is written here.
Assumed owner inputs are in [the design](design.md#owner-inputs);
[ADR 0079](../../../docs/adr/0079-openbao-is-the-platform-secret-store.md) records the product
and delivery choice.
