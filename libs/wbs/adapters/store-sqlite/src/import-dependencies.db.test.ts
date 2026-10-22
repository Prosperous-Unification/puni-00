import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PlanDocumentImport } from '@wbs/contracts';
import { servicesOver } from '@wbs/core';
import { createImportService } from '@wbs/core/module/plan-import/composition';
import { clockOf } from '@wbs/core/ports/clock';
import { CREATOR_ADMISSION } from '@wbs/core/ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import { LEGACY_ACCESS } from '@wbs/core/ports/organization-access';
import type { UnitOfWork } from '@wbs/core/ports/unit-of-work';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openReadOnlyDatabase } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

const ACTOR = 'import-owner';
const STAMP = { at: 1_757_851_200_000, by: ACTOR };
const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const opened: { source: SqliteSource; directory: string }[] = [];

afterEach(async () => {
  for (const { source, directory } of opened.splice(0)) {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function documentFixture(): PlanDocumentImport {
  const document = planDocumentFixture();
  document.document.version = 11;
  const parent = document.workItems.at(0);
  if (parent === undefined) throw new Error('fixture lost its row');
  const leaf = structuredClone(parent);
  // The existing preparation refuses node facts on parents.
  parent.estimates = {};
  parent.actuals = {};
  parent.progress = {};
  parent.measures = {};
  parent.assignees = {};
  document.workItems.push(
    { ...structuredClone(leaf), id: 'leaf-a', parentId: parent.id, position: 10, externalRefs: [] },
    { ...structuredClone(leaf), id: 'leaf-b', position: 20, externalRefs: [] },
  );
  document.typedDependencies = [
    {
      id: 'authored-descendant',
      type: 'FS',
      predecessor: {
        kind: 'internal',
        scope: 'descendant-step',
        workItem: parent.id,
        step: 'step-1',
      },
      successor: { kind: 'internal', scope: 'node', workItem: 'leaf-b', step: 'step-2' },
    },
    {
      id: 'authored-whole',
      type: 'SS',
      predecessor: { kind: 'internal', scope: 'whole', workItem: parent.id },
      successor: { kind: 'internal', scope: 'whole', workItem: 'leaf-b' },
    },
    {
      id: 'authored-node',
      type: 'FF',
      predecessor: { kind: 'internal', scope: 'node', workItem: 'leaf-a', step: 'step-1' },
      successor: { kind: 'internal', scope: 'node', workItem: 'leaf-b', step: 'step-2' },
    },
  ];
  return document;
}

/** Every table on the actual writer, including unsettled rows; only SQLite internals are excluded. */
function snapshotWriter(source: SqliteSource) {
  return source.db
    .all<{ name: string }>(
      sql.raw(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    )
    .map(({ name }) => {
      const quoted = `"${name.replaceAll('"', '""')}"`;
      const rows = source.db.all<Record<string, unknown>>(sql.raw(`SELECT * FROM ${quoted}`));
      return { name, rows: rows.map((row) => JSON.stringify(row)).sort() };
    });
}

/** Independently committed state, alongside the writer snapshot that catches abandoned transactions. */
function snapshotTables(path: string) {
  const db = openReadOnlyDatabase(path);
  try {
    return db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => {
        const quoted = `"${name.replaceAll('"', '""')}"`;
        const rows = db.query<Record<string, unknown>, []>(`SELECT * FROM ${quoted}`).all();
        return { name, rows: rows.map((row) => JSON.stringify(row)).sort() };
      });
  } finally {
    db.close();
  }
}

async function harness(fault: 'none' | 'relationship-throw' | 'label-refusal' = 'none') {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-import-dependencies-'));
  const path = join(directory, 'source.db');
  runMigrations(path, MIGRATIONS);
  const source = openSqliteSource({ dbPath: path });
  opened.push({ source, directory });
  await source.stores.users.create(
    { id: ACTOR, username: ACTOR, passwordHash: 'x', createdAt: STAMP.at },
    STAMP,
  );
  let next = 0;
  const clock = clockOf({ now: () => STAMP.at, newId: () => `allocated-${String(++next)}` });
  const allocationCounts: number[] = [];
  let relationshipWrites = 0;
  let labelledRelationships = 0;
  const uow: UnitOfWork = {
    run: (act) =>
      source.uow.run(async (scope) => {
        const add = async (...args: Parameters<typeof scope.stores.typedDependencies.add>) => {
          allocationCounts.push(next);
          await scope.stores.typedDependencies.add(...args);
          relationshipWrites++;
          if (fault === 'relationship-throw' && relationshipWrites === 2)
            throw new Error('injected throw after second persisted relationship');
        };
        const patch = async (...args: Parameters<typeof scope.stores.workItems.patch>) => {
          if (fault === 'label-refusal') {
            const row = await scope.stores.workItems.findById(args[0]);
            if (row === null) throw new Error('staged imported row is missing');
            labelledRelationships = (
              await scope.stores.typedDependencies.listByProject(row.projectId)
            ).length;
            return { ok: false, reason: 'unknown_tag' } as const;
          }
          return scope.stores.workItems.patch(...args);
        };
        const stores = {
          ...scope.stores,
          typedDependencies: {
            incidents: scope.stores.typedDependencies.incidents,
            listByProject: (projectId: string) =>
              scope.stores.typedDependencies.listByProject(projectId),
            listIncident: (projectIds: readonly string[]) =>
              scope.stores.typedDependencies.listIncident(projectIds),
            add,
            update: (...args: Parameters<typeof scope.stores.typedDependencies.update>) =>
              scope.stores.typedDependencies.update(...args),
            remove: (...args: Parameters<typeof scope.stores.typedDependencies.remove>) =>
              scope.stores.typedDependencies.remove(...args),
            removeAllFor: (
              ...args: Parameters<typeof scope.stores.typedDependencies.removeAllFor>
            ) => scope.stores.typedDependencies.removeAllFor(...args),
          },
          workItems: {
            listByProject: (projectId: string) => scope.stores.workItems.listByProject(projectId),
            listUpdateInstants: (projectId: string) =>
              scope.stores.workItems.listUpdateInstants(projectId),
            listByIds: (...args: Parameters<typeof scope.stores.workItems.listByIds>) =>
              scope.stores.workItems.listByIds(...args),
            listPlacements: (...args: Parameters<typeof scope.stores.workItems.listPlacements>) =>
              scope.stores.workItems.listPlacements(...args),
            findById: (id: string) => scope.stores.workItems.findById(id),
            insert: (...args: Parameters<typeof scope.stores.workItems.insert>) =>
              scope.stores.workItems.insert(...args),
            patch,
            move: (...args: Parameters<typeof scope.stores.workItems.move>) =>
              scope.stores.workItems.move(...args),
            setPositions: (...args: Parameters<typeof scope.stores.workItems.setPositions>) =>
              scope.stores.workItems.setPositions(...args),
            setFrozenNumbers: (
              ...args: Parameters<typeof scope.stores.workItems.setFrozenNumbers>
            ) => scope.stores.workItems.setFrozenNumbers(...args),
            remove: (...args: Parameters<typeof scope.stores.workItems.remove>) =>
              scope.stores.workItems.remove(...args),
          },
        };
        return act({ ...scope, stores });
      }),
  };
  const announcements = recordingBroadcaster();
  const imports = createImportService({
    externalDependencies: INACTIVE_EXTERNAL_DEPENDENCIES,
    clock,
    scheduler: fastScheduler,
    uow,
    announcements,
    batchServices: (scope, broadcast) =>
      servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        admission: CREATOR_ADMISSION,
        clock,
        broadcast,
        scheduler: fastScheduler,
      }),
  });
  return {
    source,
    path,
    imports,
    announcements,
    allocationCounts,
    relationshipWrites: () => relationshipWrites,
    labelledRelationships: () => labelledRelationships,
  };
}

describe('SQLite import relationship allocation and atomicity', () => {
  it('allocates every relationship before the first insert and persists remapped endpoint scopes', async () => {
    const fixture = await harness();
    const document = documentFixture();
    const imported = await fixture.imports.import(document, ACTOR, LEGACY_ACCESS);
    expect(imported.ok).toBe(true);
    if (!imported.ok)
      throw new Error(`import refused: ${imported.path}/${String(imported.detail)}`);
    expect(new Set(fixture.allocationCounts).size).toBe(1);
    expect(fixture.allocationCounts).toHaveLength(3);
    const stored = await fixture.source.stores.typedDependencies.listByProject(imported.projectId);
    const rows = await fixture.source.stores.workItems.listByProject(imported.projectId);
    const steps = await fixture.source.stores.projects.stepsOf(imported.projectId);
    const rowIds = new Set(rows.map(({ id }) => id));
    const stepIds = new Set(steps.map(({ id }) => id));
    expect(stored).toHaveLength(3);
    expect(new Set(stored.map(({ id }) => id)).size).toBe(3);
    expect(stored.map(({ id }) => id)).not.toContain('authored-descendant');
    for (const relationship of stored) {
      expect(relationship.projectId).toBe(imported.projectId);
      for (const endpoint of [relationship.predecessor, relationship.successor]) {
        expect(endpoint.projectId).toBe(imported.projectId);
        expect(rowIds.has(endpoint.workItemId)).toBe(true);
        if (endpoint.scope !== 'whole') expect(stepIds.has(endpoint.stepId)).toBe(true);
      }
    }
    expect(
      stored
        .map(({ predecessor, successor, type }) => [predecessor.scope, successor.scope, type])
        .sort(),
    ).toEqual([
      ['descendant-step', 'node', 'FS'],
      ['node', 'node', 'FF'],
      ['whole', 'whole', 'SS'],
    ]);
    expect(
      fixture.announcements.published.some(({ event }) => event.type === 'tree_replaced'),
    ).toBe(true);
    const original = JSON.stringify({ stored, rows, steps });
    const copied = await fixture.imports.import(document, ACTOR, LEGACY_ACCESS);
    expect(copied.ok).toBe(true);
    expect(
      JSON.stringify({
        stored: await fixture.source.stores.typedDependencies.listByProject(imported.projectId),
        rows: await fixture.source.stores.workItems.listByProject(imported.projectId),
        steps: await fixture.source.stores.projects.stepsOf(imported.projectId),
      }),
    ).toBe(original);
  });

  // Proof: omitting SQLite's catch-path ROLLBACK failed the actual-writer all-table snapshot (2026-10-22).
  it('rolls back every table after an actual second relationship write throws', async () => {
    const fixture = await harness('relationship-throw');
    const before = snapshotTables(fixture.path);
    const writerBefore = snapshotWriter(fixture.source);
    const failure: unknown = await fixture.imports
      .import(documentFixture(), ACTOR, LEGACY_ACCESS)
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: 'injected throw after second persisted relationship',
    });
    expect(fixture.relationshipWrites()).toBe(2);
    expect(snapshotTables(fixture.path)).toEqual(before);
    expect(snapshotWriter(fixture.source)).toEqual(writerBefore);
    expect(fixture.announcements.published).toEqual([]);
  });

  // Proof: replacing refusal ROLLBACK with COMMIT failed the all-table snapshot (2026-10-22).
  it('rolls back every table when labels refuse after the full relationship set is staged', async () => {
    const fixture = await harness('label-refusal');
    const before = snapshotTables(fixture.path);
    const writerBefore = snapshotWriter(fixture.source);
    expect(await fixture.imports.import(documentFixture(), ACTOR, LEGACY_ACCESS)).toMatchObject({
      ok: false,
      code: 'source_refused',
      path: 'workItems[0]',
      detail: 'unknown_tag',
    });
    expect(fixture.labelledRelationships()).toBe(3);
    expect(snapshotTables(fixture.path)).toEqual(before);
    expect(snapshotWriter(fixture.source)).toEqual(writerBefore);
    expect(fixture.announcements.published).toEqual([]);
  });
});
