Agent slices (phases 1 to 3) change source and run tests; none touches a host. Attended steps
(A1 to A22) each name who runs them, the command, the receipt, the stop condition and the
rollback. Assumption and decision numbers refer to [design.md](design.md). Every slice that
adds a safety check lands it with a production-path negative, watched failing with the check
removed, and an adjacent `Proof:` comment. Nothing here has been done yet.

`fleet_ansible` is the controller wrapper of
[enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni),
run from the operator workstation (R17) against the new inventory of slice 1.3, always with
`--limit`: an unlimited play also targets the CI host, which is not a k3s node. `$OPS` is its
owner-only input directory.

## 0. Decisions

- [ ] 0.1 Owner reads assumptions R1 to R28 and the fourteen open questions in design.md and
      overrules by id. The items of design decision 10 are needed before stage 1; the rest can
      wait as that decision lists. Receipt: the overrules, dated, in verify.md. Until then only
      slices 1.1, 1.2 and 2.1 to 2.5 may start; the rehearsal 2.7 needs 2.1 to 2.5 and follows
      them.
- [ ] 0.2 File the two decision records from design.md as ADRs under the next free numbers
      once pull requests #935 and #948 and the Harbor record have settled theirs, link them
      from proposal.md, and delete the quoted copies. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: the Harbor change's owner adds a dated pointer to this change in its
      `proposal.md` and `tasks.md` and makes the amendments of design decision 9. Test:
      `./node_modules/.bin/openspec validate --all --json`.
- [ ] 0.4 After 0.1: tell the owners of pull request #935, of `dash-host-jobs`, of the release
      bootstrap, of the WBS cutover plan and of h1claw's backup sets what decision 9 asks of
      each, and that this change edits no path the old cluster reconciles, so its pin needs no
      freeze. Receipt: the five messages, dated, in verify.md.
