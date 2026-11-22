## Delivery boundary

Ordered TDD slices. Read [the design](design.md), [requirements](specs/secret-store/spec.md) and
the plan's decisions 3, 5, 9, 12 and 13 in [`separate-node-roles`](../separate-node-roles/design.md)
first, and the existing callers and tests of `tool-fleet` before changing a check. The secret
rules join the plan's `delivery` family (its slice 2.4) and run inside `gate`; they need that
slice's Application graph and land after it. No slice installs anything on a live cluster;
P2 onward are attended steps with receipts in [verify](verify.md). Every new check gets a
production-path negative with a fault of its own: remove the check or break its dependency as
the named fault, watch the named test fail, then add the adjacent `Proof:` comment.

## 1. P0 sources and secret rules

- [ ] 1.1 Lock `openbao-0.30.8.tgz` (OpenBao v2.7.3) and the ESO v2.15.0 chart under
      `infra/platform/charts/` and pin both, with image digests, in
      `infra/versions/toolchain.json`, one lock entry per version (plan R21). Test: the
      chart-binding check fails for an unpinned or digest-mismatched archive (fault: skip the
      digest comparison).
- [ ] 1.2 Units `openbao`, `external-secrets` and `secret-sync` under `infra/argocd/units/`
      with their Application files at orders 4, 5 and 6 and the needs of design D13, in the
      `platform` project, synced on command; the store's CA Issuer and Certificate in the
      `cert-manager` unit, in a resource wave after the chart, with
      `SkipDryRunOnMissingResource=true`. `external-secrets` uses `ServerSideApply=true` and
      `ignoreDifferences` on the injected CA bundle. Tests: the plan's rule 2.4(c) passes the
      files and refuses `secret-sync` without its need on `openbao` (fault: drop the need
      comparison); it refuses the Certificate placed in `openbao`, because `openbao` reads its
      Secret at the same order (fault: refuse a reader ordered below its provider only, not one at its order).
- [ ] 1.3 Refuse cluster-scoped ESO kinds, `PushSecret`, every generator kind, the injector and
      the CSI provider anywhere under `infra/argocd`; refuse ESO values with
      `processClusterGenerator`, `crds.createClusterGenerator`, `genericTargets.enabled` or
      `rbac.serviceAccountTokenCreate` other than design D5 and D13 set; refuse a `SecretStore`
      outside `secret-sync`, an `ExternalSecret` outside `secret-sync` and the staging and
      production overlays, and a Vault-kind issuer. Tests: one refusal fixture per kind (fault:
      scan `secret-sync` only); one per chart value (fault: read the keys at the wrapper chart's top level instead of under its `external-secrets` dependency key, so all four read as unset and pass); one per misplaced object (fault: accept any unit of the
      `platform` project).
