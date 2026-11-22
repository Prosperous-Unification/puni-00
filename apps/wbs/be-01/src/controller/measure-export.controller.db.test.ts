import type { PlanDocument, PlanDocumentImport } from '@wbs/contracts';
import { classifyPlanDocument } from '@wbs/core';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Plan document version 15 (`wbs-measure-budgets` task 4.4, design D63) over
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
  for (const username of ['ada', 'grace', 'moe']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  for (const [id, organization, creator] of [
    ['measure-parent-a', 'org-a', 'ada'],
    ['measure-parent-b', 'org-b', 'grace'],
  ] as const)
    seedProject(id, organization, creator);
  // Defining a measure, directly or by import, is an admin's act (design D70).
  h.member('org-a', 'ada', 'admin', ['org-admin']);
  h.member('org-b', 'grace', 'admin', ['org-admin']);
  h.member('org-b', 'moe', 'member', ['project-contributor', 'org-viewer']);
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.bind('moe', 'org-b');
  h.activate();
  await setFactor('ada', 'measure-parent-a', 1.5);
});

afterEach(async () => {
  await h.closeComposed();
});

function seedProject(projectId: string, organizationId: string, username: string): void {
  h.sqlite.run(
    'INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,?,?,1,?)',
    [projectId, organizationId, projectId, h.userId(username)],
  );
  for (const step of planDocumentFixture().steps) {
    if (step.code === null) throw new Error('catalogue fixture requires a step code');
    const id = organizationId + '-' + step.code;
    h.sqlite.run(
      "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES(?,?,?,?,?,?,?,'project',?,'authored')",
      [
        id,
        organizationId,
        step.code,
        step.name.trim(),
        step.estimateUnit,
        step.allowancePercent * 100,
        step.position,
        projectId,
      ],
    );
    h.sqlite.run(
      "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,position,origin) VALUES(?,?,'project',?,?,?,'authored')",
      [id + '-binding', organizationId, projectId, id, step.position],
    );
  }
}

