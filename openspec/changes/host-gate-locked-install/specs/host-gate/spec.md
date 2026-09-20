## ADDED Requirements

### Requirement: The host gate installs the locked dependencies before it gates

`bin/h2puni-gate-steps.sh` SHALL run `bun install --frozen-lockfile` in the gated checkout before
it validates OpenSpec and before any Nx work, so the gate reports about the dependencies the
gated commit locks rather than about whatever an earlier run left in the shared tree.

#### Scenario: A gate runs in a tree with stale dependencies

- **WHEN** the gate steps run in a checkout whose `node_modules` predates the gated commit's
  lockfile
- **THEN** the locked dependencies are installed before the OpenSpec validator is invoked

### Requirement: A refused install fails the gate loudly

The gate steps SHALL stop with a non-zero status carrying the installer's own message when the
frozen install is refused, and SHALL stop when no installer is present, in both cases before
OpenSpec validation and before any Nx work.

#### Scenario: The lockfile disagrees with the manifests

- **WHEN** the frozen install exits non-zero
- **THEN** the gate steps exit non-zero, the installer's message stays in gate output, and
  neither the OpenSpec validator nor any Nx target is invoked

#### Scenario: The installer is absent

- **WHEN** no installer can be found on the gate's path
- **THEN** the gate steps exit non-zero before the OpenSpec validator is invoked, rather than
  gating an uninstalled tree
