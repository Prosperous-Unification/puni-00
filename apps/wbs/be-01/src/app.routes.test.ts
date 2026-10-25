import { InMemoryOidcTransactionStore, InMemoryTokenStore } from '@wbs/auth';
import {
  bodyMediaFor,
  completeAuth0Link,
  completeOidcLogin,
  type EndpointShape,
  httpShapes,
  logoutOidcSession,
  refreshOidcSession,
  type RequestPolicy,
  startAuth0Link,
  startOidcLogin,
  validateSchema,
} from '@wbs/contracts';
import { AuthService } from '@wbs/core/service/auth.service';
import { inMemorySpaces } from '@wbs/store-memory/space-fixture';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';
import { describe, expect, it, spyOn } from 'bun:test';

import type { AppOptions } from './app';
import { buildApp, mountedEndpoints } from './app';
import {
  type BoundEndpoint,
  EMPTY,
  type EndpointReply,
  type RequestFailure,
} from './http/endpoint';
import { bunPasswordHasher, joseTokenCodec } from './runtime/bun-runtime';
import { inMemoryUsers, TEST_JWT_KEY, testAuthService } from './testing/auth-fixture';
import { testCalendarMarkerService } from './testing/calendar-marker-fixture';
import { testCapacityService } from './testing/capacity-fixture';
import { testClock } from './testing/clock-fixture';
import { testDirectoryService } from './testing/directory-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from './testing/email-verification-fixture';
import { testHistoryService } from './testing/history-fixture';
import { testLoginThrottle } from './testing/login-throttle-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingEnterpriseConnections,
  refusingMemberships,
  refusingRestoreApprovals,
} from './testing/organization-access-fixture';
import { testPriorityBandService } from './testing/priority-band-fixture';
import { refusingProjectAddressSearch } from './testing/project-address-search-fixture';
import { inMemoryProjects, testProjectService } from './testing/project-fixture';
import { refusingProjectRanks } from './testing/project-rank-fixture';
import { testReplay } from './testing/replay-fixture';
import { REQUEST_BODIES, REQUEST_QUERIES } from './testing/route-requests';
import { testSavedPlanService } from './testing/saved-plan-fixture';
import { testStepService } from './testing/step-fixture';
import { testWorkItemService } from './testing/work-item-fixture';
import { testWrites } from './testing/writes-fixture';

function options(): AppOptions {
  return {
    projectAddressSearch: refusingProjectAddressSearch,
    resourceRuntime: {
      bind: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      read: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      admit: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      ingest: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      requests: () => Promise.resolve({ ok: false, reason: 'not_found' }),
    },
    resourceUses: {
      register: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      append: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      list: () => Promise.resolve({ ok: false, reason: 'not_found' }),
      history: () => Promise.resolve({ ok: false, reason: 'not_found' }),
    },
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    sharedPeopleRestoreApprovals: refusingRestoreApprovals,
    domains: refusingDomains,
    enterpriseConnections: refusingEnterpriseConnections,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: inMemorySpaces(new Map()),
    projectRanks: refusingProjectRanks,
    emailDelivery: refusingTestEmailDelivery,
    onboarding: {
      isActive: () => Promise.resolve(false),
      discover: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
      createOrganization: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
      submitJoinRequest: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
    },
    appOrigin: 'http://localhost',
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    directory: testDirectoryService(),
    capacity: testCapacityService(),
    stepParallels: testStepParallels(),
    calendarMarkers: testCalendarMarkerService(),
    priorityBands: testPriorityBandService(),
    history: testHistoryService(),
    auth: testAuthService(inMemoryUsers()),
    projects: testProjectService(),
    workItems: testWorkItemService(),
    savedPlans: testSavedPlanService(),
    steps: testStepService(),
    replay: testReplay().replay,
    admitDependencyClient: () => null,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    writes: testWrites(),
    migrationsApplied: true,
  };
}

async function sendRawHttp(port: number, request: string): Promise<string> {
  let response = '';
  const completed = Promise.withResolvers<string>();
  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port,
    socket: {
      open(peer) {
        peer.write(request);
      },
      data(_peer, bytes) {
        response += bytes.toString();
      },
      close() {
        completed.resolve(response);
      },
      error(_peer, error) {
        completed.reject(error);
      },
    },
  });
  try {
    return await completed.promise;
  } finally {
    socket.end();
  }
}

