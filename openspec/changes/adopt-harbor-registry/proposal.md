## Why

The platform registry is Distribution 2.8.3 on h4claw's root disk. Nothing bounds its size,
retires old images or scopes its credentials, and its only content is an activation proof image.
The hand-built storage lifecycle meant to fix this has six open tasks and no activation.
Any valid credential can delete tags in that registry (CVE-2026-41888). On 2026-11-17 the owner
chose Harbor, so quotas, retention, garbage collection and scoped robots come from one product.

## What Changes

- Harbor serves `registry.puni.internal:8443` on h4claw's private address. Flux installs it from
  a vendored, digest-locked chart with scanning off.
- Image, database, job-log and cache data live on four bounded filesystems. Start-up refuses a
  missing or wrong mount.
- Projects, quotas, retention, immutability, robots, schedules and system settings are declared
  in Git and reconciled. Drift is detected.
- A push over quota is refused. No robot can delete. Promotion tags protect images from
  retention.
- A nightly backup and a restore drill gate the first consumer.
- The activation proof image moves by digest. Distribution stops serving once Harbor's readiness
  receipts pass.
- The hand-built lifecycle is frozen.

## Non-Goals

No product move (website, WBS). No vulnerability scanning, SSO, high availability or replication.
No removal of lifecycle source: that is a separate change. No advance of the production platform
source pin. No change to gate-host enrollment without the owner's approval.

## Constraints

Memory fit on h4claw is not proven. The first slice measures it and installation waits for the
result. Harbor is reachable only on the private network. Secrets stay in SOPS and owner-only
operator storage; none is printed. The chart archive and every enabled image are locked in
`infra/versions/toolchain.json`. Bun and Nx only. Every production step is attended and has a
rollback. Lifecycle changes are marked superseded without claiming they completed.

## Capabilities

### New Capabilities

- `harbor-registry`: bounded, policy-governed private image storage with declared configuration
  and a restore proof.

### Modified Capabilities

None. The earlier registry capabilities exist only as unsynced deltas.

## Domain Terms

Promotion tag, registry project, registry robot: [registry glossary](../../../docs/infra/CONTEXT.md).

## Decisions Recorded

ADR 0079 is claimed by open pull request #935, so the record stays in
[design.md](design.md#decision-record-becomes-an-adr-at-merge) until merge (task 0.2).

## Impact

`infra/platform/registry`, `infra/platform/charts`, the toolchain lock, the three registry
roles, new `tool-fleet` modules for reconciliation and backup, the private fleet repository's
secrets and Flux wiring, and the registry runbooks. No product image reference changes.
