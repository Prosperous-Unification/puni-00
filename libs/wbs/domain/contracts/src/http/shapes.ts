import {
  completeAuth0Link,
  completeOidcLogin,
  listAuthMethods,
  logoutOidcSession,
  refreshOidcSession,
  startAuth0Link,
  startOidcLogin,
} from './auth-oidc-shapes';
import {
  issueBearerContext,
  loginPassword,
  readPasswordSession,
  registerPassword,
} from './auth-password-shapes';
import { readBudgetHeadroom } from './budget-headroom-shapes';
import {
  createCalendarMarker,
  listCalendarMarkers,
  removeCalendarMarker,
  updateCalendarMarker,
} from './calendar-marker-shapes';
import { readCapacityMode, switchCapacityMode } from './capacity-mode-shapes';
import { readClaimHistory } from './claim-history-shapes';
import { renewClaimLeases } from './claim-lease-shapes';
import {
  listComputeProviders,
  putCapacityReport,
  registerComputeProvider,
  removeComputeProvider,
  updateComputeProvider,
} from './compute-provider-shapes';
import { getWorkItemDelivery } from './delivery-shapes';
import {
  listExternalSystems,
  listPeople,
  listServices,
  listTags,
  listTeams,
  listWorkItemTypes,
} from './directory-shapes';
import {
  createDomainChallenge,
  listOrganizationDomains,
  releaseDomainClaim,
  rotateDomainProof,
  verifyDomainClaim,
} from './domain-shapes';
import { readHistory } from './history-shapes';
import { importProject } from './import-shapes';
import { health, metrics } from './infrastructure-shapes';
import {
  forwardInternal,
  gatewayBrowserProjectAccess,
  gatewayProjectAccess,
  resumeInternal,
} from './internal-http-shapes';
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from './invitation-shapes';
import { approveJoinRequest, denyJoinRequest, listJoinRequests } from './join-request-shapes';
import {
  createMachineCredential,
  listMachineCredentials,
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
  revokeMachineCredential,
  rotateMachineCredential,
} from './machine-credential-shapes';
import {
  endMcpConsentCredential,
  issueMcpDelegation,
  issueMcpMachineGrant,
  listMcpOrganizations,
  mintMcpConsentCredential,
  readMcpAuthority,
} from './mcp-delegation-shapes';
import { listMeasures } from './measure-shapes';
import {
  confirmEmailChallenge,
  createEmailChallenge,
  createOnboardingOrganization,
  readOnboarding,
  submitOnboardingJoinRequest,
} from './onboarding-shapes';
import { readOrganizationLimits } from './organization-limits-shapes';
import {
  changeMemberRole,
  listMembers,
  listOrganizationMemberships,
  readActiveOrganization,
  removeMember,
  selectActiveOrganization,
} from './organization-shapes';
import { readOrganizationLoad, readPersonLoad } from './person-load-shapes';
import { readPersonWork } from './person-work-shapes';
import { readProjectClaims } from './project-claims-shapes';
import { moveProjectRank, readProjectRank } from './project-rank-shapes';
import {
  createProject,
  exportProject,
  listProjects,
  patchProject,
  readProject,
  recordProjectOpen,
  retryProjectOptimization,
} from './project-shapes';
import {
  issueProvisioningToken,
  listProvisioningTokens,
  revokeProvisioningToken,
  rotateProvisioningToken,
} from './provisioning-token-shapes';
import {
  admitResourceRuntimeUse,
  bindResourceAuthority,
  ingestResourceRuntimeEvent,
  readResourceAuthority,
  readResourceCleanupRequests,
} from './resource-runtime-shapes';
import { readProjectResources } from './resource-shapes';
import {
  appendResourceUseEvent,
  listResourceUses,
  readResourceUseHistory,
  registerResourceUse,
} from './resource-use-shapes';
import { runtimeCommandShapes } from './runtime-command-shapes';
import {
  compareSavedPlans,
  deleteSavedPlan,
  listSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  savePlan,
} from './saved-plan-shapes';
import { readSessionPolicy, setSessionPolicy } from './session-policy-shapes';
import { approveSharedPeopleRestore } from './shared-people-restore-shapes';
import { smokeEcho } from './smoke-shapes';
import { readSolution } from './solution-shapes';
import {
  addSpaceProject,
  createSpace,
  listSpaces,
  moveSpaceProject,
  readSpace,
  readSpaceInProgress,
  readSpaceRollUps,
  removeSpace,
  removeSpaceProject,
  renameSpace,
} from './space-shapes';
import {
  createSsoConnection,
  listSsoConnections,
  removeSsoConnection,
  updateSsoConnection,
} from './sso-connection-shapes';
import { readStartableWork } from './startable-shapes';
import { addStep, removeStep, renameStep } from './step-shapes';
import { readTimezones } from './timezone-shapes';
import {
  applyDirectoryCommands,
  applyProjectCommands,
  getStepReference,
  getWorkItem,
  getWorkItemRows,
  getWorkItems,
  redoProject,
  undoProject,
} from './work-item-shapes';

