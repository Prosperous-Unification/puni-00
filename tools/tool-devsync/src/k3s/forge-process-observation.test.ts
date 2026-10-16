import { rejects } from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { observeProcesses } from './forge-process-observation';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'forge-process-'));
  directories.push(directory);
  const cgroupRoot = join(directory, 'cgroup');
  const procRoot = join(directory, 'proc');
  const cgroup = join(cgroupRoot, 'source');
  const proc = join(procRoot, '42');
  await mkdir(cgroup, { recursive: true });
  await mkdir(proc, { recursive: true });
  const fields = ['S', '1', ...Array<string>(17).fill('0'), '1234'];
  const files = {
    [join(cgroup, 'cgroup.procs')]: '42\n',
    [join(cgroup, 'memory.current')]: '2048\n',
    [join(cgroup, 'memory.peak')]: '4096\n',
    [join(cgroup, 'memory.max')]: '2147483648\n',
    [join(cgroup, 'memory.events')]: 'low 0\nhigh 0\nmax 2\noom 1\noom_kill 1\n',
    [join(proc, 'stat')]: `42 (bun child) ${fields.join(' ')}\n`,
    [join(proc, 'status')]: 'Pid:\t42\nPPid:\t1\nVmRSS:\t1048576 kB\nThreads:\t87\n',
    [join(proc, 'cgroup')]: '0::/source\n',
    [join(proc, 'cmdline')]:
      '/usr/bin/bun\0/src/node_modules/vite/bin/vite.js\0--token=super-secret\0',
  };
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(path, text)));
  await symlink('/usr/bin/bun', join(proc, 'exe'));
  return { cgroup, proc, roots: { cgroupRoot, procRoot } };
}

test('records stable Vite identity and memory without raw arguments or verdicts', async () => {
  const { cgroup, roots } = await fixture();
  const samples = await observeProcesses(
    { cgroup, samples: 2, intervalMs: 1, windowMs: 1000 },
    roots,
  );
  expect(samples).toHaveLength(2);
  expect(samples[0]).toMatchObject({
    memory: { current: '2048', peak: '4096', max: '2147483648', events: { oom_kill: '1' } },
    processes: [
      {
        pid: 42,
        starttime: '1234',
        ppid: 1,
        executable: 'bun',
        role: 'vite',
        rssKiB: 1048576,
        threads: 87,
      },
    ],
  });
  expect(JSON.stringify(samples)).not.toMatch(/super-secret|token|argv|Passed|verdict/);
});

test('unknown launcher arguments cannot impersonate the Vite launcher', async () => {
  const { cgroup, proc, roots } = await fixture();
  await writeFile(join(proc, 'cmdline'), 'bun\0/src/app.ts\0/src/node_modules/vite/bin/vite.js\0');
  expect(
    (await observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots))[0]
      ?.processes[0]?.role,
  ).toBe('unknown');
});

test('refuses absent and unreadable required memory state', async () => {
  const { cgroup, roots } = await fixture();
  await rm(join(cgroup, 'memory.peak'));
  await rejects(observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots));
  await writeFile(join(cgroup, 'memory.peak'), '4096');
  await chmod(join(cgroup, 'memory.peak'), 0);
  await rejects(observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots));
  await chmod(join(cgroup, 'memory.peak'), 0o600);
});

test('refuses malformed counters, PID identity, status and cgroup membership', async () => {
  for (const [file, text] of [
    ['memory.current', 'oops'],
    ['memory.events', 'oom_kill wrong\n'],
    ['../proc/42/stat', 'malformed'],
    ['../proc/42/status', 'Pid: 43\n'],
    ['../proc/42/cgroup', '0::/foreign\n'],
    ['../proc/42/cmdline', 'unterminated'],
  ]) {
    const { cgroup, proc, roots } = await fixture();
    const path = file.startsWith('../proc/')
      ? join(proc, file.slice('../proc/42/'.length))
      : join(cgroup, file);
    await writeFile(path, text);
    await rejects(observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots));
  }
});

test('refuses oversized files and more than 256 exact members', async () => {
  const { cgroup, proc, roots } = await fixture();
  await writeFile(join(proc, 'cmdline'), 'x'.repeat(65537));
  await rejects(
    observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /byte limit/,
  );
  await writeFile(
    join(cgroup, 'cgroup.procs'),
    Array.from({ length: 257 }, (_, index) => index + 1).join('\n'),
  );
  await rejects(
    observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /process limit/,
  );
});

