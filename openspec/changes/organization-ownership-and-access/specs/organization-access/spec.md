## ADDED Requirements

### Requirement: Organization ownership is complete

Every project, directory person, team, service, tag, type, external system and saved plan SHALL belong to exactly one organization. Their dependent work items, steps, estimates, schedules, snapshots, journal entries, history and events SHALL inherit that ownership. References across organizations MUST be refused, including import, duplication and batch operations. Project creator and `project_access` SHALL retain their stewardship and recent-open meanings, not define organization access.

#### Scenario: Foreign reference in a batch write

- **GIVEN** a member of organization A and a service in organization B
- **WHEN** the member assigns that service to an A work item in a batch command
- **THEN** the whole command is refused without changing either organization

#### Scenario: Shared names

- **GIVEN** two organizations with separate catalogs
- **WHEN** both create a tag with the same name
- **THEN** both tags exist and remain visible only in their owning organization

#### Scenario: Solution slugs per organization

- **GIVEN** a project in organization B linked to solution slug `s`
- **WHEN** a writer in organization A links an A project to `s`
- **THEN** the link is stored and the solution lookup answers each organization with its own project
- **AND** a second A project linking `s` is refused with `409 solution_taken`, while a viewer or a foreign project is refused before any collision is judged

### Requirement: Active organization and current membership govern every route

An authenticated WBS request SHALL carry exactly one server-validated active organization, selected from current memberships. A browser SHALL offer an organization switcher and clear or refetch organization-scoped state on switch. A user with no membership SHALL see onboarding without access to WBS resources. be-01 SHALL enforce organization and action permission on every protected route, including list, detail, mutation, export, import, history, scheduling, generated MCP tool and internal gateway routes. Missing or invalid credentials SHALL answer typed 401; absent or revoked membership and disallowed action SHALL answer typed 403; a foreign organization's resource SHALL answer typed 404 without exposing its existence. Missing or malformed trusted authorization state SHALL fail as a server error rather than grant access.

#### Scenario: Forged context

- **GIVEN** a member of A with a valid token
- **WHEN** the request supplies B's identifier in a header, body or route without a valid B membership
- **THEN** be-01 refuses it and reveals no B resource

#### Scenario: Removed member with live token

- **GIVEN** an unexpired browser token for a member of A
- **WHEN** an administrator removes the membership and the user calls a protected A route
- **THEN** be-01 answers 403 without waiting for token expiry

#### Scenario: Explicit browser selection is bound to verified credential evidence

- **GIVEN** a current local membership and a verified native or OIDC access credential carried in the access cookie or a Bearer header
- **WHEN** the user selects the organization with an exact same-origin POST
- **THEN** be-01 issues a separate organization cookie bound to that local user and the exact access credential, no longer than that credential's expiry
- **AND** a missing or foreign Origin, duplicate or malformed organization-cookie carrier, different local account, invalid signature, issuer or audience, or absent expiry cannot grant selection; a replacement credential cannot reuse the previous selection and must explicitly select again
- **AND** membership listing and selection responses, including refusals, are not cacheable
- **AND** these browser selection endpoints are excluded from generated MCP tools

#### Scenario: A revoked browser credential cannot recover organization authority

- **GIVEN** an explicitly enabled browser-organization composition and a valid credential with an issued organization cookie
- **WHEN** revocation of that exact verified credential commits to shared storage
- **THEN** subsequent organization-access resolution refuses the complete old access-token and organization-cookie pair with `403 no_active_organization`
- **AND** membership listing and active-organization selection using that credential refuse with `401 unauthenticated`, so reselection cannot restore it
- **AND** the refusal holds in another process and after restart
- **AND** other credentials belonging to the same user and other users retain their independently established authority

#### Scenario: Revocation is durable, monotonic and idempotent

- **GIVEN** concurrent revocation and selection attempts for one verified credential
- **WHEN** its first revocation commits
- **THEN** repeated revocation succeeds without deleting, replacing or weakening the recorded revocation
- **AND** requests beginning after that commit cannot obtain organization authority
- **AND** an in-flight selection cannot produce a cookie that restores authority on a subsequent protected request

#### Scenario: Unavailable revocation authority cannot mean unrevoked

