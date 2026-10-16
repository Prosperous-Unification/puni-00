## ADDED Requirements

### Requirement: Explicit production resolver composition

WBS SHALL compose an authoritative DNS adapter only from valid explicit `ORGANIZATION_DNS_RESOLVERS` configuration. Absence SHALL retain the modeled refusing resolver; a present invalid setting SHALL fail startup. The adapter SHALL use only the configured recursive resolver IPs for discovery, without OS resolver fallback. Existing activation, super-admin, expected-organization and claim-policy checks SHALL run before lookup.

#### Scenario: Configured boot reaches the real adapter

- **GIVEN** enabled resolver configuration, an activated disposable organization and an authorized current challenge
- **WHEN** verification runs through `bootBe01` against controlled DNS protocol responses
- **THEN** the production adapter performs discovery and direct authoritative lookup, and only an exact current proof permits promotion
- **AND** omitted adapter wiring causes this acceptance to fail

#### Scenario: Absent and malformed configuration remain distinct

- **GIVEN** configuration is absent, empty, malformed or duplicated
- **WHEN** be-01 starts
- **THEN** absence preserves explicit resolver refusal, while every present invalid setting fails startup
- **AND** no configuration state silently selects the operating system resolver

#### Scenario: Inactive or unauthorized verification performs no DNS query

- **GIVEN** organization activation or current route authority refuses a verification
- **WHEN** the request reaches the mounted route
- **THEN** its existing typed refusal remains and the adapter sends no packet

### Requirement: Bounded authority discovery and direct lookup

The adapter SHALL discover the closest enclosing NS owner for the exact verification name using the configured recursive service and validate every exchange. Discovery errors SHALL not become absence or cause an ancestor fallback. Positive recursive NS, A and AAAA discovery SHALL accept only matching IN records of the requested type and exact owner in the answer section, without aliases or contradictions. Terminal discovery absence SHALL require NOERROR/NODATA or NXDOMAIN with a valid enclosing IN/SOA in the authority section, no alias and no contradictory answer records. SOA-less negatives SHALL be unsupported. Referrals and incomplete responses SHALL try the next configured recursive resolver at the same owner and type, then throw when unresolved; they SHALL NOT advance to an ancestor, skip an unresolved address family or start direct authoritative TXT queries. Direct proof lookup SHALL use RD=0, only validated eligible public IP endpoints on port 53, the original question and a complete AA=1 answer. Limits, retry order, supported response shapes and network restrictions SHALL follow `design.md`; exceeding a limit SHALL throw. Discovery material and AA SHALL NOT be represented as cryptographic authentication.

#### Scenario: Discovery outage cannot select a parent authority

- **GIVEN** the nearest queried owner has an unavailable or malformed NS response from every configured resolver
- **WHEN** discovery runs
- **THEN** lookup throws without advancing to an ancestor or returning an empty TXT set

#### Scenario: Recursive referral cannot become terminal absence

- **GIVEN** an encoded recursive NOERROR response has no matching answer RRset, authority-section NS records and no SOA during NS, A or AAAA discovery
- **WHEN** the production adapter processes that response
- **THEN** it tries the next configured recursive resolver for the same owner and type
- **AND** if every configured resolver returns a referral or incomplete response, lookup throws without issuing an ancestor NS query in response to that unresolved discovery or any direct authoritative TXT packet
- **AND** authority-section NS or additional-section A/AAAA records cannot supply a positive discovery answer

#### Scenario: Only supported terminal negatives permit discovery progress

- **GIVEN** a recursive NOERROR/NODATA or NXDOMAIN response has a valid enclosing authority-section IN/SOA, no alias and no contradictory answer records
- **WHEN** the production adapter validates it during NS or address discovery
- **THEN** NS discovery may query the next ancestor, while address discovery may record absence only for that owner and requested family
- **AND** removing the SOA, using another class or a non-enclosing SOA, adding an alias or contradictory answer prevents that progress and triggers resolver failover followed by failure if unresolved

#### Scenario: Delegated verification owner takes precedence

- **GIVEN** the exact verification owner has its own valid NS RRset
- **WHEN** lookup runs
- **THEN** the selected zone is that owner and its eligible server is asked for the original TXT question

#### Scenario: Unsafe endpoint or disguised address is refused

