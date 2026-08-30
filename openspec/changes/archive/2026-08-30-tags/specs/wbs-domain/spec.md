## ADDED Requirements

### Requirement: A work item carries a set of tags, and a tag decides nothing

A work item SHALL carry a set of **tags** alongside its set of teams, and a tag
SHALL have no effect on any date. The two dimensions answer different questions —
a team says **who does the work** and the scheduler spends its capacity, a tag
says **what kind of thing this is** — and an item answers both at once.

A tag SHALL be a row in a global directory: a name, unique across the deployment,
with **no project**, no pool, no size and no membership. The scheduler SHALL NOT
read a tag: adding, changing or removing one SHALL move no start, no finish and no
floor anywhere in the plan. That absence SHALL be asserted rather than assumed,
and the assertion SHALL carry a control proving the plan's dates answer to a label
at all.

A tag SHALL NOT colour a bar. A work item's set SHALL be ordered stably, so two
reads of an unchanged plan answer the same list.

#### Scenario: a tag moves no date

- **GIVEN** a plan whose dates are decided by a sized team
- **WHEN** every work item is tagged, and the tags are then removed
- **THEN** every start, finish and floor in the plan is what it was

#### Scenario: the vocabulary is global

- **WHEN** a tag is created
- **THEN** it is available to every project in the deployment, and it belongs to
  none of them

#### Scenario: two names cannot collide

- **GIVEN** a tag named `regulatory`
- **WHEN** a second tag is created with that name
- **THEN** it is refused as taken, naming the tag that survives

### Requirement: Tags are inherited by override, per dimension, independently

A work item stating no tags SHALL read as its nearest ancestor's tags, and a work
item stating any tags SHALL read as exactly those — override, never union. Blank
SHALL mean inherit; there SHALL be no third "deliberately none" state, exactly as
there is none for teams.

The two dimensions SHALL inherit **independently**: a row stating tags and no
teams SHALL inherit its ancestor's teams and override its ancestor's tags, and the
mirror case SHALL hold. Inheritance SHALL be a reading computed over the tree,
never a write: nothing SHALL be stored denormalised, and every surface that shows
a tag SHALL show the **effective** reading rather than the row's own stored
labels. A parent chain that runs in a circle SHALL be refused with an error rather
than walked.

#### Scenario: an ancestor's whole set is inherited

- **GIVEN** a parent tagged `regulatory` and `tech-debt`, and an untagged child
- **THEN** the child reads as both tags, named from the parent

#### Scenario: the dimensions inherit independently

- **GIVEN** a parent labelled team `Platform` and tag `regulatory`
- **WHEN** a child states tag `tech-debt` and no team
- **THEN** the child reads as team `Platform`, inherited, and tag `tech-debt`
  alone

#### Scenario: a circular parent chain

- **WHEN** the effective tags are read over rows whose parent chain runs in a
  circle
- **THEN** the read throws rather than running forever

### Requirement: The tag directory can be created, renamed and removed

The deployment SHALL expose a global tag directory: listing and creating tags,
renaming a tag, and removing one. A rename onto a taken name SHALL be refused as
taken, carrying the name that survives.

Removing a tag SHALL be refused, by default, when any work item carries it, and
the refusal SHALL carry the **directory usage** — the affected projects and work
items by name, each with a `label_removed` effect. That usage SHALL NOT carry a
`capacity_released` effect and SHALL NOT name any date change, because a tag
releases no capacity and moves no date. It SHALL NOT name the work items that
merely **inherit** the tag: an inherited pool moves a row's dates and an inherited
tag moves nothing, so naming them would pad a confirmation with rows nothing
happens to.

A second request carrying an explicit cascade SHALL remove the tag and its
labellings in one transaction, leaving nothing dangling. A tag no work item
carries SHALL be removed without confirmation.

#### Scenario: removal refused with the usage named

- **GIVEN** tag `regulatory` carried by `3.1 Design` in project `Rollout`
- **WHEN** its removal is requested without cascade
- **THEN** the refusal names `Rollout` and `3.1 Design` with a `label_removed`
  effect, and no effect about capacity or dates

#### Scenario: an inherited row is not named

