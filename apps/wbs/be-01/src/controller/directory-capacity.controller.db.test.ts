import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { ClaimRepository } from '@wbs/store-sqlite/claim';
import { DirectoryRepository } from '@wbs/store-sqlite/directory';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { generateKeyPair } from 'jose';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';
import { delegationFor, mapUpstream } from '../testing/scim-fixture';

/**
 * A resource's directory capacity (`wbs-shared-occupancy` slice 1, on the
 * S1, S11 and S12, accepted 2026-11-01) over be-01's production composition and real
 * SQLite: `setDirectoryCapacity` on both command routes, who may send it, its
 * audit row, the resources read, a removal counting it, the preview, and that
 * a lowering strands nothing. An agent key reaches be-01 only on the MCP path
 * (`wbs-mcp-agent-surface`, #785), through mcp-01's forwarded grant
 * ({@link callForwarded}); `/api` refuses it as a bearer.
 */
let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let projectA: string;
let projectB: string;
let ram: string;

const DIRECTORY = '/api/directory/commands';
const previewPath = (resourceId: string) =>
  `/api/organization/resources/${resourceId}/directory-capacity/preview`;

beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});

beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({ machineGrants });
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

function firstStepOf(projectId: string): string {
  const step = h.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id = ? ORDER BY position,id LIMIT 1',
    )
    .get(projectId);
  if (step === null) throw new Error(`project ${projectId} has no first workflow step`);
  return step.id;
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

  // Proof: with the role check skipped in `setDirectoryCapacityWithin`, this
  // forwarded (MCP-path) case failed with the member, viewer and consent cases
  // (8 pass, 3 fail); watched 2026-11-01.
  it("refuses an admin's agent key as a member on either route", async () => {
    addAgentPerson(h.sqlite, 'sue-agent', 'org-a', h.userId('sue'));
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'sue-agent',
      issuedBy: h.userId('sue'),
    });
    for (const path of [DIRECTORY, `/api/projects/${projectA}/commands`]) {
      const commands = { commands: [state(ram, 16)] };
      expect(await callForwarded(h, key, 'POST', path, commands), path).toEqual({
        status: 403,
        body: { at: 0, kind: 'setDirectoryCapacity', error: 'forbidden' },
      });
      // Straight at `/api`, the key is no bearer at all (#785).
      expect(await h.callWith(key, 'POST', path, commands), path).toMatchObject({
        status: 401,
        body: { error: 'machine_bearer_not_accepted' },
      });
    }
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
            steps: [firstStepOf(projectId)],
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
    expect(await callForwarded(h, key, 'POST', previewPath(ram), { units: 10 })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await h.callWith(key, 'POST', previewPath(ram), { units: 10 })).toMatchObject({
      status: 401,
      body: { error: 'machine_bearer_not_accepted' },
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

  // Proof: with the holders left out of SQLite's `setDirectoryCapacity`
  // announce set, C's event log gained no `directory_changed` here; watched 2026-11-01.
  it('announces directory_changed to a project that holds the resource only through a claim', async () => {
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] });
    const projectC = await create(h, 'ada', 'C');
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-held', ?, NULL, 0, 'w-held')",
      [projectC],
    );
    const claimed: Answer = await h.call('ada', 'POST', `/api/projects/${projectC}/commands`, {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: 'w-held',
          personId: 'agent-a',
          steps: [firstStepOf(projectC)],
          resources: [{ resourceId: ram, units: 6 }],
        },
      ],
    });
    expect(claimed).toMatchObject({ status: 200 });
    const toldC = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${projectC}`)
        .filter(
          ({ message }) => (JSON.parse(message) as { type: string }).type === 'directory_changed',
        ).length;
    const before = toldC();
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 8)] })).toMatchObject({
      status: 200,
    });
    expect(toldC()).toBe(before + 1);
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
        {
          kind: 'claimWorkItem',
          workItemId: 'w-c',
          personId: 'agent-a',
          steps: [firstStepOf(projectA)],
        },
      ],
    });
    expect(refused).toMatchObject({
      status: 409,
      body: {
        error: 'resources_exhausted',
        scope: 'organization',
        free: -4,
        asked: 1,
        hiddenHolders: { units: 0 },
        resources: [{ resourceId: ram, hiddenHolders: { units: 0 } }],
      },
    });
  });
});

describe('shared holder visibility through the mounted organization', () => {
  const otherResource = 'other shared resource';
  type OriginRead = Parameters<ProjectRepository['mayReadProjectWithin']>;
  function distinctWorkItem(id: string, projectId: string, position: number) {
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, ?, ?)',
      [id, projectId, position, id],
    );
  }

  function stageHolder(
    id: string,
    projectId: string,
    workItemId: string,
    personId: string,
    position: number,
    runId: string | null,
    units: number,
    resources: readonly string[],
  ) {
    const step = h.sqlite
      .query<{ id: string }, [string, number]>(
        'SELECT id FROM step WHERE project_id = ? ORDER BY position,id LIMIT 1 OFFSET ?',
      )
      .get(projectId, position);
    if (step === null) throw new Error('not enough fixture steps');
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [id, workItemId, step.id, personId, runId, h.userId('ada')],
    );
    for (const resourceId of resources)
      h.sqlite.run('INSERT INTO claim_occupancy (claim_id, resource_id, units) VALUES (?, ?, ?)', [
        id,
        resourceId,
        units,
      ]);
  }

  async function declareCapacity(resources: readonly string[], units: number) {
    const answer = await h.call('sue', 'POST', DIRECTORY, {
      commands: resources.map((id) => state(id, units)),
    });
    expect(answer.status).toBe(200);
  }

  function denyOrigins(denied: ReadonlySet<string>, actor: string, onFirstRead?: () => void) {
    const reads: OriginRead[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(
      ProjectRepository.prototype,
      'mayReadProjectWithin',
    );
    if (typeof descriptor?.value !== 'function') throw new Error('missing project read method');
    const original = descriptor.value as ProjectRepository['mayReadProjectWithin'];
    const interceptor = spyOn(
      ProjectRepository.prototype,
      'mayReadProjectWithin',
    ).mockImplementation(function (this: ProjectRepository, ...args: OriginRead) {
      if (reads.length === 0) onFirstRead?.();
      reads.push(args);
      return denied.has(args[0].id) && args[1] === actor
        ? Promise.resolve(false)
        : original.apply(this, args);
    });
    return {
      reads,
      restore: () => {
        interceptor.mockRestore();
      },
    };
  }

  const hiddenRun = 'private-origin-run';
  const hiddenPerson = 'private-origin-person';
  const hiddenClaim = 'private-origin-claim';
  const hiddenLeaf = 'w-a';
  function createHiddenCopies(resources: readonly string[]) {
    addAgentPerson(h.sqlite, hiddenPerson, 'org-a', h.userId('ada'));
    h.sqlite.run('UPDATE project SET name = ? WHERE id = ?', ['PRIVATE_ORIGIN_PROJECT', projectA]);
    stageHolder(hiddenClaim, projectA, hiddenLeaf, hiddenPerson, 0, hiddenRun, 16, resources);
    stageHolder(
      'private-origin-copy',
      projectA,
      hiddenLeaf,
      'agent-a',
      1,
      'private-copy-run',
      16,
      resources,
    );
  }

  function absence(body: unknown, extra: readonly string[] = []) {
    const json = JSON.stringify(body);
    for (const field of [
      projectA,
      'PRIVATE_ORIGIN_PROJECT',
      hiddenPerson,
      hiddenRun,
      hiddenClaim,
      hiddenLeaf,
      'private-origin-copy',
      'private-copy-run',
      'agent-a',
      ...extra,
    ])
      expect(json).not.toContain(field);
  }

  async function demand(
    projectId: string,
    workItemId: string,
    resourceIds: readonly string[],
    units: number,
  ) {
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, {
          commands: resourceIds.map((resourceId) => ({
            kind: 'setDemand',
            workItemId,
            resourceId,
            units,
          })),
        })
      ).status,
    ).toBe(200);
  }

  it('redacts a denied origin from both genuine shortage aliases and counts duplicate copies once', async () => {
    const second = await declare(h, 'ada', otherResource);
    const resourceIds = [ram, second].sort();
    await declareCapacity(resourceIds, 24);
    createHiddenCopies(resourceIds);
    const c = await create(h, 'ada', 'visible other project');
    distinctWorkItem('w-visible-other', c, 0);
    distinctWorkItem('w-visible-local', projectB, 1);
    stageHolder(
      'visible-other-claim',
      c,
      'w-visible-other',
      'agent-b',
      0,
      'visible-run',
      4,
      resourceIds,
    );
    stageHolder(
      'visible-local-claim',
      projectB,
      'w-visible-local',
      'agent-b',
      0,
      null,
      4,
      resourceIds,
    );
    await demand(projectB, 'w-b', resourceIds, 1);
    h.sqlite.run(
      "UPDATE person_organization SET name = 'local agent B' WHERE resource_id = 'agent-b'",
    );
    const people = spyOn(DirectoryRepository.prototype, 'listInOrganization');
    const scopedNames = spyOn(DirectoryRepository.prototype, 'personNamesInOrganization');
    const denied = new Set([projectA]);
    const gate = denyOrigins(denied, h.userId('ada'), () => {
      people.mockClear();
      scopedNames.mockClear();
    });
    const requested = {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: 'w-b',
          personId: 'agent-a',
          steps: [firstStepOf(projectB)],
        },
      ],
    };
    const claimRows = () =>
      h.sqlite.query<{ count: number }, []>('SELECT count(*) as count FROM claim').get();
    const before = { journal: journalEntries(h), claims: claimRows() };
    try {
      const refused = await h.call('ada', 'POST', `/api/projects/${projectB}/commands`, requested);
      const mixedCatalogReads = people.mock.calls.filter(([catalog]) => catalog === 'people');
      const mixedNameReads = scopedNames.mock.calls.slice();
      expect(refused.status).toBe(409);
      const holders = [
        { personId: 'agent-b', name: 'local agent B', runId: null, workItemId: 'w-visible-local' },
        {
          personId: 'agent-b',
          name: 'local agent B',
          runId: 'visible-run',
          workItemId: 'w-visible-other',
          projectId: c,
        },
      ];
      const shortages = resourceIds.map((resourceId) => ({
        resourceId,
        holders,
        asked: 1,
        free: 0,
        scope: 'organization',
        hiddenHolders: { units: 16 },
      }));
      expect(refused.body).toEqual({
        at: 0,
        kind: 'claimWorkItem',
        error: 'resources_exhausted',
        ...shortages[0],
        resources: shortages,
      });
      absence(refused.body);
      expect(gate.reads.filter(([origin]) => origin.id === projectA)).toEqual([
        [
          { id: projectA, organizationId: 'org-a' },
          h.userId('ada'),
          expect.objectContaining({ kind: 'scoped' }),
        ],
      ]);
      gate.reads.length = 0;
      denied.add(projectB);
      denied.add(c);
      const noVisible = await h.call(
        'ada',
        'POST',
        `/api/projects/${projectB}/commands`,
        requested,
      );
      expect(noVisible).toEqual({
        status: 409,
        body: {
          at: 0,
          kind: 'claimWorkItem',
          error: 'resources_exhausted',
          ...shortages[0],
          holders: [],
          hiddenHolders: { units: 24 },
          resources: shortages.map((shortage) => ({
            ...shortage,
            holders: [],
            hiddenHolders: { units: 24 },
          })),
        },
      });
      absence(noVisible.body);
      expect({ journal: journalEntries(h), claims: claimRows() }).toEqual(before);
      const emptyCatalogReads = people.mock.calls.filter(([catalog]) => catalog === 'people');
      expect({ mixedCatalogReads, emptyCatalogReads }).toEqual({
        mixedCatalogReads: [],
        emptyCatalogReads: [],
      });
      expect(mixedNameReads).toEqual([['org-a', ['agent-b']]]);
      expect(scopedNames).not.toHaveBeenCalled();
    } finally {
      scopedNames.mockRestore();
      people.mockRestore();
      gate.restore();
    }
  });

  it('uses one live snapshot holder read per resource and one decision per actor and origin', async () => {
    const occupancy = spyOn(ClaimRepository.prototype, 'organizationOccupancyOf');
    const people = spyOn(DirectoryRepository.prototype, 'listInOrganization');
    try {
      expect((await h.call('vic', 'GET', `/api/projects/${projectB}/startable`)).status).toBe(200);
      expect(occupancy).not.toHaveBeenCalled();
      const second = await declare(h, 'ada', otherResource);
      const resourceIds = [ram, second].sort();
      await declareCapacity(resourceIds, 16);
      createHiddenCopies(resourceIds);
      distinctWorkItem('w-b-next', projectB, 1);
      await demand(projectB, 'w-b', [ram], 1);
      await demand(projectB, 'w-b-next', [second], 1);
      const denied = new Set([projectA]);
      const gate = denyOrigins(denied, h.userId('vic'));
      try {
        people.mockClear();
        const read = await h.call('vic', 'GET', `/api/projects/${projectB}/startable`);
        const emptyCatalogReads = people.mock.calls.filter(([catalog]) => catalog === 'people');
        expect(read).toMatchObject({
          status: 200,
          body: {
            occupancyScope: 'project',
            doesNotFit: [
              {
                workItemId: 'w-b',
                exhausted: {
                  resourceId: ram,
                  free: 0,
                  asked: 1,
                  scope: 'organization',
                  holders: [],
                  hiddenHolders: { units: 16 },
                },
              },
              {
                workItemId: 'w-b-next',
                exhausted: {
                  resourceId: second,
                  free: 0,
                  asked: 1,
                  scope: 'organization',
                  holders: [],
                  hiddenHolders: { units: 16 },
                },
              },
            ],
          },
        });
        absence(read.body);
        expect(occupancy.mock.calls).toEqual([[expect.arrayContaining(resourceIds)]]);
        expect(gate.reads.map(([origin, actor]) => [origin.id, actor])).toEqual([
          [projectA, h.userId('vic')],
        ]);
        denied.clear();
        people.mockClear();
        const next = await h.call('vic', 'GET', `/api/projects/${projectB}/startable`);
        const visibleHolder: unknown = expect.arrayContaining([
          expect.objectContaining({
            workItemId: hiddenLeaf,
            personId: hiddenPerson,
            runId: hiddenRun,
            projectId: projectA,
          }),
        ]);
        expect(next).toMatchObject({
          status: 200,
          body: {
            doesNotFit: [
              {
                exhausted: {
                  holders: visibleHolder,
                  hiddenHolders: { units: 0 },
                },
              },
              { exhausted: { hiddenHolders: { units: 0 } } },
            ],
          },
        });
        expect(gate.reads).toHaveLength(2);
        expect({
          emptyCatalogReads,
          visibleCatalogReads: people.mock.calls.filter(([catalog]) => catalog === 'people'),
        }).toEqual({
          emptyCatalogReads: [['people', 'org-a']],
          visibleCatalogReads: [['people', 'org-a']],
        });
      } finally {
        gate.restore();
      }
    } finally {
      people.mockRestore();
      occupancy.mockRestore();
    }
  });

  it('previews distinct denied projects including a zero-held origin with no writes', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    stageHolder('visible-b-claim', projectB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    const d = await create(h, 'ada', 'PRIVATE_ZERO_HELD_PROJECT');
    distinctWorkItem('w-zero', d, 0);
    await demand(d, 'w-zero', [ram], 2);
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${projectA}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 16 }],
        })
      ).status,
    ).toBe(200);
    const audits = auditRows(h);
    const journal = journalEntries(h);
    const denied = new Set([projectA, d]);
    const gate = denyOrigins(denied, h.userId('sue'));
    try {
      const preview = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(preview).toEqual({
        status: 200,
        body: {
          resourceId: ram,
          before: 24,
          after: 18,
          projects: [{ projectId: projectB, name: 'B', units: 4 }],
          hiddenProjects: { count: 2, units: 16 },
          free: -2,
          refusal: null,
        },
      });
      absence(preview.body, [d, 'PRIVATE_ZERO_HELD_PROJECT']);
      expect(gate.reads.map(([origin]) => origin.id).sort()).toEqual(
        [projectA, projectB, d].sort(),
      );
      expect(await h.call('sue', 'POST', previewPath(ram), { units: null })).toMatchObject({
        status: 200,
        body: { after: null, free: null, hiddenProjects: { count: 2, units: 16 } },
      });
      const otherActor = await h.call('tom', 'POST', previewPath(ram), { units: 18 });
      expect(otherActor).toMatchObject({
        status: 200,
        body: { hiddenProjects: { count: 0, units: 0 }, free: -2 },
      });
      expect(stated(h, ram)).toBe(24);
      expect(auditRows(h)).toEqual(audits);
      expect(journalEntries(h)).toBe(journal);
    } finally {
      gate.restore();
    }
  });

  it('keeps a capacity preview coherent when occupancy and demand change mid-read', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    stageHolder('visible-b-claim', projectB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    const d = await create(h, 'ada', 'PRIVATE_NEXT_SNAPSHOT');
    distinctWorkItem('w-next-snapshot', d, 0);
    const gate = denyOrigins(new Set([projectA, d]), h.userId('sue'));
    const descriptor = Object.getOwnPropertyDescriptor(
      DirectoryRepository.prototype,
      'usageOfResource',
    );
    if (typeof descriptor?.value !== 'function') throw new Error('missing resource usage method');
    const usage = descriptor.value as DirectoryRepository['usageOfResource'];
    let changed = false;
    const writer = spyOn(DirectoryRepository.prototype, 'usageOfResource').mockImplementation(
      function (
        this: DirectoryRepository,
        ...args: Parameters<DirectoryRepository['usageOfResource']>
      ) {
        if (!changed) {
          changed = true;
          h.sqlite.transaction(() => {
            h.sqlite.run('DELETE FROM claim WHERE id IN (?, ?)', [
              hiddenClaim,
              'private-origin-copy',
            ]);
            h.sqlite.run(
              'INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES (?, ?, 2)',
              ['w-next-snapshot', ram],
            );
          })();
        }
        return usage.apply(this, args);
      },
    );
    try {
      const earlier = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(earlier).toMatchObject({
        status: 200,
        body: { hiddenProjects: { count: 1, units: 16 }, free: -2 },
      });
      const later = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(later).toMatchObject({
        status: 200,
        body: { hiddenProjects: { count: 1, units: 0 }, free: 14 },
      });
      absence(earlier.body, [d, 'PRIVATE_NEXT_SNAPSHOT']);
      absence(later.body, [d, 'PRIVATE_NEXT_SNAPSHOT']);
    } finally {
      writer.mockRestore();
      gate.restore();
    }
  });

  it('reports only this project when a local capacity binds on a shared resource', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    distinctWorkItem('w-local-holder', projectB, 1);
    stageHolder('visible-bound-local', projectB, 'w-local-holder', 'agent-b', 0, null, 4, [ram]);
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${projectB}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 4 }],
        })
      ).status,
    ).toBe(200);
    await demand(projectB, 'w-b', [ram], 1);
    const gate = denyOrigins(new Set([projectA]), h.userId('vic'));
    try {
      const read = await h.call('vic', 'GET', `/api/projects/${projectB}/startable`);
      expect(read).toMatchObject({
        status: 200,
        body: {
          doesNotFit: [
            {
              workItemId: 'w-b',
              exhausted: {
                scope: 'project',
                free: 0,
                asked: 1,
                hiddenHolders: { units: 0 },
                holders: [
                  {
                    personId: 'agent-b',
                    name: 'agent-b',
                    workItemId: 'w-local-holder',
                    runId: null,
                  },
                ],
              },
            },
          ],
        },
      });
      expect(JSON.stringify(read.body)).not.toContain('projectId');
      expect(gate.reads.map(([origin]) => origin.id)).toEqual([projectB]);
      absence(read.body);
    } finally {
      gate.restore();
    }
  });

  it('a project read exception aborts the entire shared shortage observation', async () => {
    await declareCapacity([ram], 16);
    createHiddenCopies([ram]);
    await demand(projectB, 'w-b', [ram], 1);
    const policy = spyOn(ProjectRepository.prototype, 'mayReadProjectWithin').mockRejectedValue(
      new Error('private grant failure'),
    );
    try {
      const answer = await h.call('vic', 'GET', `/api/projects/${projectB}/startable`);
      expect(answer.status).toBe(500);
      absence(answer.body, ['private grant failure']);
      expect(JSON.stringify(answer.body)).not.toContain('hiddenHolders');

      const preview = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(preview.status).toBe(500);
      absence(preview.body, ['private grant failure', 'hiddenProjects', 'private-origin-person']);
      expect(stated(h, ram)).toBe(16);
    } finally {
      policy.mockRestore();
    }
  });
});

describe('the admin occupancy inventory', () => {
  const path = (resourceId: string) => `/api/organization/resources/${resourceId}/occupancy`;
  const holder = 'human-holder';
  const claim = {
    kind: 'claimWorkItem',
    workItemId: 'w-b',
    personId: 'agent-b',
  };

  function batch(username: string, projectId: string, commands: unknown[]) {
    return h.call(username, 'POST', `/api/projects/${projectId}/commands`, { commands });
  }

  async function stageHuman(restricted: boolean) {
    h.sqlite.run('INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, ?, ?)', [
      holder,
      'Global Name',
      'person',
      h.userId('vic'),
    ]);
    h.sqlite.run(
      'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
      [holder, 'org-a', 'Organization Alias'],
    );
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] })).toMatchObject({
      status: 200,
    });
    for (const [projectId, workItemId] of [
      [projectA, 'w-a'],
      [projectB, 'w-b'],
    ] as const) {
      expect(
        await batch('ada', projectId, [
          { kind: 'setDemand', workItemId, resourceId: ram, units: 16 },
        ]),
      ).toMatchObject({ status: 200 });
    }
    expect(
      await batch('sue', projectA, [
        {
          kind: 'claimWorkItem',
          workItemId: 'w-a',
          personId: holder,
          steps: [firstStepOf(projectA)],
        },
      ]),
    ).toMatchObject({ status: 200 });
    if (restricted) {
      expect(
        await h.call('ada', 'PATCH', `/api/projects/${projectA}`, { restricted: true }),
      ).toMatchObject({
        status: 200,
      });
    }
  }

  function ledger() {
    return {
      claims: h.sqlite.query('SELECT * FROM claim ORDER BY id').all(),
      occupancy: h.sqlite
        .query('SELECT * FROM claim_occupancy ORDER BY claim_id, resource_id')
        .all(),
      audits: h.sqlite.query('SELECT * FROM organization_audit ORDER BY rowid').all(),
      journal: h.sqlite.query('SELECT * FROM command_journal ORDER BY rowid').all(),
      capacity: stated(h, ram),
    };
  }

  for (const restricted of [false, true]) {
    it(`reads ${restricted ? 'a restricted' : 'an unrestricted'} human claim and observes the actual release decision`, async () => {
      await stageHuman(restricted);
      const ask = { ...claim, steps: [firstStepOf(projectB)] };
      expect(await batch('ada', projectB, [ask])).toMatchObject({
        status: 409,
        body: { error: 'resources_exhausted' },
      });
      const initial = ledger();
      const stamp = h.sqlite
        .query<{ id: string; created_at: number }, [string]>(
          'SELECT id, created_at FROM claim WHERE person_id = ?',
        )
        .get(holder);
      if (stamp === null) throw new Error('the human claim was not stored');
      const read = await h.call('sue', 'GET', path(ram));
      expect(read).toEqual({
        status: 200,
        body: {
          resourceId: ram,
          directoryCapacity: 16,
          occupied: 16,
          free: 0,
          projects: [
            {
              projectId: projectA,
              name: 'A',
              restricted,
              units: 16,
              claims: [
                {
                  claimId: stamp.id,
                  personId: holder,
                  personName: 'Organization Alias',
                  runId: null,
                  workItemId: 'w-a',
                  claimedAt: stamp.created_at,
                  leaseExpiresAt: null,
                  releasableBy: restricted ? 'claimant' : 'claimant_or_admin',
                },
              ],
            },
          ],
        },
      });
      expect(await h.call('tom', 'GET', path(ram))).toEqual(read);
      expect(ledger()).toEqual(initial);
      const release = await batch('sue', projectA, [
        { kind: 'releaseWorkItem', workItemId: 'w-a', personId: holder },
      ]);
      if (restricted) {
        expect(release).toMatchObject({ status: 403, body: { error: 'forbidden' } });
        expect(ledger()).toEqual(initial);
        expect(await h.call('sue', 'GET', path(ram))).toEqual(read);
      } else {
        expect(release).toMatchObject({ status: 200 });
        expect(await h.call('sue', 'GET', path(ram))).toEqual({
          status: 200,
          body: { resourceId: ram, directoryCapacity: 16, occupied: 0, free: 16, projects: [] },
        });
        expect(await batch('ada', projectB, [ask])).toMatchObject({ status: 200 });
      }
    });
  }
});

describe('occupancy inventory authority and observation', () => {
  const path = (resourceId = ram) => `/api/organization/resources/${resourceId}/occupancy`;
  const visiblePerson = 'visible-inventory-person';
  const hiddenPerson = 'private-inventory-person';
  const hiddenProject = 'PRIVATE_INVENTORY_PROJECT';
  const hiddenName = 'PRIVATE_INVENTORY_ALIAS';
  const reserved = 'private-inventory-claim';
  const lease = 123457891;
  const claimedAt = 987654321;

  async function stateCapacity(units: number | null) {
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, units)] })).toMatchObject(
      {
        status: 200,
      },
    );
  }

  function inventoryStep(projectId: string, position: number): string {
    const step = h.sqlite
      .query<{ id: string }, [string, number]>(
        'SELECT id FROM step WHERE project_id = ? ORDER BY position,id LIMIT 1 OFFSET ?',
      )
      .get(projectId, position);
    if (step === null) throw new Error('inventory fixture step is absent');
    return step.id;
  }

  function addHolder(
    id: string,
    projectId: string,
    workItemId: string,
    personId: string,
    units: number,
    options: { step?: number; run?: string; at?: number; expires?: number } = {},
  ) {
    const stepId = inventoryStep(projectId, options.step ?? 0);
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, created_at, created_by, lease_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        workItemId,
        stepId,
        personId,
        options.run ?? null,
        options.at ?? 11,
        h.userId('ada'),
        options.expires ?? null,
      ],
    );
    h.sqlite.run('INSERT INTO claim_occupancy (claim_id, resource_id, units) VALUES (?, ?, ?)', [
      id,
      ram,
      units,
    ]);
  }

  function addPeople() {
    addAgentPerson(h.sqlite, hiddenPerson, 'org-a', h.userId('ada'));
    addAgentPerson(h.sqlite, visiblePerson, 'org-a', h.userId('ada'));
    h.sqlite.run('UPDATE person SET name = ? WHERE id = ?', ['GLOBAL_WRONG_NAME', visiblePerson]);
    h.sqlite.run('UPDATE person_organization SET name = ? WHERE resource_id = ?', [
      'Visible Alias',
      visiblePerson,
    ]);
    h.sqlite.run('UPDATE person_organization SET name = ? WHERE resource_id = ?', [
      hiddenName,
      hiddenPerson,
    ]);
    h.sqlite.run('UPDATE project SET name = ? WHERE id = ?', [hiddenProject, projectA]);
  }

  function readPrototypeMethod<Owner extends object, Method extends keyof Owner>(
    prototype: Owner,
    method: Method,
  ): Owner[Method] {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    if (typeof descriptor?.value !== 'function')
      throw new Error('fixture prototype lacks ' + String(method));
    return descriptor.value as Owner[Method];
  }

  function beforeContent() {
    return spyOn(DirectoryRepository.prototype, 'listInOrganization');
  }

  it('refuses unsigned, removed and stale callers before opening content', async () => {
    const read = beforeContent();
    try {
      const noAuth = await h.request(path());
      expect(noAuth.status).toBe(401);
      expect(await noAuth.json()).toEqual({ error: 'unauthenticated' });
      expect(
        await h.callWith(h.token('sue'), 'GET', path(), undefined, {
          'X-WBS-Expected-Organization': 'org-b',
        }),
      ).toEqual({ status: 409, body: { error: 'organization_context_changed' } });
      h.sqlite.run(
        'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
        ['org-a', h.userId('sue')],
      );
      expect(await h.call('sue', 'GET', path())).toEqual({
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('refuses an unselected or legacy session before opening resource content', async () => {
    h.close();
    h = OrganizationHarness.openComposedWith({});
    await h.register('unselected');
    const requested = path('unselected-resource');
    const observation = spyOn(WorkItemService.prototype, 'readResourceOccupancyWithin');
    const refused = { status: 403, body: { error: 'no_active_organization' } };
    const content = beforeContent();
    try {
      expect(await h.call('unselected', 'GET', requested)).toEqual(refused);
      h.organization('org-a');
      h.member('org-a', 'unselected', 'admin');
      h.activate();
      expect(await h.call('unselected', 'GET', requested)).toEqual(refused);
      expect(content).not.toHaveBeenCalled();
      expect(observation).not.toHaveBeenCalled();
    } finally {
      content.mockRestore();
      observation.mockRestore();
    }
  });

  it('refuses members, viewers and admin machine keys before distinguishing resources', async () => {
    addPeople();
    addHolder(reserved, projectA, 'w-a', hiddenPerson, 16);
    const read = beforeContent();
    try {
      addAgentPerson(h.sqlite, 'inventory-agent', 'org-a', h.userId('sue'));
      const { key } = await issueApiKey(h.sqlite, {
        organizationId: 'org-a',
        personId: 'inventory-agent',
        issuedBy: h.userId('sue'),
      });
      const refused = { status: 403, body: { error: 'forbidden' } };
      for (const requested of [path(), path('absent-resource')]) {
        expect(await h.call('ada', 'GET', requested)).toEqual(refused);
        expect(await h.call('vic', 'GET', requested)).toEqual(refused);
        expect(await callForwarded(h, key, 'GET', requested)).toEqual(refused);
        expect(await h.callWith(key, 'GET', requested)).toEqual({
          status: 401,
          body: { error: 'machine_bearer_not_accepted', endpoint: '/mcp' },
        });
      }
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('admits an admin’s own MCP session and refuses the same account’s agent consent', async () => {
    h.close();
    const signing = await generateKeyPair('RS256');
    h = OrganizationHarness.openComposedWith({ delegationKey: signing.publicKey });
    await setUp(h);
    mapUpstream(h, 'sue', 'sub-inventory-sue');
    addAgentPerson(h.sqlite, 'inventory-consent-person', 'org-a', h.userId('sue'));
    const credentialId = crypto.randomUUID();
    h.sqlite.run(
      `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, mcp_family_id, created_at, created_by)
       VALUES (?, 'org-a', 'inventory-consent-person', ?, 'mcp_consent', 'consent', 'family-1', 1, ?)`,
      [credentialId, h.userId('sue'), h.userId('sue')],
    );
    const own = await delegationFor(h, signing.privateKey, 'sue', 'org-a', 'sub-inventory-sue');
    expect(await h.callWith(own, 'GET', path())).toEqual({
      status: 200,
      body: { resourceId: ram, directoryCapacity: null, occupied: 0, free: null, projects: [] },
    });
    const consent = await delegationFor(
      h,
      signing.privateKey,
      'sue',
      'org-a',
      'sub-inventory-sue',
      {
        credentialId,
        personId: 'inventory-consent-person',
      },
    );
    const read = beforeContent();
    try {
      expect(await h.callWith(consent, 'GET', path())).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('answers foreign and absent resources alike and admits genuine zero capacity', async () => {
    const absent = { status: 404, body: { error: 'not_found' } };
    expect(await h.call('grace', 'GET', path())).toEqual(absent);
    expect(await h.call('grace', 'GET', path('absent-resource'))).toEqual(absent);
    await stateCapacity(0);
    expect(await h.call('sue', 'GET', path())).toEqual({
      status: 200,
      body: { resourceId: ram, directoryCapacity: 0, occupied: 0, free: 0, projects: [] },
    });
  });

  it('counts the largest copy per leaf and retains every claim with its actual stamp', async () => {
    await stateCapacity(16);
    addPeople();
    addHolder('shared-1', projectA, 'w-a', visiblePerson, 16, { at: 101, expires: lease });
    addHolder('shared-2', projectA, 'w-a', visiblePerson, 12, {
      step: 1,
      at: 102,
      expires: lease + 1,
    });
    addHolder('shared-3', projectB, 'w-b', visiblePerson, 4, { at: 103 });
    const initial = await h.call('sue', 'GET', path());
    expect(initial).toMatchObject({ status: 200, body: { occupied: 20, free: -4 } });
    const body = initial.body as {
      projects: { projectId: string; units: number; claims: unknown[] }[];
    };
    expect(body.projects.map(({ projectId }) => projectId)).toEqual([projectA, projectB].sort());
    expect(body.projects.find(({ projectId }) => projectId === projectA)).toMatchObject({
      units: 16,
      claims: [
        {
          claimId: 'shared-1',
          personId: visiblePerson,
          personName: 'Visible Alias',
          runId: null,
          claimedAt: 101,
          leaseExpiresAt: lease,
        },
        {
          claimId: 'shared-2',
          personId: visiblePerson,
          personName: 'Visible Alias',
          runId: null,
          claimedAt: 102,
          leaseExpiresAt: lease + 1,
        },
      ],
    });
    expect(body.projects.find(({ projectId }) => projectId === projectB)).toMatchObject({
      units: 4,
      claims: [{ claimId: 'shared-3', runId: null, claimedAt: 103, leaseExpiresAt: null }],
    });
    const release = (position: number) =>
      h.call('sue', 'POST', `/api/projects/${projectA}/commands`, {
        commands: [
          {
            kind: 'releaseWorkItem',
            workItemId: 'w-a',
            personId: visiblePerson,
            steps: [inventoryStep(projectA, position)],
          },
        ],
      });
    expect(await release(1)).toMatchObject({ status: 200 });
    expect(await h.call('sue', 'GET', path())).toMatchObject({
      status: 200,
      body: { occupied: 20, free: -4 },
    });
    expect(await release(0)).toMatchObject({ status: 200 });
    expect(await h.call('sue', 'GET', path())).toMatchObject({
      status: 200,
      body: { occupied: 4, free: 12, projects: [{ projectId: projectB }] },
    });
  });

  it('omits every hidden identity and resolves only visible ids across capacity states', async () => {
    await stateCapacity(24);
    addPeople();
    addHolder(reserved, projectA, 'w-a', hiddenPerson, 16, {
      run: 'private-inventory-run',
      at: claimedAt,
      expires: lease,
    });
    addHolder('open-inventory-claim', projectB, 'w-b', visiblePerson, 4);
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      ['unasked-claim', 'w-b', inventoryStep(projectB, 1), hiddenPerson, null, h.userId('ada')],
    );
    const stamped = spyOn(ClaimRepository.prototype, 'listStampedByIds');
    const names = spyOn(DirectoryRepository.prototype, 'personNamesInOrganization');
    const checked: string[] = [];
    const decide = spyOn(ProjectRepository.prototype, 'mayReadProjectWithin');
    let denied = new Set([projectA]);
    decide.mockImplementation((project) => {
      checked.push(project.id);
      return Promise.resolve(!denied.has(project.id));
    });
    try {
      const content = await h.call('sue', 'GET', path());
      expect(content).toEqual({
        status: 200,
        body: {
          resourceId: ram,
          directoryCapacity: 24,
          occupied: 20,
          free: 4,
          projects: [
            {
              projectId: projectB,
              name: 'B',
              restricted: false,
              units: 4,
              claims: [
                {
                  claimId: 'open-inventory-claim',
                  personId: visiblePerson,
                  personName: 'Visible Alias',
                  runId: null,
                  workItemId: 'w-b',
                  claimedAt: 11,
                  leaseExpiresAt: null,
                  releasableBy: 'claimant_or_admin',
                },
              ],
            },
          ],
        },
      });
      const body = JSON.stringify(content.body);
      for (const secret of [
        projectA,
        hiddenProject,
        reserved,
        hiddenPerson,
        hiddenName,
        'w-a',
        'private-inventory-run',
        String(claimedAt),
        String(lease),
        'hiddenProjects',
      ])
        expect(body).not.toContain(secret);
      expect(checked.sort()).toEqual([projectA, projectB].sort());
      expect(stamped.mock.calls).toEqual([[projectB, ['open-inventory-claim']]]);
      expect(names.mock.calls).toEqual([['org-a', [visiblePerson]]]);
      stamped.mockClear();
      names.mockClear();
      denied = new Set([projectA, projectB]);
      expect(await h.call('sue', 'GET', path())).toEqual({
        status: 200,
        body: { resourceId: ram, directoryCapacity: 24, occupied: 20, free: 4, projects: [] },
      });
      expect(stamped).not.toHaveBeenCalled();
      expect(names).not.toHaveBeenCalled();
      await stateCapacity(null);
      denied = new Set([projectA]);
      expect(await h.call('sue', 'GET', path())).toMatchObject({
        status: 200,
        body: {
          directoryCapacity: null,
          occupied: 4,
          free: null,
          projects: [{ projectId: projectB }],
        },
      });
      denied = new Set();
      expect(await h.call('sue', 'GET', path())).toMatchObject({
        status: 200,
        body: { directoryCapacity: null, occupied: 20, free: null },
      });
    } finally {
      decide.mockRestore();
      stamped.mockRestore();
      names.mockRestore();
    }
  });

  it('refuses a demotion or membership removal after route admission before reading content', async () => {
    const original = readPrototypeMethod(SqliteOrganizationAccess.prototype, 'resolve');
    const resolver = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
    const content = beforeContent();
    try {
      for (const change of ['demote', 'remove'] as const) {
        resolver.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
          const admitted = await original.call(this, principal);
          if (
            admitted.ok &&
            admitted.access.kind === 'scoped' &&
            principal.id === h.userId('sue')
          ) {
            expect(admitted.access.scope.role).toBe('admin');
            if (change === 'demote') {
              h.sqlite.run(
                "UPDATE organization_membership SET role = 'member' WHERE organization_id = ? AND user_id = ?",
                ['org-a', principal.id],
              );
            } else {
              h.sqlite.run(
                'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
                ['org-a', principal.id],
              );
            }
          }
          return admitted;
        });
        expect(await h.call('sue', 'GET', path())).toEqual({
          status: 403,
          body: { error: change === 'demote' ? 'forbidden' : 'not_a_member' },
        });
        expect(content).not.toHaveBeenCalled();
        if (change === 'demote')
          h.sqlite.run(
            "UPDATE organization_membership SET role = 'admin' WHERE organization_id = ? AND user_id = ?",
            ['org-a', h.userId('sue')],
          );
      }
    } finally {
      resolver.mockRestore();
      content.mockRestore();
    }
  });

  it('keeps stamps, names, role and units coherent across a mid-read release', async () => {
    await stateCapacity(16);
    addPeople();
    addHolder('old-inventory-claim', projectA, 'w-a', visiblePerson, 16, { at: 19 });
    const original = readPrototypeMethod(ProjectRepository.prototype, 'mayReadProjectWithin');
    let changed = false;
    const writer = spyOn(ProjectRepository.prototype, 'mayReadProjectWithin').mockImplementation(
      async function (this: ProjectRepository, ...args: Parameters<typeof original>) {
        if (!changed) {
          changed = true;
          expect(
            await h.call('sue', 'POST', `/api/projects/${projectA}/commands`, {
              commands: [{ kind: 'releaseWorkItem', workItemId: 'w-a', personId: visiblePerson }],
            }),
          ).toMatchObject({ status: 200 });
          h.sqlite.run('UPDATE person_organization SET name = ? WHERE resource_id = ?', [
            'Next Alias',
            visiblePerson,
          ]);
          h.sqlite.run(
            'UPDATE organization_membership SET role = ? WHERE organization_id = ? AND user_id = ?',
            ['member', 'org-a', h.userId('sue')],
          );
        }
        return original.apply(this, args);
      },
    );
    try {
      expect(await h.call('sue', 'GET', path())).toMatchObject({
        status: 200,
        body: {
          occupied: 16,
          free: 0,
          projects: [
            {
              claims: [
                { claimId: 'old-inventory-claim', personName: 'Visible Alias', claimedAt: 19 },
              ],
            },
          ],
        },
      });
      expect(await h.call('sue', 'GET', path())).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
      expect(await h.call('tom', 'GET', path())).toEqual({
        status: 200,
        body: { resourceId: ram, directoryCapacity: 16, occupied: 0, free: 16, projects: [] },
      });
    } finally {
      writer.mockRestore();
    }
  });

  it('fails closed on contradictory holding rows and unpaired stamps', async () => {
    addPeople();
    addHolder('conflicting-inventory-claim', projectA, 'w-a', visiblePerson, 7);
    const read = readPrototypeMethod(ClaimRepository.prototype, 'organizationOccupancyOf');
    const rows = spyOn(ClaimRepository.prototype, 'organizationOccupancyOf').mockImplementation(
      async function (this: ClaimRepository, ids) {
        const holdings = await read.call(this, ids);
        const first = holdings.at(0);
        if (first === undefined) throw new Error('contradictory holding fixture is absent');
        return [...holdings, { ...first, personId: hiddenPerson }];
      },
    );
    try {
      expect(await h.call('sue', 'GET', path())).toMatchObject({ status: 500 });
      rows.mockImplementation(async function (this: ClaimRepository, ids) {
        return (await read.call(this, ids)).map((row) => ({ ...row, organizationId: 'org-b' }));
      });
      expect(await h.call('sue', 'GET', path())).toMatchObject({ status: 500 });
    } finally {
      rows.mockRestore();
    }
    const stampRead = readPrototypeMethod(ClaimRepository.prototype, 'listStampedByIds');
    const stamps = spyOn(ClaimRepository.prototype, 'listStampedByIds').mockImplementation(
      async function (this: ClaimRepository, projectId, ids) {
        const holdings = await stampRead.call(this, projectId, ids);
        return [...holdings, ...holdings];
      },
    );
    try {
      expect(await h.call('sue', 'GET', path())).toMatchObject({ status: 500 });
    } finally {
      stamps.mockRestore();
    }
  });

  it('fails closed for a missing owner, name or stamp, a corrupt stamp, or an unreadable dependency', async () => {
    addPeople();
    addHolder('broken-inventory-claim', projectA, 'w-a', visiblePerson, 7, { at: 17 });
    const failsClosed = async () => {
      const response = await h.call('sue', 'GET', path());
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('broken-inventory-claim');
      expect(JSON.stringify(response.body)).not.toContain('Visible Alias');
      expect(JSON.stringify(response.body)).not.toContain('private read failure');
    };
    const owner = spyOn(ProjectRepository.prototype, 'findInOrganization').mockResolvedValue(null);
    try {
      await failsClosed();
    } finally {
      owner.mockRestore();
    }
    const stamps = spyOn(ClaimRepository.prototype, 'listStampedByIds').mockResolvedValue([]);
    try {
      await failsClosed();
    } finally {
      stamps.mockRestore();
    }
    h.sqlite.run("UPDATE claim SET created_at = 'bad stamp' WHERE id = 'broken-inventory-claim'");
    await failsClosed();
    h.sqlite.run("UPDATE claim SET created_at = 17 WHERE id = 'broken-inventory-claim'");
    const grants = spyOn(ProjectRepository.prototype, 'mayReadProjectWithin').mockRejectedValue(
      new Error('private read failure'),
    );
    try {
      await failsClosed();
    } finally {
      grants.mockRestore();
    }
    const names = spyOn(
      DirectoryRepository.prototype,
      'personNamesInOrganization',
    ).mockRejectedValue(new Error('private read failure'));
    try {
      await failsClosed();
    } finally {
      names.mockRestore();
    }
    const missingName = spyOn(
      DirectoryRepository.prototype,
      'personNamesInOrganization',
    ).mockResolvedValue([]);
    try {
      await failsClosed();
    } finally {
      missingName.mockRestore();
    }
  });
});
