## Why

Current WBS exports version 8 with native minute and workday estimates, while Navigator accepts only version 7. Accepted current plans cannot be prepared for Dash, and merely widening the version would mislabel minutes as days.

## What Changes

Navigator reads strict versions 7 and 8. Version 8 writes task schema 2 with explicit native estimate units; version 7 retains schema 1. Receipt conversion reads both schemas without changing the value whose digest is checked. Burokrat decodes version-8 references alongside historical versions 6 and 7.

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
