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

### Requirement: Live access ends on membership removal

Membership or role changes SHALL invalidate matching gateway authorization promptly. gw-01 SHALL recheck membership on subscription, replay, forwarded command and a bounded authorization lease; a removed member SHALL stop receiving organization events within five seconds even if invalidation notification is lost. Queued replay SHALL be cancelled before delivery when authority is lost. A socket organization switch SHALL require a new authenticated connection.

#### Scenario: Revocation during replay

- **GIVEN** a replay has queued A events for a member
- **WHEN** their A membership is removed before those events are sent
- **THEN** replay stops and no queued event is delivered after the five-second revocation deadline

#### Scenario: Lost invalidation

- **GIVEN** gateway membership invalidation notification is dropped
- **WHEN** the authorization lease expires after removal
- **THEN** the socket ceases receiving A events within five seconds
