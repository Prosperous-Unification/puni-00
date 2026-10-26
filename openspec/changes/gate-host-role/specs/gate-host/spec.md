## ADDED Requirements

### Requirement: A gate host converges under Ansible

`playbooks/gate-host.yml` SHALL configure every host in `gate_hosts` so that the `puni1` account
runs `bin/h2puni-gate.sh <sha>` from `~/puni-00-gate-tbf`. On the gate PATH it SHALL provide the
Bun pinned by `.bun-version`, the Node pinned by `binaries.gateNode` in `toolchain.json` (Nx's
bin runs under `node`) and a solver Python built from the hash-locked requirements, and at
`/usr/bin/gh` the GitHub CLI release pinned by `binaries.gateGh` (the activation tests run it
as their offline verifier). It
SHALL leave that account Docker access and no sudo grant. The gate's heavy lock SHALL resolve to
the account's own cache directory. A second run on an unchanged host SHALL report no change.

#### Scenario: A second run converges

- **WHEN** the playbook runs twice against the same host
- **THEN** the second recap reports `changed=0` and `failed=0`

#### Scenario: The gate head belongs to the gate

- **WHEN** the gate tree already exists at any commit
- **THEN** the playbook neither fetches into it nor moves its head

### Requirement: The gate environment is proven on the host

The playbook SHALL end with read-only probes run as `puni1` through its `~/.bashrc`. The play
SHALL fail when `bun` is not the pinned binary at `~/.bun-<version>/bin/bun`, when `node` is not
the pinned binary at `~/.node-<version>/bin/node` or reports another version, when `/usr/bin/gh`
is missing or reports another version than the pin, when the tree is
shallow, partial, dirty or not the canonical URL, when `docker ps` fails, when `python3` is
not the solver venv or lacks the locked OR-Tools, or when the resolved lock directory is not
writable.

#### Scenario: The PATH names another Bun

- **WHEN** the gate account's PATH resolves a `bun` other than the pinned one
- **THEN** the play fails naming the resolved path and version

#### Scenario: The PATH has no pinned Node

- **WHEN** the gate account's PATH resolves no `node`, or one other than the pinned binary
- **THEN** the play fails naming what it resolved, before any gate exits 127 at the first Nx script

#### Scenario: The account cannot reach Docker

- **WHEN** the account is not in the docker group
- **THEN** the play fails at `docker ps`

### Requirement: Gate sandbox tools are available

The role SHALL install Ubuntu apt `bubblewrap` and `busybox`. Read-only gate-account probes
SHALL require system `bwrap` resolution and version execution, system BusyBox resolution and
benign execution, and executable BusyBox at `/bin/busybox` and `/usr/bin/busybox`. Failed
resolution or execution SHALL stop the validation command before later success can mask it.
These probes SHALL NOT grant namespace permissions or establish namespace capability.

#### Scenario: Required sandbox tools are absent or broken

- **WHEN** a required `bwrap` or BusyBox executable is absent, nonexecutable or exits unsuccessfully
- **THEN** validation fails without a later successful probe masking that failure

#### Scenario: Required sandbox tools are available

- **WHEN** the system tools resolve and their version or benign `true` probes succeed
- **THEN** tool validation succeeds without claiming namespace capability or a passing canonical gate
- **AND** the unchanged canonical gate remains the namespace probe, with no AppArmor, sysctl or user-namespace permission change
