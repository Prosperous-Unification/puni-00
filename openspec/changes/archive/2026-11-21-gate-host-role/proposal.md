## Why

Every heavy gate in the fleet queues behind one host-wide lock on h2puni, which is also live production and the build box. A gate takes tens of minutes, so parallel lanes wait. h4claw has 8 cores, 15 GB and an idle k3s server, but nothing configures it to gate. WBS 070.05 requires Ansible to configure every node and a second run to converge with no unexplained change.

## What Changes

**Gate host role**

- From: `bin/h2puni-gate.sh` runs only on h2puni, whose gate environment was assembled by hand.
- To: `infra/ansible/roles/gate_host` and `playbooks/gate-host.yml` configure any host in `gate_hosts`. The role creates a `puni1` account in the docker group with no sudo and installs the `.bun-version` Bun at `~/.bun-<version>/bin/bun`, the Node pinned by `binaries.gateNode` at `~/.node-<version>/bin/node` (Nx's bin runs under `node`) and the GitHub CLI release pinned by `binaries.gateGh` at `/usr/bin/gh` (twilight-dash's activation tests run it as their offline verifier). It also builds a hash-locked solver venv, writes a `~/.bashrc` that puts the pins on `PATH` above the interactivity guard, and makes a full clone at `~/puni-00-gate-tbf` with one frozen install. Read-only probes then prove each of these as `puni1`. The two new pins are required entries of `infra/versions/toolchain.json`, refused when missing by the fleet toolchain schema.
- Impact: non-breaking; h4claw joins `gate_hosts` and keeps its k3s groups.

## Non-Goals

No change to `bin/heavy-lock-lib.sh`, the gate steps, Docker, k3s, the firewall or the network roles. No cross-host queue: each host's lock is local. h2puni is not converted to the role.

## Constraints

- The lock path `/home/puni1/.cache/wbs-heavy-work.lock` is hard-coded on Linux with no override (a caller that names its lock can skip it), so the account must be `puni1`.
- Version pins are read from the controller's reviewed checkout, never from the gate tree, whose head moves with every gate.
- The live apply needs Dany's authorization of the recorded privileged path: the laptop controller, as root through h2puni.

## Capabilities

### New Capabilities

- `gate-host`: an Ansible-configured gate host that converges and proves its gate environment.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`infra/ansible/roles/gate_host`, `infra/ansible/playbooks/gate-host.yml`, `infra/ansible/inventory/production-existing-hosts.yml`, `infra/versions/toolchain.json` (`binaries.gateNode`, `binaries.gateGh`), `tools/tool-fleet/src/contracts.ts` and its tests, `tools/tool-fleet/src/ansible.test.ts`, `docs/infra/gate-hosts.md`, `docs/infra/README.md`, `LLM_README.md` and the Gate section of `AGENTS.md`.
