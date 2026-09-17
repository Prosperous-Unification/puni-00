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

tool-fleet:check validates the committed lock and its tests. The
tool-fleet:build entrypoint builds the pinned controller OCI artifact locally.
tool-fleet:apply still refuses until F4 supplies persisted operation plans.

## Disposable Ubuntu VM lab

`tool-fleet:lab` exercises the Ansible/systemd/firewall path on Ubuntu 24.04
with the exact Multipass and controller versions in
`infra/versions/toolchain.json`. A platform lab has one embedded-etcd server
and one agent. A workers lab has one tainted server and two execution agents.
The lab ID must be a short lowercase DNS-style label; VM names are derived as
`puni-fleet-<lab>-<profile>-<role>-<number>`. The command never accepts an
arbitrary VM name, and `down` passes only exact expected names to `multipass
delete --purge`.

```sh
bunx nx run tool-fleet:lab -- up \
  --lab-id f3-review \
  --profile platform \
  --ssh-public-key "$HOME/.ssh/id_ed25519.pub" \
  --ssh-private-key "$HOME/.ssh/id_ed25519"
bunx nx run tool-fleet:lab -- status --lab-id f3-review --profile platform
bunx nx run tool-fleet:lab -- down --lab-id f3-review --profile platform
```

`up` validates the complete Ansible layout before creating a VM, captures each
VM's host key through Multipass, writes owner-only state under
`.puni/fleet-labs/`, and runs bootstrap, join, and enrollment validation twice
through the digest-locked controller. The second pass refuses any nonzero
unmodeled `changed` recap; fresh validation Jobs have an exact profile-specific
allowance. A retained cluster token is reused; an existing lab with a
missing or malformed token refuses instead of inventing a replacement.

The roles disable swap, install chrony and prerequisites, bound journald,
verify declared mounts, apply only the owned nftables table after `nft -c`, and
probe the configured private MTU without fragmentation. k3s starts with an
enrollment taint. Validation checks Ready and stable node identities, CoreDNS,
cross-node DNS/pod traffic, and mounted storage before removing that taint. The
workers server keeps a separate `NoSchedule` taint, followed by an activity Job
whose assigned node must be an agent.

The VM run is the required proof for systemd, SSH, nftables, mounts, and MTU.
Ansible syntax and unit checks do not replace it. Hetzner CSI attachment,
provider firewall, public DNS/TLS, and distinct-cloud-host failure remain cloud
drills rather than claims made by this local lab.
