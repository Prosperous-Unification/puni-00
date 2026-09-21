## Why

The backend core keeps about fifty service files in one directory. Nothing declares what a service
needs or seals what it hides, and a DI failure names an anonymous binding. The accepted code
organization design answers this with one sealed DI Bag module per responsibility, and the reviewed
040.6 map settles which file each owns. DI Bag 0.4.0 is installed and startup uses it, so only the
composition shape is left.

## What Changes

**Sealed module composition**

- From: `compose.ts` builds every service by hand, and services import siblings for shared rules.
- To: each 040.6 responsibility is one sealed module with a README, a contract, a labelled
  `module.ts` and a composition check; sideways rules move to the domain library or a neutral event
  port; `@wbs/core` keeps every export.
- Impact: architectural; no wire or table change.

## Non-Goals

No library version bump, no frontend lifetimes, no gateway or MCP composition, and no invented
capability for the CRUD delivery reaches directly.

## Constraints

Rules R1 to R5 govern. `bootBe01` keeps owning source, retention, optimizer and listener disposal in
its tested order; modules borrow them without a second disposer. `servicesOver` stays per-admission:
no singleton may leak staged stores or announcements between transactions. Every changed check ships
a watched negative.

## Capabilities

### New Capabilities

- `di-composition`: how a responsibility is sealed, what it may require, and what a composition root
  sees.

### Modified Capabilities

None. Plan history, Plan commands and Saved plans keep `wbs-domain`; Plan import keeps `plan-import`.

## Domain Terms

None new; the map's nine resource terms are in `CONTEXT.md`.

## Module identifiers

A library module is named ring then name, as `module.application.plan-history` is. A module under an
app carries the runtime word by location: `module.backend.<name>`, `module.frontend.<name>`,
`module.gateway.<name>`, `module.mcp.<name>`. Optimization, the Local solver launcher and the
Supervisor are backend modules, so `module.backend.*`. A label drops only the `module.` prefix. The
nine existing identifiers are untouched.

## Decisions Recorded

- Full K2 closure stays outside this change: CRUD delivery for the seven resources lacks feature
  owners, and none is invented here.
- K3 debt is preserved, not fixed: a feature-service reading a repository port keeps doing so,
  declared rather than implicit. Task 7.4 records it.
- Wiki registration is separate: `policy.json` needs a boundary per identifier, and
  `pilot-policy.test.ts` pins the mapping length and identifiers.

## Impact

`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src` and `kinds.json`. `apps/wbs/be-01`
changes only where a shim path moves.
