# Fleet identities and ownership

The fleet uses stable logical node IDs for desired state. Hetzner instance IDs,
machine IDs, Kubernetes node UIDs and cluster IDs are observed identities. A
hostname is display text and never joins records or authorizes mutation.

Lifecycle is explicit: present, draining, then retired. Provisioning and
destroy are separate operations. A missing observed node remains a fault in
desired state; failed or partial discovery never becomes an empty fleet.

Terraform owns Hetzner resources and protected state. Ansible owns Ubuntu host
configuration and k3s membership. Flux owns long-lived platform resources after
bootstrap. The WBS release coordinator owns migration, rollout and rollback.
Each boundary consumes a persisted reviewed plan and rechecks identities before
effects.

`infra/fleet/desired.yaml` is the production desired-state input; its reserved
addresses and pending machine identities must be replaced before production
planning. `infra/fleet/examples/local.yaml` is the executable local topology.
`tool-fleet:plan` consumes one of those files plus a complete observation and
an explicit operation target, writes a new owner-only JSON plan, and prints the
plan digest and downtime/storage summary. Planning performs no provider or
cluster mutation.

tool-fleet:check validates the committed lock and its tests. The F0
tool-fleet:build entrypoint builds the pinned controller OCI artifact locally.
tool-fleet:lab and tool-fleet:apply fail with their missing F3 or F4
prerequisite. They never report success as placeholders.
