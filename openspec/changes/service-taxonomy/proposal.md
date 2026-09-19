## Why

Frontend and backend services follow different, mostly implicit organization rules. The backend core mixes distinct responsibilities in one flat directory, while frontend policy is trapped in React hooks and oversized files, making agent work expensive and boundaries difficult to verify.

## What Changes

**Service organization**

- From: service roles, dependency direction, module ownership and rollout policy are implicit.
- To: every service declares one of four kinds with one dependency direction, lives in one runtime-specific module, and is checked under explicit observe, ratchet or enforce policy.
- Impact: architectural; existing code is classified before measured refactoring moves it.

**Frontend structure**

- From: framework-free policy and state can live inside React delivery code.
- To: enforced boundaries keep services, stores and geometry framework-free, provide stable store contracts, isolate vendor UI imports and ratchet source-file size.
- Impact: architectural; no framework or state-library replacement is mandated.

## Non-Goals

No code is moved, classified or checked by this change. It adds no lint rule, policy file or test, and it does not alter the existing rings, ports, unit of work, HTTP contracts or WebSocket protocol.

## Constraints

Rules R1 to R5 govern. Every later enforced check requires a watched production-path negative. The taxonomy applies equally to frontend and backend, layering stays strict, and physical refactoring follows measured coupling rather than a rewrite by decree.

## Capabilities

### New Capabilities

- `service-taxonomy`: Architectural rules for service kinds, dependency direction, modules, frontend boundaries and rollout modes.

### Modified Capabilities

None.

## Domain Terms

`Service kind`, `Repository`, `Resource-service`, `Feature-service`, `Delivery`; amended `Adapter`.

## Decisions Recorded

[ADR 0029](../../../docs/adr/0029-services-have-a-kind-and-one-direction.md).

## Impact

Future WBS frontend and backend modules, the product lint policy, the temporary devsync checks, and Twilight Bureaucrat's policy and import graph.
