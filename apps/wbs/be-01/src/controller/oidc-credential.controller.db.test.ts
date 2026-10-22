import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type LocalIssuer, LocalOidcIssuers } from '../testing/local-oidc-issuer';
import { addAgentPerson } from '../testing/machine-credential-fixture';
import {
  type Answer,
  type HarnessTrustedIssuers,
  OrganizationHarness,
} from '../testing/organization-harness';

const CONFIGURED = 'https://idp.test';
const UPSTREAM_AUDIENCE = 'api://wbs';
const CREDENTIALS = '/api/organization/machine-credentials';
const MAIN = 'repo:acme/wbs:ref:refs/heads/main';
const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };
const INVALID = { status: 401, body: { error: 'invalid_token' } };

let issuers: LocalOidcIssuers;
let idp: LocalIssuer;
let ci: LocalIssuer;
let h: OrganizationHarness;
let projectA: string;
let projectB: string;
let reports: Record<string, unknown>[];

beforeAll(async () => {
  issuers = new LocalOidcIssuers();
  idp = await issuers.add('idp.test');
});

afterAll(async () => {
  await issuers.stop();
});

/**
 * The OIDC machine source (`wbs-machine-credentials` tasks 5.2, 5.2a and
 * 5.3, design A13 steps 2, 3 and 5, A16, A23) over be-01's production
 * composition and real SQLite: a local issuer is registered as a trusted
 * issuer, an `oidc` credential names one of its subjects, and a JWT it signs
 * is admitted as the credential's person's bound account. The configured
 * sign-in issuer is a second local issuer behind the upstream verifier.
 */
beforeEach(async () => {
  ci = await issuers.add(`ci-${crypto.randomUUID().slice(0, 8)}.test`);
  reports = [];
  h = openHarness();
  await populate();
});

afterEach(() => {
  h.close();
});

function openHarness(options: Partial<HarnessTrustedIssuers> = {}): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: UPSTREAM_AUDIENCE,
        issuer: CONFIGURED,
        jwksUri: issuers.directJwksUrl(idp),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
    trustedIssuers: {
      fetch: issuers.fetch,
      configuredIssuer: CONFIGURED,
      report: (fields) => {
        reports.push(fields);
      },
      ...options,
    },
  });
}

async function populate(): Promise<void> {
  for (const username of ['dany', 'mem', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'super_admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-b', 'bob', 'admin');
  h.bind('dany', 'org-a');
  h.bind('mem', 'org-a');
  h.bind('bob', 'org-b');
  h.activate();
  projectA = await createProject('dany', 'Plan of A');
  projectB = await createProject('bob', 'Plan of B');
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'mems-agent', 'org-a', h.userId('mem'));
  addAgentPerson(h.sqlite, 'bobs-agent', 'org-b', h.userId('bob'));
}

async function createProject(username: string, name: string): Promise<string> {
  const created = await h.call(username, 'POST', '/api/projects', { name });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return (created.body as { project: { id: string } }).project.id;
}

/** Registers `issuer` for the caller's organization with `audience` and answers its id. */
async function trust(username: string, issuer: LocalIssuer, audience = `aud-${username}`) {
  const registered = await h.call(username, 'POST', '/api/organization/trusted-issuers', {
    issuer: issuer.url,
    audience,
  });
  if (registered.status !== 201) throw new Error(`trust refused: ${JSON.stringify(registered)}`);
  return (registered.body as { id: string }).id;
}

function createOidc(
  username: string,
  body: { trustedIssuerId: string; subject?: string; personId?: string; audience?: string },
  name = 'ci',
): Promise<Answer> {
  return h.call(username, 'POST', CREDENTIALS, {
    source: 'oidc',
    name,
    personId: body.personId ?? 'claire',
    trustedIssuerId: body.trustedIssuerId,
    subject: body.subject ?? MAIN,
    ...(body.audience === undefined ? {} : { audience: body.audience }),
  });
}

/** Trusts `ci` in org-a with audience `wbs` and creates claire's credential for MAIN. */
async function claireCredential(): Promise<{ trustedIssuerId: string; id: string }> {
  const trustedIssuerId = await trust('dany', ci, 'wbs');
  const created = await createOidc('dany', { trustedIssuerId });
  if (created.status !== 201) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return { trustedIssuerId, id: (created.body as { id: string }).id };
}

function as(token: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return h.callWith(token, method, path, body);
}

function projectIds(answer: Answer): string[] {
  return (answer.body as { projects: { id: string }[] }).projects.map((project) => project.id);
}

