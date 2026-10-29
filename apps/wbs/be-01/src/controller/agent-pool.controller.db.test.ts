import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { digestMachineSecret } from '@wbs/core';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import {
  TEST_MACHINE_GRANT_ENV,
  TEST_MCP_AUTHORIZATION_SERVER,
} from '../testing/machine-grant-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';

const PATH = '/api/organization/agent-pools';
const T = 1_900_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN = { status: 401, body: { error: 'unknown_identity' } };
const SECRET = TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'];
const AUTHORIZATION_SERVER = TEST_MCP_AUTHORIZATION_SERVER;

let now = T;
/** Every line the services logger wrote, at `trace`, this test. */
let logged: string[];
/** Runs after each organization resolve, when a test arms it. */
let onResolve: (() => void) | undefined;
let h: OrganizationHarness;
let projectId: string;
let machineGrants: HarnessMachineGrants;

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});

/**
 * Agent pools over be-01's production composition and real SQLite
 * (`wbs-mcp-agent-surface` task 6.2, design M7; the agent-pools spec), with
 * the services clock held at `now`: an admin's browser session makes N agent
 * persons with one key each in one act, re-keys them, and revokes them as a
 * unit, removing the persons on request. Each pool key reaches be-01 as its
 * agent's does, through mcp-01's forwarded grant ({@link asAgent}).
 */
beforeEach(async () => {
  now = T;
  logged = [];
  onResolve = undefined;
  h = OrganizationHarness.openComposedWith({
    now: () => now,
    afterResolve: () => onResolve?.(),
    logDestination: {
      write: (chunk) => {
        logged.push(chunk);
      },
    },
    machineGrants,
  });
  for (const username of ['dany', 'ada', 'mem', 'vic', 'bob']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'dany', 'super_admin');
  h.member('org-a', 'ada', 'admin');
  h.member('org-a', 'mem', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'bob', 'admin');
  for (const username of ['dany', 'ada', 'mem', 'vic']) h.bind(username, 'org-a');
  h.bind('bob', 'org-b');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
});

afterEach(async () => {
  await h.closeComposed();
});

interface KeysDocument {
  readonly format: string;
  readonly version: number;
  readonly organizationId: string;
  readonly authorizationServer: string;
  readonly mcpResource: string;
  readonly poolId: string;
  readonly name: string;
  readonly expiresAt: number | null;
  readonly issuedAt: number;
  readonly agents: readonly {
    readonly personId: string;
    readonly personName: string;
    readonly credentialId: string;
    readonly key: string;
  }[];
}

/** Creates a pool as `username`; throws unless it was created. */
async function createPool(
  username: string,
  body: Record<string, unknown> = { name: 'swarm-a', size: 8 },
): Promise<KeysDocument> {
  const answer = await h.call(username, 'POST', PATH, body);
  if (answer.status !== 201) throw new Error(`pool refused: ${JSON.stringify(answer)}`);
  return answer.body as KeysDocument;
}

function count(sql: string, ...params: string[]): number {
  const row = h.sqlite.query<{ n: number }, string[]>(sql).get(...params);
  if (row === null) throw new Error('count answered no row');
  return row.n;
}

const agentPersons = () =>
  count(
    "SELECT COUNT(*) AS n FROM person p JOIN person_organization o ON o.resource_id = p.id WHERE o.organization_id = 'org-a' AND p.kind = 'agent'",
  );
const credentials = () => count('SELECT COUNT(*) AS n FROM machine_credential');
const pools = () => count('SELECT COUNT(*) AS n FROM agent_pool');
const auditCount = () => count('SELECT COUNT(*) AS n FROM organization_audit');

/**
 * The audit's rows, oldest first. Each agent call's grant writes its own
 * `machine_token_issued` row; {@link poolAuditActions} leaves those out.
 */
function auditRows(): { action: string; subject_kind: string; detail: string }[] {
  return h.sqlite
    .query<{ action: string; subject_kind: string; detail: string }, []>(
      'SELECT action, subject_kind, detail FROM organization_audit ORDER BY rowid',
    )
    .all();
}

/** The audit's actions, oldest first, without the agents' grant issuance. */
const poolAuditActions = (): string[] =>
  auditRows()
    .map((row) => row.action)
    .filter((action) => action !== 'machine_token_issued');

