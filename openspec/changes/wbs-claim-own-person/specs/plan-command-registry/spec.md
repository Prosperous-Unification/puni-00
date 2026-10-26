## ADDED Requirements

### Requirement: A claim or release naming no person acts for the caller's agent person

When `claimWorkItem` or `releaseWorkItem` names neither `personId` nor `personRef`, the
command SHALL use the agent person of the machine credential or MCP consent that
authenticated the request, and SHALL behave exactly as if it named that person: the same
claim rows, lease, pin refusals, journal stack and undo. A named person SHALL
take precedence over it.

#### Scenario: An API key claims and releases for itself

- **WHEN** an API key pinned to agent person `codex` applies `claimWorkItem` on a leaf with a
  run id and no person, then `releaseWorkItem` on it with no person
- **THEN** both answer 200, the claim rows name `codex` and carry the lease, both journal
  entries sit on `codex`'s stack, and undo of the release restores `codex`'s claims

#### Scenario: Naming no person equals naming the agent person

- **WHEN** the same API key claims once naming no person and once naming `codex`
- **THEN** both write the same claim rows

#### Scenario: Naming another agent is still refused

- **WHEN** an API key pinned to `codex` applies `claimWorkItem` naming `claude`
- **THEN** the batch is refused `403 credential_not_for_person`

### Requirement: An account acting as itself must name the person it claims for

When a request acting as its account (a session, a first-party credential or an upstream
pair) applies `claimWorkItem` or `releaseWorkItem` naming no person, the command SHALL be
refused `400 person_required` naming its position and kind, and the batch SHALL write
nothing. The refusal SHALL come after the work-item, ref and step reference refusals and
before `person_not_bound`.

#### Scenario: A session must name the person

- **WHEN** a browser session applies `claimWorkItem` or `releaseWorkItem` naming no person
- **THEN** the batch is refused `400 person_required` at index 0 and writes no claim and no
  journal entry