function lastUsedAt(id: string): number | null {
  const row = h.sqlite
    .query<{ last_used_at: number | null }, [string]>(
      'SELECT last_used_at FROM machine_credential WHERE id = ?',
    )
    .get(id);
  if (row === null) throw new Error(`no credential ${id}`);
  return row.last_used_at;
}

function usersTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM users ORDER BY id').all();
}

function credentialCount(): number {
  return h.sqlite.query('SELECT id FROM machine_credential').all().length;
}

describe('creating an OIDC credential', () => {
  it('stores the pair with no secret, lists it and audits it without the subject', async () => {
    const trustedIssuerId = await trust('dany', ci, 'wbs');
    const created = await createOidc('dany', { trustedIssuerId });
    expect(created).toMatchObject({
      status: 201,
      body: {
        source: 'oidc',
        name: 'ci',
        personId: 'claire',
        issuedBy: h.userId('dany'),
        trustedIssuerId,
        issuer: ci.url,
        subject: MAIN,
        audience: null,
      },
    });
    expect(created.body).not.toHaveProperty('key');
    const id = (created.body as { id: string }).id;
    expect(h.sqlite.query('SELECT id FROM machine_credential_secret').all()).toEqual([]);
    expect(await h.call('dany', 'GET', CREDENTIALS)).toMatchObject({
      status: 200,
      body: { credentials: [{ id, source: 'oidc', issuer: ci.url, subject: MAIN, secrets: [] }] },
    });
    const audit = h.sqlite
      .query<{ detail: string }, []>(
        "SELECT detail FROM organization_audit WHERE action = 'machine_credential_created'",
      )
      .all();
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]?.detail ?? '{}')).toMatchObject({ source: 'oidc', issuer: ci.url });
    expect(audit[0]?.detail).not.toContain(MAIN);
  });

  it('lets a member name their own agent under an admin-registered issuer', async () => {
    const trustedIssuerId = await trust('dany', ci);
    expect(
      (await createOidc('mem', { trustedIssuerId, personId: 'mems-agent' }, 'mine')).status,
    ).toBe(201);
    expect(await createOidc('mem', { trustedIssuerId, subject: 'other' }, 'theirs')).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
  });

  // Proof: with the organization predicate removed from `createOidc`'s
  // trusted issuer read, this created A's credential on B's issuer; watched
  // 2026-10-22.
  it("refuses another organization's trusted issuer, writing nothing", async () => {
    const theirs = await trust('bob', ci);
    expect(await createOidc('dany', { trustedIssuerId: theirs })).toEqual({
      status: 404,
      body: { error: 'unknown_trusted_issuer' },
    });
    expect(credentialCount()).toBe(0);
  });

  it("refuses a subject its trusted issuer already binds, revoked ones included, and never consults another organization's", async () => {
    const { trustedIssuerId, id } = await claireCredential();
    expect(await createOidc('dany', { trustedIssuerId }, 'again')).toEqual({
      status: 409,
      body: { error: 'subject_taken' },
    });
    expect((await h.call('dany', 'DELETE', `${CREDENTIALS}/${id}`)).status).toBe(204);
    expect(await createOidc('dany', { trustedIssuerId }, 'again')).toEqual({
      status: 409,
      body: { error: 'subject_taken' },
    });
    const theirs = await trust('bob', ci);
    expect(
      (await createOidc('bob', { trustedIssuerId: theirs, personId: 'bobs-agent' }, 'b')).status,
    ).toBe(201);
    expect(credentialCount()).toBe(2);
  });

  it('refuses rotation at the issuer, and revokes', async () => {
    const { id } = await claireCredential();
    expect(await h.call('dany', 'POST', `${CREDENTIALS}/${id}/rotate`)).toEqual({
      status: 409,
      body: { error: 'rotation_at_issuer' },
    });
    expect((await h.call('dany', 'DELETE', `${CREDENTIALS}/${id}`)).status).toBe(204);
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      UNKNOWN,
    );
  });

  it('refuses a body missing the pair or carrying an out-of-range subject', async () => {
    const trustedIssuerId = await trust('dany', ci);
    for (const body of [
      { source: 'oidc', name: 'x', personId: 'claire', subject: MAIN },
      { source: 'oidc', name: 'x', personId: 'claire', trustedIssuerId },
      { source: 'oidc', name: 'x', personId: 'claire', trustedIssuerId, subject: '' },
      { source: 'oidc', name: 'x', personId: 'claire', trustedIssuerId, subject: 's'.repeat(513) },
    ])
      expect(await h.call('dany', 'POST', CREDENTIALS, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(credentialCount()).toBe(0);
  });

  // Proof: with `createOidc`'s audit append's failure caught and dropped,
  // this answered 201 instead of 500; watched 2026-10-22.
  it('stores no OIDC credential when the audit row cannot be written', async () => {
    const trustedIssuerId = await trust('dany', ci);
    h.sqlite.run(
      "CREATE TRIGGER refuse_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );
    expect((await createOidc('dany', { trustedIssuerId })).status).toBe(500);
    expect(credentialCount()).toBe(0);
  });
});

describe('a trusted issuer token', () => {
  it('is admitted end to end as its person, capped to a member of its organization', async () => {
    const { id } = await claireCredential();
    const token = await ci.sign({ sub: MAIN, aud: 'wbs' });
    const projects = await as(token, 'GET', '/api/projects');
    expect(projects.status).toBe(200);
    expect(projectIds(projects)).toEqual([projectA]);
    expect(projectIds(projects)).not.toContain(projectB);
    expect(lastUsedAt(id)).not.toBeNull();
    expect(await as(token, 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    expect(await as(token, 'GET', CREDENTIALS)).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    expect(ci.jwksFetches).toBe(1);
  });

  // Proof: with an `invalid` verdict admitted by
  // `authenticateTrustedIssuerToken`, this answered 200; watched 2026-10-22.
  it('refuses a token signed by another key', async () => {
    await claireCredential();
    expect(
      await as(await issuers.forge(ci, { sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
  });

  // Proof: with the registration's audience answered over the credential's
  // own, this admitted the `pinned` subject's token for `aud: 'wbs'` alone
  // (200 instead of invalid_token); watched 2026-10-22.
  it('refuses a wrong audience, the credential audience winning over the default', async () => {
    const trustedIssuerId = await trust('dany', ci, 'wbs');
    expect(
      (await createOidc('dany', { trustedIssuerId, subject: 'pinned', audience: 'deploy' }, 'p'))
        .status,
    ).toBe(201);
    expect((await createOidc('dany', { trustedIssuerId }, 'd')).status).toBe(201);
    expect(await as(await ci.sign({ sub: MAIN, aud: 'other' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(await as(await ci.sign({ sub: 'pinned', aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(
      await as(await ci.sign({ sub: 'pinned', aud: 'deploy' }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
    expect(
      (await as(await ci.sign({ sub: 'pinned', aud: ['wbs', 'deploy'] }), 'GET', '/api/projects'))
        .status,
    ).toBe(200);
    // A wrong `aud` selects no registration, so nothing is fetched for it.
    expect(ci.jwksFetches).toBe(1);
  });

  // Proof: with the `length > 1` refusal removed from
  // `authenticateTrustedIssuerToken`, this admitted the token as A's; watched
  // 2026-10-22.
  it("refuses a token naming two organizations' audiences", async () => {
    await claireCredential();
    const theirs = await trust('bob', ci, 'wbs-b');
    expect(
      (await createOidc('bob', { trustedIssuerId: theirs, personId: 'bobs-agent' }, 'b')).status,
    ).toBe(201);
    expect(
      await as(await ci.sign({ sub: MAIN, aud: ['wbs', 'wbs-b'] }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
    expect(ci.jwksFetches).toBe(0);
  });

  it('refuses an expired or not-yet-valid token', async () => {
    await claireCredential();
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [
      { exp: now - 10, iat: now - 400 },
      { nbf: now + 600, exp: now + 900 },
    ])
      expect(
        await as(await ci.sign({ sub: MAIN, aud: 'wbs', ...claims }), 'GET', '/api/projects'),
      ).toEqual(INVALID);
  });

  it('refuses an unknown subject unknown_identity, creating no account', async () => {
    await claireCredential();
    const before = usersTable();
    expect(
      await as(await ci.sign({ sub: 'repo:acme/other', aud: 'wbs' }), 'GET', '/api/projects'),
    ).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(before);
  });

  it('refuses a revoked credential unknown_identity', async () => {
    const { id } = await claireCredential();
    expect((await h.call('dany', 'DELETE', `${CREDENTIALS}/${id}`)).status).toBe(204);
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      UNKNOWN,
    );
  });

  // Proof: with the no-key-set refusal of `authenticateTrustedIssuerToken`
  // letting the token through to the configured verifier, this answered 401
  // unauthenticated; with `invalid_token` dropped from `mount.ts`'s whole
  // answer, it answered 500; watched 2026-10-22.
  it('refuses a stranger issuer invalid_token without fetching any key set', async () => {
    await claireCredential();
    const stranger = await issuers.add(`stranger-${crypto.randomUUID().slice(0, 8)}.test`);
    const idpFetches = idp.jwksFetches;
    expect(
      await as(await stranger.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
    expect(stranger.jwksFetches + stranger.discoveryFetches).toBe(0);
    expect(ci.jwksFetches).toBe(0);
    expect(idp.jwksFetches).toBe(idpFetches);
  });

  // Proof: with `TrustedIssuerKeySets.verify` rethrowing an unavailable key
  // set, this answered 500; watched 2026-10-22.
  it('refuses invalid_token when the key set answers 503, and reports it', async () => {
    await claireCredential();
    ci.jwksStatus = 503;
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ jwksUri: ci.jwksUri, issuer: ci.url });
    // Within the 30 s failure cooldown the key set is not fetched again,
    // even once it would answer.
    ci.jwksStatus = 200;
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(ci.jwksFetches).toBe(1);
    expect(reports).toHaveLength(1);
  });

  it('stops authenticating once its issuer is removed', async () => {
    const { trustedIssuerId, id } = await claireCredential();
    expect((await h.call('dany', 'DELETE', `${CREDENTIALS}/${id}`)).status).toBe(204);
    expect(
      (await h.call('dany', 'DELETE', `/api/organization/trusted-issuers/${trustedIssuerId}`))
        .status,
    ).toBe(204);
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
  });

  it('follows a key rotation with exactly one refetch once the cooldown allows it', async () => {
    h.close();
    h = openHarness({ cooldownMs: 0 });
    await populate();
    await claireCredential();
    expect(
      (await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).status,
    ).toBe(200);
    expect(ci.jwksFetches).toBe(1);
    await ci.rotate('key-2');
    expect(
      (await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).status,
    ).toBe(200);
    expect(ci.jwksFetches).toBe(2);
  });

  it('refetches no key set for an unknown kid inside the cooldown', async () => {
    await claireCredential();
    expect(
      (await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).status,
    ).toBe(200);
    await ci.rotate('key-2');
    for (let attempt = 0; attempt < 3; attempt += 1)
      expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
        INVALID,
      );
    expect(ci.jwksFetches).toBe(1);
  });

  it('binds one subject in two organizations through one shared issuer URL', async () => {
    await claireCredential();
    const theirs = await trust('bob', ci, 'wbs-b');
    expect(
      (await createOidc('bob', { trustedIssuerId: theirs, personId: 'bobs-agent' })).status,
    ).toBe(201);
    const a = await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects');
    expect(projectIds(a)).toEqual([projectA]);
    const b = await as(await ci.sign({ sub: MAIN, aud: 'wbs-b' }), 'GET', '/api/projects');
    expect(projectIds(b)).toEqual([projectB]);
    expect(ci.jwksFetches).toBe(1);
  });

  // Proof: with the organization predicate removed from `findOidcCredential`'s
  // trusted issuer join, this admitted B's credential through A's issuer;
  // watched 2026-10-22.
  it("refuses a credential that names another organization's trusted issuer", async () => {
    const trustedIssuerId = await trust('dany', ci, 'wbs');
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-b', 'bobs-agent', ?, 'oidc', 'planted', ?, ?, ?, 1, ?)`,
      [crypto.randomUUID(), h.userId('bob'), ci.url, MAIN, trustedIssuerId, h.userId('bob')],
    );
    expect(await as(await ci.sign({ sub: MAIN, aud: 'wbs' }), 'GET', '/api/projects')).toEqual(
      UNKNOWN,
    );
  });

  // Proof: with the configured-issuer comparison removed from
  // `authenticateTrustedIssuerToken`, this admitted the planted credential;
  // watched 2026-10-22.
  it('never consults trusted issuers for a configured-issuer token without groups', async () => {
    const plantedIssuer = crypto.randomUUID();
    const planted = crypto.randomUUID();
    h.sqlite.run(
      `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at) VALUES (?, 'org-a', ?, ?, ?, 1)`,
      [plantedIssuer, CONFIGURED, idp.jwksUri, UPSTREAM_AUDIENCE],
    );
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-a', 'claire', ?, 'oidc', 'planted', ?, 'machine@clients', ?, 1, ?)`,
      [planted, h.userId('dany'), CONFIGURED, plantedIssuer, h.userId('dany')],
    );
    const before = usersTable();
    expect(
      await as(
        await idp.sign({ sub: 'machine@clients', aud: UPSTREAM_AUDIENCE }),
        'GET',
        '/api/projects',
      ),
    ).toEqual(UNKNOWN);
    expect(lastUsedAt(planted)).toBeNull();
    expect(usersTable()).toEqual(before);
  });
});