/** Migrated HTTP declarations; legacy families join this table as their handlers migrate. */
const ordinaryHttpShapes = [
  bindResourceAuthority,
  readResourceAuthority,
  admitResourceRuntimeUse,
  ingestResourceRuntimeEvent,
  readResourceCleanupRequests,
  registerResourceUse,
  listResourceUses,
  appendResourceUseEvent,
  readResourceUseHistory,
  health,
  metrics,
  registerPassword,
  loginPassword,
  readPasswordSession,
  issueBearerContext,
  listAuthMethods,
  startOidcLogin,
  completeOidcLogin,
  startAuth0Link,
  completeAuth0Link,
  refreshOidcSession,
  logoutOidcSession,
  smokeEcho,
  addStep,
  renameStep,
  removeStep,
  changeMemberRole,
  listMembers,
  removeMember,
  listOrganizationMemberships,
  selectActiveOrganization,
  readActiveOrganization,
  listOrganizationDomains,
  releaseDomainClaim,
  createDomainChallenge,
  verifyDomainClaim,
  listProvisioningTokens,
  issueProvisioningToken,
  rotateProvisioningToken,
  revokeProvisioningToken,
  listMachineCredentials,
  createMachineCredential,
  rotateMachineCredential,
  revokeMachineCredential,
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
  listComputeProviders,
  registerComputeProvider,
  updateComputeProvider,
  removeComputeProvider,
  putCapacityReport,
  rotateDomainProof,
  readSessionPolicy,
  setSessionPolicy,
  readOrganizationLimits,
  listSsoConnections,
  createSsoConnection,
  updateSsoConnection,
  removeSsoConnection,
  listInvitations,
  createInvitation,
  revokeInvitation,
  acceptInvitation,
  listJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  readOnboarding,
  createOnboardingOrganization,
  submitOnboardingJoinRequest,
  createEmailChallenge,
  confirmEmailChallenge,
  listTeams,
  listPeople,
  listTags,
  listServices,
  listWorkItemTypes,
  listExternalSystems,
  readTimezones,
  readOrganizationLoad,
  readPersonLoad,
  readProjectRank,
  moveProjectRank,
  readCapacityMode,
  switchCapacityMode,
  approveSharedPeopleRestore,
  readHistory,
  readSolution,
  createProject,
  listProjects,
  recordProjectOpen,
  exportProject,
  importProject,
  readProject,
  patchProject,
  retryProjectOptimization,
  getWorkItems,
  getWorkItemRows,
  getWorkItem,
  // Proof: removing this entry made the delivery client/OpenAPI contract test find no client operation.
  getWorkItemDelivery,
  getStepReference,
  readStartableWork,
  readBudgetHeadroom,
  readPersonWork,
  readProjectClaims,
  readClaimHistory,
  renewClaimLeases,
  readProjectResources,
  listMeasures,
  applyProjectCommands,
  applyDirectoryCommands,
  undoProject,
  redoProject,
  listCalendarMarkers,
  createCalendarMarker,
  updateCalendarMarker,
  removeCalendarMarker,
  savePlan,
  listSavedPlans,
  compareSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  deleteSavedPlan,
  listSpaces,
  createSpace,
  readSpace,
  readSpaceRollUps,
  readSpaceInProgress,
  renameSpace,
  removeSpace,
  addSpaceProject,
  removeSpaceProject,
  moveSpaceProject,
  forwardInternal,
  resumeInternal,
  gatewayProjectAccess,
  gatewayBrowserProjectAccess,
  listMcpOrganizations,
  mintMcpConsentCredential,
  endMcpConsentCredential,
  issueMcpDelegation,
  readMcpAuthority,
  issueMcpMachineGrant,
] as const;

export const httpShapes: readonly [...typeof ordinaryHttpShapes, ...typeof runtimeCommandShapes] = [
  ...ordinaryHttpShapes,
  ...runtimeCommandShapes,
];
