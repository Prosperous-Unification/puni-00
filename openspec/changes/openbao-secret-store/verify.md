## Verification status

Design only, 2026-11-15. No implementation, rehearsal or live receipt exists; every task in
[tasks](tasks.md) is open. This change installs nothing.

## Design review

1. **Decision pass** (Fable 5.2, high effort) from a written brief of session-verified facts, at
   Dany's request. Verified upstream: OpenBao seal types and the static seal (2.4.0),
   recovery-key and seal-loss behaviour, namespaces (2.3), JWT auth for Kubernetes tokens,
   Kubernetes auth, templated policies, audit fail-closed and config-declared devices, self-init,
   Raft snapshot commands; ESO's OpenBao and Vault providers, `deletionPolicy`/`creationPolicy`
   semantics and chart switches for cluster-scoped kinds; Flux `healthChecks` with `wait`; the
   cert-manager Vault issuer.
2. **Adversarial review of PR #935 at 68e9c88c0** (Fable 5.2, high effort). Two S1 findings,
   both applied: a sealed store would have blocked every dependent stage's reconcile through
   Flux `DependencyNotReady` (pinned kustomize-controller v1.9.5), so nothing now depends on
   `secret-store`; moving `otel-server-ca` into the store would have deadlocked a cold rebuild
   through the Ready-gated `certificates` stage, so CA signing Secrets stay in the bootstrap set.
   S2 findings applied: transitive `backup` dependency restated with a cold-rebuild proof; escrow
   restore made attended and off-cluster, key retention and drill-staleness alert added; reader
   logins bound to the `secret-reader` account; bootstrap ciphertext moved to the private fleet
   repository because puni-00 is public; D8a decided. S3/S4 findings applied: workers run only
   `secret-sync`, `puni-fleet-auth` is hand-created, Job and OIDC identities added to D7/D10,
   TLS SANs and renewal proof, private-control probe, off-region bucket as a prerequisite,
   glossary term renamed to "OpenBao namespace", spec scenarios for every refusal, test names in
   group 2 tasks, recovery keys from `sys/rotate/recovery/init` after the first OIDC login.

3. **Re-review at 27a1a3b0c** (Fable 5.2, high effort). Both earlier S1s confirmed resolved. One
   new S1, applied: ESO custom resources in the same Kustomization as the HelmRelease that installs
   their CRDs never pass Flux's pre-apply dry-run, so ESO moves to its own `secret-operator` stage.
   S2s applied: `SecretStore`/`ExternalSecret` confined to `secret-sync`; the cross-repo
   `bootstrap-secrets` dependency dropped, local rehearsal sourced from the disposable rehearsal
   commit and workers `otel-client-ca` kept `operator` until fleet enrolment; one Git declaration
   owns the self-init objects too; cold rebuild runs in restore mode without Auth0; ADR and
   glossary qualified to match the design's stated exceptions.

4. **Final check at 1e4032851** (Fable 5.2, high effort): no S1 remains. Restore mode was checked
   against OpenBao v2.7.2 docs and source (init on a static seal returns root and recovery shares;
   restore re-reads barrier keys through the same seal; recovery configuration returns with the
   restored storage); no live probe was run. Two S2s applied: the init root token cannot be revoked
   after restore because the token store is replaced, so it is discarded and must be rejected; restore
   mode is a committed overlay selected before a rebuild, with a wipe-and-restore path if the normal
   overlay self-initializes.

5. **Node-roles revision, 2026-11-21.** Dany set one prod services node (h4claw), one
   observability node (h3mon) and a new platform node for Harbor and OpenBao (relayed by session
   puni-00-62). The replica, listener, Jobs and memory budget move to the platform node, which
   becomes a P2 prerequisite; three voters stay deferred to P5. Fable 5.2 (high) reviewed the
   revision: no S1; five S2s applied (lab agent so P1 proves the placement; node replacement is a
   restore, with canary guards on `apply` and the snapshot Job; ESO pinned to h4claw; the image
   rule widened to an allow-list over the store's whole bring-up plus containerd mirrors; Raft on
   its own filesystem with priority over Harbor and a disk alert). S3s applied: capability
   contract task, Job selectors, Harbor in the rebuild order, partition risk, NetworkPolicy
   excludes the cluster's own node addresses.

Still unverified and owed by P1: ESO keeping a Secret when refresh fails (task 3.2), ESO 2.15
against OpenBao 2.7 (task 3.11), certificate reload on renewal (task 3.10).

## Checks run on this change

| Command                                                                                                                                                                                     | Result                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bunx prettier --check` on the changed files                                                                                                                                                | pass                                                                |
| `bunx openspec validate openbao-secret-store`                                                                                                                                               | valid                                                               |
| `bunx openspec validate --all --json`                                                                                                                                                       | 343 of 343 passed (all three revisions)                             |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/{adr-index,repo-namespacing-handoff,retired-roots,check-documents-target}.test.ts tools/tool-rename-work-package/src/allow-list.test.ts` | 28 pass after staging; untracked files fail the link test by design |

No new safety check is implemented by this change, so no R5 proof is owed yet; each check in
task group 1 carries its own.