- **GIVEN** browser organization binding is explicitly enabled
- **WHEN** required revocation storage is absent, unreadable or malformed, or its required operation fails
- **THEN** the request fails as a server error without issuing a selection cookie or granting organization access
- **AND** a failed revocation write is never acknowledged as committed

#### Scenario: Rollback cannot erase revocation

- **GIVEN** the browser-credential revocation table contains any record
- **WHEN** its down migration is requested
- **THEN** rollback refuses and preserves both the table and migration ledger
- **AND** an empty-table rollback remains permitted

#### Scenario: Revocation groundwork remains inactive in production

- **GIVEN** the production composition still supplies `NO_BOUND_ORGANIZATION` and refusing selection
- **WHEN** a valid credential and organization cookie are presented
- **THEN** the new revocation capability does not enable selection or scoped access

### Requirement: Browser credential lifecycle commits revoke stale organization authority

OIDC refresh and OIDC browser-session logout SHALL transition through shared durable lifecycle state before acknowledging or issuing browser credentials. Refresh completion SHALL be conditional on the generation captured before provider I/O and SHALL atomically update lifecycle state and B1 credential-revocation rows. Logout SHALL authenticate against any exact credential association retained for that lifecycle, then close and revoke its currently active credential even if refresh advanced the generation. Provider refresh secrets SHALL remain process-local and SHALL NOT be persisted by this requirement. Native browser logout and replacement SHALL revoke only the exact verified credential through B1; an independent native login does not invent a shared refresh lifecycle. A successful refresh SHALL clear the organization-selection cookie and require explicit reselection. Production SHALL continue to refuse organization binding until activation.

#### Scenario: OIDC refresh replaces one verified browser credential

- **GIVEN** an active OIDC browser lifecycle and its current verified access credential
- **WHEN** refresh returns a valid replacement credential
- **THEN** one shared transaction revokes the previous exact credential, associates the verified replacement and advances the lifecycle generation
- **AND** the replacement access cookie is issued only after that transaction commits
- **AND** the previous access-token and organization-cookie pair is refused across processes and after restart
- **AND** the organization cookie is cleared and the replacement credential must explicitly select an organization
- **AND** whether the provider rotates or retains its refresh token, refresh completion uses the same conditional generation transition
- **AND** replacement refresh material is installed in the process-local token store only after the shared transition wins

#### Scenario: Native logout revokes its exact verified credential

- **GIVEN** a native browser request with one currently verified access credential and no OIDC refresh lifecycle
- **WHEN** logout is requested through the common browser endpoint
- **THEN** the server commits B1 revocation for only that exact credential before returning `204`
- **AND** another credential for the same user remains independently usable
- **AND** no synthetic shared refresh lifecycle is created

#### Scenario: Successful login retires a proved browser predecessor

- **GIVEN** the browser presents an active predecessor access credential and, for an OIDC predecessor, its matching lifecycle correlation
- **WHEN** a new OIDC callback or native password login has successfully verified and resolved its identity
- **THEN** an OIDC predecessor's proved lifecycle is closed and its exact current credential revoked, or a native predecessor's exact verified credential is revoked through B1, before replacement cookies are issued
- **AND** a failed callback leaves the predecessor lifecycle and credential unchanged
- **AND** an absent predecessor means the new login is independent; an incomplete or mismatched presented predecessor/correlation is refused without inferring identity from unverified claims
- **AND** the OIDC identity-link callback does not retire the current session because it issues no replacement credential

#### Scenario: Logout with a predecessor credential closes the current successor

- **GIVEN** an authenticated OIDC lifecycle whose refresh has already committed a successor credential
- **WHEN** logout arrives with the exact previously issued predecessor credential and that lifecycle's correlation
- **THEN** the server proves the retained predecessor-to-lifecycle association
- **AND** closes the currently active lifecycle and revokes its successor, regardless of predecessor expiry or generation
- **AND** neither predecessor nor successor can establish organization authority

#### Scenario: Refresh cannot republish identical access-token bytes

- **GIVEN** refresh returns access-token bytes identical to the currently active credential
- **WHEN** the shared transition would revoke that exact credential tuple
- **THEN** refresh refuses to issue the already-revoked bytes and requires reauthentication
- **AND** it does not report successful refresh or carry forward organization selection

