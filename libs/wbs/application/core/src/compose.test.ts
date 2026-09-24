import { noopLogger } from '@wbs/contracts';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, test } from 'bun:test';

import {
  type AccountlessSource,
  composeServices,
  type RuntimePorts,
  servicesOver,
  type ServicesOverOptions,
  type SharedComposition,
  type WritingServices,
} from './compose';
import { clockOf } from './ports/clock';
import type { Broadcaster } from './ports/project-event';
import type { Scope } from './ports/unit-of-work';
import type { Decision } from './ports/unit-of-work';
import { PlanCommandRunner } from './service/plan-commands';
import { recordingBroadcaster } from './testing/broadcast-fixture';
import { fastScheduler } from './testing/scheduler-fixture';
import { replay } from './use-cases/replay';
import { savePlan } from './use-cases/save-plan';

function signal(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = (): void => {
    throw new Error('signal resolved before construction');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const fixtureShared: SharedComposition = {
  logger: noopLogger,
  replayMaxPerSubscription: 4,
  replayMaxAgeMs: 300_000,
  replayMaxEvents: 32,
  retentionIntervalMs: 600_000,
  planEventRetentionDays: 1,
};

function accountlessSource(source: ReturnType<typeof openMemorySource>): AccountlessSource {
  type AccountlessStores = AccountlessSource['stores'];
  const withoutAccounts = ({ users: _users, ...stores }: typeof source.stores) => stores;
  const uow: AccountlessSource['uow'] = {
    run: async <T>(
      act: (scope: Scope<AccountlessStores>) => Promise<Decision<T, AccountlessStores>>,
    ): Promise<T> =>
      await source.uow.run(async (scope) => {
        const decision = await act({ stores: withoutAccounts(scope.stores) });
        if (decision.commit) return { commit: true, value: decision.value };
        if (decision.afterRollback === undefined) {
          return { commit: false, value: decision.value };
        }
        return {
          commit: false,
          value: decision.value,
          afterRollback: async (repairScope) => {
            await decision.afterRollback?.({ stores: withoutAccounts(repairScope.stores) });
          },
        };
      }),
  };
  return {
    stores: withoutAccounts(source.stores),
    history: source.history,
    uow,
    health: () => source.health(),
    close: () => source.close(),
  };
}

function fixture() {
  const instant = 1_000;
  let nextId = 0;
  let tick = (): void => {
    throw new Error('retention tick before timer start');
  };
  const clock = clockOf({ now: () => instant, newId: () => `id-${String(++nextId)}` });
  const pushed: unknown[] = [];
  const runtime: RuntimePorts = {
    clock,
    digest: { sha256: (bytes) => Promise.resolve(`digest:${bytes}`) },
    timers: { nowMs: () => instant, schedule: () => () => undefined },
    intervals: {
      every: (_milliseconds, callback) => {
        tick = callback;
        return () => undefined;
      },
    },
    push: {
      push: (payload) => {
        pushed.push(payload);
        return Promise.resolve({ delivered: 0 });
      },
    },
    scheduler: fastScheduler,
  };
  const accountSource = openMemorySource();
  const source = accountlessSource(accountSource);
  const graph = composeServices({ source, runtime, shared: fixtureShared });
  const runner = new PlanCommandRunner({
    batchServices: graph.batch,
    publicServices: graph,
    uow: graph.uow,
    announcements: graph.announcements,
  });
  return {
    source,
    accountSource,
    graph,
    runner,
    clock,
    runtime,
    pushed,
    tick: () => {
      tick();
    },
  };
}

function runtimeOf(services: WritingServices): {
  readonly clock: unknown;
  readonly scheduler: unknown;
  readonly broadcast: unknown;
} {
  const workItems = services.workItems as unknown as {
    readonly clock: unknown;
    readonly opts: { readonly scheduler: unknown; readonly broadcast: unknown };
  };
  return {
    clock: workItems.clock,
    scheduler: workItems.opts.scheduler,
    broadcast: workItems.opts.broadcast,
  };
}

test('accountless composition has no auth capability', () => {
  const { graph, clock, source, accountSource, runtime } = fixture();
  expect(graph.clock).toBe(clock);
  // The valid access above compiles first, so a missing graph declaration cannot
  // satisfy this negative by making the whole fixture unknown.
  // @ts-expect-error An accountless composition deliberately has no auth capability.
  expect(graph.auth).toBeUndefined();
  // Proof (2026-09-23): on the unchanged tree (`loginThrottle` still on `CommonServices`,
  // constructed unconditionally), this directive's own `@ts-expect-error` failed
  // `wbs-core:typecheck` with `TS2578: Unused '@ts-expect-error' directive` (1 error), and the
  // runtime assertion below failed with a real `LoginThrottle` instance instead of `undefined`
  // (0 pass, 1 fail). Moving `loginThrottle` onto `AccountfulServices` and installing it only
  // in the accountful branch restored both to green.
  // @ts-expect-error An accountless composition deliberately has no throttle capability either.
  expect(graph.loginThrottle).toBeUndefined();

  const accountRuntime = {
    ...runtime,
    passwords: {
      hash: (password: string) => Promise.resolve(password),
      verify: () => Promise.resolve(true),
    },
    tokens: {
      sign: () => Promise.resolve('token'),
      verify: () => Promise.resolve(null),
    },
  };
  // Proof: relaxing the accountless runtime exclusion made core:typecheck fail
  // with TS2578 at this directive; the mismatched composition then compiled.
  const mismatch = () =>
    // @ts-expect-error Account runtime cannot be paired with a source that has no account store.
    composeServices({ source, runtime: accountRuntime, shared: fixtureShared });
  // Proof: removing `users?: never` from AccountlessSource made core:typecheck
  // fail with TS2578 at this directive; the reverse mismatch then compiled.
  const missingRuntime = () =>
    // @ts-expect-error An account source cannot be paired with runtime that lacks account ports.
    composeServices({ source: accountSource, runtime, shared: fixtureShared });
  expect([mismatch, missingRuntime]).toHaveLength(2);
});

test('accountful composition exposes auth when its source and runtime both offer accounts', async () => {
  const { accountSource: source, runtime } = fixture();
  const graph = composeServices({
    source,
    runtime: {
      ...runtime,
      passwords: {
        hash: (password) => Promise.resolve(`hash:${password}`),
        verify: (password, hash) => Promise.resolve(hash === `hash:${password}`),
      },
      tokens: {
        sign: (claims) => Promise.resolve(`${claims.subject}:${claims.username}`),
        verify: () => Promise.resolve(null),
      },
    },
    shared: fixtureShared,
  });

  expect((await graph.auth.register('account', 'password')).ok).toBe(true);
  expect(graph.loginThrottle.canAttempt('account', '192.0.2.1')).toBe(true);
});

describe('composeServices', () => {
  test('commits a mixed-store batch and rolls every store back on refusal', async () => {
    const { graph, runner } = fixture();
    const project = await graph.projects.create('Plan', 'owner');
    const committed = await runner.run(project.project.id, 'owner', [
      { kind: 'createTeam', ref: 'team', name: 'Platform' },
      {
        kind: 'createWorkItem',
        ref: 'work',
        parentId: null,
        afterId: null,
        name: 'Committed',
      },
    ]);
    expect(committed.ok).toBe(true);
    expect(await graph.directory.listTeams()).toHaveLength(1);
    const tree = await graph.workItems.tree(project.project.id);
    expect(
      tree === null || !('workItems' in tree) ? [] : tree.workItems.map((row) => row.name),
    ).toEqual(['Committed']);

    const refused = await runner.run(project.project.id, 'owner', [
      { kind: 'createTeam', name: 'Must roll back' },
      {
        kind: 'setEstimate',
        workItemId: 'absent',
        stepId: project.steps[0]?.id ?? 'absent-step',
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    expect(refused.ok).toBe(false);
    expect((await graph.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
  });

  /**
   * `plans` and `savedPlans` are two names for one Saved plans feature identity, never two
   * instances: the backend module map's "Alias exports must not instantiate duplicates".
   */
  test('composes one Saved plans instance behind both the plans and savedPlans names', () => {
    const { graph } = fixture();

    // Proof (2026-09-23): giving `plans` its own `installSavedPlans({...}).savedPlans` in
    // `composeServices` left this assertion failing with two distinct `SavedPlanService`
    // instances (0 pass, 1 fail), with `wbs-core:typecheck` at exit 0.
    expect(graph.plans).toBe(graph.savedPlans);
  });

  test('denies a foreign save and persists an owner save through independent history', async () => {
    const { graph } = fixture();
    const project = await graph.projects.create('Private', 'owner');
    await graph.projects.update(project.project.id, 'owner', { restricted: true });
    const foreign = { id: 'other', username: 'other', scopes: ['write'] as const };
    const owner = { id: 'owner', username: 'owner', scopes: ['write'] as const };
    expect(
      await savePlan(graph, { projectId: project.project.id, actor: foreign, name: 'Denied' }),
    ).toEqual({ outcome: 'forbidden' });
    const saved = await savePlan(graph, {
      projectId: project.project.id,
      actor: owner,
      name: 'Baseline',
    });
    expect(saved.outcome).toBe('saved');
    if (saved.outcome !== 'saved') return;
    expect(await graph.savedPlans.read(saved.record.id)).toHaveProperty('outcome', 'read');
  });

  test('replays two committed batches from their public buffer after durable rows are pruned', async () => {
    // Proof: giving ReplayOrchestrator a second buffer changed this answer from
    // the buffered tree_replaced event to `{status:"denied", reason:"out_of_range"}`.
    const { graph, runner, source } = fixture();
    const project = await graph.projects.create('Replay', 'owner');
    const subscription = `project:${project.project.id}`;
    const before = await source.stores.eventLog.latestSeq(subscription);
    for (const name of ['First buffered', 'Second buffered']) {
      expect(
        (
          await runner.run(project.project.id, 'owner', [
            { kind: 'createWorkItem', name, parentId: null, afterId: null },
          ])
        ).ok,
      ).toBe(true);
    }
    const buffered = await replay(graph.replay, {
      resumePoints: { [subscription]: before },
      principal: { kind: 'internal' },
    });
    expect(buffered).toMatchObject({
      [subscription]: {
        status: 'replaying',
        events: [{ seq: before + 1 }, { seq: before + 2 }],
      },
    });
    await source.stores.eventLog.pruneBeyond(0);
    expect(
      await replay(graph.replay, {
        resumePoints: { [subscription]: before },
        principal: { kind: 'internal' },
      }),
    ).toEqual(buffered);
  });

  test('retention waits for an admitted batch to release the source turn', async () => {
    const { source, graph, tick } = fixture();
    const entered = signal();
    const release = signal();
    const batch = source.uow.run(async () => {
      entered.resolve();
      await release.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    graph.retention.start();
    tick();
    let stopped = false;
    const stop = graph.retention.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release.resolve();
    await Promise.all([batch, stop]);
    expect(stopped).toBe(true);
  });

  test('shares runtime identities while creating a fresh scope, collector and graph per batch', async () => {
    const { graph, source, clock, runtime } = fixture();
    const project = await graph.projects.create('Identities', 'owner');
    const scopes: Scope[] = [];
    const broadcasts: Broadcaster[] = [];
    const graphs: WritingServices[] = [];
    const originalRun = source.uow.run.bind(source.uow);
    const originalBatch = graph.batch;
    source.uow.run = (act) =>
      originalRun((scope) => {
        scopes.push(scope);
        return act(scope);
      });
    const observedGraph = graph as typeof graph & {
      batch: (scope: Scope, broadcast: Broadcaster) => WritingServices;
    };
    observedGraph.batch = (scope: Scope, broadcast: Broadcaster) => {
      broadcasts.push(broadcast);
      const services = originalBatch(scope, broadcast);
      graphs.push(services);
      return services;
    };
    const runner = new PlanCommandRunner({
      batchServices: observedGraph.batch,
      publicServices: graph,
      uow: graph.uow,
      announcements: graph.announcements,
    });
    await runner.run(project.project.id, 'owner', []);
    await runner.run(project.project.id, 'owner', []);
    expect(scopes[0]).not.toBe(scopes[1]);
    expect(broadcasts[0]).not.toBe(broadcasts[1]);
    expect(graphs[0]).not.toBe(graphs[1]);
    expect(graph.clock).toBe(clock);
    expect(graph.scheduler).toBe(runtime.scheduler);
    expect(graphs.map(runtimeOf)).toEqual([
      { clock, scheduler: runtime.scheduler, broadcast: broadcasts[0] },
      { clock, scheduler: runtime.scheduler, broadcast: broadcasts[1] },
    ]);
  });

  test('discards a stale journal entry through the fresh repair scope', async () => {
    const { graph, runner, source } = fixture();
    const project = await graph.projects.create('Repair', 'owner');
    await runner.run(project.project.id, 'owner', [
      { kind: 'createWorkItem', name: 'Original', parentId: null, afterId: null },
    ]);
    const row = (await source.stores.workItems.listByProject(project.project.id)).at(0);
    if (row === undefined) throw new Error('committed batch did not create its work item');
    await source.stores.workItems.remove([row.id], [], { at: 2_000, by: 'peer' });

    expect(await runner.undo(project.project.id, 'owner')).toMatchObject({
      ok: false,
      reason: 'stale_undo',
    });
    expect(await runner.undo(project.project.id, 'owner')).toMatchObject({
      ok: false,
      reason: 'nothing_to_undo',
    });
  });
});

/**
 * `servicesOver` installs each per-admission resource over the stores it is
 * handed, once per call, so two admitted scopes over distinct stores never
 * share one: the `Writing modules are installed per admitted scope`
 * requirement. Each resource has a case of its own, so a shared installation
 * of any one of them fails its own case.
 */
describe('servicesOver', () => {
  const PROJECT = 'project-1';
  const OWNER = 'owner';
  const TEAM = 'team-1';

  /** One source holding the project and the team, and a writing graph over its stores. */
  async function scopeOver(shared: ServicesOverOptions): Promise<WritingServices> {
    const source = openMemorySource();
    await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
      at: 1,
      by: OWNER,
    });
    await source.stores.directory.addTeam({ id: TEAM, name: 'Platform' }, { at: 1, by: OWNER });
    return servicesOver(source.stores, shared);
  }

  /** Two such scopes, sharing only what every admission shares. */
  async function twoScopes(): Promise<{
    readonly first: WritingServices;
    readonly second: WritingServices;
  }> {
    let next = 0;
    const shared: ServicesOverOptions = {
      clock: clockOf({ now: () => 1_000, newId: () => `id-${String(++next)}` }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    };
    return { first: await scopeOver(shared), second: await scopeOver(shared) };
  }

  test("installs Calendar marker per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(
      await first.calendarMarkers.create(PROJECT, OWNER, { date: '2026-09-30', name: 'Launch' }),
    ).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installCalendarMarker(...)` result in a module-level
    // `let` and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail,
    // run alone with `-t`): the second scope listed the first scope's `Launch` marker.
    expect(await second.calendarMarkers.list(PROJECT)).toEqual({ ok: true, value: [] });
  });

  test("installs Capacity per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(await first.capacity.set(PROJECT, OWNER, TEAM, 3)).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installCapacity(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope listed the first scope's `{ serviceTeamId: "team-1", size: 3 }`.
    expect(await second.capacity.listFor(PROJECT)).toEqual([]);
  });

  test("installs Priority band per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const ladder = DEFAULT_PRIORITY_BANDS.map((band) => ({ ...band, label: `${band.label} now` }));
    expect(await first.priorityBands.set(PROJECT, OWNER, ladder)).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installPriorityBand(...)` result in a module-level `let`
    // and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run
    // alone with `-t`): the second scope read the first scope's `Critical now` ladder.
    expect(await second.priorityBands.listFor(PROJECT)).toEqual([...DEFAULT_PRIORITY_BANDS]);
  });

  test("installs Step per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const added = await first.steps.add(PROJECT, OWNER, 'Review');
    if (!added.ok) throw new Error(`the first scope refused the step: ${added.reason}`);
    // Proof (2026-09-24): memoizing one `installStep(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope renamed the first scope's step and answered `ok: true`.
    expect(await second.steps.rename(PROJECT, added.value.id, OWNER, 'Renamed')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  test("installs Project per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const created = await first.projects.create('Alpha', OWNER);
    // Proof (2026-09-24): memoizing one `installProject(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope read the first scope's `Alpha` project instead of null.
    expect(await second.projects.read(created.project.id)).toBeNull();
  });

  test("installs Directory per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(await first.directory.addTeam(OWNER, 'Operations')).toMatchObject({
      name: 'Operations',
    });
    // Proof (2026-09-24): memoizing one `installDirectory(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope listed the first scope's `Operations` team.
    expect((await second.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
  });
});
