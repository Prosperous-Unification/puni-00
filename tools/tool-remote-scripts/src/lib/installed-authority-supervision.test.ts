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
    solver: null,
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
    if fault=='setsid':
        worker_pid=os.getpid();worker_group=os.getpgrp()
        acknowledgement=list(os.pipe())
        def close_acknowledgement(index):
            if acknowledgement[index]>=0:os.close(acknowledgement[index]);acknowledgement[index]=-1
        def publish_participant(role):
            record={'role':role,'pid':os.getpid(),'pgid':os.getpgrp(),'sid':os.getsid(0),'workerPid':worker_pid,'workerPgid':worker_group}
            contents=(json.dumps(record)+'\n').encode()
            require(len(contents)<=512,'fixture participant record oversized')
            descriptor=os.open(${JSON.stringify(pidPath)},os.O_WRONLY|os.O_APPEND)
            try:require(os.write(descriptor,contents)==len(contents),'fixture participant record incomplete')
            finally:os.close(descriptor)
        # Proof: neutralizing only this block under genuine pending supervisor TERM
        # lost participation (>0 got0); restoring it published both roles and cleaned them.
        prior_mask=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM})
        try:pid=os.fork()
        except BaseException:
            signal.pthread_sigmask(signal.SIG_SETMASK,prior_mask)
            close_acknowledgement(0);close_acknowledgement(1)
            raise
        if pid!=0:
            signal.pthread_sigmask(signal.SIG_SETMASK,prior_mask)
            close_acknowledgement(0);close_acknowledgement(1)
            time.sleep(0.1)
            return {'observed':'worker-ended'}
        try:
            os.setsid()
            grandchild=os.fork()
            if grandchild==0:
                try:
                    close_acknowledgement(0)
                    publish_participant('grandchild')
                    require(os.write(acknowledgement[1],b'R')==1,'fixture participation acknowledgement incomplete')
                finally:
                    try:close_acknowledgement(1)
                    finally:signal.pthread_sigmask(signal.SIG_SETMASK,prior_mask)
                time.sleep(30);os._exit(0)
            close_acknowledgement(1)
            publish_participant('leader')
            remaining=host.deadline-time.monotonic()
            require(remaining>0,'fixture participation deadline exceeded')
            ready,_,_=select.select([acknowledgement[0]],[],[],remaining)
            require(ready and os.read(acknowledgement[0],1)==b'R','fixture grandchild participation absent')
        finally:
            try:close_acknowledgement(0);close_acknowledgement(1)
            finally:signal.pthread_sigmask(signal.SIG_SETMASK,prior_mask)
        os._exit(0)
    pid=os.fork()
    if pid==0:
        if fault=='grandchild':
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
    const lines = (await readFile(pidPath, 'utf8')).trim().split('\n').filter(Boolean);
    const participants =
      fault === 'setsid'
        ? lines.map(
            (line) =>
              JSON.parse(line) as {
                role: string;
                pid: number;
                pgid: number;
                sid: number;
                workerPid: number;
                workerPgid: number;
              },
          )
        : [];
    const pids = fault === 'setsid' ? participants.map(({ pid }) => pid) : lines.map(Number);
    if (!['normal', 'saturation'].includes(fault)) expect(pids.length).toBeGreaterThan(0);
    if (fault === 'setsid') {
      expect(participants).toHaveLength(2);
      expect(participants.map(({ role }) => role).sort()).toEqual(['grandchild', 'leader']);
      const leader = participants.find(({ role }) => role === 'leader');
      const grandchild = participants.find(({ role }) => role === 'grandchild');
      if (leader === undefined || grandchild === undefined)
        throw new Error('setsid fixture participation absent');
      for (const participant of participants) {
        expect(Object.keys(participant).sort()).toEqual([
          'pgid',
          'pid',
          'role',
          'sid',
          'workerPgid',
          'workerPid',
        ]);
        for (const identity of [
          participant.pid,
          participant.pgid,
          participant.sid,
          participant.workerPid,
          participant.workerPgid,
        ]) {
          expect(Number.isSafeInteger(identity)).toBe(true);
          expect(identity).toBeGreaterThan(0);
        }
        expect(participant.workerPid).toBe(participant.workerPgid);
        expect(participant.workerPid).toBe(leader.workerPid);
        expect(participant.pgid).not.toBe(participant.workerPgid);
      }
      expect(leader.sid).toBe(leader.pid);
      expect(leader.pgid).toBe(leader.pid);
      expect(grandchild.sid).toBe(leader.pid);
      expect(grandchild.pgid).toBe(leader.pid);
      expect(grandchild.pid).not.toBe(leader.pid);
    }
    for (const pid of pids) expect(exists(pid)).toBe(false);
    if (fault === 'setsid')
      console.log(
        JSON.stringify({ fixture: 'setsid-participation', participants, cleanup: 'complete' }),
      );
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

