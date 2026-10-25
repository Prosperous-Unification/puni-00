# Permission matrix

The inventory [design.md](design.md) ("Permission vocabulary") summarises. Read on
2026-10-24 at `2e0ab3245` and re-derived at `0b1dddaa0` (main after #663, #704 and #706;
Fable review PM-2, PM-3) from `libs/wbs/domain/contracts/src/commands/definitions.ts`
(61 plan-command kinds, 21 of them directory commands) and from every
`defineEndpointShape` in `libs/wbs/domain/contracts/src/http/*-shapes.ts` (133 endpoints,
bound in `libs/wbs/application/core/src/http/*.routes.ts`), plus the 18 endpoints
`wbs-work-packages` (PR #698) adds (14, and its 2026-10-25 amendment's four organization and
space settings routes, P19).

Paths and names are those after #698's fixes: today's `/api/projects/:id…` is
`/api/work-packages/:id…` (a **work package**), `/api/projects…` is the new engagement
family, `freezeProject` is `freezeWorkPackage`. Endpoint ids follow #698's rule
(`…Project…` becomes `…WorkPackage…` for the old level); where #698 does not spell an id
or a path (rank, gateway, the new project routes' ids), the one here is provisional and the
tests enumerate by method and path. "Today" is the role the current code requires on the
route's predecessor; `new` marks a route #698 or this change adds. `M` means current
membership and nothing else. Slices 3 to 7 enforce this matrix and run after #698 slice 1
(design.md, "Order against #698").

## Roles and the permissions they imply

This table is the seed of `access_role_permission` (`wbs-custom-permissions` CP7): a "yes"
cell is a row, a blank cell is absent, "shell only" is `organization.navigate`; a test
asserts the seed equals the table cell by cell and that its permission ids equal
`PERMISSIONS`' (ids, never a count; CP4).

| Permission                               | org-super-admin | org-admin | org-viewer | project-manager | project-contributor | project-viewer | package-manager | package-contributor | package-viewer  |
| ---------------------------------------- | --------------- | --------- | ---------- | --------------- | ------------------- | -------------- | --------------- | ------------------- | --------------- |
| `organization.navigate`                  | yes             | yes       | yes        | yes             | yes                 | yes            | yes             | yes                 | yes             |
| `organization.read`                      | yes             | yes       | yes        |                 |                     |                |                 |                     |                 |
| `organization.manage_members`            | yes             | yes       |            |                 |                     |                |                 |                     |                 |
| `organization.manage_directory`          | yes             | yes       |            |                 |                     |                |                 |                     |                 |
| `organization.manage_spaces`             | yes             | yes       |            |                 |                     |                |                 |                     |                 |
| `organization.create_project`            | yes             | yes       |            |                 |                     |                |                 |                     |                 |
| `organization.manage_access`             | yes             | yes       |            |                 |                     |                |                 |                     |                 |
| `organization.manage_organization_roles` | yes             |           |            |                 |                     |                |                 |                     |                 |
| `organization.manage_security`           | yes             |           |            |                 |                     |                |                 |                     |                 |
| `organization.manage_capacity_mode`      | yes             |           |            |                 |                     |                |                 |                     |                 |
| `organization.recover_restricted`        | yes             |           |            |                 |                     |                |                 |                     |                 |
| `project.read`                           | yes             | yes       | yes        | yes             | yes                 | yes            | shell only (P3) | shell only (P3)     | shell only (P3) |
| `project.manage_settings`                | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.manage_budgets`                 | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.manage_dependencies` (reserved) | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.manage_packages`                | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.grant`                          | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `package.read`                           | yes             | yes       | yes        | yes             | yes                 | yes            | yes             | yes                 | yes             |
| `package.write`                          | yes             | yes       |            | yes             | yes                 |                | yes             | yes                 |                 |
| `package.manage_settings`                | yes             | yes       |            | yes             |                     |                | yes             |                     |                 |
| `package.claim_for_others`               | yes             | yes       |            | yes             |                     |                | yes             |                     |                 |
| `organization.manage_settings` (P19)     | yes             | yes       |            |                 |                     |                |                 |                     |                 |

A machine credential's row is the contributor row of the grants naming it (P12, P17); its
bound account's grants, groups and the organization-members subject do not reach it. On a
restricted work package, organization-scope grants are skipped except `org-admin` and
`org-super-admin` held directly or through a group, which count as viewer; an
`org-super-admin` may also clear the flag through `organization.recover_restricted` (P5).
A `package-*` or `project-*` role granted at organization scope counts only for the kinds
it governs (P9). Sizes: 9 roles × 22 permissions (P19 added `organization.manage_settings`);
61 command kinds and 159 endpoints below.

## Plan-command kinds (`POST /api/work-packages/:id/commands`, 40)

Each command is checked at the work package the batch addresses, `setBudget` and
`clearBudget` at that work package's project (the organization row only until #698 slice
2), inside the batch's transaction; the batch is refused whole on the first short
permission (P10).

