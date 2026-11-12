import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { type GateAdmission, readGateAdmission, withGateAdmission } from './gate-admission';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function request() {
  const root = mkdtempSync(join(tmpdir(), 'puni gate admission '));
  roots.push(root);
  return {
    path: join(root, 'mutex'),
    label: 'admission test',
    command: 'test',
    waitSeconds: 0,
    pollSeconds: 1,
  };
}
it('refuses plain queue metadata as private admission authority', () => {
  expect(() => {
    Reflect.apply(readGateAdmission, undefined, [{ aheadAtArrival: 0, waitedSeconds: 0 }]);
  }).toThrow('gate admission is not held');
});
it('keeps the actual native mutex through its fully awaited callback', async () => {
  const { holdLock } = await import('@shared/heavy-lock');
  const selected = request(),
    entered = Promise.withResolvers<undefined>(),
    settled = Promise.withResolvers<undefined>();
  const pending = withGateAdmission(selected, new AbortController().signal, async (admission) => {
    expect(readGateAdmission(admission).aheadAtArrival).toBe(0);
    entered.resolve(undefined);
    await settled.promise;
    expect(() => readGateAdmission(admission)).not.toThrow('gate admission is not held');
    expect(readGateAdmission(admission).aheadAtArrival).toBe(0);
    return 37;
  });
  const observation = pending.then(
    (value) => ({ kind: 'completed' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  const failures: unknown[] = [];
  let completion: Awaited<typeof pending> | undefined;
  try {
    await entered.promise;
    expect((await holdLock(selected.path, () => Promise.resolve(0))).kind).toBe('busy');
  } catch (cause) {
    failures.push(cause);
  } finally {
    settled.resolve(undefined);
    const observed = await observation;
    if (observed.kind === 'failed') failures.push(observed.cause);
    else completion = observed.value;
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'admission assertion and owned callback cleanup failed');
  if (completion === undefined) throw Error('admission completion was not captured');
  expect(completion).toMatchObject({ kind: 'completed', aheadAtArrival: 0, value: 37 });
  expect((await holdLock(selected.path, () => Promise.resolve(0))).kind).toBe('owned');
});
it('retains registry-owned immutable metadata despite caller replacement', async () => {
  await withGateAdmission(request(), new AbortController().signal, (admission) => {
    const observation = readGateAdmission(admission);
    Reflect.set(admission, 'aheadAtArrival', 999);
    Reflect.set(observation, 'aheadAtArrival', 999);
    expect(readGateAdmission(admission).aheadAtArrival).toBe(0);
    return Promise.resolve(0);
  });
});
for (const fails of [false, true])
  it('retires real admission after callback ' + (fails ? 'failure' : 'completion'), async () => {
    let retained: GateAdmission | undefined;
    const failure = new Error('controlled callback failure');
    const pending = withGateAdmission(request(), new AbortController().signal, (admission) => {
      retained = admission;
      return fails ? Promise.reject(failure) : Promise.resolve(0);
    });
    if (fails) {
      const observed: unknown = await pending.catch((cause: unknown) => cause);
      expect(observed).toBe(failure);
    } else expect(await pending).toMatchObject({ kind: 'completed', value: 0 });
    if (retained === undefined) throw Error('real admission was not observed');
    const expired = retained;
    expect(() => readGateAdmission(expired)).toThrow('gate admission is not held');
  });
