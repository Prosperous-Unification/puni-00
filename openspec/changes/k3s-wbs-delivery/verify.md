# Verification

## F8 commands and results (2026-09-18, worktree `change/tbf-f8`)

Tools: k3d v5.9.0 and kubectl v1.36.4 downloaded from the `infra/versions/toolchain.json`
URLs, `sha256sum -c` OK for both; cluster image `rancher/k3s:v1.36.4-k3s1@sha256:edad48e1…`
and registry `registry:2.8.3@sha256:46faa9a1…` from the same lock.

| Command                                                                                | SHA                    | Result                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run tool-deploy:lint` / `typecheck` / `test --skip-nx-cache`                  | pre-commit `a608c62c`  | exit 0 / 0 / 0; test 156 pass, 0 fail (k8s: 65 pass)                                                                                     |
| `bunx nx format:check --all`                                                           | pre-commit             | exit 0                                                                                                                                   |
| `kubectl kustomize deploy/k8s/wbs/overlays/{local,staging,prod}`                       | `eab2eda9`             | 25 / 23 / 23 objects rendered                                                                                                            |
| `bunx nx run tool-deploy:deploy:k3s -- --request <staging sample> --journal <scratch>` | `a608c62c`             | exit 0, plan only: 17 forward steps printed, no cluster contacted, no journal written                                                    |
| `bunx nx run tool-deploy:test:k3s` (`K3D`, `KUBECTL` = locked binaries), run 6         | `8d98168d` + worktree¹ | exit 0, all assertions below passed; `puni-f8-lab` and `k3d-puni-f8-registry` deleted afterwards                                         |
| `bunx nx run tool-deploy:test:k3s`, run 7                                              | `a608c62c`             | exit 0 via Nx; 34 assertions passed (source `a608c62ce0b5…`); writer pods max 1 over 259 / 79 / 53 samples; cluster and registry deleted |

¹ Run 6 ran on the uncommitted tree that became `eab2eda9`/`a608c62c`. The only later change was
formatting. Run 7 repeats the lab on the committed SHA.

The lab builds be/gw/fe from their repository Dockerfiles, and MCP from
`deploy/k8s/wbs/lab/mcp-01.Dockerfile`. It pushes them to the lab registry only. It also
derives two candidates from v1: `v2`, which adds `20260918000000_lab_additive`
(`ALTER TABLE work_item ADD lab_marker`), and `v2-unhealthy`, which is v2 with a CMD that exits
before it serves (the injected health fault).

Assertions observed live (run 6, repeated in run 7):

- v1 was bootstrapped, and `POST /api/projects {name: f8-row-before}` returned HTTP 200.
- **Verbatim F6 admission** (one `solverImage`): the coordinator refused at `validate` with
  "does not approve". Writes stayed open. A server-side dry-run admitted the exact
  `/run/puni/solver` Directory. It refused `/run/puni`, `/run/puni/solver/supervisor.sock`,
  `/run/puni/solver/sub`, `/var/run/docker.sock` and `/` with "exact directory root", and
  refused an unapproved backend digest with "approved backend image digest". It still
  refused `/run/puni` after the approved-set patch.
- **Induced health failure** (v1→v2-unhealthy): `rollout-backend` timed out at 90 s. The
  rollback then ran stop-writer → schema (down.sql hashes checked, `migrate-down-cli`) →
  tiers → smoke of the old release → reopen → Lease release. The release ended `rolled-back`.
  Every tier ran the v1 digest. `work_item` had no `lab_marker`, the lab migration was not
  recorded, and `f8-row-before` was present. The fence selector was exactly
  `{app.kubernetes.io/name: wbs-backend}`, and there was no Lease. Writer pods: max 1 over
  302 samples at 300 ms.
- **Interrupted rollout**: `deploy:k3s --apply` was run as a subprocess and SIGKILLed 1.5 s
  after the journal reached `migrated`, with `rollout-backend` in flight. Writes stayed
  fenced while it was dead. The rerun of the same command printed the resumed rollback plan
  from `rollback-started` and ended `rolled-back`, with the same restored-state assertions.
  Writer pods: max 1 over 191 samples across the kill and resume. Journal history: intent-persisted through migrated, then rollback-started,
  rollback-writer-stopped, rollback-schema-restored, rollback-tiers-restored,
  rollback-verified, rollback-writes-reopened, rolled-back.
- **Additive upgrade** (v1→v2): promoted. `lab_marker` existed, `f8-row-before` survived,
  every tier ran the v2 digest, and `f8-row-after-promotion` was inserted with HTTP 200.
  Writer pods: max 1 over 58 samples.
- **Second coordinator**: with a Lease held by `another-release`, the next coordinator was
  refused at `acquire-lease` with "held by another-release", and writes stayed open.

## Faults the live lab found (each fixed, then re-observed passing)

| Run | Fault observed                                                                                                                                                                                                                                                                                                | Fix                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | be-01/gw-01 crashed on `AUTH_MODE=local is forbidden in production` (images set `NODE_ENV=production`); fe-01 `exec /usr/bin/caddy: operation not permitted` (file capability outside the dropped bounding set)                                                                                               | local overlay `NODE_ENV=lab`; frontend adds `NET_BIND_SERVICE` (Restricted permits it)                               |
| 3   | `stop-writer` timed out after 90 s: completed bootstrap Job pods still carry `puni.dev/writer=true`                                                                                                                                                                                                           | writer list excludes `Succeeded`/`Failed` pods                                                                       |
| 4   | Rollback smoke Job failed every check with "Unable to connect". A fresh pod's NetworkPolicy allowances converge after it starts (the same checks passed from a pod minutes later). The release ended **`rollback-failed`** live, with the fence selector still fenced and the Lease still held by the release | smoke checks retry for a bounded 15×2 s                                                                              |
| 4   | Reopening with a JSON merge patch left `puni.dev/writes: fenced` in `matchLabels` (observed by `kubectl patch --type=merge` then `get` on the live policy), so writes would have stayed fenced after "reopen"                                                                                                 | JSON-patch `replace` of the whole `podSelector`; the lab asserts exact selector equality                             |
| 5   | A third transaction at the same bytes as the second reused its completed capture/migrate Jobs (same names). It "promoted" without applying the migration: `the additive column exists after promotion` failed                                                                                                 | per-attempt `transactionId` in the journal names every Job and snapshot; a resumed attempt still reuses its own Jobs |

## R5 failure proofs (unit, production functions)

Each guard was replaced by `false` (or its effect removed) in turn. The named test was
observed to fail, and passed again once the guard was restored (harness: bun test `-t <name>`).

| Check                                          | Injected fault          | Test observed failing                                                             |
| ---------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Full source SHA                                | guard removed           | `refuses an abbreviated source sha`                                               |
| Digest-pinned images                           | guard removed           | `refuses a tag without a digest`                                                  |
| Staging/prod name a Flux unit                  | guard removed           | `refuses staging without a named Flux unit`                                       |
| Cluster identity (kube-system UID)             | guard removed           | `refuses a different cluster behind the same context`                             |
| Expected current release                       | guard removed           | `refuses when the running release differs from expectedCurrent`                   |
| Both backend digests admitted                  | guard removed           | `refuses a backend digest admission would deny` (live: verbatim F6 refusal above) |
| Schema restore whenever capture exists         | branch disabled         | `rolls back after a crash following migrated` / `backend-ready` / `tiers-ready`   |
| Edited down.sql refused                        | comparison removed      | `refuses an edited down migration` (unit and executor, which stays fenced)        |
| Applied set equals capture + pending           | comparison removed      | `refuses a migration Job that completed without applying the captured set`        |
| Recovery needs `recovers=`                     | guard removed           | `stops at recovery-required … recovers with a fresh capture`                      |
| Candidate must not change an applied migration | comparison removed      | `refuses a capture whose applied migration the candidate edited`                  |
| Subprocess deadline                            | kill removed            | `kills a subprocess past its deadline` (waited 5000 ms)                           |
| Unknown journal phase                          | guard removed           | `rejects an unknown phase`                                                        |
| Fence reopen replaces the selector             | merge patch (live)      | live policy kept `puni.dev/writes: fenced` (run 4 cluster)                        |
| Per-attempt Job names                          | release-id names (live) | lab run 5, scenario 3 assertion failed                                            |

Observed live as a refusal only, with no removal fault injected: the foreign Lease holder at
`acquire-lease`. Two checks were neither fault-injected nor exercised: release-record drift
in `observeCluster`, and writers still present before `rolloutBackend`.

## Phase-review follow-up (2026-09-18, `7d3173c6`)

Fixes: rollback resumes Flux only onto `flux.previousRevision`, and otherwise ends
`flux-revert-required` (review item 1). The Lease holder is `<transaction>#<process>`, with a
heartbeat, expiry and a claim before the first write (item 2). The writer guard runs before
every schema Job (item 3). The coordinator writes F6's `solverImages` (merged F6 `f8265dc7`),
and the lab's policy patch is gone (item 4).

