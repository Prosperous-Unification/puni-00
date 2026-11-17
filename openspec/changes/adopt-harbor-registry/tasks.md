Agent slices (1 to 10) change source and run tests; none touches a production host. Attended
steps (A1 to A11) each name who runs them, the command, the receipt, the stop condition and the
rollback. Decision numbers refer to [design.md](design.md). Every safety check lands with a
production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

## 0. Decisions

- [ ] 0.1 Owner reads assumptions H1 to H17 and the nine open questions in design.md and
      overrules by id. Receipt: the overrules, dated, in verify.md. Until then H1 to H17 stand
      as written and only slices 1 to 3 may start. Question 5, the alert destination, blocks
      the alert receipts of A7 and with them A10 until the owner names one.
- [ ] 0.2 When this change merges: file the decision record from design.md as an ADR under the
      next free number, link it from proposal.md, and delete the quoted copy. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: add the dated `Superseded` note of decision 11 to `proposal.md` and
      `tasks.md` of `bound-registry-storage` and `integrate-registry-journal-foundation`. No task
      box changes state. Test: `./node_modules/.bin/openspec validate --all --json` and the
      `tool-devsync` document tests.

## 1. Memory and CPU measurement on the local lab (first slice; no repository change except verify.md)

- [ ] 1.1 Who: an agent on a host admitted for the k3d `platform` profile (16 GiB RAM, 40 GiB
      disk), with the owner's go for that host. Commands: bring the lab up with
      `bunx nx run tool-fleet:lab -- up --profile platform --worktree-root <dir>`; download
      `https://helm.goharbor.io/harbor-1.19.4.tgz` and record its SHA-256; render with the
      locked `helm` and the values of decision 2; `kubectl apply --dry-run=server` into a
      namespace enforcing `restricted`; apply.
      Receipt: chart SHA-256, the nine image digests, the dry-run result, `postgres --version`,
      and `qosClass: Guaranteed` for every pod.
      Stop: any pod refused by admission, not Guaranteed, or not Ready in 15 minutes.
- [ ] 1.2 Every 5 seconds, for every container, read `anon`, `shmem` and `kernel` from
      `memory.stat`, `oom_kill` and `max` from `memory.events`, and `nr_throttled` from
      `cpu.stat`: after ten idle minutes; during a 2 GiB `crane` push; during a retention run;
      during garbage collection with a second push in flight. Do not size from `memory.current`
      or `memory.peak`: they include page cache. Receipt: the per-container table in verify.md.
- [ ] 1.3 Set each memory limit to the larger of its floor and 1.5 times its peak of `anon` +
      `shmem` + `kernel`, rounded up to 32 MiB; call the sum L. Run the four phases again at
      those limits with the lab host's CPUs saturated by a load generator and the database
      probe timeouts at 5 seconds. Pass: `oom_kill` 0 in every container, zero container
      restarts and every push completes. Receipt: L, the `max` event counts, CPU throttling,
      restart counts and push durations for both runs. Stop and report before any manifest is
      written if L exceeds 1,949 MiB (3,741 minus the 1,024 MiB reserve and the 768 MiB backup
      figure of decision 2). The planned L of 2,112 MiB already exceeds that: unless the
      measurement lowers it, this slice ends in a report and the owner decides whether slices
      2 and 3 go ahead before A is known.
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
      HelmRelease with every image tag written as `<tag>@sha256:<digest>`, the NetworkPolicy,
      the guard init containers through chart values, the post-render patch (receipts volume;
      `Recreate` on core, nginx, portal and exporter), upload purging at 4 hours and 1 hour,
      database probe timeouts of 5 seconds,
      static volumes and claims, and the measured CPU and memory figures from slice 1. Add a
      `tool-fleet` module that renders them with the locked `helm`. Test: new
      `platform-harbor.test.ts`; `bunx nx run tool-fleet:check` covers the render.
