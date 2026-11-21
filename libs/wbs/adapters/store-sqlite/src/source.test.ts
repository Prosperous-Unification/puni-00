import { rejects } from 'node:assert';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorkingPlan } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedLegacyPackageParent } from './testing/legacy-package-parent';
import { activateTestStepBlockages } from './testing/step-blockage-activation';
import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const dirs: string[] = [];

function databasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-sqlite-source-'));
  dirs.push(dir);
  return join(dir, 'source.db');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('openSqliteSource', () => {
  it('keeps blockage writes and refreshed owner revisions transactional', async () => {
    const path = databasePath();
    runMigrations(path, MIGRATIONS);
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    activateTestStepBlockages(path);
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    const stamp = { at: 10, by: 'owner' };
    const fact = { workItemId: 'blocked-owner', stepId: 'dev', blockedAt: 123 };
    try {
      await source.stores.users.create(
        { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
        stamp,
      );
      await source.stores.workPackages.create(
        workPackageRow({ id: 'blocked-work-package', projectId: 'fixture-project' }),
        [
          {
            id: 'dev',
            workPackageId: 'blocked-work-package',
            name: 'Dev',
            position: 10,
            code: 'dev',
            allowancePercent: 0,
            estimateUnit: 'workdays',
          },
        ],
        stamp,
      );
      await source.stores.workItems.insert(
        workItemRow({ id: fact.workItemId, workPackageId: 'blocked-work-package' }),
        [],
        stamp,
      );
      const peerId = 'blockage-peer';
      await source.stores.workItems.insert(
        workItemRow({ id: peerId, workPackageId: 'blocked-work-package', position: 20 }),
        [],
        stamp,
      );
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-work-package');
        expect(
          (await plan.stores.workItems.listByWorkPackage('blocked-work-package')).find(
            ({ id }) => id === fact.workItemId,
          )?.revision,
        ).toBe(0);
        expect(await plan.stores.blockages.set(fact, stamp)).toBe('written');
        expect(await plan.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([
          fact,
        ]);
        // Proof: skipping the wrapper refresh leaves the retained revision at zero after SQLite bumps it.
        expect(
          (await plan.stores.workItems.listByWorkPackage('blocked-work-package')).find(
            ({ id }) => id === fact.workItemId,
          )?.revision,
        ).toBe(1);
        plan.close();
        return { commit: false, value: undefined };
      });
      // Proof: forcing COMMIT for a refused SQLite batch left the fact here.
      expect(await source.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([]);
      expect((await source.stores.workItems.findById(fact.workItemId))?.revision).toBe(0);
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-work-package');
        expect(await plan.stores.blockages.set(fact, stamp)).toBe('written');
        expect(
          await plan.stores.blockages.listByWorkItems('blocked-work-package', [fact.workItemId]),
        ).toEqual([fact]);
        plan.close();
        return { commit: true, value: undefined };
      });
      expect(await source.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([
        fact,
      ]);
      expect((await source.stores.workItems.findById(fact.workItemId))?.revision).toBe(1);
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-work-package');
        const before = await plan.stores.workItems.listByWorkPackage('blocked-work-package');
        expect(before.find(({ id }) => id === fact.workItemId)?.revision).toBe(1);
        expect(before.find(({ id }) => id === peerId)?.revision).toBe(0);
        await plan.stores.blockages.moveAll(fact.workItemId, peerId, stamp);
        expect(await plan.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([
          { ...fact, workItemId: peerId },
        ]);
        const after = await plan.stores.workItems.listByWorkPackage('blocked-work-package');
        // Proof: omitting moveAll's retained-row refresh left this owner at revision 1.
        expect(after.find(({ id }) => id === fact.workItemId)?.revision).toBe(2);
        expect(after.find(({ id }) => id === peerId)?.revision).toBe(1);
        plan.close();
        return { commit: true, value: undefined };
      });
      expect(await source.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([
        { ...fact, workItemId: peerId },
      ]);
      await source.stores.workItems.remove([peerId], [], stamp);
      expect(await source.stores.blockages.listByWorkPackage('blocked-work-package')).toEqual([]);
    } finally {
      await source.close();
    }
  });
  it('opens without applying migrations', async () => {
    const path = databasePath();
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });

    expect(existsSync(path)).toBe(true);
    expect(await source.health()).toEqual({ ok: false, reason: 'unavailable' });
    const observer = openConnection(path);
    // Proof: an open-time CREATE for this table failed with Received [{ name:
    // "__drizzle_migrations" }] instead of the expected empty list.
    expect(
      observer.db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
      ),
    ).toEqual([]);
    observer.close();
    await source.close();
  });

  it('uses one process connection for transactional stores and independent history connections', async () => {
    const path = databasePath();
    runMigrations(path, MIGRATIONS);
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    activateTestStepBlockages(path);
    let opens = 0;
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      openConnection: (requested): Connection => {
        opens += 1;
        return openConnection(requested);
      },
    });

    await source.stores.workPackages.findById('absent');
    // Proof: opening another connection for the public stores failed here on
    // Expected 1, Received 2.
    expect(opens).toBe(1);
    await source.history.savedPlans.listOf('absent');
    // Proof: constructing history over the process connection left this at 1.
    expect(opens).toBe(2);
    await source.close();
  });

  it('reports a present schema as healthy', async () => {
    const path = databasePath();
    runMigrations(path, MIGRATIONS);
    seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    activateTestStepBlockages(path);
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    expect(await source.health()).toEqual({ ok: true });
    await source.close();
  });

  it('adds context to unexpected health failures', async () => {
    const path = databasePath();
    const real = openConnection(path);
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      openConnection: () => ({
        db: Object.create(real.db, {
          all: {
            value: () => {
              throw new Error('corrupt page');
            },
          },
        }) as Connection['db'],
        close: real.close,
      }),
    });
    // Proof: mapping this thrown query to unavailable failed because the
    // promise resolved instead of rejecting.
    expect(source.health()).rejects.toThrow('failed to probe SQLite source health');
    await source.close();
  });

  it('closes once and surfaces cleanup failure', async () => {
    const path = databasePath();
    const real = openConnection(path);
    let closes = 0;
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      openConnection: () => ({
        db: real.db,
        close: () => {
          closes += 1;
          throw new Error('close failed');
        },
      }),
    });

    try {
      // Historical Proof: swallowing the first cleanup error resolved instead of rejecting.
      const closing = source.close();
      await rejects(closing, (cause: unknown) => {
        expect(() => {
          throw cause;
        }).toThrow('close failed');
        return true;
      });
      const repeated = source.close();
      await repeated.then(
        () => ({ kind: 'resolved' as const }),
        (cause: unknown) => ({ kind: 'rejected' as const, cause }),
      );
      expect(closes).toBe(1);
      expect(repeated).toBe(closing);
      await rejects(repeated, (cause: unknown) => {
        expect(() => {
          throw cause;
        }).toThrow('close failed');
        return true;
      });
    } finally {
      real.close();
    }
  });
});

