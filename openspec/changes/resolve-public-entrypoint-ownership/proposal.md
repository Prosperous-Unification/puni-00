## Why

A shared public entrypoint can be emitted by its provider and every importing TypeScript program. Counting emitters as owners rejects a valid provider when multiple production configurations are selected.

## What Changes

Preserve sole-emitter ownership. When multiple programs emit an entrypoint, select the unique emitting program whose compiler root file list explicitly contains it. Refuse zero or multiple explicit roots and name the relevant configuration paths. Keep the chosen program's complete transitive declaration closure and configuration/selector identities.

## Non-Goals

No configuration removal, nearest-path ownership, first-config selection, policy relaxation, certification or application changes.

## Constraints

Compiler root membership uses parsed files/include expansion. Imported dependencies remain in declaration traversal. Existing request validation and missing-entrypoint refusal remain required.

## Capabilities

### New Capabilities

- `relationship-entrypoint-ownership`: deterministic public declaration ownership among emitting TypeScript programs.

### Modified Capabilities

None.

## Domain Terms

No new terms; compiler roots and public entrypoints retain their existing meanings.

## Impact

Twilight Burokrat relationship extraction, production CLI regressions and same-policy diagnostic survey.
