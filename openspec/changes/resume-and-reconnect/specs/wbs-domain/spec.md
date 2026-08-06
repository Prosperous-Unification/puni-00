## ADDED Requirements

### Requirement: A project read reports the sequence it was read at

`GET /api/projects/:id/work-items` SHALL return the latest event sequence recorded
for `project:<id>` alongside the work items, so a client can subscribe from a known
point rather than from the moment its socket happened to open. A project with no
recorded events MUST report `-1`.

#### Scenario: a project that has been edited reports its latest sequence

- **WHEN** a project has had three events recorded
- **THEN** reading its work items returns `seq` equal to the sequence of the third

#### Scenario: a project with no events reports -1

- **WHEN** a project that has never been edited is read
- **THEN** `seq` is `-1`

### Requirement: Resume replays the events a client missed

be-01 MUST answer `/internal/resume` from the recorded event stream. For each
requested subscription and its `sinceSeq`, be-01 SHALL return every event with a
sequence greater than `sinceSeq`, in ascending sequence order, taken from the
in-memory replay buffer when it covers the range and from the durable event log
otherwise. A fixed answer that does not read the stream is not an implementation
of this requirement.

#### Scenario: a client that missed two events receives both

- **WHEN** a client resumes a subscription at sequence `4` and events `5` and `6` were recorded
- **THEN** both are returned in that order and the client is told two were replayed

#### Scenario: a client that missed nothing receives nothing

- **WHEN** a client resumes at the latest recorded sequence
- **THEN** no events are returned and the resume is acknowledged as replaying zero

#### Scenario: the buffer is bypassed when it starts too late

- **WHEN** the replay buffer's oldest sequence is greater than the requested `sinceSeq + 1` and the event log still holds the range
- **THEN** the events are served from the event log

### Requirement: Resume is denied when the range cannot be served in full

be-01 MUST answer `denied, out_of_range` for a subscription whose requested range
starts before the oldest event still retained, or whose range exceeds the replay
cap. A denied subscription MUST NOT return a partial replay, because a client that
receives some of a range and is told it succeeded advances past events it never saw.

#### Scenario: retention has removed the requested range

- **WHEN** a client resumes at a sequence older than the oldest retained event
- **THEN** the subscription is denied with `out_of_range` and no events are returned

#### Scenario: a range larger than the cap is refused rather than truncated

- **WHEN** the events after the requested sequence number more than the replay cap
- **THEN** the subscription is denied with `out_of_range` and no events are returned

#### Scenario: an unknown subscription is denied

- **WHEN** a client resumes a subscription that has never recorded an event, at a sequence other than the start
- **THEN** the subscription is denied with `out_of_range`

### Requirement: A replay reaches only the socket that asked for it

gw-01 MUST deliver replayed events to the socket whose `resume` produced them and
to no other socket, even when other sockets hold the same subscription. Each
replayed event MUST reach the client in the same frame shape as a live event, and
the `resume_ack` MUST follow the events it counts.

#### Scenario: a second subscriber to the same project receives nothing

- **WHEN** one of two sockets subscribed to the same project resumes and two events are replayed
- **THEN** the resuming socket receives both events and the other socket receives none

#### Scenario: replayed events precede the acknowledgement

- **WHEN** a resume replays two events
- **THEN** the socket receives both events before `resume_ack`

### Requirement: A dropped subscription reconnects and resumes

fe-01's project subscription SHALL reopen its socket after any close it did not
initiate, with capped exponential backoff and jitter, until the caller
unsubscribes. On each open it MUST resubscribe and resume from the highest
sequence it has seen, and it MUST report a refused resume to the caller so the
caller can refetch instead of trusting stale rows.

#### Scenario: a closed socket is reopened

- **WHEN** the socket closes without the caller unsubscribing
- **THEN** a new socket is opened after a delay, and it subscribes and resumes

#### Scenario: unsubscribing stops the reconnect loop

- **WHEN** the caller unsubscribes and the socket then closes
- **THEN** no further socket is opened

#### Scenario: a refused resume asks the caller to refetch

- **WHEN** the server answers `resume_denied` for the project
- **THEN** the caller's change handler is invoked
