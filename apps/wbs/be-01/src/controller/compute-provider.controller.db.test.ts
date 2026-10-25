import { readProjectResources, validateSchema } from '@wbs/contracts';
import { computeProvidersOver } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair } from 'jose';

import { openDrizzle } from '../repository/db';
import { WriteCoordinator } from '../repository/gate';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

/**
 * Compute providers slice 1 (`compute-providers` tasks 1.1 to 1.5) over be-01's
 * production composition and real SQLite: provider instance administration,
 * the resource's provider reference through `patchResource`, the capacity
 * report a machine credential of an agent person puts, the resources read
 * beside it, and that nothing of it reaches a schedule or a claim.
 */
const PATH = '/api/organization/compute-providers';

let h: OrganizationHarness;
let projectA: string;
let leaf: string;
let ram: string;
let staging: string;
let ramOfB: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await setUp();
});

afterEach(() => {
  h.close();
});

async function setUp(): Promise<void> {
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
  addAgentPerson(h.sqlite, 'dash-a', 'org-a', h.userId('dany'));
  addAgentPerson(h.sqlite, 'dash-b', 'org-b', h.userId('bob'));
  // A human's own person, which a machine credential can still be pinned to.
  h.sqlite.run(
    "INSERT INTO person (id, name, kind, account_id) VALUES ('dany-p', 'Dany', 'person', ?)",
    [h.userId('dany')],
  );
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('dany-p', 'org-a', 'dany-p')",
  );
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectA = (created.body as { project: { id: string } }).project.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  if (rows.status !== 200) throw new Error(`leaf refused: ${JSON.stringify(rows)}`);
  leaf = (rows.body as { results: { id: string }[] }).results[0]?.id ?? '';
  ram = await declare('dany', 'h4claw ram');
  staging = await declare('dany', 'staging');
  ramOfB = await declare('bob', 'h4claw ram');
}

/** Declares one divisible resource through the caller's directory, answering its id. */
async function declare(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/directory/commands', {
    commands: [{ kind: 'createResource', name, resourceKind: 'divisible', unitLabel: 'GB' }],
  });
  if (answer.status !== 200) throw new Error(`declare refused: ${JSON.stringify(answer)}`);
  const id = (answer.body as { results: { id?: string }[] }).results.at(0)?.id;
  if (id === undefined) throw new Error('the create minted no id');
  return id;
}

async function register(username: string, name: string, kind = 'ssh_host'): Promise<Answer> {
  return h.call(username, 'POST', PATH, { kind, name, locator: `puni1@${name}` });
}

async function registered(username: string, name: string): Promise<string> {
  const answer = await register(username, name);
  if (answer.status !== 201) throw new Error(`register refused: ${JSON.stringify(answer)}`);
  return (answer.body as { id: string }).id;
}

function reference(username: string, resourceId: string, patch: Record<string, unknown>) {
  return h.call(username, 'POST', '/api/directory/commands', {
    commands: [{ kind: 'patchResource', resourceId, patch }],
  });
}

function report(key: string, providerId: string, resourceId: string, body: unknown) {
  return h.callWith(
    key,
    'PUT',
    `/api/compute-providers/${providerId}/resources/${resourceId}/capacity-report`,
    body,
  );
}

const measured = (observedAt: number, capacityUnits = 15, usageUnits = 8) => ({
  observedAt,
  cadenceSeconds: 300,
  outcome: { kind: 'measured', capacityUnits, usageUnits },
});

function rows<T>(sql: string): T[] {
  return h.sqlite.query<T, []>(sql).all();
}

function auditRows(): { action: string; subject_id: string; detail: string }[] {
  return rows(
    "SELECT action, subject_id, detail FROM organization_audit WHERE subject_kind = 'compute_provider' ORDER BY created_at, rowid",
  );
}

function reportCount(): number {
  return rows<{ n: number }>('SELECT count(*) AS n FROM resource_capacity_report')[0]?.n ?? -1;
}

function providerOf(resourceId: string): string | null {
  const row = h.sqlite
    .query<{ provider_id: string | null }, [string]>(
      'SELECT provider_id FROM resource WHERE id = ?',
    )
    .get(resourceId);
  if (row === null) throw new Error(`no resource ${resourceId}`);
  return row.provider_id;
}

