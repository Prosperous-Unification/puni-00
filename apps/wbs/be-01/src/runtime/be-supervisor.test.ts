import { describe, expect, test } from 'bun:test';

import { createBackgroundFailure, superviseBe } from './be-supervisor';

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

function createFixture() {
  const backgroundFailure = createBackgroundFailure();
  const disposal = Promise.withResolvers<undefined>();
  const exits: number[] = [];
  const reports: unknown[] = [];
  let stops = 0;
  return {
    backgroundFailure,
    disposal,
    exits,
    reports,
    stops: () => stops,
    running: {
      backgroundFailure: backgroundFailure.source,
      stop: () => {
        stops += 1;
        return disposal.promise;
      },
    },
    effects: {
      exit: (code: number) => {
        exits.push(code);
      },
      report: (cause: unknown) => {
        reports.push(cause);
      },
    },
  };
}

describe('be process supervision', () => {
  test('latches the first failure and synchronously notifies observers once', () => {
    const background = createBackgroundFailure();
    const first = new Error('first failure');
    const observed: unknown[] = [];
    background.source.observe((failure) => {
      observed.push(failure.cause);
    });
    background.report(first);
    background.report(new Error('later failure'));
    expect(observed).toEqual([first]);
    expect(background.source.current()).toEqual({ cause: first });
  });

  test('shares repeated signal shutdown and exits only after disposal', async () => {
    const fixture = createFixture();
    const supervisor = superviseBe(fixture.running, fixture.effects);
    const stopping = supervisor.stop();
    expect(supervisor.stop()).toBe(stopping);
    expect(fixture.stops()).toBe(1);
    expect(fixture.exits).toEqual([]);
    fixture.disposal.resolve(undefined);
    await stopping;
    expect(fixture.exits).toEqual([0]);
  });

  test('observes an already-latched failure synchronously and exits one after disposal', async () => {
    const fixture = createFixture();
    const fault = new Error('immediate sweep failure');
    fixture.backgroundFailure.report(fault);
    const supervisor = superviseBe(fixture.running, fixture.effects);
    expect(fixture.stops()).toBe(1);
    expect(fixture.backgroundFailure.source.current()).toEqual({ cause: fault });
    expect(fixture.exits).toEqual([]);
    fixture.disposal.resolve(undefined);
    await supervisor.stop();
    expect(fixture.exits).toEqual([1]);
  });

  test('background failure wins a concurrent signal shutdown', async () => {
    const fixture = createFixture();
    const supervisor = superviseBe(fixture.running, fixture.effects);
    const stopping = supervisor.stop();
    fixture.backgroundFailure.report(new Error('lookup cleanup failed during stop'));
    expect(fixture.stops()).toBe(1);
    fixture.disposal.resolve(undefined);
    await stopping;
    expect(fixture.exits).toEqual([1]);
  });

  test('a later background failure starts shutdown without a signal', async () => {
    const fixture = createFixture();
    const supervisor = superviseBe(fixture.running, fixture.effects);
    fixture.backgroundFailure.report(new Error('periodic sweep failed'));
    expect(fixture.stops()).toBe(1);
    await settle();
    expect(fixture.exits).toEqual([]);
    fixture.disposal.resolve(undefined);
    await supervisor.stop();
    expect(fixture.exits).toEqual([1]);
  });

  test('disposal rejection exits one and preserves the disposal failure', async () => {
    const fixture = createFixture();
    const failures: unknown[] = [];
    const supervisor = superviseBe(fixture.running, {
      ...fixture.effects,
      report: (cause) => {
        failures.push(cause);
      },
    });
    const stopping = supervisor.stop();
    const fault = new Error('database close failed');
    fixture.disposal.reject(fault);
    await stopping;
    expect(failures).toEqual([fault]);
    expect(fixture.exits).toEqual([1]);
  });

  test('reentrant failure during stop still disposes exactly once', async () => {
    const fixture = createFixture();
    const supervisor = superviseBe(
      {
        ...fixture.running,
        stop: () => {
          fixture.backgroundFailure.report(new Error('synchronous shutdown fault'));
          return fixture.running.stop();
        },
      },
      fixture.effects,
    );
    const stopping = supervisor.stop();
    expect(fixture.stops()).toBe(1);
    fixture.disposal.resolve(undefined);
    await stopping;
    expect(fixture.exits).toEqual([1]);
  });
});