function capAgents(maxAgentPersons: number): void {
  h.sqlite.run(
    `INSERT INTO organization_limits
       (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at)
     VALUES ('org-a', ?, 200, 10000, 1)
     ON CONFLICT (organization_id) DO UPDATE SET max_agent_persons = excluded.max_agent_persons`,
    [maxAgentPersons],
  );
}

/** The secret part of a key: what only its holder has. */
const secretOf = (key: string): string => key.slice(key.indexOf('.') + 1);

/** One call of the agent holding `key`, as mcp-01 forwards it, at the harness clock. */
function asAgent(key: string, method: string, path: string, body?: unknown): Promise<Answer> {
  return callForwarded(h, key, method, path, body, { now });
}

/** One grant request as mcp-01 sends it, at the harness clock. */
async function requestGrant(key: string): Promise<Answer> {
  const response = await h.request('/internal/mcp/machine-grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [MCP_INTERNAL_SECRET_HEADER]: SECRET },
    body: JSON.stringify({
      issuer: AUTHORIZATION_SERVER,
      credential: { kind: 'api_key', key },
      expiresAt: Math.floor(now / 1000) + 3600,
    }),
  });
  const text = await response.text();
  return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text };
}

async function leafOf(name: string): Promise<string> {
  const rows = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  return (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
}

async function claimAs(agent: KeysDocument['agents'][number], leaf: string): Promise<void> {
  const claimed = await asAgent(agent.key, 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'claimWorkItem', workItemId: leaf, personId: agent.personId }],
  });
  if (claimed.status !== 200) throw new Error(`claim refused: ${JSON.stringify(claimed)}`);
}

const claims = () => count('SELECT COUNT(*) AS n FROM claim');

