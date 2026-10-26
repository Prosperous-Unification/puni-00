import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { MOST_MACHINE_GRANT_SECONDS } from '@wbs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { decodeJwt, decodeProtectedHeader, generateKeyPair, SignJWT } from 'jose';

import {
  importMachineGrantKeys,
  MACHINE_GRANT_AUDIENCE,
  MACHINE_GRANT_TOKEN_TYPE,
  type MachineGrantKeys,
} from '../runtime/machine-grant';
import { type LocalIssuer, LocalOidcIssuers } from '../testing/local-oidc-issuer';
import {
  addAgentPerson,
  issueApiKey,
  revokeMachineCredential,
} from '../testing/machine-credential-fixture';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';

/** mcp-01's dedicated secret in these tests; gw-01's `x-internal-auth` is the harness's. */
const SECRET = 'm'.repeat(32);
const GATEWAY_SECRET = 'x'.repeat(32);
const AUTHORIZATION_SERVER = 'https://wbs.example/mcp/oauth';
const GRANTS = '/internal/mcp/machine-grants';
const TWELVE_HOURS = 12 * 60 * 60;
const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };
const SUBJECT = 'system:serviceaccount:agents:claire';
/** No mcp-01 secret, a wrong one, and gw-01's `x-internal-auth` in its place. */
const WRONG_SECRETS: readonly Record<string, string>[] = [
  {},
  { [MCP_INTERNAL_SECRET_HEADER]: 'w'.repeat(32) },
  { 'x-internal-auth': GATEWAY_SECRET },
];

let issuers: LocalOidcIssuers;
let ci: LocalIssuer;
let keys: MachineGrantKeys;
let rotatedKeys: MachineGrantKeys;
let h: OrganizationHarness;
let projectA: string;

beforeAll(async () => {
  issuers = new LocalOidcIssuers();
  keys = await importMachineGrantKeys({ current: 'g'.repeat(32), previous: null });
  rotatedKeys = await importMachineGrantKeys({ current: 'n'.repeat(32), previous: 'g'.repeat(32) });
});

afterAll(async () => {
  await issuers.stop();
});

/**
 * Machine grants over be-01's production composition and real SQLite
 * (`wbs-mcp-agent-surface` tasks 1.2 and 1.3, design M3, M5, M14): mcp-01
 * posts a key or a workload assertion with its dedicated secret and receives
 * a grant, which it then presents with that secret on every call; each call
 * rereads the credential and consumes nothing.
 */
beforeEach(async () => {
  ci = await issuers.add(`ci-${crypto.randomUUID().slice(0, 8)}.test`);
  h = openHarness();
  await populate();
});

afterEach(() => {
  h.close();
});

function openHarness(grants: Partial<HarnessMachineGrants> = {}): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    trustedIssuers: { fetch: issuers.fetch, configuredIssuer: null },
    machineGrants: {
      secret: SECRET,
      keys,
      authorizationServer: AUTHORIZATION_SERVER,
      ...grants,
    },
  });
}

async function populate(activate = true): Promise<void> {
  for (const username of ['dany', 'vic', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'super_admin');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'bob', 'admin');
  h.bind('dany', 'org-a');
  h.bind('bob', 'org-b');
  if (!activate) return;
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectA = (created.body as { project: { id: string } }).project.id;
  const other = await h.call('bob', 'POST', '/api/projects', { name: 'Plan of B' });
  if (other.status !== 200) throw new Error(`create refused: ${JSON.stringify(other)}`);
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'vics-agent', 'org-a', h.userId('vic'));
}

function claireKey() {
  return issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'claire',
    issuedBy: h.userId('dany'),
  });
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

interface GrantBody {
  readonly issuer?: string;
  readonly credential: { kind: 'api_key'; key: string } | { kind: 'oidc'; assertion: string };
  readonly expiresAt?: number;
  readonly run?: string;
}

/** One grant request as mcp-01 sends it: the dedicated secret unless `headers` replace it. */
async function requestGrant(
  body: GrantBody,
  headers: Record<string, string> = { [MCP_INTERNAL_SECRET_HEADER]: SECRET },
): Promise<Answer> {
  const response = await h.request(GRANTS, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      issuer: body.issuer ?? AUTHORIZATION_SERVER,
      credential: body.credential,
      expiresAt: body.expiresAt ?? nowSeconds() + TWELVE_HOURS,
      ...(body.run === undefined ? {} : { run: body.run }),
    }),
  });
  const text = await response.text();
  return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text };
}

