import { JwksTokenVerifier } from '@wbs/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair } from 'jose';

import {
  addAgentPerson,
  issueApiKey,
  MACHINE_BEARER_NOT_ACCEPTED,
  revokeMachineCredential,
} from '../testing/machine-credential-fixture';
import {
  callForwarded,
  forwardingMachineGrants,
  requestGrant,
} from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';

const ISSUER = 'https://idp.test';
const AUDIENCE = 'api://wbs';

let jwks: ReturnType<typeof Bun.serve>;
let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let projectA: string;
let projectB: string;
let leaf: string;

beforeAll(async () => {
  const { publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'machines', use: 'sig' }] }),
  });
  machineGrants = await forwardingMachineGrants();
});

afterAll(async () => {
  await jwks.stop(true);
});

/**
 * The `wbs_mk_` API-key verification path (`wbs-machine-credentials` tasks
 * 1.4 and 1.6, design A12, A13, A22) over be-01's production composition and
 * real SQLite, with an upstream JWT verifier configured so a key that reached
 * it would be judged there: a live key acts as its person's bound account,
 * capped to read and write, in its credential's organization, pinned to its
 * person.
 *
 * Agents reach be-01 on the MCP path (`wbs-mcp-agent-surface` task 7.0): the
 * key goes to mcp-01's token endpoint, which asks be-01 for a grant, and each
 * tool call carries that grant ({@link callForwarded}). The key itself as a
 * Bearer on `/api` is refused `machine_bearer_not_accepted` before any read
 * (M9, task 7.1).
 */
beforeEach(async () => {
  h = openHarness();
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
  const rows = await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  leaf = (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
  addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'codex', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'mems-agent', 'org-a', h.userId('mem'));
  addAgentPerson(h.sqlite, 'loose', 'org-a', null);
});

afterEach(() => {
  h.close();
});

/** be-01's production composition over a fresh store, with an upstream JWT verifier. */
function openHarness(now?: () => number): OrganizationHarness {
  return OrganizationHarness.openComposedWith({
    ...(now === undefined ? {} : { now }),
    machineGrants,
    upstreamCredential: {
      verifier: new JwksTokenVerifier({
        audience: AUDIENCE,
        issuer: ISSUER,
        jwksUri: new URL(`http://127.0.0.1:${String(jwks.port)}/jwks`),
      }),
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
    },
  });
}

async function createProject(username: string, name: string): Promise<string> {
  const created = await h.call(username, 'POST', '/api/projects', { name });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  return (created.body as { project: { id: string } }).project.id;
}

/** Claire's key: issued by Dany for the agent person bound to Dany's account. */
function claireKey() {
  return issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'claire',
    issuedBy: h.userId('dany'),
  });
}

/**
 * One request bearing only `key` on `/api`, no cookie and no expected-organization
 * header, as a headless machine sent it before MCP. M9 (task 7.1) refuses it.
 */
function as(key: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return h.callWith(key, method, path, body);
}

/** One tool call of the agent holding `key`, as mcp-01 forwards it to be-01. */
function viaMcp(key: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return callForwarded(h, key, method, path, body);
}

/** How an agent's request reaches be-01. */
const TRANSPORTS = [['through mcp-01', viaMcp]] as const;

function usersTable(): unknown[] {
  return h.sqlite.query('SELECT * FROM users ORDER BY id').all();
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

function claimsOf(personId: string): number {
  return (
    h.sqlite
      .query<{ n: number }, [string]>('SELECT count(*) AS n FROM claim WHERE person_id = ?')
      .get(personId)?.n ?? -1
  );
}

const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };
const NOT_ACCEPTED = MACHINE_BEARER_NOT_ACCEPTED;

