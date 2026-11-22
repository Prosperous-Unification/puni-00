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
  Healthy. No Application carries a sync wave, nothing is a Helm release in the cluster, and
  nothing decrypts in it. A Secret's provider has a lower order than its consumer (plan
  spec, "Units are first synced in dependency order").
- **Secrets** (plan decision 5, R22). The store is first among the services; Ansible applies
  only the bootstrap Secrets that Argo CD and the store themselves need, decrypted from SOPS on
  the controller, which is the operator's laptop (R17); every other Secret is an
  ExternalSecret from the first day.
- **Access** (plan decision 12, R47, R55). No platform service has a public route. Interfaces
  are reached over the tailnet; SSH to a server goes through the bastion; node-to-node traffic
  uses the provider's private network.
- **Tenancy** (plan decision 13, R48). A tenant is a path prefix and a policy in the store,
  driven through OpenBao's API; `puni` is the first.

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

OpenBao v2.7.3 (chart `openbao-0.30.8`, MPL-2.0) and External Secrets Operator (ESO) v2.15.0,
both archives under `infra/platform/charts/`, locked by digest (plan R21) and pinned in
`infra/versions/toolchain.json`. OpenBao is used through ESO's Vault provider. Rejected
alternatives are in ADR 0079.

**The store's bring-up never pulls from a PUNI-operated registry.** Harbor takes its own
credentials from the store, so an image Harbor serves inside the bring-up would make a cold
rebuild circular. The scope is the `puni.dev/needs` closure of `secret-sync`, computed from the
Application files and never listed by hand (today `namespaces`, `policy`, `storage`,
`cert-manager`, `openbao`, `external-secrets` and `secret-sync`, Jobs included), plus two units
that are not needs but that the bring-up uses, named explicitly: `argocd`, which syncs it, and
`tailscale-operator`, which exposes the store to the operator, together with the proxy image
that operator starts at run time and no manifest shows (its `proxyConfig` image value). Every
image in scope equals a digest-pinned `toolchain.json` entry whose host is a declared upstream
registry (the plan's image table, "never from Harbor"). Two more bypasses no manifest shows
are closed: Ansible refuses a containerd `mirrors` entry for an upstream host without
default-endpoint fallback, and any registry admission policy exempts the namespaces in scope,
which a check holds (task 1.5).

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
disk alert covers the root filesystem's free space (D11).

Memory: the plan assumes 1,024 MiB for the store and ESO together. Task 3.15 measures both and
the drill instance and replaces the plan's row by a commit.

### D3 Seal and break-glass

Static-key auto-unseal (OpenBao ≥ 2.4). The **cluster seal key** (32 bytes) is a bootstrap
Secret (D10) mounted read-only as `file://`, rotated through `previous_key`. Recovery keys come
from `POST sys/rotate/recovery/init` (OpenBao ≥ 2.4), which needs an authenticated caller, so
the first operator OIDC login must work, and the shares are escrowed before the first value
that has no escrow copy of its own. Three shares, threshold two, all held in both escrow places
of the plan's A2. That splits nothing: whoever holds one escrow place holds the threshold. The
shares exist so that the recovery configuration and its rotation are the upstream ones, and
splitting them waits for a second operator.

**Break-glass is a second listener reached only from inside the pod.** Since v2.5.3 every
listener refuses the unauthenticated `sys/generate-root/*` endpoints unless its
`disable_unauthed_generate_root_endpoints` is false, and since v2.6.0 `bao operator
generate-root` calls the authenticated `sys/generate-root-token`, so recovery shares alone
authorise nothing on a default listener. The server therefore has two API listeners: the
network listener on TCP 8200, which the Services and the NodePort reach, with the default
(refused), and a unix socket, `/openbao/run/break-glass.sock` in a pod-local `emptyDir`, with
`disable_unauthed_generate_root_endpoints = false` and no TLS. Only `kubectl exec` into the
server container reaches the socket, and `pods/exec` in `puni-secrets` is cluster-admin's
alone, which already yields the seal key and the data (Risks). With Auth0 down, the operator
uses the CLI's generic writes over the socket, because the image has no `curl` (its Dockerfile
installs `ca-certificates libcap su-exec dumb-init tzdata gcompat` only) and `bao operator
generate-root` has no switch back to the legacy endpoints; its `-decode` also reads the
authenticated `sys/generate-root-token/attempt` first, so it cannot be used without a token:

```sh
export BAO_ADDR=unix:///openbao/run/break-glass.sock
bao write -f sys/generate-root/attempt            # returns nonce and otp
bao write sys/generate-root/update key=<share> nonce=<nonce>   # once per share
bao write sys/decode-token encoded_token=<encoded> otp=<otp>
```

