# Verification

## P0 MCP k3s wiring (2026-09-27, `batch-9/080-20-mcp-k3s`)

The manifest now gives MCP a dedicated PVC and `Recreate` rollout, sets its store path, and
sources current keys plus optional previous rotation slots from `wbs-mcp-secrets`. Local uses
the retained `puni-local` class; staging and prod use `puni-retain`. The lab creates a fresh
Secret once per disposable cluster and collects capped, redacted MCP pod descriptions and
current/previous logs if a rollout fails. Production declares an operator-provided Secret;
the SOPS ciphertext and credentials remain deployment inputs, not committed test values.
The production MCP Dockerfile is now an admitted Dagger tier and the F8 lab builds it.

| Command                                                                 | Observed result                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run tool-deploy:test --skip-nx-cache`                          | exit 0, 262 pass, 0 fail                                                                                                   |
| `bunx nx run tool-dagger:test --skip-nx-cache`                          | exit 0, 64 pass, 0 fail                                                                                                    |
| `bunx nx run wbs-mcp-01:test --skip-nx-cache`                           | exit 0, 165 pass, 0 fail                                                                                                   |
| `PUNI_TOOL_CACHE=/tmp/puni-tools bunx nx run tool-fleet:check`          | exit 0, including its dependent tests and rendered manifest checks                                                         |
| `bunx nx run tool-deploy:lint`                                          | exit 0                                                                                                                     |
| `bunx nx run tool-dagger:lint`; `bunx nx run tool-dagger:typecheck`     | exit 0 for both                                                                                                            |
| `bunx nx run tool-deploy:typecheck`; `bunx nx run wbs-mcp-01:typecheck` | exit 0 for both                                                                                                            |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                | exit 0, 106/106 change items and 12/12 specs                                                                               |
| `bunx prettier --check` on the touched files                            | exit 0                                                                                                                     |
| `bunx nx run tool-deploy:test:k3s` (sandbox)                            | stopped at `docker build`: buildx could not write `/home/df/.docker/buildx/activity` (read-only). See the live runs below. |

R5 proofs: `mcp-manifest.test.ts` first failed because `mcp-storage.yaml` did not exist. After
implementation, deleting the production manifest's `MCP_STORE_KEY_CURRENT` Secret ref made
`mounts a retained single-writer store and sources rotating keys from a Secret` fail; restoring
it passed. Deleting the lab diagnostic's generated-key replacement made `bounds pod diagnostics
and removes generated key material` fail because the test found the injected key; restoring it
passed. The MCP OAuth startup test also passed with `MCP_STORE_KEY_CURRENT` omitted and asserted
the named `MCP_STORE_KEY_CURRENT` error. Replacing the lab Secret-write refusal with an
unconditional return made `fails a rejected lab Secret write without disclosing its keys` fail;
restoring the refusal passed. Adjacent `Proof:` comments mark the changed safety paths.
Routing the Dagger `mcp` tier to the gateway image made `names the MCP release image by its own
tier` fail; restoring the mapping passed.

### Live k3d rehearsal (2026-09-27, writable Docker host)

`K3D=/tmp/puni-tools/k3d-v5.9.0/k3d KUBECTL=/tmp/puni-tools/kubectl-v1.36.4/kubectl env -u CLAUDECODE bunx nx run tool-deploy:test:k3s`:

- Run 1, `de637fc6` (author's code): exit 0, all assertions passed. Its store check hashed
  `sessions.sqlite` before and after a restart. Review found that a fresh store with the same
  schema could pass it, so it did not prove persistence.
- Run 3, `d1e4ac07`: exit 0, 38 assertions passed. The cluster and registry were deleted afterwards. The MCP lines were:
  - `assert ok: MCP OAuth session survives a pod replacement`. The lab writes an encrypted
    session family through the pod's `McpSessionStore`, using the pod's `MCP_STORE_PATH` and
    Secret key, restarts the Deployment, then decrypts it again in the new pod.
  - `MCP without a store key: pod wbs-mcp-7cc9cdc5c-cjbbg exited 1; log: … error:
MCP_STORE_KEY_CURRENT is required`, then `assert ok: MCP pod without a store key exits
non-zero and names the key in its log`.
  - `assert ok: MCP OAuth session survives a failed rollout and key restore`.
- The redacted run logs contain no key material. The only long base64-like strings are
  hexadecimal image and snapshot digests.

Negatives on the kept run 2 cluster (`lab.ts --keep`, same code; deleted afterwards):

- **MCP session persistence negative.** Before the fault, reading the lab session returned
  `f8-lab-upstream-token`. After the `mcp-store` PVC volume was replaced with an `emptyDir`
  and the rollout finished, the same read returned `missing`.
- **Key deleted from the Secret.** Removing `MCP_STORE_KEY_CURRENT` from `wbs-mcp-secrets`
  stopped the pod at `CreateContainerConfigError`: `couldn't find key MCP_STORE_KEY_CURRENT
