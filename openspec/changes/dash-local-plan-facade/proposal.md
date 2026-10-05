## Why

Dash owns execution conceptually, but operators still enter individual tools
without a Dash boundary. Moving every runtime responsibility at once would mix
new entrypoints with live claim and publication recovery, making failures hard
to isolate. A non-mutating first capability establishes the boundary safely.

## What Changes

Introduce a local Dash CLI with one supported operation: prepare an enrollment
plan from supplied fleet and observation files using the existing fleet planner.
The output remains the fleet tool's exact plan contract. Invalid input refuses
before output, and this entrypoint cannot enroll a host or open admission state.

The coordinator adopts an in-repository facade and eventual cohesive local
authority relocation under standing delegation. This change is only the first
Sol-sized slice of WBS 080.19, not completion of the facade or authority move.
The combined design decisions and later dependencies are in design.md.

## Non-Goals

Apply, discovery, build/deploy dispatch, provisioning, retirement, network service,
arbitrary shell execution, credential transfer, live enrollment, authority
bootstrap/relocation, distributed leases, compatibility launcher, or deployment.

## Constraints

Delegate to the existing fleet production planning path, preserving schema,
digest, validation and exclusive output creation. No duplicate planner, broad
command forwarding, new persistence or trust selected by candidate input.
Repository generations, fleet/release leases and heavy locks stay distinct.

## Capabilities

### New Capabilities

- `dash-enrollment-plan`: local preparation of an existing fleet enrollment plan.

### Modified Capabilities

None.

## Domain Terms

Fleet operation plan — docs/twilight-structure/CONTEXT.md.

## Decisions Recorded

Existing [ADR 0021](../../../docs/adr/0021-shared-git-admission-authority.md)
remains controlling; no new hard-to-reverse decision is made by this first facade.

## Impact

New Dash CLI application and focused tests; existing tool-fleet planning is
reused. Burokrat runtime modules, authority store, fleet mutation and deploy
coordinator remain outside the implementation packet.