- [ ] 1.4 Refuse an `ExternalSecret` whose store is in another namespace, whose
      `deletionPolicy` or `creationPolicy` differ from Retain and Orphan, whose remote key lies
      outside its namespace's prefix and declared grants, or whose namespace has no
      `secret-reader`, `SecretStore`, token Role or declared role; refuse one that targets a
      bootstrap Secret of design D10. Tests: the `cattle-system` reading the canary (fault:
      compare the path's first segment only); the `openbao-seal-key` target (fault: read the
      bootstrap list from the unit instead of design D10's fixed set); a namespace without a
      role (fault: accept a role of another namespace); the policies (fault: check
      `creationPolicy` only).
- [ ] 1.5 Image allow-list of design D1: the `puni.dev/needs` closure of `secret-sync`, computed
      from the Application files, plus `argocd`, `tailscale-operator` and the proxy image of its
      values. Ansible refuses a containerd mirror for an upstream host without fallback, and a
      check refuses a registry admission policy that does not exempt the namespaces in scope.
      Tests: an OpenBao image from Harbor (fault: check the host suffix only); a tag-only
      image (fault: accept a tag that matches the pinned one); an unpinned Job image (fault:
      read Deployments and StatefulSets only); a new need on a unit with a tag-only image
      (fault: a hard-coded unit list); a proxy image from Harbor (fault: leave out the explicit
      units); a mirror entry (fault: accept any mirror with an `endpoint` list); an admission
      policy without the exemption (fault: check one namespace of the scope).
- [ ] 1.6 Render test of the three units and the `cert-manager` objects: every pod template
      selects `platform-services` and tolerates `CriticalAddonsOnly=true:NoSchedule`; the
      StatefulSet's claim retention is `Retain`; no Ingress, IngressRoute or LoadBalancer names
      the store's Services; the NodePort Service is `openbao-private` on 30820 with
      `externalTrafficPolicy: Local`; the `puni-secrets` NetworkPolicy admits only the callers of
      design D8, with the CI server's address read from the inventory, and admits nothing in
      `first-init` and `restore`, which also render no NodePort and no tailnet exposure; no TCP
      listener sets `disable_unauthed_generate_root_endpoints = false` and the unix socket does;
      the TCP listener sets `tls_auto_reload`; the metrics listener is `metrics_only`; the store
      mode is one of three and `first-init` is refused for a cluster whose declaration records an
      initialisation; the `policy` unit's admission rule refuses a pod running as
      `secret-reader`. Tests, each with its fault: the certificate controller without the
      toleration (fault: check Deployments the chart names explicitly only); an Ingress to the
      store (fault: check Services only); a NetworkPolicy peer wider than the CI server's address
      (fault: accept any private address); a NodePort rendered in `restore` (fault: check
      `steady` only); generate-root enabled on the TCP listener (fault: check the first listener
      only); `first-init` after initialisation (fault: ignore the date); `first-init` refused on
      a rehearsal cluster with no date of its own (fault: read the platform cluster's date for
      every cluster); a pod as `secret-reader` (fault: read the deprecated `spec.serviceAccount` field instead of `spec.serviceAccountName`, which the fixture sets).
- [ ] 1.7 Measure the store, ESO and the drill instance in P1 (task 3.15) and replace the
      plan's assumed 1,024 MiB row in its design decision 2 by a commit; the platform node's
      placement check admits the sum. Test: the placement check refuses the plan with the
      measured row raised above the margin (fault: read the assumed row).
- [ ] 1.8 Write `docs/infra/secrets.md` (operator runbook: escrow, key retention, unseal,
      rotation, store modes and the marker, break-glass through the socket, restore, cold
      rebuild with the live-mode read, wipe-and-retry of a failed first boot, orphaned Secret
      removal, SIGHUP reload, CI JWT key rotation) and link it from
      `docs/infra/platform.md#secrets`. `tool-fleet:health` lists orphaned synced Secrets. Test: a Secret with ESO's managed label that no ExternalSecret names as `spec.target.name` is listed, and one named by an ExternalSecret of another name is not (fault: match the Secret's name against ExternalSecret names instead of their `spec.target.name`).
