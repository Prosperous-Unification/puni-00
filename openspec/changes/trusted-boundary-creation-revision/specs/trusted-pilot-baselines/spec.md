## ADDED Requirements

### Requirement: A pilot boundary created after the freeze pins its baseline to its first commit

A trusted pilot boundary SHALL bind its baseline either to a predecessor through `sourceSelector`
at the pilot's `sourceRevision` or, when its files were first added after that revision, to a
`creationRevision`. The two SHALL be mutually exclusive, and `creationRevision` SHALL require a
pilot. The trusted loader SHALL refuse a creation-revision boundary unless the creation revision
is a readable commit in the candidate repository that descends from `sourceRevision`, the
boundary's selector selects at least one tuple there and nothing at `sourceRevision`, the oldest
commit after `sourceRevision` that touches the selector is the creation revision, and the
boundary's `baselineEntries` equal exactly the tuples the selector selects at the creation
revision. A shallow history that cannot show the descent is refused. A creation-revision boundary that passes SHALL receive the same observe-mode admission
as a predecessor-bound boundary.

#### Scenario: A new module registers through its creation commit

- **GIVEN** Plan import's boundary names `creationRevision` `5a99d244` with its directory's tuples at that commit as its baseline
- **WHEN** production observe lint runs on the pilot candidate
- **THEN** it exits 0 with `accepted: true`

#### Scenario: A boundary declares both a predecessor and a creation revision

- **WHEN** Plan import's boundary carries both `sourceSelector` and `creationRevision`
- **THEN** the loader refuses with `trusted boundary declares both a predecessor and a creation revision`

#### Scenario: The creation revision is absent or not a commit

- **WHEN** the creation revision is an unknown object id, or the id of a blob
- **THEN** the loader refuses with `trusted boundary creation revision is unreadable`, naming the boundary and revision

#### Scenario: The creation revision does not contain the files

- **WHEN** the creation revision is the commit before Plan import's directory was added
- **THEN** the loader refuses with `trusted boundary creation revision selects nothing`

#### Scenario: The creation revision does not descend from the freeze

- **WHEN** the creation revision is a commit carrying Plan import's creation tree on the freeze's parent, with an honest baseline
- **THEN** the loader refuses with `trusted boundary creation revision does not descend from the pilot source revision`

#### Scenario: The creation revision is a later commit

- **WHEN** the creation revision is a later commit that edited Plan import, with a baseline read honestly at that commit
- **THEN** the loader refuses with `trusted boundary creation revision is not the boundary's first commit`

#### Scenario: The baseline disagrees with the creation revision

- **WHEN** one baseline tuple's blob differs from the creation revision's
- **THEN** the loader refuses with `trusted boundary baseline differs from its creation revision`

#### Scenario: A boundary that existed at the freeze claims a creation revision

- **WHEN** a boundary whose selector selects tuples at `sourceRevision` names a creation revision
- **THEN** the loader refuses with `trusted boundary existed at the pilot source revision and needs a predecessor`

#### Scenario: A creation revision without a pilot

- **WHEN** a policy with no `pilot` gives a boundary a creation revision
- **THEN** the loader refuses with `trusted boundary creation revision requires pilot policy`
