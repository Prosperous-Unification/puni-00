import { applyWorkPackageCommands, type SchemaShape, validateSchema } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Every refusal code `wbs-measure-budgets` slices 1 to 4 introduced, driven
 * through HTTP on each route that can answer it (task 4.1): the directory
 * batch, the work package batch, the work package patch. Each row names the request and
 * the exact status and body; none may reach the 500 an undeclared or unmapped
 * refusal answers. Over real SQLite and the production organization access
 * ({@link OrganizationHarness.openComposed}). The headroom read's own
 * refusals are in `budget-headroom.controller.db.test.ts`.
 */
let h: OrganizationHarness;
let workPackageId: string;
let dev: string;
let parent: string;
let leaf: string;
let tokensId: string;
let timeId: string;
let foreignTokensId: string;

interface Row {
  readonly route: 'directory' | 'work_package';
  readonly command: Record<string, unknown>;
  readonly status: number;
  readonly error: string;
  readonly detail?: Record<string, unknown>;
}

const GPU = {
  kind: 'createMeasure',
  key: 'gpu_minutes',
  name: 'GPU minutes',
  unit: 'min',
  measureKind: 'duration',
  scale: 'integer',
} as const;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  // An admin: definition writes are an admin's (design D70).
  h.member('org-a', 'ada', 'admin', ['org-admin']);
  h.member('org-b', 'grace', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-b', 'grace', ['organization.create_project']);
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/work-packages', { name: 'Refusals' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  workPackageId = (created.body as { workPackage: { id: string } }).workPackage.id;
  const first = h.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE work_package_id = ? ORDER BY position',
    )
    .get(workPackageId)?.id;
  if (first === undefined) throw new Error('the work package has no step');
  dev = first;
  const built = await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
      {
        kind: 'createWorkItem',
        ref: 'L',
        name: 'L',
        parentRef: 'P',
        parentId: null,
        afterId: null,
      },
    ],
  });
  const results = (built.body as { results: { ref?: string; id?: string }[] }).results;
  const idOf = (ref: string): string => {
    const id = results.find((each) => each.ref === ref)?.id;
    if (id === undefined) throw new Error(`no ${ref}: ${JSON.stringify(built)}`);
    return id;
  };
  [parent, leaf] = [idOf('P'), idOf('L')];
  const measureId = async (username: string, key: string): Promise<string> => {
    const listed = await h.call(username, 'GET', '/api/measures');
    const found = (listed.body as { measures: { id: string; key: string }[] }).measures.find(
      (each) => each.key === key,
    );
    if (found === undefined) throw new Error(`${username} lists no ${key}`);
    return found.id;
  };
  tokensId = await measureId('ada', 'tokens');
  timeId = await measureId('ada', 'time');
  foreignTokensId = await measureId('grace', 'tokens');
});

afterEach(() => {
  h.close();
});

