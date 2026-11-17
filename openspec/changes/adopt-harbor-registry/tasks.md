Agent slices (1 to 10) change source and run tests; none touches a production host. Attended
steps (A1 to A11) each name who runs them, the command, the receipt, the stop condition and the
rollback. Decision numbers refer to [design.md](design.md). Every safety check lands with a
production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

## 0. Decisions

- [ ] 0.1 Owner reads assumptions H1 to H17 and the nine open questions in design.md and
      overrules by id. Receipt: the overrules, dated, in verify.md. Until then H1 to H17 stand
      as written and only slices 1 to 3 may start.
- [ ] 0.2 When this change merges: file the decision record from design.md as an ADR under the
      next free number, link it from proposal.md, and delete the quoted copy. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: add the dated `Superseded` note of decision 11 to `proposal.md` and
      `tasks.md` of `bound-registry-storage` and `integrate-registry-journal-foundation`. No task
      box changes state. Test: `./node_modules/.bin/openspec validate --all --json` and the
      `tool-devsync` document tests.

## 1. Memory measurement on the local lab (first slice; no repository change except verify.md)

- [ ] 1.1 Who: an agent on a host admitted for the k3d `platform` profile (16 GiB RAM, 40 GiB
      disk), with the owner's go for that host. Commands: bring the lab up with
      `bunx nx run tool-fleet:lab -- up --profile platform --worktree-root <dir>`; download
      `https://helm.goharbor.io/harbor-1.19.4.tgz` and record its SHA-256; render with the
      locked `helm` and the values of decision 2; `kubectl apply --dry-run=server` into a
      namespace enforcing `restricted`; apply.
      Receipt: chart SHA-256, the nine image digests, the dry-run result, `postgres --version`.
      Stop: any pod refused by admission, or not Ready in 15 minutes.
- [ ] 1.2 Read `memory.current` and `memory.peak` from every container's cgroup: after ten idle
      minutes; during a 2 GiB `crane` push; during a retention run; during garbage collection
      with a second push in flight. Receipt: the per-container table in verify.md, plus every
      container killed at its limit.
- [ ] 1.3 Compute each limit as the larger of its floor and 1.5 times its peak, rounded up to
      32 MiB, and their sum L. Stop and report before any manifest is written if L exceeds
      2,717 MiB (3,741 minus the 1,024 MiB reserve of decision 2).
      Rollback for 1.1 to 1.3: `bunx nx run tool-fleet:lab -- down` with the printed id.

## 2. Chart archive and image lock

- [ ] 2.1 Vendor `infra/platform/charts/harbor-1.19.4.tgz`; add `charts.harbor` to
      `infra/versions/toolchain.json` with nine image roles and `disabledComponents: ["trivy"]`;
      lock the storage guard image; extend the reader in `tools/tool-fleet/src/contracts.ts`.
      Test: `contracts.test.ts` accepts the lock. Negatives: a missing `valkey` role, an extra
      `trivy` role and a wrong archive SHA-256 are each rejected. Fault to inject: drop Harbor
      from the reader's role table and watch the missing-role negative pass wrongly.

## 3. HelmRelease, overlays and the static check

- [ ] 3.1 Add `infra/platform/registry/harbor/{base,local,production}` per decision 4: the
      HelmRelease, NetworkPolicy, post-render patch, static volumes and claims, and the measured
      limits from slice 1. Add a `tool-fleet` module that renders them with the locked `helm`.
      Test: new `platform-harbor.test.ts`; `bunx nx run tool-fleet:check` covers the render.
- [ ] 3.2 Negatives in `platform-harbor.test.ts`, each watched with its check removed:
      a container whose memory request differs from its limit; `trivy.enabled: true`; a chart
      default secret left in the values (`Harbor12345`, `not-a-secure-key`, `changeit`); a
      production claim on a dynamic storage class; a volume path outside
      `/var/lib/puni-harbor/<name>/contents`; `expose.type` other than `clusterIP`; a workload
      without the guard init container; a NetworkPolicy that admits the inner registry port from
      another namespace.
- [ ] 3.3 Rehearsal target `tool-fleet:rehearse:harbor` on k3d: Flux installs the local overlay,
      all pods reach Ready and are Guaranteed. Negative: a pod in another namespace cannot reach
      the inner registry or the database. Fault to inject: remove the NetworkPolicy and watch the
      probe connect.

## 4. Bounded filesystems and the start-up guard

- [ ] 4.1 Add the `-harbor` variant to `infra/ansible/roles/registry_storage/files/storage.sh`
      and the role: exactly `registry`, `database`, `jobs`, `cache`; two UIDs; receipts under
      `<directory>/identities`; immutable mount points; a boot unit that k3s `Wants`. Test: new
      uncached target `tool-fleet:test:harbor-storage` on a root-capable fixture host with
      disposable loop files; provision, a second run that changes nothing, receipts match.