- [ ] 0.5 Escrow check, before stage 1 (guard 2). Who: owner. On a machine that never held the
      originals, read back the backup archive key, the registry CA key pair, the object
      storage credentials and the old cluster's age identity, and compare each fingerprint
      with the escrow entry ([recovery](../../../docs/infra/recovery.md#recovery-secrets)).
      Receipt: four matching fingerprints, dated, in verify.md; no value. Stop: any is missing
      or differs. Then copy it into escrow from the host that holds it before anything else
      proceeds.
- [ ] 0.6 The rules that guard `main` (R20). Who: owner. For this repository and for the fleet
      repository, both before A2: A2 writes to the fleet repository and A4 reads from both.
      Commands: read the rules that apply to `main` with
      `gh api repos/<repository>/rules/branches/main`; add what is missing so that a change
      needs a pull request and the required checks and no push may be direct, forced or
      deleting; on the fleet repository require its `fleet-check`; list the bypass actors.
      Receipt: the rules read back for both; a direct push of a test commit refused; a forced
      push refused; the bypass list, which names no agent account. Stop: either push is
      accepted. Rollback: none needed; no rule is loosened. Read on 2026-11-21: this
      repository's `main` requires a pull request with zero approvals and the status checks
      `gate` and `pixels`, not strict, with no bypass actor and no rule against forced or
      deleting pushes; the fleet repository's `main` had no rule. Zero approvals and
      non-strict checks stay as they are and are listed under Risks in design.md.

## 1. Fleet model and roles (agent slices)

- [ ] 1.1 Add the capability `platform-services` to `CapabilitySchema`, `fleetCapabilities`,
      `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` in
      `tools/tool-fleet/src/contracts.ts`. Test: `contracts.test.ts` accepts a platform node
      that carries it. Negatives: a workers node carrying it is refused; a platform cluster
      whose floor names it with no such node is refused. Fault to inject: add it to
      `purposeCapabilities.workers` and watch the workers negative pass wrongly.
- [ ] 1.2 Role rules and the platform taint. In the production placement check: the
      `control-plane` node of a platform cluster that requires `platform-services` carries it
      and neither `product` nor `ingress`; no host in `gate_hosts` is in a k3s group of the
      same inventory. In the `k3s_server` template: a server with `platform-services` writes
      the taint `CriticalAddonsOnly=true:NoSchedule` (R25). In `validate-enrollment.yml`: the
      CoreDNS step appends the enrollment toleration when it is absent (a JSON patch that adds
      one list entry) where it now replaces the whole list with a strategic patch, so the
      packaged `CriticalAddonsOnly` toleration stays. Test: the template renders the taint;
      the play's contract test reads the patch type; in the rehearsal of 2.7 a one-node server
      registered with both taints brings CoreDNS to Ready, `validate-enrollment.yml` passes,
      and CoreDNS, the metrics server and the volume provisioner are Ready afterwards.
      Negatives, each with its own fault: a server with `product` is refused (fault: drop the
      capability comparison); a gate host under `k3s_agents` is refused (fault: skip the
      gate-host comparison); a `platform-services` server whose rendered config lacks the
      taint fails the role test (fault: remove the template branch); a play whose CoreDNS
      step replaces the toleration list fails the contract test (fault: restore the strategic
      patch). The existing two-node path keeps passing its tests unchanged. Stop: validation
      cannot pass on one node with both taints. Then the cause is reported and the owner
      decides; R25's alternative (selectors and rule 2.4(f) alone) is not applied silently.
- [ ] 1.3 Repeats once per stage, after A1, A8, A13 and A17 and before the step that enrolls
      the host. Each revision records the node's machine id and private address where the
      fleet model already records them for the two existing nodes (`desired.yaml`, the
      inventory), pending open question 13; a public address or a provider id goes to `$OPS`
      only and never into this repository. Add the cluster `platform-2` (R5) to
      `infra/fleet/desired.yaml` with its first node and the floor `platform-services: 1`;
      later revisions add each node, raise the floor for its capability, and extend
      `puni_enrolled_private_addresses`. Add `infra/ansible/inventory/production-hosts.yml`
      with the same nodes, the reservations of design decision 2, and `h8ci` under
      `gate_hosts` only. The jump of R17 is an input in `$OPS`, not a line of the inventory. Extend `placement.test.ts` to bind this inventory to
      `platform-2` beside the existing pair. Negatives: a machine id that differs between the
      two files is refused; a node present in one file only is refused. Fault to inject:
      compare node names only and watch the machine-id negative pass wrongly.
- [ ] 1.4 Reservations and coexistence record for a node without Docker services or a
      migration overlap: a record for `h7obs` under `infra/argocd/units/observability`, the
      reservations in the new inventory, MLflow's limit if R15 holds. Test: the observability
      budget test reads the new record. Negative: a reservation in the inventory that differs
      from the record fails. Fault to inject: read the old record for the new node and watch
      the negative pass wrongly.
- [ ] 1.5 `observability-source.ts` takes the cluster as input: the inventory path, the peers
      and the API endpoint come from that cluster's inventory and `desired.yaml` entry, not
      from literals. Test: the existing source tests pass for the old pair unchanged and for
      the new pair. Negative: a peer absent from the named cluster's inventory is refused for
      each cluster. Fault to inject: restore one literal and watch the new cluster's negative
      pass wrongly.

## 2. Argo CD delivery (agent slices)

Slices 2.1 to 2.7 and 2.9 are needed before A4; 2.8 before stage 3.

- [ ] 2.1 Locked install. Vendor the Argo CD v3.6.2 install manifest in `infra/argocd/install`
      with its SHA-256 under `manifests.argocdInstall` in `infra/versions/toolchain.json` and
      a schema variant that keeps retained locks readable. The kustomization removes Dex, the
      notifications controller and the ApplicationSet controller; pins every image by digest;
      sets the selector, toleration and the limits of R24; restores the Application health
      check; sets `kustomize.buildOptions: --enable-helm`, `policy.default: role:readonly`,
      the local account and `admin.enabled: "false"`; adds the NetworkPolicy. Test:
      `contracts.test.ts` accepts the lock and the render has four workloads. Negatives, each
      with its own fault: changed manifest bytes are refused (fault: drop the digest
      comparison); a rendered image without a digest is refused; a render with an Ingress, with
      `admin` enabled or with a default role other than `role:readonly` is refused; a render
      without the health customization for `argoproj.io/Application` is refused (fault:
      delete the customization and watch the check still pass).
- [ ] 2.2 Wrapper charts. For cert-manager and Traefik: a chart directory under
      `infra/argocd/units` whose `Chart.yaml` names the locked archive as a dependency, whose
      `charts/` holds it, and whose values are those of the existing `HelmRelease`. Its
      `releaseName` is the old release's name, because selectors in the tree name it. Test:
      the locked `helm template --include-crds` output of the wrapper equals the render
      `tool-fleet` already makes of the `HelmRelease`, release name and CRDs included, apart
      from placement, and `helm template` succeeds with the network disabled. Negatives, each
      with its own fault: an archive whose SHA-256 differs from the lock is refused (fault:
      skip the digest comparison); a value that renders differently on a second run fails
      (fault: add a generated value); a wrapper with another release name fails the equality
      test (fault: drop `releaseName`).
- [ ] 2.3 Platform-stage units: `namespaces`, `policy`, `storage` and `issuers` as kustomize
      directories under `infra/argocd/units`, copied from the manifests the Flux stages
      `controllers`, `policy`, `storage` and `platform` render: every namespace, the admission
      and network policy, the storage classes, the registry CA issuer and the staging ACME
      issuer, with no Distribution workload (R10), without the `registry-tls` Certificate,
      which is the Harbor unit's, and without the `otel-server` pair, which is slice 2.8's.
      `namespaces` also carries `website-prod-logs`, which no manifest of this repository
      declares today. The ConfigMap `puni-trusted-workload` carries the ignore rule of design
      decision 3. Test: each directory's render equals the old stage's render at this commit,
      apart from Flux kinds, placement and the rows of decision 3's table. Negatives: a copy
      that drops a NetworkPolicy fails the equality test (fault: delete one copied object); a
      `policy` Application without the `solverImages` ignore rule and
      `RespectIgnoreDifferences=true` fails the `delivery` check (fault: remove the rule).
- [ ] 2.4 Application graph and the `delivery` check family. Add the two AppProjects, the root
      Application and one Application file per unit of waves 0 to 3 under
      `infra/argocd/clusters/platform-production`, and `tools/tool-fleet/src/argocd.ts`,
      wired into `tool-fleet:check`. The check refuses each of the following. Each letter has
      its own negative and its own row in `check-faults.ts`, whose fault is that rule removed.
      (a) An Application outside its project's sources or destinations, with a destination
      other than the in-cluster API, or with a `targetRevision` other than `main`; the WBS
      Application alone may pin a commit. An `apps` project that admits a cluster-scoped kind
      other than `ClusterIssuer` or any Namespace. (b) One without automated `prune`,
      `selfHeal` and a retry policy, or with the resources finalizer. The Application `wbs`
      alone lands without automation; any other Application without it is refused, and so is
      a root that lacks the ignore rule for `wbs` `/spec/syncPolicy` with
      `RespectIgnoreDifferences=true` or that ignores any other child's field. (c) Waves that differ from the table of design
      decision 3. (d) A rendered object of a `toolkit.fluxcd.io` group, a remote
      kustomize base, or a document with a `sops` key under an Application source path.
      (e) A file that is in an Application's source closure and in the closure of a Flux unit
      under `infra/clusters`, chart archives excepted. (f) A pod template without a capability
      selector, or one that tolerates `CriticalAddonsOnly` or every taint without selecting
      `platform-services`. The three node-agent DaemonSets of design decision 1 are exempt by
      name; a fourth DaemonSet, or a Deployment, with a blanket toleration is refused. (g) A
      PersistentVolumeClaim, a namespace that holds one, or an Elasticsearch, Prometheus or
      Alertmanager resource without `Prune=false` and `Delete=false`. (h) A Distribution
      workload. (i) A Job that carried Flux's `force` annotation without
      `Force=true,Replace=true`. (j) A kustomize unit that inflates a chart whose archive
      has a `crds/` directory without `includeCRDs: true`, or a Helm source of such a chart
      with `skipCrds`. The family also runs as `argocd.test.ts` over the repository's real
      tree, as `platform.test.ts` does for `validatePlatform`, and that project's inputs
      name `infra/argocd/**`, so the required `gate` check selects it for a change under
      that path alone. Negative: a change to one file under `infra/argocd` selects the test
      (fault: drop the input glob).
- [ ] 2.5 Bootstrap playbook `infra/ansible/playbooks/argocd.yml`: require the cluster id, the
      install digest and the secret file list; refuse a host that has a `flux-system`
      namespace or whose node name is in another inventory; create the immutable identity
      ConfigMap `kube-system/puni-cluster-<id>` when the cluster has none, as only the Flux
      play does today, and refuse a cluster that has one for another id; apply the
      `namespaces` unit; decrypt each bootstrap Secret of design decision 5 on the controller
      and apply it through the API under `no_log`; apply the install with a server-side apply;
      wait for the workloads; apply the two AppProjects and the root Application. Test:
      `infra/ansible/tests`, including a second run with one more secret file, which changes
      that Secret and nothing else. Negatives, each with its own fault: a wrong install digest
      is refused; a missing secret file is refused before anything is applied; a host with
      `flux-system` is refused (fault: remove that guard); a cluster that already carries
      another id's ConfigMap is refused and nothing is applied (fault: create without
      reading); a second run on the same cluster leaves the ConfigMap unchanged.
- [ ] 2.6 Health and recovery for a cluster delivered by Argo CD. `tool-fleet:health` gains a
      rule that reads Applications where the cluster's delivery is Argo CD and no longer
      reports "no Flux objects" there; the recovery manifest and `verify-cold-restore` accept
      such a cluster, and the drill's last step reads the root Application. Test: the health
      and recover suites for both deliveries. Negatives: a Degraded or OutOfSync Application
      fails health; an Argo CD cluster with no Application fails health. Fault to inject:
      treat a missing Application list as healthy.
- [ ] 2.7 Rehearsal. A k3d lab profile that brings the new tree up with the bootstrap
      playbook's steps, and the staged build on the QEMU lab. Host: the operator workstation,
      which has `/dev/kvm`, once it has 60 GiB free; it does not today. Otherwise, as design
      decision 10 states: the k3d part on the server created in A1 before A3, and the staged
      build as a throwaway pass on that server and one temporary server, both deleted and
      created again afterwards.
      Receipt in verify.md: (a) the root and every child Synced and Healthy from an empty
      cluster, and the wave at which each became so; (b) every object OutOfSync after the
      first sync with no Git change, which is the `ignoreDifferences` list; (c) what each
      chart's hooks did; (d) that `argocd-secret` kept the password hash and its generated
      keys after a self-managed sync; (e) whether helm followed a linked chart archive, and
      whether kustomize inflated a chart from a local archive with the network disabled;
      (f) validation's result on a one-node cluster registered with both taints, and
      CoreDNS's tolerations after it; (g) a manual
      edit reverted by self-heal, a deleted manifest whose claim survived, and break-glass
      holding with the root's automation off; (h) the stage states after each join, with the
      firewall refreshed first, and the time of an etcd restore; (i) a rewritten
      `solverImages` left alone by a sync, and a changed `force` Job recreated; (j) a merge
      that changes two dependent units at once converging by retry, with the retries counted;
      (k) the Traefik and Velero CRDs present after the first sync; (l) a Certificate that
      cannot be issued keeping its unit from Healthy; (m) the `otlp-ingress` NetworkPolicy
      selecting the collector's pods; (n) the `wbs` Application's automation turned on in the
      cluster and left on by the root's next sync, and another child's edit reverted.
      Stop: an Application cannot become Healthy, or validation cannot pass with one node.
      Then design decisions 3 and 6 are revised before any attended step. Fallbacks already
      decided: for (d), the Secret leaves the managed set; for (e), the wrapper holds a copy
      and Velero uses a committed render. For (f) there is no automatic fallback: the owner
      decides (slice 1.2).
- [ ] 2.8 Units for waves 5 to 10, before stage 3: `observability-secrets` with one
      ExternalSecret for each of the fifteen operator-provided Secrets (R22);
      `otel-certificates`; wrapper charts for the ECK operator, the Prometheus stack and the
      OTel collector; Velero as a kustomize unit that inflates its chart and carries the
      patch of its `postRenderers` and `includeCRDs: true`; kustomize units for
      Elasticsearch, Kibana, signals, alerts and the Elasticsearch snapshots, with
      `Force=true,Replace=true` on the three Jobs and the cluster name in the Prometheus
      stack's values file; `ServerSideApply=true` where CRDs need it. The `alerts` unit
      leaves out the workers rule and the group that watches the WBS backup CronJob; that
      group is added by the revision that adds the `wbs` Application. A table of
      operator-made Secrets names the two that ECK makes for Elasticsearch and their
      providing unit. Tests and negatives as 2.2 and 2.3, plus, each with its own fault: a
      unit that reads a Secret with no provider (bootstrap entry, ExternalSecret, Certificate
      in the tree, or a row of the operator table) fails the `delivery` check (fault: remove
      one ExternalSecret); a unit in a wave at or below its Secret's providing unit fails
      rule (c) (fault: move `signals` back to Elasticsearch's wave); an alert rule whose
      selector names a CronJob, namespace or cluster that no unit of the tree renders at that
      revision fails the check (fault: copy the workers rule); an ExternalSecret whose value
      is absent keeps
      `observability-secrets` unhealthy in the lab (fault: mark it healthy by a customization);
      the `otel-server` Issuer in a wave at or below its Secret's fails rule (c) (fault: move
      it to wave 3); Velero's render without the two size limits fails the equality test
      (fault: drop the patch).
- [ ] 2.9 Runbook `docs/infra/build-platform-cluster.md`: the build from empty servers, with
      every `$OPS` input, the escrow step for each new secret, the receipts of A1 to A7, how
      a change reaches the cluster and is reverted, what the waves do and do not order, how to
      reach the Argo CD interface, the jump when the platform node is off, and the break-glass
      procedure, root first. Link it from `docs/infra/README.md`. Test: the `tool-devsync`
      document tests and `check-indexes`.

## 3. Custody, probes and cleanup (agent slices)

- [ ] 3.1 SQLite custody in the cluster, before stage 4 (R13, guard 3). A unit
      `sqlite-custody`: a CronJob that applies the retention of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle) to the cluster's own prefix
      as a pure planner plus a thin shell, and a PrometheusRule per app backup CronJob. Its
      source is the pair of kube-state-metrics series the existing `PuniSqliteBackupStale`
      rule reads, `kube_cronjob_status_last_successful_time` and `kube_cronjob_created`: it
      fires when the last success is older than two intervals, when the job has never
      succeeded for that long, and when the series is absent. The new cluster's app overlays
      set `BACKUP_PREFIX` to a value that names the cluster and is neither `sqlite` nor under
      `sqlite/`, which h1claw prunes. Test: the planner over a fixture listing;
      `tool-deploy:test:backup` with one prune run; the rule under `promtool`. Negatives: a
      snapshot whose report is missing is kept and reported; the newest report is never
      planned for deletion; a listing error deletes nothing; an app overlay whose prefix is
      `sqlite` or begins with `sqlite/` fails the `delivery` check; a last success older than
      two intervals fires the rule; an absent series fires the rule. Faults to inject, one per
      negative: delete a snapshot without its report; drop the newest-report guard; treat a
      partial listing as complete; refuse only the bare `sqlite`; compare the age against
      four intervals; drop the `absent()` branch.
