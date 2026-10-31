import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import type { HealthCheckpoint } from './autonomous';
import type { ResourceReading, ResourceState } from './resources';
import { resourceProgram } from './resources-program';
import { createResourceReader } from './resources-ssh';

const executablePath = process.env['PATH'];
if (executablePath === undefined) throw new Error('PATH is required for subprocess fixtures');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const projects = {
  'puni-dev-observability': [
    'elasticsearch',
    'kibana',
    'gateway',
    'collector',
    'prometheus',
    'alertmanager',
  ],
  'h3mon-observability': [
    'mlflow',
    'otel-collector',
    'victorialogs',
    'victoriatraces',
    'victoriametrics',
    'vmauth',
    'grafana',
  ],
};
const wrapper = `import json,os,pathlib,sys,time
scope={'__name__':'fixture'}
exec(sys.stdin.read(),scope)
root=pathlib.Path(sys.argv[1])
settings=json.loads((root/'settings').read_text())
calls=0
authorities=0
def docker(args):
 global authorities
 global calls
 if args==['info','--format','{{.ID}}']:
  authorities+=1
  if authorities==2 and settings.get('slowAuthority'): time.sleep(8.1)
  return settings['daemon']+'\\n'
 if args[0]=='ps': return settings['roster']
 assert args[0]=='inspect' and args[1]=='--format'
 calls+=1
 if calls==2:
  for path,text in settings.get('changes',{}).items(): (root/path).write_text(text)
 return '\\n'.join(json.dumps(row) for row in settings['after' if calls==2 and 'after' in settings else 'inspect'])+'\\n'
os.environ['PATH']=str(root)+':'+os.environ['PATH']
reading=scope['run'](root/'proc',root/'cgroup',root/'machine',root/'boot',None if settings.get('realCommand') else docker)
print(json.dumps(reading,separators=(',',':')))
`;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-resource-'));
  directories.push(directory);
  const put = (path: string, text: string) => {
    const absolute = join(directory, path);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, text);
  };
  const now = Date.now();
  put('machine', 'bed07fdd1c9d47c08540df462db009f4\n');
  put('boot', '1f010daf-51a0-4655-b534-7c1fb4321157\n');
  put('proc/meminfo', 'MemTotal: 10000 kB\nMemAvailable: 4000 kB\n');
  put(
    'proc/stat',
    `cpu 100 20 30 400 10 5 6 7 3 2\nbtime ${String(Math.floor(now / 1000) - 1000)}\n`,
  );
  put('cgroup/cgroup.controllers', 'cpu memory\n');
  const inspect = Object.entries(projects).flatMap(([project, roles]) =>
    roles.map((role) => ({
      project,
      service: role,
      name: `/${project}-${role}-1`,
      id: '',
      running: true,
      pid: 0,
      started: new Date(now - 10000).toISOString(),
      memory: 2000000,
      nanoCpus: 500000000,
      cpuPeriod: 0,
      cpuQuota: 0,
      cpuset: '',
    })),
  );
  inspect.forEach((row, index) => {
    row.id = (index + 1).toString(16).padStart(64, '0');
    row.pid = 1000 + index;
    const path = `system.slice/docker-${row.id}.scope`;
    put(`proc/${String(row.pid)}/cgroup`, `0::/${path}\n`);
    put(
      `proc/${String(row.pid)}/stat`,
      `${String(row.pid)} (work (er)) S ${Array.from({ length: 19 }, (_, field) => (field === 18 ? '100' : '0')).join(' ')}\n`,
    );
    put(`cgroup/${path}/memory.current`, '1500000\n');
    put(`cgroup/${path}/memory.max`, '2000000\n');
    put(`cgroup/${path}/cpu.stat`, 'usage_usec 500000\nuser_usec 300000\nsystem_usec 200000\n');
    put(`cgroup/${path}/cpu.max`, '50000 100000\n');
  });
  const settings: {
    daemon: string;
    roster: string;
    inspect: typeof inspect;
    after?: typeof inspect;
    changes?: Record<string, string>;
    realCommand?: boolean;
    slowAuthority?: boolean;
  } = {
    daemon: '91cee18b-c061-4279-a311-1ac86ca3dd97',
    roster:
      inspect.map((row) => `${row.id} ${row.name.slice(1)}`).join('\n') +
      `\n${'e'.repeat(64)} unrelated\n`,
    inspect,
  };
  const save = () => {
    put('settings', JSON.stringify(settings));
  };
  save();
  const executable = join(directory, 'ssh');
  put(
    'ssh',
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(directory, 'argv'))},JSON.stringify(process.argv.slice(2)));const child=Bun.spawn(['python3','-c',${JSON.stringify(wrapper)},${JSON.stringify(directory)}],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});process.exitCode=await child.exited;`,
  );
  chmodSync(executable, 0o700);
  const run = async (optimized = false) => {
    save();
    const child = Bun.spawn(['python3', ...(optimized ? ['-O'] : []), '-c', wrapper, directory], {
      stdin: new TextEncoder().encode(resourceProgram),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exit, stdout, stderr };
  };
  return { directory, put, settings, save, executable, run };
}

test('actual Python reads all thirteen cgroups and host busy counters without idle/guest duplicates', async () => {
  const source = fixture();
  const captured = await source.run();
  expect(captured.stderr).toBe('');
  expect(captured.exit).toBe(0);
  const reading = JSON.parse(captured.stdout) as ResourceReading;
  expect(reading.host).toMatchObject({
    totalBytes: 10240000,
    availableBytes: 4096000,
    cpuSeconds: 1.68,
  });
  expect(reading.workloads).toHaveLength(13);
  expect(reading.unselected).toBe(1);
  expect(reading.workloads[0]).toMatchObject({
    memoryBytes: 1500000,
    memoryLimitBytes: 2000000,
    cpuSeconds: 0.5,
  });
  source.settings.inspect[0].memory = 0;
  source.settings.inspect[0].nanoCpus = 0;
  const path = `cgroup/system.slice/docker-${source.settings.inspect[0].id}.scope`;
  source.put(`${path}/memory.max`, 'max\n');
  source.put(`${path}/cpu.max`, 'max 100000\n');
  const unbounded = await source.run();
  expect(unbounded.exit).toBe(0);
  expect(
    (JSON.parse(unbounded.stdout) as ResourceReading).workloads[0].memoryLimitBytes,
  ).toBeNull();
});

test.each([
  'machine',
  'daemon',
  'missing-role',
  'owner',
  'running',
  'id',
  'pid',
  'started',
  'controls',
  'memory',
  'cpu',
  'cgroup-v1',
  'traversal',
  'membership',
  'symlink',
  'missing-file',
  'unreadable-file',
  'pid-generation',
  'cgroup-changed',
  'inspect-generation',
  'inspect-controls',
  'roster-bound',
])('actual Python refuses %s before emitting samples', async (fault) => {
  const source = fixture();
  const row = source.settings.inspect[0];
  const path = `cgroup/system.slice/docker-${row.id}.scope`;
  switch (fault) {
    case 'machine':
      source.put('machine', 'foreign');
      break;
    case 'daemon':
      source.settings.daemon = 'foreign';
      break;
    case 'missing-role':
      source.settings.roster = source.settings.roster.split('\n').slice(1).join('\n');
      break;
    case 'owner':
      row.project = 'foreign';
      break;
    case 'running':
      row.running = false;
      break;
    case 'id':
      row.id = 'short';
      break;
    case 'pid':
      row.pid = 0;
      break;
    case 'started':
      row.started = 'not-time';
      break;
    case 'controls':
      row.memory = -1;
      break;
    case 'memory':
      source.put(`${path}/memory.max`, '4000000');
      break;
    case 'cpu':
      source.put(`${path}/cpu.stat`, 'usage_usec 1\nuser_usec 3\nsystem_usec 2');
      break;
    case 'cgroup-v1':
      source.put(`proc/${String(row.pid)}/cgroup`, `2:memory:/docker/${row.id}`);
      break;
    case 'traversal':
      source.put(`proc/${String(row.pid)}/cgroup`, `0::/../../docker-${row.id}.scope`);
      break;
    case 'membership':
      source.put(`proc/${String(row.pid)}/cgroup`, '0::/system.slice/foreign.scope');
      break;
    case 'symlink':
      rmSync(join(source.directory, path), { recursive: true });
      symlinkSync('/tmp', join(source.directory, path));
      break;
    case 'missing-file':
      rmSync(join(source.directory, path, 'memory.current'));
      break;
    case 'unreadable-file':
      chmodSync(join(source.directory, path, 'memory.current'), 0);
      break;
    case 'pid-generation':
      source.settings.changes = {
        [`proc/${String(row.pid)}/stat`]: `${String(row.pid)} (worker) S ${'0 '.repeat(18)}101`,
      };
      break;
    case 'cgroup-changed':
      source.settings.changes = { [`proc/${String(row.pid)}/cgroup`]: '2:memory:/changed' };
      break;
    case 'inspect-generation':
      source.settings.after = structuredClone(source.settings.inspect);
      source.settings.after[0].started = new Date(Date.now() - 5000).toISOString();
      break;
    case 'inspect-controls':
      source.settings.after = structuredClone(source.settings.inspect);
      source.settings.after[0].nanoCpus = 1000000000;
      break;
    case 'roster-bound':
      source.settings.roster += Array.from(
        { length: 65 },
        (_, index) => `${'f'.repeat(64)} other-${String(index)}`,
      ).join('\n');
      break;
  }
  const captured = await source.run();
  expect(captured.exit).not.toBe(0);
  expect(captured.stdout).toBe('');
  const refusals: Record<string, string> = {
    machine: 'machine',
    daemon: 'daemon',
    'missing-role': 'missing role',
    owner: 'ownership',
    running: 'ownership',
    id: 'ownership',
    pid: 'integer',
    started: 'started',
    controls: 'integer',
    memory: 'memory control',
    cpu: 'cpu counters',
    'cgroup-v1': 'unified cgroup',
    traversal: 'cgroup traversal',
    membership: 'cgroup membership',
    symlink: 'cgroup escape',
    'pid-generation': 'changed process',
    'cgroup-changed': 'unified cgroup',
    'inspect-generation': 'changed inspection',
    'inspect-controls': 'changed inspection',
    'roster-bound': 'roster bound',
  };
  expect(captured.stderr).toContain(
    fault === 'missing-file'
      ? 'FileNotFoundError'
      : fault === 'unreadable-file'
        ? 'PermissionError'
        : `AssertionError: ${refusals[fault]}`,
  );
});

test('SSH reader fixes argv and stdin, validates real program output and maps external refusals', async () => {
  const source = fixture();
  const reading = await createResourceReader(source.executable)(new AbortController().signal);
  expect(reading.state).toBe('complete');
  expect(JSON.parse(readFileSync(join(source.directory, 'argv'), 'utf8'))).toEqual([
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=5',
    'h3mon',
    'sudo',
    '-n',
    'python3',
    '-',
  ]);
  source.settings.daemon = 'foreign';
  source.save();
  expect(await createResourceReader(source.executable)(new AbortController().signal)).toMatchObject(
    { state: 'unavailable', reason: 'source-unavailable' },
  );
});

test.each(['malformed', 'oversize', 'stale', 'future', 'blocked'])(
  'SSH reader rejects %s output with bounded cancellation and no samples',
  async (mode) => {
    const source = fixture();
    source.put(
      'ssh',
      `#!${process.execPath}\n${mode === 'blocked' ? `await Bun.sleep(60000);` : mode === 'oversize' ? `console.log('x'.repeat(32769));` : mode === 'malformed' ? `console.log('bad-json');` : `const child=Bun.spawn(['python3','-c',${JSON.stringify(wrapper)},${JSON.stringify(source.directory)}],{stdin:'inherit',stdout:'pipe',stderr:'ignore'});const reading=JSON.parse(await new Response(child.stdout).text());reading.observedAt=Date.now()+${String(mode === 'future' ? 1000 : -10001)};console.log(JSON.stringify(reading));`} `,
    );
    const controller = new AbortController();
    const timer =
      mode === 'blocked'
        ? setTimeout(() => {
            controller.abort();
          }, 100)
        : undefined;
    const started = performance.now();
    try {
      expect(await createResourceReader(source.executable)(controller.signal)).toMatchObject({
        state: 'unavailable',
        reason: mode === 'blocked' ? 'deadline' : 'invalid-reading',
      });
      expect(performance.now() - started).toBeLessThan(2000);
    } finally {
      clearTimeout(timer);
    }
  },
);

