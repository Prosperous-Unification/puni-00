## Why

Optimization imports shared contracts through the application barrel and a feature recorder. Burokrat therefore sees unrelated sibling feature dependencies even when the caller only needs a neutral port. This obscures the seven real recording dependencies that still need separate design work.

## What Changes

Optimization transaction owners import their unit-of-work contracts directly. The optimized reader imports and re-exports scheduler ports directly. Committed event and delivery contracts live in a neutral port with compatible recorder re-exports. The optimization contract imports the exact ports it consumes. Owners use SQLite adapter leaves; its event-log type re-export names the neutral port directly.

## Non-Goals

Moving recording into EventLogService, changing Burokrat inventory, removing the seven runtime recorder calls, and changing transactions or gateway delivery.

## Constraints

Preserve existing type exports, event shapes, transaction ownership, capture ordering, durable recording, and delivery after commit. Use the installed production graph for evidence. The parent task already selects and authorizes this bounded design; no unresolved design decisions or new glossary terms were found.

## Capabilities

### New Capabilities

- `optimization-port-boundaries`: optimization consumes neutral contracts without unrelated feature reachability.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None; these import boundaries are reversible and use the existing ports architecture.

## Impact

WBS backend optimization and application core committed fanout types. No HTTP, database, deployment, or runtime behavior changes.