/** What the SQLite capacity reports store, read directly over the harness's file, threw. */
async function storeRefusal(resourceIds: string[]): Promise<string> {
  // A second connection to the harness's file, as the composed app's own is not exposed.
  const db = openDrizzle(h.sqlite.filename);
  try {
    await computeProvidersOver(db, new WriteCoordinator()).reports.readingsOf(resourceIds);
    return 'resolved';
  } catch (error) {
    return String(error);
  }
}

/** The project resources read, through its own contract. */
async function readResources(username: string) {
  const answer = await h.call(username, 'GET', `/api/projects/${projectA}/resources`);
  expect(answer.status).toBe(200);
  const [success] = readProjectResources.responses;
  const parsed = await validateSchema(success.schema, answer.body);
  if (parsed.issues !== undefined)
    throw new Error(`the resources read failed its contract: ${JSON.stringify(parsed.issues)}`);
  return answer.body as {
    resources: {
      id: string;
      name: string;
      kind: string;
      unitLabel: string;
      providerId: string | null;
      provider?: { kind: string; name: string };
      report?: Record<string, unknown>;
      measurement?: { state: string } & Record<string, unknown>;
    }[];
  };
}

/** An agent's API key in org-a, and one pinned to Dany's own person. */
async function keys() {
  const agent = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'dash-a',
    issuedBy: h.userId('dany'),
  });
  const human = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'dany-p',
    issuedBy: h.userId('dany'),
  });
  const stranger = await issueApiKey(h.sqlite, {
    organizationId: 'org-b',
    personId: 'dash-b',
    issuedBy: h.userId('bob'),
  });
  return { agent: agent.key, human: human.key, stranger: stranger.key };
}