`sys/decode-token` is unauthenticated (`internal/vault/logical_system.go`, the
`Unauthenticated` paths at v2.7.2 and v2.7.3), and the API client dials a `unix://` address
(`api/client.go`). Task 3.8 proves the three commands. The root token is revoked when the work
is done. OpenBao v2.7.3 also enforces the option before
forwarding a request to an active node (GHSA-h8fh-pmch-cjww), which is one reason for the pin
of D1. A third listener, `metrics_only`, serves
Prometheus (D11). The render test refuses the generate-root option on any TCP listener, and a
lab negative proves the network listener refuses `sys/generate-root/attempt` (task 2.2).

Escrow lives outside the cluster ([recovery](../../../docs/infra/recovery.md)). Every seal key id
stays in escrow until the last snapshot sealed with it expires (30 days after rotation). The
in-cluster drill (D11) proves only the in-cluster copy; an **attended escrow restore** on a
second machine, with the escrowed key and no cluster material, runs in A7 and after every
rotation.

Rejected: a cloud KMS (its credential would be a bootstrap Secret anyway and it adds an outside
total-loss mode; revisit with a second operator or a tenant's compliance need), Shamir (sealed
after every reboot with one operator), transit from a second OpenBao, PKCS#11, and enabling
the unauthenticated endpoints on the network listener (any caller that reaches it could start
or cancel an attempt).

### D4 Delivery into pods

ESO only. Every ExternalSecret uses `refreshInterval: 1h`, `deletionPolicy: Retain` and
`creationPolicy: Orphan`. Under `Owner`, deleting an ExternalSecret (a pruned file, a removed
unit, a deleted CRD) deletes the live Secret and breaks running services, which violates the
outage rule. The agent injector and the CSI provider are rejected: new pods fail while the store
is sealed.

**Orphans.** `Orphan` means a removed ExternalSecret leaves its Secret behind with no owner
reference. `tool-fleet:health` lists every Secret that carries ESO's managed label and that no
ExternalSecret in its namespace names as `spec.target.name`, and the runbook's removal step deletes it once its last
reader is gone (task 1.8).

### D5 Store scoping

Per-namespace `SecretStore` only, each in the plan's `secret-sync` unit (plan decision 3). Each
logs in as a dedicated `secret-reader` service account in its namespace, never the workload's,
with a projected token whose audience is `openbao`. Chart values disable `ClusterSecretStore`,
`ClusterExternalSecret`, `PushSecret` and `ClusterPushSecret`, set
`processClusterGenerator` and `crds.createClusterGenerator` to false and keep
`genericTargets.enabled` off,
and the secret rules refuse every generator kind. An admission rule of the `policy` unit refuses
a pod that runs as a `secret-reader` account in any namespace, so the account is only ever a
token that ESO requests (task 1.6).

**One Kubernetes auth role per reading namespace**, as the plan's decision 5 requires. A role
binds `bound_service_account_names=secret-reader`,
`bound_service_account_namespaces=<that namespace>` and `audience=openbao`, carries
`token_bound_cidrs` set to m1plat1's pod subnet (D7), and carries one policy that reads that
namespace's prefix (D6) and nothing else. Both are rendered by `tool-fleet secret-store` (D8a)
from the store declaration and the `namespaces` unit's labels, never written by hand. The
planner refuses a role that binds more than one namespace or another account, a role without
an audience or bound CIDRs, a policy whose path is not the one the namespace's `puni.dev/tenant`
and `puni.dev/environment` labels give, and a wildcard above a namespace's prefix. So a staging
reader cannot read a production path and one tenant cannot read another's.

**Database grants.** `host-postgres` keeps an owner role's password at a path of its app and
environment and reads it from two namespaces: the app's, and the database namespace whose
`DatabaseRole` names it. Its database namespaces are platform-labelled or staging-labelled
(`postgres` is `platform` and serves production; `postgres-nonproduction` is `staging` and
serves staging, and dev once that follow-up exists), so a grant cannot be "same environment".
Instead:

- The password lives at a dedicated path with a fixed name, `<app prefix>/database-owner`,
  because a KV v2 grant is per path, not per field: a grant to the app's runtime path would
  hand the database namespace every runtime credential of the app.
- The declaration names, for each database namespace, the tenants and environments it serves.
  `postgres` serves `puni`'s `production`; `postgres-nonproduction` serves `puni`'s `staging`.
- Each grant is a read of one app's `database-owner` path. The planner refuses a grant to a
  path that does not end in `database-owner`, one to an app whose tenant or environment the
  database namespace does not serve, and one whose app is not declared.
- `postgres` carries `puni.dev/tenant: puni`, as the plan's rule 2.4(r) requires of a database
  unit's namespace, and `puni.dev/environment: platform`; the environment decides the prefix,
  so its own values (its backup key) are at `kv/platform/postgres/`, and `postgres-nonproduction`'s at
  `kv/tenants/puni/staging/postgres-nonproduction/`, as its labels give.

### D6 Paths and tenancy

One KV v2 mount per cluster that reads the store, in the root namespace; no OpenBao namespaces.

