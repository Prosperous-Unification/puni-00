## MODIFIED Requirements

### Requirement: A gate host converges under Ansible

`playbooks/gate-host.yml` SHALL configure every host in `gate_hosts` so that the `puni1` account
runs `bin/h2puni-gate.sh <sha>` from `~/puni-00-gate-tbf`. On the gate PATH it SHALL provide the
Bun pinned by `.bun-version`, the Node pinned by `binaries.gateNode` in `toolchain.json` (Nx's
bin runs under `node`) and a solver Python built from the hash-locked requirements, and at
`/usr/bin/gh` the GitHub CLI release pinned by `binaries.gateGh` (the activation tests run it
as their offline verifier). It SHALL leave that account Docker access and no sudo grant, except
on a host whose inventory entry sets the boolean `puni_gate_account_may_sudo` (default false):
there the account keeps a pre-existing grant, and the play SHALL instead fail once the probe no
longer reports it (the `sudo` group or `sudo -n true` succeeding), so a stale exception is
refused. The gate's heavy lock SHALL resolve to the account's own cache directory. A second run
on an unchanged host SHALL report no change.

#### Scenario: A second run converges

- **WHEN** the playbook runs twice against the same host
- **THEN** the second recap reports `changed=0` and `failed=0`

#### Scenario: The gate head belongs to the gate

- **WHEN** the gate tree already exists at any commit
- **THEN** the playbook neither fetches into it nor moves its head

#### Scenario: A strict host's gate account escalates

- **WHEN** `puni_gate_account_may_sudo` is false and the gate account is in the `sudo` group or
  `sudo -n true` exits 0
- **THEN** the play fails saying the account must not escalate

#### Scenario: An excepted host's gate account escalates

- **WHEN** `puni_gate_account_may_sudo` is true and the gate account is in the `sudo` group or
  `sudo -n true` exits 0
- **THEN** the sudo validation passes

#### Scenario: An excepted host's gate account no longer escalates

- **WHEN** `puni_gate_account_may_sudo` is true and the gate account is in no `sudo` group and
  `sudo -n true` fails
- **THEN** the play fails saying the exception is stale and must be removed from the inventory

#### Scenario: The exception is not a boolean

- **WHEN** `puni_gate_account_may_sudo` is the string `false`
- **THEN** the input assertion refuses the run before any change