describe('provider instance administration', () => {
  // Proof: with the name check removed from `register`, the third post
  // answered 500 on the unique index; watched 2026-10-22.
  it("registers PUNI's two gate hosts and refuses a third h4claw", async () => {
    const h4claw = await register('dany', 'h4claw');
    expect(h4claw.status).toBe(201);
    expect((await register('dany', 'h2puni')).status).toBe(201);
    expect(await register('dany', 'h4claw', 'docker')).toEqual({
      status: 409,
      body: { error: 'name_taken' },
    });
    // Another organization holds its own h4claw.
    expect((await register('bob', 'h4claw')).status).toBe(201);
    const listed = await h.call('dany', 'GET', PATH);
    expect(listed.status).toBe(200);
    expect(
      (
        listed.body as { computeProviders: { name: string; kind: string; resources: number }[] }
      ).computeProviders.map(({ name, kind, resources }) => ({ name, kind, resources })),
    ).toEqual([
      { name: 'h2puni', kind: 'ssh_host', resources: 0 },
      { name: 'h4claw', kind: 'ssh_host', resources: 0 },
    ]);
    const audits = auditRows().filter((row) => row.action === 'compute_provider_registered');
    expect(audits).toHaveLength(3);
    expect(JSON.parse(audits[0]?.detail ?? '{}')).toEqual({
      kind: 'ssh_host',
      name: 'h4claw',
      locator: 'puni1@h4claw',
    });
  });

  it('registers and lists every kind, the pool slot included, and refuses any other', async () => {
    for (const kind of ['docker', 'kubernetes', 'puni_pool'])
      expect((await register('dany', `${kind}-1`, kind)).status).toBe(201);
    expect((await register('dany', 'lambda-1', 'lambda')).status).toBe(400);
    const listed = await h.call('dany', 'GET', PATH);
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { computeProviders: { name: string; kind: string }[] }).computeProviders
        .map(({ name, kind }) => ({ name, kind }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: 'docker-1', kind: 'docker' },
      { name: 'kubernetes-1', kind: 'kubernetes' },
      { name: 'puni_pool-1', kind: 'puni_pool' },
    ]);
  });

  // Proof: with members admitted in `administering`, the member's list
  // answered 200; watched 2026-10-22.
  it('refuses a member every compute provider route, writing nothing', async () => {
    const id = await registered('dany', 'h4claw');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { kind: 'ssh_host', name: 'm', locator: 'm' }],
      ['PATCH', `${PATH}/${id}`, { name: 'm' }],
      ['DELETE', `${PATH}/${id}`, undefined],
    ] as const)
      expect(await h.call('mem', method, path, body)).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    expect(rows('SELECT id FROM compute_provider')).toHaveLength(1);
    expect(auditRows()).toHaveLength(1);
  });

  it('refuses a machine key and an MCP delegation every route insufficient_scope', async () => {
    const id = await registered('dany', 'h4claw');
    const { agent } = await keys();
    const routes = [
      ['GET', PATH, undefined],
      ['POST', PATH, { kind: 'ssh_host', name: 'k', locator: 'k' }],
      ['PATCH', `${PATH}/${id}`, { name: 'k' }],
      ['DELETE', `${PATH}/${id}`, undefined],
    ] as const;
    for (const [method, path, body] of routes)
      expect(await h.callWith(agent, method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
    h.close();
    const signing = await generateKeyPair('RS256');
    h = OrganizationHarness.open({ delegationKey: signing.publicKey });
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    h.bind('dany', 'org-a');
    h.activate();
    const own = await registered('dany', 'h4claw');
    mapUpstream(h, 'dany', 'sub-dany');
    const delegation = () => delegationFor(h, signing.privateKey, 'dany', 'org-a', 'sub-dany');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { kind: 'ssh_host', name: 'd', locator: 'd' }],
      ['PATCH', `${PATH}/${own}`, { name: 'd' }],
      ['DELETE', `${PATH}/${own}`, undefined],
    ] as const)
      expect(await h.callWith(await delegation(), method, path, body)).toEqual({
        status: 403,
        body: { error: 'insufficient_scope' },
      });
    expect(rows('SELECT id FROM compute_provider')).toHaveLength(1);
  });

  it('answers every route no_active_organization before activation', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    h.bind('dany', 'org-a');
    for (const [method, path, body] of [
      ['GET', PATH, undefined],
      ['POST', PATH, { kind: 'ssh_host', name: 'p', locator: 'p' }],
      ['PATCH', `${PATH}/x`, { name: 'p' }],
      ['DELETE', `${PATH}/x`, undefined],
    ] as const)
      expect(await h.call('dany', method, path, body)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
  });

  it('refuses a name or locator shaped like a secret, storing nothing', async () => {
    for (const body of [
      { kind: 'ssh_host', name: 'wbs_mk_leaked', locator: 'x' },
      { kind: 'ssh_host', name: 'x', locator: 'auth0|tenant|subject' },
    ])
      expect(await h.call('dany', 'POST', PATH, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(rows('SELECT id FROM compute_provider')).toEqual([]);
  });

  // Proof: with the audit append's failure caught and dropped in `register`,
  // this answered 201; watched 2026-10-22.
  it('stores no instance when the audit row cannot be written', async () => {
    h.sqlite.run(
      "CREATE TRIGGER refuse_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );
    expect((await register('dany', 'h4claw')).status).toBe(500);
    expect(rows('SELECT id FROM compute_provider')).toEqual([]);
  });

  it('renames and relocates an instance with its audit row', async () => {
    const id = await registered('dany', 'h4claw');
    await registered('dany', 'h2puni');
    expect(await h.call('dany', 'PATCH', `${PATH}/${id}`, { name: 'h2puni' })).toEqual({
      status: 409,
      body: { error: 'name_taken' },
    });
    const moved = await h.call('dany', 'PATCH', `${PATH}/${id}`, {
      name: 'h4claw-2',
      locator: 'puni1@h4claw-2',
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ id, name: 'h4claw-2', locator: 'puni1@h4claw-2' });
    const updated = auditRows().filter((row) => row.action === 'compute_provider_updated');
    expect(updated.map((row) => JSON.parse(row.detail) as unknown)).toEqual([
      {
        kind: 'ssh_host',
        name: 'h4claw-2',
        locator: 'puni1@h4claw-2',
        previousName: 'h4claw',
        previousLocator: 'puni1@h4claw',
      },
    ]);
  });

  // Proof: with the empty-patch check removed from the route, `{}` answered
  // 200 instead of 400; with the secret check
  // removed from the PATCH route, the secret-shaped name answered 500;
  // watched 2026-10-22.
  it('refuses an empty patch and a secret-shaped name or locator, writing nothing', async () => {
    const id = await registered('dany', 'h4claw');
    for (const body of [{}, { name: 'wbs_mk_leaked' }, { locator: 'auth0|tenant|subject' }])
      expect(await h.call('dany', 'PATCH', `${PATH}/${id}`, body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    expect(rows('SELECT name, locator FROM compute_provider')).toEqual([
      { name: 'h4claw', locator: 'puni1@h4claw' },
    ]);
    expect(auditRows().map((row) => row.action)).toEqual(['compute_provider_registered']);
  });

  // Proof: with the organization predicate dropped from `ownProvider`, Dany's
  // patch renamed B's instance (200); watched 2026-10-22.
  it("answers another organization's instance unknown_provider on patch and delete", async () => {
    const theirs = await registered('bob', 'h4claw');
    expect(await h.call('dany', 'PATCH', `${PATH}/${theirs}`, { name: 'mine' })).toEqual({
      status: 404,
      body: { error: 'unknown_provider' },
    });
    expect(await h.call('dany', 'DELETE', `${PATH}/${theirs}`)).toEqual({
      status: 404,
      body: { error: 'unknown_provider' },
    });
    expect(rows('SELECT id FROM compute_provider')).toHaveLength(1);
  });

  // Proof: with the `in_use` refusal removed from `remove`, the first delete
  // answered 204 without cascade; watched 2026-10-22.
  it('refuses removing a fulfilling instance unless cascade', async () => {
    const h4claw = await registered('dany', 'h4claw');
    expect((await reference('dany', ram, { providerId: h4claw })).status).toBe(200);
    expect((await reference('dany', staging, { providerId: h4claw })).status).toBe(200);
    const { agent } = await keys();
    expect((await report(agent, h4claw, ram, measured(Date.now() - 1000))).status).toBe(200);
    expect(await h.call('dany', 'DELETE', `${PATH}/${h4claw}`)).toEqual({
      status: 409,
      body: {
        error: 'in_use',
        resources: [
          { id: ram, name: 'h4claw ram' },
          { id: staging, name: 'staging' },
        ],
      },
    });
    expect(await h.call('dany', 'DELETE', `${PATH}/${h4claw}?cascade=true`)).toEqual({
      status: 204,
      body: null,
    });
    expect([providerOf(ram), providerOf(staging)]).toEqual([null, null]);
    expect(reportCount()).toBe(0);
    expect(rows('SELECT id FROM compute_provider')).toEqual([]);
    const removed = auditRows().filter((row) => row.action === 'compute_provider_removed');
    expect(removed).toHaveLength(1);
    expect(
      (
        JSON.parse(removed[0]?.detail ?? '{}') as { clearedResources: string[] }
      ).clearedResources.sort(),
    ).toEqual([ram, staging].sort());
  });
});

describe("a resource's provider reference", () => {
  // Proof: with `withProviderReadings` dropped from the resources read, this
  // and the two report reads below found no providerId; watched 2026-10-22.
  it('sets, reads and clears the reference, and the schedule input does not move', async () => {
    const h4claw = await registered('dany', 'h4claw');
    const before = await h.optimizationHash(projectA);
    expect((await reference('mem', ram, { providerId: h4claw })).status).toBe(200);
    expect(providerOf(ram)).toBe(h4claw);
    const read = await readResources('dany');
    expect(read.resources.find((each) => each.id === ram)).toMatchObject({
      providerId: h4claw,
      measurement: { declared: null, measured: null, measuredAt: null, state: 'no_report' },
    });
    expect(read.resources.find((each) => each.id === ram)?.provider).toEqual({
      kind: 'ssh_host',
      name: 'h4claw',
    });
    // A member reads the instance's kind and name (task 5.3), never its locator.
    // Proof: `withProviderReadings` answering `{ kind, name, locator: id }`
    // failed this `toEqual`; watched 2026-10-25.
    const member = (await readResources('mem')).resources.find((each) => each.id === ram);
    expect(member?.provider).toEqual({ kind: 'ssh_host', name: 'h4claw' });
    expect(read.resources.find((each) => each.id === staging)).toEqual({
      id: staging,
      name: 'staging',
      kind: 'divisible',
      unitLabel: 'GB',
      providerId: null,
    });
    const listed = (await h.call('dany', 'GET', PATH)).body as {
      computeProviders: { resources: number }[];
    };
    expect(listed.computeProviders[0]?.resources).toBe(1);
    expect(await h.optimizationHash(projectA)).toBe(before);
    expect((await reference('dany', ram, { providerId: null })).status).toBe(200);
    expect(providerOf(ram)).toBeNull();
  });

  it('names the instance to a viewer too, never its locator', async () => {
    await h.register('vic');
    h.member('org-a', 'vic', 'viewer');
    h.bind('vic', 'org-a');
    const h4claw = await registered('dany', 'h4claw');
    expect((await reference('dany', ram, { providerId: h4claw })).status).toBe(200);
    const viewer = (await readResources('vic')).resources.find((each) => each.id === ram);
    expect(viewer?.provider).toEqual({ kind: 'ssh_host', name: 'h4claw' });
  });

  it('answers 500 on a reference naming no instance', async () => {
    const h4claw = await registered('dany', 'h4claw');
    expect((await reference('dany', ram, { providerId: h4claw })).status).toBe(200);
    // Reachable: migrations rebuild tables with foreign keys off.
    h.sqlite.run('PRAGMA foreign_keys = OFF');
    h.sqlite.run('DELETE FROM compute_provider');
    h.sqlite.run('PRAGMA foreign_keys = ON');
    expect(await storeRefusal([ram])).toMatch(/is not registered/);
    const answer = await h.call('mem', 'GET', `/api/projects/${projectA}/resources`);
    expect(answer.status).toBe(500);
  });

  it('answers 500 on an instance of a malformed kind', async () => {
    const h4claw = await registered('dany', 'h4claw');
    expect((await reference('dany', ram, { providerId: h4claw })).status).toBe(200);
    h.sqlite.run('PRAGMA ignore_check_constraints = ON');
    h.sqlite.run("UPDATE compute_provider SET kind = 'vm'");
    h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
    // The store itself, since the route's response contract would also refuse `vm`.
    expect(await storeRefusal([ram])).toMatch(/malformed kind/);
    const answer = await h.call('mem', 'GET', `/api/projects/${projectA}/resources`);
    expect(answer.status).toBe(500);
  });

  // Proof: with the instance check removed from `setResourceProvider`, this
  // answered 500 on the foreign key; watched 2026-10-22.
  it('refuses an id no instance holds, unchanged', async () => {
    expect(
      await reference('dany', ram, { providerId: 'provider-missing', name: 'renamed' }),
    ).toEqual({
      status: 404,
      body: { at: 0, kind: 'patchResource', error: 'unknown_provider' },
    });
    expect(providerOf(ram)).toBeNull();
    expect(
      rows<{ name: string }>(`SELECT name FROM resource_organization WHERE resource_id = '${ram}'`),
    ).toEqual([{ name: 'h4claw ram' }]);
  });

  // Proof: with the organization check removed from `setResourceProvider`,
  // A's resource stored B's instance; watched 2026-10-22.
  it("refuses a stranger's instance, unchanged", async () => {
    const theirs = await registered('bob', 'h4claw');
    expect(await reference('dany', ram, { providerId: theirs })).toEqual({
      status: 409,
      body: { at: 0, kind: 'patchResource', error: 'provider_not_in_organization' },
    });
    expect(providerOf(ram)).toBeNull();
  });

  it('refuses a providerId that is neither an id nor null at the command schema', async () => {
    const answer = await reference('dany', ram, { providerId: 5 });
    expect(answer.status).toBe(400);
    expect(providerOf(ram)).toBeNull();
  });

  // Proof: with the usage read answering null for `providerId`, the in_use
  // counts of the referenced resource named no instance; watched 2026-10-22.
  it("names the resource's instance when its removal is refused in_use", async () => {
    const h4claw = await registered('dany', 'h4claw');
    await reference('dany', ram, { providerId: h4claw });
    await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [
        { kind: 'setResourceCapacity', resourceId: ram, units: 15 },
        { kind: 'setResourceCapacity', resourceId: staging, units: 1 },
      ],
    });
    const remove = (resourceId: string) =>
      h.call('dany', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId }],
      });
    expect(await remove(ram)).toMatchObject({
      status: 409,
      body: { error: 'in_use', counts: { capacities: 1, providerId: h4claw } },
    });
    expect(await remove(staging)).toMatchObject({
      status: 409,
      body: { error: 'in_use', counts: { capacities: 1, providerId: null } },
    });
  });

  it('refuses an agent key of a super-admin removing a resource, as a member', async () => {
    // A machine credential acts as at most a member (`organizationRoleOf`, A23),
    // so no agent removes a resource whatever its account's role (R8a).
    // Proof: with the role refusal in `removeResourceWithin` skipped, the
    // agent's removal answered 200; watched 2026-10-25.
    const { agent } = await keys();
    const command = { kind: 'deleteResource', resourceId: staging, cascade: true };
    expect(
      await h.callWith(agent, 'POST', '/api/directory/commands', { commands: [command] }),
    ).toEqual({ status: 403, body: { at: 0, kind: 'deleteResource', error: 'forbidden' } });
    expect(
      await h.callWith(agent, 'POST', '/api/directory/commands', {
        commands: [{ kind: 'patchResource', resourceId: staging, patch: { unitLabel: 'env' } }],
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await h.call('dany', 'POST', '/api/directory/commands', { commands: [command] }),
    ).toMatchObject({ status: 200 });
  });

  it('drops the old instance report when the reference moves', async () => {
    const h4claw = await registered('dany', 'h4claw');
    const h2puni = await registered('dany', 'h2puni');
    await reference('dany', ram, { providerId: h4claw });
    const { agent } = await keys();
    expect((await report(agent, h4claw, ram, measured(Date.now() - 1000))).status).toBe(200);
    expect((await reference('dany', ram, { providerId: h2puni })).status).toBe(200);
    expect(reportCount()).toBe(0);
  });
});

