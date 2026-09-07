# Define the personal phase's complete delivery loop

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: resolved

Assignee: Dany

Blocked by: none

## Question

How far must the personal phase take a software request, and can any part of the
delivery loop wait for the customer phase?

The initial recommendation stopped at development acceptance. Dany clarified
that the whole loop must include production. Detailed controls and quality
evidence are owned by
[Select the personal phase's delivery controls and quality evidence](04-personal-delivery-controls.md).

Sources: [requirements](../../../docs/twilight-structure/spec.md),
[product experience](../../../docs/twilight-structure/product-experience.md),
[existing milestone exits](../../../openspec/changes/twilight-control-plane/tasks.md#milestones-and-ordering).

## Answer

2026-09-07 — Dany confirmed: “it must be complete from request to dev to prod.”

The personal phase must support the entire software-delivery loop: request,
discovery, specification, planning, implementation, verification, development
deployment and acceptance, then production deployment. It can be imperfect and
need further work, but missing a leg of that loop cannot be deferred to the
customer phase. Delivery configurability and quality remain its priorities.

Production remains subject to the existing explicit human-command requirement
in TS-12; this decision establishes product scope. The required controls, quality
evidence and placement of implementation slices remain subsequent decisions.
In particular, the development and production capabilities currently grouped
under Task 13 must be represented in the personal-phase plan.
