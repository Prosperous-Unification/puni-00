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

- **GIVEN** a restricted project whose creator is no longer a member
- **WHEN** a super-admin edits it
- **THEN** the edit succeeds and the original creator remains recorded