test.each(['wrong-coordinator', 'cleanup-gate', 'missing-echild'] as const)(
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
    if (fault === 'wrong-coordinator')
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
    if (fault !== 'missing-echild' && fault !== 'wrong-coordinator') {
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await readFile(pidPath, 'utf8')).length > 0) break;
        await Bun.sleep(5);
      }
      abort.abort();
    }
    let refusal = '';
    try {
      await joined;
    } catch (error) {
      refusal = String(error);
    }
    try {
      expect(refusal).toContain(
        fault === 'missing-echild' || fault === 'wrong-coordinator'
          ? 'cleanup unknown'
          : 'complete descendant cleanup',
      );
      if (fault === 'cleanup-gate') expect(performance.now() - started).toBeGreaterThan(300);
      const recorded = await readFile(pidPath, 'utf8');
      if (fault === 'wrong-coordinator') expect(recorded).toBe('');
      else expect(exists(Number(recorded))).toBe(false);
    } finally {
      {
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

test.each([
  'exact',
  'wrong-invocation',
  'wrong-executable',
  'wrong-start',
  'wrong-cgroup',
  'identity-drift',
  'ended-internal',
] as const)(
  'native sudo-shaped transport enforces %s and rejects same-executable outsiders',
  async (fault) => {
    const launcher =
      'import subprocess,sys;child=subprocess.Popen(sys.argv[2:]);raise SystemExit(child.wait())';
    const fixedExecutable = "TRANSPORT_EXECUTABLE='/usr/bin/sudo'";
    const fixedPrefix = "TRANSPORT_PREFIX=['/usr/bin/sudo','-n']";
    if (
      !AUTHORITY_SUPERVISOR.includes(fixedExecutable) ||
      !AUTHORITY_SUPERVISOR.includes(fixedPrefix)
    )
      throw new Error('fixture rejected changed fixed transport fragments');
    let supervisor = AUTHORITY_SUPERVISOR.replace(
      fixedExecutable,
      "TRANSPORT_EXECUTABLE='/usr/bin/python3'",
    ).replace(
      fixedPrefix,
      'TRANSPORT_PREFIX=' + JSON.stringify(['/usr/bin/python3', '-I', '-c', launcher, '-n']),
    );
    if (fault === 'wrong-invocation')
      supervisor = supervisor.replace('TRANSPORT_PREFIX=', "TRANSPORT_PREFIX= ['unexpected']+");
    if (fault === 'wrong-executable')
      supervisor = supervisor.replace(
        "TRANSPORT_EXECUTABLE='/usr/bin/python3'",
        "TRANSPORT_EXECUTABLE='/bin/sleep'",
      );
    if (fault === 'wrong-start' || fault === 'wrong-cgroup')
      supervisor += `\noriginal_bind=bind_transport\ndef bind_transport(request,transport,host):\n    transport=dict(transport)\n    transport[${JSON.stringify(fault === 'wrong-start' ? 'startTime' : 'cgroup')}]=${JSON.stringify(fault === 'wrong-start' ? '0' : '/foreign/transport')}\n    return original_bind(request,transport,host)\n`;
    const worker = String.raw`
def fixture_worker(request,host):
    known=validate_request(request);seen=[];host.fd_count=0
    if ${JSON.stringify(fault)}=='ended-internal':
        ended=subprocess.Popen(['/usr/bin/python3','-I','-c','import time;time.sleep(30)'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        host.internal_processes[ended.pid]=capture_internal_process(host,ended.pid)['identity']
        ended.kill();ended.wait();assert_internal_processes(host);return {'seen':[]}
    if ${JSON.stringify(fault)}=='identity-drift':
        for pid in host.internal_processes:
            if pid not in [os.getpid(),os.getppid()]:host.internal_processes[pid]['argvSha256']='0'*64
    for pid in sorted(host.internal_processes):
        observed,openers,relevant=observe_process(host,pid,[],known,request['coordinator'])
        require(relevant and not openers,'native exact transport identity was not observed');seen.append(pid)
    outsider=subprocess.Popen(['/usr/bin/python3','-I','-c','import time;time.sleep(30)',os.readlink('/proc/self/exe'),str(known)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        try:observe_process(host,outsider.pid,[],known,request['coordinator'])
        except Refusal:pass
        else:raise AssertionError('blanket-exempted same-executable outsider')
    finally:outsider.kill();outsider.wait()
    return {'seen':seen}
supervisor_entry(fixture_worker)
`;
    const program = AUTHORITY_COLLECTOR + '\n' + supervisor + '\n' + worker;
    const child = spawn(
      '/usr/bin/python3',
      ['-I', '-c', launcher, '-n', '/usr/bin/python3', '-I', '-c', program],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const inputs = await request();
    let output = '';
    let refusal = '';
    try {
      output = await joinAuthoritySupervisor(child, inputs, inputs.nonce, performance.now() + 3000);
    } catch (error) {
      refusal = String(error);
    }
    if (fault !== 'exact') {
      expect(refusal).toContain(
        fault === 'identity-drift' || fault === 'ended-internal'
          ? 'complete descendant cleanup'
          : 'cleanup unknown',
      );
      return;
    }
    expect(refusal).toBe('');
    const observed: unknown = JSON.parse(output);
    if (
      observed === null ||
      typeof observed !== 'object' ||
      !('seen' in observed) ||
      !Array.isArray(observed.seen)
    )
      throw new Error('native transport fixture inventory missing');
    expect(observed.seen).toHaveLength(3);
    expect(observed.seen).toContain(child.pid);
  },
  5000,
);

test('native coordinator death cleans the bound supervisor worker and is fully reaped by its scratch parent', async () => {
  const root = scratchSync('authority-native-coordinator-');
  const pidPath = root + '/pids';
  const worker = String.raw`
def fixture_worker(request,host):
    with open(${JSON.stringify(pidPath)},'w') as stream:json.dump(list(host.internal_processes),stream);stream.flush()
    time.sleep(30);return {}
supervisor_entry(fixture_worker)
`;
  const program = AUTHORITY_COLLECTOR + '\n' + AUTHORITY_SUPERVISOR + '\n' + worker;
  const inputs = await request();
  const harness = `import {spawn} from 'node:child_process';import {joinAuthoritySupervisor} from ${JSON.stringify(import.meta.dir + '/installed-authority-supervision.ts')};import {observeSolverProcess} from ${JSON.stringify(import.meta.dir + '/solver-host.ts')};const request=${JSON.stringify(inputs)};request.coordinator=await observeSolverProcess(process.pid);const child=spawn('/usr/bin/python3',['-I','-c',${JSON.stringify(program)}],{stdio:['pipe','pipe','pipe']});await joinAuthoritySupervisor(child,request,request.nonce,performance.now()+3500);`;
  const driver = String.raw`
import ctypes,os,subprocess,time,json,signal
libc=ctypes.CDLL(None);assert libc.prctl(36,1,0,0,0)==0
coordinator=subprocess.Popen([${JSON.stringify(process.execPath)},'-e',${JSON.stringify(harness)}],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    deadline=time.monotonic()+3
    while not os.path.exists(${JSON.stringify(pidPath)}):
        assert coordinator.poll() is None and time.monotonic()<deadline
        time.sleep(0.01)
    with open(${JSON.stringify(pidPath)}) as stream:pids=json.load(stream)
    coordinator.kill();coordinator.wait()
    deadline=time.monotonic()+4
    while True:
        try:pid,status=os.waitpid(-1,os.WNOHANG)
        except ChildProcessError:break
        assert time.monotonic()<deadline
        if pid==0:time.sleep(0.01)
    assert all(not os.path.exists('/proc/'+str(pid)) for pid in pids)
finally:
    if coordinator.poll() is None:coordinator.kill()
    coordinator.wait()
print('ok')
`;
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', driver], {
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
}, 8000);