- [ ] 3.2 Before A15, whose `probes` unit it fills. Outside liveness probes (R16): one probe
      per k3s node and per gate host from the
      observability stack's blackbox exporter, and a host timer on the platform node that
      probes the observability node. Test: the rules render. Negative: a node in
      `desired.yaml`, or a host in `gate_hosts`, with no probe on another node fails the
      `delivery` check. Fault to inject: read `desired.yaml` only and watch the gate-host
      negative pass wrongly.
- [ ] 3.3 After A10: rewrite the gate sections of `AGENTS.md` and `docs/infra/gate-hosts.md`
      for the new host. After A22: remove h4claw and h2puni from them. Test:
      `infra/ansible/tests` and the document tests.
- [ ] 3.4 After A21 and A22: remove the cluster `platform` and its nodes from `desired.yaml`,
      delete `production-existing-hosts.yml`, reduce `placement.test.ts` and slice 1.5's
      inputs to the new pair, and rewrite `docs/infra/enroll-h4claw-h3mon.md` as a historical
      record. The Flux paths of the old cluster are removed by a later change. Test:
      `bunx nx run tool-fleet:check`.
- [ ] 3.5 Before A20 (R28). Owner: the WBS cutover plan's owner; this change only names the
      gap. The first-start coordinator gains an Argo CD source beside the Flux one: it reads
      the Application `wbs`, requires its automation disabled and its `targetRevision` equal
      to the desired commit, enables automation, and waits for `status.sync.revision`. The
      cutover plan's Flux prerequisite and its step 6 gain the Argo CD wording. The WBS
      overlay for the new cluster carries the selector patches of design decision 1 and a
      backup prefix outside `sqlite/`, and the `delivery` check reads it under rules (f) and
      (g) and the prefix rule of 3.1. Test:
      `first-start-source.test.ts` for both sources. Negatives: an Application with
      automation already enabled is refused; a revision that differs from the request is
      refused; a Lease lost before the handoff refuses the enable. Fault to inject: skip the
      automation check and watch its negative pass wrongly.

