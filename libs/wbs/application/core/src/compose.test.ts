import { noopLogger } from '@wbs/contracts';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { seedLegacyPackageParent } from './testing/legacy-package-source-fixture';
import { openMemorySource } from '@wbs/store-memory';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
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
import { NO_PROVEN_CONNECTIONS } from './module/authentication/account.resource';
import { createPlanCommandRunner } from './module/plan-commands/composition';
import { replay } from './module/realtime/realtime.feature';
import { savePlan } from './module/saved-plans/save-plan';
import { clockOf } from './ports/clock';
import { LEGACY_EDIT_ADMISSION } from './ports/edit-admission';
import { NO_MACHINE_CREDENTIALS } from './ports/machine-credentials';
import { LEGACY_ACCESS } from './ports/organization-access';
import type { Scope } from './ports/unit-of-work';
import type { Decision } from './ports/unit-of-work';
import type { Broadcaster } from './ports/work-package-event';
import { createLocalDependencyContext } from './service/dependency-context';
import { recordingBroadcaster } from './testing/broadcast-fixture';
import { expectCreated } from './testing/expect-created';
import { localCommandAccess } from './testing/organization-access-fixture';
import { fastScheduler } from './testing/scheduler-fixture';

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

async function fixture() {
  const instant = 1_000;
  let nextId = 0;
  let tick = (): void => {
    throw new Error('retention tick before timer start');
  };
  const clock = clockOf({ now: () => instant, newId: () => `id-${String(++nextId)}` });
  const pushed: unknown[] = [];
  const runtime: RuntimePorts = {
    commandAccess: localCommandAccess,
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
  const parentFixture = openMemorySourceFixture();
  const accountSource = parentFixture.source;
  await accountSource.stores.users.create(
    { id: 'owner', username: 'owner', passwordHash: null, createdAt: 1 },
    { at: 1, by: 'owner' },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: 'owner',
  });
  const source = accountlessSource(accountSource);
  const graph = composeServices({ source, runtime, shared: fixtureShared });
  return {
    source,
    accountSource,
    graph,
    runner: graph.commands,
    clock,
    runtime,
    pushed,
    tick: () => {
      tick();
    },
  };
}

test('stored outcome and downstream recipient retain their sequences while reaction precedes held outcome transport', async () => {
  const given = await fixture();
  const transport = signal();
  const changed: string[] = [];
  const pushed: unknown[] = [];
  const graph = composeServices({
    source: given.source,
    shared: fixtureShared,
    runtime: {
      ...given.runtime,
      onPlanChanged: (workPackageId) => changed.push(workPackageId),
      push: {
        push: async (payload) => {
          pushed.push(payload);
          await transport.promise;
          return { delivered: 1 };
        },
      },
    },
  });
  const event = {
    type: 'elsewhere_changed' as const,
    workPackageId: 'recipient',
    causeWorkPackageId: 'cause',
  };
  const outcome = {
    type: 'schedule_optimization_failed' as const,
    workPackageId: 'origin',
    generation: 1,
    inputHash: 'captured-input',
    objective: 'pri' as const,
    contractVersion: '7+0.3.0',
    budgetMs: 60_000,
    failureReason: 'internal-error' as const,
  };
  const recordedOutcome = await given.source.stores.eventLog.recordEvent(
    'work-package:origin',
    outcome,
    1_000,
  );
  const recorded = await given.source.stores.eventLog.recordEvent(
    'work-package:recipient',
    event,
    1_000,
  );
  const delivering = graph.committedFanout.deliverCommitted([
    { workPackageId: 'origin', event: outcome, recorded: recordedOutcome },
    { workPackageId: 'recipient', event, recorded },
  ]);
  expect(changed).toEqual(['recipient']);
  const secondWriter = await given.source.uow.run(() =>
    Promise.resolve({ commit: true as const, value: 'entered' }),
  );
  expect(secondWriter).toBe('entered');
  expect(pushed).toEqual([
    { subscription: 'work-package:origin', seq: recordedOutcome.seq, message: outcome },
  ]);
  transport.resolve();
  await delivering;
  expect(pushed).toEqual([
    { subscription: 'work-package:origin', seq: recordedOutcome.seq, message: outcome },
    { subscription: 'work-package:recipient', seq: recorded.seq, message: event },
  ]);
  expect(await given.source.stores.eventLog.latestSeq('work-package:origin')).toBe(
    recordedOutcome.seq,
  );
  expect(await given.source.stores.eventLog.latestSeq('work-package:recipient')).toBe(recorded.seq);
});

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

