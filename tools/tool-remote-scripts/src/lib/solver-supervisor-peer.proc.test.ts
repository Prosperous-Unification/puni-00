import { rejects } from 'node:assert/strict';
import { lstat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { listenForSupervisorConnections } from './solver-supervisor-listener';
import { readSupervisorPeerCredentials } from './solver-supervisor-peer-credentials';

const caller = 'a'.repeat(64);
const uid = process.getuid?.();
const gid = process.getgid?.();
if (uid === undefined || gid === undefined)
  throw new Error('peer process proof requires Unix credentials');
const frame = {
  type: 'start',
  protocolVersion: 1,
  callerId: caller,
  projectId: '018f3f08-2ef7-7d1c-b645-14f877575d65',
  objective: 'pri',
  attemptToken: '018f3f08-2ef7-7d1c-b645-14f877575d66',
  childDeadlineAt: 20000,
  searchWorkers: 2,
  memoryLimitMb: 512,
  request: { wireVersion: 1, objective: 'pri' },
} as const;

type ClientTerminal =
  | { version: 1; kind: 'closed'; phase: 'socket' }
  | { version: 1; kind: 'reset'; phase: 'connect' | 'socket'; code: 'ECONNRESET' };

/** The child diagnostic channel has one finite transport outcome, never protocol bytes. */
function parseClientTerminal(stderr: string): ClientTerminal {
  if (stderr.length > 128 || !stderr.endsWith('\n') || stderr.indexOf('\n') !== stderr.length - 1)
    throw new Error(`peer client emitted malformed terminal record: ${stderr}`);
  const parsed: unknown = JSON.parse(stderr.slice(0, -1));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('peer client terminal record is not an object');
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    record['version'] === 1 &&
    record['kind'] === 'closed' &&
    record['phase'] === 'socket' &&
    JSON.stringify(keys) === JSON.stringify(['kind', 'phase', 'version'])
  )
    return { version: 1, kind: 'closed', phase: 'socket' };
  if (
    record['version'] === 1 &&
    record['kind'] === 'reset' &&
    (record['phase'] === 'connect' || record['phase'] === 'socket') &&
    record['code'] === 'ECONNRESET' &&
    JSON.stringify(keys) === JSON.stringify(['code', 'kind', 'phase', 'version'])
  )
    return {
      version: 1,
      kind: 'reset',
      phase: record['phase'],
      code: 'ECONNRESET',
    };
  throw new Error(`peer client emitted unknown terminal record: ${stderr}`);
}

function requireClientTerminal(
  exit: number,
  signalCode: number | string | null,
  stderr: string,
  positive: boolean,
): ClientTerminal {
  if (exit !== 0 || signalCode !== null)
    throw new Error(
      `peer client did not exit normally: exit=${String(exit)} signal=${String(signalCode)} stderr=${stderr}`,
    );
  const terminal = parseClientTerminal(stderr);
  if (positive && terminal.kind !== 'closed')
    throw new Error('positive peer connection did not close orderly');
  return terminal;
}

function requireRejectedPeer(
  acceptedFd: unknown,
  runs: number,
  stdout: string,
  errors: readonly Error[],
  expectedError: string,
): void {
  if (typeof acceptedFd !== 'number' || !Number.isSafeInteger(acceptedFd) || acceptedFd < 0)
    throw new Error('negative peer connection was not accepted with a native file descriptor');
  if (runs !== 0) throw new Error('negative peer connection reached run');
  if (stdout !== '') throw new Error('negative peer connection emitted protocol bytes');
  if (errors.length !== 1 || errors[0]?.message !== expectedError)
    throw new Error(
      `negative peer refusal differed: ${errors.map((error) => error.message).join(',')}`,
    );
}

