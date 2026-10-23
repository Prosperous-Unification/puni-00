# Permission matrix

The inventory [design.md](design.md) ("Permission vocabulary") summarises. Read on
2026-10-24 at `2e0ab3245` from `libs/wbs/domain/contracts/src/commands/definitions.ts`
(54 plan-command kinds, 18 of them directory commands) and from every
`defineEndpointShape` in `libs/wbs/domain/contracts/src/http/*-shapes.ts` (128 endpoints,
bound in `libs/wbs/application/core/src/http/*.routes.ts`). Paths are today's; under
`wbs-work-packages` `/api/projects/:id` addresses a **work package**. "Today" is the
role the current code requires. `M` means current membership and nothing else.

## Roles and the permissions they imply

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
| `project.manage_budgets` (reserved)      | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.manage_dependencies` (reserved) | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.manage_packages`                | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `project.grant`                          | yes             | yes       |            | yes             |                     |                |                 |                     |                 |
| `package.read`                           | yes             | yes       | yes        | yes             | yes                 | yes            | yes             | yes                 | yes             |
| `package.write`                          | yes             | yes       |            | yes             | yes                 |                | yes             | yes                 |                 |
| `package.manage_settings`                | yes             | yes       |            | yes             |                     |                | yes             |                     |                 |
| `package.claim_for_others`               | yes             | yes       |            | yes             |                     |                | yes             |                     |                 |

A machine principal's row is the contributor row of whatever it holds (P12). Organization
roles reach a restricted package only through `organization.recover_restricted` (P5).
Sizes: 9 roles × 21 permissions; 54 command kinds and 120 endpoints below.

## Plan-command kinds (`POST /api/projects/:id/commands`, 36)

Each command is checked at the package the batch addresses, inside the batch's
transaction; the batch is refused whole on the first short permission (P10).

| Permission                 | Kinds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Today          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `package.write`            | `createWorkItem`, `patchWorkItem`, `moveWorkItem`, `duplicateWorkItem`, `deleteWorkItem`, `setEstimate`, `clearEstimate`, `setActual`, `clearActual`, `setProgress`, `setStepBlocked`, `clearProgress`, `startAttempt`, `endAttempt`, `removeAttempt`, `setStatus`, `setMeasure`, `clearMeasure`, `setAssignee`, `assignSubtree`, `claimWorkItem`, `releaseWorkItem`, `addDependency`, `removeDependency`, `addTypedDependency`, `updateTypedDependency`, `removeTypedDependency`, `arrangeBySchedule`, `unfreezeWorkItem`, `setDemand` (30) | member+creator |
| `package.manage_settings`  | `freezeProject`, `unfreezeProject`, `setCapacity`, `setResourceCapacity`, `setStepAllowance`, `setPriorityBands` (6)                                                                                                                                                                                                                                                                                                                                                                                                                         | member+creator |
| `package.claim_for_others` | additionally, `claimWorkItem` and `releaseWorkItem` naming a person not bound to the caller's account outside a delegated claim (the `isClaimAdmin` bypass)                                                                                                                                                                                                                                                                                                                                                                                  | admin          |

A typed dependency whose other end lies in another package needs `package.write` at both
ends until `project.manage_dependencies` gains behaviour.

## Directory commands (`POST /api/directory/commands`, 18)

| Permission                      | Kinds                                                                                                                                                                                                                                                                                                | Today  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `organization.manage_directory` | `createTeam`, `patchTeam`, `deleteTeam`, `createPerson`, `patchPerson`, `deletePerson`, `createTag`, `patchTag`, `deleteTag`, `createService`, `patchService`, `deleteService`, `createWorkItemType`, `patchWorkItemType`, `deleteWorkItemType`, `createResource`, `patchResource`, `deleteResource` | member |

`patchPerson` with `accountId` (binding) was admin-only and stays inside
`organization.manage_directory`. A `deletePerson … cascade` that revokes machine
credentials keeps A24's reach rule, now read from `organization.manage_directory`.

## Routes (128)

### Membership only, pre-membership, or infrastructure (`M`, 38)