- [ ] 3.2 Negatives in `platform-harbor.test.ts`, each watched with its check removed:
      a container or init container, the chart's `data-permissions-ensurer` included, without
      a CPU or memory limit or whose request differs from its limit; a workload whose strategy
      is not `Recreate`; a rendered image reference without a digest or with a digest that
      differs from the lock; `trivy.enabled: true`; a chart default secret left in the values
      (`Harbor12345`, `not-a-secure-key`, `changeit`, `harbor_registry_password`); an install
      secret of the wrong length; upload purge age above 4 hours; a database probe timeout
      below 5 seconds; a production claim on a
      dynamic storage class; a volume path outside `/var/lib/puni-harbor/<name>/contents`;
      `expose.type` other than `clusterIP`; a workload without the guard init container or the
      receipts volume; a Harbor pod no default-deny policy selects; a policy that admits 8443
      or any inner port from another namespace.
- [ ] 3.3 Rehearsal target `tool-fleet:rehearse:harbor` on k3d: Flux installs the local overlay,
      all pods reach Ready and report `qosClass: Guaranteed`; the host reaches 8443. Negatives:
      a pod in another namespace cannot connect to 8443, Valkey 6379, the database, the inner
      registry, core or jobservice. Also record whether a process on the node itself reaches
      Valkey: that is the known residual of decision 4, a recorded fact and not a failure.
      Fault to inject: remove the default-deny policy and watch each pod probe connect; remove
      one CPU limit and watch the pod report Burstable.

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
- [ ] 4.5 Abandoned uploads in the rehearsal, with the purge age shortened for the test: start
      a blob upload, abandon it, and watch its bytes leave `_uploads` after one purge interval.
      Also record what a quota-refused blob upload leaves behind. Fault to inject: disable
      upload purging and watch the bytes stay.

## 5. Policy planner (pure)

- [ ] 5.1 `infra/registry/harbor.json` and its ArkType shape; planner
      `planHarborReconciliation(declared, observed)` in `tools/tool-fleet/src`. Test: new
      `harbor-policy.test.ts`: an empty registry yields the full creation plan, with one robot
      name per role as create then refresh; an equal registry yields none; one changed quota,
      retention rule, immutability rule, robot permission, schedule, audit purge, webhook or
      system setting yields exactly that change; a rotation yields create and refresh of the
      role's idle name and nothing else; a retirement yields the deletion of the older name.
- [ ] 5.2 Negatives, each watched with its check removed: quotas summing above 70% of the
      recorded usable capacity; a declared or observed robot with a delete action; an unlimited
      project quota; an undeclared project (reported, never deleted); a retention policy whose
      algorithm is not `or`; `deleteUntagged: true`; a retention policy in which no rule keeps
      untagged artifacts; observed `read_only: true` (drift); a robot deletion outside a
      retirement; the retirement of a role's only live name; two live names for one role for
      more than seven days (drift); an observed field the reader does not model (throws); a property test that no
      secret string appears in any serialised plan.

## 6. Reconciler shell and the lab proofs

- [ ] 6.1 The thin IO shell: `plan`, `apply --expect-sha256`, `apply --rotate`,
      `apply --retire`, `check` (which exits as deferred while a backup run marker and a live
      backup unit exist), and
      `--connect <address>:<port>`, which keeps `registry.puni.internal` as the TLS and host
      name. Test: new `harbor-api.test.ts` against a local fake of the 2.15.4 API, reached only
      through `--connect`. Negatives: missing or unreadable admin credential, declared file or
      robot secret file fail before any request; a robot secret outside 8 to 128 characters or
      without upper case, lower case and a digit fails before any request; a plan digest that
      does not match is refused; the secret the fake returns from robot creation never reaches
      stdout, stderr or a log; no secret does. Fault to inject: skip the digest comparison and
      watch the stale plan apply; log the create response and watch the redaction test fail.
