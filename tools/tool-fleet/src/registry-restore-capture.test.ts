import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Extracted actual restore hook with modeled native capabilities/proc/signal ports; state persistence is separately tested on actual owned descriptors. */
type Fault =
  | 'none'
  | 'uid'
  | 'gid'
  | 'topology'
  | 'lineage'
  | 'target'
  | 'flags'
  | 'journal-first'
  | 'missing-state'
  | 'unreadable-state'
  | 'invalid-pid'
  | 'self-pid'
  | 'parent'
  | 'child-group'
  | 'command'
  | 'executable'
  | 'child-uid'
  | 'child-gid'
  | 'start-change'
  | 'state-change'
  | 'stop-deadline'
  | 'natural-exit'
  | 'exit-rejected'
  | 'stop-throws'
  | 'kill-throws'
  | 'exit-zero'
  | 'signal'
  | 'consume'
  | 'report'
  | 'dispatch-success'
  | 'duplicate'
  | 'backup'
  | 'terminal-pending'
  | 'stat-bound'
  | 'wrong-stat-pid'
  | 'invalid-start'
  | 'status-bound'
  | 'proc-absent'
  | 'proc-unreadable'
  | 'rescue-throws';
async function createFixture(consumed = false, fault: Fault = 'none') {
  const source = await readFile(
    new URL('./registry-restore-interruption.fixture.ts', import.meta.url),
    'utf8',
  );
  const marker = 'export async function interruptRegistryRestoreFixture';
  if (source.split(marker).length !== 2) throw new Error('Expected one fixed restore hook');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.slice(source.indexOf(marker)).replace('export ', '') +
      '\nreturn interruptRegistryRestoreFixture;',
  );
  const expected = {
    operationId: 'restore-operation',
    snapshotId: 'a'.repeat(64),
    registryPath: '/var/lib/puni-registry/registry/contents',
    journalPath: '/var/lib/puni-registry/journal/contents',
    targetRegistryPath: '/var/lib/puni-registry/recovery/registry/contents',
    targetJournalPath: '/var/lib/puni-registry/recovery/journal/contents',
  };
  const failure = new Error('Modeled required restore child failure');
  const observationFailure = new Error('Modeled required observation failure');
  const rescueFailure = new Error('Modeled rescue signal failure');
  let rejectExit: (cause: Error) => void = () => {
    throw new Error('Missing rejection port');
  };
  let kills = 0;
  let reads = 0;
  let sleeps = 0;
  let clock = 0;
  let inspections = 0;
  let release: (code: number) => void = () => {
    throw new Error('Missing terminal resolver');
  };
  const signals: string[] = [];
  const receipts: unknown[] = [];
  const transitions: unknown[][] = [];
  const calls: unknown[][] = [];
  let state = 'R';
  const child = {
    pid: fault === 'invalid-pid' ? 0 : fault === 'self-pid' ? 42 : 73,
    signalCode: null as string | null,
    exited: new Promise<number>((resolve, reject) => {
      release = resolve;
      rejectExit = reject;
    }),
    kill(signal: string): void {
      signals.push(signal);
      if (signal === 'SIGSTOP') {
        if (fault === 'stop-throws') throw observationFailure;
        state = fault === 'stop-deadline' ? 'R' : 'T';
        if (fault === 'natural-exit') release(0);
        if (fault === 'exit-rejected')
          queueMicrotask(() => {
            rejectExit(observationFailure);
          });
      } else if (signal === 'SIGKILL') {
        kills++;
        if (fault === 'terminal-pending') return;
        if (fault === 'rescue-throws') throw rescueFailure;
        if (fault === 'kill-throws' && kills === 1) throw observationFailure;
        child.signalCode = fault === 'signal' ? 'SIGTERM' : 'SIGKILL';
        release(fault === 'exit-zero' ? 0 : 137);
      } else throw new Error('Unexpected signal');
    },
  };
  const command = [
    '/root/.puni/tools/restic-0.19.1',
    '--no-cache',
    'restore',
    expected.snapshotId + ':' + expected.registryPath,
    '--target',
    expected.targetRegistryPath,
    '--verify',
  ];
  if (fault === 'target') command[5] = '/other-target';
  if (fault === 'flags') command[6] = '--other';
  if (fault === 'journal-first') {
    command[3] = expected.snapshotId + ':' + expected.journalPath;
    command[5] = expected.targetJournalPath;
  }
  if (fault === 'backup') command[2] = 'backup';
  const options = {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe', 3],
    env: { RESTIC_PASSWORD_FILE: 'private-modeled' },
  };
  const spawn = (...args: unknown[]) => {
    calls.push(args);
    return child;
  };
  const runtime = {
    spawn,
    sleep: () => {
      sleeps++;
      if (sleeps > 3) throw new Error('Explicit modeled stop-loop rescue');
      return Promise.resolve();
    },
  };
  const current = {
    ...expected,
    state: consumed ? 'consumed' : 'armed',
    dev: 1,
    ino: 2,
    serialized: 'owned-record',
    ...(consumed
      ? {
          terminal: {
            worker: 99,
            pid: 100,
            startTicks: '999',
            group: 99,
            exitCode: 137,
            signal: 'SIGKILL',
          },
        }
      : {}),
  };
  const read = (path: string) => {
    if (path === '/proc/1/cmdline' && fault === 'topology') return Promise.resolve('untrusted');
    if (path === '/proc/1/cmdline')
      return Promise.resolve(
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-restore-kill\0',
      );
    if (path === '/proc/73/stat') {
      if (fault === 'proc-absent' || fault === 'proc-unreadable')
        throw Object.assign(observationFailure, {
          code: fault === 'proc-absent' ? 'ENOENT' : 'EACCES',
        });
      if (fault === 'rescue-throws') throw observationFailure;
      reads++;
      const fields = Array<string>(20).fill('0');
      fields[0] = fault === 'state-change' && reads > 1 ? 'R' : state;
      fields[1] = fault === 'parent' ? '99' : '42';
      fields[2] = fault === 'child-group' ? '73' : '42';
      fields[19] =
        fault === 'invalid-start' ? '0' : fault === 'start-change' && reads > 1 ? '9999' : '1234';
      return Promise.resolve(
        (fault === 'wrong-stat-pid' ? '74' : '73') +
          ' (restic) ' +
          fields.join(' ') +
          (fault === 'stat-bound' ? ' '.repeat(65537) : ''),
      );
    }
    if (path === '/proc/73/cmdline')
      return Promise.resolve(fault === 'command' ? 'changed\0' : command.join('\0') + '\0');
    if (path === '/proc/73/status')
      return Promise.resolve(
        'Uid:\t' +
          Array<string>(4)
            .fill(fault === 'child-uid' ? '59001' : '0')
            .join('\t') +
          '\nGid:\t' +
          Array<string>(4)
            .fill(fault === 'child-gid' ? '59001' : '0')
            .join('\t') +
          '\n' +
          (fault === 'status-bound' ? ' '.repeat(65537) : ''),
      );
    throw new Error('Unexpected owned proc read');
  };
  // Boundary: locally extracted fixture TypeScript with explicit modeled ports; no externally supplied code.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const compile = new Function(
    'Bun',
    'process',
    'readFile',
    'readlink',
    'appendFile',
    'inspectRegistryRestoreFault',
    'consumeRegistryRestoreFault',
    'Date',
    'setTimeout',
    body,
  ) as (
    ...ports: unknown[]
  ) => (input: { run: () => Promise<string>; current: () => typeof expected }) => Promise<string>;
  const interrupt = compile(
    runtime,
    {
      pid: 42,
      getuid: () => (fault === 'uid' ? 59001 : 0),
      getgid: () => (fault === 'gid' ? 59001 : 0),
    },
    read,
    (path: string) => {
      if (path !== '/proc/73/exe') throw new Error('Unexpected executable read');
      return Promise.resolve(fault === 'executable' ? '/different-executable' : command[0]);
    },
    (_path: string, serialized: string) => {
      if (fault === 'report') throw observationFailure;
      receipts.push(JSON.parse(serialized));
      return Promise.resolve();
    },
    (lineage: unknown) => {
      inspections++;
      expect(lineage).toEqual(expected);
      if (fault === 'missing-state' || fault === 'unreadable-state') throw observationFailure;
      return current;
    },
    (...args: unknown[]) => {
      transitions.push(args);
      if (fault === 'consume') throw observationFailure;
      current.state = 'consumed';
    },
    { now: () => (fault === 'stop-deadline' ? (clock += 500) : Date.now()) },
    (callback: () => void, delay: number) =>
      setTimeout(callback, fault === 'terminal-pending' ? 5 : delay),
  );
  const execute = async () => {
    expect(runtime.spawn(command, options)).toBe(child);
    if (fault === 'duplicate') runtime.spawn(command, options);
    if (consumed || fault === 'backup') release(0);
    await child.exited;
    if (fault === 'dispatch-success' || fault === 'backup') return 'other-action';
    if (!consumed) throw failure;
    const journalCommand = [...command];
    journalCommand[3] = expected.snapshotId + ':' + expected.journalPath;
    journalCommand[5] = expected.targetJournalPath;
    expect(runtime.spawn(journalCommand, options)).toBe(child);
    return 'restored';
  };
  return {
    expected,
    failure,
    observationFailure,
    rescueFailure,
    signals,
    receipts,
    transitions,
    calls,
    command,
    options,
    current,
    inspections: () => inspections,
    restored: () => runtime.spawn === spawn,
    run: async () => {
      const rescue = setTimeout(() => {
        release(0);
      }, 50);
      try {
        return await interrupt({
          run: execute,
          current: () => {
            if (fault === 'lineage') throw observationFailure;
            return expected;
          },
        });
      } finally {
        clearTimeout(rescue);
        release(0);
      }
    },
  };
}

