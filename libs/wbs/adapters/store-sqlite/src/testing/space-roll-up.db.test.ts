import type { DirectoryCatalog, DirectoryCatalogRows } from '@wbs/core';
import * as treePresentation from '@wbs/core/module/work-item/work-item.resource';
import type { CommandCaller } from '@wbs/core/ports/command-access';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { CurrentPlanInputMemo } from '../current-plan-input-memo';
import {
  type Connection,
  type Drizzle,
  observeCommitted,
  openReadOnlyConnection,
  poolReadConnections,
} from '../db';
import { DirectoryRepository } from '../directory';
import type { ReadSnapshotLifetime } from '../read-snapshot-lifetime';
import { createReadSnapshotLifetime } from '../read-snapshot-lifetime';
import { createSavedCurrentCapture, type SavedCurrentReader } from '../saved-current-capture';
import { SqliteSpaceRead } from '../space-read';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
type Captured = NonNullable<Awaited<ReturnType<SavedCurrentReader['captureIn']>>>;

test(
  'current row memo evicts old packages and declines oversized retained input',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (_spaces, owner, capture) => {
        const captured = await capture();
        if (captured.kind !== 'local') throw Error('expected local capture');
        const memo = new CurrentPlanInputMemo();
        await observeCommitted(
          () => ({
            db: owner(),
            close() {
              return undefined;
            },
          }),
          (db) => {
            for (let index = 0; index < 33; index += 1) {
              const id = `bounded-${String(index)}`;
              const turn = memo.observeIn(db, id, expectedAccess());
              if (turn === null) throw Error('expected native memo');
              turn.remember({
                ...captured.reads,
                workPackage: { ...captured.reads.workPackage, id },
              });
            }
            expect(
              memo.observeIn(db, 'bounded-0', expectedAccess())?.read(captured.reads.workPackage),
            ).toBeUndefined();
            expect(
              memo.observeIn(db, 'bounded-32', expectedAccess())?.read(captured.reads.workPackage)
                ?.estimates,
            ).toEqual(captured.reads.estimates);
            const oversized = structuredClone(captured.reads);
            const first = oversized.workItems.at(0);
            if (first === undefined) throw Error('expected captured row');
            Object.assign(first, { name: 'x'.repeat(9 * 1024 * 1024) });
            const turn = memo.observeIn(db, 'oversized', expectedAccess());
            if (turn === null) throw Error('expected native memo');
            turn.remember(oversized);
            expect(turn.read(oversized.workPackage) === undefined).toBe(true);
          },
        );
      });
    }),
  60000,
);

test(
  'current capture stops before memo publication if its last directory read expires the lifetime',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (_spaces, owner, capture) => {
        await capture();
        const current = createSavedCurrentCapture({ schedulerOf: () => fastScheduler });
        const lifetime = createReadSnapshotLifetime();
        let expired = false;
        let lateQueries = 0;
        const observed = new Proxy(owner(), {
          get(target, key, receiver): unknown {
            const operation: unknown = Reflect.get(target, key, receiver);
            if (key !== 'get' && key !== 'all') return operation;
            if (typeof operation !== 'function') throw Error('native query method missing');
            return (...args: unknown[]): unknown => {
              if (expired) lateQueries += 1;
              return Reflect.apply(operation, target, args);
            };
          },
        });
        const readDirectory = Reflect.get(DirectoryRepository.prototype, 'listInOrganization');
        const patched = spyOn(
          DirectoryRepository.prototype,
          'listInOrganization',
        ).mockImplementation(async function <C extends DirectoryCatalog>(
          this: DirectoryRepository,
          kind: C,
          organizationId: string,
        ): Promise<DirectoryCatalogRows[C]> {
          // The retained generic method receives the same catalog; call loses only that type correlation.
          const entries = (await readDirectory.call(
            this,
            kind,
            organizationId,
          )) as DirectoryCatalogRows[C];
          if (kind === 'resources') {
            lifetime.expire();
            expired = true;
          }
          return entries;
        });
        try {
          expect(
            await failureOf(
              observeCommitted(
                () => ({
                  db: observed,
                  close() {
                    return undefined;
                  },
                }),
                (db) =>
                  current.captureIn(
                    db,
                    expectedAccess(),
                    'catalogue-author',
                    'catalogue-empty-package',
                    lifetime,
                  ),
              ),
            ),
          ).toMatchObject({ message: 'read snapshot is closed' });
          expect(lateQueries).toBe(0);
        } finally {
          patched.mockRestore();
          lifetime.expire();
        }
      });
    }),
  60000,
);

