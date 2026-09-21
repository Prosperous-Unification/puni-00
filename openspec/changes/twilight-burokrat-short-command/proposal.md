## Why

The installed Twilight Burokrat package exposes only the long command name, which makes frequent command-line use unnecessarily cumbersome. Task 5 of the [Twilight rename plan](../../../docs/superpowers/plans/2026-09-19-twilight-rename.md) already selects `twib` as the short command; the package now needs to expose and verify it without removing the full name.

## What Changes

- Installing the package links both `twilight-burokrat` and `twib` to the same executable.
- Package acceptance spawns both installed launchers directly and requires the same version output.
- Package acceptance verifies that the short launcher exists and is executable.

## Non-Goals

- Rename the package, Nx project, source directory, environment variables, or stored identifiers.
- Change command behavior or publish a package release.
- Add package documentation, which belongs to the rules packet.

## Constraints

- The full command remains available and behavior-compatible.
- Lifecycle scripts remain disabled during the package installation proof.
- Both commands must resolve to the existing built executable and run under the pinned Bun 1.4.2 runtime.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `package`: require the installed package to expose executable full and short command launchers for the same program.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

The Twilight Burokrat package manifest and package installation acceptance test change. There are no API, dependency, migration, or deployment changes.
