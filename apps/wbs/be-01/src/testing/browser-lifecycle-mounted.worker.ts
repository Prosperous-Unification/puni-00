import {
  buildOidcVerifier,
  InMemoryOidcTransactionStore,
  InMemoryTokenStore,
  type JwtClaims,
  oidcCredentialEvidence,
} from '@wbs/auth';
import { AuthService } from '@wbs/core/service/auth.service';
import { createLogger } from '@wbs/observability';
import {
  type BrowserAuthLifecycle,
  OrganizationRepository,
  SqliteBrowserAuthLifecycle,
  SqliteBrowserCredentialRevocations,
  SqliteOrganizationAccess,
  SqliteOrganizationSelection,
} from '@wbs/store-sqlite';
import { shadowBrowserAuthority } from '@wbs/store-sqlite/testing/shadow-browser-authority';
import { jwtVerify } from 'jose';

import { buildApp } from '../app';
import { openDrizzle } from '../repository/db';
import { OPEN } from '../repository/gate';
import { UserRepository } from '../repository/user';
import { joseTokenCodec } from '../runtime/bun-runtime';
import { organizationCookieBinding } from '../runtime/organization-cookie';
import {
  nativeBrowserCredentialEvidence,
  organizationCredentialEvidence,
} from '../runtime/organization-credential';
import { organizationSelection } from '../runtime/organization-selection';
import { testCalendarMarkerService } from './calendar-marker-fixture';
import { testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
import { testDirectoryService } from './directory-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from './email-verification-fixture';
import { testHistoryService } from './history-fixture';
import { testLoginThrottle } from './login-throttle-fixture';
import { refusingOnboarding } from './onboarding-fixture';
import { refusingDomains } from './organization-access-fixture';
import { testPriorityBandService } from './priority-band-fixture';
import { testProjectService } from './project-fixture';
import { testReplay } from './replay-fixture';
import { testSavedPlanService } from './saved-plan-fixture';
import { refusingSpaces } from './space-fixture';
import { testStepService } from './step-fixture';
import { testWorkItemService } from './work-item-fixture';
import { testWrites } from './writes-fixture';

interface Incoming {
  readonly id: number;
  readonly kind:
    | 'request'
    | 'seed'
    | 'configure-refresh'
    | 'release-refresh'
    | 'release-ready'
    | 'shadow-revocations';
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly correlation?: string;
  readonly refreshToken?: string;
  readonly userId?: string;
  readonly generation?: number;
  readonly credential?: {
    readonly kind: 'oidc';
    readonly userId: string;
    readonly digest: string;
    readonly expiresAt: number;
  };
  readonly accessToken?: string;
  readonly nextRefreshToken?: string;
  readonly hold?: 'provider' | 'install' | null;
}

const databasePath = process.argv.at(2);
if (databasePath === undefined) throw new Error('mounted worker requires a database path');
const origin = 'https://dev.wbs.test';
const signingKey = new TextEncoder().encode('mounted-browser-lifecycle-oidc-signing-key');
const sessionKey = 'mounted-browser-lifecycle-native-signing-key';
const db = openDrizzle(databasePath);
const storedLifecycle = new SqliteBrowserAuthLifecycle(db, OPEN);
let refreshAccessToken: string | undefined;
let refreshToken: string | undefined;
const refreshBarrier: { phase: 'provider' | 'install' | null } = { phase: null };
let releaseRefresh: (() => void) | undefined;
async function awaitRelease(phase: 'provider' | 'install'): Promise<void> {
  if (refreshBarrier.phase !== phase) return;
  emit({ kind: 'barrier', phase });
  await new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  releaseRefresh = undefined;
  refreshBarrier.phase = null;
}
const lifecycle: BrowserAuthLifecycle = {
  open: (correlation, credential) => storedLifecycle.open(correlation, credential),
  generation: (correlation) => storedLifecycle.generation(correlation),
  proveAssociation: (correlation, presented) =>
    storedLifecycle.proveAssociation(correlation, presented),
  close: (correlation, presented, at) => storedLifecycle.close(correlation, presented, at),
  replace: async (correlation, generation, predecessor, successor, at) => {
    const next = await storedLifecycle.replace(correlation, generation, predecessor, successor, at);
    await awaitRelease('install');
    return next;
  },
};
const revocations = new SqliteBrowserCredentialRevocations(db, OPEN);
const tokens = new InMemoryTokenStore({ now: Date.now });
const users = new UserRepository(db, OPEN);
let providerCalls = 0;
let providerRevokes = 0;
const verifier = {
  verify: async (token: string): Promise<JwtClaims> => {
    const verified = await jwtVerify(token, signingKey, {
      algorithms: ['HS256'],
      issuer: 'https://idp.test',
      audience: 'api://wbs',
    });
    const claims = verified.payload;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number')
      throw new Error('worker verified OIDC claims lack subject or expiry');
    return {
      iss: 'https://idp.test',
      sub: claims.sub,
      exp: claims.exp,
      email: `${claims.sub}@puni.test`,
      email_verified: true,
      wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
    };
  },
};
const client = {
  authorizationUrl: () => Promise.resolve(new URL('https://idp.test/authorize')),
  exchange: () => Promise.reject(new Error('worker callback is not admitted')),
  refresh: async () => {
    providerCalls++;
    await awaitRelease('provider');
    if (refreshAccessToken === undefined || refreshToken === undefined)
      throw new Error('worker provider refresh was not configured');
    return { accessToken: refreshAccessToken, refreshToken, expiresIn: 300 };
  },
  revoke: () => {
    providerRevokes++;
    return Promise.resolve();
  },
};
const oidc = {
  appOrigin: origin,
  client,
  groupPrefix: 'dev',
  groupsClaim: 'wbs_groups',
  mode: 'oidc' as const,
  now: Date.now,
  random: () => 'unused-correlation',
  redirectUri: `${origin}/api/auth/okta/callback`,
  verifier,
  browserLifecycle: lifecycle,
  tokens,
  transactions: new InMemoryOidcTransactionStore({ now: Date.now, ttlMs: 300_000 }),
};
const auth = new AuthService({
  clock: testClock,
  users,
  identities: users,
  tokens: joseTokenCodec(sessionKey),
  passwords: {
    hash: () => Promise.reject(new Error('worker password hashing is not admitted')),
    verify: () => Promise.resolve(false),
  },
  oidc: buildOidcVerifier(verifier, oidc),
  passwordSessions: true,
});
const selection = organizationSelection(
  new SqliteOrganizationSelection(db),
  organizationCookieBinding(sessionKey),
  revocations,
);
const logLines: string[] = [];
const app = buildApp(
  {
    organizations: new SqliteOrganizationAccess(db, selection.activeOrganizationOf),
    organizationSelection: selection.endpoints,
    credentialEvidence: organizationCredentialEvidence(
      auth,
      sessionKey,
      oidcCredentialEvidence(verifier, oidc),
    ),
    memberships: new OrganizationRepository(db, OPEN),
    domains: refusingDomains,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: refusingSpaces,
    emailDelivery: refusingTestEmailDelivery,
    onboarding: refusingOnboarding,
    loginThrottle: testLoginThrottle(5),
    clock: testClock,
    appOrigin: origin,
    auth,
    capacity: testCapacityService(),
    directory: testDirectoryService(),
    history: testHistoryService(),
    calendarMarkers: testCalendarMarkerService(),
    internalAuthSecret: 'x'.repeat(32),
    writes: testWrites(),
    migrationsApplied: true,
    oidc,
    browserSession: {
      lifecycle,
      revocations,
      tokens,
      verifyNativeBrowserCredential: nativeBrowserCredentialEvidence(auth, sessionKey),
      revokeProvider: client.revoke,
    },
    priorityBands: testPriorityBandService(),
    probeDatabase: () => 'ok',
    projects: testProjectService(),
    replay: testReplay().replay,
    steps: testStepService(),
    workItems: testWorkItemService(),
    savedPlans: testSavedPlanService(),
  },
  (options) =>
    createLogger({
      ...options,
      destination: {
        write: (line) => {
          logLines.push(line);
        },
      },
    }),
);

function emit(frame: unknown): void {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

async function receive(frame: Incoming): Promise<void> {
  try {
    if (frame.kind === 'release-ready') {
      emit({ kind: 'ready' });
      emit({ id: frame.id, ok: true });
    } else if (frame.kind === 'seed') {
      if (
        frame.correlation === undefined ||
        frame.refreshToken === undefined ||
        frame.userId === undefined ||
        frame.generation === undefined ||
        frame.credential === undefined
      )
        throw new Error('worker seed frame is incomplete');
      tokens.save({
        sessionCorrelation: frame.correlation,
        refreshToken: frame.refreshToken,
        expiresAt: Date.now() + 86_400_000,
        userId: frame.userId,
        generation: frame.generation,
        credential: frame.credential,
      });
      emit({ id: frame.id, ok: true });
    } else if (frame.kind === 'configure-refresh') {
      if (frame.accessToken === undefined || frame.nextRefreshToken === undefined)
        throw new Error('worker refresh configuration is incomplete');
      refreshAccessToken = frame.accessToken;
      refreshToken = frame.nextRefreshToken;
      refreshBarrier.phase = frame.hold ?? null;
      emit({ id: frame.id, ok: true });
    } else if (frame.kind === 'release-refresh') {
      if (releaseRefresh === undefined) throw new Error('worker has no held refresh');
      releaseRefresh();
      emit({ id: frame.id, ok: true });
    } else if (frame.kind === 'shadow-revocations') {
      shadowBrowserAuthority(db);
      emit({ id: frame.id, ok: true });
    } else {
      if (frame.path === undefined || frame.method === undefined)
        throw new Error('worker request frame is incomplete');
      const response = await app.handle(
        new Request(`${origin}${frame.path}`, {
          method: frame.method,
          headers: frame.headers,
          ...(frame.body === undefined ? {} : { body: JSON.stringify(frame.body) }),
        }),
      );
      const body = response.status === 204 ? null : await response.text();
      emit({
        id: frame.id,
        status: response.status,
        body,
        setCookie: response.headers.get('set-cookie'),
        providerCalls,
        providerRevokes,
        logs: logLines.splice(0),
      });
    }
  } catch (cause) {
    emit({ id: frame.id, error: cause instanceof Error ? cause.message : String(cause) });
  }
}

let buffered = '';
if (process.argv[3] === 'early-exit') {
  process.stderr.write('injected worker startup exit\n');
  process.exit(27);
}
if (process.argv[3] === 'ignore-term') process.on('SIGTERM', () => undefined);
if (process.argv[3] !== 'hold-ready') emit({ kind: 'ready' });
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffered += chunk;
  for (;;) {
    const separator = buffered.indexOf('\n');
    if (separator < 0) break;
    const line = buffered.slice(0, separator);
    buffered = buffered.slice(separator + 1);
    if (line.length > 0) void receive(JSON.parse(line) as Incoming);
  }
});
process.stdin.resume();
