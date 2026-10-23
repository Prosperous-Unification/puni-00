import type { PlanDocument, PlanDocumentImport } from '@wbs/contracts';
import { classifyPlanDocument } from '@wbs/core';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Plan document version 11 (`wbs-measure-budgets` task 4.4, design D63) over
 * be-01's production composition and real SQLite: one organization's plan
 * holding a defined measure, priced money facts and trios, a three-point
 * tokens trio, budgets and a factor is exported, imported into another
 * organization that lacks the defined measure, and exported again; the two
 * documents' authored content is byte-identical. A definition the importing
 * organization holds in another shape is refused, writing nothing, and a
 * version-10 file still imports onto the seeded definitions.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});

afterEach(() => {
  h.close();
});

const GPU = {
  kind: 'createMeasure',
  key: 'gpu_minutes',
  name: 'GPU minutes',
  unit: 'min',
  measureKind: 'duration',
  scale: 'integer',
  threePoint: true,
} as const;

async function batch(username: string, path: string, commands: unknown[]): Promise<unknown> {
  const answer = await h.call(username, 'POST', path, { commands });
  if (answer.status !== 200) throw new Error(`batch refused: ${JSON.stringify(answer)}`);
  return answer.body;
}

/**
 * Ada's plan: parent P with leaves L1 and L2 on the first step, holding every
 * kind of figure version 11 carries beside the legacy ones version 10 did.
 */
async function measuredPlan(): Promise<string> {
  await batch('ada', '/api/directory/commands', [GPU]);
  const created = await h.call('ada', 'POST', '/api/projects', { name: 'Measured' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const projectId = (created.body as { project: { id: string } }).project.id;
  const step = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
    .get(projectId)?.id;
  if (step === undefined) throw new Error('the project has no step');
  const built = (await batch('ada', `/api/projects/${projectId}/commands`, [
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    {
      kind: 'createWorkItem',
      ref: 'L1',
      name: 'L1',
      parentRef: 'P',
      parentId: null,
      afterId: null,
    },
    {
      kind: 'createWorkItem',
      ref: 'L2',
      name: 'L2',
      parentRef: 'P',
      parentId: null,
      afterId: null,
    },
  ])) as { results: { ref?: string; id?: string }[] };
  const idOf = (ref: string): string => {
    const id = built.results.find((each) => each.ref === ref)?.id;
    if (id === undefined) throw new Error(`no ${ref}`);
    return id;
  };
  const [p, l1, l2] = [idOf('P'), idOf('L1'), idOf('L2')];
  const trio = (workItemId: string, measure: string, points: number[], more = {}) => ({
    kind: 'setMeasureEstimate',
    workItemId,
    stepId: step,
    measure,
    estimate: { optimistic: points[0], realistic: points[1], pessimistic: points[2] },
    ...more,
  });
  await batch('ada', `/api/projects/${projectId}/commands`, [
    { kind: 'setMeasure', workItemId: l1, stepId: step, metric: 'tokens', value: 900 },
    { kind: 'setMeasure', workItemId: l1, stepId: step, metric: 'hours', value: 1.5 },
    {
      kind: 'setMeasure',
      workItemId: l1,
      stepId: step,
      metric: 'cost',
      value: 2_500_000,
      rateCardDigest: 'sha256:card-a',
    },
    { kind: 'setMeasure', workItemId: l2, stepId: step, metric: 'gpu_minutes', value: 45 },
    { kind: 'setMeasure', workItemId: l2, stepId: step, metric: 'token_estimate', value: 700 },
    trio(l1, 'tokens', [100, 200, 600]),
    trio(l2, 'cost', [1_000_000, 2_000_000, 4_000_000], { rateCardDigest: 'sha256:card-a' }),
    trio(l2, 'gpu_minutes', [30, 60, 120]),
    {
      kind: 'setBudget',
      workItemId: p,
      measure: 'tokens',
      cap: 10_000,
      policy: 'strict',
      holdPerAttempt: 500,
    },
    { kind: 'setBudget', workItemId: l2, measure: 'gpu_minutes', cap: 600, policy: 'advisory' },
  ]);
  const patched = await h.call('ada', 'PATCH', `/api/projects/${projectId}`, { budgetFactor: 1.5 });
  if (patched.status !== 200) throw new Error(`patch refused: ${JSON.stringify(patched)}`);
  return projectId;
}

async function exported(username: string, projectId: string): Promise<PlanDocument> {
  const answer = await h.call(username, 'GET', `/api/projects/${projectId}/export?format=json`);
  if (answer.status !== 200) throw new Error(`export refused: ${JSON.stringify(answer)}`);
  return answer.body as PlanDocument;
}

/**
 * The document's authored content, every file-local id replaced by what it
 * names: what an import keeps, so two exports of one plan through an import
 * compare byte for byte.
 */
async function authored(document: PlanDocument): Promise<string> {
  const classified = await classifyPlanDocument(document);
  if (!classified.ok) throw new Error(`refused at ${classified.path}`);
  const file: PlanDocumentImport = structuredClone(classified.value);
  const aliases = new Map<string, string>();
  for (const step of file.steps) aliases.set(step.id, `step:${step.name}`);
  for (const row of file.workItems) aliases.set(row.id, `row:${row.name}`);
  file.document.exportedAt = '<stamp>';
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') return aliases.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [aliases.get(key) ?? key, replace(field)]),
    );
  };
  return JSON.stringify(replace(file));
}