test('default CLI sends thirteen measured workload counters through the real OTLP sender and bounded checkpoint', async () => {
  const source = fixture();
  source.put(
    'ssh',
    `#!${process.execPath}\nif(!process.argv.includes('python3'))process.exit(1);const child=Bun.spawn(['python3','-c',${JSON.stringify(wrapper)},${JSON.stringify(source.directory)}],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});process.exitCode=await child.exited;`,
  );
  const batches: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      batches.push(await request.text());
      return Response.json({});
    },
  });
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./probe-cli.ts', import.meta.url).pathname,
        '--otlp',
        `http://127.0.0.1:${String(server.port)}`,
        '--version',
        'fixture',
        '--checkpoint',
        join(source.directory, 'checkpoint'),
        '--initialize',
        '--once',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PATH: `${source.directory}:${executablePath}` },
      },
    );
    const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(exit).toBe(1);
    const saved = readFileSync(join(source.directory, 'checkpoint.health'), 'utf8');
    expect(Buffer.byteLength(saved)).toBeLessThan(8192);
    const checkpoint = JSON.parse(saved) as HealthCheckpoint;
    if (checkpoint.resources?.state !== 'complete')
      throw new Error('Expected complete resource readings');
    expect(checkpoint.resources.state).toBe('complete');
    expect(checkpoint.resources.reading.workloads).toHaveLength(13);
    const measured = batches.find((batch) =>
      batch.includes('puni_resource_host_memory_available_bytes'),
    );
    expect(measured).toBeDefined();
    const text = measured ?? '';
    expect(text.match(/"name":"puni_resource_workload_cpu_seconds"/g)).toHaveLength(13);
    expect(text).toContain('"asDouble":4096000');
    expect(text).not.toContain(source.settings.inspect[0].id);
    expect(text).not.toContain('"workload.group","value":{"stringValue":"dev"}');
  } finally {
    await server.stop(true);
  }
});