| Mount | Read by                                  | Path                                                        |
| ----- | ---------------------------------------- | ----------------------------------------------------------- |
| `kv`  | the platform cluster, by Kubernetes auth | `kv/platform/<namespace>/<name>` for platform namespaces    |
| `kv`  | the platform cluster, by Kubernetes auth | `kv/tenants/<tenant>/<environment>/<namespace>/<name>`      |
| `ci`  | the CI cluster, by its JWT mount (D7)    | `ci/<tenant>/<namespace>/<name>`, as the CI change names it |

A platform namespace is one whose `puni.dev/environment` is `platform`, such as `puni-secrets`,
`cattle-system` and `postgres`, whatever tenant label it also carries. An app, database or CI
namespace carries `puni.dev/tenant`, and the environment (`production`, `staging`, `dev`) sits below the tenant,
so a tenant is a prefix and a policy (plan decision 13). `puni` is the first tenant and is built
in the form any later tenant takes; onboarding another is a follow-up.

**How the `puni-user-platform` drives it** (plan decision 13, R48). The interface is split:

| What                                     | Driven through                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Values under a tenant prefix             | OpenBao's API, with a token scoped to that tenant                  |
| Mounts, auth methods, roles and policies | Git and the attended `tool-fleet secret-store apply` (D8a), as now |

The token comes from a Kubernetes auth role per tenant, `tenant-writer-<tenant>`, bound to the
adapter's own service account in the adapter's namespace with audience `openbao`,
`token_bound_cidrs` at the pod subnet of the node the adapter runs on, a 15-minute TTL and no
renewal past 1 hour. Its policy allows create and update on `kv/data/tenants/<tenant>/*` and
nothing else: no read, no metadata, nothing under `sys/`, `auth/`, `ci/` or another tenant. The
adapter writes values it holds already, so it needs neither; a later need is a declared change.
The planner refuses a writer role whose policy reaches outside its tenant prefix. Values are
therefore not part of the declaration, and the drift job compares configuration only:
mounts, auth methods, roles and policies. The adapter itself is the plan's follow-up
`connect-platform-adapter`; this change declares no writer role until it exists.

### D7 Authentication

| Caller                                    | Method                         | Binding                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform-cluster `secret-reader` accounts | Kubernetes auth (TokenReview)  | one role per namespace (D5), audience `openbao`, bound to m1plat1's pod subnet                                                                                                                                       |
| CI-cluster `secret-reader` accounts       | one JWT mount for that cluster | pinned `jwt_validation_pubkeys`, `bound_audiences=openbao`, `bound_claims` on the service-account name and namespace, 10-minute tokens, bound to the CI server's private address, one role per CI namespace on `ci/` |
| Snapshot, drill and drift Jobs            | Kubernetes auth                | one account and role each in `puni-secrets`; snapshot and drift bound to m1plat1's pod subnet, the drill to `127.0.0.1/32` (D11); each policy also reads the canary                                                  |
| Operators                                 | OIDC through Auth0             | one role bound by subject and audience and requiring MFA; bound to m1plat1's pod subnet, where a ProxyClass that selects `platform-services` puts the Tailscale proxy; no userpass                                   |
| GitHub Actions                            | none                           | no public route (D8)                                                                                                                                                                                                 |

Every role carries `token_bound_cidrs`, so a token works only from where its caller is. The
bound subnet is m1plat1's own pod subnet (the node's `spec.podCIDR`), not the cluster's pod
CIDR: every caller of the platform roles runs on m1plat1 (D2), and a pod on a later agent node,
such as a staging pod on the non-production node, gets an address outside it. The declaration
records each cluster's subnet, read from the node at A7 and at each rehearsal, and the planner
refuses a role bound to anything wider. Through the NodePort, traffic keeps the CI server's
address (`externalTrafficPolicy: Local`), which is outside that subnet, so the CI path can use
the JWT role alone; in the cluster, traffic comes from pod addresses, so the JWT role is
useless there. The planner refuses a role
without bound CIDRs and any JWT CEL role, which has no token fields and so no bound CIDRs.

The operator role binds `bound_subject` to the owner's Auth0 user id, `bound_audiences` to the
application's client id, and `bound_claims` requiring `amr` to contain `mfa`; the Auth0
application requires MFA. Auth0 is therefore a second trust root next to the age identity on
the controller: whoever controls the tenant's signing keys or the owner's account can log in
as the administrator (Risks, ADR 0079). The token lives 1 hour. The owner's user id is personal
data and stays out of this public repository: `store.json` names the value
`operator-subject`, the private fleet repository holds it beside the bootstrap set, and
`tool-fleet secret-store plan` reads it from the private checkout on the controller
(`bun run private:checkout puni-fleet`) and fails when it is missing. The secret rules refuse a
literal `bound_subject` in `store.json`.

The CI cluster's service-account issuer is trusted by a pinned key, so no credential for the
platform side is stored there (CI change, decision 2). JWT auth has no revocation check, hence
the short token lifetime. Root on the CI server can mint a token for any service account there,
so it reads every `ci/<tenant>/` path; the CI change's single trust zone (plan R35) accepts
that. Self-init revokes its root token. Rejected: Kubernetes auth for the CI cluster (an API
callback into it), AppRole (a static secret to place).

