# OpenBao is the platform secret store, delivered only through External Secrets Operator

Platform credentials move to one OpenBao store on the platform cluster, synced into Kubernetes
Secrets only by External Secrets Operator, because SOPS alone gives no per-identity scoping,
audit, store-side revocation or tenant isolation. Delivery and the stage graph are shaped so a
sealed or absent store stops secret changes but never running workloads, and blocks Flux only for
commits that add a new synced Secret or during a cold rebuild before restore; and a bootstrap set held outside the store keeps its own recovery path independent of it. Design
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
- **Cloud KMS or Shamir unseal**: KMS credentials would live in SOPS anyway and add an outside
  total-loss mode; Shamir with one operator leaves the store sealed after every reboot. The store
  auto-unseals from a static key held in SOPS instead, so the age identity stays the single trust
  root. Revisit KMS with a second operator or a tenant compliance requirement.

## Consequences

Until a third platform node exists the store is one Raft replica on h4claw: consumers of static
secrets may depend on it, but PKI issuance, dynamic credentials and external tenants wait for three
voters. Root on h4claw yields both the seal key and the data. Bootstrap ciphertext lives in the
private fleet repository because puni-00 is public.
