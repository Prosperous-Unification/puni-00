# Gate hosts

A gate host runs `bin/h2puni-gate.sh <sha>` exactly as h2puni does, under its own host-wide heavy
lock, so gates on different hosts run in parallel. h2puni is the original gate host. h4claw is the
second, configured by `infra/ansible/playbooks/gate-host.yml` (WBS 070.05) and live since
2026-10-21: the apply converged twice and a full gate exited 0 there, recorded in
[the gate-host-role verification](../../openspec/changes/gate-host-role/verify.md). Gate on it as
`puni1` from `~/puni-00-gate-tbf`; a full gate takes about 100 minutes.

## What the role sets up

`infra/ansible/roles/gate_host` makes the host match h2puni's gate environment:

- **Account.** It creates the `puni1` system account in the `docker` group, with no sudo. The name
  is fixed because `resolve_heavy_lock_path` in `bin/heavy-lock-lib.sh` hard-codes
  `/home/puni1/.cache/wbs-heavy-work.lock` on Linux and takes no override. Each host's lock is
  local to that host. A lane queued on h4claw waits only for h4claw's gates.
- **Bun.** It installs the Bun pinned by `.bun-version` at `~/.bun-<version>/bin/bun`, with
  `bunx` beside it. The bytes come from the `binaries.solverBun` lock in
  `infra/versions/toolchain.json`.
- **Node.** It installs the Node pinned by `binaries.gateNode` in `toolchain.json` at
  `~/.node-<version>/bin/node`, the interpreter only. Nx's bin is `#!/usr/bin/env node`, so every
  `bun run` of an Nx script needs it; h2puni has the same version through Volta.
- **gh.** It installs the GitHub CLI release `.deb` pinned by `binaries.gateGh` at `/usr/bin/gh`.
  twilight-dash's activation tests hash that file and run it as the offline attestation
  verifier; h2puni has gh from GitHub's apt repository, which keeps only the newest release.
- **Solver Python.** It builds `~/.venv-solver` from the solver lock, installed with
  `--require-hashes` as CI does.
- **Shell.** `~/.bashrc` puts the Bun, Node and solver environment first on `PATH`, and sets
  `TMPDIR=/var/tmp` and `NX_DAEMON=false`. These lines sit above the interactivity guard, which
  is what a non-interactive `ssh … CMD` needs.
- **Gate tree.** `~/puni-00-gate-tbf` is a full clone of the GitHub repository, with one frozen
  install. Ansible never moves its head; the gate does.
- **Packages.** It installs `git`, `jq`, `perl`, `python3-packaging`, `python3-venv`,
  `shellcheck` and `unzip`. Docker must already be running. The role does not change Docker,
  k3s, the firewall or the network.

The last tasks are read-only probes run as `puni1` through its `~/.bashrc`:

- `bun` and `bunx` resolve to the pinned Bun;
- `node` resolves to the pinned Node and reports its version;
- `gh` is `/usr/bin/gh` and reports the pinned version;
- the tree is a full, clean clone of the canonical URL;
- `docker ps` works;
- `python3` is the venv's and imports the locked OR-Tools;
- the production lock resolver names `~/.cache/wbs-heavy-work.lock` in a writable directory.

To rerun only the probes, pass `--tags validate`.

## Add a gate host

1. Add the host to `gate_hosts` in its inventory. Keep its other group membership.
2. Put the gate's SSH public keys in an operator-only file, `$OPS/gate.json`:
   `{"puni_gate_authorized_keys": ["ssh-ed25519 …"]}`.
3. Take a backup of what the role touches (accounts and package selections). Then run the
   playbook twice through the fleet controller. The second run must print `changed=0`.

For h4claw, the controller is the one the 2026-09-27 enrollment used. It runs on the operator
laptop and reaches `10.1.0.4` as root through a jump via h2puni. Its inputs are in
`~/.puni/fleet/2026-enroll` (see [enroll h4claw and h3mon](enroll-h4claw-h3mon.md#1-prepare-the-controller-on-h2puni)).
On h2puni that directory has only the admin key: no `vars.json` and no `known_hosts`.

```sh
OPS=~/.puni/fleet/2026-enroll
fleet_ansible --limit h4claw --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml
fleet_ansible --limit h4claw --extra-vars @"$OPS/gate.json" playbooks/gate-host.yml  # changed=0
```

## Launch a gate on h4claw

```sh
ssh puni1@<h4claw public address> \
  'cd ~/puni-00-gate-tbf && git fetch -q origin && bin/h2puni-gate.sh <sha>' > gate-<sha8>.log 2>&1
```

The [Gate](../../AGENTS.md#gate) rules are the same as on h2puni:

- Pass the sha. Do not check it out first.
- Trust the printed `h2puni gate: running on <sha>`.
- Exit 65 means the tree is dirty, and exit 66 means it has unreadable tracked paths.
- `bin/with-heavy-lock.sh status` names the holder of the lock on that host.
