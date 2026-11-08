import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { captureSolverFile, decodeSolverPins, parseSolverUnit } from './solver-host';

test('captures bounded canonical installed file hash and inode without retaining bytes', async () => {
  const path = `${scratchSync('solver-file-')}/bundle`;
  await writeFile(path, 'known bytes');
  const observed = await captureSolverFile(path, 100);
  expect(observed.sha256).toBe(createHash('sha256').update('known bytes').digest('hex'));
  expect(Object.keys(observed)).toEqual(['path', 'device', 'inode', 'mode', 'sha256']);
  await refuses(captureSolverFile(path, 2), 'bounded');
  await refuses(captureSolverFile(`${path}-missing`, 100), '');
});
test('independent pins are closed and require every tuple member before observation', () => {
  const pins = {
    version: 1 as const,
    sourceSha: 'a'.repeat(40),
    bunSha256: 'b'.repeat(64),
    bundleSha256: 'c'.repeat(64),
    configSha256: 'd'.repeat(64),
    unitSha256: 'e'.repeat(64),
  };
  expect(decodeSolverPins(pins)).toEqual(pins);
  for (const variant of [
    { ...pins, unitSha256: '' },
    { ...pins, extra: true },
    { ...pins, version: 2 },
  ])
    expect(() => decodeSolverPins(variant)).toThrow();
});
test('effective stopped service refuses unexplained authority and edge namespace', () => {
  expect(() => parseSolverUnit('Id=unknown\n', false)).toThrow();
});