| Command                                                                             | SHA                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run tool-deploy:lint` / `typecheck` / `test --skip-nx-cache`               | tree committed as `7d3173c6`                   | exit 0 / 0 / 0; test 176 pass, 0 fail (k8s: 85)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun tools/tool-deploy/src/k8s/lab.ts` (locked `K3D`/`KUBECTL`, full image rebuild) | HEAD `b82e7ac8` + tree committed as `7d3173c6` | exit 0, 35 assertions, cluster/registry and lab images deleted. Committed F6 policy without patches: the exact dir was admitted, alternate paths and a digest outside `solverImages` were refused, and the coordinator wrote `solverImages` = `v1,unhealthy`. Health failure rolled back (writer max 1 over 297 samples). After SIGKILL at `migrated`, the rerun logged `waiting 18312ms for …#211660d6 to lapse`, took the Lease over and rolled back (max 1 over 118). The additive upgrade was promoted (max 1 over 60). Two same-request `deploy:k3s --apply` processes started together: one promoted v3; the other waited 19.9 s, then was refused with "Lease is still renewed by …" before any mutation (max 1 over 54). |

R5 fault injections for the fixes (each guard removed, the named test observed failing, then
restored):

| Check                                   | Injected fault                               | Test observed failing                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rollback resumes only onto previous rev | guard removed                                | `keeps Flux suspended when the source already serves the failed release` (fake re-applied the failed digests)                                                         |
| Rollback resumes only onto previous rev | resume onto `desiredRevision` (the old code) | `rolls back with Flux onto the previous revision only`                                                                                                                |
| Live Lease never displaced              | liveness branch disabled                     | `refuses a second live coordinator for the same request`, `refuses while a live coordinator of another …`, `refuses to resume a transaction whose live coordinator …` |
| Claim before first journal write        | record before claim                          | `refuses to resume a transaction whose live coordinator still renews the Lease` (journal overwritten)                                                                 |
| Renew before each step                  | renewal removed                              | `stops when another process takes the Lease` (migrate ran after the takeover)                                                                                         |
| Writer guard on every schema Job        | guard removed in `runJob`                    | `refuses every schema Job while a writer runs: migrate / observeDownMigrations / rollbackSchema / capture` (fake kubectl logged `create`)                             |
| Admission params belong to this cluster | running-backend check removed                | `refuses admission parameters that do not approve the running backend`                                                                                                |
| Coordinator writes `solverImages`       | `admit-images` write skipped                 | `admits the candidate and rollback digests before any backend pod starts` (fake admission denied capture)                                                             |

