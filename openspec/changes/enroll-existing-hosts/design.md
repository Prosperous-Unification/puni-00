# Design

## Ownership on an adopted host

The fleet owns only what its roles write: `/swap.puni` and its fstab line, the `puni-fleet`
operator and its sudoers file, `/etc/sysctl.d/90-puni-k3s.conf`, `/etc/modules-load.d/puni-k3s.conf`,
the journald drop-in, the `inet puni_k3s` nftables table and its unit, the MTU unit, and k3s
(binary, units, `/etc/rancher/k3s`, `/var/lib/rancher/k3s`, `/var/lib/kubelet`, CNI state and
KUBE-/CNI-/flannel iptables chains). Docker, its containers, networks, iptables chains and
volumes, other users and their keys, and the cloud-init sudo grant
(`puni_remove_cloud_init_sudoers: false`) belong to the host. `rollback-host.yml` removes exactly
the fleet set; the pre-enrollment provider snapshot restores anything else.

## Memory

Pods run under `kubepods.slice`, whose `memory.max` the kubelet sets to capacity minus the
system and kube reservations; host services keep the rest plus the swap file. Pods never swap
(`fail-swap-on=false` with the default `NoSwap` behaviour); every hard-eviction signal is
restated so none falls to zero. The budget test sums the production graph's requests on h3mon,
and fails when a new pinned workload or DaemonSet source appears.

## Failure handling

Preflight reads and asserts; an absent Docker client is the modeled Docker-free host, any other
inspection failure fails the run. Rollback refuses unless exactly one host is named and
confirmed; each removal step is conditional on observed state, so a rerun reports `changed=0`,
and the iptables script aborts on a failed save or restore instead of reporting no rules.

## Why the playbooks, not `tool-fleet:apply`

`tool-fleet:apply` enrolls through `join.yml` only and requires a running cluster's Lease; the
first server of an SSH-only cluster has neither. Production SSH discovery also cannot yet pass a
user or known-hosts file to the controller. The runbook therefore runs the playbooks through the
locked controller, with preflight's reviewed machine ID and validation's SSH-versus-Kubernetes
identity comparison as the identity gates. The planner guards still protect later enrollments.