- [ ] 6.2 Extend `tool-fleet:rehearse:harbor` to apply the declared file to the real Harbor and
      prove the spec's scenarios: push over quota refused; push robot delete refused; pull robot
      push refused; cross-project pull refused; a `hold-*` tag cannot be overwritten; a push
      robot can move a promotion tag; `read_only` set through the API refuses a push and clears
      again. Robots, against the real API: creation ignores a supplied secret; after the refresh
      the operator file's secret logs in; a refresh alone leaves `expires_at` where it was;
      a delete and create of one name keeps that name; after `apply --rotate` the new name
      logs in with `expires_at` 90 days from the rotation and the old name still logs in;
      after `apply --retire` the old name is refused. Fault to inject: make the rotation
      refresh only, and watch the expiry case fail; make it replace the name in place, and
      watch the old-name login fail before retirement.
- [ ] 6.3 Retention and collection in the rehearsal. Seed twelve artifacts in one repository and
      back-date the push time of some in the lab database. Prove: promoted and old is kept; old,
      unpromoted and outside the newest ten is removed; recent and outside the newest ten is
      kept; retention between any two steps of a rollback swap keeps both images; an untagged
      artifact six days old survives retention and collection, and one eight days old is removed
      by retention; platform manifests pushed before their index survive a retention and
      collection run in between; a build tag pushed again leaves the old digest pullable; every
      child of a kept, back-dated multi-architecture index stays pullable; a dry run changes
      nothing; collection during a push frees bytes and keeps the pushed image. Record whether
      project usage falls at deletion or at collection. Fault to inject: set `deleteUntagged`
      true in the lab and watch the six-day case fail.
- [ ] 6.4 Drift in the rehearsal: change a rule, a quota and a robot permission by hand, and set
      `read_only` by hand, and watch `check` exit non-zero naming each; shorten a robot's expiry
      and watch the expiry probe fail. Fault to inject: stub the retention comparison to equal
      and watch the hand edit go unreported.

## 7. Backup and restore

- [ ] 7.1 The Harbor backup command of decision 8 as planner plus shell. Test: new
      `backup-harbor.test.ts` with the real pinned `restic` (`PUNI_TEST_RESTIC_BINARY`) and a
      local repository. Negatives, each watched with its guard removed: repository absent (no
      implicit initialisation); owner-only file with mode 0644; a retention or collection run in
      progress; `read_only` already true at start with no run marker (refuses, writes no
      marker, changes nothing); dump failure;
      transfer failure; verification failure. After each failure: non-zero exit, previous
      receipt unchanged, nothing pruned, `read_only` false. `_uploads` is absent from the
      snapshot.
- [ ] 7.2 Restore drill in `tool-fleet:rehearse:harbor`: back up, restore into a second
      namespace, pull the seeded image by digest and compare every blob. Negative: one altered
      blob in a second copy fails the same verification. Fault to inject: skip the blob
      comparison and watch the altered copy pass. Record B: the peak of the backup command's
      process tree.
- [ ] 7.3 Host units for the backup and for the daily `check` (06:00 UTC, outside the backup
      window), with their README: `MemoryMax` at the measured B, an `ExecStopPost` that clears
      `read_only` only when the run marker exists, the same marker step before the preflight,
      `OnFailure` naming the notifier. Test: `systemd-analyze verify` on both, the way
      `registry-hosts.test.ts` verifies the endpoint units; on the fixture host, under a
      transient unit with the same directives against the lab Harbor: kill the backup with
      SIGKILL while read-only and watch `read_only` return to false; set `read_only` by hand,
      start the unit, and watch it refuse and leave `read_only` true after `ExecStopPost` ran.
      Fault to inject: remove `ExecStopPost` and watch the registry stay read-only after the
      kill; remove its marker condition and watch the hand-set read-only cleared.

## 8. Endpoint and client roles

- [ ] 8.1 `registry_endpoint`: unit name and upstream port become parameters, so a second
      instance (`puni-harbor`, `10.1.0.4:8443`) can exist beside the first. Test:
      `tool-fleet:test:registry-hosts`. Negatives: a public or malformed listen address for the
      new instance refuses before any write; applying the second instance leaves the first
      instance's units byte-identical. Fault to inject: drop the address validation for the new
      instance and watch the public address written into the unit.
