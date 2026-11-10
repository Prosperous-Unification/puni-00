import { createHash } from 'node:crypto';

import { afterEach, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { savedConnectedHistoryFixture } from '../testing/saved-connected-history-fixture';

interface InputBody {
  schemaVersion: number;
  project: Record<string, unknown>;
  workItems: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  measures: Record<string, unknown>[];
  stepParallels?: unknown;
  dependencyHistory?: Record<string, unknown>;
  [key: string]: unknown;
}

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  await harness?.closeComposed();
});
const facts = [
  { workItemId: 'sparse-main', stepId: 'sparse-dev', maxParallel: 1 },
  { workItemId: 'sparse-other', stepId: 'sparse-qa', maxParallel: 2 },
];
const hashBody = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

async function openFixture() {
  const mounted = OrganizationHarness.openComposedWith({});
  harness = mounted;
  await mounted.register('ada');
  mounted.organization('org');
  mounted.member('org', 'ada', 'member');
  mounted.bind('ada', 'org');
  mounted.activate();
  const created = await mounted.call('ada', 'POST', '/api/projects', { name: 'Sparse reader' });
  expect(created.status).toBe(200);
  const projectId = (created.body as { project: { id: string } }).project.id;
  mounted.sqlite
    .query("UPDATE project SET start_date='2026-10-01',estimate_rounding='exact' WHERE id=?")
    .run(projectId);
  mounted.sqlite.query('DELETE FROM step WHERE project_id=?').run(projectId);
  mounted.sqlite
    .query(
      "INSERT INTO step(id,project_id,name,position,code) VALUES('sparse-dev',?,'Dev',10,'dev'),('sparse-qa',?,'QA',20,'qa')",
    )
    .run(projectId, projectId);
  mounted.sqlite
    .query(
      "INSERT INTO work_item(id,project_id,position,name,max_parallel,readiness) VALUES('sparse-main',?,10,'Main',1,'ready'),('sparse-other',?,20,'Other',4,'ready')",
    )
    .run(projectId, projectId);
  mounted.sqlite.run(
    "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('sparse-main','sparse-dev',1,1,1),('sparse-other','sparse-qa',1,1,1)",
  );
  mounted.sqlite.run(
    "INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES('sparse-main','sparse-dev',1),('sparse-other','sparse-qa',2)",
  );
  const save = async (name: string) => {
    const saved = await mounted.call('ada', 'POST', `/api/projects/${projectId}/saved-plans`, {
      name,
    });
    expect(saved.status).toBe(201);
    return (saved.body as { savedPlan: { id: string } }).savedPlan.id;
  };
  const savedId = await save('Explicit policy');
  mounted.sqlite.run('DELETE FROM step_parallel');
  const emptyId = await save('Inherited');
  const bytesOf = (id: string, kind: string): string => {
    const stored = mounted.sqlite
      .query<{ bytes: string }, [string, string]>(
        'SELECT bytes FROM saved_plan_body WHERE saved_plan_id=? AND kind=?',
      )
      .get(id, kind);
    if (stored === null) throw new Error(`fixture body missing: ${kind}`);
    return stored.bytes;
  };
  return {
    mounted,
    projectId,
    savedId,
    emptyId,
    inputBytes: bytesOf(savedId, 'input'),
    scheduleBytes: bytesOf(savedId, 'schedule'),
  };
}

