## MODIFIED Requirements

### Requirement: One switch draws every mark the chart holds back

The panel SHALL show one labelled switch, `Detail`, that draws **every** mark
the chart holds back and takes them all away again: the dependency arrows —
elbows and heads both — and a parent row's summary bracket. An unestimated
slice's assumed bar SHALL be drawn in both states (since 2026-09-11). There SHALL be no second
control and no per-family answer: one press is the whole of the reader's say
over what the chart draws.

With nothing remembered, the switch SHALL open **on** for a plan whose first read
brings dependency links and **off** for a plan whose first read brings none. The
default SHALL wait for that first read rather than be taken from the empty chart
drawn before it, and SHALL then hold for that plan: a first link added later in
the session SHALL NOT turn it on. A remembered answer SHALL win over the default
and SHALL NOT wait for the read. When the project changes, the default SHALL be
decided again from the next plan's first read. With the switch off the chart
SHALL hold no `data-gantt-arrow`, no `data-gantt-arrow-head` and no
`data-gantt-bracket` mark.

Pressed on, the chart SHALL draw both families as it drew them
before `gantt-declutter`, and the marks that follow from them SHALL follow: a
hand-off line whose far end is an assumed bar, and a not-before caret on every
row holding a start date, parents and uncosted leaves among them.

The answer SHALL be remembered by the browser under `wbs.ganttDetail` and SHALL
survive a reload, a project switch and a remount of the panel. It is one
preference for this browser, not one per project, and be-01 SHALL never be told
about it. A stored answer that is not a boolean SHALL be dropped — the key
removed and the switch left off — rather than read as anything.

`wbs.ganttArrows`, the key the arrows-only switch wrote, SHALL be removed from
storage when the panel is opened and SHALL NOT be read as an answer. It answered
a narrower question, and a stored `true` carried across would draw two families
of mark nobody asked for.

Person links between two drawn bars, ticks on costed zero-day slices, the bars
of costed work, the row labels and the axis SHALL be untouched by the switch.

This supersedes, **by name**, `gantt-declutter`'s requirement "The arrows are
off until they are asked for" — replaced in full above — and the clauses of its
"Leaves draw bars for the work somebody costed, and nothing else does" that made
the two removals unconditional. Confirmed by Dany, 2026-08-12: "what i wanted is
for arrows toggle to also affect Unestimated QA ghost bars and Parent
transparent bars. i want to encompass all decluttering into one button."

#### Scenario: A plan with links opens with the detail

- **GIVEN** nothing remembered under `wbs.ganttDetail`
- **WHEN** the chart is opened on a plan with stored dependencies, even before
  the plan's first read has landed
- **THEN** once the read lands the switch reads `aria-pressed="true"` and every
  stored dependency's elbow and head is drawn

#### Scenario: The chart opens with none of the three

- **GIVEN** nothing remembered under `wbs.ganttDetail`
- **WHEN** the chart is opened on a plan with a parent row and no dependency
- **THEN** the switch reads `aria-pressed="false"`, no `data-gantt-arrow`,
  `data-gantt-arrow-head` or `data-gantt-bracket` mark is in the document, and
  every costed bar, every on-bar label and every row label is drawn

#### Scenario: A first link added later does not flip the default

- **GIVEN** nothing remembered and a chart opened on a plan without links
- **WHEN** a dependency is added in the same session
- **THEN** the switch stays off

#### Scenario: A remembered answer wins

- **GIVEN** `wbs.ganttDetail` holding `false`
- **WHEN** the chart is opened on a plan with stored dependencies, or the
  project changes to one
- **THEN** the switch reads `aria-pressed="false"` and no arrow is drawn

#### Scenario: The default is decided again for the next project

- **GIVEN** nothing remembered and the chart open on a plan without links
- **WHEN** the reader chooses a project whose plan has links and opens its chart
- **THEN** the switch reads `aria-pressed="true"`; and choosing the plan without
  links again opens it with the switch off, and nothing is remembered

#### Scenario: Asking for the detail

- **WHEN** the switch is pressed
- **THEN** every stored dependency's elbow and head and every parent's bracket
  is drawn, and pressing it again takes them away; every unestimated slice's
  assumed bar is drawn in both states

#### Scenario: The answer outlives the page

- **WHEN** the switch is pressed on and the page is reloaded
- **THEN** the chart opens with the arrows and the brackets drawn, and
  `aria-pressed` reads `true`

#### Scenario: A stored answer that is not one

- **GIVEN** `wbs.ganttDetail` holding text that is not a boolean
- **WHEN** the chart is opened
- **THEN** the detail is off and the key is gone

#### Scenario: The key the old switch wrote

- **GIVEN** `wbs.ganttArrows` holding `true` and no `wbs.ganttDetail` at all
- **WHEN** the chart is opened
- **THEN** the switch takes the never-said default, `wbs.ganttArrows` is not
  read as an answer, and it is gone from storage
