import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';

const ROUTE_ID = '00000000-0000-4000-8000-000000000001';
const ROUTE_MARKER_ID = '00000000-0000-4000-8000-000000000002';
export const REQUEST_BODIES: Readonly<Record<string, unknown>> = {
  postApiAuthContext: { organizationId: ROUTE_ID },
  postApiAuthLinkAuth0: { password: 'valid-password' },
  postApiAuthRegister: { username: 'route-probe', password: 'valid-password' },
  postApiAuthLogin: { username: 'route-probe', password: 'valid-password' },
  postApiOnboardingOrganizations: { name: 'Reachable organization' },
  postApiOrganizationActive: { organizationId: ROUTE_ID },
  postApiOnboardingJoinRequests: { organizationId: ROUTE_ID },
  postApiOrganizationDomainsChallenges: { domain: 'example.org' },
  'postApiOrganizationSso-connections': {
    domainClaimId: ROUTE_ID,
    auth0Connection: 'route-probe',
    strategy: 'samlp',
    loginSlug: 'route-probe',
  },
  'patchApiOrganizationSso-connectionsById': { loginSlug: 'route-probe' },
  'postApiOrganizationMachine-credentials': {
    source: 'api_key',
    name: 'route-probe',
    personId: 'route-probe',
  },
  postApiOnboardingEmailChallenges: { email: 'test@example.org' },
  postApiOnboardingEmailChallengesConfirm: { email: 'test@example.org', token: 'invalid' },
  postApiOrganizationInvitations: { email: 'test@example.org', role: 'viewer' },
  postApiOrganizationJoinRequestsByIdApprove: { role: 'viewer' },
  postApiOnboardingInvitationsAccept: { token: 'invalid' },
  postApiSmokeEcho: { text: 'reachable' },
  postApiProjectsByIdSteps: { name: 'Reachable step' },
  patchApiProjectsByIdStepsByStepId: { name: 'Renamed step' },
  patchApiOrganizationMembersByUserId: { role: 'member' },
  postApiProjects: { name: 'Reachable plan' },
  postApiProjectsImport: planDocumentFixture(),
  patchApiProjectsById: {
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
  },
  postApiProjectsByIdOptimizationRetry: { objective: 'pri', inputHash: 'route-probe' },
  postApiProjectsByIdCommands: {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: ROUTE_ID,
        patch: {
          externalRefs: [{ systemId: ROUTE_ID, url: 'https://example.test/work/1' }],
          teamIds: [],
        },
      },
    ],
  },
  postApiDirectoryCommands: {
    commands: [{ kind: 'createPerson', name: 'Route probe', teamIds: [] }],
  },
  'postApiProjectsByIdCalendar-markers': {
    markerId: ROUTE_MARKER_ID,
    date: '2026-09-06',
    name: 'Route probe',
  },
  'patchApiProjectsByIdCalendar-markersByMarkerId': { name: 'Renamed route probe' },
  'postApiProjectsByIdSaved-plans': {},
  postApiSpaces: { name: 'Route probe' },
  patchApiSpacesById: { name: 'Renamed route probe' },
  postApiSpacesByIdProjects: { projectId: ROUTE_ID },
  postApiSpacesByIdProjectsByProjectIdMove: {},
  postApiOrganizationProjectsByIdRank: {},
  patchApiOrganization: { sharedPeople: true },
  postApiOrganizationSharedPeopleRestoreApprovals: {
    operationId: 'restore-1',
    backupDigest: 'a'.repeat(64),
  },
  'putApiOrganizationSession-policy': {
    maxSessionSeconds: 28_800,
    reauthenticateAfterSeconds: null,
  },
  'patchApiSaved-plansById': { name: 'Renamed snapshot' },
  postInternalForward: { message: { kind: 'route-probe' }, trace_id: 'route-probe' },
  postInternalResume: { resume_points: { subscription: -1 }, trace_id: 'route-probe' },
  postInternalMcpDelegation: {
    organizationId: ROUTE_ID,
    userId: ROUTE_ID,
    client: 'route-probe',
    grant: 'route-probe',
    scope: 'read',
  },
  postInternalMcpAuthority: {
    issuer: 'https://idp.test',
    subject: 'route-probe',
    userId: ROUTE_ID,
    organizationId: ROUTE_ID,
  },
};
export const REQUEST_QUERIES: Readonly<Partial<Record<string, Readonly<Record<string, string>>>>> =
  {
    'getApiSpacesByIdRoll-ups': { projectIds: 'route-probe' },
    getApiAuthOktaCallback: { state: 'route-probe', error: 'access_denied' },
    getApiPeopleByPersonIdLoad: { from: '2026-10-05', to: '2026-10-09' },
    getApiPeopleLoad: { from: '2026-10-05', to: '2026-10-09' },
    getApiProjectsByIdExport: { format: 'json' },
    'getApiProjectsByIdSaved-plansCompare': { left: 'current', right: 'current' },
    'getApiProjectsByIdStep-references': { reference: '010.dev', revision: 'ar1:route-probe' },
  };
