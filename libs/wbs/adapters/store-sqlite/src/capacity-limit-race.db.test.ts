import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationLimitGauge, PlanCommand, ResourceAccess, Scope } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import fc from 'fast-check';

import { runMigrations } from './migrate';
import { openSqliteSource, type SqliteSource } from './source';

const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DEFAULTS = {
  maxAgentPersons: 50,
  maxConcurrentClaims: 200,
  maxCapacityUnitsPerResource: 10_000,
};
const ACCOUNTS = ['dany', 'eve'] as const;
const RESOURCES = ['ram', 'worktrees'] as const;
const SEED = 20261022;

const accessOf = (userId: string): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId, role: 'admin' },
});

/**
 * Where the gauge reads its sum. `turn` is production: inside the batch's own
 * transaction under its write turn. `stale` is the sabotage the proofs below
 * inject: a sum read before the batch queued, outside any turn.
 */
type CountSource = 'turn' | 'stale';

/** One read of the gauge to hold at while its batch keeps the write turn. */
interface Hold {
  reached: () => void;
  release: Promise<void>;
  armed: boolean;
}

let directory: string;
let source: SqliteSource;

function openFresh(prefix: string): void {
  directory = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
}

beforeEach(() => {
  openFresh('capacity-limit-race-');
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** The units of `resourceId` A's projects state, summed (L2). */
function declared(resourceId: string): number {
  return source.db.get<{ n: number }>(
    sql`SELECT coalesce(sum(units), 0) AS n FROM project_resource_capacity WHERE resource_id = ${resourceId}`,
  ).n;
}

/**
 * Organization A with both accounts as admins, a capacity cap of `cap`, the
 * resources `ram` and `worktrees`, and two projects of A, P and Q.
 */
async function seeded(cap: number, counting: { source: CountSource }) {
  for (const id of ACCOUNTS)
    source.db.run(sql`INSERT INTO users (id, username, created_at) VALUES (${id}, ${id}, 1)`);
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`);
  for (const id of ACCOUNTS)
    source.db.run(
      sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', ${id}, 'admin', 1)`,
    );
  source.db.run(
    sql`INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 50, 200, ${cap}, 1)`,
  );
  for (const id of RESOURCES) {
    source.db.run(
      sql`INSERT INTO resource (id, name, kind, unit_label, created_at) VALUES (${id}, ${id}, 'divisible', 'GB', 1)`,
    );
    source.db.run(
      sql`INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (${id}, 'org-a', ${id})`,
    );
  }
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  const projectIds: string[] = [];
  for (const name of ['P', 'Q']) {
    const created = await graph.projects.create(name, 'dany');
    source.db.run(
      sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${created.project.id}, 'org-a')`,
    );
    projectIds.push(created.project.id);
  }
  const hold: Hold = { reached: () => undefined, release: Promise.resolve(), armed: false };
  /** What the stale sum answers, per resource: the sums before the batch was asked for. */
  let staleSums = new Map<string, number>();
  const gauged = (gauge: OrganizationLimitGauge | undefined): OrganizationLimitGauge => {
    if (gauge === undefined) throw new Error('the admitted stores carry no limits gauge');
    return {
      readAgentPersonCap: (organizationId) => gauge.readAgentPersonCap(organizationId),
      readConcurrentClaimCap: (organizationId) => gauge.readConcurrentClaimCap(organizationId),
      readCapacityCap: async (organizationId, resourceId, exceptProjectId) => {
        const reading = await gauge.readCapacityCap(organizationId, resourceId, exceptProjectId);
        if (hold.armed) {
          hold.armed = false;
          hold.reached();
          await hold.release;
        }
        if (counting.source === 'turn') return reading;
        const own =
          source.db.get<{ n: number } | undefined>(
            sql`SELECT units AS n FROM project_resource_capacity WHERE project_id = ${exceptProjectId} AND resource_id = ${resourceId}`,
          )?.n ?? 0;
        return { ...reading, current: Math.max(0, (staleSums.get(resourceId) ?? 0) - own) };
      },
    };
  };
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, organizationLimits: gauged(scope.stores.organizationLimits) },
        { ...options, broadcast: announcements },
      ),
  });
  const run = (projectId: string, userId: string, commands: PlanCommand[]) =>
    runner.runWithin(projectId, userId, commands, accessOf(userId), null);
  /** Arms the hold so the next sum read waits, holding its turn, until released. */
  const holdNextRead = () => {
    let release: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      hold.reached = resolve;
    });
    hold.release = new Promise<void>((resolve) => {
      release = resolve;
    });
    hold.armed = true;
    return { reached, release };
  };
  /** Freezes the stale sums at what the store holds now, as a pre-turn read would. */
  const readSumsBeforeQueueing = () => {
    staleSums = new Map(RESOURCES.map((id) => [id, declared(id)]));
  };
  const [p, q] = [projectIds.at(0), projectIds.at(1)];
  if (p === undefined || q === undefined) throw new Error('missing projects');
  return { run, p, q, holdNextRead, readSumsBeforeQueueing };
}

const state = (resourceId: string, units: number | null): PlanCommand => ({
  kind: 'setResourceCapacity',
  resourceId,
  units,
});

describe('two projects race for the last units of a resource', () => {
  for (const [first, second] of [
    ['dany', 'eve'],
    ['eve', 'dany'],
  ] as const) {
    // Proof, watched 2026-10-22: with the gauge answering the sum read before
    // the batches queued (`counting.source` 'stale', a sum read outside the
    // turn), both statements landed, 80 of 64 (0 pass, 2 fail); with the
    // SQLite gauge answering `maxConcurrentClaims` as the cap, both orders
    // failed too.
    it(`lands exactly one of two statements of 40 under 64 (${first} first)`, async () => {
      const counting = { source: 'turn' as CountSource };
      const { run, p, q, holdNextRead, readSumsBeforeQueueing } = await seeded(64, counting);
      readSumsBeforeQueueing();

      const { reached, release } = holdNextRead();
      const winner = run(p, first, [state('ram', 40)]);
      await reached;
      // The first batch holds its turn after reading 0 of 64; the second queues.
      const loser = run(q, second, [state('ram', 40)]);
      await Bun.sleep(20);
      release();
      const [won, lost] = await Promise.all([winner, loser]);

      expect(won).toMatchObject({ ok: true });
      expect(lost).toEqual({
        ok: false,
        at: 0,
        kind: 'setResourceCapacity',
        reason: 'capacity_limit',
        detail: { resourceId: 'ram', cap: 64, declared: 40, asked: 40 },
      });
      expect(declared('ram')).toBe(40);
    });
  }
});

/** One step the model runs: a single batch, or two batches racing. */
type Act =
  | { kind: 'state'; project: number; resource: number; units: number | null; account: number }
  | {
      kind: 'race';
      left: { project: number; resource: number; units: number | null };
      right: { project: number; resource: number; units: number | null };
    };

const CAP = 64;

const pick = (max: number) => fc.integer({ min: 0, max: max - 1 });
const statementArb = fc.record({
  project: pick(2),
  resource: pick(RESOURCES.length),
  units: fc.option(fc.integer({ min: 0, max: 48 }), { nil: null }),
});
const actArb: fc.Arbitrary<Act> = fc.oneof(
  statementArb.chain((each) =>
    pick(ACCOUNTS.length).map((account) => ({ kind: 'state' as const, ...each, account })),
  ),
  fc
    .record({ left: statementArb, right: statementArb })
    .map((each) => ({ kind: 'race' as const, ...each })),
);

describe('the capacity cap as a model invariant', () => {
  /**
   * Random statements, clears and two-batch races over two projects and two
   * resources against a cap of 64. After every step no resource is stated
   * past the cap across the projects, and every refusal names a raise whose
   * other projects' units plus the asked cross the cap.
   *
   * Proof: with `counting.source` 'stale' (the gauge answering the sums read
   * before the step's batches queued, a sum read outside the turn),
   * fast-check failed `toBeLessThanOrEqual(64)` after 23 runs, both statements
   * of a race landing past the cap; watched 2026-10-22.
   */
  it('never states more units of a resource than the cap', async () => {
    let capRefusals = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(actArb, { minLength: 1, maxLength: 12 }), async (acts) => {
        await source.close();
        rmSync(directory, { recursive: true, force: true });
        openFresh('capacity-limit-model-');
        const counting = { source: 'turn' as CountSource };
        const world = await seeded(CAP, counting);
        const projectOf = (n: number) => (n === 0 ? world.p : world.q);
        const resourceOf = (n: number) => RESOURCES[n] ?? 'ram';
        const expectCapRefusalNamesACrossing = (outcome: Awaited<ReturnType<typeof world.run>>) => {
          if (outcome.ok || !('reason' in outcome) || outcome.reason !== 'capacity_limit') return;
          capRefusals += 1;
          const { cap, declared: others, asked } = outcome.detail;
          expect(cap).toBe(CAP);
          expect(others + asked).toBeGreaterThan(CAP);
        };

        for (const act of acts) {
          world.readSumsBeforeQueueing();
          if (act.kind === 'state') {
            const outcome = await world.run(
              projectOf(act.project),
              ACCOUNTS[act.account] ?? 'dany',
              [state(resourceOf(act.resource), act.units)],
            );
            expectCapRefusalNamesACrossing(outcome);
          } else {
            const [left, right] = await Promise.all([
              world.run(projectOf(act.left.project), 'dany', [
                state(resourceOf(act.left.resource), act.left.units),
              ]),
              world.run(projectOf(act.right.project), 'eve', [
                state(resourceOf(act.right.resource), act.right.units),
              ]),
            ]);
            expectCapRefusalNamesACrossing(left);
            expectCapRefusalNamesACrossing(right);
          }
          for (const id of RESOURCES) expect(declared(id)).toBeLessThanOrEqual(CAP);
        }
      }),
      { numRuns: 40, seed: SEED },
    );
    // The runs reached the cap, so the invariant was tested where it bites.
    expect(capRefusals).toBeGreaterThan(0);
  }, 120_000);
});