async function refuses(promise: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await promise;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

test('actual host child is killed on deadline cancellation', async () => {
  const root = scratchSync('solver-cancel-');
  const originalPath = process.env['PATH'];
  if (originalPath === undefined) throw new Error('test PATH missing');
  await writeFile(
    `${root}/systemctl`,
    `#!/bin/sh\nprintf '%s' "$$" > '${root}/pid'\nexec /bin/sleep 30\n`,
    { mode: 0o755 },
  );
  process.env['PATH'] = `${root}:${originalPath}`;
  try {
    const { runSolverHost } = await import('./solver-host');
    const { runDockerBefore } = await import('./docker-deadline');
    const { readFile } = await import('node:fs/promises');
    await refuses(
      runDockerBefore(
        ['stop'],
        (_args, signal) => runSolverHost({ kind: 'stop' }, signal),
        performance.now() + 100,
      ),
      'deadline',
    );
    const pid = Number(await readFile(`${root}/pid`, 'utf8'));
    // Awaiting the command race does not itself prove child reap; independently observe process disappearance.
    for (let attempt = 0; attempt < 50; attempt++) {
      let live = true;
      try {
        process.kill(pid, 0);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') live = false;
        else throw cause;
      }
      if (!live) return;
      await Bun.sleep(10);
    }
    throw new Error('cancelled solver host child survived');
  } finally {
    process.env['PATH'] = originalPath;
  }
});

test('required installed files refuse unreadability and symlink aliases', async () => {
  const { chmod, symlink } = await import('node:fs/promises');
  const root = scratchSync('solver-unreadable-');
  const path = `${root}/bundle`;
  await writeFile(path, 'installed', { mode: 0o600 });
  await symlink(path, `${root}/alias`);
  await refuses(captureSolverFile(`${root}/alias`, 100), 'canonical');
  await chmod(path, 0);
  await refuses(captureSolverFile(path, 100), 'EACCES');
});

test('real proc observation retains PID start ticks and unified cgroup identity', async () => {
  const { observeSolverProcess } = await import('./solver-host');
  const observed = await observeSolverProcess(process.pid);
  expect(observed.pid).toBe(process.pid);
  expect(observed.startTime).toMatch(/^[0-9]+$/);
  expect(observed.cgroup).toStartWith('/');
});

test('malformed output kills and reaps the exact command child before rejecting', async () => {
  const root = scratchSync('solver-malformed-');
  const originalPath = process.env['PATH'];
  if (originalPath === undefined) throw new Error('test PATH missing');
  await writeFile(
    `${root}/systemctl`,
    `#!/bin/sh\nprintf '%s' "$$" > '${root}/pid'\nprintf '\\377'\nexec 1>&-\nexec 2>&-\nexec /bin/sleep 30\n`,
    { mode: 0o755 },
  );
  process.env['PATH'] = `${root}:${originalPath}`;
  let pid: number | undefined;
  try {
    const { runSolverHost } = await import('./solver-host');
    const { readFile } = await import('node:fs/promises');
    await refuses(runSolverHost({ kind: 'show' }), '');
    pid = Number(await readFile(`${root}/pid`, 'utf8'));
    let live = true;
    try {
      process.kill(pid, 0);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') live = false;
      else throw cause;
    }
    expect(live).toBe(false);
  } finally {
    process.env['PATH'] = originalPath;
    if (pid !== undefined) killFixtureChild(pid);
  }
});

function killFixtureChild(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}

for (const fault of ['fifo-open', 'metadata-readback']) {
  test(`actual file boundary refuses ${fault} substitution without blocking or stale acceptance`, async () => {
    const root = scratchSync('solver-file-race-');
    const path = `${root}/bundle`;
    await writeFile(path, 'reviewed bytes', { mode: 0o600 });
    if (fault === 'fifo-open') {
      const creation = Bun.spawn(['mkfifo', `${root}/fifo`], { stdout: 'pipe', stderr: 'pipe' });
      expect(await creation.exited).toBe(0);
    }
    const program = `
      import { mock } from 'bun:test';
      import * as filesystem from 'node:fs/promises';
      const originalOpen = filesystem.open;
      const originalRename = filesystem.rename;
      const originalChmod = filesystem.chmod;
      const path = ${JSON.stringify(path)};
      mock.module('node:fs/promises', () => ({ ...filesystem, open: async (named, ...options) => {
        if (named === path && ${JSON.stringify(fault)} === 'fifo-open') {
          await originalRename(path, path + '.original');
          await originalRename(${JSON.stringify(`${root}/fifo`)}, path);
        }
        const file = await originalOpen(named, ...options);
        if (named === path && ${JSON.stringify(fault)} === 'metadata-readback') {
          const originalStat = file.stat.bind(file);
          let observations = 0;
          file.stat = async (...args) => {
            const snapshot = await originalStat(...args);
            if (++observations === 2) await originalChmod(path, 0o640);
            return snapshot;
          };
        }
        return file;
      } }));
      const { captureSolverFile } = await import(${JSON.stringify(`${import.meta.dir}/solver-host.ts`)});
      let refused = false;
      try { await captureSolverFile(path, 100); }
      catch (cause) {
        if (!(cause instanceof Error) || !cause.message.includes('changed while')) throw cause;
        refused = true;
      }
      if (!refused) throw new Error('substituted file was accepted');
    `;
    const controller = new AbortController();
    const child = Bun.spawn([process.execPath, '-e', program], {
      stdout: 'pipe',
      stderr: 'pipe',
      signal: controller.signal,
      killSignal: 'SIGKILL',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 1500);
    try {
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(timedOut).toBe(false);
      expect(stderr).toBe('');
      expect(code).toBe(0);
    } finally {
      clearTimeout(timer);
    }
  });
}

test('fixed host transport enforces its own deadline without caller cancellation', async () => {
  const root = scratchSync('solver-default-deadline-');
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('test PATH missing');
  await writeFile(`${root}/systemctl`, '#!/bin/sh\nexec /bin/sleep 16\n', { mode: 0o755 });
  process.env['PATH'] = `${root}:${path}`;
  try {
    const { runSolverHost } = await import('./solver-host');
    await refuses(runSolverHost({ kind: 'stop' }), 'bound');
  } finally {
    process.env['PATH'] = path;
  }
}, 20000);
