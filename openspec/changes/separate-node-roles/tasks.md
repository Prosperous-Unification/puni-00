Agent slices (1.x) change source and run tests; none touches a host. Attended steps (A1 to
A10) each name who runs them, the command, the receipt, the stop condition and the rollback.
Assumption and decision numbers refer to [design.md](design.md). Every safety check lands with
a production-path negative, watched failing with the check removed, and an adjacent `Proof:`
comment. Nothing here has been done yet.

`fleet_ansible` is the wrapper defined in
[enroll h4claw and h3mon](../../../docs/infra/enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni).

## 0. Decisions

- [ ] 0.1 Owner reads assumptions N1 to N14 and the nine open questions in design.md and
      overrules by id. Receipt: the overrules, dated, in verify.md. Until then only slices 1.1
      and 1.6 may start.
- [ ] 0.2 File the decision record from design.md as an ADR under the next free number once
      pull requests #935 and #948 and the Harbor record have settled theirs, link it from
      proposal.md, and delete the quoted copy. Test:
      `env -u CLAUDECODE bun test tools/tool-devsync/src/adr-index.test.ts`.
- [ ] 0.3 After 0.1: add a dated pointer to this change in `proposal.md` and `tasks.md` of
      `adopt-harbor-registry`, listing the amendments of design decision 5 item 2. The Harbor
      change's owner makes the amendments. Test:
      `./node_modules/.bin/openspec validate --all --json`.
- [ ] 0.4 After 0.1: tell the owners of pull request #935 (placement, label N5), of the
      `dash-host-jobs` change (the three needs in decision 5) and of the WBS cutover plan
      (its node inputs). Receipt: the three messages, dated, in verify.md.

## 1. Agent slices

- [ ] 1.1 Add the capability `platform-services` to `CapabilitySchema`, `fleetCapabilities`,
      `purposeCapabilities.platform` and `RequiredCapabilitiesSchema` in
      `tools/tool-fleet/src/contracts.ts`. Test: `contracts.test.ts` accepts a platform node
      that carries it. Negatives: a workers node carrying it is refused; a platform cluster
      whose floor names it with no such node is refused. Fault to inject: add it to
      `purposeCapabilities.workers` and watch the workers negative pass wrongly.
- [ ] 1.2 After A1 supplies the machine id and address: add node `h5plat` with
      `[platform-services]` to `infra/fleet/desired.yaml`, raise the floor to
      `platform-services: 1`, and add the host to `k3s_agents` and
      `puni_enrolled_private_addresses` in the production inventory with its reservations.
      Test: `placement.test.ts` (inventory equals desired state). Negative: a machine id that
      differs between the two files is refused.
- [ ] 1.3 Give the four Flux controllers and the three cert-manager pods the node selector
      `puni.dev/capability-platform-services: 'true'`: a kustomize patch beside
      `infra/platform/flux/install.yaml`, and chart values in
      `infra/platform/networking/cert-manager/release.yaml`. Set memory limits on cert-manager.
      Test: `bunx nx run tool-fleet:check`. Negative: a selector for a capability the platform
      purpose cannot carry is refused by the check. Fault to inject: drop `platform-services`
      from `purposeCapabilities.platform` and watch the check refuse the new selectors.
- [ ] 1.4 Raise h3mon's `puni_kubelet_system_reserved_memory` to the figure A7 measures and
      update `infra/platform/observability/base/coexistence.json` to match. Test:
      `tools/tool-fleet/src/observability-budget.test.ts`. Negative: a reservation in the
      inventory that differs from the coexistence record fails the test.
- [ ] 1.5 After A5: remove h4claw from `gate_hosts` in the inventory and rewrite the h4claw
      sections of `docs/infra/gate-hosts.md`. Test: `infra/ansible/tests`.
- [ ] 1.6 Lab rehearsal of design decision 4 on the QEMU platform lab (one server, one agent),
      on a host with `/dev/kvm`: a node-local `Retain` volume with a SQLite marker and a
      host-network pod on the old server; snapshot; stop the server; restore on the agent host;
      turn the old server into an agent under its old node name; reconcile one Flux stage
      through a rewritten kubeconfig Secret. Receipt in verify.md: seconds without an API,
      whether the host-network pod answered throughout, the marker read back, node UIDs before
      and after, and the rollback run once from after step 3. Stop: the marker is unreadable,
      the old node's pods are deleted, or rollback fails.
- [ ] 1.7 After 1.6 passes: add the fence kind for a stopped server whose host stays up to
      `tool-fleet:recover verify-cold-restore`, and a play that turns that host into an agent.
      Negatives: the restore is refused while the old server's unit is active or its datastore
      directory is still in place; the play refuses a host whose node name differs from the
      fenced one. Fault to inject: accept the fence without reading the unit state and watch
      the active-server negative pass wrongly.