test('compiled observer embeds provider and local once publishes unavailable without executing SSH', async () => {
  const source = fixture();
  const executable = join(source.directory, 'observer');
  const compile = Bun.spawn(
    [
      process.execPath,
      'build',
      '--compile',
      new URL('./probe-cli.ts', import.meta.url).pathname,
      '--outfile',
      executable,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [compiled, compileError] = await Promise.all([
    compile.exited,
    new Response(compile.stderr).text(),
  ]);
  expect(compiled).toBe(0);
  expect(compileError).not.toContain('error:');
  source.put(
    'ssh',
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(source.directory, 'ssh-called'))},'called');process.exit(91);`,
  );
  const batches: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === '/health')
        return Response.json({ status: 'ok', commit: 'a'.repeat(40) });
      batches.push(await request.text());
      return Response.json({});
    },
  });
  try {
    const endpoint = `http://127.0.0.1:${String(server.port)}`;
    const child = Bun.spawn(
      [
        executable,
        '--local',
        `${endpoint}/health`,
        '--otlp',
        endpoint,
        '--version',
        'fixture',
        '--checkpoint',
        join(source.directory, 'checkpoint'),
        '--initialize',
        '--once',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PATH: `${source.directory}:${executablePath}` },
        cwd: source.directory,
      },
    );
    const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(exit).toBe(0);
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(source.directory, 'ssh-called'))).toBe(false);
    expect(
      (
        JSON.parse(readFileSync(join(source.directory, 'checkpoint.health'), 'utf8')) as {
          resources: ResourceState;
        }
      ).resources,
    ).toMatchObject({ state: 'unavailable', reason: 'source-unavailable' });
    expect(batches.some((batch) => batch.includes('puni_resource_collection_state'))).toBe(true);
    expect(batches.some((batch) => batch.includes('puni_resource_host_memory'))).toBe(false);
    // A compiled actual-source cycle must also execute the embedded provider away from the source tree.
    source.put(
      'ssh',
      `#!${process.execPath}\nif(!process.argv.includes('python3'))process.exit(1);const child=Bun.spawn(['python3','-c',${JSON.stringify(wrapper)},${JSON.stringify(source.directory)}],{stdin:'inherit',stdout:'inherit',stderr:'inherit'});process.exitCode=await child.exited;`,
    );
    const actual = Bun.spawn(
      [
        executable,
        '--otlp',
        endpoint,
        '--version',
        'fixture',
        '--checkpoint',
        join(source.directory, 'actual'),
        '--initialize',
        '--once',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PATH: `${source.directory}:${executablePath}` },
        cwd: source.directory,
      },
    );
    expect(await actual.exited).toBe(1);
    expect(await new Response(actual.stderr).text()).toBe('');
    expect(
      (
        JSON.parse(readFileSync(join(source.directory, 'actual.health'), 'utf8')) as {
          resources: ResourceState;
        }
      ).resources.state,
    ).toBe('complete');
  } finally {
    await server.stop(true);
  }
}, 20000);

