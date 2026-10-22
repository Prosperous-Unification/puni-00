import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OrganizationLimitGauge, PlanCommand, ResourceAccess, Scope } from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
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
const PERSONS = ['claire', 'codex', 'worker'] as const;
const SEED = 20261022;

const accessOf = (userId: string): ResourceAccess => ({
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId, role: 'admin' },
});

/**
 * Where the gauge reads its count. `turn` is production: inside the batch's
 * own transaction under its write turn. `stale` is the sabotage the proofs
 * below inject: a count read before the batch queued, outside any turn.
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

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-limit-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** A's bound claims as the store holds them (L5). */
function boundClaims(): number {
  return source.db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM (SELECT DISTINCT work_item_id, person_id, run_id FROM claim)`,
  ).n;
}

/**
 * Organization A with both accounts as admins, a claims cap of `cap`, its
 * persons, and one project of A with `leafCount` root leaves.
 */
async function seeded(cap: number, leafCount: number, counting: { source: CountSource }) {
  for (const id of ACCOUNTS)
    source.db.run(sql`INSERT INTO users (id, username, created_at) VALUES (${id}, ${id}, 1)`);
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)`);
  for (const id of ACCOUNTS)
    source.db.run(
      sql`INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', ${id}, 'admin', 1)`,
    );
  source.db.run(
    sql`INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('org-a', 50, ${cap}, 10000, 1)`,
  );
  for (const id of PERSONS) {
    source.db.run(sql`INSERT INTO person (id, name, kind) VALUES (${id}, ${id}, 'agent')`);
    source.db.run(
      sql`INSERT INTO person_organization (resource_id, organization_id, name) VALUES (${id}, 'org-a', ${id})`,
    );
  }
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, options);
  const created = expectCreated(await graph.projects.create('Race', 'dany'));
  const projectId = created.project.id;
  const firstStep = created.steps.at(0);
  if (firstStep === undefined) throw new Error('the claim fixture has no first step');
  source.db.run(
    sql`INSERT INTO project_organization (resource_id, organization_id) VALUES (${projectId}, 'org-a')`,
  );
  const hold: Hold = { reached: () => undefined, release: Promise.resolve(), armed: false };
  /** What the stale count answers: the count before the batch was asked for. */
  let staleCount = 0;
  const gauged = (gauge: OrganizationLimitGauge | undefined): OrganizationLimitGauge => {
    if (gauge === undefined) throw new Error('the admitted stores carry no limits gauge');
    return {
      readAgentPersonCap: (organizationId) => gauge.readAgentPersonCap(organizationId),
      readConcurrentClaimCap: async (organizationId) => {
        const reading = await gauge.readConcurrentClaimCap(organizationId);
        if (hold.armed) {
          hold.armed = false;
          hold.reached();
          await hold.release;
        }
        return counting.source === 'turn' ? reading : { ...reading, current: staleCount };
      },
      readCapacityCap: (organizationId, resourceId, exceptProjectId) =>
        gauge.readCapacityCap(organizationId, resourceId, exceptProjectId),
    };
  };
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements, admission, dependencyContext) =>
      servicesOver(
        { ...scope.stores, organizationLimits: gauged(scope.stores.organizationLimits) },
        {
          ...options,
          broadcast: announcements,
          admission,
          dependencyContext: { kind: 'bound', context: dependencyContext },
        },
      ),
  });
  const run = (userId: string, commands: PlanCommand[]) =>
    runner.runWithin(
      projectId,
      { id: userId, username: userId, scopes: ['write'] },
      // Claims target the first workflow node so prerequisite checks admit them to the cap.
      commands.map((command) =>
        command.kind === 'claimWorkItem' ? { ...command, steps: [firstStep.id] } : command,
      ),
      accessOf(userId),
    );
  const leaves = await run(
    'dany',
    Array.from({ length: leafCount }, (_, n): PlanCommand => ({
      kind: 'createWorkItem',
      ref: `leaf-${String(n)}`,
      name: `Leaf ${String(n)}`,
      parentId: null,
      afterId: null,
    })),
  );
  if (!leaves.ok) throw new Error(`the leaves were refused: ${JSON.stringify(leaves)}`);
  const leafIds = leaves.results.map(({ id }) => {
    if (id === undefined) throw new Error('a leaf has no id');
    return id;
  });
  /** Arms the hold so the next count read waits, holding its turn, until released. */
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
  /** Freezes the stale count at what the store holds now, as a pre-turn read would. */
  const readCountBeforeQueueing = () => {
    staleCount = boundClaims();
  };
  return { run, leafIds, holdNextRead, readCountBeforeQueueing, projectId, runner };
}

