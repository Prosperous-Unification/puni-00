# Design

The fleet follows [the delivery design](../../../docs/superpowers/specs/2026-09-17-twilight-bureaucrat-and-fleet-design.md) and F0–F5/F10/F12 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md).

`tools/tool-fleet` contains pure contracts/planners and thin adapters for provider inventory, Kubernetes, SSH, Terraform, and Ansible. Desired state uses stable logical node IDs, provider instance IDs, machine IDs, cluster IDs, capabilities, and explicit lifecycle state. Observations retain source time and completeness; failures never decode as empty lists.

Operation plans are content-addressed. A per-cluster Lease serializes membership changes, with a controller lock before bootstrap. Apply journals intent before effects, rechecks stable identities and resource versions, and stops when its lease is lost. Retirement emits a receipt only after workload evacuation, membership removal, credential/service de-enrollment, and fencing where the host is unavailable.
