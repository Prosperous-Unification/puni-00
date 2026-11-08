import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectRecoveryLab,
  killRecoveryPid1,
  type RecoveryCommandRunner,
  verifyRecoveryCleanup,
} from './forge-recovery-lab';
import { runRecoveryCommand } from './forge-recovery-process';

interface FixtureWorld {
  readonly resources: Record<string, string>;
  readonly calls: string[][];
  readonly killed?: boolean;
}
async function expectRefusal(operation: Promise<unknown>, message: string): Promise<void> {
  const failure = await operation.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain(message);
}

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) {
    try {
      const pid = Number(await readFile(join(path, 'parent-pid'), 'utf8'));
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (failure) {
        if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH'))
          throw failure;
      }
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT'))
        throw failure;
    }
    await rm(path, { recursive: true, force: true });
  }
});

async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'forge-recovery-boundary-'));
  directories.push(path);
  return path;
}

test('hard deadline kills a real TERM-ignoring process and its descendant', async () => {
  const path = await directory();
  await writeFile(
    join(path, 'stubborn.ts'),
    `process.on('SIGTERM', () => { void Bun.write('${path}/term-seen','yes'); }); await Bun.write('${path}/parent-pid', String(process.pid)); const child = Bun.spawn(['bash','-c','trap "" TERM; while :; do sleep 1; done'],{stdout:'ignore',stderr:'ignore'}); await Bun.write('${path}/child-pid', String(child.pid)); await Bun.write('${path}/ready','yes'); setInterval(()=>{},1000);`,
  );
  const started = Date.now();
  const invocation = runRecoveryCommand({
    command: ['bun', join(path, 'stubborn.ts')],
    cwd: path,
    environment: process.env,
    stdout: join(path, 'stdout'),
    stderr: join(path, 'stderr'),
    timeoutMs: 500,
  });
  const readyDeadline = Date.now() + 300;
  while (!(await Bun.file(join(path, 'ready')).exists()) && Date.now() < readyDeadline)
    await Bun.sleep(5);
  const parent = Number(await readFile(join(path, 'parent-pid'), 'utf8'));
  process.kill(parent, 'SIGTERM');
  await Bun.sleep(20);
  expect(await readFile(join(path, 'term-seen'), 'utf8')).toBe('yes');
  process.kill(parent, 0);
  const receipt = await invocation;
  expect(receipt.timedOut).toBe(true);
  expect(receipt.exitCode).not.toBe(0);
  expect(await readFile(join(path, 'ready'), 'utf8')).toBe('yes');
  const pid = Number(await readFile(join(path, 'child-pid'), 'utf8'));
  await expectStopped(pid);
  expect(Date.now() - started).toBeLessThan(1800);
}, 3000);

async function fixture() {
  const path = await directory();
  const statePath = join(path, 'world.json');
  await writeFile(
    statePath,
    JSON.stringify({
      resources: { container: '', network: '', volume: '' },
      calls: [],
      inspect: { status: { labels: { 'io.kubernetes.pod.uid': 'owned' } }, info: { pid: 42 } },
      proc: 'Name:\tsource\nNSpid:\t42\t1\n',
      namespace: '',
      leases: { items: [] },
      race: false,
    }),
  );
  await writeFile(
    join(path, 'command.ts'),
    `
const statePath = process.argv[2]; const command = JSON.parse(process.argv[3]);
const world = await Bun.file(statePath).json(); world.calls.push(command);
let output = '';
if(command[0] === 'docker' && command[1] === 'exec') {
 if(command[3] === 'crictl') output=JSON.stringify(world.inspect);
 else if(command[3] === 'cat') output=world.proc;
 else if(command[3] === 'kill') world.killed=true;
 else throw new Error('unexpected Docker command');
} else if(command[0] === 'docker') {
 const kind=command[1]; output=world.resources[kind];
 if(kind==='volume' && world.race) world.resources['network']='raced-network';
} else if(command[0] === 'kubectl') {
 if(command.includes('namespace')) output=world.namespace;
 else if(command.includes('leases')) output=JSON.stringify(world.leases);
 else throw new Error('unexpected kubectl');
} else throw new Error('unexpected command');
await Bun.write(statePath, JSON.stringify(world)); console.log(output);
`,
  );
  const read = async (): Promise<FixtureWorld> => {
    const snapshot: unknown = await Bun.file(statePath).json();
    return snapshot as FixtureWorld;
  };
  const change = async (fields: Record<string, unknown>) => {
    const world = await read();
    await writeFile(statePath, JSON.stringify({ ...world, ...fields }));
  };
  const command: RecoveryCommandRunner = async (arguments_, name) => {
    const receipt = await runRecoveryCommand({
      command: ['bun', join(path, 'command.ts'), statePath, JSON.stringify(arguments_)],
      cwd: path,
      environment: process.env,
      stdout: join(path, `${name}.stdout`),
      stderr: join(path, `${name}.stderr`),
      timeoutMs: 2000,
    });
    if (receipt.exitCode !== 0 || receipt.timedOut)
      throw new Error(`fixture command refused ${name}: ${receipt.output}`);
    return receipt.output.trim();
  };
  const kubeGlobal = join(path, 'global.kubeconfig');
  await writeFile(kubeGlobal, 'original');
  const cleanup = {
    lab: 'owned',
    namespace: 'puni-forge-alpha',
    kubeconfig: '/owned/kubeconfig',
    context: 'owned-context',
    statePath: join(path, 'lab'),
    kubeGlobal,
    kubeBefore: createHash('sha256').update('original').digest('hex'),
  };
  return { path, read, change, command, cleanup };
}