for (const mode of ['isolated', 'shared'] as const) {
  describe(`version 11 (${mode})`, () => {
    beforeEach(() => {
      if (mode === 'shared') {
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id IN ('org-a', 'org-b')");
      }
    });

    it('round-trips a version-11 plan byte for byte into an organization lacking a measure', async () => {
      const source = await exported('ada', await measuredPlan());
      expect({
        version: source.document.version,
        factor: source.settings.budgetFactor,
        definitions: source.measureDefinitions?.map(({ key }) => key),
        facts: source.measureFacts?.map(({ measure, value, basis }) => ({ measure, value, basis })),
        estimates: source.measureEstimates?.map(({ measure, pessimistic, basis }) => ({
          measure,
          pessimistic,
          basis,
        })),
        budgets: source.budgets?.map(({ measure, cap, policy, holdPerAttempt }) => ({
          measure,
          cap,
          policy,
          holdPerAttempt,
        })),
      }).toEqual({
        version: 11,
        factor: 1.5,
        definitions: ['tokens', 'cost', 'gpu_minutes'],
        // In tree order (a created row goes first among its siblings: P, L2,
        // L1), then step, then key.
        facts: [
          { measure: 'gpu_minutes', value: 45, basis: null },
          {
            measure: 'cost',
            value: 2_500_000,
            basis: { currency: 'USD', rateCardDigest: 'sha256:card-a' },
          },
        ],
        estimates: [
          {
            measure: 'cost',
            pessimistic: 4_000_000,
            basis: { currency: 'USD', rateCardDigest: 'sha256:card-a' },
          },
          { measure: 'gpu_minutes', pessimistic: 120, basis: null },
          { measure: 'tokens', pessimistic: 600, basis: null },
        ],
        budgets: [
          { measure: 'tokens', cap: 10_000, policy: 'strict', holdPerAttempt: 500 },
          { measure: 'gpu_minutes', cap: 600, policy: 'advisory', holdPerAttempt: null },
        ],
      });
      const imported = await h.call('grace', 'POST', '/api/projects/import', source);
      expect(imported.status).toBe(201);
      const listed = await h.call('grace', 'GET', '/api/measures');
      expect(
        (listed.body as { measures: { key: string; unit: string }[] }).measures.map(
          ({ key, unit }) => `${key}:${unit}`,
        ),
      ).toEqual([
        'time:days',
        'tokens:tokens',
        'hours:hours',
        'cost:micro-USD',
        'agent_minutes:minutes',
        'gpu_minutes:min',
      ]);
      const copy = await exported('grace', (imported.body as { projectId: string }).projectId);
      expect(await authored(copy)).toBe(await authored(source));
    });
  });
}

it('refuses a definition the organization holds in another shape, writing nothing', async () => {
  const source = await exported('ada', await measuredPlan());
  await batch('grace', '/api/directory/commands', [{ ...GPU, scale: 'real' }]);
  const counted = () =>
    h.sqlite
      .query<{ projects: number; measures: number }, []>(
        'SELECT (SELECT COUNT(*) FROM project) AS projects, (SELECT COUNT(*) FROM measure) AS measures',
      )
      .get();
  const before = counted();
  const refused = await h.call('grace', 'POST', '/api/projects/import', source);
  expect(refused).toMatchObject({
    status: 409,
    body: {
      error: 'source_refused',
      path: 'measureDefinitions[2].scale',
      detail: 'measure_shape_mismatch',
    },
  });
  expect(counted()).toEqual(before);
});