in Secret wbs/wbs-mcp-secrets`. The process never started, so the lab blanks the value to
  observe the app's own refusal.

Still unverified: provisioning the production SOPS Secret, and publishing and pulling a
production MCP image with Dagger. The prod `externally-provided.json` for `wbs-mcp-secrets`
declares the Secret only. No validator reads it; the platform Secret closure covers
`infra/platform/secrets/<cluster>` only.

Astra review advised required current and optional previous key refs, runtime lab generation
through stdin, an external declaration until genuine SOPS ciphertext exists, and bounded
redacted diagnostics. It noted that the platform Secret closure validator covers only the
platform graph; the WBS overlay declaration must not be mistaken for provisioning.

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
derives two candidates from v1: `v2`, which adds `29991231000000_lab_additive` (stamped `20260918000000` before 2026-09-27)
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

Superseded in part: the VM-lab solver rows are in "F8 solver in the Ubuntu VM lab" and the k3s-pod
solve in "F8 real solve from a k3s pod" below; Flux suspend/resume ran in the `d2f2ad4a`
rehearsals. What stays open is listed in "F12 status".

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

## F8 solver in the Ubuntu VM lab (2026-09-18, worktree `change/tbf-vm`)

Lab: rootless QEMU platform profile (`tool-fleet:lab -- up --provider qemu --lab-id f8 --profile
platform`, exit 0 at `dee87bcc`); product-capable `server-1`, observability agent. Role:
`infra/ansible/roles/solver` via `playbooks/solver.yml` (commit `47f4986e`), Bun 1.4.2
(`bun-linux-x64.zip` SHA-256 `36368fae…a913`), bundle from `bunx nx run tool-remote-scripts:build`
(SHA-256 `2fe2ddb9…b696`). What ran is a minimal backend, stated precisely: a Deployment in
`wbs-solver` shaped like `deploy/k8s/wbs/base/backend.yaml` (service account, controller label,
product node selector, uid 10001, Restricted security context, `/run/puni/solver` Directory
hostPath at `/run/wbs-solver`) running `docker.io/oven/bun@sha256:d888c0ae…` with a probe that
connects to the socket every 5 s. The real WBS backend image was not deployed.

| Step                                                                                                                                          | Result                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Solver play on the observability agent                                                                                                        | exit 2 at the first assertion; nothing installed                                                                                                                                                                                     |
| Solver play with a one-byte-different bundle SHA-256                                                                                          | refused before copy; no user or package on the node                                                                                                                                                                                  |
| Solver play on server-1                                                                                                                       | first run exposed `become_user` needing a sudo password (fixed: `systemctl --user -M`); then exit 0; rerun `changed=0`                                                                                                               |
| Runtime link                                                                                                                                  | `/run/puni/solver -> /run/user/10001/wbs-solver`, socket `srwxrwxr-x wbs-solver`                                                                                                                                                     |
| Admission (F6 policy applied with `kubectl apply -k infra/platform/policy`, `solverImages` set to the probe digest), server-side Pod dry-runs | exact `/run/puni/solver` admitted; `/run/puni`, `/run/user/10001/wbs-solver`, `/run/puni/solver/supervisor.sock`, `/var/run/docker.sock`, `/` denied ("exact directory root"); other digest denied ("approved backend image digest") |
| Pod on server-1 connects                                                                                                                      | reached socket inode 48; supervisor logged "connection refused: supervisor peer cgroup: no full Docker container id found"                                                                                                           |
| Socket replacement                                                                                                                            | supervisor restart: inode 48 → 50; the running pod's next attempt used inode 50 and reached the new listener (pid 9986)                                                                                                              |
| Node reboot                                                                                                                                   | link recreated by tmpfiles, supervisor active via linger, pod restarted and reached new inode 37                                                                                                                                     |
| Node removal while the pod runs                                                                                                               | retirement workload check (`cluster-checks.py workloads`) exit 1 "wbs-solver/wbs-backend… needs a maintenance transaction"; exit 0 after scaling the backend to 0                                                                    |

Faults found along the way: the F6 policy's `solverImages` regex rejects `name:tag@digest`
(the bun lock uses a tag), so the digest-only form is required; Restricted container fields
(`runAsNonRoot`, `seccompProfile`) are required per container, not only per pod.

Not verified, with the reason (superseded: "F8 real solve from a k3s pod" below solved through
the containerd peer identity at `93960ee0`):

- **A real solve from a k3s pod is blocked by the supervisor.** It identifies peers only by a
  Docker cgroup (`solver-supervisor-peer-cgroup.ts`); the k3s pod's cgroup is
  `…/cri-containerd-900f7bfb….scope`, so every pod connection is refused, approved or not. The
  supervisor also drives solver containers through the Docker CLI, so the role installs
  `docker.io` next to k3s containerd. A containerd/Kubernetes peer identity in
  `tools/tool-remote-scripts` is needed before the backend can solve in k3s.
- **"Refusal of an unapproved workload"** is observed only in that general form; the
  supervisor could not distinguish approved and unapproved k3s pods.
- **Solver state transfer** has no mechanism; scaling the backend to zero stood in for it.
- A Docker-peer solve (`be-01-blue` container on the node) was not attempted: 1.6 GB image
  and 2 GiB VM memory.

## F11 commands and results (2026-09-18, worktree `change/tbf-f11`)

Commits: `1be744b5` descriptor/promotion/publish, `d86292bb` workflows, `19556f26` fleet check,
`fb4f771a` merge of `9088797e`, `3a60d6c5` solverImages order, `e89955fb` cutover,
`e75a4e1f` restore-marker fix. Locked tools: kubectl v1.36.4 and helm v4.3.0 from the
toolchain URLs, shellcheck 0.11.0 and actionlint 1.7.12 from `check-tools.json`, each
`sha256` verified by `check-provision.ts` (the actionlint and shellcheck digests were also
compared with the GitHub release API's asset digests); k3d v5.9.0 `sha256sum -c` OK.

| Command                                                                        | SHA / tree                 | Result                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint typecheck -p tool-deploy tool-fleet --skip-nx-cache` | `fb4f771a`                 | exit 0                                                                                                                                                                                                                                                                                                                                                                |
| `bun test` in tool-deploy / tool-fleet                                         | `e75a4e1f`                 | 233 pass 0 fail / 204 pass 0 fail                                                                                                                                                                                                                                                                                                                                     |
| `bunx nx format:check --all`                                                   | before each commit         | exit 0                                                                                                                                                                                                                                                                                                                                                                |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                       | docs tree after `e75a4e1f` | 95 items, 95 passed                                                                                                                                                                                                                                                                                                                                                   |
| `bunx nx run tool-fleet:check:faults`                                          | `e75a4e1f`                 | exit 0: clean copy exit 0; each of 9 faults exit 1 naming its family (schema; yaml [+kustomize]; ansible-syntax; ansible-inventory; kustomize; helm; shellcheck; workflows; executables). Pending inventory `network:` applied to copies only                                                                                                                         |
| `bunx nx run tool-fleet:check`                                                 | `e75a4e1f`                 | **exit 1**: test/lint/typecheck pass; every family passes except `ansible-inventory` on both committed inventories: `Could not set puni_private_ipv4 … 'hcloud_private_ipv4' is undefined` (see findings)                                                                                                                                                             |
| `bunx nx run tool-deploy:rehearse:cutover` (`K3D`, `KUBECTL` locked), run 4    | `e75a4e1f`                 | exit 0; all assertions below; `puni-f11-*` containers, images, Compose network, cluster and registry deleted. The Docker network `k3d-puni-f11-cutover` remained and was removed by hand; `40cc30e7` adds it to the cleanup. Run 5 on `e1f86f02` (after merging `e170c948`): exit 0, all 18 assertions passed, and no `puni-f11` container, network or image remained |

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
not resolve the then-untracked `cutover-plan.md`. At `577c1b4d`: `tool-devsync` 216 pass 0 fail,
`tool-deploy` 233/0, `tool-fleet` 204/0, and `gate-entrypoints.test.ts` (with the target's
`TOOL_WIKI_TRUSTED_NODE_MODULES`) 57/0. The cutover rehearsal ran at `e75a4e1f`; `b4e302cb` only
changed a type annotation in it.

