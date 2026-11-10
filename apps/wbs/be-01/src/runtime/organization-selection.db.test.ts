import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser, VerifiedOrganizationCredential } from '@wbs/contracts';
import {
  openConnection,
  openDatabase,
  runMigrations,
  SqliteBrowserCredentialRevocations,
  SqliteOrganizationAccess,
  SqliteOrganizationSelection,
  WriteCoordinator,
} from '@wbs/store-sqlite';
import { expect, test } from 'bun:test';

import { organizationSelectionRoutes } from '../controller/organization-selection.routes';
import { organizationCookieBinding } from './organization-cookie';
import { organizationSelection } from './organization-selection';

const MIGRATIONS = new URL('../../drizzle', import.meta.url).pathname;

test('a selection in flight before revocation cannot restore authority after its cookie issues', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'wbs-revocation-race-'));
  const path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
  const connection = openConnection(path);
  // The selection's own revocation lookup answers "not revoked" and is then
  // held, so revocation commits between that check and the cookie's issue.
  let releaseCheck: (() => void) | undefined;
  let checkAnswered: (() => void) | undefined;
  const answered = new Promise<void>((resolve) => {
    checkAnswered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseCheck = resolve;
  });
  try {
    const evidence: VerifiedOrganizationCredential = {
      kind: 'native',
      userId: 'ada',
      digest: 'a'.repeat(64),
      expiresAt: Date.now() + 60_000,
    };
    const principal: AuthenticatedUser = {
      id: 'ada',
      username: 'ada',
      scopes: [],
      organizationBinding: { credential: evidence, cookie: null },
    };
    const revocations = new SqliteBrowserCredentialRevocations(
      connection.db,
      new WriteCoordinator(),
    );
    let lookups = 0;
    const selection = organizationSelection(
      {
        list: () => Promise.resolve([{ organizationId: 'org-a', name: 'org-a', role: 'member' }]),
      },
      organizationCookieBinding('test-session-key'),
      {
        isRevoked: async (credential) => {
          const revoked = await revocations.isRevoked(credential);
          lookups += 1;
          if (lookups === 1) {
            checkAnswered?.();
            await held;
          }
          return revoked;
        },
      },
      // No enforcement or policy in this fixture: the rules admit.
      () => Promise.resolve(null),
    );
    const issued = selection.endpoints.select(principal, 'org-a');
    await answered;
    await revocations.revoke(evidence, Date.now());
    releaseCheck?.();
    const outcome = await issued;
    expect(outcome.kind).toBe('selected');
    if (outcome.kind !== 'selected') throw new Error('selection did not issue a cookie');
    // Proof: removing the post-commit shared read made this cookie recover
    // org-a, even though revocation had committed before it was issued.
    expect(
      await selection.activeOrganizationOf({
        ...principal,
        organizationBinding: { credential: evidence, cookie: outcome.cookie },
      }),
    ).toBeNull();
  } finally {
    releaseCheck?.();
    connection.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

const SELECTION_NOW = 1_800_000_000_000;

/** Real choices, revocations, policy and cookies; only the exact awaited dependency is held. */
async function openSelectionSnapshotFixture() {
  const folder = mkdtempSync(join(tmpdir(), 'wbs-role-evidence-selection-snapshot-'));
  const path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("INSERT INTO users(id,username,created_at) VALUES('ada','ada',1),('bob','bob',1)");
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1)",
    );
    sqlite.run(
      "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','viewer',1),('org-b','ada','member',1),('org-b','bob','member',1)",
    );
    sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
    sqlite.run(
      "INSERT INTO organization_domain_claim(id,organization_id,domain,status,proof_digest,last_success_at,last_checked_at,created_at) VALUES('domain-a','org-a','corp.test','verified','proof',1,1,1)",
    );
    sqlite.run(
      "INSERT INTO organization_sso_connection(id,organization_id,domain_claim_id,auth0_connection,strategy,login_slug,enforced,proven_at,proven_by,created_at) VALUES('sso-a','org-a','domain-a','corp','samlp','corp',1,1,'ada',1)",
    );
  } finally {
    sqlite.close();
  }
  const connection = openConnection(path);
  const authentication = {
    kind: 'upstream' as const,
    issuer: 'https://idp.test/',
    subject: 'google-oauth2|ada',
  };
  const credential = {
    kind: 'oidc' as 'oidc' | 'native',
    userId: 'ada',
    digest: 'a'.repeat(64),
    expiresAt: SELECTION_NOW + 3_600_000,
  };
  const cookie = organizationCookieBinding('selection-snapshot-key', () => SELECTION_NOW);
  const initial = await cookie.issue(credential, 'org-a');
  const binding = { credential, cookie: initial.value };
  const principal: AuthenticatedUser = {
    id: 'ada',
    username: 'ada',
    scopes: ['read'],
    authentication,
    organizationBinding: binding,
  };
  const choices = new SqliteOrganizationSelection(connection.db);
  const revocations = new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator());
  let barrier:
    | {
        phase: 'choices' | 'revocation';
        entered: ReturnType<typeof Promise.withResolvers<undefined>>;
        release: ReturnType<typeof Promise.withResolvers<undefined>>;
        used: boolean;
      }
    | undefined;
  const pause = async (phase: 'choices' | 'revocation') => {
    if (barrier?.phase !== phase || barrier.used) return;
    barrier.used = true;
    barrier.entered.resolve(undefined);
    await barrier.release.promise;
  };
  const selection = organizationSelection(
    {
      list: async (userId) => {
        const listed = await choices.list(userId);
        await pause('choices');
        return listed;
      },
    },
    cookie,
    {
      isRevoked: async (evidence) => {
        const revoked = await revocations.isRevoked(evidence);
        await pause('revocation');
        return revoked;
      },
    },
    (current, organizationId) => access.admitTo(current, organizationId),
  );
  const access = new SqliteOrganizationAccess(
    connection.db,
    selection.activeOrganizationOf,
    () => SELECTION_NOW,
  );
  return {
    connection,
    principal,
    authentication,
    credential,
    binding,
    cookie,
    selection,
    access,
    revocations,
    hold(phase: 'choices' | 'revocation') {
      const held = {
        phase,
        entered: Promise.withResolvers<undefined>(),
        release: Promise.withResolvers<undefined>(),
        used: false,
      };
      barrier = held;
      return held;
    },
    close() {
      connection.close();
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

for (const entrypoint of ['list', 'select'] as const) {
  const fields =
    entrypoint === 'list'
      ? (['identity', 'authentication', 'delegation', 'digest', 'kind', 'credential-user'] as const)
      : ([
          'identity',
          'authentication',
          'delegation',
          'digest',
          'kind',
          'credential-user',
          'expiry',
        ] as const);
  for (const field of fields)
    test(`selection ${entrypoint} retains private verified ${field} before choices await`, async () => {
      const fixture = await openSelectionSnapshotFixture();
      if (entrypoint === 'select') fixture.authentication.subject = 'samlp|corp|ada';
      const replacement: VerifiedOrganizationCredential = {
        kind: field === 'kind' ? 'native' : 'oidc',
        userId: field === 'credential-user' ? 'bob' : 'ada',
        digest: 'b'.repeat(64),
        expiresAt: fixture.credential.expiresAt,
      };
      if (['digest', 'kind', 'credential-user'].includes(field))
        await fixture.revocations.revoke(replacement, SELECTION_NOW);
      const held = fixture.hold('choices');
      const pending =
        entrypoint === 'list'
          ? fixture.selection.endpoints.list(fixture.principal)
          : fixture.selection.endpoints.select(fixture.principal, 'org-a');
      try {
        await held.entered.promise;
        if (field === 'identity') fixture.principal.id = 'bob';
        else if (field === 'authentication')
          fixture.authentication.subject =
            entrypoint === 'list' ? 'samlp|corp|ada' : 'google-oauth2|ada';
        else if (field === 'delegation')
          fixture.principal.delegation = { organizationId: 'org-b', audience: 'wbs-be-01/direct' };
        else if (field === 'expiry') fixture.credential.expiresAt = SELECTION_NOW + 1000;
        else Object.assign(fixture.credential, replacement);
        held.release.resolve(undefined);
        const answer = await pending;
        if (entrypoint === 'list') {
          expect(answer).toMatchObject({
            kind: 'listed',
            memberships: [
              { organizationId: 'org-a', ssoRequired: true },
              { organizationId: 'org-b', ssoRequired: false },
            ],
          });
          expect(JSON.stringify(answer)).not.toContain('organizationBinding');
          expect(JSON.stringify(answer)).not.toContain('a'.repeat(64));
        } else {
          expect(answer.kind).toBe('selected');
          if (answer.kind !== 'selected') throw new Error('original selection did not issue');
          expect(answer.maxAge).toBe(3600);
          expect(
            await fixture.cookie.read(answer.cookie, {
              kind: 'oidc',
              userId: 'ada',
              digest: 'a'.repeat(64),
              expiresAt: SELECTION_NOW + 3_600_000,
            }),
          ).toBe('org-a');
        }
      } finally {
        held.release.resolve(undefined);
        try {
          await pending;
        } finally {
          fixture.close();
        }
      }
    });
}

test('active organization binding retains its original valid cookie credential pair across revocation await', async () => {
  const fixture = await openSelectionSnapshotFixture();
  const replacement: VerifiedOrganizationCredential = {
    kind: 'oidc',
    userId: 'ada',
    digest: 'b'.repeat(64),
    expiresAt: SELECTION_NOW + 7_200_000,
  };
  const replacementCookie = await fixture.cookie.issue(replacement, 'org-b');
  const held = fixture.hold('revocation');
  const pending = fixture.selection.activeOrganizationOf(fixture.principal);
  try {
    await held.entered.promise;
    Object.assign(fixture.credential, replacement);
    fixture.binding.cookie = replacementCookie.value;
    held.release.resolve(undefined);
    expect(await pending).toBe('org-a');
  } finally {
    held.release.resolve(undefined);
    try {
      await pending;
    } finally {
      fixture.close();
    }
  }
});

for (const field of ['identity', 'authentication', 'delegation', 'binding'] as const) {
  test(`bound active discovery retains private verified ${field} across its list to resolve await`, async () => {
    const fixture = await openSelectionSnapshotFixture();
    fixture.authentication.subject = 'samlp|corp|ada';
    const listed = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const selection = {
      ...fixture.selection.endpoints,
      list: async (principal: AuthenticatedUser) => {
        const choices = await fixture.selection.endpoints.list(principal);
        listed.resolve(undefined);
        await release.promise;
        return choices;
      },
    };
    const endpoint = organizationSelectionRoutes(selection, fixture.access)[0];
    const pending = endpoint.handle({
      principal: fixture.principal,
      params: {},
      query: undefined,
      body: undefined,
      request: {
        method: 'GET',
        url: new URL('https://wbs.test/api/organization/active'),
        headers: new Headers(),
        signal: new AbortController().signal,
      },
    });
    try {
      await listed.promise;
      if (field === 'identity') fixture.principal.id = 'bob';
      else if (field === 'authentication') fixture.authentication.subject = 'google-oauth2|ada';
      else if (field === 'delegation')
        fixture.principal.delegation = { organizationId: 'org-b', audience: 'wbs-be-01/direct' };
      else {
        const replacement: VerifiedOrganizationCredential = {
          kind: 'oidc',
          userId: 'ada',
          digest: 'b'.repeat(64),
          expiresAt: SELECTION_NOW + 7_200_000,
        };
        const replacementCookie = await fixture.cookie.issue(replacement, 'org-b');
        Object.assign(fixture.credential, replacement);
        fixture.binding.cookie = replacementCookie.value;
      }
      release.resolve(undefined);
      expect(await pending).toEqual({
        ok: true,
        status: 200,
        body: { organizationId: 'org-a', name: 'A', role: 'viewer' },
      });
    } finally {
      release.resolve(undefined);
      try {
        await pending;
      } finally {
        fixture.close();
      }
    }
  });
}
