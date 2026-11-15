## Context

**Design only, 2026-11-15. Nothing here is installed or activated.** The decisions below were
made by a Fable 5.2 (high effort) review at Dany's request while he was away ("don't ask me
questions, assume"); assumptions that need him are listed under [owner inputs](#owner-inputs).
The product choice and delivery rule are [ADR 0079](../../../docs/adr/0079-openbao-is-the-platform-secret-store.md).

Today ([platform](../../../docs/infra/platform.md#secrets)):

- `platform-production` is k3s server h4claw (8 CPUs, 15,602 MiB) plus agent h3mon
  (capability `observability` only, already 2,228 MiB short for the observability overlap).
  Workers clusters are separate k3s clusters that reach the platform over 10.1.0.0/16.
- The `secrets` stage reconciles SOPS files from `infra/platform/secrets/<cluster-id>/`; for
  puni-00 those directories are empty and 17 production Secrets are `source: operator` in
  `externally-provided.json`. `sops-age`, the kubeconfig Secrets and the Flux deploy keys are
  placed by Ansible `platform.yml` from host files, not SOPS.
- cert-manager v1.21.2 runs in `controllers`; OTLP mTLS uses namespace-scoped CA Issuers whose
  signing Secrets are operator-provisioned ([OTLP mTLS](../../../docs/infra/otlp-mtls.md)).
- Object storage is Hetzner hel1 (S3 API). Hetzner has no KMS. Humans log in through Auth0.

## Goals / Non-Goals

**Goals:** one canonical, audited, revocable copy of every platform credential; per-namespace
isolation enforced by the store and by the fleet check; an outage that stops changes only; a
tested restore; a path to tenants, PKI and short-lived credentials without redesign.

**Non-Goals:** see [proposal](proposal.md#non-goals).

## Decisions

### D1 Product and versions

OpenBao v2.7.2 (chart `openbao-0.30.7`, MPL-2.0) and External Secrets Operator v2.15.0, both
vendored under `infra/platform/charts/` and pinned in `infra/versions/toolchain.json` like every
other chart. OpenBao is used through ESO's Vault provider. Rejected alternatives are in ADR 0079.

### D2 Placement

Namespace `puni-secrets` on the platform cluster; one Raft replica on h4claw, which gains the
label `puni.dev/capability-secret-store`. There is no shadow mode: the SOPS directory is empty,
so running both would double the work for no fallback. Consumers of **static** secrets may depend
on the single replica once the phase 2 proofs pass, because ESO-only delivery (D4) makes an outage
no worse than today's hand-created Secrets. Three voters are required before any
liveness-dependent use: PKI leaves, dynamic credentials, external tenants. h3mon cannot host a
replica (memory shortfall); h2puni is not added as an out-of-cluster voter.

### D3 Seal

Static-key auto-unseal (OpenBao ≥ 2.4). A 32-byte key lives in a SOPS Secret in `puni-secrets`,
mounted read-only as `file://`, rotated through `previous_key`. Initialization is declarative
self-init; afterwards 2-of-3 recovery keys are generated for `generate-root`. The seal key and its
fingerprint are escrowed beside the age identity ([recovery](../../../docs/infra/recovery.md)).
A deleted seal key makes every snapshot unrecoverable, so the restore drill (D11) proves the
escrowed copy. Rejected: cloud KMS (its credentials would sit in SOPS anyway and it adds an
outside total-loss mode; revisit for a second operator or tenant compliance, OVHcloud KMS is
supported), Shamir (sealed after every reboot with one operator), transit from a second OpenBao,
PKCS#11.

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
`service_account_namespace`, so isolation does not depend on per-namespace roles staying correct.

### D6 Paths and tenancy

KV v2 mount `kv`, path `kv/<cluster-id>/<namespace>/<secret>`, in the root namespace, for
provider-plane secrets only. No tenant namespaces now. When PUNI's own products (WBS, website)
migrate, they go into OpenBao namespace `tenants/puni` as tenant zero, so the first external
tenant is the second use of a proven procedure. External tenants get `tenants/<organization-id>`.

### D7 Authentication

| Caller                                    | Method                        | Binding                                                                                                      |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Platform-cluster `secret-reader` accounts | Kubernetes auth (TokenReview) | role per cluster, namespace from token metadata                                                              |
| Workers-cluster `secret-reader` accounts  | one JWT mount per cluster     | pinned `jwt_validation_pubkeys`, `bound_audiences=openbao`, 10-minute tokens, `claim_mappings` for namespace |
| Operators                                 | OIDC through Auth0            | claim → policy mapping; no userpass                                                                          |
| GitHub Actions                            | none yet                      | hosted runners cannot reach 10.1.0.0/16 and D8 forbids public exposure                                       |

k3s clusters share the default issuer string, so the pinned key per mount is what distinguishes
them. JWT auth has no revocation check, hence the short token lifetime. The self-init root token
is revoked automatically. Rejected: Kubernetes auth for workers (needs an API callback into each
cluster), AppRole (a static secret to place).

### D8 Network

Following the `otel-gateway` precedent: a NodePort with `externalTrafficPolicy: Local` reached
on h4claw's private address, OpenBao terminating TLS as `openbao.puni.internal` with a certificate
from a SOPS-rooted cert-manager CA Issuer, a NetworkPolicy admitting only `10.1.0.0/16`, never on
Traefik. Workers pin the CA through ESO `caProvider`. The private network is not an authentication
boundary; TLS and JWT carry the trust. The proof is a refused connection from a public address,
not the presence of the policy.

### D8a Configuration reconciliation (open, decide before phase 2)

Self-init runs once. Mounts, auth methods, roles and policies after that need a declared,
reviewed source and an idempotent reconciler with its own narrowly scoped credential. The
assumed direction is a Git-declared configuration applied by an attended operator command that
diffs and refuses unknown live objects; the decision and its proof are task 2.6.

### D9 PKI

Deferred until three voters. Until then CA signing keys are ordinary KV entries synced to the
existing cert-manager CA Issuers. Later: offline roots, OpenBao-held intermediates, and the
cert-manager Vault issuer in a new `issuers` stage after `secret-sync`. OTLP leaves live 24 h and
renew 8 h before expiry, so a PKI issuer on one replica would make telemetry depend on liveness.

### D10 Bootstrap set outside OpenBao

| Placed by              | Secrets                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ansible `platform.yml` | `sops-age`, cluster kubeconfig Secrets, `puni-platform-auth`, `puni-fleet-auth`, k3s tokens                                                       |
| SOPS (`secrets` stage) | OpenBao seal key, OpenBao server CA signing Secret, snapshot S3 credentials, `velero-credentials`, `velero-repo-credentials`, `alertmanager-puni` |

A lost store must not take the Kopia password or the alert path with it. `backup` and `alerts`
never depend on `secret-sync`.

### D11 Audit and backup

One audit device declared in server configuration, `file_path = "stdout"`, `log_raw` off;
the OTel collector ships it with every other pod log. Fail-closed (requests refused when no device
records them) is accepted because a stdout write practically never blocks. OpenBao has no snapshot
scheduler, so a CronJob runs `bao operator raft snapshot save` every 6 h to the hel1 bucket and the
off-region bucket, 30-day retention. A monthly automated drill restores into an empty instance,
reads a canary, and proves the wrong seal key fails.

### D12 Migration

`externally-provided.json` entries gain `source: openbao`. The fleet check requires a
same-namespace `ExternalSecret` and `SecretStore` for each, and refuses an `ExternalSecret` whose
target is undeclared. Order: canary, `elastic-s3-credentials`, the `signal-*` auth and TLS
Secrets, `registry-auth`, CA signing Secrets (`registry-ca`, `otel-server-ca`), then workers
clusters. Velero and Alertmanager stay in SOPS (D10). Host `.env`: no host agent; OpenBao holds
the canonical copy and an attended operator push writes the file until WBS runs in-cluster.
`tool-secrets` is deleted.

### D13 Stage graph

| Stage          | Path                         | Waits for                              |
| -------------- | ---------------------------- | -------------------------------------- |
| `secret-store` | `secret-store/<environment>` | storage, policy, secrets, certificates |
| `secret-sync`  | `secret-sync/<cluster-id>`   | secret-store                           |

Consumers that read synced Secrets depend on `secret-sync`; `backup` and `alerts` do not. There is
no cycle: cert-manager is in `controllers` and OpenBao's own certificate comes from the
SOPS-rooted Issuer in `certificates`. The fleet check refuses a Vault issuer or ExternalSecret in
any stage at or before `secret-store`. `secret-sync` uses `wait: false` with `healthChecks` on the
ESO Deployments and the target Secrets' existence: if it waited on ExternalSecret readiness, an
outage would block every later stage's reconcile, including unrelated fixes. Sync freshness is an
alert (`ExternalSecretSyncFailed`, `OpenBaoSealed`), not a gate.

## Phases

| Phase | Scope                                                          | Gate                                                   |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------ |
| P0    | this design, vendored charts, fleet-check rules with negatives | review, CI                                             |
| P1    | k3d rehearsal                                                  | every proof in task group 3                            |
| P2    | production, canary Secret only                                 | P1 proofs live, public-address refusal, escrow restore |
| P3    | static consumers on the platform cluster                       | per-Secret cutover receipts                            |
| P4    | workers clusters                                               | JWT mount per cluster, cross-cluster refusal           |
| P5    | third node, three voters, then PKI, `tenants/puni`, CI         | separate change                                        |
| P6    | external tenants                                               | isolation rehearsal, second audit sink                 |

## Owner inputs

| Input                              | Assumed                                         |
| ---------------------------------- | ----------------------------------------------- |
| Third platform node                | not now; no new spend before P5                 |
| Seal key and three recovery shares | Dany escrows them in three places               |
| Operator login                     | an Auth0 application in the existing tenant     |
| Off-region snapshot bucket         | the existing off-region backup bucket is reused |

## Risks / Trade-offs

- The seal protects snapshots, not the host: root on h4claw yields both the key and the data.
- h4claw is a single point for secret changes and holds the only Raft copy between snapshots,
  so up to 6 h of writes can be lost; writes are rare and re-enterable from the operator.
- The ESO controller can mint tokens for every namespace's reader account; compromising it
  exposes that cluster's paths. Mitigated by its own namespace, Restricted Pod Security and a
  NetworkPolicy allowing only the store.
- Audit completeness is bounded by the log pipeline's loss modes and 30-day retention.
- Rotating a workers cluster's service-account signing key silently breaks its JWT mount;
  runbook entry and alert in task 4.3.
- Not yet verified upstream: that ESO keeps the existing Secret when a refresh fails, the
  endpoint that creates recovery keys after self-init, and ESO 2.15 against OpenBao 2.7 (upstream
  tested ESO 0.16.1 with OpenBao 2.2.0). P1 proves all three before anything depends on them.
