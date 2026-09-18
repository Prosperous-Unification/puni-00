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