## 4. Attended steps

### Stage 1: platform

- [ ] A1 Create the platform server. Who: owner. Command: the provider console; 8 vCPUs,
      16 GiB (R2), the location and private network of the existing hosts, Ubuntu 26.04, the
      admin key. Receipt: `/etc/machine-id`, the private address and interface, `nproc`, `free -m`,
      `df -h /`. Stop: the host is not on the private network or answers on a public port
      other than SSH. Rollback: delete the server. If the rehearsal of 2.7 ran on this server,
      it is deleted and created again and this receipt is read again before A3.
- [ ] A2 Make and escrow the new cluster's secrets (R6), after 0.6. Who: owner. Commands: two 64-hex k3s
      credentials, `age-keygen`, a read-only deploy key for the fleet repository and the local
      account's password, into `$OPS`; the encrypted files of design decision 5 into the fleet
      repository's directory; a copy of each original into both escrow places. Receipt: one
      SHA-256 fingerprint per secret beside its escrow entry, and "restored on a second
      machine" for the age identity. Stop: an escrow place is unavailable.
      Rollback: discard the files; nothing uses them yet.
- [ ] A3 Bootstrap the server, after 1.1, 1.2, the first 1.3 and the receipt of 2.7. Who:
      operator. Commands:
      `fleet_ansible --limit h5plat --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml`,
      `fleet_ansible --limit h5plat playbooks/bootstrap.yml` twice (the second prints
      `changed=0`), `playbooks/validate-enrollment.yml`, then preflight with
      `puni_preflight_stage=after-enrollment`. Read both join tokens into `$OPS` and escrow.
      Receipt: `kubectl get nodes -o wide` shows h5plat Ready with roles `control-plane,etcd`,
      the label `puni.dev/capability-platform-services=true`, the taint
      `CriticalAddonsOnly=true:NoSchedule` and no enrollment taint; CoreDNS, the metrics
      server and the volume provisioner Ready; CoreDNS still tolerates `CriticalAddonsOnly`.
      Stop: validation fails or the second bootstrap changes anything.
      Rollback: delete the server and repeat from A1.
