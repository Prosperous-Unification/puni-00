import { createProject } from '@wbs/contracts';
import { formatStepNodeId } from '@wbs/domain';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { bindDevQaFixture } from '../testing/dev-qa-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';
import { readFixturePackage } from '../testing/space-rollup';

let h: OrganizationHarness;
let workPackage: string;
let projectId: string;
let dev: string;
let qa: string;
let strip: string;
let pushes: number;

beforeEach(async () => {
  pushes = 0;
  h = OrganizationHarness.openComposedWith({
    pushFetch: () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  await populate();
});

async function populate(): Promise<void> {
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-a', 'ada', ['organization.create_project']);
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/projects', {
    name: 'Shed renovation',
    workPackage: { name: 'Rewire the shed' },
  });
  if (created.status !== 201) throw new Error('fixture project refused', { cause: created });
  const checked = await createProject.responses[0].schema.validator['~standard'].validate(
    created.body,
  );
  if (checked.issues !== undefined)
    throw new Error('fixture project reply malformed', { cause: checked.issues });
  const pack = checked.value.workPackage;
  if (pack === undefined) throw new Error('fixture project omitted its work package');
  await h.publicWrites().uow.run(async ({ stores }) => {
    await bindDevQaFixture(stores.stepCatalogue, 'org-a', checked.value.project.id, {
      at: 1,
      by: h.userId('ada'),
    });
    return { commit: true, value: undefined };
  });
  projectId = checked.value.project.id;
  workPackage = pack.id;
  const body = await readFixturePackage(h, 'ada', workPackage);
  dev = stepNamed(body.steps, 'Dev');
  qa = stepNamed(body.steps, 'QA');
  const leaf = await batch([
    { kind: 'createWorkItem', ref: 'strip', parentId: null, afterId: null, name: 'Strip' },
  ]);
  const id = (leaf.body as { results?: { id?: string }[] }).results?.[0]?.id;
  if (id === undefined) throw new Error(`no leaf: ${JSON.stringify(leaf)}`);
  strip = id;
}

afterEach(() => {
  h.close();
});

function stepNamed(steps: readonly { id: string; name: string }[], name: string): string {
  const step = steps.find((each) => each.name === name);
  if (step === undefined) throw new Error(`a work package without its seed step ${name}`);
  return step.id;
}

const batch = (commands: unknown[]): Promise<Answer> =>
  h.call('ada', 'POST', `/api/work-packages/${workPackage}/commands`, { commands });

const facts = () =>
  h.sqlite
    .query<{ blocked_at: number; work_item_id: string; step_id: string }, []>(
      'SELECT * FROM step_blockage ORDER BY step_id',
    )
    .all();
const snapshot = () =>
  [
    'work_item',
    'work_package',
    'step_progress',
    'step_blockage',
    'command_journal',
    'event_log',
    'event_sequencer',
    'plan_event',
  ].map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
const flip = (direction: 'undo' | 'redo') =>
  h.call('ada', 'POST', `/api/work-packages/${workPackage}/${direction}`);