describe('creating a pool', () => {
  // Proof: with the create route logging the minted keys, this failed on
  // `not.toContain` over what the console received; watched 2026-10-28.
  it('makes eight agent persons with eight keys, each acting as itself, listed with no secret', async () => {
    const consoled: unknown[][] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoled.push(args);
      }),
    );
    let doc: KeysDocument;
    try {
      doc = await createPool('dany');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(doc).toMatchObject({
      format: 'wbs-agent-pool-keys',
      version: 1,
      organizationId: 'org-a',
      authorizationServer: AUTHORIZATION_SERVER,
      mcpResource: 'https://wbs.example/mcp',
      name: 'swarm-a',
      expiresAt: null,
      issuedAt: T,
    });
    expect(doc.agents.map((agent) => agent.personName)).toEqual(
      Array.from({ length: 8 }, (_, index) => `swarm-a-${String(index + 1)}`),
    );
    expect(new Set(doc.agents.map((agent) => agent.personId)).size).toBe(8);
    for (const agent of doc.agents)
      expect(agent.key.startsWith(`wbs_mk_${agent.credentialId}.`)).toBe(true);
    expect(agentPersons()).toBe(8);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM person WHERE kind = 'agent' AND account_id = ?",
        h.userId('dany'),
      ),
    ).toBe(8);
    // Each key acts as its own person, capped at member.
    const first = doc.agents.at(0);
    const second = doc.agents.at(1);
    if (first === undefined || second === undefined) throw new Error('the pool has no agents');
    expect(await asAgent(first.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });
    expect(await asAgent(first.key, 'GET', '/api/organization/members')).toEqual({
      status: 403,
      body: { error: 'insufficient_scope' },
    });
    const leaf = await leafOf('Leaf');
    expect(
      await asAgent(first.key, 'POST', `/api/projects/${projectId}/commands`, {
        commands: [{ kind: 'claimWorkItem', workItemId: leaf, personId: second.personId }],
      }),
    ).toMatchObject({ status: 403, body: { error: 'credential_not_for_person' } });
    await claimAs(first, leaf);

    const listed = await h.call('dany', 'GET', PATH);
    expect(listed.status).toBe(200);
    const pool = (listed.body as { pools: { id: string; credentials: unknown[] }[] }).pools.at(0);
    expect(pool?.id).toBe(doc.poolId);
    expect(pool?.credentials).toHaveLength(8);

    const audit = auditRows();
    expect(poolAuditActions()).toEqual([
      ...Array.from({ length: 8 }, () => 'machine_credential_created'),
      'agent_pool_created',
    ]);
    const serialized = [
      JSON.stringify(listed.body),
      JSON.stringify(audit),
      JSON.stringify(consoled),
      logged.join('\n'),
    ];
    for (const agent of doc.agents) {
      const digest = await digestMachineSecret(secretOf(agent.key));
      for (const text of serialized) {
        expect(text).not.toContain(secretOf(agent.key));
        expect(text).not.toContain(digest);
      }
    }
    for (const text of serialized) expect(text).not.toContain('wbs_mk_');
  });

  it('refuses a size of 0 or 101, an oidc source, a past expiry or one past 90 days, writing nothing', async () => {
    for (const body of [
      { name: 'swarm-a', size: 0 },
      { name: 'swarm-a', size: 101 },
      { name: 'swarm-a', size: 2.5 },
      { name: 'swarm-a', size: 2, source: 'oidc' },
      { name: 'swarm-a', size: 2, expiresAt: T },
      { name: 'swarm-a', size: 2, expiresAt: T + 90 * DAY + 1 },
      { name: '', size: 2 },
      { name: 'n'.repeat(61), size: 2 },
      { name: 'a'.repeat(64), size: 2 },
      { name: 'samlp|acme|sub', size: 2 },
      { name: 'wbs_mk_looks-like-a-key', size: 2 },
    ])
      expect(await h.call('dany', 'POST', PATH, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect([pools(), agentPersons(), credentials(), auditCount()]).toEqual([0, 0, 0, 0]);
    expect(
      (await h.call('dany', 'POST', PATH, { name: 'swarm-a', size: 1, expiresAt: T + 90 * DAY }))
        .status,
    ).toBe(201);
  });

  it('refuses a live name, an agent name a person holds, writing nothing; a revoked pool frees its name', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 2 });
    const before = [pools(), agentPersons(), credentials(), auditCount()];
    expect(await h.call('ada', 'POST', PATH, { name: 'swarm-a', size: 3 })).toEqual({
      status: 409,
      body: { error: 'name_taken' },
    });
    addAgentPerson(h.sqlite, 'held', 'org-a', null, 'swarm-b-2');
    expect(await h.call('dany', 'POST', PATH, { name: 'swarm-b', size: 2 })).toEqual({
      status: 409,
      body: { error: 'name_taken' },
    });
    expect([pools(), agentPersons() - 1, credentials(), auditCount()]).toEqual(before);
    expect(
      (await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}?removePersons=true`)).status,
    ).toBe(200);
    expect((await h.call('dany', 'POST', PATH, { name: 'swarm-a', size: 2 })).status).toBe(201);
  });
});

describe('a refused creation', () => {
  // Proof: with `poolAdministratorRefusal` admitting every member role, the
  // member's create answered 201 with the keys; watched 2026-10-28.
  it('refuses a member and a viewer forbidden, writing nothing', async () => {
    for (const username of ['mem', 'vic'])
      expect(await h.call(username, 'POST', PATH, { name: 'swarm-a', size: 2 })).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    expect(await h.call('mem', 'GET', PATH)).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect([pools(), agentPersons(), credentials(), auditCount()]).toEqual([0, 0, 0, 0]);
  });

  it('refuses a machine principal insufficient_scope on every pool route', async () => {
    addAgentPerson(h.sqlite, 'claire', 'org-a', h.userId('dany'));
    const machine = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'claire',
      issuedBy: h.userId('dany'),
    });
    const refused = { status: 403, body: { error: 'insufficient_scope' } };
    expect(await asAgent(machine.key, 'POST', PATH, { name: 'swarm-a', size: 2 })).toEqual(refused);
    // Removed by 7.1 (M9): the key itself as a Bearer on `/api`.
    expect(await h.callWith(machine.key, 'POST', PATH, { name: 'swarm-a', size: 2 })).toEqual(
      refused,
    );
    const doc = await createPool('dany', { name: 'swarm-b', size: 1 });
    const agent = doc.agents.at(0);
    if (agent === undefined) throw new Error('the pool has no agent');
    for (const [method, path] of [
      ['POST', `${PATH}/${doc.poolId}/rekey`],
      ['DELETE', `${PATH}/${doc.poolId}`],
      ['GET', PATH],
    ] as const) {
      const body = method === 'POST' ? {} : undefined;
      expect(await asAgent(agent.key, method, path, body)).toEqual(refused);
      // Removed by 7.1 (M9): the key itself as a Bearer on `/api`.
      expect(await h.callWith(agent.key, method, path, body)).toEqual(refused);
    }
    expect(pools()).toBe(1);
  });

  // Proof: with the cap refusal in `AgentPoolRepository.create` disabled,
  // this answered 201 with the keys instead of 409; watched 2026-10-28.
  it('refuses a pool crossing the agent-person cap, naming the cap and count, writing nothing', async () => {
    capAgents(8);
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) addAgentPerson(h.sqlite, id, 'org-a', null);
    const before = auditCount();
    expect(await h.call('dany', 'POST', PATH, { name: 'swarm-a', size: 4 })).toEqual({
      status: 409,
      body: { error: 'agent_person_limit', cap: 8, current: 5, added: 4 },
    });
    expect([pools(), agentPersons(), credentials(), auditCount()]).toEqual([0, 5, 0, before]);
    expect((await h.call('dany', 'POST', PATH, { name: 'swarm-a', size: 3 })).status).toBe(201);
    expect(agentPersons()).toBe(8);
  });

  it('writes nothing of the pool when its audit row cannot be written', async () => {
    h.sqlite.run(
      `CREATE TRIGGER refuse_pool_audit BEFORE INSERT ON organization_audit
       WHEN NEW.action = 'agent_pool_created'
       BEGIN SELECT RAISE(ABORT, 'pool audit refused'); END`,
    );
    expect((await h.call('dany', 'POST', PATH, { name: 'swarm-a', size: 3 })).status).toBe(500);
    // The capture is live: the failure reached the pino destination, without a key.
    const lines = logged.join('\n');
    expect(lines).toContain('unexpected endpoint failure');
    expect(lines).not.toContain('wbs_mk_');
    expect([pools(), agentPersons(), credentials(), auditCount()]).toEqual([0, 0, 0, 0]);
  });
});

describe('re-keying a pool', () => {
  // Proof: with `rekey` minting a fresh person for each key (as `create`
  // does), this saw eight new person ids in place of the pool's; watched
  // 2026-10-28.
  it('re-keys the same persons at the cap, creating none; the old keys are refused', async () => {
    capAgents(8);
    const doc = await createPool('dany');
    expect(agentPersons()).toBe(8);
    now = T + 60_000;
    const answer = await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {});
    expect(answer.status).toBe(201);
    const fresh = answer.body as KeysDocument;
    expect(fresh).toMatchObject({ poolId: doc.poolId, name: 'swarm-a', issuedAt: T + 60_000 });
    expect(fresh.agents.map((agent) => [agent.personId, agent.personName])).toEqual(
      doc.agents.map((agent) => [agent.personId, agent.personName]),
    );
    expect(
      fresh.agents.every(
        (agent, index) => agent.credentialId !== doc.agents.at(index)?.credentialId,
      ),
    ).toBe(true);
    expect(agentPersons()).toBe(8);
    for (const agent of doc.agents)
      expect(await asAgent(agent.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
    for (const agent of fresh.agents)
      expect(await asAgent(agent.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });
    const actions = auditRows().map((row) => row.action);
    expect(actions.filter((action) => action === 'machine_credential_revoked')).toHaveLength(8);
    expect(actions.filter((action) => action === 'machine_credential_created')).toHaveLength(16);
    expect(poolAuditActions().at(-1)).toBe('agent_pool_rekeyed');
    const listed = (await h.call('dany', 'GET', PATH)).body as {
      pools: { credentials: { id: string }[] }[];
    };
    expect(
      listed.pools
        .at(0)
        ?.credentials.map((each) => each.id)
        .sort(),
    ).toEqual(fresh.agents.map((agent) => agent.credentialId).sort());
  });

  it('keeps the leases of a re-keyed agent', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 1 });
    const agent = doc.agents.at(0);
    if (agent === undefined) throw new Error('the pool has no agent');
    await claimAs(agent, await leafOf('Leaf'));
    expect((await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {})).status).toBe(201);
    const sweep = h.claimLeaseSweep();
    sweep.start();
    await sweep.settled();
    expect(claims()).toBeGreaterThan(0);
  });

  it('answers not_found for a revoked pool, another organization’s, and to an admin of B', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 1 });
    expect(await h.call('bob', 'POST', `${PATH}/${doc.poolId}/rekey`, {})).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect((await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}`)).status).toBe(200);
    expect(await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {})).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await h.call('mem', 'POST', `${PATH}/${doc.poolId}/rekey`, {})).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
  });
});

