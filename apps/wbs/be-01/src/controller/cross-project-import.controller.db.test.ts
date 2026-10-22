import { classifyPlanDocument } from '@wbs/core/module/plan-document/plan-document.resource';
import { afterEach, expect, test } from 'bun:test';

import { connectedTransferFixture, transferSnapshot } from '../testing/connected-transfer-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

const stringMatcher: unknown = expect.any(String);
const numberMatcher: unknown = expect.any(Number);
const contains = (values: unknown[]): unknown => expect.arrayContaining(values);

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

test('synthetic transfer importer is opt-in and separate from mounted production import', () => {
  harness = OrganizationHarness.openComposedWith({ syntheticTransferImports: true });
  expect(harness.syntheticImports()).not.toBe(harness.publicImports());
});

test('default harness has no synthetic transfer importer', () => {
  harness = OrganizationHarness.openComposedWith({});
  expect(() => harness.syntheticImports()).toThrow('synthetic transfer imports are absent');
});

/**
 * Authored import must not append undo, plan-event or saved-plan history.
 * Proof: an AFTER INSERT ON project trigger appended `injected-import-history`
 * to plan_event during the synthetic round trip; this snapshot assertion failed
 * on that extra row after the former name regex incorrectly passed (2026-10-22).
 */
function snapshotHistory() {
  const tables = new Set([
    'command_journal',
    'plan_event',
    'saved_plan',
    'saved_plan_body',
    'saved_plan_organization',
  ]);
  return transferSnapshot(harness).filter(({ name }) => tables.has(name));
}

async function exported(projectId: string) {
  const response = await harness.call(
    'ada',
    'GET',
    `/api/projects/${projectId}/export?format=json`,
  );
  expect(response.status).toBe(200);
  const document: unknown = JSON.parse(JSON.stringify(response.body));
  const classified = await classifyPlanDocument(document);
  if (!classified.ok) throw new Error(`fixture export refused: ${classified.path}`);
  return { document, classified: classified.value };
}

test('downloaded successor-owned v11 content round trips through same-store synthetic transaction', async () => {
  harness = OrganizationHarness.openComposedWith({ syntheticTransferImports: true });
  const { source, remote } = await connectedTransferFixture(harness);
  const remoteStep = remote.stepIds.at(0);
  if (remoteStep === undefined) throw new Error('fixture remote step missing');
  harness.sqlite.query('UPDATE step SET code=NULL WHERE id=?').run(remoteStep);
  const { document, classified } = await exported(source.projectId);
  expect(document).toMatchObject({ document: { version: 11 }, connected: { kind: 'connected' } });
  expect(classified).not.toHaveProperty('connected');
  expect(classified).not.toHaveProperty('connectedDependencies');
  for (const row of classified.workItems) {
    expect(row).not.toHaveProperty('projectId');
    expect(row).not.toHaveProperty('dates');
    expect(row).not.toHaveProperty('schedule');
    expect(row).not.toHaveProperty('slices');
  }
  expect(classified.typedDependencies.map((link) => link.id).sort()).toEqual([
    'incoming-descendant',
    'incoming-finish',
    'incoming-node-a',
    'incoming-node-b',
    'incoming-whole',
    'internal-node',
  ]);
  const originals = harness.sqlite
    .query<{ id: string }, []>('SELECT * FROM external_dependency ORDER BY id')
    .all();
  const originalLocal = harness.sqlite.query('SELECT * FROM typed_dependency ORDER BY id').all();
  const histories = snapshotHistory();
  const principal = await harness.authenticatedCommandPrincipal('ada', '');
  const admitted = await harness.syntheticImports().import(classified, {
    kind: 'human',
    principal,
    expectedAccess: {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
    },
  });
  expect(admitted.ok).toBe(true);
  if (!admitted.ok) throw new Error(`fixture import refused: ${JSON.stringify(admitted)}`);
  expect(admitted.projectId).not.toBe(source.projectId);
  const rows = harness.sqlite
    .query<{ id: string; name: string }, [string]>(
      'SELECT id,name FROM work_item WHERE project_id=? ORDER BY name',
    )
    .all(admitted.projectId);
  const sourceRows = harness.sqlite
    .query<{ id: string; name: string }, [string]>(
      'SELECT id,name FROM work_item WHERE project_id=? ORDER BY name',
    )
    .all(source.projectId);
  expect(rows.map((row) => row.name)).toEqual(sourceRows.map((row) => row.name));
  for (const row of rows) expect(sourceRows.map((sourceRow) => sourceRow.id)).not.toContain(row.id);
  const steps = harness.sqlite
    .query<{ id: string; name: string }, [string]>(
      'SELECT id,name FROM step WHERE project_id=? ORDER BY position',
    )
    .all(admitted.projectId);
  expect(steps).toHaveLength(source.stepIds.length);
  for (const step of steps) expect(source.stepIds).not.toContain(step.id);
  const mappedRow = (oldId: string) => {
    const old = sourceRows.find((row) => row.id === oldId);
    const copied = rows.find((row) => row.name === old?.name);
    if (copied === undefined) throw new Error('copied row missing');
    return copied.id;
  };
  const incoming = harness.sqlite
    .query<Record<string, unknown>, [string]>(
      'SELECT * FROM external_dependency WHERE successor_project_id=? ORDER BY type,predecessor_scope,predecessor_step_id',
    )
    .all(admitted.projectId);
  const expectedIncoming = harness.sqlite
    .query<Record<string, unknown>, [string]>(
      'SELECT * FROM external_dependency WHERE successor_project_id=? ORDER BY type,predecessor_scope,predecessor_step_id',
    )
    .all(source.projectId);
  expect(incoming).toHaveLength(expectedIncoming.length);
  for (const [index, link] of incoming.entries()) {
    const original = expectedIncoming.at(index);
    if (original === undefined) throw new Error('original link missing');
    expect(originals.map((edge) => edge.id)).not.toContain(link['id']);
    expect(link).toMatchObject({
      ...original,
      id: stringMatcher,
      successor_project_id: admitted.projectId,
      successor_work_item_id: mappedRow(String(original['successor_work_item_id'])),
      successor_step_id: original['successor_step_id'] === null ? null : steps.at(0)?.id,
      created_at: numberMatcher,
      updated_at: numberMatcher,
      created_by: principal.id,
    });
    expect(link['predecessor_project_id']).toBe(remote.projectId);
  }
  const local = harness.sqlite
    .query<Record<string, unknown>, [string]>('SELECT * FROM typed_dependency WHERE project_id=?')
    .all(admitted.projectId);
  expect(local).toHaveLength(1);
  expect(local[0]).toMatchObject({
    project_id: admitted.projectId,
    predecessor_work_item_id: mappedRow(source.leafId),
    successor_work_item_id: mappedRow(source.tailId),
    predecessor_scope: 'node',
    predecessor_step_id: steps.at(0)?.id,
    successor_scope: 'whole',
    type: 'SS',
  });
  expect(local[0]?.['id']).not.toBe('internal-node');
  expect(
    harness.sqlite
      .query('SELECT predecessor_id,successor_id FROM dependency WHERE project_id=?')
      .all(admitted.projectId),
  ).toEqual([{ predecessor_id: mappedRow(source.leafId), successor_id: mappedRow(source.tailId) }]);
  expect(
    harness.sqlite
      .query('SELECT * FROM external_dependency WHERE successor_project_id<>? ORDER BY id')
      .all(admitted.projectId),
  ).toEqual(originals);
  expect(
    harness.sqlite
      .query('SELECT * FROM typed_dependency WHERE project_id<>? ORDER BY id')
      .all(admitted.projectId),
  ).toEqual(originalLocal);
  expect(snapshotHistory()).toEqual(histories);
});