test('peer client terminal parser refuses unmodeled transport outcomes', () => {
  expect(parseClientTerminal('{"version":1,"kind":"closed","phase":"socket"}\n')).toEqual({
    version: 1,
    kind: 'closed',
    phase: 'socket',
  });
  for (const phase of ['connect', 'socket'])
    expect(
      parseClientTerminal(
        JSON.stringify({ version: 1, kind: 'reset', phase, code: 'ECONNRESET' }) + '\n',
      ),
    ).toMatchObject({ kind: 'reset', phase, code: 'ECONNRESET' });
  for (const malformed of [
    '',
    '{"version":1,"kind":"closed","phase":"socket"}',
    '{"version":1,"kind":"closed","phase":"socket"}\nnoise',
    '{"version":1,"kind":"closed","phase":"socket"}\n{"version":1,"kind":"closed","phase":"socket"}\n',
    '{"version":1,"kind":"reset","phase":"connect","code":"EPIPE"}\n',
    '{"version":1,"kind":"reset","phase":"unknown","code":"ECONNRESET"}\n',
    '{"version":1,"kind":"reset","phase":"connect","code":"ECONNRESET","extra":true}\n',
    'x'.repeat(129),
  ])
    expect(() => parseClientTerminal(malformed)).toThrow();
  const closed = '{"version":1,"kind":"closed","phase":"socket"}\n';
  const reset = '{"version":1,"kind":"reset","phase":"connect","code":"ECONNRESET"}\n';
  expect(requireClientTerminal(0, null, closed, true).kind).toBe('closed');
  expect(requireClientTerminal(0, null, reset, false).kind).toBe('reset');
  for (const [exit, signal, stderr, positive] of [
    [1, null, closed, false],
    [0, 9, closed, false],
    [0, null, reset, true],
  ] as const)
    expect(() => requireClientTerminal(exit, signal, stderr, positive)).toThrow();
  const refused = 'supervisor peer credentials: accepted socket has no file descriptor';
  const valid = [17, 0, '', [new Error(refused)], refused] as const;
  requireRejectedPeer(...valid);
  expect(() => {
    requireRejectedPeer(undefined, 0, '', valid[3], refused);
  }).toThrow();
  expect(() => {
    requireRejectedPeer(17, 1, '', valid[3], refused);
  }).toThrow();
  expect(() => {
    requireRejectedPeer(17, 0, 'started', valid[3], refused);
  }).toThrow();
  expect(() => {
    requireRejectedPeer(17, 0, '', [new Error('other refusal')], refused);
  }).toThrow();
});

