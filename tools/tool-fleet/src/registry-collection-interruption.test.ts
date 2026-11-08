import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Extracted actual fixture entrypoint; process/files/native spawn are modeled, with an explicit terminal rescue so missing injection never waits for the test-runner deadline. */
type Fault =
  | 'none'
  | 'uid'
  | 'action'
  | 'topology'
  | 'configuration'
  | 'missing-child'
  | 'stop-throws'
  | 'dead-child'
  | 'parent'
  | 'group'
  | 'start-change'
  | 'command'
  | 'executable'
  | 'child-uid'
  | 'child-gid'
  | 'kill-throws'
  | 'exit-code'
  | 'signal'
  | 'group-live'
  | 'group-unreadable'
  | 'group-non-error'
  | 'report'
  | 'dispatch-success'
  | 'exit-rejected'
  | 'rescue-throws'
  | 'void-signals'
  | 'invalid-pid'
  | 'duplicate'
  | 'oversized-stat'
  | 'oversized-status'
  | 'wrong-stat-pid'
  | 'start-invalid'
  | 'state-change'
  | 'natural-exit'
  | 'stop-deadline'
  | 'read-absent'
  | 'read-unreadable'
  | 'terminal-pending';

async function createFixture(fault: Fault = 'none') {
  const source = await readFile(
    new URL('./registry-collection-interruption.fixture.ts', import.meta.url),
    'utf8',
  );
  const marker = 'export async function interruptRegistryCollectionFixture';
  if (source.split(marker).length !== 2)
    throw new Error('Expected one fixed GC fixture entrypoint');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    source.slice(source.indexOf(marker)).replace('export ', '') +
      '\nreturn interruptRegistryCollectionFixture;',
  );
  const failure = new Error('modeled production nonzero child refusal');
  const terminalFailure = new Error('Owned exit observation rejected');
  let rejectExit: (cause: Error) => void = () => {
    throw new Error('Missing exit rejection port');
  };
  const signals: string[] = [];
  const receipts: unknown[] = [];
  let settle: (code: number) => void = () => {
    throw new Error('Missing modeled child resolver');
  };
  let state = 'R';
  let statReads = 0;
  let kills = 0;
  let terminal = false;
  const exited = new Promise<number>((resolve, reject) => {
    settle = resolve;
    rejectExit = reject;
  });
  const child = {
    pid: fault === 'invalid-pid' ? 0 : 123,
    exitCode: null as number | null,
    signalCode: null as string | null,
    exited,
    kill(signal: string): void {
      signals.push(signal);
      if (signal === 'SIGSTOP') {
        if (fault === 'stop-throws') throw new Error('Modeled SIGSTOP failure');
        state = fault === 'dead-child' ? 'Z' : fault === 'stop-deadline' ? 'R' : 'T';
        if (fault === 'natural-exit') {
          terminal = true;
          settle(0);
        }
        if (fault === 'exit-rejected')
          queueMicrotask(() => {
            rejectExit(terminalFailure);
          });
      } else if (signal === 'SIGKILL') {
        kills += 1;
        if (fault === 'terminal-pending') return;
        if (fault === 'kill-throws' && kills === 1) throw new Error('Modeled SIGKILL failure');
        if (fault === 'rescue-throws') {
          terminal = true;
          settle(137);
          throw new Error('Modeled rescue signal failure');
        }
        terminal = true;
        state = 'Z';
        child.signalCode = fault === 'signal' ? null : signal;
        settle(fault === 'exit-code' ? 0 : 137);
      } else throw new Error('Unexpected modeled signal');
      return;
    },
  };
  const command = [
    '/opt/registry',
    'garbage-collect',
    fault === 'configuration' ? '/other-config' : '/config',
  ];
  const options = { uid: 59001, gid: 59001, detached: true, stdio: ['ignore', 'pipe', 'pipe', 3] };
  const calls: unknown[][] = [];
  const spawn = (...args: unknown[]) => {
    calls.push(args);
    return child;
  };
  let sleeps = 0;
  const runtime = {
    spawn,
    sleep: () => {
      sleeps += 1;
      if (sleeps > 3) throw new Error('Explicit modeled stop-loop rescue');
      return Promise.resolve();
    },
  };
  const execute = async () => {
    if (fault === 'missing-child') throw failure;
    expect(runtime.spawn(command, options)).toBe(child);
    if (fault === 'duplicate') runtime.spawn(command, options);
    await child.exited;
    if (fault === 'dispatch-success') return 'verified';
    throw failure;
  };
  const observe = (path: string) => {
    if (path === '/proc/123/stat' && (fault === 'read-absent' || fault === 'read-unreadable'))
      throw Object.assign(new Error('Required proc read failed'), {
        code: fault === 'read-absent' ? 'ENOENT' : 'EACCES',
      });
    if (path === '/proc/1/cmdline' && fault === 'topology') return Promise.resolve('untrusted');
    if (path === '/proc/1/cmdline')
      return Promise.resolve(
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-gc-kill\0',
      );
    if (path === '/proc/123/cmdline')
      return Promise.resolve(fault === 'command' ? 'other\0' : command.join('\0') + '\0');
    if (path === '/proc/123/status')
      return Promise.resolve(
        'Uid:\t' +
          Array<string>(4)
            .fill(fault === 'child-uid' || fault === 'rescue-throws' ? '0' : '59001')
            .join('\t') +
          '\nGid:\t' +
          Array<string>(4)
            .fill(fault === 'child-gid' ? '0' : '59001')
            .join('\t') +
          '\n' +
          (fault === 'oversized-status' ? ' '.repeat(65536) : ''),
      );
    if (path === '/proc/123/stat') {
      statReads += 1;
      return Promise.resolve(
        (fault === 'wrong-stat-pid' ? '124 (registry) ' : '123 (registry) ') +
          [
            fault === 'state-change' && statReads > 1 ? 'S' : state,
            fault === 'parent' ? '99' : '42',
            fault === 'group' ? '99' : '123',
            ...Array<string>(16).fill('0'),
            fault === 'start-invalid'
              ? 'bad'
              : fault === 'start-change' && statReads > 1
                ? '901'
                : '900',
          ].join(' ') +
          (fault === 'oversized-stat' ? ' '.repeat(65536) : ''),
      );
    }
    throw new Error('Unexpected modeled read');
  };
  const processPort = {
    pid: 42,
    getuid: () => (fault === 'uid' ? 59001 : 0),
    kill: (pid: number, signal: number) => {
      expect(pid).toBe(-123);
      expect(signal).toBe(0);
      if (!terminal) throw new Error('Group remains live');
      if (fault === 'group-live') return true;
      if (fault === 'group-unreadable')
        throw Object.assign(new Error('Denied group observation'), { code: 'EPERM' });
      // Boundary: an untrusted errno-shaped rejection must not certify absence.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (fault === 'group-non-error') throw { code: 'ESRCH' };
      throw Object.assign(new Error('Absent owned group'), { code: 'ESRCH' });
    },
  };
  // Boundary: the uniquely extracted TypeScript function is compiled locally; all filesystem and native effects are supplied by the modeled ports above.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const compile = new Function(
    'executeRegistryHostAction',
    'Bun',
    'process',
    'readFile',
    'readlink',
    'appendFile',
    'Date',
    'setTimeout',
    body,
  ) as (...ports: unknown[]) => (input: unknown) => Promise<string>;
  let clock = 0;
  const requestedTimers: number[] = [];
  const interrupt = compile(
    execute,
    runtime,
    processPort,
    observe,
    (path: string) => {
      expect(path).toBe('/proc/123/exe');
      return Promise.resolve(fault === 'executable' ? '/other/registry' : '/opt/registry');
    },
    (_path: string, text: string) => {
      if (fault === 'report') throw new Error('Required receipt write failed');
      const receipt: unknown = JSON.parse(text);
      receipts.push(receipt);
      return Promise.resolve();
    },
    fault === 'stop-deadline'
      ? {
          now: () => {
            clock += 1000;
            return clock;
          },
        }
      : Date,
    (callback: () => void, delay: number) => {
      requestedTimers.push(delay);
      return setTimeout(callback, fault === 'terminal-pending' ? 5 : delay);
    },
  );
  return {
    signals,
    receipts,
    calls,
    command,
    options,
    failure,
    terminalFailure,
    requestedTimers,
    restored: () => runtime.spawn === spawn,
    async run() {
      const rescue = setTimeout(() => {
        terminal = true;
        settle(0);
      }, 50);
      try {
        return await interrupt({
          installed: {
            distribution: { path: '/opt/registry' },
            deletionConfiguration: { path: '/config' },
          },
          request: { action: fault === 'action' ? 'inspect' : 'collect' },
        });
      } finally {
        clearTimeout(rescue);
      }
    },
  };
}