test('kills only the exact worker member then consumes its armed state and preserves dispatch failure', async () => {
  const proof = await createFixture();
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(cause).toBe(proof.failure);
  expect(proof.calls[0]?.[0]).toBe(proof.command);
  expect(proof.calls[0]?.[1]).toBe(proof.options);
  expect(proof.transitions).toHaveLength(1);
  expect(proof.transitions[0]?.[0]).toEqual(proof.expected);
  expect(proof.transitions[0]?.[2]).toEqual({
    worker: 42,
    pid: 73,
    startTicks: '1234',
    group: 42,
    exitCode: 137,
    signal: 'SIGKILL',
  });
  expect(proof.receipts).toEqual([
    {
      restoreInterruption: {
        worker: 42,
        pid: 73,
        startTicks: '1234',
        group: 42,
        exitCode: 137,
        signal: 'SIGKILL',
      },
    },
  ]);
  expect(proof.restored()).toBe(true);
});

test('validated consumed state forwards both actual restore calls for a fresh worker', async () => {
  const proof = await createFixture(true);
  const outcome = await proof.run().then(
    (receipt) => ({ ok: true, receipt }),
    (cause: unknown) => ({ ok: false, cause }),
  );
  expect(outcome).toEqual({ ok: true, receipt: 'restored' });
  expect(proof.calls).toHaveLength(2);
  expect(proof.signals).toEqual([]);
  expect(proof.transitions).toEqual([]);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});