for (const kind of ['container', 'network', 'volume'] as const) {
  test(`refuses pre-existing labelled ${kind} without up or down`, async () => {
    const boundary = await fixture();
    await boundary.change({
      resources: { container: '', network: '', volume: '', [kind]: 'foreign' },
    });
    await expectRefusal(inspectRecoveryLab(boundary.command, 'owned'), 'already has resources');
    const world = await boundary.read();
    expect(world.resources[kind]).toBe('foreign');
    expect(
      world.calls.some((command: string[]) => command.includes('up') || command.includes('down')),
    ).toBe(false);
  });
}

test('disabled provisioner preserves a resource appearing after inventory', async () => {
  const boundary = await fixture();
  await boundary.change({ race: true });
  await inspectRecoveryLab(boundary.command, 'owned');
  const receipt = await runRecoveryCommand({
    command: ['bun', join(import.meta.dir, 'forge-recovery-lab.ts'), '--lab', 'owned'],
    cwd: boundary.path,
    environment: process.env,
    stdout: join(boundary.path, 'cli.stdout'),
    stderr: join(boundary.path, 'cli.stderr'),
    timeoutMs: 2000,
  });
  expect(receipt.exitCode).not.toBe(0);
  expect(receipt.output).toContain('creation receipts');
  const world = await boundary.read();
  expect(world.resources['network']).toBe('raced-network');
  expect(
    world.calls.some((command: string[]) => command.includes('up') || command.includes('down')),
  ).toBe(false);
});

for (const [label, fields, message] of [
  [
    'foreign UID',
    { inspect: { status: { labels: { 'io.kubernetes.pod.uid': 'foreign' } }, info: { pid: 42 } } },
    'foreign UID',
  ],
  [
    'node PID one',
    { inspect: { status: { labels: { 'io.kubernetes.pod.uid': 'owned' } }, info: { pid: 1 } } },
    'greater than one',
  ],
  [
    'node PID zero',
    { inspect: { status: { labels: { 'io.kubernetes.pod.uid': 'owned' } }, info: { pid: 0 } } },
    'greater than one',
  ],
  ['non PID1', { proc: 'NSpid:\t42\t2\n' }, 'not container PID1'],
] as const) {
  test(`refuses ${label} at the command boundary before kill`, async () => {
    const boundary = await fixture();
    await boundary.change(fields);
    await expectRefusal(
      killRecoveryPid1(boundary.command, 'owned-node', {
        uid: 'owned',
        container: 'containerd://abcdef',
        restarts: 0,
        ready: true,
        oom: false,
      }),
      message,
    );
    expect((await boundary.read()).killed).toBeUndefined();
  });
}

test('valid owned node PID1 reaches the real command boundary kill', async () => {
  const boundary = await fixture();
  await killRecoveryPid1(boundary.command, 'owned-node', {
    uid: 'owned',
    container: 'containerd://abcdef',
    restarts: 0,
    ready: true,
    oom: false,
  });
  expect((await boundary.read()).killed).toBe(true);
});

for (const [label, fields, message] of [
  ['namespace', { namespace: 'namespace/puni-forge-alpha' }, 'namespace remains'],
  ['Lease', { leases: { items: [{ metadata: { name: 'owned' } }] } }, 'Leases remain'],
  [
    'container',
    { resources: { container: 'survivor', network: '', volume: '' } },
    'container remains',
  ],
  ['network', { resources: { container: '', network: 'survivor', volume: '' } }, 'network remains'],
  ['volume', { resources: { container: '', network: '', volume: 'survivor' } }, 'volume remains'],
] as const) {
  test(`surviving ${label} fails cleanup while every later verification still runs`, async () => {
    const boundary = await fixture();
    await boundary.change(fields);
    await expectRefusal(verifyRecoveryCleanup(boundary.command, boundary.cleanup), message);
    const world = await boundary.read();
    expect(world.calls.some((command: string[]) => command.includes('leases'))).toBe(true);
    for (const kind of ['container', 'network', 'volume'])
      expect(
        world.calls.some((command: string[]) => command[0] === 'docker' && command[1] === kind),
      ).toBe(true);
  });
}