- [ ] 8.2 `registry_client`: a k3s mode that writes CA trust without a credential, a second
      managed entry for port 8443, and removal of a managed entry with its credential (the
      `:5000` one). Negatives: unmanaged conflicting `registries.yaml` refuses; invalid CA
      refuses; removal leaves an unmanaged entry untouched. Fault to inject: remove the
      ownership check and watch the conflicting file replaced.

## 9. Observability

- [ ] 9.1 Capture the pinned exporter's exposition into `infra/platform/conformance/alerts`;
      add the lab ServiceMonitor and lab alert rules for quota use and `harbor_up`. Test:
      `platform-alerts.test.ts` fails when a rule names a series missing from the capture or
      when the pinned image changes without a new capture. Fault to inject: delete one series
      from the capture and watch the rule test fail; remove the comparison and watch it pass.
- [ ] 9.2 Webhook policies and the audit-log purge schedule in the declared file; rehearsal
      proves a quota event reaches a local receiver. Negative: an unreachable receiver is
      reported by `check`. Fault to inject: stub the receiver probe to succeed and watch the
      unreachable receiver go unreported.
- [ ] 9.3 The host fill check and the failure notifier of decision 9, as a pure threshold
      planner plus a shell, with their timer and units. Test: new `harbor-fill.test.ts` with a
      fake receiver: one notification per crossing at 80% and 90% for `registry` and at 80%
      for `database`, `jobs` and `cache`; none while a level holds. Negatives: an unreadable
      mount fails the unit and notifies; an unreachable destination fails the unit; a missing
      destination file throws. Fault to inject: remove the threshold comparison and watch 85%
      pass silently; treat an unreadable mount as 0% and watch the negative pass wrongly.

## 10. Runbooks and gate

- [ ] 10.1 Rewrite the status and operation sections of `docs/infra/registry.md`, including the
      exact commands that generate the install secrets and robot secrets; update
      `docs/infra/platform.md` and `docs/infra/recovery.md`. Mark what is installed and what is
      not.
- [ ] 10.2 Run the canonical gate on the final implementation SHA and record its printed SHA
      and exit code in verify.md, with the failure-proof table complete.

## A. Attended production steps

Each step needs the owner's go for that step. "Operator" is the owner or an agent he names.

- [ ] A1 Read h4claw, read-only. Who: operator. Commands: `free -m` and `/proc/meminfo` with no
      pool job running (N); MemAvailable every 10 s across the cold calibration run of `gate`
      (A), not across an observe-mode gate; the host pool's disk budget from its configuration;
      `df` for `/` and the containerd image directory; `ss -ltn` for port 8443; the fleet
      firewall rules for the private interface; the `puni-platform` source revision;
      `getent passwd 999 10000`. Receipt: the values, dated, in verify.md, with the run each
      came from. This change starts no gate on h4claw: A exists only after the host-pool work
      runs the cold calibration, and A2 onwards wait for it. Stop: none; nothing changes.
      Rollback: none.
- [ ] A2 Owner applies the rule of decision 2 to L, B, N and A, names the placement, and decides
      the re-enrollment of h4claw with more headroom, which the design expects. Receipt: the
      decision by id and the new headroom. Stop: A − L − B below 1,024 MiB with no fallback
      chosen. The rule is applied again whenever the `gate` envelope changes.
- [ ] A2a Re-enroll h4claw in the host pool, when N + L + B exceeds the pinned 5 GiB. Who: the
      operator of the host pool, with the owner's go. Command: the procedure of
      `docs/infra/gate-hosts.md`, "Enroll a host in the host pool", steps 5 and 7: drain the
      pool, retire the ledger, re-enroll with enrolling vars that carry the new
      `puni_gate_pool_headroom`. Receipt: the role converges with `changed=0` on a second
      apply and the rendered pool configuration shows the new headroom. Stop: a job running or
      queued in the pool. Rollback: re-enroll with the previous headroom.
