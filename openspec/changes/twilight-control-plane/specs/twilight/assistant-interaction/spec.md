## ADDED Requirements

### Requirement: The secretary remains available while delegated work runs

The system MUST provide one default secretary conversation for requests of any
kind. When a request needs sustained work, the secretary MUST create a durable
assignment for a worker session, return its reference, and finish the delegating
turn without waiting for that work to finish. Interactive secretary capacity MUST
be admitted independently from worker capacity. Saturation, startup and provider
limits MUST be visible and MUST NOT be represented as availability.

#### Scenario: A long request is delegated

- **GIVEN** the secretary accepts a request that requires sustained research or execution
- **WHEN** it delegates the request
- **THEN** it records the worker, assignment and session references, responds to Dany, and remains able to accept another request while the assignment continues

#### Scenario: Worker capacity is saturated

- **GIVEN** every permitted worker slot is occupied
- **WHEN** the secretary accepts another delegable request
- **THEN** it records the assignment as queued with the limiting pool, remains conversationally available, and does not claim that work has started

#### Scenario: Interactive capacity is unavailable

- **GIVEN** the secretary's reserved session or provider capacity cannot be acquired
- **WHEN** Dany sends a request
- **THEN** the surface shows the measured unavailable or delayed state and retains the request for modeled retry without reporting an answered turn

### Requirement: Software delivery enters one authority boundary

The assistant runtime MUST remain usable for general requests. A software-delivery
request MUST enter Twilight through an authenticated, authorized operation that
returns durable work references. Conversation text, worker instructions and
OpenClaw session state MUST NOT expand the execution envelope, approve a plan,
publish source or release production.

#### Scenario: A general request stays in the assistant runtime

- **GIVEN** a request has no software-delivery effect
- **WHEN** the secretary handles or delegates it
- **THEN** no Twilight delivery run is created merely because a worker session exists

#### Scenario: A software request is submitted

- **GIVEN** the caller is allowed to create work for a repository
- **WHEN** the secretary submits the request through Twilight
- **THEN** Twilight returns immutable request and run references and applies its normal planning, budget and decision boundaries

#### Scenario: Conversation asks for broader authority

- **GIVEN** an approved run has a bounded execution envelope
- **WHEN** any assistant or worker message asks to exceed that envelope or release production
- **THEN** the action remains blocked until the owning Twilight decision operation supplies the required authority

### Requirement: Workers are stable, renameable presentation identities

Twilight MUST represent a worker independently from its assignments, sessions,
model and OpenClaw configured-agent identity. Dany MUST be able to rename a worker
without changing its stable identity, history ownership or active assignments.
Worker names MUST NOT imply fixed occupational roles or grant authority.

#### Scenario: A worker is renamed during an assignment

- **GIVEN** a worker has active and completed assignments
- **WHEN** Dany changes its display name
- **THEN** every view uses the new name while stable references, session history, assignment ownership and permissions remain unchanged

#### Scenario: A runtime session is replaced

- **GIVEN** a worker assignment resumes in a new OpenClaw session or model
- **WHEN** Twilight binds that session
- **THEN** the same worker and assignment remain visible and the runtime change is recorded rather than creating a new worker identity

#### Scenario: A name resembles a privileged role

- **GIVEN** Dany renames a worker to a role-like or privileged name
- **WHEN** the worker next acts
- **THEN** its capabilities remain those of the current assignment and execution envelope

### Requirement: Every permitted session is explorable and searchable

Twilight MUST retain a redacted, access-controlled session corpus for the personal
phase without default age-based deletion. It MUST index user and assistant text,
permitted tool inputs and outputs, assignment links and required inactive branches.
It MUST label omitted or unavailable content. A storage ceiling MUST warn and offer
export before deletion; deletion requires an explicit retention action. Search
results MUST link to the matching session position and structured work context.

#### Scenario: Search finds conversation and tool evidence

- **GIVEN** an authorized user can inspect a session containing matching message and permitted tool-output text
- **WHEN** the user searches the corpus
- **THEN** both matches identify their content kind, worker, assignment, time and exact session position

#### Scenario: An inactive branch contains the only match

- **GIVEN** required history exists only in an inactive or compacted session branch
- **WHEN** the user searches for its indexed text
- **THEN** the match is returned with its branch status instead of disappearing from the corpus

#### Scenario: Content cannot be retained or shown

- **GIVEN** content is secret, outside the caller's authority or unavailable from the runtime
- **WHEN** capture or search reaches it
- **THEN** Twilight stores or returns an explicit redacted, excluded or unavailable marker without indexing the protected value

#### Scenario: The storage ceiling is reached

- **GIVEN** retained session content reaches its configured personal-phase ceiling
- **WHEN** new content arrives
- **THEN** the system warns with measured usage and export/remediation choices and does not silently delete older history

### Requirement: Work is visible through sourced high-level events

Twilight MUST persist a high-level event stream that projects workers,
assignments, sessions, delivery runs, environments and evidence. Every event MUST
identify its source and time and distinguish observed runtime state,
agent-reported progress and accepted outcomes. A report or message alone MUST NOT
be presented as accepted work or observed deployment.

#### Scenario: A worker reports progress

- **GIVEN** a worker says that implementation is complete
- **WHEN** the work view receives that report before verification
- **THEN** it shows an agent-reported milestone and keeps verification and acceptance incomplete

#### Scenario: Runtime observation disagrees with a report

- **GIVEN** an agent reports work running while the environment adapter observes an older deployed revision
- **WHEN** the work view projects both events
- **THEN** it shows the disagreement and the older observed deployment as current without discarding either event

#### Scenario: Evidence accepts a candidate

- **GIVEN** required automated and manual evidence passes for an exact candidate
- **WHEN** acceptance commits
- **THEN** the work view shows an accepted outcome linked to that candidate, reports and environment

### Requirement: The personal home keeps conversation and work actionable

The default personal home MUST keep the secretary composer available while showing
active workers, assignments, meaningful waits, environments and current evidence.
Conversation-first and delivery-board routes MAY present the same records. Every
worker and assignment MUST open its session history. Environment state MUST expose
desired and observed identities rather than infer deployment from an activity log.

#### Scenario: Dany opens the home during active work

- **GIVEN** assignments are running, queued and waiting for a decision
- **WHEN** Dany opens the default home
- **THEN** he can send a secretary request, distinguish each assignment state, open its worker/session, and reach the required intervention

#### Scenario: No work is active

- **GIVEN** no assignment currently runs
- **WHEN** Dany opens the default home
- **THEN** the secretary remains usable and recent searchable work, environments and evidence remain reachable without fabricated active agents
