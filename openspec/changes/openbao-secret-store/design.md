## Context

**Design only, 2026-11-15. Nothing here is installed or activated.** The decisions below were
made by a Fable 5.2 (high effort) decision pass and revised after a second Fable 5.2 adversarial
review, at Dany's request while he was away ("don't ask me questions, assume"). Assumptions that
need him are listed under [owner inputs](#owner-inputs). The product choice and delivery rule are
[ADR 0079](../../../docs/adr/0079-openbao-is-the-platform-secret-store.md).

Today ([platform](../../../docs/infra/platform.md#secrets)):

- `platform-production` is k3s server h4claw (8 CPUs, 15,602 MiB) plus agent h3mon
  (capability `observability` only, already 2,228 MiB short for the observability overlap).
  Workers clusters are separate k3s clusters that reach the platform over 10.1.0.0/16.
- The `secrets` stage reconciles SOPS files from `infra/platform/secrets/<cluster-id>/`; for
  puni-00 those directories are empty and 17 production Secrets are `source: operator` in
  `externally-provided.json`. `sops-age`, the kubeconfig Secrets and `puni-platform-auth` are
  placed by Ansible `platform.yml` from host files; `puni-fleet-auth` is created by hand.
- cert-manager v1.21.2 runs in `controllers`. The `certificates` stage holds the OTLP CA Issuers
  and is health-gated on Certificate Ready; their signing Secrets are operator-provisioned and,
  per [OTLP mTLS](../../../docs/infra/otlp-mtls.md), must come from SOPS for a rebuild.
- puni-00 is a **public** repository; puni-fleet is private and decrypts with the same `sops-age`.
- Object storage is Hetzner hel1 (S3 API). Hetzner has no KMS. Humans log in through Auth0.

## Goals / Non-Goals

**Goals:** one canonical, audited, revocable copy of every platform credential; per-namespace
isolation enforced by the store and by the fleet check; an outage that stops secret changes only;
a tested restore and cold rebuild; a path to tenants, PKI and short-lived credentials without
redesign.

**Non-Goals:** see [proposal](proposal.md#non-goals).

## Decisions

### D1 Product and versions

OpenBao v2.7.2 (chart `openbao-0.30.7`, MPL-2.0) and External Secrets Operator v2.15.0, both
vendored under `infra/platform/charts/` and pinned in `infra/versions/toolchain.json` like every
other chart. OpenBao is used through ESO's Vault provider. Rejected alternatives are in ADR 0079.

### D2 Placement

Namespace `puni-secrets` on the platform cluster; one Raft replica on h4claw, which gains the
label `puni.dev/capability-secret-store`. Workers clusters run no store. There is no shadow mode:
the SOPS directory is empty, so running both would double the work for no fallback. Consumers of
**static** secrets may depend on the single replica once the phase 2 proofs pass, because
ESO-only delivery (D4) makes an outage no worse than today's hand-created Secrets. Three voters
are required before any liveness-dependent use: PKI leaves, dynamic credentials, external
tenants. h3mon cannot host a replica (memory shortfall); h2puni is not an out-of-cluster voter.
The OpenBao, ESO and drill-instance memory requests are measured in P1 and added to h4claw's
coexistence budget before P2 (task 1.8).

### D3 Seal

Static-key auto-unseal (OpenBao ≥ 2.4). The **cluster seal key** (32 bytes) lives in a bootstrap
SOPS Secret (D10), mounted read-only as `file://`, rotated through `previous_key`.
Initialization is declarative self-init (D8a). Recovery keys come from
`POST sys/rotate/recovery/init` (OpenBao ≥ 2.4), which needs an authenticated caller, so the first
operator OIDC login must work and the 2-of-3 recovery shares must be escrowed before the first
non-canary write.

Escrow lives outside the cluster ([recovery](../../../docs/infra/recovery.md)). Every key id stays
in escrow until the last snapshot sealed with it expires (30 days after rotation). The in-cluster
drill (D11) proves only the in-cluster copy; an **attended escrow restore** on a second machine,
using the escrowed key and no cluster material, runs at P2 and after every rotation.

Rejected: cloud KMS (its credentials would sit in SOPS anyway and it adds an outside total-loss
mode; revisit for a second operator or tenant compliance, OVHcloud KMS is supported), Shamir
(sealed after every reboot with one operator), transit from a second OpenBao, PKCS#11.

### D4 Delivery

ESO only. Every `ExternalSecret` uses `refreshInterval: 1h`, `deletionPolicy: Retain` and
`creationPolicy: Orphan`. Under `Owner`, deleting an ExternalSecret (a bad prune or CRD removal)
deletes the live Secret and breaks running services, which violates the outage rule. Orphaned
Secrets are therefore flagged by the fleet check when no declaration names them. Agent injector
and CSI are rejected: new pods fail while the store is sealed.

### D5 Store scoping

Per-namespace `SecretStore` only. Each authenticates as a dedicated `secret-reader` service
account in its namespace, never the workload's. Chart values disable `ClusterSecretStore`,
`ClusterExternalSecret`, `PushSecret`, `ClusterPushSecret` and cluster generators, and the fleet
check refuses them. One templated policy per cluster keys the readable path on the login's
namespace, so isolation does not depend on per-namespace roles staying correct; the auth role
binds the account name (D7), so another pod in the same namespace cannot log in.

### D6 Paths and tenancy

KV v2 mount `kv`, path `kv/<cluster-id>/<namespace>/<secret>`, in the root namespace, for
provider-plane secrets only. No OpenBao namespaces now. When PUNI's own products (WBS, website)
migrate, they go into OpenBao namespace `tenants/puni` as tenant zero, so the first external
tenant is the second use of a proven procedure. External tenants get `tenants/<organization-id>`.

### D7 Authentication

| Caller                                    | Method                        | Binding                                                                                                                                                              |
| ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform-cluster `secret-reader` accounts | Kubernetes auth (TokenReview) | `bound_service_account_names=secret-reader`, any namespace; path from token metadata                                                                                 |
| Workers-cluster `secret-reader` accounts  | one JWT mount per cluster     | pinned `jwt_validation_pubkeys`, `bound_audiences=openbao`, `bound_claims` on `/kubernetes.io/serviceaccount/name`, 10-minute tokens, namespace via `claim_mappings` |
| Snapshot, drill and drift Jobs            | Kubernetes auth               | one account and role each in `puni-secrets`: snapshot, read canary, read/list config                                                                                 |
| Operators                                 | OIDC through Auth0            | claim → policy mapping; no userpass                                                                                                                                  |
| GitHub Actions                            | none yet                      | hosted runners cannot reach 10.1.0.0/16 and D8 forbids public exposure                                                                                               |

k3s clusters share the default issuer string, so the pinned key per mount is what distinguishes
them. JWT auth has no revocation check, hence the short token lifetime. Self-init revokes its root
token automatically. Rejected: Kubernetes auth for workers (needs an API callback into each
cluster), AppRole (a static secret to place).

### D8 Network and TLS

Following the `otel-gateway` precedent: a NodePort with `externalTrafficPolicy: Local` reached on
h4claw's private address, never on Traefik. The NetworkPolicy admits the private range
`10.1.0.0/16` and, in-cluster, only the ESO and `puni-secrets` Job pods. OpenBao terminates TLS
with a certificate from a SOPS-rooted cert-manager CA Issuer whose SANs are
`openbao.puni.internal` and the in-cluster service names. Workers resolve
`openbao.puni.internal` through the same private DNS the OTLP gateway needs (a P4 prerequisite)
and pin the CA through ESO `caProvider`. The certificate lives 90 days and renews 30 days before
expiry; P1 proves whether OpenBao serves the renewed leaf without a restart and, if not, the
renewal triggers a controlled restart (task 3.10).

The private network is not an authentication boundary; TLS and JWT carry the trust. The proof is a
refused connection from a public address **paired with** an accepted connection from a private
address through the same probe, so a dead network cannot pass it.

### D8a Configuration reconciliation

One Git declaration is the source for every store object: mounts, auth methods, roles and
policies. Self-init is one-shot (upstream: to repeat it, remove all storage), so it renders only
three objects from that declaration: the operator OIDC mount, its role and the operator admin
policy. Audit is a server-config stanza, not an API object. The fleet check refuses a self-init
request that is not rendered from the declaration.

An attended operator command, `secret-store plan|apply`, reconciles the live store to the whole
declaration from day one, **including** the three self-init objects, which it adopts on first run;
OpenBao's built-ins (`token` auth, `cubbyhole`, `sys`, `identity`, the `default` policy) are
allow-listed. `apply` is dry-run by default, prints the diff, and refuses unknown live mounts, auth
methods, roles or policies. Rotating the Auth0 client secret is a declaration change applied the
same way. `apply` runs under the operator's short OIDC token, or a `generate-root` token when Auth0
is down. There is **no standing write credential**: a credential that writes policies is
root-equivalent, and D5's templated policy means new namespaces need no store change, so changes
are rare. A drift CronJob with a read/list-only policy compares live state to the declaration and
raises `OpenBaoConfigDrift`. Rejected: a standing in-cluster reconciler (a network-reachable root),
OpenTofu (state and a toolchain, and it does not refuse unmanaged objects).

**Cold rebuild does not self-init.** Self-init revokes its root token and creates no recovery
keys, so a rebuilt empty store would be reachable only through Auth0. Restore mode is a committed
overlay variant of `secret-store/<environment>` with self-init disabled, selected in the bootstrap
commit before `platform.yml` runs on a rebuild. The runbook runs `bao operator init` (auto-unseal
returns a root token and recovery shares), then restores the latest snapshot. The restore replaces
the token store and the recovery key, so the init root token and the init's recovery shares stop
working; they are discarded, never escrowed. The restored data brings back the escrowed
recovery-key configuration and every declared object, so the only Auth0-free admin path afterwards
is `generate-root` with the escrowed shares. A store that self-initialized during a rebuild because
the normal overlay was selected is recovered by deleting its PVC and restarting in restore mode
(task 3.9).

### D9 PKI

Deferred until three voters. Until then CA signing keys stay in the bootstrap set (D10) and feed
the existing cert-manager CA Issuers. Later: offline roots, OpenBao-held intermediates, and the
cert-manager Vault issuer in a new `issuers` stage after `secret-sync`. OTLP leaves live 24 h and
renew 8 h before expiry, so a PKI issuer on one replica would make telemetry depend on liveness.

### D10 Bootstrap set outside OpenBao

| Placed by                                        | Secrets                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ansible `platform.yml`                           | `sops-age`, cluster kubeconfig Secrets, `puni-platform-auth`, k3s tokens                                                                                                                                     |
| Operator by hand                                 | `puni-fleet-auth`; workers `otel-client-ca` until fleet enrolment                                                                                                                                            |
| SOPS in private puni-fleet (`bootstrap-secrets`) | cluster seal key, OpenBao server CA signing Secret, Auth0 OIDC client secret, snapshot S3 credentials, `velero-credentials`, `velero-repo-credentials`, `alertmanager-puni`, `registry-ca`, `otel-server-ca` |

puni-00 is public and published ciphertext cannot be revoked, so the production platform's
bootstrap SOPS files live in puni-fleet's `clusters/<cluster-id>/bootstrap-secrets/`, reconciled by
a fleet Kustomization `bootstrap-secrets` that decrypts with the same `sops-age`. No puni-00 stage
names it in `dependsOn`: a missing seal-key Secret already holds the store pod, and nothing depends
on `secret-store`. Local rehearsal clusters take the same set from the existing disposable
rehearsal commit (generated age identity, test values in `infra/platform/secrets/platform-local/`).
Workers clusters read only puni-00 and the fleet SOPS rule encrypts to the platform recipient
alone, so workers `otel-client-ca` stays `source: operator` until a workers cluster is enrolled in
the fleet repository with its own recipient (task 4.4).

The CA signing Secrets stay in the bootstrap set because the `certificates` stage, which is
health-gated on Certificate Ready, consumes them before the store exists; moving them into the
store would deadlock a cold rebuild. They move only with PKI in P5.

### D11 Audit and backup

One audit device declared in server configuration, `file_path = "stdout"`, `log_raw` off; the OTel
collector ships it with every other pod log. Fail-closed (requests refused when no device records
them) is accepted because a stdout write practically never blocks. OpenBao has no snapshot
scheduler, so a CronJob runs `bao operator raft snapshot save` every 6 h to the hel1 bucket and the
off-region bucket, 30-day retention. The off-region copy does not run yet
([recovery](../../../docs/infra/recovery.md)), so it is a P2 prerequisite (task 4.1). A monthly
automated drill restores into an empty instance with the cluster seal key, reads a canary, and
proves a wrong key leaves it sealed. `OpenBaoRestoreDrillStale` fires when the last success is
older than 35 days, so a drill that never runs is visible.

### D12 Migration

`externally-provided.json` entries gain `source: openbao`. The fleet check requires a
same-namespace `ExternalSecret` and `SecretStore` for each, refuses an `ExternalSecret` whose target
is undeclared, and refuses `openbao` for any Secret that the derived consumption graph attributes
to a stage at or before `secret-store` or to the bootstrap set. Order: canary,
`elastic-s3-credentials`, the `signal-*` auth and TLS Secrets, `registry-auth`, then workers
clusters. Bootstrap-set Secrets (D10) move from `operator` to the fleet `bootstrap-secrets`
Kustomization, not to the store. Host `.env`: no host agent; OpenBao holds the canonical copy and
an attended operator push writes the file until WBS runs in-cluster. `tool-secrets` is deleted.

### D13 Stage graph

| Stage             | Path                            | Waits for                              |
| ----------------- | ------------------------------- | -------------------------------------- |
| `secret-store`    | `secret-store/<environment>`    | storage, policy, secrets, certificates |
| `secret-operator` | `secret-operator/<environment>` | policy                                 |
| `secret-sync`     | `secret-sync/<cluster-id>`      | secret-operator, secrets               |

**Nothing depends on `secret-store`**, and `secret-sync` does not depend on it either: Flux marks
a Kustomization `DependencyNotReady` and skips its apply while any dependency is not Ready, so a
sealed store in the chain would stop `platform`, `observability`, `alerts` and `backup` from
reconciling.

ESO's chart and CRDs are in `secret-operator`, apart from its custom resources: Flux dry-runs every
non-CRD object in a Kustomization before applying any, so `SecretStore`s and `ExternalSecret`s in
the same stage as the HelmRelease that installs their CRDs would never apply. This repeats the
existing `controllers`/`certificates` and `observability`/`alerts` split. `secret-operator` uses
`wait: true`; it does not involve the store, so an outage leaves it Ready.

`secret-sync` holds only the `SecretStore`s and `ExternalSecret`s, uses `wait: false` and
`healthChecks` on the target Secrets' existence, and consumers (`platform`, `observability`)
depend on it. With existing Secrets, an outage therefore blocks no reconcile. Sync freshness is an
alert (`ExternalSecretSyncFailed`, `OpenBaoSealed`), not a gate. Workers clusters get
`secret-operator` and `secret-sync` with the same dependencies.

The fleet check refuses `SecretStore`, `ExternalSecret` or a Vault issuer in any stage other than
`secret-sync`, and refuses any `dependsOn` naming `secret-store`. A `wait: true` stage holding an
`ExternalSecret` would turn not-Ready on a refresh failure and block its dependents.

Two exceptions to "an outage blocks no reconcile" are accepted and stated:

- a commit that adds a **new** `ExternalSecret` during an outage fails the target-existence health
  check and blocks `secret-sync`'s dependents until the store returns; such commits wait;
- on a **cold rebuild**, consumer stages wait until the store is restored. `backup` and `alerts`
  depend transitively on `secret-sync` through `observability`, so the order is bootstrap set,
  store restore (D8a), sync, then the rest (proof task 3.9). No bootstrap Secret is store-sourced.

## Phases

| Phase | Scope                                                          | Gate                                                                         |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0    | this design, vendored charts, fleet-check rules with negatives | review, CI                                                                   |
| P1    | k3d rehearsal                                                  | every proof in task group 3                                                  |
| P2    | production, canary Secret only                                 | P1 proofs live, public refusal with private control, attended escrow restore |
| P3    | static consumers on the platform cluster                       | per-Secret cutover receipts                                                  |
| P4    | workers clusters                                               | private DNS, JWT mount per cluster, cross-cluster refusal                    |
| P5    | third node, three voters, then PKI, `tenants/puni`, CI         | separate change                                                              |
| P6    | external tenants                                               | isolation rehearsal, second audit sink                                       |

## Owner inputs

| Input                              | Assumed                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| Third platform node                | not now; no new spend before P5                                    |
| Seal key and three recovery shares | Dany escrows them in three places and keeps rotated keys 30 days   |
| Operator login                     | an Auth0 application in the existing tenant                        |
| Off-region snapshot bucket         | the planned off-region backup bucket, started as a P2 prerequisite |
| Bootstrap ciphertext location      | private puni-fleet, because puni-00 is public                      |

## Risks / Trade-offs

- The seal protects snapshots, not the host: root on h4claw yields both the key and the data.
- h4claw is a single point for secret changes and holds the only Raft copy between snapshots,
  so up to 6 h of writes can be lost; writes are rare and re-enterable from the operator.
- The ESO controller can mint tokens for every namespace's reader account; compromising it
  exposes that cluster's paths. Mitigated by its own namespace, Restricted Pod Security and a
  NetworkPolicy allowing only the store.
- "Instant revocation" covers store access, not synced copies: a revoked reader keeps the
  Kubernetes Secret it already has until the value is rotated.
- Audit completeness is bounded by the log pipeline's loss modes and 30-day retention.
- Rotating a workers cluster's service-account signing key silently breaks its JWT mount;
  runbook entry and alert in task 4.3.
- Not yet verified upstream: that ESO keeps the existing Secret when a refresh fails, ESO 2.15
  against OpenBao 2.7 (upstream tested ESO 0.16.1 with OpenBao 2.2.0), and certificate reload on
  renewal. P1 proves all three before anything depends on them.