describe('public step blockage commands over mounted SQLite', () => {
  beforeEach(() => {
    activateTestStepBlockages(h.sqlite.filename);
  });
  it('writes both addresses, preserves progress, and replays exact time beneath done', async () => {
    expect(
      (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]))
        .status,
    ).toBe(200);
    const blocked = facts();
    expect(blocked).toHaveLength(1);
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    expect(facts()).toEqual(blocked);
    expect(
      (
        await batch([
          {
            kind: 'setStepBlocked',
            stepNodeId: formatStepNodeId({ workItemId: strip, stepId: dev }),
            isBlocked: false,
          },
        ])
      ).status,
    ).toBe(200);
    expect(facts()).toEqual([]);
    expect((await flip('undo')).status).toBe(200);
    expect(facts().map(({ blocked_at }) => blocked_at)).toEqual(
      blocked.map(({ blocked_at }) => blocked_at),
    );
    expect((await flip('redo')).status).toBe(200);
    expect(facts()).toEqual([]);
  });

  it('equivalent presence and absence change no stored snapshot', async () => {
    for (const isBlocked of [false, true]) {
      expect(
        (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked }]))
          .status,
      ).toBe(200);
      const before = snapshot();
      expect(
        (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked }]))
          .status,
      ).toBe(200);
      expect(snapshot()).toEqual(before);
    }
    await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]);
    const before = snapshot();
    expect(
      (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]))
        .status,
    ).toBe(200);
    expect(snapshot()).toEqual(before);
  });

  it.each([
    ['not_found', () => ({ workItemId: 'missing', stepId: dev })],
    ['unknown_step', () => ({ workItemId: strip, stepId: 'missing' })],
  ] as const)('refuses %s before treating absence as equivalent', async (reason, address) => {
    const before = snapshot();
    expect(await batch([{ kind: 'setStepBlocked', ...address(), isBlocked: false }])).toMatchObject(
      { body: { error: reason } },
    );
    expect(snapshot()).toEqual(before);
  });

  it('refuses new blockage on done and rolls back an earlier batch write', async () => {
    await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]);
    const before = snapshot();
    expect(
      await batch([
        { kind: 'setStepBlocked', workItemId: strip, stepId: qa, isBlocked: true },
        { kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true },
      ]),
    ).toMatchObject({ status: 409, body: { error: 'node_done', at: 1 } });
    expect(snapshot()).toEqual(before);
  });

  it('refuses a parent even when clearing an absent fact', async () => {
    await batch([{ kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Child' }]);
    const before = snapshot();
    expect(
      await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false }]),
    ).toMatchObject({ body: { error: 'rolled_up' } });
    expect(snapshot()).toEqual(before);
  });

  it.each(['undo', 'redo'] as const)(
    'refuses stale %s timestamps with forged unchanged revisions',
    async (direction) => {
      await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]);
      if (direction === 'redo') await flip('undo');
      h.sqlite.run(
        'INSERT OR REPLACE INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [strip, dev, -23],
      );
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      const before = snapshot();
      expect((await flip(direction)).status).toBe(409);
      expect(snapshot().filter((_, index) => index !== 4)).toEqual(
        before.filter((_, index) => index !== 4),
      );
    },
  );
  it('refuses a viewer and another organization before an equivalent clear', async () => {
    await h.register('bea');
    h.member('org-a', 'bea', 'viewer', ['org-viewer']);
    h.bind('bea', 'org-a');
    const before = snapshot();
    expect(
      (
        await h.call('bea', 'POST', `/api/work-packages/${workPackage}/commands`, {
          commands: [{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false }],
        })
      ).status,
    ).toBe(403);
    expect(snapshot()).toEqual(before);
    h.organization('org-b');
    h.member('org-b', 'bea', 'member', ['project-contributor', 'org-viewer']);
    h.grantPermissions('org-b', 'bea', ['organization.create_project']);
    h.bind('bea', 'org-b');
    expect(
      (
        await h.call('bea', 'POST', `/api/work-packages/${workPackage}/commands`, {
          commands: [{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false }],
        })
      ).status,
    ).toBe(404);
    expect(snapshot()).toEqual(before);
  });

  it.each(['refuse', 'throw'] as const)(
    'rolls back prior SQLite writes after injected store %s',
    async (fault) => {
      const before = snapshot();
      const pushedBefore = pushes;
      const write = spyOn(StepBlockageRepository.prototype, 'set');
      if (fault === 'refuse') write.mockResolvedValue('unknown_step');
      else write.mockRejectedValue(new Error('injected SQLite blockage failure'));
      try {
        expect(
          (
            await batch([
              { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Changed' } },
              { kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true },
            ])
          ).status,
        ).toBe(500);
        expect(snapshot()).toEqual(before);
        expect(pushes).toBe(pushedBefore);
      } finally {
        write.mockRestore();
      }
    },
  );

  it.each(['undo', 'redo'] as const)(
    'refuses %s after the recorded step is no longer bound',
    async (direction) => {
      await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]);
      if (direction === 'redo') await flip('undo');
      h.sqlite.run('DELETE FROM step_blockage');
      const binding = h.sqlite
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM step_binding WHERE scope_kind='project' AND scope_id=? AND step_id=?",
        )
        .get(projectId, dev);
      if (binding === null) throw new Error('project Dev binding missing');
      expect(
        await h.call('ada', 'DELETE', '/api/organization/step-bindings/' + binding.id, {
          dryRun: false,
        }),
      ).toEqual({ status: 204, body: null });
      expect((await readFixturePackage(h, 'ada', workPackage)).steps.map(({ id }) => id)).toEqual([
        qa,
      ]);
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      const before = snapshot();
      expect((await flip(direction)).status).toBe(404);
      expect(snapshot().filter((_, index) => index !== 4)).toEqual(
        before.filter((_, index) => index !== 4),
      );
    },
  );

  it.each(['undo', 'redo'] as const)(
    'refuses missing %s facts despite unchanged owner revisions',
    async (direction) => {
      await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]);
      if (direction === 'redo') {
        await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false }]);
        await flip('undo');
      }
      h.sqlite.run('DELETE FROM step_blockage');
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      const before = snapshot();
      expect((await flip(direction)).status).toBe(409);
      expect(snapshot().filter((_, index) => index !== 4)).toEqual(
        before.filter((_, index) => index !== 4),
      );
    },
  );

  it('resolves a same-batch work item reference and journals one history event', async () => {
    const before = h.sqlite.query('SELECT * FROM plan_event').all().length;
    expect(
      (
        await batch([
          { kind: 'createWorkItem', ref: 'new', parentId: null, afterId: strip, name: 'New' },
          { kind: 'setStepBlocked', workItemRef: 'new', stepId: qa, isBlocked: true },
        ])
      ).status,
    ).toBe(200);
    const history = h.sqlite.query('SELECT * FROM plan_event').all();
    expect(history.length).toBe(before + 1);
    expect(facts()).toHaveLength(1);
    expect((await flip('undo')).status).toBe(200);
    expect(facts()).toEqual([]);
    expect((await flip('redo')).status).toBe(200);
    expect(facts()).toHaveLength(1);
  });

  it.each(['undo', 'redo'] as const)(
    'refuses %s after the recorded leaf gains a child',
    async (direction) => {
      await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]);
      if (direction === 'redo') await flip('undo');
      h.sqlite.run('DELETE FROM step_blockage');
      h.sqlite.run(
        'INSERT INTO work_item (id, work_package_id, parent_id, position, name) VALUES (?, ?, ?, 0, ?)',
        [crypto.randomUUID(), workPackage, strip, 'External child'],
      );
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      const before = snapshot();
      expect((await flip(direction)).status).toBe(409);
      expect(snapshot().filter((_, index) => index !== 4)).toEqual(
        before.filter((_, index) => index !== 4),
      );
    },
  );
});