### D8 Network and TLS

Three ways in, and no public route (R47):

| Caller                       | Path                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESO and this change's Jobs   | the ClusterIP Service `openbao`, port 8200, in the cluster                                                                                                                                                       |
| The operator, the controller | the same Service exposed on the tailnet by the Tailscale operator under a plain name (plan decision 12); the owner signs its device under Tailnet Lock                                                           |
| The CI cluster's ESO         | the Service `openbao-private`, type NodePort, port 8200 on node port 30820, `externalTrafficPolicy: Local`, on m1plat1's private address, admitted from the CI server's private address alone (plan decision 12) |

No Ingress, IngressRoute or Service of type LoadBalancer names the store. The CI cluster's
SecretStores name `https://openbao.puni.internal:30820`; that cluster's CoreDNS resolves the
name to m1plat1's private address from a hosts entry the CI change's Ansible writes from the
inventory, and each SecretStore reads the server CA certificate, which is public, from a
ConfigMap committed with the CI cluster's units. The CI change has no task for either yet; task
4.4 here names them as its precondition.

**Two layers, each proved without the other.** The host firewall (plan A26) drops the public
interface and, in its prerouting rule, every private address that is not an enrolled node,
except the CI server's for this node port. It does not stop an enrolled node, and traffic that
a pod on another node sends off the cluster is masqueraded to that node's address, so staging
and dev pods on the non-production node pass the host firewall. Only the NetworkPolicy of
`puni-secrets` stops them: its `ipBlock` for the node port admits the CI server's address
alone. On port 8200 it admits ESO's controller, this change's Jobs and the Tailscale
operator's proxy for this Service; on the metrics port, Prometheus's pods (D11); nothing else.
The private network is not an authentication boundary; TLS, the bound CIDRs and the JWT mount
carry the trust. The proof of reach, as the plan's A26 proves its own rules, runs one probe
with each layer removed in turn:

| Source                               | Both layers   | Host firewall only | NetworkPolicy only |
| ------------------------------------ | ------------- | ------------------ | ------------------ |
| A public address                     | refused       | refused            | refused            |
| A private address that is not a node | refused       | refused            | refused            |
| An enrolled node, and a pod on it    | refused       | admitted           | refused            |
| The CI server                        | TLS handshake | TLS handshake      | TLS handshake      |

So a dead listener cannot pass (the CI row needs a handshake), and the rows that each layer
alone refuses show which layer carries them. Until the plan's A13 joins the observability
server, m1plat1 is the only node, so the enrolled-node row runs in the lab at P1 and again on
the live cluster after A13.

TLS ends in OpenBao, with a certificate from a CA Issuer whose signing Secret is a bootstrap
Secret (D10). The Issuer and the Certificate are objects of the plan's `cert-manager` unit
(order 3), not of `openbao`: the plan requires a Secret's provider to have a lower order than
its reader, and the server reads the certificate's Secret. The `issuers` unit, at order 7, is
too late. Inside `cert-manager` the two objects carry a resource sync wave after the chart and
`SkipDryRunOnMissingResource=true`, so they are applied once cert-manager's webhook is Healthy;
that is a wave inside one Application, not between Applications, which the plan leaves alone.

**Amendment to the plan's A7.** `cert-manager` is first synced in A4, but the Issuer reads
`openbao-server-ca`, which the playbook applies only in A7. So the two objects land in A7's
revision, not A4's; A7 runs the playbook, then syncs `cert-manager`, then `openbao`; and A7's
rollback reverts them in `cert-manager` too. This change edits the plan's A7 text to say so.
The CA Secret's reader is now `cert-manager`, so `openbao` needs `cert-manager` (for the
certificate's Secret), `storage` and the seal key; the server CA Secret drops from its needs
(D13). The plan's order table is otherwise unchanged.

The certificate's names are `openbao.puni.internal` and the in-cluster Service names; the
tailnet name is never written in this repository, so the operator's client verifies the
store's CA with the server name `openbao.puni.internal` over the tailnet connection. It lives
90 days and renews 30 days before expiry. The TCP listener sets `tls_auto_reload` with the
default 30-second interval, which re-reads the certificate file that the kubelet updates from
the Secret; SIGHUP also reloads it, as a fallback the runbook names. Task 3.10 proves the
renewed leaf is served without a restart.

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
the operator's short OIDC token, or a break-glass root token (D3) when Auth0 is down. There is
**no standing write credential for configuration**: a credential that writes policies is
root-equivalent. A drift CronJob with a read/list policy compares the live configuration with
the declaration, rendered into a ConfigMap of the unit, fails on a difference, and so raises
`OpenBaoConfigDrift` (D11). `tool-fleet secret-store generate` writes a value from a declared
password policy to a declared path with check-and-set 0, so it never overwrites; this is the
generated password `host-postgres` asks for. Rejected: a standing in-cluster reconciler (a
network-reachable root), OpenTofu (state and a toolchain, and it does not refuse unmanaged
objects).