- [ ] 4.2 Negatives in that rehearsal, each watched with its guard removed: backing file sparse;
      root reserve too small; a config with a fifth volume or a missing one; canonical
      `provision` given the Harbor config; `mkdir` under an unmounted mount point (must fail:
      remove the immutable flag and watch it succeed).
- [ ] 4.3 The guard init container, taken from `verify_mount` in
      `infra/platform/registry/production/startup.sh`. Negatives in the same rehearsal with the
      real pinned image: filesystem not mounted; a different ext4 filesystem on the reused loop
      device; an oversized filesystem; a receipt with changed owner, mode or link count. Each
      leaves the workload fixture unstarted. Fault to inject per case: delete the corresponding
      comparison and watch the fixture start.
- [ ] 4.4 Full image filesystem in the rehearsal: fill `registry`, then prove a push fails, a
      pull succeeds, the database still accepts a write and garbage collection completes.

## 5. Policy planner (pure)

- [ ] 5.1 `infra/registry/harbor.json` and its ArkType shape; planner
      `planHarborReconciliation(declared, observed)` in `tools/tool-fleet/src`. Test: new
      `harbor-policy.test.ts`: an empty registry yields the full creation plan; an equal registry
      yields none; one changed quota, retention rule, immutability rule, robot permission,
      schedule, webhook or system setting yields exactly that change.
- [ ] 5.2 Negatives, each watched with its check removed: quotas summing above 70% of the
      recorded usable capacity; a declared or observed robot with a delete action; an unlimited
      project quota; an undeclared project (reported, never deleted); a retention policy whose
      algorithm is not `or`; an observed field the reader does not model (throws); a property
      test that no secret string appears in any serialised plan.

## 6. Reconciler shell and the lab proofs

- [ ] 6.1 The thin IO shell: `plan`, `apply --expect-sha256`, `check`. Test: new
      `harbor-api.test.ts` against a local fake of the 2.15.4 API. Negatives: missing or
      unreadable admin credential, declared file or robot secret file fail before any request;
      a plan digest that does not match is refused; a secret never reaches stdout or stderr.
      Fault to inject: skip the digest comparison and watch the stale plan apply.
- [ ] 6.2 Extend `tool-fleet:rehearse:harbor` to apply the declared file to the real Harbor and
      prove the spec's scenarios: push over quota refused; push robot delete refused; pull robot
      push refused; cross-project pull refused; a `hold-*` tag cannot be overwritten; a push
      robot can move a promotion tag; a caller-supplied robot secret logs in; `read_only` set
      through the API refuses a push and clears again.
- [ ] 6.3 Retention and collection in the rehearsal. Seed twelve artifacts in one repository and
      back-date the push time of some in the lab database. Prove: promoted and old is kept; old,
      unpromoted and outside the newest ten is removed; recent and outside the newest ten is
      kept; a rollback swap keeps both; every child of a multi-architecture index stays
      pullable; a dry run changes nothing; collection during a push frees bytes and keeps the
      pushed image. Record whether project usage falls at deletion or at collection.
- [ ] 6.4 Drift in the rehearsal: change a rule, a quota and a robot permission by hand and watch
      `check` exit non-zero naming each; shorten a robot's expiry and watch the expiry probe
      fail. Fault to inject: stub the retention comparison to equal and watch the hand edit go
      unreported.

## 7. Backup and restore

- [ ] 7.1 The Harbor backup command of decision 8 as planner plus shell. Test: new
      `backup-harbor.test.ts` with the real pinned `restic` (`PUNI_TEST_RESTIC_BINARY`) and a
      local repository. Negatives, each watched with its guard removed: repository absent (no
      implicit initialisation); owner-only file with mode 0644; a retention or collection run in
      progress; dump failure; transfer failure; verification failure. After each: non-zero exit,
      previous receipt unchanged, nothing pruned, prior `read_only` value restored.
- [ ] 7.2 Restore drill in `tool-fleet:rehearse:harbor`: back up, restore into a second
      namespace, pull the seeded image by digest and compare every blob. Negative: one altered
      blob in a second copy fails the same verification. Fault to inject: skip the blob
      comparison and watch the altered copy pass.
- [ ] 7.3 Host units for the backup and for the daily `check`, with their README. Test:
      `systemd-analyze verify` on both, the way `registry-hosts.test.ts` verifies the endpoint
      units.

## 8. Endpoint and client roles

- [ ] 8.1 `registry_endpoint`: unit name and upstream port become parameters, so a second
      instance (`puni-harbor`, `10.1.0.4:8443`) can exist beside the first. Test:
      `tool-fleet:test:registry-hosts`. Negatives: a public or malformed listen address for the
      new instance refuses before any write; applying the second instance leaves the first
      instance's units byte-identical.
- [ ] 8.2 `registry_client`: a k3s mode that writes CA trust without a credential, and a second
      managed entry for port 8443. Negatives: unmanaged conflicting `registries.yaml` refuses;
      invalid CA refuses. Fault to inject: remove the ownership check and watch the conflicting
      file replaced.

## 9. Observability

