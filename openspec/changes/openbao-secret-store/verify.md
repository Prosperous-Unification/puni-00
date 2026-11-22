## Verification status

Design only, first written 2026-11-15 and rewritten 2026-11-22 for the platform cluster of
`separate-node-roles`. No implementation, rehearsal or live receipt exists; every task in
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

6. **Rewrite for the Argo CD cluster, 2026-11-22** (Opus 5.5, medium effort), after the plan
   `separate-node-roles` merged (#968, #977, #978, #979, #986). Reviews 1 to 5 above read the
   Flux design; this revision has not been reviewed yet. Changed to match the plan, which is
   authoritative: D2 placement (one voter on `m1plat1`, the cluster's only server, with
   `platform-services` and the `CriticalAddonsOnly` toleration on every store pod; h4claw,
   h3mon, the ESO pin and the lab agent removed); D5 one role per reading namespace instead of
   one templated policy, because the plan binds roles per namespace and the path now carries
   tenant and environment; D6 tenant prefixes and a `ci` mount for the CI cluster in place of
   OpenBao namespaces and workers clusters; D8 the tailnet, the in-cluster Service and a
   NodePort admitted from the CI server alone, with no public route; D8a store modes with an
   empty-directory refusal, replacing the Flux pin switch, because an etcd restore brings back
   the store's objects and they run before any sync; D9 the registry CA and `otel-server-ca`
   move into the store, as the plan's decision 5 sets; D10 the bootstrap set shrinks to the
   four Secrets the store reads, applied by Ansible from SOPS on the controller; D12 the
   consumer list taken from the plan, the CI change and `host-postgres`, with no migration on
   the new cluster; D13 the plan's units at orders 4 to 6 in place of three Flux stages; D14
   outage and single-server recovery. Provider names and regions were removed, since this
   repository is public.

7. **Adversarial review of PR #935 at b76a05306** (Fable, high effort): one S1 and twelve S2s,
   folded in on 2026-11-22 (Opus 5.5, medium effort), each checked against upstream source at
   OpenBao v2.7.2/v2.7.3, chart openbao-0.30.8, ESO v2.15.0 and Argo CD v3.6.2 (clones read in
   the session, nothing built or run). S1, confirmed: every listener refuses
   `sys/generate-root/*` by default since v2.5.3 (`internal/helper/configutil/listener.go`
   652-662) and the CLI calls `sys/generate-root-token` since v2.6.0 with no legacy switch, so
   break-glass is now an in-pod unix-socket listener reached by `kubectl exec` and driven with
   `curl`. S2s applied: canary exemption keyed on the initialisation date; an initialisation
   marker instead of Raft files (`raft.go` creates `vault.db`, `raft/raft.db` and `node-id` on
   every start) and closed listeners in `first-init` and `restore`; dedicated
   `database-owner` paths and served environments for database namespaces; the store's
   Issuer and Certificate moved to `cert-manager` (order 3) because `issuers` is at 7; the
   tenant interface split; listener and `sys/init` assertions; a forced sync in test 3.2; the
   rewrite check after a rebuild; layered reach proof; alert sources, a `metrics_only`
   listener and absent-series rules; a second audit device; Auth0 as a trust root with
   subject, audience, MFA and bound CIDRs. S3s applied, with the generator values corrected
   (`processClusterGenerator` and `crds.createClusterGenerator` default true) and ESO's token
   grant narrowed through `serviceAccountTokenCreate: false`. Reviewed in round 2 (item 8).

8. **Round-2 review of PR #935 at bd5fbdda1** (Fable, high effort): no S1, four S2s, all
   applied after a source check at v2.7.2/v2.7.3 (Opus 5.5, medium effort, 2026-11-22).
   Break-glass uses `bao write` over the socket: the v2.7.3 Dockerfile installs no `curl`, and
   `generate-root -decode` reads the authenticated attempt first; `sys/decode-token` is in the
   system backend's `Unauthenticated` paths and the API client dials `unix://` addresses. The
   store's Issuer and Certificate land in A7's revision of `cert-manager`, recorded as an
   amendment to the plan's A7 text in `separate-node-roles/tasks.md`. The file audit device
   gets a stall metric from its sidecar, because `AuditBroker.LogRequest` counts a failure only
   when no device logged. The off-region copy is dropped and its loss mode stated, with a
   follow-up named. S3s applied: replaced no-op faults, the restored `first-init` claim
   wiped first, the drill's login on `127.0.0.1/32` with TokenReview through the local token
   (`disable_local_ca_jwt` defaults to false), the owner's subject moved to the private fleet
   repository, the CI change's DNS and CA dependency noted, a create-and-update writer policy,
   a forced date commit per cluster, orphans matched by `spec.target.name`, bound CIDRs at
   m1plat1's pod subnet, the object-store key's prefix scoping marked unverified, the audit
   claim counted in the plan's 10 GiB, enrolled-node rows after A13, the spec synced, the
   chart key `rbac.serviceAccountTokenCreate`, and `postgres`'s tenant label.

9. **Final check at 8f7b5cb48** (Fable, high effort): no S1, two S2s, both applied. The cold
   rebuild comes back under a new node name (`restore.yml` refuses the fenced original's name),
   so D14 now deletes the fenced node's claims and volumes before `restore`, and after the
   snapshot restore commits the replacement's `spec.podCIDR` and runs `apply` under a
   break-glass root before `steady`; the planner refuses a recorded subnet that differs from
   the live one. The file audit device is watched from A7: `tool-fleet:health` reads the
   sidecar's gauge until the `alerts` unit runs, and the plan's tasks add that reading to every
   receipt from A7 to A14. This revision has not been reviewed.

Still unverified and owed by P1: ESO 2.15 against OpenBao 2.7.3 (task 3.11), the `bao` client's
server name override through the Tailscale operator's exposure (task 3.13), Auth0's `amr`
claim (task 3.8), ESO recreating a deleted Secret under `creationPolicy: Orphan` (task 3.9),
`tls_auto_reload` with a kubelet-updated Secret (task 3.10), the break-glass commands (task
3.8), the drill's login through the local reviewer token (task 3.7), and the object store's
prefix-scoped key without delete (task 4.1). Upstream-confirmed but not
run: ESO keeps the Secret and reports `SecretSyncedError` on a provider failure, any annotation
change forces a sync, `snapshot restore -force` bypasses the key check, a sealed StatefulSet is
not Healthy, and resource sync waves wait for health.

## Checks run on this change

Final-check fold-in of 2026-11-22, on 8f7b5cb48 plus the working tree:

| Command                                                                                     | Result               |
| ------------------------------------------------------------------------------------------- | -------------------- |
| `./node_modules/.bin/openspec validate openbao-secret-store --strict`                       | valid                |
| `./node_modules/.bin/openspec validate separate-node-roles --strict`                        | valid                |
| `./node_modules/.bin/openspec validate --all --json`                                        | 355 of 355 passed    |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`                       | 1 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`        | 15 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/current-documents.test.ts`               | 18 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/retired-roots.test.ts`                   | 3 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/check-documents-target.test.ts`          | 6 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                 | 37 pass, 0 fail      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0, empty stderr |
| `nx format:check --files=<the five changed files>`                                          | exit 0               |

Round-2 fold-in of 2026-11-22, on bd5fbdda1 plus the working tree (`origin/main` not merged):

| Command                                                                                     | Result               |
| ------------------------------------------------------------------------------------------- | -------------------- |
| `./node_modules/.bin/openspec validate openbao-secret-store --strict`                       | valid                |
| `./node_modules/.bin/openspec validate separate-node-roles --strict`                        | valid                |
| `./node_modules/.bin/openspec validate --all --json`                                        | 355 of 355 passed    |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`                       | 1 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`        | 15 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/current-documents.test.ts`               | 18 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/retired-roots.test.ts`                   | 3 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/check-documents-target.test.ts`          | 6 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                 | 37 pass, 0 fail      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0, empty stderr |
| `nx format:check --files=<the five changed files>`                                          | exit 0               |

Review fold-in of 2026-11-22, on b76a05306 plus the working tree (`origin/main` 7a0279c7d
not merged; it adds no ADR and no file of the plan, `host-postgres` or the CI change):

| Command                                                                                     | Result                                                                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `./node_modules/.bin/openspec validate openbao-secret-store --strict`                       | valid, after two over-long requirements were split                                |
| `./node_modules/.bin/openspec validate --all --json`                                        | 355 of 355 passed                                                                 |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`                       | 1 pass, 0 fail                                                                    |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`        | 15 pass, 0 fail                                                                   |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/current-documents.test.ts`               | 18 pass, 0 fail                                                                   |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/retired-roots.test.ts`                   | 3 pass, 0 fail                                                                    |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/check-documents-target.test.ts`          | 6 pass, 0 fail; an earlier run in the same session failed 1 of 6, output not kept |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                 | 37 pass, 0 fail                                                                   |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0, empty stderr                                                              |

`nx format:check --files=<the seven changed files>` exited 0.

`check-documents-target` also passed 6 of 6 at b76a05306 itself once the disk had space, so
the earlier disk-full failure is resolved.

Rewrite of 2026-11-22, at the branch merged with `origin/main` 2d3294922:

| Command                                                                                     | Result               |
| ------------------------------------------------------------------------------------------- | -------------------- |
| `./node_modules/.bin/openspec validate openbao-secret-store --strict`                       | valid                |
| `./node_modules/.bin/openspec validate --all --json`                                        | 355 of 355 passed    |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`                       | 1 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`        | 15 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/current-documents.test.ts`               | 18 pass, 0 fail      |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/retired-roots.test.ts`                   | 3 pass, 0 fail       |
| `env -u CLAUDECODE bun test tools/tool-rename-work-package`                                 | 37 pass, 0 fail      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0, empty stderr |
| `nx format:check --files=<the ten changed files>`                                           | exit 0               |

Earlier revisions:

| Command                                                                                                                                                                                     | Result                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bunx prettier --check` on the changed files                                                                                                                                                | pass                                                                |
| `bunx openspec validate openbao-secret-store`                                                                                                                                               | valid                                                               |
| `bunx openspec validate --all --json`                                                                                                                                                       | 343 of 343 passed (all three revisions)                             |
| `env -u CLAUDECODE bun test tools/tool-devsync/src/{adr-index,repo-namespacing-handoff,retired-roots,check-documents-target}.test.ts tools/tool-rename-work-package/src/allow-list.test.ts` | 28 pass after staging; untracked files fail the link test by design |

No new safety check is implemented by this change, so no R5 proof is owed yet; each check in
task groups 1 and 2 carries its own named fault.
