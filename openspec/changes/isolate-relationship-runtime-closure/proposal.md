## Why

Relationship extraction links its frozen candidate's node_modules to an arbitrarily named trusted directory. TypeScript then resolves transitive vendor dependencies through that directory's ancestors, potentially mixing the reviewed closure with unrelated installed packages. A candidate augmentation can consequently target a different dependency than the vendor declaration it augments.

## What Changes

Relationship extraction resolves vendor declarations only from a physical copy of the explicitly trusted package closure. The trusted directory's basename and neighboring installations do not affect resolution. Missing dependencies refuse; unreadable packages and escaping symlinks refuse explicitly. Failed materialization leaves no temporary candidate behind.

## Non-Goals

No application changes, dependency upgrades, archive format changes, activation changes, survey policy changes, certification, merge, deployment, or full host gate.

## Constraints

Retain TOOL_WIKI_TRUSTED_NODE_MODULES and the deployed trusted-node-modules archive contract. Copy complete packages on demand so extraction does not copy the entire development installation. Use the same filesystem boundary for compiler configuration, compilation and relationship resolution. Compiler standard libraries have an explicit bounded exception. Preserve candidate module and symlink refusals.

## Capabilities

### New Capabilities

- `relationship-runtime-closure`: isolated package materialization and compiler filesystem admission.

### Modified Capabilities

None.

## Domain Terms

None. Existing candidate, runtime closure and activation terms suffice.

## Decisions Recorded

None. The implementation is reversible and introduces no new operator contract.

## Impact

Twilight Burokrat relationship extraction and its production CLI tests. The archive, launcher and WBS applications retain their existing contracts.