describe('an API key on the MCP path', () => {
  // Proof: with the direct context removed from `machinePrincipalOf`, this,
  // the batch write and the administration refusal below failed; watched
  // 2026-10-29.
  it("admits a live key to its organization's projects only", async () => {
    const { key } = await claireKey();
    h.unbind('dany');
    const listed = await viaMcp(key, 'GET', '/api/projects');
    expect(listed.status).toBe(200);
    const names = JSON.stringify(listed.body);
    expect(names).toContain('Plan of A');
    expect(names).not.toContain('Plan of B');
    expect((await viaMcp(key, 'GET', `/api/projects/${projectB}`)).status).toBe(404);
  });

  it('writes a command batch as the bound account and leaves the users table alone', async () => {
    const { key } = await claireKey();
    const before = usersTable();
    const written = await viaMcp(key, 'POST', `/api/projects/${projectA}/commands`, {
      commands: [{ kind: 'createWorkItem', parentId: null, name: 'By machine' }],
    });
    expect(written.status).toBe(200);
    const createdBy = h.sqlite
      .query<{ created_by: string }, [string]>('SELECT created_by FROM work_item WHERE name = ?')
      .get('By machine')?.created_by;
    expect(createdBy).toBe(h.userId('dany'));
    expect(usersTable()).toEqual(before);
  });

  it('is refused organization administration even for a super-admin’s account', async () => {
    const { key } = await claireKey();
    expect(await viaMcp(key, 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
  });

  it('is refused unknown_identity after revoke, changing no account', async () => {
    const { id, key } = await claireKey();
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
    revokeMachineCredential(h.sqlite, id, Date.now());
    const before = usersTable();
    expect(await viaMcp(key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(usersTable()).toEqual(before);
  });

  it('is refused unknown_identity with a wrong secret or an unknown credential id', async () => {
    const { id, key } = await claireKey();
    const flipped = `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`;
    expect(await viaMcp(flipped, 'GET', '/api/projects')).toEqual(UNKNOWN);
    const stranger = key.replace(id, crypto.randomUUID());
    expect(await viaMcp(stranger, 'GET', '/api/projects')).toEqual(UNKNOWN);
  });

  it('is refused unknown_identity for a live secret under another credential’s id', async () => {
    const { id } = await claireKey();
    const codex = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'codex',
      issuedBy: h.userId('dany'),
    });
    const crossed = codex.key.replace(codex.id, id);
    expect(await viaMcp(crossed, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect((await viaMcp(codex.key, 'GET', '/api/projects')).status).toBe(200);
  });

  it('is refused unknown_identity once its secret has expired', async () => {
    const { key, secretId } = await claireKey();
    h.sqlite.run('UPDATE machine_credential_secret SET expires_at = ? WHERE id = ?', [
      Date.now() - 1,
      secretId,
    ]);
    expect(await viaMcp(key, 'GET', '/api/projects')).toEqual(UNKNOWN);
  });

  // On `/api` the key answers not_a_member; the grant route refuses it as an
  // unknown key instead, so a stranger learns nothing of the membership.
  it('is refused unknown_identity once its account leaves the organization, credential intact', async () => {
    const { id, key } = await claireKey();
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('dany')]);
    expect(await viaMcp(key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    expect(
      h.sqlite.query('SELECT revoked_at FROM machine_credential WHERE id = ?').get(id),
    ).toEqual({ revoked_at: null });
  });

  // On `/api` the key answers 403 no_active_organization; the grant route
  // issues nothing before activation.
  it('is refused not_activated before activation', async () => {
    h.close();
    h = openHarness();
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const { key } = await claireKey();
    expect(await viaMcp(key, 'GET', '/api/projects')).toEqual({
      status: 409,
      body: { error: 'not_activated' },
    });
  });
});

/** The key itself as a Bearer on `/api` (`wbs-mcp-agent-surface` M9). */
describe('an API key as a Bearer on /api', () => {
  // With the credential table renamed away, any read of it is a server
  // error: the refusal must come first.
  // Proof: with the refusal moved after the key's admission in
  // `authenticateOrRefuse`, this failed (the use was recorded, then the
  // renamed table answered 500); watched 2026-10-29.
  it('is refused machine_bearer_not_accepted before any credential read, recording no use', async () => {
    const { id, key } = await claireKey();
    expect(await as(key, 'GET', '/api/projects')).toEqual(NOT_ACCEPTED);
    expect(lastUsedAt(id)).toBeNull();
    h.sqlite.run('ALTER TABLE machine_credential RENAME TO machine_credential_away');
    expect(await as(key, 'GET', '/api/projects')).toEqual(NOT_ACCEPTED);
    expect(
      await as(key, 'POST', `/api/projects/${projectA}/commands`, {
        commands: [{ kind: 'createWorkItem', parentId: null, name: 'By machine' }],
      }),
    ).toEqual(NOT_ACCEPTED);
    h.sqlite.run('ALTER TABLE machine_credential_away RENAME TO machine_credential');
    expect(lastUsedAt(id)).toBeNull();
    // The same key still verifies where mcp-01 presents it.
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
  });

  // One answer whatever the key's state, so `/api` is no oracle for it.
  it('answers a revoked, expired, crossed, unknown or malformed key the same', async () => {
    const { id, key, secretId } = await claireKey();
    const codex = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'codex',
      issuedBy: h.userId('dany'),
    });
    revokeMachineCredential(h.sqlite, codex.id, Date.now());
    h.sqlite.run('UPDATE machine_credential_secret SET expires_at = ? WHERE id = ?', [
      Date.now() - 1,
      secretId,
    ]);
    const secret = key.slice(key.indexOf('.') + 1);
    for (const presented of [
      codex.key,
      key,
      codex.key.replace(codex.id, id),
      key.replace(id, crypto.randomUUID()),
      `${key}x`,
      `wbs_mk_${id.toUpperCase()}.${secret}`,
      'wbs_mk_',
    ])
      expect(await as(presented, 'GET', '/api/projects')).toEqual(NOT_ACCEPTED);
  });

  it('is refused machine_bearer_not_accepted before activation too', async () => {
    h.close();
    h = openHarness();
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const { key } = await claireKey();
    expect(await as(key, 'GET', '/api/projects')).toEqual(NOT_ACCEPTED);
  });

  // A22: only `Authorization` carries a key; any other header is no credential.
  it('treats a live key in a custom header as no credential at all', async () => {
    const { key } = await claireKey();
    const response = await h.request('/api/projects', { headers: { 'x-wbs-api-key': key } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
  });

  // Proof: with this refusal removed from `userOrRefusalFromHeaders`, the
  // cookie case failed its expected 401 (the key reached the renamed table);
  // watched 2026-10-22.
  it('refuses a key carried by the session cookie unknown_identity, with no read', async () => {
    const { key } = await claireKey();
    h.sqlite.run('ALTER TABLE machine_credential RENAME TO machine_credential_away');
    const response = await h.request('/api/projects', {
      headers: { cookie: `__Host-wbs_access=${key}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unknown_identity' });
  });
});

/** The stored credential as the grant route reads it (M3: every grant request rereads it). */
describe('an API key’s stored state on the MCP path', () => {
  // A failed last-use write is a server fault (task 2.6), never a quiet 200:
  // at the grant route itself, which records the use before it issues.
  it('fails as a server error when its last use cannot be recorded', async () => {
    // `claireKey()` leaves `last_used_at` NULL, so this use is due and writes.
    const { key } = await claireKey();
    h.sqlite.run(`CREATE TRIGGER machine_credential_frozen BEFORE UPDATE ON machine_credential
      BEGIN SELECT RAISE(ABORT, 'machine_credential is frozen'); END`);
    expect((await requestGrant(h, { kind: 'api_key', key })).status).toBe(500);
  });

  // Corrupt trusted state is a server fault, never a refusal or an admission.
  it.each([
    ['secret digest', "UPDATE machine_credential_secret SET digest = 'not-a-digest'"],
    ['revocation time', "UPDATE machine_credential SET revoked_at = 'soon'"],
    ['source', "UPDATE machine_credential SET source = 'auth0'"],
  ])('fails as a server error on a malformed stored %s', async (_, corrupt) => {
    const { key } = await claireKey();
    h.sqlite.run('PRAGMA ignore_check_constraints = ON');
    h.sqlite.run(corrupt);
    h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(500);
  });

  it('records its last use at most once a minute', async () => {
    const { id, key } = await claireKey();
    expect(lastUsedAt(id)).toBeNull();
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
    const first = lastUsedAt(id);
    expect(first).not.toBeNull();
    const recent = Date.now() - 20_000;
    h.sqlite.run('UPDATE machine_credential SET last_used_at = ? WHERE id = ?', [recent, id]);
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
    expect(lastUsedAt(id)).toBe(recent);
    const old = Date.now() - 61_000;
    h.sqlite.run('UPDATE machine_credential SET last_used_at = ? WHERE id = ?', [old, id]);
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
    expect(lastUsedAt(id)).toBeGreaterThan(old + 60_000);
  });
});

/** What `answer` settles to within `ms`, or `'pending'`. */
function within(ms: number, answer: Promise<Answer>): Promise<Answer | 'pending'> {
  return Promise.race([
    answer,
    new Promise<'pending'>((resolve) => {
      setTimeout(() => {
        resolve('pending');
      }, ms);
    }),
  ]);
}

/**
 * Another write holding be-01's one write turn while `act` runs, released
 * however `act` settles (#668: a long batch, an import, an optimization save).
 */
async function whileTurnHeld<T>(act: () => Promise<T>): Promise<T> {
  const release = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const held = h.holdWriteTurn(release.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  try {
    return await act();
  } finally {
    release.resolve(undefined);
    await held;
  }
}

/** Last use recorded per tool call of the key's agent: its grant, then each forwarded call. */
describe('recording an API key’s last use on the MCP path', () => {
  // Answering at all while the turn is held is the proof.
  // Proof: with `touchLastUsed`'s read-first early return removed (every use
  // entering the write turn, as before #668), this timed out at the 5 s
  // per-test limit; watched 2026-10-23.
  it('answers while another write holds the turn when its last use is fresh', async () => {
    const { id, key } = await claireKey();
    expect((await viaMcp(key, 'GET', '/api/projects')).status).toBe(200);
    const first = lastUsedAt(id);
    const answer = await whileTurnHeld(() => viaMcp(key, 'GET', '/api/projects'));
    expect(answer.status).toBe(200);
    expect(lastUsedAt(id)).toBe(first);
  });

  // The due write still takes the turn: never fire-and-forget, never a write
  // outside the coordinator.
  // Proof: with `touchLastUsed`'s update run through an always-open gate
  // instead of the coordinator, this answered within 300 ms (expected
  // 'pending'); watched 2026-10-23.
  it('waits for the turn when its last use is due, then records it', async () => {
    const { id, key } = await claireKey();
    const old = Date.now() - 61_000;
    h.sqlite.run('UPDATE machine_credential SET last_used_at = ? WHERE id = ?', [old, id]);
    let answer: Promise<Answer> | undefined;
    await whileTurnHeld(async () => {
      answer = viaMcp(key, 'GET', '/api/projects');
      expect(await within(300, answer)).toBe('pending');
      expect(lastUsedAt(id)).toBe(old);
    });
    if (answer === undefined) throw new Error('the request was never sent');
    expect((await answer).status).toBe(200);
    expect(lastUsedAt(id)).toBeGreaterThan(old + 60_000);
  });

  // Proof: with the read-first predicate widened to `>=` (a use exactly a
  // minute old read as fresh), the third read stayed 5000000; watched
  // 2026-10-23.
  it('advances once the minute has passed, by the injected clock', async () => {
    let at = 5_000_000;
    h.close();
    h = openHarness(() => at);
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    h.bind('dany', 'org-a');
    h.activate();
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const { id, key } = await claireKey();
    // The grant's `exp` is asked from the harness clock, as mcp-01 asks from its own.
    const call = () => callForwarded(h, key, 'GET', '/api/projects', undefined, { now: at });
    expect((await call()).status).toBe(200);
    expect(lastUsedAt(id)).toBe(5_000_000);
    at = 5_059_999;
    expect((await call()).status).toBe(200);
    expect(lastUsedAt(id)).toBe(5_000_000);
    at = 5_060_000;
    expect((await call()).status).toBe(200);
    expect(lastUsedAt(id)).toBe(5_060_000);
  });
});

describe.each(TRANSPORTS)('a key pinned to one person, %s', (_, send) => {
  const claim = (personId: string, extra: Record<string, unknown> = {}) => ({
    kind: 'claimWorkItem',
    workItemId: leaf,
    personId,
    ...extra,
  });
  const refused = (error: string) => ({
    status: 403,
    body: { error, at: 0, kind: 'claimWorkItem' },
  });

  // Proof: with `credentialPinOf` answering null for a machine credential, the
  // claim as `codex` answered 200; watched 2026-10-22.
  it('claims as its person and is refused as any other of its account’s persons', async () => {
    const { key } = await claireKey();
    const batch = (commands: unknown[]) =>
      send(key, 'POST', `/api/projects/${projectA}/commands`, { commands });
    expect(await batch([claim('codex')])).toEqual(refused('credential_not_for_person'));
    expect(claimsOf('codex')).toBe(0);
    expect((await batch([claim('claire')])).status).toBe(200);
    expect(claimsOf('claire')).toBeGreaterThan(0);
  });

  it('delegates under its own person’s subtree claim, and only there', async () => {
    const { key } = await claireKey();
    const batch = (commands: unknown[]) =>
      send(key, 'POST', `/api/projects/${projectA}/commands`, { commands });
    const created = await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [{ kind: 'createWorkItem', parentId: leaf, afterId: null, name: 'Under' }],
    });
    if (created.status !== 200) throw new Error(`child refused: ${JSON.stringify(created)}`);
    const under = (created.body as { results: { id: string }[] }).results[0]?.id ?? '';
    expect((await batch([claim('claire')])).status).toBe(200);
    const parentClaim = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM claim WHERE work_item_id = ?')
      .get(leaf)?.id;
    expect(parentClaim).toBeDefined();
    const delegated = { kind: 'claimWorkItem', workItemId: under, personId: 'codex' };
    expect(await batch([delegated])).toEqual(refused('credential_not_for_person'));
    expect(claimsOf('codex')).toBe(0);
    expect((await batch([{ ...delegated, parentClaim }])).status).toBe(200);
    expect(claimsOf('codex')).toBeGreaterThan(0);
  });

  // A23: the key of a super-admin's agent is a member in the organization.
  // Proof: with `organizationRoleOf` answering the stored role, this and the
  // two claim cases below failed; watched 2026-10-22.
  it('refuses patchPerson to an admin-bound key', async () => {
    const { key } = await claireKey();
    expect(
      await send(key, 'POST', '/api/directory/commands', {
        commands: [
          { kind: 'patchPerson', personId: 'codex', patch: { accountId: h.userId('mem') } },
        ],
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden', at: 0, kind: 'patchPerson' } });
    expect(h.sqlite.query("SELECT account_id FROM person WHERE id = 'codex'").get()).toEqual({
      account_id: h.userId('dany'),
    });
  });

  it('refuses an admin-bound key a person bound to another account', async () => {
    const { key } = await claireKey();
    const batch = (commands: unknown[]) =>
      send(key, 'POST', `/api/projects/${projectA}/commands`, { commands });
    expect(await batch([claim('mems-agent')])).toEqual(refused('person_not_bound'));
    expect(claimsOf('mems-agent')).toBe(0);
  });

  it('gives a super-admin-bound key no claim-admin bypass', async () => {
    const { key } = await claireKey();
    const batch = (commands: unknown[]) =>
      send(key, 'POST', `/api/projects/${projectA}/commands`, { commands });
    expect(await batch([claim('loose')])).toEqual(refused('person_not_bound'));
    expect(claimsOf('loose')).toBe(0);
  });
});

describe('the account a key is bound to', () => {
  const claim = (personId: string) => ({ kind: 'claimWorkItem', workItemId: leaf, personId });

  it('leaves the bound account’s own session unpinned', async () => {
    await claireKey();
    expect(
      (
        await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
          commands: [claim('codex')],
        })
      ).status,
    ).toBe(200);
  });
});
