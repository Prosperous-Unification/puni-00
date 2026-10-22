## Why

WBS estimates one thing in three points, time, and records tokens and hours as single
numbers from a closed list. Clients buy outcomes priced in money, agents spend tokens and
minutes, and a budget is prose. The merge-pricing ledger (PR #656) has nowhere to write;
the coordinator's caps have nothing to read. Dany's direction of
2026-10-22: budget is an extensible entity, every measure has a three-point estimate and a
fact, the table shows time by default, more measures will come.

## What Changes

**Measures become definitions**

- From: three fixed metrics; days held apart.
- To: an organization-scoped definition with key, unit, kind, scale and flags; five seeded;
  a new measure is a directory command. Non-breaking; facts migrate.

**Three points for every measure**

- From: a trio for time only; one number for tokens.
- To: a trio per step node and measure, folded by the PERT weights into an expected value
  with variance against the fact; the time trio stays the solver's only input.

**Budgets are rows**

- From: caps in prose, a binding file, or nowhere.
- To: a budget per work item and measure, strict or advisory, stated or derived, bounding
  subtrees; a read the coordinator refuses on.

**Columns follow the definition**

- From: fixed columns.
- To: estimate, fact and variance per measure, shown by default only where the definition
  says so; per-user toggles; export carries it.

## Non-Goals

- Any schedule change; a property test proves it.
- Unit conversion or pricing inside WBS; figures carry their rate card digest.
- Definition of Ready and Done; those stay in the agentic workflows project.
- Refusing a fact past a budget; admission is the coordinator's.

## Constraints

- Additive migrations with guarded `down.sql`; blue and green share one SQLite file.
- Plan commands: all-or-none, one journal entry, exact undo.
- One scheduling measure per organization; the solver reads nothing else.
- Every refusal ships with a production-path negative and a `Proof:` comment (R5).

## Capabilities

### New Capabilities

- `measure-budgets`: definitions, estimates and facts per measure, budgets, reads, columns,
  export.

### Modified Capabilities

- none

## Domain Terms

Added: Measure definition, Scheduling measure, Measure estimate, Expected measure, Measure
variance, Budget. Modified: Metric, Token estimate.

## Decisions Recorded

none; D1 to D8 in design.md await Dany's confirmation by id.

## Impact

`libs/wbs/*`, `@wbs/contracts`, be-01 routes and MCP tools, fe-01 table and panel, export
version. Consumers: S7a.06 in the agentic workflows project, the Dash ledger.
