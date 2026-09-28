## ADDED Requirements

### Requirement: The gate checks out world-readable trees

The h2puni gate SHALL check the pinned sha out under umask 022 whatever its caller's umask,
and SHALL refuse with exit 66 when a tracked regular file lacks read permission for other
users or a tracked directory lacks read and search permission for other users. The refusal
SHALL name those paths in a bounded listing, SHALL NOT run the gate steps and SHALL restore
the pre-gate checkout. A scan that fails SHALL fail the gate.

#### Scenario: A caller with umask 077 gates a sha that rewrites a file

- **WHEN** the gate runs under umask 077 and the checkout rewrites a tracked file
- **THEN** that file is readable by other users when the steps run

#### Scenario: An earlier checkout left a tracked file or directory closed

- **WHEN** a tracked file is 0600 or a tracked directory is 0700 after the checkout
- **THEN** the gate exits 66 naming the path, and the steps do not run

#### Scenario: The scan itself fails

- **WHEN** the file scan exits non-zero
- **THEN** the gate fails without running the steps and restores the pre-gate branch

### Requirement: Mode repair is opt-in and runs under the lock

With `H2PUNI_GATE_REPAIR_MODES=1` the gate SHALL widen tracked regular files and directories
of the pinned tree with `go+rX` under the heavy lock before the scan, and SHALL NOT change
the mode of a symlink target.

#### Scenario: The operator opts into the repair

- **WHEN** a tracked file is 0600 and a tracked directory is 0700 and the gate runs with the opt-in
- **THEN** both become readable by other users, the steps run, and a file a tracked symlink
  points to outside the tree keeps its mode
