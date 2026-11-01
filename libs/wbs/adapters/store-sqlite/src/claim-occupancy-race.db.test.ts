import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaimStore, PlanCommand, Scope } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const G = 'account-g';
const BOUND = new Map([
  ['claire', F],
  ['codex', G],
]);
const RAM = 'resource-ram';

let directory: string;
let source: SqliteSource;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-occupancy-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath });
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** A gate the first claim's read waits at, so the other batch is queued behind its turn. */
interface Hold {
  actor: string | null;
  reached: () => void;
  release: Promise<void>;
}

/**
 * Two leaves each demanding 4 GB of a project that states 6 GB, so either
 * claim fits alone and both together do not (`wbs-resources` R3).
 */
async function seeded(hold: Hold) {
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  for (const id of [F, G]) {
    await source.stores.users.create(
      { id, username: id, passwordHash: 'x', createdAt: 1 },
      { at: 1, by: id },
    );
  }
  const created = await graph.projects.create('Race', F);
  const projectId = created.project.id;
  for (const id of ['claire', 'codex']) {
    await source.stores.directory.addPerson({ id, name: id, kind: 'agent' }, [], { at: 1, by: F });
  }
  const added = await source.stores.directory.addResource(
    { id: RAM, name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
    { at: 1, by: F },
  );
  if (!added.ok) throw new Error('the resource was refused');
  const withIdentity = (claims: ClaimStore, actor: () => string): ClaimStore => ({
    listByProject: async (id) => {
      if (hold.actor === actor()) {
        hold.actor = null;
        hold.reached();
        await hold.release;
      }
      return claims.listByProject(id);
    },
    listStampedByProject: (id) => claims.listStampedByProject(id),
    findById: (id, claimId) => claims.findById(id, claimId),
    observeProject: (id, access) => claims.observeProject(id, access),
    occupancyOf: (id) => claims.occupancyOf(id),
    add: (written, stated, stamp, occupancy, leases) =>
      claims.add(written, stated, stamp, occupancy, leases),
    remove: (removed, cleared, stamp) => claims.remove(removed, cleared, stamp),
    moveAll: (from, to, stamp) => claims.moveAll(from, to, stamp),
    renewLeases: (personId, runId, now) => claims.renewLeases(personId, runId, now),
    expiredLeasesOf: (id, at) => claims.expiredLeasesOf(id, at),
    projectsWithExpiredLeases: (at, limit) => claims.projectsWithExpiredLeases(at, limit),
    boundAccountOf: (personId) => Promise.resolve(BOUND.get(personId) ?? null),
    pinnedPersonOf: () => Promise.resolve(null),
  });
  let acting = F;
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, claims: withIdentity(scope.stores.claims, () => acting) },
        { ...options, broadcast: announcements },
      ),
  });
  const as = (actor: string, commands: PlanCommand[]) => () => {
    acting = actor;
    return runner.run(projectId, actor, commands);
  };
  const plan = await runner.run(projectId, F, [
    { kind: 'createWorkItem', ref: 'one', name: 'One', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'two', name: 'Two', parentId: null, afterId: null },
    { kind: 'setResourceCapacity', resourceId: RAM, units: 6 },
    { kind: 'setDemand', workItemRef: 'one', resourceId: RAM, units: 4 },
    { kind: 'setDemand', workItemRef: 'two', resourceId: RAM, units: 4 },
  ]);
  if (!plan.ok) throw new Error(`the plan was refused: ${JSON.stringify(plan)}`);
  const [one, two] = plan.results.map(({ id }) => id ?? '');
  const occupied = () =>
    source.db.all<{ person_id: string; units: number }>(
      sql`SELECT c.person_id, o.units FROM claim_occupancy AS o JOIN claim AS c ON c.id = o.claim_id ORDER BY c.person_id`,
    );
  return { leaves: [one, two] as const, steps: created.steps.map(({ id }) => id), occupied, as };
}

describe('two fleets claim two leaves that do not both fit', () => {
  for (const [first, second] of [
    [F, G],
    [G, F],
  ] as const) {
    it(`admits one of two concurrent claims over capacity, the other refused resources_exhausted (${first} first)`, async () => {
      let reached: () => void = () => undefined;
      const queued = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let release: () => void = () => undefined;
      const hold: Hold = {
        actor: first,
        reached,
        release: new Promise<void>((resolve) => {
          release = resolve;
        }),
      };
      const { leaves, steps, occupied, as } = await seeded(hold);
      const [dev] = steps;
      const person = (actor: string) => (actor === F ? 'claire' : 'codex');
      const leaf = (actor: string) => (actor === F ? leaves[0] : leaves[1]);
      const claim = (actor: string): PlanCommand => ({
        kind: 'claimWorkItem',
        workItemId: leaf(actor),
        personId: person(actor),
        steps: [dev],
      });
      const winner = as(first, [claim(first)])();
      await queued;
      // The first batch holds the write turn inside its claim read; the second queues.
      const loser = as(second, [claim(second)])();
      await Bun.sleep(20);
      release();
      // Proof: with `refuseOccupancy`'s comparison answering null, both orders
      // stored both claims and 8 GB of a 6 GB capacity; watched 2026-10-20. The
      // check is the claim's own, read inside the coordinator's turn: the
      // store writes what it is given (`ClaimStore.add`).
      const [won, lost] = await Promise.all([winner, loser]);
      expect(won).toMatchObject({ ok: true });
      expect(lost).toMatchObject({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'resources_exhausted',
        detail: {
          resourceId: RAM,
          asked: 4,
          free: 2,
          holders: [{ personId: person(first), name: person(first), workItemId: leaf(first) }],
        },
      });
      expect(occupied()).toEqual([{ person_id: person(first), units: 4 }]);
    });
  }
});
