import { classifyPlanDocument } from '@wbs/core/module/plan-document/plan-document.resource';
import { DrizzleEventLogStore } from '@wbs/store-sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';
// eslint-disable-next-line no-restricted-imports -- this test inspects the borrowed Drizzle transaction before its injected recording failure.
import { sql } from 'drizzle-orm';

import { connectedTransferFixture, transferSnapshot } from '../testing/connected-transfer-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

const stringMatcher: unknown = expect.any(String);
const numberMatcher: unknown = expect.any(Number);
const contains = (values: unknown[]): unknown => expect.arrayContaining(values);
const matches = (fields: Record<string, unknown>): unknown => expect.objectContaining(fields);

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

async function importTransfer(classified: Awaited<ReturnType<typeof exported>>['classified']) {
  const principal = await harness.authenticatedCommandPrincipal('ada', '');
  return harness.syntheticImports().import(classified, {
    kind: 'human',
    principal,
    expectedAccess: {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
    },
  });
}

/** External inserts intentionally bump each predecessor revision once per relationship. */
function expectOriginalRows(before: ReturnType<typeof transferSnapshot>, projectId: string) {
  const after = transferSnapshot(harness);
  for (const table of before.filter(
    ({ name }) => !['event_sequencer', 'project_abbreviation_counter'].includes(name),
  )) {
    const current = after.find(({ name }) => name === table.name);
    if (current === undefined) throw new Error(`table disappeared: ${table.name}`);
    const expected = table.rows.map((serialized) => {
      if (table.name !== 'work_item') return serialized;
      const row = JSON.parse(serialized) as Record<string, unknown>;
      const count = harness.sqlite
        .query<{ count: number }, [string, string]>(
          'SELECT count(*) AS count FROM external_dependency WHERE successor_project_id=? AND predecessor_work_item_id=?',
        )
        .get(projectId, String(row['id']));
      if (count === null) throw new Error('predecessor revision count absent');
      if (count.count === 0) return serialized;
      const changed = current.rows
        .map((entry) => JSON.parse(entry) as Record<string, unknown>)
        .find((entry) => entry['id'] === row['id']);
      if (changed === undefined) throw new Error('original predecessor disappeared');
      expect(changed['updated_at']).toBeGreaterThanOrEqual(Number(row['updated_at']));
      return JSON.stringify({
        ...row,
        revision: Number(row['revision']) + count.count,
        updated_at: changed['updated_at'],
      });
    });
    expect(current.rows.filter((row) => expected.includes(row))).toEqual(expected);
  }
}

function expectPublicationCount(before: ReturnType<typeof transferSnapshot>, pushes: number) {
  const previous = before.find(({ name }) => name === 'event_log');
  if (previous === undefined) throw new Error('event log snapshot absent');
  const count = harness.sqlite
    .query<{ count: number }, []>('SELECT count(*) AS count FROM event_log')
    .get();
  if (count === null) throw new Error('event log count absent');
  expect(pushes).toBe(count.count - previous.rows.length);
  expect(pushes).toBeGreaterThan(0);
}