#### Scenario: Logout wins a concurrent refresh

- **GIVEN** an active browser lifecycle and a refresh operation waiting for its provider response
- **WHEN** logout commits closure of that lifecycle first
- **THEN** the current access credential is revoked before logout acknowledges success
- **AND** the late refresh completion fails its generation condition and issues no replacement credential
- **AND** any already-issued late response cannot restore organization authority

#### Scenario: Refresh wins before logout

- **GIVEN** an active browser lifecycle and a refresh completion that commits before logout
- **WHEN** logout is processed for that same lifecycle
- **THEN** logout revokes the current replacement credential and closes the lifecycle
- **AND** neither the predecessor nor successor credential can establish organization authority

#### Scenario: Lifecycle transition failures are not acknowledged

- **GIVEN** a browser credential replacement or logout
- **WHEN** required lifecycle state is missing, malformed, unreadable, stale, or its atomic write fails
- **THEN** the operation fails with a typed server or authentication refusal
- **AND** no replacement access cookie or success response is emitted before durable commit
- **AND** a provider logout failure after durable closure does not restore local browser authority
- **AND** provider rotation followed by failed local commit does not blindly replay a possibly spent refresh token
- **AND** replacement material from a losing completion cannot overwrite or delete the winning process-local token record

#### Scenario: Credential replacement preserves independent sessions

- **GIVEN** two independent credentials for the same local user or credentials for different users
- **WHEN** one browser lifecycle refreshes, replaces its credential, or logs out
- **THEN** only the exact associated predecessor credential is revoked
- **AND** unrelated credentials retain their existing authority

#### Scenario: Browser logout is acknowledged by the server

- **GIVEN** a browser session with an identifiable verified access credential and, when present, its correlated refresh lifecycle
- **WHEN** the user signs out
- **THEN** the server commits local revocation and lifecycle closure before returning success and clearing access, refresh-session and organization cookies
- **AND** the browser retires its project and organization runtime only after the server outcome is known
- **AND** an invalid, ambiguous or unidentified lifecycle is refused without claiming server logout succeeded

#### Scenario: Retrying a committed logout is idempotent

- **GIVEN** local lifecycle closure and credential revocation committed but the response was lost or upstream provider revocation failed
- **WHEN** logout is retried with a retained exact credential association to that lifecycle
- **THEN** the server returns local logout success without reopening the lifecycle or requiring successful repeated provider revocation
- **AND** a missing or foreign association remains refused
- **AND** the browser renders signed-out only after server acknowledgment and successful local project/session retirement; it preserves overtaken or fatal retirement outcomes and never restores the revoked runtime

#### Scenario: Lifecycle state remains separate from provider refresh material and organization activation

- **GIVEN** lifecycle state survives a process restart but provider refresh material does not
- **WHEN** a refresh is requested after restart
- **THEN** the server refuses it and requires reauthentication without reopening or weakening committed revocations
- **AND** production remains `NO_BOUND_ORGANIZATION` until its separate activation gate passes

#### Scenario: Native bearer context binds one current organization

- **GIVEN** a native WBS session credential and a current membership in A
- **WHEN** its holder posts `/api/auth/context` selecting A
- **THEN** an enabled composition issues a WBS-signed, at-most-five-minute `wbs-be-01/direct` bearer with an explicit first-party identity and no upstream identity claims
- **AND** a forged organization header or caller-supplied audience cannot change its authority; a foreign or removed membership receives typed 403, and an invalid or substituted credential receives typed 401
- **AND** before activation, and in the production composition pending activation, issuance remains refused

#### Scenario: Foreign project is indistinguishable from an absent one

- **GIVEN** an active member of A and a project owned by B
- **WHEN** the member reads, exports, opens, edits or retries that project by its id
- **THEN** be-01 answers the same typed 404 it answers for an id that names no project, and changes nothing

#### Scenario: Gateway project access check

