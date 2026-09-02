## ADDED Requirements

### Requirement: The plan document carries what a restore needs

`GET /api/projects/:id/export?format=json` SHALL answer a plan document: every
field it answers today, unchanged, plus `document` (`format: "wbs-plan"`,
`version: 1`, `exportedAt`), `settings` (name, restricted, estimate method,
dependency reach, PERT weights, estimate rounding, start date, solution ref),
`priorityBands`, `capacity` (one entry per team with a remembered capacity), and
`directory`: id, name and — for people — kind, for every team, person, tag,
service, work item type and external system any row or capacity entry
references. A directory entry no row references SHALL NOT be in the document.

#### Scenario: the document names what its ids mean

- **GIVEN** a row labelled with tag `urgent` and assigned to person `Kat` (an agent)
- **WHEN** the project is exported as JSON
- **THEN** `directory.tags` holds `urgent` under the id the row carries, and
  `directory.people` holds `Kat` with `kind: "agent"`

#### Scenario: nothing MCP reads has moved

- **WHEN** the project is exported as JSON
- **THEN** `project`, `workItems`, `steps`, `slices`, `scheduleError`, `seq`,
  `assignedPeople`, `waitingForPerson` and `waitingForCapacity` are present with
  the shape they had before this change

#### Scenario: the export is the import's input

- **GIVEN** a project exported as a plan document
- **WHEN** that document is imported into the same deployment and the new
  project is exported
- **THEN** the two documents are equal once ids, `exportedAt`, audit stamps and
  the solution ref are set aside

### Requirement: A plan document imports as a new project, whole or not at all

`POST /api/projects/import` SHALL take a plan document and create one new
project owned by the caller, carrying the document's settings, steps in order,
priority bands, capacity, and every row with its name, notes, outline position,
frozen number, not-before date and reason, priority, maximum parallelism, teams,
tags, services, types, external refs, estimates, actuals, progress, measures,
assignees and dependencies. Every id SHALL be minted fresh; the document's ids
are refs resolved within the document. The write SHALL be one transaction: a
refusal at any row leaves no project, no row and no directory entry behind. The
answer SHALL carry the new project id, the row count, the directory entries
created by kind, and whether the solution ref was kept. The import SHALL NOT be
undoable and SHALL NOT read any derived field of the document.

#### Scenario: a restored plan is the plan

- **GIVEN** a document of a plan with three steps, two priority bands, a team
  capacity, a frozen row, a not-before flag, a dependency, an actual and a
  measure
- **WHEN** it is imported
- **THEN** the new project's tree read answers the same steps in the same order,
  the same bands, the same capacity, the row frozen under the same number, the
  flag with its reason, the dependency between the two corresponding new rows,
  the actual and the measure

#### Scenario: fresh ids

- **GIVEN** a document exported from a project that still exists
- **WHEN** it is imported
- **THEN** no work item, step or project id in the new project equals one in
  the document, and the original project is unchanged

#### Scenario: a dangling dependency refuses the whole import

- **GIVEN** a document whose row 12 depends on an id no row in the document has
- **WHEN** it is imported
- **THEN** the answer is 400 `unknown_ref` at `rows[12].dependsOn[0]`, and the
  project count, the work item count and every directory table are what they
  were before the request

#### Scenario: an estimate on a step the document does not declare

- **GIVEN** a document whose row holds an estimate keyed by a step id absent from
  `steps`
- **WHEN** it is imported
- **THEN** the answer is 400 `unknown_ref` naming the path, and nothing is written

#### Scenario: a document from a version this build does not read

- **GIVEN** a document with `document.version: 2`
- **WHEN** it is imported
- **THEN** the answer is 400 `unsupported_version` carrying the version, and
  nothing is written

#### Scenario: a malformed row is refused by path

- **GIVEN** a document whose row 3 carries `priority: "high"`
- **WHEN** it is imported
- **THEN** the answer is 400 naming `rows[3].priority`, and nothing is written

### Requirement: Directory names are matched, and the absent ones are created

The import SHALL resolve each directory entry of the document by its trimmed
name against the deployment's directory, case-sensitively, as the directory's
own `taken` rule does. An entry with no match SHALL be created before any row is
written, inside the same transaction, and named in the answer under its kind.
A person SHALL be created with the document's kind.

#### Scenario: an existing tag is reused

- **GIVEN** the directory holds tag `urgent` and the document names a tag `urgent`
- **WHEN** the document is imported
- **THEN** rows carry the existing tag's id and `created.tags` is empty

#### Scenario: a missing person is created with their kind

- **GIVEN** the directory has nobody named `Kat` and the document assigns `Kat`,
  kind `agent`
- **WHEN** the document is imported
- **THEN** a person `Kat` of kind `agent` exists, the assignment points at them,
  and `created.people` is `["Kat"]`

#### Scenario: a refusal after a creation leaves no creation

- **GIVEN** a document naming an absent team and carrying a dangling dependency
- **WHEN** it is imported
- **THEN** the answer is the dependency's refusal and the team does not exist

### Requirement: The solution ref is kept when free, and its absence is said

The import SHALL write the document's solution ref when no project holds its
slug, and SHALL otherwise create the project without one and answer
`solutionRef: "left-off"`. It SHALL NOT refuse the import for a taken slug.

#### Scenario: free slug

- **GIVEN** no project with slug `acme-q4`
- **WHEN** a document with that slug is imported
- **THEN** the new project answers the slug and URL, and the answer says
  `solutionRef: "kept"`

#### Scenario: taken slug

- **GIVEN** a project already holding slug `acme-q4`
- **WHEN** a document with that slug is imported
- **THEN** the new project has no solution ref, the holder keeps its slug, and the
  answer says `solutionRef: "left-off"`

### Requirement: The toolbar offers export and import together

The plan toolbar's menu SHALL be named `Export / Import` and SHALL offer
`Download JSON`, which saves the plan document under the plan's file name with
a `.json` extension, and `Import JSON…`, which picks one file, posts it, opens
the new project on success, and pushes one info toast stating the rows
imported, the entries created by kind and whether the solution ref was left
off. A refused import SHALL be an error toast naming the row and the reason,
and the page SHALL stay on the current project.

#### Scenario: download

- **WHEN** `Download JSON` is pressed
- **THEN** one file named like the CSV export with a `.json` extension is saved,
  and its content parses to a document with `document.format: "wbs-plan"`

#### Scenario: import lands

- **GIVEN** a valid plan document of 40 rows naming one absent tag
- **WHEN** it is picked through `Import JSON…`
- **THEN** the page opens the new project, and a toast reads
  `Imported <name>: 40 work items · created 1 tag`

#### Scenario: import refused

- **GIVEN** a document whose row 12 has a dangling dependency
- **WHEN** it is picked
- **THEN** an error toast names row 12 and `unknown_ref`, the project list has
  not grown, and the page still shows the project it showed
