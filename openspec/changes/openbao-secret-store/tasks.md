## Delivery boundary

Ordered TDD slices. Read [the design](design.md), [requirements](specs/secret-store/spec.md) and
the plan's decisions 3, 5, 9 and 12 in [`separate-node-roles`](../separate-node-roles/design.md)
first, and the existing callers and tests of `tool-fleet` before changing a check. The secret
rules join the plan's `delivery` family (its slice 2.4) and run inside `gate`; they need that
slice's Application graph and land after it. No slice installs anything on a live cluster;
P2 onward are attended steps with receipts in [verify](verify.md). Every new check gets a
production-path negative: remove the check or break its dependency as the named fault, watch
the named test fail, then add the adjacent `Proof:` comment.

## 1. P0 sources and secret rules

- [ ] 1.1 Lock `openbao-0.30.7.tgz` and the ESO v2.15.0 chart under `infra/platform/charts/`
      and pin both, with image digests, in `infra/versions/toolchain.json`, one lock entry per
      version (plan R21). Test: the chart-binding check fails for an unpinned or
      digest-mismatched archive (fault: skip the digest comparison).
- [ ] 1.2 Units `openbao`, `external-secrets` and `secret-sync` under `infra/argocd/units/`
      with their Application files at orders 4, 5 and 6 and the needs of design D13, in the
      `platform` project, synced on command. `external-secrets` uses `ServerSideApply=true`
      and `ignoreDifferences` on the injected CA bundle. Test: the plan's rule 2.4(c) passes
      the three files and refuses `secret-sync` without its need on `openbao` (fault: drop
      the need comparison).
- [ ] 1.3 Refuse cluster-scoped ESO kinds, `PushSecret`, generators, the injector and the CSI
      provider anywhere under `infra/argocd`; refuse a `SecretStore` outside `secret-sync`, an
      `ExternalSecret` outside `secret-sync` and the staging and production overlays, and a
      Vault-kind issuer. Tests: one refusal fixture per kind and one per misplaced object
      (fault: scan `secret-sync` only).
