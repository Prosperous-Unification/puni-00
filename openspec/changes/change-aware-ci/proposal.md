## Why

An ordinary assessment Markdown edit selects five projects for tests. A measured successful Twilight job took 61 minutes, including 53 minutes of Burokrat tests. Repository-wide validator inputs couple validating documentation to testing the validator implementation. This delays every platform planning and development cycle.

## What Changes

- Classify validated commit diffs into focused documentation validation or affected code checks. Reviewed prose changes do not start unrelated application, browser, build, or validator regression suites.
- Select runtime targets using their own input dependencies rather than unrelated lint inputs. Include affected dependent modules; narrow test-file execution only where complete dependency coverage is proven.
- Treat fixture, process, contract, configuration, deletion and rename inputs explicitly. Unknown impact requires broader checks; invalid or missing evidence fails.
- Record selected checks, selection reasons and elapsed times. Stable required checks refuse failed, cancelled, absent or unexplained skipped work.

## Non-Goals

Test sharding, increasing concurrency, test-result caching, changing application behavior, enabling external trusted-wiki activation, or replacing Bun/Nx. No blanket Markdown exemption or use of native Bun --changed as the sole authority.

## Constraints

Preserve immutable PR synthetic-merge boundaries. Full push, merge-group, manual and host gates remain full initially. Retain formatting, secrets, private-nesting and relevant documentation/spec validators. Prove each selector/reducer guard on its production path with injected faults. The existing assessment merge proceeds independently.

## Capabilities

### New Capabilities

- `change-aware-ci`: dependency-aware CI selection with focused prose validation and auditable required-check reduction.

### Modified Capabilities

None.

## Domain Terms

None; existing module and check terminology suffices.

## Decisions Recorded

None.

## Impact

GitHub CI scope and execution, tool-git-hooks selection helpers, tool-devsync documentation validation, narrowly eligible Bun test entrypoints, and their regression tests. No deployment or application contract changes.
