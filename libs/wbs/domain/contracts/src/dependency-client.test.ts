import { expect, test } from 'bun:test';

import { dependencyClientRefusal, requiresDependencyClient } from './dependency-client';
import { documentFromShapes } from './http/document-from-shapes';
import { dependencyCapability, health } from './http/infrastructure-shapes';
import { httpShapes } from './http/shapes';
import { listWorkPackages } from './http/work-package-shapes';

test('documents resource admission and exempts health and immutable capability', () => {
  expect(requiresDependencyClient(listWorkPackages)).toBe(true);
  expect(requiresDependencyClient(health)).toBe(false);
  expect(requiresDependencyClient(dependencyCapability)).toBe(false);
  expect(
    JSON.stringify(
      documentFromShapes([listWorkPackages]).paths['/api/work-packages']?.['get']?.responses['409'],
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
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix (2026-10-26 R12); restoring
      // the classifier passed both tests. Classification proof only.
      'acquireRuntimeAuthority',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix (2026-10-26 R12); restoring
      // the classifier passed both tests. Classification proof only.
      'applyRuntimeCommands',
      // Proof: exempting all four real AgentPool operations failed this complete
      // protected/exempt matrix; restoring the classifier passed (2026-10-29).
      'deleteApiOrganizationAgent-poolsById',
      'deleteApiOrganizationCompute-providersById',
      'deleteApiOrganizationDomainsById',
      'deleteApiOrganizationInvitationsById',
      'deleteApiOrganizationMachine-credentialsById',
      'deleteApiOrganizationMembersByUserId',
      'deleteApiOrganizationProvisioningTokensById',
      'deleteApiOrganizationSso-connectionsById',
      'deleteApiOrganizationTrusted-issuersById',
      'deleteApiSaved-plansById',
      'deleteApiSpacesById',
      'deleteApiSpacesByIdProjectsByProjectId',
      'deleteApiWorkPackagesByIdCalendar-markersByMarkerId',
      'deleteApiWorkPackagesByIdStepsByStepId',
      'getApiExternal-systems',
      'getApiMeasures',
      'getApiOnboarding',
      'getApiOrganization',
      'getApiOrganizationActive',
      'getApiOrganizationAgent-pools',
      'getApiOrganizationCompute-providers',
      'getApiOrganizationDomains',
      'getApiOrganizationInvitations',
      'getApiOrganizationJoinRequests',
      'getApiOrganizationLimits',
      'getApiOrganizationMachine-credentials',
      'getApiOrganizationMembers',
      'getApiOrganizationMemberships',
      'getApiOrganizationProvisioningTokens',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'getApiOrganizationResourceAuthoritiesByAuthorityId',
      'getApiOrganizationSession-policy',
      'getApiOrganizationSso-connections',
      'getApiOrganizationTrusted-issuers',
      'getApiOrganizationWorkPackage-rank',
      'getApiPeople',
      'getApiPeopleByPersonIdLoad',
      'getApiPeopleLoad',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'getApiResourceAuthoritiesByAuthorityIdCleanupRequests',
      'getApiProjectsByIdSettings',
      'getApiSaved-plansById',
      'getApiServices',
      'getApiSpaces',
      'getApiSpacesById',
      'getApiSpacesByIdIn-progress',
      'getApiSpacesByIdRoll-ups',
      'getApiTags',
      'getApiTeams',
      'getApiWork-item-types',
      'getApiWorkPackageAddressesWorkPackages',
      'getApiWorkPackages',
      'getApiWorkPackagesById',
      'getApiWorkPackagesByIdAddressCandidates',
      'getApiWorkPackagesByIdAddressReferences',
      'getApiWorkPackagesByIdBudget-headroom',
      'getApiWorkPackagesByIdCalendar-markers',
      // Proof: exempting this id made the mounted connected history read
      // admit a missing semantics claim with 200 instead of 409 (2026-10-24).
      'getApiWorkPackagesByIdClaim-history',
      // Proof: temporarily exempting this exact claim operation moved it out of
      // the protected matrix and failed this test (2026-10-24 CI repair).
      'getApiWorkPackagesByIdClaims',
      'getApiWorkPackagesByIdExport',
      'getApiWorkPackagesByIdHistory',
      'getApiWorkPackagesByIdPeopleByPersonIdWork',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'getApiWorkPackagesByIdResourceUses',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'getApiWorkPackagesByIdResourceUsesByUseIdHistory',
      'getApiWorkPackagesByIdResources',
      'getApiWorkPackagesByIdSaved-plans',
      'getApiWorkPackagesByIdSaved-plansCompare',
      'getApiWorkPackagesByIdStartable',
      'getApiWorkPackagesByIdStep-references',
      'getApiWorkPackagesByIdWork-item-rows',
      'getApiWorkPackagesByIdWork-items',
      'getApiWorkPackagesByIdWork-itemsByWorkItemId',
      // Proof: temporarily exempting this saved-reference delivery operation
      // moved it out of the protected matrix and failed this test (2026-10-24).
      'getApiWorkPackagesByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
      'getPlansBy-solutionBySlug',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix (2026-10-26 R12); restoring
      // the classifier passed both tests. Classification proof only.
      'lookupRuntimeReceipt',
      'patchApiOrganization',
      'patchApiOrganizationCompute-providersById',
      'patchApiOrganizationSso-connectionsById',
      'patchApiProjectsByIdSettings',
      'patchApiSaved-plansById',
      'patchApiSpacesById',
      'patchApiWorkPackagesById',
      'patchApiWorkPackagesByIdCalendar-markersByMarkerId',
      'patchApiWorkPackagesByIdStepsByStepId',
      'postApiClaimsRenew',
      'postApiDirectoryCommands',
      'postApiOnboardingEmailChallenges',
      'postApiOnboardingEmailChallengesConfirm',
      'postApiOnboardingInvitationsAccept',
      'postApiOnboardingJoinRequests',
      'postApiOnboardingOrganizations',
      'postApiOrganizationActive',
      'postApiOrganizationAgent-pools',
      'postApiOrganizationAgent-poolsByIdRekey',
      'postApiOrganizationCompute-providers',
      'postApiOrganizationDomainsByIdRotate',
      'postApiOrganizationDomainsByIdVerify',
      'postApiOrganizationDomainsChallenges',
      'postApiOrganizationInvitations',
      'postApiOrganizationJoinRequestsByIdApprove',
      'postApiOrganizationJoinRequestsByIdDeny',
      'postApiOrganizationMachine-credentials',
      'postApiOrganizationMachine-credentialsByIdRotate',
      'postApiOrganizationProvisioningTokens',
      'postApiOrganizationProvisioningTokensByIdRotate',
      'postApiOrganizationResourcesByResourceIdDirectory-capacityPreview',
      'postApiOrganizationSharedPeopleRestoreApprovals',
      'postApiOrganizationSso-connections',
      'postApiOrganizationTrusted-issuers',
      'postApiOrganizationWorkPackagesByIdRank',
      'postApiSpaces',
      'postApiSpacesByIdProjects',
      'postApiSpacesByIdProjectsByProjectIdMove',
      'postApiWorkPackages',
      'postApiWorkPackagesByIdCalendar-markers',
      'postApiWorkPackagesByIdCommands',
      'postApiWorkPackagesByIdOpened',
      'postApiWorkPackagesByIdOptimizationRetry',
      'postApiWorkPackagesByIdRedo',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'postApiWorkPackagesByIdResourceUses',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'postApiWorkPackagesByIdResourceUsesByUseIdEvents',
      'postApiWorkPackagesByIdSaved-plans',
      'postApiWorkPackagesByIdSteps',
      'postApiWorkPackagesByIdUndo',
      'postApiWorkPackagesImport',
      'postInternalForward',
      'postInternalGatewayDependencyAdmission',
      'postInternalGatewayWorkPackageAccess',
      'postInternalGatewayWorkPackageBrowserAccess',
      'postInternalMcpMachineGrants',
      'postInternalMcpOrganizations',
      'postInternalResume',
      'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'putApiOrganizationResourceAuthoritiesByAuthorityId',
      'putApiOrganizationSession-policy',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'putApiResourceAuthoritiesByAuthorityIdAdmissions',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix consumer (2026-10-26);
      // restoring the classifier passed both tests. Classification proof only.
      'putApiResourceAuthoritiesByAuthorityIdEvents',
      // Proof: temporarily exempting this exact operation in dependency-claim.ts
      // failed the real protected/exempt matrix (2026-10-26 R12); restoring
      // the classifier passed both tests. Classification proof only.
      'readRuntimeState',
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
      'postApiAuthReset',
      'postApiSmokeEcho',
      'postInternalMcpAuthority',
      'postInternalMcpCredentials',
      'postInternalMcpCredentialsEnded',
      'postInternalMcpDelegation',
    ],
  });
});
