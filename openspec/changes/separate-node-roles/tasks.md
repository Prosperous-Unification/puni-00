Agent slices (1.x) change source and run tests; none touches a host. Attended steps (A1 to
A18) each name who runs them, the command, the receipt, the stop condition and the rollback.
Assumption and decision numbers refer to [design.md](design.md). Every safety check lands with
a production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

`fleet_ansible` is the controller wrapper of
[enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni),
run from the operator workstation (R17) against the new inventory of task 1.4. `$OPS` is its
owner-only input directory.

## 0. Decisions

- [ ] 0.1 Owner reads assumptions R1 to R18 and the ten open questions in design.md and
      overrules by id. Receipt: the overrules, dated, in verify.md. Until then only slices 1.1
      to 1.3 and 1.9 may start.
- [ ] 0.2 File the decision record from design.md as an ADR under the next free number once
      pull requests #935 and #948 and the Harbor record have settled theirs, link it from
      proposal.md, and delete the quoted copy. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: add a dated pointer to this change in `proposal.md` and `tasks.md` of
      `adopt-harbor-registry`, listing the amendments of design decision 7. The Harbor change's
      owner makes the amendments. Test: `./node_modules/.bin/openspec validate --all --json`.
- [ ] 0.4 After 0.1: tell the owners of pull request #935, of the `dash-host-jobs` change, of
      the release bootstrap and of the WBS cutover plan what decision 7 asks of each.
      Receipt: the four messages, dated, in verify.md.
