## Why

SpaceResource names the concrete ProjectService solely to describe project list and read operations. This leaves a K6 dependency from spaces to the project resource.

## What Changes

Introduce ProjectRead extending ProjectList, relocate the project read value declarations into its neutral port, and preserve their resource exports for callers. SpaceResource accepts this port while the composition root still supplies the existing project resource.

## Non-Goals

Changing authorization, runtime behavior, work-item dependencies, shared caches, policy modes, other K6 findings or deployment.

## Constraints

Keep the exact readWithin signature and value shapes. Prove the committed production K6 edge disappears while unrelated findings remain identical. Preserve null read refusals and mounted controller/SQLite behavior.

## Capabilities

### New Capabilities

- `space-project-boundary`: Spaces read projects through a neutral application port.

### Modified Capabilities

None.

## Impact

Core project read values and dependency types only; application composition remains structural and unchanged. Existing domain terms apply; no ADR or design document is needed for this reversible extraction.
