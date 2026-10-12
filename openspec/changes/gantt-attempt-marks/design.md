# design — `gantt-attempt-marks`

The stage-one presentation extends `sub-day-gantt-axis/design.md`. These rulings keep
attempt evidence independent of forecast dates until `agent-calendar-instant-axis` replaces
the working-window projection. No engine or stored timestamp changes belong here.

## D1 — Eligible nodes and completed rows

An eligible node belongs to a visible scheduled leaf and has a planned slice. Collapsed,
filtered-out and held rows draw no attempt overlay. The same eligible set feeds geometry
and the additional attempt count; do not count attempts from the full unfiltered tree.

At sub-day rungs, completed leaves retain each planned step slice and draw attempts above
it. Bypass the done-row coalescing branch there, retaining the forecast's elapsed duration
and calendar placement. Day rungs keep the existing single done bar and draw no attempts.
Keep attempt paint and hit geometry separate from forecast geometry and dependency anchors.

`plan-chart-input.ts` carries node identity, attempts and project timezone into the chart.
Missing trusted references remain invariant failures, distinct from an excluded row.

## D2 — Availability and the clock

Represent overlay availability explicitly: available with project start and zone, or
unavailable with the missing fields. A null project start and an absent legacy timezone
are modeled absences. Render `Attempt marks unavailable: set a project start date`,
`Attempt marks unavailable: project timezone is unavailable`, or both reasons when both
are absent. Keep the forecast visible. Do not substitute today, UTC or the browser zone.
A malformed supplied start, zone or instant is an invariant failure, not this unavailable
state. Day rungs need no overlay availability message because they never offer marks.

Take one `now` clock reading per panel render and pass it to geometry. Use that same value
for every running attempt. New render inputs, including availability, rung, attempts and
`now`, participate in relevant memoization. This packet does not introduce a refresh timer.

When unavailable, the additional attempt count is zero because no attempt marks would be
drawn. The ordinary forecast mark count and its sub-day offer rule still apply.

## D3 — One mark in the start day's working window

Reuse `STAGE_ONE_DAY_START_MINUTE = 540` from the axis foundation; do not introduce another
09:00 constant. The start day's window ends at minute 1020 (17:00). Obtain the start date and
clock position in the project zone. Project its start into that day's window by clamping
to [09:00, 17:00]. If the end (or supplied `now`) falls on the same local date, clamp its
clock position to that window; if it falls on a later local date, use the start day's 17:00
edge. There is exactly one mark per attempt, never a continuation on the following day.

Set `data-clamped` when either endpoint changed or a later local date was capped. Wholly
early or late attempts collapse to an edge and remain selectable through the sub-day tick
and hit-surface rules. Apply the same rule to running attempts and keep their open right
edge at the capped position. The card always formats original instants, including both
dates across midnight; a running card still says `now`. The clamp does not rewrite facts.

Examples: 08:00–10:00 draws 09:00–10:00; 07:00–08:00 draws a tick at 09:00;
18:00–19:00 draws a tick at 17:00; 16:30–02:10 and 16:30–two days later 10:00 both draw
16:30–17:00 on the start date. A running 16:30 attempt with `now` on the next date does too.

## D4 — Display range and placement

The schedule origin remains the project's first working day, as in the existing calendar
scale. Project an attempt's local date by calendar-day distance from that origin, including
negative distances and weekends; do not pass an instant through workday-offset placement.
Its clock fraction is the clamped minutes since 09:00 divided by 480.

At a sub-day rung with an available overlay, display the union of the existing forecast
range and the complete local start-day cells of eligible attempts. The left edge may precede
the schedule origin and the right edge may follow its horizon. Translate the displayed
coordinate system consistently for the grid, forecasts, attempts, hit surfaces and other
chart marks; do not mutate schedule offsets, dates or dependency endpoints to make room.
Retain ordinary paint/hit padding at the new edges, including a tick at 17:00. The clamped
end does not extend the range to later dates. A filter change recomputes this union.
Day-rung bounds remain unchanged. SVG export uses the same sub-day range and mark paint.

## D5 — Card ownership and proof oracles

`gantt-detail.ts` currently owns the detail toggle, not bar cards. Implement the attempt card
in `gantt-panel.tsx` or a component extracted from it, with tests at that real rendering
boundary. Keep the existing collision mechanism for forecast marks and attempts together.

Assert both semantic attributes and paint: succeeded is solid, failed resolves to a hatch
pattern, cancelled resolves to a dot pattern, and running has an open right edge. For the
style mutation proof, leave `data-attempt` unchanged and swap the actual hatch/dot pattern
mapping or definitions. The test must fail on paint; matching outcome attributes alone
cannot observe this fault. Include a browser fixture exercising all four styles.

## D6 — Benchmark scope

The production offer limit remains 2,500 forecast-plus-attempt marks. Follow
`sub-day-gantt-axis/design.md` D4 for measurement: the 500×5 fixture is exactly at the limit
only when it has no attempts. Measure a capped attempt fixture within that limit as well.
An oversized renderer measurement uses a dedicated benchmark entry, never a production
prop, URL switch or changed limit. Record renderer-only measurements separately from the
user-reachable panel and its refusal behavior. No wall-clock assertion belongs in CI.
