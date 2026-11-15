## Delivery boundary

Ordered TDD slices. Read [the design](design.md) and [requirements](specs/secret-store/spec.md)
first, and the existing callers and tests of `tool-fleet` before changing a check. No slice
installs anything on a live cluster; phases P2 onward are attended operations with their own
receipts in [verify](verify.md). Every new check gets a production-path negative: remove the
check, watch the named test fail, then add the adjacent `Proof:` comment.

## 1. P0 sources and fleet-check rules

- [ ] 1.1 Vendor `openbao-0.30.7.tgz` and the ESO v2.15.0 chart into `infra/platform/charts/`
      and pin both, with image digests, in `infra/versions/toolchain.json`. Test: the existing
      chart-binding check fails for an unpinned or digest-mismatched archive.
- [ ] 1.2 Add `secret-store` (platform clusters), `secret-operator` and `secret-sync` (all
      clusters) with the `dependsOn` of design D13; `secret-sync` has `wait: false` and
      `healthChecks`. Tests `refuses a dependsOn naming secret-store` and `refuses ESO resources in secret-operator`; negative fixture per overlay.
- [ ] 1.3 Refuse cluster-scoped ESO kinds, `PushSecret`, generators, injector and CSI anywhere.
      Tests: one refusal fixture per kind.
- [ ] 1.4 Refuse an `ExternalSecret` whose store is in another namespace, or whose
      `deletionPolicy`/`creationPolicy` differ from Retain/Orphan. Tests: one fixture each.
- [ ] 1.5 Add `source: openbao` to the `externally-provided.json` schema; require a
      same-namespace `ExternalSecret` and `SecretStore`; refuse undeclared targets. Tests:
      `declared but not synced`, `synced but not declared`.
- [ ] 1.6 Refuse `source: openbao` for the bootstrap set and for any Secret the derived
      consumption graph attributes to a stage at or before `secret-store`; refuse a
      `SecretStore`, `ExternalSecret` or Vault issuer in any stage but `secret-sync`. Tests:
      `velero-repo-credentials` and `otel-server-ca` fixtures fail naming the bootstrap entry and
      the consuming stage; an `ExternalSecret` under `observability` fails naming the stage.
- [ ] 1.7 Fleet repository: `clusters/<cluster-id>/bootstrap-secrets/` Kustomization with SOPS
      files for the platform's D10 set; move Velero, Alertmanager and platform CA signing entries
      from `operator` to it. Extend the local rehearsal commit with disposable values for the same
      set. Test: fleet-check refuses a plaintext value there.
- [ ] 1.8 Measure OpenBao, ESO and drill memory requests in P1 and add them to h4claw's
      coexistence budget; the observability preflight refuses an over-budget plan.
- [ ] 1.9 Write `docs/infra/secrets.md` (operator runbook: escrow, key retention, unseal,
      rotation, restore, cold rebuild, workers JWT key rotation) and link it from
      `docs/infra/platform.md#secrets`.

## 2. Store configuration

- [ ] 2.1 Implement `secret-store plan|apply` (design D8a): pure planner from the Git
      declaration and a live read to a diff; dry-run default; adopts the self-init objects;
      allow-lists OpenBao built-ins; refuses unknown live mounts, auth methods, roles and
      policies. Extra test: `adopts the self-init objects without a refusal`. Tests: `plans no change for an identical store`,
      `refuses an undeclared policy`, `refuses an undeclared auth method`, `dry-run writes nothing`.
- [ ] 2.2 Render OpenBao values: one Raft replica, node selector
      `puni.dev/capability-secret-store`, static seal from `file://`, self-init rendered from the
      2.1 declaration (operator OIDC mount, role, admin policy), a restore mode with self-init
      disabled, stdout audit device, Restricted Pod Security, NetworkPolicy
      of design D8. Tests: render check refuses self-init requests outside the allow-list and an
      audit device declared through the API.
