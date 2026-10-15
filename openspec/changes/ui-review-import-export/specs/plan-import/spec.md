## ADDED Requirements

### Requirement: Import outcomes speak the app's words

The app's Import JSON SHALL report every refusal the import route can return,
and every failure the app itself detects, with a sentence that names no wire
code. A refusal that points into the file SHALL keep that path in parentheses.
A failure without its own sentence SHALL read `The plan could not be imported.
Try again.` A file that is not JSON SHALL read `This file is not JSON.`; JSON
whose `document.format` is not `wbs-plan` SHALL read `This JSON is not a plan
export.` Each import attempt SHALL take the previous attempt's error toast off
before reporting its own outcome.

#### Scenario: a broken file, then a good one

- **WHEN** a reader imports a file holding `{"broken"`, then a valid plan export
- **THEN** the first toast reads `This file is not JSON.`, and after the second import only the success toast remains

#### Scenario: a dangling dependency

- **WHEN** the route refuses `unknown_ref` at `workItems[12].dependsOn[0]`
- **THEN** the toast reads `This plan export refers to something it does not contain (workItems[12].dependsOn[0]).`

### Requirement: An imported plan is named apart and named in its toast

When a project in the account's list already uses the file's name (compared
without case or outer spaces), the app's import SHALL create the project as
`<name> (imported <d Mon>)` with the reader's local day, then `(imported <d
Mon>, 2)` and on until the name is free; a name already ending in an import
date SHALL be re-dated rather than given a second suffix. The success toast
SHALL read `Imported “<project name>” with <n> work items.`, followed by the
directory names it added and the solution link's fate only when the file
carried one. The imported project SHALL open when the reader is still on the
project they imported from.

#### Scenario: re-importing the open plan

- **WHEN** a reader downloads the open plan as JSON and imports it unchanged on 15 Oct
- **THEN** the picker holds `<name> (imported 15 Oct)` and the toast reads `Imported “<name> (imported 15 Oct)” with <n> work items.`