## Not verified, with prepared next steps

- **Solver in the Ubuntu VM lab** (real solve, socket replacement and reconnect, refusal of
  an alternate host path on a real node). This is blocked on this host: `multipass` is not
  installed, and no Ansible role installs the solver supervisor
  (`infra/ansible/roles/` has base/k3s_agent/k3s_server/network/storage only). Prepared
  sequence once both exist:
  `bunx nx run tool-fleet:lab -- up --lab-id f8-solver --profile platform --ssh-public-key … --ssh-private-key …`,
  then install `deploy/solver-supervisor/wbs-solver-supervisor.service` with its runtime
  directory `/run/puni/solver`, label the node `puni.dev/capability-product=true`, apply F6
  policy, bootstrap as `lab.ts` does, and run
  `deploy:k3s --apply` plus an optimize request against a seeded project.
- **Flux vs. the coordinator over `solverImages`.** Platform Flux reconciles the same
  ConfigMap the coordinator writes. F6/F11 must keep Flux from reverting `data.solverImages`
  mid-release. The lab has no Flux, so this is not observed.
- **Flux suspend/resume, the GitRepository revision checks and `flux-revert-required`**
  are unit-tested with the fake only (its resume applies the manifests of the served revision). The lab has no Flux (`flux: null`, local).
