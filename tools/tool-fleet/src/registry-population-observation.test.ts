import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { observeRegistryPopulationRun } from './registry-maintenance-populated.native';
import { requireRejection } from './registry-rejection.fixture';
const failure = {
  code: 1,
  stdout: 'private',
  stderr:
    'task8-population-owner:{"boundary":"publication"}\nNative host fixture operation failed\n',
};
test('missing HTTP trace preserves the failed owner diagnostic before refusing', async () => {
  const lines: string[] = [];
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () => invokeRegistryCallback(() => failure),
          () => invokeRegistryCallback(() => ({ samples: [], truncated: false })),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow();
  expect(
    lines.some((line) => line.includes('populationOutput') && line.includes('publication')),
  ).toBe(true);
  expect(lines.join('')).not.toContain('private');
});
test('terminal monitor failure preserves available owner and HTTP observations then fails', async () => {
  const lines: string[] = [];
  let ended = false;
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () => invokeRegistryCallback(() => failure),
          () =>
            invokeRegistryCallback(() => {
              ended = true;
              throw new Error('private monitor');
            }),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow();
  expect(ended).toBe(true);
  expect(lines.some((line) => line.includes('"state":"failed"'))).toBe(true);
  expect(lines.some((line) => line.includes('populationOutput'))).toBe(true);
  expect(lines.some((line) => line.includes('populationHttp'))).toBe(true);
  expect(lines.join('')).not.toContain('private');
});
test('observer failure cannot convert an otherwise successful owner to success', async () => {
  const lines: string[] = [];
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () =>
            invokeRegistryCallback(() => ({
              code: 0,
              stdout: 'ok',
              stderr: 'task8-population-http:{"events":[],"truncated":false,"pending":0}\n',
            })),
          () =>
            invokeRegistryCallback(() => {
              throw new Error('private');
            }),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow('Required guard observation failed');
});
test('successful owner plus failed monitor emits only mapped category and exact numeric frame before refusal', async () => {
  const lines: string[] = [];
  const cause = new Error('Unexpected fixture permission metadata');
  cause.stack =
    'Error: Unexpected fixture permission metadata\n    at observe (/usr/local/libexec/puni-registry-maintenance/proof.js:42:9)';
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () =>
            invokeRegistryCallback(() => ({
              code: 0,
              stdout: 'private owner',
              stderr: 'task8-population-http:{"events":[],"truncated":false,"pending":0}\n',
            })),
          () =>
            invokeRegistryCallback(() => {
              throw cause;
            }),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow('Required guard observation failed');
  const decoded = lines.map((line): unknown => JSON.parse(line));
  expect(decoded).toEqual([
    { guardTimeline: { state: 'failed', observation: null } },
    {
      populationHttp: { state: 'valid', observation: { events: [], truncated: false, pending: 0 } },
    },
    {
      guardObservationFailure: {
        category: 'permission-metadata',
        location: { kind: 'frame', frame: { file: 'fixture-bundle', line: 42, column: 9 } },
      },
    },
  ]);
  expect(lines.findIndex((line) => line.includes('populationHttp'))).toBeLessThan(
    lines.findIndex((line) => line.includes('guardObservationFailure')),
  );
  expect(lines.join('')).not.toContain('private');
  expect(lines.join('')).not.toContain('/usr/local');
  expect(lines.join('')).not.toContain(cause.message);
});
test('unknown monitor error and forged message frame never reflect private text', async () => {
  const lines: string[] = [];
  const cause = new Error(
    'private\n    at forged (/usr/local/libexec/puni-registry-maintenance/proof.js:123:9)',
  );
  cause.stack = 'Error: ' + cause.message + '\n    at outside (/private.js:1:1)';
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () =>
            invokeRegistryCallback(() => ({
              code: 0,
              stdout: 'private owner',
              stderr: 'task8-population-http:{"events":[],"truncated":false,"pending":0}\n',
            })),
          () =>
            invokeRegistryCallback(() => {
              throw cause;
            }),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow('Required guard observation failed');
  expect(lines.map((line): unknown => JSON.parse(line))).toEqual([
    { guardTimeline: { state: 'failed', observation: null } },
    {
      populationHttp: { state: 'valid', observation: { events: [], truncated: false, pending: 0 } },
    },
    { guardObservationFailure: { category: 'unknown', location: { kind: 'absent' } } },
  ]);
  expect(lines.join('')).not.toContain('private');
  expect(lines.join('')).not.toContain('123');
});
test('formatter failure cannot hide the available owner and HTTP observations', async () => {
  const lines: string[] = [];
  const cause = new Error('private');
  Object.defineProperty(cause, 'stack', {
    get() {
      throw new Error('private formatter');
    },
  });
  expect(
    (
      await requireRejection(
        observeRegistryPopulationRun(
          () => invokeRegistryCallback(() => failure),
          () =>
            invokeRegistryCallback(() => {
              throw cause;
            }),
          (line) => lines.push(line),
        ),
      )
    ).throwCause,
  ).toThrow();
  expect(lines.some((line) => line.includes('populationHttp'))).toBe(true);
  expect(lines.some((line) => line.includes('populationOutput'))).toBe(true);
  expect(lines.join('')).not.toContain('private');
});
test('monitor diagnostic maps only the three fixed system errors and keeps unknown input private', async () => {
  const { describeRegistryGuardObservationFailure } =
    await import('./registry-guard-observation.fixture');
  for (const [code, category] of [
    ['ENOENT', 'file-absent'],
    ['EACCES', 'access-denied'],
    ['ESRCH', 'process-absent'],
    ['PRIVATE', 'unknown'],
  ]) {
    const cause = Object.assign(new Error('private path'), { code });
    cause.stack = 'Error: private path\n    at outside (/private:1:1)';
    expect(describeRegistryGuardObservationFailure(cause)).toEqual({
      category,
      location: { kind: 'absent' },
    });
  }
  expect(describeRegistryGuardObservationFailure({ message: 'private', stack: 'private' })).toEqual(
    { category: 'unknown', location: { kind: 'absent' } },
  );
});
