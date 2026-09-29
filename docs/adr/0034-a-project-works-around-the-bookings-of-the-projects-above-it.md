# A project works around the bookings of the projects above it

**Status:** accepted, 2026-09-29 (WBS 010.4.16). Change: `openspec/changes/share-people-across-projects`.

A person is one human across every project of an organization, but each project's scheduler
used to see only its own work. Once an organization switches to **shared people**, project P's
schedule becomes a pure function of P's own input and the **bookings** of the projects that
outrank it in the organization's **project rank**. Those bookings reach P's scheduler as
**elsewhere** intervals, which P's people cannot be placed across in Fast or in CP-SAT. An
edit below P never moves P.

Bookings are derived on read from each project's displayed engine and are never stored.
Switching back to `isolated` therefore restores today's dates exactly. Team pools stay per
project: only people are shared. Rank is an organization act that admins edit through routes,
with no journal.

This is hard to reverse. Once planners rely on "higher projects keep their dates", any other
precedence would reshuffle plans that people have committed to. The chain also fixes the
cache, notification and wire shapes: `elsewhere` enters the schedule-input hash, and
`elsewhere_changed` fans out down the rank.

## Considered Options

- **Space order as precedence.** Rejected: a project sits in many spaces and a space owns
  nothing (ADR 0033), so it cannot decide whose dates move.
- **First come, first served, from edit history.** Rejected: the order could not be recovered
  from stored state. "Why did my dates move?" would have no answer, and undo would break it.
- **One joint organization-wide solve.** Rejected: one edit would reshuffle every project, and a
  Fast read would cost the whole organization. The generation, slot, queue and cache keys are
  all per project. Cross-project item priority is the same solve in disguise.
- **Person-to-project allocations (percentages).** Rejected: a second model of the assignment
  fact that the directory already holds.
- **Dummy zero-weight slices in the solver for foreign load.** Rejected: they leak into the
  makespan, priority and movement objectives. Fixed intervals in the person's no-overlap set
  do not.
