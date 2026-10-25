import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaimStore, OrganizationOccupancyRow, PlanCommand, Scope } from '@wbs/core';
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

/**
 * `wbs-shared-occupancy` task 3.2: two claims in projects A and B of one
 * organization, each asking 10 GB of a 16 GB directory capacity at once.
 * Either fits alone; together they do not, so exactly one is applied, in one
 * process (one write coordinator) and across two connections (two
 * coordinators, ordered by SQLite's `BEGIN IMMEDIATE`).
 */
const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const ORG = 'org-race';
const RAM = 'resource-host-ram';

let directory: string;
let dbPath: string;
let source: SqliteSource;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-occupancy-cross-project-race-'));
  dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath });
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** A gate the first claim's organization read waits at, so the other batch queues behind its turn. */
interface Hold {
  armed: boolean;
  reached: () => void;
  release: Promise<void>;
}

/**
 * Projects A and B of {@link ORG}, one leaf each demanding 10 GB of `host
 * ram`, whose directory capacity is 16; agents `claire` and `codex` bound to
 * F. `stale`, when given, is what every batch's organization read answers
 * instead of reading: a read taken outside the turn.
 */
async function seeded(hold: Hold | null, stale: OrganizationOccupancyRow[] | null = null) {
  const options = {
    admission: CREATOR_ADMISSION,
    clock: clockOf({ now: () => 1_000, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const projects = [
    (await graph.projects.create('A', F)).project.id,
    (await graph.projects.create('B', F)).project.id,
  ] as const;
  for (const id of ['claire', 'codex']) {
    await source.stores.directory.addPerson({ id, name: id, kind: 'agent' }, [], { at: 1, by: F });
    const bound = await source.stores.directory.patchPerson(id, { accountId: F }, { at: 1, by: F });
    if (!bound.ok) throw new Error(`binding ${id} was refused`);
  }
  const added = await source.stores.directory.addResource(
    { id: RAM, name: 'host ram', kind: 'divisible', unitLabel: 'GB' },
    { at: 1, by: F },
  );
  if (!added.ok) throw new Error('the resource was refused');
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES (${ORG}, ${ORG}, 1)`);
  for (const id of projects)
    source.db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${id}, ${ORG})`,
    );
  source.db.run(
    sql`INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (${RAM}, ${ORG}, 'host ram')`,
  );
  const stated = await source.stores.directory.setDirectoryCapacity(RAM, 16, {
    stamp: { at: 1, by: F },
    actor: F,
    auditId: 'audit-1',
  });
  if (!stated.ok) throw new Error('the directory capacity was refused');
  const gated = (claims: ClaimStore): ClaimStore =>
    Object.assign(Object.create(Object.getPrototypeOf(claims) as object) as ClaimStore, claims, {
      organizationOccupancyOf: async (ids: readonly string[]) => {
        if (hold?.armed === true) {
          hold.armed = false;
          hold.reached();
          await hold.release;
        }
        return stale ?? claims.organizationOccupancyOf(ids);
      },
    });
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, claims: gated(scope.stores.claims) },
        { ...options, broadcast: announcements },
      ),
  });
  const leaves: string[] = [];
  for (const projectId of projects) {
    const plan = await runner.run(projectId, F, [
      { kind: 'createWorkItem', ref: 'leaf', name: 'Leaf', parentId: null, afterId: null },
      { kind: 'setDemand', workItemRef: 'leaf', resourceId: RAM, units: 10 },
    ]);
    if (!plan.ok) throw new Error(`the plan was refused: ${JSON.stringify(plan)}`);
    leaves.push(plan.results[0]?.id ?? '');
  }
  const claim = (index: 0 | 1): PlanCommand => ({
    kind: 'claimWorkItem',
    workItemId: leaves[index] ?? '',
    personId: index === 0 ? 'claire' : 'codex',
  });
  /** Each leaf's units: its largest copy, one per leaf however many steps it claimed. */
  const held = () =>
    source.db.all<{ units: number }>(
      sql`SELECT max(o.units) AS units FROM claim_occupancy AS o JOIN claim AS c ON c.id = o.claim_id GROUP BY c.work_item_id ORDER BY units`,
    );
  return { projects, leaves, runner, claim, held };
}

describe('two projects claim a shared resource at once', () => {
  for (const first of [0, 1] as const) {
    it(`applies exactly one in one process (project ${first === 0 ? 'A' : 'B'} first)`, async () => {
      let reached: () => void = () => undefined;
      const queued = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let release: () => void = () => undefined;
      const hold: Hold = {
        armed: false,
        reached,
        release: new Promise<void>((resolve) => {
          release = resolve;
        }),
      };
      const { projects, runner, claim, held } = await seeded(hold);
      const second = first === 0 ? 1 : 0;
      hold.armed = true;
      const winner = runner.run(projects[first], F, [claim(first)]);
      await queued;
      // The first batch holds the write turn inside its organization read; the second queues.
      const loser = runner.run(projects[second], F, [claim(second)]);
      await Bun.sleep(20);
      release();
      // Proof, each watched 2026-10-25: with every batch's organization read
      // answered by rows read before either took its turn (`stale` = []),
      // both orders stored both claims, 20 of 16; with the organization check
      // skipped in the claim path (no directory capacity read), the same.
      const [won, lost] = await Promise.all([winner, loser]);
      expect(won).toMatchObject({ ok: true });
      expect(lost).toMatchObject({
        ok: false,
        reason: 'resources_exhausted',
        detail: { asked: 10, free: 6, scope: 'organization' },
      });
      expect(held()).toEqual([{ units: 10 }]);
    });
  }

  it('applies exactly one across two connections', async () => {
    const { projects, leaves, held } = await seeded(null);
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const state = new Int32Array(barrier);
    const workers = [0, 1].map(
      () => new Worker(new URL('./claim-occupancy-cross-project-race.worker.ts', import.meta.url)),
    );
    try {
      const outcomes = workers.map(
        (worker) =>
          new Promise<string>((resolve, reject) => {
            worker.onmessage = (message: MessageEvent<string>) => {
              resolve(message.data);
            };
            worker.onerror = reject;
          }),
      );
      for (const [index, worker] of workers.entries())
        worker.postMessage({
          path: dbPath,
          barrier,
          projectId: projects[index === 0 ? 0 : 1],
          workItemId: leaves[index],
          personId: index === 0 ? 'claire' : 'codex',
          actorId: F,
        });
      const deadline = Date.now() + 10_000;
      while (Atomics.load(state, 0) < 2 && Date.now() < deadline) await Bun.sleep(5);
      expect(Atomics.load(state, 0)).toBe(2);
      Atomics.store(state, 1, 1);
      Atomics.notify(state, 1, 2);
      // Proof: with the organization check skipped in the claim path, both
      // workers answered applied; watched 2026-10-25.
      expect((await Promise.all(outcomes)).sort()).toEqual(['applied', 'resources_exhausted']);
      expect(held()).toEqual([{ units: 10 }]);
    } finally {
      Atomics.store(state, 1, 1);
      Atomics.notify(state, 1, 2);
      for (const worker of workers) worker.terminate();
    }
  }, 30_000);
});
