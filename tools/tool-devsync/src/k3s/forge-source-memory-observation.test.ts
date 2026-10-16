import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { PodObservation } from './forge-recovery-check';
import { observeSourceMemory } from './forge-source-memory-observation';

async function refuseEvidence(
  observation: Promise<unknown>,
  inspectError?: (error: unknown) => boolean,
) {
  const outcome = await observation.then(
    (evidence) => ({ evidence }),
    (error: unknown) => {
      inspectError?.(error);
      return { rejected: true };
    },
  );
  expect(outcome).toEqual({ rejected: true });
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
});
const first: PodObservation = {
  uid: 'owned-pod',
  container: `containerd://${'a'.repeat(64)}`,
  restarts: 0,
  ready: false,
  oom: true,
};
const statText = (starttime = '1234') =>
  `42 (bun child) ${['S', '1', ...Array<string>(17).fill('0'), starttime].join(' ')}\n`;
const statusText = 'Pid:\t42\nPPid:\t1\nNSpid:\t42\t1\nVmRSS:\t1024 kB\nThreads:\t2\n';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'forge-source-observation-'));
  directories.push(directory);
  const cgroupRoot = join(directory, 'cgroup');
  const procRoot = join(directory, 'proc');
  const cgroup = join(cgroupRoot, 'source');
  const proc = join(procRoot, '42');
  await mkdir(cgroup, { recursive: true });
  await mkdir(proc, { recursive: true });
  const files = {
    [join(cgroup, 'cgroup.procs')]: '42\n',
    [join(cgroup, 'memory.current')]: '2048\n',
    [join(cgroup, 'memory.peak')]: '4096\n',
    [join(cgroup, 'memory.max')]: '2147483648\n',
    [join(cgroup, 'memory.events')]: 'oom 0\noom_kill 0\n',
    [join(proc, 'stat')]: statText(),
    [join(proc, 'status')]: statusText,
    [join(proc, 'cgroup')]: '0::/source\n',
    [join(proc, 'cmdline')]: 'bun\0/src/app.ts\0private-token-credential\0',
  };
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(path, text)));
  await symlink('/usr/bin/bun', join(proc, 'exe'));
  const inspection = {
    status: {
      id: first.container.slice(13),
      metadata: { name: 'source' },
      state: 'CONTAINER_RUNNING',
      labels: { 'io.kubernetes.pod.uid': first.uid },
    },
    info: { pid: 42, config: { envs: ['private-token-credential'] } },
    argv: ['private-token-credential'],
    acceptancePassed: true,
  };
  const plan = join(directory, 'plan.json');
  const executable = join(directory, 'crictl');
  await writeFile(
    executable,
    `#!${process.execPath}
import { readFile, writeFile, rename, cp, rm, symlink } from 'node:fs/promises';
const root = import.meta.dir;
const plan = JSON.parse(await readFile(root + '/plan.json', 'utf8'));
const count = Number(await readFile(root + '/count', 'utf8'));
await writeFile(root + '/count', String(count + 1));
await writeFile(root + '/runtime-pid', String(process.pid));
await writeFile(root + '/args-' + count, JSON.stringify(process.argv.slice(2)));
if (plan.mode === 'stall') await Bun.sleep(60000);
if (plan.mode === 'oversize') { console.log(JSON.stringify({...plan.before,pad:'x'.repeat(65537)})); process.exit(0); }
if (plan.mode === 'stderr-oversize') { process.stderr.write('private-token-credential'.repeat(5000)); console.log(JSON.stringify(plan.before)); process.exit(0); }
if (plan.mode === 'invalid-utf8') { process.stdout.write(Buffer.from([255])); process.exit(0); }
if (plan.mode === 'malformed') { console.log('private-token-credential {broken'); process.exit(0); }
if (plan.mode === 'exit') { console.error('private-token-credential'); process.exit(1); }
if (count === 1) {
 for (const [path, text] of Object.entries(plan.afterFiles ?? {})) await writeFile(path, text);
 if (plan.replaceCgroup) {
  await rename(root + '/cgroup/source', root + '/old-source');
  await cp(root + '/old-source', root + '/cgroup/source', {recursive:true});
 }
 if (plan.removeFile) await rm(plan.removeFile);
 if (plan.symlinkStatus) {
  await rename(root + '/proc/42/status', root + '/proc/42/status-saved');
  await symlink(root + '/proc/42/status-saved',root + '/proc/42/status');
 }
}
console.log(JSON.stringify(count === 0 ? plan.before : plan.after));
`,
    { mode: 0o700 },
  );
  await writeFile(join(directory, 'count'), '0');
  const configure = async (changes: Record<string, unknown> = {}) => {
    await writeFile(plan, JSON.stringify({ before: inspection, after: inspection, ...changes }));
  };
  await configure();
  const runtime = {
    executable,
    endpoint: 'unix:///run/containerd/containerd.sock',
    windowMs: 1500,
  };
  return {
    directory,
    cgroup,
    proc,
    inspection,
    configure,
    runtime,
    roots: { cgroupRoot, procRoot },
  };
}

