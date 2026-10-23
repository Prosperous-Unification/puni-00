import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaimStore, PlanCommand, Scope } from '@wbs/core';
import { CREATOR_ADMISSION, LEGACY_ACCESS } from '@wbs/core';
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
  ['worker', F],
  ['codex', G],
]);

let directory: string;
let source: SqliteSource;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'claim-race-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, folder);
  source = openSqliteSource({ dbPath });
});

afterEach(async () => {
  await source.close();
  rmSync(directory, { recursive: true, force: true });
});

/** A gate the first claim read waits at, so the other batch is queued behind its turn. */
interface Hold {
  actor: string | null;
  reached: () => void;
  release: Promise<void>;
}

async function seeded(hold?: Hold) {
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
  for (const [id, name] of [
    ['claire', 'claire'],
    ['worker', 'worker'],
    ['codex', 'codex'],
  ]) {
    await source.stores.directory.addPerson({ id, name, kind: 'agent' }, [], { at: 1, by: F });
  }
  const withIdentity = (claims: ClaimStore, actor: () => string): ClaimStore => ({
    listByProject: async (id) => {
      if (hold?.actor === actor()) {
        hold.actor = null;
        hold.reached();
        await hold.release;
      }
      return claims.listByProject(id);
    },
    listStampedByProject: (id) => claims.listStampedByProject(id),
    findById: (id, claimId) => claims.findById(id, claimId),
    occupancyOf: (id) => claims.occupancyOf(id),
    add: (written, stated, stamp, occupancy, leases) =>
      claims.add(written, stated, stamp, occupancy, leases),
    remove: (removed, cleared, stamp) => claims.remove(removed, cleared, stamp),
    moveAll: (from, to, stamp) => claims.moveAll(from, to, stamp),
    renewLeases: (personId, now) => claims.renewLeases(personId, now),
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
  /** One batch as `actor`; the identity wrapper reads the actor of the batch that started last. */
  const as = (actor: string, commands: PlanCommand[]) => () => {
    acting = actor;
    return runner.run(projectId, actor, commands);
  };
  const leaf = await runner.run(projectId, F, [
    { kind: 'createWorkItem', ref: 'leaf', name: 'Leaf', parentId: null, afterId: null },
  ]);
  if (!leaf.ok) throw new Error('the leaf was refused');
  const leafId = leaf.results[0]?.id;
  if (leafId === undefined) throw new Error('the leaf has no id');
  const steps = created.steps.map(({ id }) => id);
  const revision = () =>
    source.db.get<{ revision: number }>(sql`SELECT revision FROM work_item WHERE id = ${leafId}`)
      .revision;
  const claims = () =>
    source.db.all<{ person_id: string; step_id: string }>(
      sql`SELECT person_id, step_id FROM claim ORDER BY person_id`,
    );
  return { graph, runner, projectId, leafId, steps, revision, claims, as };
}

describe('two fleets claim the same step', () => {
  for (const [first, second] of [
    [F, G],
    [G, F],
  ] as const) {
    it(`admits exactly one, the other refused naming the winner (${first} first)`, async () => {
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
      const { leafId, steps, claims, as } = await seeded(hold);
      const [dev] = steps;
      const person = (actor: string) => (actor === F ? 'claire' : 'codex');
      const claim = (actor: string): PlanCommand => ({
        kind: 'claimWorkItem',
        workItemId: leafId,
        personId: person(actor),
        steps: [dev],
      });
      const winner = as(first, [claim(first)])();
      await queued;
      // The first batch holds the write turn inside its claim read; the second queues.
      const loser = as(second, [claim(second)])();
      await Bun.sleep(20);
      release();
      // Proof: with `source.uow` replaced by a unit of work over the open gate
      // (the coordinator bypassed), the queued batch failed `BEGIN IMMEDIATE`:
      // "cannot start a transaction within a transaction" instead of the
      // already_claimed refusal, both orders; watched 2026-10-19. Both batches
      // cannot win here: the `claim_step` unique index and the store's own
      // held check stand behind the coordinator.
      const [won, lost] = await Promise.all([winner, loser]);
      expect(won).toMatchObject({ ok: true });
      expect(lost).toMatchObject({
        ok: false,
        at: 0,
        kind: 'claimWorkItem',
        reason: 'already_claimed',
        detail: { holders: [{ personId: person(first), name: person(first) }] },
      });
      expect(claims()).toEqual([{ person_id: person(first), step_id: dev }]);
    });
  }
});

describe('a claim on SQLite', () => {
  // Proof: with the remove_claims replay's delegated-since refusal removed, the
  // second undo answered ok and the FK cascade took the worker's delegated
  // claim with the subtree claim; watched 2026-10-19.
  it('refuses an undo of a subtree claim that would take a delegated claim it never wrote', async () => {
    const { runner, projectId, claims, as } = await seeded();
    const tree = await runner.run(projectId, F, [
      { kind: 'createWorkItem', ref: 'root', name: 'Root', parentId: null, afterId: null },
      {
        kind: 'createWorkItem',
        ref: 'child',
        name: 'Child',
        parentId: null,
        parentRef: 'root',
        afterId: null,
      },
    ]);
    if (!tree.ok) throw new Error('the tree was refused');
    const [rootId, childId] = tree.results.map(({ id }) => id ?? '');
    const subtree = await as(F, [
      { kind: 'claimWorkItem', workItemId: rootId, personId: 'claire' },
    ])();
    if (!subtree.ok) throw new Error('the subtree claim was refused');
    const parentClaim = source.db.get<{ id: string }>(
      sql`SELECT id FROM claim WHERE work_item_id = ${rootId}`,
    ).id;
    expect(
      await as(F, [
        { kind: 'claimWorkItem', workItemId: childId, personId: 'worker', parentClaim },
      ])(),
    ).toMatchObject({ ok: true });
    await as(G, [{ kind: 'patchWorkItem', workItemId: childId, patch: { name: 'Renamed' } }])();
    const held = claims();
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: false, reason: 'stale_undo' });
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: false, reason: 'stale_undo' });
    expect(claims()).toEqual(held);
  });

  it('moves the revision by one and records one entry for a claim that states progress', async () => {
    const { runner, projectId, leafId, steps, revision, as } = await seeded();
    const [dev, qa] = steps;
    await runner.run(projectId, F, [
      {
        kind: 'setEstimate',
        workItemId: leafId,
        stepId: qa,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
      { kind: 'setProgress', workItemId: leafId, stepId: dev, state: 'done' },
    ]);
    const before = revision();
    const entries = source.db.get<{ count: number }>(
      sql`SELECT count(*) AS count FROM command_journal`,
    ).count;
    expect(
      await as(F, [{ kind: 'claimWorkItem', workItemId: leafId, personId: 'claire' }])(),
    ).toMatchObject({
      ok: true,
    });
    expect(revision()).toBe(before + 1);
    expect(
      source.db.get<{ count: number }>(sql`SELECT count(*) AS count FROM command_journal`).count,
    ).toBe(entries + 1);
  });

  it('refuses an undo of a claim after the holder’s leaf moved on', async () => {
    const { runner, projectId, leafId, steps, claims, as } = await seeded();
    // Both steps already in progress, so the claim states nothing and its own
    // revision precondition is the only thing guarding the undo.
    await as(F, [
      ...steps.map((stepId): PlanCommand => ({
        kind: 'setProgress',
        workItemId: leafId,
        stepId,
        state: 'in_progress',
      })),
    ])();
    await as(F, [{ kind: 'claimWorkItem', workItemId: leafId, personId: 'claire' }])();
    await as(G, [{ kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Renamed' } }])();
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: false });
    expect(claims().map(({ person_id }) => person_id)).toEqual(['claire', 'claire']);
  });

  it('refuses a redo of a claim after the leaf moved on', async () => {
    const { runner, projectId, leafId, steps, claims, as } = await seeded();
    await as(F, [
      ...steps.map((stepId): PlanCommand => ({
        kind: 'setProgress',
        workItemId: leafId,
        stepId,
        state: 'in_progress',
      })),
    ])();
    await as(F, [{ kind: 'claimWorkItem', workItemId: leafId, personId: 'claire' }])();
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
    await as(G, [{ kind: 'patchWorkItem', workItemId: leafId, patch: { name: 'Renamed' } }])();
    expect(await runner.redo(projectId, F)).toMatchObject({ ok: false, reason: 'stale_undo' });
    expect(claims()).toEqual([]);
  });

  // Proof: with the hand-down's `moveAll` skipped this read the claim still on
  // the leaf; with the undo's `move_claims` omitted the child's delete cascaded
  // it away and the undo read no claim; watched 2026-10-20.
  it('hands a claimed leaf’s claim to its first child, fencing and releasable there, and back on undo', async () => {
    const { graph, runner, projectId, leafId, steps, as } = await seeded();
    const [dev] = steps;
    await as(F, [
      { kind: 'claimWorkItem', workItemId: leafId, personId: 'claire', steps: [dev] },
    ])();
    const owners = () =>
      source.db.all<{ work_item_id: string; step_id: string; person_id: string }>(
        sql`SELECT work_item_id, step_id, person_id FROM claim ORDER BY id`,
      );
    const claimId = source.db.get<{ id: string }>(sql`SELECT id FROM claim`).id;
    const created = await as(F, [
      { kind: 'createWorkItem', ref: 'half', name: 'Half', parentId: leafId, afterId: null },
    ])();
    if (!created.ok) throw new Error('the child was refused');
    const childId = created.results[0]?.id ?? '';
    expect(owners()).toEqual([{ work_item_id: childId, step_id: dev, person_id: 'claire' }]);
    expect(source.db.get<{ id: string }>(sql`SELECT id FROM claim`).id).toBe(claimId);
    const startable = await graph.workItems.startableWithin(projectId, LEGACY_ACCESS, null);
    if (startable === null || 'kind' in startable) throw new Error('the read refused');
    expect(startable.claimed.map(({ workItemId, claimId: id }) => [workItemId, id])).toEqual([
      [childId, claimId],
    ]);
    expect(
      await as(G, [
        { kind: 'claimWorkItem', workItemId: childId, personId: 'codex', steps: [dev] },
      ])(),
    ).toMatchObject({ ok: false, reason: 'already_claimed' });

    expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
    expect(owners()).toEqual([{ work_item_id: leafId, step_id: dev, person_id: 'claire' }]);
    expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
    expect(owners()).toEqual([{ work_item_id: childId, step_id: dev, person_id: 'claire' }]);
    expect(
      await as(F, [{ kind: 'releaseWorkItem', workItemId: childId, personId: 'claire' }])(),
    ).toMatchObject({ ok: true });
    expect(owners()).toEqual([]);
  });

  // Entries written before `20261020130000_add_claim_occupancy` carry no
  // `occupancy`: their claims held nothing, and their undo and redo still apply.
  it('undoes a release and redoes a claim journalled before claim occupancy', async () => {
    const { runner, projectId, leafId, steps, claims, as } = await seeded();
    const [dev] = steps;
    await as(F, [
      { kind: 'claimWorkItem', workItemId: leafId, personId: 'claire', steps: [dev] },
    ])();
    await as(F, [{ kind: 'releaseWorkItem', workItemId: leafId, personId: 'claire' }])();
    const legacy = () => {
      source.db.run(sql`UPDATE command_journal SET inverse = json_remove(inverse, '$.occupancy')`);
      source.db.run(
        sql`UPDATE command_journal SET payload = json_remove(payload, '$.forward.occupancy')`,
      );
    };
    legacy();
    expect(
      source.db.get<{ n: number }>(
        sql`SELECT count(*) AS n FROM command_journal WHERE inverse LIKE '%occupancy%' OR payload LIKE '%occupancy%'`,
      ).n,
    ).toBe(0);
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
    expect(claims()).toEqual([{ person_id: 'claire', step_id: dev }]);
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
    expect(claims()).toEqual([]);
    legacy();
    expect(await runner.redo(projectId, F)).toMatchObject({ ok: true });
    expect(claims()).toEqual([{ person_id: 'claire', step_id: dev }]);
  });

  it('refuses a redo of a claim once another holder took the step', async () => {
    const { runner, projectId, leafId, steps, claims, as } = await seeded();
    const [dev] = steps;
    await as(F, [
      { kind: 'claimWorkItem', workItemId: leafId, personId: 'claire', steps: [dev] },
    ])();
    expect(await runner.undo(projectId, F)).toMatchObject({ ok: true });
    await as(G, [{ kind: 'claimWorkItem', workItemId: leafId, personId: 'codex', steps: [dev] }])();
    expect(await runner.redo(projectId, F)).toMatchObject({ ok: false });
    expect(claims()).toEqual([{ person_id: 'codex', step_id: dev }]);
  });
});