async function grantFor(key: string, run?: string): Promise<string> {
  const answer = await requestGrant({
    credential: { kind: 'api_key', key },
    ...(run === undefined ? {} : { run }),
  });
  if (answer.status !== 200) throw new Error(`grant refused: ${JSON.stringify(answer)}`);
  return (answer.body as { grant: string }).grant;
}

/** One call as mcp-01 makes it: the grant as Bearer, the dedicated secret beside it. */
function withGrant(
  grant: string,
  method: string,
  path: string,
  headers: Record<string, string> = { [MCP_INTERNAL_SECRET_HEADER]: SECRET },
): Promise<Answer> {
  return h.callWith(grant, method, path, undefined, headers);
}

function auditRows(action = 'machine_token_issued'): { detail: string }[] {
  return h.sqlite
    .query<{ detail: string }, [string]>(
      'SELECT detail FROM organization_audit WHERE action = ? ORDER BY created_at, id',
    )
    .all(action);
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

function delegationUses(): number {
  return (
    h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM delegation_use').get()?.n ?? -1
  );
}

function projectIds(answer: Answer): string[] {
  return (answer.body as { projects: { id: string }[] }).projects.map((project) => project.id);
}

/** Trusts `ci` in org-a and creates claire's `oidc` credential for {@link SUBJECT}. */
async function claireWorkload(): Promise<string> {
  const registered = await h.call('dany', 'POST', '/api/organization/trusted-issuers', {
    issuer: ci.url,
    audience: 'wbs',
  });
  if (registered.status !== 201) throw new Error(`trust refused: ${JSON.stringify(registered)}`);
  const created = await h.call('dany', 'POST', '/api/organization/machine-credentials', {
    source: 'oidc',
    name: 'workload',
    personId: 'claire',
    trustedIssuerId: (registered.body as { id: string }).id,
    subject: SUBJECT,
  });
  if (created.status !== 201) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return (created.body as { id: string }).id;
}

describe('issuing a machine grant', () => {
  it('issues a grant for a live API key, naming its credential, with the credential’s scopes', async () => {
    const { id, key } = await claireKey();
    const requested = nowSeconds() + TWELVE_HOURS;
    const answer = await requestGrant({
      credential: { kind: 'api_key', key },
      expiresAt: requested,
    });
    expect(answer).toMatchObject({
      status: 200,
      body: {
        credentialId: id,
        personId: 'claire',
        organizationId: 'org-a',
        scopes: ['read', 'write'],
        expiresAt: requested,
        runId: null,
      },
    });
    const grant = (answer.body as { grant: string }).grant;
    expect(decodeProtectedHeader(grant)).toMatchObject({
      typ: MACHINE_GRANT_TOKEN_TYPE,
      kid: keys.current.kid,
    });
    expect(decodeJwt(grant)).toMatchObject({
      aud: MACHINE_GRANT_AUDIENCE,
      sub: id,
      exp: requested,
    });
    // The key is never echoed.
    expect(JSON.stringify(answer.body)).not.toContain(key);
  });

  it('caps the grant at 24 hours and 60 seconds whatever mcp-01 asks', async () => {
    const { key } = await claireKey();
    const answer = await requestGrant({
      credential: { kind: 'api_key', key },
      expiresAt: nowSeconds() + 7 * 24 * 60 * 60,
    });
    const { iat, exp } = decodeJwt((answer.body as { grant: string }).grant);
    expect(exp! - iat!).toBe(MOST_MACHINE_GRANT_SECONDS);
  });

  it('grants only read to a credential whose person is bound to a viewer', async () => {
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'vics-agent',
      issuedBy: h.userId('vic'),
    });
    expect(await requestGrant({ credential: { kind: 'api_key', key } })).toMatchObject({
      status: 200,
      body: { scopes: ['read'] },
    });
  });

  it('refuses an unknown, revoked, wrong or non-member key alike, issuing nothing', async () => {
    const { id, key } = await claireKey();
    const wrong = `${key.slice(0, -4)}AAAA`;
    const unknown = `wbs_mk_${crypto.randomUUID()}.${key.slice(-43)}`;
    for (const presented of [wrong, unknown, 'wbs_mk_malformed', 'not-a-key'])
      expect(await requestGrant({ credential: { kind: 'api_key', key: presented } })).toEqual(
        UNKNOWN,
      );
    h.sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('dany')],
    );
    expect(await requestGrant({ credential: { kind: 'api_key', key } })).toEqual(UNKNOWN);
    h.member('org-a', 'dany', 'super_admin');
    revokeMachineCredential(h.sqlite, id, Date.now());
    expect(await requestGrant({ credential: { kind: 'api_key', key } })).toEqual(UNKNOWN);
    expect(auditRows()).toEqual([]);
  });

  // Proof: with the activation check of `machineGrantAuthority.issue`
  // removed, this answered 200 with a grant; watched 2026-10-26.
  it('issues nothing before activation', async () => {
    h.close();
    h = openHarness();
    await populate(false);
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const { key } = await claireKey();
    expect(await requestGrant({ credential: { kind: 'api_key', key } })).toEqual({
      status: 409,
      body: { error: 'not_activated' },
    });
    expect(
      await requestGrant({
        credential: { kind: 'oidc', assertion: await ci.sign({ sub: SUBJECT }) },
      }),
    ).toEqual({ status: 409, body: { error: 'not_activated' } });
  });

  // Proof: with the `internal_unauthorized` answer of the `mcp-dedicated`
  // policy replaced by `unknown_grant_key`, this saw that code instead, the
  // one mcp-01 would answer with a re-fetch rather than a reported fault;
  // watched 2026-10-26.
  it('answers a missing, wrong or gateway secret internal_unauthorized', async () => {
    const { key } = await claireKey();
    const body: GrantBody = { credential: { kind: 'api_key', key } };
    for (const headers of WRONG_SECRETS)
      expect(await requestGrant(body, headers)).toEqual({
        status: 401,
        body: { error: 'internal_unauthorized' },
      });
    expect(auditRows()).toEqual([]);
  });

  it('reports a different authorization server as a fault, issuing nothing', async () => {
    const { key } = await claireKey();
    const answer = await requestGrant({
      credential: { kind: 'api_key', key },
      issuer: 'https://other.example/mcp/oauth',
    });
    expect(answer.status).toBe(500);
    expect(auditRows()).toEqual([]);
  });

  it('answers a server fault after activation when the grant key is not configured', async () => {
    h.close();
    h = openHarness({ keys: null });
    await populate();
    const { key } = await claireKey();
    expect((await requestGrant({ credential: { kind: 'api_key', key } })).status).toBe(500);
  });

  it('refuses a run that is empty, longer than 256 characters or shaped like a secret', async () => {
    const { key } = await claireKey();
    for (const run of ['', 'r'.repeat(257), 'f'.repeat(64), 'issuer|subject'])
      expect(await requestGrant({ credential: { kind: 'api_key', key }, run })).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(auditRows()).toEqual([]);
  });
});

