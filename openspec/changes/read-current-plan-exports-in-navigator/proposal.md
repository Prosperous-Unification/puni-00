## Why

Current WBS exports version 9 with native minute and workday estimates and direct step blockage facts. Navigator must prepare those current plans for Dash while preserving historical exports and refusing malformed direct facts.

## What Changes

Navigator reads strict versions 7, 8 and 9. Versions 8 and 9 write task schema 2 with explicit native estimate units; version 7 retains schema 1. Receipt conversion reads both schemas without changing the value whose digest is checked. Burokrat decodes version-8 and version-9 references alongside historical versions 6 and 7.

## Non-Goals

No estimate conversion, scheduling, network delivery, new commands, or migration of historical artifacts.

## Constraints

The approved implementation packet fixes the design and compatibility boundary. Original wire version and raw export bytes remain bound by the reference. Unknown keys, missing units, future versions and tampered digests fail before output. Existing file refusal behavior remains covered.

## Capabilities

### New Capabilities

- `current-plan-exports`: Native-unit current plan preparation and historical task compatibility.

### Modified Capabilities

None; the original Navigator capabilities remain in an unarchived change.

## Domain Terms

Task export; native estimate unit.

## Decisions Recorded

None.

## Impact

Navigator CLI, Burokrat record contracts, their tests and fixtures. No deploy or storage change.

## WBS080.25 strict v9 read and receipt amendment

Navigator accepts strict external v9, requiring direct `stepBlockages` facts. The narrow input validator checks existing leaf owners, existing steps, unique owner/step pairs and safe integer timestamps, including negative instants and retained facts on done progress. Unknown nested keys and v10 fail before output. V9 uses task schema 2 with unchanged native estimates; historical v7/v8 behavior and v6 reference compatibility remain. Original wire version and raw input bytes bind the reference. Facts stay in the original export, with no blockage command or eligibility calculation. Receipt consistency binds the six-field PlanRef and does not certify blockage freshness. A blockedAt-only change keeps tasks and tasksDigest equal while exportDigest and referenceDigest change.