type Fixture = Awaited<ReturnType<typeof openFixture>>;
function captureSavedState(f: Fixture) {
  return {
    headers: f.mounted.sqlite.query('SELECT * FROM saved_plan ORDER BY id').all(),
    bodies: f.mounted.sqlite
      .query('SELECT * FROM saved_plan_body ORDER BY saved_plan_id,kind')
      .all(),
  };
}
function replaceBodies(
  f: Fixture,
  input: InputBody,
  schedule: string | null,
  scheduleVersion = 1,
  absentReason = 'unavailable',
) {
  const bytes = JSON.stringify(input);
  const digest = hashBody(bytes);
  f.mounted.sqlite
    .query(
      'UPDATE saved_plan SET input_schema_version=?,input_bytes=?,input_sha256=?,schedule_schema_version=?,schedule_bytes=?,schedule_sha256=?,schedule_input_sha256=?,scheduler_algorithm_id=?,schedule_absent_reason=? WHERE id=?',
    )
    .run(
      input.schemaVersion,
      Buffer.byteLength(bytes),
      digest,
      schedule === null ? null : scheduleVersion,
      schedule === null ? null : Buffer.byteLength(schedule),
      schedule === null ? null : hashBody(schedule),
      schedule === null ? null : digest,
      schedule === null
        ? null
        : scheduleVersion === 2
          ? 'connected-selection-v1:retired'
          : 'slice-leveling-v4',
      schedule === null ? absentReason : null,
      f.savedId,
    );
  f.mounted.sqlite
    .query("UPDATE saved_plan_body SET bytes=? WHERE saved_plan_id=? AND kind='input'")
    .run(bytes, f.savedId);
  f.mounted.sqlite
    .query("DELETE FROM saved_plan_body WHERE saved_plan_id=? AND kind='schedule'")
    .run(f.savedId);
  if (schedule !== null)
    f.mounted.sqlite
      .query("INSERT INTO saved_plan_body(saved_plan_id,kind,bytes) VALUES(?,'schedule',?)")
      .run(f.savedId, schedule);
  return bytes;
}
function createHistoricalInput(bytes: string, version: number): InputBody {
  const input = JSON.parse(bytes) as InputBody;
  input.schemaVersion = version;
  if (version === 10) input.dependencyHistory = { kind: 'local' };
  if (version < 9) {
    Reflect.deleteProperty(input.project, 'budgetFactor');
    Reflect.deleteProperty(input, 'measureEstimates');
    Reflect.deleteProperty(input, 'budgets');
    for (const measure of input.measures) {
      Reflect.deleteProperty(measure, 'currency');
      Reflect.deleteProperty(measure, 'rateCardDigest');
    }
  }
  if (version < 8) Reflect.deleteProperty(input, 'stepParallels');
  return input;
}
async function readAndCompare(f: Fixture, status: number, code?: string) {
  const before = captureSavedState(f);
  const read = await f.mounted.call('ada', 'GET', `/api/saved-plans/${f.savedId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(status);
  if (code !== undefined)
    expect(read.body).toMatchObject({
      error: 'corrupt',
      refusal: { reason: 'body_invalid', body: 'input', code },
    });
  for (const [left, right] of [
    [f.savedId, f.emptyId],
    [f.emptyId, f.savedId],
  ]) {
    const compared = await f.mounted.call(
      'ada',
      'GET',
      `/api/projects/${f.projectId}/saved-plans/compare?left=${left}&right=${right}`,
    );
    expect(compared.status, JSON.stringify(compared.body)).toBe(status);
    if (code !== undefined)
      expect(compared.body).toMatchObject({
        error: 'corrupt',
        savedPlanId: f.savedId,
        refusal: { reason: 'body_invalid', body: 'input', code },
      });
  }
  expect(captureSavedState(f)).toEqual(before);
  return read;
}

test('actual save/read/compare preserves explicit equality and sparse absence', async () => {
  const f = await openFixture();
  const input = JSON.parse(f.inputBytes) as InputBody;
  expect(input.stepParallels).toEqual(facts);
  const read = await readAndCompare(f, 200);
  expect(read.body).toMatchObject({ savedPlan: { input: { bytes: f.inputBytes } } });
  const compared = await f.mounted.call(
    'ada',
    'GET',
    `/api/projects/${f.projectId}/saved-plans/compare?left=${f.savedId}&right=${f.emptyId}`,
  );
  expect(compared.body).toMatchObject({
    diff: {
      input: [
        { category: 'capacity', path: 'stepParallels[sparse-main:sparse-dev]', left: facts[0] },
        { category: 'capacity', path: 'stepParallels[sparse-other:sparse-qa]', left: facts[1] },
      ],
    },
  });
});

test.each([8, 9, 10].flatMap((version) => [false, true].map((present) => ({ version, present }))))(
  'stored input$version schedule=$present validates sparse corruption in read and both compare directions',
  async ({ version, present }) => {
    const f = await openFixture();
    const valid = createHistoricalInput(f.inputBytes, version);
    const schedule = present ? f.scheduleBytes : null;
    const original = replaceBodies(f, valid, schedule);
    const read = await readAndCompare(f, 200);
    const comparedPolicy = await f.mounted.call(
      'ada',
      'GET',
      `/api/projects/${f.projectId}/saved-plans/compare?left=${f.savedId}&right=${f.emptyId}`,
    );
    expect(comparedPolicy.status).toBe(200);
    const policy = comparedPolicy.body as {
      diff: { input: { category: string; path: string; left?: unknown; right?: unknown }[] };
    };
    expect(
      policy.diff.input.filter(
        (change) => change.category === 'capacity' && change.path.startsWith('stepParallels['),
      ),
    ).toEqual([
      {
        category: 'capacity',
        path: 'stepParallels[sparse-main:sparse-dev]',
        left: facts[0],
        right: null,
      },
      {
        category: 'capacity',
        path: 'stepParallels[sparse-other:sparse-qa]',
        left: facts[1],
        right: null,
      },
    ]);
    expect(read.body).toMatchObject({
      savedPlan: { input: { bytes: original, schemaVersion: version, sha256: hashBody(original) } },
    });
    for (const fault of [
      'missing',
      'null',
      'duplicate',
      'range',
      'foreign owner',
      'foreign step',
      'parent',
      'project shape',
      'measures shape',
      'measure row shape',
    ]) {
      const input = structuredClone(valid);
      let code = 'local_facts';
      if (fault === 'project shape') {
        Reflect.set(input, 'project', null);
        code = 'shape';
      }
      if (fault === 'measures shape') {
        Reflect.set(input, 'measures', null);
        code = 'shape';
      }
      if (fault === 'measure row shape') {
        Reflect.set(input, 'measures', [null]);
        code = 'shape';
      }
      if (fault === 'missing') {
        Reflect.deleteProperty(input, 'stepParallels');
        if (version === 10) code = 'shape';
      }
      if (fault === 'null') {
        input.stepParallels = null;
        if (version === 10) code = 'shape';
      }
      if (fault === 'duplicate') input.stepParallels = [facts[0], facts[0]];
      if (fault === 'range') input.stepParallels = [{ ...facts[0], maxParallel: 1001 }];
      if (fault === 'foreign owner')
        input.stepParallels = [{ ...facts[0], workItemId: 'peer-only' }];
      if (fault === 'foreign step') input.stepParallels = [{ ...facts[0], stepId: 'peer-step' }];
      if (fault === 'parent') {
        input.workItems.push({ ...input.workItems[0], id: 'parent' });
        Reflect.set(input.workItems[0], 'parentId', 'parent');
        input.stepParallels = [{ ...facts[0], workItemId: 'parent' }];
      }
      replaceBodies(f, input, schedule);
      const refused = await readAndCompare(f, 422, code);
      const paths: Partial<Record<string, string>> = {
        'project shape': '$.project',
        'measures shape': '$.measures',
        'measure row shape': '$.measures[0]',
      };
      if (version === 8 && paths[fault] !== undefined)
        expect(refused.body).toMatchObject({ refusal: { path: paths[fault] } });
    }
  },
);

test('historical7 reads and compares original bytes but refuses sparse smuggling', async () => {
  const f = await openFixture();
  const input = createHistoricalInput(f.inputBytes, 7);
  const bytes = replaceBodies(f, input, f.scheduleBytes);
  const read = await readAndCompare(f, 200);
  expect(read.body).toMatchObject({
    savedPlan: { input: { bytes, schemaVersion: 7, sha256: hashBody(bytes) } },
  });
  for (const sparse of [facts, null, { invalid: true }]) {
    replaceBodies(f, { ...input, stepParallels: sparse }, f.scheduleBytes);
    await readAndCompare(f, 422, 'local_facts');
  }
  for (const raw of ['[]', 'null', '7']) {
    replaceBodies(f, input, f.scheduleBytes);
    const digest = hashBody(raw);
    f.mounted.sqlite
      .query(
        'UPDATE saved_plan SET input_bytes=?,input_sha256=?,schedule_input_sha256=? WHERE id=?',
      )
      .run(Buffer.byteLength(raw), digest, digest, f.savedId);
    f.mounted.sqlite
      .query("UPDATE saved_plan_body SET bytes=? WHERE saved_plan_id=? AND kind='input'")
      .run(raw, f.savedId);
    await readAndCompare(f, 422, 'local_facts');
  }
});

test.each([false, true])(
  'connected10 schedule=%s keeps sparse target membership separate from same-looking peers',
  async (present) => {
    const f = await openFixture();
    const captured = savedConnectedHistoryFixture(f.projectId);
    const input = JSON.parse(JSON.stringify(captured.input)) as InputBody;
    input.stepParallels = [{ workItemId: 'a', stepId: 'design', maxParallel: 1 }];
    const history = input.dependencyHistory;
    if (history === undefined) throw new Error('fixture history missing');
    if (!present) Reflect.set(history, 'placementState', { kind: 'unavailable', reason: 'cycle' });
    const schedule = present ? JSON.stringify(captured.schedule) : null;
    const original = replaceBodies(f, input, schedule, 2, present ? 'unavailable' : 'infeasible');
    replaceBodies(
      { ...f, savedId: f.emptyId },
      { ...input, stepParallels: [] },
      schedule,
      2,
      present ? 'unavailable' : 'infeasible',
    );
    const before = captureSavedState(f);
    const read = await f.mounted.call('ada', 'GET', `/api/saved-plans/${f.savedId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body).toMatchObject({ savedPlan: { input: { bytes: original } } });
    const compared = await f.mounted.call(
      'ada',
      'GET',
      `/api/projects/${f.projectId}/saved-plans/compare?left=${f.savedId}&right=${f.savedId}`,
    );
    expect(compared.status, JSON.stringify(compared.body)).toBe(200);
    expect(compared.body).toMatchObject({
      diff: { input: [], schedule: [] },
      left: { provenance: { kind: 'connected' } },
    });
    const policy = await f.mounted.call(
      'ada',
      'GET',
      `/api/projects/${f.projectId}/saved-plans/compare?left=${f.savedId}&right=${f.emptyId}`,
    );
    expect(policy.status).toBe(200);
    expect((policy.body as { diff: { input: unknown[] } }).diff.input).toEqual([
      {
        category: 'capacity',
        path: 'stepParallels[a:design]',
        left: { workItemId: 'a', stepId: 'design', maxParallel: 1 },
        right: null,
      },
    ]);
    expect(captureSavedState(f)).toEqual(before);
    for (const fault of [
      'foreign owner',
      'foreign step',
      'duplicate',
      'missing target',
      'extra target',
      'same owner id in peer',
      'peer step without graph node',
    ]) {
      const changed = structuredClone(input);
      let code = 'local_facts';
      if (fault === 'foreign owner')
        changed.stepParallels = [{ workItemId: 'b', stepId: 'design', maxParallel: 1 }];
      if (fault === 'foreign step')
        changed.stepParallels = [{ workItemId: 'a', stepId: 'build', maxParallel: 1 }];
      if (fault === 'duplicate')
        changed.stepParallels = [
          { workItemId: 'a', stepId: 'design', maxParallel: 1 },
          { workItemId: 'a', stepId: 'design', maxParallel: 1 },
        ];
      if (fault === 'missing target') {
        changed.workItems = changed.workItems.filter((row) => row['id'] !== 'root');
        code = 'target_work_items';
      }
      if (fault === 'extra target') {
        changed.workItems.push({ ...changed.workItems[0], id: 'b', parentId: null });
        changed.stepParallels = [{ workItemId: 'b', stepId: 'design', maxParallel: 1 }];
        code = 'target_work_items';
      }
      if (fault === 'same owner id in peer' || fault === 'peer step without graph node') {
        const members = changed.dependencyHistory?.['projects'] as {
          projectId: string;
          workItems: Record<string, unknown>[];
          steps: Record<string, unknown>[];
        }[];
        const peer = members.find((member) => member.projectId !== f.projectId);
        const target = members.find((member) => member.projectId === f.projectId);
        if (peer === undefined || target === undefined) throw new Error('fixture members missing');
        if (fault === 'same owner id in peer') {
          const owner = target.workItems.find((row) => row['id'] === 'a');
          if (owner === undefined) throw new Error('fixture owner missing');
          peer.workItems.push({ ...owner });
        } else {
          const step = target.steps.find((step) => step['id'] === 'design');
          if (step === undefined) throw new Error('fixture step missing');
          peer.steps.push({ ...step });
        }
        code = fault === 'same owner id in peer' ? 'duplicate' : 'graph_completeness';
      }
      replaceBodies(f, changed, schedule, 2, present ? 'unavailable' : 'infeasible');
      await readAndCompare(f, 422, code);
    }
  },
);

