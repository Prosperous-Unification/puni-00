## ADDED Requirements

### Requirement: A global directory of teams and people

The deployment SHALL hold one list of service teams and one list of people,
shared by every project and readable and writable by any authenticated
account. Adding a team or a person by a name that already exists SHALL return
the existing one rather than creating a second. A name that is only whitespace
SHALL be refused. A person MAY belong to several teams; a person belonging to
none is a free agent, which SHALL be the absence of memberships rather than
membership of a team named for it.

#### Scenario: typing a name the list already has

- **WHEN** a team called `Platform` is added twice
- **THEN** one team exists, and both requests answer with it

#### Scenario: a person in two teams

- **WHEN** a person is added to `Platform` and then to `Billing`
- **THEN** one person exists, belonging to both

#### Scenario: a person in none

- **WHEN** a person is added with no teams
- **THEN** they belong to no team, and are reported with an empty team list

### Requirement: A work item carries a team and an assignee per phase

A work item SHALL hold one service team or none, and at most one assignee per
role. Assigning again SHALL replace rather than add. Clearing one role's
assignee SHALL leave every other role, and every other work item, untouched.
The assignee SHALL NOT be constrained by the work item's team.

#### Scenario: reassigning a phase

- **WHEN** a work item's Dev role is assigned to one person and then another
- **THEN** only the second is recorded

#### Scenario: clearing one phase

- **GIVEN** a work item with a Dev and a QA assignee, and another work item
  with a Dev assignee
- **WHEN** the first work item's Dev assignee is cleared
- **THEN** its QA assignee and the other work item's Dev assignee remain

#### Scenario: somebody from another team

- **GIVEN** a work item labelled `Billing`
- **WHEN** a person who belongs only to `Platform` is assigned to it
- **THEN** the assignment is accepted

### Requirement: A lone assignee is reported as doing every phase

A work item SHALL report the one person assigned across its roles as doing
every phase, when exactly one person is assigned. When two or more are
assigned, or none, it SHALL report nobody. This SHALL be derived from the assignments
rather than stored, so that assigning a second person ends the assumption
without anything being rewritten.

#### Scenario: one person, both phases

- **WHEN** only the Dev role of a work item is assigned
- **THEN** that person is reported as doing every phase

#### Scenario: a second assignee ends the assumption

- **WHEN** the QA role is then assigned to somebody else
- **THEN** nobody is reported as doing every phase