describe('revoking a pool', () => {
  // Proof: with the first live credential left out of `revoke`, that agent's
  // claim survived the sweep here; watched 2026-10-28.
  it('revokes every key of the pool, ending their leases; claims go as credential revoked', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 3 });
    for (const [index, agent] of doc.agents.entries())
      await claimAs(agent, await leafOf(`Leaf ${String(index)}`));
    const sweep = h.claimLeaseSweep();
    sweep.start();
    await sweep.settled();
    const held = claims();
    expect(held).toBeGreaterThan(0);
    now = T + 60_000;
    expect(await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}`)).toEqual({
      status: 200,
      body: { poolId: doc.poolId, revokedCredentials: 3, removedPersons: 0 },
    });
    await sweep.settled();
    expect(claims()).toBe(0);
    const history = await h.call('dany', 'GET', `/api/projects/${projectId}/history`);
    expect(JSON.stringify(history.body)).toContain('(credential revoked)');
    for (const agent of doc.agents) {
      expect(await asAgent(agent.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
      expect(await requestGrant(agent.key)).toMatchObject({ status: 401 });
    }
    const actions = auditRows().map((row) => row.action);
    expect(actions.filter((action) => action === 'machine_credential_revoked')).toHaveLength(3);
    expect(actions.at(-1)).toBe('agent_pool_revoked');
    // The persons stay, and still count toward the cap.
    expect(agentPersons()).toBe(3);
    expect(await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  // Proof: with the route's directory batch skipped, this answered
  // `removedPersons: 0` and kept the eight persons; watched 2026-10-28.
  it('removes the pool’s persons with removePersons and releases the cap', async () => {
    capAgents(8);
    const doc = await createPool('dany');
    expect(agentPersons()).toBe(8);
    expect(await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}?removePersons=true`)).toEqual({
      status: 200,
      body: { poolId: doc.poolId, revokedCredentials: 8, removedPersons: 8 },
    });
    expect(agentPersons()).toBe(0);
    expect(credentials()).toBe(0);
    // The audit keeps every key's revocation; the cap is free again.
    expect(auditRows().filter((row) => row.action === 'machine_credential_revoked')).toHaveLength(
      8,
    );
    expect((await h.call('dany', 'POST', PATH, { name: 'swarm-b', size: 8 })).status).toBe(201);
  });

  // The design said the claims history keeps a removed person's name: it keeps
  // the person id only; the name reads null once the person is gone (slice 8
  // note 17, a gap reported, not fixed here).
  it('keeps the removed persons in the claims history by id, their name no longer read', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 1 });
    const agent = doc.agents.at(0);
    if (agent === undefined) throw new Error('the pool has no agent');
    await claimAs(agent, await leafOf('Leaf'));
    expect(
      (await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}?removePersons=true`)).body,
    ).toMatchObject({ removedPersons: 1 });
    expect(agentPersons()).toBe(0);
    const history = await h.call('dany', 'GET', `/api/projects/${projectId}/claim-history`);
    expect(history.status).toBe(200);
    const serialized = JSON.stringify(history.body);
    expect(serialized).toContain(`"personId":"${agent.personId}","name":null`);
  });

  // Proof: with the route's 409 body narrowed back to its error alone, the
  // answer failed its own response schema and this saw 500; watched 2026-10-28.
  it('answers persons_not_removed with the pool and its revoked keys when the removal is refused', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 2 });
    const agent = doc.agents.at(0);
    if (agent === undefined) throw new Error('the pool has no agent');
    // Between the committed revocation and the removal batch, the first
    // person goes by another hand, so the batch refuses `not_found`.
    onResolve = () => {
      const revoked = h.sqlite
        .query<{ n: number }, []>(
          'SELECT COUNT(*) AS n FROM agent_pool WHERE revoked_at IS NOT NULL',
        )
        .get();
      if (revoked?.n !== 1) return;
      onResolve = undefined;
      h.sqlite.run(
        'DELETE FROM machine_credential_secret WHERE credential_id IN (SELECT id FROM machine_credential WHERE person_id = ?)',
        [agent.personId],
      );
      h.sqlite.run('DELETE FROM machine_credential WHERE person_id = ?', [agent.personId]);
      h.sqlite.run('DELETE FROM person WHERE id = ?', [agent.personId]);
    };
    expect(await h.call('dany', 'DELETE', `${PATH}/${doc.poolId}?removePersons=true`)).toEqual({
      status: 409,
      body: { error: 'persons_not_removed', poolId: doc.poolId, revokedCredentials: 2 },
    });
    expect(agentPersons()).toBe(1);
  });

  it('refuses a member forbidden and changes nothing', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 2 });
    expect(await h.call('mem', 'DELETE', `${PATH}/${doc.poolId}?removePersons=true`)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    for (const agent of doc.agents)
      expect(await asAgent(agent.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });
    expect(agentPersons()).toBe(2);
  });
});

describe('an expired pool', () => {
  it('refuses its keys at admission and lets its leases lapse as lease expired', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 2, expiresAt: T + 60 * 60_000 });
    const agent = doc.agents.at(0);
    if (agent === undefined) throw new Error('the pool has no agent');
    expect(await requestGrant(agent.key)).toMatchObject({ status: 200 });
    await claimAs(agent, await leafOf('Leaf'));
    now = T + 60 * 60_000;
    for (const each of doc.agents) {
      expect(await asAgent(each.key, 'GET', '/api/projects')).toEqual(UNKNOWN);
      expect(await requestGrant(each.key)).toEqual(UNKNOWN);
    }
    // The heartbeat is refused with the key, so the lease runs out on its own.
    expect(await asAgent(agent.key, 'POST', '/api/claims/renew')).toEqual(UNKNOWN);
    now = T + 60 * 60_000 + CLAIM_LEASE_MS;
    const sweep = h.claimLeaseSweep();
    sweep.start();
    await sweep.settled();
    expect(claims()).toBe(0);
    const history = await h.call('dany', 'GET', `/api/projects/${projectId}/history`);
    expect(JSON.stringify(history.body)).toContain('(lease expired)');
  });
});

describe('the keys document', () => {
  // Proof: with `defaultResponseHeaders: noStore` dropped from `createAgentPool`,
  // this saw no cache-control on the create; watched 2026-10-28.
  it('is answered no-store on create and re-key', async () => {
    const created = await h.respond('dany', 'POST', PATH, { name: 'swarm-a', size: 1 });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const { poolId } = (await created.json()) as KeysDocument;
    const rekeyed = await h.respond('dany', 'POST', `${PATH}/${poolId}/rekey`, {});
    expect(rekeyed.status).toBe(201);
    expect(rekeyed.headers.get('cache-control')).toBe('no-store');
  });
});

describe('re-keying, the review fixes', () => {
  it('refuses re-keying an expired pool unless a new expiry is given', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 2, expiresAt: T + 60 * 60_000 });
    now = T + 60 * 60_000;
    const before = auditCount();
    expect(await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {})).toEqual({
      status: 409,
      body: { error: 'pool_expired' },
    });
    expect(auditCount()).toBe(before);
    const renewed = await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {
      expiresAt: now + 30 * DAY,
    });
    expect(renewed.status).toBe(201);
    const fresh = renewed.body as KeysDocument;
    expect(fresh.expiresAt).toBe(now + 30 * DAY);
    for (const agent of fresh.agents)
      expect(await asAgent(agent.key, 'GET', '/api/projects')).toMatchObject({ status: 200 });
  });

  it('re-keys an expired pool with a new expiry within 90 days, and refuses one past them', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 1, expiresAt: T + 60_000 });
    now = T + 60_000;
    for (const expiresAt of [now, now + 90 * DAY + 1])
      expect(await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, { expiresAt })).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(
      (await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, { expiresAt: now + 90 * DAY }))
        .status,
    ).toBe(201);
  });

  it('re-keys only the agents holding a live pool key', async () => {
    const doc = await createPool('dany', { name: 'swarm-a', size: 3 });
    const second = doc.agents.at(1);
    if (second === undefined) throw new Error('the pool has no second agent');
    expect(
      await h.call(
        'dany',
        'DELETE',
        `/api/organization/machine-credentials/${second.credentialId}`,
      ),
    ).toMatchObject({ status: 204 });
    const answer = await h.call('dany', 'POST', `${PATH}/${doc.poolId}/rekey`, {});
    expect(answer.status).toBe(201);
    const fresh = answer.body as KeysDocument;
    expect(fresh.agents.map((agent) => agent.personName)).toEqual(['swarm-a-1', 'swarm-a-3']);
    expect(
      count(
        'SELECT COUNT(*) AS n FROM machine_credential WHERE person_id = ? AND revoked_at IS NULL',
        second.personId,
      ),
    ).toBe(0);
  });
});