async function withReadOwner(
  fixture: Fixture,
  use: (
    spaces: SqliteSpaceRead,
    owner: () => Drizzle,
    capture: () => Promise<Captured>,
  ) => Promise<void>,
) {
  const location = fixture.source.db.get<{ file: string } | undefined>(
    sql`SELECT file FROM pragma_database_list WHERE name='main'`,
  );
  if (location === undefined || location.file === '') throw Error('fixture path missing');
  const owners: Connection[] = [];
  const pool = poolReadConnections(() => {
    const connection = openReadOnlyConnection(location.file);
    owners.push(connection);
    return connection;
  });
  const current = createSavedCurrentCapture({ schedulerOf: () => fastScheduler });
  const spaces = new SqliteSpaceRead(
    {
      openConnection: () => pool.acquire(),
      activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
      now: () => 100,
    },
    current,
  );
  const owner = () => {
    const connection = owners.at(0);
    if (connection === undefined) throw Error('readonly owner not acquired');
    return connection.db;
  };
  const capture = () =>
    observeCommitted(
      () => pool.acquire(),
      async (db) => {
        const lifetime = createReadSnapshotLifetime();
        try {
          const captured = await current.captureIn(
            db,
            expectedAccess(),
            'catalogue-author',
            'catalogue-empty-package',
            lifetime,
          );
          if (captured === null) throw Error('expected admitted current capture');
          return captured;
        } finally {
          lifetime.expire();
        }
      },
    );
  try {
    await use(spaces, owner, capture);
  } finally {
    pool.close();
  }
}

test(
  'warm current rows invalidate a TEMP estimate shadow across pool loans',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (spaces, owner) => {
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
        owner().run(
          `CREATE TEMP VIEW estimate AS SELECT work_item_id,step_id,optimistic*10 AS optimistic,realistic*10 AS realistic,pessimistic*10 AS pessimistic,created_at,created_by,updated_at FROM main.estimate`,
        );
        try {
          expect(
            await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
          ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 200 } }] });
        } finally {
          owner().run('DROP VIEW temp.estimate');
        }
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
      });
    }),
  60000,
);

test(
  'retained current rows isolate both initial and warm capture mutations',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (_spaces, _owner, capture) => {
        const first = await capture();
        if (first.kind !== 'local') throw Error('expected local capture');
        expect(
          first.reads.estimates.find((row) => row.workItemId === 'roll-first')?.realistic,
        ).toBe(12);
        Object.assign(first.reads.estimates.find((row) => row.workItemId === 'roll-first') ?? {}, {
          realistic: 999,
        });
        const second = await capture();
        if (second.kind !== 'local') throw Error('expected local capture');
        expect(
          second.reads.estimates.find((row) => row.workItemId === 'roll-first')?.realistic,
        ).toBe(12);
        Object.assign(second.reads.estimates.find((row) => row.workItemId === 'roll-first') ?? {}, {
          realistic: 888,
        });
        const third = await capture();
        if (third.kind !== 'local') throw Error('expected local capture');
        expect(
          third.reads.estimates.find((row) => row.workItemId === 'roll-first')?.realistic,
        ).toBe(12);
      });
    }),
  60000,
);