test('GC interruption signals only its returned child, observes terminal and preserves dispatch failure', async () => {
  const proof = await createFixture();
  await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => {
      expect(cause).toBe(proof.failure);
    },
  );
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(proof.calls).toHaveLength(1);
  expect(proof.calls[0]?.[0]).toBe(proof.command);
  expect(proof.calls[0]?.[1]).toBe(proof.options);
  expect(proof.restored()).toBe(true);
  expect(proof.receipts).toEqual([
    {
      collectionInterruption: {
        pid: 123,
        startTicks: '900',
        group: 123,
        exitCode: 137,
        signal: 'SIGKILL',
        groupAbsent: true,
      },
    },
  ]);
});

for (const fault of ['uid', 'action', 'topology'] as const)
  test('GC interruption rejects forbidden ' + fault + ' before effects', async () => {
    const proof = await createFixture(fault);
    await proof.run().then(
      () => {
        throw new Error('Unexpected fixture success');
      },
      (cause: unknown) => {
        expect(proof.calls).toEqual([]);
        expect(proof.signals).toEqual([]);
        expect(proof.receipts).toEqual([]);
        expect(cause).toBeInstanceOf(Error);
        if (!(cause instanceof Error)) throw new Error('Expected topology refusal');
        expect(cause.message).toBe('Collection interruption requires exact private fixture');
      },
    );
    expect(proof.calls).toEqual([]);
    expect(proof.signals).toEqual([]);
    expect(proof.receipts).toEqual([]);
    expect(proof.restored()).toBe(true);
  });