- [ ] 1.9 `tool-fleet:health` reads the sidecar's `openbao_audit_file_stalled` gauge through the API server's pod proxy, before the `alerts` unit runs. Tests: a gauge at 1 is reported stalled (fault: read the gauge's `# HELP` line instead of its sample); an absent gauge is reported unknown, not healthy (fault: default an absent gauge to 0).

## 2. Store configuration

- [ ] 2.1 `tool-fleet secret-store plan|apply` (design D8a): a pure planner from the
      declaration, the `namespaces` unit's labels and a live read to a difference; dry-run by
      default; adopts the self-init objects; allow-lists OpenBao built-ins; refuses unknown live
      mounts, auth methods, roles and policies; refuses without the canary once the declaration records the cluster's initialisation date, and refuses a store holding the canary while no date is recorded for it. Tests: `plans no change for an identical store`,
      `adopts the self-init objects without a refusal`, `refuses an undeclared policy` (fault:
      compare declared names only), `refuses an undeclared auth method` (fault: list mounts
      only), `dry-run writes nothing` (fault: apply on plan), `applies before the initialisation date`, `refuses without a canary after it` (fault: remove the canary read from `apply`) and `refuses a canary without a recorded date` (fault: remove the date check).
- [ ] 2.2 Render OpenBao values: one Raft voter, the selector and toleration of design D2,
      static seal from `file://`, self-init rendered from the declaration, the three modes with
      the `steady` init container that refuses an absent marker, the three listeners of design
      D3, both audit devices of design D11, Restricted Pod Security. Tests: a self-init request
      outside the allow-list and an audit device declared through the API refused (fault: skip
      the allow-list). In the lab: a `steady` pod on an empty claim, whose listener refuses
      connections and whose `sys/init` is unreachable from ESO's namespace and from the tailnet
      (fault: drop the init container and watch it listen uninitialised and answer `sys/init`);
      a `steady` pod with Raft files but no marker refused the same way (fault: test for
      `raft/raft.db` instead of the marker); a `restore` pod, uninitialised, refusing ESO's
      controller while `kubectl exec` reaches it (fault: render the `steady` NetworkPolicy);
      `sys/generate-root/attempt` without a token refused on the Service and answered on the
      socket (fault: enable the endpoints on the TCP listener).
- [ ] 2.3 Server certificate (`openbao.puni.internal` and the in-cluster Service names, 90
      days) from the CA Issuer in `cert-manager`; the NodePort `openbao-private`; the tailnet
      exposure of the ClusterIP Service; the CI cluster's CoreDNS hosts entry and CA ConfigMap
      (CI change). Test: the render check refuses a certificate missing a required name (fault:
      check the first name only).
- [ ] 2.4 Declare the Kubernetes auth mount and one role per reading namespace with its policy
      (design D5, D6), audience and bound CIDRs at the cluster's recorded node pod subnet, the per-namespace token Roles of `secret-sync`,
      and the database grants. Tests: the planner refuses a role with two namespaces (fault:
      trust the role name for the namespace); one without the bound account name (fault: check
      namespaces only); one without audience or bound CIDRs (fault: check bound CIDRs only); one bound to the cluster's whole pod CIDR (fault: accept any range inside the pod CIDR); a recorded subnet that differs from the live server's `spec.podCIDR` (fault: compare with the recorded subnet of the cluster's first node); a
      policy path the labels do not give (fault: read the tenant label only); a wildcard above a
      prefix (fault: match a trailing `*` only); a grant to a path not ending in
      `database-owner` (fault: check the tenant only); a grant to an environment the database
      namespace does not serve (fault: compare with the database namespace's own label).
- [ ] 2.5 Declare the CI cluster's JWT mount with its pinned key, audience `openbao`, bound
      name and namespace claims, 10-minute tokens, bound CIDR at the CI server's address, and the
      `ci` mount's policies. Tests: the planner refuses a mount without pinned keys (fault:
      accept a JWKS URL) or without bound claims (fault: check keys only), and a CEL role (fault:
      list standard roles only).
- [ ] 2.6 Declare Job identities (snapshot, drill, drift), each with a canary read, and the
      operator OIDC role bound by subject, audience and the `amr` claim, its subject read from the private fleet checkout; the drill role bound to `127.0.0.1/32`; `system:auth-delegator` for the server's and the drill's accounts only. Tests: the planner
      refuses a Job policy with write capability on `sys/` other than the snapshot read (fault:
      check `create` only); an OIDC role without `bound_subject` (fault: check audiences only)
      or without the MFA claim (fault: check `bound_subject` only); a literal `bound_subject` in `store.json` (fault: accept any non-empty subject); a missing private subject value (fault: default to an empty subject).
- [ ] 2.7 `tool-fleet secret-store generate`: a value from a declared password policy written
      with check-and-set 0 to a declared path. Tests: refuses an existing path and leaves it
      unchanged (fault: write without check-and-set); refuses an undeclared path (fault: accept
      a path under any declared prefix).
- [ ] 2.8 Snapshot CronJob (6 h, 30 days by bucket lifecycle), monthly drill Job, drift CronJob,
      each with the selector and toleration; the snapshot Job refuses when the canary is
      absent; the snapshot key has no delete right. The audit sidecar's rotation and `openbao_audit_file_stalled` metric. Alert rules for the `alerts` unit, with the sources and absent-series companions of design D11. Tests: a snapshot against a store
      without the canary uploads nothing (fault: check after upload); the alert-rule check fails
      for a rule without its absent companion (fault: check expressions only) and for a missing
      `OpenBaoConfigDriftCheckStale` (fault: check the list against the rules present); the sidecar reports a stall when the file stops growing while requests rise (fault: compare the file size with itself).
- [ ] 2.9 Tenant writer role `tenant-writer-<tenant>` (design D6), declared only once the
      adapter exists. Policy: create and update on `kv/data/tenants/<tenant>/*` alone. Tests: the planner refuses a writer policy outside its tenant prefix or on `sys/` (fault: check the tenant segment only), and one with read, list or a metadata path (fault: check paths only).

## 3. P1 rehearsal proofs

In the plan's k3d lab profile (its slice 2.7), on one server that carries `platform-services`
and the taint, with values made for the rehearsal. The plan's receipt 2.7/A7 is owed there too.

- [ ] 3.1 Pod kill auto-unseals with no human; every store pod runs on the tainted server.
- [ ] 3.2 Store scaled to zero: annotate an ExternalSecret with `force-sync=<now>` and observe
      Ready False with reason `SecretSyncedError`; its Secret's data and `resourceVersion` are
      unchanged; then a consumer pod restarts with it.
- [ ] 3.3 Store scaled to zero: once `secret-sync` reports not Healthy (waited for as design D13
      states), the sync playbook refuses a unit that needs it, naming it, and syncs
      `eck-operator`.
- [ ] 3.4 Cross-environment read and a same-namespace non-reader login are denied and audited;
      a platform reader token through the NodePort is denied by its bound CIDRs.
- [ ] 3.5 `ClusterSecretStore` refused by the secret rules and absent as a CRD; no
      generator CRD installed.
- [ ] 3.6 Wrong-key, wrong-audience and wrong-account JWT logins denied; a valid CI token from
      inside the platform cluster denied by the bound CIDR.
- [ ] 3.7 The drill restores with the cluster seal key and `-force` into its own instance on `127.0.0.1`, logs in as `snapshot-drill` with its own token reviewed through the local token, reads the canary, and a second instance stays sealed with a wrong key; the same drill token is refused on the live store's listener.
- [ ] 3.8 First operator OIDC login with MFA, an Auth0 token without `amr` `mfa` refused,
      `sys/rotate/recovery/init`; then, with Auth0 unreachable, by `kubectl exec` with `BAO_ADDR=unix:///openbao/run/break-glass.sock`: `bao write -f sys/generate-root/attempt`, `bao write sys/generate-root/update key=… nonce=…` per share and `bao write sys/decode-token encoded_token=… otp=…`, the decoded token used once and revoked; the same attempt on the Service refused.
- [ ] 3.9 Cold rebuild onto a replacement lab server under a new node name: etcd restored; the store's pod Pending on the fenced node's claims; the live mode read, the StatefulSet scaled to zero and the stale claims and volumes deleted; the `steady`
      store refusing its empty claim; `restore` committed, `openbao` not Healthy as expected,
      `bao operator init` and `snapshot restore -force` by `kubectl exec`; init root token
      rejected (403); the marker written; an OIDC login refused by the old subnet binding; the new `spec.podCIDR` committed and `apply` run under a break-glass root token through the socket; only then `steady`; then orders 4 to 7 Synced and Healthy
      with no manual Secret; one synced Secret deleted and one value changed, both written again
      with a fresh `refreshTime`; a root token from the escrowed shares through the socket;
      Auth0 unreachable throughout, then one OIDC login through the proxy admitted. Once more from an etcd snapshot taken in `first-init`.
- [ ] 3.10 Certificate renewal: the renewed leaf served through `tls_auto_reload` without a
      restart; SIGHUP as the fallback, proved.
- [ ] 3.11 ESO v2.15.0 against OpenBao v2.7.3 syncs, refreshes and reports errors.
- [ ] 3.12 An out-of-band policy raises `OpenBaoConfigDrift` and `secret-store apply` refuses.
- [ ] 3.13 The operator's `bao` client reaches the store through the Tailscale operator's
      exposure and verifies its certificate with the server name `openbao.puni.internal`.
- [ ] 3.14 The layered probe of design D8 against the NodePort, with a second lab cluster in
      the role of the CI cluster and a lab agent as the enrolled node: every row, with both
      layers, with the host rule removed and with the NetworkPolicy removed.
- [ ] 3.15 Memory of the store, ESO and the drill instance under the rehearsal's load, for
      task 1.7.
- [ ] 3.16 A full audit claim: requests still complete with the stdout device recording, `vault_audit_log_request_failure` stays flat, and `OpenBaoAuditFileStalled` is observed firing.
- [ ] 3.17 Wipe-and-retry of a failed first boot, as the runbook states.

## 4. Attended activation, at the plan's steps

- [ ] 4.1 Before the plan's A7: the four bootstrap Secrets of design D10 generated, encrypted
      into the fleet repository's directory and escrowed, with the plan's A2; the snapshot key
      made without delete and its rights read back (prefix scoping is unverified for the provider; if it cannot scope, a bucket of its own), the bucket's 30-day lifecycle set. Receipt: "escrowed" per Secret,
      no value.
- [ ] 4.2 P2, the plan's A7 on m1plat1. Run the playbook with the bootstrap set; sync `cert-manager` with the store's Issuer and Certificate (the plan's A7 as amended); in `first-init`: sync `openbao`; self-init; through `kubectl exec`,
      `Initialized: true` read and the marker written. Commit `steady` (no initialisation
      date yet) and sync `openbao`; the owner signs its tailnet device; first OIDC login;
      recovery shares generated and escrowed; `apply` the declaration; canary and registry CA
      key pair written; commit the initialisation date for the platform cluster, which `apply` then requires; sync `external-secrets`, then
      `secret-sync` and `issuers` (the plan's commands). Repeat 3.1, 3.4 and 3.6 to 3.8 live;
      the layered probe of design D8; the attended escrow restore on a second machine; the
      first snapshot. The enrolled-node rows of the probe wait for 4.6.
      Receipt: the plan's A7 receipt and these, `tool-fleet:health`'s audit-file reading included, no value. Every plan step after A7 and before A14 carries the same reading in its receipt.
- [ ] 4.3 P3: each consumer of design D12 at its plan step, one receipt per consumer: its
      ExternalSecret Ready and its reader refused a path of another environment.
- [ ] 4.4 The CI cluster's JWT mount, before the CI change's CI-A3: the pinned key read from that cluster; runbook entry and alert for its service-account key rotation. Precondition owed by the CI change, which has no task for it yet: its CoreDNS hosts entry for `openbao.puni.internal` and the CA ConfigMap of its SecretStores (design D8).
- [ ] 4.5 At the plan's A14: each alert of design D11 fired by its fault, the absent-series
      companions by a dropped scrape; then the second audit device removed once the collector's
      records are read back in Elasticsearch.
- [ ] 4.6 After the plan's A13 joins the observability server: the enrolled-node and pod rows of
      the layered probe of design D8, live, with each layer removed in turn.