for (const synthetic of [false, true])
  test(`mounted incoming artifact stays inactive with synthetic importer ${String(synthetic)}`, async () => {
    let pushes = 0;
    harness = OrganizationHarness.openComposedWith({
      ...(synthetic ? { syntheticTransferImports: true } : {}),
      pushFetch: () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
    const { source } = await connectedTransferFixture(harness);
    const { document } = await exported(source.projectId);
    const before = transferSnapshot(harness);
    pushes = 0;
    const response = await harness.call('ada', 'POST', '/api/projects/import', document);
    expect(response).toMatchObject({
      status: 409,
      body: { error: 'external_dependencies_inactive' },
    });
    expect(transferSnapshot(harness)).toEqual(before);
    expect(pushes).toBe(0);
  });

test('mounted outgoing-only v11 imports authored content while ignoring outgoing history', async () => {
  harness = OrganizationHarness.openComposedWith({ syntheticTransferImports: true });
  const { remote } = await connectedTransferFixture(harness);
  const { document, classified } = await exported(remote.projectId);
  expect(classified.typedDependencies.map((link) => link.id)).toEqual(['remote-internal']);
  expect(structuredClone(document)).toMatchObject({
    connected: {
      relationships: contains([expect.objectContaining({ id: 'incoming-whole' })]),
    },
  });
  const externalBefore = harness.sqlite
    .query<{ id: string }, []>('SELECT * FROM external_dependency ORDER BY id')
    .all();
  const response = await harness.call('ada', 'POST', '/api/projects/import', document);
  expect(response.status).toBe(201);
  const copied = harness.sqlite
    .query<{ id: string }, [string]>("SELECT id FROM project WHERE name='Remote' AND id<>?")
    .get(remote.projectId);
  if (copied === null) throw new Error('mounted copied project missing');
  const copiedRows = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
    .all(copied.id);
  expect(copiedRows).toHaveLength(3);
  for (const row of copiedRows)
    expect([remote.parentId, remote.leafId, remote.tailId]).not.toContain(row.id);
  const copiedLinks = harness.sqlite
    .query<{ id: string; project_id: string }, [string]>(
      'SELECT id,project_id FROM typed_dependency WHERE project_id=?',
    )
    .all(copied.id);
  expect(copiedLinks).toHaveLength(1);
  expect(copiedLinks[0]?.id).not.toBe('remote-internal');
  expect(
    harness.sqlite.query('SELECT * FROM dependency WHERE project_id=?').all(copied.id),
  ).toHaveLength(1);
  expect(
    harness.sqlite.query<{ id: string }, []>('SELECT * FROM external_dependency ORDER BY id').all(),
  ).toEqual(externalBefore);
});