for (const [fault, message] of [
  ['configuration', 'Collection interruption refuses another GC command'],
  ['oversized-stat', 'Malformed owned GC process identity'],
  ['wrong-stat-pid', 'Malformed owned GC process identity'],
  ['start-invalid', 'Owned GC process lineage differs'],
  ['oversized-status', 'Stopped GC executable or credentials differ'],
  ['state-change', 'Stopped GC identity changed before kill'],
  ['natural-exit', 'Stopped GC identity changed before kill'],
  ['stop-deadline', 'Owned GC did not reach stopped state'],
  ['read-absent', 'Required proc read failed'],
  ['read-unreadable', 'Required proc read failed'],
  ['missing-child', 'No actual GC interruption was observed'],
  ['stop-throws', 'Modeled SIGSTOP failure'],
  ['dead-child', 'Owned GC did not reach stopped state'],
  ['parent', 'Owned GC process lineage differs'],
  ['group', 'Owned GC process lineage differs'],
  ['start-change', 'Stopped GC identity changed before kill'],
  ['command', 'Stopped GC executable or credentials differ'],
  ['executable', 'Stopped GC executable or credentials differ'],
  ['child-uid', 'Stopped GC executable or credentials differ'],
  ['child-gid', 'Stopped GC executable or credentials differ'],
  ['kill-throws', 'Modeled SIGKILL failure'],
  ['exit-code', 'Owned GC did not terminate by SIGKILL'],
  ['signal', 'Owned GC did not terminate by SIGKILL'],
  ['group-live', 'Interrupted GC group cleanup is unconfirmed'],
  ['group-unreadable', 'Denied group observation'],
  ['report', 'Required receipt write failed'],
] as const)
  test('GC interruption refuses ' + fault + ' without certifying a kill', async () => {
    const proof = await createFixture(fault);
    const failure: unknown = await proof.run().then(
      () => {
        throw new Error('Unexpected fixture success');
      },
      (cause: unknown) => cause,
    );
    expect(proof.receipts).toEqual([]);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError))
      throw new Error('Expected preserved dispatch and observation failures');
    expect(
      failure.errors.some((cause: unknown) => cause instanceof Error && cause.message === message),
    ).toBe(true);
    if (fault !== 'configuration') expect(failure.errors).toContain(proof.failure);
    expect(proof.receipts).toEqual([]);
    expect(proof.restored()).toBe(true);
  });

