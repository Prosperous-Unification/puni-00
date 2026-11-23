import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';

import { type Drizzle } from './db';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import {
  type LegacyDeleteCase,
  prepareLegacyDeleteDatabase,
} from './testing/legacy-delete-database';

function readState(db: Drizzle) {
  const schema = db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
  const tables = db
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .map(({ name }) => ({
      name,
      rows: db.all('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid'),
    }));
  return { schema, tables };
}

async function openFixture(kind: LegacyDeleteCase) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-historical-delete-'));
  const custody = { hasUnknownOwner: false };
  let source: ReturnType<typeof openSqliteSource> | undefined;
  const queries: string[] = [];
  try {
    const path = prepareLegacyDeleteDatabase(directory, kind, custody);
    try {
      source = openSqliteSource({
        dbPath: path,
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        logger: {
          logQuery(query) {
            queries.push(query);
          },
        },
      });
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    const broadcast = recordingBroadcaster();
    const compose = (
      stores: Parameters<typeof servicesOver>[0],
      announcements: Parameters<typeof servicesOver>[1]['broadcast'] = broadcast,
    ) =>
      servicesOver(stores, {
        dependencyContext: createLocalDependencyContext(stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock: testClock,
        broadcast: announcements,
        scheduler: fastScheduler,
      });
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: source.uow,
      announcements: broadcast,
      publicServices: compose(source.stores),
      batchServices: (scope, announcements) => compose(scope.stores, announcements),
    });
    const owned = source;
    return {
      source: owned,
      queries,
      runner,
      compose,
      broadcast,
      async close() {
        try {
          await owned.close();
        } catch (cause: unknown) {
          custody.hasUnknownOwner = true;
          throw cause;
        }
        rmSync(directory, { recursive: true });
      },
    };
  } catch (primary: unknown) {
    if (source !== undefined) {
      try {
        await source.close();
      } catch (cleanup: unknown) {
        custody.hasUnknownOwner = true;
        throw new AggregateError([primary, cleanup], 'historical deletion setup and close failed', {
          cause: cleanup,
        });
      }
    }
    if (custody.hasUnknownOwner)
      throw new Error('Historical deletion fixture retained at ' + directory, { cause: primary });
    rmSync(directory, { recursive: true });
    throw primary;
  }
}

const detail =
  'that deletion recorded progress on a parent, which cannot be restored as a current step node.';
const packageId = 'legacy-package';
const author = 'legacy-author';

for (const boundary of ['runner', 'borrowed'] as const) {
  test(
    'refuses genuine historical parent progress before deletion undo writes through ' + boundary,
    async () => {
      const fixture = await openFixture('parent-progress');
      try {
        const before = readState(fixture.source.db);
        const entries = await fixture.source.stores.journal.entriesFor({
          workPackageId: packageId,
          userId: author,
          personId: null,
        });
        expect(entries).toHaveLength(1);
        const selected = entries.at(0);
        if (selected === undefined) throw new Error('Genuine deletion journal is absent');
        fixture.queries.length = 0;
        const outcome =
          boundary === 'runner'
            ? await fixture.runner.undo(packageId, author)
            : await fixture.source.uow.run(async ({ stores }) => ({
                commit: false,
                value: await fixture.compose(stores).workItems.undo(packageId, author),
              }));
        expect(outcome).toEqual({ ok: false, reason: 'stale_undo', detail, entryId: selected.id });
        const attemptedWrites = fixture.queries.filter((query) =>
          /^(insert into|update|delete from) "(work_item|step_progress|step_blockage)"/i.test(
            query,
          ),
        );
        expect(attemptedWrites).toEqual([]);
        const after = readState(fixture.source.db);
        expect(after.schema).toEqual(before.schema);
        expect(after.tables).toEqual(
          before.tables.map((table) =>
            boundary === 'runner' && table.name === 'command_journal'
              ? { ...table, rows: [] }
              : table,
          ),
        );
        expect(fixture.broadcast.published).toEqual([]);
      } finally {
        await fixture.close();
      }
    },
  );
}

test('restores a genuine historical leaf-only deletion with exact progress time through undo redo undo', async () => {
  const fixture = await openFixture('leaf-only');
  try {
    const history = fixture.source.db.all('SELECT * FROM plan_event ORDER BY rowid');
    const readProgress = () =>
      fixture.source.db.all('SELECT work_item_id,step_id,state,stated_at FROM step_progress');
    expect(await fixture.runner.undo(packageId, author)).toMatchObject({ ok: true });
    expect(await fixture.source.stores.workItems.findById('moving')).toMatchObject({
      parentId: 'parent',
    });
    expect(readProgress()).toEqual([
      { work_item_id: 'moving', step_id: 'legacy-dev', state: 'done', stated_at: 20 },
    ]);
    expect(await fixture.runner.redo(packageId, author)).toMatchObject({ ok: true });
    expect(await fixture.source.stores.workItems.findById('moving')).toBeNull();
    expect(readProgress()).toEqual([
      { work_item_id: 'parent', step_id: 'legacy-dev', state: 'done', stated_at: 20 },
    ]);
    expect(await fixture.runner.undo(packageId, author)).toMatchObject({ ok: true });
    expect(readProgress()).toEqual([
      { work_item_id: 'moving', step_id: 'legacy-dev', state: 'done', stated_at: 20 },
    ]);
    expect(fixture.source.db.all('SELECT * FROM plan_event ORDER BY rowid')).toEqual(history);
  } finally {
    await fixture.close();
  }
});

test('retains genuine deletion history when required current package values are unreadable', async () => {
  const fixture = await openFixture('parent-progress');
  try {
    // Isolated native trusted-state fault: no port or history response is substituted.
    fixture.source.db.run('DROP TABLE work_package_step');
    const before = readState(fixture.source.db);
    const failure: unknown = await fixture.runner.undo(packageId, author).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Missing current values did not reject');
    expect(failure.message).toContain('work_package_step');
    expect(readState(fixture.source.db)).toEqual(before);
    expect(fixture.broadcast.published).toEqual([]);
  } finally {
    await fixture.close();
  }
});
