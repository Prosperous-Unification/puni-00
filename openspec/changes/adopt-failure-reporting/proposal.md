## Why

The workspace has several unrelated ways to turn a caught value into text and no shared reporting policy. The three published libraries now provide both reports, one shared occurrence identifier, one reusable redaction policy and one byte budget, so this repository should add only the decisions those libraries cannot make for it.

## What Changes

**Shared failure reporting**

- From: each boundary chooses its own report limits, sensitive names, redaction construction and response to reporting failure.
- To: one isomorphic shared library owns the report limits, sensitive key list, a redaction policy builder over caller-owned secrets and a wrapper that models reporting loss instead of throwing.
- Impact: architectural and contractual; application adoption remains a later task in this change.

## Non-Goals

No caller adopts the library in this change's first slice. This change defines no production exception kinds, introduces no DI Bag composition, makes no browser-execution claim, adds no telemetry endpoint, and changes no HTTP status, WebSocket frame or MCP envelope.

## Constraints

The module remains framework-free and isomorphic. Reporting loss is visible and never successful. Public and diagnostic reports share one occurrence identifier, limits and redaction policy, and every later safety check requires a watched production-path negative under R5.

## Capabilities

### New Capabilities

- `failure-reporting`: Shared limits, redaction rules and loss handling for diagnostic and public failure reports.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

A new `shared-failures` Nx library and `@shared/failures` alias will become the reporting contract available to every product and tool. Later work will adopt it at observability, backend and MCP boundaries.