test('non-Error ESRCH cannot certify GC group absence', async () => {
  const proof = await createFixture('group-non-error');
  const failure: unknown = await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => cause,
  );
  expect(proof.receipts).toEqual([]);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Expected preserved failures');
  expect(failure.errors).toContain(proof.failure);
  expect(failure.errors).toContainEqual({ code: 'ESRCH' });
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});

test('effective GC kill cannot authorize a successful dispatch', async () => {
  const proof = await createFixture('dispatch-success');
  await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => {
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw new Error('Expected dispatch-success refusal');
      expect(cause.message).toBe('Killed GC unexpectedly completed dispatch');
    },
  );
  expect(proof.receipts).toHaveLength(1);
  expect(proof.restored()).toBe(true);
});

test('rejected exit observation cannot suppress exact child rescue or replace its cause', async () => {
  const proof = await createFixture('exit-rejected');
  const failure: unknown = await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => cause,
  );
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(failure).toBe(proof.terminalFailure);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});

test('thrown rescue signal remains an explicit cleanup failure with original dispatch cause', async () => {
  const proof = await createFixture('rescue-throws');
  const failure: unknown = await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError))
    throw new Error('Expected original and cleanup failures');
  expect(failure.errors).toContain(proof.failure);
  const observation: unknown = failure.errors[1];
  expect(observation).toBeInstanceOf(AggregateError);
  if (!(observation instanceof AggregateError)) throw new Error('Expected explicit rescue failure');
  expect(observation.errors).toEqual([
    expect.objectContaining({ message: 'Stopped GC executable or credentials differ' }),
    expect.objectContaining({ message: 'Modeled rescue signal failure' }),
  ]);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});

test('Bun void signal returns still require actual stopped and SIGKILL terminal evidence', async () => {
  const proof = await createFixture('void-signals');
  await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => {
      expect(cause).toBe(proof.failure);
    },
  );
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL']);
  expect(proof.receipts).toHaveLength(1);
  expect(proof.restored()).toBe(true);
});

test('invalid returned PID cannot authorize any signal', async () => {
  const proof = await createFixture('invalid-pid');
  const failure: unknown = await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(proof.signals).toEqual([]);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});

test('second GC request is rejected before another native spawn', async () => {
  const proof = await createFixture('duplicate');
  await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => {
      expect(proof.calls).toHaveLength(1);
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw new Error('Expected duplicate-command refusal');
      expect(cause.message).toBe('Collection interruption refuses another GC command');
    },
  );
  expect(proof.calls).toHaveLength(1);
  expect(proof.receipts).toHaveLength(1);
  expect(proof.restored()).toBe(true);
});

test('pending exit observation reaches the bounded terminal refusal before modeled rescue', async () => {
  const proof = await createFixture('terminal-pending');
  const failure: unknown = await proof.run().then(
    () => {
      throw new Error('Unexpected fixture success');
    },
    (cause: unknown) => cause,
  );
  expect(proof.signals).toEqual(['SIGSTOP', 'SIGKILL', 'SIGKILL']);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError))
    throw new Error('Expected dispatch and terminal observation failures');
  expect(failure.errors).toContain(proof.failure);
  expect(failure.errors).toContainEqual(
    expect.objectContaining({ message: 'Owned GC terminal observation timed out' }),
  );
  expect(proof.requestedTimers).toEqual([5000]);
  expect(proof.receipts).toEqual([]);
  expect(proof.restored()).toBe(true);
});
