import { readFile } from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import { completeRegistryServingChild } from './registry-serving-cli.fixture';

const children: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'signalCode' | 'kill' | 'exited'>[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await child.exited;
  }
});

const spawn = (script: string): Bun.Subprocess<'ignore', 'pipe', 'pipe'> => {
  const child = Bun.spawn([process.execPath, '-e', script], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  children.push(child);
  return child;
};

test('serving CLI observes real terminal and both output pipes', async () => {
  const child = spawn('process.stdout.write("reply");process.stderr.write("diagnostic");');
  expect(await completeRegistryServingChild(child, AbortSignal.timeout(5000))).toEqual({
    stdout: 'reply',
    stderr: 'diagnostic',
  });
  expect(child.exitCode).toBe(0);
});

test('serving CLI rejects actual nonzero exit despite valid JSON output', async () => {
  const child = spawn('process.stdout.write("{}");process.exitCode=42;');
  const observed = await completeRegistryServingChild(child, AbortSignal.timeout(5000)).then(
    () => ({ state: 'fulfilled' as const }),
    (cause: unknown) => ({ state: 'rejected' as const, cause }),
  );
  expect(observed).toMatchObject({
    state: 'rejected',
    cause: { message: 'Fixed maintenance child failed (exit 42)' },
  });
  expect(child.exitCode).toBe(42);
});

for (const stream of ['stdout', 'stderr'] as const)
  test('serving CLI bounds real ' + stream + ' and closes the owned group', async () => {
    const bytes = stream === 'stdout' ? 2 * 1024 ** 2 + 1 : 65537;
    const child = spawn(
      'await Bun.' +
        stream +
        '.write(new Uint8Array(' +
        String(bytes) +
        '));await Bun.sleep(10000);',
    );
    const started = performance.now();
    const outcome = await completeRegistryServingChild(child, AbortSignal.timeout(5000)).then(
      () => 'fulfilled',
      () => 'rejected',
    );
    expect(outcome).toBe('rejected');
    expect(performance.now() - started).toBeLessThan(4000);
    expect(await child.exited).toBe(137);
    expect(child.signalCode).toBe('SIGKILL');
    expect(() => process.kill(-child.pid, 0)).toThrow();
  });

test('serving CLI cancellation waits for actual child termination', async () => {
  const child = spawn('process.stdout.write("started");await Bun.sleep(10000);');
  const outcome = await completeRegistryServingChild(child, AbortSignal.timeout(50)).then(
    () => 'fulfilled',
    () => 'rejected',
  );
  expect(outcome).toBe('rejected');
  expect(await child.exited).toBe(137);
  expect(child.signalCode).toBe('SIGKILL');
  expect(() => process.kill(-child.pid, 0)).toThrow();
});

for (const selected of ['stdout', 'stderr'] as const)
  test('serving CLI retains sole late ' + selected + ' failure after native success', async () => {
    const child = spawn('');
    const failure = new Error('modeled late pipe failure');
    const broken = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        await Bun.sleep(100);
        controller.error(failure);
      },
    });
    const observation = {
      pid: child.pid,
      exitCode: child.exitCode,
      exited: child.exited,
      stdout: selected === 'stdout' ? broken : child.stdout,
      stderr: selected === 'stderr' ? broken : child.stderr,
    };
    let observed: unknown;
    try {
      await completeRegistryServingChild(observation, AbortSignal.timeout(5000));
    } catch (cause) {
      observed = cause;
    }
    // An errored native ReadableStream also rejects cancel; readRegistryBytes preserves both.
    expect(observed).toBeInstanceOf(AggregateError);
    if (!(observed instanceof AggregateError)) throw new Error('Missing pipe failure');
    expect(observed.errors).toEqual([failure, failure]);
    expect(observed.cause).toBe(failure);

    expect(await child.exited).toBe(0);
  });

