import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { type LocalIssuer, LocalOidcIssuers } from '../testing/local-oidc-issuer';
import { addAgentPerson, MACHINE_BEARER_NOT_ACCEPTED } from '../testing/machine-credential-fixture';
import { TEST_MCP_AUTHORIZATION_SERVER } from '../testing/machine-grant-fixture';
import { callForwardedAssertion, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  type HarnessTrustedIssuers,
  OrganizationHarness,
} from '../testing/organization-harness';

const CONFIGURED = 'https://idp.test';
const UPSTREAM_AUDIENCE = 'api://wbs';
const CREDENTIALS = '/api/organization/machine-credentials';
const MAIN = 'repo:acme/wbs:ref:refs/heads/main';
const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };
const INVALID = { status: 401, body: { error: 'invalid_token' } };
const NOT_ACCEPTED = MACHINE_BEARER_NOT_ACCEPTED;

let issuers: LocalOidcIssuers;
let machineGrants: HarnessMachineGrants;
let idp: LocalIssuer;
let ci: LocalIssuer;
let h: OrganizationHarness;
let projectA: string;
let projectB: string;
let reports: Record<string, unknown>[];
/** The tests' authorization server: every new audience sits under it (`wbs-mcp-agent-surface` M2). */
const ROOT = TEST_MCP_AUTHORIZATION_SERVER;
const WBS = `${ROOT}/wbs`;
const WBS_B = `${ROOT}/wbs-b`;
const DEPLOY = `${ROOT}/deploy`;

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
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
 *
 * A workload presents its token through mcp-01's `jwt-bearer` grant
 * ({@link viaMcp}); as a Bearer on `/api` it is refused
 * `machine_bearer_not_accepted` (`wbs-mcp-agent-surface` M9).
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
    machineGrants,
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
async function trust(username: string, issuer: LocalIssuer, audience = `${ROOT}/aud-${username}`) {
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

/** Trusts `ci` in org-a with audience {@link WBS} and creates claire's credential for MAIN. */
async function claireCredential(): Promise<{ trustedIssuerId: string; id: string }> {
  const trustedIssuerId = await trust('dany', ci, WBS);
  const created = await createOidc('dany', { trustedIssuerId });
  if (created.status !== 201) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return { trustedIssuerId, id: (created.body as { id: string }).id };
}

/** The token itself as a Bearer on `/api`, which M9 refuses. */
function as(token: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return h.callWith(token, method, path, body);
}

/** The token as a workload's assertion, exchanged and forwarded as mcp-01 does. */
function viaMcp(token: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return callForwardedAssertion(h, token, method, path, body);
}

const TRANSPORTS = [["through mcp-01's jwt-bearer grant", viaMcp]] as const;

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
    const trustedIssuerId = await trust('dany', ci, WBS);
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
    expect(await viaMcp(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
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

  // Proof: with the `length > 1` refusal removed from
  // `admitTrustedIssuerToken`, this admitted the token as A's; watched
  // 2026-10-22.
  it('refuses a narrowing outside the authorization server audience_not_wbs', async () => {
    const trustedIssuerId = await trust('dany', ci, WBS);
    for (const audience of [`${ROOT}.evil.example`, 'deploy', 'wbs:org:org-a'])
      expect(await createOidc('dany', { trustedIssuerId, audience }, `n-${audience}`)).toEqual({
        status: 400,
        body: { error: 'audience_not_wbs' },
      });
    expect(
      h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM machine_credential').get()?.n,
    ).toBe(0);
  });
});

// Each Proof below was watched again 2026-10-29 with the token through mcp-01's
// jwt-bearer grant, the one transport left after 7.1 (M9); `mount.ts`'s half of
// a stranger issuer on `/api` answers as a trusted one (`a trusted issuer token on /api`).
describe.each(TRANSPORTS)('a trusted issuer token, %s', (_, send) => {
  it('is admitted end to end as its person, capped to a member of its organization', async () => {
    const { id } = await claireCredential();
    const token = await ci.sign({ sub: MAIN, aud: WBS });
    const projects = await send(token, 'GET', '/api/projects');
    expect(projects.status).toBe(200);
    expect(projectIds(projects)).toEqual([projectA]);
    expect(projectIds(projects)).not.toContain(projectB);
    expect(lastUsedAt(id)).not.toBeNull();
    expect(await send(token, 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    expect(await send(token, 'GET', CREDENTIALS)).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    expect(ci.jwksFetches).toBe(1);
  });

  // Proof: with an `invalid` verdict admitted by
  // `admitTrustedIssuerToken`, this answered 200; watched 2026-10-22.
  it('refuses a token signed by another key', async () => {
    await claireCredential();
    expect(
      await send(await issuers.forge(ci, { sub: MAIN, aud: WBS }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
  });

  // Proof: with the registration's audience answered over the credential's
  // own, this admitted the `pinned` subject's token for `aud: WBS` alone
  // (200 instead of invalid_token); watched 2026-10-22.
  it('refuses a wrong audience, the credential audience winning over the default', async () => {
    const trustedIssuerId = await trust('dany', ci, WBS);
    expect(
      (await createOidc('dany', { trustedIssuerId, subject: 'pinned', audience: DEPLOY }, 'p'))
        .status,
    ).toBe(201);
    expect((await createOidc('dany', { trustedIssuerId }, 'd')).status).toBe(201);
    expect(await send(await ci.sign({ sub: MAIN, aud: 'other' }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(await send(await ci.sign({ sub: 'pinned', aud: WBS }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(
      await send(await ci.sign({ sub: 'pinned', aud: DEPLOY }), 'GET', '/api/projects'),
    ).toEqual(INVALID);
    expect(
      (await send(await ci.sign({ sub: 'pinned', aud: [WBS, DEPLOY] }), 'GET', '/api/projects'))
        .status,
    ).toBe(200);
    // A wrong `aud` selects no registration, so nothing is fetched for it.
    expect(ci.jwksFetches).toBe(1);
  });

  it("refuses a token naming two organizations' audiences", async () => {
    await claireCredential();
    const theirs = await trust('bob', ci, WBS_B);
    expect(
      (await createOidc('bob', { trustedIssuerId: theirs, personId: 'bobs-agent' }, 'b')).status,
    ).toBe(201);
    expect(
      await send(await ci.sign({ sub: MAIN, aud: [WBS, WBS_B] }), 'GET', '/api/projects'),
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
        await send(await ci.sign({ sub: MAIN, aud: WBS, ...claims }), 'GET', '/api/projects'),
      ).toEqual(INVALID);
  });

  it('refuses an unknown subject unknown_identity, creating no account', async () => {
    await claireCredential();
    const before = usersTable();
    expect(
      await send(await ci.sign({ sub: 'repo:acme/other', aud: WBS }), 'GET', '/api/projects'),
    ).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(before);
  });

  it('refuses a revoked credential unknown_identity', async () => {
    const { id } = await claireCredential();
    expect((await h.call('dany', 'DELETE', `${CREDENTIALS}/${id}`)).status).toBe(204);
    expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      UNKNOWN,
    );
  });

  // Proof: with the no-key-set refusal of `admitTrustedIssuerToken`
  // letting the token through to the configured verifier, this answered 401
  // unauthenticated; with `invalid_token` dropped from `mount.ts`'s whole
  // answer, it answered 500; watched 2026-10-22.
  it('refuses a stranger issuer invalid_token without fetching any key set', async () => {
    await claireCredential();
    const stranger = await issuers.add(`stranger-${crypto.randomUUID().slice(0, 8)}.test`);
    const idpFetches = idp.jwksFetches;
    expect(
      await send(await stranger.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects'),
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
    expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ jwksUri: ci.jwksUri, issuer: ci.url });
    // Within the 30 s failure cooldown the key set is not fetched again,
    // even once it would answer.
    ci.jwksStatus = 200;
    expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
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
    expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      INVALID,
    );
  });

  it('follows a key rotation with exactly one refetch once the cooldown allows it', async () => {
    h.close();
    h = openHarness({ cooldownMs: 0 });
    await populate();
    await claireCredential();
    expect(
      (await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).status,
    ).toBe(200);
    expect(ci.jwksFetches).toBe(1);
    await ci.rotate('key-2');
    expect(
      (await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).status,
    ).toBe(200);
    expect(ci.jwksFetches).toBe(2);
  });

  it('refetches no key set for an unknown kid inside the cooldown', async () => {
    await claireCredential();
    expect(
      (await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).status,
    ).toBe(200);
    await ci.rotate('key-2');
    for (let attempt = 0; attempt < 3; attempt += 1)
      expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
        INVALID,
      );
    expect(ci.jwksFetches).toBe(1);
  });

  it('binds one subject in two organizations through one shared issuer URL', async () => {
    await claireCredential();
    const theirs = await trust('bob', ci, WBS_B);
    expect(
      (await createOidc('bob', { trustedIssuerId: theirs, personId: 'bobs-agent' })).status,
    ).toBe(201);
    const a = await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects');
    expect(projectIds(a)).toEqual([projectA]);
    const b = await send(await ci.sign({ sub: MAIN, aud: WBS_B }), 'GET', '/api/projects');
    expect(projectIds(b)).toEqual([projectB]);
    expect(ci.jwksFetches).toBe(1);
  });

  // Proof: with the organization predicate removed from `findOidcCredential`'s
  // trusted issuer join, this admitted B's credential through A's issuer;
  // watched 2026-10-22.
  it("refuses a credential that names another organization's trusted issuer", async () => {
    const trustedIssuerId = await trust('dany', ci, WBS);
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-b', 'bobs-agent', ?, 'oidc', 'planted', ?, ?, ?, 1, ?)`,
      [crypto.randomUUID(), h.userId('bob'), ci.url, MAIN, trustedIssuerId, h.userId('bob')],
    );
    expect(await send(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      UNKNOWN,
    );
  });

  // Proof: with the configured-issuer comparison removed from
  // `admitTrustedIssuerToken`, this admitted the planted credential;
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
      await send(
        await idp.sign({ sub: 'machine@clients', aud: UPSTREAM_AUDIENCE }),
        'GET',
        '/api/projects',
      ),
    ).toEqual(UNKNOWN);
    expect(lastUsedAt(planted)).toBeNull();
    expect(usersTable()).toEqual(before);
  });
});

describe('a stored audience outside the authorization server (task 1.5 at use)', () => {
  // `wbs-mcp-agent-surface` M2's ordering: with slice 7 a stored audience that
  // breaks the rule (a `wbs:org` registration, a free-form narrowing) stops
  // verifying, as the audience preflight lists before the deploy.
  it('is refused invalid_token through the grant, fetching no key set, and machine_bearer_not_accepted on /api', async () => {
    const registration = crypto.randomUUID();
    const credential = crypto.randomUUID();
    h.sqlite.run(
      `INSERT INTO organization_trusted_issuer (id, organization_id, issuer, jwks_uri, default_audience, created_at) VALUES (?, 'org-a', ?, ?, 'wbs:org:org-a', 1)`,
      [registration, ci.url, ci.jwksUri],
    );
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, audience, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-a', 'claire', ?, 'oidc', 'legacy', ?, ?, NULL, ?, 1, ?)`,
      [credential, h.userId('dany'), ci.url, MAIN, registration, h.userId('dany')],
    );
    const narrowed = crypto.randomUUID();
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, issuer, subject, audience, trusted_issuer_id, created_at, created_by)
       VALUES (?, 'org-a', 'claire', ?, 'oidc', 'legacy-narrowed', ?, 'narrowed', 'deploy', ?, 1, ?)`,
      [narrowed, h.userId('dany'), ci.url, registration, h.userId('dany')],
    );
    const legacy = await ci.sign({ sub: MAIN, aud: 'wbs:org:org-a' });
    const narrowedToken = await ci.sign({ sub: 'narrowed', aud: ['wbs:org:org-a', 'deploy'] });
    expect(await viaMcp(legacy, 'GET', '/api/projects')).toEqual(INVALID);
    expect(await viaMcp(narrowedToken, 'GET', '/api/projects')).toEqual(INVALID);
    expect(ci.jwksFetches).toBe(0);
    expect(lastUsedAt(credential)).toBeNull();
    expect(lastUsedAt(narrowed)).toBeNull();
    expect(await as(legacy, 'GET', '/api/projects')).toEqual(NOT_ACCEPTED);
  });
});

describe('a trusted issuer token on /api (wbs-mcp-agent-surface M9)', () => {
  it('is refused machine_bearer_not_accepted before any credential read or key set fetch', async () => {
    const { id } = await claireCredential();
    // Registration fetched the discovery document; nothing after it may fetch.
    const fetchedAtRegistration = ci.jwksFetches + ci.discoveryFetches;
    expect(await as(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      NOT_ACCEPTED,
    );
    expect(
      await as(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/organization/members'),
    ).toEqual(NOT_ACCEPTED);
    expect(ci.jwksFetches + ci.discoveryFetches).toBe(fetchedAtRegistration);
    expect(lastUsedAt(id)).toBeNull();
    // The same token is admitted through the grant.
    expect(
      (await viaMcp(await ci.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).status,
    ).toBe(200);
  });

  // A stranger and a trusted issuer answer alike, so `/api` is no oracle for
  // which issuers some organization trusts.
  it('refuses a stranger issuer’s token the same, fetching nothing', async () => {
    await claireCredential();
    const stranger = await issuers.add(`stranger-${crypto.randomUUID().slice(0, 8)}.test`);
    expect(await as(await stranger.sign({ sub: MAIN, aud: WBS }), 'GET', '/api/projects')).toEqual(
      NOT_ACCEPTED,
    );
    expect(stranger.jwksFetches + stranger.discoveryFetches).toBe(0);
    expect(ci.jwksFetches).toBe(0);
  });
});