- [ ] A4 Argo CD, after 0.6 and slices 2.1 to 2.6 and 2.9. Who: operator. Command:
      `fleet_ansible --limit h5plat --extra-vars puni_cluster_id=platform-production --extra-vars @"$OPS/argocd.json" playbooks/argocd.yml`.
      Receipt: `kubectl get applications -n argocd` shows the root and waves 0 to 3 Synced and
      Healthy; every Argo CD and cert-manager pod is on h5plat; the interface answers through
      `kubectl port-forward`; the local account logs in and cannot sync; `admin` cannot log
      in; no Service of type LoadBalancer or Ingress exists in `argocd`.
      Stop: an Application is not Healthy after 20 minutes. Rollback: delete the server.
- [ ] A5 Measure Argo CD (R24). Who: operator. After 24 hours and one merge that changes the
      tree, read each container's working set and `memory.stat`. Receipt: the per-container
      table in verify.md and the limits kept or changed by a commit. Stop: a container was
      killed for memory. Rollback: raise that limit in Git.
- [ ] A6 etcd snapshots. Who: operator. Commands: create the new snapshot bucket with
      versioning and the one lifecycle rule of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle), and read both back;
      `playbooks/backup.yml` with that bucket and the token fingerprint; `k3s etcd-snapshot
save`; `tool-fleet:recover record-manifest`. Receipt: the bucket's versioning and rule,
      the snapshot's object key, size and SHA-256, the manifest stored with the escrowed
      secrets. Stop: the role refuses the fingerprint. Rollback: none needed.
