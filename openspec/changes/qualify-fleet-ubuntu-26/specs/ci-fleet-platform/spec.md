## ADDED Requirements

### Requirement: The Fleet heavy leaf selects an exact hosted runtime tuple

The CI workflow SHALL route the validated heavy-matrix row for `tool-fleet` to `ubuntu-26.04` and CPython `3.14.10`. Every other admitted heavy row and the six static Python-consuming jobs SHALL select `ubuntu-24.04` and CPython `3.14.4`. Each Python-consuming job SHALL keep one pinned setup-python action and its existing install contract.

#### Scenario: The validated heavy roster selects Fleet

- **WHEN** the heavy matrix includes `tool-fleet`
- **THEN** only its row selects Ubuntu 26.04 and CPython 3.14.10
- **AND** `tool-devsync`, `wbs-store-sqlite`, and `wbs-core` select the legacy tuple

#### Scenario: The production workflow's routing regresses

- **WHEN** the Fleet image or Python pin reverts, or the Fleet predicate includes another heavy row
- **THEN** the parsed production workflow contract check fails

### Requirement: Fleet platform qualification retains the complete gate

The Fleet leaf SHALL retain its required native prerequisites and probes, solver hash lock, test, lint, typecheck and build phases, literal scope arguments, 12 GiB memory limit, zero swap, CPUs 0–2, 4,096 tasks, 75-minute phase timeout and 90-minute job timeout. The required gate SHALL continue to reflect its actual outcome.

#### Scenario: The new source completes qualification

- **WHEN** the exact new source runs the required checks
- **THEN** its hosted Fleet leaf must complete native provisioning and all selected phases successfully
- **AND** its required hosted checks and full canonical host gate must succeed before the new tuple is accepted

#### Scenario: A required check has no passing verdict

- **WHEN** a prerequisite, scope probe, hosted leaf, required aggregate or canonical gate fails or loses its runner
- **THEN** the new tuple remains unqualified
