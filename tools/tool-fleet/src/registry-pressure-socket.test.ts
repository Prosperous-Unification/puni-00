import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { createRegistryPressureStop } from './registry-pressure-stop.fixture';
import { readRegistryBytes } from './registry-stream';

for (const fault of [
  'none',
  'root',
  'pid1',
  'topology',
  'path',
  'parent-type',
  'parent-owner',
  'parent-mode',
  'parent-missing',
  'existing',
  'socket-access',
  'socket-type',
  'socket-owner',
  'socket-mode',
  'socket-device',
  'chmod',
  'stop-error',
  'socket-remains',
  'method',
  'route',
  'extra',
  'body-bound',
  'body-missing',
  'selection',
  'ack-error',
  'arm-invalid',
  'held-close',
  'body-timeout',
  'ack-timeout',
  'concurrent',
  'request-cleanup-error',
  'close-error',
  'epoch-change',
] as const)
  test(`root socket holds selected response through exact owned closure ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-pressure-socket.fixture.ts', import.meta.url),
      'utf8',
    );
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source
        .slice(source.indexOf('export async function startRegistryPressureBridge'))
        .replace('export ', '') + '\nreturn startRegistryPressureBridge;',
    );
    const directory = '/root/task8-fixture',
      socket = directory + '/pressure-stop.sock';
    let listening = false,
      closed = false;
    const events: string[] = [];
    let listens = 0,
      permissionChanges = 0;
    const failure = Object.assign(new Error('private socket boundary failure'), { code: 'EACCES' });
    const cleanupFailure = new Error('private owned close failure');
    let respond: (request: Request) => Promise<Response> = () =>
      Promise.reject(new Error('Missing fixed socket handler'));
    const instance = '11111111-1111-4111-8111-111111111111',
      boot = '22222222-2222-4222-8222-222222222222',
      record = `${instance} ${boot}\n`,
      prior = `33333333-3333-4333-8333-333333333333 ${instance} ${boot}\n`,
      current = `44444444-4444-4444-8444-444444444444 ${instance} ${boot}\n`;
    const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
    let releaseClose: () => void = () => {
      throw new Error('Missing close release');
    };
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    let ackSignal: AbortSignal | undefined;
    let rescueUsed = false,
      timeoutRequested = false;
    let rescueTimer: ReturnType<typeof setTimeout> | undefined;
    const writer = {
      pid: 42,
      startTicks: '123',
      assertLive: () => {
        events.push('live');
        return Promise.resolve({ pid: 42, startTicks: '123' });
      },
      close: () => {
        if (!closed) events.push('writer-close');
        closed = true;
        if (fault === 'request-cleanup-error' || fault === 'close-error')
          return Promise.reject(cleanupFailure);
        return (fault === 'held-close' ? closeGate : Promise.resolve()).then(() => ({
          pid: 42,
          startTicks: '123',
          exitCode: 143,
          signal: 'SIGTERM',
          groupAbsent: true as const,
        }));
      },
    };
    type Writer = typeof writer;
    // Boundary: extracted owned fixture code executes with modeled socket/metadata ports and real request parser/coordinator.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'lstat',
      'chmod',
      'Bun',
      'type',
      'createRegistryPressureStop',
      'readRegistryPressureRecord',
      'readRegistryBytes',
      'setTimeout',
      'clearTimeout',
      body,
    ) as (...ports: unknown[]) => (
      installed: unknown,
      acknowledge: (signal: AbortSignal) => Promise<unknown>,
    ) => Promise<{
      arm: (
        writer: Writer,
        arm: Parameters<ReturnType<typeof createRegistryPressureStop>['arm']>[0],
      ) => void;
      close: () => Promise<void>;
      receipt: () => unknown;
    }>;
    const start = compile(
      { pid: fault === 'pid1' ? 2 : 1, getuid: () => (fault === 'root' ? 1 : 0) },
      () =>
        Promise.resolve(
          fault === 'topology'
            ? 'foreign'
            : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (path: string) => {
        if (path === directory && fault === 'parent-missing')
          return Promise.reject(Object.assign(failure, { code: 'ENOENT' }));
        if (path === socket && fault === 'socket-access') return Promise.reject(failure);
        if (
          path === socket &&
          !listening &&
          fault !== 'existing' &&
          !(fault === 'socket-remains' && listens > 0)
        )
          return Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' }));
        return Promise.resolve({
          uid:
            (path === directory && fault === 'parent-owner') ||
            (path === socket && fault === 'socket-owner')
              ? 1
              : 0,
          gid: 0,
          mode:
            path === directory
              ? fault === 'parent-mode'
                ? 0o40755
                : 0o40700
              : fault === 'socket-mode'
                ? 0o140644
                : 0o140600,
          isDirectory: () => path === directory && fault !== 'parent-type',
          isSocket: () => path === socket && fault !== 'socket-type',
          dev: path === socket && fault === 'socket-device' ? 2 : 1,
          ino: path === directory ? 10 : 11,
        });
      },
      (path: string, mode: number) => {
        permissionChanges++;
        if (fault === 'chmod') return Promise.reject(failure);
        expect(path).toBe(socket);
        expect(mode).toBe(0o600);
        return Promise.resolve();
      },
      {
        serve: (options: { unix: string; fetch: typeof respond }) => {
          listens++;
          expect(options.unix).toBe(socket);
          respond = options.fetch;
          listening = true;
          return {
            stop: (force: boolean) => {
              expect(force).toBe(true);
              events.push('socket-close');
              listening = fault === 'stop-error';
              return fault === 'stop-error' ? Promise.reject(failure) : Promise.resolve();
            },
          };
        },
      },
      type,
      createRegistryPressureStop,
      () => Promise.resolve(current),
      readRegistryBytes,
      (callback: () => void, milliseconds: number) => {
        expect(milliseconds).toBe(10000);
        timeoutRequested = true;
        return setTimeout(
          callback,
          fault === 'body-timeout' || fault === 'ack-timeout' ? 5 : milliseconds,
        );
      },
      clearTimeout,
    );
    const pendingBridge = start(
      {
        ordinary: {
          path: fault === 'path' ? '/foreign' : '/var/lib/puni-registry/registry/contents',
        },
      },
      (signal) => {
        events.push('ack');
        ackSignal = signal;
        if (fault === 'ack-timeout' || fault === 'concurrent')
          return new Promise((resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(signal.reason as Error);
              },
              { once: true },
            );
            rescueTimer = setTimeout(() => {
              rescueUsed = true;
              reject(new Error('Independent modeled ACK rescue'));
            }, 50);
          });
        if (fault === 'ack-error' || fault === 'request-cleanup-error')
          return Promise.reject(failure);
        return Promise.resolve({
          allocation: 'ENOSPC',
          stage: 'open',
          instanceSha256: hash(record),
          requestSha256: hash(current),
        });
      },
    );
    if (
      [
        'root',
        'pid1',
        'topology',
        'path',
        'parent-type',
        'parent-owner',
        'parent-mode',
        'parent-missing',
        'existing',
        'socket-access',
        'socket-type',
        'socket-owner',
        'socket-mode',
        'socket-device',
        'chmod',
      ].includes(fault)
    ) {
      let refused: unknown;
      try {
        await pendingBridge;
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(Error);
      if (
        ['socket-type', 'socket-owner', 'socket-mode', 'socket-device', 'chmod'].includes(fault)
      ) {
        expect(listens).toBe(1);
        expect(events).toEqual(['socket-close']);
        expect(listening).toBe(false);
      } else {
        expect(listens).toBe(0);
        expect(permissionChanges).toBe(0);
      }
      return;
    }
    const bridge = await pendingBridge;
    const request = () =>
      new Request('http://localhost/stop', {
        method: 'POST',
        body: JSON.stringify({ uid: 'Deployment-registry', resourceVersion: '2' }),
      });
    expect(await (await respond(request())).json()).toEqual({ scope: 'bootstrap' });
    expect(events).toEqual([]);
    if (fault === 'arm-invalid') {
      let original: unknown;
      try {
        bridge.arm(writer, {
          uid: 'Deployment-registry',
          resourceVersion: '2',
          instance: 'bad',
          priorRequest: prior,
        });
      } catch (cause) {
        original = cause;
      }
      expect(original).toBeInstanceOf(Error);
      const response = await respond(request());
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ scope: 'failed' });
      expect(() => bridge.receipt()).toThrow();
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toContain(original);
      expect(events).toEqual(['writer-close', 'socket-close']);
      expect(listening).toBe(false);
      return;
    }
    let staleResponse: Promise<Response> | undefined;
    let releaseBody: () => void = () => {
      throw new Error('Missing body release');
    };
    if (fault === 'epoch-change')
      staleResponse = respond(
        new Request('http://localhost/stop', {
          method: 'POST',
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              releaseBody = () => {
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({ uid: 'Deployment-registry', resourceVersion: '2' }),
                  ),
                );
                controller.close();
              };
            },
          }),
        }),
      );
    bridge.arm(writer, {
      uid: 'Deployment-registry',
      resourceVersion: '2',
      instance: record,
      priorRequest: prior,
    });
    if (fault === 'epoch-change') {
      releaseBody();
      expect((await staleResponse)?.status).toBe(500);
      expect(events).toEqual([]);
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      expect(events).toEqual(['writer-close', 'socket-close']);
      return;
    }
    if (fault === 'request-cleanup-error' || fault === 'close-error') {
      if (fault === 'request-cleanup-error') expect((await respond(request())).status).toBe(500);
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      const causes: unknown[] = [];
      const visit = (cause: unknown) => {
        causes.push(cause);
        if (cause instanceof AggregateError) for (const nested of cause.errors) visit(nested);
      };
      visit(refused);
      expect(causes).toContain(cleanupFailure);
      if (fault === 'request-cleanup-error') expect(causes).toContain(failure);
      expect(events).toContain('socket-close');
      expect(listening).toBe(false);
      return;
    }
    if (fault === 'held-close') {
      let settled = false;
      const response = respond(request()).then((value) => {
        settled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const premature = settled;
      const beforeRelease = [...events];
      releaseClose();
      const completed = await response;
      await bridge.close();
      expect(beforeRelease).toEqual(['live', 'ack', 'writer-close']);
      expect(premature).toBe(false);
      expect(completed.status).toBe(200);
      expect(events).toEqual(['live', 'ack', 'writer-close', 'socket-close']);
      return;
    }
    if (fault === 'body-timeout' || fault === 'ack-timeout' || fault === 'concurrent') {
      let selected = request();
      if (fault === 'body-timeout')
        selected = new Request('http://localhost/stop', {
          method: 'POST',
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              rescueTimer = setTimeout(() => {
                rescueUsed = true;
                controller.close();
              }, 50);
            },
          }),
        });
      const response = respond(selected);
      if (fault === 'concurrent') {
        for (let attempt = 0; attempt < 20 && ackSignal === undefined; attempt++)
          await new Promise((resolve) => setTimeout(resolve, 1));
        expect(ackSignal).toBeDefined();
        const captured = ackSignal;
        expect((await respond(request())).status).toBe(500);
        expect(ackSignal).toBe(captured);
        expect(captured?.aborted).toBe(true);
      }
      expect((await response).status).toBe(500);
      clearTimeout(rescueTimer);
      expect(rescueUsed).toBe(false);
      expect(timeoutRequested).toBe(true);
      if (fault !== 'body-timeout') expect(ackSignal?.aborted).toBe(true);
      expect(() => bridge.receipt()).toThrow();
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      expect(events).toEqual(
        fault === 'body-timeout'
          ? ['writer-close', 'socket-close']
          : ['live', 'ack', 'writer-close', 'socket-close'],
      );
      expect(listening).toBe(false);
      return;
    }
    if (
      ['method', 'route', 'extra', 'body-bound', 'body-missing', 'selection', 'ack-error'].includes(
        fault,
      )
    ) {
      const serialized = JSON.stringify({
        uid: fault === 'selection' ? 'foreign' : 'Deployment-registry',
        resourceVersion: '2',
        ...(fault === 'extra' ? { extra: true } : {}),
      });
      const selected = new Request(
        fault === 'route' ? 'http://localhost/foreign' : 'http://localhost/stop',
        {
          method: fault === 'method' ? 'PUT' : 'POST',
          ...(fault === 'body-missing'
            ? {}
            : { body: (fault === 'body-bound' ? ' '.repeat(4096) : '') + serialized }),
        },
      );
      const response = await respond(selected);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ scope: 'failed' });
      expect(() => bridge.receipt()).toThrow();
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      if (fault === 'ack-error') expect((refused as AggregateError).errors).toContain(failure);
      expect(events).toEqual(
        fault === 'ack-error'
          ? ['live', 'ack', 'writer-close', 'socket-close']
          : ['writer-close', 'socket-close'],
      );
      expect(listening).toBe(false);
      return;
    }
    expect((await respond(request())).status).toBe(200);
    expect(events).toEqual(['live', 'ack', 'writer-close']);
    expect(bridge.receipt()).toMatchObject({ scope: 'pressure', pid: 42 });
    if (fault === 'stop-error' || fault === 'socket-remains') {
      let refused: unknown;
      try {
        await bridge.close();
      } catch (cause) {
        refused = cause;
      }
      expect(refused).toBeInstanceOf(AggregateError);
      if (fault === 'stop-error') expect((refused as AggregateError).errors).toContain(failure);
      return;
    }
    await bridge.close();
    expect(events).toEqual(['live', 'ack', 'writer-close', 'socket-close']);
    expect(listening).toBe(false);
  });