- **GIVEN** a gateway bearer bound to organization A and a service credential
- **WHEN** the gateway posts `/internal/gateway/projects/:projectId/access` for an A project
- **THEN** be-01 requires both credentials, the gateway audience, read scope and current membership, and answers 204 without granting a lease
- **AND** a foreign B project and an absent project answer identical 404s; context headers do not select the organization

#### Scenario: Organization-unaware behaviour until activation

- **GIVEN** the durable activation marker says `pre_activation`
- **WHEN** any authenticated account calls a project route
- **THEN** be-01 answers as it did before organizations, and re-reads the marker on the next request so activation by another process takes effect without restart

#### Scenario: Multi-organization switch

- **GIVEN** a user belongs to A and B and has A active
- **WHEN** the user selects B
- **THEN** new requests use B only and previously loaded A project state is cleared

### Requirement: Organization roles bound actions

WBS SHALL enforce the role matrix below against current membership; Auth0 groups and OAuth scopes SHALL never create an organization role. Existing scopes SHALL only narrow otherwise permitted actions. A project's restricted flag SHALL continue to limit ordinary project writes to its creator; a super-admin SHALL have an explicit recovery override. The last super-admin MUST NOT be removed or demoted through ordinary administration.

| Action                                                            | Viewer | Member       | Admin        | Super-admin |
| ----------------------------------------------------------------- | ------ | ------------ | ------------ | ----------- |
| Read organization resources                                       | Yes    | Yes          | Yes          | Yes         |
| Create/edit ordinary resources                                    | No     | Yes          | Yes          | Yes         |
| Edit restricted project                                           | No     | Creator only | Creator only | Yes         |
| Invite viewer/member; approve/deny requests; remove viewer/member | No     | No           | Yes          | Yes         |
| Grant/revoke admin; remove admin                                  | No     | No           | No           | Yes         |
| Manage verified domains; transfer ownership; delete organization  | No     | No           | No           | Yes         |

#### Scenario: Admin tries to promote an admin

- **GIVEN** an admin in an organization
- **WHEN** they try to grant the admin or super-admin role
- **THEN** be-01 answers 403 and membership is unchanged

#### Scenario: Final owner protection

- **GIVEN** one super-admin remains
- **WHEN** a role change or removal would leave no super-admin
- **THEN** the transaction is refused and the organization retains its super-admin

#### Scenario: Restricted project recovery

- **GIVEN** a restricted project created by someone else, whether or not that creator is still a member
- **WHEN** a super-admin edits it, including clearing its restriction
- **THEN** the edit succeeds, the original creator remains recorded, and one audit record naming the super-admin, the project and the edited fields is written in the same transaction

#### Scenario: Recovery audit cannot be written

- **GIVEN** a super-admin's recovery edit of a restricted project
- **WHEN** its audit record cannot be written
- **THEN** the edit is rolled back and nothing is changed

#### Scenario: Recovery through a command batch or an undo or redo

- **GIVEN** a restricted project created by someone else
- **WHEN** a super-admin applies a command batch to it, or undoes or redoes one of their own commands in it
- **THEN** the batch or walk succeeds with the creator still recorded, and exactly one audit record naming the super-admin, the project and the command kinds or the journal direction is written in the same transaction
- **AND** a batch or walk that fails at any point, or is refused, leaves no audit record and no partial effect
- **AND** no other actor, project or later request can use that recovery authority

#### Scenario: Recovery through dependent project writes and optimizer Retry

- **GIVEN** a restricted project created by someone else, and a current super-admin of its organization
- **WHEN** that super-admin adds, renames or removes a step; creates, renames, recolors or removes a calendar marker; saves, renames or deletes a saved plan; or retries a failed optimization
- **THEN** each successful operation writes exactly one audit record naming the actor, organization, project and operation in the same transaction as the write, and retains the project's creator
- **AND** a failed, refused or non-retryable operation writes no recovery record and publishes nothing; audit insertion failure rolls the write back and publishes nothing
- **AND** an ordinary creator write writes no recovery record, a non-creator member or admin and a viewer creator are refused, a foreign project answers 404, and a removed super-admin is refused
- **AND** a recovered saved-plan rename or delete may touch another author's plan of that restricted project, while ordinary touches retain the author-or-project-creator rule
- **AND** before activation these routes retain their legacy permissions and behavior