test('global kubeconfig mutation fails cleanup', async () => {
  const boundary = await fixture();
  await writeFile(boundary.cleanup.kubeGlobal, 'mutated');
  await expectRefusal(
    verifyRecoveryCleanup(boundary.command, boundary.cleanup),
    'global kubeconfig changed',
  );
});

test('absent owned resources and unchanged kubeconfig pass cleanup verification', async () => {
  const boundary = await fixture();
  await verifyRecoveryCleanup(boundary.command, boundary.cleanup);
});

test('surviving lab state fails cleanup after every resource probe', async () => {
  const boundary = await fixture();
  await mkdir(boundary.cleanup.statePath);
  await writeFile(join(boundary.cleanup.statePath, 'lab.json'), '{}');
  await expectRefusal(
    verifyRecoveryCleanup(boundary.command, boundary.cleanup),
    'lab state remains',
  );
  expect(
    (await boundary.read()).calls.filter((command: string[]) => command[0] === 'docker'),
  ).toHaveLength(3);
});

async function isStopped(readStatus: () => Promise<string>): Promise<boolean> {
  try {
    return /\) [ZX] /.test(await readStatus());
  } catch (failure) {
    // Proof: injected ESRCH failed the disappearance regression before this branch; EACCES/EIO still reject.
    if (
      failure instanceof Error &&
      'code' in failure &&
      (failure.code === 'ENOENT' || failure.code === 'ESRCH')
    )
      return true;
    throw failure;
  }
}

async function expectStopped(pid: number): Promise<void> {
  const stopped = () => isStopped(() => readFile(`/proc/${String(pid)}/stat`, 'utf8'));
  const deadline = Date.now() + 300;
  while (!(await stopped()) && Date.now() < deadline) await Bun.sleep(5);
  // Proof: direct-child-only SIGKILL leaves the descendant running and fails this bounded assertion.
  expect(await stopped()).toBe(true);
}

for (const code of ['ENOENT', 'ESRCH']) {
  test(`stopped descendant oracle accepts process disappearance ${code}`, async () => {
    expect(await isStopped(() => Promise.reject(Object.assign(new Error(code), { code })))).toBe(
      true,
    );
  });
}

test('stopped descendant oracle preserves unreadable and failed status reads', async () => {
  for (const code of ['EACCES', 'EIO']) {
    const failure = Object.assign(new Error(code), { code });
    const observed = await isStopped(() => Promise.reject(failure)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(observed).toBe(failure);
  }
  expect(await isStopped(() => Promise.resolve('1 (child) S 0'))).toBe(false);
  expect(await isStopped(() => Promise.resolve('1 (child) Z 0'))).toBe(true);
});

test('terminates local descendants when a command exits before its deadline', async () => {
  const path = await directory();
  await writeFile(
    join(path, 'early.ts'),
    `await Bun.write('${path}/parent-pid',String(process.pid)); const child=Bun.spawn(['bash','-c','trap "" TERM; while :; do sleep 1; done'],{stdout:'ignore',stderr:'ignore'}); await Bun.write('${path}/child-pid',String(child.pid)); process.exit(0);`,
  );
  const receipt = await runRecoveryCommand({
    command: ['bun', join(path, 'early.ts')],
    cwd: path,
    environment: process.env,
    stdout: join(path, 'stdout'),
    stderr: join(path, 'stderr'),
    timeoutMs: 500,
  });
  expect(receipt.exitCode).toBe(0);
  expect(receipt.timedOut).toBe(false);
  const pid = Number(await readFile(join(path, 'child-pid'), 'utf8'));
  await expectStopped(pid);
});

for (const timeoutMs of [0, -1, Infinity, NaN]) {
  test(`refuses unbounded or nonpositive deadline ${String(timeoutMs)}`, async () => {
    const path = await directory();
    await expectRefusal(
      runRecoveryCommand({
        command: ['bun', '-e', 'throw new Error("must not execute")'],
        cwd: path,
        environment: process.env,
        stdout: join(path, 'stdout'),
        stderr: join(path, 'stderr'),
        timeoutMs,
      }),
      'positive command deadline',
    );
    expect(await Bun.file(join(path, 'stdout')).exists()).toBe(false);
  });
}

test('unreadable lab state fails cleanup and later kubeconfig verification still runs', async () => {
  const boundary = await fixture();
  await mkdir(boundary.cleanup.statePath);
  await writeFile(join(boundary.cleanup.statePath, 'lab.json'), '{}');
  await writeFile(boundary.cleanup.kubeGlobal, 'mutated');
  await chmod(boundary.cleanup.statePath, 0o000);
  try {
    const fault = await lstat(join(boundary.cleanup.statePath, 'lab.json')).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(fault).toBeInstanceOf(Error);
    expect(String(fault)).toContain('EACCES');
    const failure = await verifyRecoveryCleanup(boundary.command, boundary.cleanup).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('EACCES');
    expect(String(failure)).toContain('global kubeconfig changed');
  } finally {
    await chmod(boundary.cleanup.statePath, 0o700);
  }
});
