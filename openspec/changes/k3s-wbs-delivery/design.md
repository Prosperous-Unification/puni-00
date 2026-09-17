# Design

F8 and F11 of [the fleet plan](../../../docs/superpowers/plans/2026-09-17-k3s-fleet.md) define delivery. A release descriptor carries source SHA, exact image digest per tier, package and activation admission identities, and gate/browser evidence. Staging proves those bytes; production promotes the same digests.

The coordinator acquires a Kubernetes Lease, writes a recovery journal, suspends the named WBS Flux Kustomization, captures a consistent SQLite backup plus applied migrations, runs backward-compatible migration and tier rollout, verifies API/frontend/WebSocket/MCP/solver behavior, records commit state, and resumes Flux. Failure or controller restart follows the journal to roll forward or restore the captured state without creating a second writer.

The existing Compose deployment supplies migration/rollback evidence for first cutover. DNS and production apply consume a separate reviewed immutable operation plan.
