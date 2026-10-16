## ADDED Requirements

### Requirement: A saved-plan comparison is out of date only when one of its sides moved

The Saved plans panel SHALL offer to compare again only when a side of the
comparison on screen has moved since it was asked: the current plan, when any
project event other than a saved-plan list change has happened (including events
whose type is unknown, and any time the panel's connection was down), or a saved plan in the comparison that is no longer on
the shelf. Saving, renaming or deleting saved plans that are not a side of the
comparison SHALL NOT mark it out of date. A comparison between two saved plans
SHALL NOT be marked out of date by an edit to the current plan.

#### Scenario: a second save

- **WHEN** the reader compares a saved plan with the current plan and then saves another plan, without editing the plan
- **THEN** no out-of-date sentence and no Compare again button are shown

#### Scenario: an edit to the plan

- **WHEN** the current plan is edited after the comparison was made
- **THEN** the panel says the plan has changed since the comparison was made and offers Compare again

#### Scenario: an edit while the connection was down

- **WHEN** the current plan is edited while the panel's connection is down, and the connection comes back
- **THEN** the panel says the plan has changed since the comparison was made and offers Compare again

#### Scenario: a side deleted by someone else

- **WHEN** a collaborator deletes the saved plan the comparison is about
- **THEN** the panel says a plan in the comparison has been deleted and offers Compare again

### Requirement: A saved plan's meta line is never cut inside a clause

A saved-plan row's meta line SHALL wrap between its clauses (when it was saved,
by whom, and whether its schedule came along) rather than ellipsising inside
one, and SHALL carry the whole sentence as the row's fact.

#### Scenario: a named plan at 1440

- **WHEN** a plan saved under a name is listed in the Saved plans panel at 1440 × 900
- **THEN** every clause of its meta line is drawn whole and the line's fact reads the whole sentence

### Requirement: An empty name does not turn Save off in Views or Saved plans

In the Views and the Saved plans panels, an empty name SHALL NOT disable Save,
and Enter in the name field SHALL save. A view saved with no name SHALL be named
by what it filters; a plan saved with no name keeps be-01's time name. Views'
Save SHALL stay off while nothing is filtered. A view saved under a name a view
already has SHALL replace that view rather than add a second one.

#### Scenario: a filtered plan, no view name

- **WHEN** the reader ticks a team filter and presses Save in Views with an empty name
- **THEN** a view named by its filter words, such as `team Billing`, is saved

#### Scenario: Save pressed twice

- **WHEN** the reader presses Save twice with the same filter and no name
- **THEN** one view named `team Billing` is listed

### Requirement: A one-shot Export / Import item closes its menu

Every one-shot item of the Export / Import menu (each copy, each download,
Import with AI, and a file chosen for Import JSON) SHALL close the menu and give
the focus to its summary. When the Import with AI dialog closes, the focus SHALL
return to the menu's summary. Changing Mermaid lanes SHALL leave the menu open.

#### Scenario: a download

- **WHEN** the reader chooses Download JSON
- **THEN** the menu closes and the Export / Import summary has the focus

#### Scenario: opening and closing Import with AI

- **WHEN** the reader chooses Import with AI and then presses Escape in the dialog
- **THEN** the menu is closed while the dialog is open and after it, and the Export / Import summary has the focus

#### Scenario: a setting

- **WHEN** the reader changes Mermaid lanes
- **THEN** the menu stays open

### Requirement: The toolbar's end group holds together with its menu open

The plan toolbar's end group SHALL stay on one row at 960 × 600 and at 1024,
with the Export / Import menu open or closed.

#### Scenario: 150 % zoom with the menu open

- **WHEN** the plan is shown at 960 × 600 and Export / Import is open
- **THEN** Undo, Redo, Keyboard shortcuts, Export / Import, Starts, Plan with and Reset layout share one row at the bar's right edge
