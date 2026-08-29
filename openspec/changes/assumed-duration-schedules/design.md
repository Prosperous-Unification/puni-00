# design — `assumed-duration-schedules`

## D1 — one constant, in `libs/domain`

`gantt-geometry.ts` holds the two-workday figure today. The engine needs the
same number, and a second copy in `schedule.ts` is two rules that agree until
one is edited — which is `AGENTS.md`'s stated reason for `priorityBandStyleOf`
being one function rather than four renderers' opinions.

`ASSUMED_SLICE_WORKDAYS = 2` moves to `libs/domain`, with the JSDoc that says
what it is _for_: an unestimated slice is work of unknown length, and unknown
length is not zero. Both readers import it. The negative that makes the sharing
real: the constant changed to 3 in one place, watched moving **both** a
scheduled date and a drawn bar width in the same run.

## D2 — assumed is not estimated, and the two must not converge

This is the whole risk of the change. Six things ask "is this estimated?" — the
Days column, the roll-up, the readiness badge and its walk to the next gap, the
export, the filter's `estimatedStepIds` facet, and (after
`dep-reach-whole-item`) the `anchor-slice` reach's "first estimated slice".

None of them may start answering yes. The predicate they use reads the
**estimate rows**, and this change writes none — so the correct implementation
touches none of those six call sites at all. Slice 2 asserts that: each of the
six is tested against an unestimated item after the change and must answer
exactly as before.

The specific trap worth naming: `anchor-slice`'s "first estimated slice in step
order" must not become "first slice", which under assumed durations every item
now has. A reach that quietly changed meaning because durations stopped being
zero is the kind of fault that shows up as a plan being subtly wrong for weeks.

## D3 — the assumption reaches capacity and leveling, on purpose

An unestimated slice with an assignee now occupies that person for two days, and
a team's pool for two days' worth of a slot.

The alternative — a duration the dependency graph sees but the resource model
does not — was considered and rejected. It produces a schedule where two
unestimated slices assigned to one person overlap perfectly and the chart shows
one person doing two things at once, which is precisely the state
`AGENTS.md`'s **Resource leveling** says is "always on". A number that is real
for one constraint and imaginary for another is worse than either.

The consequence is visible and should be: adding an unestimated work item to a
loaded team now moves dates. That is the point.

## D4 — an item of no estimated steps is no longer an item of no days

`CONTEXT.md`'s **Anchor slice** currently ends "where nothing is estimated the
anchor is the work item's finish, which for a work item of no days is its own
start". After this change a work item with no estimates has _n_ steps × 2
workdays, so its finish is no longer its start.

That sentence is reworded, and the case is tested under both reaches: an entirely
unestimated predecessor now genuinely delays its successor. It is the clearest
single demonstration of the change and is the headline test.

## D5 — `Assumed span` becomes a drawing that reports rather than invents

The term's current body says the assumption is "a property of the drawing and
never of the schedule: the engine's numbers, the date columns and the arrows
between rows do not know about it". Every clause of that is now false.

Reworded to: the bar's width is the schedule's assumed duration, and what the
bar adds is only the _saying_ — the dotted outline and the `?` that mark it as a
guess. Two terms after this change:

- **Assumed duration** — two workdays, the schedule's stand-in for an
  unestimated slice.
- **Assumed span** — how a slice on its assumed duration is _painted_.

## D6 — identity is expected to move, everywhere something is unestimated

`schedule-identity.test.ts`'s oracle survives only for plans where every slice
is estimated. Every other fixture moves by design and is re-derived. The
verify table lists which and why, the way `dep-reach-whole-item`'s does — a
re-derived fixture with no stated reason is a fixture that was made to agree
with the code.