test.each([
  'boot',
  'controllers',
  'roster-identity',
  'duplicate-identity',
  'projection',
  'inspect-count',
  'cpuset',
  'meminfo-units',
  'host-memory',
  'host-stat',
  'guest-accounting',
  'pid-stat',
  'pid-stat-length',
  'process-time',
  'file-bound',
  'unsafe-number',
  'cpu-stat',
  'cpu-max',
  'cpu-control',
  'cpuset-control',
  'execution-time',
  'negative-number',
  'metric-symlink',
  'changed-authority',
])('Python numeric and shape boundary refuses %s with the intended refusal', async (fault) => {
  const source = fixture();
  const row = source.settings.inspect[0];
  const path = `cgroup/system.slice/docker-${row.id}.scope`;
  const expectations: Record<string, string> = {
    boot: 'boot',
    controllers: 'cgroup v2',
    'roster-identity': 'roster identity',
    'duplicate-identity': 'duplicate identities',
    projection: 'projection',
    'inspect-count': 'inspect count',
    cpuset: 'cpuset',
    'meminfo-units': 'meminfo units',
    'host-memory': 'host memory',
    'host-stat': 'host stat',
    'guest-accounting': 'guest accounting',
    'pid-stat': 'pid stat',
    'pid-stat-length': 'pid stat length',
    'process-time': 'process time',
    'file-bound': 'file bound',
    'unsafe-number': 'integer',
    'cpu-stat': 'cpu stat',
    'cpu-max': 'cpu maximum',
    'cpu-control': 'cpu control',
    'cpuset-control': 'cpuset control',
    'execution-time': 'execution time',
    'negative-number': 'number',
    'metric-symlink': 'metric escape',
    'changed-authority': 'changed authority',
  };
  switch (fault) {
    case 'boot':
      source.put('boot', 'not-boot');
      break;
    case 'controllers':
      source.put('cgroup/cgroup.controllers', 'cpu');
      break;
    case 'roster-identity':
      source.settings.roster += 'invalid';
      break;
    case 'duplicate-identity':
      source.settings.roster = source.settings.roster.replace(
        source.settings.inspect[1].id,
        row.id,
      );
      break;
    case 'projection':
      Object.assign(row, { private: 'refuse-extra-fields' });
      break;
    case 'inspect-count':
      source.settings.inspect.pop();
      break;
    case 'cpuset':
      row.cpuset = 'invalid';
      break;
    case 'meminfo-units':
      source.put('proc/meminfo', 'MemTotal: 10000 MB\nMemAvailable: 4000 kB');
      break;
    case 'host-memory':
      source.put('proc/meminfo', 'MemTotal: 1000 kB\nMemAvailable: 4000 kB');
      break;
    case 'host-stat':
      source.put('proc/stat', 'cpu 1 2\nbtime 1000');
      break;
    case 'guest-accounting':
      source.put(
        'proc/stat',
        `cpu 100 20 30 400 10 5 6 7 101 2\nbtime ${String(Math.floor(Date.now() / 1000) - 1000)}`,
      );
      break;
    case 'pid-stat':
      source.put(`proc/${String(row.pid)}/stat`, `22 (worker) S ${'0 '.repeat(19)}100`);
      break;
    case 'pid-stat-length':
      source.put(`proc/${String(row.pid)}/stat`, `${String(row.pid)} (worker) S 0`);
      break;
    case 'process-time':
      source.put(
        `proc/${String(row.pid)}/stat`,
        `${String(row.pid)} (worker) S ${'0 '.repeat(18)}999999999999`,
      );
      break;
    case 'file-bound':
      source.put(`${path}/memory.current`, '1'.repeat(32769));
      break;
    case 'unsafe-number':
      source.put(`${path}/memory.current`, '9007199254740992');
      break;
    case 'cpu-stat':
      source.put(`${path}/cpu.stat`, 'usage_usec 10 20');
      break;
    case 'cpu-max':
      source.put(`${path}/cpu.max`, '50000');
      break;
    case 'cpu-control':
      source.put(`${path}/cpu.max`, '10000 100000');
      break;
    case 'cpuset-control':
      row.cpuset = '0-1';
      source.put(`${path}/cpuset.cpus`, '2-3');
      break;
    case 'negative-number':
      source.put(`${path}/memory.current`, '-1');
      break;
    case 'metric-symlink':
      source.put('outside', '1500000');
      rmSync(join(source.directory, path, 'memory.current'));
      symlinkSync(
        join(source.directory, 'outside'),
        join(source.directory, path, 'memory.current'),
      );
      break;
    case 'changed-authority':
      source.settings.changes = { machine: 'changed' };
      break;
    case 'execution-time':
      row.started = new Date(Date.now() + 100000).toISOString();
      break;
  }
  const captured = await source.run();
  expect(captured.exit).not.toBe(0);
  expect(captured.stdout).toBe('');
  expect(captured.stderr).toContain(`AssertionError: ${expectations[fault]}`);
});

