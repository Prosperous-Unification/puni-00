## Why

Clients currently encounter three tool names, source-tree commands and shell launchers for one PUNI workflow. Installation, generated helpers and operator instructions expose those differences, and the WBS entity rename will change several of those same interfaces. One PUNI command should cover the complete client surface with consistent discovery and a Bun runtime.

## What Changes

- The installed executable is `puni`. Its planning namespace is `navigator` with aliases `nav` and `n`; rules use `burokrat` with aliases `bur` and `b`; execution uses `dash` with alias `d`.
- Help, completion, errors, generated helpers, current installation instructions and public package branding use PUNI names. Final distribution exposes no legacy Twilight binaries.
- Every client-facing first-party script becomes a typed command under its owning namespace and executes from the installed artifact without a source checkout. Script conversion follows the linked Bun migration change.
- Existing authority checks, typed refusals, exit status contracts, explicit evaluation time, offline judging and token-helper startup obligations remain enforced through the new command paths.

## Non-Goals

Renaming historical evidence or changing the bytes and identities of previously issued toolkit, activation or release records; changing WBS behavior beyond its own entity changes; publishing a package as evidence of successful installation.

## Constraints

Use the existing Optique choice from [ADR 0064](../../../docs/adr/0064-use-optique-for-clis.md), interpreting the request's “oblique” as Optique. Use Bun and Nx. Preserve the Navigator/Burokrat/Dash responsibility boundaries and enforce explicit module facades. Client execution must require neither Bash nor Node. New launcher bytes receive a new versioned identity; historical verification remains valid. Every changed safety check needs a production-path fault proof.

## Capabilities

### New Capabilities

- `puni-cli`: one installable PUNI command, namespace aliases, typed discovery, runtime and distribution contracts.

### Modified Capabilities

None.

## Domain Terms

PUNI Navigator, PUNI Burokrat, PUNI Dash.

## Decisions Recorded

None new; CLI parser choice is ADR 0064.

## Impact

The three existing CLI applications, their public facades, package/build/release tooling, trusted launcher assets, generated client helpers, current docs, Nx/lint boundaries and the linked `bun-scripts` change. WBS entity terminology remains owned by `wbs-work-packages` and its dependencies.
