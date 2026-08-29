## MODIFIED Requirements

### Requirement: A project names the steps it estimates separately

The system SHALL call the named kind of work a project estimates separately a
**step**. Every face — the plan table, the configuration dialog, the chart, the
export, the hover cards, the API, and the MCP tools — SHALL use that word and
SHALL NOT use "phase" or "role" for it.

A project SHALL start with the steps `Dev` and `QA`, SHALL allow others to be
added, renamed and removed, and SHALL keep step names unique within it. The
order a project works its steps in SHALL be called the **step order**.

The word "role" SHALL remain in use only as the ARIA attribute, which names
something else.

#### Scenario: the configuration dialog is called Steps

- **WHEN** the dialog that adds, renames and removes what a project estimates
  separately is opened
- **THEN** its title SHALL read `Steps`
- **AND** no control, heading or sentence on it SHALL read `Phase` or `Role`

#### Scenario: removing a step says what it would take, in the new word

- **GIVEN** a step holding two estimates and one assignment
- **WHEN** its removal is offered
- **THEN** the confirmation SHALL name the step and SHALL count the estimates
  and assignments it would delete
- **AND** the sentence SHALL use the word `step`

### Requirement: The API names steps in its routes and payloads

The system SHALL expose a project's steps at `/api/projects/:id/steps` and one
step at `/api/projects/:id/steps/:stepId`. Payload fields naming a step SHALL be
`stepId`, and a list of them SHALL be `steps`.

`openapi.json` SHALL be regenerated from those routes, and the MCP tools derived
from it SHALL carry the new names. The previous spellings SHALL NOT be accepted:
a request to a `roles` route SHALL be refused as an unknown route rather than
served.

#### Scenario: the steps routes serve and the roles routes do not exist

- **WHEN** a step is added at `/api/projects/:id/steps`
- **THEN** it SHALL be written, and the project read SHALL list it under `steps`
- **AND** the same request at `/api/projects/:id/roles` SHALL be a 404, as SHALL
  a rename and a removal at `/api/projects/:id/roles/:roleId`

#### Scenario: a plan payload names steps

- **WHEN** a project's work items are read
- **THEN** each estimate SHALL name its step as `stepId`
- **AND** no field in the payload SHALL be named `roleId` or `role`

### Requirement: The rename changes no behaviour

The system SHALL behave identically before and after this change. No schedule
date, refusal, permission, derived number, keyboard binding or rendered state
SHALL differ.

The physical database table and columns SHALL keep their pre-rename names, and
the schema SHALL state in place that the physical name and the domain name
disagree and why.

#### Scenario: a plan schedules to the same dates

- **GIVEN** a project whose schedule was computed before this change
- **WHEN** the same project is scheduled after it
- **THEN** every work item's start, finish and slack SHALL be unchanged

#### Scenario: the schema names the boundary it crosses

- **WHEN** the table holding a project's steps is read in the schema
- **THEN** its physical name SHALL be the pre-rename one
- **AND** an adjacent comment SHALL name the boundary and the change that closes it