| Method and path                                                                                                                          | Endpoint                                                                            | Note                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/api/auth/*` (11: context, link, link callback, login ×2, logout, me, methods, okta callback, refresh, register)                        | `issueBearerContext` … `registerPassword`                                           | authentication, before any organization                                                          |
| `GET /health`, `GET /metrics`                                                                                                            | `health`, `metrics`                                                                 | infrastructure                                                                                   |
| `GET /api/onboarding`, `POST /api/onboarding/{email-challenges,email-challenges/confirm,invitations/accept,join-requests,organizations}` | `readOnboarding` … `createOnboardingOrganization`                                   | pre-membership; the creator receives `org-super-admin` (P11)                                     |
| `GET /api/organization/memberships`, `GET`/`POST /api/organization/active`                                                               | `listOrganizationMemberships`, `readActiveOrganization`, `selectActiveOrganization` | own memberships                                                                                  |
| `GET /api/organization`                                                                                                                  | `readCapacityMode`                                                                  | name and capacity mode, which every reader renders                                               |
| `GET /api/timezones`                                                                                                                     | `readTimezones`                                                                     | static                                                                                           |
| `GET /api/organization/grants?subject=me`                                                                                                | `listGrants` (new)                                                                  | a principal's own grants and provenance                                                          |
| `GET`/`POST /api/organization/machine-credentials`, `POST …/:id/rotate`, `DELETE …/:id`                                                  | `listMachineCredentials` … `revokeMachineCredential`                                | for agents bound to the caller's account (A7); every agent needs `organization.manage_directory` |
| `POST /api/claims/renew`                                                                                                                 | `renewClaimLeases`                                                                  | the caller's own leases                                                                          |
| `PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report`                                                           | `putCapacityReport`                                                                 | the provider's own machine credential (`compute-providers` P6)                                   |
| `POST /api/smoke/echo`                                                                                                                   | `smokeEcho`                                                                         | unchanged                                                                                        |
| `POST /internal/mcp/{organizations,delegation,authority,credentials,credentials/ended}`                                                  | `listMcpOrganizations` … `endMcpConsentCredential`                                  | service secret; unchanged                                                                        |
| `POST /internal/forward`, `POST /internal/resume`                                                                                        | `forwardInternal`, `resumeInternal`                                                 | service; the forwarded principal is checked by the target                                        |

### `organization.navigate` (10)

| Method and path                                                          | Endpoint                                                                                          | Today  | Note                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `GET /api/{people,teams,services,tags,work-item-types,external-systems}` | `listPeople`, `listTeams`, `listServices`, `listTags`, `listWorkItemTypes`, `listExternalSystems` | member | agent persons: every one needs `organization.manage_directory`, else own |
| `GET /api/people/load`, `GET /api/people/:personId/load`                 | `readOrganizationLoad`, `readPersonLoad`                                                          | member | folded over readable packages only                                       |
| `GET /api/spaces`, `GET /api/organization/project-rank`                  | `listSpaces`, `readProjectRank`                                                                   | member | members filtered through `readablePackageIds`                            |

### `organization.read` (4)

| Method and path                       | Endpoint                 | Today |
| ------------------------------------- | ------------------------ | ----- |
| `GET /api/organization/members`       | `listMembers`            | admin |
| `GET /api/organization/limits`        | `readOrganizationLimits` | admin |
| `GET /api/organization/grants`        | `listGrants` (new)       | —     |
| `GET /api/organization/access-groups` | `listAccessGroups` (new) | —     |

### `organization.manage_members` (7)

| Method and path                                                    | Endpoint                                                    | Today | Note                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `DELETE /api/organization/members/:userId`                         | `removeMember`                                              | admin | removing an organization-role holder needs `organization.manage_organization_roles`; last super-admin refused |
| `GET`/`POST /api/organization/invitations`, `DELETE …/:id`         | `listInvitations`, `createInvitation`, `revokeInvitation`   | admin | the initial grant obeys P11                                                                                   |
| `GET /api/organization/join-requests`, `POST …/:id/{approve,deny}` | `listJoinRequests`, `approveJoinRequest`, `denyJoinRequest` | admin | approval's initial grant obeys P11                                                                            |
| `PATCH /api/organization/members/:userId`                          | `changeMemberRole`                                          | admin | **removed**; grants replace it                                                                                |

### `organization.manage_directory` (5 routes, one of them carrying the 18 commands)

| Method and path                                                          | Endpoint                                                                                            | Today  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ |
| `POST /api/directory/commands`                                           | `applyDirectoryCommands`                                                                            | member |
| `GET`/`POST /api/organization/compute-providers`, `PATCH`/`DELETE …/:id` | `listComputeProviders`, `registerComputeProvider`, `updateComputeProvider`, `removeComputeProvider` | admin  |

### `organization.manage_spaces` (7)

| Method and path                                                                                                                        | Endpoint                                                                                                 | Today  |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| `POST /api/spaces`, `PATCH`/`DELETE /api/spaces/:id`, `POST /api/spaces/:id/projects`, `DELETE …/:projectId`, `POST …/:projectId/move` | `createSpace`, `renameSpace`, `removeSpace`, `addSpaceProject`, `removeSpaceProject`, `moveSpaceProject` | member |
| `POST /api/organization/projects/:id/rank`                                                                                             | `moveProjectRank`                                                                                        | member |

Every package a space write names must also be readable (`404 not_found` otherwise), as
`space-authorization` states.

### `organization.manage_access` and `organization.manage_organization_roles` (7, new)

| Method and path                                                                                                      | Endpoint                                                                                             | Permission                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/organization/grants`, `DELETE …/:id`                                                                      | `grantRole`, `revokeRole`                                                                            | organization roles: `manage_organization_roles`; project and package roles: `manage_access`, or `project.grant` at the package's project |
| `POST /api/organization/access-groups`, `PATCH`/`DELETE …/:id`, `POST …/:id/members`, `DELETE …/:id/members/:userId` | `createAccessGroup`, `renameAccessGroup`, `deleteAccessGroup`, `addGroupMember`, `removeGroupMember` | `manage_access`                                                                                                                          |

### `organization.manage_security` (19)

| Method and path                                                                                    | Endpoint                                                                                                           | Today       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| `GET /api/organization/domains`, `POST …/challenges`, `DELETE …/:id`, `POST …/:id/{rotate,verify}` | `listOrganizationDomains`, `createDomainChallenge`, `releaseDomainClaim`, `rotateDomainProof`, `verifyDomainClaim` | super-admin |
| `GET`/`POST /api/organization/sso-connections`, `PATCH`/`DELETE …/:id`                             | `listSsoConnections`, `createSsoConnection`, `updateSsoConnection`, `removeSsoConnection`                          | super-admin |
| `GET`/`PUT /api/organization/session-policy`                                                       | `readSessionPolicy`, `setSessionPolicy`                                                                            | super-admin |
| `GET`/`POST /api/organization/provisioning-tokens`, `POST …/:id/rotate`, `DELETE …/:id`            | `listProvisioningTokens`, `issueProvisioningToken`, `rotateProvisioningToken`, `revokeProvisioningToken`           | super-admin |
| `GET`/`POST /api/organization/trusted-issuers`, `DELETE …/:id`                                     | `listTrustedIssuers`, `registerTrustedIssuer`, `removeTrustedIssuer`                                               | admin (P7)  |
| `POST /api/organization/shared-people/restore-approvals`                                           | `approveSharedPeopleRestore`                                                                                       | super-admin |

### `organization.manage_capacity_mode` (1)

| Method and path           | Endpoint             | Today                        |
| ------------------------- | -------------------- | ---------------------------- |
| `PATCH /api/organization` | `switchCapacityMode` | super-admin, never delegated |

### `project.manage_packages` (2)

| Method and path             | Endpoint        | Today  | Note                                                                                              |
| --------------------------- | --------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `POST /api/projects`        | `createProject` | member | creates a work package in the project the body names; the creator receives `package-manager` (P6) |
| `POST /api/projects/import` | `importProject` | member | same                                                                                              |

Project-entity routes (create, settings, budgets, dependencies) arrive with
`wbs-work-packages` and later changes and take `organization.create_project`,
`project.manage_settings`, `project.manage_budgets`, `project.manage_dependencies`.

### `package.read` (22)

| Method and path                                                                                                                                                                                                                                                | Endpoint                                                                                                                                                                                                                                         | Today  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `GET /api/projects`                                                                                                                                                                                                                                            | `listProjects`                                                                                                                                                                                                                                   | viewer |
| `GET /api/projects/:id`, `…/export`, `…/history`, `…/work-items`, `…/work-items/:workItemId`, `…/work-item-rows`, `…/step-references`, `…/startable`, `…/resources`, `…/people/:personId/work`, `…/saved-plans`, `…/saved-plans/compare`, `…/calendar-markers` | `readProject`, `exportProject`, `readHistory`, `getWorkItems`, `getWorkItem`, `getWorkItemRows`, `getStepReference`, `readStartableWork`, `readProjectResources`, `readPersonWork`, `listSavedPlans`, `compareSavedPlans`, `listCalendarMarkers` | viewer |
| `GET /api/saved-plans/:id`                                                                                                                                                                                                                                     | `readSavedPlan`                                                                                                                                                                                                                                  | viewer |
| `POST /api/projects/:id/opened`                                                                                                                                                                                                                                | `recordProjectOpen`                                                                                                                                                                                                                              | viewer |
| `GET /plans/by-solution/:slug`                                                                                                                                                                                                                                 | `readSolution`                                                                                                                                                                                                                                   | viewer |
| `GET /api/spaces/:id`, `…/roll-ups`, `…/in-progress`                                                                                                                                                                                                           | `readSpace`, `readSpaceRollUps`, `readSpaceInProgress`                                                                                                                                                                                           | member |
| `POST /internal/gateway/projects/:projectId/{access,browser-access}`                                                                                                                                                                                           | `gatewayProjectAccess`, `gatewayBrowserProjectAccess`                                                                                                                                                                                            | viewer |

`listProjects` and the space reads need `organization.navigate` to answer at all and
filter their rows by `package.read`; the single-package reads answer `404 not_found`
when the package is unreadable.

### `package.write` (12)

| Method and path                                                             | Endpoint                                                               | Today          | Note                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/projects/:id/commands`                                           | `applyProjectCommands`                                                 | member+creator | per kind, above                                                                                          |
| `POST /api/projects/:id/undo`, `…/redo`                                     | `undoProject`, `redoProject`                                           | member+creator | plus each walked command kind's permission                                                               |
| `POST /api/projects/:id/steps`, `PATCH`/`DELETE …/:stepId`                  | `addStep`, `renameStep`, `removeStep`                                  | member+creator |                                                                                                          |
| `POST /api/projects/:id/calendar-markers`, `PATCH`/`DELETE …/:markerId`     | `createCalendarMarker`, `updateCalendarMarker`, `removeCalendarMarker` | member+creator |                                                                                                          |
| `POST /api/projects/:id/saved-plans`, `PATCH`/`DELETE /api/saved-plans/:id` | `savePlan`, `renameSavedPlan`, `deleteSavedPlan`                       | member+creator | rename and delete keep the author-or-manager rule (`package.manage_settings` replaces "project creator") |

### `package.manage_settings` (2)

| Method and path                             | Endpoint                   | Today          | Note                                                            |
| ------------------------------------------- | -------------------------- | -------------- | --------------------------------------------------------------- |
| `PATCH /api/projects/:id`                   | `patchProject`             | member+creator | name, estimate method, reach, timezone, optimizer, `restricted` |
| `POST /api/projects/:id/optimization/retry` | `retryProjectOptimization` | member+creator |                                                                 |

Clearing `restricted` is `package.manage_settings`; setting it on a package the caller
manages is the same permission, and the caller's own direct grant keeps them in (P5, P6).

## Totals

- Permissions: 21 over 4 evaluation kinds; roles: 9 (9 × 21 cells above).
- Plan-command kinds: 54 (36 package, 18 directory), each with exactly one permission.
- Contract endpoints today: 128 = 38 `M` + 10 navigate + 2 `organization.read` +
  8 members (one removed) + 5 directory + 7 spaces + 19 security + 1 capacity mode +
  2 `project.manage_packages` + 22 `package.read` + 12 `package.write` +
  2 `package.manage_settings`. After the change: 127 + 9 grant and group routes = 136.