- [ ] A7 Restore drill while the cluster is empty, after 2.6. Who: operator. `restore.yml`
      refuses a host whose k3s `node-name` is not the planned replacement or is a fenced
      original, so the drill uses a second, temporary server. h5plat is the jump (R17) and is
      off during the drill, so the controller's jump for this step is the temporary server's
      own public SSH endpoint. Commands: power h5plat off and record that as fence evidence;
      create a temporary server as in A1 under another name and prepare it with
      `bootstrap.yml`'s host roles and a k3s config that names it;
      `tool-fleet:recover verify-cold-restore` with the escrowed token; `playbooks/restore.yml`
      limited to it; read the root Application; then delete the temporary server and power
      h5plat on. Receipt: time from power-off to the root Synced and Healthy on the temporary
      server; the fence evidence file; h5plat Ready again with its own datastore.
      Stop: the restore refuses, or an Application stays unhealthy.
      Rollback: delete the temporary server and power h5plat on; its datastore was not touched.
- [ ] Harbor and OpenBao land on h5plat by their own changes, amended as design decision 9
      lists. They are not steps of this change. Under R22, OpenBao serves before A15. Its
      change adds its namespace to the `namespaces` unit, and its seal key is one more
      bootstrap Secret: `playbooks/argocd.yml` is run again with that file added, applies the
      namespaces first and then the Secret, as slice 2.5 tests.

### Stage 2: continuous integration

- [ ] A8 Create the CI host and apply the gate-host role, after its 1.3 revision. Who: owner
      creates as in A1; operator applies. Commands: `$OPS/gate.json` with the callers' keys
      and `puni_gate_host_pool_enroll: false`;
      `fleet_ansible --limit h8ci --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml`
      twice; a second-session login as `puni1` with each key after the first run;
      `docker buildx version` as `puni1`. Receipt: the second run prints `changed=0`; every
      caller logs in. Stop: a caller cannot log in. Rollback: delete the server.
