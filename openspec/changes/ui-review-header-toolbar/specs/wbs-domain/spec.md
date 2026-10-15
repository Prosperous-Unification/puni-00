## ADDED Requirements

### Requirement: The app header keeps a readable picker at every width

The signed-in header SHALL lay out on one row at widths of 900px and above and
on two rows below 900px, the second holding the project controls. On a page with
no project controls the header SHALL be one row at every width. The project
picker SHALL be at least 144px wide wherever it is shown, SHALL truncate a long
name with an ellipsis and SHALL carry the whole name in its hover card. No name in
the roster SHALL be cut mid-word without an ellipsis; a name that does not fit
the line SHALL drop whole: below 1440px the roster SHALL collapse to
a connection dot and a count whose hover card names everyone present. On a phone the
picker, Rename project and Create new project SHALL be at least 44px tall. The
roster's heading SHALL read `Live` while connected and `Reconnecting` while not
(decision D9, change `ui-review-shell-faults`), and SHALL NOT be shown while no
project is chosen.

#### Scenario: a laptop width

- **WHEN** a project is open at 1024px
- **THEN** the header is one row and the picker is at least 144px wide with an ellipsis

#### Scenario: a phone

- **WHEN** a project is open at 375px
- **THEN** the header is two rows and its project controls are 44px tall

### Requirement: Toolbar popovers dismiss like every other popover

Each plan-toolbar and header popover (Filters, Views, Columns, Export / Import,
Saved plans) SHALL close on Escape pressed inside it, or with nothing focused,
and SHALL then give the focus to its summary. An Escape another control already
handled SHALL NOT close it. A popover taller than the window allows SHALL scroll
and SHALL show a shadow on each edge beyond which content is hidden.

#### Scenario: Escape from a ticked filter

- **WHEN** a reader ticks a filter and presses Escape
- **THEN** the Filters panel closes and its summary holds the focus

### Requirement: The plan page offers a way in when no project is open

When the project list has loaded and no project is selected, the plan page SHALL
show a `No project open` region offering up to five of the account's projects in
be-01's order, Create new project, and Import JSON. Choosing a project SHALL open
it and remember it in this browser, so the next load opens it with no click.

#### Scenario: two projects and a fresh browser

- **WHEN** the account holds two projects and this browser remembers neither
- **THEN** both are offered by name, and choosing one opens it and reopens it on reload

### Requirement: The plan toolbar groups and words its schedule controls

Starts, Plan with and, while offered, Reset layout SHALL be one group laid out at
the end of the toolbar. Starts SHALL show the start day as `D Mon YYYY` over the
native date field while the field does not hold the focus. The Find result count
SHALL be shown inside the Find box. Activating the unestimated badge SHALL
announce, through a polite live region, which gap it moved to, as
`Unestimated <n> of <total>: <number> <name>, <step>`.

#### Scenario: a filter is typed

- **WHEN** a reader types into Find
- **THEN** the count appears inside the box and no control after it moves