**Three store modes**, a value of the `openbao` unit:

| Mode         | Self-init | Network listener reachable                      | Starts without the marker   | Used                                   |
| ------------ | --------- | ----------------------------------------------- | --------------------------- | -------------------------------------- |
| `first-init` | on        | no: no NodePort, no tailnet, NetworkPolicy deny | yes                         | the first boot of A7 only              |
| `steady`     | off       | yes (D8)                                        | no: the server never starts | from the commit that follows that boot |
| `restore`    | off       | no: no NodePort, no tailnet, NetworkPolicy deny | yes, for init and restore   | a cold rebuild (D14)                   |

**Initialised is a marker, not a file the server makes.** Raft creates `vault.db`,
`raft/raft.db` and `node-id` at every start, initialised or not, so their presence proves
nothing. The invariant is that the store has been initialised: after the attended step reads
`Initialized: true` from `bao status` over the break-glass socket, it writes
`/openbao/data/puni-initialised` with the date. The marker lives in the Raft claim, so it
survives restarts and a snapshot restore and disappears with the claim. In `steady` an init
container refuses to start the server when the marker is absent, so a store whose data was lost
never listens uninitialised, where the first caller to run `init` would get its root token. In
`first-init` and `restore` the store listens, but the network listener renders behind a
NetworkPolicy that admits nothing and with no NodePort or tailnet exposure, so `bao operator
init` and the restore run only through `kubectl exec`.

The declaration records, per cluster, the date of the first initialisation once that cluster
has it (A7 for the platform cluster, its first boot for each rehearsal cluster), and the secret
rules then refuse `first-init` for that cluster. As a second guard, `secret-store apply` and the
snapshot Job refuse to run when the canary value is absent, so an empty store is never
configured or snapshotted as latest. `apply` is exempt from the canary guard only while the
declaration records no initialisation date for the cluster it targets, which is the A7 window
in which `apply` creates the `kv` mount and the canary is written. The date is then forced:
`apply` refuses a cluster whose store holds the canary while the declaration records no date
for it, so the date commit cannot be skipped and the exemption cannot outlive A7. A recreated
lab cluster gets a fresh entry of its own, so it is not blocked by another cluster's date. The
snapshot Job has no exemption.

