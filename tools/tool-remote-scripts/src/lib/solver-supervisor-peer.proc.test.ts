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
const socket = await Bun.connect({unix:${JSON.stringify(unix)}, socket:{
open(s){s.write(${JSON.stringify(`${JSON.stringify(frame)}\n`)});},
data(s,bytes){process.stdout.write(bytes);},close(){},error(s,e){console.error(e.message);process.exitCode=1;}}});
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
        expect(exit).toBe(0);
        expect(stderr).toBe('');
        expect(Number.isSafeInteger(acceptedFd)).toBe(true);
        expect(acceptedFd).toBeGreaterThanOrEqual(0);
        if (fault === 'none') {
          expect(peerPid).toBe(client.pid);
          expect(peerPid).not.toBe(process.pid);
          expect(runs).toBe(1);
          expect(errors).toEqual([]);
          expect(JSON.parse(stdout)).toEqual({ type: 'started', pid: client.pid });
        } else {
          expect(runs).toBe(0);
          expect(stdout).toBe('');
          expect(errors.map((error) => error.message)).toEqual([
            fault === 'missing-fd'
              ? 'supervisor peer credentials: accepted socket has no file descriptor'
              : 'supervisor peer credentials: SO_PEERCRED getsockopt failed',
          ]);
        }
      } finally {
        client.kill();
        await client.exited;
        listener.stop(true);
      }
      await rejects(lstat(unix), { code: 'ENOENT' });
      expect(client.exitCode).not.toBeNull();
    });
