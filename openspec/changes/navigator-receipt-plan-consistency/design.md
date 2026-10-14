## Context

Navigator and Burokrat share wire contracts. Burokrat already checks semantic consistency, while Navigator repeats only digest binding before building maps that silently collapse duplicate identifiers.

## Goals / Non-Goals

Expose one typed semantic checker and require it in receipt conversion. Intent and scope are in proposal.md. No new terms or ADR are needed.

## Decisions

Extract `checkPlanTaskConsistency(reference: PlanReferenceRecord, tasks: PlanTasks): PlanTaskConsistency` in the existing Burokrat contracts module and export it through the contracts index. Keep `validatePlanTasks(unknown, unknown)` as the strict decoding CLI wrapper. Navigator decodes at its existing file boundaries and calls the typed helper before constructing maps. Its separate receipt equality and membership checks continue to run. Remove its duplicate digest guard.

## Risks / Trade-offs

The shared checker changes Navigator's task digest diagnostic to Burokrat's existing wording. Both commands must retain production-path fault proofs; dispatcher negatives include re-digested documents so digest checks cannot mask missing semantic checks. One refusal also runs through the real subprocess entrypoint.

## Migration Plan

No persisted formats, dependencies or migrations change. Historical v6/schema1 and v7/schema1 remain supported alongside v8/schema2.

## Open Questions

None; this implements the approved architecture.
