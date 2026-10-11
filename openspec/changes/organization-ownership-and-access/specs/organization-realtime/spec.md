## ADDED Requirements

### Requirement: Gateway channels are organization-authorized

gw-01 SHALL derive user and active organization from verified credentials and current WBS membership, not a client channel name or header. It SHALL authorize each project subscription, presence roster, replay cursor and forwarded command against that organization. Event storage and fan-out SHALL carry organization ownership; a project in another organization SHALL be indistinguishable from an absent project. A replay cursor SHALL never grant access on its own.

#### Scenario: Cross-organization subscribe

- **GIVEN** a user active in organization A and a project in B
- **WHEN** the socket subscribes to B's project channel
- **THEN** gw-01 refuses the subscription and sends no B event or presence

#### Scenario: Forged replay cursor

- **GIVEN** a user active in A with a valid-looking cursor from B
- **WHEN** the socket requests replay from that cursor
- **THEN** no B event is returned and the channel is denied

#### Scenario: Absent and foreign projects are one refusal

- **GIVEN** a socket whose principal cannot read project P, either because P is in another organization or because P does not exist
- **WHEN** the socket subscribes to P or names P in a resume point
- **THEN** the subscribe is refused as `unknown_subscription`, the resume point is denied with reason `forbidden`, and the two causes are indistinguishable

#### Scenario: Gateway proves the socket's principal by its browser credential

- **GIVEN** a socket authenticated by browser cookies
- **WHEN** gw-01 checks a project or asks be-01 to replay
- **THEN** it sends its own secret and those cookies as sent, be-01 proves the principal through its ordinary browser authentication and current membership, a request without the secret or carrying a Bearer is refused 401, and a credential that proves nobody closes the socket with code 1008

#### Scenario: be-01 replays only readable projects

- **GIVEN** a resume reaching be-01 that names a project in another organization, or a name that is no project
- **WHEN** be-01 serves `/internal/resume` for the forwarded principal
- **THEN** that subscription is denied `forbidden` and nothing of it is read from the log

#### Scenario: Unanswered access check fails closed

- **GIVEN** be-01 cannot answer a project access check within its deadline
- **WHEN** the socket subscribes, resumes or renews a lease
- **THEN** nothing is granted and gw-01 closes the socket with code 1013 so the client reconnects and asks again

### Requirement: Live access ends on membership removal

Membership or role changes SHALL invalidate matching gateway authorization promptly. gw-01 SHALL recheck membership on subscription, replay, forwarded command and a bounded authorization lease; a removed member SHALL stop receiving organization events within five seconds even if invalidation notification is lost. Queued replay SHALL be cancelled before delivery when authority is lost. A socket organization switch SHALL require a new authenticated connection.

#### Scenario: Revocation during replay

- **GIVEN** a replay has queued A events for a member
- **WHEN** their A membership is removed before those events are sent
- **THEN** replay stops and no queued event is delivered after the five-second revocation deadline

#### Scenario: Removed member's live subscription

- **GIVEN** a member's socket holds a project subscription
- **WHEN** their membership is removed
- **THEN** the next lease renewal, at most 4.5 seconds later, unsubscribes the socket, removes it from the project roster and sends `subscription_revoked`, while the socket stays open for anything it may still read

#### Scenario: Lost invalidation

- **GIVEN** gateway membership invalidation notification is dropped
- **WHEN** the authorization lease expires after removal
- **THEN** the socket ceases receiving A events within five seconds
