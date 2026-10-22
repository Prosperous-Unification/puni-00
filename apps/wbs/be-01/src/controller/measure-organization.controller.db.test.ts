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
    for (const username of ['ada', 'grace', 'vic']) await h.register(username);
    h.organization('org-a');
    h.organization('org-b');
    h.member('org-a', 'ada', 'member');
    h.member('org-a', 'vic', 'viewer');
    h.member('org-b', 'grace', 'member');
    h.bind('ada', 'org-a');
    h.bind('vic', 'org-a');
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

  it('refuses a viewer every write and a malformed command at the boundary', async () => {
    expect(await directory('vic', [GPU])).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(await directory('ada', [{ ...GPU, key: 'GPU' }])).toEqual({
      status: 400,
      body: { at: 0, kind: 'createMeasure', error: 'key_must_be_a_measure_key' },
    });
    expect((await listed('ada')).map(({ key }) => key)).toEqual(SEEDED_KEYS);
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
