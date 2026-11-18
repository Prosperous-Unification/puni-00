## Why

The enrollment runbook requires calibration of an estimated gate before its first ordinary run under the memory threshold. The documented Dash example starts the outer gate inside an already admitted calibration. That launcher requests a second exclusive gate tree and is refused. The latest h2 measurement query found zero comparable gate records for the dedicated launcher, host class, SHA profile and Bun revision.

## What Changes

An operator can invoke `bin/h2puni-gate.sh --calibrate <sha>` from the designated enrolled launcher. It resolves the target and prepares the configured external wiki verifier once. Dash receives one calibration submission with the existing fixed gate payload and resolved commit. The assigned tree runs the usual gate steps and returns to its resting checkout.

## Non-Goals

Changes to job types, resource limits, pool mode, trust authority, installation, candidate qualification policy, or calibration of other launchers are outside this change.

## Constraints

Preserve ordinary explicit-target and default-HEAD invocations. Calibration requires an explicit target, a top-level invocation and positive enrollment. The normal Dash admission and heavy lock, external verifier, payload terminal and tree settlement govern the run. Measurements, an accepted catalogue proposal and an exact ordinary gate receipt have separate evidence requirements.

## Capabilities

### Modified Capabilities

- `host-jobs` gains an operator-facing gate calibration requirement.

## Domain Terms

None.

## Decisions Recorded

None.
