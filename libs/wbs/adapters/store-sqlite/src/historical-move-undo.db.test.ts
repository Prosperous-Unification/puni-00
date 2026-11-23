import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { clockOf } from '@wbs/core/ports/clock';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { type LegacyMoveCase, prepareLegacyMoveDatabase } from './testing/legacy-move-database';

const packageId = 'legacy-package',
  author = 'legacy-author';
const cases: readonly LegacyMoveCase[] = ['restore-progress', 'restore-progress-blockage'];

function readState(db: Drizzle) {
  return {
    schema: db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
    tables: db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map(({ name }) => ({
        name,
        rows: db.all('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid'),
      })),
  };
}

async function openFixture(kind: LegacyMoveCase) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-historical-move-')),
    custody = { hasUnknownOwner: false };
  let source: ReturnType<typeof openSqliteSource> | undefined;
  try {
    const archived = prepareLegacyMoveDatabase(directory, kind, custody),
      queries: string[] = [];
    try {
      source = openSqliteSource({
        dbPath: archived.path,
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
    const opened = source,
      broadcast = recordingBroadcaster();
    let now = 1000;
    const clock = clockOf({ now: () => now, newId: () => crypto.randomUUID() });
    const compose = (
      stores: Parameters<typeof servicesOver>[0],
      announcements: Parameters<typeof servicesOver>[1]['broadcast'] = broadcast,
    ) =>
      servicesOver(stores, {
        dependencyContext: createLocalDependencyContext(stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock,
        broadcast: announcements,
        scheduler: fastScheduler,
      });
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      uow: opened.uow,
      announcements: broadcast,
      publicServices: compose(opened.stores),
      batchServices: (scope, announcements) => compose(scope.stores, announcements),
    });
    expect(archived.producer).toMatchObject({
      schema: 'puni-genuine-history-producer-v1',
      scenario: kind,
      sourceCommit: 'c8018843e6ff6827f7d97b67ff986cc717656578',
      expected: true,
      replay: 'undo',
      setupRefusal: null,
    });
    expect(archived.control).toMatchObject({
      scenario: kind,
      replay: 'undo',
      expected: true,
      outcome: { ok: true },
      before: {
        progress: [
          { work_item_id: 'moving', step_id: 'legacy-dev', state: 'in_progress', stated_at: 11 },
        ],
      },
    });
    return {
      source: opened,
      runner,
      compose,
      queries,
      broadcast,
      setTime(value: number) {
        now = value;
      },
      async close() {
        try {
          await opened.close();
        } catch (cause: unknown) {
          custody.hasUnknownOwner = true;
          throw cause;
        }
        rmSync(directory, { recursive: true });
      },
    };
  } catch (primary: unknown) {
    if (source !== undefined)
      try {
        await source.close();
      } catch (cleanup: unknown) {
        throw new AggregateError(
          [primary, cleanup],
          'historical move setup and close failed; retained ' + directory,
          { cause: cleanup },
        );
      }
    if (custody.hasUnknownOwner)
      throw new Error('Historical move fixture retained at ' + directory, { cause: primary });
    rmSync(directory, { recursive: true });
    throw primary;
  }
}

for (const kind of cases) {
  for (const boundary of ['runner', 'borrowed'] as const)
    test(`genuine ${kind} keeps moving time, reapplied statement time and exact blockages through ${boundary} undo redo undo`, async () => {
      const fixture = await openFixture(kind);
      try {
        const { source } = fixture;
        const history = source.db.all('SELECT * FROM plan_event ORDER BY rowid');
        const recipes = () =>
          source.db.all('SELECT id,payload,inverse FROM command_journal ORDER BY seq');
        const originalRecipes = recipes();
        const progress = () =>
          source.db.all(
            'SELECT work_item_id,step_id,state,stated_at FROM step_progress ORDER BY work_item_id,step_id',
          );
        const blockages = () =>
          source.db.all(
            'SELECT work_item_id,step_id,blocked_at FROM step_blockage ORDER BY work_item_id,step_id',
          );
        const replay = async (direction: 'undo' | 'redo') =>
          boundary === 'runner'
            ? await fixture.runner[direction](packageId, author)
            : await source.uow.run(async ({ stores }) => {
                const outcome = await fixture
                  .compose(stores)
                  .workItems[direction](packageId, author);
                return { commit: outcome.ok, value: outcome };
              });
        expect(await replay('undo')).toMatchObject({ ok: true });
        expect(await source.stores.workItems.findById('moving')).toMatchObject({ parentId: null });
        // Proof: zeroing replay statement time failed the actual predecessor's1000/1002 assertions (genuine-move-fault-progress-time-v1).
        expect(progress()).toEqual([
          { work_item_id: 'destination', step_id: 'legacy-dev', state: 'done', stated_at: 1000 },
          { work_item_id: 'moving', step_id: 'legacy-dev', state: 'in_progress', stated_at: 11 },
        ]);
        expect(blockages()).toEqual(
          kind === 'restore-progress-blockage'
            ? [
                { work_item_id: 'destination', step_id: 'legacy-dev', blocked_at: -20 },
                { work_item_id: 'moving', step_id: 'legacy-dev', blocked_at: -10 },
              ]
            : [],
        );
        fixture.setTime(1001);
        expect(await replay('redo')).toMatchObject({ ok: true });
        expect(await source.stores.workItems.findById('moving')).toMatchObject({
          parentId: 'destination',
        });
        expect(progress()).toEqual([
          { work_item_id: 'moving', step_id: 'legacy-dev', state: 'in_progress', stated_at: 11 },
        ]);
        expect(blockages()).toEqual(
          kind === 'restore-progress-blockage'
            ? [{ work_item_id: 'moving', step_id: 'legacy-dev', blocked_at: -10 }]
            : [],
        );
        fixture.setTime(1002);
        expect(await replay('undo')).toMatchObject({ ok: true });
        expect(progress()).toEqual([
          { work_item_id: 'destination', step_id: 'legacy-dev', state: 'done', stated_at: 1002 },
          { work_item_id: 'moving', step_id: 'legacy-dev', state: 'in_progress', stated_at: 11 },
        ]);
        expect(source.db.all('SELECT * FROM plan_event ORDER BY rowid')).toEqual(history);
        expect(recipes()).toEqual(originalRecipes);
      } finally {
        await fixture.close();
      }
    });

  for (const drift of ['state', 'time', 'missing'] as const)
    test(`genuine ${kind} refuses native ${drift} drift before redo clears progress or blockage`, async () => {
      const fixture = await openFixture(kind);
      try {
        const { source } = fixture;
        expect(await fixture.runner.undo(packageId, author)).toMatchObject({ ok: true });
        const original = source.db
          .all<{
            work_item_id: string;
            step_id: string;
            state: string;
            stated_at: number;
            created_at: number;
            updated_at: number;
            created_by: string;
          }>(
            "SELECT * FROM step_progress WHERE work_item_id='destination' AND step_id='legacy-dev'",
          )
          .at(0);
        if (original === undefined)
          throw new Error('Genuine undo did not restore destination progress');
        // Isolated native stored-fact fault keeps row revisions exact, reaching the recorded snapshot guard rather than the ordinary write-version guard.
        if (drift === 'missing')
          source.db.run(
            "DELETE FROM step_progress WHERE work_item_id='destination' AND step_id='legacy-dev'",
          );
        else
          source.db.run(
            sql`UPDATE step_progress SET state=${drift === 'state' ? 'in_progress' : original.state}, stated_at=${drift === 'time' ? 456 : original.stated_at} WHERE work_item_id='destination' AND step_id='legacy-dev'`,
          );
        const before = readState(source.db);
        fixture.queries.length = 0;
        const refused = await source.uow.run(async ({ stores }) => ({
          commit: false,
          value: await fixture.compose(stores).workItems.redo(packageId, author),
        }));
        // Proof: bypassing the pre-batch snapshot accepted both genuine state drifts (genuine-move-fault-snapshot-v1).
        expect(refused).toMatchObject({
          ok: false,
          reason: 'stale_undo',
          detail: 'progress on a guarded work item changed since this command.',
        });
        expect(
          fixture.queries.filter((query) =>
            /^(insert into|update|delete from) "(work_item|step_progress|step_blockage)"/i.test(
              query,
            ),
          ),
        ).toEqual([]);
        expect(readState(source.db)).toEqual(before);
        source.db.run(
          "DELETE FROM step_progress WHERE work_item_id='destination' AND step_id='legacy-dev'",
        );
        source.db.run(
          sql`INSERT INTO step_progress(work_item_id,step_id,state,stated_at,created_at,updated_at,created_by) VALUES(${original.work_item_id},${original.step_id},${original.state},${original.stated_at},${original.created_at},${original.updated_at},${original.created_by})`,
        );
        expect(await fixture.runner.redo(packageId, author)).toMatchObject({ ok: true });
      } finally {
        await fixture.close();
      }
    });
}
