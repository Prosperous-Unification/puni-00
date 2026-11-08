import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

/** Native process/HTTP ports are modeled; the helper must retain and stop its identical returned child capability. */
for (const fault of [
  'none',
  'exit-rejected',
  'natural-exit',
  'drain-pending',
  'root',
  'pid1',
  'selector',
  'path',
  'artifact',
  'config',
  'uid',
  'gid',
  'state',
  'parent',
  'group',
  'executable',
  'argv',
  'start-race',
  'listener',
  'http',
  'group-live',
  'group-access',
  'signal-error',
  'drain-error',
  'lifetime-error',
  'signal-mismatch',
  'stop-zero',
  'start-change',
  'connection-once',
  'connection-deadline',
  'fetch-access',
  'setup-close-error',
  'stop-required',
  'pid-invalid',
  'proc-access',
  'proc-missing',
] as const)
  test(`pressure writer is live before requested stop and confirms terminal group ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-pressure-writer.fixture.ts', import.meta.url),
      'utf8',
    );
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source
        .slice(source.indexOf('export async function startRegistryPressureWriter'))
        .replace('export ', '') + '\nreturn startRegistryPressureWriter;',
    );
    const signals: string[] = [];
    let terminal = false;
    let spawned = 0,
      configured = 0,
      startReads = 0,
      fetches = 0,
      clock = 0;
    const stopFailure = new Error('private stop failure');
    let drainRescued = false;
    const requestedTimers: number[] = [];
    const drainRescue = new Promise<void>((resolve) => {
      if (fault === 'drain-pending')
        setTimeout(() => {
          drainRescued = true;
          resolve();
        }, 50);
      else resolve();
    });
    let finish: (code: number) => void = () => {
      throw new Error('Missing owned exit promise');
    };
    let rejectExit: (cause: Error) => void = () => {
      throw new Error('Missing exit rejection');
    };
    const failure = new Error('private native exit observation failure');
    const exited = new Promise<number>((resolve, reject) => {
      finish = resolve;
      rejectExit = reject;
    });
    const child = {
      pid: fault === 'pid-invalid' ? 0 : 42,
      exitCode: null,
      exited,
      signalCode: null as string | null,
      stdout: new ReadableStream({
        start: (c) => {
          c.close();
        },
      }),
      stderr: new ReadableStream({
        start: (c) => {
          c.close();
        },
      }),
      kill: (signal: string) => {
        signals.push(signal);
        terminal = true;
        child.signalCode = fault === 'signal-mismatch' ? 'SIGKILL' : signal;
        finish(fault === 'stop-zero' ? 0 : 143);
        if (fault === 'signal-error') throw stopFailure;
      },
    };
    const binary = '/usr/local/libexec/puni-registry-maintenance/registry';
    const configuration = '/etc/puni/registry-pressure-writer.json';
    const fields = [
      fault === 'state' ? 'Z' : 'S',
      fault === 'parent' ? '2' : '1',
      fault === 'group' ? '99' : '42',
      ...Array.from({ length: 16 }, () => '0'),
      '123',
    ];
    const reads: string[] = [];
    // Boundary: extracted local source with explicit modeled native ports, never external code.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'Bun',
      'process',
      'readFile',
      'readlink',
      'writeFile',
      'chmod',
      'verifyRegistryHostArtifact',
      'awaitMaintenanceChild',
      'assertRegistryMaintenanceListener',
      'consumeRegistryStream',
      'readRegistryFixtureStart',
      'fetch',
      'setTimeout',
      'Date',
      body,
    ) as (...ports: unknown[]) => (installed: unknown) => Promise<{
      pid: number;
      startTicks: string;
      assertLive: () => Promise<unknown>;
      close: () => Promise<unknown>;
    }>;
    const start = compile(
      {
        spawn: (argv: string[], options: unknown) => {
          spawned++;
          expect(argv).toEqual([binary, 'serve', configuration]);
          expect(options).toMatchObject({ uid: 59001, gid: 59001, detached: true });
          if (fault === 'exit-rejected') rejectExit(failure);
          if (fault === 'natural-exit') {
            terminal = true;
            finish(0);
          }
          return child;
        },
        sleep: () => {
          clock += 2000;
          if (clock > 12000) throw new Error('Explicit readiness loop rescue');
          return Promise.resolve();
        },
      },
      {
        pid: fault === 'pid1' ? 2 : 1,
        getuid: () => (fault === 'root' ? 1 : 0),
        kill: () => {
          if (fault === 'group-access' || fault === 'setup-close-error')
            throw Object.assign(stopFailure, { code: 'EPERM' });
          if (fault === 'group-live') return;
          if (terminal) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        },
      },
      (path: string) => {
        reads.push(path);
        if (path === '/proc/1/cmdline')
          return Promise.resolve(
            fault === 'selector'
              ? 'foreign'
              : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
          );
        if (path.endsWith('/stat') && (fault === 'proc-access' || fault === 'proc-missing'))
          return Promise.reject(
            Object.assign(failure, { code: fault === 'proc-access' ? 'EACCES' : 'ENOENT' }),
          );
        if (path.endsWith('/stat'))
          return Promise.resolve('42 (registry) ' + fields.join(' ') + '\n');
        if (path.endsWith('/status'))
          return Promise.resolve(
            'Uid:\t' +
              Array(4)
                .fill(fault === 'uid' ? '0' : '59001')
                .join('\t') +
              '\nGid:\t' +
              Array(4)
                .fill(fault === 'gid' ? '0' : '59001')
                .join('\t') +
              '\n',
          );
        if (path.endsWith('/cmdline'))
          return Promise.resolve(
            binary + '\0serve\0' + (fault === 'argv' ? '/foreign' : configuration) + '\0',
          );
        throw new Error('Unexpected read');
      },
      () => Promise.resolve(fault === 'executable' ? '/foreign' : binary),
      (path: string, _bytes: string, options: unknown) => {
        configured++;
        if (fault === 'config') return Promise.reject(failure);
        expect(path).toBe(configuration);
        expect(options).toMatchObject({ flag: 'wx' });
        return Promise.resolve();
      },
      () => Promise.resolve(),
      () =>
        fault === 'artifact' ? Promise.reject(failure) : Promise.resolve(Buffer.from('verified')),
      async (actual: unknown) => {
        expect(actual).toBe(child);
        const code = await exited;
        if (fault === 'lifetime-error') throw stopFailure;
        if (code !== 0)
          throw new Error('Fixed maintenance child failed (exit ' + String(code) + ')');
      },
      (pid: number) => {
        expect(pid).toBe(42);
        return fault === 'listener' || fault === 'setup-close-error'
          ? Promise.reject(failure)
          : Promise.resolve();
      },
      () => (fault === 'drain-error' ? Promise.reject(failure) : drainRescue),
      () => {
        startReads++;
        return (fault === 'start-race' && startReads === 2) ||
          (fault === 'start-change' && startReads > 2)
          ? '124'
          : '123';
      },
      () => {
        fetches++;
        if (fault === 'fetch-access')
          return Promise.reject(Object.assign(failure, { code: 'EACCES' }));
        if (fault === 'connection-deadline' || (fault === 'connection-once' && fetches === 1))
          return Promise.reject(
            Object.assign(new Error('not listening'), { code: 'ECONNREFUSED' }),
          );
        return Promise.resolve(new Response('', { status: fault === 'http' ? 503 : 200 }));
      },
      (callback: () => void, milliseconds: number) => {
        requestedTimers.push(milliseconds);
        return setTimeout(callback, fault === 'drain-pending' ? 5 : milliseconds);
      },
      { now: () => clock },
    );
    const pending = start({
      distribution: { path: binary, sha256: 'a'.repeat(64) },
      ordinary: {
        path: fault === 'path' ? '/foreign' : '/var/lib/puni-registry/registry/contents',
      },
    });
    if (
      [
        'exit-rejected',
        'natural-exit',
        'root',
        'pid1',
        'selector',
        'path',
        'artifact',
        'config',
        'uid',
        'gid',
        'state',
        'parent',
        'group',
        'executable',
        'argv',
        'start-race',
        'listener',
        'http',
        'fetch-access',
        'connection-deadline',
        'setup-close-error',
        'pid-invalid',
        'proc-access',
        'proc-missing',
      ].includes(fault)
    ) {
      let refused: unknown;
      try {
        await pending;
      } catch (cause) {
        refused = cause;
      }
      if (fault === 'pid-invalid') {
        expect(reads).toEqual(['/proc/1/cmdline']);
        expect(signals).toEqual([]);
        expect(refused).toBeInstanceOf(Error);
        return;
      }
      if (fault === 'proc-access' || fault === 'proc-missing')
        expect((refused as AggregateError).cause).toBe(failure);
      expect(refused).toBeInstanceOf(Error);
      const beforeSpawn = ['root', 'pid1', 'selector', 'path', 'artifact', 'config'].includes(
        fault,
      );
      expect(signals).toEqual(beforeSpawn || fault === 'natural-exit' ? [] : ['SIGTERM']);
      if (beforeSpawn) {
        expect(spawned).toBe(0);
        if (fault !== 'config') expect(configured).toBe(0);
      } else expect(terminal).toBe(true);
      if (fault === 'exit-rejected') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toContain(failure);
      }
      if (fault === 'connection-deadline') expect(fetches).toBe(5);
      if (fault === 'fetch-access') {
        expect(fetches).toBe(1);
        expect((refused as AggregateError).cause).toBe(failure);
      }
      if (fault === 'setup-close-error') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).cause).toBe(failure);
        expect((refused as AggregateError).errors).toEqual([failure, stopFailure]);
      }
      return;
    }
    const writer = await pending;
    expect(writer).toMatchObject({ pid: 42, startTicks: '123' });
    if (fault === 'start-change') {
      let refused: unknown;
      try {
        await writer.assertLive();
      } catch (cause) {
        refused = cause;
      } finally {
        await writer.close();
      }
      expect(refused).toBeInstanceOf(Error);
      return;
    }
    if (fault === 'connection-once') expect(fetches).toBe(2);
    await writer.assertLive();
    expect(signals).toEqual([]);
    if (fault === 'drain-pending') {
      let refused: unknown;
      try {
        await writer.close();
      } catch (cause) {
        refused = cause;
      }
      try {
        expect(drainRescued).toBe(false);
        expect(refused).toBeInstanceOf(Error);
        expect(requestedTimers).toEqual([5000]);
        expect(signals).toEqual(['SIGTERM']);
        expect(terminal).toBe(true);
      } finally {
        await drainRescue;
      }
      return;
    }
    if (
      [
        'group-live',
        'group-access',
        'signal-error',
        'drain-error',
        'lifetime-error',
        'signal-mismatch',
      ].includes(fault)
    ) {
      let refused: unknown;
      try {
        await writer.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(Error);
      expect(signals).toEqual(['SIGTERM']);
      if (fault === 'signal-error' || fault === 'lifetime-error') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toContain(stopFailure);
      }
      if (fault === 'drain-error') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toContain(failure);
      }
      return;
    }
    if (fault === 'stop-required') {
      let terminalRescued = false;
      const rescue = setTimeout(() => {
        terminalRescued = true;
        terminal = true;
        child.signalCode = 'SIGTERM';
        finish(143);
      }, 50);
      try {
        await writer.close();
        expect(terminalRescued).toBe(false);
        expect(signals).toEqual(['SIGTERM']);
      } finally {
        clearTimeout(rescue);
      }
      return;
    }
    expect(await writer.close()).toEqual({
      pid: 42,
      startTicks: '123',
      exitCode: fault === 'stop-zero' ? 0 : 143,
      signal: 'SIGTERM',
      groupAbsent: true,
    });
    await writer.close();
    expect(signals).toEqual(['SIGTERM']);
    expect(reads).toContain('/proc/42/cmdline');
  });
