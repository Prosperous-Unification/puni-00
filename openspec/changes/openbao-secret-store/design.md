## Context

**Design only. Nothing here is installed or activated.** First written on 2026-11-15 for the
Flux-delivered cluster; rewritten on 2026-11-22 for the platform cluster that
[`separate-node-roles`](../separate-node-roles/design.md) builds (called "the plan" below), whose
decision 9 lists what this change must provide. The plan is authoritative where the two differ.
Assumptions the owner may overrule are listed under [owner inputs](#owner-inputs). The product
choice and delivery rule are [ADR 0079](../../../docs/adr/0079-openbao-is-the-platform-secret-store.md).

What the plan fixes, and this design takes as given:

- **One server.** The platform cluster is one k3s server, `m1plat1`, the only server of its
  cluster. It carries the capability `platform-services` (R8) and the taint
  `CriticalAddonsOnly=true:NoSchedule` (R25). Later nodes (observability, apps,
  non-production) join it as agents and never carry the store.
- **Delivery by Argo CD** (plan decision 3). Platform units are Applications synced on command
  by the operator through `playbooks/argocd-sync.yml`, in the order of their
  `puni.dev/sync-order` and refused while a unit named in `puni.dev/needs` is not Synced and
  Healthy. There are no sync waves, no Helm releases in the cluster and no decryption in it.
- **Secrets** (plan decision 5, R22). The store is first among the services; Ansible applies
  only the bootstrap Secrets that Argo CD and the store themselves need, decrypted from SOPS on
  the controller, which is the operator's laptop (R17); every other Secret is an
  ExternalSecret from the first day.
- **Access** (plan decision 12, R47, R55). No platform service has a public route. Interfaces
  are reached over the tailnet; SSH to a server goes through the bastion; node-to-node traffic
  uses the provider's private network, 10.10.1.0/24.
- **Tenancy** (plan decision 13, R48). A tenant is a path prefix and a policy in the store;
  `puni` is the first.

The old cluster, its workers clusters and the labs stay on Flux and are not touched (plan R27):
this change adds nothing to them.

## Goals / Non-Goals

**Goals:** one canonical, audited, revocable copy of every platform credential; isolation per
namespace, per environment and per tenant, enforced by the store and checked in `gate`; an
outage that stops secret changes and never running services; a tested restore and cold
rebuild on one server; a path to more voters, PKI and short-lived credentials without
redesign.

**Non-Goals:** see [proposal](proposal.md#non-goals).

## Decisions

### D1 Product, versions and images

OpenBao v2.7.2 (chart `openbao-0.30.7`, MPL-2.0) and External Secrets Operator (ESO) v2.15.0,
both archives under `infra/platform/charts/`, locked by digest (plan R21) and pinned in
`infra/versions/toolchain.json`. OpenBao is used through ESO's Vault provider. Rejected
alternatives are in ADR 0079.

**The store's bring-up never pulls from a PUNI-operated registry.** Harbor takes its own
credentials from the store, so an image Harbor serves inside the bring-up would make a cold
rebuild circular. The scope is the `puni.dev/needs` closure of `secret-sync`, computed from the
Application files and never listed by hand: today `argocd`, `namespaces`, `policy`, `storage`,
`cert-manager`, `openbao`, `external-secrets` and `secret-sync`, Jobs included. Every image in
scope equals a digest-pinned `toolchain.json` entry whose host is a declared upstream registry
(the plan's image table, "never from Harbor"). Two bypasses no manifest shows are closed too:
Ansible refuses a containerd `mirrors` entry for an upstream host without default-endpoint
fallback, and any registry admission policy exempts the namespaces in scope.

### D2 Placement

The store runs in the namespace `puni-secrets` and ESO in `external-secrets`, both objects of
the plan's `namespaces` unit, so the bootstrap playbook can create them before the seal key.
Both, and every Job of this change, select `puni.dev/capability-platform-services` and
tolerate `CriticalAddonsOnly=true:NoSchedule`; the plan's rule 2.4(f) admits that toleration
only with that selector. Every pod template that the two charts render is covered: the OpenBao
server, ESO's controller, webhook and certificate controller, and the snapshot, drill and drift
Jobs. A pod without the toleration stays Pending on the one tainted server, so the render
test of task 1.6 refuses it before a sync does.

**One Raft voter on m1plat1.** The node holds the store, the control plane, Argo CD, Harbor and
Rancher, so its loss is a loss of the cluster, and recovery is the cold rebuild of D14, not a
reschedule. A single voter has no quorum to lose; it also has no copy but its own between
snapshots (D11). Static secrets may depend on it. More voters need more platform servers,
which the plan's growth steps add; until then PKI issuance, dynamic credentials and external
tenants wait (D9).

Raft data is a claim of the class the `storage` unit names for platform data, with
`Prune=false` and `Delete=false` (plan rule 2.4(g)) and the StatefulSet's
`persistentVolumeClaimRetentionPolicy` at `Retain` for deletion and scale-down. It shares the
root filesystem with etcd; Harbor's data is on bounded filesystems of its own (plan decision
2, which budgets 10 GiB for the store and the local etcd snapshots). The store runs at the
default priority, 0, above Rancher's `puni-platform-interface` at −10, as the plan sets. A
disk alert covers the root filesystem's free space (task 2.8).

Memory: the plan assumes 1,024 MiB for the store and ESO together. Task 3.15 measures both and
the drill instance and replaces the plan's row by a commit.

### D3 Seal

Static-key auto-unseal (OpenBao ≥ 2.4). The **cluster seal key** (32 bytes) is a bootstrap
Secret (D10) mounted read-only as `file://`, rotated through `previous_key`. Recovery keys come
from `POST sys/rotate/recovery/init` (OpenBao ≥ 2.4), which needs an authenticated caller, so
the first operator OIDC login must work, and the shares are escrowed before the first value
that has no escrow copy of its own. Three shares, threshold two, held in both escrow places of
the plan's A2.

Escrow lives outside the cluster ([recovery](../../../docs/infra/recovery.md)). Every seal key id
stays in escrow until the last snapshot sealed with it expires (30 days after rotation). The
in-cluster drill (D11) proves only the in-cluster copy; an **attended escrow restore** on a
second machine, with the escrowed key and no cluster material, runs in A7 and after every
rotation.

Rejected: a cloud KMS (its credential would be a bootstrap Secret anyway and it adds an outside
total-loss mode; revisit with a second operator or a tenant's compliance need), Shamir (sealed
after every reboot with one operator), transit from a second OpenBao, PKCS#11.

### D4 Delivery into pods

ESO only. Every ExternalSecret uses `refreshInterval: 1h`, `deletionPolicy: Retain` and
`creationPolicy: Orphan`. Under `Owner`, deleting an ExternalSecret (a pruned file, a removed
unit, a deleted CRD) deletes the live Secret and breaks running services, which violates the
outage rule. The agent injector and the CSI provider are rejected: new pods fail while the store
is sealed.

### D5 Store scoping

Per-namespace `SecretStore` only, each in the plan's `secret-sync` unit (plan decision 3). Each
logs in as a dedicated `secret-reader` service account in its namespace, never the workload's.
Chart values disable `ClusterSecretStore`, `ClusterExternalSecret`, `PushSecret`,
`ClusterPushSecret` and generators, and the secret rules refuse them.

**One Kubernetes auth role per reading namespace**, as the plan's decision 5 requires. A role
binds `bound_service_account_names=secret-reader` and
`bound_service_account_namespaces=<that namespace>`, and carries one policy that reads that
namespace's prefix (D6) and nothing else. Both are rendered by `tool-fleet secret-store` (D8a)
from the store declaration and the `namespaces` unit's labels, never written by hand. The
planner refuses a role that binds more than one namespace or another account, a policy whose
path is not the one the namespace's `puni.dev/tenant` and `puni.dev/environment` labels give,
and a wildcard above a namespace's prefix. So a staging reader cannot read a production path
and one tenant cannot read another's.

One cross-namespace grant is modelled: a database namespace of `host-postgres` also reads the
owner-role password keys of the apps it serves, which that change keeps at the app's path so
that the database's Secret and the app's connection Secret come from one value. The declaration
names each such key; the planner refuses a grant to a key that is not an owner-role key, or
one across environments or tenants.

### D6 Paths and tenancy

One KV v2 mount per cluster that reads the store, in the root namespace; no OpenBao namespaces.

| Mount | Read by                                  | Path                                                        |
| ----- | ---------------------------------------- | ----------------------------------------------------------- |
| `kv`  | the platform cluster, by Kubernetes auth | `kv/platform/<namespace>/<name>` for platform namespaces    |
| `kv`  | the platform cluster, by Kubernetes auth | `kv/tenants/<tenant>/<environment>/<namespace>/<name>`      |
| `ci`  | the CI cluster, by its JWT mount (D7)    | `ci/<tenant>/<namespace>/<name>`, as the CI change names it |

A platform namespace is one whose `puni.dev/environment` is `platform`, such as `puni-secrets`
and `cattle-system`. An app, database or CI namespace carries
`puni.dev/tenant`, and the environment (`production`, `staging`, `dev`) sits below the tenant,
so a tenant is a prefix and a policy (plan decision 13). `puni` is the first tenant and is built
in the form any later tenant takes; onboarding another is a follow-up.

### D7 Authentication

| Caller                                    | Method                         | Binding                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform-cluster `secret-reader` accounts | Kubernetes auth (TokenReview)  | one role per namespace (D5)                                                                                                                                                |
| CI-cluster `secret-reader` accounts       | one JWT mount for that cluster | pinned `jwt_validation_pubkeys`, `bound_audiences=openbao`, `bound_claims` on the service-account name and namespace, 10-minute tokens, one role per CI namespace on `ci/` |
| Snapshot, drill and drift Jobs            | Kubernetes auth                | one account and role each in `puni-secrets`: snapshot, read canary, read/list configuration                                                                                |
| Operators                                 | OIDC through Auth0             | claim to policy mapping; no userpass                                                                                                                                       |
| GitHub Actions                            | none                           | no public route (D8)                                                                                                                                                       |

The CI cluster's service-account issuer is trusted by a pinned key, so no credential for the
platform side is stored there (CI change, decision 2). JWT auth has no revocation check, hence
the short token lifetime. Self-init revokes its root token. Rejected: Kubernetes auth for the
CI cluster (an API callback into it), AppRole (a static secret to place).

### D8 Network and TLS

Three ways in, and no public route (R47):

| Caller                       | Path                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESO and this change's Jobs   | the ClusterIP Service, in the cluster                                                                                                                            |
| The operator, the controller | the same ClusterIP Service exposed on the tailnet by the Tailscale operator under a plain name (plan decision 12); the owner signs its device under Tailnet Lock |
| The CI cluster's ESO         | a NodePort with `externalTrafficPolicy: Local` on m1plat1's private address, admitted from the CI server's private address alone (plan decision 12, CI change)   |

No Ingress, IngressRoute or Service of type LoadBalancer names the store. The NetworkPolicy of
`puni-secrets` admits ESO's controller, this change's Jobs, the Tailscale operator's proxy for
this Service, and, on the NodePort, the CI server's private address read from the inventory;
nothing else. m1plat1's host firewall (plan A26) drops the public interface and admits the
NodePort from that address only. The private network is not an authentication boundary; TLS
and the JWT mount carry the trust.

TLS ends in OpenBao, with a certificate from a CA Issuer in the `openbao` unit whose signing
Secret is a bootstrap Secret (D10), which is why `openbao` needs `cert-manager` (plan order
table). Its names are `openbao.puni.internal` and the in-cluster Service names; the tailnet name
is never written in this repository, so the operator's client verifies the store's CA with the
server name `openbao.puni.internal` over the tailnet connection. The certificate lives 90 days
and renews 30 days before expiry; task 3.10 proves whether OpenBao serves the renewed leaf
without a restart and, if not, adds a controlled restart.

The proof of reach is paired: a refused connection from a public address and an accepted TLS
handshake from the CI server's private address, through the same probe, so a dead listener
cannot pass it; and a refused connection from another private address.

### D8a Configuration reconciliation and store modes

One Git declaration, `infra/argocd/units/openbao/store.json`, is the source of every mount,
auth method, role, policy and password policy. Self-init is one-shot (upstream: to repeat it,
remove all storage), so it renders only three objects from the declaration: the operator OIDC
mount, its role and the operator admin policy. Audit is a server-configuration stanza, not an
API object.

An attended operator command, `tool-fleet secret-store plan|apply`, run on the controller over
the tailnet, reconciles the live store to the whole declaration, **including** the self-init
objects, which it adopts on its first run. OpenBao's built-ins (`token` auth, `cubbyhole`,
`sys`, `identity`, the `default` policy) are allow-listed. `apply` is dry-run by default, prints
the difference, and refuses unknown live mounts, auth methods, roles or policies. It runs under
the operator's short OIDC token, or a `generate-root` token when Auth0 is down. There is **no
standing write credential**: a credential that writes policies is root-equivalent. A drift
CronJob with a read/list policy compares the live store with the declaration, rendered into a
ConfigMap of the unit, and raises `OpenBaoConfigDrift`. `tool-fleet secret-store generate`
writes a value from a declared password policy to a declared path with check-and-set 0, so it
never overwrites; this is the generated password `host-postgres` asks for. Rejected: a standing
in-cluster reconciler (a network-reachable root), OpenTofu (state and a toolchain, and it does
not refuse unmanaged objects).

**Three store modes**, a value of the `openbao` unit:

| Mode         | Self-init | Empty data directory                                     | Used                                      |
| ------------ | --------- | -------------------------------------------------------- | ----------------------------------------- |
| `first-init` | on        | initialised by self-init                                 | A7 only                                   |
| `steady`     | off       | refused: the server never starts                         | from the commit that follows A7's receipt |
| `restore`    | off       | admitted, for `bao operator init` and a snapshot restore | a cold rebuild (D14)                      |

In `steady` an init container refuses to start the server when the Raft database is absent, so
a store whose data was lost never listens uninitialised, where the first caller to run `init`
would get its root token. The declaration records the date of the first initialisation once A7
has it, and the secret rules then refuse `first-init`. As a second guard, `secret-store apply`
and the snapshot Job refuse to run when the canary value is absent, so an empty store is never
configured or snapshotted as latest.

### D9 PKI

Deferred until three voters. OTLP leaves live 24 h and renew 8 h before expiry, so a PKI issuer
on one voter would make telemetry depend on the store's liveness. Until then cert-manager's CA
Issuers sign. The OpenBao server CA is a bootstrap Secret, because the store cannot serve its
own certificate. The registry CA and `otel-server-ca` are store values read by ExternalSecrets of
`secret-sync`, as the plan's decision 5 sets: their issuers are in units ordered after
`secret-sync` (`issuers` at 7, `otel-certificates` at 8), so no cycle exists. Later: offline
roots, store-held intermediates, and the cert-manager Vault issuer.

### D10 Bootstrap set

The bootstrap set is what the store itself reads before it can serve or be restored, and
nothing else (plan R22, decision 9). The bootstrap playbook decrypts each file on the controller
and applies it through the API (plan decision 5); the files live in the private fleet
repository, encrypted to the new cluster's recipient, in a directory no Application reads,
because this repository is public and published ciphertext cannot be revoked.

| Secret                     | Namespace      | Read by                                   |
| -------------------------- | -------------- | ----------------------------------------- |
| `openbao-seal-key`         | `puni-secrets` | the server, as its static seal            |
| `openbao-server-ca`        | `puni-secrets` | the CA Issuer of the store's certificate  |
| `openbao-oidc-client`      | `puni-secrets` | self-init, for the operator OIDC mount    |
| `openbao-snapshot-storage` | `puni-secrets` | the snapshot Job, the drill and a restore |

The plan's own bootstrap rows (repository read keys, the Argo CD local account, the Tailscale
operator's OAuth client) stay the plan's: they are needed before the store serves, so they are
not store values. Everything the first draft kept here for Flux's sake, `sops-age`, the
kubeconfig Secrets, `velero-credentials`, `velero-repo-credentials`, `alertmanager-puni`,
`registry-ca` and `otel-server-ca`, is gone from the set or is a store value (D12).
Rehearsal clusters take the same four from values made for the rehearsal (plan decision 10).

### D11 Audit and backup

One audit device in server configuration, `file_path = "stdout"`, `log_raw` off; the OTel
collector ships it with every other pod log once the plan's stage 3 runs it. Until then the
records stay in the pod log on m1plat1. Fail-closed (requests refused when no device records
them) is accepted because a stdout write practically never blocks.

OpenBao has no snapshot scheduler, so a CronJob runs `bao operator raft snapshot save` every
6 h to the platform backup bucket and to the off-region copy of
[recovery](../../../docs/infra/recovery.md#off-region-copy), 30-day retention. The off-region
copy is not yet running, so it must be before the first value that exists only in the store
(task 4.2). A monthly drill Job restores the latest snapshot into an empty instance with the
cluster seal key, reads the canary, and proves that a wrong key leaves it sealed.
`OpenBaoRestoreDrillStale` fires when the last success is older than 35 days.

### D12 Consumers

The new cluster starts with store-sourced Secrets: nothing migrates on it. Taken from the plan
and the changes it names, not invented here:

| Value                                                                                                 | Consumer                                                     | Path prefix                               | Written in   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- | ------------ |
| Canary                                                                                                | `puni-secrets`                                               | `kv/platform/puni-secrets/`               | A7           |
| Registry CA key pair                                                                                  | `issuers`                                                    | `kv/platform/<namespace>/`                | A7           |
| `velero-credentials`, `velero-repo-credentials`                                                       | `velero`                                                     | `kv/platform/<namespace>/`                | A14          |
| `elastic-s3-credentials`, `alertmanager-puni`, `otel-server-ca`, `otel-client-trust`, nine `signal-*` | observability units                                          | `kv/platform/<namespace>/`                | A14          |
| MLflow backup credentials                                                                             | `mlflow`                                                     | `kv/platform/<namespace>/`                | A15          |
| Rancher's `bootstrapPassword`                                                                         | the Secret `bootstrap-secret` in `cattle-system`             | `kv/platform/cattle-system/`              | A27          |
| Harbor's Secrets and robot credentials                                                                | Harbor and its consumers                                     | as the Harbor change states               | its steps    |
| Staging app Secrets: runtime, pull and backup credentials                                             | staging namespaces                                           | `kv/tenants/puni/staging/<namespace>/`    | A18          |
| Production app Secrets                                                                                | production namespaces                                        | `kv/tenants/puni/production/<namespace>/` | A19, A20     |
| Database backup credentials and owner-role passwords                                                  | `host-postgres` database namespaces and the apps' namespaces | per D5's grant                            | PG-A3, PG-A4 |
| Harbor push robot, staging pins App key, status App key                                               | the CI cluster's `ci-<tenant>` namespace                     | `ci/<tenant>/`                            | CI-A3        |

Each namespace that reads gets its `secret-reader`, its SecretStore in `secret-sync` and its
role (D5) in the revision that adds its first ExternalSecret. The old cluster's Secrets,
`tool-secrets` and the host `.env` files are left as they are; they go with the old cluster
(plan stage 5).

### D13 Argo CD units

The plan's order table holds the store's three units; this change fills them under
`infra/argocd/units/` and adds no order of its own.

| Order | Unit               | Needs (plan)                                                                   | Holds                                                                                                     |
| ----: | ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
|     4 | `openbao`          | `storage`; `cert-manager`; the seal key and server CA Secret from the playbook | wrapper chart, CA Issuer and server Certificate, Services, NetworkPolicy, the three Jobs, the declaration |
|     5 | `external-secrets` | `policy`                                                                       | wrapper chart with its CRDs (`ServerSideApply=true`), `ignoreDifferences` on the injected CA bundle       |
|     6 | `secret-sync`      | `openbao`, `external-secrets`                                                  | every `secret-reader`, every SecretStore, every platform ExternalSecret                                   |

All three are in the `platform` project and are synced on command (plan rule 2.4(b)); none is
automated. `secret-sync` writes into app namespaces by design, as the plan's rule 2.4(a)
allows. An app's own ExternalSecrets are in its overlay, and its SecretStore is in
`secret-sync`. Argo CD's bundled health check for ExternalSecret makes `secret-sync` Healthy
only when every value has arrived. The chart's test hook is skipped (Argo CD skips Helm test
hooks), and the injector and CSI provider are off in its values.

The secret rules (task 1.3 to 1.6) run with the plan's `delivery` family inside `gate` and
refuse: a SecretStore outside `secret-sync`; an ExternalSecret outside `secret-sync` and the
staging and production overlays; a Vault-kind issuer anywhere; an ExternalSecret whose target is
a bootstrap Secret (D10) or whose path lies outside its namespace's prefix and grants (D5).
The plan's rule 2.4(c) already refuses a unit ordered at or below the unit that provides a
Secret it reads, which keeps every store-sourced Secret out of the store's own bring-up.

### D14 Outage and recovery on one server

**While the store is sealed or down** (plan decision 5). ESO stops refreshing; Secrets already
written stay, so running pods keep running and restart normally. Every ExternalSecret turns
not Ready, `secret-sync` is not Healthy, and the sync playbook refuses every unit that needs it;
a unit that does not, such as `eck-operator`, can still be synced. Staging Applications keep
syncing on their own; a workload that needs a Secret it never had waits for the store. So an
outage stops changes, not running services. `OpenBaoSealed` and `ExternalSecretSyncFailed`
fire once the `alerts` unit runs (plan A14); before that, `tool-fleet:health` lists
`secret-sync` as not Healthy.

**Pod or reboot.** A restarted store pod unseals from the seal key with no human.

**Loss of m1plat1.** The store, the control plane and every platform service go together.
Recovery is the plan's cold rebuild: the replacement server is built, etcd is restored from its
snapshot with `restore.yml`, and the bootstrap playbook applies the bootstrap set. The restored
`openbao` objects run in `steady` mode, so the server finds no Raft database and refuses to
start. The operator commits `restore` mode and syncs `openbao`, runs `bao operator init` (with a
static seal it returns a root token and recovery shares), and restores the latest snapshot.
The restore replaces the token store and the recovery configuration, so the init's root token
and shares stop working; they are discarded, never escrowed, and the escrowed shares authorise
`generate-root` from then on, Auth0 or not. Then `steady` is committed again, and only then is
`secret-sync` or any consumer synced. Up to 6 h of store writes can be lost: escrowed values are
written again, and a generated value (a Harbor robot, a database password) is rotated, which
Harbor's runbook already does. The plan's restore drill A6 runs before the store holds
anything, so it never restores a cluster that holds the store; the store's own drills are D11's.

## Phases

| Phase | Scope                                                                   | Gate                                                   |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| P0    | this design, chart archives, units, secret rules and planner, negatives | review, `gate`                                         |
| P1    | the plan's k3d lab on one tainted server                                | every proof in task group 3; the plan's receipt 2.7/A7 |
| P2    | A7 on m1plat1: canary and registry CA                                   | the plan's A1 to A6; P1; reach proofs; escrow restore  |
| P3    | consumers, at the plan's steps (D12)                                    | one receipt per consumer                               |
| P4    | three voters, then PKI, dynamic credentials, external tenants           | a separate change                                      |

## Owner inputs

| Input                         | Assumed                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Recovery shares               | three, threshold two, all in both escrow places; seal keys kept 30 days after rotation      |
| Operator login                | an Auth0 application in the existing tenant, its callback on the operator's own machine     |
| Path scheme                   | `kv/platform/…`, `kv/tenants/<tenant>/<environment>/…`, and a mount `ci` for the CI cluster |
| Database grant                | a database namespace reads its apps' owner-role keys (D5)                                   |
| Store modes                   | `first-init`, `steady`, `restore`, with the empty-directory refusal in `steady`             |
| Off-region copy               | running before the first value that exists only in the store                                |
| Bootstrap ciphertext location | the private fleet repository, because this one is public                                    |

## Risks / Trade-offs

- The seal protects snapshots, not the server: root on m1plat1, or cluster-admin by any route
  (the node's kubeconfig, Rancher's administrator, a synced unit), yields the seal key and the
  data.
- m1plat1 is a single point for secret changes and holds the only Raft copy between snapshots;
  up to 6 h of writes can be lost (D14).
- Its outage is a correlated outage of the store, Harbor, Argo CD and the control plane:
  changes stop together, while running pods and cached images on other nodes continue.
- The ESO controller can mint tokens for every reader account; compromising it exposes the
  cluster's paths. Mitigated by its namespace, Restricted Pod Security and a NetworkPolicy that
  lets it reach the store and the API server only.
- Revocation covers store access, not synced copies: a revoked reader keeps the Secret it has
  until the value is rotated.
- Audit completeness is bounded by the log pipeline and its retention, and before stage 3 by
  the pod log on one node.
- Rotating the CI cluster's service-account signing key breaks its JWT mount silently; runbook
  entry and alert in task 4.4.
- Not yet verified upstream: that ESO keeps the existing Secret when a refresh fails, ESO 2.15
  against OpenBao 2.7 (upstream tested ESO 0.16.1 with OpenBao 2.2.0), certificate reload on
  renewal, that the `bao` client accepts a server name override over the tailnet, and that the
  Tailscale operator's exposure passes TLS through unchanged. P1 proves each before anything
  depends on it.
