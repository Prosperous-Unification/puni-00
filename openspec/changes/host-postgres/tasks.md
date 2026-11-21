Agent slices (PG-S1 to PG-S5) change source and run tests; none touches a host. Attended steps
(PG-A1 to PG-A5) each name who runs them, the command, the receipt, the stop condition and the
rollback. Ids with the prefix PG are this change's and refer to [design.md](design.md); every
other id is the core change's, [`separate-node-roles`](../separate-node-roles/tasks.md), and
"core decision n" is a decision of its design. `fleet_ansible`, `$OPS` and "sync" mean what
that change's tasks.md says. Every slice that adds a safety check lands it with a
production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

## 0. Decisions

- [ ] PG-0.1 Owner reads assumptions PG1 to PG7 and the two open questions in design.md and
      overrules by id. He may overrule PG3 to PG6 (the shape of the PostgreSQL service and
      its recovery targets); PG7, Harbor's database, is open question 2. Receipt: the
      overrules, dated and quoted, in verify.md. No slice starts before the core change's
      task 0.1 has its receipt.
- [ ] PG-0.2 File the decision record from design.md as an ADR under the next free number,
      once the core change's two have theirs, link it from proposal.md, and delete the
      quoted copy. Test: `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] PG-0.3 After PG-0.1: tell the owner of pull request #935 what design decision 3 asks
      of the store, and the owners of the WBS deploy tooling and of the release bootstrap
      which port changes design decision 5 names for them. Receipt: the messages, dated, in
      verify.md.

## 1. PostgreSQL hosting (agent slices)

All five are due before the database stage and block nothing in the core change (design
decision 4, PG1 to PG7). They follow the core change's slices 1.1, 2.1 to 2.5, 2.10 and 3.1,
which they extend.

- [ ] PG-S1 The database role. Add the capability `database` to `CapabilitySchema`,
      `fleetCapabilities`, `purposeCapabilities.platform` and `RequiredCapabilitiesSchema`. In
      the production placement check: a node that carries `database` carries nothing else. In
      the `k3s_agent` template: a node with `database` also writes the taint
      `puni.dev/role=database:NoSchedule` (PG2). The inventory revision for `h10db` follows
      PG-A1, as slice 1.3 does for every server, with the reservations of design decision 2 and
      the floor `database: 1`. Test: `contracts.test.ts`; the template renders both taints.
      Negatives, each with its own fault: a workers node carrying `database` is refused
      (fault: add it to `purposeCapabilities.workers`); a node with `database` and `product`,
      or `database` and `ingress`, is refused (fault: compare against `product` only); a
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
      (environment `platform`) and `postgres-nonproduction` (environment `staging`) in the
      `namespaces` unit; a SecretStore for each in `secret-sync`; a clause in slice 2.10's
      placement policy that a pod in `postgres` selects `database`; NetworkPolicies in each
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
      retains or with a WAL archiver; any `Cluster` with superuser access on; an `ObjectStore` of one cluster that reads the credential
      of the other; a `Database` whose owner role owns another database; a `Cluster`, a
      `Database` or a `DatabaseRole` in a `staging` or `production` Application; a Velero
      schedule that includes a database namespace. Rule 2.4(n)'s exemption table gains the
      claims the operator makes for a `Cluster`, with their backup named. Test: both units
      render and pass the `delivery` check; on disposable k3d with the operator, an object
      store fixture and slice 2.10's policies, a cluster starts with its job pods admitted,
      archives WAL and completes a backup. Negatives:
      one per refusal above, each with its own row in `check-faults.ts` whose fault is that
      clause removed; on k3d, the role of `canary-a` is refused a connection to `canary-b`
      (fault: leave `public` its connect privilege); a pod applied to `postgres` with the
      `product` selector is denied (fault: bind the clause to `staging` namespaces only).
- [ ] PG-S4 Alerts, logs and query statistics. A PrometheusRule in each cluster unit: the
      instance's volume and its node's filesystem above 80% and above 90%; WAL not archived for 10 minutes; no base backup for
      26 hours; instance not ready; connections above 80% of the limit; a transaction open
      for more than 5 minutes; and, for `platform-db`, the restore drill failed or absent.
      The series names are read first from the operator's default monitoring ConfigMap and
      the plugin's metrics page at the locked versions and recorded in verify.md. The
      `Cluster` parameters: `log_min_duration_statement` 500 ms, `log_lock_waits` on,
      `log_temp_files` 0, `pg_stat_statements` with a custom metrics query for the heaviest
      statements. No replica-lag rule: it lands with the replica. Test: every rule under
      `promtool` with a series fixture. Negatives, each with its own fault: each rule fires
      on its fixture and stays quiet below its threshold; the WAL rule fires when its series
      is absent (fault: drop the `absent()` branch); the backup rule fires at 27 hours and
      not at 25 (fault: compare against 48 hours); the drill rule fires when no drill result
      exists (fault: treat absence as success); a logged statement that carries a connection
      string is redacted by the collector's rules (fault: remove the pattern). Stop: the
      collector's redaction cannot cover it. Then statement logging stays off and the owner
      is told.
- [ ] PG-S5 Dumps, the restore drill and the one-database rollback. In each cluster's unit: a
      nightly CronJob that dumps each database to its own object under a prefix of its
      own, connecting as that database's owner role, kept 90 days by the planner of slice
      3.1. In `platform-db`'s unit: a weekly CronJob that restores the cluster from the
      object store into a throwaway `Cluster` on the database node, on the packaged
      `local-path` class, whose policy is `Delete`; runs sanity queries against it;
      deletes it; and fails unless no volume of it is left, Released or as a directory
      (design decision 3). It reads the node's filesystem first and does not start when
      the restore would take it above 65% (design decision 2). The `nonproduction-db`
      unit carries the same CronJob with `suspend: true`, restoring into a throwaway
      cluster in its own namespace on the non-production node, for PG-A3 to start once
      by hand. Its alert reads the kube-state-metrics
      series of its CronJob. The dump, the drill and the base backup are scheduled at
      different hours. A runbook, `docs/infra/postgres-recovery.md`, linked from
      `docs/infra/README.md`: a full restore; a point-in-time restore beside the live
      cluster; copying one database back; what a lost database node needs; and what to do
      when the WAL-archiving alert, the 80% alert and the 90% alert fire (design decision
      3). Test: the
      dump planner over a fixture listing; on k3d, the drill job restores a fixture
      cluster and reports; the document tests. Negatives, each with its own fault: a
      dump listing error deletes nothing (fault: treat a partial listing as complete);
      the newest dump of a database is never planned for deletion (fault: drop that
      guard); a drill whose sanity query fails reports failure and still deletes the
      throwaway cluster (fault: exit before the report); a drill that leaves a Released
      volume or a directory fails (fault: give the throwaway cluster `puni-retain`); a
      throwaway cluster on a class that retains fails rule (o) (fault: drop that
      clause); a drill pointed at the live cluster's own name is refused (fault: drop
      the name comparison); a throwaway cluster that carries a WAL archiver is refused,
      so a drill can never write into the live archive (fault: copy the live cluster's
      plugin stanza); two of the three schedules at one hour fail the `delivery` check
      (fault: compare the drill with the dump only); a drill whose restore would take
      the node's filesystem above 65% does not start and reports failure (fault: skip
      the free-space read); the `nonproduction-db` unit without its suspended drill
      CronJob, or with it not suspended, fails rule (o) (fault: require the drill of
      `platform-db` only).

## 2. Attended steps

### The database stage

Not on the path of the core change's stages 1 to 5. PG-A3 needs no database server, only the
non-production node (A17); PG-A1, PG-A2, PG-A4 and PG-A5 start when the owner creates the
server (PG2).

- [ ] PG-A1 Create the database server. Who: owner, when he chooses (open question 1), as A1,
      with 8 vCPUs, 16 GiB and a root disk of at least 140 GiB (PG2). Receipt:
      as A1. Stop: `df -h /` shows less, or as A1. Rollback: delete the server.
- [ ] PG-A2 Join it, after its 1.3 revision and slice PG-S1. Who: operator. Commands: as A13 for
      `h10db`, with `playbooks/firewall.yml` limited to the nodes already joined first.
      Receipt: `h10db` Ready with `puni.dev/capability-database=true` and no other
      capability, the taint `puni.dev/role=database:NoSchedule` and no enrollment taint; the
      only pods on it are the three node agents. Stop: validation fails, or another pod is
      scheduled there. Rollback: as A13.
- [ ] PG-A3 The operator, the plugin and the non-production cluster, after A17, stage 3's
      receipt, slices 2.10 and PG-S2 to PG-S5, and the store paths design decision 3 asks of
      pull request #935. Who: operator; owner for the values. Commands: the owner writes
      into OpenBao the key of the non-production database bucket, one that cannot read a
      production bucket and is not staging's SQLite backup key, and generates the two
      canary role passwords there; merge the Application files of orders 18 to 20 for
      these three units; sync `namespaces`, `policy`, `secret-sync`, `cnpg-operator`,
      `barman-plugin` and `nonproduction-db`; create one on-demand `Backup`; run the dump
      job once; start one run of the unit's suspended drill CronJob by hand
      (`kubectl create job --from=cronjob/…`); delete the unit's egress NetworkPolicy by
      hand for long enough to see the WAL rule fire, follow the runbook's response to
      that alert, then sync the unit, which restores the policy. After 24 hours read each container's working set
      and `memory.stat`. Receipt: the three units Synced and Healthy; the operator and
      plugin pods on h5plat; the instance on h9stg with its claim bound on `puni-retain`,
      and its job pods admitted there; both canary databases present and the role of one
      refused on the other; a first recoverability point and a completed base backup read
      from the plugin's metrics; one dump object per database; the drill's sanity result,
      and no Released volume or directory of its throwaway cluster left; a listing of a
      production bucket refused with this key; the WAL alert seen firing in Alertmanager
      and cleared; the per-container memory table and the limits kept or changed by a
      commit. Stop: a unit is not Healthy after 20 minutes, a pod of the cluster is
      denied by the placement policy, WAL is not archived, the restore fails or leaves a
      volume, or the key can list a production bucket. Rollback: nothing reads the
      cluster yet. Reduce `nonproduction-db` and `barman-plugin` to their markers and
      sync, then remove their Application files; the `Cluster` and its claim carry
      `Prune=false` and are removed by hand, the canary data being disposable. The
      operator's CRDs stay until no object of their kinds is left (core decision 3).
- [ ] PG-A4 The production cluster, after PG-A2 and PG-A3's receipt and slice PG-S5. Who: operator;
      owner for the values. Commands: the owner writes the production database bucket's key
      and the canary passwords; merge the `platform-db` Application; sync `secret-sync` and
      `platform-db`; create one on-demand `Backup`; run the dump job once; apply by hand a
      pod in `postgres` with the `product` selector. After 24 hours read memory as in PG-A3
      and `kubectl top node h10db`. Receipt: the unit Synced and Healthy; the instance and
      its sidecar on `h10db` and nothing else there but the node agents; a first
      recoverability point, a completed base backup and one dump object per database; the
      hand-applied pod denied; every PostgreSQL rule loaded and none firing; the memory
      table against design decision 2 and the owner's decision on the server's size. Stop:
      the instance is killed for memory, the node's available memory falls under 1,024 MiB, or
      WAL is not archived. Rollback: as PG-A3; no app has data there.
- [ ] PG-A5 Prove the restore, after PG-A4. Who: operator. Commands: write a first marker row
      into `canary-a` and note the time; write a second; run the drill job once by hand;
      then follow `docs/infra/postgres-recovery.md`: restore `platform-db` beside the live
      cluster, on the reclaiming class, to the noted time, copy `canary-a` back, and delete the side cluster. Receipt:
      the drill's duration and its sanity result; in the live `canary-a` after the copy, the
      first marker present and the second absent, and `canary-b` unchanged; the time from
      the start of the restore to the copy's end, which replaces PG6's two hours in
      design.md by a commit; the drill's series present and its alert quiet; no throwaway
      cluster, claim, Released volume or directory left, the disk back to its reading
      before, and its highest reading during the drill, which stayed under 80%. Stop: a restore fails, the copy changes `canary-b`, the disk does not
      return, or the 80% alert fired during the drill. Then no port may write production data to
      `platform-db`, and the owners of the port changes are told. Rollback: delete the
      throwaway clusters; the live cluster is not touched by a restore.
