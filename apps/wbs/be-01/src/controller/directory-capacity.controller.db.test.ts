import { validateSchema } from '@wbs/contracts';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { ClaimRepository } from '@wbs/store-sqlite/claim';
import { DirectoryRepository } from '@wbs/store-sqlite/directory';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { WorkPackageRepository } from '@wbs/store-sqlite/work-package';
import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { generateKeyPair } from 'jose';

import { bindDevQaFixture } from '../testing/dev-qa-fixture';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';
import { preSharingStartable } from '../testing/pre-sharing-startable';
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
let projectId: string;
let workPackageA: string;
let workPackageB: string;
let ram: string;
const stepsByPackage = new Map<string, readonly { id: string }[]>();

function readPrototypeMethod<Owner extends object, Method extends keyof Owner>(
  prototype: Owner,
  method: Method,
): Owner[Method] {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  if (typeof descriptor?.value !== 'function')
    throw new Error('fixture prototype lacks ' + String(method));
  return descriptor.value as Owner[Method];
}

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
 * (super-admin); B with `grace`. Work packages A and B of A, each with one leaf
 * (`w-a`, `w-b`), agents `agent-a` and `agent-b` bound to ada, and the
 * resource `host ram` of A.
 */
async function setUp(harness: OrganizationHarness): Promise<void> {
  stepsByPackage.clear();
  for (const username of ['ada', 'vic', 'sue', 'tom', 'grace']) await harness.register(username);
  harness.organization('org-a');
  harness.organization('org-b');
  for (const [username, role] of [
    ['ada', 'member'],
    ['vic', 'viewer'],
    ['sue', 'admin'],
    ['tom', 'super_admin'],
  ] as const) {
    const grants = {
      member: [],
      viewer: [],
      admin: ['org-admin'],
      super_admin: ['org-super-admin'],
    } as const;
    harness.member('org-a', username, role, grants[role]);
    harness.bind(username, 'org-a');
  }
  harness.member('org-b', 'grace', 'admin', ['org-admin']);
  harness.bind('grace', 'org-b');
  harness.activate();
  // The creator receives a project-manager grant, so Sue's release authority stays organization-scoped.
  const parent = await harness.call('tom', 'POST', '/api/projects', { name: 'Capacity planning' });
  if (parent.status !== 201) throw new Error(`project creation refused: ${JSON.stringify(parent)}`);
  projectId = (parent.body as { project: { id: string } }).project.id;
  harness.grant('org-a', 'ada', 'project-contributor', 'project', projectId);
  harness.grant('org-a', 'vic', 'project-viewer', 'project', projectId);
  harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
  await harness.publicWrites().uow.run(async ({ stores }) => {
    await bindDevQaFixture(stores.stepCatalogue, 'org-a', projectId, {
      by: harness.userId('tom'),
      at: 1,
    });
    return { commit: true, value: undefined };
  });
  workPackageA = await create(harness, 'ada', 'A');
  workPackageB = await create(harness, 'ada', 'B');
  for (const [id, workPackageId] of [
    ['w-a', workPackageA],
    ['w-b', workPackageB],
  ] as const)
    harness.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES (?, ?, NULL, 0, ?)',
      [id, workPackageId, id],
    );
  for (const id of ['agent-a', 'agent-b'])
    addAgentPerson(harness.sqlite, id, 'org-a', harness.userId('ada'));
  ram = await declare(harness, 'sue', 'host ram');
}

async function create(harness: OrganizationHarness, username: string, name: string) {
  const answer = await harness.call(username, 'POST', '/api/work-packages', { name, projectId });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  const { workPackage, steps } = answer.body as {
    workPackage: { id: string };
    steps: { id: string }[];
  };
  expect(steps).toHaveLength(2);
  stepsByPackage.set(workPackage.id, steps);
  return workPackage.id;
}

