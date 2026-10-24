import { expect, test } from 'bun:test';

import { dependencyClientRefusal, requiresDependencyClient } from './dependency-client';
import { documentFromShapes } from './http/document-from-shapes';
import { dependencyCapability, health } from './http/infrastructure-shapes';
import { listProjects } from './http/project-shapes';
import { httpShapes } from './http/shapes';

test('documents resource admission and exempts health and immutable capability', () => {
  expect(requiresDependencyClient(listProjects)).toBe(true);
  expect(requiresDependencyClient(health)).toBe(false);
  expect(requiresDependencyClient(dependencyCapability)).toBe(false);
  expect(
    JSON.stringify(
      documentFromShapes([listProjects]).paths['/api/projects']?.['get']?.responses['409'],
    ),
  ).toContain('client_dependency_incompatible');
  expect(dependencyClientRefusal.status).toBe(409);
});

test('pins the complete protected and exempt operation matrix', () => {
  // Proof: exempting a compute-provider resource from dependency admission
  // moved its real HTTP operation out of this protected matrix and failed here.
  expect({
    protected: httpShapes
      .filter(requiresDependencyClient)
      .map((shape) => shape.operationId)
      .sort(),
    exempt: httpShapes
      .filter((shape) => !requiresDependencyClient(shape))
      .map((shape) => shape.operationId)
      .sort(),
  }).toEqual({
    protected: [
      'deleteApiOrganizationCompute-providersById',
      'deleteApiOrganizationDomainsById',
      'deleteApiOrganizationInvitationsById',
      'deleteApiOrganizationMachine-credentialsById',
      'deleteApiOrganizationMembersByUserId',
      'deleteApiOrganizationProvisioningTokensById',
      'deleteApiOrganizationSso-connectionsById',
      'deleteApiOrganizationTrusted-issuersById',
      'deleteApiProjectsByIdCalendar-markersByMarkerId',
      'deleteApiProjectsByIdStepsByStepId',
      'deleteApiSaved-plansById',
      'deleteApiSpacesById',
      'deleteApiSpacesByIdProjectsByProjectId',
      'getApiExternal-systems',
      'getApiMeasures',
      'getApiOnboarding',
      'getApiOrganization',
      'getApiOrganizationActive',
      'getApiOrganizationCompute-providers',
      'getApiOrganizationDomains',
      'getApiOrganizationInvitations',
      'getApiOrganizationJoinRequests',
      'getApiOrganizationLimits',
      'getApiOrganizationMachine-credentials',
      'getApiOrganizationMembers',
      'getApiOrganizationMemberships',
      'getApiOrganizationProject-rank',
      'getApiOrganizationProvisioningTokens',
      'getApiOrganizationSession-policy',
      'getApiOrganizationSso-connections',
      'getApiOrganizationTrusted-issuers',
      'getApiPeople',
      'getApiPeopleByPersonIdLoad',
      'getApiPeopleLoad',
      'getApiProjectAddressesProjects',
      'getApiProjects',
      'getApiProjectsById',
      'getApiProjectsByIdAddressCandidates',
      'getApiProjectsByIdAddressReferences',
      'getApiProjectsByIdBudget-headroom',
      'getApiProjectsByIdCalendar-markers',
      // Proof: exempting this id made the mounted connected history read
      // admit a missing semantics claim with 200 instead of 409 (2026-10-24).
      'getApiProjectsByIdClaim-history',
      // Proof: temporarily exempting this exact claim operation moved it out of
      // the protected matrix and failed this test (2026-10-24 CI repair).
      'getApiProjectsByIdClaims',
      'getApiProjectsByIdExport',
      'getApiProjectsByIdHistory',
      'getApiProjectsByIdPeopleByPersonIdWork',
      'getApiProjectsByIdResources',
      'getApiProjectsByIdSaved-plans',
      'getApiProjectsByIdSaved-plansCompare',
      'getApiProjectsByIdStartable',
      'getApiProjectsByIdStep-references',
      'getApiProjectsByIdWork-item-rows',
      'getApiProjectsByIdWork-items',
      'getApiProjectsByIdWork-itemsByWorkItemId',
      // Proof: temporarily exempting this saved-reference delivery operation
      // moved it out of the protected matrix and failed this test (2026-10-24).
      'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
      'getApiSaved-plansById',
      'getApiServices',
      'getApiSpaces',
      'getApiSpacesById',
      'getApiSpacesByIdIn-progress',
      'getApiSpacesByIdRoll-ups',
      'getApiTags',
      'getApiTeams',
      'getApiWork-item-types',
      'getPlansBy-solutionBySlug',
      'patchApiOrganization',
      'patchApiOrganizationCompute-providersById',
      'patchApiOrganizationMembersByUserId',
      'patchApiOrganizationSso-connectionsById',
      'patchApiProjectsById',
      'patchApiProjectsByIdCalendar-markersByMarkerId',
      'patchApiProjectsByIdStepsByStepId',
      'patchApiSaved-plansById',
      'patchApiSpacesById',
      'postApiClaimsRenew',
      'postApiDirectoryCommands',
      'postApiOnboardingEmailChallenges',
      'postApiOnboardingEmailChallengesConfirm',
      'postApiOnboardingInvitationsAccept',
      'postApiOnboardingJoinRequests',
      'postApiOnboardingOrganizations',
      'postApiOrganizationActive',
      'postApiOrganizationCompute-providers',
      'postApiOrganizationDomainsByIdRotate',
      'postApiOrganizationDomainsByIdVerify',
      'postApiOrganizationDomainsChallenges',
      'postApiOrganizationInvitations',
      'postApiOrganizationJoinRequestsByIdApprove',
      'postApiOrganizationJoinRequestsByIdDeny',
      'postApiOrganizationMachine-credentials',
      'postApiOrganizationMachine-credentialsByIdRotate',
      'postApiOrganizationProjectsByIdRank',
      'postApiOrganizationProvisioningTokens',
      'postApiOrganizationProvisioningTokensByIdRotate',
      'postApiOrganizationSharedPeopleRestoreApprovals',
      'postApiOrganizationSso-connections',
      'postApiOrganizationTrusted-issuers',
      'postApiProjects',
      'postApiProjectsByIdCalendar-markers',
      'postApiProjectsByIdCommands',
      'postApiProjectsByIdOpened',
      'postApiProjectsByIdOptimizationRetry',
      'postApiProjectsByIdRedo',
      'postApiProjectsByIdSaved-plans',
      'postApiProjectsByIdSteps',
      'postApiProjectsByIdUndo',
      'postApiProjectsImport',
      'postApiSpaces',
      'postApiSpacesByIdProjects',
      'postApiSpacesByIdProjectsByProjectIdMove',
      'postInternalForward',
      'postInternalGatewayDependencyAdmission',
      'postInternalGatewayProjectAccess',
      'postInternalGatewayProjectBrowserAccess',
      'postInternalMcpOrganizations',
      'postInternalResume',
      'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
      'putApiOrganizationSession-policy',
    ],
    exempt: [
      'getApiAuthLinkAuth0Callback',
      'getApiAuthLogin',
      'getApiAuthMe',
      'getApiAuthMethods',
      'getApiAuthOktaCallback',
      'getApiTimezones',
      'getDependencyCapability',
      'getHealth',
      'getMetrics',
      'postApiAuthContext',
      'postApiAuthLinkAuth0',
      'postApiAuthLogin',
      'postApiAuthLogout',
      'postApiAuthRefresh',
      'postApiAuthRegister',
      'postApiSmokeEcho',
      'postInternalMcpAuthority',
      'postInternalMcpCredentials',
      'postInternalMcpCredentialsEnded',
      'postInternalMcpDelegation',
    ],
  });
});