function oidcOptions(): NonNullable<AppOptions['oidc']> {
  return {
    appOrigin: 'https://app.test',
    client: {
      authorizationUrl: () => Promise.resolve(new URL('https://provider.test')),
      exchange: () => Promise.reject(new Error('OIDC exchange fixture was not expected')),
      refresh: () => Promise.reject(new Error('OIDC refresh fixture was not expected')),
      revoke: () => Promise.reject(new Error('OIDC revoke fixture was not expected')),
    },
    groupPrefix: 'test',
    groupsClaim: 'groups',
    methods: [] as const,
    mode: 'oidc',
    redirectUri: 'https://app.test/api/auth/okta/callback',
    tokens: new InMemoryTokenStore(),
    transactions: new InMemoryOidcTransactionStore({ ttlMs: 300_000 }),
    issuer: () => Promise.resolve('https://idp.test'),
    verifier: {
      verify: () => Promise.reject(new Error('OIDC verifier fixture was not expected')),
    },
  };
}

const ORIGIN = 'https://app.test';
const ROUTE_ID = '00000000-0000-4000-8000-000000000001';
const ROUTE_MARKER_ID = '00000000-0000-4000-8000-000000000002';
const INTERNAL_SECRET = 'x'.repeat(32);
const OIDC_SHAPES = new Set<(typeof httpShapes)[number]>([
  startOidcLogin,
  completeOidcLogin,
  startAuth0Link,
  completeAuth0Link,
  refreshOidcSession,
  logoutOidcSession,
]);
const REQUEST_BOUNDARY_ERRORS = new Set([
  'invalid_body',
  'invalid_json',
  'invalid_params',
  'invalid_query',
  'invalid_origin',
  'unauthenticated',
  'unauthorized',
  'insufficient_scope',
]);
const PUBLIC_OPERATIONS = [
  'getApiAuthLinkAuth0Callback',
  'getApiAuthLogin',
  'getApiAuthMe',
  'getApiAuthMethods',
  'getApiAuthOktaCallback',
  'getDependencyCapability',
  'getHealth',
  'getMetrics',
  'postApiAuthLogin',
  'postApiAuthContext',
  'postApiAuthLinkAuth0',
  'postApiAuthLogout',
  'postApiAuthRefresh',
  'postApiAuthRegister',
  'postApiSmokeEcho',
] as const;
const SIGNED_IN_OPERATIONS = [
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
  'getApiOrganizationResourceAuthoritiesByAuthorityId',
  'getApiOrganizationSession-policy',
  'getApiOrganizationSso-connections',
  'getApiOrganizationTrusted-issuers',
  'getApiPeople',
  'getApiPeopleByPersonIdLoad',
  'getApiPeopleLoad',
  'getApiProjects',
  'getApiProjectsById',
  'getApiProjectsByIdBudget-headroom',
  'getApiProjectsByIdCalendar-markers',
  'getApiProjectsByIdClaim-history',
  'getApiProjectsByIdClaims',
  'getApiProjectsByIdHistory',
  'getApiProjectsByIdPeopleByPersonIdWork',
  'getApiProjectsByIdResourceUses',
  'getApiProjectsByIdResourceUsesByUseIdHistory',
  'getApiProjectsByIdResources',
  'getApiProjectsByIdSaved-plans',
  'getApiProjectsByIdSaved-plansCompare',
  'getApiProjectsByIdStartable',
  'getApiProjectAddressesProjects',
  'getApiProjectsByIdAddressCandidates',
  'getApiProjectsByIdAddressReferences',
  'getApiProjectsByIdStep-references',
  'getApiProjectsByIdWork-item-rows',
  'getApiProjectsByIdWork-items',
  'getApiProjectsByIdWork-itemsByWorkItemId',
  'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
  'getApiResourceAuthoritiesByAuthorityIdCleanupRequests',
  'getApiSaved-plansById',
  'getApiServices',
  'getApiSpaces',
  'getApiSpacesById',
  'getApiSpacesByIdIn-progress',
  'getApiSpacesByIdRoll-ups',
  'getApiTags',
  'getApiTeams',
  'getApiTimezones',
  'getApiWork-item-types',
  'postApiOrganizationActive',
] as const;
const READ_SCOPE_OPERATIONS = ['getApiProjectsByIdExport', 'getPlansBy-solutionBySlug'] as const;
const WRITE_SCOPE_OPERATIONS = [
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
  'postApiProjectsByIdResourceUses',
  'postApiProjectsByIdResourceUsesByUseIdEvents',
  'postApiProjectsByIdSaved-plans',
  'postApiProjectsByIdSteps',
  'postApiProjectsByIdUndo',
  'postApiProjectsImport',
  'postApiSpaces',
  'postApiSpacesByIdProjects',
  'postApiSpacesByIdProjectsByProjectIdMove',
  'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
  'putApiOrganizationResourceAuthoritiesByAuthorityId',
  'putApiOrganizationSession-policy',
  'putApiResourceAuthoritiesByAuthorityIdAdmissions',
  'putApiResourceAuthoritiesByAuthorityIdEvents',
] as const;
const INTERNAL_OPERATIONS = [
  'postInternalForward',
  'postInternalGatewayDependencyAdmission',
  'postInternalMcpAuthority',
  'postInternalMcpCredentials',
  'postInternalMcpCredentialsEnded',
  'postInternalMcpDelegation',
  'postInternalMcpOrganizations',
] as const;
/** Internal routes whose own handler then needs the user's upstream Bearer, absent here. */
const UPSTREAM_BEARER_OPERATIONS: ReadonlySet<string> = new Set([
  'postInternalGatewayProjectAccess',
  'postInternalMcpOrganizations',
  'postInternalMcpCredentials',
  'postInternalMcpDelegation',
]);
const GATEWAY_OPERATIONS = ['postInternalGatewayProjectAccess'] as const;
const GATEWAY_BROWSER_OPERATIONS = [
  'postInternalGatewayProjectBrowserAccess',
  'postInternalResume',
] as const;
const ALWAYS_ORIGIN_OPERATIONS = [
  'deleteApiOrganizationInvitationsById',
  'postApiAuthLogin',
  'postApiAuthRegister',
  'postApiOnboardingEmailChallenges',
  'postApiOnboardingEmailChallengesConfirm',
  'postApiOnboardingInvitationsAccept',
  'postApiOnboardingJoinRequests',
  'postApiOnboardingOrganizations',
  'postApiOrganizationActive',
  'postApiOrganizationInvitations',
  'postApiOrganizationJoinRequestsByIdApprove',
  'postApiOrganizationJoinRequestsByIdDeny',
] as const;
const COOKIE_ORIGIN_OPERATIONS = [
  'deleteApiOrganizationCompute-providersById',
  'deleteApiOrganizationDomainsById',
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
  'getApiProjectsByIdHistory',
  'patchApiOrganization',
  'patchApiOrganizationCompute-providersById',
  'patchApiOrganizationMembersByUserId',
  'patchApiOrganizationSso-connectionsById',
  'patchApiProjectsById',
  'patchApiProjectsByIdCalendar-markersByMarkerId',
  'patchApiProjectsByIdStepsByStepId',
  'patchApiSaved-plansById',
  'patchApiSpacesById',
  'postApiAuthContext',
  'postApiAuthLinkAuth0',
  'postApiAuthLogout',
  'postApiAuthRefresh',
  'postApiClaimsRenew',
  'postApiDirectoryCommands',
  'postApiOrganizationCompute-providers',
  'postApiOrganizationDomainsByIdRotate',
  'postApiOrganizationDomainsByIdVerify',
  'postApiOrganizationDomainsChallenges',
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
  'postApiProjectsByIdResourceUses',
  'postApiProjectsByIdResourceUsesByUseIdEvents',
  'postApiProjectsByIdSaved-plans',
  'postApiProjectsByIdSteps',
  'postApiProjectsByIdUndo',
  'postApiProjectsImport',
  'postApiSmokeEcho',
  'postApiSpaces',
  'postApiSpacesByIdProjects',
  'postApiSpacesByIdProjectsByProjectIdMove',
  'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
  'putApiOrganizationResourceAuthoritiesByAuthorityId',
  'putApiOrganizationSession-policy',
  'putApiResourceAuthoritiesByAuthorityIdAdmissions',
  'putApiResourceAuthoritiesByAuthorityIdEvents',
] as const;
const NO_ORIGIN_OPERATIONS = [
  'getApiAuthLinkAuth0Callback',
  'getApiAuthLogin',
  'getApiAuthMe',
  'getApiAuthMethods',
  'getApiAuthOktaCallback',
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
  'getApiOrganizationResourceAuthoritiesByAuthorityId',
  'getApiOrganizationSession-policy',
  'getApiOrganizationSso-connections',
  'getApiOrganizationTrusted-issuers',
  'getApiPeople',
  'getApiPeopleByPersonIdLoad',
  'getApiPeopleLoad',
  'getApiProjects',
  'getApiProjectsById',
  'getApiProjectsByIdBudget-headroom',
  'getApiProjectsByIdCalendar-markers',
  'getApiProjectsByIdClaim-history',
  'getApiProjectsByIdClaims',
  'getApiProjectsByIdExport',
  'getApiProjectsByIdPeopleByPersonIdWork',
  'getApiProjectsByIdResourceUses',
  'getApiProjectsByIdResourceUsesByUseIdHistory',
  'getApiProjectsByIdResources',
  'getApiProjectsByIdSaved-plans',
  'getApiProjectsByIdSaved-plansCompare',
  'getApiProjectsByIdStartable',
  'getApiProjectAddressesProjects',
  'getApiProjectsByIdAddressCandidates',
  'getApiProjectsByIdAddressReferences',
  'getApiProjectsByIdStep-references',
  'getApiProjectsByIdWork-item-rows',
  'getApiProjectsByIdWork-items',
  'getApiProjectsByIdWork-itemsByWorkItemId',
  'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
  'getApiResourceAuthoritiesByAuthorityIdCleanupRequests',
  'getApiSaved-plansById',
  'getApiServices',
  'getApiSpaces',
  'getApiSpacesById',
  'getApiSpacesByIdIn-progress',
  'getApiSpacesByIdRoll-ups',
  'getApiTags',
  'getApiTeams',
  'getApiTimezones',
  'getApiWork-item-types',
  'getDependencyCapability',
  'getHealth',
  'getMetrics',
  'getPlansBy-solutionBySlug',
  'postInternalForward',
  'postInternalGatewayDependencyAdmission',
  'postInternalGatewayProjectAccess',
  'postInternalGatewayProjectBrowserAccess',
  'postInternalMcpAuthority',
  'postInternalMcpCredentials',
  'postInternalMcpCredentialsEnded',
  'postInternalMcpDelegation',
  'postInternalMcpOrganizations',
  'postInternalResume',
] as const;