const claim = (workItemId: string, personId: string, runId: string): PlanCommand => ({
  kind: 'claimWorkItem',
  workItemId,
  personId,
  runId,
});

describe('two fleets race for the last bound claim at 39 of 40', () => {
  for (const [first, second] of [
    ['dany', 'eve'],
    ['eve', 'dany'],
  ] as const) {
    // Proof, each watched 2026-10-22: with the gauge answering the count read
    // before the batches queued (`counting.source` 'stale', a count read
    // outside the turn), both claims landed, 41 of 40 (0 pass, 2 fail); with
    // `source.uow` replaced by a unit of work over the open gate (the
    // coordinator bypassed), the queued batch failed `BEGIN IMMEDIATE` with
    // "cannot start a transaction within a transaction" (0 pass, 2 fail).
    it(`lands exactly one of two claims racing for the last place (${first} first)`, async () => {
      const counting = { source: 'turn' as CountSource };
      const { run, leafIds, holdNextRead, readCountBeforeQueueing } = await seeded(
        40,
        41,
        counting,
      );
      const held = await run(
        'dany',
        leafIds.slice(0, 39).map((id) => claim(id, 'worker', 'r0')),
      );
      expect(held).toMatchObject({ ok: true });
      expect(boundClaims()).toBe(39);
      readCountBeforeQueueing();
      const [lastLeaf, extraLeaf] = [leafIds.at(39), leafIds.at(40)];
      if (lastLeaf === undefined || extraLeaf === undefined) throw new Error('missing leaves');

      const { reached, release } = holdNextRead();
      const winner = run(first, [claim(lastLeaf, 'claire', `run-${first}`)]);
      await reached;
      // The first batch holds its turn after reading 39 of 40; the second queues.
      const loser = run(second, [claim(extraLeaf, 'codex', `run-${second}`)]);
      await Bun.sleep(20);
      release();
      const [won, lost] = await Promise.all([winner, loser]);

      expect(won).toMatchObject({ ok: true });
      expect(lost).toEqual({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'claim_limit',
        detail: { cap: 40, current: 40 },
      });
      expect(boundClaims()).toBe(40);
    });
  }
});

/** One step the model runs: a single batch, or two batches racing. */
type Act =
  | { kind: 'claim'; leaf: number; person: number; run: number; account: number }
  | { kind: 'release'; leaf: number; person: number; account: number }
  | {
      kind: 'race';
      left: { leaf: number; person: number; run: number };
      right: { leaf: number; person: number; run: number };
    };

const LEAVES = 6;
const CAP = 3;

const pick = (max: number) => fc.integer({ min: 0, max: max - 1 });
const claimArb = fc.record({ leaf: pick(LEAVES), person: pick(PERSONS.length), run: pick(2) });
const actArb: fc.Arbitrary<Act> = fc.oneof(
  claimArb.chain((each) =>
    pick(ACCOUNTS.length).map((account) => ({ kind: 'claim' as const, ...each, account })),
  ),
  fc
    .record({ leaf: pick(LEAVES), person: pick(PERSONS.length), account: pick(ACCOUNTS.length) })
    .map((each) => ({ kind: 'release' as const, ...each })),
  fc
    .record({ left: claimArb, right: claimArb })
    .map((each) => ({ kind: 'race' as const, ...each })),
);

