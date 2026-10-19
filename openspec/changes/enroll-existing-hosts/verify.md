# Verification

The unit, contract and QEMU runs below were on the lane worktree `batch-9/infra-prep` and contacted
no real host, cluster or cloud API. The partial real-host run (task 8) is under "Real hosts".

## Unit and contract tests

`env -u CLAUDECODE bun test` in `tools/tool-fleet`: `placement.test.ts` (10), `observability-budget.test.ts` (2),
`ansible.test.ts`, `contracts.test.ts`, `plan.test.ts`, `lab-provider.test.ts` pass. Under load
(QEMU and a review running) `discover.test.ts`'s replaced-identity case and `lab.test.ts`'s token
case exceed their 10 s and 5 s timeouts; both pass alone, and the discover case also times out on
unmodified `main`.

| Check                                     | Injected fault                                       | Observed                                                                    |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| duplicate SSH address (`decodeFleet`)     | guard condition `&& false`                           | `rejects two SSH nodes at one address …` failed                             |
| unresolved operator input (`requireNode`) | guard replaced by `if (false)`                       | `refuses every operation on an unresolved operator input` failed            |
| another machine at the desired address    | guard `&& false`                                     | `refuses enrollment when another machine answers …` failed                  |
| target missing/enrolled/wrong address     | guard `false && …`                                   | `refuses enrollment of a missing, enrolled, or wrong-address target` failed |
| CLI wiring of `requireEnrollmentTarget`   | call removed from `cli.ts`                           | `refuses a target discovery reported missing` failed (exit 0)               |
| inventory equals desired machine IDs      | h3mon inventory ID set to 32 hex, desired unresolved | `matches desired placement …` failed                                        |
| h3mon memory budget                       | h3mon system reservation 1536Mi                      | failed: 5926 requested > 5554 allocatable MiB                               |

## QEMU lab, Ubuntu 26.04 (`release-20260918`, SHA-256 `4908fb59…87bc`)

- `bunx nx run tool-fleet:lab -- up --provider qemu --qemu-prefix /tmp/puni-qemu/root --lab-id b9prep --profile platform …`
  exit 0 in 22m09s: bootstrap, join, validation, then the helper's stable second pass. The first
  attempt stopped at cloud-init `degraded done` (`[busy] Error renaming … enp0s1 to ens3`);
  dropping `set-name` from the lab network-config fixed it.
- A third manual pass through the locked controller: `server-1 ok=39 changed=0`,
  `agent-1 ok=39 changed=0`.
- Agent: `/swap.puni` 1024M active and in fstab; kubelet `configz` `failSwapOn=false`,
  `systemReserved`/`kubeReserved` 256Mi, all four eviction signals; allocatable 1382868Ki of
  2009556Ki; `kubepods.slice/memory.max` 1520914432 (capacity − 512Mi). A pod's container
  scope had `memory.swap.max` 0.
- Swap resize: with the removal block deleted, `puni_swap_file_mib=512` left 1024M active
  (`changed=0`); restored, 512M (`changed=6`), back to 1024M (`changed=6`), then `changed=0`.

### Docker coexistence, rollback and re-enrollment on the agent

Docker 29.1.3 and a `victoria-sentinel` busybox httpd on `127.0.0.1:8428` and
`10.55.0.12:9428` were started on the enrolled agent (served locally and from the server).

- `rollback-host.yml` (first version, inline iptables shell): without `puni_rollback_host`, and
  with the server named, it stopped at its first assert. Confirmed: k3s-agent inactive, no `inet puni_k3s`, 0 KUBE/CNI/FLANNEL
  rules, swap off, `cni0`/`flannel.1` gone, MTU 1500; the sentinel still served locally and
  over the private address and a container reached the internet. A second run `changed=0`
  (after making the swap, MTU, iptables and journald steps conditional).
- After `kubectl delete node`, `preflight.yml` at `before-enrollment` passed (`changed=0`) and
  printed the fact (machine ID, MTU 1500, listeners, container row, subnets). No file under
  `/etc`, `/usr/local`, `/var/lib` (outside Docker, apt, dpkg, cloud, landscape cache),
  `/home` or `/srv` was newer than a marker taken before the preflight runs.
