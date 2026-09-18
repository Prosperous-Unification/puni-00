# Design

The fleet follows [the delivery design](../../../docs/superpowers/specs/2026-09-17-twilight-bureaucrat-and-fleet-design.md) and F0–F5/F10/F12 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md).

`tools/tool-fleet` contains pure contracts/planners and thin adapters for provider inventory, Kubernetes, SSH, Terraform, and Ansible. Desired state uses stable logical node IDs, provider instance IDs, machine IDs, cluster IDs, capabilities, and explicit lifecycle state. Observations retain source time and completeness; failures never decode as empty lists.

Operation plans are content-addressed. A per-cluster Lease serializes membership changes, with a controller lock before bootstrap. Apply journals intent before effects, rechecks stable identities and resource versions, and stops when its lease is lost. Retirement emits a receipt only after workload evacuation, membership removal, credential/service de-enrollment, and fencing where the host is unavailable.

Fleet infrastructure executes through one source-free Terragrunt unit at `infra/terraform/terragrunt.hcl`. The runner verifies both executable hashes and selects Terraform explicitly. The existing HTTP backend, provider lock, resource addresses, `.tfplan` format, variables snapshots, state lineage/serial, ownership guards, and journal remain authoritative. Preparation and recovery use the same private variables snapshot. Configuration bytes are bound into the reviewed operation; unexpected execution overrides fail before parsing HCL. Commands disable implicit initialization and retries and preserve raw Terraform stdout. Explicit locked initialization precedes engine work; no multi-unit execution, hooks, generated backend, source downloads, or arbitrary argument forwarding is exposed.

Keeping the module in place avoids introducing cache-path and state-migration semantics. Separate units or alternate engines require a subsequent design; this change retains Terraform and does not move state.

## Rootless QEMU lab provider

The lab host grants no root, so the pinned Multipass provider (a privileged snap daemon) cannot be installed there. `tool-fleet:lab --provider qemu` runs Ubuntu 24.04 VMs with an extracted QEMU 8.2.2 under the operator's own user and `/dev/kvm`, pinned with its cloud image by SHA-256 in `infra/local/qemu-lab.lock.json`. Each VM has a user-mode NIC (outbound installs, SSH forwarded to a lab-unique loopback address) and a `dgram` NIC on a per-lab UDP hub that forms the private node network; loopback has no multicast and `socket` netdevs are point-to-point. Ansible addresses a VM by its private address and reaches it through `HostName`/`HostKeyAlias` SSH options, so inventory and known-hosts evidence keep the production shape. Machine names, ownership and deletion follow the Multipass rules: derived `puni-vm-<lab>-<profile>-<role>` names, exact pid-file plus command-line ownership, and bounded waits.

The `lab` discovery provider (`tool-fleet:discover --lab-state`) replaces the hcloud inventory source for a lab fleet so planning and apply run their production paths against these VMs. It refuses production desired state, non-loopback API endpoints and hcloud nodes.