async function reachabilityOptions(
  mode: 'local' | 'oidc',
): Promise<{ options: AppOptions; shapes: readonly (typeof httpShapes)[number][] }> {
  const users = inMemoryUsers();
  await users.create(
    {
      id: 'route-owner',
      username: 'route-owner',
      passwordHash: null,
      createdAt: 1,
    },
    { at: 1, by: 'route-owner' },
  );
  const projects = inMemoryProjects(users);
  const savedPlans = testSavedPlanService();
  spyOn(savedPlans, 'read').mockResolvedValue({ outcome: 'not_found' });
  spyOn(savedPlans, 'rename').mockResolvedValue({ outcome: 'not_found' });
  spyOn(savedPlans, 'delete').mockResolvedValue({ outcome: 'not_found' });
  const auth = new AuthService({
    clock: testClock,
    users,
    identities: users,
    tokens: joseTokenCodec(TEST_JWT_KEY),
    passwords: bunPasswordHasher,
    localIdentity: {
      id: 'route-owner',
      username: 'route-owner',
      scopes: ['read', 'write', 'editor'],
    },
  });
  const oidc = mode === 'oidc' ? reachabilityOidcOptions() : undefined;
  return {
    options: {
      ...options(),
      appOrigin: ORIGIN,
      auth,
      projects: testProjectService(projects),
      savedPlans,
      internalAuthSecret: INTERNAL_SECRET,
      oidc,
    },
    shapes: mode === 'oidc' ? httpShapes : httpShapes.filter((shape) => !OIDC_SHAPES.has(shape)),
  };
}