it('rejects health immediately while Source writer retirement waits for its owned turn', async () => {
  const source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: databasePath(),
  });
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const held = source.gate
    .enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    })
    .then(
      () => ({ ok: true as const }),
      (cause: unknown) => {
        entered.reject(cause);
        return { ok: false as const, cause };
      },
    );
  let primary: { cause: unknown } | undefined;
  let closing: Promise<{ ok: true } | { ok: false; cause: unknown }> | undefined;
  try {
    await entered.promise;
    expect(await source.health()).toEqual({ ok: false, reason: 'unavailable' });
    closing = source.close().then(
      () => ({ ok: true as const }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    const health = await source.health().then(
      (value) => ({ kind: 'resolved' as const, value }),
      (cause: unknown) => ({ kind: 'rejected' as const, cause }),
    );
    expect(health.kind).toBe('rejected');
    if (health.kind !== 'rejected') throw new Error('logically closed Source answered readiness');
    expect(health.cause).toBeInstanceOf(Error);
    if (!(health.cause instanceof Error)) throw health.cause;
    expect(health.cause.message).toBe('failed to probe SQLite source health');
    expect(readCauseMessages(health.cause)).toMatch(/closed/i);
  } catch (cause: unknown) {
    primary = { cause };
  }
  release.resolve(undefined);
  const writer = await held;
  const closed = await (closing ??
    Promise.resolve()
      .then(() => source.close())
      .then(
        () => ({ ok: true as const }),
        (cause: unknown) => ({ ok: false as const, cause }),
      ));
  const failures: unknown[] = primary === undefined ? [] : [primary.cause];
  if (!writer.ok) failures.push(writer.cause);
  if (!closed.ok) failures.push(closed.cause);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Source health observation and retirement failed');
}, 30_000);

/** Reads at most eight Error messages; native closed-DB refusal may sit below a query wrapper. */
function readCauseMessages(cause: unknown): string {
  const messages: string[] = [];
  for (let depth = 0; depth < 8 && cause instanceof Error; depth += 1) {
    messages.push(cause.message);
    cause = cause.cause;
  }
  return messages.join('\n');
}

for (const mode of ['plain', 'bound'] as const) {
  it(
    'rejects ' + mode + ' public users reads while writer retirement waits for its owned turn',
    async () => {
      const fixture = await openSqliteStepCatalogueCase(
        'stepCatalogue.unbindStep:estimate-refusal-and-preview',
      );
      const source = fixture.source;
      const publicSource =
        mode === 'plain' ? source : source.bindLivePlans({ schedulerOf: () => fastScheduler });
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const held = source.gate
        .enter(async () => {
          entered.resolve(undefined);
          await release.promise;
        })
        .then(
          () => ({ ok: true as const }),
          (cause: unknown) => {
            entered.reject(cause);
            return { ok: false as const, cause };
          },
        );
      let primary: { cause: unknown } | undefined;
      let closing: Promise<{ ok: true } | { ok: false; cause: unknown }> | undefined;
      try {
        await entered.promise;
        expect(await publicSource.stores.users.findById(fixture.seed.stamp.by)).toMatchObject({
          id: fixture.seed.stamp.by,
        });
        closing = publicSource.close().then(
          () => ({ ok: true as const }),
          (cause: unknown) => ({ ok: false as const, cause }),
        );
        const read = await publicSource.stores.users.findById(fixture.seed.stamp.by).then(
          (value) => ({ kind: 'resolved' as const, value }),
          (cause: unknown) => ({ kind: 'rejected' as const, cause }),
        );
        expect(read.kind).toBe('rejected');
        if (read.kind !== 'rejected')
          throw new Error('logically closed public users port answered');
        expect(read.cause).toBeInstanceOf(Error);
        expect(readCauseMessages(read.cause)).toMatch(/closed/i);
      } catch (cause: unknown) {
        primary = { cause };
      }
      release.resolve(undefined);
      const writer = await held;
      const closed = await (closing ??
        Promise.resolve()
          .then(() => publicSource.close())
          .then(
            () => ({ ok: true as const }),
            (cause: unknown) => ({ ok: false as const, cause }),
          ));
      const failures: unknown[] = primary === undefined ? [] : [primary.cause];
      if (!writer.ok) failures.push(writer.cause);
      if (!closed.ok) failures.push(closed.cause);
      if (closed.ok) {
        try {
          await fixture.close();
        } catch (cause: unknown) {
          failures.push(cause);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, 'public users read and Source retirement failed');
    },
    30_000,
  );
}
