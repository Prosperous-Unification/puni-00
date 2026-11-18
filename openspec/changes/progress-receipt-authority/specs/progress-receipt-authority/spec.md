## ADDED Requirements

### Requirement: WBS owns the accepted planning reference

WBS SHALL reproduce the reference and tasks from the original ordinary export and requirements bytes and bind them to an organization, project, repository and change. Explicit acceptance SHALL require current operator permission, a matching complete live WBS plan and an exact prior version/digest or explicit initial absence, checked at the same SQLite mutation boundary.

#### Scenario: Two operators replace the same basis

- **WHEN** both are authorized and request different references against the same version and digest
- **THEN** only one advances the reference and the other receives a conflict with no partial record

#### Scenario: A matching digest is presented for another plan or scope

- **WHEN** the supplied task export or reference disagrees with WBS planning contents, project identity or permitted scope
- **THEN** WBS refuses acceptance and preserves the previous reference

#### Scenario: Submitted requirements change under the same offered reference

- **WHEN** the operator submits different requirements bytes with the original reference, export and tasks
- **THEN** WBS refuses the mismatch before publishing a version

#### Scenario: The live plan becomes connected

- **WHEN** a valid ordinary v11 export is presented for acceptance after its project became connected
- **THEN** the writer refuses and preserves the prior binding

#### Scenario: A reader retrieves the approved export later

- **WHEN** an authorized reader requests a previously accepted version
- **THEN** WBS returns its exact original export bytes, complete reference and task identity even if live progress or the export clock has advanced

### Requirement: WBS attributes a bounded operator assertion

WBS SHALL derive the issuer from an independently authenticated invocation and consult protected current issuer policy for the exact scope. It SHALL bind a stable issuer-scoped assertion ID to a complete schema-2 receipt, accepted-reference version and policy revision. Submission alone SHALL have no progress effect.

#### Scenario: An agent shares the granted human’s account

- **WHEN** reference acceptance, assertion submission or a new application arrives under a machine or MCP-consent credential for the same account, or without verified human sign-in evidence
- **THEN** WBS refuses the operator-only operation inside the writer even if the account still holds a grant

#### Scenario: Candidate asserts its own authority

- **WHEN** a candidate supplies an issuer label, policy, verifier success or modified bound entries without matching independent authority and stored attribution
- **THEN** the authenticated path refuses the substituted claim before any progress effect

#### Scenario: Issuer has no current scoped grant

- **WHEN** a valid readable policy omits the grant, the issuer is revoked, or the grant excludes the organization, repository, plan, change, task or step
- **THEN** WBS denies new attribution or application under that grant

#### Scenario: Protected state fails

- **WHEN** required trusted policy is missing, unreadable or malformed
- **THEN** WBS reports the failure and retains no partial attribution or progress

#### Scenario: Operator asserts unexecuted work

- **WHEN** the authenticated operator submits a valid assertion without qualified execution evidence
- **THEN** its attribution identifies an operator claim and conveys no execution verdict

### Requirement: WBS applies a receipt explicitly and at most once

On an explicit application command WBS SHALL derive the ordered effects from the attributed content, verify current issuer and caller permissions, current accepted version/digest and exact live targets/basis, and commit the resulting progress, journal, retained answer and unique assertion consumption in one transaction. Local Navigator schema-1/2 proposal semantics SHALL be preserved.

#### Scenario: A grant, reference or live target changes

- **WHEN** revocation wins serialization, the accepted-reference version changes (including A → B → A), or the observed ordinary live basis differs at application
- **THEN** the application refuses the obsolete authorization or basis with no partial effects and requires explicit resolution

#### Scenario: A second distinct receipt follows delivery of the first

- **WHEN** an authorized caller uses the write-basis token returned by the first application, its tree notification has been delivered, and there has been no intervening change
- **THEN** WBS accepts the second distinct applicable receipt against the first commit's full post-event basis, with each durable event sequenced once

#### Scenario: Concurrent retries use different application IDs

- **WHEN** two allowed requests consume the same bound receipt under different application or submission IDs, or the first acknowledgment is lost and retried after restart
- **THEN** there is one accepted effect, journal and consumption, and a currently authorized reader recovers its historical result

#### Scenario: Access is withdrawn before historical recovery

- **WHEN** a requester attempts to recover the retained result after losing read permission
- **THEN** WBS refuses disclosure and applies no effect

#### Scenario: One identity carries different content

- **WHEN** an assertion ID or application command ID is reused with changed content or target
- **THEN** WBS reports a conflict, retains the original binding and applies nothing

#### Scenario: Mutation fails after the first progress entry

- **WHEN** a later operation or the consumption write fails
- **THEN** the complete transaction rolls back without progress, journal, consumption or an emitted change notification