test('discovers stable local source init and returns one sanitized validated sample', async () => {
  const { runtime, roots, directory } = await fixture();
  const evidence = await observeSourceMemory(first, runtime, roots);
  expect(evidence.source).toMatchObject({
    uid: first.uid,
    container: first.container,
    init: { pid: 42, starttime: '1234' },
    cgroup: '/source',
  });
  expect(evidence.samples).toHaveLength(1);
  expect(evidence.samples[0]?.memory.max).toBe('2147483648');
  expect(JSON.stringify(evidence)).not.toMatch(/private-token|argv|envs|acceptance|restored/);
  expect(JSON.parse(await readFile(join(directory, 'args-0'), 'utf8'))).toEqual([
    '--config',
    '/dev/null',
    '--runtime-endpoint',
    runtime.endpoint,
    '--timeout',
    '2s',
    'inspect',
    '--output',
    'json',
    first.container.slice(13),
  ]);
  expect(await readFile(join(directory, 'count'), 'utf8')).toBe('2');
});

for (const change of [
  { id: 'b'.repeat(64) },
  { id: 'aaaa' },
  { metadata: { name: 'other' } },
  { metadata: {} },
  { state: 'CONTAINER_EXITED' },
  { labels: { 'io.kubernetes.pod.uid': 'foreign' } },
])
  test(`refuses foreign or malformed runtime identity ${JSON.stringify(change)}`, async () => {
    const { runtime, roots, inspection, configure } = await fixture();
    await configure({ before: { ...inspection, status: { ...inspection.status, ...change } } });
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
for (const pid of [0, 1, -1, 1.5, '42', null])
  test(`refuses runtime init PID ${String(pid)}`, async () => {
    const { runtime, roots, inspection, configure } = await fixture();
    await configure({ before: { ...inspection, info: { pid } } });
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
for (const change of [
  { info: { pid: 43 } },
  { status: { state: 'CONTAINER_EXITED' } },
  { status: { metadata: { name: 'other' } } },
  { status: { id: 'b'.repeat(64) } },
  { status: { labels: { 'io.kubernetes.pod.uid': 'foreign' } } },
])
  test(`refuses second runtime inspection change ${JSON.stringify(change)}`, async () => {
    const { runtime, roots, inspection, configure } = await fixture();
    await configure({
      after: { ...inspection, ...change, status: { ...inspection.status, ...change.status } },
    });
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
for (const [file, text] of [
  ['stat', statText('5678')],
  ['status', statusText.replace('42\t1', '42\t2')],
  ['cgroup', '0::/source-sibling\n'],
])
  test(`refuses post-sample process identity change ${file}`, async () => {
    const { runtime, roots, proc, configure } = await fixture();
    await configure({ afterFiles: { [join(proc, file)]: text } });
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
test('refuses replacement cgroup directory with the same path and files', async () => {
  const { runtime, roots, configure } = await fixture();
  await configure({ replaceCgroup: true });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
for (const text of [
  '0::/../escape\n',
  '0::/\n',
  '1:memory:/source\n',
  '0::/source\n1:cpu:/source\n',
])
  test(`refuses invalid unified membership ${JSON.stringify(text)}`, async () => {
    const { runtime, roots, proc } = await fixture();
    await writeFile(join(proc, 'cgroup'), text);
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
for (const file of ['stat', 'status', 'cgroup'])
  test(`refuses absent and unreadable required init ${file}`, async () => {
    const { runtime, roots, proc } = await fixture();
    const path = join(proc, file);
    const saved = await readFile(path);
    await rm(path);
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
    await writeFile(path, saved, { mode: 0 });
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
    await chmod(path, 0o600);
  });
test('refuses non-PID1 init before sampling', async () => {
  const { runtime, roots, proc } = await fixture();
  await writeFile(join(proc, 'status'), statusText.replace('42\t1', '42\t2'));
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses oversized and symlink init state', async () => {
  const { runtime, roots, proc } = await fixture();
  await writeFile(join(proc, 'status'), 'x'.repeat(65537));
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
  await rm(join(proc, 'status'));
  await symlink(join(proc, 'stat'), join(proc, 'status'));
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
for (const mode of ['malformed', 'invalid-utf8', 'oversize', 'stderr-oversize', 'exit', 'stall'])
  test(`bounds and sanitizes runtime ${mode}`, async () => {
    const { runtime, roots, configure } = await fixture();
    await configure({ mode });
    const started = performance.now();
    await refuseEvidence(
      observeSourceMemory(first, { ...runtime, windowMs: 150 }, roots),
      (error) => {
        expect(String(error)).not.toMatch(/private-token|broken|xxxx|plan.json/);
        return true;
      },
    );
    expect(performance.now() - started).toBeLessThan(1500);
  });
for (const endpoint of [
  'tcp://host:1234',
  'ssh://host/run/containerd.sock',
  'unix://host/run/containerd.sock',
  'unix:///run/../docker.sock',
  'unix:///run/docker.sock',
  '',
])
  test(`refuses nonlocal or Docker endpoint ${endpoint}`, async () => {
    const { runtime, roots, directory } = await fixture();
    await refuseEvidence(observeSourceMemory(first, { ...runtime, endpoint }, roots));
    expect(await readFile(join(directory, 'count'), 'utf8')).toBe('0');
  });
for (const executable of ['/usr/bin/docker', '/usr/bin/ssh', 'crictl'])
  test(`refuses wrapper executable ${executable}`, async () => {
    const { runtime, roots, directory } = await fixture();
    await refuseEvidence(observeSourceMemory(first, { ...runtime, executable }, roots));
    expect(await readFile(join(directory, 'count'), 'utf8')).toBe('0');
  });
test('refuses non-2Gi sampler evidence', async () => {
  const { runtime, roots, cgroup } = await fixture();
  await writeFile(join(cgroup, 'memory.max'), 'max');
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses missing init after sampling', async () => {
  const { runtime, roots, proc, configure } = await fixture();
  await configure({ removeFile: join(proc, 'stat') });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
for (const windowMs of [0, -1, NaN, Infinity, 30001])
  test(`refuses invalid window ${String(windowMs)}`, async () => {
    const { runtime, roots, directory } = await fixture();
    await refuseEvidence(observeSourceMemory(first, { ...runtime, windowMs }, roots));
    expect(await readFile(join(directory, 'count'), 'utf8')).toBe('0');
  });
for (const change of [{ container: 'containerd://aaaa' }, { uid: '' }])
  test(`refuses malformed expected identity ${JSON.stringify(change)}`, async () => {
    const { runtime, roots, directory } = await fixture();
    await refuseEvidence(observeSourceMemory({ ...first, ...change }, runtime, roots));
    expect(await readFile(join(directory, 'count'), 'utf8')).toBe('0');
  });
test('refuses executable symlink resolving to a wrapper', async () => {
  const { runtime, roots, directory } = await fixture();
  await rm(runtime.executable);
  await symlink('/usr/bin/ssh', runtime.executable);
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
  expect(await readFile(join(directory, 'count'), 'utf8')).toBe('0');
});
for (const content of ['42 (bun) S 1', '43 (bun) S 1', 'malformed'])
  test(`refuses malformed init stat ${content}`, async () => {
    const { runtime, roots, proc } = await fixture();
    await writeFile(join(proc, 'stat'), content);
    await refuseEvidence(observeSourceMemory(first, runtime, roots));
  });
test('refuses malformed init status', async () => {
  const { runtime, roots, proc } = await fixture();
  await writeFile(join(proc, 'status'), statusText.replace('Pid:\t42', 'Pid:\t43'));
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses membership symlink escaping selected cgroup root', async () => {
  const { runtime, roots, cgroup, directory } = await fixture();
  const { rename } = await import('node:fs/promises');
  const foreign = join(directory, 'foreign');
  await rename(cgroup, foreign);
  await symlink(foreign, cgroup);
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses directory in place of required init file', async () => {
  const { runtime, roots, proc } = await fixture();
  await rm(join(proc, 'status'));
  await mkdir(join(proc, 'status'));
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses changed parent after sampling', async () => {
  const { runtime, roots, proc, configure } = await fixture();
  await configure({
    afterFiles: {
      [join(proc, 'stat')]: statText().replace(' S 1 ', ' S 2 '),
      [join(proc, 'status')]: statusText.replace('PPid:\t1', 'PPid:\t2'),
    },
  });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});

test('refuses oversized valid init status after sampling', async () => {
  const { runtime, roots, proc, configure } = await fixture();
  await configure({
    afterFiles: { [join(proc, 'status')]: statusText + 'Padding: ' + 'x'.repeat(65537) },
  });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('refuses symlink to valid init status after sampling', async () => {
  const { runtime, roots, configure } = await fixture();
  await configure({ symlinkStatus: true });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});
test('sanitizes filesystem failure containing credential path text', async () => {
  const { runtime, roots, directory } = await fixture();
  await refuseEvidence(
    observeSourceMemory(first, runtime, {
      ...roots,
      procRoot: join(directory, 'private-token-credential'),
    }),
    (error) => {
      expect(String(error)).not.toMatch(/private-token|ENOENT|forge-source-observation/);
      return true;
    },
  );
});
test('refuses runtime host PID1 even with otherwise consistent local files', async () => {
  const { runtime, roots, proc, cgroup, inspection, configure } = await fixture();
  const { rename } = await import('node:fs/promises');
  const init = join(roots.procRoot, '1');
  await rename(proc, init);
  await writeFile(join(init, 'stat'), statText().replace('42 (', '1 (').replace(' S 1 ', ' S 0 '));
  await writeFile(
    join(init, 'status'),
    statusText.replace('Pid:\t42', 'Pid:\t1').replace('PPid:\t1', 'PPid:\t0').replace('42\t1', '1'),
  );
  await writeFile(join(cgroup, 'cgroup.procs'), '1\n');
  const identity = { ...inspection, info: { pid: 1 } };
  await configure({ before: identity, after: identity });
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});

test('refuses otherwise working executable named docker', async () => {
  const { runtime, roots, directory } = await fixture();
  const { rename } = await import('node:fs/promises');
  const executable = join(directory, 'docker');
  await rename(runtime.executable, executable);
  await refuseEvidence(observeSourceMemory(first, { ...runtime, executable }, roots));
});
test('refuses otherwise working relative executable path', async () => {
  const { runtime, roots } = await fixture();
  await refuseEvidence(
    observeSourceMemory(
      first,
      { ...runtime, executable: relative(process.cwd(), runtime.executable) },
      roots,
    ),
  );
});
test('refuses missing required runtime executable without discovering a fallback', async () => {
  const { runtime, roots } = await fixture();
  await rm(runtime.executable);
  await refuseEvidence(observeSourceMemory(first, runtime, roots));
});

test('terminates the stalled local inspect child at deadline', async () => {
  const { runtime, roots, directory, configure } = await fixture();
  await configure({ mode: 'stall' });
  await refuseEvidence(observeSourceMemory(first, { ...runtime, windowMs: 150 }, roots));
  const pid = Number(await readFile(join(directory, 'runtime-pid'), 'utf8'));
  const isRunning = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
      throw error;
    }
  };
  for (let attempt = 0; attempt < 20 && isRunning(); attempt++) await Bun.sleep(10);
  const survived = isRunning();
  if (survived) process.kill(pid, 'SIGKILL');
  expect(survived).toBe(false);
});