- [ ] 0.5 Escrow check, before stage 1. Who: owner. On a machine that never held the originals,
      read back the backup archive key, the registry CA key pair and the object storage
      credentials, and compare each fingerprint with the escrow entry
      ([recovery](../../../docs/infra/recovery.md#recovery-secrets)). Receipt: three matching
      fingerprints, dated, in verify.md; no value. Stop: any is missing or differs. Then copy
      it into escrow from the host that holds it before anything else proceeds.

## 1. Agent slices

- [ ] 1.1 Add the capability `platform-services` to `CapabilitySchema`, `fleetCapabilities`,
      `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` in
      `tools/tool-fleet/src/contracts.ts`. Test: `contracts.test.ts` accepts a platform node
      that carries it. Negatives: a workers node carrying it is refused; a platform cluster
      whose floor names it with no such node is refused. Fault to inject: add it to
      `purposeCapabilities.workers` and watch the workers negative pass wrongly.
- [ ] 1.2 Role rules in the production placement check: the `control-plane` node of a platform
      cluster that requires `platform-services` carries it and carries neither `product` nor
      `ingress`; no host in `gate_hosts` is in a k3s group of the same inventory. Negatives:
      a server with `product` is refused; a gate host listed under `k3s_agents` is refused.
      Fault to inject: skip the gate-host comparison and watch its negative pass wrongly.
- [ ] 1.3 Give the four Flux controllers and the three cert-manager pods the node selector
      `puni.dev/capability-platform-services: 'true'`: a kustomize patch beside
      `infra/platform/flux/install.yaml`, and chart values in
      `infra/platform/networking/cert-manager/release.yaml`. Set memory limits on cert-manager.
      Test: `bunx nx run tool-fleet:check`. Negative: a Flux or cert-manager workload whose
      selector names no capability fails the check. Fault to inject: drop `platform-services`
      from `purposeCapabilities.platform` and watch the check refuse the new selectors.
- [ ] 1.4 Repeats once per stage, after A1, A7, A10 and A13 supply each machine id and
      address. Add the cluster `platform-2` (R5) to `infra/fleet/desired.yaml` with its first
      node and the floor `platform-services: 1`; later revisions add each node and raise the
      floor for its capability. Add `infra/ansible/inventory/production-hosts.yml` with the
      same nodes, their reservations from design decision 2, and `h8ci` under `gate_hosts`
      only. Extend `placement.test.ts` to bind this inventory to `platform-2` beside the
      existing pair. Negatives: a machine id that differs between the two files is refused;
      a node present in one file and absent from the other is refused.
- [ ] 1.5 Registry stage without Distribution (R10): make the production `platform` stage
      carry the registry namespace and CA issuer and no serving workload, until the Harbor
      change's production overlay replaces it. Test: `tool-fleet:check`, family
      `platform`. Negative: a Distribution Deployment in that stage fails the check. The old
      cluster is unaffected: it stays on its pinned revision.
- [ ] 1.6 Coexistence record and reservations for a node without Docker services or a
      migration overlap: a record for `h7obs` in `infra/platform/observability/base`, the
      reservations in the new inventory, and MLflow's limit if R15 holds. Test:
      `tools/tool-fleet/src/observability-budget.test.ts`. Negative: a reservation in the
      inventory that differs from the record fails the test.
- [ ] 1.7 SQLite backup custody in the cluster (R13): a CronJob that applies the retention of
      [recovery](../../../docs/infra/recovery.md#bucket-lifecycle) to `sqlite/<database>/`
      (every stamp for 48 h, daily for 60 days, weekly for 52 weeks; snapshot and report expire
      together; the newest report is always kept) as a pure planner plus a thin shell, and a
      PrometheusRule that fires when the newest report is older than two intervals. Test: the
      planner over a fixture listing; `tool-deploy:test:backup` extended with one prune run.
      Negatives: a snapshot whose report is missing is kept and reported; the newest report is
      never planned for deletion; a listing error deletes nothing. Fault to inject: drop the
      newest-report guard and watch its negative pass wrongly.
- [ ] 1.8 Outside liveness probes (R16): one probe per node from the observability stack's
      blackbox exporter, and a host timer on the platform node that probes the observability
      node. Test: the alert rules render and `tool-fleet:check` passes. Negative: a node in
      `desired.yaml` with no probe on another node fails the check.
- [ ] 1.9 Staged build rehearsal on the QEMU lab, on a host with `/dev/kvm` and free disk: from
      an inventory with empty preserved-listener and container lists, bootstrap a server that
      carries `control-plane` and `platform-services` only; run validation with that one node;
      run `platform.yml` and read which stages are Ready with no `ingress` or `observability`
      node; join an observability agent, then a product and ingress agent, raising the floors
      each time; take an etcd snapshot, delete the server VM and restore it. Receipt in
      verify.md: what validation did with one node, the stage states after each join, the
      restore time. Stop: validation cannot pass with one node, or a stage that should be Ready
      is not. Then design decision 4 is revised before any attended step.
- [ ] 1.10 Runbook `docs/infra/build-platform-cluster.md`: the build from empty servers, taken
      from the enrollment runbook without its preserved-service steps and with the controller
      on the operator workstation. It names every `$OPS` input, the escrow step for each new
      secret, and the receipts of A1 to A6. Link it from `docs/infra/README.md`. Test:
      `tool-devsync` document tests and `check-indexes`.
- [ ] 1.11 Certificate carry-over (R18) on the k3d lab: issue a certificate, export its Secret,
      create it in a second lab cluster before the Certificate object, and read that
      cert-manager reports Ready without a new CertificateRequest. Receipt in verify.md. Stop:
      a new request is created. Then R18 falls back to issuance after the switch.
- [ ] 1.12 After A8: rewrite the gate sections of `AGENTS.md` and `docs/infra/gate-hosts.md`
      for the new host. After A18: remove h4claw and h2puni from them. Test: `infra/ansible/tests`
      and the document tests.
- [ ] 1.13 After A17 and A18: remove the cluster `platform` and its nodes from `desired.yaml`,
      delete `production-existing-hosts.yml`, and reduce `placement.test.ts` to the new pair.
      Rewrite `docs/infra/enroll-h4claw-h3mon.md` as a historical record. Test:
      `bunx nx run tool-fleet:check`.

## 2. Attended steps

### Stage 1: platform

- [ ] A1 Create the platform server. Who: owner. Command: the provider console; 8 vCPUs,
      16 GiB (R2), the Helsinki location, the existing private network, Ubuntu 26.04, the admin
      key. Receipt: `/etc/machine-id`, the private address and interface, `nproc`, `free -m`,
      `df -h /`. Stop: the host is not on the private network or answers on a public port
      other than SSH. Rollback: delete the server.
- [ ] A2 Make and escrow the new cluster's secrets (R6). Who: owner. Commands: two 64-hex k3s
      credentials, `age-keygen`, and one read-only deploy key per Flux source, into `$OPS`; a
      copy of each into both escrow places. Receipt: one SHA-256 fingerprint per secret beside
      its escrow entry, and "restored on a second machine" for one of them. Stop: an escrow
      place is unavailable. Rollback: discard the files; nothing uses them yet.
- [ ] A3 Bootstrap the server, after 1.1, 1.2, the first 1.4 and the receipt of 1.9. Who:
      operator. Commands:
      `fleet_ansible --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml`,
      `fleet_ansible --limit h5plat playbooks/bootstrap.yml` twice (the second prints
      `changed=0`), `playbooks/validate-enrollment.yml`, then preflight with
      `puni_preflight_stage=after-enrollment`. Read both join tokens into `$OPS` and escrow.
      Receipt: `kubectl get nodes -o wide` shows h5plat Ready with roles `control-plane,etcd`,
      the label `puni.dev/capability-platform-services=true` and no enrollment taint.
      Stop: validation fails or the second bootstrap changes anything.
      Rollback: delete the server and repeat from A1.
- [ ] A4 Flux, after 1.3 and 1.5. Who: operator. Commands: create the Secrets that
      `infra/platform/secrets/platform-production/externally-provided.json` lists for the
      stages up to `platform` (the registry CA from escrow); place the deploy key, its
      `known_hosts` and the age key on the server at mode `0600`; then
      `fleet_ansible --limit h5plat --extra-vars puni_cluster_id=platform-production --extra-vars puni_platform_revision=<reviewed main sha> --extra-vars @"$OPS/flux.json" playbooks/platform.yml`.
      Receipt: `kubectl get kustomizations -n flux-system` shows `target`, `controllers`,
      `storage`, `policy`, `secrets`, `certificates` and `platform` Ready; every Flux and
      cert-manager pod is on h5plat. Stop: a stage is not Ready after 20 minutes.
      Rollback: delete the server.
- [ ] A5 etcd snapshots. Who: operator. Command: `playbooks/backup.yml` with the new bucket of
      design decision 5 and the token fingerprint, then `k3s etcd-snapshot save` and
      `tool-fleet:recover record-manifest`. Receipt: the snapshot's object key, size and
      SHA-256, and the manifest stored with the escrowed secrets. Stop: the role refuses the
      fingerprint. Rollback: none needed.
- [ ] A6 Restore drill while the cluster is empty. Who: operator. `restore.yml` refuses a host
      that carries a fenced server's node name, so the drill uses a second, temporary server.
      Commands: power h5plat off and record that as fence evidence; create a temporary server
      as in A1 under another name; `tool-fleet:recover verify-cold-restore` with the escrowed
      token and age key; `playbooks/restore.yml` limited to it;
      `flux reconcile ks puni-cluster --with-source`; then delete the temporary server and power
      h5plat on. Receipt: time from
      power-off to every stage Ready on the temporary server; the fence evidence file; h5plat
      Ready again with its own datastore. Stop: the restore refuses, or a stage stays not Ready.
      Rollback: delete the temporary server and power h5plat on; its datastore was not touched.
- [ ] Harbor and OpenBao land on h5plat by their own changes, amended as design decision 7
      lists. They are not steps of this change.

### Stage 2: continuous integration

- [ ] A7 Create the CI host and apply the gate-host role, after the 1.4 revision that lists
      it. Who: owner creates as in A1; operator applies. Commands: `$OPS/gate.json` with the
      callers' keys and `puni_gate_host_pool_enroll: false`;
      `fleet_ansible --limit h8ci --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml`
      twice; a second-session login as `puni1` with each key after the first run;
      `docker buildx version` as `puni1`. Receipt: the second run prints `changed=0`; every
      caller logs in. Stop: a caller cannot log in. Rollback: delete the server.
- [ ] A8 Enroll and calibrate. Who: the owner of `dash-host-jobs`, by
      [enroll a host in the host
      pool](../../../docs/infra/gate-hosts.md#enroll-a-host-in-the-host-pool).
      Receipt: the pool lists the host in observe mode; `bin/h2puni-gate.sh <sha>` from its
      launcher exits 0 and prints the SHA; three calibration durations. Stop: a gate fails for
      a reason the old hosts do not show on the same SHA. Rollback: keep gating on the old
      hosts; they are untouched until A18.
- [ ] A9 Dev stacks onto the CI host (R12), if the owner keeps that assumption. Who: operator.
      Commands: restore the newest verified h1claw set from the bucket into the Compose roots;
      start the stacks; point the dev names at the host by a reviewed DNS plan. Receipt: the
      set's stamp and SHA-256, `integrity_check` ok, the dev WBS project list read back
      through its API. Stop: the restore's check differs from the set's report.
      Rollback: revert the DNS plan; the stacks on h2puni were stopped, not removed.

### Stage 3: observability

- [ ] A10 Create and join the observability node, after its 1.4 revision and 1.6. Who: owner
      creates; operator joins. Commands: preflight;
      `fleet_ansible --limit h7obs playbooks/join.yml` twice;
      `playbooks/validate-enrollment.yml`. Receipt: h7obs Ready
      with `puni.dev/capability-observability=true`, no enrollment taint.
      Stop: validation fails. Rollback: `playbooks/rollback-host.yml`, delete the Node object,
      delete the server.
- [ ] A11 Bring up and measure the stack. Who: operator, owner for the Secrets. Commands:
      create the operator Secrets listed in
      [before advancing the pinned
      revision](../../../docs/infra/platform.md#before-advancing-the-pinned-revision);
      `flux reconcile ks puni-cluster --with-source`; after 24 hours read
      `kubectl top pods -n observability` and each container's `memory.stat`; fire one test
      alert. Receipt:
      `observability`, `alerts` and `backup` Ready; the per-pod table; the alert seen at its
      destination (open question 10); the owner's decision on the node's size.
      Stop: a pod is killed for memory, or the node's available memory falls under 1,024 MiB.
      Rollback: suspend the `observability` unit; no production signal depends on it yet.
- [ ] A12 MLflow (R15), if kept. Who: operator. Commands: restore the newest verified MLflow
      set to h7obs and start its Compose service. Receipt: the set's stamp and SHA-256 and one
      known run read back. Stop: the verify differs. Rollback: leave MLflow on h3mon.

### Stage 4: production apps

- [ ] A13 Create and join the production apps node, after its 1.4 revision. Who: owner
      creates; operator joins. Commands: as A10 for h6apps, then `playbooks/solver.yml`.
      Receipt: h6apps Ready with `product` and `ingress`; the Traefik pod Ready there;
      `curl -k --resolve <name>:443:<h6apps public address> https://<name>/` answers from
      Traefik. Stop: Traefik cannot bind 80 or 443. Rollback: as A10.
- [ ] A14 `website-dev` crosses. Who: operator, with the website repository's owner. Commands:
      the fleet directory for the new cluster gains the website unit with today's pins (R11,
      open question 5); restore the website's newest verified backup into a new claim; test
      with `--resolve`; switch the dev names by a reviewed DNS plan. Receipt: the restored
      object's SHA-256 equals its report; the pages and one stored record read back; the
      certificate served is the carried one. Stop: any difference from the report.
      Rollback: revert the DNS plan; the old namespace was scaled to zero, not deleted.
- [ ] A15 Production website and request app cross, as A14 for the production names, after one
      backup and one verify have completed on the new side for `website-dev`. Point of no
      return: the first request stored on the new cluster. Rollback before it: revert the DNS
      plan. After it: restore on the new cluster only.
- [ ] A16 WBS production crosses by the existing
      [cutover plan](../../../docs/infra/cutover-plan.md), with its own authorization. It is
      not a step of this change. Preconditions from this change: A11's receipt, task 1.7's
      receipt, and that h6apps is in no `gate_hosts` group.

### Stage 5: retirement

- [ ] A17 Delete the old cluster's servers, h4claw and h3mon. Who: owner. Preconditions: A14
      and A15 are 14 days old (R14); MLflow is moved or dropped; nothing has been pulled from
      the old registry since A15. Commands: a last `k3s etcd-snapshot save` and a provider
      snapshot of each server; delete both in the console; remove the old cluster's fleet
      directory. Receipt: the snapshot ids and the provider's empty server list for those names.
      Stop: a DNS record still points at either host. Rollback: restore the provider snapshot.
- [ ] A18 Delete h2puni. Who: owner. Preconditions: the cutover plan's rollback boundary is
      14 days old; A9 is done or the dev stacks are dropped; A8's receipt exists; the release
      builds run on h8ci; no caller launches a gate on h2puni (task 1.12). Commands: a
      provider snapshot; delete in the console. Receipt: the snapshot id; the newest
      release build's record names h8ci. Stop: the newest h1claw set for h2puni is older than its
      interval. Rollback: restore the provider snapshot.