**After an etcd restore the mode that runs is the one in etcd, not Git.** The restored
StatefulSet carries whatever mode was live when the etcd snapshot was taken, usually `steady`,
whose marker guard holds. A snapshot taken during A7 or a rebuild carries `first-init` or
`restore`; either keeps the network listener closed. A `first-init` pod self-initialises the
fresh claim as soon as it starts, before anyone reads the mode. That store has no marker and
holds nothing of value, so the cold-rebuild runbook reads the live mode first (`kubectl get` of
the StatefulSet's mode annotation) and, if it is not `steady`, scales the StatefulSet to zero
and deletes the unmarked claim before it commits `restore`; a claim with a marker is never
deleted.

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

**Snapshot storage rights.** `openbao-snapshot-storage` holds a key that can write and read
the platform backup bucket's `openbao/` prefix and cannot delete; the bucket's lifecycle rule
expires objects after 30 days, so retention needs no delete right and a stolen key cannot
erase history. Not verified: that the object store issues a key scoped to one prefix without
delete; task 4.1 reads the key's rights back, and if the provider cannot scope it, the key
covers a bucket of its own.

### D11 Audit, backup and alerts

**Audit.** Two devices in server configuration, both with `log_raw` off: a file device on
`stdout`, which the OTel collector ships with every other pod log once the plan's stage 3 runs
it, and, until that collector ships it, a second file device at
`/openbao/audit/audit.log` on a claim of its own, `Retain`, rotated by size at 1 GiB by a
sidecar that sends SIGHUP to reopen the file. Before stage 3 the pod log alone would lose
records with the pod. A request fails only when no device records it (`AuditBroker.LogRequest`
fails only when no backend logged), so a full audit claim does not stop the store while stdout
records. For the same reason `vault_audit_log_request_failure` counts only requests that no
device logged; a failing file device alone is a log line, not a metric. So the sidecar also
checks that the file grows while the store serves requests, and exposes
`openbao_audit_file_stalled` (1 when the file has not grown for 5 minutes while
`vault_core_handle_request_count` rose); `OpenBaoAuditFileStalled` reads it. The second device is
removed in the revision that proves the collector ships the records (plan A14).

The claim requests 2 GiB and counts inside the 10 GiB the plan's decision 2 budgets for the
store and the local etcd snapshots, beside a Raft database of a few MiB. A node-local claim is
not bounded by its request: it shares the root filesystem, so the sidecar's rotation and
`PlatformRootDiskLow`, not the claim size, keep it in bounds.

**Backup.** OpenBao has no snapshot scheduler, so a CronJob runs `bao operator raft snapshot
save` every 6 h to the platform backup bucket, 30-day retention by lifecycle (D10). The
snapshot Job logs in through Kubernetes auth (D7) with a policy that also reads the canary.

**Loss mode, stated.** There is no off-region copy: neither this change nor the plan owns one.
A loss of the object store's region loses every snapshot. What remains is the escrowed seal
key and shares and a cold rebuild with an empty store, into which every escrowed value is
written again and every generated value is generated anew. A later change owns the off-region
copy (follow-up `openbao-offsite-snapshots`); until it lands, that loss is accepted.

**Drill.** A monthly Job starts its own OpenBao instance in its pod, listening on `127.0.0.1`
only, restores the latest snapshot into it with the cluster seal key and `-force`, reads the
canary, and proves that a wrong key leaves a second instance sealed. The restored store carries
the live store's Kubernetes auth configuration, so the drill logs in to its own instance with
its own projected token against the role `snapshot-drill`, whose `token_bound_cidrs` is
`127.0.0.1/32`: no caller on the live store's network listener comes from there. The
Kubernetes auth method, with no reviewer token set, reviews each login with the server pod's
own service-account token; the live server's account and the drill's account therefore both
hold `system:auth-delegator` (TokenReview create), and nothing else cluster-wide. Upstream,
`disable_local_ca_jwt` defaults to false, so the method uses the local token when no reviewer
token is set (`internal/builtin/credential/kubernetes/path_config.go`); task 3.7 proves it in
the drill pod.

**Alerts**, rules of the plan's `alerts` unit, each with its data source and an absent-series
companion, so a missing scrape fires instead of staying silent:

| Alert                          | Source                                                                                                       | Absent series                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `OpenBaoSealed`                | OpenBao's `vault_core_unsealed`, scraped from the `metrics_only` listener on port 8210                       | fires after 10 minutes       |
| `OpenBaoAuditFailing`          | `vault_audit_log_request_failure` and `vault_audit_log_response_failure`, same listener: every device failed | covered by `OpenBaoSealed`'s |
| `OpenBaoAuditFileStalled`      | the sidecar's `openbao_audit_file_stalled`, scraped from the server pod                                      | fires after 10 minutes       |
| `ExternalSecretSyncFailed`     | ESO's `externalsecret_status_condition{condition="Ready",status="False"}`                                    | fires after 10 minutes       |
| `OpenBaoSnapshotStale`         | kube-state-metrics `kube_cronjob_status_last_successful_time` of the snapshot CronJob, 12 h                  | fires                        |
| `OpenBaoRestoreDrillFailed`    | kube-state-metrics `kube_job_status_failed` of the drill's Jobs                                              | covered by the stale rule    |
| `OpenBaoRestoreDrillStale`     | the drill CronJob's last successful time, older than 35 days                                                 | fires                        |
| `OpenBaoConfigDrift`           | `kube_job_status_failed` of the drift CronJob's Jobs                                                         | covered by the stale rule    |
| `OpenBaoConfigDriftCheckStale` | the drift CronJob's last successful time, older than 2 h                                                     | fires                        |
| `PlatformRootDiskLow`          | node exporter `node_filesystem_avail_bytes{mountpoint="/"}` on m1plat1                                       | fires after 10 minutes       |

The `metrics_only` listener serves `sys/metrics` without a token and nothing else; the
NetworkPolicy admits Prometheus's pods to it alone. Each rule gets a fire-on-fault proof at the
plan's A14: the fault injected (seal, a failing audit path, a broken ExternalSecret, a
suspended CronJob, a failing drill, an out-of-band policy, a filled test filesystem, a dropped
scrape) and the alert observed firing.

### D12 Consumers

The new cluster starts with store-sourced Secrets: nothing migrates on it. Taken from the plan
and the changes it names, not invented here:

| Value                                                                                                 | Consumer                                                  | Path prefix                               | Written in   |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- | ------------ |
| Canary                                                                                                | `puni-secrets`                                            | `kv/platform/puni-secrets/`               | A7           |
| Registry CA key pair                                                                                  | `issuers`                                                 | `kv/platform/<namespace>/`                | A7           |
| `velero-credentials`, `velero-repo-credentials`                                                       | `velero`                                                  | `kv/platform/<namespace>/`                | A14          |
| `elastic-s3-credentials`, `alertmanager-puni`, `otel-server-ca`, `otel-client-trust`, nine `signal-*` | observability units                                       | `kv/platform/<namespace>/`                | A14          |
| MLflow backup credentials                                                                             | `mlflow`                                                  | `kv/platform/<namespace>/`                | A15          |
| Rancher's `bootstrapPassword`                                                                         | the Secret `bootstrap-secret` in `cattle-system`          | `kv/platform/cattle-system/`              | A27          |
| Harbor's Secrets and robot credentials                                                                | Harbor and its consumers                                  | as the Harbor change states               | its steps    |
| Staging app Secrets: runtime, pull and backup credentials                                             | staging namespaces                                        | `kv/tenants/puni/staging/<namespace>/`    | A18          |
| Production app Secrets                                                                                | production namespaces                                     | `kv/tenants/puni/production/<namespace>/` | A19, A20     |
| Database backup keys                                                                                  | `postgres`, `postgres-nonproduction`                      | their own prefixes (D5)                   | PG-A3, PG-A4 |
| Owner-role passwords                                                                                  | the app's namespace and the database namespace serving it | `<app prefix>/database-owner` (D5)        | PG-A3, PG-A4 |
| Harbor push robot, staging pins App key, status App key                                               | the CI cluster's `ci-<tenant>` namespace                  | `ci/<tenant>/`                            | CI-A3        |

