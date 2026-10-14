import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorkingPlan } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import { type Connection, openConnection } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

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
    activateTestStepBlockages(path);
    const source = openSqliteSource({ dbPath: path });
    const stamp = { at: 10, by: 'owner' };
    const fact = { workItemId: 'blocked-owner', stepId: 'dev', blockedAt: 123 };
    try {
      await source.stores.users.create(
        { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
        stamp,
      );
      await source.stores.projects.create(
        projectRow({ id: 'blocked-project', ownerId: 'owner' }),
        [
          {
            id: 'dev',
            projectId: 'blocked-project',
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
        workItemRow({ id: fact.workItemId, projectId: 'blocked-project' }),
        [],
        stamp,
      );
      const peerId = 'blockage-peer';
      await source.stores.workItems.insert(
        workItemRow({ id: peerId, projectId: 'blocked-project', position: 20 }),
        [],
        stamp,
      );
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-project');
        expect(
          (await plan.stores.workItems.listByProject('blocked-project')).find(
            ({ id }) => id === fact.workItemId,
          )?.revision,
        ).toBe(0);
        expect(await plan.stores.blockages.set(fact, stamp)).toBe('written');
        expect(await plan.stores.blockages.listByProject('blocked-project')).toEqual([fact]);
        // Proof: skipping the wrapper refresh leaves the retained revision at zero after SQLite bumps it.
        expect(
          (await plan.stores.workItems.listByProject('blocked-project')).find(
            ({ id }) => id === fact.workItemId,
          )?.revision,
        ).toBe(1);
        plan.close();
        return { commit: false, value: undefined };
      });
      // Proof: forcing COMMIT for a refused SQLite batch left the fact here.
      expect(await source.stores.blockages.listByProject('blocked-project')).toEqual([]);
      expect((await source.stores.workItems.findById(fact.workItemId))?.revision).toBe(0);
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-project');
        expect(await plan.stores.blockages.set(fact, stamp)).toBe('written');
        expect(
          await plan.stores.blockages.listByWorkItems('blocked-project', [fact.workItemId]),
        ).toEqual([fact]);
        plan.close();
        return { commit: true, value: undefined };
      });
      expect(await source.stores.blockages.listByProject('blocked-project')).toEqual([fact]);
      expect((await source.stores.workItems.findById(fact.workItemId))?.revision).toBe(1);
      await source.uow.run(async (scope) => {
        const plan = createWorkingPlan(scope, 'blocked-project');
        const before = await plan.stores.workItems.listByProject('blocked-project');
        expect(before.find(({ id }) => id === fact.workItemId)?.revision).toBe(1);
        expect(before.find(({ id }) => id === peerId)?.revision).toBe(0);
        await plan.stores.blockages.moveAll(fact.workItemId, peerId, stamp);
        expect(await plan.stores.blockages.listByProject('blocked-project')).toEqual([
          { ...fact, workItemId: peerId },
        ]);
        const after = await plan.stores.workItems.listByProject('blocked-project');
        // Proof: omitting moveAll's retained-row refresh left this owner at revision 1.
        expect(after.find(({ id }) => id === fact.workItemId)?.revision).toBe(2);
        expect(after.find(({ id }) => id === peerId)?.revision).toBe(1);
        plan.close();
        return { commit: true, value: undefined };
      });
      expect(await source.stores.blockages.listByProject('blocked-project')).toEqual([
        { ...fact, workItemId: peerId },
      ]);
      await source.stores.workItems.remove([peerId], [], stamp);
      expect(await source.stores.blockages.listByProject('blocked-project')).toEqual([]);
    } finally {
      await source.close();
    }
  });
  it('opens without applying migrations', async () => {
    const path = databasePath();
    const source = openSqliteSource({ dbPath: path });

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
    activateTestStepBlockages(path);
    let opens = 0;
    const source = openSqliteSource({
      dbPath: path,
      openConnection: (requested): Connection => {
        opens += 1;
        return openConnection(requested);
      },
    });

    await source.stores.projects.findById('absent');
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
    activateTestStepBlockages(path);
    const source = openSqliteSource({ dbPath: path });
    expect(await source.health()).toEqual({ ok: true });
    await source.close();
  });

  it('adds context to unexpected health failures', async () => {
    const path = databasePath();
    const real = openConnection(path);
    const source = openSqliteSource({
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
      dbPath: path,
      openConnection: () => ({
        db: real.db,
        close: () => {
          closes += 1;
          throw new Error('close failed');
        },
      }),
    });

    // Proof: swallowing the cleanup error resolved this promise instead of rejecting.
    expect(source.close()).rejects.toThrow('close failed');
    // Proof: removing the closed guard threw "close failed" again here.
    await source.close();
    expect(closes).toBe(1);
  });
});
