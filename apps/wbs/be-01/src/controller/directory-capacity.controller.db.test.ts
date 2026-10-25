import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { generateKeyPair } from 'jose';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

/**
 * A resource's directory capacity (`wbs-shared-occupancy` slice 1, on the
 * assumed S1, S11 and S12) over be-01's production composition and real
 * SQLite: `setDirectoryCapacity` on both command routes, who may send it, its
 * audit row, the resources read, a removal counting it, the preview, and that
 * a lowering strands nothing.
 */
let h: OrganizationHarness;
let projectA: string;
let projectB: string;
let ram: string;

const DIRECTORY = '/api/directory/commands';
const previewPath = (resourceId: string) =>
  `/api/organization/resources/${resourceId}/directory-capacity/preview`;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await setUp(h);
});

afterEach(() => {
  h.close();
});

/**
 * Organization A with `ada` (member), `vic` (viewer), `sue` (admin), `tom`
 * (super-admin); B with `grace`. Projects A and B of A, each with one leaf
 * (`w-a`, `w-b`), agents `agent-a` and `agent-b` bound to ada, and the
 * resource `host ram` of A.
 */
async function setUp(harness: OrganizationHarness): Promise<void> {
  for (const username of ['ada', 'vic', 'sue', 'tom', 'grace']) await harness.register(username);
  harness.organization('org-a');
  harness.organization('org-b');
  for (const [username, role] of [
    ['ada', 'member'],
    ['vic', 'viewer'],
    ['sue', 'admin'],
    ['tom', 'super_admin'],
  ] as const) {
    harness.member('org-a', username, role);
    harness.bind(username, 'org-a');
  }
  harness.member('org-b', 'grace', 'admin');
  harness.bind('grace', 'org-b');
  harness.activate();
  projectA = await create(harness, 'ada', 'A');
  projectB = await create(harness, 'ada', 'B');
  for (const [id, projectId] of [
    ['w-a', projectA],
    ['w-b', projectB],
  ] as const)
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 0, ?)',
      [id, projectId, id],
    );
  for (const id of ['agent-a', 'agent-b'])
    addAgentPerson(harness.sqlite, id, 'org-a', harness.userId('ada'));
  ram = await declare(harness, 'ada', 'host ram');
}