function stepOf(workPackageId: string, position = 0): string {
  const step = stepsByPackage.get(workPackageId)?.at(position);
  if (step === undefined)
    throw new Error(`work package ${workPackageId} has no step at ${String(position)}`);
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

async function directoryCapacityRead(username: string, workPackageId: string) {
  const read = await h.call(username, 'GET', `/api/work-packages/${workPackageId}/resources`);
  if (read.status !== 200) throw new Error(`read refused: ${JSON.stringify(read)}`);
  return (read.body as { resources: { id: string; directoryCapacity?: number | null }[] }).resources
    .filter(({ id }) => id === ram)
    .map(({ directoryCapacity }) => directoryCapacity);
}

describe('setDirectoryCapacity', () => {
  it('states a directory capacity on either route and reads it from both work packages', async () => {
    expect(await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] })).toMatchObject({
      status: 200,
    });
    for (const workPackageId of [workPackageA, workPackageB])
      expect(await directoryCapacityRead('vic', workPackageId)).toEqual([16]);
    expect(
      await h.call('tom', 'POST', `/api/work-packages/${workPackageA}/commands`, {
        commands: [state(ram, null)],
      }),
    ).toMatchObject({ status: 200 });
    expect(await directoryCapacityRead('ada', workPackageB)).toEqual([null]);
    expect(stated(h, ram)).toBeNull();
  });

  it('serves the exact work package resource catalog with directory units to a viewer', async () => {
    const gpu = await declare(h, 'sue', 'idle GPU');
    expect(
      (await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16), state(gpu, 0)] }))
        .status,
    ).toBe(200);
    const path = `/api/work-packages/${workPackageB}/resources`;
    const read = () => h.call('vic', 'GET', path);
    const ramWire = {
      id: ram,
      name: 'host ram',
      kind: 'divisible',
      unitLabel: 'GB',
      providerId: null,
    };
    const gpuWire = {
      id: gpu,
      name: 'idle GPU',
      kind: 'divisible',
      unitLabel: 'GB',
      providerId: null,
      directoryCapacity: 0,
      directory: { capacity: 0, occupied: 0, free: 0 },
    };
    const withRam = (units: number | null, occupied: number) => ({
      status: 200,
      body: {
        resources: [
          {
            ...ramWire,
            directoryCapacity: units,
            directory:
              units === null ? null : { capacity: units, occupied, free: units - occupied },
          },
          gpuWire,
        ].sort((left, right) => left.name.localeCompare(right.name)),
        capacities: [],
        demands: [],
      },
    });
    expect(await read()).toEqual(withRam(16, 0));
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, null)] })).status).toBe(
      200,
    );
    expect(await read()).toEqual(withRam(null, 0));
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(gpu, null)] })).status).toBe(
      200,
    );
    const aggregate = spyOn(ClaimRepository.prototype, 'organizationUnitsOf');
    try {
      expect(await read()).toMatchObject({
        status: 200,
        body: {
          resources: [
            { id: ram, directoryCapacity: null, directory: null },
            { id: gpu, directoryCapacity: null, directory: null },
          ],
        },
      });
      expect(aggregate).not.toHaveBeenCalled();
    } finally {
      aggregate.mockRestore();
    }
  });

  it('keeps the wire startable response parseable at the pre-sharing boundary', async () => {
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] })).status).toBe(
      200,
    );
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageB}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 12 }],
        })
      ).status,
    ).toBe(200);
    const read = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`);
    expect(read).toMatchObject({
      status: 200,
      body: {
        occupancyScope: 'work_package',
        resources: [
          {
            resourceId: ram,
            capacity: 12,
            occupied: 0,
            free: 12,
            occupancyScope: 'organization',
            directory: { capacity: 16, occupied: 0, free: 16 },
          },
        ],
      },
    });
    // The archived schema predates the work-package rename as well as directory totals.
    const previousWire = { ...(read.body as object), occupancyScope: 'project' };
    const parsed: unknown = await validateSchema(preSharingStartable, previousWire);
    expect(parsed).toEqual({ value: previousWire });
    const incompatible = { ...(read.body as object), occupancyScope: 'organization' };
    expect(await validateSchema(preSharingStartable, incompatible)).not.toEqual({
      value: incompatible,
    });
  });

  it('rechecks viewer membership after route admission before listing resources', async () => {
    const original = readPrototypeMethod(SqliteOrganizationAccess.prototype, 'resolve');
    const resolve = spyOn(SqliteOrganizationAccess.prototype, 'resolve').mockImplementation(
      async function (this: SqliteOrganizationAccess, principal) {
        const admitted = await original.call(this, principal);
        if (admitted.ok && principal.id === h.userId('vic'))
          h.sqlite.run(
            'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
            ['org-a', principal.id],
          );
        return admitted;
      },
    );
    const catalog = spyOn(DirectoryRepository.prototype, 'listInOrganization');
    try {
      expect(await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/resources`)).toEqual({
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect(catalog).not.toHaveBeenCalled();
    } finally {
      catalog.mockRestore();
      resolve.mockRestore();
    }
  });

  it('refuses a member and a viewer on either route, writing nothing', async () => {
    for (const path of [DIRECTORY, `/api/work-packages/${workPackageA}/commands`]) {
      expect(await h.call('ada', 'POST', path, { commands: [state(ram, 16)] }), path).toMatchObject(
        {
          status: 403,
          body: { error: 'forbidden' },
        },
      );
      expect(await h.call('vic', 'POST', path, { commands: [state(ram, 16)] }), path).toMatchObject(
        {
          status: 403,
          body: { error: 'forbidden' },
        },
      );
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
    for (const path of [DIRECTORY, `/api/work-packages/${workPackageA}/commands`]) {
      const commands = { commands: [state(ram, 16)] };
      expect(await callForwarded(h, key, 'POST', path, commands), path).toMatchObject({
        status: 403,
        body: { error: 'forbidden' },
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
    await h.call('sue', 'POST', `/api/work-packages/${workPackageA}/commands`, {
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
    for (const path of [DIRECTORY, `/api/work-packages/${workPackageA}/commands`]) {
      const consent = await delegationFor(h, signing.privateKey, 'sue', 'org-a', 'sub-sue', {
        credentialId,
        personId: 'sue-agent',
      });
      expect(
        await h.callWith(consent, 'POST', path, { commands: [state(ram, 16)] }),
        path,
      ).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    }
    expect(stated(h, ram)).toBeNull();
  });
});

describe('previewing and lowering a directory capacity', () => {
  /** A leaf of each work package demanding `units`, claimed by its agent through ada's session. */
  async function hold(units: readonly [number, number]): Promise<void> {
    for (const [index, workPackageId] of [workPackageA, workPackageB].entries()) {
      const workItemId = index === 0 ? 'w-a' : 'w-b';
      const answer: Answer = await h.call(
        'ada',
        'POST',
        `/api/work-packages/${workPackageId}/commands`,
        {
          commands: [
            { kind: 'setDemand', workItemId, resourceId: ram, units: units[index] },
            {
              kind: 'claimWorkItem',
              workItemId,
              personId: index === 0 ? 'agent-a' : 'agent-b',
              steps: [stepOf(workPackageId)],
            },
          ],
        },
      );
      if (answer.status !== 200)
        throw new Error(`the claim was refused: ${JSON.stringify(answer)}`);
    }
  }

  function capRam(): void {
    h.sqlite.run(
      'INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES (?, 50, 200, 64, 1)',
      ['org-a'],
    );
  }

  function readEffects() {
    return {
      audits: auditRows(h),
      journal: journalEntries(h),
      events: h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all(),
      capacities: h.sqlite
        .query('SELECT * FROM work_package_resource_capacity ORDER BY work_package_id, resource_id')
        .all(),
      claims: h.sqlite.query('SELECT * FROM claim ORDER BY id').all(),
    };
  }

  it('refuses an above-cap ask on both routes even with confirmation', async () => {
    capRam();
    const other = await declare(h, 'sue', 'other RAM');
    const detail = { error: 'capacity_limit', resourceId: ram, cap: 64, declared: 0, asked: 65 };
    const before = readEffects();
    for (const path of [DIRECTORY, `/api/work-packages/${workPackageA}/commands`]) {
      expect(
        await h.call('sue', 'POST', path, {
          commands: [state(other, 64), { ...state(ram, 65), confirm: true }],
        }),
      ).toEqual({ status: 409, body: { at: 1, kind: 'setDirectoryCapacity', ...detail } });
    }
    expect(stated(h, ram)).toBeNull();
    expect(stated(h, other)).toBeNull();
    expect(readEffects()).toEqual(before);
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 64)] })).status).toBe(
      200,
    );
    expect(stated(h, ram)).toBe(64);
  });

  it('previews an above-cap directory statement without writing', async () => {
    capRam();
    const detail = { error: 'capacity_limit', resourceId: ram, cap: 64, declared: 0, asked: 65 };
    const before = readEffects();
    expect(await h.call('sue', 'POST', previewPath(ram), { units: 65 })).toMatchObject({
      status: 200,
      body: { before: null, after: 65, refusal: detail },
    });
    expect(stated(h, ram)).toBeNull();
    expect(readEffects()).toEqual(before);
  });

  it('predicts a clear from the whole raw work package sum and clears only with confirmation', async () => {
    capRam();
    const third = await create(h, 'ada', 'Third');
    const other = await declare(h, 'sue', 'other RAM');
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] })).status).toBe(
      200,
    );
    for (const workPackageId of [workPackageA, workPackageB, third]) {
      h.sqlite.run(
        'INSERT INTO work_package_resource_capacity (work_package_id, resource_id, units) VALUES (?, ?, 32)',
        [workPackageId, ram],
      );
    }
    await hold([8, 6]);
    const before = readEffects();
    const detail = { error: 'capacity_limit', resourceId: ram, cap: 64, declared: 96, asked: 0 };
    expect(await h.call('sue', 'POST', previewPath(ram), { units: null })).toMatchObject({
      status: 200,
      body: { before: 16, after: null, free: null, refusal: detail },
    });
    for (const path of [DIRECTORY, `/api/work-packages/${workPackageA}/commands`]) {
      expect(
        await h.call('sue', 'POST', path, { commands: [state(other, 8), state(ram, null)] }),
      ).toEqual({ status: 409, body: { at: 1, kind: 'setDirectoryCapacity', ...detail } });
    }
    expect(
      await h.call('ada', 'POST', DIRECTORY, {
        commands: [{ ...state(ram, null), confirm: true }],
      }),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_directory' },
    });
    expect(readEffects()).toEqual(before);
    expect(stated(h, ram)).toBe(16);
    expect(stated(h, other)).toBeNull();

    expect(
      (
        await h.call('sue', 'POST', DIRECTORY, {
          commands: [{ ...state(ram, null), confirm: true }],
        })
      ).status,
    ).toBe(200);
    expect(stated(h, ram)).toBeNull();
    const after = readEffects();
    expect(after.capacities).toEqual(before.capacities);
    expect(after.claims).toEqual(before.claims);
    expect(after.journal).toBe(before.journal);
    expect(after.audits.map(({ detail }): unknown => JSON.parse(detail))).toEqual([
      { before: null, after: 16 },
      { before: 16, after: null },
    ]);
    expect(after.events.length).toBe(before.events.length + 3);
    expect(
      await h.call('ada', 'POST', `/api/work-packages/${workPackageA}/commands`, {
        commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 33 }],
      }),
    ).toEqual({
      status: 409,
      body: { at: 0, kind: 'setResourceCapacity', ...detail, declared: 64, asked: 33 },
    });
  });

  it('does not require confirmation for an already unstated directory capacity', async () => {
    capRam();
    for (const workPackageId of [workPackageA, workPackageB])
      h.sqlite.run(
        'INSERT INTO work_package_resource_capacity (work_package_id, resource_id, units) VALUES (?, ?, 48)',
        [workPackageId, ram],
      );
    expect(await h.call('sue', 'POST', previewPath(ram), { units: null })).toMatchObject({
      status: 200,
      body: { before: null, after: null, refusal: null },
    });
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, null)] })).status).toBe(
      200,
    );
    expect(stated(h, ram)).toBeNull();
  });

  it('reads a staged work package increase before clearing a stated zero', async () => {
    capRam();
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 0)] })).status).toBe(
      200,
    );
    h.sqlite.run(
      'INSERT INTO work_package_resource_capacity (work_package_id, resource_id, units) VALUES (?, ?, 64)',
      [workPackageB, ram],
    );
    const before = readEffects();
    expect(
      await h.call('sue', 'POST', `/api/work-packages/${workPackageA}/commands`, {
        commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 32 }, state(ram, null)],
      }),
    ).toEqual({
      status: 409,
      body: {
        at: 1,
        kind: 'setDirectoryCapacity',
        error: 'capacity_limit',
        resourceId: ram,
        cap: 64,
        declared: 96,
        asked: 0,
      },
    });
    expect(stated(h, ram)).toBe(0);
    expect(readEffects()).toEqual(before);
  });

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
        workPackages: [
          { workPackageId: workPackageA, name: 'A', units: 8 },
          { workPackageId: workPackageB, name: 'B', units: 6 },
        ].sort((left, right) => left.workPackageId.localeCompare(right.workPackageId)),
        hiddenWorkPackages: { count: 0, units: 0 },
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
    expect(await h.call('ada', 'POST', previewPath(ram), { units: 10 })).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    addAgentPerson(h.sqlite, 'sue-agent', 'org-a', h.userId('sue'));
    const { key } = await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'sue-agent',
      issuedBy: h.userId('sue'),
    });
    expect(await callForwarded(h, key, 'POST', previewPath(ram), { units: 10 })).toMatchObject({
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
  it('announces directory_changed to a work package that holds the resource only through a claim', async () => {
    await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 16)] });
    const workPackageC = await create(h, 'sue', 'C');
    h.sqlite.run(
      "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-held', ?, NULL, 0, 'w-held')",
      [workPackageC],
    );
    const claimed: Answer = await h.call(
      'ada',
      'POST',
      `/api/work-packages/${workPackageC}/commands`,
      {
        commands: [
          {
            kind: 'claimWorkItem',
            workItemId: 'w-held',
            personId: 'agent-a',
            steps: [stepOf(workPackageC)],
            resources: [{ resourceId: ram, units: 6 }],
          },
        ],
      },
    );
    expect(claimed).toMatchObject({ status: 200 });
    const toldC = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`work-package:${workPackageC}`)
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
      "INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES ('w-c', ?, NULL, 1, 'w-c')",
      [workPackageA],
    );
    const refused = await h.call('ada', 'POST', `/api/work-packages/${workPackageA}/commands`, {
      commands: [
        { kind: 'setDemand', workItemId: 'w-c', resourceId: ram, units: 1 },
        {
          kind: 'claimWorkItem',
          workItemId: 'w-c',
          personId: 'agent-a',
          steps: [stepOf(workPackageA)],
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
  type OriginRead = Parameters<ClaimRepository['mayReadWorkPackageWithin']>;
  function distinctWorkItem(id: string, workPackageId: string, position: number) {
    h.sqlite.run(
      'INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES (?, ?, NULL, ?, ?)',
      [id, workPackageId, position, id],
    );
  }

  function stageHolder(
    id: string,
    workPackageId: string,
    workItemId: string,
    personId: string,
    position: number,
    runId: string | null,
    units: number,
    resources: readonly string[],
  ) {
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, run_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [id, workItemId, stepOf(workPackageId, position), personId, runId, h.userId('ada')],
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
      ClaimRepository.prototype,
      'mayReadWorkPackageWithin',
    );
    if (typeof descriptor?.value !== 'function')
      throw new Error('missing work package read method');
    const original = descriptor.value as ClaimRepository['mayReadWorkPackageWithin'];
    const interceptor = spyOn(
      ClaimRepository.prototype,
      'mayReadWorkPackageWithin',
    ).mockImplementation(function (this: ClaimRepository, ...args: OriginRead) {
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
    h.sqlite.run('UPDATE work_package SET name = ? WHERE id = ?', [
      'PRIVATE_ORIGIN_PACKAGE',
      workPackageA,
    ]);
    stageHolder(hiddenClaim, workPackageA, hiddenLeaf, hiddenPerson, 0, hiddenRun, 16, resources);
    stageHolder(
      'private-origin-copy',
      workPackageA,
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
      workPackageA,
      'PRIVATE_ORIGIN_PACKAGE',
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
    workPackageId: string,
    workItemId: string,
    resourceIds: readonly string[],
    units: number,
  ) {
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
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
    const second = await declare(h, 'sue', otherResource);
    const resourceIds = [ram, second].sort();
    await declareCapacity(resourceIds, 24);
    createHiddenCopies(resourceIds);
    const c = await create(h, 'ada', 'visible other work package');
    distinctWorkItem('w-visible-other', c, 0);
    distinctWorkItem('w-visible-local', workPackageB, 1);
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
      workPackageB,
      'w-visible-local',
      'agent-b',
      0,
      null,
      4,
      resourceIds,
    );
    await demand(workPackageB, 'w-b', resourceIds, 1);
    h.sqlite.run(
      "UPDATE person_organization SET name = 'local agent B' WHERE resource_id = 'agent-b'",
    );
    const people = spyOn(DirectoryRepository.prototype, 'listInOrganization');
    const scopedNames = spyOn(DirectoryRepository.prototype, 'personNamesInOrganization');
    const denied = new Set([workPackageA]);
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
          steps: [stepOf(workPackageB)],
        },
      ],
    };
    const claimRows = () =>
      h.sqlite.query<{ count: number }, []>('SELECT count(*) as count FROM claim').get();
    const before = { journal: journalEntries(h), claims: claimRows() };
    try {
      const refused = await h.call(
        'ada',
        'POST',
        `/api/work-packages/${workPackageB}/commands`,
        requested,
      );
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
          workPackageId: c,
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
      expect(gate.reads.filter(([origin]) => origin.id === workPackageA)).toEqual([
        [
          { id: workPackageA, organizationId: 'org-a' },
          h.userId('ada'),
          expect.objectContaining({ kind: 'scoped' }),
        ],
      ]);
      gate.reads.length = 0;
      denied.add(workPackageB);
      denied.add(c);
      const noVisible = await h.call(
        'ada',
        'POST',
        `/api/work-packages/${workPackageB}/commands`,
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
      expect(
        (await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`)).status,
      ).toBe(200);
      expect(occupancy).not.toHaveBeenCalled();
      const second = await declare(h, 'sue', otherResource);
      const resourceIds = [ram, second].sort();
      await declareCapacity(resourceIds, 16);
      createHiddenCopies(resourceIds);
      distinctWorkItem('w-b-next', workPackageB, 1);
      await demand(workPackageB, 'w-b', [ram], 1);
      await demand(workPackageB, 'w-b-next', [second], 1);
      const denied = new Set([workPackageA]);
      const gate = denyOrigins(denied, h.userId('vic'));
      try {
        people.mockClear();
        const read = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`);
        const emptyCatalogReads = people.mock.calls.filter(([catalog]) => catalog === 'people');
        expect(read).toMatchObject({
          status: 200,
          body: {
            occupancyScope: 'work_package',
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
          [workPackageA, h.userId('vic')],
        ]);
        denied.clear();
        people.mockClear();
        const next = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`);
        const visibleHolder: unknown = expect.arrayContaining([
          expect.objectContaining({
            workItemId: hiddenLeaf,
            personId: hiddenPerson,
            runId: hiddenRun,
            workPackageId: workPackageA,
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

  it('batches the work package catalog directory totals without reading holder identities', async () => {
    const shared = await declare(h, 'sue', otherResource);
    const unstated = await declare(h, 'sue', 'unstated resource');
    await declareCapacity([ram, shared], 24);
    createHiddenCopies([ram, shared]);
    stageHolder('catalog-local-claim', workPackageB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    await demand(workPackageB, 'w-b', [ram], 4);
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageB}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 9 }],
        })
      ).status,
    ).toBe(200);
    expect((await h.call('sue', 'POST', DIRECTORY, { commands: [state(ram, 10)] })).status).toBe(
      200,
    );

    const units = spyOn(ClaimRepository.prototype, 'organizationUnitsOf');
    const holdings = spyOn(ClaimRepository.prototype, 'organizationOccupancyOf');
    const names = spyOn(DirectoryRepository.prototype, 'personNamesInOrganization');
    const visibility = denyOrigins(new Set([workPackageA]), h.userId('vic'));
    try {
      const read = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/resources`);
      expect(read).toEqual({
        status: 200,
        body: {
          resources: [
            {
              id: ram,
              name: 'host ram',
              kind: 'divisible',
              unitLabel: 'GB',
              providerId: null,
              directoryCapacity: 10,
              directory: { capacity: 10, occupied: 20, free: -10 },
            },
            {
              id: shared,
              name: otherResource,
              kind: 'divisible',
              unitLabel: 'GB',
              providerId: null,
              directoryCapacity: 24,
              directory: { capacity: 24, occupied: 16, free: 8 },
            },
            {
              id: unstated,
              name: 'unstated resource',
              kind: 'divisible',
              unitLabel: 'GB',
              providerId: null,
              directoryCapacity: null,
              directory: null,
            },
          ],
          capacities: [{ resourceId: ram, units: 9 }],
          demands: [{ workItemId: 'w-b', resourceId: ram, units: 4 }],
        },
      });
      absence(read.body);
      expect(units.mock.calls.map(([ids]) => [...ids].sort())).toEqual([[ram, shared].sort()]);
      expect(holdings).not.toHaveBeenCalled();
      expect(names).not.toHaveBeenCalled();
      expect(visibility.reads).toEqual([]);
    } finally {
      visibility.restore();
      names.mockRestore();
      holdings.mockRestore();
      units.mockRestore();
    }
  });

  it('keeps the work package catalog coherent across a mid-read release and capacity update', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    stageHolder('catalog-local-claim', workPackageB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    const original = readPrototypeMethod(ClaimRepository.prototype, 'organizationUnitsOf');
    let released = false;
    const aggregate = spyOn(ClaimRepository.prototype, 'organizationUnitsOf').mockImplementation(
      async function (this: ClaimRepository, ids) {
        if (!released) {
          released = true;
          for (const [personId, path] of [
            [hiddenPerson, `/api/work-packages/${workPackageA}/commands`],
            ['agent-a', `/api/work-packages/${workPackageA}/commands`],
          ] as const)
            expect(
              (
                await h.call('sue', 'POST', path, {
                  commands: [{ kind: 'releaseWorkItem', workItemId: hiddenLeaf, personId }],
                })
              ).status,
            ).toBe(200);
          h.sqlite.transaction(() => {
            h.sqlite.run('UPDATE resource_directory_capacity SET units = 8 WHERE resource_id = ?', [
              ram,
            ]);
            h.sqlite.run(
              'INSERT INTO work_item_resource_demand (work_item_id, resource_id, units) VALUES (?, ?, 2)',
              ['w-b', ram],
            );
          })();
        }
        return original.call(this, ids);
      },
    );
    try {
      const path = `/api/work-packages/${workPackageB}/resources`;
      expect(await h.call('vic', 'GET', path)).toMatchObject({
        status: 200,
        body: {
          resources: [
            { directoryCapacity: 24, directory: { capacity: 24, occupied: 20, free: 4 } },
          ],
          demands: [],
        },
      });
      expect(await h.call('vic', 'GET', path)).toMatchObject({
        status: 200,
        body: {
          resources: [{ directoryCapacity: 8, directory: { capacity: 8, occupied: 4, free: 4 } }],
          demands: [{ workItemId: 'w-b', resourceId: ram, units: 2 }],
        },
      });
      expect(aggregate.mock.calls).toEqual([[[ram]], [[ram]]]);
    } finally {
      aggregate.mockRestore();
    }
  });

  it('aborts a resource report whose catalog omits a referenced resource', async () => {
    await demand(workPackageB, 'w-b', [ram], 2);
    const catalog = spyOn(
      DirectoryRepository.prototype,
      'listInOrganization',
    ).mockResolvedValueOnce([]);
    try {
      const reply = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/resources`);
      expect(reply.status).toBe(500);
      expect(catalog.mock.calls).toEqual([['resources', 'org-a']]);
    } finally {
      catalog.mockRestore();
    }
  });

  it('aborts a resource report if the aggregate dependency fails', async () => {
    await declareCapacity([ram], 16);
    const aggregate = spyOn(ClaimRepository.prototype, 'organizationUnitsOf').mockRejectedValue(
      new Error('private aggregate failure'),
    );
    try {
      const reply = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/resources`);
      expect(reply.status).toBe(500);
      expect(JSON.stringify(reply.body)).not.toContain('private aggregate failure');
      expect(aggregate.mock.calls).toEqual([[[ram]]]);
    } finally {
      aggregate.mockRestore();
    }
  });

  it('previews distinct denied work packages including a zero-held origin with no writes', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    stageHolder('visible-b-claim', workPackageB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    const d = await create(h, 'ada', 'PRIVATE_ZERO_HELD_PACKAGE');
    distinctWorkItem('w-zero', d, 0);
    await demand(d, 'w-zero', [ram], 2);
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageA}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 16 }],
        })
      ).status,
    ).toBe(200);
    const audits = auditRows(h);
    const journal = journalEntries(h);
    const denied = new Set([workPackageA, d]);
    const gate = denyOrigins(denied, h.userId('sue'));
    try {
      const preview = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(preview).toEqual({
        status: 200,
        body: {
          resourceId: ram,
          before: 24,
          after: 18,
          workPackages: [{ workPackageId: workPackageB, name: 'B', units: 4 }],
          hiddenWorkPackages: { count: 2, units: 16 },
          free: -2,
          refusal: null,
        },
      });
      absence(preview.body, [d, 'PRIVATE_ZERO_HELD_PACKAGE']);
      expect(gate.reads.map(([origin]) => origin.id).sort()).toEqual(
        [workPackageA, workPackageB, d].sort(),
      );
      expect(await h.call('sue', 'POST', previewPath(ram), { units: null })).toMatchObject({
        status: 200,
        body: { after: null, free: null, hiddenWorkPackages: { count: 2, units: 16 } },
      });
      const otherActor = await h.call('tom', 'POST', previewPath(ram), { units: 18 });
      expect(otherActor).toMatchObject({
        status: 200,
        body: { hiddenWorkPackages: { count: 0, units: 0 }, free: -2 },
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
    stageHolder('visible-b-claim', workPackageB, 'w-b', 'agent-b', 0, null, 4, [ram]);
    const d = await create(h, 'ada', 'PRIVATE_NEXT_PACKAGE');
    distinctWorkItem('w-next-snapshot', d, 0);
    const gate = denyOrigins(new Set([workPackageA, d]), h.userId('sue'));
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
        body: { hiddenWorkPackages: { count: 1, units: 16 }, free: -2 },
      });
      const later = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(later).toMatchObject({
        status: 200,
        body: { hiddenWorkPackages: { count: 1, units: 0 }, free: 14 },
      });
      absence(earlier.body, [d, 'PRIVATE_NEXT_PACKAGE']);
      absence(later.body, [d, 'PRIVATE_NEXT_PACKAGE']);
    } finally {
      writer.mockRestore();
      gate.restore();
    }
  });

  it('reports only this work package when a local capacity binds on a shared resource', async () => {
    await declareCapacity([ram], 24);
    createHiddenCopies([ram]);
    distinctWorkItem('w-local-holder', workPackageB, 1);
    stageHolder('visible-bound-local', workPackageB, 'w-local-holder', 'agent-b', 0, null, 4, [
      ram,
    ]);
    expect(
      (
        await h.call('ada', 'POST', `/api/work-packages/${workPackageB}/commands`, {
          commands: [{ kind: 'setResourceCapacity', resourceId: ram, units: 4 }],
        })
      ).status,
    ).toBe(200);
    await demand(workPackageB, 'w-b', [ram], 1);
    const gate = denyOrigins(new Set([workPackageA]), h.userId('vic'));
    try {
      const read = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`);
      expect(read).toMatchObject({
        status: 200,
        body: {
          doesNotFit: [
            {
              workItemId: 'w-b',
              exhausted: {
                scope: 'work_package',
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
      expect(JSON.stringify(read.body)).not.toContain('workPackageId');
      expect(gate.reads.map(([origin]) => origin.id)).toEqual([workPackageB]);
      absence(read.body);
    } finally {
      gate.restore();
    }
  });

  it('a work package read exception aborts the entire shared shortage observation', async () => {
    await declareCapacity([ram], 16);
    createHiddenCopies([ram]);
    await demand(workPackageB, 'w-b', [ram], 1);
    const policy = spyOn(ClaimRepository.prototype, 'mayReadWorkPackageWithin').mockRejectedValue(
      new Error('private grant failure'),
    );
    try {
      const answer = await h.call('vic', 'GET', `/api/work-packages/${workPackageB}/startable`);
      expect(answer.status).toBe(500);
      absence(answer.body, ['private grant failure']);
      expect(JSON.stringify(answer.body)).not.toContain('hiddenHolders');

      const preview = await h.call('sue', 'POST', previewPath(ram), { units: 18 });
      expect(preview.status).toBe(500);
      absence(preview.body, [
        'private grant failure',
        'hiddenWorkPackages',
        'private-origin-person',
      ]);
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

  function batch(username: string, workPackageId: string, commands: unknown[]) {
    return h.call(username, 'POST', `/api/work-packages/${workPackageId}/commands`, { commands });
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
    for (const [workPackageId, workItemId] of [
      [workPackageA, 'w-a'],
      [workPackageB, 'w-b'],
    ] as const) {
      expect(
        await batch('ada', workPackageId, [
          { kind: 'setDemand', workItemId, resourceId: ram, units: 16 },
        ]),
      ).toMatchObject({ status: 200 });
    }
    expect(
      await batch('sue', workPackageA, [
        {
          kind: 'claimWorkItem',
          workItemId: 'w-a',
          personId: holder,
          steps: [stepOf(workPackageA)],
        },
      ]),
    ).toMatchObject({ status: 200 });
    if (restricted) {
      expect(
        await h.call('ada', 'PATCH', `/api/work-packages/${workPackageA}`, { restricted: true }),
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
      const ask = { ...claim, steps: [stepOf(workPackageB)] };
      expect(await batch('ada', workPackageB, [ask])).toMatchObject({
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
          workPackages: [
            {
              workPackageId: workPackageA,
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
      const release = await batch('sue', workPackageA, [
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
          body: { resourceId: ram, directoryCapacity: 16, occupied: 0, free: 16, workPackages: [] },
        });
        expect(await batch('ada', workPackageB, [ask])).toMatchObject({ status: 200 });
      }
    });
  }
});

describe('occupancy inventory authority and observation', () => {
  const path = (resourceId = ram) => `/api/organization/resources/${resourceId}/occupancy`;
  const visiblePerson = 'visible-inventory-person';
  const hiddenPerson = 'private-inventory-person';
  const hiddenWorkPackage = 'PRIVATE_INVENTORY_PACKAGE';
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

  function addHolder(
    id: string,
    workPackageId: string,
    workItemId: string,
    personId: string,
    units: number,
    options: { step?: number; run?: string; at?: number; expires?: number } = {},
  ) {
    const stepId = stepOf(workPackageId, options.step ?? 0);
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
    h.sqlite.run('UPDATE work_package SET name = ? WHERE id = ?', [
      hiddenWorkPackage,
      workPackageA,
    ]);
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
    addHolder(reserved, workPackageA, 'w-a', hiddenPerson, 16);
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
      body: { resourceId: ram, directoryCapacity: null, occupied: 0, free: null, workPackages: [] },
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
      body: { resourceId: ram, directoryCapacity: 0, occupied: 0, free: 0, workPackages: [] },
    });
  });

  it('counts the largest copy per leaf and retains every claim with its actual stamp', async () => {
    await stateCapacity(16);
    addPeople();
    addHolder('shared-1', workPackageA, 'w-a', visiblePerson, 16, { at: 101, expires: lease });
    addHolder('shared-2', workPackageA, 'w-a', visiblePerson, 12, {
      step: 1,
      at: 102,
      expires: lease + 1,
    });
    addHolder('shared-3', workPackageB, 'w-b', visiblePerson, 4, { at: 103 });
    const initial = await h.call('sue', 'GET', path());
    expect(initial).toMatchObject({ status: 200, body: { occupied: 20, free: -4 } });
    const body = initial.body as {
      workPackages: { workPackageId: string; units: number; claims: unknown[] }[];
    };
    expect(body.workPackages.map(({ workPackageId }) => workPackageId)).toEqual(
      [workPackageA, workPackageB].sort(),
    );
    expect(
      body.workPackages.find(({ workPackageId }) => workPackageId === workPackageA),
    ).toMatchObject({
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
    expect(
      body.workPackages.find(({ workPackageId }) => workPackageId === workPackageB),
    ).toMatchObject({
      units: 4,
      claims: [{ claimId: 'shared-3', runId: null, claimedAt: 103, leaseExpiresAt: null }],
    });
    const release = (position: number) =>
      h.call('sue', 'POST', `/api/work-packages/${workPackageA}/commands`, {
        commands: [
          {
            kind: 'releaseWorkItem',
            workItemId: 'w-a',
            personId: visiblePerson,
            steps: [stepOf(workPackageA, position)],
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
      body: { occupied: 4, free: 12, workPackages: [{ workPackageId: workPackageB }] },
    });
  });

  it('omits every hidden identity and resolves only visible ids across capacity states', async () => {
    await stateCapacity(24);
    addPeople();
    addHolder(reserved, workPackageA, 'w-a', hiddenPerson, 16, {
      run: 'private-inventory-run',
      at: claimedAt,
      expires: lease,
    });
    addHolder('open-inventory-claim', workPackageB, 'w-b', visiblePerson, 4);
    h.sqlite.run(
      'INSERT INTO claim (id, work_item_id, step_id, person_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      ['unasked-claim', 'w-b', stepOf(workPackageB, 1), hiddenPerson, null, h.userId('ada')],
    );
    const stamped = spyOn(ClaimRepository.prototype, 'listStampedByIds');
    const names = spyOn(DirectoryRepository.prototype, 'personNamesInOrganization');
    const checked: string[] = [];
    const decide = spyOn(ClaimRepository.prototype, 'mayReadWorkPackageWithin');
    let denied = new Set([workPackageA]);
    decide.mockImplementation((origin) => {
      checked.push(origin.id);
      return Promise.resolve(!denied.has(origin.id));
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
          workPackages: [
            {
              workPackageId: workPackageB,
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
        workPackageA,
        hiddenWorkPackage,
        reserved,
        hiddenPerson,
        hiddenName,
        'w-a',
        'private-inventory-run',
        String(claimedAt),
        String(lease),
        'hiddenWorkPackages',
      ])
        expect(body).not.toContain(secret);
      expect(checked.sort()).toEqual([workPackageA, workPackageB].sort());
      expect(stamped.mock.calls).toEqual([[workPackageB, ['open-inventory-claim']]]);
      expect(names.mock.calls).toEqual([['org-a', [visiblePerson]]]);
      stamped.mockClear();
      names.mockClear();
      denied = new Set([workPackageA, workPackageB]);
      expect(await h.call('sue', 'GET', path())).toEqual({
        status: 200,
        body: { resourceId: ram, directoryCapacity: 24, occupied: 20, free: 4, workPackages: [] },
      });
      expect(stamped).not.toHaveBeenCalled();
      expect(names).not.toHaveBeenCalled();
      await stateCapacity(null);
      denied = new Set([workPackageA]);
      expect(await h.call('sue', 'GET', path())).toMatchObject({
        status: 200,
        body: {
          directoryCapacity: null,
          occupied: 4,
          free: null,
          workPackages: [{ workPackageId: workPackageB }],
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

  function replaceSueGrant(from: string, to: string) {
    const { changes } = h.sqlite.run(
      "UPDATE access_grant SET role_id = ? WHERE organization_id = 'org-a' AND scope_kind = 'organization' AND scope_id = 'org-a' AND subject_kind = 'user' AND subject_id = ? AND role_id = ?",
      [to, h.userId('sue'), from],
    );
    expect(changes).toBe(1);
  }

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
            expect(admitted.access.scope.organizationId).toBe('org-a');
            if (change === 'demote') {
              replaceSueGrant('org-admin', 'org-viewer');
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
        if (change === 'demote') replaceSueGrant('org-viewer', 'org-admin');
      }
    } finally {
      resolver.mockRestore();
      content.mockRestore();
    }
  });

  it('keeps stamps, names, role and units coherent across a mid-read release', async () => {
    await stateCapacity(16);
    addPeople();
    addHolder('old-inventory-claim', workPackageA, 'w-a', visiblePerson, 16, { at: 19 });
    const original = readPrototypeMethod(ClaimRepository.prototype, 'mayReadWorkPackageWithin');
    let changed = false;
    const writer = spyOn(ClaimRepository.prototype, 'mayReadWorkPackageWithin').mockImplementation(
      async function (this: ClaimRepository, ...args: Parameters<typeof original>) {
        if (!changed) {
          changed = true;
          expect(
            await h.call('sue', 'POST', `/api/work-packages/${workPackageA}/commands`, {
              commands: [{ kind: 'releaseWorkItem', workItemId: 'w-a', personId: visiblePerson }],
            }),
          ).toMatchObject({ status: 200 });
          h.sqlite.run('UPDATE person_organization SET name = ? WHERE resource_id = ?', [
            'Next Alias',
            visiblePerson,
          ]);
          replaceSueGrant('org-admin', 'org-viewer');
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
          workPackages: [
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
        body: { resourceId: ram, directoryCapacity: 16, occupied: 0, free: 16, workPackages: [] },
      });
    } finally {
      writer.mockRestore();
    }
  });

  it('fails closed on contradictory holding rows and unpaired stamps', async () => {
    addPeople();
    addHolder('conflicting-inventory-claim', workPackageA, 'w-a', visiblePerson, 7);
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
      async function (this: ClaimRepository, workPackageId, ids) {
        const holdings = await stampRead.call(this, workPackageId, ids);
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
    addHolder('broken-inventory-claim', workPackageA, 'w-a', visiblePerson, 7, { at: 17 });
    const failsClosed = async () => {
      const response = await h.call('sue', 'GET', path());
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('broken-inventory-claim');
      expect(JSON.stringify(response.body)).not.toContain('Visible Alias');
      expect(JSON.stringify(response.body)).not.toContain('private read failure');
    };
    const owner = spyOn(WorkPackageRepository.prototype, 'findInOrganization').mockResolvedValue(
      null,
    );
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
    const grants = spyOn(ClaimRepository.prototype, 'mayReadWorkPackageWithin').mockRejectedValue(
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
