import { readdirSync, readlinkSync, writeSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dlopen, ptr } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { createPerformanceProcessOwner } from './performance-processes';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

function assertTestProcessIsNotSubreaper(): void {
  const libc = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'ptr', 'i64', 'i64', 'i64'], returns: 'i32' },
  });
  const status = new Int32Array(1);
  try {
    expect(libc.symbols.prctl(37, ptr(status), 0, 0, 0)).toBe(0);
    expect(status[0]).toBe(0);
  } finally {
    libc.close();
  }
}

function isolatedTest(
  name: string,
  action: () => Promise<void>,
  durationMs: number,
  fault?:
    | 'pidfd-vanish'
    | 'pidfd-recheck-error'
    | 'subreaper-denied'
    | 'pidfd-probe-denied'
    | 'signal-probe-denied'
    | 'identity-reused'
    | 'signal-identity-reused'
    | 'direct-reuse'
    | 'owned-root-reuse'
    | 'ancestry-cycle'
    | 'first-signal'
    | 'unresolved-direct'
    | 'waitpid-echild'
    | 'waitpid-zero'
    | 'inventory-on-stop',
): void {
  test(
    name,
    async () => {
      if (process.env['PUNI_PERFORMANCE_OWNER_TEST_CHILD'] === '1') {
        await action();
        return;
      }
      assertTestProcessIsNotSubreaper();
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      environment['PUNI_PERFORMANCE_OWNER_TEST_CHILD'] = '1';
      if (fault !== undefined) environment['PUNI_PROCESS_FAULT'] = fault;
      const argumentsBeforeFile =
        fault === undefined
          ? []
          : ['--preload', join(import.meta.dir, 'performance-processes.fault.preload.ts')];
      const child = Bun.spawn(
        [
          process.execPath,
          'test',
          ...argumentsBeforeFile,
          join(import.meta.dir, 'performance-processes.test.ts'),
          '--test-name-pattern',
          name,
        ],
        { cwd: process.cwd(), env: environment, stdout: 'ignore', stderr: 'pipe' },
      );
      const { exitCode, stderr } = await awaitPerformanceSupervisor(child, durationMs + 5_000);
      expect(exitCode, stderr).toBe(0);
      assertTestProcessIsNotSubreaper();
    },
    durationMs + 10_000,
  );
}

isolatedTest(
  'refuses missing child subreaper capability before launching',
  async () => {
    expect(() => createPerformanceProcessOwner()).toThrow(
      'child-subreaper setup or verification failed',
    );
    await Bun.sleep(0);
  },
  5_000,
  'subreaper-denied',
);

isolatedTest(
  'refuses missing pidfd_open capability before launching',
  async () => {
    expect(() => createPerformanceProcessOwner()).toThrow('pidfd_open failed');
    await Bun.sleep(0);
  },
  5_000,
  'pidfd-probe-denied',
);

isolatedTest(
  'refuses missing pidfd_send_signal capability before launching',
  async () => {
    expect(() => createPerformanceProcessOwner()).toThrow(
      'pidfd_send_signal capability unavailable',
    );
    await Bun.sleep(0);
  },
  5_000,
  'signal-probe-denied',
);

isolatedTest(
  'an orphaned separate-session descendant is killed and reaped without touching a foreign process',
  async () => {
    const foreign = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    const owner = createPerformanceProcessOwner();
    const marker = join(
      tmpdir(),
      `performance-orphan-${String(process.pid)}-${String(Date.now())}`,
    );
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
  },
  20_000,
);

