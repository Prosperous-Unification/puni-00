## Context

The [code organization design](../../../docs/superpowers/specs/2026-09-19-code-organization-design.md) defines one taxonomy for frontend and backend services. [ADR 0029](../../../docs/adr/0029-services-have-a-kind-and-one-direction.md) records the strict dependency direction and its trade-offs.

## Goals / Non-Goals

**Goals:** Give each rule a fast local feedback path where possible and an authoritative whole-tree judgment.

**Non-Goals:** This change does not implement checks, classify files or move modules.

## Decisions

Fast lint checks imports visible inside one file. Twilight Bureaucrat's authoritative file-level import graph sees through barrels and aliases.

Each taxonomy rule's mode lives in the consumer's trusted policy: observe reports debt, ratchet refuses new, touched and adopted-set regressions while retaining other debt, and enforce refuses every violation in declared coverage. Inventory integrity remains enforced in every mode.

## Risks / Trade-offs

Fast lint and the graph can temporarily differ until the authoritative checks land. Review remains the stated check for K7 until a sound static check exists.

## Migration Plan

Classify existing services in observe mode, add checks with watched negatives, adopt modules under ratchet mode, then enforce declared coverage.

## Open Questions

Can a static check prove that every feature-service opens the transaction it must own?