- Preflight negatives, each failing at its task: `puni_private_interface=enp9s0` (private
  address), a wrong `puni_machine_id` (reviewed machine), a container published on 10250 (free
  k3s ports), a Docker network `10.42.7.0/24` (`10.42.0.0/16 overlaps 10.42.7.0/24`), and the
  server at `before-enrollment` (k3s present).
- Re-enrollment: `join.yml` `changed=24`, again `changed=0`; `validate-enrollment.yml` passed
  (`changed=3`, probe Jobs). `after-enrollment` preflight passed; after a reboot the node was
  Ready, swap, firewall, k3s-agent and Docker active, sentinel serving, preflight passed. With
  the sentinel stopped it failed naming both listeners; restarted, it passed.

## Second QEMU run after the review fixes

`lab up` exit 0 in 14m12s with the fixed roles (cloud-init sudo policy, swap guard).

- Swap 1024 → 0: `changed=3`, no swap device, file and fstab line gone; 0 again `changed=0`;
  back to 1024 `changed=5`, then `changed=0`. With the new size condition removed, 1024 → 0
  failed at "Deactivate the stale fleet swap file" (`swapoff failed: Invalid argument`).
- Rollback with the runbook's JSON `--extra-vars` on the Docker agent: `changed=10`, the
  `puni-remove-k3s-rules.sh` script reported `changed` for iptables and ip6tables; a rerun
  `changed=0`. The `key=value` form (`puni_rollback_remove_operator=false`) stopped at the first
  assert. Afterwards: no `inet puni_k3s`, 0 KUBE/CNI/FLANNEL rules, 21 DOCKER rules kept,
  sentinel served locally and from the server, container egress worked.
- Preflight sudo policy with `/etc/sudoers.d/90-cloud-init-users` granting `puni`: connecting as
  the operator passed; operator `other-op` with removal on failed naming the grant; with
  `puni_remove_cloud_init_sudoers=false` it passed.
- Re-enrollment: join `changed=24` then `changed=0`, bootstrap `changed=0`, validation passed
  (`changed=3`), after-enrollment preflight passed before and after an agent reboot, and the
  sentinel answered from the server.

## Real hosts, 2026-09-27 (Dany authorized the apply)

Controller: the locked image `fleet-controller:0.1.0@sha256:372f6f43…62de`, built with
`tool-fleet:controller-image` (image ID equal to the pin) on the operator laptop, because h2puni
was running a host gate. Ansible reached `10.1.0.4` and `10.1.0.2` as root through an SSH
`ProxyCommand` via h2puni, with the hosts' ed25519 keys pinned; h2puni was not changed.

- Before-enrollment preflight, both hosts: `ok=27 changed=0 failed=0`; after committing the IDs
  (`h4claw f592d9aa…1012`, `h3mon bed07fdd…09f4`, MTU 1450, no swap, cloud-init grant present):
  `ok=28 changed=0 failed=0`.
- `bootstrap.yml --limit h4claw`: `ok=47 changed=29 failed=0` (1m42s); second pass
  `ok=38 changed=0 failed=0`. Node `h4claw` Ready, `control-plane,etcd`, v1.36.4+k3s1,
  InternalIP 10.1.0.4, taint `puni.io/enrollment=pending:NoSchedule`.
- After-enrollment preflight on h4claw: `ok=26 changed=0 failed=0`.
- OpenHands on `127.0.0.1:3000` answered 200 before and after; its container reached
  `https://github.com` (200) after the firewall table was installed; 20 Docker iptables rules.
- Not run: copying the CA-bound join tokens from h4claw into the controller variables was refused
  by the operator session's permission policy, so `join.yml` on h3mon, `validate-enrollment.yml`
  and the final both-host preflight did not run. h3mon is unchanged.
- No Hetzner snapshots: no hcloud CLI or token on the controller. Backups taken: `/etc` tarballs of
  both hosts, a VictoriaMetrics snapshot and the Docker container/volume lists.