- [ ] 1.4 Refuse an `ExternalSecret` whose store is in another namespace, whose
      `deletionPolicy` or `creationPolicy` differ from Retain and Orphan, whose remote key lies
      outside its namespace's prefix and declared grants, or whose namespace has no
      `secret-reader`, `SecretStore` or declared role; refuse one that targets a bootstrap
      Secret of design D10. Tests: one fixture each, the `cattle-system` reading the canary and
      the `openbao-seal-key` target among them (fault: compare the path's first segment only).
- [ ] 1.5 Image allow-list of design D1 over the `puni.dev/needs` closure of `secret-sync`,
      computed from the Application files. Ansible refuses a containerd mirror for an upstream
      host without fallback. Tests: an OpenBao image from Harbor, a tag-only image, an
      unpinned Job image, a new need on a unit with a tag-only image, and a mirror entry, each
      failing naming the image or host (fault: a hard-coded unit list).
- [ ] 1.6 Render test of the three units: every pod template selects `platform-services` and
      tolerates `CriticalAddonsOnly=true:NoSchedule`; the StatefulSet's claim retention is
      `Retain`; no Ingress, IngressRoute or LoadBalancer names the store's Services; the
      `puni-secrets` NetworkPolicy admits only the callers of design D8, with the CI server's
      address read from the inventory; the store mode is one of three, and `first-init` is
      refused once the declaration records an initialisation. Tests: the certificate
      controller without the toleration (fault: check Deployments the chart names explicitly
      only); an Ingress to the store (fault: check Services only); a NetworkPolicy peer wider
      than the CI server's address (fault: accept any private address); `first-init` after
      initialisation (fault: ignore the date).
- [ ] 1.7 Measure the store, ESO and the drill instance in P1 (task 3.15) and replace the
      plan's assumed 1,024 MiB row in its design decision 2 by a commit; the platform node's
      placement check admits the sum. Test: the placement check refuses the plan with the
      measured row raised above the margin (fault: read the assumed row).
- [ ] 1.8 Write `docs/infra/secrets.md` (operator runbook: escrow, key retention, unseal,
      rotation, store modes, restore, cold rebuild, CI JWT key rotation) and link it from
      `docs/infra/platform.md#secrets`.

## 2. Store configuration

- [ ] 2.1 `tool-fleet secret-store plan|apply` (design D8a): a pure planner from the
      declaration, the `namespaces` unit's labels and a live read to a difference; dry-run by
      default; adopts the self-init objects; allow-lists OpenBao built-ins; refuses unknown live
      mounts, auth methods, roles and policies. Tests: `plans no change for an identical store`,
      `adopts the self-init objects without a refusal`, `refuses an undeclared policy`,
      `refuses an undeclared auth method`, `dry-run writes nothing` (fault: apply on plan).
- [ ] 2.2 Render OpenBao values: one Raft voter, the selector and toleration of design D2,
      static seal from `file://`, self-init rendered from the declaration, the three modes with
      the `steady` init container that refuses an absent Raft database, stdout audit device,
      Restricted Pod Security. Tests: a self-init request outside the allow-list and an audit
      device declared through the API refused; in the lab, a `steady` pod on an empty
      directory never Ready (fault: drop the init container and watch it listen uninitialised).
- [ ] 2.3 Server certificate (`openbao.puni.internal` and the in-cluster Service names, 90
      days) from the CA Issuer of the `openbao` unit; the NodePort with
      `externalTrafficPolicy: Local`; the tailnet exposure of the ClusterIP Service. Test: the
      render check refuses a certificate missing a required name (fault: check the first name
      only).
- [ ] 2.4 Declare the Kubernetes auth mount and one role per reading namespace with its policy
      (design D5, D6) and the database grants. Tests: the planner refuses a role with two
      namespaces, one without the bound account name, a policy path the labels do not give, a
      wildcard above a prefix, and a cross-environment or non-owner-role grant (fault: trust the
      role name for the namespace).
- [ ] 2.5 Declare the CI cluster's JWT mount with its pinned key, audience `openbao`, bound
      name and namespace claims, 10-minute tokens and the `ci` mount's policies. Test: the
      planner refuses a mount without pinned keys or bound claims (fault: check keys only).
- [ ] 2.6 Declare Job identities (snapshot, drill canary read, drift read/list) and their
      policies. Test: the planner refuses a Job policy with write capability on `sys/` other
      than the snapshot read (fault: check `create` only).
- [ ] 2.7 `tool-fleet secret-store generate`: a value from a declared password policy written
      with check-and-set 0 to a declared path. Tests: refuses an existing path and leaves it
      unchanged (fault: write without check-and-set); refuses an undeclared path.
- [ ] 2.8 Snapshot CronJob (6 h, both buckets, 30 days), monthly drill Job, drift CronJob, each
      with the selector and toleration; the snapshot Job and `apply` refuse when the canary is
      absent. Alert rules for the `alerts` unit: `OpenBaoSealed`, `OpenBaoAuditFailing`,
      `ExternalSecretSyncFailed`, `OpenBaoSnapshotStale`, `OpenBaoRestoreDrillFailed`,
      `OpenBaoRestoreDrillStale`, `OpenBaoConfigDrift`, `PlatformRootDiskLow`. Tests: a snapshot
      against a store without the canary uploads nothing (fault: check after upload); the alert
      rule check fails for each rule with a missing expression.

## 3. P1 rehearsal proofs

In the plan's k3d lab profile (its slice 2.7), on one server that carries `platform-services`
and the taint, with values made for the rehearsal. The plan's receipt 2.7/A7 is owed there too.

- [ ] 3.1 Pod kill auto-unseals with no human; every store pod runs on the tainted server.
- [ ] 3.2 Store scaled to zero: a consumer pod restarts with its Secret. This also proves ESO
      keeps the Secret on refresh failure.
- [ ] 3.3 Store scaled to zero: the sync playbook refuses a unit that needs `secret-sync`,
      naming it, and syncs `eck-operator`.
- [ ] 3.4 Cross-environment read and a same-namespace non-reader login are denied and audited.
- [ ] 3.5 `ClusterSecretStore` refused by the secret rules and absent as a CRD.
- [ ] 3.6 Wrong-key, wrong-audience and wrong-account JWT logins denied.
- [ ] 3.7 Restore succeeds with the cluster seal key and stays sealed with a wrong key.
- [ ] 3.8 First operator OIDC login, `sys/rotate/recovery/init`, then `generate-root` with the
      recovery shares while Auth0 is unreachable.
- [ ] 3.9 Cold rebuild: etcd restored to a fresh lab server, the `steady` store refusing its
      empty directory, `restore` committed, `bao operator init`, snapshot restore, init root
      token rejected (403), `steady` again; then orders 4 to 7 Synced and Healthy with no
      manual Secret and the escrowed shares authorising `generate-root`, Auth0 unreachable
      throughout.
- [ ] 3.10 Certificate renewal: whether OpenBao serves the renewed leaf without a restart; if
      not, the controlled restart on renewal, proved.
- [ ] 3.11 ESO v2.15.0 against OpenBao v2.7.2 syncs, refreshes and reports errors.
- [ ] 3.12 An out-of-band policy raises `OpenBaoConfigDrift` and `secret-store apply` refuses.
- [ ] 3.13 The operator's `bao` client reaches the store through the Tailscale operator's
      exposure and verifies its certificate with the server name `openbao.puni.internal`.
- [ ] 3.14 The paired probe of design D8 against the NodePort, with a second lab cluster in the
      role of the CI cluster.
- [ ] 3.15 Memory of the store, ESO and the drill instance under the rehearsal's load, for
      task 1.7.

## 4. Attended activation, at the plan's steps

- [ ] 4.1 Before the plan's A7: the four bootstrap Secrets of design D10 generated, encrypted
      into the fleet repository's directory and escrowed, with the plan's A2. Receipt:
      "escrowed" per Secret, no value.
- [ ] 4.2 P2, the plan's A7 on m1plat1, in `first-init` mode: sync `openbao`; the owner signs
      its tailnet device; first OIDC login; recovery shares generated and escrowed; `apply` the
      declaration; canary and registry CA key pair written; sync `external-secrets`, then
      `secret-sync` and `issuers` (the plan's commands). Then commit `steady` with the
      initialisation date and sync `openbao`. Repeat 3.1, 3.4 and 3.6 to 3.8 live; the paired
      probe of design D8; the attended escrow restore on a second machine; the first snapshot
      in both buckets. The off-region copy runs before the first value without an escrow copy.
      Receipt: the plan's A7 receipt and these, no value.
- [ ] 4.3 P3: each consumer of design D12 at its plan step, one receipt per consumer: its
      ExternalSecret Ready and its reader refused a path of another environment.
- [ ] 4.4 The CI cluster's JWT mount, before the CI change's CI-A3: the pinned key read from
      that cluster; runbook entry and alert for its service-account key rotation.