test('SSH ten-second deadline kills its actual blocked subprocess', async () => {
  const source = fixture();
  source.put(
    'ssh',
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(source.directory, 'blocked-pid'))},String(process.pid));await Bun.sleep(11000);console.log('bad-json');`,
  );
  const started = performance.now();
  expect(await createResourceReader(source.executable)(new AbortController().signal)).toMatchObject(
    { state: 'unavailable', reason: 'deadline' },
  );
  expect(performance.now() - started).toBeGreaterThan(9000);
  expect(performance.now() - started).toBeLessThan(12000);
  const pid = Number(readFileSync(join(source.directory, 'blocked-pid'), 'utf8'));
  expect(() => process.kill(pid, 0)).toThrow();
}, 15000);

test.each([
  'command-success',
  'command-bound',
  'command-exit',
  'command-deadline',
  'provider-deadline',
])(
  'actual Docker subprocess boundary checks %s',
  async (fault) => {
    const source = fixture();
    source.settings.realCommand = fault !== 'provider-deadline';
    source.settings.slowAuthority = fault === 'provider-deadline';
    source.put(
      'docker',
      `#!/usr/bin/python3\nimport json,pathlib,sys,time\nroot=pathlib.Path(${JSON.stringify(source.directory)})\nsettings=json.loads((root/'settings').read_text())\n${fault === 'command-bound' ? "print('x'*32769);sys.exit(0)" : fault === 'command-exit' ? 'sys.exit(1)' : fault === 'command-deadline' ? "if sys.argv[1]=='info':\n if not (root/'command-slept').exists(): (root/'command-slept').write_text('yes');time.sleep(8.5)\n print(settings['daemon'])\nelif sys.argv[1]=='ps': print(settings['roster'],end='')\nelse: print('\\n'.join(json.dumps(row) for row in settings['inspect']))" : "if sys.argv[1]=='info': print(settings['daemon'])\nelif sys.argv[1]=='ps': print(settings['roster'],end='')\nelse: print('\\n'.join(json.dumps(row) for row in settings['inspect']))"}`,
    );
    chmodSync(join(source.directory, 'docker'), 0o700);
    const captured = await source.run();
    if (fault === 'command-success') {
      expect(captured.stderr).toBe('');
      expect(captured.exit).toBe(0);
      expect((JSON.parse(captured.stdout) as ResourceReading).workloads).toHaveLength(13);
      return;
    }
    expect(captured.exit).not.toBe(0);
    expect(captured.stdout).toBe('');
    expect(captured.stderr).toContain(
      fault === 'command-deadline'
        ? 'TimeoutError: provider deadline'
        : `AssertionError: ${fault === 'command-bound' ? 'command bound' : fault === 'command-exit' ? 'docker unavailable' : 'provider deadline'}`,
    );
  },
  12000,
);

test('optimized Python refuses to run without identity/path assertions', async () => {
  const source = fixture();
  source.put('machine', 'foreign');
  const captured = await source.run(true);
  expect(captured.exit).not.toBe(0);
  expect(captured.stdout).toBe('');
  expect(captured.stderr).toContain('RuntimeError: Optimized Python is unsupported');
});
