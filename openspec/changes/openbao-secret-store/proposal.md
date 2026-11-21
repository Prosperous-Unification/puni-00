## Why

Platform credentials have no working home. puni-00 commits none: seventeen production
Secrets (OTLP certificates, Elastic S3 keys, registry, Velero, Alertmanager) are declared
`source: operator` and must be created by hand, which blocks the observability rollout.
Host `.env` files are edited in place, and `tool-secrets` only prints commands against a
placeholder age key. Whoever holds the cluster age key can read everything, nothing records
who read what, revoking a person means rotating every secret they ever saw, and nothing can
isolate one client's secrets from another's on the multi-tenant platform PUNI is building.

## What Changes

Add OpenBao as the platform secret store and External Secrets Operator (ESO) as the only
path from the store into pods, behind three new Flux stages, `secret-store`, `secret-operator` and `secret-sync`.
Each namespace reads only its own paths through its own `SecretStore`. The store auto-unseals
from a SOPS-held static key, writes an audit record of every request, and is snapshotted to
object storage with an automated restore drill. Operator-provided Secrets migrate to
`source: openbao` one at a time, starting with a canary, while a small bootstrap set stays in
SOPS or Ansible so the store never depends on itself. The store runs on the new platform node and its bring-up never pulls from Harbor. `tool-secrets` is retired.

## Outcome

Every platform Secret has one canonical copy with scoped, audited, revocable access; a sealed
or missing store stops secret changes but never stops a running or restarting workload; the
path to tenant namespaces, PKI and short-lived credentials exists without redesign.

## Non-Goals

High availability (three voters); OpenBao PKI issuance, dynamic credentials,
GitHub Actions access and external tenant namespaces (all phase 5 or later); a host agent
for `.env` files; moving WBS into the cluster; changing the live cluster in this change.

## Constraints

Design only on 2026-11-15; every live phase is attended. Assumed owner inputs, recorded in
[the design](design.md#owner-inputs): one replica on the new platform node, Dany escrows the seal key and recovery
shares, an Auth0 application for operator login. Decisions were made by a Fable 5.2 review at
Dany's request; [ADR 0079](../../../docs/adr/0079-openbao-is-the-platform-secret-store.md)
records the product and delivery choice.