describe('public step blockage commands with disabled writer admission', () => {
  it('refuses a default-disabled set atomically without facts, journal or fanout', async () => {
    expect(h.sqlite.query('SELECT state FROM step_blockage_activation').all()).toEqual([
      { state: 'DISABLED' },
    ]);
    const before = snapshot();
    const pushedBefore = pushes;
    expect(
      await batch([
        { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Changed' } },
        { kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true },
      ]),
    ).toEqual({ status: 409, body: { error: 'step_blockage_inactive' } });
    expect(snapshot()).toEqual(before);
    expect(facts()).toEqual([]);
    expect(pushes).toBe(pushedBefore);
  });

  it('keeps a default-disabled absent clear an exact no-op', async () => {
    const before = snapshot();
    const pushedBefore = pushes;
    expect(
      (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false }]))
        .status,
    ).toBe(200);
    expect(snapshot()).toEqual(before);
    expect(pushes).toBe(pushedBefore);
  });

  it('retains the readable exported fact when a disabled clear refuses atomically', async () => {
    activateTestStepBlockages(h.sqlite.filename);
    expect(
      (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]))
        .status,
    ).toBe(200);
    const blocked = facts();
    h.sqlite.run("UPDATE step_blockage_activation SET state = 'DISABLED'");
    const before = snapshot();
    const pushedBefore = pushes;
    expect(
      await batch([
        { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Changed' } },
        { kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: false },
      ]),
    ).toEqual({ status: 409, body: { error: 'step_blockage_inactive' } });
    expect(snapshot()).toEqual(before);
    expect(facts()).toEqual(blocked);
    expect(pushes).toBe(pushedBefore);
    expect(
      (await h.call('ada', 'GET', `/api/work-packages/${workPackage}/work-items`)).status,
    ).toBe(200);
    const exported = await h.call(
      'ada',
      'GET',
      `/api/work-packages/${workPackage}/export?format=json`,
    );
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({
      document: { version: 15 },
      stepBlockages: [{ workItemId: strip, stepId: dev, blockedAt: blocked[0]?.blocked_at }],
    });
    expect(
      await h.call('ada', 'POST', '/api/work-packages/import', {
        projectId,
        document: exported.body,
      }),
    ).toEqual({
      status: 409,
      body: { error: 'step_blockage_inactive' },
    });
    expect(snapshot()).toEqual(before);
  });

  it.each(['undo', 'redo'] as const)(
    'refuses disabled setter %s without fact, cursor, revision or fanout changes',
    async (direction) => {
      activateTestStepBlockages(h.sqlite.filename);
      expect(
        (await batch([{ kind: 'setStepBlocked', workItemId: strip, stepId: dev, isBlocked: true }]))
          .status,
      ).toBe(200);
      if (direction === 'redo') expect((await flip('undo')).status).toBe(200);
      h.sqlite.run("UPDATE step_blockage_activation SET state = 'DISABLED'");
      const before = snapshot();
      const pushedBefore = pushes;
      expect(await flip(direction)).toEqual({
        status: 409,
        body: { error: 'step_blockage_inactive' },
      });
      expect(snapshot()).toEqual(before);
      expect(pushes).toBe(pushedBefore);
    },
  );
});