- [ ] 1.8 Declare the outside liveness probes of N13: one probe per node from the observability
      stack's blackbox exporter, and a host timer on the platform node that probes h3mon.
      Test: the alert rules render and `tool-fleet:check` passes. Negative: a node in
      `desired.yaml` with no probe fails the check.

## 2. Attended steps

- [ ] A1 Create the node. Who: owner. Command: the provider console; 8 vCPUs, 16 GiB (N1),
      the Helsinki location, the existing private network, Ubuntu 26.04, the admin key.
      Receipt: `/etc/machine-id`, the private address and interface, `nproc`, `free -m`,
      `df -h /`. Stop: the host is not on the private network or answers on a public port
      other than SSH. Rollback: delete the server.
- [ ] A2 Join it as an agent, after 1.1 and 1.2. Who: operator. Commands, as in the enrollment
      runbook sections 2, 3 and 5:
      `fleet_ansible --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml`,
      a provider snapshot, `fleet_ansible --limit h5plat playbooks/join.yml` twice (the second
      prints `changed=0`), then `playbooks/validate-enrollment.yml`.
      Receipt: `kubectl get nodes -o wide` shows h5plat Ready with the label
      `puni.dev/capability-platform-services=true` and no enrollment taint.
      Stop: validation fails or the second join changes anything.
      Rollback: `playbooks/rollback-host.yml` for h5plat, then delete its Node object.
- [ ] A3 Harbor's memory measurement runs on h5plat. It is slice 1 of `adopt-harbor-registry`,
      amended by 0.3, and is not a step of this change.
- [ ] A4 Move Flux and cert-manager, after 1.3 has reached the production source (open
      question 6). Who: operator. Command: `flux reconcile ks puni-cluster --with-source`.
      Receipt: `kubectl get pods -n flux-system -o wide` and `-n cert-manager -o wide` show
      h5plat; every stage is Ready; `kubectl get certificate -A` shows every certificate Ready.
      Stop: any stage not Ready after 10 minutes. Rollback: revert the selector commit and
      reconcile.
- [ ] A5 Withdraw h4claw from the gate pool. Who: the owner of `dash-host-jobs`, with the
      procedure that change supplies (decision 5). Receipt: the pool no longer lists h4claw
      and a gate launch there is refused. Stop: a job is running on h4claw.
      Rollback: enroll it again by the gate-host runbook.
- [ ] A6 Grow the disks (N11), one host per window: h2puni, then h3mon, then h4claw. Who:
      owner. Command: the provider's rescale with disk growth, host powered off, after a
      provider snapshot. Receipt: `df -h /` before and after, and for a cluster node
      `kubectl get nodes` Ready. Stop: the host does not return on its private address.
      Rollback: none for the growth; restore the snapshot if the host does not boot.
- [ ] A7 Read what h3mon runs outside Kubernetes and apply the reservation of 1.4. Who:
      operator. Command: `docker stats --no-stream` and `free -m` on h3mon, then
      `fleet_ansible --limit h3mon playbooks/join.yml`. Receipt: the readings, and
      `kubectl get node h3mon -o jsonpath='{.status.allocatable.memory}'`.
      Stop: a preserved container is missing after the apply. Rollback: revert 1.4 and rerun.
- [ ] A8 Move the control plane (design decision 4). Blocked until 1.6 and 1.7 have receipts
      and the owner approves the rehearsed sequence. Who: operator, owner present. Commands:
      `k3s etcd-snapshot save` and `tool-fleet:recover record-manifest` on h4claw; stop and
      disable `k3s` there; `tool-fleet:recover verify-cold-restore` and
      `playbooks/restore.yml` limited to h5plat; the play of 1.7 on h4claw; `join.yml` for
      h3mon; `playbooks/platform.yml` and `playbooks/backup.yml` against h5plat.
      Receipt: `kubectl get nodes` shows h5plat with roles `control-plane,etcd` and h4claw and
      h3mon as agents with unchanged names; both `puni-retain` volumes Bound; every Flux stage
      Ready; the website answers; a new etcd snapshot is listed in the bucket.
      Stop: the restore refuses, a volume is not Bound, or the website stops answering for
      longer than the rehearsed figure. Rollback: as in design decision 4.
- [ ] A9 WBS production moves to h4claw. It is the existing cutover plan with its own
      authorization and is not a step of this change. Precondition from this change: A5 done.
- [ ] A10 h2puni becomes a gate host only, after A9 and after the cutover plan's rollback
      boundary has passed. Who: operator. Commands: move the controller files of N14 to the
      host the owner names; remove the WBS production Compose environment by the production
      runbook; rerun `playbooks/gate-host.yml`. Receipt: `docker ps` on h2puni lists no WBS
      production container, and the gate-host validate play passes.
      Stop: the dev stacks of N8 still need `sudo` for `puni1` and no decision moved them.
      Rollback: none needed; the Compose environment's data was exported by the cutover.
