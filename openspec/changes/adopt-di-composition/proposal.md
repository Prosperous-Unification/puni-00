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

No library version bump, no frontend lifetimes, no gateway or MCP composition, no invented
capability for the CRUD delivery reaches directly.

## Constraints

Rules R1 to R5 govern. `bootBe01` keeps owning source, retention, optimizer and listener disposal in
its tested order; modules borrow them, never a second disposer. `servicesOver` stays per-admission:
no singleton leaks staged stores or announcements between transactions. Every changed check ships a
watched negative.

## Capabilities

### New Capabilities

- `di-composition`: how a responsibility is sealed, what it may require, and what a composition root
  sees.

### Modified Capabilities

None. Plan history, Plan commands and Saved plans keep `wbs-domain`; Plan import keeps `plan-import`.

## Domain Terms

None new; the map's nine resource terms are in `CONTEXT.md`.

## Module identifiers

A library module is ring then name, as `module.application.plan-history` is. An app module carries
the runtime word by location: `module.backend.<name>`, `module.frontend.<name>`,
`module.gateway.<name>`, `module.mcp.<name>`. Optimization, the Local solver launcher and the
Supervisor are backend modules, so `module.backend.*`. A label drops only the `module.` prefix. The
nine existing identifiers are untouched.

## Decisions Recorded

- Full K2 closure stays outside this change: the seven resources' CRUD delivery lacks feature
  owners, none invented.
- K3 debt is preserved: a feature-service reading a repository port keeps doing so, declared not
  implicit; task 7.4 records it.
- Wiki registration is part of this change: task 7.5 tracks the index block and full pilot
  membership (mapping row and boundary, both required); task 7.6 checks label agreement.

## Impact

`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src`, `kinds.json` and
`docs/wiki-policy`. `apps/wbs/be-01` changes only where a shim path moves.
