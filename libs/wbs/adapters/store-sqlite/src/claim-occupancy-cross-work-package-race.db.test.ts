import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaimStore, PlanCommand, ResourceUnits, Scope } from '@wbs/core';
import { clockOf, LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { openSqliteSource, type SqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedOrganizationPackage, seedPackageParent } from './testing/legacy-package-parent';

/**
 * `wbs-shared-occupancy` task 3.2: two claims in work packages A and B of one
 * organization, each asking 10 GB of a 16 GB directory capacity at once.
 * Either fits alone; together they do not, so exactly one is applied, in one
 * process (one write coordinator) and across two connections (two
 * coordinators, ordered by SQLite's `BEGIN IMMEDIATE`).
 */
const F = 'account-f';
const ORG = 'org-race';
const RAM = 'resource-host-ram';

let custody = { hasUnknownOwner: false };
let directory: string;
let dbPath: string;
let source: SqliteSource;
let opened: SqliteSource | undefined;

beforeEach(() => {
  opened = undefined;
  directory = mkdtempSync(join(tmpdir(), 'claim-occupancy-cross-work-package-race-'));
  dbPath = join(directory, 'plan.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path: dbPath, directory, reportedAt: 1 }, custody);
  custody.hasUnknownOwner = true;
  source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  opened = source;
  custody.hasUnknownOwner = false;
});

afterEach(async () => {
  await opened?.close();
  if (custody.hasUnknownOwner)
    throw new Error('uncertain occupancy fixture owner; retained ' + directory);
  rmSync(directory, { recursive: true, force: true });
});

/** A gate the first claim's organization read waits at, so the other batch queues behind its turn. */
interface Hold {
  armed: boolean;
  reached: () => void;
  release: Promise<void>;
}

/**
 * Work packages A and B of {@link ORG}, one leaf each demanding 10 GB of `host
 * ram`, whose directory capacity is 16; agents `claire` and `codex` bound to
 * F. `stale`, when given, is what every batch's organization read answers
 * instead of reading: a read taken outside the turn.
 */
async function seeded(hold: Hold | null, stale: ResourceUnits[] | null = null) {
  const options = {
    admission: LEGACY_EDIT_ADMISSION,
    clock: clockOf({ now: () => 1_000, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  source.db.run(sql`INSERT INTO organization (id, name, created_at) VALUES (${ORG}, ${ORG}, 1)`);
  source.db.run(
    sql`INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(${ORG},${F},'member',1)`,
  );
  seedPackageParent(dbPath, ORG, 'fixture-project');
  for (const [position, name] of ['Dev', 'QA'].entries()) {
    const id = name.toLowerCase();
    const defined = await source.stores.stepCatalogue.defineAndBindStep(
      ORG,
      {
        id,
        code: id,
        name,
        position: position + 1,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: id + '-binding',
        scopeKind: 'project',
        scopeId: 'fixture-project',
        workItemTypeId: null,
        position: position + 1,
      },
      { at: 1, by: F },
    );
    if (!defined.ok) throw new Error('lease fixture step refused: ' + defined.reason);
  }
  const created = [
    expectCreated(
      await seedOrganizationPackage(
        source.stores.workPackages,
        options.clock,
        ORG,
        'fixture-project',
        F,
        'A',
      ),
    ),
    expectCreated(
      await seedOrganizationPackage(
        source.stores.workPackages,
        options.clock,
        ORG,
        'fixture-project',
        F,
        'B',
      ),
    ),
  ] as const;
  const workPackages = [created[0].workPackage.id, created[1].workPackage.id] as const;
  const firstA = (await source.stores.workPackages.stepsOf(workPackages[0])).at(0);
  const firstB = (await source.stores.workPackages.stepsOf(workPackages[1])).at(0);
  if (firstA === undefined || firstB === undefined)
    throw new Error('race fixture work package omitted its first workflow step');
  const stepIds = [firstA.id, firstB.id] as const;
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
      organizationUnitsOf: async (ids: readonly string[]) => {
        if (hold?.armed === true) {
          hold.armed = false;
          hold.reached();
          await hold.release;
        }
        return stale ?? claims.organizationUnitsOf(ids);
      },
    });
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(
        { ...scope.stores, claims: gated(scope.stores.claims) },
        {
          ...options,
          broadcast: announcements,
          dependencyContext: createLocalDependencyContext(scope.stores),
        },
      ),
  });
  const leaves: string[] = [];
  for (const workPackageId of workPackages) {
    const plan = await runner.run(workPackageId, F, [
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
    steps: [stepIds[index]],
  });
  /** Each leaf's units: its largest copy, one per leaf however many steps it claimed. */
  const held = () =>
    source.db.all<{ units: number }>(
      sql`SELECT max(o.units) AS units FROM claim_occupancy AS o JOIN claim AS c ON c.id = o.claim_id GROUP BY c.work_item_id ORDER BY units`,
    );
  return { workPackages, leaves, runner, claim, held, stepIds };
}

describe('two work packages claim a shared resource at once', () => {
  for (const first of [0, 1] as const) {
    it(`applies exactly one in one process (work package ${first === 0 ? 'A' : 'B'} first)`, async () => {
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
      const { workPackages, runner, claim, held } = await seeded(hold);
      const second = first === 0 ? 1 : 0;
      hold.armed = true;
      const winner = runner.run(workPackages[first], F, [claim(first)]);
      // Bounded: a batch that never reads the organization never reaches the
      // hold, and this case must fail on that, not hang (review S3-3).
      const reachedInTime = await Promise.race([
        queued.then(() => true),
        Bun.sleep(2_000).then(() => false),
      ]);
      expect(reachedInTime).toBe(true);
      // The first batch holds the write turn inside its organization read; the second queues.
      const loser = runner.run(workPackages[second], F, [claim(second)]);
      await Bun.sleep(20);
      release();
      // Proof, each watched 2026-10-25: with every batch's organization read
      // answered by units read before either took its turn (`stale` = []),
      // both orders stored both claims, 20 of 16; with the directory
      // capacity withheld from the decision, the same; with the organization
      // read skipped altogether (no hold is ever reached), both orders failed
      // on `reachedInTime` after 2 s instead of hanging.
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
    const { workPackages, leaves, held, stepIds } = await seeded(null);
    const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const state = new Int32Array(barrier);
    const workers = [0, 1].map(
      () =>
        new Worker(new URL('./claim-occupancy-cross-work-package-race.worker.ts', import.meta.url)),
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
          workPackageId: workPackages[index === 0 ? 0 : 1],
          workItemId: leaves[index],
          stepId: index === 0 ? stepIds[0] : stepIds[1],
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