- [ ] A3 Provision the four filesystems. Who: operator. Command: the registry playbook with the
      Harbor storage tag and an owner-only vars file. Receipt: role output, the four receipts,
      measured usable capacity, a second apply with `changed=0`. Stop: root reserve refusal, or
      free space on `/` after allocation below the pool's disk budget plus 10 GiB plus 22.5 G.
      Rollback: unmount, remove the fstab entries and backing files this step created, clear the
      immutable flags.
- [ ] A4 Install. Who: operator. Commands: generate the install secrets with the runbook's
      commands into owner-only files; encrypt them into the private fleet repository; add its
      two Flux units; merge; reconcile. Receipt: HelmRelease Ready, every pod reporting
      `qosClass: Guaranteed`, guard init containers succeeded, no listener on 8443 yet. Stop:
      A2a without a receipt where the rule's third row applied; any pod not Ready in 15
      minutes; a website health check failing. Rollback: suspend and
      remove the Harbor unit; volumes and Secrets remain.
- [ ] A5 First reconcile, on h4claw with `--connect` naming the Service address, because no host
      listener exists yet. Who: operator. Commands: `plan`, review, `apply --expect-sha256`,
      `check`. Receipt: plan digest and `check` exit 0, robot logins and served certificate
      included. Stop: a plan that deletes anything, or a secret in output. Rollback: remove the
      Harbor unit; nothing serves yet.
- [ ] A6 Endpoint and clients. Who: operator. Command: the registry playbook with the endpoint
      and client tags, one host at a time. Receipt: socket bound to `10.1.0.4:8443` only;
      second apply `changed=0`; each node Ready; website healthy; `check` exit 0 without
      `--connect`. Stop: a node not Ready after its restart. Rollback: stop and disable the
      `puni-harbor` socket; remove the marked client entries; restart k3s on that node.
- [ ] A7 Production proofs on a disposable repository in `platform`. Who: operator. Receipt: one
      line each for robot push and pull, anonymous 401, delete refused, push over a lowered
      quota refused, retention dry run, collection dry run, public address refused; and one
      alert of each kind seen by a person: the quota webhook from that refused push, a fill
      alert from the fill check run once with a lowered threshold, a failure notice from a unit
      made to fail. Stop: any refusal that does not refuse, or an alert nobody received.
      Rollback: delete the disposable repository as admin and restore the quota and thresholds.
- [ ] A8 Backup and restore drill. Who: operator. Commands: run the backup unit once by hand;
      enable its timer and the fill timer; run the drill of decision 8 on the other node.
      Receipt: snapshot ids, drill digests, durations, the read-only window, the unit's memory
      peak against B. Stop: verification failure, or Harbor left read-only. Rollback: clear
      read-only with the printed command; delete the drill namespace; keep the snapshots.
- [ ] A9 Copy the proof image. Who: operator. Command: `crane copy` by digest to
      `platform/<repository>:hold-activation-proof`, then `crane digest` on both sides. Needs
      pull request #936 merged. Receipt: equal digests; an uncached pull on a node. Stop:
      digests differ. Rollback: disable the hold rule, delete the copy as admin, re-enable.
- [ ] A10 Readiness. Who: owner. Receipt: the eight readiness items of decision 10 in
      verify.md, including two consecutive days of `check` exit 0 and of backup success. Stop:
      any item missing. Rollback: none; nothing changes.
- [ ] A11 Retire Distribution. Who: operator, after A10. Commands: take a final Distribution
      snapshot; stop and disable `puni-registry.socket`; scale Distribution to zero through the
      private fleet repository; disable its backup timer; apply the client role to remove the
      `:5000` entry and its credential from `registries.yaml` and from the build host's Docker
      configuration, one host at a time. Receipt: port 5000 refuses; snapshot id; the
      Distribution PVC still bound; no client file names port 5000. Stop: the proof image not
      pullable from port 8443. Rollback: enable the socket, restore the replica count, enable
      the timer, reapply the client role with the old entry. Only after A11 may a product
      change name this registry.