test(
  'current row memo includes fresh settings and refuses publication after local snapshot changes',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (_spaces, owner, capture) => {
        const captured = await capture();
        if (captured.kind !== 'local') throw Error('expected local capture');
        const memo = new CurrentPlanInputMemo();
        await observeCommitted(
          () => ({
            db: owner(),
            close() {
              return undefined;
            },
          }),
          (db) => {
            const turn = memo.observeIn(db, 'catalogue-empty-package', expectedAccess());
            if (turn === null) throw Error('expected native memo');
            turn.remember(captured.reads);
            const original = memo.evidenceOf(captured.reads);
            const changed = turn.read({ ...captured.reads.workPackage, startDate: '2027-01-04' });
            if (changed === undefined) throw Error('expected retained rows');
            expect(changed.workPackage.startDate).toBe('2027-01-04');
            expect(memo.evidenceOf(changed)).not.toBe(original);
            db.run('CREATE TEMP TABLE capture_interference (id INTEGER PRIMARY KEY)');
            try {
              expect(() => {
                turn.remember(captured.reads);
              }).toThrow('changed during capture');
            } finally {
              db.run('DROP TABLE temp.capture_interference');
            }
          },
        );
      });
    }),
  60000,
);

test(
  'current input fingerprints cover row facts independently of application revisions',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await withReadOwner(fixture, async (_spaces, owner, capture) => {
        const captured = await capture();
        if (captured.kind !== 'local') throw Error('expected local capture');
        const memo = new CurrentPlanInputMemo();
        await observeCommitted(
          () => ({
            db: owner(),
            close() {
              return undefined;
            },
          }),
          (db) => {
            const turn = memo.observeIn(db, 'catalogue-empty-package', expectedAccess());
            if (turn === null) throw Error('expected native memo');
            turn.remember(captured.reads);
            const original = memo.evidenceOf(captured.reads);
            const changed = structuredClone(captured.reads);
            const estimate = changed.estimates.find((row) => row.workItemId === 'roll-first');
            if (estimate === undefined) throw Error('expected estimate');
            Object.assign(estimate, { realistic: 99 });
            turn.remember(changed);
            expect(memo.evidenceOf(changed)).not.toBe(original);
          },
        );
      });
    }),
  60000,
);

function caller(): CommandCaller {
  return {
    kind: 'human',
    principal: {
      id: 'catalogue-author',
      username: 'catalogue-author',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 100 },
      organizationOperation: {
        kind: 'read',
        expected: { kind: 'present', organizationId: 'catalogue-org' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'catalogue-author' },
      scope: { organizationId: 'catalogue-org', userId: 'catalogue-author', cap: null },
    },
  };
}

function expectedAccess() {
  const evidence = caller();
  if (evidence.kind !== 'human') throw Error('expected human caller');
  return evidence.expectedAccess;
}

function reader(fixture: Fixture) {
  return fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler }).createSpaceRead({
    activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
    now: () => 100,
  });
}

async function failureOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (cause) {
    return cause;
  }
  throw Error('expected failed observation');
}

async function withinSpace(use: (fixture: Fixture) => Promise<void>) {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    undefined,
    'empty-project',
  );
  try {
    await use(fixture);
  } finally {
    await fixture.close();
  }
}