async function create(harness: OrganizationHarness, username: string, name: string) {
  const answer = await harness.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function declare(harness: OrganizationHarness, username: string, name: string) {
  const answer = await harness.call(username, 'POST', DIRECTORY, {
    commands: [{ kind: 'createResource', name, resourceKind: 'divisible', unitLabel: 'GB' }],
  });
  if (answer.status !== 200) throw new Error(`declare refused: ${JSON.stringify(answer)}`);
  const id = (answer.body as { results: { id?: string }[] }).results.at(0)?.id;
  if (id === undefined) throw new Error('the create minted no id');
  return id;
}

const state = (resourceId: string, units: number | null) => ({
  kind: 'setDirectoryCapacity',
  resourceId,
  units,
});

/** The stated directory capacity, null when none. */
function stated(harness: OrganizationHarness, resourceId: string): number | null {
  return (
    harness.sqlite
      .query<{ units: number }, [string]>(
        'SELECT units FROM resource_directory_capacity WHERE resource_id = ?',
      )
      .get(resourceId)?.units ?? null
  );
}

function auditRows(harness: OrganizationHarness) {
  return harness.sqlite
    .query<{ actor_id: string; subject_id: string; detail: string }, []>(
      "SELECT actor_id, subject_id, detail FROM organization_audit WHERE action = 'directory_capacity_changed' AND subject_kind = 'resource' ORDER BY created_at, rowid",
    )
    .all();
}

function journalEntries(harness: OrganizationHarness): number {
  return (
    harness.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM command_journal').get()?.n ??
    -1
  );
}

async function directoryCapacityRead(username: string, projectId: string) {
  const read = await h.call(username, 'GET', `/api/projects/${projectId}/resources`);
  if (read.status !== 200) throw new Error(`read refused: ${JSON.stringify(read)}`);
  return (read.body as { resources: { id: string; directoryCapacity?: number | null }[] }).resources
    .filter(({ id }) => id === ram)
    .map(({ directoryCapacity }) => directoryCapacity);
}

describe('setDirectoryCapacity', () => {
  it('states a directory capacity on either route and reads it from both projects', async () => {
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] })).toMatchObject({
      status: 200,
    });
    for (const projectId of [projectA, projectB])
      expect(await directoryCapacityRead('vic', projectId)).toEqual([16]);
    expect(
      await h.call('tom', 'POST', `/api/projects/${projectA}/commands`, {
        commands: [state(ram, null)],
      }),
    ).toMatchObject({ status: 200 });
    expect(await directoryCapacityRead('ada', projectB)).toEqual([null]);
    expect(stated(h, ram)).toBeNull();
  });

  it('refuses a member and a viewer on either route, writing nothing', async () => {
    for (const path of [DIRECTORY, `/api/projects/${projectA}/commands`]) {
      expect(await h.call('ada', 'POST', path, { commands: [state(ram, 16)] }), path).toEqual({
        status: 403,
        body: { at: 0, kind: 'setDirectoryCapacity', error: 'forbidden' },
      });
      expect(await h.call('vic', 'POST', path, { commands: [state(ram, 16)] }), path).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    }
    expect(stated(h, ram)).toBeNull();
    expect(auditRows(h)).toEqual([]);
  });

  it("refuses an admin's agent key as a member on either route", async () => {
    addAgentPerson(h.sqlite, 'sue-agent', 'org-a', h.userId('sue'));
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'sue-agent',
      issuedBy: h.userId('sue'),
    });
    for (const path of [DIRECTORY, `/api/projects/${projectA}/commands`])
      expect(await h.callWith(key, 'POST', path, { commands: [state(ram, 16)] }), path).toEqual({
        status: 403,
        body: { at: 0, kind: 'setDirectoryCapacity', error: 'forbidden' },
      });
    expect(stated(h, ram)).toBeNull();
  });

  it('refuses a foreign or absent resource not_found, and a non-whole number at the boundary', async () => {
    const theirs = await declare(h, 'grace', 'b ram');
    for (const resourceId of [theirs, 'no-such-resource'])
      expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(resourceId, 4)] })).toEqual({
        status: 404,
        body: { at: 0, kind: 'setDirectoryCapacity', error: 'not_found' },
      });
    for (const units of [-1, 1.5])
      expect(
        (await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, units)] })).status,
      ).toBe(400);
    expect(stated(h, ram)).toBeNull();
    expect(stated(h, theirs)).toBeNull();
  });

  it('writes one audit row per change, never a journal entry', async () => {
    const before = journalEntries(h);
    await h.call('sue', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [state(ram, 16)],
    });
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, null)] });
    expect(auditRows(h)).toEqual([
      {
        actor_id: h.userId('sue'),
        subject_id: ram,
        detail: JSON.stringify({ before: null, after: 16 }),
      },
      {
        actor_id: h.userId('sue'),
        subject_id: ram,
        detail: JSON.stringify({ before: 16, after: null }),
      },
    ]);
    expect(journalEntries(h)).toBe(before);
  });

  it('refuses removing a resource with a stated directory capacity, counting it', async () => {
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] });
    expect(
      await h.call('sue', 'POST', DIRECTORY, {
        commands: [{ kind: 'deleteResource', resourceId: ram }],
      }),
    ).toMatchObject({
      status: 409,
      body: {
        error: 'in_use',
        counts: { demands: 0, capacities: 0, occupancies: 0, directoryCapacity: 16 },
      },
    });
    expect(
      await h.call('sue', 'POST', DIRECTORY, {
        commands: [{ kind: 'deleteResource', resourceId: ram, cascade: true }],
      }),
    ).toMatchObject({ status: 200 });
    expect(stated(h, ram)).toBeNull();
  });
});

