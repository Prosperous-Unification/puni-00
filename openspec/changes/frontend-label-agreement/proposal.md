# Frontend label agreement

## Problem

`tools/tool-devsync/src/module-labels.test.ts` checks that every module's DI Bag label, README
index, wiki pilot row and boundary agree with the identifier its location implies, but it reads
only the application and backend roots. All eight frontend modules under
`apps/wbs/fe-01/src/modules` now have index blocks and pilot registrations, so nothing stops one
from drifting (WBS 040.12).

## Outcome

The check reads `apps/wbs/fe-01/src/modules` with the `frontend` segment. Each frontend module
must be indexed and registered as `module.frontend.<directory>` with boundary
`boundary.frontend.<directory>`. Only Preferences and Directory management are sealed DI Bag
modules; their `moduleLabel` getter must return `frontend.<directory>`. The other six are
compositions of plain functions and are declared unsealed. A declared-unsealed module must have no
`module.ts` and no non-test `di-bag` import, and every declared entry must name an existing
module directory. Any other module without `module.ts` fails.

## Non-goals

- The frontend runtimes under `apps/wbs/fe-01/src/runtime`. They own lifetimes rather than modules
  and carry no index block.
- `kinds.json` shim ownership for frontend paths. No frontend shim row exists; a future one fails
  closed as naming no sealed module until the project map learns the frontend.
- Sealing the six compositions.

## Constraints

The two sealed modules must import under `bun test` without a DOM, which they do today.
