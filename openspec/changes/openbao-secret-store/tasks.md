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
- [ ] 1.2 Add `secret-store` and `secret-sync` stages to every platform and workers cluster
      overlay with the `dependsOn` of design D13; `secret-sync` has `wait: false` and
      `healthChecks`. Test: graph check refuses `backup` or `alerts` depending on `secret-sync`.
- [ ] 1.3 Refuse cluster-scoped ESO kinds, `PushSecret`, generators, injector and CSI anywhere.
      Negatives: one fixture per kind.
- [ ] 1.4 Refuse an `ExternalSecret` whose store is in another namespace, or whose
      `deletionPolicy`/`creationPolicy` differ from Retain/Orphan.
- [ ] 1.5 Add `source: openbao` to the `externally-provided.json` schema; require a
      same-namespace `ExternalSecret` and `SecretStore`, refuse undeclared targets, and refuse
      `openbao` for the bootstrap set of design D10.
- [ ] 1.6 Refuse an `ExternalSecret` or Vault issuer in any stage at or before `secret-store`.
- [ ] 1.7 Write `docs/infra/secrets.md` (operator runbook: escrow, unseal, rotation, restore,
      workers JWT key rotation) and link it from `docs/infra/platform.md#secrets`.

## 2. Store configuration

- [ ] 2.1 Render OpenBao values: one Raft replica, node selector
      `puni.dev/capability-secret-store`, static seal from `file://`, self-init, stdout audit
      device, Restricted Pod Security, NetworkPolicy `10.1.0.0/16` plus in-cluster ESO.
- [ ] 2.2 Server certificate `openbao.puni.internal` from a SOPS-rooted CA Issuer in
      `certificates`; NodePort with `externalTrafficPolicy: Local`.
- [ ] 2.3 Kubernetes auth mount for the platform cluster; templated `secret-reader` policy on
      `service_account_namespace`.
- [ ] 2.4 One JWT mount per workers cluster with pinned validation keys, audience `openbao`,
      10-minute tokens.
- [ ] 2.5 Auth0 OIDC mount for operators; revoke root after self-init; generate 2-of-3 recovery
      keys.
- [ ] 2.6 Decide and implement configuration reconciliation (design D8a): Git-declared mounts,
      auth methods, roles and policies; an attended diff-and-apply command that refuses unknown
      live objects. Fable review before implementation.
- [ ] 2.7 Snapshot CronJob (6 h, two buckets, 30 days) and the monthly restore-drill Job.
- [ ] 2.8 Alerts `OpenBaoSealed`, `OpenBaoAuditFailing`, `ExternalSecretSyncFailed`,
      `OpenBaoSnapshotStale`, `OpenBaoRestoreDrillFailed`.

## 3. P1 k3d rehearsal proofs

- [ ] 3.1 Pod kill auto-unseals with no human.
- [ ] 3.2 Store scaled to zero: consumer pod restarts with its Secret, alert fires, unrelated
      stages reconcile. This also proves ESO keeps the Secret on refresh failure.
- [ ] 3.3 Cross-namespace read denied and audited.
- [ ] 3.4 `ClusterSecretStore` rejected by the fleet check and absent as a CRD.
- [ ] 3.5 Wrong-key and wrong-audience JWT logins denied.
- [ ] 3.6 Restore succeeds with the escrowed key and stays sealed with a wrong key.
- [ ] 3.7 `generate-root` with recovery keys works while Auth0 is unreachable.
- [ ] 3.8 ESO v2.15.0 against OpenBao v2.7.2 syncs, refreshes and reports errors.

## 4. P2–P4 attended activation

- [ ] 4.1 P2: label h4claw, generate and escrow the seal key, activate with the canary Secret
      only; repeat 3.1–3.7 live; prove a refused connection from a public address.
- [ ] 4.2 P3: migrate in design D12 order, one PR and one cutover receipt per Secret.
- [ ] 4.3 P4: workers clusters; runbook entry and alert for service-account key rotation.
- [ ] 4.4 Delete `tools/tool-secrets` and the placeholder `.sops.yaml` rule; move WBS `.env`
      values to `kv` with the attended push.