describe('a directory capacity over MCP', () => {
  let signing: CryptoKeyPair;

  beforeEach(async () => {
    h.close();
    signing = await generateKeyPair('RS256');
    h = OrganizationHarness.openComposedWith({ delegationKey: signing.publicKey });
    await setUp(h);
    mapUpstream(h, 'sue', 'sub-sue');
  });

  it("applies an admin's own MCP session, as the admin's browser session", async () => {
    const delegation = await delegationFor(h, signing.privateKey, 'sue', 'org-a', 'sub-sue');
    expect(
      await h.callWith(delegation, 'POST', DIRECTORY, { commands: [state(ram, 16)] }),
    ).toMatchObject({ status: 200 });
    expect(stated(h, ram)).toBe(16);
  });

  it("refuses an MCP consent acting as an admin's agent, on either route", async () => {
    addAgentPerson(h.sqlite, 'sue-agent', 'org-a', h.userId('sue'));
    const credentialId = crypto.randomUUID();
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, mcp_family_id, created_at, created_by)
       VALUES (?, 'org-a', 'sue-agent', ?, 'mcp_consent', 'consent', 'family-1', 1, ?)`,
      [credentialId, h.userId('sue'), h.userId('sue')],
    );
    for (const path of [DIRECTORY, `/api/projects/${projectA}/commands`]) {
      const consent = await delegationFor(h, signing.privateKey, 'sue', 'org-a', 'sub-sue', {
        credentialId,
        personId: 'sue-agent',
      });
      expect(await h.callWith(consent, 'POST', path, { commands: [state(ram, 16)] }), path).toEqual(
        { status: 403, body: { at: 0, kind: 'setDirectoryCapacity', error: 'forbidden' } },
      );
    }
    expect(stated(h, ram)).toBeNull();
  });
});

describe('previewing and lowering a directory capacity', () => {
  /** A leaf of each project demanding `units`, claimed by its agent through ada's session. */
  async function hold(units: readonly [number, number]): Promise<void> {
    for (const [index, projectId] of [projectA, projectB].entries()) {
      const workItemId = index === 0 ? 'w-a' : 'w-b';
      const answer: Answer = await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, {
        commands: [
          { kind: 'setDemand', workItemId, resourceId: ram, units: units[index] },
          {
            kind: 'claimWorkItem',
            workItemId,
            personId: index === 0 ? 'agent-a' : 'agent-b',
          },
        ],
      });
      if (answer.status !== 200)
        throw new Error(`the claim was refused: ${JSON.stringify(answer)}`);
    }
  }

  it('previews a lowering of 16 to 10 with A at 8 and B at 6, writing nothing', async () => {
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] });
    await hold([8, 6]);
    const audits = auditRows(h).length;
    expect(await h.call('sue', 'POST', previewPath(ram), { units: 10 })).toEqual({
      status: 200,
      body: {
        resourceId: ram,
        before: 16,
        after: 10,
        projects: [
          { projectId: projectA, name: 'A', units: 8 },
          { projectId: projectB, name: 'B', units: 6 },
        ].sort((left, right) => left.projectId.localeCompare(right.projectId)),
        hiddenProjects: { count: 0, units: 0 },
        free: -4,
        refusal: null,
      },
    });
    expect(stated(h, ram)).toBe(16);
    expect(auditRows(h)).toHaveLength(audits);
    expect(await h.call('sue', 'POST', previewPath(ram), { units: null })).toMatchObject({
      status: 200,
      body: { before: 16, after: null, free: null },
    });
  });

  it("refuses a member and an admin's agent the preview", async () => {
    expect(await h.call('ada', 'POST', previewPath(ram), { units: 10 })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    addAgentPerson(h.sqlite, 'sue-agent', 'org-a', h.userId('sue'));
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'sue-agent',
      issuedBy: h.userId('sue'),
    });
    expect(await h.callWith(key, 'POST', previewPath(ram), { units: 10 })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await h.call('grace', 'POST', previewPath(ram), { units: 10 })).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await h.call('sue', 'POST', previewPath(ram), { units: 1.5 })).toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
  });

  it('strands nothing when lowered below what is held, refusing new claims until it drains', async () => {
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] });
    await hold([8, 6]);
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 10)] })).toMatchObject({
      status: 200,
    });
    const held = h.sqlite
      .query<{ units: number }, []>(
        'SELECT max(o.units) AS units FROM claim_occupancy AS o JOIN claim AS c ON c.id = o.claim_id GROUP BY c.work_item_id ORDER BY units',
      )
      .all();
    expect(held).toEqual([{ units: 6 }, { units: 8 }]);
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-c', ?, NULL, 1, 'w-c')",
      [projectA],
    );
    const refused = await h.call('ada', 'POST', `/api/projects/${projectA}/commands`, {
      commands: [
        { kind: 'setDemand', workItemId: 'w-c', resourceId: ram, units: 1 },
        { kind: 'claimWorkItem', workItemId: 'w-c', personId: 'agent-a' },
      ],
    });
    expect(refused).toMatchObject({
      status: 409,
      body: { error: 'resources_exhausted', scope: 'organization', free: -4, asked: 1 },
    });
  });
});