/** The directory commands' refusals; each is answered alike by the work package batch. */
function definitionRows(): Omit<Row, 'route'>[] {
  const patch = (measureId: string, fields: Record<string, unknown>) => ({
    kind: 'patchMeasure',
    measureId,
    patch: fields,
  });
  return [
    { command: { ...GPU, key: 'tokens' }, status: 409, error: 'measure_key_taken' },
    { command: { ...GPU, schedulesWork: true }, status: 409, error: 'second_scheduling_measure' },
    { command: patch(tokensId, { key: 'x' }), status: 409, error: 'measure_key_immutable' },
    { command: patch(tokensId, { scale: 'real' }), status: 409, error: 'measure_shape_immutable' },
    {
      command: patch(timeId, { schedulesWork: false }),
      status: 409,
      error: 'scheduling_measure_fixed',
    },
    { command: { ...GPU, measureKind: 'money' }, status: 409, error: 'currency_required' },
    { command: { ...GPU, currency: 'EUR' }, status: 409, error: 'currency_forbidden' },
    { command: { ...GPU, unit: ' ' }, status: 409, error: 'unit_required' },
    {
      command: { kind: 'deleteMeasure', measureId: tokensId },
      status: 409,
      error: 'measure_in_use',
    },
    {
      command: { kind: 'deleteMeasure', measureId: foreignTokensId },
      status: 404,
      error: 'not_found',
    },
    { command: { ...GPU, key: 'GPU' }, status: 400, error: 'key_must_be_a_measure_key' },
    {
      command: { ...GPU, unit: 'u'.repeat(41) },
      status: 400,
      error: 'unit_must_be_at_most_40_characters',
    },
    {
      command: patch(tokensId, { measureKind: 'mass' }),
      status: 400,
      error: 'measureKind_must_be_duration_count_or_money',
    },
    {
      command: patch(tokensId, { scale: 'whole' }),
      status: 400,
      error: 'scale_must_be_integer_or_real',
    },
    {
      command: { ...GPU, order: -1 },
      status: 400,
      error: 'order_must_be_a_whole_number_from_0_to_1000000',
    },
    {
      command: { ...GPU, measureKind: 'money', currency: 'eur' },
      status: 400,
      error: 'currency_must_be_three_capital_letters',
    },
    {
      command: { kind: 'deleteMeasure', measureId: 5 },
      status: 400,
      error: 'measureId_must_be_an_id',
    },
    {
      command: { kind: 'deleteMeasure', measureRef: 5 },
      status: 400,
      error: 'measureRef_must_be_an_id',
    },
    { command: patch(tokensId, { unit: 5 }), status: 400, error: 'unit_must_be_text' },
    {
      command: patch(tokensId, { threePoint: 'yes' }),
      status: 400,
      error: 'threePoint_must_be_true_or_false',
    },
    {
      command: patch(tokensId, { showByDefault: 'yes' }),
      status: 400,
      error: 'showByDefault_must_be_true_or_false',
    },
    {
      command: patch(tokensId, { schedulesWork: 'yes' }),
      status: 400,
      error: 'schedulesWork_must_be_true_or_false',
    },
  ];
}

/** The plan commands' refusals, which only the work package batch can answer. */
function planRows(): Omit<Row, 'route'>[] {
  const fact = (metric: string, value: number, more: Record<string, unknown> = {}) => ({
    kind: 'setMeasure',
    workItemId: leaf,
    stepId: dev,
    metric,
    value,
    ...more,
  });
  const trio = (measure: string, workItemId = leaf, points = [1, 2, 3]) => ({
    kind: 'setMeasureEstimate',
    workItemId,
    stepId: dev,
    measure,
    estimate: { optimistic: points[0], realistic: points[1], pessimistic: points[2] },
  });
  const budget = (measure: string, cap: number, more: Record<string, unknown> = {}) => ({
    kind: 'setBudget',
    workItemId: parent,
    measure,
    cap,
    policy: 'strict',
    ...more,
  });
  return [
    { command: fact('story_points', 1), status: 404, error: 'unknown_measure' },
    {
      command: { kind: 'clearMeasureEstimate', workItemId: leaf, stepId: dev, measure: 'nope' },
      status: 404,
      error: 'unknown_measure',
    },
    { command: budget('token_actual', 1), status: 404, error: 'unknown_measure' },
    { command: fact('agent_minutes', 1), status: 409, error: 'derived_measure' },
    { command: fact('time', 1), status: 409, error: 'scheduling_measure_fact' },
    { command: fact('tokens', 1.5), status: 409, error: 'scale_mismatch' },
    { command: trio('tokens', leaf, [1, 1.5, 2]), status: 409, error: 'scale_mismatch' },
    { command: budget('tokens', 1.5), status: 409, error: 'scale_mismatch' },
    { command: trio('time'), status: 409, error: 'scheduling_measure_estimate' },
    { command: trio('hours'), status: 409, error: 'three_point_forbidden' },
    { command: trio('tokens', parent), status: 409, error: 'rolled_up' },
    { command: budget('time', 1), status: 409, error: 'scheduling_measure_budget' },
    {
      command: { kind: 'clearBudget', workItemId: parent, measure: 'time' },
      status: 409,
      error: 'scheduling_measure_budget',
    },
    { command: fact('cost', 1), status: 409, error: 'rate_card_required' },
    { command: trio('cost'), status: 409, error: 'rate_card_required' },
    {
      command: fact('tokens', 1, { rateCardDigest: 'card' }),
      status: 409,
      error: 'rate_card_forbidden',
    },
    { command: fact('tokens', -1), status: 400, error: 'invalid_measure' },
    { command: trio('tokens', leaf, [3, 2, 1]), status: 400, error: 'invalid_estimate' },
    { command: budget('tokens', -1), status: 400, error: 'invalid_budget' },
    { command: budget('tokens', 1, { holdPerAttempt: -1 }), status: 400, error: 'invalid_budget' },
    { command: budget('tokens', 1, { policy: 'hard' }), status: 400, error: 'invalid_budget' },
    {
      command: fact('cost', 1, { rateCardDigest: '' }),
      status: 400,
      error: 'rateCardDigest_must_be_1_to_128_characters',
    },
  ];
}

