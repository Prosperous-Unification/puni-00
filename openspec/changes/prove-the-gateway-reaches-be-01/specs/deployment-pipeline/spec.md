## ADDED Requirements

### Requirement: The smoke proves gw-01 can reach be-01

The post-deploy smoke SHALL exercise gw-01's own authenticated call to be-01 over
a real client socket, and MUST fail when gw-01 cannot make that call — including
when gw-01 carries an `INTERNAL_AUTH_SECRET` be-01 rejects, which every other
check in the suite passes.

The proof MUST be an answer only be-01 can produce. A resume for a subscription
no project can own is refused `out_of_range` by be-01, read from its own database;
gw-01 answers `unavailable` from its own catch when the call did not arrive.

#### Scenario: gw-01 holds a secret be-01 rejects

- **WHEN** the smoke runs against a gw-01 whose internal secret is wrong
- **THEN** the suite fails and names the gateway's call to be-01 as what failed

#### Scenario: everything is wired correctly

- **WHEN** the smoke runs against a correctly configured pair
- **THEN** the suite passes, having been answered by be-01

#### Scenario: the gateway answers nothing

- **WHEN** no acknowledgement arrives before the timeout
- **THEN** the check fails and reports which frames did arrive

### Requirement: The smoke reports each half separately

The WS suite SHALL run both the ping and the backend-hop check on every run, and
report each on its own line, regardless of whether the other failed.

#### Scenario: the socket is up but the backend is not reachable from it

- **WHEN** the ping succeeds and the backend hop fails
- **THEN** both results are reported and the suite fails