test('accountless composition has no auth capability', async () => {
  const { graph, clock, source, accountSource, runtime } = await fixture();
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
    enterprise: NO_PROVEN_CONNECTIONS,
    machineCredentials: NO_MACHINE_CREDENTIALS,
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
  const { accountSource: source, runtime } = await fixture();
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
      enterprise: NO_PROVEN_CONNECTIONS,
      machineCredentials: NO_MACHINE_CREDENTIALS,
    },
    shared: fixtureShared,
  });

  expect((await graph.auth.register('account', 'password')).ok).toBe(true);
  expect(graph.loginThrottle.canAttempt('account', '192.0.2.1')).toBe(true);
});

describe('composeServices', () => {
  test('commits a mixed-store batch and rolls every store back on refusal', async () => {
    const { graph, runner } = await fixture();
    const workPackage = expectCreated(
      await graph.workPackages.create('Plan', 'fixture-project', 'owner'),
    );
    const committed = await runner.run(workPackage.workPackage.id, 'owner', [
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
    const tree = await graph.workItems.tree(workPackage.workPackage.id);
    expect(
      tree === null || !('workItems' in tree) ? [] : tree.workItems.map((row) => row.name),
    ).toEqual(['Committed']);

    const refused = await runner.run(workPackage.workPackage.id, 'owner', [
      { kind: 'createTeam', name: 'Must roll back' },
      {
        kind: 'setEstimate',
        workItemId: 'absent',
        stepId: workPackage.steps[0]?.id ?? 'absent-step',
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]);
    expect(refused.ok).toBe(false);
    expect((await graph.directory.listTeams()).map((team) => team.name)).toEqual(['Platform']);
  });

  /**
   * Plan commands is installed once, where `composeServices` runs, and builds
   * every batch over the scope that batch's own unit of work admits: the
   * `Writing modules are installed per admitted scope` requirement, for the
   * one feature whose batches are admitted.
   */
  test('installs Plan commands once, building every batch over its own admitted scope', async () => {
    const { graph } = await fixture();

    expect(
      await graph.commands.runDirectory('owner', [{ kind: 'createTeam', name: 'First' }]),
    ).toMatchObject({ ok: true });
    expect(
      await graph.commands.runDirectory('owner', [
        { kind: 'createTeam', name: 'Rolled back' },
        { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Needs a work package' },
      ]),
    ).toMatchObject({ ok: false, at: 1, reason: 'work_package_required' });
    expect(
      await graph.commands.runDirectory('owner', [{ kind: 'createTeam', name: 'Second' }]),
    ).toMatchObject({ ok: true });

    // Proof (2026-09-24): memoizing the first batch's graph in `composeServices`
    // (`(scope, broadcast) => (firstBatch ??= batch(scope, broadcast))` as the installed batch
    // factory) left this test failing on this assertion (0 pass, 1 fail, run alone with `-t`):
    // `Second` went into the first batch's settled scope and only `First` was listed.
    expect((await graph.directory.listTeams()).map((team) => team.name).sort()).toEqual([
      'First',
      'Second',
    ]);
  });

  /**
   * `plans` and `savedPlans` are two names for one Saved plans feature identity, never two
   * instances: the backend module map's "Alias exports must not instantiate duplicates".
   */
  test('composes one Saved plans instance behind both the plans and savedPlans names', async () => {
    const { graph } = await fixture();

    // Proof (2026-09-23): giving `plans` its own `installSavedPlans({...}).savedPlans` in
    // `composeServices` left this assertion failing with two distinct `SavedPlanService`
    // instances (0 pass, 1 fail), with `wbs-core:typecheck` at exit 0.
    expect(graph.plans).toBe(graph.savedPlans);
  });

  test('denies restricted legacy saves and persists an unrestricted save through independent history', async () => {
    const { graph } = await fixture();
    const workPackage = expectCreated(
      await graph.workPackages.create('Private', 'fixture-project', 'owner'),
    );
    await graph.workPackages.update(workPackage.workPackage.id, 'owner', { restricted: true });
    const foreign = { id: 'other', username: 'other', scopes: ['write'] as const };
    const owner = { id: 'owner', username: 'owner', scopes: ['write'] as const };
    expect(
      await savePlan(graph, {
        workPackageId: workPackage.workPackage.id,
        actor: foreign,
        name: 'Denied',
        access: LEGACY_ACCESS,
      }),
    ).toEqual({ outcome: 'forbidden' });
    expect(
      await savePlan(graph, {
        workPackageId: workPackage.workPackage.id,
        actor: owner,
        name: 'Also denied',
        access: LEGACY_ACCESS,
      }),
    ).toEqual({ outcome: 'forbidden' });
    const writable = expectCreated(
      await graph.workPackages.create('Writable', 'fixture-project', 'owner'),
    );
    const saved = await savePlan(graph, {
      workPackageId: writable.workPackage.id,
      actor: owner,
      name: 'Baseline',
      access: LEGACY_ACCESS,
    });
    expect(saved.outcome).toBe('saved');
    if (saved.outcome !== 'saved') return;
    const read = await graph.savedPlans.read(saved.record.id);
    expect(read).toHaveProperty('outcome', 'read');
    if (read.outcome !== 'read') return;
    expect(read.plan.workPackageId).toBe(writable.workPackage.id);
    expect(read.plan.input.schemaVersion).toBe(12);
    const input: unknown = JSON.parse(read.plan.input.bytes);
    expect(input).toHaveProperty('schemaVersion', 12);
    expect(input).toHaveProperty('workPackage.projectId', 'fixture-project');
    expect(input).not.toHaveProperty('workPackage.ownerId');
  });

  test('replays two committed batches from their public buffer after durable rows are pruned', async () => {
    // Proof: giving ReplayOrchestrator a second buffer changed this answer from
    // the buffered tree_replaced event to `{status:"denied", reason:"out_of_range"}`.
    const { graph, runner, source } = await fixture();
    const workPackage = expectCreated(
      await graph.workPackages.create('Replay', 'fixture-project', 'owner'),
    );
    const subscription = `work-package:${workPackage.workPackage.id}`;
    const before = await source.stores.eventLog.latestSeq(subscription);
    for (const name of ['First buffered', 'Second buffered']) {
      expect(
        (
          await runner.run(workPackage.workPackage.id, 'owner', [
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
    const { source, graph, tick } = await fixture();
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
    const { graph, source, clock, runtime } = await fixture();
    const workPackage = expectCreated(
      await graph.workPackages.create('Identities', 'fixture-project', 'owner'),
    );
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
      batch: typeof graph.batch;
    };
    observedGraph.batch = (scope, broadcast, admission, dependencies, ...hooks) => {
      broadcasts.push(broadcast);
      const services = originalBatch(scope, broadcast, admission, dependencies, ...hooks);
      graphs.push(services);
      return services;
    };
    const runner = createPlanCommandRunner({
      commandAccess: localCommandAccess,
      batchServices: observedGraph.batch,
      publicServices: graph,
      uow: graph.uow,
      announcements: graph.announcements,
    });
    await runner.run(workPackage.workPackage.id, 'owner', []);
    await runner.run(workPackage.workPackage.id, 'owner', []);
    expect(scopes[0]).not.toBe(scopes[1]);
    expect(broadcasts[0]).not.toBe(broadcasts[1]);
    expect(graphs[0]).not.toBe(graphs[1]);
    expect(graph.clock).toBe(clock);
    expect(graph.scheduler).toBe(runtime.scheduler);
    // Proof (2026-09-24): handing Work item `{ ...scheduler }` from its module's options factory
    // left this test failing on `toBe` with "Received: serializes to the same string" (0 pass,
    // 1 fail, run alone with `-t`); the `toEqual` over `graphs.map(runtimeOf)` it replaces had
    // passed the same copy.
    expect(graphs).toHaveLength(2);
    for (const [index, services] of graphs.entries()) {
      const seen = runtimeOf(services);
      expect(seen.clock).toBe(clock);
      expect(seen.scheduler).toBe(runtime.scheduler);
      expect(seen.broadcast).toBe(broadcasts[index]);
    }
  });

  test('discards a stale journal entry through the fresh repair scope', async () => {
    const { graph, runner, source } = await fixture();
    const workPackage = expectCreated(
      await graph.workPackages.create('Repair', 'fixture-project', 'owner'),
    );
    await runner.run(workPackage.workPackage.id, 'owner', [
      { kind: 'createWorkItem', name: 'Original', parentId: null, afterId: null },
    ]);
    const row = (await source.stores.workItems.listByWorkPackage(workPackage.workPackage.id)).at(0);
    if (row === undefined) throw new Error('committed batch did not create its work item');
    await source.stores.workItems.remove([row.id], [], { at: 2_000, by: 'peer' });

    expect(await runner.undo(workPackage.workPackage.id, 'owner')).toMatchObject({
      ok: false,
      reason: 'stale_undo',
    });
    expect(await runner.undo(workPackage.workPackage.id, 'owner')).toMatchObject({
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
  const WORK_PACKAGE = 'work-package-1';
  const OWNER = 'owner';
  const TEAM = 'team-1';

  /** One source holding the work package and the team, and a writing graph over its stores. */
  async function scopeOver(
    shared: Omit<ServicesOverOptions, 'dependencyContext'>,
  ): Promise<WritingServices> {
    const parentFixture = openMemorySourceFixture();
    const source = parentFixture.source;
    await source.stores.users.create(
      { id: OWNER, username: OWNER, passwordHash: null, createdAt: 1 },
      { at: 1, by: OWNER },
    );
    seedLegacyPackageParent(parentFixture, {
      organizationId: 'fixture-legacy-org',
      projectId: 'fixture-project',
      creator: OWNER,
    });
    await source.stores.workPackages.create(
      workPackageRow({ id: WORK_PACKAGE, projectId: 'fixture-project' }),
      [],
      {
        at: 1,
        by: OWNER,
      },
    );
    await source.stores.directory.addTeam({ id: TEAM, name: 'Platform' }, { at: 1, by: OWNER });
    return servicesOver(source.stores, {
      ...shared,
      dependencyContext: createLocalDependencyContext(source.stores),
    });
  }

  /** Two such scopes, sharing only what every admission shares. */
  async function twoScopes(): Promise<{
    readonly first: WritingServices;
    readonly second: WritingServices;
  }> {
    let next = 0;
    const shared: Omit<ServicesOverOptions, 'dependencyContext'> = {
      admission: LEGACY_EDIT_ADMISSION,
      clock: clockOf({ now: () => 1_000, newId: () => `id-${String(++next)}` }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    };
    return { first: await scopeOver(shared), second: await scopeOver(shared) };
  }

  test("installs Calendar marker per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(
      await first.calendarMarkers.create(WORK_PACKAGE, OWNER, {
        date: '2026-09-30',
        name: 'Launch',
      }),
    ).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installCalendarMarker(...)` result in a module-level
    // `let` and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail,
    // run alone with `-t`): the second scope listed the first scope's `Launch` marker.
    expect(await second.calendarMarkers.list(WORK_PACKAGE)).toEqual({ ok: true, value: [] });
  });

  test("installs Capacity per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(await first.capacity.set(WORK_PACKAGE, OWNER, TEAM, 3)).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installCapacity(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope listed the first scope's `{ serviceTeamId: "team-1", size: 3 }`.
    expect(await second.capacity.listFor(WORK_PACKAGE)).toEqual([]);
  });

  test("installs Priority band per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const ladder = DEFAULT_PRIORITY_BANDS.map((band) => ({ ...band, label: `${band.label} now` }));
    expect(await first.priorityBands.set(WORK_PACKAGE, OWNER, ladder)).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installPriorityBand(...)` result in a module-level `let`
    // and handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run
    // alone with `-t`): the second scope read the first scope's `Critical now` ladder.
    expect(await second.priorityBands.listFor(WORK_PACKAGE)).toEqual([...DEFAULT_PRIORITY_BANDS]);
  });

  // Proof: forwarding `CREATOR_ADMISSION` instead of `shared.admission` to
  // the Capacity, Priority band or Work item installer in `servicesOver`,
  // one at a time, made this test fail each time (0 pass, 1 fail, run alone
  // with `-t`): that service's write answered `ok: true`; watched 2026-09-28.
  test('hands its admission to every gated writing service it installs', async () => {
    const broadcast = recordingBroadcaster();
    const graph = await scopeOver({
      admission: { admits: () => false },
      clock: clockOf({ now: () => 1_000, newId: () => 'unused' }),
      broadcast,
      scheduler: fastScheduler,
    });

    expect(await graph.capacity.set(WORK_PACKAGE, OWNER, TEAM, 3)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await graph.priorityBands.set(WORK_PACKAGE, OWNER, [...DEFAULT_PRIORITY_BANDS])).toEqual(
      {
        ok: false,
        reason: 'forbidden',
      },
    );
    expect(
      await graph.workItems.create(WORK_PACKAGE, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Scope',
      }),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(await graph.capacity.listFor(WORK_PACKAGE)).toEqual([]);
    expect(await graph.priorityBands.listFor(WORK_PACKAGE)).toEqual([...DEFAULT_PRIORITY_BANDS]);
    expect(broadcast.published).toEqual([]);
  });

  // Proof: defaulting `shared.admission ?? CREATOR_ADMISSION` in
  // `servicesOver` made this test fail (0 pass, 1 fail, run alone with `-t`):
  // the write resolved instead of rejecting; watched 2026-09-28.
  test('fails closed on a write through a graph built without an admission', async () => {
    // @ts-expect-error a graph without an admission does not compile
    const shared: Omit<ServicesOverOptions, 'dependencyContext'> = {
      clock: clockOf({ now: () => 1_000, newId: () => 'unused' }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    };
    const graph = await scopeOver(shared);

    const failure = await graph.capacity.set(WORK_PACKAGE, OWNER, TEAM, 3).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(TypeError);
  });

  test("installs Step per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const added = await first.steps.add(WORK_PACKAGE, OWNER, 'Review', 0);
    if (!added.ok) throw new Error(`the first scope refused the step: ${added.reason}`);
    // Proof (2026-09-24): memoizing one `installStep(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope renamed the first scope's step and answered `ok: true`.
    expect(await second.steps.rename(WORK_PACKAGE, added.value.id, OWNER, 'Renamed')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  test("installs Work package per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    const created = expectCreated(
      await first.workPackages.create('Alpha', 'fixture-project', OWNER),
    );
    // Proof (2026-09-24): memoizing one `installWorkPackage(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope read the first scope's `Alpha` work package instead of null.
    expect(await second.workPackages.read(created.workPackage.id)).toBeNull();
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

  test("installs Work item per supplied scope, over that scope's own stores", async () => {
    const { first, second } = await twoScopes();

    expect(
      await first.workItems.create(WORK_PACKAGE, OWNER, {
        parentId: null,
        afterId: null,
        name: 'Scope',
      }),
    ).toMatchObject({ ok: true });
    // Proof (2026-09-24): memoizing one `installWorkItem(...)` result in a module-level `let` and
    // handing it to every `servicesOver` call left this case failing (0 pass, 1 fail, run alone
    // with `-t`): the second scope's tree listed the first scope's `Scope` work item.
    expect(await second.workItems.tree(WORK_PACKAGE)).toMatchObject({ workItems: [] });
  });
});