Each namespace that reads gets its `secret-reader`, its SecretStore in `secret-sync` and its
role (D5) in the revision that adds its first ExternalSecret. The old cluster's Secrets,
`tool-secrets` and the host `.env` files are left as they are; they go with the old cluster
(plan stage 5).

### D13 Argo CD units

The plan's order table holds the store's three units; this change fills them under
`infra/argocd/units/` and adds no order of its own.

| Order | Unit               | Needs (plan)                                                  | Holds                                                                                               |
| ----: | ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
|     3 | `cert-manager`     | `namespaces`; from A7, the server CA Secret from the playbook | the plan's chart, and from A7's revision the store's CA Issuer and server Certificate (D8)          |
|     4 | `openbao`          | `storage`; `cert-manager`; the seal key from the playbook     | wrapper chart, Services, NetworkPolicy, the three Jobs, the declaration                             |
|     5 | `external-secrets` | `policy`                                                      | wrapper chart with its CRDs (`ServerSideApply=true`), `ignoreDifferences` on the injected CA bundle |
|     6 | `secret-sync`      | `openbao`, `external-secrets`                                 | every `secret-reader`, every SecretStore, every platform ExternalSecret                             |

All are in the `platform` project and are synced on command (plan rule 2.4(b)); none is
automated. `secret-sync` writes into app namespaces by design, as the plan's rule 2.4(a)
allows. An app's own ExternalSecrets are in its overlay, and its SecretStore is in
`secret-sync`. Argo CD's bundled health check for ExternalSecret makes `secret-sync` Healthy
only when every value has arrived. The chart's test hook is skipped (Argo CD skips Helm test
hooks), and the injector and CSI provider are off in its values.

**Health lags the sync.** Argo CD reads the ExternalSecret's status as ESO last wrote it, so
`secret-sync` reports Progressing until ESO has reconciled every new or changed
ExternalSecret and the application controller has refreshed, which is seconds per object with a
reachable store and never with a sealed one. The sync playbook waits for Healthy with its own
timeout, and test 3.3 waits the same way before it asserts a refusal.

The secret rules (task 1.3 to 1.6) run with the plan's `delivery` family inside `gate` and
refuse: a SecretStore outside `secret-sync`; an ExternalSecret outside `secret-sync` and the
staging and production overlays; a Vault-kind issuer anywhere; an ExternalSecret whose target is
a bootstrap Secret (D10) or whose path lies outside its namespace's prefix and grants (D5).
The plan's rule 2.4(c) already refuses a unit ordered at or below the unit that provides a
Secret it reads, which keeps every store-sourced Secret out of the store's own bring-up and,
with the Certificate in `cert-manager`, holds the store's own TLS Secret too (task 1.2).

**ESO's ClusterRole.** The controller's chart ClusterRole gets, lists, watches, creates,
updates, patches and deletes Secrets in every namespace, which writing a target Secret anywhere
needs. Its other default, `serviceaccounts/token` create for any account, is turned off
(`serviceAccountTokenCreate: false`): `secret-sync` renders, per reading namespace, a Role that
allows `create` on `serviceaccounts/token` for the resource name `secret-reader` alone, bound to
the controller's account. Whoever controls the controller's pod or account still reads every
Secret in the cluster and can mint a token for every `secret-reader`; the store's roles still
limit each token to its namespace's prefix. Mitigated by its namespace, Restricted Pod Security, its
NetworkPolicy and the platform selector, not removed (Risks).

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
Recovery is the plan's cold rebuild:

1. The replacement server is built, etcd is restored from its snapshot with `restore.yml`, and
   the bootstrap playbook applies the bootstrap set.
2. The operator reads the restored StatefulSet's mode (D8a). In `steady` the server finds no
   marker and does not start; in another mode the StatefulSet is scaled to zero and the
   unmarked claim, which a `first-init` pod may already have self-initialised, is deleted.
3. The operator commits `restore` and syncs `openbao`. The store listens behind a closed
   NetworkPolicy, and with no marker an `openbao` sync never reaches Healthy, which the runbook
   expects; `secret-sync` is therefore refused, as it should be.
4. Through `kubectl exec`, `bao operator init` (with a static seal it returns a root token and
   recovery shares), then `bao operator raft snapshot restore -force` of the latest snapshot
   with that token. `-force` is needed because the snapshot belongs to a store with other keys
   in its barrier keyring than the fresh init's.
5. The restore replaces the token store and the recovery configuration, so the init's root
   token and shares stop working; they are discarded, never escrowed. From then on the
   escrowed shares authorise a root token through the break-glass socket (D3), Auth0 or not.
   The operator reads `Initialized: true` and the canary, and writes the marker.
