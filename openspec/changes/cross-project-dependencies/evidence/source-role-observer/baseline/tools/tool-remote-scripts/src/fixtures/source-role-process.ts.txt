import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { mock } from 'bun:test';

import { runDockerExec } from '../lib/docker-exec';
import type { ProductMetadataChild, SpawnProductMetadata } from '../lib/docker-product-metadata';
import { GROUP_PROGRAM } from '../lib/mount-exec-program';
import { participantActivationFixture } from './dependency-participant-restoration';
import { assertReadinessByteTransportFixture } from './product-readiness-byte-transport';

export const sourceFault = {
  name: 'none',
  execs: 0,
  closing: false,
  settlements: 0,
  receiptFailures: 0,
};
const clock = '2026-10-24 08:00:00.000000000 +0000';
const digest = (label: string) => createHash('sha256').update(label).digest('hex');
function stat(pid: number, parent: number, ticks: number): string {
  const fields = Array.from({ length: 50 }, () => '1');
  fields[0] = 'S';
  fields[1] = String(parent);
  fields[19] = String(ticks);
  return `${String(pid)} (source) ${fields.join(' ')}`;
}
const status = (pid: number, inner: number, host = false) =>
  `Name:\tsource\nTgid:\t${String(pid)}\nUid:\t1000\t1000\t1000\t1000\nNSpid:\t${host ? `${String(pid)}\t` : ''}${String(inner)}\n`;

// Raw modeled /proc bytes only. No observer or consumed context accepts a host-reader seam.
await mock.module('../lib/product-host-proc', () => ({
  readProductHostProc: (path: string) => {
    const match = /^\/proc\/(6000[1-9])\/(stat|status|cgroup|uid_map|gid_map)$/.exec(path);
    if (match === null) throw new Error('source fixture host path unsupported');
    const pid = Number(match[1]);
    const inner = pid - 60000;
    switch (match[2]) {
      case 'stat':
        return Promise.resolve(
          stat(
            pid,
            inner === 1
              ? 1
              : inner === 2
                ? 60001
                : inner === 3 && sourceFault.name === 'role-parent'
                  ? 60004
                  : 60002,
            pid +
              100000 +
              ((sourceFault.name === 'pid-reuse' ||
                (sourceFault.name === 'closing-host' && sourceFault.closing)) &&
              inner === 3
                ? 1
                : 0),
          ),
        );
      case 'status':
        return Promise.resolve(status(pid, inner, true));
      case 'cgroup':
        return Promise.resolve('0::/docker/source\n');
      case 'uid_map':
      case 'gid_map':
        return Promise.resolve('0 0 4294967295\n');
      default:
        throw new Error('source fixture host field unsupported');
    }
  },
}));

function echoChild(contents: string): ProductMetadataChild {
  const child = Bun.spawn(
    ['/usr/bin/python3', '-I', '-c', 'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())'],
    {
      stdin: new TextEncoder().encode(contents),
      stdout: 'pipe',
      stderr: 'pipe',
      killSignal: 'SIGKILL',
    },
  );
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => {
      child.kill('SIGKILL');
    },
  };
}

// One explicit shell-elided direct-run-commands fixture, never an assertion about native worker counts.
function frames(label: 'before' | 'after'): string[] {
  const tokens = ['PASS', label];
  const tiers = ['be-01', 'gw-01', 'mcp-01', 'fe-01'];
  const count = ['extra', 'duplicate'].includes(sourceFault.name) ? 7 : 6;
  for (let pid = 1; pid <= count; pid++) {
    if (sourceFault.name === 'missing' && pid === 5) continue;
    const node = pid === 2 || pid === 6;
    const tier = sourceFault.name === 'duplicate' && pid === 7 ? 'be-01' : tiers[pid - 3];
    const argv =
      pid === 1
        ? ['bun', 'run', 'dev']
        : pid === 2
          ? [
              '/usr/local/bin/node',
              '/src/node_modules/nx/dist/bin/nx.js',
              'run-many',
              '-t',
              'serve',
              '--projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01',
            ]
          : pid === 6
            ? ['/usr/local/bin/node', '/src/node_modules/vite/bin/vite.js']
            : ['bun', '--watch', 'src/main.ts'];
    if (sourceFault.name === 'watch' && pid === 3) argv[1] = 'run';
    if (sourceFault.name === 'extra' && pid === 7) argv.splice(0, argv.length, 'helper');
    const cwd = pid < 3 ? '/src' : `/src/apps/wbs/${tier}`;
    tokens.push(
      'PROC',
      String(pid),
      stat(
        pid,
        pid === 1 ? 0 : pid === 2 ? 1 : pid === 3 && sourceFault.name === 'role-parent' ? 4 : 2,
        160000 + pid + (sourceFault.name === 'pid-reuse' && pid === 3 ? 1 : 0),
      ),
      status(pid, pid).replace(
        sourceFault.name === 'uid' && pid === 3 ? /1000/g : /NEVERMATCH/g,
        '0',
      ),
      Buffer.from(argv.join('\0') + '\0').toString('base64'),
      sourceFault.name === 'cwd' && pid === 6 ? '/src/apps/wbs/gw-01' : cwd,
      sourceFault.name === 'exe' && pid === 3
        ? '/usr/local/bin/helper'
        : node
          ? '/usr/local/bin/node'
          : '/usr/local/bin/bun',
      `2049:${node ? '992' : sourceFault.name === 'object' ? '993' : '991'}:123456|${clock}|${clock}`,
      digest(node ? 'source-node' : 'source-bun'),
      'pid:[101]',
      'net:[102]',
      sourceFault.name === 'namespace' && pid === 3 ? 'mnt:[999]' : 'mnt:[103]',
    );
    const socket =
      pid === 7 && sourceFault.name === 'duplicate'
        ? 12343
        : pid >= 3 && pid <= 6
          ? sourceFault.name === 'misassigned' && pid === 3
            ? 12344
            : sourceFault.name === 'misassigned' && pid === 4
              ? 12343
              : 12340 + pid
          : null;
    if (socket !== null && !(sourceFault.name === 'helper-listener' && pid === 3))
      tokens.push('FD', String(pid), '3', `socket:[${String(socket)}]`);
    if (sourceFault.name === 'helper-listener' && pid === 2)
      tokens.push('FD', '2', '3', 'socket:[12343]');
  }
  const tcp =
    '  sl  local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n' +
    [3100, 3200, 3300, 4200]
      .map(
        (port, index) =>
          `  ${String(index)}: 0100007F:${port.toString(16).toUpperCase().padStart(4, '0')} 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 ${String(12343 + index)}\n`,
      )
      .join('');
  tokens.push(
    'SELF',
    'pid:[101]',
    'net:[102]',
    'mnt:[103]',
    'TCP',
    '4',
    tcp,
    'TCP',
    '6',
    ' sl local_address rem_address st\n',
    'ADDR',
    '1: lo inet 127.0.0.1/8 scope host lo\n',
  );
  if (
    sourceFault.name === 'listener' ||
    (sourceFault.name === 'closing-listener' && label === 'after')
  )
    return tokens.map((token) =>
      token
        .replaceAll('socket:[12343]', 'socket:[22343]')
        .replace('1000 0 12343\n', '1000 0 22343\n'),
    );
  return tokens;
}