for (const fault of [
  'uid',
  'gid',
  'topology',
  'lineage',
  'target',
  'flags',
  'journal-first',
  'missing-state',
  'unreadable-state',
] as const)
  test('refuses restore capture before spawn ' + fault, async () => {
    const proof = await createFixture(false, fault);
    let cause: unknown;
    try {
      await proof.run();
    } catch (failure) {
      cause = failure;
    }
    expect(proof.calls).toEqual([]);
    expect(proof.signals).toEqual([]);
    expect(proof.transitions).toEqual([]);
    expect(proof.receipts).toEqual([]);
    expect(cause).toBeInstanceOf(Error);
    expect(proof.restored()).toBe(true);
  });
for (const fault of ['invalid-pid', 'self-pid'] as const)
  test('refuses invalid member without signals ' + fault, async () => {
    const proof = await createFixture(false, fault);
    let cause: unknown;
    try {
      await proof.run();
    } catch (failure) {
      cause = failure;
    }
    expect(cause).toBeInstanceOf(Error);
    expect(proof.signals).toEqual([]);
    expect(proof.transitions).toEqual([]);
    expect(proof.restored()).toBe(true);
  });
for (const fault of [
  'parent',
  'child-group',
  'command',
  'executable',
  'child-uid',
  'child-gid',
  'start-change',
  'state-change',
  'stop-deadline',
  'natural-exit',
  'stop-throws',
  'kill-throws',
  'exit-zero',
  'signal',
  'terminal-pending',
  'stat-bound',
  'wrong-stat-pid',
  'invalid-start',
  'status-bound',
  'proc-absent',
  'proc-unreadable',
] as const)
  test('does not certify failed member observation ' + fault, async () => {
    const proof = await createFixture(false, fault);
    let cause: unknown;
    try {
      await proof.run();
    } catch (failure) {
      cause = failure;
    }
    expect(proof.transitions).toEqual([]);
    expect(proof.receipts).toEqual([]);
    expect(cause).toBeInstanceOf(Error);
    expect(proof.restored()).toBe(true);
    if (fault === 'stop-deadline') {
      expect(cause).toBeInstanceOf(AggregateError);
      if (!(cause instanceof AggregateError)) throw new Error('Expected bounded stop refusal');
      expect(cause.errors[1]).toEqual(
        expect.objectContaining({ message: 'Owned restore did not reach stopped state' }),
      );
    }
    if (fault === 'natural-exit') expect(proof.signals).toEqual(['SIGSTOP']);
    if (fault === 'terminal-pending')
      expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL', 'SIGKILL']);
  });
