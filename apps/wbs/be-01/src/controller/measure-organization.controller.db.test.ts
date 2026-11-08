import { SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Measure definitions (`wbs-measure-budgets` slice 1) under organization
 * isolation, over real SQLite units of work and the production organization
 * access; see {@link OrganizationHarness.openComposed}. Writes go through
 * `POST /api/directory/commands`, the read through `GET /api/measures`.
 */
let h: OrganizationHarness;

interface ListedMeasure {
  id: string;
  key: string;
  name: string;
  order: number;
}

const SEEDED_KEYS = SEEDED_MEASURE_DEFINITIONS.map(({ key }) => key);

const GPU = {
  kind: 'createMeasure',
  key: 'gpu_minutes',
  name: 'GPU minutes',
  unit: 'min',
  measureKind: 'duration',
  scale: 'integer',
  threePoint: true,
} as const;

afterEach(() => {
  h.close();
});

async function listed(username: string): Promise<ListedMeasure[]> {
  const answer = await h.call(username, 'GET', '/api/measures');
  if (answer.status !== 200) throw new Error(`the list was refused: ${JSON.stringify(answer)}`);
  return (answer.body as { measures: ListedMeasure[] }).measures;
}

async function idOf(username: string, key: string): Promise<string> {
  const found = (await listed(username)).find((each) => each.key === key);
  if (found === undefined) throw new Error(`${username} lists no ${key}`);
  return found.id;
}

function directory(username: string, commands: readonly unknown[]) {
  return h.call(username, 'POST', '/api/directory/commands', { commands });
}

describe('measure definitions in an organization', () => {
  beforeEach(async () => {
    h = OrganizationHarness.openComposed();
    for (const username of ['ada', 'grace', 'moe', 'sue', 'vic']) await h.register(username);
    h.organization('org-a');
    h.organization('org-b');
    h.member('org-a', 'ada', 'admin');
    h.member('org-a', 'moe', 'member');
    h.member('org-a', 'sue', 'super_admin');
    h.member('org-a', 'vic', 'viewer');
    h.member('org-b', 'grace', 'member');
    for (const username of ['ada', 'moe', 'sue', 'vic']) h.bind(username, 'org-a');
    h.bind('grace', 'org-b');
    h.activate();
  });

  it('lists each organization’s own definitions, seeded at its creation', async () => {
    const answer = await h.call('vic', 'GET', '/api/measures');
    expect(answer.status).toBe(200);
    const { measures } = answer.body as { measures: (ListedMeasure & Record<string, unknown>)[] };
    expect(measures.map(({ id: _id, ...fields }) => fields)).toEqual([
      ...SEEDED_MEASURE_DEFINITIONS,
    ]);
    expect(measures.every(({ id }) => typeof id === 'string' && id !== '')).toBe(true);
    const ours = (await listed('ada')).map(({ id }) => id);
    const theirs = (await listed('grace')).map(({ id }) => id);
    expect(ours.filter((id) => theirs.includes(id))).toEqual([]);
  });

  it('defines, patches and removes a measure, all or none and with no undo', async () => {
    const created = await directory('ada', [
      { ...GPU, ref: 'gpu' },
      { kind: 'patchMeasure', measureRef: 'gpu', patch: { name: 'GPU time', showByDefault: true } },
    ]);
    expect(created).toMatchObject({
      status: 200,
      body: {
        results: [
          { index: 0, ref: 'gpu', entity: { key: 'gpu_minutes', kind: 'duration', order: 6 } },
          { index: 1, entity: { key: 'gpu_minutes', name: 'GPU time', showByDefault: true } },
        ],
      },
    });
    expect(created.body).not.toHaveProperty('undoable');
    expect((await listed('ada')).map(({ key }) => key)).toEqual([...SEEDED_KEYS, 'gpu_minutes']);
    expect((await listed('grace')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
    // A refused second command rolls the first back.
    expect(
      await directory('ada', [
        { ...GPU, key: 'gpu_hours' },
        { kind: 'patchMeasure', measureId: await idOf('ada', 'tokens'), patch: { key: 'x' } },
      ]),
    ).toEqual({
      status: 409,
      body: { at: 1, kind: 'patchMeasure', error: 'measure_key_immutable' },
    });
    expect(
      await directory('ada', [
        { kind: 'deleteMeasure', measureId: await idOf('ada', 'gpu_minutes') },
      ]),
    ).toMatchObject({ status: 200 });
    expect((await listed('ada')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
  });

  // Proof: with the measure arm removed from the command endpoints' 409
  // refusals (work-item-shapes.ts), this case answered 500 "returned an
  // undeclared refusal"; watched 2026-10-23.
  it('refuses with typed 409s, writing nothing', async () => {
    const before = await listed('ada');
    const tokens = await idOf('ada', 'tokens');
    const cases: [Record<string, unknown>, string][] = [
      [
        { kind: 'patchMeasure', measureId: tokens, patch: { schedulesWork: true } },
        'second_scheduling_measure',
      ],
      [{ ...GPU, key: 'gpu', schedulesWork: true }, 'second_scheduling_measure'],
      [{ ...GPU, key: 'tokens' }, 'measure_key_taken'],
      [
        { kind: 'patchMeasure', measureId: tokens, patch: { key: 'llm_tokens' } },
        'measure_key_immutable',
      ],
      [
        { kind: 'patchMeasure', measureId: tokens, patch: { scale: 'real' } },
        'measure_shape_immutable',
      ],
      [
        {
          kind: 'patchMeasure',
          measureId: await idOf('ada', 'time'),
          patch: { schedulesWork: false },
        },
        'scheduling_measure_fixed',
      ],
      [{ ...GPU, key: 'fee', measureKind: 'money' }, 'currency_required'],
      [{ ...GPU, currency: 'EUR' }, 'currency_forbidden'],
      [{ ...GPU, key: 'blank', unit: ' ' }, 'unit_required'],
      [{ kind: 'deleteMeasure', measureId: tokens }, 'measure_in_use'],
    ];
    for (const [command, error] of cases)
      expect(await directory('ada', [command]), error).toEqual({
        status: 409,
        body: { at: 0, kind: command['kind'], error },
      });
    expect(await listed('ada')).toEqual(before);
  });

  it('refuses a foreign definition exactly as an absent one', async () => {
    const theirs = await idOf('grace', 'tokens');
    for (const measureId of [theirs, 'no-such-measure'])
      for (const command of [
        { kind: 'patchMeasure', measureId, patch: { name: 'Stolen' } },
        { kind: 'deleteMeasure', measureId },
      ])
        expect(await directory('ada', [command])).toEqual({
          status: 404,
          body: { at: 0, kind: command.kind, error: 'not_found' },
        });
    expect((await listed('grace')).find((each) => each.key === 'tokens')?.name).toBe('Tokens');
  });

  // Design D70: defining a measure changes what every project's figures mean.
  it('refuses a member every definition write, an admin and a super-admin allowed', async () => {
    const tokens = await idOf('ada', 'tokens');
    for (const command of [
      GPU,
      { kind: 'patchMeasure', measureId: tokens, patch: { name: 'Member tokens' } },
      { kind: 'deleteMeasure', measureId: tokens },
    ])
      expect(await directory('moe', [command]), command.kind).toEqual({
        status: 403,
        body: { at: 0, kind: command.kind, error: 'forbidden' },
      });
    expect((await listed('moe')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
    expect((await listed('moe')).find(({ key }) => key === 'tokens')?.name).toBe('Tokens');
    expect(await directory('sue', [{ ...GPU, ref: 'gpu' }])).toMatchObject({ status: 200 });
    const gpu = await idOf('sue', 'gpu_minutes');
    expect(
      await directory('sue', [{ kind: 'patchMeasure', measureId: gpu, patch: { name: 'GPU' } }]),
    ).toMatchObject({ status: 200 });
    expect(await directory('moe', [{ kind: 'deleteMeasure', measureId: gpu }])).toMatchObject({
      status: 403,
    });
    expect(await directory('ada', [{ kind: 'deleteMeasure', measureId: gpu }])).toMatchObject({
      status: 200,
    });
    expect((await listed('ada')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
  });

  it('refuses a viewer every write and a malformed command at the boundary', async () => {
    expect(await directory('vic', [GPU])).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await directory('ada', [{ ...GPU, key: 'GPU' }])).toEqual({
      status: 400,
      body: { at: 0, kind: 'createMeasure', error: 'key_must_be_a_measure_key' },
    });
    expect((await listed('ada')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
  });
});

describe('budgets and money bases in an organization', () => {
  beforeEach(async () => {
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
  });

  /** A project of org-a with parent P over leaves L and R, and the first step's id. */
  async function plan() {
    const created = await h.call('ada', 'POST', '/api/projects', { name: 'Budgets' });
    if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
    const projectId = (created.body as { project: { id: string } }).project.id;
    const dev = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
      .all(projectId)
      .map(({ id }) => id)
      .at(0);
    if (dev === undefined) throw new Error('the project has no step');
    const run = (commands: readonly unknown[]) =>
      h.call('ada', 'POST', `/api/projects/${projectId}/commands`, { commands });
    const built = await run([
      { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
      {
        kind: 'createWorkItem',
        ref: 'L',
        name: 'L',
        parentRef: 'P',
        parentId: null,
        afterId: null,
      },
      {
        kind: 'createWorkItem',
        ref: 'R',
        name: 'R',
        parentRef: 'P',
        parentId: null,
        afterId: null,
        afterRef: 'L',
      },
    ]);
    if (built.status !== 200) throw new Error(`the tree was refused: ${JSON.stringify(built)}`);
    const ids = (built.body as { results: { ref?: string; id?: string }[] }).results;
    const idOf = (ref: string): string => {
      const id = ids.find((each) => each.ref === ref)?.id;
      if (id === undefined) throw new Error(`no ${ref}`);
      return id;
    };
    return { projectId, dev, run, idOf };
  }

  const cost = (workItemId: string, stepId: string, rateCardDigest?: string) => ({
    kind: 'setMeasure',
    workItemId,
    stepId,
    metric: 'cost',
    value: 10,
    ...(rateCardDigest === undefined ? {} : { rateCardDigest }),
  });

  // Proof: with the `rate_card_required` arm removed from work-item-shapes.ts,
  // this case answered 500 for the unpriced cost fact; watched 2026-10-23.
  it('answers 409 for an unpriced cost fact and reads a parent mixing two cards, naming both', async () => {
    const { projectId, dev, run, idOf } = await plan();
    const [P, L, R] = ['P', 'L', 'R'].map(idOf);
    const unpriced = await run([cost(L, dev)]);
    expect(unpriced).toMatchObject({
      status: 409,
      body: { error: 'rate_card_required', at: 0, kind: 'setMeasure' },
    });
    expect(
      (
        await run([
          cost(L, dev, 'card-b'),
          cost(R, dev, 'card-a'),
          { kind: 'setBudget', workItemId: P, measure: 'cost', cap: 100, policy: 'strict' },
          { kind: 'setBudget', workItemId: L, measure: 'cost', cap: 15, policy: 'advisory' },
        ])
      ).status,
    ).toBe(200);
    const read = await h.call('ada', 'GET', `/api/projects/${projectId}/work-items`);
    const rows = (read.body as { workItems: { id: string; [field: string]: unknown }[] }).workItems;
    const parent = rows.find((each) => each.id === P);
    expect(parent?.['mixedRateCards']).toEqual({
      cost: {
        facts: [
          { currency: 'USD', rateCardDigest: 'card-a' },
          { currency: 'USD', rateCardDigest: 'card-b' },
        ],
      },
    });
    expect(parent?.['budgets']).toBeUndefined();
    expect(rows.find((each) => each.id === L)?.['budgets']).toEqual({
      cost: { cap: 15, policy: 'advisory', source: 'stated', remaining: 5, exceeded: false },
    });
  });

  // Proof: with the `mixed_rate_cards` arm removed from work-item-shapes.ts,
  // this case answered 500; watched 2026-10-23.
  it('refuses a last-child delete whose hand-up would add two cards with 409 naming both', async () => {
    const { dev, run, idOf } = await plan();
    const R = idOf('R');
    expect((await run([{ kind: 'deleteWorkItem', workItemId: R }])).status).toBe(200);
    const L = idOf('L');
    const made = await run([
      { kind: 'createWorkItem', ref: 'A', name: 'A', parentId: L, afterId: null },
      { kind: 'createWorkItem', ref: 'B', name: 'B', parentId: L, afterId: null, afterRef: 'A' },
    ]);
    const kids = (made.body as { results: { ref?: string; id?: string }[] }).results;
    const [A, B] = ['A', 'B'].map((ref) => kids.find((each) => each.ref === ref)?.id ?? '');
    expect((await run([cost(A, dev, 'card-a'), cost(B, dev, 'card-b')])).status).toBe(200);
    // L is P's only child now: deleting it hands its branch up to P.
    expect(
      await run([{ kind: 'deleteWorkItem', workItemId: L, strategy: 'cascade' }]),
    ).toMatchObject({
      status: 409,
      body: {
        error: 'mixed_rate_cards',
        at: 0,
        kind: 'deleteWorkItem',
        bases: [
          { currency: 'USD', rateCardDigest: 'card-a' },
          { currency: 'USD', rateCardDigest: 'card-b' },
        ],
      },
    });
  });
});

describe('measure definitions before activation', () => {
  beforeEach(async () => {
    h = OrganizationHarness.openComposed();
    await h.register('ada');
  });

  it('refuses the list and every write while no organization is marked legacy', async () => {
    expect(await h.call('ada', 'GET', '/api/measures')).toEqual({
      status: 409,
      body: { error: 'organization_required' },
    });
    expect(await directory('ada', [GPU])).toEqual({
      status: 409,
      body: { at: 0, kind: 'createMeasure', error: 'organization_required' },
    });
  });

  it('reads and writes the legacy organization’s definitions', async () => {
    h.sqlite.run(
      "INSERT INTO organization (id, name, legacy, created_at) VALUES ('org-legacy', 'Legacy', 1, 1)",
    );
    h.organization('org-other');
    expect(await directory('ada', [GPU])).toMatchObject({ status: 200 });
    expect((await listed('ada')).map(({ key }) => key)).toEqual([...SEEDED_KEYS, 'gpu_minutes']);
    expect(
      h.sqlite.query("SELECT count(*) AS n FROM measure WHERE organization_id = 'org-other'").get(),
    ).toEqual({ n: 5 });
  });
});