function grant(
  fixture: Fixture,
  role = 'org-viewer',
  scope = 'organization',
  scopeId = 'catalogue-org',
) {
  fixture.source.db
    .run(sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at)
    VALUES(${crypto.randomUUID()},'catalogue-org',${scope},${scopeId},'user','catalogue-author',${role},'route',100)`);
}

/** Synthetic trusted storage in this isolated reader fixture; no runtime activation claim. */
function enableDependencies(fixture: Fixture) {
  const receipt = JSON.stringify({
    protocol: 'wbs-dependency-activation',
    version: 1,
    activationId: 'space-rollup-storage-fixture',
    databaseIdentity: 'isolated-test-database',
    candidateImage: 'fixture@sha256:' + 'a'.repeat(64),
    rollbackImage: 'fixture@sha256:' + 'b'.repeat(64),
    participantProofSha256: 'c'.repeat(64),
    migrationCaptureSha256: 'd'.repeat(64),
    activatedAt: 1,
  });
  fixture.source.db.run(
    sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${receipt})`,
  );
  fixture.source.db.run(
    sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`,
  );
}

async function prepare(fixture: Fixture) {
  const { source, seed } = fixture;
  source.db.run(
    sql`UPDATE work_package SET project_id='catalogue-project', start_date='2026-11-02' WHERE id='catalogue-empty-package'`,
  );
  source.db.run(
    sql`UPDATE work_package SET project_id='catalogue-project', start_date='2026-11-09' WHERE id='catalogue-sibling-package'`,
  );
  expect(
    (
      await source.stores.stepCatalogue.defineAndBindStep(
        seed.organizationId,
        {
          id: 'roll-dev',
          code: 'roll-dev',
          name: 'Development',
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
          position: 10,
        },
        {
          bindingId: 'roll-binding',
          scopeKind: 'project',
          scopeId: 'catalogue-project',
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  for (const [id, workPackageId, days] of [
    ['roll-first', 'catalogue-empty-package', 12],
    ['roll-second', 'catalogue-sibling-package', 8],
  ] as const) {
    await source.stores.workItems.insert(
      workItemRow({ id, name: id, workPackageId, position: 10 }),
      [],
      seed.stamp,
    );
    expect(
      await source.stores.estimates.set(
        {
          workItemId: id,
          stepId: 'roll-dev',
          optimistic: days,
          realistic: days,
          pessimistic: days,
        },
        seed.stamp,
      ),
    ).toBe('written');
  }
}

test(
  'actual bound Source folds both child packages and includes an admitted empty project',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const observed = await reader(fixture).rollUps(caller(), 'catalogue-space', [
        'catalogue-project',
        'empty-project',
      ]);
      expect(observed).toMatchObject({
        ok: true,
        value: [
          {
            project: { id: 'catalogue-project', name: 'Catalogue project' },
            position: 10,
            rollUp: {
              kind: 'rolled_up',
              dates: { startsOn: '2026-11-02' },
              finalTotal: 20,
              counts: { leaves: 2, estimated: 2 },
            },
            workPackages: [
              { workPackage: { id: 'catalogue-empty-package' }, rollUp: { finalTotal: 12 } },
              { workPackage: { id: 'catalogue-sibling-package' }, rollUp: { finalTotal: 8 } },
            ],
          },
          {
            project: { id: 'empty-project', name: 'empty-project' },
            rollUp: { kind: 'empty' },
            workPackages: [],
          },
        ],
      });
    }),
  60000,
);

test(
  'package-only project rollups exclude hidden child effort and keep exact parent shells',
  () =>
    withinSpace(async (fixture) => {
      await prepare(fixture);
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      grant(fixture, 'package-viewer', 'work_package', 'catalogue-empty-package');
      fixture.source.db.run(
        sql`UPDATE project SET created_at=x'0102' WHERE id='catalogue-project'`,
      );
      const observed = await reader(fixture).rollUps(caller(), 'catalogue-space', [
        'catalogue-project',
      ]);
      expect(observed).toMatchObject({
        ok: true,
        value: [
          {
            project: { id: 'catalogue-project', name: 'Catalogue project' },
            rollUp: { finalTotal: 12, counts: { leaves: 1 } },
            workPackages: [{ workPackage: { id: 'catalogue-empty-package' } }],
          },
        ],
      });
      if (!observed.ok) throw Error('expected project rollup');
      expect(observed.value[0]?.project).toEqual({
        id: 'catalogue-project',
        name: 'Catalogue project',
      });
      expect(observed.value[0]?.workPackages).toHaveLength(1);
      expect(await reader(fixture).rollUps(caller(), 'catalogue-space', ['empty-project'])).toEqual(
        { ok: false, refusal: 'not_found' },
      );
    }),
  60000,
);

test(
  'a project outside the named space refuses the entire rollup query but appears in All projects',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      expect(
        await reader(fixture).rollUps(caller(), 'catalogue-space', [
          'catalogue-project',
          'catalogue-sibling-project',
        ]),
      ).toEqual({ ok: false, refusal: 'not_found' });
      expect(
        await reader(fixture).rollUps(caller(), 'all', ['catalogue-sibling-project']),
      ).toMatchObject({ ok: true, value: [{ project: { id: 'catalogue-sibling-project' } }] });
    }),
  60000,
);

test(
  'current membership loss refuses the whole Source rollup observation',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      const spaces = reader(fixture);
      fixture.source.db.run(
        sql`DELETE FROM organization_membership WHERE organization_id='catalogue-org' AND user_id='catalogue-author'`,
      );
      expect(await spaces.rollUps(caller(), 'catalogue-space', ['empty-project'])).toMatchObject({
        ok: false,
        refusal: 'not_a_member',
      });
    }),
  60000,
);

test(
  'an unavailable installed engine makes the parent unavailable without a Fast fallback',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      fixture.source.db.run(
        sql`UPDATE work_package SET schedule_engine='optimized', optimization_enabled=1 WHERE id='catalogue-sibling-package'`,
      );
      const observed = await reader(fixture).rollUps(caller(), 'catalogue-space', [
        'catalogue-project',
      ]);
      expect(observed).toMatchObject({
        ok: true,
        value: [
          {
            rollUp: { kind: 'unavailable' },
            workPackages: [
              { rollUp: { kind: 'rolled_up', finalTotal: 12 } },
              { rollUp: { kind: 'unavailable' } },
            ],
          },
        ],
      });
    }),
  60000,
);

test(
  'project membership grants child inputs and dates share one snapshot across a rival commit',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      let held = true;
      const spaces = fixture.source
        .bindLivePlans({ schedulerOf: () => fastScheduler })
        .createSpaceRead({
          activeOrganizationOf: () => async () => {
            if (held) {
              entered.resolve(undefined);
              await release.promise;
            }
            return 'catalogue-org';
          },
          now: () => 100,
        });
      const pending = spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']);
      try {
        await entered.promise;
        fixture.source.db.run(
          sql`UPDATE estimate SET optimistic=80,realistic=80,pessimistic=80 WHERE work_item_id='roll-second'`,
        );
        fixture.source.db.run(
          sql`UPDATE work_package SET start_date='2027-01-04' WHERE id='catalogue-sibling-package'`,
        );
        fixture.source.db.run(
          sql`UPDATE project SET name='Rival project' WHERE id='catalogue-project'`,
        );
      } finally {
        held = false;
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({
        ok: true,
        value: [
          {
            project: { name: 'Catalogue project' },
            rollUp: { finalTotal: 20 },
            workPackages: [
              { rollUp: { finalTotal: 12 } },
              { rollUp: { finalTotal: 8, dates: { startsOn: '2026-11-09' } } },
            ],
          },
        ],
      });
      expect(
        await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
      ).toMatchObject({
        ok: true,
        value: [
          {
            project: { name: 'Rival project' },
            rollUp: { finalTotal: 92 },
            workPackages: [
              { rollUp: { finalTotal: 12 } },
              { rollUp: { finalTotal: 80, dates: { startsOn: '2027-01-04' } } },
            ],
          },
        ],
      });
    }),
  60000,
);

test(
  'project rollup retains requested IDs while organization selection is awaited',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const spaces = fixture.source
        .bindLivePlans({ schedulerOf: () => fastScheduler })
        .createSpaceRead({
          activeOrganizationOf: () => async () => {
            entered.resolve(undefined);
            await release.promise;
            return 'catalogue-org';
          },
          now: () => 100,
        });
      const requested = ['catalogue-project'];
      const pending = spaces.rollUps(caller(), 'catalogue-space', requested);
      try {
        await entered.promise;
        requested[0] = 'empty-project';
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({
        ok: true,
        value: [{ project: { id: 'catalogue-project' }, rollUp: { finalTotal: 20 } }],
      });
    }),
  60000,
);

test(
  'local project scheduling runs after loan release and every borrowed capture lifetime expires',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const row = fixture.source.db.get<{ file: string } | undefined>(
        sql`SELECT file FROM pragma_database_list WHERE name='main'`,
      );
      if (row === undefined || row.file === '') throw Error('fixture database path missing');
      const pool = poolReadConnections(() => openReadOnlyConnection(row.file));
      const lifetimes: ReadSnapshotLifetime[] = [];
      const snapshots: Drizzle[] = [];
      const current = createSavedCurrentCapture({ schedulerOf: () => fastScheduler });
      let finishes = 0;
      const spaces = new SqliteSpaceRead(
        {
          openConnection: () => pool.acquire(),
          activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
          now: () => 100,
        },
        {
          async captureIn(snapshot, access, actorId, id, lifetime) {
            lifetimes.push(lifetime);
            snapshots.push(snapshot);
            return await current.captureIn(snapshot, access, actorId, id, lifetime);
          },
          finishLocal(captured) {
            finishes += 1;
            for (const lifetime of lifetimes)
              expect(() => {
                lifetime.assertOpen();
              }).toThrow('read snapshot is closed');
            for (const snapshot of snapshots)
              expect(() => snapshot.get(sql`SELECT 1`)).toThrow('release');
            return current.finishLocal(captured);
          },
        },
      );
      try {
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
        expect(finishes).toBe(2);
      } finally {
        pool.close();
      }
    }),
  60000,
);

test(
  'a lent rollup finishes after Source close while new observations refuse',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const spaces = fixture.source
        .bindLivePlans({ schedulerOf: () => fastScheduler })
        .createSpaceRead({
          activeOrganizationOf: () => async () => {
            entered.resolve(undefined);
            await release.promise;
            return 'catalogue-org';
          },
          now: () => 100,
        });
      const pending = spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']);
      try {
        await entered.promise;
        await fixture.source.close();
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
      expect(
        String(await failureOf(spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']))),
      ).toContain('closed');
    }),
  60000,
);

test(
  'unconfigured scheduling throws for child figures while explicit empty projects need no scheduler',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      const spaces = fixture.source.createSpaceRead({
        activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
        now: () => 100,
      });
      expect(await spaces.rollUps(caller(), 'catalogue-space', ['empty-project'])).toMatchObject({
        ok: true,
        value: [{ rollUp: { kind: 'empty' } }],
      });
      expect(
        String(await failureOf(spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']))),
      ).toContain('not configured');
    }),
  60000,
);

test(
  'malformed readable facts reject then release the pooled observation for a repaired read',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const spaces = reader(fixture);
      fixture.source.db.run(sql`UPDATE work_item SET name=x'0102' WHERE id='roll-second'`);
      expect(
        await failureOf(spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project'])),
      ).toBeInstanceOf(Error);
      fixture.source.db.run(sql`UPDATE work_item SET name='Repaired leaf' WHERE id='roll-second'`);
      expect(
        await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
      ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
    }),
  60000,
);

test(
  'project rollup retains complete caller evidence before the awaited organization selection',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const spaces = fixture.source
        .bindLivePlans({ schedulerOf: () => fastScheduler })
        .createSpaceRead({
          activeOrganizationOf: () => async () => {
            entered.resolve(undefined);
            await release.promise;
            return 'catalogue-org';
          },
          now: () => 100,
        });
      const evidence = caller();
      if (evidence.kind !== 'human' || evidence.expectedAccess.kind !== 'scoped')
        throw Error('expected scoped caller');
      const pending = spaces.rollUps(evidence, 'catalogue-space', ['catalogue-project']);
      try {
        await entered.promise;
        Object.assign(evidence.expectedAccess.scope, { organizationId: 'catalogue-foreign-org' });
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
    }),
  60000,
);

test(
  'foreign and absent spaces refuse a project rollup without disclosing a shell',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      fixture.source.db.run(
        sql`INSERT INTO space(id,organization_id,name,revision,created_at,created_by) VALUES('foreign-space','catalogue-foreign-org','Foreign',0,100,'catalogue-author')`,
      );
      for (const id of ['foreign-space', 'missing-space'])
        expect(await reader(fixture).rollUps(caller(), id, ['catalogue-project'])).toEqual({
          ok: false,
          refusal: 'not_found',
        });
    }),
  60000,
);

test(
  'a hidden required incoming endpoint refuses the entire project read before private capture',
  () =>
    withinSpace(async (fixture) => {
      await prepare(fixture);
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      grant(fixture, 'package-viewer', 'work_package', 'catalogue-empty-package');
      // Synthetic trusted storage for this isolated reader test, not a deployment activation proof.
      const receipt = JSON.stringify({
        protocol: 'wbs-dependency-activation',
        version: 1,
        activationId: 'space-rollup-storage-fixture',
        databaseIdentity: 'isolated-test-database',
        candidateImage: 'fixture@sha256:' + 'a'.repeat(64),
        rollbackImage: 'fixture@sha256:' + 'b'.repeat(64),
        participantProofSha256: 'c'.repeat(64),
        migrationCaptureSha256: 'd'.repeat(64),
        activatedAt: 1,
      });
      fixture.source.db.run(
        sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${receipt})`,
      );
      fixture.source.db.run(
        sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`,
      );
      fixture.source.db.run(
        sql`INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('roll-hidden-link','catalogue-org','catalogue-sibling-package','catalogue-empty-package','roll-second','roll-first','whole','whole','FS')`,
      );
      fixture.source.db.run(
        sql`UPDATE work_package SET estimate_method='private-invalid' WHERE id='catalogue-sibling-package'`,
      );
      expect(
        await reader(fixture).rollUps(caller(), 'catalogue-space', ['catalogue-project']),
      ).toEqual({ ok: false, refusal: 'not_found' });
    }),
  60000,
);

test(
  'an actual cyclic child keeps known project effort but withholds the aggregate dates',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      await fixture.source.stores.workItems.insert(
        workItemRow({
          id: 'roll-third',
          name: 'Cyclic sibling',
          workPackageId: 'catalogue-sibling-package',
          position: 20,
        }),
        [],
        fixture.seed.stamp,
      );
      expect(
        await fixture.source.stores.estimates.set(
          {
            workItemId: 'roll-third',
            stepId: 'roll-dev',
            optimistic: 1,
            realistic: 1,
            pessimistic: 1,
          },
          fixture.seed.stamp,
        ),
      ).toBe('written');
      fixture.source.db.run(
        sql`INSERT INTO dependency(id,work_package_id,predecessor_id,successor_id) VALUES('roll-cycle-a','catalogue-sibling-package','roll-second','roll-third'),('roll-cycle-b','catalogue-sibling-package','roll-third','roll-second')`,
      );
      expect(
        await reader(fixture).rollUps(caller(), 'catalogue-space', ['catalogue-project']),
      ).toMatchObject({
        ok: true,
        value: [
          {
            rollUp: { dates: null, finalTotal: 21 },
            workPackages: [
              { rollUp: { finalTotal: 12 } },
              { rollUp: { scheduleError: 'cycle', finalTotal: 9 } },
            ],
          },
        ],
      });
    }),
  60000,
);

for (const shared of [false, true])
  test(
    'real readable dependency placement reaches project figures with shared people ' +
      String(shared),
    () =>
      withinSpace(async (fixture) => {
        grant(fixture);
        await prepare(fixture);
        enableDependencies(fixture);
        fixture.source.db.run(
          sql`UPDATE organization SET shared_people=${shared ? 1 : 0} WHERE id='catalogue-org'`,
        );
        fixture.source.db.run(
          sql`INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('roll-visible-link','catalogue-org','catalogue-empty-package','catalogue-sibling-package','roll-first','roll-second','whole','whole','FS')`,
        );
        expect(
          await reader(fixture).rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({
          ok: true,
          value: [
            {
              rollUp: {
                kind: 'rolled_up',
                finalTotal: 20,
                dates: { startsOn: '2026-11-02', endsOn: '2026-11-27' },
              },
              workPackages: [
                {
                  rollUp: {
                    finalTotal: 12,
                    dates: { startsOn: '2026-11-02', endsOn: '2026-11-17' },
                  },
                },
                {
                  rollUp: {
                    finalTotal: 8,
                    dates: { startsOn: '2026-11-18', endsOn: '2026-11-27' },
                  },
                },
              ],
            },
          ],
        });
      }),
    60000,
  );

test(
  'actual shared local captures contribute package effort without requiring a connected graph',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      fixture.source.db.run(sql`UPDATE organization SET shared_people=1 WHERE id='catalogue-org'`);
      expect(
        await reader(fixture).rollUps(caller(), 'catalogue-space', ['catalogue-project']),
      ).toMatchObject({
        ok: true,
        value: [
          {
            rollUp: { kind: 'rolled_up', finalTotal: 20 },
            workPackages: [{ rollUp: { finalTotal: 12 } }, { rollUp: { finalTotal: 8 } }],
          },
        ],
      });
    }),
  60000,
);

test(
  'memoizes canonical child figures without hiding same-revision estimates or caller mutation',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      await prepare(fixture);
      const spaces = reader(fixture),
        presented = spyOn(treePresentation, 'workPackageCapturedTree');
      try {
        const first = await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']);
        expect(first).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 20 } }] });
        expect(presented).toHaveBeenCalledTimes(2);
        const warm = await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']);
        expect(warm).toEqual(first);
        expect(presented).toHaveBeenCalledTimes(2);
        if (!warm.ok) throw new Error('expected warm project figures');
        const warmChild = warm.value.at(0)?.workPackages.at(0);
        if (warmChild?.rollUp.kind !== 'rolled_up') throw new Error('expected warm child figures');
        Object.assign(warmChild.rollUp.counts, { leaves: 999 });
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({
          ok: true,
          value: [{ rollUp: { finalTotal: 20, counts: { leaves: 2 } } }],
        });
        if (!first.ok) throw new Error('expected first project figures');
        const child = first.value.at(0)?.workPackages.at(0);
        if (child?.rollUp.kind !== 'rolled_up') throw new Error('expected child figures');
        Object.assign(child.rollUp, { finalTotal: 999 });
        Object.assign(child.rollUp.counts, { leaves: 999 });
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({
          ok: true,
          value: [{ rollUp: { finalTotal: 20, counts: { leaves: 2 } } }],
        });
        const revision = fixture.source.db.get<{ revision: number }>(
          sql`SELECT revision FROM work_package WHERE id='catalogue-sibling-package'`,
        );
        fixture.source.db.run(
          sql`UPDATE estimate SET optimistic=9,realistic=9,pessimistic=9 WHERE work_item_id='roll-second'`,
        );
        expect(
          fixture.source.db.get<{ revision: number }>(
            sql`SELECT revision FROM work_package WHERE id='catalogue-sibling-package'`,
          ),
        ).toEqual(revision);
        expect(
          await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project']),
        ).toMatchObject({ ok: true, value: [{ rollUp: { finalTotal: 21 } }] });
        expect(presented).toHaveBeenCalledTimes(3);
        fixture.source.db.run(
          sql`DELETE FROM organization_membership WHERE organization_id='catalogue-org' AND user_id='catalogue-author'`,
        );
        expect(await spaces.rollUps(caller(), 'catalogue-space', ['catalogue-project'])).toEqual({
          ok: false,
          refusal: 'not_a_member',
        });
      } finally {
        presented.mockRestore();
      }
    }),
  60000,
);