test('connected extra foreign sparse owner is refused by exact target membership', async () => {
  const f = await openFixture();
  const captured = savedConnectedHistoryFixture(f.projectId);
  const input = JSON.parse(JSON.stringify(captured.input)) as InputBody;
  input.workItems.push({ ...input.workItems[0], id: 'b', parentId: null, name: 'b' });
  input.stepParallels = [{ workItemId: 'b', stepId: 'design', maxParallel: 1 }];
  replaceBodies(f, input, JSON.stringify(captured.schedule), 2);
  await readAndCompare(f, 422, 'target_work_items');
});

test('same step identity in a valid peer context cannot supply a local sparse owner', async () => {
  const f = await openFixture();
  const captured = savedConnectedHistoryFixture(f.projectId);
  const input = JSON.parse(JSON.stringify(captured.input)) as InputBody;
  const history = JSON.parse(
    JSON.stringify(input.dependencyHistory).replaceAll('build', 'design'),
  ) as Record<string, unknown>;
  history['placementState'] = { kind: 'unavailable', reason: 'cycle' };
  input.dependencyHistory = history;
  input.stepParallels = [{ workItemId: 'a', stepId: 'design', maxParallel: 1 }];
  replaceBodies(f, input, null, 2, 'infeasible');
  const before = captureSavedState(f);
  const read = await f.mounted.call('ada', 'GET', `/api/saved-plans/${f.savedId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const compared = await f.mounted.call(
    'ada',
    'GET',
    `/api/projects/${f.projectId}/saved-plans/compare?left=${f.savedId}&right=${f.savedId}`,
  );
  expect(compared.status, JSON.stringify(compared.body)).toBe(200);
  expect(compared.body).toMatchObject({
    diff: { input: [], schedule: [] },
    left: { provenance: { kind: 'connected' } },
  });
  expect(captureSavedState(f)).toEqual(before);
  input.stepParallels = [{ workItemId: 'b', stepId: 'design', maxParallel: 1 }];
  replaceBodies(f, input, null, 2, 'infeasible');
  await readAndCompare(f, 422, 'local_facts');
});
