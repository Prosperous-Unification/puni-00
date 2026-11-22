## ADDED Requirements

### Requirement: Frontend owner lint covers the complete existing scope

The `wbs-fe-01:lint` target SHALL retain its three directory operands and every explicit root TypeScript operand. It SHALL use the same installed ESLint rules, configuration, CWD, Nx graph, TypeScript project discovery and configured ignore semantics. In serial mode its effective reported file set SHALL equal the set produced by the original whole-owner selection, with each selected path visited exactly once. `lint:fast` SHALL retain its established command and cache behavior.

#### Scenario: New file in an admitted directory

- **WHEN** a lintable file is added inside an existing directory operand, including a previously unclassified module or a direct file under `src/modules`
- **THEN** the full target SHALL check it exactly once with the existing configuration and type-dependent rules

#### Scenario: Ignored or missing input

- **WHEN** an explicit path is ignored, a directory is wholly ignored, an original operand is missing, or a flat config cannot load
- **THEN** the target SHALL retain the original ESLint warning or failure class and SHALL identify the affected operand or config

### Requirement: Frontend owner lint distinguishes serial and whole-CLI execution

A default invocation without forwarded arguments or a root `eslint-suppressions.json` SHALL enter serial mode. Forwarded arguments or the presence of the default suppressions file SHALL enter visible whole-CLI mode. Whole-CLI mode SHALL run the original ESLint CLI once with the unchanged 24 operands and any exact forwarded arguments. It SHALL preserve the installed CLI warnings and exit behavior. Failure or resource pressure in serial mode SHALL never select whole-CLI mode. Only a complete serial-mode execution SHALL qualify the serial owner acceptance check.

#### Scenario: Suppressions file changes the selected mode

- **WHEN** the root suppressions file is added, edited, or removed
- **THEN** the full FE target SHALL use the hash for the actual file state and the corresponding invocation mode while preserving all inherited Nx lint inputs
- **AND** a cached serial success SHALL never cover a present suppressions file

#### Scenario: Extra CLI arguments undergo whole-invocation processing

- **WHEN** an operator forwards ESLint arguments through Nx, including explicit paths or options with separate values
- **THEN** the launcher SHALL identify its whole-CLI mode and pass the exact original operands followed by those arguments intact

### Requirement: Frontend owner lint preserves typed policy across process boundaries

In serial mode the target SHALL reuse the installed ESLint CLI and the normal repository context for each group. The group assignment SHALL affect only lint inputs. Diagnostics from all dispatched groups SHALL remain visible. The target SHALL preserve applicable real type-aware and Nx policy violations, including files admitted by overlapping TS projects. A report that Nx skipped a rule because its cached graph is unavailable SHALL prevent a serial pass, even when the CLI exits zero.

#### Scenario: Violations in different groups

- **WHEN** two files in different dispatch groups violate a real type-dependent rule and a real Nx boundary rule respectively
- **THEN** the normal target SHALL report both rule identifiers against their paths and SHALL fail

### Requirement: Frontend owner lint accounts for worker completion

In serial mode the target SHALL dispatch at most one ESLint child group at a time and SHALL never invoke the CLI with zero file operands. Each settled serial lint child SHALL report the exact multiset of planned file paths, with one entry per path. Independent verification SHALL require that their union equals the normalized file set discovered by the original CLI on the whole owner. A failed start, missing or invalid completion report, unexpected file, nonzero child, or signal SHALL prohibit success. A child exiting with ordinary ESLint findings (status 1) SHALL allow remaining groups to run and SHALL propagate status 1 if all remaining work settles without a stronger failure. A configuration or usage failure (status 2) SHALL retain status 2 and halt dispatch. A signal SHALL halt dispatch and remain a signal failure rather than being reported as an ordinary lint finding.

#### Scenario: A worker is interrupted

- **WHEN** the target receives a termination signal with an active child
- **THEN** it SHALL stop dispatching further work, forward the stop to the active child and wait for settlement before returning failure

#### Scenario: A clean child reports incomplete coverage

- **WHEN** a child returns zero but omits a selected file or reports a file twice
- **THEN** the target SHALL fail and identify the affected group and path

#### Scenario: Graph-dependent policy is skipped

- **WHEN** a serial worker emits the installed Nx graph-unavailable rule-skip warning
- **THEN** the target SHALL report the affected group, fail qualification and preserve the emitted diagnostics even if the ESLint child reports success
