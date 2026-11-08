import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { createRegistryPressureStop } from './registry-pressure-stop.fixture';

/** Same-process selected-stop coordinator; writer/probe and request reads are modeled, not native processes. */
test('selected fresh stop waits for unavailable ACK and exact writer closure', async () => {
  const instance = '11111111-1111-4111-8111-111111111111';
  const boot = '22222222-2222-4222-8222-222222222222';
  const old = '33333333-3333-4333-8333-333333333333';
  const fresh = '44444444-4444-4444-8444-444444444444';
  const record = `${instance} ${boot}\n`,
    prior = `${old} ${instance} ${boot}\n`,
    current = `${fresh} ${instance} ${boot}\n`;
  const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const events: string[] = [];
  const stop = createRegistryPressureStop(
    {
      pid: 42,
      startTicks: '123',
      assertLive: () => {
        events.push('live');
        return Promise.resolve({ pid: 42, startTicks: '123' });
      },
      close: () => {
        events.push('close');
        return Promise.resolve({
          pid: 42,
          startTicks: '123',
          exitCode: 143,
          signal: 'SIGTERM',
          groupAbsent: true,
        });
      },
    },
    () => {
      events.push('request');
      return Promise.resolve(current);
    },
    () => {
      events.push('ack');
      return Promise.resolve({
        instanceSha256: hash(record),
        requestSha256: hash(current),
        allocation: 'ENOSPC',
        stage: 'open',
      });
    },
  );
  expect(await stop.stop({ uid: 'Deployment-registry', resourceVersion: '2' })).toEqual({
    scope: 'bootstrap',
  });
  expect(events).toEqual([]);
  stop.arm({
    uid: 'Deployment-registry',
    resourceVersion: '2',
    instance: record,
    priorRequest: prior,
  });
  expect(await stop.stop({ uid: 'Deployment-registry', resourceVersion: '2' })).toEqual({
    scope: 'pressure',
    pid: 42,
    startTicks: '123',
    instanceSha256: hash(record),
    requestSha256: hash(current),
    allocation: 'ENOSPC',
    stage: 'open',
    exitCode: 143,
    signal: 'SIGTERM',
    groupAbsent: true,
  });
  expect(events).toEqual(['request', 'live', 'ack', 'close']);
  expect(stop.receipt()).toMatchObject({ scope: 'pressure', pid: 42 });
});

