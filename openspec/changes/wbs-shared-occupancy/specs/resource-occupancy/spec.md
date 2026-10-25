## ADDED Requirements

### Requirement: Claims share a directory capacity across the organization

For each resource a claim asks for that states a directory capacity, `claimWorkItem` SHALL,
in the same transaction and after the project check, require the directory capacity minus the
units held by every other leaf of the resource's organization, in any project, to cover the
units asked, unless the leaf already holds that many; a shortfall SHALL refuse the batch
`resources_exhausted`. The project capacity SHALL keep refusing as before and MAY sum above
the directory capacity across projects.

#### Scenario: Host RAM held in A is not free in B

- **WHEN** `host ram` states a directory capacity of 16, projects A and B each state 16, A's
  leaves hold 16, and a claim in B asks 16
- **THEN** B's claim is refused `resources_exhausted` with free 0 and asked 16

#### Scenario: One staging across projects

- **WHEN** the exclusive `staging` states a directory capacity of 1 and a leaf of A holds it
- **THEN** a claim in B on a leaf demanding `staging` is refused `resources_exhausted`, and
  after A releases it the same claim in B is applied

#### Scenario: Two concurrent claims in two projects

- **WHEN** a claim in A and a claim in B each ask 10 of a directory capacity of 16 at once
- **THEN** exactly one is applied and the other is refused `resources_exhausted`

### Requirement: A shortage names the scope that bound it

Each shortage of `resources_exhausted` SHALL carry `scope: 'organization'` when the
organization check bound it and `scope: 'project'` when the project check did; the smaller
free units bind, and on a tie `organization`.

#### Scenario: The project ceiling still binds

- **WHEN** the directory capacity is 16, project A states 8 and A's leaves hold 8
- **THEN** a claim in A asking 4 is refused with `scope: 'project'` while 8 are free in the
  organization

#### Scenario: The organization binds

- **WHEN** B states 16, nothing in B is held and A holds 16 of a directory capacity of 16
- **THEN** a claim in B is refused with `scope: 'organization'`

### Requirement: Undo, redo and release act across projects

A redo of a claim and an undo of a release SHALL re-acquire through the same check and,
refused, answer `stale_undo` whose detail begins `resources_exhausted:` and names the scope. A
release or a lease sweep SHALL free the units for every project at once. Lowering a directory
capacity below what is held SHALL release nothing.

#### Scenario: Undo in A refused by B

- **WHEN** a release in A freed 16, a claim in B then took 16, and the release is undone
- **THEN** the undo is refused `stale_undo` with detail `resources_exhausted:` naming
  `organization`

#### Scenario: A lease sweep in A frees B

- **WHEN** A's 16 GB claim's lease runs out and the sweep releases it
- **THEN** B's next startable read shows 16 free and B's claim of 16 is applied

### Requirement: Holders in other projects respect the reader's access

Each holder named by `resources_exhausted`, the startable read and the project resources read
SHALL carry its `projectId`. A holder in a project the reader may read SHALL be named in full;
holders in projects the reader may not read SHALL be folded into one `elsewhere: { units,
claims }` per resource, carrying no project id, project name, person, run or work item. A
machine principal SHALL be judged by its own grants.

#### Scenario: A reader without access to A

- **WHEN** a principal that may read B but not A is refused for `host ram` held by A
- **THEN** the refusal carries `elsewhere: { units: 16, claims: 1 }` and no identifier from A

#### Scenario: An organization member reads both

- **WHEN** a member who may read A and B is refused for the same resource
- **THEN** A's holder is named with person, run, work item and `projectId`
