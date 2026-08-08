## ADDED Requirements

### Requirement: A project's roles can be added and renamed

A project SHALL accept a new role by name and SHALL accept a new name for a
role it already holds. A role name SHALL be unique within its project and
SHALL NOT constrain any other project's names. A name that is only whitespace
SHALL be refused, and a name SHALL be stored trimmed.

Adding or renaming a role SHALL move the project's revision, because it changes
what every estimate in the project means. It SHALL NOT move any work item's
revision: no work item's own fields or satellites changed.

Only an account that may write to the project may add or rename a role. A
request naming a project that is not there SHALL be refused as not found, and
one naming a role that belongs to another project SHALL be refused the same way.

#### Scenario: adding a role

- **WHEN** a role called `Design` is added to a project holding `Dev` and `QA`
- **THEN** the project holds three roles, and its revision is one higher

#### Scenario: the same name twice

- **WHEN** `Design` is added to a project that already holds `Design`
- **THEN** the second request is refused as taken, and the project still holds
  one `Design`

#### Scenario: the same name in another project

- **WHEN** `Design` is added to two different projects
- **THEN** both are accepted

#### Scenario: renaming onto a name already in use

- **GIVEN** a project holding `Dev` and `QA`
- **WHEN** `QA` is renamed to `Dev`
- **THEN** the request is refused as taken and both names are unchanged

#### Scenario: a name that is only whitespace

- **WHEN** a role is added or renamed with a name of spaces alone
- **THEN** the request is refused and nothing is written

### Requirement: Removing a role says what it would take with it

Removing a role SHALL be refused, by default, when anything in the project
points at it. The refusal SHALL carry how many estimates and how many explicit
assignments hold that role, and SHALL name every work item whose **assumed
assignee** would change — the person derived from a work item holding exactly
one assignment. Removing a role can therefore promote somebody to covering
every phase, or end that assumption, and the refusal SHALL name the work item,
who covers it now and who would.

A role that no estimate and no assignment points at SHALL be removed without a
confirmation: there is nothing to be warned about.

A second request carrying an explicit cascade SHALL remove the role.

#### Scenario: refused with counts

- **GIVEN** a role holding two estimates and one assignment
- **WHEN** it is asked to be removed without a cascade
- **THEN** the request is refused as in use, reporting two estimates and one
  assignment, and the role is still there

#### Scenario: the assumption arrives

- **GIVEN** a work item assigned to one person for `Dev` and another for `QA`
- **WHEN** removing `QA` is asked for
- **THEN** the refusal names that work item, with nobody assumed now and the
  `Dev` assignee assumed afterwards

#### Scenario: the assumption ends

- **GIVEN** a work item whose only assignment is on `QA`
- **WHEN** removing `QA` is asked for
- **THEN** the refusal names that work item, with that person assumed now and
  nobody assumed afterwards

#### Scenario: a work item that keeps its answer

- **GIVEN** a work item assigned for three roles, and another assigned for none
- **WHEN** removing one of the three is asked for
- **THEN** neither work item is named as changing its assumed assignee

#### Scenario: a role nobody uses

- **WHEN** a role no estimate and no assignment points at is asked to be removed
- **THEN** it is removed without a cascade being asked for

### Requirement: A role is removed in one transaction

A confirmed removal SHALL delete the role's estimates, the role's assignments,
the role row, the project's revision bump and a revision bump on every work item
that held one of those estimates or assignments — all in one transaction, or
none of it. `estimate.role_id` has no cascade, so the estimates are deleted
explicitly rather than by the database.

It SHALL leave every other role's estimates and assignments untouched, in that
project and in every other.

An estimate or assignment written for the role **after** the counts were
reported and before the confirmed removal lands SHALL be deleted by that
transaction, and its work item's revision SHALL move. A confirmed removal SHALL
never leave an estimate pointing at a role that is gone, and SHALL never answer
with a server error.

#### Scenario: what a cascade takes

- **GIVEN** a project whose `QA` role holds estimates on two work items and an
  assignment on one, and whose `Dev` role holds estimates on the same work items
- **WHEN** `QA` is removed with a cascade
- **THEN** the `QA` estimates and the `QA` assignment are gone, every `Dev`
  estimate is untouched, and the role is gone

#### Scenario: revisions move with it

- **WHEN** a role holding an estimate on one work item is removed
- **THEN** that work item's revision is one higher, the project's revision is
  one higher, and a work item that held nothing of that role's is unchanged

#### Scenario: an estimate written during the confirmation

- **GIVEN** a removal refused with its counts
- **WHEN** an estimate for that role is written on a third work item and the
  removal is then confirmed
- **THEN** the removal succeeds, that estimate is gone, and that third work
  item's revision has moved

### Requirement: A role change is announced as a durable event

Adding, renaming and removing a role SHALL each record a typed event on the
project's subscription — `role_added`, `role_renamed`, `role_removed` — through
the same sequencer and replay buffer every other project event uses.

The event SHALL be recorded **after** the transaction commits, so any read that
observes the event observes the role change too. A tree read reports the
sequence it happened at; because that sequence is read before the rows, a client
holding sequence N is holding roles at least as new as the project was at N.

A client that reconnects and resumes from a sequence before a role event SHALL
be replayed that event, so it re-reads the project's roles rather than drawing
columns for a role that is gone.

#### Scenario: the event carries the role

- **WHEN** a role is added, renamed and then removed
- **THEN** three events are published on that project's subscription, naming
  the role each time

#### Scenario: recorded after the change

- **WHEN** the roles are read at the moment the `role_added` event is published
- **THEN** the new role is already there

#### Scenario: replayed after a reconnect

- **GIVEN** a client that saw the project's stream up to sequence N
- **WHEN** a role is removed and the client resumes from N
- **THEN** the `role_removed` event is replayed to it

### Requirement: Role changes are not journalled

Adding, renaming and removing a role SHALL NOT append to the command journal,
as the project's start date does not. There is no undo for a role change, and
the revision bumps the removal makes are what stop an entry already in the
stack from being applied against a plan whose phases have changed.

#### Scenario: the stack is left alone

- **GIVEN** an account that has just renamed a work item
- **WHEN** a role is added and another removed
- **THEN** the account's next undo reverses the rename

#### Scenario: an estimate whose role has gone

- **GIVEN** an account that estimated a work item for a role
- **WHEN** that role is removed and the account presses undo
- **THEN** the undo refuses as stale rather than writing an estimate for a role
  that is not there

### Requirement: The starting roles are a seed, not a limit

A new project SHALL still be created holding `Dev` and `QA`. Those two SHALL be
data the service writes rather than the set of roles a project may hold: a
project may hold more, may hold them under other names, and may hold none.

#### Scenario: a project still starts with two

- **WHEN** a project is created
- **THEN** it holds `Dev` and `QA`

#### Scenario: a third role takes estimates

- **WHEN** `Design` is added to a project and a work item is estimated for it
- **THEN** the work item reports that estimate beside its `Dev` and `QA` ones
