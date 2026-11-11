import { expect, test } from 'bun:test';

import type { HostHold } from '../resources/host-lock';
import type { HostJob } from '../resources/runtime';
import { endLegacyHold } from './job-run';

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  const cause: unknown = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(cause instanceof Error)) throw new Error('operation did not fail with an Error', { cause });
  return cause;
}

function held(exited: Promise<number>) {
  let releases = 0;
  const hold: HostHold = {
    pid: 123,
    identity: { pid: 123, boot: '00000000-0000-0000-0000-000000000000', start: '1' },
    release() {
      releases++;
    },
    exited,
    diagnostics: () => ({ kind: 'readable', text: '' }),
  };
  return { hold, releases: () => releases };
}
function ledger(state: 'held' | 'released') {
  return { inspectHostJob: () => ({ compute: { state } }) as HostJob };
}
const deps = { report: (_line: string) => undefined };
test('unreadable compute ledger throws while retaining the exact hold', async () => {
  const owner = held(Promise.resolve(0)),
    cause = new Error('ledger unreadable');
  const failure = await failureOf(
    endLegacyHold(
      {
        inspectHostJob() {
          throw cause;
        },
      },
      'job',
      owner.hold,
      deps,
    ),
  );
  expect(failure.message).toContain('compute entry is unreadable');
  expect(owner.releases()).toBe(0);
});
test('outstanding compute explicitly retains native ownership', async () => {
  const owner = held(Promise.resolve(0));
  expect(await endLegacyHold(ledger('held'), 'job', owner.hold, deps)).toEqual({
    kind: 'retained',
  });
  expect(owner.releases()).toBe(0);
});
test('released compute authorizes exact token removal and confirmed native settlement', async () => {
  const owner = held(Promise.resolve(0));
  expect(await endLegacyHold(ledger('released'), 'job', owner.hold, deps)).toEqual({
    kind: 'released',
  });
  expect(owner.releases()).toBe(1);
});
test('rejected native exit remains a required cleanup failure', async () => {
  const cause = new Error('native observation failed'),
    owner = held(Promise.reject(cause));
  expect(await failureOf(endLegacyHold(ledger('released'), 'job', owner.hold, deps))).toBe(cause);
  expect(owner.releases()).toBe(1);
});
test('abnormal native exit cannot be reported as released', async () => {
  const owner = held(Promise.resolve(143));
  expect(
    (await failureOf(endLegacyHold(ledger('released'), 'job', owner.hold, deps))).message,
  ).toContain('exit 143');
});
