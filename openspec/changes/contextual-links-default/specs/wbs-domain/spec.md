## ADDED Requirements

### Requirement: Links starts hidden until a reader chooses or resets it

With no stored layout for the project in this browser, the table SHALL hide the
Links column. This first-visit baseline SHALL be the same whether the project
contains no refs or many refs. The other default-hidden columns SHALL remain
Teams, Services and Types.

A valid stored hidden-column list SHALL remain authoritative, including an
explicit choice to show or hide Links. Applying a saved view that carries a
column set SHALL be the same explicit choice. Link data changing SHALL NOT
silently alter either choice.

#### Scenario: first visit to an empty project

- **GIVEN** no stored layout and no live work item with an external ref
- **WHEN** the project is opened
- **THEN** Links SHALL be hidden

#### Scenario: first visit to a linked project

- **GIVEN** no stored layout and a live work item with an external ref
- **WHEN** the project is opened
- **THEN** Links SHALL still be hidden
- **AND** Reset layout SHALL be offered because its current target differs

#### Scenario: an explicit choice survives data changes

- **GIVEN** the reader explicitly hid or showed Links
- **WHEN** refs are added to or removed from any work item
- **THEN** Links SHALL keep the chosen visibility until another explicit toggle,
  saved view, or Reset layout

### Requirement: Full-table Reset derives Links visibility from the whole live project

Full-table Reset layout SHALL show Links when at least one live work item in the
last successfully read project tree has at least one external ref, and SHALL
hide Links otherwise. Every hierarchy depth SHALL count. Filters, collapsed
branches, the current viewport and pagination of rendered rows SHALL NOT narrow
the test. A deleted work item and a live work item with an empty ref array SHALL
not count.

The reset SHALL evaluate one already-loaded tree snapshot at the click. A ref
write not present in that snapshot SHALL affect only a later successful tree
read and a later reset. A later refresh SHALL NOT revise the visibility chosen
by the completed reset.

Before the selected project has completed its first successful tree read,
full-table Reset SHALL be unavailable. A successful empty tree SHALL count as a
loaded snapshot; after any success, a failed refresh SHALL retain the prior
snapshot as the reset input.

#### Scenario: a filtered collapsed descendant counts

- **GIVEN** a linked descendant outside the rendered rows because its branch is
  collapsed and the active filter excludes it
- **WHEN** the reader resets the full table layout
- **THEN** Links SHALL be shown

#### Scenario: deleted and empty rows do not count

- **GIVEN** every live work item has an empty external-ref array and a formerly
  linked work item has been deleted
- **WHEN** the reader resets the full table layout
- **THEN** Links SHALL be hidden

#### Scenario: a write lands after the reset click

- **GIVEN** the last successful tree has no refs and a ref write is in flight
- **WHEN** Reset layout is handled before the refreshed tree lands
- **THEN** Links SHALL be hidden
- **AND** the later refresh SHALL leave it hidden
- **AND** a subsequent Reset layout SHALL show it

#### Scenario: initial loading is not an empty-project result

- **GIVEN** the selected project has not completed a successful tree read
- **WHEN** prior local width or Gantt overrides would otherwise offer Reset
- **THEN** full-table Reset SHALL remain unavailable
- **AND** a successful empty-tree response SHALL enable the hidden-Links target

### Requirement: The contextual reset result is local, durable and geometrically exact

Reset SHALL forget the explicit hidden-column list but SHALL remember, per
project and per browser, only whether that reset showed Links. This one-bit
baseline SHALL survive reloads and SHALL remain unchanged as refs change until
the next full-table reset. It SHALL NOT be sent to or read from a server. An
explicit Columns toggle or saved-view column set SHALL replace it as the sole
authority. Exactly the stored JSON boolean `true` SHALL represent this baseline;
all other stored values SHALL be discarded as invalid.

When Links is hidden, the table minimum and Name's pinned offset SHALL each be
exactly 40px smaller than with Links shown, with no sticky gap. The Links width,
its order between Number and Name, and every other column width SHALL be
unchanged when it is shown.

Phone cards SHALL continue to have no Links field. Their Gantt-only Reset layout
SHALL NOT read or change the desktop Links baseline.

#### Scenario: a reset result survives reload and another collaborator does not receive it

- **GIVEN** this browser reset a linked project and showed Links
- **WHEN** this browser reloads after every ref is removed
- **THEN** Links SHALL remain shown
- **AND** another browser with no stored layout SHALL start with Links hidden

#### Scenario: hiding Links closes the pinned block

- **GIVEN** the table with Links shown between Number and Name
- **WHEN** Links is hidden
- **THEN** Name's sticky left edge and the folded minimum SHALL each decrease by
  40px
- **AND** no other declared width SHALL change

#### Scenario: phone reset is Gantt-only

- **GIVEN** the plan is rendered as cards
- **WHEN** the reader uses its Reset layout
- **THEN** no Links field SHALL appear and no desktop column preference SHALL
  change
