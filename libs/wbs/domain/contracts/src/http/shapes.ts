import {
  completeAuth0Link,
  completeOidcLogin,
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
import {
  createCalendarMarker,
  listCalendarMarkers,
  removeCalendarMarker,
  updateCalendarMarker,
} from './calendar-marker-shapes';
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
import { forwardInternal, gatewayProjectAccess, resumeInternal } from './internal-http-shapes';
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from './invitation-shapes';
import { approveJoinRequest, denyJoinRequest, listJoinRequests } from './join-request-shapes';
import {
  confirmEmailChallenge,
  createEmailChallenge,
  createOnboardingOrganization,
  readOnboarding,
  submitOnboardingJoinRequest,
} from './onboarding-shapes';
import { changeMemberRole, listMembers, removeMember } from './organization-shapes';
import { readOrganizationLoad, readPersonLoad } from './person-load-shapes';
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
  compareSavedPlans,
  deleteSavedPlan,
  listSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  savePlan,
} from './saved-plan-shapes';
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
import { addStep, removeStep, renameStep } from './step-shapes';
import {
  applyDirectoryCommands,
  applyProjectCommands,
  getStepReference,
  getWorkItems,
  redoProject,
  undoProject,
} from './work-item-shapes';

/** Migrated HTTP declarations; legacy families join this table as their handlers migrate. */
export const httpShapes = [
  health,
  metrics,
  registerPassword,
  loginPassword,
  readPasswordSession,
  issueBearerContext,
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
  listOrganizationDomains,
  releaseDomainClaim,
  createDomainChallenge,
  verifyDomainClaim,
  rotateDomainProof,
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
  readOrganizationLoad,
  readPersonLoad,
  readProjectRank,
  moveProjectRank,
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
  getStepReference,
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
] as const;