/** Genuine preparation fixture with modeled source metadata and actual raw byte transport/owned peer cleanup. */
export async function sourceProcessFixture() {
  const fixture = await participantActivationFixture();
  let tops = 0;
  const spawnProductMetadata: SpawnProductMetadata = (request) => {
    if (request.kind === 'container') {
      if (request.id !== fixture.source.Id) throw new Error('source fixture foreign container');
      return echoChild(JSON.stringify(fixture.source));
    }
    if (request.kind !== 'top' || request.id !== fixture.source.Id)
      throw new Error('source fixture foreign metadata');
    tops++;
    const parent =
      sourceFault.name === 'parent' ? 999 : sourceFault.name === 'role-parent' ? 60004 : 60002;
    return echoChild(
      `PID PPID\n60001 1\n60002 60001\n60003 ${String(parent)}\n60004 60002\n${sourceFault.name === 'missing' ? '' : '60005 60002\n'}60006 60002\n${['extra', 'duplicate'].includes(sourceFault.name) ? '60007 60002\n' : ''}`,
    );
  };
  const ports = { ...fixture.ports, spawnProductMetadata };
  const generatedPath = join(fixture.sourceRoot, 'apps/wbs/mcp-01/src/openapi.json');
  const generated =
    '{"openapi":"3.1.0","info":{"title":"native pinned participant emitter"},"paths":{}}\n';
  async function writeGenerated(contents = generated): Promise<void> {
    await writeFile(generatedPath, contents, { mode: 0o644 });
  }
  async function start(): Promise<void> {
    Object.assign(fixture.source.State, {
      Running: true,
      Status: 'running',
      Pid: 60001,
      StartedAt: '2026-10-29T08:00:00Z',
    });
    await writeGenerated();
    ports.execDocker = async (args, nonce, receive, signal) => {
      sourceFault.execs++;
      const cleanup = args.includes(GROUP_PROGRAM);
      const directory = join(fixture.root, `source-bytes-${nonce}`);
      await mkdir(directory);
      const receipt = join(directory, 'receipt');
      const pidPath = join(directory, 'pid');
      const tokens = [
        'SESSION',
        nonce,
        '70001',
        '70001',
        '70001',
        '80001',
        ...(cleanup ? [] : [...frames('before'), ...frames('after')]),
        'DONE',
        nonce,
        '2',
      ];
      if (cleanup && sourceFault.name === 'cleanup') tokens.push('PRIVATE_CLEANUP_FAILURE');
      await Bun.write(receipt, tokens.join('\0') + '\0');
      await assertReadinessByteTransportFixture();
      let transportFailure: { readonly cause: unknown } | undefined;
      try {
        await runDockerExec(['--', nonce, receipt, pidPath], nonce, receive, signal);
      } catch (cause) {
        sourceFault.receiptFailures++;
        transportFailure = { cause };
      }
      try {
        const pid = Number(await readFile(pidPath, 'utf8'));
        let alive = true;
        try {
          process.kill(pid, 0);
        } catch (cause) {
          if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ESRCH')
            throw cause;
          alive = false;
        }
        if (alive) throw new Error('source fixture raw peer remains');
        sourceFault.settlements++;
      } catch (cause) {
        if (transportFailure !== undefined)
          throw new AggregateError(
            [transportFailure.cause, cause],
            'source fixture transport and peer settlement failed',
            { cause },
          );
        throw cause;
      }
      if (transportFailure !== undefined) throw transportFailure.cause;
      if (cleanup && sourceFault.name === 'closing-host') sourceFault.closing = true;
      if (cleanup && sourceFault.name === 'closing-runtime')
        fixture.source.State.StartedAt = '2026-10-29T09:00:00Z';
      if (!cleanup && sourceFault.name === 'closing-output') await writeGenerated('{}\n');
    };
  }
  return { ...fixture, ports, start, writeGenerated, tops: () => tops };
}
