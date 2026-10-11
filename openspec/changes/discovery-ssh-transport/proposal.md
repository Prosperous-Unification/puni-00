# Intent

## Problem

Production `tool-fleet:discover` reads machine identity from SSH nodes with `discover.yml`, but
the command carried only the node address and display name, and the controller container received
only `HCLOUD_TOKEN`, `KUBECONFIG` and an ambient `SSH_AUTH_SOCK`. No remote user, no pinned
`known_hosts` and no jump host reached it, so discovery could not reach h4claw or h3mon and the
enrollment runbook had to run the playbooks directly (Twilight Dash WBS 070.05).

## Desired outcome

Discovery of a production fleet with SSH nodes takes one operator transport file: the remote
user, the reviewed `known_hosts`, and optionally a jump host pinned by the same file. It is
validated into one record, with `SSH_AUTH_SOCK` checked to be a socket, before any command runs, then rendered into
`discover.yml`'s connection variables (strict host-key checking, no global known hosts, batch
mode) and into the controller container (read-only `known_hosts`, the agent socket,
`ANSIBLE_HOST_KEY_CHECKING=True`). A cluster API served by one of its SSH nodes is reached
through a pinned SSH forward to that node's loopback (decision A28), and a cluster whose endpoint
is under the reserved `.invalid` TLD is recorded not bootstrapped without any read. Every
unusable input is a typed refusal.

## Non-goals

- Running discovery against real hosts; that is a host lane with its own authorization.
- Key files inside the controller: the key stays in the forwarded agent.
- Hashed, `@cert-authority` or non-default-port `known_hosts` entries.
- Changing the lab provider, which pins user and host keys in its own inventory.
- Replacing the playbooks-direct enrollment procedure.

## Constraints

Never `StrictHostKeyChecking=no` or `accept-new`; no free-form SSH options; no default user;
discovery stays read-only. Each refusal and each rendered flag has a production-path negative.
