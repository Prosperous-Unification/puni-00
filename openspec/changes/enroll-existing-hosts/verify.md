# Verification

All runs 2026-09-27 on the lane worktree `batch-9/infra-prep`; no real host, cluster or cloud API
was contacted. Real-host steps (task 8) are unrun.

## Unit and contract tests

`env -u CLAUDECODE bun test` in `tools/tool-fleet`: `placement.test.ts` (10), `observability-budget.test.ts` (2),
`ansible.test.ts`, `contracts.test.ts`, `plan.test.ts`, `lab-provider.test.ts` pass.

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

- `rollback-host.yml`: without `puni_rollback_host`, and with the server named, it stopped at
  its first assert. Confirmed: k3s-agent inactive, no `inet puni_k3s`, 0 KUBE/CNI/FLANNEL
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

## Not run

Real hosts; `tool-fleet:discover` against production (SSH discovery cannot pass a user or
known-hosts file to the controller yet, so the runbook uses the playbooks directly);
`platform.yml` Flux bootstrap on the VM lab; Hetzner snapshots; a memory-pressure drill on the
observability stack.