isolatedTest(
  'immediately exiting wrapper leaves two separate-session adopted children for bounded TERM then KILL and waitpid',
  async () => {
    const foreign = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    const owner = createPerformanceProcessOwner();
    const prefix = join(
      tmpdir(),
      `performance-adopted-${String(process.pid)}-${String(Date.now())}`,
    );
    const listenerMarker = `${prefix}.listener`;
    const sleeperMarker = `${prefix}.sleeper`;
    const wrapper = owner.spawn(
      [
        'bash',
        '-c',
        `env -i PATH="${process.env['PATH'] ?? '/usr/bin:/bin'}" setsid bun --eval 'Bun.serve({port:10300,fetch(){return new Response("ready")}}); await Bun.write("${listenerMarker}", String(process.pid));' >/dev/null 2>&1 & ` +
          `env -i PATH="${process.env['PATH'] ?? '/usr/bin:/bin'}" setsid bash -c 'trap "" TERM; echo $$ > "${sleeperMarker}"; exec sleep 30' >/dev/null 2>&1 & exit 0`,
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
  },
  20_000,
);

isolatedTest(
  'converges after a wrapper exits with many adopted children',
  async () => {
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
  },
  20_000,
);

isolatedTest(
  'reaps an adopted zombie first inventoried after its wrapper exits',
  async () => {
    const owner = createPerformanceProcessOwner();
    const prefix = join(
      tmpdir(),
      `performance-late-zombie-${String(process.pid)}-${String(Date.now())}`,
    );
    const releasePath = `${prefix}.release`;
    const markerPath = `${prefix}.pid`;
    try {
      const wrapper = owner.spawn(
        [
          'bash',
          '-c',
          `while [ ! -e "${releasePath}" ]; do sleep 0.01; done; setsid bash -c 'echo $$ > "${markerPath}"; sleep 0.05' >/dev/null 2>&1 & exit 0`,
        ],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      await writeFile(releasePath, 'go');
      expect(await wrapper.exited).toBe(0);
      for (let poll = 0; poll < 100 && !(await Bun.file(markerPath).exists()); poll += 1)
        await Bun.sleep(10);
      const adoptedPid = Number((await readFile(markerPath, 'utf8')).trim());
      let sawZombie = false;
      for (let poll = 0; poll < 100; poll += 1) {
        const stat = await Bun.file(`/proc/${String(adoptedPid)}/stat`).text();
        if (stat.includes(') Z ')) {
          sawZombie = true;
          break;
        }
        await Bun.sleep(10);
      }
      expect(sawZombie).toBe(true);
      await owner.stop();
      expect(await Bun.file(`/proc/${String(adoptedPid)}/stat`).exists()).toBe(false);
    } finally {
      await Promise.all([rm(releasePath, { force: true }), rm(markerPath, { force: true })]);
    }
  },
  10_000,
);

isolatedTest(
  'converges while short-lived registered children exit during pidfd acquisition',
  async () => {
    const owner = createPerformanceProcessOwner();
    const children: Bun.Subprocess[] = [];
    for (let index = 0; index < 200; index += 1)
      children.push(
        owner.spawn(['true'], process.cwd(), { PATH: process.env['PATH'] ?? '/usr/bin:/bin' }),
      );
    await owner.stop();
    expect(children).toHaveLength(200);
    for (const child of children) expect(await child.exited).toBe(0);
  },
  20_000,
);

isolatedTest(
  'rescans after pidfd_open sees a verified transient exit',
  async () => {
    const owner = createPerformanceProcessOwner();
    const marker = join(
      tmpdir(),
      `performance-pidfd-vanish-${String(process.pid)}-${String(Date.now())}`,
    );
    let launchedPid = 0;
    try {
      const child = owner.spawn(
        ['bash', '-c', `echo $$ > "${marker}"; exec sleep 30`],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      launchedPid = child.pid;
      await owner.stop();
      expect(await Bun.file(`/proc/${String(launchedPid)}/stat`).exists()).toBe(false);
    } finally {
      if (launchedPid === 0) {
        for (let poll = 0; poll < 100 && !(await Bun.file(marker).exists()); poll += 1)
          await Bun.sleep(10);
        if (await Bun.file(marker).exists())
          launchedPid = Number((await readFile(marker, 'utf8')).trim());
      }
      if (launchedPid > 0 && (await Bun.file(`/proc/${String(launchedPid)}/stat`).exists()))
        process.kill(launchedPid, 'SIGKILL');
      await rm(marker, { force: true });
    }
  },
  10_000,
  'pidfd-vanish',
);

isolatedTest(
  'does not transfer direct ownership to a reused PID after verified launch disappearance',
  async () => {
    const owner = createPerformanceProcessOwner();
    const child = owner.spawn(['sleep', '30'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`PID identity changed for ${String(child.pid)}`);
      expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(true);
    } finally {
      if (await Bun.file(`/proc/${String(child.pid)}/stat`).exists()) child.kill('SIGKILL');
      await child.exited;
    }
  },
  11_000,
  'direct-reuse',
);

isolatedTest(
  'closes a pidfd when the identity recheck becomes unreadable',
  async () => {
    const countPidfds = (): number =>
      readdirSync('/proc/self/fd').filter((entry) => {
        try {
          return readlinkSync(`/proc/self/fd/${entry}`).includes('pidfd');
        } catch (cause) {
          if (
            typeof cause === 'object' &&
            cause !== null &&
            Reflect.get(cause, 'code') === 'ENOENT'
          )
            return false;
          throw cause;
        }
      }).length;
    const owner = createPerformanceProcessOwner();
    const before = countPidfds();
    expect(() =>
      owner.spawn(['sleep', '30'], process.cwd(), { PATH: process.env['PATH'] ?? '/usr/bin:/bin' }),
    ).toThrow('cannot read /proc identity');
    await owner.stop();
    expect(countPidfds()).toBe(before);
  },
  10_000,
  'pidfd-recheck-error',
);

isolatedTest(
  'refuses a changed owned PID identity while continuing to drain the established child',
  async () => {
    const owner = createPerformanceProcessOwner();
    const child = owner.spawn(['sleep', '30'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    process.env['PUNI_MUTATE_PID'] = String(child.pid);
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`PID identity changed for ${String(child.pid)}`);
      expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(false);
      expect(await child.exited).not.toBeNull();
    } finally {
      delete process.env['PUNI_MUTATE_PID'];
      if (await Bun.file(`/proc/${String(child.pid)}/stat`).exists()) child.kill('SIGKILL');
      await child.exited;
    }
  },
  10_000,
  'identity-reused',
);

isolatedTest(
  'does not signal foreign grandchildren below a reused owned PID',
  async () => {
    const owner = createPerformanceProcessOwner();
    const marker = join(
      tmpdir(),
      `performance-reused-tree-${String(process.pid)}-${String(Date.now())}`,
    );
    const grandchildScript = 'await Bun.sleep(30_000)';
    const childScript = `const child = Bun.spawn([process.execPath, '--eval', ${JSON.stringify(grandchildScript)}]); await Bun.write(${JSON.stringify(`${marker}.c`)}, String(child.pid)); await Bun.sleep(30_000);`;
    const rootScript = `const child = Bun.spawn([process.execPath, '--eval', ${JSON.stringify(childScript)}]); await Bun.write(${JSON.stringify(`${marker}.b`)}, String(child.pid)); await Bun.sleep(30_000);`;
    const wrapperScript = `const child = Bun.spawn([process.execPath, '--eval', ${JSON.stringify(rootScript)}]); await Bun.write(${JSON.stringify(`${marker}.a`)}, String(child.pid)); await Bun.sleep(30_000);`;
    const wrapper = owner.spawn([process.execPath, '--eval', wrapperScript], process.cwd(), {});
    const sibling = owner.spawn(['sleep', '30'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    const pids: number[] = [];
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await Bun.file(`${marker}.c`).exists()) break;
        await Bun.sleep(20);
      }
      for (const suffix of ['a', 'b', 'c'])
        pids.push(Number((await readFile(`${marker}.${suffix}`, 'utf8')).trim()));
      expect(pids.every((pid) => Number.isInteger(pid) && pid > 0)).toBe(true);
      const inventory = owner.spawn(['true'], process.cwd(), {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      });
      await inventory.exited;
      process.env['PUNI_MUTATE_PID'] = String(pids[0]);
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`PID identity changed for ${String(pids[0])}`);
      expect(await Bun.file(`/proc/${String(pids[0])}/stat`).exists()).toBe(true);
      expect(await Bun.file(`/proc/${String(pids[1])}/stat`).exists()).toBe(true);
      expect(await Bun.file(`/proc/${String(pids[2])}/stat`).exists()).toBe(true);
      expect(await Bun.file(`/proc/${String(sibling.pid)}/stat`).exists()).toBe(false);
    } finally {
      delete process.env['PUNI_MUTATE_PID'];
      for (const pid of pids)
        if (await Bun.file(`/proc/${String(pid)}/stat`).exists()) process.kill(pid, 'SIGKILL');
      if (await Bun.file(`/proc/${String(wrapper.pid)}/stat`).exists()) wrapper.kill('SIGKILL');
      if (await Bun.file(`/proc/${String(sibling.pid)}/stat`).exists()) sibling.kill('SIGKILL');
      await wrapper.exited;
      await sibling.exited;
      await Promise.all(
        ['a', 'b', 'c'].map((suffix) => rm(`${marker}.${suffix}`, { force: true })),
      );
    }
  },
  12_000,
  'owned-root-reuse',
);

isolatedTest(
  'refuses a cyclic process-inventory ancestry while draining an independent sibling',
  async () => {
    const owner = createPerformanceProcessOwner();
    const marker = join(tmpdir(), `performance-cycle-${String(process.pid)}-${String(Date.now())}`);
    const wrapper = owner.spawn(
      ['bash', '-c', `sleep 5 & echo $! > "${marker}"; exit 0`],
      process.cwd(),
      {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      },
    );
    const sibling = owner.spawn(['sleep', '5'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    await wrapper.exited;
    const cyclicPid = Number((await readFile(marker, 'utf8')).trim());
    process.env['PUNI_CYCLE_PID'] = String(cyclicPid);
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`PID ancestry cycle for ${String(cyclicPid)}`);
      expect(await Bun.file(`/proc/${String(cyclicPid)}/stat`).exists()).toBe(true);
      expect(await Bun.file(`/proc/${String(sibling.pid)}/stat`).exists()).toBe(false);
    } finally {
      delete process.env['PUNI_CYCLE_PID'];
      if (await Bun.file(`/proc/${String(cyclicPid)}/stat`).exists())
        process.kill(cyclicPid, 'SIGKILL');
      if (await Bun.file(`/proc/${String(sibling.pid)}/stat`).exists()) sibling.kill('SIGKILL');
      await sibling.exited;
      await rm(marker, { force: true });
    }
  },
  3_000,
  'ancestry-cycle',
);

isolatedTest(
  'refuses a changed PID identity at signal time and still drains the child',
  async () => {
    const owner = createPerformanceProcessOwner();
    const child = owner.spawn(['sleep', '30'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    process.env['PUNI_MUTATE_PID'] = String(child.pid);
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`PID ownership changed for ${String(child.pid)}`);
      expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(false);
      expect(await child.exited).not.toBeNull();
    } finally {
      delete process.env['PUNI_MUTATE_PID'];
      if (await Bun.file(`/proc/${String(child.pid)}/stat`).exists()) child.kill('SIGKILL');
      await child.exited;
    }
  },
  10_000,
  'signal-identity-reused',
);

isolatedTest(
  'continues cleanup of sibling processes after one pidfd signal fault',
  async () => {
    const owner = createPerformanceProcessOwner();
    const children = [
      owner.spawn(['sleep', '30'], process.cwd(), { PATH: process.env['PATH'] ?? '/usr/bin:/bin' }),
      owner.spawn(['sleep', '30'], process.cwd(), { PATH: process.env['PATH'] ?? '/usr/bin:/bin' }),
    ];
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain('pidfd_send_signal failed');
      for (const child of children)
        expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(false);
    } finally {
      for (const child of children) {
        if (await Bun.file(`/proc/${String(child.pid)}/stat`).exists()) child.kill('SIGKILL');
        await child.exited;
      }
    }
  },
  12_000,
  'first-signal',
);

isolatedTest(
  'drains an adopted listener and TERM-resistant sibling after signal fault',
  async () => {
    const owner = createPerformanceProcessOwner();
    const prefix = join(
      tmpdir(),
      `performance-fault-descendants-${String(process.pid)}-${String(Date.now())}`,
    );
    const listenerMarker = `${prefix}.listener`;
    const sleeperMarker = `${prefix}.sleeper`;
    let listenerPid = 0;
    let sleeperPid = 0;
    try {
      const wrapper = owner.spawn(
        [
          'bash',
          '-c',
          `env -i PATH="${process.env['PATH'] ?? '/usr/bin:/bin'}" setsid bun --eval 'Bun.serve({port:10301,fetch(){return new Response("ready")}}); await Bun.write("${listenerMarker}", String(process.pid));' >/dev/null 2>&1 & ` +
            `env -i PATH="${process.env['PATH'] ?? '/usr/bin:/bin'}" setsid bash -c 'trap "" TERM; echo $$ > "${sleeperMarker}"; exec sleep 30' >/dev/null 2>&1 & exit 0`,
        ],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      expect(await wrapper.exited).toBe(0);
      for (let poll = 0; poll < 100; poll += 1) {
        if ((await Bun.file(listenerMarker).exists()) && (await Bun.file(sleeperMarker).exists()))
          break;
        await Bun.sleep(20);
      }
      listenerPid = Number((await readFile(listenerMarker, 'utf8')).trim());
      sleeperPid = Number((await readFile(sleeperMarker, 'utf8')).trim());
      const started = Date.now();
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain('pidfd_send_signal failed');
      expect(String(failure)).not.toContain('did not converge');
      expect(Date.now() - started).toBeLessThan(8_000);
      for (const pid of [listenerPid, sleeperPid])
        expect(await Bun.file(`/proc/${String(pid)}/stat`).exists()).toBe(false);
      const listener = createServer();
      await new Promise<void>((accept, reject) => {
        listener.once('error', reject);
        listener.listen(10301, '127.0.0.1', accept);
      });
      await new Promise<void>((accept, reject) =>
        listener.close((cause) => {
          if (cause) reject(cause);
          else accept();
        }),
      );
    } finally {
      for (const pid of [listenerPid, sleeperPid])
        if (pid > 0 && (await Bun.file(`/proc/${String(pid)}/stat`).exists()))
          process.kill(pid, 'SIGKILL');
      await Promise.all([rm(listenerMarker, { force: true }), rm(sleeperMarker, { force: true })]);
    }
  },
  15_000,
  'first-signal',
);

isolatedTest(
  'records an injected adopted waitpid ECHILD and still reaps that zombie',
  async () => {
    const owner = createPerformanceProcessOwner();
    const marker = join(
      tmpdir(),
      `performance-waitpid-fault-${String(process.pid)}-${String(Date.now())}`,
    );
    try {
      const wrapper = owner.spawn(
        [
          'bash',
          '-c',
          `setsid bash -c 'echo $$ > "${marker}"; sleep 0.05' >/dev/null 2>&1 & exit 0`,
        ],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      expect(await wrapper.exited).toBe(0);
      for (let poll = 0; poll < 100 && !(await Bun.file(marker).exists()); poll += 1)
        await Bun.sleep(10);
      const adoptedPid = Number((await readFile(marker, 'utf8')).trim());
      for (let poll = 0; poll < 100; poll += 1) {
        const stat = await Bun.file(`/proc/${String(adoptedPid)}/stat`).text();
        if (stat.includes(') Z ')) break;
        await Bun.sleep(10);
      }
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(`waitpid failed for adopted ${String(adoptedPid)}`);
      expect(String(failure)).toContain('errno=10');
      expect(String(failure)).not.toContain('did not converge');
      expect(await Bun.file(`/proc/${String(adoptedPid)}/stat`).exists()).toBe(false);
    } finally {
      await rm(marker, { force: true });
    }
  },
  10_000,
  'waitpid-echild',
);

isolatedTest(
  'continues draining established children after one global process-inventory ambiguity',
  async () => {
    const owner = createPerformanceProcessOwner();
    const children = [
      owner.spawn(['sleep', '30'], process.cwd(), { PATH: process.env['PATH'] ?? '/usr/bin:/bin' }),
      owner.spawn(['bash', '-c', 'trap "" TERM; exec sleep 30'], process.cwd(), {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      }),
    ];
    try {
      const failure: unknown = await owner.stop().then(
        () => new Error('cleanup unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain('injected /proc inventory ambiguity');
      expect(String(failure)).not.toContain('did not converge');
      for (const child of children) {
        expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(false);
        expect(await child.exited).not.toBeNull();
      }
    } finally {
      for (const child of children)
        if (await Bun.file(`/proc/${String(child.pid)}/stat`).exists()) child.kill('SIGKILL');
      await Promise.all(children.map((child) => child.exited));
    }
  },
  12_000,
  'inventory-on-stop',
);

isolatedTest(
  'retries a zombie adopted child when waitpid WNOHANG says not yet waitable',
  async () => {
    const owner = createPerformanceProcessOwner();
    const marker = join(
      tmpdir(),
      `performance-waitpid-zero-${String(process.pid)}-${String(Date.now())}`,
    );
    try {
      const wrapper = owner.spawn(
        [
          'bash',
          '-c',
          `setsid bash -c 'echo $$ > "${marker}"; sleep 0.05' >/dev/null 2>&1 & exit 0`,
        ],
        process.cwd(),
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      );
      expect(await wrapper.exited).toBe(0);
      for (let poll = 0; poll < 100 && !(await Bun.file(marker).exists()); poll += 1)
        await Bun.sleep(10);
      const adoptedPid = Number((await readFile(marker, 'utf8')).trim());
      for (let poll = 0; poll < 100; poll += 1) {
        const stat = await Bun.file(`/proc/${String(adoptedPid)}/stat`).text();
        if (stat.includes(') Z ')) break;
        await Bun.sleep(10);
      }
      await owner.stop();
      expect(await Bun.file(`/proc/${String(adoptedPid)}/stat`).exists()).toBe(false);
    } finally {
      await rm(marker, { force: true });
    }
  },
  10_000,
  'waitpid-zero',
);

isolatedTest(
  'reaps an unwaited child of a long-lived Bun runner after stopping its parent',
  async () => {
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
  },
  30_000,
);

test('leaves a later unrelated Bun-owned child alive outside the supervisor', async () => {
  const coordinationRoot =
    process.env['PUNI_FOREIGN_COORDINATION_ROOT'] ??
    (await mkdtemp(join(tmpdir(), 'performance-foreign-')));
  const readyPath = join(coordinationRoot, 'ready');
  const continuePath = join(coordinationRoot, 'continue');
  if (process.env['PUNI_PERFORMANCE_OWNER_TEST_CHILD'] === '1') {
    const owner = createPerformanceProcessOwner();
    await writeFile(readyPath, 'ready');
    for (let poll = 0; poll < 200 && !(await Bun.file(continuePath).exists()); poll += 1)
      await Bun.sleep(10);
    if (!(await Bun.file(continuePath).exists()))
      throw new Error('foreign-child synchronization timed out');
    await owner.stop();
    return;
  }
  assertTestProcessIsNotSubreaper();
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  environment['PUNI_PERFORMANCE_OWNER_TEST_CHILD'] = '1';
  environment['PUNI_FOREIGN_COORDINATION_ROOT'] = coordinationRoot;
  const supervisor = Bun.spawn(
    [
      process.execPath,
      'test',
      join(import.meta.dir, 'performance-processes.test.ts'),
      '--test-name-pattern',
      'later unrelated Bun-owned child alive outside the supervisor',
    ],
    { cwd: process.cwd(), env: environment, stdout: 'ignore', stderr: 'pipe' },
  );
  let foreign: Bun.Subprocess | undefined;
  try {
    for (let poll = 0; poll < 200 && !(await Bun.file(readyPath).exists()); poll += 1)
      await Bun.sleep(10);
    expect(await Bun.file(readyPath).exists()).toBe(true);
    foreign = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    await writeFile(continuePath, 'go');
    const { exitCode, stderr } = await awaitPerformanceSupervisor(supervisor, 15_000);
    expect(exitCode, stderr).toBe(0);
    expect(await Bun.file(`/proc/${String(foreign.pid)}/stat`).exists()).toBe(true);
    assertTestProcessIsNotSubreaper();
  } finally {
    if (foreign !== undefined) {
      foreign.kill('SIGKILL');
      await foreign.exited;
    }
    await rm(coordinationRoot, { recursive: true, force: true });
  }
}, 20_000);

isolatedTest(
  'bounds an unresolved Bun child exit promise after its PID is gone',
  async () => {
    const owner = createPerformanceProcessOwner();
    const child = owner.spawn(['sleep', '30'], process.cwd(), {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    });
    const outcome = await Promise.race([
      owner.stop().then(
        () => 'unexpected success',
        (failure: unknown) => String(failure),
      ),
      Bun.sleep(9_500).then(() => 'cleanup waited indefinitely'),
    ]);
    expect(outcome).toContain('cleanup did not converge');
    expect(await Bun.file(`/proc/${String(child.pid)}/stat`).exists()).toBe(false);
  },
  11_000,
  'unresolved-direct',
);

isolatedTest(
  'drains a noisy supervisor stderr before awaiting exit',
  async () => {
    writeSync(2, Buffer.alloc(1_000_000, 120));
    await Bun.sleep(0);
  },
  5_000,
);