- [ ] 9.1 Capture the pinned exporter's exposition into `infra/platform/conformance/alerts`;
      add the lab ServiceMonitor and alert rules for quota use, `harbor_up` and filesystem fill.
      Test: `platform-alerts.test.ts` fails when a rule names a series missing from the capture
      or when the pinned image changes without a new capture.
- [ ] 9.2 Webhook policies in the declared file; rehearsal proves a quota event reaches a local
      receiver. Negative: an unreachable receiver is reported by `check`.

## 10. Runbooks and gate

- [ ] 10.1 Rewrite the status and operation sections of `docs/infra/registry.md`; update
      `docs/infra/platform.md` and `docs/infra/recovery.md`. Mark what is installed and what is
      not.
- [ ] 10.2 Run the canonical gate on the final implementation SHA and record its printed SHA
      and exit code in verify.md, with the failure-proof table complete.

## A. Attended production steps

Each step needs the owner's go for that step. "Operator" is the owner or an agent he names.

- [ ] A1 Read h4claw, read-only. Who: operator. Commands: `free -m` and `/proc/meminfo` with no
      pool job running (N); MemAvailable every 10 s across one complete gate (A); `df` for `/`
      and the containerd image directory; `ss -ltn` for port 8443; the fleet firewall rules for
      the private interface; the `puni-platform` source revision; whether a node exporter
      reports per-mount fill; `getent passwd 999 10000`. Receipt: the values, dated, in
      verify.md. Stop: none; nothing changes. Rollback: none.
- [ ] A2 Owner applies the rule of decision 2 to L, N and A and names the placement. Receipt:
      the decision by id. Stop: A − L below 1,024 MiB with no fallback chosen.
- [ ] A3 Provision the four filesystems. Who: operator. Command: the registry playbook with the
      Harbor storage tag and an owner-only vars file. Receipt: role output, the four receipts,
      measured usable capacity, a second apply with `changed=0`. Stop: root reserve refusal, or
      free space on `/` after allocation below 35 GiB. Rollback: unmount, remove the fstab
      entries and backing files this step created, clear the immutable flags.
- [ ] A4 Install. Who: operator. Commands: encrypt Harbor's Secrets into the private fleet
      repository; add its two Flux units; merge; reconcile. Receipt: HelmRelease Ready, every
      pod Guaranteed, guard init containers succeeded, no listener on 8443 yet. Stop: any pod
      not Ready in 15 minutes, or a website health check failing. Rollback: suspend and remove
      the Harbor unit; volumes and Secrets remain.
- [ ] A5 First reconcile. Who: operator. Commands: `plan`, review, `apply --expect-sha256`,
      `check`. Receipt: plan digest and `check` exit 0. Stop: a plan that deletes anything, or a
      secret in output. Rollback: remove the Harbor unit; nothing serves yet.
- [ ] A6 Endpoint and clients. Who: operator. Command: the registry playbook with the endpoint
      and client tags, one host at a time. Receipt: socket bound to `10.1.0.4:8443` only;
      second apply `changed=0`; each node Ready; website healthy. Stop: a node not Ready after
      its restart. Rollback: stop and disable the `puni-harbor` socket; remove the marked client
      entries; restart k3s on that node.
- [ ] A7 Production proofs on a disposable repository in `platform`. Who: operator. Receipt: one
      line each for robot push and pull, anonymous 401, delete refused, push over a lowered
      quota refused, retention dry run, collection dry run, public address refused. Stop: any
      refusal that does not refuse. Rollback: delete the disposable repository as admin and
      restore the quota.
- [ ] A8 Backup and restore drill. Who: operator. Commands: run the backup unit once by hand;
      enable its timer; run the drill of decision 8 on the other node. Receipt: snapshot ids,
      drill digests, durations, the read-only window. Stop: verification failure, or Harbor left
      read-only. Rollback: clear read-only with the printed command; delete the drill
      namespace; keep the snapshots.
- [ ] A9 Copy the proof image. Who: operator. Command: `crane copy` by digest to
      `platform/<repository>:hold-activation-proof`, then `crane digest` on both sides. Needs
      pull request #936 merged. Receipt: equal digests; an uncached pull on a node. Stop:
      digests differ. Rollback: disable the hold rule, delete the copy as admin, re-enable.
- [ ] A10 Readiness. Who: owner. Receipt: the eight readiness items of decision 10 in
      verify.md, including two consecutive days of `check` exit 0 and of backup success. Stop:
      any item missing. Rollback: none; nothing changes.
- [ ] A11 Retire Distribution. Who: operator, after A10. Commands: take a final Distribution
      snapshot; stop and disable `puni-registry.socket`; scale Distribution to zero through the
      private fleet repository; disable its backup timer. Receipt: port 5000 refuses; snapshot
      id; the Distribution PVC still bound. Stop: the proof image not pullable from port 8443.
      Rollback: enable the socket, restore the replica count, enable the timer. Only after A11
      may a product change name this registry.