for (const bundled of [false, true])
  for (const fault of ['none', 'missing-fd', 'wrong-option'] as const)
    test(`Bun 1.4.4 ${bundled ? 'built' : 'source'} production listener authenticates separate client: ${fault}`, async () => {
      expect(Bun.version).toBe('1.4.4');
      const root = scratchSync('supervisor-peer-process-');
      const unix = `${root}/peer.sock`;
      let listen = listenForSupervisorConnections;
      let credentials = readSupervisorPeerCredentials;
      if (bundled) {
        const entry = `${root}/shipped.ts`;
        await writeFile(
          entry,
          `export {listenForSupervisorConnections} from ${JSON.stringify(resolve(import.meta.dir, 'solver-supervisor-listener.ts'))}; export {readSupervisorPeerCredentials} from ${JSON.stringify(resolve(import.meta.dir, 'solver-supervisor-peer-credentials.ts'))};`,
        );
        const build = await Bun.build({ entrypoints: [entry], target: 'bun', outdir: root });
        expect(build.success).toBe(true);
        const shipped = (await import(`${root}/shipped.js`)) as {
          listenForSupervisorConnections: typeof listen;
          readSupervisorPeerCredentials: typeof credentials;
        };
        listen = shipped.listenForSupervisorConnections;
        credentials = shipped.readSupervisorPeerCredentials;
      }
      let peerPid: number | undefined;
      let acceptedFd: unknown;
      let runs = 0;
      const errors: Error[] = [];
      const listener = await listen(
        {
          unix,
          allowedNamePatterns: [/^wbs-dev-src$/],
          maxInputBytes: 8192,
          bindTimeoutMs: 3000,
          maxSearchWorkers: 2,
          maxMemoryLimitMb: 512,
          now: () => 10000,
          onConnectionError: (error) => errors.push(error),
        },
        {
          credentials: (socket) => {
            acceptedFd = Reflect.get(socket as object, 'fd');
            const native =
              fault === 'wrong-option'
                ? dlopen('libc.so.6', {
                    getsockopt: { args: ['i32', 'i32', 'i32', 'ptr', 'ptr'], returns: 'i32' },
                  })
                : undefined;
            try {
              const peer = credentials(
                fault === 'missing-fd' ? {} : socket,
                native === undefined
                  ? undefined
                  : (fd, level, _option, value, length) =>
                      native.symbols.getsockopt(fd, level, -1, value, length),
              );
              peerPid = peer.pid;
              expect(peer.uid).toBe(uid);
              expect(peer.gid).toBe(gid);
              return peer;
            } finally {
              native?.close();
            }
          },
          cgroup: (pid) => {
            if (peerPid === undefined) throw new Error('kernel peer identity missing');
            expect(pid).toBe(peerPid);
            return Promise.resolve(`0::/system.slice/docker-${caller}.scope\n`);
          },
          inspect: (id) => Promise.resolve({ id, name: 'wbs-dev-src', image: 'fixture:1' }),
          inspectPod: () => Promise.reject(new Error('unexpected pod identity')),
          run: async (received, channel) => {
            runs++;
            expect(received).toEqual(frame);
            if (peerPid === undefined) throw new Error('kernel peer identity missing');
            await channel.send({ type: 'started', pid: peerPid });
          },
        },
      );
      const client = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--eval',
          `
let emitted = false;
const terminal = (record) => {
  if (emitted) return;
  emitted = true;
  process.stderr.write(JSON.stringify(record) + '\\n');
};
const reset = (error, phase) => {
  if (error?.code !== 'ECONNRESET') throw error;
  terminal({version:1,kind:'reset',phase,code:'ECONNRESET'});
};
try {
  await Bun.connect({unix:${JSON.stringify(unix)}, socket:{
    open(s){try{s.write(${JSON.stringify(`${JSON.stringify(frame)}\n`)});}catch(error){reset(error,'socket');}},
    data(s,bytes){process.stdout.write(bytes);},
    close(){terminal({version:1,kind:'closed',phase:'socket'});},
    error(s,error){reset(error,'socket');}
  }});
} catch (error) { reset(error,'connect'); }
`,
        ],
        { stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(5000) },
      );
      try {
        const [stdout, stderr, exit] = await Promise.all([
          new Response(client.stdout).text(),
          new Response(client.stderr).text(),
          client.exited,
        ]);
        if (fault === 'none') {
          expect(Number.isSafeInteger(acceptedFd)).toBe(true);
          expect(acceptedFd).toBeGreaterThanOrEqual(0);
          expect(peerPid).toBe(client.pid);
          expect(peerPid).not.toBe(process.pid);
          expect(runs).toBe(1);
          expect(errors).toEqual([]);
          expect(JSON.parse(stdout)).toEqual({ type: 'started', pid: client.pid });
        } else {
          requireRejectedPeer(
            acceptedFd,
            runs,
            stdout,
            errors,
            fault === 'missing-fd'
              ? 'supervisor peer credentials: accepted socket has no file descriptor'
              : 'supervisor peer credentials: SO_PEERCRED getsockopt failed',
          );
        }
        requireClientTerminal(exit, client.signalCode, stderr, fault === 'none');
      } finally {
        client.kill();
        await client.exited;
        listener.stop(true);
      }
      await rejects(lstat(unix), { code: 'ENOENT' });
      expect(client.exitCode).not.toBeNull();
    });
