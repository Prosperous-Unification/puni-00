Agent slices (PG-S1 to PG-S6) change source and run tests; none touches a host. Attended steps
(PG-A1 to PG-A5) each name who runs them, the command, the receipt, the stop condition and the
rollback. Ids with the prefix PG are this change's and refer to [design.md](design.md); every
other id is the core change's, [`separate-node-roles`](../separate-node-roles/tasks.md), and
"core decision n" is a decision of its design. `fleet_ansible`, `$OPS` and "sync" mean what
that change's tasks.md says. Every slice that adds a safety check lands it with a
production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

## 0. Decisions

- [ ] PG-0.1 Owner reads assumptions PG1 to PG8 in design.md and overrules by id. He may
      overrule PG3 to PG6 (the shape of the PostgreSQL service and its recovery targets),
      the working-out of PG8, and PG7, that Harbor keeps its own database. Two things are
      his to settle at a step and block nothing: when PG-A4 runs, and when PG-A1 does.
      Receipt: the
      overrules, dated, as decisions in verify.md. No slice starts before the core change's
      task 0.1 has its receipt.
- [ ] PG-0.2 File the decision record from design.md as an ADR under the next free number,
      once the core change's two have theirs, link it from proposal.md, and delete the
      quoted copy. Test: `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] PG-0.3 After PG-0.1: tell the owner of pull request #935 what design decision 3 asks
      of the store, and the owners of the WBS deploy tooling and of the release bootstrap
      which port changes design decision 5 names for them. Receipt: for each owner, the date
      they were told and what each answered, recorded in verify.md as decisions with their
      owner, in neutral words. No message is copied into the repository.

## 1. PostgreSQL hosting (agent slices)

All six are due before the database stage and block nothing in the core change (design
decision 4, PG1 to PG8). They follow the core change's slices 1.1, 1.7, 2.1 to 2.5, 2.10 and 3.1,
which they extend.

- [ ] PG-S1 The database capability. Add `database` to
      `CapabilitySchema`, `fleetCapabilities`, `purposeCapabilities.platform` and
      `RequiredCapabilitiesSchema`. In the production placement check: a node that carries
      `database` is the control-plane node, or carries nothing else (design decision 1).
      In the `k3s_agent` template: an agent with
      `database` also writes the taint `puni.dev/role=database:NoSchedule` (PG2); the server
      template writes no second taint. The inventory revision that gives m1plat1 `database`
      precedes PG-A4 and is applied by the core's capability
      play (slice 1.7); the one for `h10db` follows PG-A1, as slice 1.3 does for every
      server, with the reservations of design decision 2. Each raises its floor. Test:
      `contracts.test.ts`; the agent template renders both taints; the minimal fleet and
      the full fleet both pass the placement check.
      Negatives, each with its own fault: a workers node carrying `database` is refused
      (fault: add it to `purposeCapabilities.workers`); a node with `database` and `product`,
      or `database` and `ingress`, or `database` and `observability`, is refused (fault:
      compare against `product` only); an agent with `database` and `nonproduction` is
      refused (fault: allow the capability beside anything on an agent); a server with `database` and
      `platform-services` is accepted (fault: keep the earlier "nothing else" rule); a
      `database` agent whose rendered config lacks the taint fails the role test (fault:
      remove the template branch); an agent without `database` renders no such taint (fault:
      write it for every agent).
- [ ] PG-S2 Locks and the two operator units. Lock the `cloudnative-pg` chart 0.29.2 and the
      `plugin-barman-cloud` chart 0.9.0 by digest in `infra/versions/toolchain.json`, with
      their images and the PostgreSQL operand image by digest, and a schema variant that
      keeps retained locks readable. Units `cnpg-operator` and `barman-plugin` under
      `infra/argocd/units` in one namespace, selecting `platform-services` with the
      toleration of R25, with limits of 256 MiB each and `ServerSideApply=true`, and
      their Application files at orders 18 and 19. `barman-plugin` is a wrapper chart.
      `cnpg-operator` is a kustomize unit that inflates its chart, as Velero's does, with
      the chart's PodMonitor and dashboard off and a patch that gives every CRD it
      renders `Prune=false,Delete=false` (design decision 3). Test: each unit renders
      with the network disabled and renders the same bytes twice; the operator unit's
      render equals the chart's own apart from that annotation. Negatives, each with
      its own fault: an archive whose SHA-256 differs from the lock is refused (fault:
      skip the comparison); a rendered image without a digest is refused (fault: leave
      the operand image as a tag); a CloudNativePG CRD without both options fails rule
      (o) (fault: drop the patch); a plugin unit outside the operator's namespace fails
      the `delivery` check (fault: drop that comparison); an operator unit ordered at or
      below `policy`, or a plugin ordered at or below `cert-manager`, fails rule (c).
- [ ] PG-S3 The cluster units and rule (o). Units `nonproduction-db` and `platform-db` as
      kustomize directories in the `platform` project, each with a `Cluster` (one instance,
      `puni-retain`, the one claim of design decision 2 and no separate WAL claim, the
      selector of its node, superuser access off, the plugin as its WAL archiver), an `ObjectStore` with a 30-day recovery
      window, a nightly `ScheduledBackup` with the method `plugin`, a PodMonitor, the
      databases `canary-a` and `canary-b` with one `DatabaseRole` each, and ExternalSecrets
      for the object storage key and the two role passwords; the namespaces `postgres`
      (environment `platform`) and `postgres-nonproduction` (environment `stag`) in the
      `namespaces` unit; a SecretStore for each in `secret-sync`; a clause in slice 2.10's
      placement policy that a pod in `postgres` selects `database`, which the instances,
      the dump job and the drill's throwaway cluster all do; NetworkPolicies in each
      unit that allow the operator, the scrape, port 5432 from the namespaces that have a
      database there, and egress to the API server, DNS and the object storage endpoint.
      The `delivery` family gains rule (o), which refuses: a `Cluster` whose
      `affinity.nodeSelector` is not the capability design decision 3 names for it; a
      toleration of the database taint on any object outside the `platform-db` unit and
      the three node agents; a `Cluster` of a database unit without `Prune=false` and
      `Delete=false`, on a storage class that does not retain, with `enablePodMonitor`,
      with the in-tree `barmanObjectStore`, or without a WAL-archiving plugin, a
      `ScheduledBackup` and a PodMonitor of its own unit; a drill's throwaway `Cluster`,
      which its template marks with the label `puni.dev/throwaway`, on a class that
      retains, with a WAL archiver, or with a selector other than its unit's capability;
      the drill CronJob of `platform-db` not suspended while the inventory gives the
      server `database`, or suspended once another node alone carries it (while both
      carry it, during PG-A2, the schedule stays suspended and one attended drill
      pinned to the destination is run); any `Cluster` with superuser access on; an `ObjectStore` of one cluster that reads the credential
      of the other; a `Database` whose owner role owns another database; a `Cluster`, a
      `Database` or a `DatabaseRole` in a `stag` or `prod` Application; a Velero
      schedule that includes a database namespace. Rule 2.4(n)'s exemption table gains the
      claims the operator makes for a `Cluster`, with their backup named. Test: both units
      render and pass the `delivery` check; on disposable k3d with the operator, an object
      store fixture and slice 2.10's policies, a cluster starts with its job pods admitted,
      archives WAL and completes a backup. Negatives:
      one per refusal above, each with its own row in `check-faults.ts` whose fault is that
      clause removed; on k3d, the role of `canary-a` is refused a connection to `canary-b`
      (fault: leave `public` its connect privilege); a pod applied to `postgres` with the
      `product` selector is denied (fault: bind the clause to `stag` namespaces only).
- [ ] PG-S4 Alerts, logs and query statistics. A PrometheusRule in each cluster unit: the
      instance's volume and its node's filesystem above 80% and above 90%; WAL not archived for 10 minutes; no base backup for
      26 hours; instance not ready; connections above 80% of the limit; a transaction open
      for more than 5 minutes; and, for `platform-db`, a restore drill that failed. The
      rule for a drill absent for a week is in the unit's database-server overlay and
      lands with that server, as the replica-lag rule lands with the replica.
      The series names are read first from the operator's default monitoring ConfigMap and
      the plugin's metrics page at the locked versions and recorded in verify.md. The
      `Cluster` parameters: `log_min_duration_statement` 500 ms, `log_lock_waits` on,
      `log_temp_files` 0, `pg_stat_statements` with a custom metrics query for the heaviest
      statements. No replica-lag rule: it lands with the replica. Test: every rule under
      `promtool` with a series fixture. Negatives, each with its own fault: each rule fires
      on its fixture and stays quiet below its threshold; the WAL rule fires when its series
      is absent (fault: drop the `absent()` branch); the backup rule fires at 27 hours and
      not at 25 (fault: compare against 48 hours); in the database-server overlay the drill
      rule fires when no drill result exists (fault: treat absence as success), and in the
      server overlay that rule is absent and the failed-run rule present (fault: ship one
      rule file for both); a logged statement that carries a connection
      string is redacted by the collector's rules (fault: remove the pattern). Stop: the
      collector's redaction cannot cover it. Then statement logging stays off and the owner
      is told.
- [ ] PG-S5 Dumps, the restore drill and the one-database rollback. The unit's
      NetworkPolicies allow the dump job's and the drill's pods their SQL connection, the
      object storage endpoint and DNS, and the drill's pods also the API server, and
      nothing else; the drill's ServiceAccount has a Role for `Cluster` objects in its own
      namespace only; the Job `drill-verify` has a ClusterRole for get and list on
      `persistentvolumes` alone, the API server and DNS; a host timer, a
      capability-derived host setting the core's capability play (slice 1.7) installs on
      a node that carries `database` and on one that carries `nonproduction`, lists the
      provisioner's directory read-only and exports the count of directories no bound
      volume names, with its alert (design decision 3); its contract test refuses a
      node with `nonproduction` and no timer (fault: key the timer on `database`
      alone); negatives on
      k3d: with the allow removed the dump job times out (fault: test with the namespace's
      default-deny absent), a pod in the namespace without either label is refused
      port 5432 (fault: allow the whole namespace), the dump job's pod is refused the API
      server (fault: one policy for both labels), the drill creates and deletes its
      throwaway cluster with the policies in place (fault: run the drill in a namespace
      without the default-deny), and the drill's ServiceAccount is refused a `Cluster` in
      another namespace (fault: bind a ClusterRole). In each cluster's unit: a
      nightly CronJob that dumps each database to its own object under a prefix of its
      own, connecting as that database's owner role, kept 90 days by the planner of slice
      3.1. In `platform-db`'s unit: a CronJob, weekly on a database server and
      `suspend: true` while the server carries `database` (design decision 3), that
      restores the cluster from the object store into a throwaway `Cluster` in `postgres`
      that selects `database` and tolerates both taints, on the packaged
      `local-path` class, whose policy is `Delete`; runs sanity queries against it;
      deletes it; cleanup is then judged by `drill-verify` and the host reading, and the
      drill counts as failed when either finds a volume in any phase or a directory no
      bound volume names (design decision 3). It reads the node's available memory first and does not start
      under 2,304 MiB (design decision 2; negative: a fixture node with less, and the job
      exits nonzero before it creates a cluster; fault: drop the reading). It reads the
      node's filesystem first and does not start when
      the restore would take it above 65% (design decision 2). The `nonproduction-db`
      unit carries the same CronJob with `suspend: true`, restoring into a throwaway
      cluster in its own namespace on the non-production node, for PG-A3 to start once
      by hand. Its alert reads the kube-state-metrics
      series of its CronJob. The dump, the drill and the base backup are scheduled at
      different hours. A runbook, `docs/infra/postgres-recovery.md`, linked from
      `docs/infra/README.md`: a full restore; a point-in-time restore beside the live
      cluster; copying one database back; what a lost database node needs; and what to do
      when the WAL-archiving alert, the 80% alert and the 90% alert fire (design decision
      3), and when an attended drill is due (PG-A5, before a port's cut-over, after a
      change to the backup path). Test: the
      dump planner over a fixture listing; on k3d, the drill job restores a fixture
      cluster and reports; the document tests. Negatives, each with its own fault: a
      dump listing error deletes nothing (fault: treat a partial listing as complete);
      the newest dump of a database is never planned for deletion (fault: drop that
      guard); a drill whose sanity query fails reports failure and still deletes the
      throwaway cluster (fault: exit before the report); a drill that leaves a Released
      volume fails at `drill-verify` (fault: give the throwaway cluster `puni-retain`;
      second fault: have the verifier list claims instead of volumes, and watch it
      pass); a directory left with no volume raises the host reading above zero (fault:
      count only directories of bound volumes); the drill's own ServiceAccount is
      refused a list of `persistentvolumes` (fault: give it the verifier's ClusterRole); a
      throwaway cluster on a class that retains fails rule (o) (fault: drop that
      clause); a drill pointed at the live cluster's own name is refused (fault: drop
      the name comparison); a throwaway cluster that carries a WAL archiver is refused,
      so a drill can never write into the live archive (fault: copy the live cluster's
      plugin stanza); two of the three schedules at one hour fail the `delivery` check
      (fault: compare the drill with the dump only); a drill whose restore would take
      the node's filesystem above 65% does not start and reports failure (fault: skip
      the free-space read); the `nonproduction-db` unit without its suspended drill
      CronJob, or with it not suspended, fails rule (o) (fault: require the drill of
      `platform-db` only); on k3d under slice 2.10's policy the drill's throwaway pods in
      `postgres` are admitted (fault: give the throwaway cluster no selector).

- [ ] PG-S6 A bounded claim for a database on the server (design decision 2, PG8). Extend
      the `registry_storage` role, or add a role beside it that shares its code, so that a
      node that carries both `control-plane` and `database` gets one bounded filesystem of
      30 GiB, mounted under the role's directory: the volume of its own that the core's
      slice 1.11 attaches (core R9), or a preallocated filesystem on the root disk where
      the core's A29 ruled volumes out, and a static `local`
      PersistentVolume on it with a class of its own that no provisioner serves. The
      `platform-db` unit names that class when the inventory says the server carries
      `database`, and `puni-retain` otherwise; which one is a value of the unit's overlay,
      checked by rule (o) against the inventory. During PG-A2 the check admits the
      classes of the move in progress, which the inventory names: on the restore path
      the source's static class on m1plat1 together with `puni-retain` on `h10db` while
      m1plat1 still carries `database`, and on the replica path a static class on both;
      after the move it admits the class of the node that carries `database`, which is
      a static one after a switchover and `puni-retain` after a restore. A class
      outside the move the inventory names is refused (fault: drop the move from the
      inventory and see the destination's claim refused). On a node that carries `database` and
      not `control-plane` the role provisions nothing by default: there the claim is on
      `puni-retain` (design decision 3). It makes a volume of the static class on such
      a node only when the inventory sets the replica path for it, which PG-A2 does if
      the operator chooses a replica and a switchover; the role's contract test covers
      the three cases: both capabilities, `database` alone, `database` alone with the
      replica path set. Test: the role's contract test; on the
      disposable lab a claim of that class binds to the volume and a write past its size
      fails with no change in the host's free space. Negatives, each with its own fault:
      a `platform-db` claim bound for the server on `puni-retain` while the server
      carries `database` fails the `delivery` check (fault: read the unit without the
      inventory), and beside it a passing case: the restore destination's claim on
      `puni-retain` on `h10db` during the move the inventory names; the volume's path
      outside the bounded mount fails the role's verification (fault: skip the mount
      comparison). Stop: the provisioner or the operator cannot use a static volume for an
      instance. Then `platform-db` does not start on the server and the database server
      is created first (PG-A1, PG-A2's join); PG-A4 then installs the first instance
      there on `puni-retain`, with its commands limited to `h10db` and without the
      storage role, and the drill is weekly from the start.

## 2. Attended steps

### The database stage

Not on the path of the core change's stages 1 to 5. In the minimal profile no server is
created for it: PG-A3 needs a node that carries `nonproduction` (A17), and PG-A4 and PG-A5
start when the owner says so (PG8). PG-A1 and PG-A2 are the growth step to a database
server (design decision 4) and are not run before its trigger.

- [ ] PG-A1 Growth step only. Create the database server. Who: owner, at the trigger of design decision 4, as A1,
      with 8 vCPUs, 16 GiB, a root disk of at least 38 GiB and a volume of at least 93
      GiB, or a root disk of at least 140 GiB where the core's A29 ruled volumes out (PG2,
      core R9). Receipt: as A1. Stop: `df -h /` or the volume shows less, or as A1. Rollback: delete the server.
- [ ] PG-A2 Growth step only. Join it, after its 1.3 revision and slice PG-S1, then move
      the instance as design decision 4 states. Who: operator. Commands: as A13 for
      `h10db`, with `playbooks/firewall.yml` limited to the nodes already joined first.
      Receipt: `h10db` Ready with `puni.dev/capability-database-pv1=true` and
      no other capability, the taint `puni.dev/role=database:NoSchedule` and no enrollment taint; the
      only pods on it are the three node agents; then one of two paths, chosen before the
      move and recorded. The replica path: the inventory sets it for `h10db`, PG-S6's
      role is applied there so that a volume of the server's static class exists; a
      marker row is written on m1plat1 before the switchover; and the receipt is that
      volume, a replica caught up on it, a switchover, and the marker row read on
      `h10db` through the apps' database endpoint. The
      restore path, taken if the replica path is not chosen or the operator places no
      replica on that volume: the switch to the restore path is first recorded in the
      inventory, so that PG-S6's check judges the destination claim against the move
      in force; the new cluster's claim is on `puni-retain`; a static
      volume already made on `h10db` is left in place only after it is read unbound
      and unused, and none is made otherwise. With the apps' writers stopped and their
      pods read gone, the operator records a named restore point on the source, forces
      a WAL switch and reads the archive holding the segment that contains that point;
      the new cluster recovers through that restore point, and a row written just
      before the writers stopped is read on it. The receipt is that restore of design
      decision 4, its start and end noted, the restore point's name and LSN, the
      archived segment and the row. Either way: with the schedule still suspended, one
      attended drill pinned to `h10db` is run and seen; the weekly schedule is resumed
      only after the capability play has taken `database` from m1plat1. Stop: validation fails, another pod is scheduled there, a restore would
      start without the owner's word on the hour, the segment is not in the archive,
      or recovery ends before the restore point; writes are not reopened and the
      source is not removed in either case. Rollback: as A13, which deletes the
      server, only until the instance on `h10db` accepts writes. From its first write
      the server is kept and the way is forward: a failed drill or validation is
      repaired there. If the server has to go all the same, the writers are stopped
      first, another primary is proven to hold its final commits by the same restore
      point, WAL switch and archived segment, and to serve the apps, and only then is
      `h10db` deleted. The instance and volume on m1plat1 are removed only after the
      new one serves with its path's row read and that attended drill has run on
      `h10db`.
- [ ] PG-A3 The operator, the plugin and the non-production cluster, after A17, stage 3's
      receipt, slices 2.10 and PG-S2 to PG-S5, and the store paths design decision 3 asks of
      pull request #935. Who: operator; owner for the values. Commands: first run
      `playbooks/capabilities.yml` limited to the node that carries `nonproduction`,
      h7obs in the minimal profile, with PG-S5 merged, which installs the drill's host
      timer there, and read the timer active and its metric exported; A17's run of that
      play predates PG-S5 and does not count. Then the owner makes in S3 (core R6), in a
      region other than the servers', the non-production database bucket and its key,
      limited to it and read back as refused on a production bucket, escrows the key and
      writes it
      into OpenBao: the key of the non-production database bucket, one that cannot read a
      production bucket and is not staging's SQLite backup key, and generates the two
      canary role passwords there; merge the Application files of orders 18 to 20 for
      these three units; sync `namespaces`, `policy`, `secret-sync`, `cnpg-operator`,
      `barman-plugin` and `nonproduction-db`; create one on-demand `Backup`; run the dump
      job once; start one run of the unit's suspended drill CronJob by hand
      (`kubectl create job --from=cronjob/…`); delete the unit's egress NetworkPolicy by
      hand for long enough to see the WAL rule fire, follow the runbook's response to
      that alert, then sync the unit, which restores the policy. After 24 hours read each container's working set
      and `memory.stat`. Receipt: the three units Synced and Healthy; the operator and
      plugin pods on m1plat1; the instance on the node that carries `nonproduction`, h7obs in
      the minimal profile, with its claim bound on `puni-retain`,
      and its job pods admitted there; the host timer active on that node before the
      drill ran; both canary databases present and the role of one
      refused on the other; a first recoverability point and a completed base backup read
      from the plugin's metrics; one dump object per database; the drill's sanity result,
      the receipt of `drill-verify`, no volume of the throwaway cluster in any phase, and
      the host reading, no directory without a bound volume; a read of a
      named object of a production bucket refused with this key by an authorisation
      error, and one of its own objects read; both jobs' pods seen connected to the instance under
      the namespace's policies; the WAL alert seen firing in Alertmanager
      and cleared; the per-container memory table and the limits kept or changed by a
      commit. Stop: a unit is not Healthy after 20 minutes, a pod of the cluster is
      denied by the placement policy, WAL is not archived, the restore fails or leaves a
      volume or a directory, a dump or drill pod is refused its SQL connection, the
      object storage endpoint or DNS, the drill or the verifier is refused the API
      server, any of those pods reaches a destination outside that list,
      or the key can read a production object. Rollback: nothing reads the
      cluster yet. Reduce `nonproduction-db` and `barman-plugin` to their markers and
      sync, then remove their Application files; the `Cluster` and its claim carry
      `Prune=false` and are removed by hand, the canary data being disposable. The
      operator's CRDs stay until no object of their kinds is left (core decision 3).
- [ ] PG-A4 The production cluster, on the platform node in the minimal profile (PG8),
      or on the database server by PG-S6's stop, when the owner says so, after A17, PG-A3's receipt and slices PG-S5 and PG-S6. Who:
      operator; owner for the values. Commands: merge the inventory revision of PG-S1 and
      run `playbooks/capabilities.yml` limited to m1plat1; apply the storage
      role of PG-S6 limited to m1plat1; the owner makes in S3 (core R6), in a region other
      than the servers', the production database bucket and its key, limited to it and read
      back as refused on any other bucket, escrows it, and writes the production database bucket's key
      and the canary passwords; merge the `platform-db` Application; sync `secret-sync` and
      `platform-db`; create one on-demand `Backup`; run the dump job once; apply by hand a
      pod in `postgres` with the `product` selector. After 24 hours read memory as in PG-A3
      and `kubectl top node m1plat1`. Receipt: m1plat1 carries `database`; the drill CronJob
      suspended; the bounded filesystem mounted and the instance's claim bound to
      its volume; the unit Synced and Healthy; the instance and its sidecar on m1plat1; the
      platform pods there with unchanged restart counts; a first
      recoverability point, a completed base backup and one dump object per database; the
      hand-applied pod denied; every PostgreSQL rule loaded and none firing; the memory
      table against design decision 2. Stop: the instance is killed for memory, the node's
      available memory falls under 1,024 MiB, a platform pod restarts, the claim is not on
      the bounded filesystem, or WAL is not archived. A memory stop is the trigger of the
      growth step, not a reason to raise the limit on this node. Rollback: as PG-A3; no app has data there.
- [ ] PG-A5 Prove the restore, after PG-A4. Who: operator, at an hour the operator picks;
      the drill fits beside the dump and Harbor's backup on the platform server bought
      (design decision 2), and its memory guard still applies. Commands: write a first marker row
      into `canary-a` and note the time; write a second; start the suspended drill job
      once by hand;
      then follow `docs/infra/postgres-recovery.md`: restore `platform-db` beside the live
      cluster, on the reclaiming class, to the noted time, copy `canary-a` back, and delete the side cluster. Receipt:
      the drill's duration and its sanity result; in the live `canary-a` after the copy, the
      first marker present and the second absent, and `canary-b` unchanged; the time from
      the start of the restore to the copy's end, which replaces PG6's two hours in
      design.md by a commit; the drill's series present and its alert quiet; the drill's
      throwaway instance seen on the node that carries `database`, m1plat1 in the
      minimal profile, with the platform pods' restart counts unchanged; no throwaway
      cluster or claim left, the receipt of `drill-verify` and the host reading both clean, that node's disk back to its reading
      before, and its highest reading during the drill, which stayed under 80%. Stop: a restore fails, the copy changes `canary-b`, the disk does not
      return, or the 80% alert fired during the drill. Then no port may write production data to
      `platform-db`, and the owners of the port changes are told. Rollback: delete the
      throwaway clusters; the live cluster is not touched by a restore.
