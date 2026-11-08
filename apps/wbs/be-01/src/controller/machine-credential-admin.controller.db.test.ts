import { JwksTokenVerifier } from '@wbs/auth';
import { digestMachineSecret } from '@wbs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair } from 'jose';

import { addAgentPerson, MACHINE_BEARER_NOT_ACCEPTED } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

const PATH = '/api/organization/machine-credentials';
const HOUR = 60 * 60 * 1000;
const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };

let jwks: ReturnType<typeof Bun.serve>;
let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let clockAt: number;

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
  const { publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'machines', use: 'sig' }] }),
  });
});

afterAll(async () => {
  await jwks.stop(true);
});

/**
 * Machine credential administration (`wbs-machine-credentials` tasks 2.2 to
 * 2.4, design A7, A11, A15, A17, A22, A23) over be-01's production
 * composition and real SQLite, with one injected clock shared by the routes
 * and the API-key verification, so a key minted here is judged by the same
 * path a fleet's request takes: mcp-01's forwarded grant ({@link asAgent}).
 */
beforeEach(async () => {
  clockAt = Date.now();
  h = openHarness();
  for (const username of ['dany', 'mem', 'other', 'vic', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'super_admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-a', 'other', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'bob', 'admin');
  for (const username of ['dany', 'mem', 'other', 'vic']) h.bind(username, 'org-a');
  h.bind('bob', 'org-b');
  h.activate();
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'mems-agent', 'org-a', h.userId('mem'));
  addAgentPerson(h.sqlite, 'others-agent', 'org-a', h.userId('other'));
  addAgentPerson(h.sqlite, 'loose', 'org-a', null);
  addAgentPerson(h.sqlite, 'bobs-agent', 'org-b', h.userId('bob'));
});

afterEach(() => {
  h.close();
});

function openHarness(): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: 'api://wbs',
        issuer: 'https://idp.test',
        jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
    now: () => clockAt,
    machineGrants,
  });
}

/** One call of the agent holding `key`, as mcp-01 forwards it, at the harness clock. */
function asAgent(key: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return callForwarded(h, key, method, path, body, { now: clockAt });
}

interface Created {
  readonly id: string;
  readonly key: string;
  readonly answer: Answer;
}

/** Creates an API key as `username` and answers its id and key, or the refusal. */
async function create(username: string, personId: string, name = personId): Promise<Created> {
  const answer = await h.call(username, 'POST', PATH, { source: 'api_key', name, personId });
  const body = answer.body as { id?: string; key?: string };
  return { id: body.id ?? '', key: body.key ?? '', answer };
}

/** The secret part of a key: what only its holder has. */
const secretOf = (key: string): string => key.slice(key.indexOf('.') + 1);

function rows(sql: string, ...params: string[]): unknown[] {
  return h.sqlite.query(sql).all(...params);
}

function credentialCount(): number {
  return rows('SELECT id FROM machine_credential').length;
}

/**
 * The credential administration's audit rows, oldest first: not the
 * `machine_token_issued` row each agent call's grant writes.
 */
function auditRows(): { action: string; actor_id: string; subject_id: string; detail: string }[] {
  return h.sqlite
    .query<{ action: string; actor_id: string; subject_id: string; detail: string }, []>(
      "SELECT action, actor_id, subject_id, detail FROM organization_audit WHERE subject_kind = 'machine_credential' AND action <> 'machine_token_issued' ORDER BY created_at, id",
    )
    .all();
}

function listed(answer: Answer): { id: string; personId: string }[] {
  return (answer.body as { credentials: { id: string; personId: string }[] }).credentials;
}

