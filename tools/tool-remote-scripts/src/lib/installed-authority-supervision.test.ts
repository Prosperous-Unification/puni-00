import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { joinAuthoritySupervisor } from './installed-authority-supervision';
import { AUTHORITY_SUPERVISOR } from './installed-authority-supervisor';
import { observeSolverProcess } from './solver-host';

async function request() {
  const names = [
    'prod-swap',
    'prod-smoke',
    'dev-swap',
    'dev-smoke',
    'dev-poller',
    'dev-loader',
    'dev-interpreter',
    'declared-manual-launcher',
    'declared-bootstrap',
    'declared-configure',
    'shared-launch-authority',
    'shared-restart-authority',
  ];
  const fixed = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  return {
    nonce: 'a'.repeat(64),
    writerManifestSha256: 'b'.repeat(64),
    coordinator: await observeSolverProcess(process.pid),
    databases: [],
    layouts: ['prod', 'dev'],
    writerPaths: names.map((member, index) => ({
      member,
      path: fixed[index] ?? '/fixture/' + member,
    })),
  };
}
function exists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}
test.each([
  'normal',
  'child',
  'grandchild',
  'setsid',
  'term-ignored',
  'saturation',
  'worker-exit',
] as const)(
  'real finite supervisor joins and cleans %s descendants',
  async (fault) => {
    const root = scratchSync('authority-supervisor-');
    const pidPath = root + '/pids';
    await writeFile(pidPath, '');
    const worker = String.raw`
def fixture_worker(request,host):
    fault=${JSON.stringify(fault)}
    if fault=='normal':return {'observed':'fresh'}
    if fault=='saturation':os.write(1,b' '*(33*1024*1024));return {}
    pid=os.fork()
    if pid==0:
        if fault in ['grandchild','setsid']:
            if fault=='setsid':os.setsid()
            grandchild=os.fork()
            if grandchild!=0:os._exit(0)
        if fault=='term-ignored':signal.signal(signal.SIGTERM,signal.SIG_IGN)
        with open(${JSON.stringify(pidPath)},'a') as stream:stream.write(str(os.getpid())+'\n');stream.flush()
        time.sleep(30);os._exit(0)
    time.sleep(0.1)
    if fault=='worker-exit':os._exit(3)
    return {'observed':'worker-ended'}
supervisor_entry(fixture_worker)
`;
    const child = spawn(
      '/usr/bin/python3',
      ['-I', '-c', AUTHORITY_COLLECTOR + '\n' + AUTHORITY_SUPERVISOR + '\n' + worker],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const inputs = await request();
    let refusal = '';
    let output = '';
    try {
      output = await joinAuthoritySupervisor(child, inputs, inputs.nonce, performance.now() + 2000);
    } catch (error) {
      refusal = String(error);
    }
    if (fault === 'normal') {
      expect(refusal).toBe('');
      expect(JSON.parse(output)).toEqual({ observed: 'fresh' });
    } else expect(refusal).toContain('complete descendant cleanup');
    const pids = (await readFile(pidPath, 'utf8')).trim().split('\n').filter(Boolean).map(Number);
    if (!['normal', 'saturation'].includes(fault)) expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) expect(exists(pid)).toBe(false);
  },
  5000,
);

test.each([
  'before-fork',
  'after-fork',
  'closed-control',
  'supervisor-death',
  'partial-ack',
] as const)(
  'real supervisor %s keeps cleanup refusal explicit and unrelated processes alive',
  async (fault) => {
    const root = scratchSync('authority-cancel-');
    const pidPath = root + '/pid';
    await writeFile(pidPath, '');
    const controller = new AbortController();
    if (fault === 'before-fork') controller.abort();
    const worker = String.raw`
def fixture_worker(request,host):
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    with open(${JSON.stringify(pidPath)},'w') as stream:stream.write(str(os.getpid()));stream.flush()
    time.sleep(30)
    return {}
`;
    const killReady = String.raw`
original_write=os.write
def kill_after_ready(descriptor,contents):
    count=original_write(descriptor,contents)
    if descriptor==1 and b'ready' in contents:os.kill(os.getpid(),signal.SIGKILL)
    return count
os.write=kill_after_ready
`;
    const program =
      AUTHORITY_COLLECTOR +
      '\n' +
      AUTHORITY_SUPERVISOR +
      '\n' +
      worker +
      (fault === 'supervisor-death' ? killReady : '') +
      (fault === 'partial-ack'
        ? 'os.write(1,bytes([123,34,112]));os._exit(1)'
        : '\nsupervisor_entry(fixture_worker)\n');
    const child = spawn('/usr/bin/python3', ['-I', '-c', program], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const unrelated = spawn('/usr/bin/python3', ['-I', '-c', 'import time;time.sleep(30)'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const inputs = await request();
    const joined = joinAuthoritySupervisor(
      child,
      inputs,
      inputs.nonce,
      performance.now() + 2000,
      controller.signal,
    );
    if (fault === 'after-fork' || fault === 'closed-control') {
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await readFile(pidPath, 'utf8')).length > 0) break;
        await Bun.sleep(5);
      }
      if (fault === 'closed-control') child.stdin.end();
      else controller.abort();
    }
    let refusal = '';
    try {
      await joined;
    } catch (error) {
      refusal = String(error);
    }
    try {
      expect(refusal).toContain(
        ['supervisor-death', 'partial-ack'].includes(fault)
          ? 'cleanup unknown'
          : 'complete descendant cleanup',
      );
      const recorded = (await readFile(pidPath, 'utf8')).trim();
      if (recorded !== '') expect(exists(Number(recorded))).toBe(false);
      if (unrelated.pid === undefined) throw new Error('unrelated fixture failed to launch');
      expect(exists(unrelated.pid)).toBe(true);
    } finally {
      unrelated.kill('SIGKILL');
      await new Promise<void>((resolve) =>
        unrelated.once('close', () => {
          resolve();
        }),
      );
    }
  },
  5000,
);

