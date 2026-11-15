# OpenBao is the platform secret store, delivered only through External Secrets Operator

Platform credentials move from operator-created and SOPS-committed Secrets to one OpenBao
store on the platform cluster, synced into Kubernetes Secrets by External Secrets Operator
(ESO) through per-namespace `SecretStore`s. OpenBao gives per-identity scoping, an audit trail,
instant revocation and, later, tenant namespaces and short-lived credentials, which SOPS cannot.
Delivery is ESO-only with `deletionPolicy: Retain` and `creationPolicy: Orphan`, so a sealed or
absent store stops secret _changes_ and never stops running or restarting workloads. The store
auto-unseals with a static key held in SOPS: the cluster age identity stays the single trust root,
and no outside KMS becomes a dependency. A bootstrap set (seal key, the store's own CA, snapshot
credentials, Velero and Alertmanager credentials, and the Ansible-placed Flux keys) never depends
on OpenBao, so losing the store cannot take its own recovery path with it. Design and phases:
[openbao-secret-store](../../openspec/changes/openbao-secret-store/design.md).

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
  total-loss mode; Shamir with one operator leaves the store sealed after every reboot. Revisit
  KMS with a second operator or a tenant compliance requirement.

## Consequences

Until a third platform node exists the store is one Raft replica on h4claw: consumers of static
secrets may depend on it, but PKI issuance, dynamic credentials and external tenants wait for three
voters. Root on h4claw yields both the seal key and the data.