describe('creating an API key', () => {
  it('shows the key once, stores only its digest, lists no secret and audits the issuer', async () => {
    const created = await create('dany', 'claire');
    expect(created.answer).toMatchObject({
      status: 201,
      body: {
        source: 'api_key',
        name: 'claire',
        personId: 'claire',
        issuedBy: h.userId('dany'),
      },
    });
    expect(created.key.startsWith(`wbs_mk_${created.id}.`)).toBe(true);
    const secret = secretOf(created.key);
    const digest = await digestMachineSecret(secret);
    expect(rows('SELECT digest FROM machine_credential_secret')).toEqual([{ digest }]);
    expect(await asAgent(created.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });

    const list = await h.call('dany', 'GET', PATH);
    expect(list.status).toBe(200);
    expect(listed(list).map((each) => each.id)).toEqual([created.id]);
    const audit = auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'machine_credential_created',
      actor_id: h.userId('dany'),
      subject_id: created.id,
    });
    const detail = JSON.parse(audit[0]?.detail ?? '{}') as Record<string, unknown>;
    expect(detail).toMatchObject({
      source: 'api_key',
      personId: 'claire',
      issuedBy: h.userId('dany'),
    });
    expect(detail).not.toHaveProperty('name');
    const everyAuditRow = rows('SELECT * FROM organization_audit');
    for (const serialized of [JSON.stringify(list.body), JSON.stringify(everyAuditRow)]) {
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(digest);
      expect(serialized).not.toContain('wbs_mk_');
    }
  });

  it('lets a member issue for their own agent, acting as the member with read and write only', async () => {
    const created = await create('mem', 'mems-agent');
    expect(created.answer).toMatchObject({ status: 201, body: { issuedBy: h.userId('mem') } });
    expect(await asAgent(created.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });
    expect(await asAgent(created.key, 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
  });

  // Proof: with the member's own-account check in `createApiKey` removed,
  // this created the credential for the stranger's agent; watched 2026-10-22.
  it("refuses a member another account's agent, writing nothing", async () => {
    expect((await create('mem', 'claire')).answer).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect((await create('mem', 'loose')).answer).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(credentialCount()).toBe(0);
    expect(auditRows()).toEqual([]);
  });

  it('lets an admin issue for every agent of the organization', async () => {
    expect((await create('dany', 'mems-agent')).answer.status).toBe(201);
    expect((await create('dany', 'others-agent')).answer.status).toBe(201);
  });

  it('refuses a person of another organization or of kind person', async () => {
    h.sqlite.run(
      "INSERT INTO person (id, name, kind, account_id) VALUES ('hugo', 'Hugo', 'person', ?)",
      [h.userId('dany')],
    );
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('hugo', 'org-a', 'hugo')",
    );
    for (const personId of ['bobs-agent', 'hugo', 'nobody'])
      expect((await create('dany', personId)).answer).toEqual({
        status: 404,
        body: { error: 'unknown_person' },
      });
    expect(credentialCount()).toBe(0);
  });

  it('refuses an unbound agent, naming it', async () => {
    expect((await create('dany', 'loose')).answer).toEqual({
      status: 409,
      body: { error: 'person_not_bound', personId: 'loose' },
    });
    expect(credentialCount()).toBe(0);
  });

  it('refuses an agent bound to an account that is no member', async () => {
    addAgentPerson(h.sqlite, 'stray', 'org-a', h.userId('bob'));
    expect((await create('dany', 'stray')).answer).toEqual({
      status: 409,
      body: { error: 'account_not_member' },
    });
    expect(credentialCount()).toBe(0);
  });

  it('refuses a live name twice, and frees it on revoke', async () => {
    const first = await create('dany', 'claire', 'fleet');
    expect((await create('dany', 'mems-agent', 'fleet')).answer).toEqual({
      status: 409,
      body: { error: 'name_taken' },
    });
    expect((await h.call('dany', 'DELETE', `${PATH}/${first.id}`)).status).toBe(204);
    expect((await create('dany', 'mems-agent', 'fleet')).answer.status).toBe(201);
  });

  // Proof: with the route's `isSecretShaped` check removed, each name was
  // stored (201); watched 2026-10-22.
  it('refuses a name shaped like a secret or a subject, storing nothing', async () => {
    for (const name of ['a|b', 'samlp|acme|carol', 'wbs_mk_fleet', 'ab'.repeat(32)])
      expect(
        await h.call('dany', 'POST', PATH, { source: 'api_key', name, personId: 'claire' }),
      ).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(credentialCount()).toBe(0);
    expect(auditRows()).toEqual([]);
  });

  it('refuses a body that names another source or an out-of-range name', async () => {
    for (const body of [
      { source: 'oidc', name: 'x', personId: 'claire' },
      { source: 'auth0', name: 'x', personId: 'claire' },
      { source: 'mcp_consent', name: 'x', personId: 'claire' },
      { source: 'api_key', name: '', personId: 'claire' },
      { source: 'api_key', name: 'x'.repeat(81), personId: 'claire' },
    ])
      expect(await h.call('dany', 'POST', PATH, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(credentialCount()).toBe(0);
  });

  // Proof: with `createApiKey`'s audit row appended in a second transaction
  // after the credential committed, this answered 201 instead of 500;
  // watched 2026-10-22.
  it('stores nothing when the audit row cannot be written', async () => {
    h.sqlite.run(
      "CREATE TRIGGER refuse_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );
    expect((await create('dany', 'claire')).answer.status).toBe(500);
    expect(credentialCount()).toBe(0);
    expect(rows('SELECT id FROM machine_credential_secret')).toEqual([]);
  });
});

describe('listing', () => {
  it("narrows a member to their own agents' credentials, and filters by person", async () => {
    const mine = await create('dany', 'mems-agent');
    await create('dany', 'claire');
    await create('dany', 'others-agent');
    expect(listed(await h.call('mem', 'GET', PATH)).map((each) => each.id)).toEqual([mine.id]);
    expect(
      listed(await h.call('dany', 'GET', `${PATH}?personId=claire`)).map((each) => each.personId),
    ).toEqual(['claire']);
    expect(listed(await h.call('dany', 'GET', PATH))).toHaveLength(3);
  });

  it('shows last use, and revoked credentials only when asked', async () => {
    const created = await create('dany', 'claire');
    await asAgent(created.key, 'GET', '/api/projects');
    expect(listed(await h.call('dany', 'GET', PATH))[0]).toMatchObject({
      lastUsedAt: clockAt,
      revokedAt: null,
      rotationEndsAt: null,
    });
    await h.call('dany', 'DELETE', `${PATH}/${created.id}`);
    expect(listed(await h.call('dany', 'GET', PATH))).toEqual([]);
    expect(listed(await h.call('dany', 'GET', `${PATH}?include=revoked`))[0]).toMatchObject({
      id: created.id,
      revokedAt: clockAt,
      secrets: [],
    });
  });

  it('refuses an unknown query', async () => {
    expect(await h.call('dany', 'GET', `${PATH}?include=everything`)).toEqual({
      status: 400,
      body: { error: 'invalid_query' },
    });
  });
});

describe('rotation', () => {
  it('keeps the id, admits both secrets for 24 hours, then only the new one', async () => {
    const created = await create('dany', 'claire');
    const t0 = clockAt;
    const rotated = await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`);
    expect(rotated).toMatchObject({
      status: 201,
      body: { id: created.id, previousExpiresAt: t0 + 24 * HOUR },
    });
    const next = (rotated.body as { key: string }).key;
    expect(next.startsWith(`wbs_mk_${created.id}.`)).toBe(true);
    expect(next).not.toBe(created.key);
    expect(listed(await h.call('dany', 'GET', PATH))[0]).toMatchObject({
      rotationEndsAt: t0 + 24 * HOUR,
    });

    clockAt = t0 + 23 * HOUR;
    expect((await asAgent(created.key, 'GET', '/api/projects')).status).toBe(200);
    expect((await asAgent(next, 'GET', '/api/projects')).status).toBe(200);
    clockAt = t0 + 25 * HOUR;
    // Through mcp-01 the grant's lifetime cap at the secret's expiry refuses
    // the old key as well as `admitMachineCredential`'s expiry predicate, whose
    // own negative is `machine-credential.test.ts` since 7.1 (M9).
    expect(await asAgent(created.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect((await asAgent(next, 'GET', '/api/projects')).status).toBe(200);

    const audit = auditRows().filter((row) => row.action === 'machine_credential_rotated');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: h.userId('dany'), subject_id: created.id });
    const detail = JSON.stringify(audit);
    expect(detail).toContain('secretId');
    expect(detail).not.toContain(secretOf(next));
    expect(detail).not.toContain(await digestMachineSecret(secretOf(next)));
  });

  // Proof: with the open-window check in `rotateApiKey` removed, this
  // answered 201; watched 2026-10-22.
  it('refuses a second rotation inside the window, and allows one after it', async () => {
    const created = await create('dany', 'claire');
    expect((await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`)).status).toBe(201);
    expect(await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`)).toEqual({
      status: 409,
      body: { error: 'rotation_in_progress' },
    });
    expect(rows('SELECT id FROM machine_credential_secret')).toHaveLength(2);
    clockAt += 25 * HOUR;
    expect((await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`)).status).toBe(201);
  });

  // Proof: with the source check in `rotateApiKey` removed, this answered
  // 201; watched 2026-10-22.
  it('refuses rotation of a consent credential at the issuer, changing nothing', async () => {
    const id = crypto.randomUUID();
    h.sqlite.run(
      "INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, mcp_family_id, created_at) VALUES (?, 'org-a', 'claire', ?, 'mcp_consent', 'laptop', 'family-1', 1)",
      [id, h.userId('dany')],
    );
    expect(await h.call('dany', 'POST', `${PATH}/${id}/rotate`)).toEqual({
      status: 409,
      body: { error: 'rotation_at_issuer' },
    });
    expect(rows('SELECT id FROM machine_credential_secret')).toEqual([]);
    expect(auditRows()).toEqual([]);
  });
});

