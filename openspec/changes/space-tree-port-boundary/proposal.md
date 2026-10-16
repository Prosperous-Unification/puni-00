## Why

SpaceResource names WorkItemService solely for the project tree and shared aggregate read contracts. The tree payload is inferred from the concrete service, retaining a K6 dependency from spaces to the work-item resource.

## What Changes

Introduce neutral TreeRead and PlanTree declarations, relocate only their required supporting read types and JSDoc, and preserve existing resource type exports. SpaceResource accepts TreeRead and continues deriving its shared entry from sharedTreesWithin.

## Non-Goals

Changing runtime behavior, composition, authorization, shared scheduling, roll-up caching, other K6 findings, policy modes or deployment. This slice does not close or certify WBS090.

## Constraints

Keep treeWithin and sharedTreesWithin signatures and value shapes exact. Remove exactly the committed space-to-work-item K6 edge while retaining plan-import-to-directory. Existing domain terms apply; this reversible extraction requires no ADR.

## Capabilities

### New Capabilities

- `space-tree-boundary`: Spaces read project trees through a neutral application port.

### Modified Capabilities

None.

## Impact

Core read value declarations and dependency types only; application composition still supplies the same work-item instance.
