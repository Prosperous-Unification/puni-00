# Platform reconciliation

Ansible installs k3s and bootstraps Flux. Flux then owns controllers, storage,
policy and registry resources in that order. Do not apply the long-lived
platform manifests from Ansible or by hand.

Run `infra/ansible/playbooks/platform.yml` against the bootstrap server with the
exact cluster ID, toolchain-locked Flux URL/version/checksum, immutable Git commit,
read-only deploy key, reviewed SSH host keys and SOPS age key. All three secret
files must already exist on the host with mode `0600`. The bootstrap write
credential is intentionally absent from the steady-state playbook.

The four supported cluster IDs are `platform-local`, `platform-production`,
`workers-local` and `workers-production`. Each overlay binds its own kubeconfig
Secret; the fleet check refuses cross-cluster substitution. Production uses the
hcloud storage controllers, while local clusters use the k3s local-path class.

Ordinary `wbs` and `workers` namespaces enforce Restricted Pod Security and
default-deny networking. The `wbs-solver` and `puni-forge` namespaces admit their
narrow host-path exception through the committed admission policy. Solver pods
may mount only `/run/puni/solver` as a directory, and source pods may mount only
a directory below `/srv/puni/worktrees/`. Neither may request privilege
escalation, host networking, host PID, Docker sockets or an API token.

The in-cluster registry is pinned to the amd64 manifest for Distribution 2.8.3.
Keep the existing external registry as the build and pull endpoint until TLS,
authentication, offline garbage collection and restart-pull recovery have been
observed against the replacement. This manifest alone does not authorize that
migration.