function table(): Row[] {
  return [
    ...definitionRows().map((row) => ({ ...row, route: 'directory' as const })),
    ...definitionRows().map((row) => ({ ...row, route: 'work_package' as const })),
    ...planRows().map((row) => ({ ...row, route: 'work_package' as const })),
    // A plan command has no work package to run in from the directory batch.
    {
      route: 'directory',
      command: {
        kind: 'setBudget',
        workItemId: parent,
        measure: 'tokens',
        cap: 1,
        policy: 'strict',
      },
      status: 400,
      error: 'work_package_required',
    },
  ];
}

/**
 * Every refusal code `wbs-measure-budgets` slices 1 to 4 added to the
 * command parser's and the batch's enumerations (contracts
 * `command-parser-refusal.ts` `PARSER_CODES`, `work-item-shapes.ts`
 * `plainRefusals`, design D47), by hand: the table must drive each (D51).
 * `mixed_rate_cards` and `organization_required` are driven by their own
 * cases below, which need a tree or no organization.
 */
const MEASURE_BUDGET_CODES = [
  'invalid_budget',
  'rateCardDigest_must_be_1_to_128_characters',
  'measureId_must_be_an_id',
  'measureRef_must_be_an_id',
  'key_must_be_a_measure_key',
  'unit_must_be_text',
  'unit_must_be_at_most_40_characters',
  'measureKind_must_be_duration_count_or_money',
  'scale_must_be_integer_or_real',
  'threePoint_must_be_true_or_false',
  'showByDefault_must_be_true_or_false',
  'schedulesWork_must_be_true_or_false',
  'order_must_be_a_whole_number_from_0_to_1000000',
  'currency_must_be_three_capital_letters',
  'unknown_measure',
  'derived_measure',
  'scheduling_measure_fact',
  'scale_mismatch',
  'scheduling_measure_estimate',
  'three_point_forbidden',
  'scheduling_measure_budget',
  'rate_card_required',
  'rate_card_forbidden',
  'measure_key_taken',
  'measure_key_immutable',
  'measure_shape_immutable',
  'second_scheduling_measure',
  'scheduling_measure_fixed',
  'currency_required',
  'currency_forbidden',
  'unit_required',
  'measure_in_use',
] as const;

function send(route: Row['route'], commands: readonly unknown[]) {
  const path =
    route === 'directory'
      ? '/api/directory/commands'
      : `/api/work-packages/${workPackageId}/commands`;
  return h.call('ada', 'POST', path, { commands });
}

