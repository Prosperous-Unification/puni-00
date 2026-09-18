# Verification

## Commands and results

- F6 foundation `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:check --skip-nx-cache` (2026-09-17): 144 passed, 0 failed, 741 assertions; lint, typecheck, the required toolchain lock, and the production platform validator passed.
- The exact locked fleet-controller image, with networking disabled and only a task-owned `/tmp` copy mounted, accepted `ansible-playbook --syntax-check` for `platform.yml`. Its pinned kubectl rendered all four cluster overlays plus networking, local/production storage, policy and registry kustomizations. The only diagnostic was the expected syntax-check warning that the synthetic inventory has no `k3s_bootstrap_servers` host.
- Official Docker Hub evidence for Distribution 2.8.3 records linux/amd64 manifest `sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278`; the toolchain and Deployment bind that exact identity. The existing external registry remains authoritative until TLS/auth, offline garbage collection and restart-pull tests pass.
- `docker run --rm --network none --user 1000:1000 --tmpfs /var/lib/registry:uid=1000,gid=1000 ... registry --version` printed Distribution 2.8.3, and the same process wrote the storage path. The pod security context binds UID/GID/fsGroup 1000 and a read-only root filesystem.
- Superseded on 2026-09-18: the full cluster graph, SOPS decryption, missing-key and wrong-cluster refusals, registry TLS/auth/offline GC/restart pull and migration copy, and the F7 observability and backup drills ran live on k3d. Commands, SHAs and measurements are in [fleet verification](../k3s-fleet/verify.md#f6-completion-and-f7-observability-and-backup-drills); open production items are listed there and in `tasks.md`.

## Failure proofs

| Check                      | Injected fault                                                                                              | Production-path test                                                     | Observed result                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Registry image lock        | Removed required `runtimeImages.registry` schema entry                                                      | `readToolchain rejects a missing registry image lock`                    | The negative resolved instead of rejecting; the required lock was restored        |
| Platform artifact locks    | Removed chart-version and registry-digest guards                                                            | `validatePlatform` chart and registry negatives                          | Both changed artifacts resolved instead of rejecting; both guards were restored   |
| Cluster identity           | Removed overlay identity and kubeconfig binding guards                                                      | `validatePlatform` wrong-identity and cross-cluster-kubeconfig negatives | Both substitutions resolved instead of rejecting; both guards were restored       |
| SOPS recovery key          | Removed the exact `sops-age` reference guard                                                                | `validatePlatform` missing-decryption-key negative                       | The missing-key graph resolved instead of rejecting; the guard was restored       |
| Trusted host path          | Removed the exact-directory guard                                                                           | `assertTrustedWorkload` broader-parent negative                          | `/run/puni` stopped throwing; the `/run/puni/solver` equality guard was restored  |
| Trusted workload identity  | Removed namespace, service-account, controller and image checks                                             | `assertTrustedWorkload` four identity negatives                          | Each unreviewed identity stopped throwing; all four guards were restored          |
| Trusted workload isolation | Removed capability, privilege and API-token checks                                                          | `assertTrustedWorkload` capability, escalation and automount negatives   | Each unsafe workload stopped throwing; all three guards were restored             |
| Cluster token escrow       | Removed the escrow assertion task from the `backup` role                                                    | `backup.yml` in the locked controller with a wrong fingerprint           | The wrong fingerprint wrote the snapshot configuration; restored, it stopped      |
| Target-cluster gate        | Removed the target stage health check (live) and its validator                                              | Wrong-cluster k3d graph; `validatePlatform` marker negatives             | Namespaces reached the wrong cluster; both negatives resolved; guards restored    |
| SOPS-only secrets          | Accepted plaintext values and out-of-directory Secrets                                                      | `validatePlatform` plaintext and location negatives                      | Both resolved instead of rejecting; guards restored                               |
| Workload image lock        | Removed the plain-workload membership check                                                                 | Registry, blackbox and init-container negatives                          | All three resolved instead of rejecting; check restored                           |
| Registry transport         | Removed the TLS/auth environment comparison                                                                 | Unauthenticated-registry negative                                        | Resolved instead of rejecting; comparison restored                                |
| SQLite runner binding      | Removed the ConfigMap-to-source comparison                                                                  | Changed-runner negative                                                  | Resolved instead of rejecting; comparison restored                                |
| SQLite restore integrity   | Removed foreign-key, report-hash and version-id checks                                                      | `backup-sqlite.test.ts` negatives                                        | Each named negative failed; checks restored                                       |
| Registry copy digests      | Removed blob and stored-manifest digest comparisons                                                         | `platform-registry.test.ts` negatives                                    | Each named negative failed; comparisons restored                                  |
| Solver digest list         | Replaced list membership with `contains` (live)                                                             | `solver-digest-prefix.yaml` server-side dry-run; tag-only list negative  | The prefix pod was admitted and the tag list resolved; both restored              |
| Stage placement            | Disabled the capability satisfiability check                                                                | Platform-only capability in the workers agent; old nine-stage graph      | The negative resolved; the old workers graph was rejected                         |
| Secret closure             | Disabled the missing and stale checks                                                                       | Undeclared and unconsumed Secret negatives                               | Each resolved instead of rejecting; checks restored                               |
| Trusted policy scope       | Removed the namespaceSelector (live and validator)                                                          | kube-system pod with the parameter deleted; unscoped-policy negative     | kube-system pod denied; negative resolved; selector restored                      |
| Trusted image ownership    | `ssa: Merge` instead of `IfNotPresent` (live and validator)                                                 | Coordinator-written solverImages across a Flux reconcile                 | Flux reverted the value; negative resolved; annotation restored                   |
| Alert rules                | Previous rule expressions                                                                                   | promtool rule unit tests                                                 | Eight cases failed; the new rules pass                                            |
| Chart value branches       | Loosened KPS `crds`, OTel volumes, Elastic version check                                                    | Upgrade-job, image-volume and version negatives                          | Each resolved instead of rejecting; guards restored                               |
| Cold-restore inputs        | Removed each refusal in `planColdRestore` (token, SOPS key, version, fingerprints, folder, size/SHA, fence) | recover.test.ts negatives, one run per guard                             | Each named negative failed (35-case run, `r5.py`); restored                       |
| Attachment and rebind      | Removed fence, node match, re-read, claim, Retain and old-node fence guards                                 | recover.test.ts; live `remove-attachment` on k3d                         | Each negative failed; live, the running node's attachment was deleted; restored   |
| restore.yml byte checks    | Deleted the token and the snapshot assertions                                                               | Locked controller, wrong token / flipped-byte snapshot                   | Both reached "Stop k3s before the reset"; restored, both stopped at the assertion |
| Health rules               | Disabled each of the eleven rules and the read-only guard                                                   | health.test.ts per-rule fault tests                                      | Exactly the rule's test failed each time                                          |
| Health marker decoding     | Required `cluster-id` on every kube-system ConfigMap                                                        | Marker-among-others test; first live run                                 | Test failed; live run had refused kube-root-ca before the fix                     |
| Maintenance planners       | Removed health, odd-target, escrow, digest and unpushed guards                                              | maintenance.test.ts negatives                                            | Each named negative failed; restored                                              |
| Synthetic Job bounds       | Made podReplacementPolicy optional; disabled AlreadyExists mapping                                          | maintenance-workers.test.ts negatives                                    | Both failed; restored                                                             |
| Worker scratch reuse       | Removed the empty-workspace guard                                                                           | worker.test.ts reused-workspace negative                                 | Failed; restored                                                                  |
| Restore verification age   | Deleted the 26 h age line from the rendered Job                                                             | Live Job over a report stamped 2026-09-01                                | Completed without the line; failed with it                                        |
| Verification alert scope   | Matched only `owner_name="sqlite-backup"`                                                                   | promtool restore-verification case                                       | Case failed; regex restored                                                       |

## F9 source-run development (2026-09-18, worktree `change/tbf-f9`)

Tools: k3d v5.9.0 and kubectl v1.36.4 from the `infra/versions/toolchain.json` URLs, `sha256sum -c` OK; k3s `v1.36.4-k3s1@sha256:edad48e1…` and registry `2.8.3@sha256:46faa9a1…` from the same lock. Host: 24 cores, 31 GiB, 5–11 GiB available while a VM lab shared it. Every cluster was named `puni-f9-*` and deleted; no lab container, network or volume remained.

| Command                                                                            | Commit                 | Result                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t test lint typecheck -p tool-fleet`                            | each commit            | exit 0; 207 pass, `k3d-lab.test.ts` 24 of them                                                                                                                  |
| `bunx nx run-many -t test lint typecheck -p tool-devsync`                          | each commit            | lint and typecheck exit 0; test 229 pass, 14 fail (baseline 200/14): the same 14 failures and assertion diffs; the 29 new `src/k3s` tests pass                  |
| `bunx nx format:check --all`                                                       | each commit            | exit 0                                                                                                                                                          |
| `k3d-lab.ts up --id f9-dev --profile app` then `dev-env up` for `alpha` and `beta` | `035e39b0`–`a788a56d`  | `app` lab 16.5 s (images cached), first `dev-env up` 58 s with the image build, later 12–18 s                                                                   |
| `dev-environment-check.ts` against `alpha`                                         | `20954fa7`             | all 14 checks passed in 16.6 s (list below)                                                                                                                     |
| `up --profile platform` and `--profile fleet`                                      | `a788a56d`             | refused: `4972 MiB memory available, 16384 MiB required. Use --profile app`; fleet `... 24576 MiB required. Use --profile platform`; no Docker resource created |
| `fleet` with the refusal bypassed for measurement (local edit, not committed)      | `839a1ac1`             | 114 s; 7 containers 1.71 GiB; Flux controllers Available on both clusters; workers server tainted, bundled Traefik absent                                       |
| Fresh clone of `4efc9c15`, then only `docs/infra/local.md` commands through Nx     | `4efc9c15`, `ced298a5` | first pass found two gaps (below); after `ced298a5`: lab up 57 s, `dev-env up` 22 s, URL answered 200 at once, check passed                                     |

Live checks passed on `alpha` and on the walkthrough's `main`: web `index.html`; `POST /api/projects` through Vite as owner `local-dev`; the row counted in `/data/wbs.db` in the Pod; `/mcp` 401 with `resource_metadata` on the environment origin; `/.well-known/oauth-protected-resource` resource `http://<slug>.localhost:<port>/mcp`; `/ws` upgraded from Bun and from Chromium; Chromium opened Vite's HMR socket on the environment origin; a `styles.css` edit logged `[vite] hot updated: /src/styles.css` with no navigation; a be-01 source edit reloaded under `bun --watch` with no supervisor restart; `vite.config.ts` and `bun.lock` edits each logged `[forge] restart required, changed: <path>`, ran `bun install --frozen-lockfile` (`no changes`) and restarted the tiers with container restart count unchanged.

Also observed: `beta` had its own empty database while `alpha` held rows; an overlay edit made `status` print `RECREATE REQUIRED` and exit 3, and `up` recreated the Pod (new UID) with the database rows intact; a second unchanged `up` kept the Pod; `kill 1` restarted the container once and it became Ready again; every lab port listened on `127.0.0.1` only and the LAN address refused the ingress port; `~/.kube/config` was never created; `down` of one environment removed only its five objects and its admission root while the other environment and the solver root stayed.

Solver runtime directory: a host server on `solver-runtime/supervisor.sock` (inode 672014) answered `A` inside the Pod; a second server bound `supervisor.sock.next` and was renamed over it (inode 672015); without a Pod restart the Pod then read `B`. Server-side dry-runs as the forge controller of the bound Pod: unchanged admitted; `hostPath /run/puni/solver/supervisor.sock` (Socket), the prefix `/srv/puni/worktrees`, and another environment's root each denied with `trusted workloads may use only Restricted volume types or their exact directory root`.

Walkthrough findings fixed: `dev-env up` straight after `lab up` got an empty reply for about 30 s while k3s installed Traefik (`ced298a5` waits for it); the live check needs `bunx playwright install chromium` (42 s, now documented). Earlier live runs fixed: Pods could not be read out of a list (`20954fa7`), BuildKit attestations gave every build a new digest (`20954fa7`), `down` deleted before checking admission ownership (`20954fa7`), `rollout status --all` is not a kubectl flag and the worker cluster kept bundled Traefik (`839a1ac1`), the registry volume leaked on `down` and pushed tags accumulated (`a788a56d`, `f5e055ed`).

Not proven here: the `platform`/`fleet` platform graph and its cost, the VM host path, remote shared dev authentication, and `bun install` from a cold package cache (the walkthrough's 1.5 s used this host's cache).

### F9 failure proofs

| Check                                           | Injected fault                                        | Production-path test                                                                                  | Observed result                                                               |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Lab flag values, lab ID, resource refusal       | Dropped `--` test, pattern, refusal                   | `k3d-lab.test.ts` parser and resource negatives                                                       | Each named negative failed; restored                                          |
| k3d render                                      | Placeholder returned unchanged; dollar check disabled | render negatives                                                                                      | Both failed; live, a missed `K3S_IMAGE` reached k3d as `image: null`          |
| State directory ignored by Git                  | Accepted `check-ignore` exit 1                        | `refuses a state directory Git would commit`                                                          | Failed; restored                                                              |
| Label-scoped `down`                             | Dropped the lab-label filter                          | `never deletes a lab-named resource that lacks the lab label`; live decoy                             | Test failed; live `down` left the labelled decoy and an unlabelled look-alike |
| Worktree realpath, top level, owner, repository | Compared requested path; disabled each comparison     | `requireOwnedWorktree` negatives; live symlink, outside, subdirectory and foreign-repository refusals | Each negative failed; live refusals printed their reasons                     |
| Duplicate slug and worktree                     | Disabled the slug comparison                          | `refuses a duplicate slug for another worktree`; live                                                 | Failed; live `alpha` for `beta` and `alpha2` for `alpha` refused              |
| Overlay shape and single forge image            | Disabled the kind check; ignored other environments   | `refuses an overlay with an extra object`; `refuses a second forge image`                             | Both failed; restored                                                         |
| Wrong cluster                                   | Removed the marker comparison (live)                  | `status` with the marker relabelled, and with another lab's kubeconfig                                | With the check: refused both; without: printed the environment                |
| Admission ownership                             | Removed the label comparison (live)                   | `up` against parameters without the lab label                                                         | With the check: refused; without: patched them (`kubectl-patch` manager)      |
| Environment isolation                           | Deleted `dev-beta`'s NetworkPolicy (live)             | request from `dev-alpha` to `dev-beta`'s pod IP                                                       | Refused connection; 200 without the policy; refused again after `up`          |
| Existing Pod read                               | Numeric keys no longer index arrays                   | `existingPodFingerprint` test                                                                         | Failed; the live bug had recreated on every `up`                              |

### F9 review fixes (2026-09-18, after merging `e170c948`)

All ran on the disposable k3d lab `puni-f9-rv` (app profile, two fresh clones `alpha` and `beta` of `61f6e1d7`), which was deleted afterwards. No lab container, network, volume or image remained.

| Finding                     | Live result with the fix                                                                                                                                                                                                                                                                                                                                                    | Live or unit result with the fault                                                                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 lost updates             | Four concurrent claims through `updateForgeAdmission` against the API server kept all four owners (6 `(Conflict)` replies retried); concurrent `up alpha` and `up beta` both served with both roots admitted                                                                                                                                                                | With the `resourceVersion` stripped, the same four claims kept one owner, twice; `keeps both roots when two claims race` failed                                                                                                                                                                                 |
| M1 restore on failed create | Pod create forbidden (forge RoleBinding deleted): parameters equal to their pre-`up` state                                                                                                                                                                                                                                                                                  | Restore disabled: the failed `up gamma` left `/srv/puni/worktrees/beta` and `gamma` admitted                                                                                                                                                                                                                    |
| M1 release without a Pod    | `dev-beta` deleted by hand, then `down`: its root and claim released                                                                                                                                                                                                                                                                                                        | Release gated on a running Pod: `down` left the root admitted                                                                                                                                                                                                                                                   |
| M2 claim race               | Concurrent `up --slug race` for `alpha` and `beta`: one served, the other refused `slug race already serves …`; the loser's worktree Lease was rolled back                                                                                                                                                                                                                  | Claim disabled: both runs passed the Pod check and reached the image build; `refuses a Lease another environment holds` failed                                                                                                                                                                                  |
| M3 Flux ownership           | The committed ConfigMap keeps `ssa: IfNotPresent`. A Flux `policy` Kustomization (OCI artifact of `trusted-images.yaml`, locked Flux v2.9.5) reconciled while `beta` ran: the roots were untouched                                                                                                                                                                          | An artifact without the annotation made Flux revert the roots to `/srv/puni/worktrees/puni-00` and drop the lab label. With the label restored, `dev-env up` refused (`applies puni-trusted-workload without … IfNotPresent`); with the check removed it wrote `beta`'s root and the next reconcile reverted it |
| M4 digest test              | `refuses a forge image that is not digest-pinned` renders a clean overlay                                                                                                                                                                                                                                                                                                   | Guard replaced by an empty-string check: the test failed                                                                                                                                                                                                                                                        |
| M5 install and supervisor   | `package.json` given an unlocked dependency: the install failed, the container crash-looped before the tiers, `status` printed `INSTALL REQUIRED: install-required: bun install --frozen-lockfile exited 1` and exited 4; after the restore the Pod became Ready again. Editing `forge-supervisor.ts` in the worktree ended the container with `supervisor sources changed` | Startup install removed: the restarted container started the tiers on unsynced `node_modules` and crash-looped with no named cause (web 503)                                                                                                                                                                    |
| m1 root identity            | Root moved aside and recreated: `up` refused (`recorded 66307:23632573, now 66307:21944202`)                                                                                                                                                                                                                                                                                | Check removed: the Pod stuck on `hostPath type check failed: /srv/puni/worktrees/alpha is not a directory`                                                                                                                                                                                                      |
| m2 owner UID                | Both Pods ran as 1000:1000, the worktree owner; `HOME=/tmp`                                                                                                                                                                                                                                                                                                                 | Binding or root refusal removed: `runs the Pod as the worktree owner` / `refuses to run as root` failed                                                                                                                                                                                                         |
| m3 teardown scope           | `down --profile` deletes only that profile's clusters and keeps registry, network and state while another remains (unit)                                                                                                                                                                                                                                                    | Scope or state rule removed: `leaves clusters outside the named profile` / `keeps state while anything it names remains` failed                                                                                                                                                                                 |
| m4 loopback                 | `docker port k3d-puni-f9-rv-platform-serverlb`: `80/tcp -> 127.0.0.1:34419`, `6443/tcp -> 127.0.0.1:41859`; `up` checks registry and every serverlb                                                                                                                                                                                                                         | Check disabled: `refuses a port published beyond loopback` failed                                                                                                                                                                                                                                               |

Gates after the fixes: tool-fleet and tool-devsync `test`, `lint` and `typecheck` pass; tool-devsync 263 pass and 0 fail once the new files were committed (the merged branch had already fixed the 14 baseline failures). `format:check --all` exit 0.

## F10 recovery and maintenance drills

Code committed as `79b220b4`..`83b3eb8a`, then the live-found repairs in the F10 evidence commit.
Tools were the toolchain-locked k3d v5.9.0, kubectl v1.36.4, Flux v2.9.5, sops v3.13.3 and
age v1.3.2 (each `sha256sum -c` OK), k3s image `v1.36.4-k3s1@sha256:edad48e1…`. The Git source was
a task-owned bare repository served by `git http-backend` on `host.k3d.internal:8419`; rehearsal
commit `642c266a` is `83b3eb8a` plus disposable platform-local SOPS secrets encrypted to an age
identity generated for the run (recipient `age1qwy575…`, which `ageRecipientOf` derived exactly).

Unit and structural checks: the 35 fault injections of the table above, each run against its
test file (`r5.py`, all exit 1 on the named test); `ansible-playbook --syntax-check restore.yml`
in the locked controller exited 0; `platform-alerts.ts` SUCCESS.

Cold restore (cluster `puni-f10-src`, one server, `--cluster-init`, platform capabilities,
local-path directory bind-mounted from the host):

- Full platform-local graph reconciled: all ten Kustomizations Ready; Kibana then suspended and
  scaled to 0 for memory. Known row `project/drill-project-f10` in a database built by the real
  `migrate-cli.ts` (44 migrations) on PVC `wbs-data`; `drill/busybox` copied into the platform
  registry (`sha256:b7f3d86d…`); log event `puni-f10-18bbbf48 cold-restore-marker` searchable (1).
- `sqlite-backup` Job: `sqlite/wbs/20260918T070623769Z.db`, version `207ac771…`, sha256
  `91f09ed1…`, 44 migrations. `sqlite-backup-verify` Job completed on it. Injected: a newer
  report with a wrong sha256 failed ("bytes differ from its report"); a report stamped
  2026-09-01 failed the age check (1494443 s old); without the age line it completed.
- Velero backup `f10-registry` Completed; SLM snapshot `puni-daily-2026.09.18-fdf-if87tk…` SUCCESS.
- Row `drill-project-f10-late` written at 07:07:53.368Z; `k3s etcd-snapshot save --etcd-s3`
  07:08:00.258–.755Z, 38,117,408 bytes, sha256 `b0c36e8d…`; `recover.ts record-manifest` exit 0.
- `health.ts` on the source: kibana suspended (warning), Velero schedule never ran (critical).
  The first run exited on a schema error for other kube-system ConfigMaps; fixed and tested.
- Fence: `k3d cluster delete puni-f10-src` at 07:09:42.439Z; storage directory kept.
- `verify-cold-restore`: absent token file exit 1 "the escrowed k3s server token is missing";
  absent age file exit 1 "the escrowed SOPS age identity is missing"; one flipped byte exit 1
  "differs from its recorded size and SHA-256"; valid inputs exit 0 with the plan.
- `restore.yml` in the locked controller (root, local connection): absent token failed at the
  token lookup; wrong token failed at its assertion; corrupt snapshot failed at the snapshot
  assertion; valid inputs passed every check and stopped at `systemctl` (no systemd).
  Finding: the play failed writing the token until it created `/etc/rancher/k3s`; fixed.
- Reset in a plain k3s container with the escrowed token exit 0, but the member kept the
  default-bridge peer URL and the k3d node refused it ("this server is not a member").
  Redone on network `puni-f10` with the node's IP `172.18.0.2`: exit 0; API up 07:14:48.455Z.
- Deleted Node `k3d-puni-f10-src-server-0` (from the plan). `rebind-volume` refused the registry
  PV ("reclaim policy is not Retain": platform claims use `local-path`, `Delete`) and refused
  `wbs-data` with empty fences ("not fenced"). After patching four PVs to Retain, all five
  rebound; the first attempt hung because pv-protection re-added its finalizer, fixed by
  deleting before removing it. All Bound on the new node at 07:18:55.628Z.
- `sqlite-restore` Job into new PVC `wbs-data-restore` completed: integrity ok, 44 migrations,
  newest `20260912120000_add_work_item_facts`, rows `[drill-project-f10]`; the rebound live
  volume held both rows.
- Registry CA identical to the source; manifest and both blobs pulled by digest and verified.
- Elastic: password restored from etcd; the injected phrase counted 1 at 07:22:38.685Z;
  cluster yellow. ES then paused, its HelmRelease suspended and scaled to 0.
- Admission server-side dry-runs: solver-allowed and forge-allowed admitted; alternate path,
  untrusted image, nested forge path denied; privileged product pod forbidden.
- Flux could not fetch: the interrupted k3d create had not added `host.k3d.internal` to
  CoreDNS NodeHosts. Added by hand; every stage Ready at `642c266a` 07:27:35.772Z.
- Stale attachments: two synthetic VolumeAttachments on the registry PV. `health.ts` reported
  both (volume-attached). `remove-attachment` refused the live node, deleted the fenced
  node's; with the fence guard removed it deleted the live node's.
- Health drills on the restored cluster: wrong cluster id → only cluster-marker; broken-path
  Kustomization → flux-ready critical; unbound claim → claim-bound warning; Certificate with a
  missing issuer → certificate-valid; failed verify Job → backup-job-failed, cleared after a
  good run; no snapshot on the new cluster → etcd-snapshot-fresh, cleared after
  `etcd-snapshot save` (`puni-f10-after-restore…`); pending backup pod (its `be-01` affinity
  target is gone) → pod-ready. Velero Restore of `f10-registry` Completed; tag link
  `sha256:b7f3d86d…`.

Workers (`puni-f10-workers`, one server, two execution agents, workers-local graph; no platform
gateway, so every export failed with retries throughout — the telemetry outage):

- `f10-complete` completed; a second dispatch refused by the journal ("already complete") and,
  with a fresh journal, by the API ("synthetic-f10-complete already exists"); one pod.
- `f10-cancel`: cancel recorded, Job deleted; the pod logged `synthetic-cancelled` (SIGTERM).
- `f10-drain`: after `kubectl drain agent-0 --pod-selector=puni.dev/proof=infrastructure
--delete-emptydir-data` (scratch is disposable by design) the Job succeeded on agent-1, failed unset.
- `f10-nodeloss`: `docker stop` of agent-0 at 07:35:27.462Z; health reported node-ready and
  pod-ready; the pod stayed on the dead node until the `out-of-service` taint at 07:36:24.011Z;
  the replacement completed on agent-1 at 07:37:06.251Z, failed unset.
- `f10-exhaust-memory`: OOMKilled 137, Job failed by PodFailurePolicy, no retry.
- `f10-exhaust-disk`: evicted after 59 s, "Usage of EmptyDir volume "workspace" exceeds the
  limit "64Mi"", after about 2.0 GB written; no DisruptionTarget; Job failed, no retry.
- Recreation: `f10-recreate` dispatched (hold 30 s), cluster deleted at 07:39:25.538Z (journal
  sha256 unchanged), recreated to policy Ready at 07:40:57.348Z; reconcile restarted the run
  (attempts 2), which completed at 07:41:47.479Z.

Everything created (`puni-f10-src`, `puni-f10-restore`, `puni-f10-workers`, network
`puni-f10`, the legacy registry container, git server, storage and escrow files) was deleted.
Not verified: `restore.yml` beyond the systemd boundary, any real host or CSI attachment,
multi-server etcd, and the maintenance planners' effects.

### F10 review fixes, merge and follow-ups (2026-09-18)

Merged `change/twilight-bureaucrat-fleet` at `1a25c498` as `87d8ddad`. F11 moved the SQLite backup
into `deploy/k8s/wbs/base/backup.yaml` (`wbs-solver`, backend image). `sqlite-backup-verify`
moved beside it: F6 admits only backend-image pods in `wbs-solver`, where the only backup
Secret, runner and egress policy live, so the MinIO selection container was replaced by a new
`backup-sqlite.ts verify` mode (newest report, 26 h age limit), the release coordinator now
patches both CronJobs with every backend rollout and refuses a release record either one
disagrees with, `check-backup.ts` compares the verification job's namespace, service account,
controller label, node selector, image, UID, workload label and runner with the backend and
backup, and the health rule reads the backup from `wbs-solver`. The live k3d drill of the old
verify job remains the evidence for the restore/age behaviour; the new layout is proved by unit,
rendered-overlay and adapter tests only.

Review fixes (Fable, `79b220b4..aec93206`):

- B1 `restore.yml`: single host, host `node-name` from `/etc/rancher/k3s/config.yaml`, running
  datastore refused unless `puni_restore_confirm_existing_datastore` names the host, `--limit`
  in the runbook. Locked controller: a two-host inventory stopped at "Refuse to restore on more
  than one host"; a host whose config names the fenced original stopped at the node-name check;
  with both assertions removed each reached the datastore checks.
- M1: manifests record `etcdMembers`; a plan refuses members without fence evidence (VM lab:
  a manifest listing a second member refused "recorded etcd members without fence evidence:
  puni-vm-f10-platform-server-2").
- M2: Job TTL removed and refused by the template schema; the authority deletes a Job after
  recording it and stores the `kube-system` UID.
- M3: only `s3://` etcd snapshots count; m3: the verification CronJob must have succeeded
  within 26 h; m1: `reportSha256` in the manifest and `RESTORE_REPORT_SHA256` required by
  restore mode; m2: `rebind-volume --replacement-out` writes the PV before deleting; m4:
  `--etcd-s3=false` on the reset; m5: ephemeral-storage requests/limits in the `workers` quota.
- Platform claims (object store, registry, Elasticsearch in both environments, Prometheus) use
  class `puni-retain`: local-path Retain locally, an added hcloud CSI Retain class in production
  (hcloud-volumes stays default). `tool-fleet:check` refuses any other class.

Fault injections, each against its named test: etcd-member fence, rebind write-first, report
digest, verification age, S3-only snapshots, verification freshness, same-cluster outcome,
TTL, memory-backed scratch, delete-after-record, the eight verification-job comparisons, the
verify CronJob patch in the coordinator, the claim class check and the hcloud class tuple.
Each disabled guard failed its test; each was restored.

Live, workers k3d (`puni-f10-workers`, rehearsal commit `efdaa16b` = working tree): quota
showed `requests.ephemeral-storage 16Gi`, `limits.ephemeral-storage 32Gi`. Disk exhaustion with
memory-backed scratch: last successful write at 67,108,864 bytes, then `ENOSPC`, exit 1; the Job
failed (BackoffLimitExceeded, one retry, same bound) 37 s after dispatch, no eviction. Memory
exhaustion still OOMKilled 137. A completed run: Job had no TTL; reconcile recorded `complete`
and deleted the Job. A Job deleted from the same cluster: `failed`, "outcome unknown: Job absent
on the same cluster", no restart. Cluster recreated during a run: kube-system UID changed
(`b3207f30…` → `6157567a…`), the run restarted (attempts 2) and completed.

Live, rootless QEMU VM lab (`lab up --provider qemu --lab-id f10 --profile platform`, two 2 GiB
VMs, exit 0 in 4 min 35 s, systemd k3s): ConfigMap `drill-before`, local snapshot
`f10-vm-puni-vm-f10-platform-server-1-1789719252` (sha256 `fad71794…`, identical on host and
controller), then ConfigMap `drill-after`. The server's config was changed to node-name
`puni-vm-f10-platform-restore` (replacement identity on the same VM; the old identity is the
fenced original). With k3s running and no confirmation, `restore.yml --limit` stopped at the
datastore guard; a confirmation naming `agent-1` also stopped there. With that guard removed
the play reset the live datastore (`drill-after` gone) and then failed at `kubectl wait` with
`nodes "puni-vm-f10-platform-restore" not found`; the play now waits for registration first.
Clean run with the confirmation naming the host: exit 0 in 23 s, `ok=25 changed=5 failed=0`;
the replacement node Ready, the fenced node deleted, the agent still Ready, `drill-before`
present, `drill-after` absent, both previous datastores kept as `db.pre-restore-fad717947757-*`.
The VMs and lab state were deleted; the other agent's `puni-f3-*` VMs were left untouched.