- [ ] 2.3 Server certificate (`openbao.puni.internal` plus in-cluster service names, 90 days)
      from a SOPS-rooted CA Issuer; NodePort with `externalTrafficPolicy: Local`. Test: render
      check refuses a certificate missing a required SAN.
- [ ] 2.4 Declare, through 2.1, the Kubernetes auth mount with
      `bound_service_account_names=secret-reader` and the templated reader policy. Test: planner
      refuses a reader role without the bound account name.
- [ ] 2.5 Declare one JWT mount per workers cluster with pinned validation keys, audience
      `openbao`, bound account-name claim and 10-minute tokens. Test: planner refuses a mount
      without pinned keys or bound claims.
- [ ] 2.6 Declare Job identities (snapshot, drill canary read, drift read/list) and their
      policies. Test: planner refuses a Job policy with write capability on `sys/`.
- [ ] 2.7 Snapshot CronJob (6 h, two buckets, 30 days), monthly restore-drill Job, drift
      CronJob.
- [ ] 2.8 Alerts `OpenBaoSealed`, `OpenBaoAuditFailing`, `ExternalSecretSyncFailed`,
      `OpenBaoSnapshotStale`, `OpenBaoRestoreDrillFailed`, `OpenBaoRestoreDrillStale`,
      `OpenBaoConfigDrift`. Test: alert rule check fails for each rule with a missing expression.

## 3. P1 k3d rehearsal proofs

- [ ] 3.1 Pod kill auto-unseals with no human.
- [ ] 3.2 Store scaled to zero: consumer pod restarts with its Secret, alert fires. This also
      proves ESO keeps the Secret on refresh failure.
- [ ] 3.3 Store scaled to zero: a commit to `observability` applies and reports Ready.
- [ ] 3.4 Cross-namespace read and a same-namespace non-reader login are denied and audited.
- [ ] 3.5 `ClusterSecretStore` rejected by the fleet check and absent as a CRD.
- [ ] 3.6 Wrong-key, wrong-audience and wrong-account JWT logins denied.
- [ ] 3.7 Restore succeeds with the cluster seal key and stays sealed with a wrong key.
- [ ] 3.8 First operator OIDC login, `sys/rotate/recovery/init`, then `generate-root` with
      recovery keys while Auth0 is unreachable.
- [ ] 3.9 Cold rebuild in restore mode with Auth0 unreachable: `bao operator init`, snapshot
      restore with `-force`, root revocation; then every stage reaches Ready with no manual Secret
      creation and the escrowed recovery keys authorize `generate-root`.
- [ ] 3.10 Certificate renewal: prove whether OpenBao serves the renewed leaf without restart;
      if not, implement and prove the controlled restart on renewal.
- [ ] 3.11 ESO v2.15.0 against OpenBao v2.7.2 syncs, refreshes and reports errors.
- [ ] 3.12 Out-of-band policy raises `OpenBaoConfigDrift` and `secret-store apply` refuses.

## 4. P2–P4 attended activation

- [ ] 4.1 P2 prerequisites: off-region snapshot bucket running; bootstrap-secrets Kustomization
      Ready on the platform cluster.
- [ ] 4.2 P2: label h4claw, generate and escrow the cluster seal key, activate with the canary
      Secret only; repeat 3.1–3.8 and 3.12 live; public refusal with a private control through
      the same probe; attended escrow restore on a second machine; escrow the recovery shares
      before any non-canary write.
- [ ] 4.3 P3: migrate in design D12 order, one PR and one cutover receipt per Secret.
- [ ] 4.4 P4: private DNS for `openbao.puni.internal`; enrol each workers cluster in the fleet
      repository with its own age recipient and move its `otel-client-ca` there; workers clusters; runbook entry and alert
      for service-account key rotation.
- [ ] 4.5 Delete `tools/tool-secrets` and the placeholder `.sops.yaml` rule; move WBS `.env`
      values to `kv` with the attended push.
