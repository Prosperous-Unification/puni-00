import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';

test('an orphaned separate-session descendant is killed and reaped without touching a foreign process', async () => {
  const foreign = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
  const owner = createPerformanceProcessOwner();
  const marker = join(tmpdir(), `performance-orphan-${String(process.pid)}-${String(Date.now())}`);
  let stopped = false;
  try {
    const wrapper = owner.spawn(
      ['bash', '-c', `setsid bash -c 'echo "$$" > "${marker}"; sleep 30' >/dev/null 2>&1 & wait`],
      process.cwd(),
      { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
    );
    await Bun.sleep(100);
    wrapper.kill('SIGTERM');
    await wrapper.exited;
    const orphanPid = Number((await readFile(marker, 'utf8')).trim());
    expect(Number.isInteger(orphanPid)).toBe(true);
    await owner.stop();
    stopped = true;
    expect(await Bun.file(`/proc/${String(orphanPid)}/stat`).exists()).toBe(false);
    expect(await Bun.file(`/proc/${String(foreign.pid)}/stat`).exists()).toBe(true);
  } finally {
    try {
      if (!stopped) await owner.stop();
    } finally {
      foreign.kill('SIGKILL');
      await foreign.exited;
      await rm(marker, { force: true });
    }
  }
}, 20_000);

test('immediately exiting wrapper leaves two separate-session adopted children for bounded TERM then KILL and waitpid', async () => {
  const foreign = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
  const owner = createPerformanceProcessOwner();
  const prefix = join(tmpdir(), `performance-adopted-${String(process.pid)}-${String(Date.now())}`);
  const listenerMarker = `${prefix}.listener`;
  const sleeperMarker = `${prefix}.sleeper`;
  const wrapper = owner.spawn(
    [
      'bash',
      '-c',
      `setsid bun --eval 'Bun.serve({port:10300,fetch(){return new Response("ready")}}); await Bun.write("${listenerMarker}", String(process.pid));' >/dev/null 2>&1 & ` +
        `setsid bash -c 'trap "" TERM; echo $$ > "${sleeperMarker}"; exec sleep 30' >/dev/null 2>&1 & exit 0`,
    ],
    process.cwd(),
    { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
  );
  let listenerPid = 0;
  let sleeperPid = 0;
  try {
    expect(await wrapper.exited).toBe(0);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await Bun.file(listenerMarker).exists()) && (await Bun.file(sleeperMarker).exists()))
        break;
      await Bun.sleep(20);
    }
    listenerPid = Number((await readFile(listenerMarker, 'utf8')).trim());
    sleeperPid = Number((await readFile(sleeperMarker, 'utf8')).trim());
    expect(Number.isInteger(listenerPid) && listenerPid > 0).toBe(true);
    expect(Number.isInteger(sleeperPid) && sleeperPid > 0).toBe(true);
    const started = Date.now();
    await owner.stop();
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(await Bun.file(`/proc/${String(listenerPid)}/stat`).exists()).toBe(false);
    expect(await Bun.file(`/proc/${String(sleeperPid)}/stat`).exists()).toBe(false);
    expect(await Bun.file(`/proc/${String(foreign.pid)}/stat`).exists()).toBe(true);
  } finally {
    for (const pid of [listenerPid, sleeperPid])
      if (pid > 0 && (await Bun.file(`/proc/${String(pid)}/stat`).exists()))
        process.kill(pid, 'SIGKILL');
    foreign.kill('SIGKILL');
    await foreign.exited;
    await Promise.all([rm(listenerMarker, { force: true }), rm(sleeperMarker, { force: true })]);
  }
}, 20_000);

test('converges after a wrapper exits with many adopted children', async () => {
  const owner = createPerformanceProcessOwner();
  const marker = join(
    tmpdir(),
    `performance-adopted-many-${String(process.pid)}-${String(Date.now())}`,
  );
  try {
    const wrapper = owner.spawn(
      [
        'bash',
        '-c',
        `for i in $(seq 1 20); do setsid sleep 30 >/dev/null 2>&1 & echo $! >> "${marker}"; done; exit 0`,
      ],
      process.cwd(),
      { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
    );
    expect(await wrapper.exited).toBe(0);
    const children = (await readFile(marker, 'utf8')).trim().split('\n').map(Number);
    expect(children).toHaveLength(20);
    await owner.stop();
    for (const pid of children)
      expect(await Bun.file(`/proc/${String(pid)}/stat`).exists()).toBe(false);
  } finally {
    await rm(marker, { force: true });
  }
}, 20_000);

test('reaps an unwaited child of a long-lived Bun runner after stopping its parent', async () => {
  const marker = join(
    tmpdir(),
    `performance-bun-child-${String(process.pid)}-${String(Date.now())}`,
  );
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const owner = createPerformanceProcessOwner();
      const runner = owner.spawn(
        [
          process.execPath,
          '--eval',
          `const child = Bun.spawn(['setsid', 'sleep', '30'], {stdout:'ignore',stderr:'ignore'}); await Bun.write(${JSON.stringify(marker)}, String(child.pid)); await Bun.sleep(30000);`,
        ],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      for (let poll = 0; poll < 100 && !(await Bun.file(marker).exists()); poll += 1)
        await Bun.sleep(10);
      const adoptedPid = Number((await readFile(marker, 'utf8')).trim());
      expect(adoptedPid).toBeGreaterThan(0);
      await owner.stop();
      expect(await runner.exited).not.toBeNull();
      expect(await Bun.file(`/proc/${String(adoptedPid)}/stat`).exists()).toBe(false);
      await rm(marker, { force: true });
    }
  } finally {
    await rm(marker, { force: true });
  }
}, 30_000);