function reachabilityOidcOptions(): NonNullable<AppOptions['oidc']> {
  const tokens = new InMemoryTokenStore();
  tokens.save({
    expiresAt: Date.now() + 60_000,
    refreshToken: 'route-refresh',
    sessionCorrelation: 'route-session',
  });
  return {
    appOrigin: ORIGIN,
    client: {
      authorizationUrl: () => Promise.resolve(new URL('https://provider.test/login')),
      exchange: () => Promise.reject(new Error('route probe exchange refusal')),
      refresh: () =>
        Promise.resolve({
          accessToken: 'route-access',
          expiresIn: 60,
          refreshToken: 'route-refresh',
        }),
      revoke: () => Promise.resolve(),
    },
    groupPrefix: 'test',
    groupsClaim: 'groups',
    methods: [] as const,
    mode: 'oidc',
    now: Date.now,
    random: () => 'route-probe',
    redirectUri: `${ORIGIN}/api/auth/okta/callback`,
    tokens,
    transactions: new InMemoryOidcTransactionStore({ ttlMs: 300_000 }),
    issuer: () => Promise.resolve('https://idp.test'),
    verifier: {
      verify: () => Promise.reject(new Error('route probe verifier refusal')),
    },
  };
}

function requestFor(shape: (typeof httpShapes)[number]): Request {
  const path = shape.path
    .replace(':projectId', ROUTE_ID)
    .replace(':markerId', ROUTE_MARKER_ID)
    .replace(':stepId', ROUTE_ID)
    .replace(':slug', 'route-probe')
    .replace(':id', ROUTE_ID);
  const url = new URL(path, ORIGIN);
  const query = REQUEST_QUERIES[shape.operationId];
  if (query !== undefined) url.search = new URLSearchParams(query).toString();
  const headers = new Headers({ origin: ORIGIN });
  if (shape.path.startsWith('/internal/')) headers.set('x-internal-auth', INTERNAL_SECRET);
  if (shape.operationId === 'getApiAuthOktaCallback') {
    headers.set('cookie', '__Host-wbs_oidc=route-probe');
  }
  if (shape.operationId === 'postApiAuthRefresh' || shape.operationId === 'postApiAuthLogout') {
    headers.set('cookie', '__Host-wbs_session=route-session');
  }
  const body = REQUEST_BODIES[shape.operationId];
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(url, {
    method: shape.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * The structurally valid request plus an undeclared query parameter, and, for
 * a body-less write, an empty JSON object: input a raw client sends by habit.
 */
function strayInputRequests(
  shape: (typeof httpShapes)[number],
): { part: 'query' | 'body'; request: Request }[] {
  const valid = requestFor(shape);
  const url = new URL(valid.url);
  url.searchParams.append('stray', '1');
  const strays: { part: 'query' | 'body'; request: Request }[] = [
    { part: 'query', request: new Request(url, valid) },
  ];
  if (bodyMediaFor(shape).length === 0 && shape.method !== 'GET') {
    const headers = new Headers(valid.headers);
    headers.set('content-type', 'application/json');
    strays.push({
      part: 'body',
      request: new Request(valid.url, { method: valid.method, headers, body: '{}' }),
    });
  }
  return strays;
}

/**
 * Stray-input probes not answered `400 invalid_<part>`, each for a modeled
 * reason: the import classifier names the part in `path`; a gateway delegation
 * is refused before input (the declaration audit covers its input); the OIDC
 * callbacks classify into their own browser outcomes; saved-plan compare
 * declares its query refusal as 422.
 */
const STRAY_INPUT_EXCEPTIONS: ReadonlyMap<string, { status: number; error: string | null }> =
  new Map([
    ['postApiProjectsImport query', { status: 400, error: 'invalid_body' }],
    ['postInternalGatewayProjectAccess query', { status: 401, error: 'unauthenticated' }],
    ['postInternalGatewayProjectAccess body', { status: 401, error: 'unauthenticated' }],
    ['getApiAuthLinkAuth0Callback query', { status: 302, error: null }],
    ['getApiAuthOktaCallback query', { status: 400, error: null }],
    ['getApiProjectsByIdSaved-plansCompare query', { status: 422, error: 'invalid_query' }],
  ]);

interface WireReply {
  status: number;
  contentType: string | null;
  body: string;
}

async function wireReply(response: Response): Promise<WireReply> {
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.text(),
  };
}

function boundaryError(reply: WireReply): string | undefined {
  if (!reply.contentType?.includes('application/json') || reply.body === '') return undefined;
  const decoded: unknown = JSON.parse(reply.body);
  if (typeof decoded !== 'object' || decoded === null || !('error' in decoded)) return undefined;
  return typeof decoded.error === 'string' ? decoded.error : undefined;
}

function policyOperations(kind: 'identity' | 'origin', requirement: string): string[] {
  return httpShapes
    .filter((shape) =>
      shape.policies.some((policy) =>
        policy.kind === kind
          ? (policy.kind === 'identity' ? policy.require : policy.when) === requirement
          : false,
      ),
    )
    .map((shape) => shape.operationId)
    .sort();
}

function expectedPolicies(operationId: string): RequestPolicy[] {
  const policies: RequestPolicy[] = [];
  if (includesOperation(ALWAYS_ORIGIN_OPERATIONS, operationId))
    policies.push({ kind: 'origin', when: 'always' });
  if (includesOperation(COOKIE_ORIGIN_OPERATIONS, operationId))
    policies.push({ kind: 'origin', when: 'always-unsafe-with-session-cookie' });
  if (includesOperation(SIGNED_IN_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'signed-in' });
  if (includesOperation(READ_SCOPE_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'read-scope' });
  if (includesOperation(WRITE_SCOPE_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'write-scope' });
  if (includesOperation(INTERNAL_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'internal' });
  if (includesOperation(GATEWAY_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'gateway-delegation' });
  if (includesOperation(GATEWAY_BROWSER_OPERATIONS, operationId))
    policies.push({ kind: 'identity', require: 'gateway-browser' });
  return policies;
}

function includesOperation(operations: readonly string[], operationId: string): boolean {
  return operations.includes(operationId);
}

function requestWithHeaders(shape: (typeof httpShapes)[number], changes: HeadersInit): Request {
  const request = requestFor(shape);
  const headers = new Headers(request.headers);
  for (const [name, value] of new Headers(changes)) headers.set(name, value);
  return new Request(request, { headers });
}

/** Complements actual wire requests: each composition binds its exact shared shape set once. */
it('binds each shared HTTP shape once in every configuration that owns it', () => {
  const localShapes = httpShapes.filter((shape) => !OIDC_SHAPES.has(shape));
  const compositions = [
    { endpoints: mountedEndpoints(options()), shapes: localShapes },
    {
      endpoints: mountedEndpoints({ ...options(), oidc: oidcOptions() }),
      shapes: httpShapes,
    },
  ];
  for (const { endpoints, shapes } of compositions) {
    expect(endpoints).toHaveLength(shapes.length);
    for (const shape of shapes) {
      expect(endpoints.filter((endpoint) => endpoint.shape === shape)).toHaveLength(1);
    }
  }
});

type BoundaryCode = RequestFailure['code'];

/** The request-boundary failure codes the mount can raise for this shape. */
function boundaryCodes(shape: EndpointShape): BoundaryCode[] {
  const codes: BoundaryCode[] = ['invalid_query', 'invalid_body'];
  if (shape.params !== undefined) codes.push('invalid_params');
  if (bodyMediaFor(shape).includes('application/json')) codes.push('invalid_json');
  return codes;
}

/** A failure as the mount builds it, for a classifier that inspects nothing beyond its fields. */
function syntheticFailure(shape: EndpointShape, code: BoundaryCode): RequestFailure {
  const request = {
    url: new URL(shape.path, ORIGIN),
    method: shape.method,
    headers: new Headers(),
    signal: new AbortController().signal,
  };
  const issues = [{ message: 'synthetic boundary failure' }];
  if (code === 'invalid_params') return { part: 'params', code, rejected: {}, issues, request };
  if (code === 'invalid_query') return { part: 'query', code, rejected: {}, issues, request };
  if (code === 'invalid_json') return { part: 'body', code, rejected: '{', request };
  return { part: 'body', code, rejected: {}, issues, request };
}

/**
 * The status `renderReply` would answer a refusal with, or null when the shape
 * declares no refusal for it (the mount then throws: a 500).
 */
async function declaredStatus(shape: EndpointShape, reply: EndpointReply): Promise<number | null> {
  if (reply.ok) return null;
  for (const refusal of shape.refusals) {
    if (refusal.status !== reply.status) continue;
    if ('kind' in refusal) {
      if (refusal.kind === 'empty') {
        if (reply.body === EMPTY) return refusal.status;
        continue;
      }
      if ((await validateSchema(refusal.schema, reply.body)).issues === undefined)
        return refusal.status;
      continue;
    }
    if ((await validateSchema(refusal.schema, reply.body)).issues === undefined)
      return refusal.status;
  }
  return null;
}

/**
 * The status `refuse` answers `{ error: code }` with: the first untagged
 * refusal accepting it, or null when none does (the mount then throws: a 500).
 */
async function refusedStatus(shape: EndpointShape, code: BoundaryCode): Promise<number | null> {
  for (const refusal of shape.refusals) {
    if ('kind' in refusal) continue;
    if ((await validateSchema(refusal.schema, { error: code })).issues === undefined)
      return refusal.status;
  }
  return null;
}

/**
 * Every request-boundary failure the mount can raise is answered with a
 * declared 4xx, in both endpoint tables: through `refuse` (the first refusal
 * accepting `{ error: code }`) or through the endpoint's own classifier. Every
 * endpoint refuses a stray query and a stray or invalid body; a declared params
 * schema adds `invalid_params`, and JSON media adds `invalid_json`.
 * Proof: removing the 400 from `renewClaimLeases` made this audit list
 * `postApiClaimsRenew invalid_query` and `invalid_body` (watched 2026-10-24).
 * Proof: the batch classifier (`classifyCommand`) answering its fallback with an
 * undeclared 422 made it list `postApiProjectsByIdCommands` and
 * `postApiDirectoryCommands` `invalid_query`/`invalid_json` (and params) as null;
 * the earlier audit skipped every classified endpoint (watched 2026-10-24).
 * Proof: a `503 { error: string }` placed before renew's 400 made it list
 * `postApiClaimsRenew invalid_query: 503` and `invalid_body: 503` (watched 2026-10-24).
 */
it('answers every request-boundary failure the mount can raise with a declared 4xx', async () => {
  const local = mountedEndpoints(options());
  const oidc = mountedEndpoints({ ...options(), oidc: oidcOptions() });
  const tableOf = (endpoints: readonly BoundEndpoint[]): string[] =>
    endpoints
      .filter(
        ({ shape }) =>
          ![...OIDC_SHAPES].some(({ operationId }) => operationId === shape.operationId),
      )
      .map(
        ({ shape, classifyRequestFailure }) =>
          `${shape.operationId} ${classifyRequestFailure === undefined ? 'refuse' : 'classified'}`,
      )
      .sort();
  expect(tableOf(local)).toEqual(tableOf(oidc));
  const undeclared: string[] = [];
  for (const endpoint of [...local, ...oidc]) {
    const { shape } = endpoint;
    for (const code of boundaryCodes(shape)) {
      const status =
        endpoint.classifyRequestFailure === undefined
          ? await refusedStatus(shape, code)
          : await declaredStatus(
              shape,
              await endpoint.classifyRequestFailure(syntheticFailure(shape, code)),
            );
      if (status === null || status < 400 || status >= 500)
        undeclared.push(`${shape.operationId} ${code}: ${String(status)}`);
    }
  }
  expect([...new Set(undeclared)]).toEqual([]);
});

it('keeps OIDC health readiness live after the endpoint table is built', async () => {
  const state = { migrationsApplied: false };
  const app = buildApp({
    ...options(),
    oidc: oidcOptions(),
    get migrationsApplied() {
      return state.migrationsApplied;
    },
  });

  const pre = await app.handle(new Request(`${ORIGIN}/health`));
  expect(pre.status).toBe(503);

  state.migrationsApplied = true;
  const post = await app.handle(new Request(`${ORIGIN}/health`));
  expect(post.status).toBe(200);
});

it('enforces the complete pinned identity and origin policy inventory on the production app', async () => {
  const unauthenticated = buildApp({ ...options(), appOrigin: ORIGIN });
  // Proof: adding a signed-in policy to health made this production request
  // expect 200 and receive 500 because the public shape declares no auth refusal.
  expect(await unauthenticated.handle(new Request(`${ORIGIN}/health`))).toHaveProperty(
    'status',
    200,
  );
  for (const operationId of [
    ...SIGNED_IN_OPERATIONS,
    ...READ_SCOPE_OPERATIONS,
    ...WRITE_SCOPE_OPERATIONS,
    ...INTERNAL_OPERATIONS,
    ...GATEWAY_OPERATIONS,
    ...GATEWAY_BROWSER_OPERATIONS,
  ]) {
    const shape = httpShapes.find((candidate) => candidate.operationId === operationId);
    if (shape === undefined) throw new Error(`missing policy fixture: ${operationId}`);
    const response = await unauthenticated.handle(
      requestWithHeaders(shape, { 'x-internal-auth': '' }),
    );
    expect({ operationId, status: response.status }).toEqual({ operationId, status: 401 });
  }

  const composition = await reachabilityOptions('oidc');
  const foreignOrigin = buildApp(composition.options);
  for (const operationId of [
    ...ALWAYS_ORIGIN_OPERATIONS,
    ...COOKIE_ORIGIN_OPERATIONS.filter((candidate) => candidate !== 'getApiProjectsByIdHistory'),
  ]) {
    const shape = httpShapes.find((candidate) => candidate.operationId === operationId);
    if (shape === undefined) throw new Error(`missing origin fixture: ${operationId}`);
    const response = await foreignOrigin.handle(
      requestWithHeaders(shape, {
        origin: 'https://foreign.test',
        cookie: '__Host-wbs_access=foreign-session',
      }),
    );
    expect({ operationId, status: response.status }).toEqual({ operationId, status: 403 });
  }

  expect(policyOperations('identity', 'signed-in')).toEqual([...SIGNED_IN_OPERATIONS].sort());
  expect(policyOperations('identity', 'read-scope')).toEqual([...READ_SCOPE_OPERATIONS]);
  expect(policyOperations('identity', 'write-scope')).toEqual([...WRITE_SCOPE_OPERATIONS]);
  expect(policyOperations('identity', 'internal')).toEqual([...INTERNAL_OPERATIONS]);
  expect(policyOperations('identity', 'gateway-delegation')).toEqual([...GATEWAY_OPERATIONS]);
  expect(policyOperations('identity', 'gateway-browser')).toEqual([...GATEWAY_BROWSER_OPERATIONS]);
  expect(policyOperations('origin', 'always')).toEqual([...ALWAYS_ORIGIN_OPERATIONS]);
  expect(policyOperations('origin', 'always-unsafe-with-session-cookie')).toEqual([
    ...COOKIE_ORIGIN_OPERATIONS,
  ]);
  const everyOperation = httpShapes.map((shape) => shape.operationId).sort();
  expect(
    [
      ...PUBLIC_OPERATIONS,
      ...SIGNED_IN_OPERATIONS,
      ...READ_SCOPE_OPERATIONS,
      ...WRITE_SCOPE_OPERATIONS,
      ...INTERNAL_OPERATIONS,
      ...GATEWAY_OPERATIONS,
      ...GATEWAY_BROWSER_OPERATIONS,
    ].sort(),
  ).toEqual(everyOperation);
  expect(
    [...NO_ORIGIN_OPERATIONS, ...ALWAYS_ORIGIN_OPERATIONS, ...COOKIE_ORIGIN_OPERATIONS].sort(),
  ).toEqual(everyOperation);
  for (const shape of httpShapes) {
    const actualPolicies: readonly RequestPolicy[] = shape.policies.filter(
      (policy) => policy.kind === 'identity' || policy.kind === 'origin',
    );
    expect({ operationId: shape.operationId, policies: actualPolicies }).toEqual({
      operationId: shape.operationId,
      policies: expectedPolicies(shape.operationId),
    });
  }
});

it('refuses framed GET and HEAD bodies on the production health route', async () => {
  let probes = 0;
  const app = buildApp({
    ...options(),
    admitDependencyClient: () => null,
    probeDatabase: () => {
      probes++;
      return 'ok';
    },
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => app.handle(request),
  });
  try {
    const port = server.port;
    if (port === undefined) throw new Error('test HTTP server has no TCP port');
    const statuses: string[] = [];
    const getBodies: string[] = [];
    for (const method of ['GET', 'HEAD'] as const) {
      for (const framed of [
        'Content-Length: 2\r\n\r\n{}',
        'Transfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n',
        'Transfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
      ]) {
        const response = await sendRawHttp(
          port,
          `${method} /health HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nConnection: close\r\n${framed}`,
        );
        statuses.push(response.split('\r\n', 1)[0] ?? 'missing status');
        if (method === 'GET') getBodies.push(response.split('\r\n\r\n', 2)[1] ?? 'missing body');
      }
    }
    expect(statuses).toEqual([
      'HTTP/1.1 400 Bad Request',
      'HTTP/1.1 400 Bad Request',
      'HTTP/1.1 400 Bad Request',
      'HTTP/1.1 400 Bad Request',
      'HTTP/1.1 400 Bad Request',
      'HTTP/1.1 400 Bad Request',
    ]);
    expect(getBodies).toEqual([
      '{"error":"invalid_body"}',
      '{"error":"invalid_body"}',
      '{"error":"invalid_body"}',
    ]);
    expect(probes).toBe(0);
    const emptyStatuses: string[] = [];
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await sendRawHttp(
        port,
        `${method} /health HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
      );
      emptyStatuses.push(response.split('\r\n', 1)[0] ?? 'missing status');
    }
    expect(emptyStatuses).toEqual(['HTTP/1.1 200 OK', 'HTTP/1.1 200 OK']);
    expect(probes).toBe(2);
  } finally {
    await server.stop(true);
  }
});

describe('shared HTTP shape reachability through the production app', () => {
  for (const mode of ['local', 'oidc'] as const) {
    it(`reaches every ${mode} path and method with structurally valid input`, async () => {
      const composition = await reachabilityOptions(mode);
      const app = buildApp(composition.options);
      const routerMiss = await wireReply(
        await app.handle(new Request(`${ORIGIN}/__shared_shape_router_miss__`)),
      );
      expect(routerMiss.status).toBe(404);
      let modeledNotFoundCount = 0;

      for (const shape of composition.shapes) {
        // Proof: removing the 400 from `renewClaimLeases` made both modes fail
        // here on `postApiClaimsRenew` query, status 500 (watched 2026-10-24).
        for (const stray of strayInputRequests(shape)) {
          const strayReply = await wireReply(await app.handle(stray.request));
          const probe = `${shape.operationId} ${stray.part}`;
          expect({
            probe,
            status: strayReply.status,
            error: boundaryError(strayReply) ?? null,
          }).toEqual({
            probe,
            ...(STRAY_INPUT_EXCEPTIONS.get(probe) ?? {
              status: 400,
              error: `invalid_${stray.part}`,
            }),
          });
        }
        const reply = await wireReply(await app.handle(requestFor(shape)));
        const refusal = boundaryError(reply);
        expect({
          operationId: shape.operationId,
          boundaryError:
            refusal !== undefined && REQUEST_BOUNDARY_ERRORS.has(refusal) ? refusal : null,
        }).toEqual({
          operationId: shape.operationId,
          boundaryError: UPSTREAM_BEARER_OPERATIONS.has(shape.operationId)
            ? 'unauthenticated'
            : null,
        });
        expect({ operationId: shape.operationId, reply }).not.toEqual({
          operationId: shape.operationId,
          reply: routerMiss,
        });
        expect({
          operationId: shape.operationId,
          serverError: reply.status >= 500 ? reply.status : null,
        }).toEqual({ operationId: shape.operationId, serverError: null });
        if (reply.status === 404 && refusal === 'not_found') modeledNotFoundCount += 1;
      }

      expect(modeledNotFoundCount).toBeGreaterThan(0);
    });
  }
});

it('returns explicit unavailability for admission in a composition without runtime storage', async () => {
  const composition = options();
  const authentication = spyOn(composition.auth, 'authenticateOrRefuse').mockResolvedValue({
    id: 'runtime-actor',
    username: 'runtime-actor',
    scopes: ['read', 'write'],
    authentication: { kind: 'machine', credentialId: 'runtime-key', personId: 'runtime-person' },
  });
  try {
    const app = buildApp({ ...composition, resourceRuntime: undefined });
    const response = await app.handle(
      new Request('http://localhost/api/resource-authorities/dash/admissions', {
        method: 'PUT',
        headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
        body: JSON.stringify(REQUEST_BODIES['putApiResourceAuthoritiesByAuthorityIdAdmissions']),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'resource_tracking_unavailable' });
  } finally {
    authentication.mockRestore();
  }
});