test('refuses foreign directories and symlink escapes', async () => {
  const { cgroup, proc, roots } = await fixture();
  await rejects(
    observeProcesses({ cgroup: proc, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /cgroup directory/,
  );
  const link = join(roots.cgroupRoot, 'escape');
  await symlink(proc, link);
  await rejects(
    observeProcesses({ cgroup: link, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /cgroup directory/,
  );
  await rm(join(cgroup, 'memory.peak'));
  await symlink(join(cgroup, 'memory.current'), join(cgroup, 'memory.peak'));
  await rejects(observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots));
});

test('refuses invalid bounds before inspecting filesystem', async () => {
  for (const bounds of [
    { samples: 0 },
    { samples: 31 },
    { samples: 1.5 },
    { intervalMs: -1 },
    { intervalMs: 1001 },
    { windowMs: 0 },
    { windowMs: Infinity },
    { windowMs: NaN },
    { windowMs: 30001 },
  ]) {
    await rejects(
      observeProcesses({
        cgroup: '/missing',
        samples: 1,
        intervalMs: 0,
        windowMs: 1000,
        ...bounds,
      }),
      /bounds/,
    );
  }
});

test('deadline refuses an interval exceeding remaining budget', async () => {
  const { cgroup, roots } = await fixture();
  const started = performance.now();
  await rejects(
    observeProcesses({ cgroup, samples: 2, intervalMs: 1000, windowMs: 40 }, roots),
    /deadline/,
  );
  expect(performance.now() - started).toBeLessThan(500);
});

test('CLI rejects extra lifecycle arguments before reading files', async () => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'forge-process-observation.ts'), '/missing', 'up'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).not.toBe(0);
  expect(await new Response(child.stderr).text()).toContain('Usage:');
  expect(await new Response(child.stdout).text()).toBe('');
});

test('refuses identity and membership changes after command inspection', async () => {
  for (const fault of ['identity', 'membership']) {
    const { cgroup, roots } = await fixture();
    const runner = join(roots.procRoot, 'runner.ts');
    await writeFile(
      runner,
      `import { observeProcesses } from ${JSON.stringify(join(import.meta.dir, 'forge-process-observation.ts'))};\nconsole.log(JSON.stringify(await observeProcesses(${JSON.stringify({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 })}, ${JSON.stringify(roots)})));`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        join(import.meta.dir, 'forge-process-observation.fault.preload.ts'),
        runner,
      ],
      { env: { ...process.env, FORGE_PROCESS_FAULT: fault }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await child.exited).not.toBe(0);
    expect(await new Response(child.stderr).text()).toContain(
      fault === 'identity' ? 'process identity changed' : 'process cgroup membership changed',
    );
    expect(await new Response(child.stdout).text()).toBe('');
  }
});

test('CLI local watchdog exits during a stalled required read', async () => {
  const { cgroup, roots } = await fixture();
  const started = performance.now();
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      join(import.meta.dir, 'forge-process-observation.fault.preload.ts'),
      join(import.meta.dir, 'forge-process-observation.ts'),
      cgroup,
    ],
    {
      env: {
        ...process.env,
        FORGE_PROCESS_FAULT: 'deadline',
        FORGE_PROCESS_CGROUP_ROOT: roots.cgroupRoot,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(await child.exited).toBe(1);
  expect(await new Response(child.stderr).text()).toContain('process observation local deadline');
  expect(await new Response(child.stdout).text()).toBe('');
  expect(performance.now() - started).toBeLessThan(1000);
});

test('refuses unsafe executable text instead of logging it', async () => {
  const { cgroup, proc, roots } = await fixture();
  await rm(join(proc, 'exe'));
  await symlink('/usr/bin/secret token', join(proc, 'exe'));
  await rejects(
    observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /unsafe executable/,
  );
});

test('refuses cgroup directory replacement during process inspection', async () => {
  const { cgroup, roots } = await fixture();
  const runner = join(roots.procRoot, 'runner.ts');
  await writeFile(
    runner,
    `import { observeProcesses } from ${JSON.stringify(join(import.meta.dir, 'forge-process-observation.ts'))};\nconsole.log(JSON.stringify(await observeProcesses(${JSON.stringify({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 })}, ${JSON.stringify(roots)})));`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      join(import.meta.dir, 'forge-process-observation.fault.preload.ts'),
      runner,
    ],
    {
      env: { ...process.env, FORGE_PROCESS_FAULT: 'directory', FORGE_PROCESS_CGROUP: cgroup },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(await child.exited).not.toBe(0);
  expect(await new Response(child.stderr).text()).toContain('cgroup identity changed');
  expect(await new Response(child.stdout).text()).toBe('');
});

test('library deadline rejects a stalled read and leaves no long pause running', async () => {
  for (const fault of ['deadline', 'pause']) {
    const { cgroup, roots } = await fixture();
    const runner = join(roots.procRoot, 'runner.ts');
    await writeFile(
      runner,
      `import { observeProcesses } from ${JSON.stringify(join(import.meta.dir, 'forge-process-observation.ts'))};\ntry { await observeProcesses(${JSON.stringify({ cgroup, samples: 2, intervalMs: 1000, windowMs: 40 })}, ${JSON.stringify(roots)}); } catch { console.error('bounded refusal'); process.exitCode = 1; }`,
    );
    const started = performance.now();
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        join(import.meta.dir, 'forge-process-observation.fault.preload.ts'),
        runner,
      ],
      { env: { ...process.env, FORGE_PROCESS_FAULT: fault }, stdout: 'pipe', stderr: 'pipe' },
    );
    const ceiling = setTimeout(() => {
      child.kill('SIGKILL');
    }, 1500);
    try {
      expect(await child.exited).toBe(1);
      expect(await new Response(child.stderr).text()).toContain('bounded refusal');
      expect(performance.now() - started).toBeLessThan(500);
    } finally {
      clearTimeout(ceiling);
    }
  }
});