describe('issuing a machine grant for a workload assertion', () => {
  it('issues for a trusted issuer’s assertion, never outliving it', async () => {
    const id = await claireWorkload();
    const assertionExpiry = nowSeconds() + 300;
    const answer = await requestGrant({
      credential: {
        kind: 'oidc',
        assertion: await ci.sign({ sub: SUBJECT, aud: 'wbs', exp: assertionExpiry }),
      },
    });
    expect(answer).toMatchObject({
      status: 200,
      body: { credentialId: id, personId: 'claire', expiresAt: assertionExpiry },
    });
    expect(JSON.parse(auditRows()[0]?.detail ?? '{}')).toEqual({
      credentialId: id,
      personId: 'claire',
      source: 'oidc',
    });
  });

  // Proof: with a single-use consume of the assertion's `(iss, jti)` added to
  // `admitMachineProof` (`SqliteDelegationUse`), the second and third
  // requests answered 401 unknown_identity; watched 2026-10-26.
  it('admits one Kubernetes token, one jti, from three processes', async () => {
    await claireWorkload();
    const assertion = await ci.sign({ sub: SUBJECT, aud: 'wbs', jti: 'kubelet-token-1' });
    const answers = await Promise.all(
      [1, 2, 3].map(() => requestGrant({ credential: { kind: 'oidc', assertion } })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
  });

  it('refuses an ID-JAG or an access token assertion, naming its typ', async () => {
    await claireWorkload();
    for (const typ of ['oauth-id-jag+jwt', 'at+jwt'])
      expect(
        await requestGrant({
          credential: {
            kind: 'oidc',
            assertion: await ci.signTyped({ sub: SUBJECT, aud: 'wbs' }, typ),
          },
        }),
      ).toEqual({ status: 401, body: { error: 'unsupported_assertion_type', typ } });
    expect(
      (
        await requestGrant({
          credential: {
            kind: 'oidc',
            assertion: await ci.signTyped({ sub: SUBJECT, aud: 'wbs' }, 'JWT'),
          },
        })
      ).status,
    ).toBe(200);
  });

  it('refuses an unknown subject unknown_identity and a stranger issuer invalid_token', async () => {
    await claireWorkload();
    expect(
      await requestGrant({
        credential: { kind: 'oidc', assertion: await ci.sign({ sub: 'someone-else', aud: 'wbs' }) },
      }),
    ).toEqual(UNKNOWN);
    const stranger = await issuers.add(`stranger-${crypto.randomUUID().slice(0, 8)}.test`);
    expect(
      await requestGrant({
        credential: { kind: 'oidc', assertion: await stranger.sign({ sub: SUBJECT, aud: 'wbs' }) },
      }),
    ).toEqual({ status: 401, body: { error: 'invalid_token' } });
  });
});

describe('the issuance audit', () => {
  it('writes one row for a run issued twice and one for two issuances without a run', async () => {
    const { key } = await claireKey();
    for (const run of ['run-a', 'run-a', undefined, undefined]) await grantFor(key, run);
    expect(
      auditRows().map((row) => (JSON.parse(row.detail) as { runId?: string }).runId ?? null),
    ).toEqual(['run-a', null]);
    for (const row of auditRows()) expect(row.detail).not.toContain(key);
  });

  // Proof: with the read-first early return of
  // `MachineTokenAuditRepository.record` removed, this answered 'pending'
  // while the batch held the turn; watched 2026-10-26.
  it('answers a token request while a batch holds the write turn, its row and last use fresh', async () => {
    const { key } = await claireKey();
    await grantFor(key, 'run-a');
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const held = h.holdWriteTurn(release.promise, () => {
      entered.resolve(undefined);
    });
    await entered.promise;
    try {
      const answer = await Promise.race([
        requestGrant({ credential: { kind: 'api_key', key }, run: 'run-a' }),
        Bun.sleep(1_000).then(() => 'pending' as const),
      ]);
      expect(answer === 'pending' ? answer : answer.status).toBe(200);
    } finally {
      release.resolve(undefined);
      await held;
    }
  });
});

describe('a machine grant at each call', () => {
  it('acts as its credential’s person’s account in its organization, with the secret', async () => {
    const { key } = await claireKey();
    const answer = await withGrant(await grantFor(key), 'GET', '/api/projects');
    expect(answer.status).toBe(200);
    expect(projectIds(answer)).toEqual([projectA]);
  });

  // Proof: with the secret check of the grant branch in `delegatedOrSession`
  // removed, both calls answered 200; watched 2026-10-26.
  it('refuses a grant without the secret, or with a wrong one, internal_unauthorized', async () => {
    const { key } = await claireKey();
    const grant = await grantFor(key);
    for (const headers of WRONG_SECRETS)
      expect(await withGrant(grant, 'GET', '/api/projects', headers)).toEqual({
        status: 401,
        body: { error: 'internal_unauthorized' },
      });
  });

  // Proof: with `admitMachineGrant` answering the principal from the grant's
  // claims without rereading the credential, this answered 200 after the
  // revocation; watched 2026-10-26.
  it('is refused unknown_identity at the next call after its credential is revoked', async () => {
    const { id, key } = await claireKey();
    const grant = await grantFor(key);
    expect((await withGrant(grant, 'GET', '/api/projects')).status).toBe(200);
    revokeMachineCredential(h.sqlite, id, Date.now());
    expect(await withGrant(grant, 'GET', '/api/projects')).toEqual(UNKNOWN);
  });

  it('is refused unknown_identity once its account leaves the organization', async () => {
    const { key } = await claireKey();
    const grant = await grantFor(key);
    h.sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('dany')],
    );
    expect(await withGrant(grant, 'GET', '/api/projects')).toEqual(UNKNOWN);
  });

  // Proof: with a single-use consume of the grant's `jti` (through
  // `SqliteDelegationUse`) wrapped around the grant verifier, a later read
  // answered 401 instead of 200; watched 2026-10-26.
  it('writes nothing per call: 100 reads, no delegation use and at most one last-use touch', async () => {
    const { id, key } = await claireKey();
    const grant = await grantFor(key);
    const before = lastUsedAt(id);
    for (let call = 0; call < 100; call += 1)
      expect((await withGrant(grant, 'GET', '/api/projects')).status).toBe(200);
    expect(delegationUses()).toBe(0);
    expect(lastUsedAt(id)).toBe(before);
  });

  it('reads only for a viewer-bound credential', async () => {
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'vics-agent',
      issuedBy: h.userId('vic'),
    });
    const grant = await grantFor(key);
    expect((await withGrant(grant, 'GET', '/api/projects')).status).toBe(200);
    const write = await h.callWith(
      grant,
      'POST',
      `/api/projects/${projectA}/commands`,
      { commands: [{ kind: 'createWorkItem', parentId: null, name: 'x' }] },
      { [MCP_INTERNAL_SECRET_HEADER]: SECRET },
    );
    expect(write).toMatchObject({ status: 403, body: { error: 'insufficient_scope' } });
  });

  it('verifies a grant of the previous key after a rotation, and refuses an unknown kid', async () => {
    const { key } = await claireKey();
    const before = await grantFor(key);
    h.close();
    h = openHarness({ keys: rotatedKeys });
    await populate();
    // The fresh store holds no credential named by `before`'s `sub`: a
    // rotation keeps the signature valid, and the reread then decides.
    expect(await withGrant(before, 'GET', '/api/projects')).toEqual(UNKNOWN);
    h.close();
    h = openHarness({
      keys: await importMachineGrantKeys({ current: 'n'.repeat(32), previous: null }),
    });
    await populate();
    expect(await withGrant(before, 'GET', '/api/projects')).toEqual({
      status: 401,
      body: { error: 'unknown_grant_key' },
    });
  });

  // Proof: with the grant verifier also trying an RS256 delegation key (this
  // forgery's public key, handed to it for the run) when the HMAC check
  // fails, this answered 200 for the forgery under the current grant kid;
  // watched 2026-10-26.
  it('refuses a grant signed with the delegation key under the current grant kid', async () => {
    const { id } = await claireKey();
    const delegationKey = await generateKeyPair('RS256');
    const now = nowSeconds();
    const forged = await new SignJWT({ person_id: 'claire', org: 'org-a', scope: 'read write' })
      .setProtectedHeader({ alg: 'RS256', typ: MACHINE_GRANT_TOKEN_TYPE, kid: keys.current.kid })
      .setIssuer('wbs')
      .setAudience(MACHINE_GRANT_AUDIENCE)
      .setSubject(id)
      .setJti(crypto.randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(delegationKey.privateKey);
    expect(await withGrant(forged, 'GET', '/api/projects')).toEqual({
      status: 401,
      body: { error: 'invalid_token' },
    });
  });

  it('refuses a grant living longer than the cap, or for another audience', async () => {
    const { id } = await claireKey();
    const now = nowSeconds();
    const sign = (audience: string, lifetime: number) =>
      new SignJWT({ person_id: 'claire', org: 'org-a', scope: 'read write' })
        .setProtectedHeader({ alg: 'HS256', typ: MACHINE_GRANT_TOKEN_TYPE, kid: keys.current.kid })
        .setIssuer('wbs')
        .setAudience(audience)
        .setSubject(id)
        .setJti(crypto.randomUUID())
        .setIssuedAt(now)
        .setExpirationTime(now + lifetime)
        .sign(keys.current.key);
    expect(
      await withGrant(
        await sign(MACHINE_GRANT_AUDIENCE, MOST_MACHINE_GRANT_SECONDS + 1),
        'GET',
        '/api/projects',
      ),
    ).toEqual({ status: 401, body: { error: 'invalid_token' } });
    expect(
      await withGrant(await sign('wbs-be-01/via-mcp-01', 600), 'GET', '/api/projects'),
    ).toEqual({ status: 401, body: { error: 'invalid_token' } });
    expect(
      (await withGrant(await sign(MACHINE_GRANT_AUDIENCE, 600), 'GET', '/api/projects')).status,
    ).toBe(200);
  });

  it('refuses a grant beside a session cookie', async () => {
    const { key } = await claireKey();
    const grant = await grantFor(key);
    expect(
      (
        await withGrant(grant, 'GET', '/api/projects', {
          [MCP_INTERNAL_SECRET_HEADER]: SECRET,
          cookie: `__Host-wbs_access=${h.token('dany')}`,
        })
      ).status,
    ).toBe(401);
  });
});

describe('the existing mcp-01 routes during the secret cutover', () => {
  it('admit either secret, and answer neither internal_unauthorized', async () => {
    const route = (headers: Record<string, string>) =>
      h.request('/internal/mcp/credentials/ended', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ credentialId: crypto.randomUUID(), family: 'f' }),
      });
    expect((await route({ [MCP_INTERNAL_SECRET_HEADER]: SECRET })).status).toBe(200);
    expect((await route({ 'x-internal-auth': GATEWAY_SECRET })).status).toBe(200);
    const refused = await route({});
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: 'internal_unauthorized' });
  });
});
