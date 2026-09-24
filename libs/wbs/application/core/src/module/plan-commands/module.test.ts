import { openMemorySource } from '@wbs/store-memory';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanCommands } from './check';
import { PLAN_COMMANDS_LABEL } from './contract';
import { planCommandsModule } from './module';

const PROJECT = 'project-1';
const OWNER = 'owner';

/**
 * One memory source holding one project, and the four requirements a command
 * batch needs. `handed` records every broadcaster the runner gives a batch's
 * graph, which is how the per-batch collector is observed from outside.
 */
async function seeded() {
  const source = openMemorySource();
  await source.stores.projects.create(projectRow({ id: PROJECT, ownerId: OWNER }), [], {
    at: 1,
    by: OWNER,
  });
  let next = 0;
  const clock = clockOf({ now: () => 2, newId: () => `item-${String(++next)}` });
  const graphOver = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
    servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
  const announcements = recordingBroadcaster();
  const handed: Broadcaster[] = [];
  return {
    announcements,
    handed,
    requirements: {
      batchServices: (scope: Scope, broadcast: Broadcaster) => {
        handed.push(broadcast);
        return graphOver(scope.stores, broadcast);
      },
      publicServices: graphOver(source.stores, recordingBroadcaster()),
      uow: source.uow,
      announcements,
    },
  };
}

const hostRequirements = () => {
  const source = openMemorySource();
  const clock = clockOf({ now: () => 0, newId: () => 'unused' });
  const graphOver = (stores: PlanTransactionalStores, broadcast: Broadcaster) =>
    servicesOver(stores, { clock, broadcast, scheduler: fastScheduler });
  return {
    batchServices: DiBag.fromSyncFactory(
      () => (scope: Scope, broadcast: Broadcaster) => graphOver(scope.stores, broadcast),
    ),
    publicServices: DiBag.fromSyncFactory(() => graphOver(source.stores, recordingBroadcaster())),
    uow: DiBag.fromSyncFactory(() => source.uow),
  };
};

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(planCommandsModule)
    .register({
      ...hostRequirements(),
      announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
    })
    .build();

describe('the Plan commands module', () => {
  it('drains a committed batch into the broadcaster installPlanCommands wires', async () => {
    const { announcements, requirements } = await seeded();
    const { commands } = installPlanCommands(requirements);

    const outcome = await commands.run(PROJECT, OWNER, [
      { kind: 'createTeam', ref: 'team', name: 'Platform' },
      { kind: 'setCapacity', teamRef: 'team', size: 2 },
    ]);

    expect(outcome).toMatchObject({ ok: true });
    expect(announcements.published).toEqual([
      { projectId: PROJECT, event: { type: 'capacity_changed' } },
    ]);
  });

  /**
   * The per-admission half of the module: the runner is installed once, and
   * every batch it runs is handed a collector of its own — never the direct
   * broadcaster, and never the previous batch's.
   */
  it('hands every batch its own collector, never the direct broadcaster', async () => {
    const { announcements, handed, requirements } = await seeded();
    const { commands } = installPlanCommands(requirements);

    await commands.run(PROJECT, OWNER, []);
    await commands.run(PROJECT, OWNER, []);

    expect(handed).toHaveLength(2);
    expect(handed[0]).not.toBe(handed[1]);
    expect(handed.some((broadcast) => broadcast === announcements)).toBe(false);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `PlanCommandsExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installPlanCommands(requirements);

    expect(Object.keys(exposed)).toEqual(['commands']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('planCommandOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "planCommandOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PLAN_COMMANDS_LABEL}/planCommandOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(planCommandsModule)
      .register(hostRequirements()) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('commands')).toThrow(
      `Cannot resolve "${PLAN_COMMANDS_LABEL}/planCommandOptions": dependency "announcements" is not registered. Resolution path: commands -> ${PLAN_COMMANDS_LABEL}/planCommandOptions -> announcements.`,
    );
  });
});