describe('a capacity report', () => {
  let h4claw: string;
  let h2puni: string;
  let agent: string;
  let human: string;
  let stranger: string;

  beforeEach(async () => {
    h4claw = await registered('dany', 'h4claw');
    h2puni = await registered('dany', 'h2puni');
    await reference('dany', ram, { providerId: h4claw });
    ({ agent, human, stranger } = await keys());
  });

  it('stores h4claw at 15 GB with 8 in use, idempotently, beside the declared 32', async () => {
    await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 32 }],
    });
    const observedAt = Date.now() - 240_000;
    const first = await report(agent, h4claw, ram, measured(observedAt));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      providerId: h4claw,
      observedAt,
      cadenceSeconds: 300,
      outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
      reportedBy: 'dash-a',
    });
    expect(await report(agent, h4claw, ram, measured(observedAt))).toEqual(first);
    expect(reportCount()).toBe(1);
    const read = await readResources('mem');
    expect(read.resources.find((each) => each.id === ram)).toMatchObject({
      providerId: h4claw,
      report: first.body,
      measurement: { declared: 32, measured: 15, measuredAt: observedAt, state: 'measured' },
    });
    // No audit row per report (P6), only the two registrations.
    expect(auditRows()).toHaveLength(2);
  });

  // Proof: with the superseded refusal turned into a store in
  // `decideCapacityReport`, the late report replaced the newer one; watched
  // 2026-10-22.
  it('refuses a late report after a newer one, keeping the newer', async () => {
    const t = Date.now() - 600_000;
    expect((await report(agent, h4claw, ram, measured(t + 300_000, 15, 9))).status).toBe(200);
    expect(await report(agent, h4claw, ram, measured(t))).toEqual({
      status: 409,
      body: { error: 'report_superseded', storedObservedAt: t + 300_000 },
    });
    expect(rows('SELECT observed_at, usage_units FROM resource_capacity_report')).toEqual([
      { observed_at: t + 300_000, usage_units: 9 },
    ]);
  });

  it('stores an unreachable host as unreachable, never as a capacity of 0, and marks it stale', async () => {
    const observedAt = Date.now() - 1000;
    const body = {
      observedAt,
      cadenceSeconds: 300,
      outcome: {
        kind: 'unreachable',
        reason: 'ssh: connect to host h4claw port 22: Connection timed out',
      },
    };
    expect((await report(agent, h4claw, ram, body)).status).toBe(200);
    expect(
      (await readResources('dany')).resources.find((each) => each.id === ram)?.measurement,
    ).toEqual({
      declared: null,
      measured: null,
      measuredAt: observedAt,
      state: 'unreachable',
    });
    // Three 30-second cadences and a second have passed since it was observed.
    h.sqlite.run('UPDATE resource_capacity_report SET observed_at = ?, cadence_seconds = 30', [
      Date.now() - 91_000,
    ]);
    expect(
      (await readResources('dany')).resources.find((each) => each.id === ram)?.measurement?.state,
    ).toBe('stale');
  });

  // Proof: with the machine predicate removed from the route, the session's
  // report answered 500 instead of 403; watched 2026-10-22.
  it('refuses a browser session and an MCP delegation, storing nothing', async () => {
    expect(
      await h.call(
        'dany',
        'PUT',
        `/api/compute-providers/${h4claw}/resources/${ram}/capacity-report`,
        measured(Date.now()),
      ),
    ).toEqual({
      status: 403,
      body: { error: 'not_an_agent_principal', authentication: 'session' },
    });
    expect(reportCount()).toBe(0);
    h.close();
    const signing = await generateKeyPair('RS256');
    h = OrganizationHarness.open({ delegationKey: signing.publicKey });
    await h.register('dany');
    h.organization('org-a');
    h.member('org-a', 'dany', 'super_admin');
    h.bind('dany', 'org-a');
    h.activate();
    mapUpstream(h, 'dany', 'sub-dany');
    const delegation = await delegationFor(h, signing.privateKey, 'dany', 'org-a', 'sub-dany');
    expect(await report(delegation, 'any', 'any', measured(Date.now()))).toEqual({
      status: 403,
      body: { error: 'not_an_agent_principal', authentication: 'delegation' },
    });
  });

  it("refuses a key pinned to a human's person, storing nothing", async () => {
    expect(await report(human, h4claw, ram, measured(Date.now()))).toEqual({
      status: 403,
      body: { error: 'not_an_agent_principal', personKind: 'person' },
    });
    expect(reportCount()).toBe(0);
  });

  // Proof: with the organization comparison removed from
  // `decideCapacityReport`, B's key stored a report on A's instance; watched
  // 2026-10-22.
  it("answers another tenant's Dash unknown_provider, naming nothing of A", async () => {
    const answer = await report(stranger, h4claw, ram, measured(Date.now()));
    expect(answer).toEqual({ status: 404, body: { error: 'unknown_provider' } });
    expect(JSON.stringify(answer.body)).not.toContain(h4claw);
    expect(reportCount()).toBe(0);
    // B's own instance over A's resource: the resource is not B's.
    const theirs = await registered('bob', 'h4claw-b');
    expect(await report(stranger, theirs, ram, measured(Date.now()))).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await report(stranger, theirs, ramOfB, measured(Date.now()))).toEqual({
      status: 409,
      body: { error: 'provider_mismatch', providerId: null },
    });
  });

  it('refuses a report through an instance the resource does not name', async () => {
    expect(await report(agent, h2puni, ram, measured(Date.now()))).toEqual({
      status: 409,
      body: { error: 'provider_mismatch', providerId: h4claw },
    });
    expect(reportCount()).toBe(0);
  });

  it('refuses an observedAt more than five minutes ahead and a malformed body', async () => {
    const answer = await report(agent, h4claw, ram, measured(Date.now() + 3_600_000));
    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ error: 'observedAt_in_future' });
    for (const body of [
      { ...measured(Date.now()), cadenceSeconds: 10 },
      { ...measured(Date.now()), outcome: { kind: 'measured', capacityUnits: 1.5, usageUnits: 0 } },
      { ...measured(Date.now()), outcome: { kind: 'unreachable', reason: '' } },
      { ...measured(Date.now()), outcome: { kind: 'not_implemented' } },
    ])
      expect((await report(agent, h4claw, ram, body)).status).toBe(400);
    expect(reportCount()).toBe(0);
  });

  // Proof: with the SQLite capacity read made to prefer a stored report's
  // `capacity_units` over the declared units, the schedule hash moved, and with
  // the two read assertions removed the 12 GB claim answered 409; watched
  // 2026-10-22.
  it('changes no schedule and no claim: 15 GB declared, 8 measured, a 12 GB leaf claims', async () => {
    const steps = (
      (await h.call('dany', 'GET', `/api/projects/${projectA}`)).body as {
        steps: { id: string }[];
      }
    ).steps;
    const setUpPlan = await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [
        { kind: 'setResourceCapacity', resourceId: ram, units: 15 },
        { kind: 'setDemand', workItemId: leaf, resourceId: ram, units: 12 },
        ...steps.map((step) => ({
          kind: 'setEstimate',
          workItemId: leaf,
          stepId: step.id,
          days: { optimistic: 1, realistic: 1, pessimistic: 1 },
        })),
      ],
    });
    expect(setUpPlan.status).toBe(200);
    const before = await h.optimizationHash(projectA);
    const startableBefore = await h.call('dany', 'GET', `/api/projects/${projectA}/startable`);
    expect((await report(agent, h4claw, ram, measured(Date.now() - 1000, 8, 8))).status).toBe(200);
    expect(await h.optimizationHash(projectA)).toBe(before);
    expect(await h.call('dany', 'GET', `/api/projects/${projectA}/startable`)).toEqual(
      startableBefore,
    );
    const readyStep = steps.at(0)?.id;
    if (readyStep === undefined) throw new Error('project has no first step');
    const claimed = await h.callWith(agent, 'POST', `/api/projects/${projectA}/commands`, {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: leaf,
          personId: 'dash-a',
          // A whole-leaf claim also asks for blocked later workflow steps.
          steps: [readyStep],
          resources: [{ resourceId: ram, units: 12 }],
        },
      ],
    });
    expect(claimed.status).toBe(200);
  });
});