## Backup move and Fable review repairs (2026-09-18)

Commits: `bbf365a9` merge of `e170c948`; `e1f86f02` tracked workflows; `ece5efb2` SQLite backup
shipped with the release; `bb152e74` fleet check green (inventory `network:`, loaded controller,
strict rendered YAML); `62d94f56` digest binding, gate event, mainline, recovery, publish before
reopen, downgrade and proof age, `refs/wbs/desired`; `4bbdec10` runner hook, workflow inputs,
cutover plan. Runs below are on `4bbdec10` unless stated.

| Command                                                                  | Result                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` tool-deploy / tool-fleet / tool-devsync                       | 254/0, 243/0, 245/0                                                                                                                                        |
| `gate-entrypoints.test.ts` (`TOOL_WIKI_TRUSTED_NODE_MODULES` set)        | 57/0                                                                                                                                                       |
| lint + typecheck tool-deploy, tool-fleet, tool-dagger                    | exit 0                                                                                                                                                     |
| `bunx nx format:check --all`                                             | exit 0                                                                                                                                                     |
| `bun tools/tool-fleet/src/check-cli.ts` (the `tool-fleet:check` command) | **exit 0**, every family passed (26 executables, 3 overlays with a matching backup)                                                                        |
| `bunx nx run tool-fleet:check:faults`                                    | exit 0: clean copy passes; 11 faults each fail naming their family, incl. inventory without `network:` and a backup path mismatch                          |
| `bunx nx run tool-deploy:test:backup` (k3d `puni-f11-backup`)            | exit 0, 13 assertions (below)                                                                                                                              |
| `bunx nx run tool-deploy:rehearse:cutover`                               | exit 0, 18 assertions                                                                                                                                      |
| `bunx nx run tool-deploy:test:k3s` (F8 lab, now with the backup CronJob) | exit 0, 35 assertions; `solverImages` observed candidate-first; the lab's k3d network was left and removed by hand, cleanup added to `lab.ts` (not re-run) |

Backup lab, live: F6 admission denied the job pod under the old `bun:1.4.2-alpine` image
("approved backend image digest") and admitted it under the release backend digest; the
rendered CronJob ran that digest; `kubectl create job --from=cronjob/sqlite-backup` succeeded
against a real `wbs-data` PVC holding a row written through the API, uploaded a versioned
object to the local object store with `sourceRevision` from `wbs-release`/`sourceSha` and 44
migrations; the runner's `restore` mode (backend image, backend identity) rebuilt a fresh PVC,
and the restored file carried the known row, the reported SHA-256, integrity `ok`, no FK
violations and the reported migration set.

Faults found on the way (fixed, then re-observed passing): the base-file unit test of the
backup judge passed while the real rendered overlays failed (`kubectl kustomize` re-sorts map
keys); the judge now compares canonically.

R5 failure proofs added (guard disabled, named test observed failing, restored passing):
backup judge namespace, image, `PUNI_SOURCE_REVISION` and runner bytes (`check-backup.test.ts`);
coordinator moves the CronJob image with the backend (`moves the backup CronJob …`); loaded
controller manifest digest (`refuses a loaded archive …`); tier built from another commit;
pull_request gate run; registry label (`refuses an image built from another commit`) and the
deploy-time call (`refuses a descriptor whose image the registry labels …`; the run went on to
the cluster without it); commit on main and downgrade (`source.test.ts`); proof age; malformed
`recovers` (CLI and workflow block); publish before reopen (with the publish moved back into
`reconcile-desired` it ran after `reopenWrites`); runner hook (a PR workflow ref started).

Flux in the rehearsal (review M5), done after the coordinator pointed to the F6 pattern
(`d2f2ad4a`, run on that SHA via `bunx nx run tool-deploy:rehearse:cutover`, exit 0, 38
assertions, every `puni-f11-*` object and the k3d network removed): locked Flux controllers
(`infra/platform/flux/install.yaml`, digest checked), a lab deploy repository served read-only
over Git smart HTTP (`git-http.ts`, `git http-backend` behind Bun on the k3d network gateway),
`GitRepository wbs-deploy` and `Kustomization wbs` (interval 10s) over it.

- **Negative**: with the unit active and the source naming the release, applying the manifests
  with `replicas: 0` by hand lost to Flux: it re-applied `replicas: 1`, a writer started and
  created `/data/wbs.sqlite`, and the restore Job refused (`already exists; refusing to overwrite