test('refuses exec changes within the same PID start time', async () => {
  const { cgroup, roots } = await fixture();
  const runner = join(roots.procRoot, 'runner.ts');
  await writeFile(
    runner,
    `import { observeProcesses } from ${JSON.stringify(join(import.meta.dir, 'forge-process-observation.ts'))};\nconsole.log(JSON.stringify(await observeProcesses(${JSON.stringify({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 })}, ${JSON.stringify(roots)})));`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      join(import.meta.dir, 'forge-process-observation.fault.preload.ts'),
      runner,
    ],
    { env: { ...process.env, FORGE_PROCESS_FAULT: 'exec' }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).not.toBe(0);
  expect(await new Response(child.stderr).text()).toContain('process executable changed');
  expect(await new Response(child.stdout).text()).toBe('');
});

test('refuses unreadable required state independently from absent state', async () => {
  const { cgroup, roots } = await fixture();
  await chmod(join(cgroup, 'memory.peak'), 0);
  try {
    await rejects(
      observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
      /EACCES/,
    );
  } finally {
    await chmod(join(cgroup, 'memory.peak'), 0o600);
  }
});

test('refuses missing required event counters and malformed process fields', async () => {
  const cases = [
    ['memory.events', 'low 0\n', /required memory events absent/],
    ['memory.events', 'oom_kill wrong\n', /malformed memory events/],
    [
      'stat',
      '43 (wrong pid) S 1 ' + [...Array<string>(17).fill('0'), '1234'].join(' '),
      /malformed process identity/,
    ],
    ['status', 'Pid: 42\nPPid: 1\nVmRSS: bad kB\nThreads: 87\n', /malformed process number/],
  ] as const;
  for (const [file, text, failure] of cases) {
    const { cgroup, proc, roots } = await fixture();
    await writeFile(join(file.startsWith('memory') ? cgroup : proc, file), text);
    await rejects(
      observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
      failure,
    );
  }
});

test('refuses nonregular required state', async () => {
  const { cgroup, roots } = await fixture();
  await rm(join(cgroup, 'memory.peak'));
  await mkdir(join(cgroup, 'memory.peak'));
  await rejects(
    observeProcesses({ cgroup, samples: 1, intervalMs: 0, windowMs: 1000 }, roots),
    /not regular/,
  );
});

test('rejects a FIFO required file without leaving a blocked reader', async () => {
  const { cgroup, roots } = await fixture();
  await rm(join(cgroup, 'memory.peak'));
  const fifo = Bun.spawn(['mkfifo', join(cgroup, 'memory.peak')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await fifo.exited).toBe(0);
  const runner = join(roots.procRoot, 'runner.ts');
  await writeFile(
    runner,
    `import { observeProcesses } from ${JSON.stringify(join(import.meta.dir, 'forge-process-observation.ts'))};\ntry { await observeProcesses(${JSON.stringify({ cgroup, samples: 1, intervalMs: 0, windowMs: 40 })}, ${JSON.stringify(roots)}); } catch (failure) { console.error(String(failure)); process.exitCode = 1; }`,
  );
  const started = performance.now();
  const child = Bun.spawn([process.execPath, runner], { stdout: 'pipe', stderr: 'pipe' });
  const ceiling = setTimeout(() => {
    child.kill('SIGKILL');
  }, 1500);
  try {
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain('not regular');
    expect(performance.now() - started).toBeLessThan(500);
  } finally {
    clearTimeout(ceiling);
  }
});

test('refuses a nondirectory cgroup path before reading member files', async () => {
  const { cgroup, roots } = await fixture();
  await rejects(
    observeProcesses(
      { cgroup: join(cgroup, 'memory.current'), samples: 1, intervalMs: 0, windowMs: 1000 },
      roots,
    ),
    /exact local cgroup directory/,
  );
});

test('retains only complete emitted observations when a later sample fails', async () => {
  const { cgroup, roots } = await fixture();
  const { writeFileSync } = await import('node:fs');
  const emitted: unknown[] = [];
  await rejects(
    observeProcesses({ cgroup, samples: 2, intervalMs: 0, windowMs: 1000 }, roots, (sample) => {
      emitted.push(sample);
      writeFileSync(join(cgroup, 'memory.current'), 'malformed');
    }),
    /malformed memory counter/,
  );
  expect(emitted).toHaveLength(1);
  expect(JSON.stringify(emitted)).toContain('vite');
});