## Real-host reconciliation, 2026-10-17 (TASK-564)

This was a read-only reconciliation of h4claw before any proposed enrollment action. It found
the server already enrolled and therefore made no host change. Exact observed results:

```text
systemctl is-active k3s                         active
k3s --version                                   v1.36.4+k3s1 (4dedb15b)
k3s kubectl get node h4claw                     Ready; control-plane,etcd; 10.1.0.4
k3s kubectl get node h4claw --show-labels       control-plane, etcd, product, ingress
k3s kubectl get node h4claw -o jsonpath=taints  empty
ip -4 -o addr show                              enp7s0 10.1.0.4/32
systemctl is-active docker                      active
systemctl is-active puni-k3s-firewall.service   active
nft list tables                                 table inet puni_k3s present
curl http://127.0.0.1:3000/                     200 before and after reconciliation
docker ps                                       openhands-app Up 3 weeks; 127.0.0.1:3000->3000/tcp
find /root -name pre-k3s-etc.tgz                 2026-09-27T18:46:59Z
```

The host reported 8 CPUs, 15,602 MiB RAM, and 132 GiB free on `/`, correcting the old 4 CPU /
8 GB planning row. The historical bootstrap evidence above remains the idempotency proof:
first pass `ok=47 changed=29`, second pass `ok=38 changed=0`, followed by after-enrollment
preflight `ok=26 changed=0`. This run did not replay an authorized apply merely to regenerate
that evidence.

From h1claw, the target came from `ssh -G h4claw` and `nc -zvw5 "$H4_PUBLIC" 22`
succeeded (negative-control vantage could reach the host); the same probe to 6443 timed out with
exit 1. On h4claw,
`nc -zvw3 127.0.0.1 6443` succeeded and `kubectl` returned both Ready nodes. This proves the API
was closed from that public-internet vantage while the local API was live. A private probe from
h2puni to `10.1.0.4:6443` was also refused, consistent with the enrolled-address-only firewall;
it is not used as the public negative proof.

The current live result advances beyond the September record: h3mon is Ready, has no enrollment
taint, and was created on 2026-10-06. The exact later join/validation Ansible summaries remain
unrecovered, so live state is not presented as proof that those commands or the reboot/data
comparison ran. Provider snapshots remain unverified.

## Not run in the 2026-09-27 session

Real hosts: the h4claw join-token transfer, `join.yml` on h3mon, `validate-enrollment.yml`, the
after-enrollment preflight on h3mon and steps 6–8; `tool-fleet:discover` against production (the SSH transport arrived later in
`discovery-ssh-transport`; the runbook still uses the playbooks directly);
`platform.yml` Flux bootstrap on the VM lab; Hetzner snapshots; a memory-pressure drill on the
observability stack.

## Read-only production reconciliation, 2026-10-17

No playbook, package install, restart, or host write ran in this reconciliation. The live host
has advanced beyond the 2026-09-27 record, but the historical commands that caused that state
were not available and are not retroactively claimed as verified.