6. `steady` is committed again and `openbao` synced; only then is `secret-sync` or any
   consumer synced. The runbook then deletes one synced Secret and changes one value in the
   store, and requires the first to be recreated and the second updated, each with a fresh
   `refreshTime`, so ESO is proved to write again and not only to have kept old copies.

Up to 6 h of store writes can be lost: escrowed values are written again, and a generated value
(a Harbor robot, a database password) is rotated, which Harbor's runbook already does. The
plan's restore drill A6 runs before the store holds anything, so it never restores a cluster
that holds the store; the store's own drills are D11's.

**A failed first boot.** If self-init fails half-way or the first OIDC login fails in A7, the
store holds nothing worth keeping and self-init will not run twice. The runbook's
wipe-and-retry: scale the StatefulSet to zero, delete the Raft claim (its `Retain` policy kept
it), confirm the canary was never written, fix the cause, and sync `first-init` again. It is
refused once the declaration records an initialisation date.

**Mode and initialisation per cluster.** The declaration records, for each cluster that runs
the store, its committed mode and its initialisation date: the platform cluster's from A7, and
each rehearsal cluster's from its own first boot, so the rule that refuses `first-init` after
initialisation is per cluster.

## Phases

| Phase | Scope                                                                   | Gate                                                   |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| P0    | this design, chart archives, units, secret rules and planner, negatives | review, `gate`                                         |
| P1    | the plan's k3d lab on one tainted server                                | every proof in task group 3; the plan's receipt 2.7/A7 |
| P2    | A7 on m1plat1: canary and registry CA                                   | the plan's A1 to A6; P1; reach proofs; escrow restore  |
| P3    | consumers, at the plan's steps (D12)                                    | one receipt per consumer                               |
| P4    | three voters, then PKI, dynamic credentials, external tenants           | a separate change                                      |

## Owner inputs

| Input                         | Assumed                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Recovery shares               | three, threshold two, all in both escrow places, which splits nothing; seal keys kept 30 days after rotation |
| Operator login                | an Auth0 application in the existing tenant with MFA, its callback on the operator's own machine             |
| Break-glass                   | the legacy generate-root endpoints on an in-pod unix socket only (D3)                                        |
| Path scheme                   | `kv/platform/…`, `kv/tenants/<tenant>/<environment>/…`, and a mount `ci` for the CI cluster                  |
| Database grants               | `<app prefix>/database-owner` paths, read by the database namespace that serves the app's environment (D5)   |
| Store modes                   | `first-init`, `steady`, `restore`, with the marker refusal in `steady` and closed listeners otherwise        |
| Platform interface            | values through a tenant-scoped token, configuration through Git and `apply` (D6)                             |
| Off-region copy               | none; a region loss of the object store loses the snapshots (D11), owned by a later change                   |
| Operator subject              | the owner's Auth0 user id, held in the private fleet repository (D7)                                         |
| Bootstrap ciphertext location | the private fleet repository, because this one is public                                                     |

## Risks / Trade-offs

- The seal protects snapshots, not the server: root on m1plat1, or cluster-admin by any route
  (the node's kubeconfig, Rancher's administrator, a synced unit, `kubectl exec` into the store
  pod, which also reaches the break-glass socket), yields the seal key and the data.
- Auth0 is a second trust root: control of the tenant or the owner's account logs in as the
  store's administrator. Bound by subject, audience and MFA, and by m1plat1's pod
  subnet, which only the tailnet proxy and the platform's own pods use.
- m1plat1 is a single point for secret changes and holds the only Raft copy between snapshots;
  up to 6 h of writes can be lost (D14).
- Its outage is a correlated outage of the store, Harbor, Argo CD and the control plane:
  changes stop together, while running pods and cached images on other nodes continue.
- The ESO controller can mint tokens for every reader account and write every Secret in the
  cluster (D13); compromising it exposes the cluster's paths.
- Root on the CI server reads every `ci/<tenant>/` path (D7).
- Revocation covers store access, not synced copies: a revoked reader keeps the Secret it has
  until the value is rotated; an orphaned Secret stays until the runbook removes it (D4).
- A loss of the object store's region loses every snapshot; the escrowed material and a cold
  rebuild with an empty store remain (D11).
- Audit completeness is bounded by the log pipeline and its retention, and before stage 3 by
  the pod log and a 2 GiB claim on one node.
- Rotating the CI cluster's service-account signing key breaks its JWT mount silently; runbook
  entry and alert in task 4.4.
- Not yet verified upstream: ESO 2.15 against OpenBao 2.7 (upstream tested ESO 0.16.1 with
  OpenBao 2.2.0), that the `bao` client accepts a server name override over the tailnet, that
  the Tailscale operator's exposure passes TLS through unchanged, that Auth0's ID token
  carries `amr` with `mfa`, and that a restored ExternalSecret is rewritten after a cold
  rebuild. P1 proves each before anything depends on it.
