## Why

WBS estimates only time in three points and records tokens and hours as single numbers from
a closed list. Clients buy outcomes priced in money; agents spend tokens and minutes; a
budget is prose. The merge-pricing ledger (PR #656) has nowhere to write and the
coordinator's caps nothing to read. Dany, 2026-10-22: budget is an extensible entity, every
measure has a three-point estimate and a fact, the table shows time by default.

## What Changes

**Measures become definitions**

- From: three fixed metrics; days held apart.
- To: an organization-scoped definition with key, unit, kind, scale and flags; five seeded;
  a new measure is a directory command. Non-breaking; facts migrate.

**Three points for every measure**

- From: a trio for time only.
- To: a trio per step node and measure, folded by the PERT weights into an expected value
  with variance against the fact; the time trio stays the solver's only input.

**Budgets are rows**

- From: caps in prose, a binding file, or nowhere.
- To: a budget per work item and measure, strict or advisory, stated or derived, bounding
  subtrees; a read the coordinator refuses on.

**Columns follow the definition**

- From: fixed columns.
- To: estimate, fact and variance per measure, time by default, toggles per browser;
  export carries it.

## Non-Goals

- Any schedule change (a property test proves it).
- Conversion or pricing inside WBS.
- Definition of Ready and Done (agentic workflows project).
- Refusing a fact past a budget; the coordinator refuses admission.

## Constraints

- Additive migrations with guarded `down.sql`; blue and green share one SQLite file.
- Plan commands: all-or-none, one journal entry, exact undo.
- One scheduling measure per organization; the solver reads nothing else.
- Every refusal has a production-path negative and `Proof:` (R5).

## Capabilities

### New Capabilities

- `measure-budgets`: definitions, estimates, facts, budgets, reads, columns, export.

### Modified Capabilities

- none

## Domain Terms

See CONTEXT.md: Measure definition, Scheduling measure, Measure estimate, Expected measure,
Measure variance, Budget, Budget factor, Spend hold, Headroom, Rate card digest.

## Decisions Recorded

none; design.md's D1 to D67 await Dany's confirmation by id.

## Impact

`libs/wbs/*`, contracts, be-01 routes, MCP tools, fe-01 table and panel; plan document version
11 and saved plan schema 9. Consumers: agentic workflows S7a.06, the Dash ledger. Navigator,
Burokrat and Dash read documents up to version 10 until they admit 11.
