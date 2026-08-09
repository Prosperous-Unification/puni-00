## ADDED Requirements

### Requirement: A bar's facts are its own slice's

Every fact a bar shows SHALL describe the slice the bar draws, not the work
item the row holds. Its dates SHALL be derived from the bar's own start and
finish offsets — never from the work item's `startsOn`/`endsOn`, which span
every role's slice at once — and its duration SHALL be the one the bar already
draws, an unestimated slice still saying it is drawn rather than scheduled. Its
person SHALL come from the same atomic chart payload the slices came from, never
from a separately fetched directory.

The two dates SHALL be **workday arithmetic on those offsets and not the
calendar scale's coordinates**: the start is `addWorkdays(origin, ⌊start⌋)` and
the finish `addWorkdays(origin, lastWorkdayOf(start, finish))` — the `ceil − 1`
rule the row's End cell already follows. `gantt-calendar-axis` gives the chart a
scale that answers **where a mark is drawn**, and a coordinate is not an index
into working days: for a slice running 3 → 5 the end reading is 5, five calendar
days after a Monday origin is the Saturday, and `addWorkdays(origin, 5)` is the
Monday after it — while the slice finished on the Friday, which only the workday
reading names.

Both dates SHALL be printed by `compact-columns`' `shortIsoDate` — not
`shortInstant`, which formats an epoch in the browser's zone, and not a `new
Date(iso)` of its own, whose parse moves the day by one in half the world's
zones.

A bar SHALL additionally carry the service team its work item is labelled with,
the estimate trio held for **that bar's own role**, and the work items its row
waits for, each named `<number> <name>` as the plan names it.

Dependency labels SHALL be resolved from every work item in the tree, not from
the rows on screen: a collapsed branch and a search both hide rows a
dependency may point at, and a predecessor hidden that way SHALL still be named
in full.

Absences SHALL render as named states, never as blanks or omitted lines: a
slice belonging to no role, a slice nobody is assigned, a role with no
estimate, and a work item carrying no team each SHALL say so in words. A team
id the directory read does not hold SHALL render as a named unresolved state
rather than an empty label or a throw — the two reads are of different moments
and a stale label is a modeled condition, not a broken payload.

#### Scenario: two roles on one leaf show different dates

- **GIVEN** a leaf whose Dev slice runs workdays 0→3 and whose QA slice runs
  3→5, on a project starting Monday 2026-08-10
- **WHEN** each bar's facts are read
- **THEN** the Dev bar says 10 Aug → 12 Aug and the QA bar says 13 Aug → 14
  Aug, and neither says the work item's whole 10 Aug → 14 Aug span

#### Scenario: a coordinate is not a date

- **GIVEN** that same QA slice, 3 → 5, whose bar is drawn to calendar day 5
- **WHEN** its facts are read
- **THEN** the finish is Friday 14 Aug — neither Saturday 15 Aug, the calendar
  day its right edge stands on, nor Monday 17 Aug, the fifth working day after
  the origin

#### Scenario: the trio is the bar's role's

- **GIVEN** a leaf estimated Dev `2/3/8` and QA `1/1/1`
- **WHEN** the QA bar's facts are read
- **THEN** they carry `1/1/1` and never `2/3/8`

#### Scenario: a predecessor a search narrowed away

- **GIVEN** `3.2 API` depends on `3.1 Design`, and a search leaves only the
  dependent row on screen
- **WHEN** the `3.2 API` bar's facts are read
- **THEN** they name `after 3.1 Design`

#### Scenario: a predecessor inside a collapsed branch

- **GIVEN** a dependency on a work item whose branch is collapsed
- **WHEN** the dependent bar's facts are read
- **THEN** the predecessor is still named by number and name

#### Scenario: nothing is blank

- **GIVEN** a project holding no roles, a slice nobody is assigned, a leaf with
  no estimate for its role, and a work item with no team
- **WHEN** each bar's facts are read
- **THEN** each says so in words — no role, unassigned, not estimated, no team
  — and no line is missing

#### Scenario: a team the directory read does not hold

- **GIVEN** a work item labelled with a team created after the client's last
  directory read
- **WHEN** its bar's facts are read
- **THEN** the team line names the unresolved state and the panel still draws

### Requirement: One hover surface serves the Name cell and the bar

The hover preview `name-title-body` introduced for the Name cell SHALL be
generalized into one positioned surface that both the Name cell and a Gantt bar
render, so a reader meets one surface in both drawings of the plan.

A bar's surface SHALL carry, in order: a heading of the words the row's own
label carries — `rowWords`' `<number> - <name>`, with `(unnamed)` for an empty
name, so "Row labels hold the left edge" keeps holding that a bar's hover text
opens on the same line as its label — the role and person as `Role · Person`,
the service team, the dates and duration, the estimate trio as `o/r/p`, the
float in `barWords`' own words (`Float 2 days`, or
`On the critical path — no float` for a slice with none), the binding-floor
sentence, and what the row waits for, written as `after 3.1 Design, 3.2 API`. A
row waiting for nothing SHALL omit that line.

The Name cell's surface SHALL keep rendering the work item's notes as markdown,
and a bar's surface SHALL NOT render notes at all.

#### Scenario: the whole surface on a bar

- **GIVEN** `3.2 API` waiting on `3.1 Design`, Dev, Kat, team Platform,
  estimated `2/3/8`, with two days of float
- **WHEN** its bar's surface is shown
- **THEN** it reads `3.2 - API`, then `Dev · Kat`, then Platform, then the
  dates and duration, then `2/3/8`, then `Float 2 days`, then the floor
  sentence, then `after 3.1 Design`

#### Scenario: a bar on the critical path

- **GIVEN** a slice with no float
- **WHEN** its surface is shown
- **THEN** it reads `On the critical path — no float` and states no float
  figure

#### Scenario: no notes on a bar

- **GIVEN** a work item whose notes are three paragraphs
- **WHEN** its bar's surface is shown
- **THEN** the notes are absent from it, and the same work item's Name cell
  surface still renders them

#### Scenario: an unnamed row

- **GIVEN** a work item with an empty name
- **WHEN** its bar's surface is shown
- **THEN** the heading reads `<number> - (unnamed)`, exactly what the row's
  label reads

### Requirement: A bar is named and operable without a mouse

Each bar SHALL be reachable by the keyboard and SHALL carry an `aria-label`
stating the same facts its surface shows, so that removing the native tooltip
does not remove the bar's accessible name. Focusing a bar SHALL show its
surface, and blurring it SHALL dismiss it.

Enter and Space on a focused bar SHALL take the plan to that bar's row, exactly
as clicking it does, and SHALL prevent the browser's own default for that key —
a Space that scrolls the panel out from under the reader is the same fault the
actions menu shipped.

Once the surface and the label are in place, a bar SHALL NOT carry a native
`<title>` child: two tooltips on one mark is a bug, and the browser's is the
one nothing can position or style.

#### Scenario: the accessible name survives

- **WHEN** a bar is rendered
- **THEN** it has an `aria-label` naming its work item, role, person, dates and
  floor, and no `<title>` element exists anywhere in the chart's bars

#### Scenario: tabbing to a bar shows its surface

- **WHEN** the keyboard moves focus onto a bar
- **THEN** that bar's surface is shown, and moving focus off dismisses it

#### Scenario: Space picks the row and does not scroll

- **WHEN** Space is pressed on a focused bar
- **THEN** the row's name cell is focused and scrolled into view, and the
  panel's own scroll position is unchanged

### Requirement: The hover surface opens, moves and dismisses predictably

The surface SHALL be rendered in a layer positioned against the anchor's
viewport rectangle rather than inside the chart's scrolled, non-uniformly
scaled user space. It SHALL flip above its anchor when there is not room below,
and SHALL be clamped horizontally so that its **own rectangle** stays within the
viewport: left at or past 0, right at or before `innerWidth`. The layer is
fixed, so an unclamped surface hanging off the right edge widens neither the
page nor the panel and no scroll width can witness it — the measured rectangle
is the only thing that can, and it is what the clamp is asserted by.

Opening SHALL wait a short delay that a pointer leaving before it elapses
cancels, so crossing a chart opens nothing. Scrolling the panel SHALL dismiss
the surface — the anchor moves under a layer that is not in its scroll box, and
a stale surface pointing at the wrong bar is worse than none. At most one
surface SHALL be open at a time, whichever mark it belongs to.

The surface SHALL close when its anchor goes away: a row collapsed or narrowed
off, or the panel being hidden. It SHALL also close when the chart read it was
opened over is replaced, **whether or not the anchor survives**: closure SHALL
be keyed on the identity of that read — a generation the chart carries — because
a slice keeping its id across a refetch keeps its `<rect>` too, React reuses the
node, and an unmount cleanup then never runs while the facts under the surface
have changed.

On touch, a tap SHALL take the plan to the row as it does today, and SHALL NOT
open a surface.

#### Scenario: flipped near the bottom

- **WHEN** a bar within one surface height of the viewport's bottom is hovered
- **THEN** the surface is drawn above the bar and is fully within the viewport

#### Scenario: clamped near the right edge

- **GIVEN** a bar close enough to the viewport's right edge that a surface
  placed from that bar's left edge would end past `innerWidth`
- **WHEN** it is hovered
- **THEN** the surface's rectangle has a non-zero area, its left is at or past
  0, and its right is at or before `innerWidth`

#### Scenario: scrolling dismisses

- **GIVEN** a surface open on a bar
- **WHEN** the panel is scrolled
- **THEN** the surface is gone and no surface is left pointing at where the bar
  used to be

#### Scenario: crossing the chart opens nothing

- **WHEN** the pointer crosses several bars faster than the open delay
- **THEN** no surface is shown

#### Scenario: one at a time

- **GIVEN** a surface open on one bar
- **WHEN** another bar is hovered past the delay
- **THEN** the first surface is gone and only the second is shown

#### Scenario: the anchor is replaced by a refetch

- **GIVEN** a surface open on a bar
- **WHEN** a refetch lands and redraws the chart
- **THEN** the surface is closed rather than left over the new drawing

#### Scenario: a refetch the anchor survives

- **GIVEN** a surface open on a bar whose slice keeps its id across the refetch,
  so React reuses the same `<rect>` and nothing unmounts
- **WHEN** the refetched chart is drawn with different numbers
- **THEN** the surface is closed all the same

#### Scenario: a tap on a phone

- **WHEN** a bar is tapped on a touch screen
- **THEN** the plan takes the reader to that row and no surface is shown

## MODIFIED Requirements

<!--
The header below is the one this requirement carries **after**
`gantt-calendar-axis` archives, which is this change's own precondition: the
archive order is `gantt-view` → `gantt-calendar-axis` → `gantt-bar-hover`, and
neither of the first two renames it. The body is the complete text as it will
then stand, amended here — a MODIFIED block is applied by full-text
replacement, so everything below survives and nothing else does.
-->

### Requirement: A bar explains itself and finds its row

Hovering **or focusing** a bar SHALL name its slice's binding floor in words —
for a person floor, naming the person and the slice they were finishing — and
SHALL show those words in the hover surface of "One hover surface serves the
Name cell and the bar", with the same sentence on the bar's `aria-label`, as "A
bar is named and operable without a mouse" requires — never in the native
`<title>` that same requirement takes off the bars.

The not-before caret keeps its own `<title>`. It is the one mark on this chart
with no surface of its own, its words are a single stored date rather than a
slice's facts, and removing it would take a mark's only text away to fix a
problem it does not have.

Clicking a bar or its row label SHALL take the plan to that row: the row's name
cell is scrolled into view and focused, under either renderer. Rows with a
manual start SHALL carry a not-before flag at that date's **calendar** position
— the start reading of the date's workday offset — so the caret stands on the
day the row cannot begin before and not on some earlier one the weekends have
swallowed. The words the caret shows on hover SHALL stay the stored date itself.

The **dates a bar says in words** SHALL stay date arithmetic on the engine's
workday numbers and SHALL NOT be read off a calendar coordinate: the start is
`addWorkdays(origin, ⌊start⌋)` and the finish `addWorkdays(origin,
lastWorkdayOf(start, finish))` — the same two dates the row's Start and End
cells print, printed by `shortIsoDate` as "A bar's facts are its own slice's"
requires. A coordinate is a position on the canvas, not an index into the
working days: for a slice running 3 → 5 the end reading is 5 because that is
where the Friday's bar stops, and the fifth calendar day after a Monday origin
is a Saturday nobody worked, while `addWorkdays(origin, 5)` is the Monday after
it.

#### Scenario: the reason is on the bar

- **WHEN** `Sand`'s slice is floored by Kat finishing `Strip`
- **THEN** its bar's surface names Kat and `Strip`, its `aria-label` says the
  same, and the bar holds no `<title>`

#### Scenario: the words arrive on focus too

- **WHEN** the keyboard moves focus onto `Sand`'s bar
- **THEN** the floor sentence is on screen without a pointer having touched the
  chart

#### Scenario: click lands on the row

- **WHEN** a bar of row `Sand` is clicked
- **THEN** `Sand`'s name cell is focused and scrolled into view

#### Scenario: a manual date is marked

- **WHEN** the plan starts Monday 2026-08-10 and a row holds
  start-no-earlier-than at workday 5
- **THEN** its row carries a not-before flag at x = 7, on the same day as the
  bar that starts there, and the flag's words name Monday 2026-08-17 in its own
  `<title>`

#### Scenario: a coordinate is not a date

- **WHEN** the plan starts Monday 2026-08-10 and a slice runs workday 3 → 5
- **THEN** its words name Thursday 2026-08-13 and Friday 2026-08-14 — exactly
  the row's Start and End cells — and name neither Saturday 2026-08-15, which
  its end coordinate of 5 stands on, nor Monday 2026-08-17, which
  `addWorkdays(origin, 5)` gives