describe('measure refusals through every batch', () => {
  // Proof: with the `scale_mismatch` arm removed from the batch 409 refusals
  // (work-item-shapes.ts), the three scale_mismatch rows answered 500
  // "returned an undeclared refusal"; watched 2026-10-23.
  it('answers each code with its declared status and body, writing nothing', async () => {
    const before = h.sqlite
      .query(
        'SELECT (SELECT count(*) FROM measure) AS m, (SELECT count(*) FROM step_measure) AS f, (SELECT count(*) FROM measure_estimate) AS e, (SELECT count(*) FROM work_item_budget) AS b',
      )
      .get();
    const answers = [];
    for (const row of table()) {
      const answer = await send(row.route, [row.command]);
      answers.push({ route: row.route, kind: row.command['kind'], ...answer });
    }
    expect(answers).toEqual(
      table().map((row) => ({
        route: row.route,
        kind: row.command['kind'],
        status: row.status,
        body: { at: 0, kind: row.command['kind'], error: row.error, ...row.detail },
      })),
    );
    expect(
      h.sqlite
        .query(
          'SELECT (SELECT count(*) FROM measure) AS m, (SELECT count(*) FROM step_measure) AS f, (SELECT count(*) FROM measure_estimate) AS e, (SELECT count(*) FROM work_item_budget) AS b',
        )
        .get(),
    ).toEqual(before);
  });

  // Proof: with the `unit_must_be_text` row removed from the table, this case
  // named it as missing; watched 2026-10-23.
  it('drives every code the change added, each one the batch declares', async () => {
    const driven = new Set(table().map((row) => row.error));
    expect(MEASURE_BUDGET_CODES.filter((code) => !driven.has(code))).toEqual([]);
    const undeclared = [];
    for (const row of table()) {
      const body = { at: 0, kind: row.command['kind'], error: row.error };
      let admitted = false;
      for (const refusal of applyWorkPackageCommands.refusals) {
        if (refusal.status !== row.status || !('schema' in refusal)) continue;
        const schema: SchemaShape<unknown> = refusal.schema;
        if ('value' in (await validateSchema(schema, body))) admitted = true;
      }
      if (!admitted) undeclared.push(row.error);
    }
    expect(undeclared).toEqual([]);
  });

  it('answers a hand-up across two rate cards with 409 naming both', async () => {
    const made = await send('work_package', [
      { kind: 'createWorkItem', ref: 'A', name: 'A', parentId: leaf, afterId: null },
      { kind: 'createWorkItem', ref: 'B', name: 'B', parentId: leaf, afterId: null, afterRef: 'A' },
    ]);
    const kids = (made.body as { results: { ref?: string; id?: string }[] }).results;
    const [a, b] = ['A', 'B'].map((ref) => kids.find((each) => each.ref === ref)?.id ?? '');
    const priced = (workItemId: string, rateCardDigest: string) => ({
      kind: 'setMeasure',
      workItemId,
      stepId: dev,
      metric: 'cost',
      value: 10,
      rateCardDigest,
    });
    expect((await send('work_package', [priced(a, 'card-b'), priced(b, 'card-a')])).status).toBe(
      200,
    );
    // `leaf` is `parent`'s only child: deleting it hands its branch up.
    expect(
      await send('work_package', [
        { kind: 'deleteWorkItem', workItemId: leaf, strategy: 'cascade' },
      ]),
    ).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'deleteWorkItem',
        error: 'mixed_rate_cards',
        bases: [
          { currency: 'USD', rateCardDigest: 'card-a' },
          { currency: 'USD', rateCardDigest: 'card-b' },
        ],
      },
    });
  });
});

describe('measure refusals on the work package patch', () => {
  it('refuses numeric package-level factor overrides with409 and a malformed value with422', async () => {
    for (const budgetFactor of [0, -1, 1001])
      expect(
        await h.call('ada', 'PATCH', `/api/work-packages/${workPackageId}`, { budgetFactor }),
      ).toEqual({
        status: 409,
        body: { error: 'not_overridable_here', key: 'budgetFactor', level: 'work_package' },
      });
    // The patch's structural refusal, as for every other setting.
    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${workPackageId}`, { budgetFactor: 'two' }),
    ).toEqual({ status: 422, body: { error: 'invalid_body' } });
    const read = await h.call('ada', 'GET', `/api/work-packages/${workPackageId}`);
    expect((read.body as { workPackage: { budgetFactor?: number } }).workPackage.budgetFactor).toBe(
      1,
    );
  });
});

describe('measure refusals before activation', () => {
  it('answers a definition write with 409 organization_required on both batches', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    const created = await h.call('ada', 'POST', '/api/work-packages', { name: 'Legacy' });
    const legacy = (created.body as { workPackage: { id: string } }).workPackage.id;
    for (const path of ['/api/directory/commands', `/api/work-packages/${legacy}/commands`])
      expect(await h.call('ada', 'POST', path, { commands: [GPU] })).toEqual({
        status: 409,
        body: { at: 0, kind: 'createMeasure', error: 'organization_required' },
      });
  });
});
