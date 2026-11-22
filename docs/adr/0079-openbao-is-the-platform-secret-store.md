# OpenBao is the platform secret store, delivered only through External Secrets Operator

Platform credentials live in one OpenBao store on the platform cluster, synced into Kubernetes
Secrets only by External Secrets Operator, because SOPS alone gives no per-identity scoping,
audit, store-side revocation or tenant isolation. The store and its sync are Argo CD units
synced on command, and a sealed or absent store stops secret changes, and the syncs of units
that need synced Secrets, but never running workloads. A bootstrap set that Ansible applies
from SOPS on the controller keeps the store's own start and recovery independent of it. Design
and phases: [openbao-secret-store](../../openspec/changes/openbao-secret-store/design.md).

## Considered Options

- **HashiCorp Vault**: same model, Business Source Licence; a poor fit for a platform PUNI sells.
- **Infisical self-hosted**: simpler UI, but tenancy features sit under its enterprise licence
  and it adds Postgres and Redis to operate.
- **SaaS secret managers**: nothing to run, but secrets leave PUNI's machines and the infra is
  the deliverable.
- **SOPS only**: no runtime dependency, which remains its strength and why it keeps the bootstrap
  set; no per-identity access, audit, revocation or tenant isolation.
- **Agent injector or CSI delivery**: new pods fail while the store is sealed.
- **Cloud KMS or Shamir unseal**: a KMS credential would be a bootstrap Secret anyway and adds an
  outside total-loss mode; Shamir with one operator leaves the store sealed after every reboot.
  The store auto-unseals from a static key in the bootstrap set instead, so the age identity on
  the controller stays the single trust root. Revisit KMS with a second operator or a tenant
  compliance requirement.

## Consequences

Until three voters exist the store is one Raft voter on the platform cluster's only server:
consumers of static secrets may depend on it, but PKI issuance, dynamic credentials and
external tenants wait, and the loss of that server is a cold rebuild that restores the store
from a snapshot before any consumer syncs. Root on that server, or cluster-admin by any route,
yields both the seal key and the data. Nothing in the store's bring-up is pulled from a
PUNI-operated registry such as Harbor, which takes its credentials from the store. The store has
no public route. Bootstrap ciphertext lives in the private fleet repository because this one is
public.