for (const fault of [
  'old-request',
  'foreign-instance',
  'malformed-request',
  'missing-request',
  'unreadable-request',
  'probe-error',
  'probe-success',
  'probe-hash',
  'live-identity',
  'terminal-identity',
  'selection',
  'replay',
  'unarmed-receipt',
  'rearm',
  'bad-arm',
  'cleanup-error',
  'probe-extra',
  'arm-uid',
  'arm-revision',
  'arm-prior',
] as const) {
  test(`selected stop refuses ${fault}`, async () => {
    const instance = '11111111-1111-4111-8111-111111111111',
      boot = '22222222-2222-4222-8222-222222222222';
    const prior = `33333333-3333-4333-8333-333333333333 ${instance} ${boot}\n`;
    const current = `44444444-4444-4444-8444-444444444444 ${instance} ${boot}\n`,
      record = `${instance} ${boot}\n`;
    const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
    const events: string[] = [];
    const failure = Object.assign(new Error('private request failure'), {
        code: fault === 'missing-request' ? 'ENOENT' : 'EACCES',
      }),
      cleanup = new Error('private cleanup failure');
    const writer = {
      pid: 42,
      startTicks: '123',
      assertLive: () => {
        events.push('live');
        return Promise.resolve({ pid: fault === 'live-identity' ? 43 : 42, startTicks: '123' });
      },
      close: () => {
        events.push('close');
        if (fault === 'cleanup-error') return Promise.reject(cleanup);
        return Promise.resolve({
          pid: fault === 'terminal-identity' ? 43 : 42,
          startTicks: '123',
          exitCode: 143,
          signal: 'SIGTERM',
          groupAbsent: true as const,
        });
      },
    };
    const stop = createRegistryPressureStop(
      writer,
      () => {
        events.push('request');
        if (['missing-request', 'unreadable-request', 'cleanup-error'].includes(fault))
          return Promise.reject(failure);
        return Promise.resolve(
          fault === 'old-request'
            ? prior
            : fault === 'foreign-instance'
              ? current.replace(instance, boot)
              : fault === 'malformed-request'
                ? 'bad'
                : current,
        );
      },
      () => {
        events.push('ack');
        if (fault === 'probe-error') return Promise.reject(failure);
        return Promise.resolve({
          instanceSha256: hash(record),
          requestSha256: hash(fault === 'probe-hash' ? prior : current),
          allocation: fault === 'probe-success' ? 'success' : 'ENOSPC',
          stage: 'open',
          ...(fault === 'probe-extra' ? { extra: true } : {}),
        });
      },
    );
    let refused: unknown;
    try {
      if (fault === 'unarmed-receipt') stop.receipt();
      else {
        stop.arm({
          uid: fault === 'arm-uid' ? '' : 'Deployment-registry',
          resourceVersion: fault === 'arm-revision' ? '0' : '2',
          instance: fault === 'bad-arm' ? 'bad' : record,
          priorRequest: fault === 'arm-prior' ? 'bad' : prior,
        });
        if (fault === 'rearm')
          stop.arm({
            uid: 'Deployment-registry',
            resourceVersion: '2',
            instance: record,
            priorRequest: prior,
          });
        else {
          await stop.stop({
            uid:
              fault === 'selection' ? 'foreign' : fault === 'arm-uid' ? '' : 'Deployment-registry',
            resourceVersion: fault === 'arm-revision' ? '0' : '2',
          });
          if (fault === 'replay')
            await stop.stop({ uid: 'Deployment-registry', resourceVersion: '2' });
        }
      }
    } catch (cause) {
      refused = cause;
    }
    expect(refused).toBeInstanceOf(Error);
    if (
      [
        'unarmed-receipt',
        'rearm',
        'bad-arm',
        'selection',
        'arm-uid',
        'arm-revision',
        'arm-prior',
      ].includes(fault)
    )
      expect(events).toEqual([]);
    else if (fault === 'replay') expect(events).toEqual(['request', 'live', 'ack', 'close']);
    else if (
      [
        'old-request',
        'foreign-instance',
        'malformed-request',
        'missing-request',
        'unreadable-request',
        'cleanup-error',
      ].includes(fault)
    )
      expect(events).toEqual(['request', 'close']);
    else if (fault === 'live-identity') expect(events).toEqual(['request', 'live', 'close']);
    else expect(events).toEqual(['request', 'live', 'ack', 'close']);
    if (['missing-request', 'unreadable-request', 'probe-error'].includes(fault))
      expect(refused).toBe(failure);
    if (fault === 'cleanup-error') {
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toEqual([failure, cleanup]);
      expect((refused as AggregateError).cause).toBe(failure);
    }
    if (fault !== 'replay') expect(() => stop.receipt()).toThrow();
  });
}

test('selected stop consumes its arm before pending request read', async () => {
  const instance = '11111111-1111-4111-8111-111111111111',
    boot = '22222222-2222-4222-8222-222222222222';
  let release: () => void = () => {
    throw new Error('Missing request release');
  };
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0,
    closed = 0;
  const failure = new Error('controlled request refusal');
  const stop = createRegistryPressureStop(
    {
      pid: 42,
      startTicks: '123',
      assertLive: () => Promise.resolve({ pid: 42, startTicks: '123' }),
      close: () => {
        closed++;
        return Promise.resolve({
          pid: 42,
          startTicks: '123',
          exitCode: 143,
          signal: 'SIGTERM',
          groupAbsent: true,
        });
      },
    },
    async () => {
      reads++;
      await waiting;
      throw failure;
    },
    () => Promise.resolve(undefined),
  );
  stop.arm({
    uid: 'Deployment-registry',
    resourceVersion: '2',
    instance: `${instance} ${boot}\n`,
    priorRequest: `33333333-3333-4333-8333-333333333333 ${instance} ${boot}\n`,
  });
  const first = stop.stop({ uid: 'Deployment-registry', resourceVersion: '2' });
  let concurrent: unknown;
  const second = stop
    .stop({ uid: 'Deployment-registry', resourceVersion: '2' })
    .catch((cause: unknown) => {
      concurrent = cause;
    });
  await Promise.resolve();
  try {
    expect(reads).toBe(1);
    expect(concurrent).toBeInstanceOf(Error);
  } finally {
    release();
    await first.catch((cause: unknown) => {
      expect(cause).toBe(failure);
    });
    await second;
  }
  expect(closed).toBe(1);
});