- **GIVEN** discovered authoritative addresses include private, loopback, link-local, special-purpose or IPv4-mapped prohibited addresses
- **WHEN** the adapter builds endpoints
- **THEN** it refuses before connecting to an authoritative endpoint, even if another discovered address is public

#### Scenario: Incomplete or unrelated answer cannot prove ownership

- **GIVEN** a response has a wrong peer, ID, question, owner, class, opcode, malformed framing, alias, referral or missing AA
- **WHEN** it arrives during the real adapter lookup
- **THEN** it cannot produce proof records; bounded attempts end in failure if no valid answer arrives

### Requirement: TXT record fidelity and explicit absence

The adapter SHALL return one string for each exact-owner IN/TXT resource record, joining only that record's wire fragments without trimming, replacement decoding or case changes. A valid authoritative negative SHALL return an empty array only with enclosing SOA evidence and no contradictory answers. A failed lookup SHALL throw. UDP truncation SHALL require a complete validated TCP answer from the same endpoint before interpretation.

#### Scenario: Fragmented proof stays within one record

- **GIVEN** one TXT record contains a proof split across fragments and another contains unrelated text
- **WHEN** the adapter receives the complete authoritative response
- **THEN** it returns the joined proof and unrelated text as separate strings
- **AND** fragments from separate records cannot be joined into a matching proof

#### Scenario: Absence and outage preserve different HTTP outcomes

- **GIVEN** a valid authoritative negative or an unavailable/malformed lookup
- **WHEN** verification runs through production composition
- **THEN** valid absence receives the existing proof-mismatch refusal and unavailable lookup receives `503 dns_unavailable`
- **AND** neither promotes the claim or changes ownership

#### Scenario: Truncation cannot hide missing proof or admit partial proof

- **GIVEN** a matching UDP reply has TC set
- **WHEN** the adapter receives it
- **THEN** it retries over TCP within the same attempt budget and uses only the complete validated TCP response
- **AND** absent, malformed, still-truncated or timed-out TCP cannot produce an empty or successful TXT observation

### Requirement: Total deadline and resource cleanup

Discovery, authoritative attempts and TCP fallback SHALL share a maximum five-second call deadline shortened by caller cancellation. Each authoritative endpoint attempt SHALL consume at most one second of that total. The adapter SHALL reserve cleanup time within those maxima as specified in `design.md`. Cancellation SHALL stop work immediately and settle after bounded cleanup. Proof and ordinary failure SHALL publish only after owned socket closure is acknowledged; thrown or unacknowledged closure SHALL produce terminal explicit cleanup failure, without retry or proof, and SHALL NOT be represented as confirmed closure. Settlement SHALL cancel all owned timers; no late response or other request's reply SHALL publish proof. No raw TXT value, packet or challenge digest SHALL appear in error output. Existing commit-time challenge, current membership, expiry and unique-owner checks SHALL remain authoritative after DNS completes.

#### Scenario: Abort and delayed packets cannot publish

- **GIVEN** a pre-aborted caller, an in-flight abort or an expired shared deadline
- **WHEN** lookup starts or completes late
- **THEN** it rejects, leaves no pending socket/timer and cannot promote a claim

#### Scenario: Synchronous conversion and queued cancellation cannot extend deadlines

- **GIVEN** final packet decoding or TXT conversion crosses the absolute work cutoff, or cancellation arrives during conversion or before publication
- **WHEN** timer callbacks have not yet run or the final await resumes
- **THEN** the adapter rejects instead of returning proof
- **AND** a crossed shared cutoff prevents another endpoint query

#### Scenario: Ownership changes during network work

- **GIVEN** a challenge rotates, membership is removed, activation changes or another organization wins ownership while lookup is pending
- **WHEN** a valid TXT response later arrives
- **THEN** the existing transaction refuses stale promotion and preserves the winning state

### Requirement: Local implementation evidence does not close live acceptance

Local tests and adapter configuration SHALL NOT be described as organization activation, real-domain acceptance, DNSSEC authentication or completion of WBS010.5.4. Retained-proof scheduling SHALL remain a separate change. No deployment setting SHALL be changed by this implementation's local verification.

#### Scenario: Implementation handoff lists external obligations

- **GIVEN** local protocol and mounted verification checks pass
- **WHEN** implementation evidence is recorded
- **THEN** it identifies the exact source and observed R5 faults and leaves controlled real-domain acceptance, operator configuration, activation and scheduling pending
