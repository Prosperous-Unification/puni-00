## Why

First-party operations are split between Bun, shell and Node entrypoints, including generated launchers and remote payloads. This makes PUNI clients and operators depend on several runtimes, and changing only the visible executable would leave those requirements in place. The implementation needs one runtime contract across script execution and delivery.

## What Changes

- First-party executable script logic, including CI, gates, development tools, remote payloads, verification scripts and generated launchers, runs on Bun.
- Each client-facing operation is embedded under `puni navigator`, `puni burokrat` or `puni dash`, according to the existing responsibility split. Internal automation calls the same implementation where it performs that operation.
- Shell pipelines, quoting-dependent argument forwarding and Node-only launch instructions are replaced with typed Bun process/file operations while retaining observed behavior, ownership, cancellation and exit contracts.
- An executable inventory and its consumers identify conversion obligations and reject newly introduced shell/Node runtime entrypoints. Historical records and browser/configuration modules are explicitly distinguished from executable scripts.

## Non-Goals

Porting browser application code, replacing third-party utilities, rewriting historical evidence, or claiming a local rehearsal proves live deployment. Importing a Bun-supported `node:` standard-library module is not a requirement for the Node executable.

## Constraints

The broader interpretation of “all scripts” includes first-party CI/dev/gate scripts; this assumption is recorded because the goal requests proactive execution. Bun must be present before a first-party script runs; no hidden shell fallback. Preserve host-wide admission/locking, exact-SHA gate checkout under lock, complete migration-ledger rollback, trusted-toolkit identity, environment/secret handling and required-tool failure semantics. Existing safety obligations remain; every changed check gets an observed production-path fault. No gate/deploy safety bypass during migration.

## Capabilities

### New Capabilities

- `bun-scripts`: Bun execution for first-party scripts with inventory, consumer migration and failure-proof obligations.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`bin/`, `tools/`, application operator entrypoints, delivered toolkit assets, generated helpers, infrastructure scripts and their CI/Nx/runbook callers. Client command ownership and packaging are specified in `puni-cli`.