it('imports a version-10 file onto the seeded definitions, mapping its legacy metrics', async () => {
  const document = planDocumentFixture();
  document.document.version = 10;
  const row = document.workItems.at(0);
  if (row === undefined) throw new Error('fixture has no row');
  row.measures = { token_actual: { 'step-1': 900 }, hours_actual: { 'step-1': 4 } };
  // Version 7 on keys attempts by step code; this row has none.
  Reflect.deleteProperty(row, 'attempts');
  const imported = await h.call('grace', 'POST', '/api/projects/import', document);
  expect(imported.status).toBe(201);
  const listed = await h.call('grace', 'GET', '/api/measures');
  expect((listed.body as { measures: unknown[] }).measures).toHaveLength(5);
  const copy = await exported('grace', (imported.body as { projectId: string }).projectId);
  expect(copy.document.version).toBe(10);
  expect(copy.workItems.at(0)?.measures).toEqual({
    hours_actual: { [copy.steps.find(({ code }) => code === 'impl')?.id ?? 'impl']: 4 },
    token_actual: { [copy.steps.find(({ code }) => code === 'impl')?.id ?? 'impl']: 900 },
  });
});

it('undo of a delete puts a priced fact back with its basis', async () => {
  // A restore replays a delete's journal, which this release reads only with
  // direct blockages active.
  activateTestStepBlockages(h.sqlite.filename);
  const projectId = await measuredPlan();
  const pricedFacts = () =>
    h.sqlite
      .query<{ value: number; currency: string | null; digest: string | null }, [string]>(
        `SELECT sm.value, sm.currency, sm.rate_card_digest AS digest
           FROM step_measure sm JOIN work_item wi ON wi.id = sm.work_item_id
          WHERE wi.project_id = ? AND (sm.currency IS NOT NULL OR sm.rate_card_digest IS NOT NULL)`,
      )
      .all(projectId);
  const before = pricedFacts();
  expect(before).toEqual([{ value: 2_500_000, currency: 'USD', digest: 'sha256:card-a' }]);
  const parent = h.sqlite
    .query<{ id: string }, [string]>("SELECT id FROM work_item WHERE project_id = ? AND name = 'P'")
    .get(projectId)?.id;
  await batch('ada', `/api/projects/${projectId}/commands`, [
    { kind: 'deleteWorkItem', workItemId: parent, strategy: 'cascade' },
  ]);
  expect(pricedFacts()).toEqual([]);
  expect(await h.call('ada', 'POST', `/api/projects/${projectId}/undo`)).toMatchObject({
    status: 200,
  });
  expect(pricedFacts()).toEqual(before);
});

it('saved plan compare names a change in a trio, a budget, a basis and the factor', async () => {
  const projectId = await measuredPlan();
  const saved = await h.call('ada', 'POST', `/api/projects/${projectId}/saved-plans`, {
    name: 'Before',
  });
  expect(saved.status).toBe(201);
  const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
  const compare = async () => {
    const answer = await h.call(
      'ada',
      'GET',
      `/api/projects/${projectId}/saved-plans/compare?left=${savedId}&right=current`,
    );
    if (answer.status !== 200) throw new Error(`compare refused: ${JSON.stringify(answer)}`);
    return (
      answer.body as { diff: { input: { category: string; path: string }[] } }
    ).diff.input.map(({ category, path }) => `${category} ${path.replace(/\[.*\]/, '[…]')}`);
  };
  expect(await compare()).toEqual([]);
  const id = (name: string) =>
    h.sqlite
      .query<{ id: string }, [string, string]>(
        'SELECT id FROM work_item WHERE project_id = ? AND name = ?',
      )
      .get(projectId, name)?.id;
  const step = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
    .get(projectId)?.id;
  await batch('ada', `/api/projects/${projectId}/commands`, [
    {
      kind: 'setMeasureEstimate',
      workItemId: id('L2'),
      stepId: step,
      measure: 'gpu_minutes',
      estimate: { optimistic: 30, realistic: 60, pessimistic: 240 },
    },
    {
      kind: 'setBudget',
      workItemId: id('L2'),
      measure: 'gpu_minutes',
      cap: 900,
      policy: 'advisory',
    },
    {
      kind: 'setMeasure',
      workItemId: id('L1'),
      stepId: step,
      metric: 'cost',
      value: 2_500_000,
      rateCardDigest: 'sha256:card-b',
    },
  ]);
  await h.call('ada', 'PATCH', `/api/projects/${projectId}`, { budgetFactor: 2 });
  expect((await compare()).sort()).toEqual(
    [
      'measures budgets[…].cap',
      'measures measureEstimates[…].pessimistic',
      'measures measures[…].rateCardDigest',
      'settings project.budgetFactor',
    ].sort(),
  );
});
