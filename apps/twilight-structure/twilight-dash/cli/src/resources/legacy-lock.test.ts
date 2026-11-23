import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterEach, expect, test } from 'bun:test';

import type { HostHold } from './host-lock';
import { awaitLegacyRelease, productionLegacyLock, readLegacyQueue } from './legacy-lock';

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  const cause: unknown = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(cause instanceof Error)) throw new Error('operation did not fail with an Error', { cause });
  return cause;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-queue-adapter-'));
  roots.push(root);
  return {
    clock: { read: () => 1800000001000 },
    monotonic: { now: () => 0 },
    lockPath: join(root, 'mutex'),
    helperPrefix: createLaunch(process.execPath, join(import.meta.dir, '../entrypoint.ts')),
  };
}
test('production lock captures the explicitly selected protected helper prefix', async () => {
  const prefix = [...createLaunch(process.execPath, '/opt/selected Dash/entrypoint.mjs')];
  const pending = productionLegacyLock(prefix, {
    clock: { read: () => 0 },
    monotonic: { now: () => 0 },
  });
  prefix.push('mutated');
  const lock = await pending;
  expect(lock.helperPrefix).toEqual(prefix.slice(0, -1));
  expect('library' in lock).toBe(false);
});
test('native queue preserves holder and waiter human protocol', async () => {
  const lock = fixture();
  mkdirSync(lock.lockPath + '.d');
  mkdirSync(lock.lockPath + '.queue');
  writeFileSync(join(lock.lockPath + '.d', 'holder'), '12345\n');
  writeFileSync(join(lock.lockPath + '.d', 'label'), 'legacy peer\n');
  writeFileSync(
    join(lock.lockPath + '.queue', '1800000000000000000-12346'),
    'pid 12346\nlabel pending peer\nstarted 1800000000\ndeadline 1800000010\n',
  );
  const queue = await readLegacyQueue(lock);
  expect(queue.holder).toEqual({ kind: 'held', pid: 12345, label: 'legacy peer' });
  expect(queue.waiters).toEqual([
    { pid: 12346, label: 'pending peer', ageSeconds: 1, budget: '9s left' },
  ]);
  expect(queue.lines).toEqual([
    'heavy lock: holder pid 12345 label legacy peer',
    'heavy lock: waiter pid 12346 label pending peer age 1s budget 9s left',
  ]);
});
test('native queue refuses corrupt trusted state', async () => {
  const lock = fixture();
  mkdirSync(lock.lockPath + '.queue');
  writeFileSync(join(lock.lockPath + '.queue', 'corrupt'), 'bad');
  expect((await failureOf(readLegacyQueue(lock))).message).toContain('epoch/PID ticket');
});
for (const pid of ['invalid', '0', '2147483648'])
  test('native queue refuses invalid holder PID ' + pid, async () => {
    const lock = fixture();
    mkdirSync(lock.lockPath + '.d');
    writeFileSync(join(lock.lockPath + '.d', 'holder'), pid + '\n');
    expect((await failureOf(readLegacyQueue(lock))).message).toContain('PID');
  });
test('native queue refuses an unsafe observational age conversion', async () => {
  const lock = fixture();
  mkdirSync(lock.lockPath + '.queue');
  writeFileSync(
    join(lock.lockPath + '.queue', '1800000000000000000-12346'),
    'pid 12346\nlabel pending\nstarted 1\ndeadline 2\n',
  );
  expect(
    (
      await failureOf(
        readLegacyQueue({
          ...lock,
          clock: { read: () => Number(9007199254740992n + 1800000000n) * 1000 },
        }),
      )
    ).message,
  ).toContain('safe integer');
});
function hold(exited: Promise<number>): HostHold {
  return {
    pid: 123,
    identity: { pid: 123, boot: '00000000-0000-0000-0000-000000000000', start: '1' },
    release: () => undefined,
    diagnostics: () => ({ kind: 'readable', text: '' }),
    exited,
  };
}
test('release observation requires native zero exit', async () => {
  await awaitLegacyRelease(hold(Promise.resolve(0)));
  expect((await failureOf(awaitLegacyRelease(hold(Promise.resolve(143))))).message).toContain(
    'exit 143',
  );
});
test('release observation preserves rejected native wait', async () => {
  const cause = new Error('native wait failed');
  expect(await failureOf(awaitLegacyRelease(hold(Promise.reject(cause))))).toBe(cause);
});
test('release observation is bounded when native exit is absent', async () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observation = await Promise.race([
      awaitLegacyRelease(hold(new Promise(() => undefined)), 5).then(
        () => ({ kind: 'released' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      ),
      new Promise<{ kind: 'pending' }>((resolve) => {
        timer = setTimeout(() => {
          resolve({ kind: 'pending' });
        }, 200);
      }),
    ]);
    expect(observation.kind).toBe('failed');
    if (observation.kind !== 'failed')
      throw new Error('native exit observation remained unbounded');
    expect(String(observation.cause)).toContain('unconfirmed');
  } finally {
    clearTimeout(timer);
  }
});
