# Fleet identities and ownership

Operator commands and what has been tested: [infrastructure operator guide](README.md).

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
`tool-fleet:apply` consumes only a persisted plan and its reviewed digest. Provisioning additionally consumes same-prefix saved Terraform plan, backend evidence, and Ansible variables artifacts. Existing-host enrollment consumes hash-bound static inventory, Ansible variables, and SSH known-hosts artifacts. Production Ansible and Kubernetes commands run through the digest-locked controller; Terragrunt 1.1.5 invokes Terraform 1.16.3 only after both executable hashes match the toolchain lock. The source-free unit runs in place, with its configuration digest bound into provision and destroy plans; backend and Terraform state identity remain unchanged. See [the infrastructure operation runbook](../../infra/terraform/README.md).

## Disposable Ubuntu VM lab

`tool-fleet:lab` exercises the Ansible/systemd/firewall path on Ubuntu 24.04
with the exact Multipass and controller versions in
`infra/versions/toolchain.json`. A platform lab has one embedded-etcd server
and one agent. A workers lab has one tainted server and two execution agents.
`--provider qemu --qemu-prefix <dir>` runs the same lab rootless on QEMU/KVM with the build
locked in `infra/local/qemu-lab.lock.json`; every recorded VM drill used that provider, and the
default Multipass provider has not run live. The lab ID must be a short lowercase DNS-style label; VM names are derived as
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

## Retirement, replacement, and upgrade

Retirement planning consumes the detailed observation, including the exact
provider identity, Kubernetes node UID, Ready state, storage attachments, and
observed capability labels. It refuses missing or unhealthy targets, attached
storage, the sole control plane, an unproven HA replacement set, and any
required capability floor that would be lost. The operator must also name a
backup receipt. Planning remains read-only:

```sh
bunx nx run tool-fleet:plan -- \
  --fleet infra/fleet/desired.yaml \
  --observation .puni/fleet/observation.json \
  --operation retire \
  --node workers-agent-a \
  --backup-receipt backup-workers-20260917 \
  --backup-receipt-sha256 <reviewed-backup-receipt-sha256> \
  --inventory-sha256 <reviewed-static-inventory-sha256> \
  --known-hosts-sha256 <reviewed-known-hosts-sha256> \
  --output .puni/fleet/retire-workers-agent-a.json
```

Create the exact static inventory and pinned SSH host-key artifacts as
`.puni/fleet/retire-workers-agent-a.json.inventory.json` and
`.puni/fleet/retire-workers-agent-a.json.known_hosts`, with the structured
backup receipt at `.puni/fleet/retire-workers-agent-a.json.backup-receipt.json`.
The reviewed hashes bind retirement to those bytes. Control-plane retirement
inventory includes every cluster server's exact address, user, machine/provider
identity, SSH policy, and host key so fresh etcd health probes can delegate to
surviving voters. This applies to cloud and external SSH nodes; cloud nodes also
require the live dynamic provider identity to match.

Apply requires the printed digest and runs each step under the cluster Lease.
The playbook checks the explicit Kubernetes context, live provider ID,
Kubernetes UID, Ready capability floors, a linearizable etcd MemberList, an
unambiguous member-to-node mapping, and fresh linearizable health from every
counted surviving voter whose local maintenance status returns the mapped etcd
member ID, registration
endpoint placement, hostPath and local-PV topology before each mutation. It
honors PDB failures, waits for workload recovery and volume detach, asks k3s to
remove the exact embedded-etcd member, then disables k3s and removes its
configuration, kubeconfig, tokens, and TLS credentials before deleting the Node. The adapter persists an authoritative
enrollment exclusion before writing the owner-only retirement receipt. Any
failed step leaves a recoverable journal and no receipt.

```sh
bunx nx run tool-fleet:apply -- \
  --plan .puni/fleet/retire-workers-agent-a.json \
  --expect-sha256 <printed-plan-sha256>
```

A disappeared node cannot use normal retirement. Replacement planning requires
an exact owner-only fence receipt at `<plan>.fence-receipt.json` for the observed
provider identity in `powered-off` or `deleted` state. Apply rechecks that fence
against the live provider before writing the enrollment exclusion and a
replacement authorization consumed by a distinct provisioning plan.

Upgrade planning reads `<plan>.upgrade-evidence.json`, binds every installed
node version, server-cluster snapshot identities, and SHA-256s of owner-only
`<plan>.recovery-token` artifacts, accepts only the exact
locked k3s version, and orders servers before agents. The production adapter
binds static inventory and host keys, rechecks the Kubernetes UID and Ready
condition in the explicit context, and applies one serial transition. The
playbook is checksum-bound, drains without universal force flags, snapshots
etcd on servers, and proves node, workload, volume-attachment, and etcd voter
health before uncordoning.

Provider deletion is a separate saved Terraform plan after a completed
retirement receipt. The destroy decoder allows only the exact retired server,
its network edge, and its retained-volume attachment; it refuses retained
volume, primary-IP, shared-infrastructure, and other-node deletion. Apply binds
the saved-plan, variables, backend-evidence, and remote-state hashes and rechecks
direct provider ownership before consuming the plan. Retirement never destroys
a provider instance or retained application storage. A server downgrade uses
the recovery procedure; the ordinary upgrade planner refuses it.