describe('the plan export', () => {
  /**
   * The JSON export of A's plan without its export instant and its realtime
   * sequence: setting a reference announces to the projects naming the
   * resource, which moves `seq` and nothing of the plan.
   */
  async function exported(): Promise<string> {
    const answer = await h.call('dany', 'GET', `/api/projects/${projectA}/export?format=json`);
    expect(answer.status).toBe(200);
    const {
      seq: _seq,
      document,
      ...plan
    } = answer.body as {
      seq: number;
      document: Record<string, unknown>;
    };
    const { exportedAt: _instant, ...format } = document;
    return JSON.stringify({ ...plan, document: format });
  }

  // Proof: with the organization resource read selecting `provider_id` and
  // the document's resource rows spread whole, the export after the reference
  // differed from the one before; watched 2026-10-22.
  it('is byte-identical with and without a reference and a report, and imports unreferenced', async () => {
    await h.call('dany', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [
        { kind: 'setResourceCapacity', resourceId: ram, units: 15 },
        { kind: 'setDemand', workItemId: leaf, resourceId: ram, units: 4 },
      ],
    });
    const before = await exported();
    const h4claw = await registered('dany', 'h4claw');
    await reference('dany', ram, { providerId: h4claw });
    const { agent } = await keys();
    expect((await report(agent, h4claw, ram, measured(Date.now() - 1000))).status).toBe(200);
    const after = await exported();
    expect(after).toBe(before);
    expect(after).not.toContain(h4claw);
    expect(after).not.toContain('providerId');
    const document = (await h.call('dany', 'GET', `/api/projects/${projectA}/export?format=json`))
      .body as object;
    const imported = await h.call('bob', 'POST', '/api/projects/import', document);
    expect(imported.status).toBe(201);
    expect(
      rows<{ n: number }>(
        "SELECT count(*) AS n FROM resource r JOIN resource_organization o ON o.resource_id = r.id WHERE o.organization_id = 'org-b' AND r.provider_id IS NOT NULL",
      ),
    ).toEqual([{ n: 0 }]);
  });
});
