# Backend MCP test document preparation

## Problem

On this feature branch, backend tests spawn the real MCP server under the artifact-only startup contract; its ignored source OpenAPI artifact is absent after checkout. Fresh main retains in-memory document generation, so this producer requirement is feature-specific and is not a main defect. Backend test targets declare no producer prerequisite. New spawned MCP and Dash production inputs also need explicit cache and affected-selection accounting rather than accidental workspace preparation.

## Outcome

Declare a backend-local noncached pure document producer before full, unit and store tests. Bind the finite actual spawned runtime closure and existing shared document descriptors to consuming test inputs, and update legitimate Burokrat facts. Preserve cache policy, ordinary test selection, identity assertions and all deadlines.

## Non-goals

No application startup or DB generation in preparation, MCP helper rewrite, cross-project BE-to-MCP edge, broad source globs, ignored generated JSON inputs, source readiness behavior, full backend qualification or hosted capacity claim.