it`).
- **With the new `suspend-flux` phase**: suspension was recorded before `replicas: 0`; with the
  release pushed to the source and a reconcile requested during the restore, no backend pod
  appeared (max 0 over 54 samples) and nothing new was applied; step 8's resume applied the
  committed release with the restored digests (at most one backend pod).
- **F8 `deploy:k3s` through the unit**: the coordinator published the prepared revision exactly
  once, observed suspended with the branch at the previous release, then resumed; Flux applied
  the desired revision; the known rows survived; at most one backend pod.
- **Rollback**: suspended first, then scaled to zero and the release record deleted; through two
  intervals with a reconcile requested the writer stayed stopped.
  Faults found on the way: a placeholder in a namespace that did not exist yet kept the unit
  unready; resuming before the source served the reset commit re-applied the older release and
  started a writer (the plan now checks the artifact revision before resuming); `puni-local`
  retains volume data after PVC deletion, so the raced database is wiped in place.

The F8 lab rerun on `d2f2ad4a` failed scenario 3 with `Lease lost during reconcile-desired:
… Conflict`: the heartbeat and the pre-step renewal raced on one resourceVersion. `1e5b99cb`
serializes renewals (`never renews the Lease concurrently`: 4 in flight with the queue removed,
1 with it); the lab then passed on `1e5b99cb` (exit 0, 35 assertions), and its cleanup removed
the `k3d-puni-f8-lab` network (re-run of the `lab.ts` line: no `f8` container or network left).

### Not verified, with prepared next steps

- **Registry labels on real images**: `tool-dagger` now adds `WBS_SHA`, but no Dagger publish has
  run; until one does, every real image lacks the label and descriptor sealing refuses it.
- **Workflows in real GitHub Actions**: neither `infra-check` nor `deploy-k3s` has run. Unverified:
  `docker load` of the controller OCI on `ubuntu-latest`, artifact download across runs, the
  protected environments, and the `puni-deploy` runner.
- **Staging rollout/rollback through `deploy-k3s`**: blocked on the installed-package admission
  route (P5 flip), the WBS Flux unit and deploy repository, the environments/secrets/variables in
  [deployment.md](../../../docs/infra/deployment.md#cicd), and a production MCP image.
- **h2puni gate**: `bin/h2puni-gate.sh <sha>` not run from this worktree (the gate host is h2puni).
- **Production cutover**: plan only ([cutover-plan.md](../../../docs/infra/cutover-plan.md));
  no authorization, nothing applied.

## F8 real solve from a k3s pod (2026-09-18, `change/tbf-vm` at `93960ee0`)

- **Lab.** Rootless QEMU platform profile `f8`. Solver role at `93960ee0`: docker.io
  `29.1.3-0ubuntu3~24.04.2` and Bun 1.4.2 from toolchain.json, plus the CRI peer helper.
- **Image.** A WBS backend image built from `apps/wbs/be-01/Dockerfile` at the branch head
  (`wbs-be-01@sha256:428d3918…`), served from a lab-only registry on the host (`10.0.2.2:5999`).
  containerd and Docker each had a lab-only insecure-registry entry for it; that configuration
  is a lab step, not part of the role.
- **Deployment.** The real backend ran in `wbs-solver` in the shape of `base/backend.yaml`,
  with an emptyDir DB and `MIGRATE_ON_STARTUP=true` for this minimal deployment. F6 admission
  was applied from `infra/platform/policy` with `solverImages` set to that digest.

| Step                                                                  | Result                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import of a two-row plan (`planDocumentFixture` with optimization on) | `201`; both variants `ready`/`proven`, finish `fast 6, pri 6, time 6`; supervisor journal shows `puni-cri-peer <id>` via sudo                                                                                       |
| Refusals seen before the fixes                                        | `callerId is not a full Docker container id` (pod HOSTNAME claim), `searchWorkers … 1 through 1` (role set 1), `image does not match its mapping` (helper returned the local image id): each fixed, then re-run     |
| Socket replacement                                                    | supervisor restart, inode 68 → 75; the next import solved `ready`/`proven` through the new listener                                                                                                                 |
| Host process on the node (`runuser -u wbs-solver python3` connect)    | refused: `supervisor peer cgroup: no full container id found`                                                                                                                                                       |
| Unit negatives                                                        | exact kubepods scope only (prefix, child suffix, QoS mismatch, host scope refused); pod name bound only to the runtime alias; wrong namespace/container/state/id refused; helper refuses anything but one 64-hex id |

Observed but not fixed: after each successful attempt the supervisor logged `systemctl --user
stop …deadline….service exited 5: Unit … not loaded`. The attempts still completed, and no
deadline units were left behind.

## F12 status (2026-09-18)

`tasks.md` now separates what ran from what is blocked. Flux suspend/resume against a live
source is checked because the `d2f2ad4a` rehearsals above ran it; the solver admission and
socket rows are checked from the VM lab section, and the k3s-pod solve from its own section. A
release-path solve with the retained PVC on a VM node, the Hetzner access mode (RWOP), OIDC,
GitHub Actions, staging, the h2puni gate and the production cutover stay open, each with its
next command. F12 fixed the `descriptor -- seal` example in `docs/infra/deployment.md` (it
lacked `--repository` and `--main-ref`) and bounded the `test:k3s` wait for the `migrated`
phase at 900 s. The command-table runs are in the k3s-platform verify.md, F12.

## Lab migration stamp overtaken on main (2026-09-27)

CI run 36296199037 (infra-check on `a6004037f`) failed `k3s-rehearsal` with `ASSERTION
FAILED: release ended rolled-back`. The MCP readiness warning in the collected diagnostics was
a normal start-up probe: the pod was Ready and had not restarted. The real failure was in
scenario 1: `rollback-schema failed: after rollback the database records [...,
20260918000000_lab_additive, 20260927120000_add_organization_records, ...]`. Round 6 had
landed `20260927120000`, `20260927130000` and `20260927150000`. The lab migration's stamp now
sorted before the captured baseline, and `migrationsToRollback` reverses only `created_at >
baseline`, so the lab column survived the rollback.

Fix: the lab migration is restamped `29991231000000_lab_additive` (`LAB_MIGRATION` in
`lab.ts`). `lab-migration.test.ts` requires it to sort after every folder in
`apps/wbs/be-01/drizzle`. `infra-check.yml` now also runs on `apps/wbs/be-01/drizzle/**` and
`libs/wbs/adapters/store-sqlite/src/migrate-down.ts`, because the PRs that added those
migrations never ran the rehearsal.

| Command (`K3D`, `KUBECTL` = locked v5.9.0 / v1.36.4, `env -u CLAUDECODE`)      | Source             | Result                                                                                       |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `bunx nx run tool-deploy:test:k3s`                                             | `8926d6be2` (main) | exit 1: scenario 1 `rollback-schema failed`, then `release ended rolled-back`; reproduces CI |
| `bun test src/k8s/lab-migration.test.ts`, old stamp                            | `8926d6be2` + test | fail: `Expected: > 20260927150000`, `Received: 20260918000000`                               |
| `bunx nx run tool-deploy:test:k3s --skip-nx-cache`, restamped, clean lab state | `8926d6be2` + fix  | exit 0, 38 assertions, `all lab assertions passed`                                           |

A rerun right after the failed run, reusing `tmp/puni-f8-lab`, failed before `validate`
because the failed run left its `health-failure.json` journal behind. Removing the lab state
directory fixed it. CI runners always start from a clean state.

## F11.1a replay observation foundation — 2026-10-14

Based on exact #424 head `3813d3c8b17b640ac541b8d73202ff8efa97550b`.
`tools/tool-deploy/src/k8s/replay-capability.ts` provides generated read-only SQLite
inventory argv and digest-bound image capability observation. This slice adds no
release coordinator call, deployment command, manifest application or activation.
The existing project-wide Nx source inputs already include both new files; no
additional cache input is required. The deployment runbook indexes the helpers.

Fresh verification in the isolated worktree:

- Initial TDD RED: focused Bun test failed to import the missing helper
  (`/tmp/k8s-replay-initial-red.log`).
- Focused Bun generated-script fixtures: 9 pass, 0 fail. Fixtures cover nested
  forward/inverse batches, precondition-only and empty markers, mixed histories,
  per-row marker reset, replacement counts, empty journals, malformed state,
  missing/unreadable database/journal, prior/current image CLI roots and all bad
  CLI path/execution/output cases.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test`:
  334 pass, 0 fail, 1012 assertions (`/tmp/k8s-replay-nx-test-unrestricted.log`).
  The first sandbox run failed only on local registry/Git fixture listeners
  (`EPERM`); rerunning with authorized local-listener permissions passed.
- The same Nx environment with `tool-deploy:lint` and `tool-deploy:typecheck`:
  passed. The initial default Nx invocation printed socket refusal without
  executing its target; it is not counted as validation.
- Strict OpenSpec validation passed through the already cached executable:
  `bun /tmp/bunx-1000-@fission-ai/openspec@latest/node_modules/@fission-ai/openspec/bin/openspec.js validate k3s-wbs-delivery --strict`.
  `bunx openspec` was not an executable package; the corrected cached package is
  `@fission-ai/openspec`.

Watched R5 faults each produced RED followed immediately by restored GREEN,
with logs `/tmp/k8s-replay-proof-<fault>-{red,green}.log`. Adjacent `Proof:`
comments name the corresponding fixture/fault:

| Fault                                                                             | Observed failure                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `forward`, `inverse`, `move-marker`                                               | Nested marker inventory lost required capability                             |
| `precondition-marker`, `row-reset`                                                | Precondition/empty map capability missing or counted in plain following row  |
| `replacement`                                                                     | Replacement count lost                                                       |
| `precondition-shape`, `unknown-kind`                                              | Malformed trusted history accepted                                           |
| `command-shape`, `batch-shape`, `payload-shape`                                   | Required named malformed-state diagnostic lost                               |
| `journal-missing`, `db-path`                                                      | Missing required state incorrectly became empty history                      |
| `cli-path`, `source-permissions`, `source-read`, `source-search`, `cli-execution` | Invalid or unreadable image root incorrectly advertised old empty vocabulary |
| `exit-status`                                                                     | CLI printing valid `[]` then exiting 1 incorrectly accepted                  |
| `digest`                                                                          | Mutable image reference reached observation                                  |
| `capability-shape`                                                                | Object/numeric/duplicate vocabulary accepted                                 |

Permission fixtures also injected unreadable database and CLI files using
`chmod 000` under a nonprivileged runner and observed refusal. No live container,
Kubernetes cluster, h4 proof, canonical host gate, CI, restore/cutover, or
forward/rollback/resume compatibility integration ran in this slice. F11.1 stays
open until coordinator evidence is durable and validated under the writer fence
and Lease, rollback refuses before tier rollout/reopening, and the restore guard
and live acceptance proofs are complete.

## F11.1b Kubernetes replay coordinator — 2026-10-14

Based on exact published #428 head `6ca34e08a2fcc337ef6a5eb41e3ac807fad519d8`,
in isolated branch `feat/k8s-step-replay-coordinator-sol`. Forward receipts are
durable at `replay-checked` before capture/migrate; fresh rollback receipts are
durable at `rollback-replay-checked` before tier restoration and reopening.
Schema 3 validates original receipt bytes, projections, target, transaction,
direction, kind/count inventory and exact image observations before resume
mutates either journal or cluster. Schema 1/2 use the explicit prior-executor/
manual-recovery refusal. Failure reports include receipt digests, the failed
replay step and required kind/image, plus the manual command. Restore/cutover
activation remains outside this slice.

Fresh verification:

- TDD RED: 13 new coordinator tests failed against the base before implementation
  (`/tmp/k8s-coordinator-initial-red.log`). A separate reused-Job RED accepted
  foreign image/command output before manifest validation was added
  (`/tmp/k8s-replay-job-red.log`). Early-abort restart RED exposed a missing
  distinction between pre-fence abort and guarded rollback; the restored fixture
  passes (`/tmp/k8s-coordinator-early-abort-red.log`).
- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: 1573 installs across 1447
  packages checked, no changes. The first install attempt hit the sandbox's
  read-only default temporary directory; the explicit writable temporary path
  succeeded. Dependencies are installed inside this worktree.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test`:
  **384 pass, 0 fail, 1359 assertions** across 23 files
  (`/tmp/k8s-coordinator-final-test.log`). Local registry/Git listeners require
  the authorized unrestricted fixture run. The earlier sandbox run's listener
  refusals are not counted as validation.
- Scoped Nx `tool-deploy:lint`, `tool-deploy:typecheck` and `tool-deploy:build`:
  passed. Build ran the final ShellCheck target and 7 dependency tasks, 5 from
  cache. Its first attempt exposed missing `@noble/hashes` in the reused shared
  dependency directory; the worktree's frozen install fixed that setup failure.
  Nx subsequently printed a historical flaky-task notice for that same dependency
  build; the final build exited successfully.
- Scoped Nx `format:check --files=<all changed paths>` and strict OpenSpec
  `validate k3s-wbs-delivery --strict`: passed. The OpenSpec executable is
  `/tmp/bunx-1000-@fission-ai/openspec@latest/node_modules/@fission-ai/openspec/bin/openspec.js`.

Twenty-three watched production-path faults each produced RED followed by
restored GREEN. Logs are `/tmp/k8s-coordinator-proof-<fault>-{red,green}.log`;
adjacent `Proof:` comments identify the injected check and corresponding fixture.

| Fault                                                                    | Observed RED                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `receipt-object`, `inventory-array`, `inventory-rows`                    | Missing receipts or null/object/zero/fractional/unknown/duplicate inventories escaped the required refusal     |
| `capability-image-shape`, `support`                                      | Invalid/foreign image vocabularies or unsupported guarded history reached promotion                            |
| `receipt-digest`, `receipt-json`, `receipt-identity`, `receipt-envelope` | Changed bytes, resealed invalid JSON, foreign identities or altered projections escaped resume preflight       |
| `forward-phase`, `rollback-phase`                                        | Missing phase-required receipts reached cluster work                                                           |
| `inventory-stability`                                                    | Changed fenced inventory permitted rollback restoration                                                        |
| `before-capture`, `before-restore`, `before-reopen`                      | In-process receipt loss reached capture, previous tier rollout or reopening                                    |
| `resume`, `disk-read`                                                    | Corrupted progress escaped coordinator preflight or disk parsing                                               |
| `fence-boundary`                                                         | An interrupted closed write path skipped stopped-writer replay admission                                       |
| `job-manifest`, `job-mount`                                              | A successful reused Job with foreign image/command/PVC output was accepted                                     |
| `nested-inverse`, `precondition-marker`                                  | Removing generated traversal markers lost inverse-only/precondition-only guarded history and permitted capture |
| `legacy-schema2`                                                         | A legacy schema 2 journal lost its required prior-executor/manual-recovery diagnostic                          |

Inventory stability compares compatibility kinds/counts, not a checksum of all
command-journal rows; writers remain fenced and stopped while inventory evidence
is taken. Malformed inventory and missing image CLI observations are attempted
once in forward admission and once during abort; failed rollback parks the Lease
without restoration/reopening. Fixtures also cover a capability change between
successful forward evidence and rollback, crash/resume around the new phases,
legacy journals, independent nested markers, and corruption during a live run.

No live Kubernetes/container execution, h4 rollout, restore/cutover import,
staging/GitHub Actions acceptance, canonical `h2puni-gate.sh` or full workspace gate
ran. This is a scoped review candidate; F11.1 remains open for the cutover guard
and live acceptance. No push or deployment was performed.

## F11.1b Astra repair — 2026-10-14

Based on local candidate `18b98396ad73813245b22424c0f0c5b3adbe4334`.
Astra P1 reproduced successful acceptance of a reused observation Job with an
added `volumeMount.subPath`, selecting another database directory on the same
PVC. P2 reproduced a null forward receipt accepted at `recovery-required`,
permitting a recovery request to take over its parked Lease and replace progress.
Both are repaired in the same isolated branch without push or deployment.

P1 now compares effective omitted mount options as well as explicit manifest
fields: subpath, subpath expression, read/write access, mount propagation and
recursive read-only mode. Both inventory and capability adapter paths refuse
changed options while omitted or equivalent explicit defaults pass. The defaults
follow the [Kubernetes VolumeMount API](https://kubernetes.io/docs/reference/kubernetes-api/core/pod-v1/#VolumeMount).
P2 requires the prior forward receipt at `recovery-required` in the shared
validator invoked by disk parsing and coordinator preflight. File-journal
fixtures preserve original bytes and the parked Lease and observe zero cluster
calls for null/missing receipts; normal recovery remains covered by the existing
suite.

Fresh verification:

- Initial focused TDD RED: six failures for the five changed mount options and
  null recovery evidence (`/tmp/k8s-astrafix-initial-red.log`).
- Focused adapter/recovery cases: 24 pass, 0 fail
  (`/tmp/k8s-astrafix-focused-green.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --skip-nx-cache`:
  **403 pass, 0 fail, 1394 assertions** across 23 files
  (`/tmp/k8s-astrafix-final-test.log`), with authorized localhost fixture listeners.
- The same scoped Nx environment and `--skip-nx-cache` for `tool-deploy:lint`,
  `tool-deploy:typecheck` and `tool-deploy:build`: passed. Build also ran its seven
  dependencies. Nx repeated its historical `shared-test-evidence:build` flaky-task
  notice; this run passed without cache.
- Strict `validate k3s-wbs-delivery --strict`, scoped Nx format over all changed
  paths and `git diff --check`: passed.

Each new safety option was separately removed from the production comparator,
and the recovery phase requirement was separately omitted. Every fault produced
RED followed immediately by restored GREEN. Adjacent `Proof:` comments name the
regression. Logs are `/tmp/k8s-astrafix-proof-<fault>-{red,green}.log`.

| Fault                                               | Observed RED                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `subPath`, `subPathExpr`                            | Inventory/capability accepted valid `[]` from a foreign database directory on the pinned PVC |
| `readOnly`, `mountPropagation`, `recursiveReadOnly` | Reused Job accepted changed effective mount access or propagation                            |
| `recovery-required`                                 | Disk parsing accepted a null prior forward receipt, losing the required pre-takeover refusal |

No live Kubernetes/container execution, h4 rollout, restore/cutover import,
staging/GitHub Actions acceptance, canonical host gate or full workspace gate ran.
Cutover admission remains a separate open prerequisite. No push was performed.

## F11.1c cutover export/restore replay admission — 2026-10-14

Based on exact #429 head `8b64d8203c9a90d4b035affee1620fd17c14cfc6`,
in isolated branch `feat/k8s-cutover-replay-sol`. The release journal remains
schema 3. Cutover reports carry separately versioned replay evidence version 1.
Original descriptor file bytes and their independent SHA-256 pin, old/incoming
backend references with equal immutable digests, independent inventory, own-image
capabilities and export SHA-256 are bound together. The raw file pin includes its
newline; it is not substituted with the canonical promotion descriptor identity.

Export refuses unsupported history before checkpoint/VACUUM. Restore validates
expected evidence, incoming bytes and independent replay observations before
rename, rechecks the byte pin after image CLI execution, and retains failed
arrival artifacts for reviewed recovery. Verification explicitly refuses legacy
reports. Prepared manifests keep every Deployment at zero; first-start scale,
release-record and Flux admission remain F11.1d, separately open.

The deletion worker confirmed own `deletionState` properties on nested
`delete_subtree`/`restore_subtree`. Kubernetes inventory and coordinator/cutover
allowlists now recognize once-per-row `delete_state_v1`, reset between rows, and
independently retain `move_progress_v1` for own precondition markers. Old images
still refuse unless their own CLI advertises the required kind. Application
command behavior and advertisement belong to the separate deletion slice.

Fresh verification:

- Initial TDD RED: the new cutover helper module was absent
  (`/tmp/k8s-cutover-initial-red.log`). Preparation RED failed on its missing helper
  (`/tmp/k8s-cutover-prepare-red.log`). Deletion marker controls produced eight
  failures before inventory integration, and coordinator controls produced two
  failures before its allowlist update (`/tmp/k8s-cutover-delete{,-coordinator}-red.log`).
- Pre-rename fault RED: an image CLI mutating incoming bytes caused verification
  to fail only after the target existed. The final byte check now refuses before
  rename (`/tmp/k8s-cutover-pre-rename-{red,green}.log`).
- Trusted report shape RED: nine malformed SQLite reports, including `counts: null`,
  escaped verification before tightening the report boundary; all nine now refuse
  (`/tmp/k8s-cutover-report-shape-{red,green}.log`).
- Focused Bun over cutover-replay, cutover, cutover-cli, replay-capability and
  replay-coordinator: **140 pass, 0 fail, 635 assertions** across five files
  (`/tmp/k8s-cutover-final-focused.log`). Fixtures execute generated commands on
  real SQLite and image-root CLI files; the manifest CLI uses a controlled
  kubectl output fixture, not a real cluster render.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --skip-nx-cache`:
  **476 pass, 0 fail, 1596 assertions** across 24 files
  (`/tmp/k8s-cutover-final-test.log`). Registry/Git fixtures use authorized local
  listener permissions. Required dependency versions are reused from the frozen
  #429 worktree; no dependency or lockfile change is introduced.
- Scoped uncached Nx `tool-deploy:lint`, `tool-deploy:typecheck` and
  `tool-deploy:build`: passed; build also ran its seven dependencies
  (`/tmp/k8s-cutover-final-{lint,typecheck,build}.log`).
- Scoped Nx `format:check --files=<all changed paths>`, strict OpenSpec
  `validate k3s-wbs-delivery --strict`, and `git diff --check`: passed.

Thirty-four watched production-path faults each produced RED followed by
restored GREEN. Logs are `/tmp/k8s-cutover-proof-<fault>-{red,green}.log`.
Adjacent `Proof:` comments identify the corresponding checks and fixtures.

| Fault                                                                                    | Observed RED                                                                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-object`, `descriptor-pin`, `image-digest`, `descriptor-backend`                | Legacy inputs, changed original bytes/pin, unequal old digest or foreign descriptor backend escaped the required export/render refusal |
| `descriptor-shape`                                                                       | A resealed array descriptor lost its named malformed-descriptor diagnostic                                                             |
| `legacy-report`, `evidence-identity`, `verify-replay`                                    | Legacy/foreign/changed replay evidence escaped its required verification or restore refusal                                            |
| `observation-shape`, `row-shape`, `row-identities`                                       | Malformed capabilities or malformed/unknown/zero/duplicate inventory escaped boundary validation                                       |
| `support`, `cli-exit`, `before-export`                                                   | Unsupported retained history or a failing own CLI permitted snapshot creation                                                          |
| `restore-byte-hash`, `restore-observation`, `restore-inventory`                          | Changed bytes, incompatible own image or divergent inventory reached target rename                                                     |
| `report-shape`                                                                           | Malformed trusted SQLite reports escaped verify-restore refusal                                                                        |
| `pre-rename-hash`                                                                        | CLI-mutated bytes were detected only after target rename                                                                               |
| `stale-marker`                                                                           | A stale marker authorized restore/retry instead of refusing                                                                            |
| `export-image`, `restore-image`                                                          | Rendered commands accepted a caller image outside their recorded binding                                                               |
| `yaml-shape`, `manifest-object`, `deployment-shape`, `zero-replicas`, `backend-presence` | Malformed/absent Deployment inputs escaped refusal or prepared tiers started at nonzero replicas                                       |
| `nested-forward`, `nested-inverse`, `precondition`                                       | Removing generated traversal markers omitted guarded move history and permitted export                                                 |
| `delete-marker`, `delete-row-reset`                                                      | Unsupported deletion history was omitted or a following markerless row was counted                                                     |
| `coordinator-delete-allowlist`, `cutover-delete-allowlist`                               | Supported own-image deletion capability controls were incorrectly refused                                                              |

Fixtures cover empty/move-only capabilities, nested independent markers, legacy
rows, missing/unreadable DB or CLI sources, a missing journal table, malformed
history/output/evidence, foreign identities, stale arrival retry, changed export,
exact byte controls and equal-digest host/cluster aliases. A matching restore
preserves exact bytes and evidence. Refused restore keeps the source export intact
and the target absent.

The local rehearsal carries actual built image digest bindings in a serialized
laboratory descriptor; its synthetic admission fields are explicitly not staging
proof. Its negative retry retains host export and failure logs and explicitly
clears only failed PVC arrival files before the matching control. Docker/k3d
execution of this updated rehearsal remains unverified. No live export/import,
h4 rollout, first-start activation, staging/GitHub Actions acceptance, canonical
host gate or full workspace gate ran. Existing-host storage documentation now says
`puni-retain`. No push or production mutation was performed.