| Enrollment step                                         | Verdict                                                               | Live proof                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Reviewed identity and placement                      | Satisfied now                                                         | `/etc/machine-id` returned `bed07fdd1c9d47c08540df462db009f4`, matching `desired.yaml` and the Ansible inventory; `ip -brief -4 address` returned private `10.1.0.2/32`.                                                                                    |
| 3. Backups                                              | Still unverified                                                      | The September Victoria snapshot and `/etc` archive remain the last recorded evidence. No provider snapshot inventory was available to this read-only run.                                                                                                   |
| 5. Join h3mon                                           | Satisfied live state; execution/idempotency unverified                | `kubectl get node h3mon` returned Ready `True`, v1.36.4+k3s1, InternalIP `10.1.0.2`, label `puni.dev/capability-observability=true`, no taints, and `6222140Ki` allocatable. `k3s-agent` was active since `2026-10-06 19:00:50 UTC`.                        |
| 5. Enrollment validation and after-enrollment preflight | Still unverified                                                      | Matching identity, address, label and cleared taint prove the resulting registration, not that the validation and preflight commands ran or passed.                                                                                                         |
| 6. Swap and memory                                      | Swap satisfied; workload headroom failed                              | `swapon --show --bytes` returned `/swap.puni`, 4,294,963,200 bytes, with 186,671,104 used; `/etc/fstab` contains `/swap.puni none swap sw 0 0`; `kubepods.slice/memory.max` is 6,639,906,816 bytes. `free -m` returned 7,740 total and 5,771 available MiB. |
| 7. Flux                                                 | Partially satisfied                                                   | `target`, `controllers`, `storage`, `policy`, and `secrets` were Ready. `platform` was False on stalled `Deployment/puni-registry/registry`; `observability`, `alerts`, and `backup` remained dependency-blocked.                                           |
| 8. Preserve services and reboot                         | Services satisfied before/after this read-only run; reboot unverified | VictoriaMetrics, VictoriaLogs and VictoriaTraces health endpoints returned 200; Grafana `/api/health` and MLflow `/health` returned 200; OTel HTTP receiver returned 404 at `/`, proving the listener answered. No reboot ran.                              |

Live Docker cgroup usage was MLflow 200.4 MiB, OTel 56.32 MiB, VictoriaLogs 275.1
MiB, VictoriaTraces 50.16 MiB, VictoriaMetrics 136 MiB, vmauth 7.16 MiB, and Grafana
151.2 MiB (about 876 MiB total). The production Kubernetes observability graph requests
5,830 MiB including the budget test's 128 MiB allowance, already 59 MiB more than current
`MemAvailable` and leaving only 246 MiB of node allocatable. This falsifies the assumed
parallel-run headroom. No observability workload was enabled and no smaller heap was substituted.

Listener proof: the legacy services remained on loopback except vmauth on private
`10.1.0.2:9428`. From h2puni, private probes found only 9428 open; 3000, 4318, 5000, 8428,
10428, 6443, and 10250 were closed. Probing h3mon's public `62.238.112.126` from h2puni found
all of those ports, including 9428, closed. Nothing new was exposed publicly.

## Post-resize reboot proof, 2026-10-19

Dany resized h3mon, resolving the admission failure above without changing the declared
observability requests. After the resulting reboot, read-only checks recorded:

```text
boot                                         2026-10-19 09:08:29 UTC
capacity                                     8 CPUs; 15,602 MiB RAM
free -m                                      14,170 MiB available
Kubernetes allocatable                       8 CPUs; 14273444Ki memory; Ready=True
/etc/fstab                                   /swap.puni none swap sw 0 0
swap.puni.swap                               active since 09:08:35 UTC
swapon --show --bytes                        /swap.puni file 4294963200 bytes
docker.service                               active since 09:08:43 UTC
k3s-agent.service                            active since 09:08:39 UTC
VictoriaMetrics /health                      200
VictoriaLogs /health                         200
VictoriaTraces /health                       200
Grafana /api/health                          200
MLflow /health                               200
OTel HTTP receiver /                         404 (listener answered)
```

The same six service probes had passed on 2026-10-17 before the resize. This closes the
post-change service and persistent-swap checks without claiming the unrecovered enrollment
playbook history or a data comparison that was not run. From h2puni after the reboot, only the
intended private vmauth port 9428 was reachable on `10.1.0.2`; ports 3000, 4318, 5000, 8428,
10428, 6443 and 10250 were closed. On the public address, SSH was the positive control and all
eight service/k3s ports were closed.

The production observability graph was not activated. Flux reported `platform=False`
(`HealthCheckFailed`) and `observability=False` (`DependencyNotReady`), with the registry Pod
Pending. Each externally provided Secret documented by the runbook was absent:
`observability/{alertmanager-puni,elastic-s3-credentials}`,
`puni-backup/{velero-credentials,velero-repo-credentials}`, and
`puni-registry/{registry-auth,registry-ca}`. The memory prerequisite is now satisfied, but these
operator-owned credentials remain a separate hard prerequisite.
