## Why

Step references currently accept an ordinal alias such as `010.s2-impl`, but they refuse its zero-padded form `010.s02-impl`. A future ordinal-first reference must pad ordinals when a project has ten or more steps so ordinary alphanumeric sorting keeps step order. Accepting those addresses before emitting them lets older and newer servers coexist during a blue/green release.

## What Changes

The step-reference resolver accepts zero-padded ordinal aliases when the ordinal and immutable step code identify the same project step. It continues to return the existing canonical `<work-item-number>.<step-code>` reference. The alias `010.s02-impl` names the same node as `010.s2-impl` when Impl is step two.

## Non-Goals

This change does not emit padded or ordinal-first references, alter step codes or step-node IDs, migrate storage, change sorting in the UI, or change the address revision algorithm.

## Constraints

Existing unpadded aliases and canonical references remain valid. Invalid ordinals and mismatched codes remain refused. The parser must ship before any server emits padded references during blue/green deployment.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the step-reference input grammar accepts padded ordinal aliases.

## Domain Terms

None; Step reference and Step node ID already live in `CONTEXT.md`.

## Decisions Recorded

None.

## Impact

The domain parser and resolver used by the be-01 step-reference endpoint and MCP tool; no API response, FE, storage or migration change.