| Permission                 | Kinds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Today          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `package.write`            | `createWorkItem`, `patchWorkItem`, `moveWorkItem`, `duplicateWorkItem`, `deleteWorkItem`, `setEstimate`, `clearEstimate`, `setActual`, `clearActual`, `setProgress`, `setStepBlocked`, `clearProgress`, `startAttempt`, `endAttempt`, `removeAttempt`, `setStatus`, `setMeasure`, `clearMeasure`, `setAssignee`, `assignSubtree`, `claimWorkItem`, `releaseWorkItem`, `addDependency`, `removeDependency`, `addTypedDependency`, `updateTypedDependency`, `removeTypedDependency`, `arrangeBySchedule`, `unfreezeWorkItem`, `setDemand`, `setMeasureEstimate`, `clearMeasureEstimate` (32) | member+creator |
| `package.manage_settings`  | `freezeWorkPackage`, `unfreezeWorkPackage`, `setCapacity`, `setResourceCapacity`, `setStepAllowance`, `setPriorityBands` (6)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | member+creator |
| `project.manage_budgets`   | `setBudget`, `clearBudget` (2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | member+creator |
| `package.claim_for_others` | additionally, `claimWorkItem` and `releaseWorkItem` naming a person not bound to the caller's account outside a delegated claim (the `isClaimAdmin` bypass)                                                                                                                                                                                                                                                                                                                                                                                                                                | admin          |

A typed dependency whose other end lies in another work package needs `package.write` at
both ends until `project.manage_dependencies` gains behaviour. `createWorkItem` and
`patchWorkItem` naming a type outside the project's `allowedWorkItemTypes` are refused
`409 type_not_allowed_in_project` after the permission passes (#698 E22).

## Directory commands (`POST /api/directory/commands`, 21)

| Permission                      | Kinds                                                                                                                                                                                                                                                                                                | Today                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `organization.manage_directory` | `createTeam`, `patchTeam`, `deleteTeam`, `createPerson`, `patchPerson`, `deletePerson`, `createTag`, `patchTag`, `deleteTag`, `createService`, `patchService`, `deleteService`, `createWorkItemType`, `patchWorkItemType`, `deleteWorkItemType`, `createResource`, `patchResource`, `deleteResource` | member                                                                 |
| `organization.manage_directory` | `createMeasure`, `patchMeasure`, `deleteMeasure` (measure definitions)                                                                                                                                                                                                                               | admin (`mayDefineMeasuresInOrganization`, `organization-access.ts:54`) |

`patchPerson` with `accountId` (binding) was admin-only and stays inside
`organization.manage_directory`. A `deletePerson … cascade` that revokes machine
credentials keeps A24's reach rule, now read from `organization.manage_directory`. Work
item types stay directory-global (#698 E22); a project's allow-list of them is a project
setting, below.

## Routes (159)

### Membership only, pre-membership, or infrastructure (`M`, 38)

| Method and path                                                                                                                          | Endpoint                                                                            | Note                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*` (11: context, link, link callback, login ×2, logout, me, methods, okta callback, refresh, register)                        | `issueBearerContext` … `registerPassword`                                           | authentication, before any organization                                                                      |
| `GET /health`, `GET /metrics`                                                                                                            | `health`, `metrics`                                                                 | infrastructure                                                                                               |
| `GET /api/onboarding`, `POST /api/onboarding/{email-challenges,email-challenges/confirm,invitations/accept,join-requests,organizations}` | `readOnboarding` … `createOnboardingOrganization`                                   | pre-membership; the creator receives `org-super-admin` (P11)                                                 |
| `GET /api/organization/memberships`, `GET`/`POST /api/organization/active`                                                               | `listOrganizationMemberships`, `readActiveOrganization`, `selectActiveOrganization` | own memberships                                                                                              |
| `GET /api/organization`                                                                                                                  | `readCapacityMode`                                                                  | name and capacity mode, which every reader renders                                                           |
| `GET /api/timezones`                                                                                                                     | `readTimezones`                                                                     | static                                                                                                       |
| `GET`/`POST /api/organization/machine-credentials`, `POST …/:id/rotate`, `DELETE …/:id`                                                  | `listMachineCredentials` … `revokeMachineCredential`                                | for agents bound to the caller's account (A7); every agent needs `organization.manage_directory`             |
| `POST /api/claims/renew`                                                                                                                 | `renewClaimLeases`                                                                  | the caller's own leases in work packages it can still read; the rest are skipped and expire naturally (PM-7) |
| `PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report`                                                           | `putCapacityReport`                                                                 | the provider's own machine credential (`compute-providers` P6)                                               |
| `POST /api/smoke/echo`                                                                                                                   | `smokeEcho`                                                                         | unchanged                                                                                                    |
| `POST /internal/mcp/{organizations,delegation,authority,credentials,credentials/ended}`                                                  | `listMcpOrganizations` … `endMcpConsentCredential`                                  | service secret; unchanged                                                                                    |
| `POST /internal/forward`, `POST /internal/resume`                                                                                        | `forwardInternal`, `resumeInternal`                                                 | service; the forwarded principal is checked by the target                                                    |

### Lists: `200` with the visible subset (11)

Every member gets `200`; `organization.navigate` (any grant) decides whether the directory
rows and spaces are in the subset (P10). A plain member gets `[]`, except their own agent
persons in `GET /api/people`.

| Method and path                                                          | Endpoint                                                                                          | Today  | Subset                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/{people,teams,services,tags,work-item-types,external-systems}` | `listPeople`, `listTeams`, `listServices`, `listTags`, `listWorkItemTypes`, `listExternalSystems` | member | the directory with `organization.navigate`; agent persons: every one with `organization.manage_directory`, else own |
| `GET /api/people/load`, `GET /api/people/:personId/load`                 | `readOrganizationLoad`, `readPersonLoad`                                                          | member | folded over readable work packages only                                                                             |
| `GET /api/spaces`, `GET /api/organization/work-package-rank`             | `listSpaces`, `readWorkPackageRank`                                                               | member | spaces with `organization.navigate`, their members and the rank filtered through `readablePackageIds`               |
| `GET /api/measures`                                                      | `listMeasures`                                                                                    | member | the directory's measure definitions with `organization.navigate`                                                    |

`GET /api/work-packages` and `GET /api/projects` are lists too and follow the same rule;
they are counted under `package.read` and `project.read` below.

### `organization.read` (5)

| Method and path                       | Endpoint                   | Today                                    |
| ------------------------------------- | -------------------------- | ---------------------------------------- |
| `GET /api/organization/members`       | `listMembers`              | admin (P4 widens it to `org-viewer`)     |
| `GET /api/organization/limits`        | `readOrganizationLimits`   | admin                                    |
| `GET /api/organization/grants`        | `listGrants`               | new; `?subject=me` needs membership only |
| `GET /api/organization/access-groups` | `listAccessGroups`         | new                                      |
| `GET /api/organization/settings`      | `readOrganizationSettings` | new (#698 E18; P19)                      |

### `organization.manage_members` (7)

| Method and path                                                    | Endpoint                                                    | Today | Note                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `DELETE /api/organization/members/:userId`                         | `removeMember`                                              | admin | removing an organization-role holder needs `organization.manage_organization_roles`; last super-admin refused |
| `GET`/`POST /api/organization/invitations`, `DELETE …/:id`         | `listInvitations`, `createInvitation`, `revokeInvitation`   | admin | the initial grant obeys P11                                                                                   |
| `GET /api/organization/join-requests`, `POST …/:id/{approve,deny}` | `listJoinRequests`, `approveJoinRequest`, `denyJoinRequest` | admin | approval's initial grant obeys P11                                                                            |

`PATCH /api/organization/members/:userId` (`changeMemberRole`, admin today) is
**removed**; grants replace it.

### `organization.manage_directory` (5 routes, one of them carrying the 18 commands)

| Method and path                                                          | Endpoint                                                                                            | Today  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ |
| `POST /api/directory/commands`                                           | `applyDirectoryCommands`                                                                            | member |
| `GET`/`POST /api/organization/compute-providers`, `PATCH`/`DELETE …/:id` | `listComputeProviders`, `registerComputeProvider`, `updateComputeProvider`, `removeComputeProvider` | admin  |

### `organization.manage_spaces` (12)

| Method and path                                                                                 | Endpoint                                                                 | Today                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `POST /api/spaces`, `PATCH`/`DELETE /api/spaces/:id`                                            | `createSpace`, `renameSpace`, `removeSpace`                              | member                                                                        |
| `POST /api/spaces/:id/projects`, `DELETE …/:projectId`, `POST …/:projectId/move`                | `addSpaceProject`, `removeSpaceProject`, `moveSpaceProject`              | member (`/api/spaces/:id/work-packages…` from #698 slice 1 until its slice 3) |
| `POST`/`DELETE /api/spaces/:id/people/:personId`, `POST`/`DELETE /api/spaces/:id/teams/:teamId` | `addSpacePerson`, `removeSpacePerson`, `addSpaceTeam`, `removeSpaceTeam` | new (#698 E23)                                                                |
| `POST /api/organization/work-packages/:id/rank`                                                 | `moveWorkPackageRank`                                                    | admin (`project-rank.resource.ts:61`)                                         |
| `PATCH /api/spaces/:id/settings`                                                                | `patchSpaceSettings`                                                     | new (#698 E18; P19); the read is under `package.read`                         |

Every project or work package a space write names must also be readable
(`404 not_found` otherwise), as `space-authorization` states.

### `organization.manage_access` and `organization.manage_organization_roles` (7, new)

| Method and path                                                                                                      | Endpoint                                                                                             | Permission                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/organization/grants`, `DELETE …/:id`                                                                      | `grantRole`, `revokeRole`                                                                            | organization roles: `manage_organization_roles`; project and package roles: `manage_access`, or `project.grant` at the work package's project for a package role; not narrowed by a restricted target (P5); a `machine_credential` subject takes the same permission and escalation rule as a person (P17) |
| `POST /api/organization/access-groups`, `PATCH`/`DELETE …/:id`, `POST …/:id/members`, `DELETE …/:id/members/:userId` | `createAccessGroup`, `renameAccessGroup`, `deleteAccessGroup`, `addGroupMember`, `removeGroupMember` | `manage_access`                                                                                                                                                                                                                                                                                            |

### `organization.manage_security` (19)

| Method and path                                                                                    | Endpoint                                                                                                           | Today                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `GET /api/organization/domains`, `POST …/challenges`, `DELETE …/:id`, `POST …/:id/{rotate,verify}` | `listOrganizationDomains`, `createDomainChallenge`, `releaseDomainClaim`, `rotateDomainProof`, `verifyDomainClaim` | super-admin          |
| `GET`/`POST /api/organization/sso-connections`, `PATCH`/`DELETE …/:id`                             | `listSsoConnections`, `createSsoConnection`, `updateSsoConnection`, `removeSsoConnection`                          | super-admin          |
| `GET`/`PUT /api/organization/session-policy`                                                       | `readSessionPolicy`, `setSessionPolicy`                                                                            | super-admin          |
| `GET`/`POST /api/organization/provisioning-tokens`, `POST …/:id/rotate`, `DELETE …/:id`            | `listProvisioningTokens`, `issueProvisioningToken`, `rotateProvisioningToken`, `revokeProvisioningToken`           | super-admin          |
| `GET`/`POST /api/organization/trusted-issuers`, `DELETE …/:id`                                     | `listTrustedIssuers`, `registerTrustedIssuer`, `removeTrustedIssuer`                                               | admin (narrowed, P7) |
| `POST /api/organization/shared-people/restore-approvals`                                           | `approveSharedPeopleRestore`                                                                                       | super-admin          |

### `organization.manage_capacity_mode` (1)

| Method and path           | Endpoint             | Today                        |
| ------------------------- | -------------------- | ---------------------------- |
| `PATCH /api/organization` | `switchCapacityMode` | super-admin, never delegated |

### `organization.create_project` (1)

| Method and path                            | Endpoint        | Today                 | Note                                                                                             |
| ------------------------------------------ | --------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/projects`                       | `createProject` | new (#698 E17: admin) | the creator receives `project-manager` (P6)                                                      |
| `POST /api/projects { name, workPackage }` | `createProject` | new (#698 E30)        | one transaction; the creator also receives `package-manager` on the first work package (P6, P19) |

### `organization.manage_settings` (1, P19)

| Method and path                    | Endpoint                    | Today          |
| ---------------------------------- | --------------------------- | -------------- |
| `PATCH /api/organization/settings` | `patchOrganizationSettings` | new (#698 E18) |

### `project.read` (3)

| Method and path                  | Endpoint              | Today              | Note                                                                                                    |
| -------------------------------- | --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET /api/projects`              | `listProjects`        | new (every member) | list: the projects where `project.read` holds, plus the shells of projects with a readable package (P3) |
| `GET /api/projects/:id`          | `readProject`         | new                | a shell-only principal gets `403` naming `project.read`                                                 |
| `GET /api/projects/:id/settings` | `readProjectSettings` | new                | resolved with provenance (#698 E18)                                                                     |

### `project.manage_settings` (6)

| Method and path                                            | Endpoint                                                   | Today                                            | Note                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `PATCH /api/projects/:id`                                  | `patchProject`                                             | new (admin)                                      | name                                                                                                                  |
| `DELETE /api/projects/:id`                                 | `deleteProject`                                            | new (admin)                                      | `409 not_empty` after the permission                                                                                  |
| `PATCH /api/projects/:id/settings`                         | `patchProjectSettings`                                     | new                                              | timezone, PERT weights, calendar markers, `allowedWorkItemTypes` (the type allow-list)                                |
| `POST /api/projects/:id/steps`, `PATCH`/`DELETE …/:stepId` | `addProjectStep`, `renameProjectStep`, `removeProjectStep` | member+creator on the work package's steps today | project steps from #698 slice 3; until then the step routes are `/api/work-packages/:id/steps…` under `package.write` |

### `project.manage_packages` (3)

| Method and path                    | Endpoint                                    | Today                                          | Note                                                                                                                                          |
| ---------------------------------- | ------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/work-packages`          | `createWorkPackage` (`createProject` today) | member                                         | at the project the body names; the creator receives `package-manager` (P6). Slice 2, before #698 slice 2: `organization.create_project` (P16) |
| `POST /api/work-packages/import`   | `importWorkPackage` (`importProject` today) | member                                         | same                                                                                                                                          |
| `POST /api/work-packages/:id/move` | `moveWorkPackage`                           | new (#698 E17: admin plus edit on the package) | at **both** the source and the target project; the package must be readable (`404` otherwise); its restriction moves with it                  |

Budgets are written by the `setBudget` and `clearBudget` plan commands under
`project.manage_budgets` (above); dependencies arrive with a later change and take
`project.manage_dependencies`.

### `package.read` (28)

| Method and path                                                                                                                                                                                                                                                     | Endpoint                                                                                                                                                                                                                                                     | Today                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `GET /api/work-packages`                                                                                                                                                                                                                                            | `listWorkPackages`                                                                                                                                                                                                                                           | viewer                                                                                       |
| `GET /api/work-packages/:id`, `…/export`, `…/history`, `…/work-items`, `…/work-items/:workItemId`, `…/work-item-rows`, `…/step-references`, `…/startable`, `…/resources`, `…/people/:personId/work`, `…/saved-plans`, `…/saved-plans/compare`, `…/calendar-markers` | `readWorkPackage`, `exportWorkPackage`, `readHistory`, `getWorkItems`, `getWorkItem`, `getWorkItemRows`, `getStepReference`, `readStartableWork`, `readWorkPackageResources`, `readPersonWork`, `listSavedPlans`, `compareSavedPlans`, `listCalendarMarkers` | viewer                                                                                       |
| `GET /api/work-packages/:id/settings`                                                                                                                                                                                                                               | `readWorkPackageSettings`                                                                                                                                                                                                                                    | new                                                                                          |
| `GET /api/saved-plans/:id`                                                                                                                                                                                                                                          | `readSavedPlan`                                                                                                                                                                                                                                              | viewer                                                                                       |
| `POST /api/work-packages/:id/opened`                                                                                                                                                                                                                                | `recordWorkPackageOpen`                                                                                                                                                                                                                                      | viewer                                                                                       |
| `GET /plans/by-solution/:slug`                                                                                                                                                                                                                                      | `readSolution`                                                                                                                                                                                                                                               | viewer                                                                                       |
| `GET /api/spaces/:id`, `…/roll-ups`, `…/in-progress`                                                                                                                                                                                                                | `readSpace`, `readSpaceRollUps`, `readSpaceInProgress`                                                                                                                                                                                                       | member                                                                                       |
| `GET /api/spaces/:id/settings`                                                                                                                                                                                                                                      | `readSpaceSettings`                                                                                                                                                                                                                                          | new (#698 E18; P19): `organization.navigate` and a readable project in the space, else `404` |
| `GET /api/work-packages/:id/claims`, `…/claim-history`, `…/budget-headroom`                                                                                                                                                                                         | `readWorkPackageClaims` (`readProjectClaims` today), `readClaimHistory`, `readBudgetHeadroom`                                                                                                                                                                | viewer                                                                                       |
| `GET /api/work-packages/:id/work-items/:workItemId/refs/:refId/delivery`                                                                                                                                                                                            | `getWorkItemDelivery`                                                                                                                                                                                                                                        | viewer                                                                                       |
| `POST /internal/gateway/work-packages/:workPackageId/{access,browser-access}`                                                                                                                                                                                       | `gatewayWorkPackageAccess`, `gatewayBrowserWorkPackageAccess`                                                                                                                                                                                                | viewer                                                                                       |

`GET /api/work-packages` answers `200` with the readable subset for any member (P10); the
single-package reads answer `404 not_found` when the package is unreadable. A space read
answers `404 not_found` for a principal without `organization.navigate` and shows only
readable work packages and projects otherwise.

### `package.write` (9)

| Method and path                                                                  | Endpoint                                                               | Today          | Note                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/work-packages/:id/commands`                                           | `applyWorkPackageCommands`                                             | member+creator | per kind, above                                                                                          |
| `POST /api/work-packages/:id/undo`, `…/redo`                                     | `undoWorkPackage`, `redoWorkPackage`                                   | member+creator | plus each walked command kind's permission                                                               |
| `POST /api/work-packages/:id/calendar-markers`, `PATCH`/`DELETE …/:markerId`     | `createCalendarMarker`, `updateCalendarMarker`, `removeCalendarMarker` | member+creator | the package's own markers; project markers are `PATCH /api/projects/:id/settings`                        |
| `POST /api/work-packages/:id/saved-plans`, `PATCH`/`DELETE /api/saved-plans/:id` | `savePlan`, `renameSavedPlan`, `deleteSavedPlan`                       | member+creator | rename and delete keep the author-or-manager rule (`package.manage_settings` replaces "project creator") |

### `package.manage_settings` (3)

| Method and path                                  | Endpoint                       | Today          | Note                                                                |
| ------------------------------------------------ | ------------------------------ | -------------- | ------------------------------------------------------------------- |
| `PATCH /api/work-packages/:id`                   | `patchWorkPackage`             | member+creator | name, estimate method, reach, optimizer, `restricted`               |
| `PATCH /api/work-packages/:id/settings`          | `patchWorkPackageSettings`     | new            | overrides of timezone, PERT weights and calendar markers (#698 E18) |
| `POST /api/work-packages/:id/optimization/retry` | `retryWorkPackageOptimization` | member+creator |                                                                     |

Setting `restricted` is `package.manage_settings`, and the caller's direct creation grant
keeps them in (P5, P6). Clearing it is `package.manage_settings`, or, for an
`org-super-admin` without it, the audited recovery under `organization.recover_restricted`
(`restricted_work_package_recovery`, P5).

## Totals

- Permissions: 22 over 4 evaluation kinds (P19 added `organization.manage_settings`); roles:
  9 (9 × 22 cells above).
- Plan-command kinds: 61 (40 work package, 21 directory), each with exactly one permission.
- Contract endpoints today: 133 (128 at `2e0ab3245`; #663, #704 and #706 added
  `listMeasures`, `readBudgetHeadroom`, `readProjectClaims`, `readClaimHistory` and
  `getWorkItemDelivery`). #698 adds 18 (the `/api/projects` family 7, `move` 1, work
  package settings 2, space people and teams 4, organization and space settings 4; its
  project steps replace the three work package step routes). This change removes
  `changeMemberRole` and adds 9 grant and group routes: 133 − 1 + 18 + 9 = 159 = 38 `M` +
  11 lists + 5 `organization.read` + 7 members + 5 directory + 12 spaces + 7 access +
  19 security + 1 capacity mode + 1 `organization.create_project` +
  1 `organization.manage_settings` + 3 `project.read` + 6 `project.manage_settings` +
  3 `project.manage_packages` + 28 `package.read` + 9 `package.write` +
  3 `package.manage_settings`.