- **Hetzner CSI access mode (RWO vs RWOP), OIDC auth smoke (401 for anonymous), and
  staging/prod apply** are plan-only in F8 and belong to F11.
- **The MCP production image** has no Dagger target. The lab Dockerfile is not a production
  path.

## F11 commands and results (2026-09-18, worktree `change/tbf-f11`)

Commits: `1be744b5` descriptor/promotion/publish, `d86292bb` workflows, `19556f26` fleet check,
`fb4f771a` merge of `9088797e`, `3a60d6c5` solverImages order, `e89955fb` cutover,
`e75a4e1f` restore-marker fix. Locked tools: kubectl v1.36.4 and helm v4.3.0 from the
toolchain URLs, shellcheck 0.11.0 and actionlint 1.7.12 from `check-tools.json`, each
`sha256` verified by `check-provision.ts` (the actionlint and shellcheck digests were also
compared with the GitHub release API's asset digests); k3d v5.9.0 `sha256sum -c` OK.

| Command                                                                        | SHA / tree                 | Result                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint typecheck -p tool-deploy tool-fleet --skip-nx-cache` | `fb4f771a`                 | exit 0                                                                                                                                                                                                                                        |
| `bun test` in tool-deploy / tool-fleet                                         | `e75a4e1f`                 | 233 pass 0 fail / 204 pass 0 fail                                                                                                                                                                                                             |
| `bunx nx format:check --all`                                                   | before each commit         | exit 0                                                                                                                                                                                                                                        |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                       | docs tree after `e75a4e1f` | 95 items, 95 passed                                                                                                                                                                                                                           |
| `bunx nx run tool-fleet:check:faults`                                          | `e75a4e1f`                 | exit 0: clean copy exit 0; each of 9 faults exit 1 naming its family (schema; yaml [+kustomize]; ansible-syntax; ansible-inventory; kustomize; helm; shellcheck; workflows; executables). Pending inventory `network:` applied to copies only |
| `bunx nx run tool-fleet:check`                                                 | `e75a4e1f`                 | **exit 1**: test/lint/typecheck pass; every family passes except `ansible-inventory` on both committed inventories: `Could not set puni_private_ipv4 … 'hcloud_private_ipv4' is undefined` (see findings)                                     |
| `bunx nx run tool-deploy:rehearse:cutover` (`K3D`, `KUBECTL` locked), run 4    | `e75a4e1f`                 | exit 0; all assertions below; every `puni-f11-*` container, network, image and k3d object deleted (`docker ps -a` shows none)                                                                                                                 |

Cutover rehearsal, run 4 (06:43–06:45Z): old side = `tier.compose.tmpl`/`site.caddy.tmpl`
rendered for be/gw/fe plus a Caddy edge importing `log-redact.caddy`, the images' own
`migrate-cli`/`migrate-status-cli`. Two known projects written through the edge (HTTP 200).
Fence: POST 503, GET 200, `/ws` 503. Gateway drained at 0 connections. Writer stopped. Export
`e2fe3457…`: 44 migrations, newest `20260912120000_add_work_item_facts` equal to the status CLI,
integrity `ok`, no FK violations, both known rows. **Tampered export** (one byte appended):
the restore Job failed with "copied export is …, not e2fe3457…" and wrote nothing. Real restore:
same SHA-256, migrations and per-table counts, owner UID 10001. Tiers rolled out, release record
written and read back by `currentRelease`, F8 smoke Job 5/5 ok, `GET /api/projects` with
`Host: wbs.f11.test` served both rows. After the (simulated) switch the old edge still refused
writes; the pre-switch rollback (start be/gw, restore the site file, reload) accepted a new write
and left the old migration status unchanged. Fence to k3s serving: 06:44:11 → 06:45:16 (65 s),
30 s of which is `docker stop --time 30` on gw-01 (it did not exit on SIGTERM).

Faults the rehearsal found (fixed, then re-observed passing): run 1 asserted every exported
migration against `migrate-status-cli`, which prints only the newest (my assumption, corrected);
run 3's refused tampered restore left `cutover-incoming.done`, so the real restore Job read the
stale bytes and exited before the copy (`e75a4e1f`: refused bytes are deleted, a stale marker is
refused).

### R5 failure proofs (each guard disabled, the named test observed failing, then restored and passing)

| Check                                              | Test observed failing                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Digest-pinned tier image in a candidate            | `refuses a tag-only tier image`                                                                                            |
| Gate run is for the descriptor's commit            | `refuses gate evidence for another commit`                                                                                 |
| `pixels` job passed                                | `refuses a run whose browser job did not pass`                                                                             |
| `requireDeploymentAdmission` on every tier (seal)  | `refuses an admission record for another commit` (call replaced by a pass-through)                                         |
| Fresh admission has the descriptor's activation    | `refuses a fresh admission from another activation`                                                                        |
| Prod digests equal the staging proof's             | `refuses a production digest staging did not prove`                                                                        |
| State directory is 0700                            | `refuses a state directory others can read`                                                                                |
| Descriptor SHA-256 is the requested one            | `refuses a descriptor other than the one named`                                                                            |
| Prod reads the staging proof                       | `refuses production before staging proved the descriptor`                                                                  |
| Resume only the recorded request                   | `refuses to resume a journal recorded against another cluster context`                                                     |
| Publish only while the WBS unit is suspended       | `refuses to publish the desired revision while the WBS unit is not suspended`                                              |
| Publish only from `previousRevision`               | `refuses to move a deploy branch someone else moved`                                                                       |
| `solverImages` candidate first                     | `admits the candidate then the rollback digest, once when they are equal`                                                  |
| Strict YAML                                        | `refuses duplicate keys and malformed YAML`                                                                                |
| New executable needs a shellchecking target        | `refuses a new executable no target shellchecks`                                                                           |
| Inventory lists exactly its own cluster            | `refuses an inventory that lists a foreign-cluster host`                                                                   |
| Locked tool digest                                 | `refuses a download whose digest differs from the lock, installing nothing`                                                |
| Export integrity / FK / restored bytes / owner UID | `refuses an export whose integrity_check …`, `… foreign key violations`, `… different bytes`, `… backend UID does not own` |
| Workflow: main-only dispatch (run block)           | `refuses a dispatch from any ref but main` (exit 0 instead of 78)                                                          |
| Workflow: installed-package route (run block)      | `refuses admission on the archive-launcher route` (exit 127 instead of 78)                                                 |

Live family-level negatives are the `check:faults` rows above; the restore SHA-256 refusal was
observed live in the rehearsal.

### tool-devsync baseline

Before merging `9088797e`, the suite showed 15 failures on this branch; three were F11's
(`tool-deploy:test` reading `ci.yml`, the overlays and be-01 without declaring them) and were
cleared by the `tool-deploy` test inputs. After the merge two more were F11's and are fixed:
`cutover-rehearsal.ts` spelled the tier union itself (`b4e302cb`), and the index checker could
not resolve the then-untracked `cutover-plan.md`. The final count is recorded below.

### Not verified, with prepared next steps

- **`tool-fleet:check` is red on the committed tree**: both hcloud inventories use
  `connect_with: private_ipv4` without `network:`, so hetzner.hcloud 7.0.1 sets no
  `ansible_host`/`hcloud_private_ipv4` and `strict: true` aborts. Fix (infra/ansible, not owned
  here): `network: puni-platform` / `network: puni-workers` (Terraform names the networks
  `puni-<cluster>`).
- **Workflows in real GitHub Actions**: neither `infra-check` nor `deploy-k3s` has run. Unverified:
  `docker load` of the controller OCI on `ubuntu-latest`, artifact download across runs, the
  protected environments, and the `puni-deploy` runner.
- **Staging rollout/rollback through `deploy-k3s`**: blocked on the installed-package admission
  route (P5 flip), the WBS Flux unit and deploy repository, the environments/secrets/variables in
  [deployment.md](../../../docs/infra/deployment.md#cicd), and a production MCP image.
- **h2puni gate**: `bin/h2puni-gate.sh <sha>` not run from this worktree (the gate host is h2puni).
- **Production cutover**: plan only ([cutover-plan.md](../../../docs/infra/cutover-plan.md));
  no authorization, nothing applied.