- [ ] A9 Trial copy of the dev stacks (R12), before the pool is initialised. Who: operator.
      Commands: from the newest verified h1claw set, restore the dev members only into the
      Compose roots on h8ci and start the stacks without changing DNS; after one hour read
      their memory. The set also holds the WBS production database and a tarball with
      production env files. Neither is copied to this host: the set is unpacked on the
      controller and only the dev stacks' databases and paths are sent. Receipt: the set's
      stamp, the list of members and paths restored, `integrity_check` ok, the memory table,
      and the headroom the pool's owner chooses from it. Stop: the restore's check differs
      from the set's report, or a production database or env file is on the host.
      Rollback: stop and remove the trial stacks.
- [ ] A10 Enroll and calibrate, with the trial stacks running. Who: the owner of
      `dash-host-jobs`, by
      [enroll a host in the host pool](../../../docs/infra/gate-hosts.md#enroll-a-host-in-the-host-pool).
      Receipt: the pool lists the host in observe mode with the chosen headroom;
      `bin/h2puni-gate.sh <sha>` from its launcher exits 0 and prints the SHA; three
      calibration durations. Stop: a gate fails for a reason the old hosts do not show on the
      same SHA. Rollback: keep gating on the old hosts; they are untouched until stage 5.
- [ ] A11 Move the dev stacks (guards 1 and 6). Who: operator, owner for h1claw. Commands:
      stop the dev stacks on h2puni; run h1claw's pull once and note its stamp; restore that
      stamp's dev members and dev paths on h8ci in place of the trial copy, unpacked on the
      controller as in A9; start; point the dev names at
      h8ci; add h1claw's second set for h8ci (design decision 9) and run it. The pull from
      h2puni is not changed: WBS production still runs there. Receipt: the final set's stamp
      and SHA-256, `integrity_check` ok, the dev WBS project list read back through its API,
      the first verified set pulled from h8ci, and h1claw's health report showing both sets
      judged separately, with the h2puni set still fresh. Stop: the restored database differs
      from the set's report, the pull from h8ci fails, or the h2puni set stops being judged.
      Rollback: point the names back and start the stacks on h2puni; nothing was deleted.
- [ ] A12 Release builds on the CI host. Who: the session that owns the release bootstrap, by
      its own procedure. Receipt: one release record that names h8ci. Stop: the build needs
      something only h2puni has; name it. Rollback: keep building on h2puni.

### Stage 3: observability

- [ ] A13 Create the observability server. Who: owner, as A1, with a root disk of at least
      180 GiB (R2). Receipt: as A1. Stop: `df -h /` shows less. Rollback: delete the server.
- [ ] A14 Join it, after its 1.3 revision, 1.4 and 2.8. Who: operator. Commands:
      `fleet_ansible --limit h5plat playbooks/firewall.yml`, so the server admits the new
      address; preflight limited to h7obs; `fleet_ansible --limit h7obs playbooks/join.yml`
      twice; `playbooks/validate-enrollment.yml`. Receipt: h7obs Ready with
      `puni.dev/capability-observability=true`, no enrollment taint. Stop: validation fails.
      Rollback: `playbooks/rollback-host.yml`, delete the Node object, delete the server.
- [ ] A15 Bring up and measure the stack, after 3.2. Who: operator; owner for the values.
      Commands: generate the Velero repository password and put it in escrow first; write
      the fifteen operator-provided values of design decision 5 into OpenBao; merge the
      revision that adds the units of waves 5 to 10; after 24 hours read
      `kubectl top pods -n observability`, each container's `memory.stat` and each claim's
      use; fire one test alert. Receipt: the escrow fingerprint of the Velero repository
      password; waves 5 to 10 Healthy; no alert firing other than the test alert; the per-pod
      memory table; disk used and its growth per day; the alert seen at its destination (open
      question 10); the owner's decision on the node's size. Stop: a pod is killed for memory, the node's
      available memory falls under 1,024 MiB, or the disk would fill within 60 days.
      Rollback: nothing depends on the stack yet. A merge that empties the units, so prune
      removes the workloads, then a merge that removes their Application files (design
      decision 3). Claims stay.
- [ ] A16 MLflow (R15), if kept (guards 1 and 6). Who: operator, owner for h1claw. Commands:
      stop MLflow on h3mon; run h1claw's MLflow pull once; restore that stamp on h7obs and
      start the service; re-point the pull at h7obs and run it. Receipt: the stamp and
      SHA-256, one known run read back, the first verified set from h7obs. Stop: the verify
      differs. Rollback: start MLflow on h3mon.

### Stage 4: production apps

- [ ] A17 Create the production apps server. Who: owner, as A1. Receipt: as A1.
      Stop: as A1, or the host has no public IPv4 address for ports 80 and 443.
      Rollback: delete the server.
- [ ] A18 Join it, after its 1.3 revision. Who: operator. Commands: `playbooks/firewall.yml`
      limited to h5plat and h7obs; then as A14 for h6apps; then `playbooks/solver.yml`; then
      merge the revision that adds the `traefik` Application (wave 11).
      Receipt: h6apps Ready with `product` and `ingress`; the Traefik pod Ready there and
      answering on ports 80 and 443. Stop: Traefik cannot bind 80 or 443.
      Rollback: empty the `traefik` unit by a merge, then remove its Application file by a
      second one, then as A14.
- [ ] A19 The website and the request app move (R26), after 3.1 and the fleet repository's
      directory of design decision 9, and task 0.6 for the fleet repository. Who: operator,
      with the website's owner; owner for the Secrets. First the owner writes the app Secrets
      of design decision 5 into OpenBao, reading the website's present ones with the old
      cluster's age identity on the controller. Then, for `website-dev` first and production
      second: scale the old Deployments to zero and suspend the old backup CronJob and its
      Flux unit; run the website's backup job once and note its stamp; merge the revision
      that adds the fleet Application (wave 12) with the app's workload at zero replicas and
      its backup CronJob suspended; restore that stamp into the new claim; merge the revision
      that sets one replica and resumes the CronJob; point the names at h6apps; wait for the
      certificates; run the new backup job once. Receipt: the stamp; no pod of the app and no
      backup run on the new side before the restore finished; the restored object's SHA-256
      equals its report; the pages and one stored record read back on the public name with a
      valid certificate; one backup and one verify completed under the new prefix after the
      restore, whose report shows the restored record. Stop: the restore differs from the
      report, a backup under the new prefix predates the restore or is empty, or a certificate
      is not Ready after 15 minutes.
      Rollback, while h4claw exists: point the names back and resume the old units.
- [ ] A20 WBS production moves by the
      [cutover plan](../../../docs/infra/cutover-plan.md), under its own authorization. Who:
      that plan's operator. Command: the plan's steps against the new cluster and h6apps, with
      the selector patch and backup prefix of design decisions 1 and 7. Receipt: the plan's
      own, plus one backup and one verify under the new prefix. Stop: the plan's own.
      Rollback: the plan's own. Preconditions from this change: A15's receipt, slices 3.1 and
      3.5 (R28), the WBS alert group added to the `alerts` unit, the registry of open question
      14 named and reachable from h6apps, the WBS Secrets and that registry's pull credential
      written into OpenBao by the owner, and that h6apps is in no `gate_hosts` group.

### Stage 5: retirement

- [ ] A21 Delete h4claw and h3mon. Who: owner. Preconditions: A19's receipt for both website
      namespaces; A16's receipt or the owner's word that MLflow is dropped; A10's receipt, no
      caller launching gates on h4claw (slice 3.3), and the pool owner's withdrawal of h4claw
      or written confirmation that none is needed; the owner's answer to open question 8;
      the word of the session that owns `release-pin.ts` that the old fleet directory may go;
      the word of h1claw's owner on what there judges the old cluster's `sqlite/<database>/`
      prefixes, retired if anything does. Commands: delete both servers in the console;
      remove the old cluster's directory from the fleet repository. Receipt: the provider's
      server list without those names; the two confirmations, dated.
      Stop: a DNS record still points at either host. Rollback: none; that is why the
      preconditions are receipts.
- [ ] A22 Delete h2puni. Who: owner. Preconditions: A20's receipt or the owner's word that WBS
      production data is not wanted; A11's and A12's receipts; A10's receipt, no caller
      launching gates on h2puni, and the pool owner's withdrawal of h2puni or written
      confirmation that none is needed; the owner's answer to open question 8. Commands:
      delete the server in the console; then retire h1claw's h2puni set, so its freshness
      alert does not fire for a host that is gone. Receipt: the provider's server list;
      h1claw's health report without the h2puni set. Stop: h1claw's newest set for the dev
      stacks does not come from h8ci, or WBS production has no verified backup under the new
      cluster's prefix. Rollback: none; that is why the preconditions are receipts.