test('rename and renumber round trip stable external UUIDs with current export labels', async () => {
  let pushes = 0;
  harness = OrganizationHarness.openComposedWith({
    syntheticTransferImports: true,
    pushFetch: () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  const { remote, source } = await connectedTransferFixture(harness);
  const downloaded = await exported(source.projectId);
  harness.sqlite.query("UPDATE project SET name='Renamed remote' WHERE id=?").run(remote.projectId);
  harness.sqlite
    .query("UPDATE work_item SET name='Renamed prerequisite',frozen_number='990' WHERE id=?")
    .run(remote.leafId);
  const stepId = remote.stepIds.at(0);
  if (stepId === undefined) throw new Error('fixture remote step absent');
  harness.sqlite.query("UPDATE step SET name='Renamed step',code='next' WHERE id=?").run(stepId);
  harness.sqlite
    .query("UPDATE project_abbreviation SET abbreviation='NEXT' WHERE project_id=?")
    .run(remote.projectId);
  const current = await exported(source.projectId);
  const link = current.classified.typedDependencies.find(({ id }) => id === 'incoming-node-a');
  expect(link?.predecessor).toMatchObject({
    projectId: remote.projectId,
    workItemId: remote.leafId,
    stepId: remote.stepIds[0],
    display: {
      projectName: 'Renamed remote',
      workItemName: 'Renamed prerequisite',
      stepName: 'Renamed step',
      address: 'NEXT.990',
    },
  });
  const before = transferSnapshot(harness);
  const histories = snapshotHistory();
  pushes = 0;
  const admitted = await importTransfer(downloaded.classified);
  expect(admitted.ok).toBe(true);
  if (!admitted.ok) throw new Error(`renamed import refused: ${JSON.stringify(admitted)}`);
  expect(
    harness.sqlite
      .query(
        'SELECT predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,type FROM external_dependency WHERE successor_project_id=? ORDER BY predecessor_scope,predecessor_step_id,type',
      )
      .all(admitted.projectId),
  ).toEqual(
    harness.sqlite
      .query(
        'SELECT predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,type FROM external_dependency WHERE successor_project_id=? ORDER BY predecessor_scope,predecessor_step_id,type',
      )
      .all(source.projectId),
  );
  const reexported = await exported(admitted.projectId);
  const rebound = reexported.classified.typedDependencies.find(
    ({ predecessor }) =>
      'kind' in predecessor &&
      predecessor.kind === 'external' &&
      predecessor.scope === 'node' &&
      predecessor.stepId === stepId,
  );
  expect(rebound?.predecessor).toEqual(link?.predecessor);
  expectOriginalRows(before, admitted.projectId);
  expect(snapshotHistory()).toEqual(histories);
  expectPublicationCount(before, pushes);
});

/**
 * Proof: ignoring explicit mappings in prepareImport admitted the original remote
 * endpoint and failed the valid-original precedence test (2026-10-23).
 * Independently omitting step identity from the mapping key made that test
 * refuse its otherwise valid distinct-step mappings (2026-10-23).
 */
for (const fault of [
  'none',
  'whole-row',
  'node-row',
  'descendant-step-row',
  'node-step',
  'descendant-step-step',
] as const)
  test(`explicit whole node and descendant-step mapping ${fault === 'none' ? 'wins while original UUIDs remain valid' : `refuses ${fault} without fallback`}`, async () => {
    const invalid = fault !== 'none';
    let pushes = 0;
    harness = OrganizationHarness.openComposedWith({
      syntheticTransferImports: true,
      pushFetch: () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
    const { remote, source, unrelated } = await connectedTransferFixture(harness);
    const { document, classified } = await exported(source.projectId);
    const mappings = classified.typedDependencies.flatMap(({ predecessor }) => {
      if (!('kind' in predecessor) || predecessor.kind !== 'external') return [];
      const identity =
        predecessor.scope === 'whole'
          ? {
              projectId: predecessor.projectId,
              workItemId: predecessor.workItemId,
              scope: predecessor.scope,
            }
          : {
              projectId: predecessor.projectId,
              workItemId: predecessor.workItemId,
              scope: predecessor.scope,
              stepId: predecessor.stepId,
            };
      return [
        {
          source: identity,
          destination: {
            ...identity,
            projectId: unrelated.projectId,
            workItemId:
              fault === `${predecessor.scope}-row`
                ? 'absent-mapped-row'
                : predecessor.scope === 'descendant-step'
                  ? unrelated.parentId
                  : unrelated.leafId,
            ...(predecessor.scope === 'whole'
              ? {}
              : {
                  stepId:
                    fault === `${predecessor.scope}-step` &&
                    predecessor.stepId === remote.stepIds[0]
                      ? 'absent-mapped-step'
                      : unrelated.stepIds[predecessor.stepId === remote.stepIds[0] ? 0 : 1],
                }),
          },
        },
      ];
    });
    // A node endpoint participates in both FS and FF declarations; mappings name endpoints once.
    const unique = mappings.filter(
      (mapping, index) =>
        mappings.findIndex(
          (candidate) => JSON.stringify(candidate.source) === JSON.stringify(mapping.source),
        ) === index,
    );
    const request = structuredClone(document);
    if (typeof request !== 'object' || request === null) throw new Error('export document absent');
    Reflect.set(request, 'externalMappings', unique);
    const parsed = await classifyPlanDocument(request);
    if (!parsed.ok) throw new Error(`mapped fixture refused: ${parsed.path}`);
    const before = transferSnapshot(harness);
    const histories = snapshotHistory();
    pushes = 0;
    const admitted = await importTransfer(parsed.value);
    if (invalid) {
      expect(admitted).toMatchObject({ ok: false, code: 'unknown_ref' });
      expect(transferSnapshot(harness)).toEqual(before);
    } else {
      expect(admitted.ok).toBe(true);
      if (!admitted.ok) throw new Error(`mapped import refused: ${JSON.stringify(admitted)}`);
      const incoming = harness.sqlite
        .query<
          {
            predecessor_project_id: string;
            predecessor_work_item_id: string;
            predecessor_scope: string;
            predecessor_step_id: string | null;
          },
          [string]
        >(
          'SELECT predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id FROM external_dependency WHERE successor_project_id=?',
        )
        .all(admitted.projectId);
      expect(incoming).toHaveLength(5);
      for (const edge of incoming) {
        expect(edge.predecessor_project_id).toBe(unrelated.projectId);
        expect(edge.predecessor_work_item_id).toBe(
          edge.predecessor_scope === 'descendant-step' ? unrelated.parentId : unrelated.leafId,
        );
        expect(
          edge.predecessor_step_id === null
            ? edge.predecessor_scope === 'whole'
            : unrelated.stepIds.includes(edge.predecessor_step_id),
        ).toBe(true);
      }
      const expected = harness.sqlite
        .query<{ predecessor_scope: string; predecessor_step_id: string | null }, [string]>(
          'SELECT predecessor_scope,predecessor_step_id FROM external_dependency WHERE successor_project_id=?',
        )
        .all(source.projectId)
        .map((edge) =>
          JSON.stringify({
            predecessor_project_id: unrelated.projectId,
            predecessor_work_item_id:
              edge.predecessor_scope === 'descendant-step' ? unrelated.parentId : unrelated.leafId,
            predecessor_scope: edge.predecessor_scope,
            predecessor_step_id:
              edge.predecessor_step_id === null
                ? null
                : unrelated.stepIds[edge.predecessor_step_id === remote.stepIds[0] ? 0 : 1],
          }),
        )
        .sort();
      expect(incoming.map((edge) => JSON.stringify(edge)).sort()).toEqual(expected);
      expectOriginalRows(before, admitted.projectId);
    }
    expect(snapshotHistory()).toEqual(histories);
    if (invalid) expect(pushes).toBe(0);
    else expectPublicationCount(before, pushes);
  });

/**
 * Proof: dropping unmapped declarations when any mapping exists passed the old
 * four-leaf assertion; the complete five-endpoint assertion failed (2026-10-23).
 */
for (const mapped of [false, true])
  test(`reused display address ${mapped ? 'binds only through explicit mapping' : 'never replaces absent UUID'}`, async () => {
    let pushes = 0;
    harness = OrganizationHarness.openComposedWith({
      syntheticTransferImports: true,
      pushFetch: () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
    const { remote, source, downstream, unrelated } = await connectedTransferFixture(harness);
    harness.sqlite.query("UPDATE work_item SET frozen_number='080' WHERE id=?").run(remote.leafId);
    const { document, classified } = await exported(source.projectId);
    harness.sqlite
      .query(
        'DELETE FROM external_dependency WHERE predecessor_work_item_id=? OR successor_work_item_id=?',
      )
      .run(remote.leafId, remote.leafId);
    harness.sqlite
      .query(
        'DELETE FROM typed_dependency WHERE predecessor_work_item_id=? OR successor_work_item_id=?',
      )
      .run(remote.leafId, remote.leafId);
    harness.sqlite
      .query('DELETE FROM dependency WHERE predecessor_id=? OR successor_id=?')
      .run(remote.leafId, remote.leafId);
    harness.sqlite.query('DELETE FROM estimate WHERE work_item_id=?').run(remote.leafId);
    harness.sqlite.query('DELETE FROM work_item WHERE id=?').run(remote.leafId);
    const replacementId = crypto.randomUUID();
    harness.sqlite
      .query(
        "INSERT INTO work_item(id,project_id,parent_id,position,name,frozen_number,readiness,created_at,updated_at) VALUES (?,?,?,10,'Remote leaf','080','ready',1,1)",
      )
      .run(replacementId, remote.projectId, remote.parentId);
    const original = classified.typedDependencies.find(({ id }) => id === 'incoming-node-a');
    if (
      original === undefined ||
      !('kind' in original.predecessor) ||
      original.predecessor.kind !== 'external'
    )
      throw new Error('fixture external declaration absent');
    const replacement = harness.sqlite
      .query<{ address: string; name: string }, [string]>(
        "SELECT a.abbreviation || '.' || w.frozen_number AS address,w.name FROM work_item w JOIN project_abbreviation a ON a.project_id=w.project_id WHERE w.id=?",
      )
      .get(replacementId);
    expect(replacement).toEqual({
      address: original.predecessor.display.address,
      name: original.predecessor.display.workItemName,
    });
    expect(replacementId).not.toBe(remote.leafId);
    const current = await exported(source.projectId);
    expect(
      current.classified.typedDependencies.some(
        ({ predecessor }) =>
          'workItemId' in predecessor && predecessor.workItemId === remote.leafId,
      ),
    ).toBe(false);
    const request = structuredClone(document);
    if (typeof request !== 'object' || request === null) throw new Error('export document absent');
    if (mapped) {
      const mappings = classified.typedDependencies.flatMap(({ predecessor }) => {
        if (
          !('kind' in predecessor) ||
          predecessor.kind !== 'external' ||
          predecessor.workItemId !== remote.leafId
        )
          return [];
        const identity =
          predecessor.scope === 'whole'
            ? { projectId: remote.projectId, workItemId: remote.leafId, scope: predecessor.scope }
            : {
                projectId: remote.projectId,
                workItemId: remote.leafId,
                scope: predecessor.scope,
                stepId: predecessor.stepId,
              };
        return [{ source: identity, destination: { ...identity, workItemId: replacementId } }];
      });
      Reflect.set(
        request,
        'externalMappings',
        mappings.filter(
          (mapping, index) =>
            mappings.findIndex(
              (candidate) => JSON.stringify(candidate.source) === JSON.stringify(mapping.source),
            ) === index,
        ),
      );
    }
    const parsed = await classifyPlanDocument(request);
    if (!parsed.ok) throw new Error(`reused address fixture refused: ${parsed.path}`);
    const revisions = harness.sqlite
      .query<{ id: string; revision: number }, [string]>(
        'SELECT id,revision FROM work_item WHERE project_id=? ORDER BY id',
      )
      .all(remote.projectId);
    const before = transferSnapshot(harness);
    const histories = snapshotHistory();
    pushes = 0;
    const admitted = await importTransfer(parsed.value);
    if (!mapped) {
      expect(admitted).toMatchObject({ ok: false, code: 'unknown_ref' });
      expect(transferSnapshot(harness)).toEqual(before);
      expect(pushes).toBe(0);
    } else {
      expect(admitted.ok).toBe(true);
      if (!admitted.ok)
        throw new Error(`explicit replacement refused: ${JSON.stringify(admitted)}`);
      const copiedRows = harness.sqlite
        .query<{ id: string; name: string }, [string]>(
          'SELECT id,name FROM work_item WHERE project_id=?',
        )
        .all(admitted.projectId);
      const copiedSteps = harness.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY position')
        .all(admitted.projectId);
      const expected = classified.typedDependencies.flatMap(({ predecessor, successor, type }) => {
        if (!('kind' in predecessor) || predecessor.kind !== 'external') return [];
        const sourceId = successor.workItem;
        const sourceRow = harness.sqlite
          .query<{ name: string }, [string]>('SELECT name FROM work_item WHERE id=?')
          .get(sourceId);
        if (sourceRow === null) throw new Error('original successor absent');
        const copiedRow = copiedRows.find(({ name }) => name === sourceRow.name);
        if (copiedRow === undefined) throw new Error('copied successor absent');
        const successorStep =
          successor.scope === 'whole'
            ? null
            : copiedSteps.at(source.stepIds.indexOf(successor.step))?.id;
        if (successorStep === undefined) throw new Error('copied successor step absent');
        return [
          {
            predecessor_project_id: remote.projectId,
            predecessor_work_item_id:
              predecessor.workItemId === remote.leafId ? replacementId : predecessor.workItemId,
            predecessor_scope: predecessor.scope,
            predecessor_step_id: predecessor.scope === 'whole' ? null : predecessor.stepId,
            successor_project_id: admitted.projectId,
            successor_work_item_id: copiedRow.id,
            successor_scope: successor.scope,
            successor_step_id: successorStep,
            type,
          },
        ];
      });
      expect(expected).toHaveLength(5);
      const incoming = harness.sqlite
        .query(
          'SELECT predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_project_id,successor_work_item_id,successor_scope,successor_step_id,type FROM external_dependency WHERE successor_project_id=?',
        )
        .all(admitted.projectId);
      expect(incoming.map((edge) => JSON.stringify(edge)).sort()).toEqual(
        expected.map((edge) => JSON.stringify(edge)).sort(),
      );
      expect(
        harness.sqlite
          .query('SELECT id,revision FROM work_item WHERE project_id=? ORDER BY id')
          .all(remote.projectId),
      ).toEqual(
        revisions.map((row) => ({
          ...row,
          revision:
            row.revision +
            expected.filter((edge) => edge.predecessor_work_item_id === row.id).length,
        })),
      );
      const eventBefore = before.find(({ name }) => name === 'event_log');
      if (eventBefore === undefined) throw new Error('event log snapshot absent');
      const publications: unknown = harness.sqlite
        .query<{ subscription: string; message: string }, []>(
          'SELECT subscription,message FROM event_log ORDER BY id',
        )
        .all()
        .slice(eventBefore.rows.length)
        .map(({ subscription, message }) => ({
          subscription,
          message: JSON.parse(message) as unknown,
        }));
      const projects = [
        remote.projectId,
        source.projectId,
        downstream.projectId,
        unrelated.projectId,
        admitted.projectId,
      ];
      const consequences = projects.flatMap((projectId) =>
        [remote.projectId, admitted.projectId]
          .filter((causeProjectId) => causeProjectId !== projectId)
          .map((causeProjectId) => ({
            subscription: `project:${projectId}`,
            message: { type: 'elsewhere_changed', projectId, causeProjectId },
          })),
      );
      expect(publications).toHaveLength(consequences.length + 2);
      expect(publications).toEqual(
        contains([
          ...consequences,
          {
            subscription: `project:${admitted.projectId}`,
            message: matches({ type: 'project_settings_changed' }),
          },
          {
            subscription: `project:${admitted.projectId}`,
            message: matches({
              type: 'tree_replaced',
              workItems: contains(copiedRows.map(({ id }) => matches({ id }))),
            }),
          },
        ]),
      );
      expect(pushes).toBe(consequences.length + 2);
      expectOriginalRows(before, admitted.projectId);
      expectPublicationCount(before, pushes);
    }
    expect(snapshotHistory()).toEqual(histories);
  });

/**
 * Proof: bypassing ImportedPlanResource's endpoint-shape refusal made both
 * shape cases throw instead of returning their indexed modeled refusal.
 * Bypassing its complete graph refusal admitted the current-cycle case.
 * Removing the domain SCC edge filter, then separately replacing endpoint
 * component equality with membership, misdiagnosed current cycle at [1]
 * instead of the original external [0] (independent faults, 2026-10-23).
 * Returning commit:true for dependencyRefusal in ImportService leaked staged
 * rows in the missing-step snapshot (independent faults, 2026-10-23).
 */
for (const fault of [
  'missing-row',
  'missing-step',
  'node-on-parent',
  'descendant-on-leaf',
  'cycle',
] as const)
  test(`downloaded artifact refuses current ${fault} with indexed diagnosis and no effects`, async () => {
    let pushes = 0;
    harness = OrganizationHarness.openComposedWith({
      syntheticTransferImports: true,
      pushFetch: () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
    const { remote, source } = await connectedTransferFixture(harness);
    if (fault === 'cycle') {
      harness.sqlite
        .query(
          "DELETE FROM external_dependency WHERE successor_project_id=? AND id<>'incoming-node-a'",
        )
        .run(source.projectId);
    }
    const downloaded = await exported(source.projectId);
    const stepId = remote.stepIds.at(0);
    if (stepId === undefined) throw new Error('fixture remote step absent');
    if (fault === 'missing-row') {
      harness.sqlite
        .query('UPDATE work_item SET parent_id=? WHERE id=?')
        .run(remote.parentId, remote.tailId);
      harness.sqlite
        .query(
          'DELETE FROM external_dependency WHERE predecessor_work_item_id=? OR successor_work_item_id=?',
        )
        .run(remote.leafId, remote.leafId);
      harness.sqlite
        .query(
          'DELETE FROM typed_dependency WHERE predecessor_work_item_id=? OR successor_work_item_id=?',
        )
        .run(remote.leafId, remote.leafId);
      harness.sqlite
        .query('DELETE FROM dependency WHERE predecessor_id=? OR successor_id=?')
        .run(remote.leafId, remote.leafId);
      harness.sqlite.query('DELETE FROM estimate WHERE work_item_id=?').run(remote.leafId);
      harness.sqlite.query('DELETE FROM work_item WHERE id=?').run(remote.leafId);
    } else if (fault === 'missing-step') {
      harness.sqlite
        .query('DELETE FROM external_dependency WHERE predecessor_step_id=? OR successor_step_id=?')
        .run(stepId, stepId);
      harness.sqlite
        .query('DELETE FROM typed_dependency WHERE predecessor_step_id=? OR successor_step_id=?')
        .run(stepId, stepId);
      harness.sqlite.query('DELETE FROM estimate WHERE step_id=?').run(stepId);
      harness.sqlite.query('DELETE FROM step WHERE id=?').run(stepId);
    } else if (fault === 'node-on-parent') {
      harness.sqlite
        .query(
          "INSERT INTO work_item(id,project_id,parent_id,position,name,created_at,updated_at) VALUES ('new-child',?,?,0,'New child',1,1)",
        )
        .run(remote.projectId, remote.leafId);
    } else if (fault === 'descendant-on-leaf') {
      harness.sqlite.query('UPDATE work_item SET parent_id=NULL WHERE id=?').run(remote.leafId);
    } else {
      // The persisted remote node already reaches its tail. This reverse edge
      // corrupts that real component; copied outgoing history is never an edge.
      harness.sqlite
        .query(
          "INSERT INTO typed_dependency(id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('late-cycle',?,?,?,'whole','whole','FS')",
        )
        .run(remote.projectId, remote.tailId, remote.leafId);
    }
    const index = downloaded.classified.typedDependencies.findIndex(({ predecessor }) => {
      if (!('kind' in predecessor) || predecessor.kind !== 'external') return false;
      if (fault === 'cycle') return true;
      if (fault === 'missing-row') return predecessor.workItemId === remote.leafId;
      if (fault === 'descendant-on-leaf') return predecessor.scope === 'descendant-step';
      return (
        predecessor.scope !== 'whole' &&
        predecessor.stepId === stepId &&
        (fault === 'missing-step' || predecessor.scope === 'node')
      );
    });
    expect(index).toBeGreaterThanOrEqual(0);
    if (fault === 'cycle') {
      expect(index).toBe(0);
      expect(downloaded.classified.typedDependencies.map((link) => link.id)).toEqual([
        'incoming-node-a',
        'internal-node',
      ]);
      expect(downloaded.classified.workItems.flatMap((row) => row.dependsOn)).toEqual([
        source.leafId,
      ]);
    }
    const before = transferSnapshot(harness);
    pushes = 0;
    const admitted = await importTransfer(downloaded.classified);
    expect(admitted).toEqual({
      ok: false,
      code:
        fault === 'missing-row' || fault === 'missing-step'
          ? 'unknown_ref'
          : 'invalid_typed_dependency',
      path: `typedDependencies[${String(index)}]${fault === 'cycle' ? '' : '.predecessor'}`,
      detail:
        fault === 'node-on-parent'
          ? 'node_on_parent'
          : fault === 'descendant-on-leaf'
            ? 'descendant_step_on_leaf'
            : fault === 'cycle'
              ? 'cycle'
              : null,
    });
    expect(transferSnapshot(harness)).toEqual(before);
    expect(pushes).toBe(0);
  });

/**
 * Proof: replacing the catch-path ROLLBACK with COMMIT in sqliteUnitOfWork
 * retained the imported project/rows/links and predecessor revisions, failing
 * the complete-table snapshot after the injected durable-event error (2026-10-23).
 */
test('downloaded artifact rolls back staged import and first durable elsewhere event on recording failure', async () => {
  let pushes = 0;
  harness = OrganizationHarness.openComposedWith({
    syntheticTransferImports: true,
    pushFetch: () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  const { remote, source } = await connectedTransferFixture(harness);
  const downloaded = await exported(source.projectId);
  const before = transferSnapshot(harness);
  const revisions = harness.sqlite
    .query<{ id: string; revision: number }, [string]>(
      'SELECT id,revision FROM work_item WHERE project_id=? ORDER BY id',
    )
    .all(remote.projectId);
  const originalProjects = new Set(
    harness.sqlite
      .query<{ id: string }, []>('SELECT id FROM project')
      .all()
      .map(({ id }) => id),
  );
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the spy invokes the original with its actual store receiver.
  const recordEventIn = DrizzleEventLogStore.prototype.recordEventIn;
  let injected = false;
  pushes = 0;
  const recording = spyOn(DrizzleEventLogStore.prototype, 'recordEventIn').mockImplementation(
    function (this: DrizzleEventLogStore, ...args) {
      const recorded = recordEventIn.apply(this, args);
      if (
        typeof args[2] !== 'object' ||
        args[2] === null ||
        !('type' in args[2]) ||
        args[2].type !== 'elsewhere_changed'
      )
        return recorded;
      injected = true;
      const tx = args[0];
      const copied = tx
        .all<{ id: string }>(sql`SELECT id FROM project`)
        .find(({ id }) => !originalProjects.has(id));
      if (copied === undefined) throw new Error('staged import project absent');
      expect(tx.all(sql`SELECT * FROM work_item WHERE project_id=${copied.id}`)).toHaveLength(3);
      expect(tx.all(sql`SELECT * FROM step WHERE project_id=${copied.id}`)).toHaveLength(
        source.stepIds.length,
      );
      expect(
        tx.all(sql`SELECT * FROM project_abbreviation WHERE project_id=${copied.id}`),
      ).toHaveLength(1);
      expect(
        tx.all(sql`SELECT * FROM project_organization WHERE resource_id=${copied.id}`),
      ).toHaveLength(1);
      expect(
        tx.all(sql`SELECT * FROM typed_dependency WHERE project_id=${copied.id}`),
      ).toHaveLength(1);
      expect(tx.all(sql`SELECT * FROM dependency WHERE project_id=${copied.id}`)).toHaveLength(1);
      expect(
        tx.all(sql`SELECT * FROM external_dependency WHERE successor_project_id=${copied.id}`),
      ).toHaveLength(5);
      for (const row of revisions) {
        const count = tx.get<{ count: number }>(
          sql`SELECT count(*) AS count FROM external_dependency WHERE successor_project_id=${copied.id} AND predecessor_work_item_id=${row.id}`,
        );
        expect(
          tx.get<{ revision: number }>(sql`SELECT revision FROM work_item WHERE id=${row.id}`),
        ).toEqual({
          revision: row.revision + count.count,
        });
      }
      for (const name of ['project_abbreviation_counter', 'event_log', 'event_sequencer']) {
        const staged = tx
          .all(sql.raw(`SELECT * FROM ${name}`))
          .map((row) => JSON.stringify(row))
          .sort();
        expect(staged).not.toEqual(before.find((table) => table.name === name)?.rows);
      }
      expect(
        tx.get<{ message: string }>(
          sql`SELECT message FROM event_log WHERE subscription=${recorded.subscription} AND seq=${recorded.seq}`,
        ),
      ).toEqual({ message: JSON.stringify(args[2]) });
      expect(
        tx.get<{ next_seq: number }>(
          sql`SELECT next_seq FROM event_sequencer WHERE subscription=${recorded.subscription}`,
        ),
      ).toEqual({ next_seq: recorded.seq + 1 });
      expect(pushes).toBe(0);
      throw new Error('injected after durable elsewhere insertion');
    },
  );
  try {
    await importTransfer(downloaded.classified).then(
      () => {
        throw new Error('expected injected recording failure');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
        expect(cause).toMatchObject({ message: 'injected after durable elsewhere insertion' });
      },
    );
  } finally {
    recording.mockRestore();
  }
  expect(injected).toBe(true);
  expect(transferSnapshot(harness)).toEqual(before);
  expect(pushes).toBe(0);
});
