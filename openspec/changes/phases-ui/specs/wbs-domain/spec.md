## ADDED Requirements

### Requirement: A project's phases are changed from the table

The toolbar SHALL offer a way to open the project's phases, and what opens SHALL
be a modal surface listing every phase the project holds, in the order the
project reports them. From it a phase SHALL be added by name, renamed, and asked
to be removed.

A name that is only whitespace SHALL NOT be sent: the surface refuses it itself,
because be-01's answer to it says nothing the person could not be told at once.

While a request is out, the surface SHALL say so and SHALL NOT send a second
one. When one lands, the list SHALL show what be-01 now holds rather than what
was typed — the roles are read again, and the table behind the surface changes
with them.

#### Scenario: the phases a project holds

- **WHEN** the phases surface is opened on a project holding `Dev` and `QA`
- **THEN** both are listed, each with a way to rename it and a way to remove it

#### Scenario: adding a phase

- **WHEN** `Design` is typed into the new-phase box and submitted
- **THEN** be-01 is asked to add `Design` to this project, and once it answers
  the list holds three phases and the table has a `Design` column

#### Scenario: renaming a phase

- **WHEN** a phase's name is changed to `Delivery` and submitted
- **THEN** be-01 is asked to rename that phase, and the table's column heading
  reads `Delivery`

#### Scenario: a name of spaces alone

- **WHEN** a phase is submitted with a name of spaces
- **THEN** nothing is sent and the surface says a phase needs a name

### Requirement: The phases surface is complete from the keyboard

Every control on the surface SHALL be reachable by Tab, and the Tab order SHALL
NOT leave the surface while it is open. Escape SHALL close it. Enter in a text
box on the surface SHALL submit that box's own form and nothing else. Cmd/Ctrl +
Enter SHALL submit from anywhere on the surface, including from a text box.

While the surface is open the page's own keyboard SHALL be held back: `?` SHALL
NOT open the cheat sheet over it, and the undo chord SHALL NOT reverse a change
in the plan behind it.

#### Scenario: the chord submits from the box

- **WHEN** a phase name is typed and Cmd+Enter — or Ctrl+Enter — is pressed in
  that box
- **THEN** the phase is added, exactly as pressing Enter there would

#### Scenario: Escape leaves

- **WHEN** Escape is pressed on the surface
- **THEN** the surface closes and the control that opened it has the focus again

#### Scenario: the page's keys are not the surface's

- **WHEN** `?` is pressed on the surface
- **THEN** the cheat sheet does not open

### Requirement: Removing a phase says what it would take, and asks again

A first removal SHALL be asked for without a cascade. When be-01 refuses it as
in use, the surface SHALL show what would go: how many estimates, how many
people are explicitly assigned to it, and **every work item whose assumed
assignee would change** — named by its number, with who is assumed to be doing
all of it now and who would be afterwards. Nobody is named as "nobody".

The confirmation SHALL carry a box for the cascade, and that box SHALL start
**off**. The removal SHALL be sent a second time only once it is ticked, and
SHALL then carry the cascade. Leaving the confirmation without ticking it SHALL
send nothing.

A phase nothing points at SHALL be removed by the first request, with no
confirmation: be-01 answers it directly and there is nothing to warn about.

#### Scenario: refused with what it holds

- **GIVEN** a phase holding two estimates and one explicit assignment
- **WHEN** it is asked to be removed
- **THEN** nothing is removed, and the surface says two estimates and one
  assignment would go

#### Scenario: who would be assumed to do everything

- **GIVEN** a work item numbered `020` assigned to one person for `Dev` and
  another for `QA`
- **WHEN** removing `QA` is asked for
- **THEN** the surface names `020`, says nobody is assumed to be doing all of it
  now, and names the `Dev` assignee as who would be

#### Scenario: the cascade is a decision, not a default

- **WHEN** a refused removal is confirmed without the cascade box ticked
- **THEN** no second request is sent

#### Scenario: a phase nobody uses

- **WHEN** a phase no estimate and no assignment points at is asked to be
  removed
- **THEN** it is gone with no confirmation asked for

### Requirement: A refused phase change is a sentence, not a code

Every refusal be-01 answers a phase change with SHALL be shown as a sentence in
this table's own words — a name already taken, a phase that is in use, a phase
the project no longer holds, a project this account may not write to, and a name
that is missing. A refusal code SHALL NOT be shown as itself.

#### Scenario: a name that is already there

- **WHEN** a phase is added with a name the project already holds
- **THEN** the surface says that name is already a phase on this plan, and the
  word `taken` appears nowhere

#### Scenario: a phase that has gone

- **WHEN** a phase is renamed after somebody else has removed it
- **THEN** the surface says that phase is no longer on this plan, and the word
  `not_found` appears nowhere

### Requirement: The surface says how wide the phases make the table

The phases surface SHALL state the narrowest the table can be laid out with the
phases it is showing, in px, and SHALL say what happens below it — the table
scrolls sideways. The number SHALL be computed from the same column widths the
table is laid out from, so a column that changes width changes this sentence.

#### Scenario: the arithmetic follows the columns

- **WHEN** the surface is open on a project holding five phases
- **THEN** it states the same width the table declares as its own minimum with
  those five phases folded

### Requirement: A phase change rebuilds the columns, and the table survives it

Reading a project's work items SHALL also settle the client's own state against
the phases that came back:

- a phase that is unfolded and is no longer there SHALL be folded — the
  accordion SHALL NOT hold a phase the project does not have;
- every half-typed estimate held for a phase that is no longer there SHALL be
  dropped, so a figure cannot be sent for a phase that has gone;
- neither SHALL be replaced by an equal copy when nothing changed, because the
  columns are rebuilt from these and rebuilding them takes the focus.

A cell being typed in when the columns rebuild **does** lose the focus, and that
is the accepted cost of a phase change: the person sees the caret leave the box
at the moment the columns change, and nothing else. A draft be-01 **refused**
SHALL survive that rebuild — it is text that exists nowhere else, and the
rebuild must not replace it with the value on the server.

#### Scenario: the accordion lets go of a phase that has gone

- **GIVEN** a reader who has unfolded `QA`
- **WHEN** `QA` is removed
- **THEN** no unfolded columns remain, and the reader's next read does not ask
  for them

#### Scenario: a half-typed figure for a phase that has gone

- **GIVEN** `5` typed into `QA`'s optimistic box and not yet sent
- **WHEN** `QA` is removed
- **THEN** that draft is dropped, and a draft typed for `Dev` is untouched

#### Scenario: the columns are not rebuilt for nothing

- **WHEN** the project is read again and its phases are unchanged
- **THEN** the cell being typed in keeps its focus and its text

#### Scenario: a refused draft outlives the rebuild

- **GIVEN** a name be-01 refused, still in its box
- **WHEN** a phase is added and every column is rebuilt
- **THEN** the refused text is still in that box, not the value on the server
