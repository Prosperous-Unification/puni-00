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

import type { Drizzle } from './db';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import {
  type LegacyReplayCase,
  prepareLegacyReplayDatabase,
} from './testing/legacy-replay-database';

const packageId = 'legacy-package',
  author = 'legacy-author';
const cases: readonly LegacyReplayCase[] = [
  'parent-last-child',
  'parent-drift-state',
  'parent-drift-time',
  'parent-drift-extra',
  'parent-drift-missing',
  'handup-new-progress',
  'destination-redo-state',
  'destination-redo-time',
  'destination-redo-missing',
];

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

async function openFixture(kind: LegacyReplayCase) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-historical-replay-')),
    custody = { hasUnknownOwner: false };
  let source: ReturnType<typeof openSqliteSource> | undefined;
  try {
    const archived = prepareLegacyReplayDatabase(directory, kind, custody),
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
    const direction: 'undo' | 'redo' = kind.startsWith('destination-redo-') ? 'redo' : 'undo';
    const oldExpected = kind === 'parent-last-child';
    expect(archived.producer).toMatchObject({
      schema: 'puni-genuine-history-producer-v1',
      scenario: kind,
      sourceCommit: 'c8018843e6ff6827f7d97b67ff986cc717656578',
      expected: oldExpected,
      replay: direction,
      setupRefusal: null,
    });
    expect(archived.control).toMatchObject({
      scenario: kind,
      replay: direction,
      expected: oldExpected,
      outcome: { ok: oldExpected },
    });
    return {
      source: opened,
      direction,
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

for (const kind of cases)
  for (const boundary of ['runner', 'borrowed'] as const)
    test(
      'genuine ' +
        kind +
        ' preserves facts and recorded history through current ' +
        boundary +
        ' refusal',
      async () => {
        const fixture = await openFixture(kind);
        try {
          const { source } = fixture;
          const before = readState(source.db);
          const entries = source.db.all<{ id: string }>(
            'SELECT id FROM command_journal ORDER BY seq',
          );
          expect(entries).toHaveLength(1);
          const entry = entries.at(0);
          if (entry === undefined) throw new Error('Genuine historical command is missing');
          const stored = source.db.all<{
            work_item_id: string;
            step_id: string;
            state: 'done' | 'in_progress';
            stated_at: number;
          }>(
            'SELECT work_item_id,step_id,state,stated_at FROM step_progress ORDER BY work_item_id,step_id',
          );
          expect(await source.stores.progress.listByWorkPackage(packageId)).toEqual(
            stored.map((row) => ({
              workItemId: row.work_item_id,
              stepId: row.step_id,
              state: row.state,
              statedAt: row.stated_at,
            })),
          );
          fixture.queries.length = 0;
          const outcome =
            boundary === 'runner'
              ? await fixture.runner[fixture.direction](packageId, author)
              : await source.uow.run(async ({ stores }) => ({
                  commit: false,
                  value: await fixture
                    .compose(stores)
                    .workItems[fixture.direction](packageId, author),
                }));
          if (kind === 'parent-last-child')
            expect(outcome).toEqual({
              ok: false,
              reason: 'step_nodes_in_use',
              detail: null,
              count: 1,
              pairs: [
                {
                  id: 'parent',
                  name: 'parent',
                  stepId: 'legacy-dev',
                  workPackageId: packageId,
                  facts: ['progress'],
                },
              ],
            });
          else
            // Proof: omitting row revisions changes both parent-state diagnostics; later safeguards still refuse (genuine-replay-fault-revisions-v1).
            expect(outcome).toEqual({
              ok: false,
              reason: 'stale_undo',
              detail:
                '“' +
                (kind.startsWith('destination-redo-') ? 'destination' : 'parent') +
                '” has changed since then.',
              entryId: entry.id,
            });
          expect(
            fixture.queries.filter((query) =>
              /^(insert into|update|delete from) "(work_item|step_progress|step_blockage)"/i.test(
                query,
              ),
            ),
          ).toEqual([]);
          const after = readState(source.db);
          expect(after.schema).toEqual(before.schema);
          expect(after.tables).toEqual(
            before.tables.map((table) =>
              boundary === 'runner' &&
              kind !== 'parent-last-child' &&
              table.name === 'command_journal'
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