- **GIVEN** a tagged parent and a child that only inherits the tag
- **WHEN** the tag's removal is requested without cascade
- **THEN** the usage names the parent and not the child

#### Scenario: cascade removes the labellings with it

- **WHEN** the removal is requested with cascade
- **THEN** the tag is gone, no work item carries a dangling tag id, and no date
  in either project moved

### Requirement: A work item's tags are written, and undone, whole

A patch SHALL accept a set of tag ids that **replaces** the work item's stated
tags in full, deduplicated rather than refused when an id is repeated, and bounded
by a stated maximum. An id naming a tag the directory does not hold SHALL refuse
the whole patch as `unknown_tag` — its own refusal, distinct from `unknown_team`,
so a client knows which picker to reopen — decided inside the write's own
transaction so a removal landing mid-request cannot slip between the check and the
write.

A patch naming **only** tags SHALL be written and SHALL be journalled: it SHALL
NOT be treated as a patch with nothing to write. The journalled before-value SHALL
be the **whole prior set**, not one member of it, so an undo restores every label
the patch replaced.

#### Scenario: a set is replaced whole

- **GIVEN** a work item tagged `regulatory` and `tech-debt`
- **WHEN** a patch sets its tags to `q3-must-have`
- **THEN** it carries that tag alone

#### Scenario: an undo restores every member

- **GIVEN** the patch above
- **WHEN** it is undone
- **THEN** the work item carries `regulatory` and `tech-debt` again, both of them

#### Scenario: a patch naming only tags is a write

- **WHEN** a patch carries tag ids and nothing else
- **THEN** the tags are written, the revision moves, and the change is undoable

#### Scenario: a dead tag id refuses the whole patch

- **WHEN** a patch names a tag the directory no longer holds
- **THEN** it is refused as `unknown_tag` and nothing is written

### Requirement: The plan can be filtered by tag, on the effective reading

The filter SHALL offer a tag facet beside the facets already shipped, matching on
each row's **effective** tags rather than its stated ones, so a child that
inherits a tag is found by it. The facet SHALL describe itself in the filter's own
words the way the other facets do.

A saved view stored before this facet existed SHALL remain usable and SHALL NOT be
deleted or refused: a facet added later SHALL read as absent.

#### Scenario: an inherited row matches

- **GIVEN** a parent tagged `regulatory` and an untagged child
- **WHEN** the plan is filtered by `regulatory`
- **THEN** both the parent and the child are found

#### Scenario: a view saved before the facet existed

- **GIVEN** a saved view stored without any tag facet
- **WHEN** it is loaded
- **THEN** it applies, with no tag filtering, and it is still in the list

### Requirement: Every surface that shows a team shows the tags beside it

The table, the phone card, the CSV export and the chart's hover text SHALL each
show a work item's effective tags, and each SHALL mark an inherited reading the
way it already marks an inherited team. The export's column SHALL be `Tags`,
joined and quoted the way `Teams` is.

The chart SHALL show tags in its hover text and SHALL derive **no position** from
them: no bar, bracket, arrow, link, flag or horizon SHALL move when a plan is
tagged. The hover text SHALL omit the tag line entirely on a row with no tags,
while still naming the absence of a team — a team is the pool the dates were
computed against, so its absence explains the schedule, and a tag's does not.

The directory's tag section SHALL show **no capacity column and no membership
chips**, and that absence SHALL be asserted: it is how a reader learns that a tag
has no pool without being told.

#### Scenario: an inherited tag is marked as inherited

- **GIVEN** a child inheriting `regulatory` from its parent
- **THEN** the card and the table name the tag and say which row it comes from

#### Scenario: the chart places nothing from a tag

- **WHEN** the same plan is laid out tagged and untagged
- **THEN** every bar, bracket, arrow, link, flag and horizon is identical

#### Scenario: an untagged bar says nothing about tags

- **GIVEN** a bar on a row with no tags and no team
- **THEN** its hover text has no `Tags` line and still says `No team`

#### Scenario: the tag directory shows no capacity

- **WHEN** the directory page is opened
- **THEN** the tag section lists names with no capacity number and no member
  chips