describe('the claim cap as a model invariant', () => {
  /**
   * Random claims, releases and two-batch races against a cap of 3. After
   * every step the store's bound claims never exceed the cap, every refusal
   * that names the cap names it full, and a claim of a triple already held
   * is never refused by it.
   *
   * Proof: with `counting.source` 'stale' (the gauge answering the count read
   * before the step's batches queued, a count read outside the turn),
   * fast-check found a race at 2 of 3 where both claims landed, 4 bound claims
   * of 3; watched 2026-10-22.
   */
  it('never holds more bound claims than the cap', async () => {
    let capRefusals = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(actArb, { minLength: 1, maxLength: 12 }), async (acts) => {
        await source.close();
        rmSync(directory, { recursive: true, force: true });
        directory = mkdtempSync(join(tmpdir(), 'claim-limit-model-'));
        const dbPath = join(directory, 'plan.db');
        runMigrations(dbPath, folder);
        source = openSqliteSource({ dbPath, organizationDefaultLimits: DEFAULTS });
        const counting = { source: 'turn' as CountSource };
        const world = await seeded(CAP, LEAVES, counting);
        const leafOf = (n: number) => {
          const id = world.leafIds.at(n);
          if (id === undefined) throw new Error(`no leaf ${String(n)}`);
          return id;
        };
        const triples = () =>
          new Set(
            source.db
              .all<{ w: string; p: string; r: string | null }>(
                sql`SELECT DISTINCT work_item_id AS w, person_id AS p, run_id AS r FROM claim`,
              )
              .map(({ w, p, r }) => JSON.stringify([w, p, r])),
          );
        const tripleOf = (each: { leaf: number; person: number; run: number }) =>
          JSON.stringify([leafOf(each.leaf), PERSONS[each.person], `r${String(each.run)}`]);
        const commandOf = (each: { leaf: number; person: number; run: number }) =>
          claim(leafOf(each.leaf), PERSONS[each.person] ?? '', `r${String(each.run)}`);
        const expectNoCapRefusalOfHeld = (
          outcome: Awaited<ReturnType<typeof world.run>>,
          heldBefore: Set<string>,
          triple: string,
        ) => {
          if (outcome.ok || !('reason' in outcome) || outcome.reason !== 'claim_limit') return;
          capRefusals += 1;
          expect(heldBefore.has(triple)).toBe(false);
          expect(outcome.detail).toEqual({ cap: CAP, current: CAP });
        };

        for (const act of acts) {
          const before = triples();
          world.readCountBeforeQueueing();
          if (act.kind === 'claim') {
            const outcome = await world.run(ACCOUNTS[act.account] ?? 'dany', [commandOf(act)]);
            expectNoCapRefusalOfHeld(outcome, before, tripleOf(act));
          } else if (act.kind === 'release') {
            await world.run(ACCOUNTS[act.account] ?? 'dany', [
              {
                kind: 'releaseWorkItem',
                workItemId: leafOf(act.leaf),
                personId: PERSONS[act.person] ?? '',
              },
            ]);
          } else {
            const [left, right] = await Promise.all([
              world.run('dany', [commandOf(act.left)]),
              world.run('eve', [commandOf(act.right)]),
            ]);
            expectNoCapRefusalOfHeld(left, before, tripleOf(act.left));
            expectNoCapRefusalOfHeld(right, before, tripleOf(act.right));
          }
          expect(boundClaims()).toBeLessThanOrEqual(CAP);
        }
      }),
      { numRuns: 40, seed: SEED },
    );
    // The runs reached the cap, so the invariant was tested where it bites.
    expect(capRefusals).toBeGreaterThan(0);
  }, 120_000);
});