describe('revocation', () => {
  it('ends both secrets mid-window and audits once; a second revoke is not_found', async () => {
    const created = await create('dany', 'claire');
    const rotated = await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`);
    const next = (rotated.body as { key: string }).key;
    expect(await h.call('dany', 'DELETE', `${PATH}/${created.id}`)).toEqual({
      status: 204,
      body: null,
    });
    expect(await asAgent(created.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(await asAgent(next, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(await h.call('dany', 'DELETE', `${PATH}/${created.id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await h.call('dany', 'POST', `${PATH}/${created.id}/rotate`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    // One clock instant for all three acts, so compared as a set.
    expect(
      auditRows()
        .map((row) => row.action)
        .sort(),
    ).toEqual([
      'machine_credential_created',
      'machine_credential_revoked',
      'machine_credential_rotated',
    ]);
  });

  // Proof: with the own-account predicate dropped from `reachable`, this
  // listed the stranger's credential to the member; watched 2026-10-22.
  it("refuses a member the credentials of another account's agent", async () => {
    const strangers = await create('dany', 'claire');
    expect(listed(await h.call('mem', 'GET', PATH))).toEqual([]);
    for (const [method, path] of [
      ['POST', `${PATH}/${strangers.id}/rotate`],
      ['DELETE', `${PATH}/${strangers.id}`],
    ] as const)
      expect(await h.call('mem', method, path)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    expect((await asAgent(strangers.key, 'GET', '/api/projects')).status).toBe(200);
    const own = await create('mem', 'mems-agent');
    expect((await h.call('mem', 'POST', `${PATH}/${own.id}/rotate`)).status).toBe(201);
    expect((await h.call('mem', 'DELETE', `${PATH}/${own.id}`)).status).toBe(204);
  });

  it("answers another organization's credential not_found", async () => {
    const created = await create('dany', 'claire');
    expect(await h.call('bob', 'DELETE', `${PATH}/${created.id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(listed(await h.call('bob', 'GET', PATH))).toEqual([]);
  });
});

describe('who may administer', () => {
  // Proof: with viewers admitted by `administeringRole`, this answered the
  // viewer's list 200; watched 2026-10-22.
  it('refuses a viewer every credential route', async () => {
    const created = await create('dany', 'claire');
    addAgentPerson(h.sqlite, 'vics-agent', 'org-a', h.userId('vic'));
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { source: 'api_key', name: 'v', personId: 'vics-agent' }],
      ['POST', `${PATH}/${created.id}/rotate`, undefined],
      ['DELETE', `${PATH}/${created.id}`, undefined],
    ] as const)
      expect(await h.call('vic', method, path, body)).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    expect(credentialCount()).toBe(1);
  });

  // Proof: with the delegation guard dropped from the routes'
  // `sessionOrganization`, this answered a machine key's list 200, and the
  // MCP delegation case below its list 200 too; watched 2026-10-22.
  it('refuses a machine key every credential route', async () => {
    const created = await create('dany', 'claire');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { source: 'api_key', name: 'x', personId: 'claire' }],
      ['POST', `${PATH}/${created.id}/rotate`, undefined],
      ['DELETE', `${PATH}/${created.id}`, undefined],
    ] as const) {
      expect(await asAgent(created.key, method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
      // The key itself as a Bearer on `/api` is refused before any route (M9).
      expect(await h.callWith(created.key, method, path, body)).toEqual(
        MACHINE_BEARER_NOT_ACCEPTED,
      );
    }
    expect(credentialCount()).toBe(1);
    expect(rows('SELECT id FROM machine_credential_secret')).toHaveLength(1);
  });

  it('refuses an MCP delegation every credential route', async () => {
    const created = await create('dany', 'claire');
    h.close();
    const keys = await generateKeyPair('RS256');
    h = OrganizationHarness.open({ delegationKey: keys.publicKey });
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    h.bind('dany', 'org-a');
    h.activate();
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const own = await create('dany', 'claire');
    expect(own.answer.status).toBe(201);
    mapUpstream(h, 'dany', 'sub-dany');
    const delegation = () => delegationFor(h, keys.privateKey, 'dany', 'org-a', 'sub-dany');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { source: 'api_key', name: 'x', personId: 'claire' }],
      ['POST', `${PATH}/${own.id}/rotate`, undefined],
      ['DELETE', `${PATH}/${own.id}`, undefined],
    ] as const)
      expect(await h.callWith(await delegation(), method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
    // This harness mounts no directory command runner; a delegation's cascade
    // is refused by the same `delegated` scope flag the machine key's case
    // proves.
    expect(credentialCount()).toBe(1);
    expect(created.id).not.toBe(own.id);
  });

  it('answers every credential route no_active_organization before activation', async () => {
    h.close();
    h = openHarness();
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { source: 'api_key', name: 'x', personId: 'claire' }],
      ['POST', `${PATH}/${crypto.randomUUID()}/rotate`, undefined],
      ['DELETE', `${PATH}/${crypto.randomUUID()}`, undefined],
    ] as const)
      expect(await h.call('dany', method, path, body)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    expect(credentialCount()).toBe(0);
  });
});

describe("a credential's person", () => {
  const directory = (command: Record<string, unknown>) =>
    h.call('dany', 'POST', '/api/directory/commands', { commands: [command] });

  it('refuses removing a person with a live machine credential unless cascaded', async () => {
    const created = await create('dany', 'claire');
    expect(await directory({ kind: 'deletePerson', personId: 'claire', cascade: false })).toEqual({
      status: 409,
      body: {
        error: 'in_use',
        at: 0,
        kind: 'deletePerson',
        usage: { projects: [], members: [], machineCredentials: 1 },
      },
    });
    expect(credentialCount()).toBe(1);
    expect(
      (await directory({ kind: 'deletePerson', personId: 'claire', cascade: true })).status,
    ).toBe(200);
    expect(credentialCount()).toBe(0);
    expect(rows('SELECT id FROM machine_credential_secret')).toEqual([]);
    expect(await asAgent(created.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    const revoked = auditRows().filter((row) => row.action === 'machine_credential_revoked');
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({ actor_id: h.userId('dany'), subject_id: created.id });
  });

  it('removes a person whose credentials are all revoked, their rows with it', async () => {
    const created = await create('dany', 'claire');
    expect((await h.call('dany', 'DELETE', `${PATH}/${created.id}`)).status).toBe(204);
    expect(
      (await directory({ kind: 'deletePerson', personId: 'claire', cascade: false })).status,
    ).toBe(200);
    expect(credentialCount()).toBe(0);
  });

  it('refuses unbinding or rebinding a person a live machine credential acts through', async () => {
    const created = await create('dany', 'claire');
    for (const accountId of [null, h.userId('mem')])
      expect(
        await directory({ kind: 'patchPerson', personId: 'claire', patch: { accountId } }),
      ).toEqual({
        status: 409,
        body: {
          error: 'in_use',
          at: 0,
          kind: 'patchPerson',
          usage: { projects: [], members: [], machineCredentials: 1 },
        },
      });
    expect(rows("SELECT account_id FROM person WHERE id = 'claire'")).toEqual([
      { account_id: h.userId('dany') },
    ]);
    expect(
      (
        await directory({
          kind: 'patchPerson',
          personId: 'claire',
          patch: { accountId: h.userId('dany') },
        })
      ).status,
    ).toBe(200);
    expect((await h.call('dany', 'DELETE', `${PATH}/${created.id}`)).status).toBe(204);
    expect(
      (await directory({ kind: 'patchPerson', personId: 'claire', patch: { accountId: null } }))
        .status,
    ).toBe(200);
  });

  it('refuses turning an agent with a live machine credential into a person', async () => {
    const created = await create('dany', 'claire');
    expect(
      await directory({ kind: 'patchPerson', personId: 'claire', patch: { kind: 'person' } }),
    ).toEqual({
      status: 409,
      body: {
        error: 'in_use',
        at: 0,
        kind: 'patchPerson',
        usage: { projects: [], members: [], machineCredentials: 1 },
      },
    });
    expect(rows("SELECT kind FROM person WHERE id = 'claire'")).toEqual([{ kind: 'agent' }]);
    expect((await asAgent(created.key, 'GET', '/api/projects')).status).toBe(200);
  });

  const cascade = (personId: string) => ({
    commands: [{ kind: 'deletePerson', personId, cascade: true }],
  });
  const FORBIDDEN = { status: 403, body: { error: 'forbidden', at: 0, kind: 'deletePerson' } };

  it("refuses a member's cascade over another account's agent's credential", async () => {
    const strangers = await create('dany', 'claire');
    expect(await h.call('mem', 'POST', '/api/directory/commands', cascade('claire'))).toEqual(
      FORBIDDEN,
    );
    expect(credentialCount()).toBe(1);
    expect(auditRows().map((row) => row.action)).toEqual(['machine_credential_created']);
    expect((await asAgent(strangers.key, 'GET', '/api/projects')).status).toBe(200);
    await create('mem', 'mems-agent');
    expect(
      (await h.call('mem', 'POST', '/api/directory/commands', cascade('mems-agent'))).status,
    ).toBe(200);
  });

  it("refuses a machine key's cascade over its own person", async () => {
    const created = await create('dany', 'claire');
    expect(
      await asAgent(created.key, 'POST', '/api/directory/commands', cascade('claire')),
    ).toEqual(FORBIDDEN);
    expect(credentialCount()).toBe(1);
    expect((await asAgent(created.key, 'GET', '/api/projects')).status).toBe(200);
  });
});
