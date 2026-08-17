## MODIFIED Requirements

### Requirement: The table narrows to what is being looked for

The table SHALL offer a Find box that narrows the rows on screen to the work
items whose name contains what was typed, case-insensitively, together with
every ancestor and every descendant of those work items. Any other row SHALL be
hidden. A work item whose own name matched SHALL be marked as such, and the
rows kept around it SHALL NOT be. While the box holds something, the expansion
the table renders SHALL open every kept row, so a match inside a branch the
reader had collapsed is on screen; the reader's own expansion SHALL NOT be
changed by it, and SHALL be back in force the moment the box is emptied. The
box SHALL be cleared by Escape and SHALL NOT be a cell of the table's keyboard
grid. The table SHALL say how many rows are shown out of how many the plan
holds, and SHALL show an empty table and a sentence naming the query when
nothing matches.

**The descendants SHALL come only while the typed name is the whole of what is
being asked.** The moment any facet is chosen beside it, the narrowing SHALL
become a question about each row on its own, and a matched row's subtree SHALL
NOT be kept for it. Every other rule above SHALL hold unchanged whatever is
being asked — the ancestors, the mark, the overlay, the count, and the empty
answer when nothing matches.

#### Scenario: a match deep in a closed branch

- **GIVEN** `010 Strip the walls` holding `010.1 Sockets`, which holds
  `010.1.1 Back boxes`, and `010.1` collapsed
- **WHEN** `back boxes` is typed into the Find box
- **THEN** `010`, `010.1` and `010.1.1` are on screen and every other row is
  gone, and only `010.1.1` is marked

#### Scenario: a matched parent brings its work with it

- **WHEN** `strip` is typed and `010 Strip the walls` has three work items
  beneath it
- **THEN** `010` and all three are on screen, and only `010` is marked

#### Scenario: a facet beside the name stops the subtree coming

- **GIVEN** `strip` typed, with `010 Strip the walls` and the three work items
  beneath it on screen
- **WHEN** a facet is chosen that only `010` answers
- **THEN** `010` alone is on screen, and the three beneath it are gone
- **AND** unchoosing the facet puts all four back

#### Scenario: nothing matches

- **WHEN** `plumbing` is typed and no work item is called that
- **THEN** no rows are shown, and the table says there are no matches for
  `plumbing` rather than showing every row

#### Scenario: the search is left

- **GIVEN** `010.1` collapsed by the reader and a search revealing a match
  inside it
- **WHEN** Escape is pressed in the Find box
- **THEN** the box is empty and `010.1` is collapsed again

#### Scenario: how much of the plan is on screen

- **WHEN** a search keeps three rows of a six-row plan
- **THEN** the table says `3 of 6 rows`

## ADDED Requirements

### Requirement: The plan narrows by what its work is, not only by its name

A client SHALL let a reader narrow the plan by any of six facts about a work
item besides its name: the team whose work it is, who is assigned on it, what
its priority band is called, which phases it carries an estimate for, whether
it is one of the leaves counted as unestimated, and whether its work is on the
critical path. It SHALL NOT offer a status: no such field exists in the model,
and one derived from having dates or being fully estimated would put a word on
screen the data does not support.

Where several values of one facet are chosen the plan SHALL keep the rows
carrying **any** of them. Where more than one facet is chosen, and against the
typed name beside them, a row SHALL be kept only when it answers **every** one.
A facet nothing is chosen from SHALL narrow nothing.

The team SHALL be the **effective**, inherited team, never the row's own stored
label: a leaf drawing its slots from an ancestor's pool is that team's work, and
a filter that hid it would hide the row whose dates that team's numbers moved.
Whether a row answers the assignee, phase and critical facets SHALL be a
question about the row and not about one of its slices — a row answers when
**any** of its work does, and every one of its bars SHALL then be drawn.

The facets SHALL offer the values this plan actually carries, together with any
value still chosen. A facet SHALL NOT offer a value no row on the plan carries
and nobody has chosen, since the only possible answer to it is an empty plan;
and it SHALL NOT stop offering a chosen value when the last row carrying it
leaves, since there would then be nothing on screen to unchoose.

Every surface that renders the rows the filter kept — the table, the chart and
the cards a small screen gets instead of the table — SHALL narrow together,
because they are the same list. What the reader is asked SHALL NOT be
remembered across a reload: the plan somebody opens is the whole plan.

#### Scenario: a facet keeps a match's ancestors and not its subtree

- **GIVEN** `010 Strip the walls`, with `010.1 Sockets` and `010.2 Skirting`
  beneath it, and one person assigned on `010` alone
- **WHEN** that person is chosen as the assignee
- **THEN** `010` is on screen and marked, and `010.1` and `010.2` are gone

#### Scenario: a row that inherits the chosen team is that team's work

- **GIVEN** `010` labelled with a team and `010.1` beneath it labelled with
  none, so it inherits
- **WHEN** that team is chosen
- **THEN** both `010` and `010.1` are on screen

#### Scenario: two facets narrow together

- **GIVEN** one row on the chosen team and a different row assigned to the
  chosen person
- **WHEN** both are chosen at once
- **THEN** no rows are shown, and the plan says so rather than showing either

#### Scenario: a row nobody has prioritised answers no band

- **GIVEN** a work item with no priority
- **WHEN** any priority band is chosen
- **THEN** that work item is not on screen

#### Scenario: the chart narrows with the table

- **WHEN** a facet keeps two rows of a six-row plan
- **THEN** the chart draws bars for those rows only

#### Scenario: a chosen value outlives the row that carried it

- **GIVEN** a team chosen, and one row on the plan carrying it
- **WHEN** that row is deleted
- **THEN** the team is still offered and still chosen

#### Scenario: the facets are empty on the next load

- **GIVEN** facets chosen and the plan narrowed by them
- **WHEN** the plan is opened again
- **THEN** every row is on screen and nothing is chosen

#### Scenario: unchoosing the facets leaves the typed name alone

- **GIVEN** a name typed and a facet chosen beside it
- **WHEN** the reader clears the facets
- **THEN** the typed name is still in the box and still narrowing the plan