test.each(['coordinator-death', 'cleanup-gate', 'missing-echild'] as const)(
  'finite supervisor requires %s convergence',
  async (fault) => {
    const root = scratchSync('authority-converge-');
    const pidPath = root + '/pid';
    await writeFile(pidPath, '');
    const worker = String.raw`
def fixture_worker(request,host):
    with open(${JSON.stringify(pidPath)},'w') as stream:stream.write(str(os.getpid()));stream.flush()
    if ${JSON.stringify(fault)}=='missing-echild':return {}
    signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(30);return {}
`;
    const gate = String.raw`
opened_at=time.monotonic()+0.4
original_signal=signal.pidfd_send_signal;original_group=os.killpg
signal.pidfd_send_signal=lambda *args:original_signal(*args) if time.monotonic()>=opened_at else None
os.killpg=lambda *args:original_group(*args) if time.monotonic()>=opened_at else None
`;
    const absent = String.raw`
original_wait=os.waitpid
def missing_echild(*args):
    try:return original_wait(*args)
    except ChildProcessError:return 0,0
os.waitpid=missing_echild
`;
    const program =
      AUTHORITY_COLLECTOR +
      '\n' +
      AUTHORITY_SUPERVISOR +
      '\n' +
      worker +
      (fault === 'cleanup-gate' ? gate : fault === 'missing-echild' ? absent : '') +
      '\nsupervisor_entry(fixture_worker)\n';
    const child = spawn('/usr/bin/python3', ['-I', '-c', program], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const coordinator = spawn('/usr/bin/python3', ['-I', '-c', 'import time;time.sleep(30)'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (coordinator.pid === undefined) throw new Error('coordinator fixture not spawned');
    const inputs = await request();
    if (fault === 'coordinator-death')
      inputs.coordinator = await observeSolverProcess(coordinator.pid);
    const abort = new AbortController();
    const started = performance.now();
    const joined = joinAuthoritySupervisor(
      child,
      inputs,
      inputs.nonce,
      performance.now() + (fault === 'missing-echild' ? 450 : 2000),
      abort.signal,
    );
    if (fault !== 'missing-echild') {
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await readFile(pidPath, 'utf8')).length > 0) break;
        await Bun.sleep(5);
      }
      if (fault === 'coordinator-death') {
        coordinator.kill('SIGKILL');
        await new Promise<void>((resolve) =>
          coordinator.once('close', () => {
            resolve();
          }),
        );
      } else abort.abort();
    }
    let refusal = '';
    try {
      await joined;
    } catch (error) {
      refusal = String(error);
    }
    try {
      expect(refusal).toContain(
        fault === 'missing-echild' ? 'cleanup unknown' : 'complete descendant cleanup',
      );
      if (fault === 'cleanup-gate') expect(performance.now() - started).toBeGreaterThan(300);
      const pid = Number(await readFile(pidPath, 'utf8'));
      expect(exists(pid)).toBe(false);
    } finally {
      if (fault !== 'coordinator-death') {
        coordinator.kill('SIGKILL');
        await new Promise<void>((resolve) =>
          coordinator.once('close', () => {
            resolve();
          }),
        );
      }
    }
  },
  5000,
);

test.each(['subreaper-unavailable', 'retained-pipe'] as const)(
  'supervisor refuses %s without a clean terminal acknowledgement',
  async (fault) => {
    const worker = '\ndef fixture_worker(request,host):return {}\n';
    const unavailable = String.raw`
from types import SimpleNamespace
ctypes.CDLL=lambda *args,**kwargs:SimpleNamespace(prctl=lambda *arguments:-1)
`;
    const pipe = String.raw`
original_pipe=os.pipe;original_close=os.close;write_ends=set()
def retained_pipe():
    reading,writing=original_pipe();write_ends.add(writing);return reading,writing
def retained_close(descriptor):
    if descriptor not in write_ends:original_close(descriptor)
os.pipe=retained_pipe;os.close=retained_close
`;
    const child = spawn(
      '/usr/bin/python3',
      [
        '-I',
        '-c',
        AUTHORITY_COLLECTOR +
          '\n' +
          AUTHORITY_SUPERVISOR +
          worker +
          (fault === 'subreaper-unavailable' ? unavailable : pipe) +
          '\nsupervisor_entry(fixture_worker)\n',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const inputs = await request();
    let refusal = '';
    try {
      await joinAuthoritySupervisor(child, inputs, inputs.nonce, performance.now() + 500);
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal).toContain('cleanup unknown');
  },
  5000,
);

test('a retained pidfd refuses an exited identity and leaves a replacement process alive', async () => {
  const program = String.raw`
import os,signal,subprocess
first=subprocess.Popen(['/bin/sleep','30']);descriptor=os.pidfd_open(first.pid)
first.kill();first.wait()
replacement=subprocess.Popen(['/bin/sleep','30'])
try:
    try:signal.pidfd_send_signal(descriptor,signal.SIGKILL,None,0)
    except ProcessLookupError:pass
    else:raise AssertionError('recycled an exited pidfd identity')
    assert replacement.poll() is None
finally:os.close(descriptor);replacement.kill();replacement.wait()
print('ok')
`;
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stdout).toBe('ok\n');
  expect(stderr).toBe('');
});
