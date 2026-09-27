import { inMemoryEventLog } from '@wbs/store-memory/replay-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installEventLog } from './check';
import { EVENT_LOG_LABEL } from './contract';
import { eventLogModule } from './module';

const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([eventLogModule])
    .withServices({
      eventLogStore: DiBag.createProvider(() => inMemoryEventLog(), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Event log module', () => {
  it('records, reads, and prunes durable subscription events', async () => {
    const { eventLog } = installEventLog({ events: inMemoryEventLog() });
    const subscription = 'project:one';
    expect(await eventLog.readLatestSequence(subscription)).toBe(-1);
    const first = await eventLog.recordEvent(subscription, { n: 1 }, 1);
    const second = await eventLog.recordEvent(subscription, { n: 2 }, 2);
    expect([first.seq, second.seq]).toEqual([0, 1]);
    expect((await eventLog.readEvents(subscription, -1)).map((event) => event.seq)).toEqual([0, 1]);
    expect(await eventLog.pruneEvents(1)).toBe(1);
    expect((await eventLog.readEvents(subscription, -1)).map((event) => event.seq)).toEqual([1]);
  });

  it('exports only the resource', () => {
    const exposed: object = installEventLog({ events: inMemoryEventLog() });
    expect(Object.keys(exposed)).toEqual(['eventLog']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  it('keeps the private binding out of the host graph', () => {
    const host = completeHost();
    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('eventLogSettings'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "eventLogSettings" is not registered.');
  });

  it('labels the private binding', () => {
    expect(
      completeHost()
        .graphSnapshot()
        .bindings.map((binding) => binding.bindingLabel),
    ).toContain(`${EVENT_LOG_LABEL}/eventLogSettings`);
  });

  it('names the missing requirement', () => {
    const partial = DiBag.createBuilder().withInstalledModules([eventLogModule]) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    expect(() => partial.buildContainer().resolve('eventLog')).toThrow(
      `Cannot resolve "${EVENT_LOG_LABEL}/eventLogSettings": dependency "eventLogStore" is not registered. Resolution path: eventLog -> ${EVENT_LOG_LABEL}/eventLogSettings -> eventLogStore.`,
    );
  });
});