test('rejected member exit observation still rescues and retains its error', async () => {
  const proof = await createFixture(false, 'exit-rejected');
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(cause).toBe(proof.observationFailure);
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(proof.transitions).toEqual([]);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});
for (const fault of ['consume', 'report'] as const)
  test('required ' + fault + ' failure preserves original worker refusal', async () => {
    const proof = await createFixture(false, fault);
    let cause: unknown;
    try {
      await proof.run();
    } catch (failure) {
      cause = failure;
    }
    expect(proof.receipts).toEqual([]);
    expect(cause).toBeInstanceOf(AggregateError);
    if (!(cause instanceof AggregateError))
      throw new Error('Expected original and required observation failures');
    expect(cause.cause).toBe(proof.failure);
    expect(cause.errors).toEqual([proof.failure, proof.observationFailure]);
    expect(proof.restored()).toBe(true);
  });
test('killed restore cannot report successful dispatch', async () => {
  const proof = await createFixture(false, 'dispatch-success');
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(cause).toBeInstanceOf(Error);
  expect(cause).toEqual(
    expect.objectContaining({ message: 'Killed restore unexpectedly completed dispatch' }),
  );
  expect(proof.transitions).toHaveLength(1);
  expect(proof.receipts).toHaveLength(1);
  expect(proof.restored()).toBe(true);
});
test('second armed registry restore is refused before a second spawn', async () => {
  const proof = await createFixture(false, 'duplicate');
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(proof.calls).toHaveLength(1);
  expect(cause).toBeInstanceOf(Error);
  expect(proof.restored()).toBe(true);
});
test('unrelated backup passes through without consulting restore control state', async () => {
  const proof = await createFixture(false, 'backup');
  expect(await proof.run()).toBe('other-action');
  expect(proof.calls[0]?.[0]).toBe(proof.command);
  expect(proof.calls[0]?.[1]).toBe(proof.options);
  expect(proof.inspections()).toBe(0);
  expect(proof.signals).toEqual([]);
  expect(proof.transitions).toEqual([]);
  expect(proof.restored()).toBe(true);
});

test('rescue signal failure retains the original member observation failure', async () => {
  const proof = await createFixture(false, 'rescue-throws');
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(proof.transitions).toEqual([]);
  expect(proof.receipts).toEqual([]);
  expect(cause).toBeInstanceOf(AggregateError);
  if (!(cause instanceof AggregateError))
    throw new Error('Expected combined worker and capture failures');
  expect(cause.cause).toBe(proof.failure);
  const capture: unknown = cause.errors[1];
  expect(capture).toBeInstanceOf(AggregateError);
  if (!(capture instanceof AggregateError))
    throw new Error('Expected original observation and rescue failures');
  expect(capture.cause).toBe(proof.observationFailure);
  expect(capture.errors).toEqual([proof.observationFailure, proof.rescueFailure]);
  expect(proof.restored()).toBe(true);
});

test('consumed state still refuses a restore command targeting another store', async () => {
  const proof = await createFixture(true, 'target');
  let cause: unknown;
  try {
    await proof.run();
  } catch (failure) {
    cause = failure;
  }
  expect(proof.calls).toEqual([]);
  expect(proof.signals).toEqual([]);
  expect(cause).toBeInstanceOf(Error);
  expect(proof.restored()).toBe(true);
});