async function measuredStep(workPackageId: string): Promise<string> {
  const read = await h.call('ada', 'GET', `/api/work-packages/${workPackageId}`);
  if (read.status !== 200) throw new Error('package read refused: ' + JSON.stringify(read));
  const step = (read.body as { steps: { id: string; code: string | null }[] }).steps.find(
    ({ code }) => code === 'impl',
  );
  if (!step) throw new Error('measured package lacks its implementation step');
  return step.id;
}

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
  const created = await h.call('ada', 'POST', '/api/work-packages', {
    name: 'Measured',
    projectId: 'measure-parent-a',
  });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const workPackageId = (created.body as { workPackage: { id: string } }).workPackage.id;
  const step = await measuredStep(workPackageId);
  const built = (await batch('ada', `/api/work-packages/${workPackageId}/commands`, [
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
  await batch('ada', `/api/work-packages/${workPackageId}/commands`, [
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
  return workPackageId;
}

async function setFactor(username: string, projectId: string, budgetFactor: number): Promise<void> {
  const answer = await h.call(username, 'PATCH', `/api/projects/${projectId}/settings`, {
    budgetFactor,
  });
  if (answer.status !== 200) throw new Error('project settings refused: ' + JSON.stringify(answer));
}

async function exported(username: string, workPackageId: string): Promise<PlanDocument> {
  const answer = await h.call(
    username,
    'GET',
    `/api/work-packages/${workPackageId}/export?format=json`,
  );
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
  describe(`version 15 (${mode})`, () => {
    beforeEach(() => {
      if (mode === 'shared') {
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id IN ('org-a', 'org-b')");
      }
    });

    it('round-trips a version-15 plan byte for byte into an organization lacking a measure', async () => {
      await setFactor('grace', 'measure-parent-b', 1.5);
      const source = await exported('ada', await measuredPlan());
      expect({
        version: source.document.version,
        factor: source.settings.budgetFactor,
        definitions: source.measureDefinitions.map(({ key }) => key),
        facts: source.measureFacts.map(({ measure, value, basis }) => ({ measure, value, basis })),
        estimates: source.measureEstimates.map(({ measure, pessimistic, basis }) => ({
          measure,
          pessimistic,
          basis,
        })),
        budgets: source.budgets.map(({ measure, cap, policy, holdPerAttempt }) => ({
          measure,
          cap,
          policy,
          holdPerAttempt,
        })),
      }).toEqual({
        version: 15,
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
      const imported = await h.call('grace', 'POST', '/api/work-packages/import', {
        projectId: 'measure-parent-b',
        document: source,
      });
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
      const copy = await exported(
        'grace',
        (imported.body as { workPackageId: string }).workPackageId,
      );
      expect(await authored(copy)).toBe(await authored(source));
    });
  });
}

it('refuses a definition the organization holds in another shape, writing nothing', async () => {
  await setFactor('grace', 'measure-parent-b', 1.5);
  const source = await exported('ada', await measuredPlan());
  await batch('grace', '/api/directory/commands', [{ ...GPU, scale: 'real' }]);
  const counted = () =>
    h.sqlite
      .query<{ workPackages: number; measures: number }, []>(
        'SELECT (SELECT COUNT(*) FROM work_package) AS workPackages, (SELECT COUNT(*) FROM measure) AS measures',
      )
      .get();
  const before = counted();
  const refused = await h.call('grace', 'POST', '/api/work-packages/import', {
    projectId: 'measure-parent-b',
    document: source,
  });
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

it("refuses a member's import that would define a measure, writing nothing", async () => {
  h.grant('org-b', 'moe', 'project-manager', 'project', 'measure-parent-b');
  await setFactor('grace', 'measure-parent-b', 1.5);
  const source = await exported('ada', await measuredPlan());
  const counted = () =>
    h.sqlite
      .query<{ workPackages: number; measures: number }, []>(
        'SELECT (SELECT COUNT(*) FROM work_package) AS workPackages, (SELECT COUNT(*) FROM measure) AS measures',
      )
      .get();
  const before = counted();
  expect(
    await h.call('moe', 'POST', '/api/work-packages/import', {
      projectId: 'measure-parent-b',
      document: source,
    }),
  ).toEqual({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_directory' },
  });
  expect(counted()).toEqual(before);
  // Once an admin has defined it, the member's import only matches it.
  await batch('grace', '/api/directory/commands', [GPU]);
  expect(
    (
      await h.call('moe', 'POST', '/api/work-packages/import', {
        projectId: 'measure-parent-b',
        document: source,
      })
    ).status,
  ).toBe(201);
});

it('imports a version-10 file onto the seeded definitions, mapping its legacy metrics', async () => {
  const document = planDocumentFixture();
  document.document.version = 10;
  const row = document.workItems.at(0);
  if (row === undefined) throw new Error('fixture has no row');
  row.measures = { token_actual: { 'step-1': 900 }, hours_actual: { 'step-1': 4 } };
  // Version 7 on keys attempts by step code; this row has none.
  Reflect.deleteProperty(row, 'attempts');
  const imported = await h.call('grace', 'POST', '/api/work-packages/import', {
    projectId: 'measure-parent-b',
    document,
  });
  expect(imported.status).toBe(201);
  const listed = await h.call('grace', 'GET', '/api/measures');
  expect((listed.body as { measures: unknown[] }).measures).toHaveLength(5);
  const copy = await exported('grace', (imported.body as { workPackageId: string }).workPackageId);
  expect(copy.document.version).toBe(15);
  expect(copy.workItems.at(0)?.measures).toEqual({
    hours_actual: { [copy.steps.find(({ code }) => code === 'impl')?.id ?? 'impl']: 4 },
    token_actual: { [copy.steps.find(({ code }) => code === 'impl')?.id ?? 'impl']: 900 },
  });
});

it('undo of a delete puts a priced fact back with its basis', async () => {
  // A restore replays a delete's journal, which this release reads only with
  // direct blockages active.
  activateTestStepBlockages(h.sqlite.filename);
  const workPackageId = await measuredPlan();
  const pricedFacts = () =>
    h.sqlite
      .query<{ value: number; currency: string | null; digest: string | null }, [string]>(
        `SELECT sm.value, sm.currency, sm.rate_card_digest AS digest
           FROM step_measure sm JOIN work_item wi ON wi.id = sm.work_item_id
          WHERE wi.work_package_id = ? AND (sm.currency IS NOT NULL OR sm.rate_card_digest IS NOT NULL)`,
      )
      .all(workPackageId);
  const before = pricedFacts();
  expect(before).toEqual([{ value: 2_500_000, currency: 'USD', digest: 'sha256:card-a' }]);
  const parent = h.sqlite
    .query<{ id: string }, [string]>(
      "SELECT id FROM work_item WHERE work_package_id = ? AND name = 'P'",
    )
    .get(workPackageId)?.id;
  await batch('ada', `/api/work-packages/${workPackageId}/commands`, [
    { kind: 'deleteWorkItem', workItemId: parent, strategy: 'cascade' },
  ]);
  expect(pricedFacts()).toEqual([]);
  expect(await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/undo`)).toMatchObject({
    status: 200,
  });
  expect(pricedFacts()).toEqual(before);
});

it('saved plan compare names a change in a trio, a budget, a basis and the factor', async () => {
  const workPackageId = await measuredPlan();
  const saved = await h.call('ada', 'POST', `/api/work-packages/${workPackageId}/saved-plans`, {
    name: 'Before',
  });
  expect(saved.status).toBe(201);
  const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
  const compare = async () => {
    const answer = await h.call(
      'ada',
      'GET',
      `/api/work-packages/${workPackageId}/saved-plans/compare?left=${savedId}&right=current`,
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
        'SELECT id FROM work_item WHERE work_package_id = ? AND name = ?',
      )
      .get(workPackageId, name)?.id;
  const step = await measuredStep(workPackageId);
  await batch('ada', `/api/work-packages/${workPackageId}/commands`, [
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
  await setFactor('ada', 'measure-parent-a', 2);
  expect((await compare()).sort()).toEqual(
    [
      'measures budgets[…].cap',
      'measures measureEstimates[…].pessimistic',
      'measures measures[…].rateCardDigest',
      'settings workPackage.budgetFactor',
    ].sort(),
  );
});

it('rolls back a definition it created when a later definition refuses, writing nothing', async () => {
  await setFactor('grace', 'measure-parent-b', 1.5);
  const source = await exported('ada', await measuredPlan());
  await batch('grace', '/api/directory/commands', [
    { ...GPU, key: 'render_minutes', name: 'Render minutes', scale: 'real' },
  ]);
  // After `gpu_minutes`, which org-b lacks and the import creates first.
  source.measureDefinitions.push({
    key: 'render_minutes',
    name: 'Render minutes',
    unit: 'min',
    kind: 'duration',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 7,
    currency: null,
  });
  const counted = () =>
    h.sqlite
      .query<{ workPackages: number; gpu: number }, []>(
        "SELECT (SELECT COUNT(*) FROM work_package) AS workPackages, (SELECT COUNT(*) FROM measure WHERE organization_id = 'org-b' AND key = 'gpu_minutes') AS gpu",
      )
      .get();
  const before = counted();
  const refused = await h.call('grace', 'POST', '/api/work-packages/import', {
    projectId: 'measure-parent-b',
    document: source,
  });
  // Proof: with `ImportService.import` committing on a `resolveMeasures`
  // refusal (`commit: true`), this case found org-b holding `gpu_minutes`
  // (gpu 1, expected 0); watched 2026-10-23.
  expect({ refused, after: counted() }).toMatchObject({
    refused: {
      status: 409,
      body: {
        error: 'source_refused',
        path: 'measureDefinitions[3].scale',
        detail: 'measure_shape_mismatch',
      },
    },
    after: { workPackages: before?.workPackages, gpu: 0 },
  });
});

it('before activation, with a legacy organization: re-import of its own v15 export succeeds and matches its definitions', async () => {
  // This file's setup activates; legacy access needs a harness that has not.
  await h.closeComposed();
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.sqlite.run(
    "INSERT INTO organization (id, name, legacy, created_at) VALUES ('org-legacy', 'Legacy', 1, 1)",
  );
  seedProject('measure-parent-a', 'org-legacy', 'ada');
  await h.publicWrites().uow.run(async ({ stores }) => {
    const target = await stores.settings.readTarget(
      { level: 'project', id: 'measure-parent-a' },
      null,
    );
    if (target === null) throw new Error('legacy measure project is absent');
    expect(
      await stores.settings.write(
        target,
        { key: 'budgetFactor', value: 1.5 },
        { by: h.userId('ada'), at: 1 },
      ),
    ).toEqual({ ok: true });
    return { commit: true, value: undefined };
  });
  const source = await exported('ada', await measuredPlan());
  const imported = await h.call('ada', 'POST', '/api/work-packages/import', {
    projectId: 'measure-parent-a',
    document: source,
  });
  const workPackageId = (imported.body as { workPackageId?: string }).workPackageId ?? '';
  const legacyMeasures = h.sqlite
    .query<{ key: string }, []>(
      "SELECT key FROM measure WHERE organization_id = 'org-legacy' AND key IN ('tokens', 'cost', 'gpu_minutes') ORDER BY key",
    )
    .all()
    .map(({ key }) => key);
  expect({
    version: source.document.version,
    definitions: source.measureDefinitions.map(({ key }) => key),
    status: imported.status,
    owner: h.sqlite
      .query<{ organization_id: string }, [string]>(
        'SELECT organization_id FROM work_package_organization WHERE resource_id = ?',
      )
      .get(workPackageId)?.organization_id,
    // Matched, not defined a second time.
    legacyMeasures,
  }).toEqual({
    version: 15,
    definitions: ['tokens', 'cost', 'gpu_minutes'],
    status: 201,
    owner: 'org-legacy',
    legacyMeasures: ['cost', 'gpu_minutes', 'tokens'],
  });
  expect(await authored(await exported('ada', workPackageId))).toBe(await authored(source));
});