test('serving CLI preserves terminal and both failing pipe outcomes in order', async () => {
  const child = spawn('await Bun.sleep(10000);');
  const outputFailure = new Error('modeled output pipe failure');
  const errorFailure = new Error('modeled error pipe failure');
  const broken = (failure: Error) =>
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.error(failure);
      },
    });
  let observed: unknown;
  try {
    await completeRegistryServingChild(
      {
        pid: child.pid,
        exitCode: child.exitCode,
        exited: child.exited,
        stdout: broken(outputFailure),
        stderr: broken(errorFailure),
      },
      AbortSignal.timeout(5000),
    );
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBeInstanceOf(AggregateError);
  if (!(observed instanceof AggregateError)) throw new Error('Missing completion aggregate');
  expect(observed.errors).toHaveLength(3);
  const [terminal, stdout, stderr] = observed.errors as unknown[];
  expect(terminal).toBe(stdout);
  expect(observed.cause).toBe(terminal);
  for (const [wrapped, failure] of [
    [stdout, outputFailure],
    [stderr, errorFailure],
  ]) {
    expect(wrapped).toBeInstanceOf(AggregateError);
    if (!(wrapped instanceof AggregateError)) throw new Error('Missing wrapped pipe failure');
    expect(wrapped.errors).toEqual([failure, failure]);
    expect(wrapped.cause).toBe(failure);
  }
  expect(await child.exited).toBe(137);
  expect(() => process.kill(-child.pid, 0)).toThrow();
});

for (const [action, name, arguments_, stdin, deadline] of [
  ['status', 'status.js', [], '', 10000],
  ['backup', 'backup.js', [], '', 90000],
  [
    'reopen',
    'journal-cli.js',
    ['/var/lib/puni-registry/journal/contents'],
    '{"command":"reopen","expectedRevision":17,"operationId":"native-serving-reopen","owner":"operator"}',
    10000,
  ],
] as const)
  test('fixed serving CLI executes only installed ' + action + ' protocol', async () => {
    const source = await readFile(
      new URL('./registry-serving-cli.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function runRegistryServingCli(');
    if (start < 0) throw new Error('Missing fixed serving runner');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('export async function', 'async function'),
    );
    const deadlines: number[] = [];
    // Boundary: execute the complete fixed runner; only setpriv/installed paths are replaced by a real local child that echoes the emitted argv/stdin/environment.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      'Bun',
      'completeRegistryServingChild',
      'setTimeout',
      'clearTimeout',
      body + ';return runRegistryServingCli;',
    ) as (...ports: unknown[]) => (request: unknown) => Promise<{ stdout: string; stderr: string }>;
    const run = invoke(
      {
        spawn: (
          argv: string[],
          options: {
            env: Record<string, string>;
            stdin: 'ignore' | Uint8Array;
            stdout: 'pipe';
            stderr: 'pipe';
            detached: boolean;
          },
        ) => {
          const script =
            'console.log(JSON.stringify({argv:JSON.parse(process.argv.at(-1)),stdin:await Bun.stdin.text(),env:{PATH:process.env.PATH,LANG:process.env.LANG}}));';
          const child = Bun.spawn(
            [process.execPath, '-e', script, '--', JSON.stringify(argv)],
            options,
          );
          children.push(child);
          return child;
        },
      },
      completeRegistryServingChild,
      (callback: () => void, milliseconds: number) => {
        deadlines.push(milliseconds);
        return setTimeout(callback, milliseconds);
      },
      clearTimeout,
    );
    const reply = await run({ action, ...(action === 'reopen' ? { revision: 17 } : {}) });
    expect(reply.stderr).toBe('');
    expect(JSON.parse(reply.stdout) as unknown).toEqual({
      argv: [
        '/usr/bin/setpriv',
        '--reuid=59001',
        '--regid=59001',
        '--clear-groups',
        '--',
        '/usr/local/libexec/puni-registry-authority/bun',
        '/usr/local/libexec/puni-registry-maintenance/' + name,
        ...arguments_,
      ],
      stdin,
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    });
    expect(deadlines).toEqual([deadline]);
  });
