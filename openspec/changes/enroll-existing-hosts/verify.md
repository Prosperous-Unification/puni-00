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

## Not run

Real hosts: the h4claw join-token transfer, `join.yml` on h3mon, `validate-enrollment.yml`, the
after-enrollment preflight on h3mon and steps 6–8; `tool-fleet:discover` against production (SSH discovery cannot pass a user or
known-hosts file to the controller yet, so the runbook uses the playbooks directly);
`platform.yml` Flux bootstrap on the VM lab; Hetzner snapshots; a memory-pressure drill on the
observability stack.
