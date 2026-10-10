## Why

WBS 010.4.16: a person works in several projects of one organization, but each project
schedules them as if it had them alone. Ana can be booked full-time in Platform and in
Billing on the same days, and nothing says so. Planners need to see that double booking now
and, once they choose, have lower-priority projects plan around the people higher ones use.

## What Changes

- A read-only **load** view: a person's bookings across every project the reader can open, and
  per-person weekly booked and overlapping workdays, computed from each project's displayed
  schedule. It changes no date.
- A **project rank**: an organization-level total order over projects, set by admins.
- An organization **shared people** mode. Under `shared`, a project's scheduler works around
  the bookings of higher-ranked projects that name the same people (the `elsewhere` floor), in
  Fast and in CP-SAT.
- Durable invalidation: booking, availability and topology changes tell affected lower projects
  to re-read, atomically with the originating write.
- fe-01: a load page, a booked/overlapping column in the directory, the `elsewhere` sentence,
  and a settings switch.

## Non-Goals

- Organization-level team pools; a pool stays a (project, team) number.
- Person-to-project allocations or percentages.
- A joint organization-wide solve, or item priority across projects.
- Storing bookings; they are always derived.
- Cross-project dependencies.

## Constraints

- Nothing moves a date until an organization is switched to `shared`; the switch route ships
  last.
- Blue/green: migrations additive with a guarded `down.sql`; an older colour must never serve
  a shared organization as isolated.
- A plan nothing outranks keeps its schedule-input hash.
- Unreadable and foreign projects are omitted from every read, never counted or named.
- `SCHEDULER_CONTRACT_VERSION` 14 → 15 and solver wire 2 → 3 happen in their own slices.

## Capabilities

### New Capabilities

- `person-load`: bookings, overlaps, the two load reads and their authorization.
- `project-rank`: rank storage, order and routes.
- `elsewhere-scheduling`: the `elsewhere` floor in both engines, hashing and the chain read.
- `shared-people-mode`: the mode, its guard, invalidation and the switch.

### Modified Capabilities

none

## Domain Terms

Booking, Load, Overlap, Project rank, Elsewhere, Shared people.

## Decisions Recorded

[ADR 0034: A project works around the bookings of the projects above it](../../../docs/adr/0034-a-project-works-around-the-bookings-of-the-projects-above-it.md).

## Impact

be-01, `@wbs/core`, `@wbs/domain`, contracts, both store adapters, solver-py, mcp-01, fe-01.
