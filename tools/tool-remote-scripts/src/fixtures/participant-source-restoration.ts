import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect } from 'bun:test';

import {
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from '../lib/complete-dependency-exclusion';
import type { FinalizedParticipantRestorationContext } from '../lib/dependency-participant-preparation';
import { OBSERVER_PROGRAM } from '../lib/dependency-product-process';
import { runDockerExec } from '../lib/docker-exec';
import type { ProductMetadataChild, SpawnProductMetadata } from '../lib/docker-product-metadata';
import { withDependencyOwner } from '../lib/edge-ownership';
import {
  decodeAuthorityCollection,
  type InstalledAuthorityObservation,
} from '../lib/installed-authorities';
import { readFields, readString } from '../lib/managed-cohort';
import {
  CENSUS_PROGRAM,
  GROUP_PROGRAM,
  SNAPSHOT_PROGRAM,
  SUPERVISOR_PROGRAM,
} from '../lib/mount-exec-program';
import { SOURCE_NODE_LAUNCHER } from '../lib/source-inner-program';
import { participantActivationFixture } from './dependency-participant-restoration';
import { productBytes, sourceBytes } from './participant-process-bytes';
import { createParticipantSolverRuntime } from './participant-solver-runtime';
import type { SourceRestorationCase } from './participant-source-restoration-cases';
import { assertReadinessByteTransportFixture } from './product-readiness-byte-transport';
import { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } from './source-frontend-responses';

const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
const generated =
  '{"openapi":"3.1.0","info":{"title":"native pinned participant emitter"},"paths":{}}\n';

export interface SourceRestorationAudit {
  readonly events: string[];
  readonly requests: string[];
  readonly policyUpdates: { role: string; args: readonly string[]; intents: unknown[] }[];
  readonly policyReadbacks: { role: string; policy: unknown }[];
  readonly policyNativeReadbacks: { role: string; id: string; policy: unknown }[];
  readonly raw: {
    role: string;
    cleanup: boolean;
    nonce: string;
    pid: number;
    policyCount: number;
  }[];
  readonly openerDeliveries: { environment: string; pid: number }[][];
  fault: SourceRestorationCase;
  readonly authoritySourceBindings: boolean[];
  readonly faults: string[];
  release(): void;
  sourceStarted: boolean;
  sourceObserved: boolean;
  listenerReplaced: boolean;
}

/** Original physical scratch plus independently modeled exact product/source bytes; returns no observer or phase authority. */
export async function withParticipantSourceRestoration(
  action: (
    context: FinalizedParticipantRestorationContext,
    fixture: Awaited<ReturnType<typeof participantActivationFixture>>,
    runtime: ReturnType<typeof createParticipantSolverRuntime>,
    audit: SourceRestorationAudit,
  ) => Promise<void>,
  restoresPolicies = false,
  deadline?: number,
): Promise<void> {
  if (
    restoresPolicies &&
    (deadline === undefined || !Number.isFinite(deadline) || deadline <= performance.now())
  )
    throw new Error('policy original pre-fixture deadline absent or exhausted');
  if (!restoresPolicies && deadline !== undefined)
    throw new Error('inherited fixture deadline override refused');
  const fixture = await participantActivationFixture();
  if (restoresPolicies)
    Object.assign(fixture.backend.HostConfig.RestartPolicy, {
      Name: 'on-failure',
      MaximumRetryCount: 3,
    });
  const coldIds = new Set(fixture.inventory.map((member) => readString(readFields(member)['Id'])));
  for (const product of [fixture.backend, fixture.gateway]) {
    const networks = readFields(readFields(readFields(product)['NetworkSettings'])['Networks']);
    Object.assign(readFields(networks[fixture.layouts.prod.network]), {
      IPAddress: '127.0.0.1',
      GlobalIPv6Address: '',
    });
  }
  let originalContext: FinalizedParticipantRestorationContext | undefined;
  let release: (() => void) | undefined;
  let released = false;
  const audit: SourceRestorationAudit = {
    fault: 'ready',
    authoritySourceBindings: [],
    faults: [],
    release: () => {
      if (release === undefined || released)
        throw new Error('original fixture release unavailable');
      release();
      released = true;
    },
    events: [],
    requests: [],
    policyUpdates: [],
    policyReadbacks: [],
    policyNativeReadbacks: [],
    raw: [],
    openerDeliveries: [],
    sourceStarted: false,
    sourceObserved: false,
    listenerReplaced: false,
  };
  const ids = {
    backend: fixture.backend.Id,
    gateway: fixture.gateway.Id,
    source: fixture.source.Id,
  };
  const containers = { backend: fixture.backend, gateway: fixture.gateway, source: fixture.source };
  const tops = {
    backend: 'PID PPID\n40001 1\n40002 40001\n',
    gateway: 'PID PPID\n50001 1\n50002 50001\n',
    source: 'PID PPID\n60001 1\n60002 60001\n60003 60002\n60004 60002\n60005 60002\n60006 60002\n',
  };
  const selectedNetwork = readFields(
    readFields(readFields(fixture.source)['NetworkSettings'])['Networks'],
  );
  Object.assign(readFields(selectedNetwork[fixture.layouts.dev.network]), {
    IPAddress: '127.0.0.2',
    GlobalIPv6Address: '',
  });
  function roleOf(id: string): keyof typeof ids {
    // Test boundary: ids is this fixture's closed three-own-key literal.
    const matches = (Object.keys(ids) as (keyof typeof ids)[]).filter((role) => ids[role] === id);
    if (matches.length !== 1) throw new Error('source restoration fixture foreign container');
    return matches[0];
  }
  function echo(contents: string): ProductMetadataChild {
    const child = Bun.spawn(
      [
        '/usr/bin/python3',
        '-I',
        '-c',
        'import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())',
      ],
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
  const spawnProductMetadata: SpawnProductMetadata = (request, signal) => {
    signal?.throwIfAborted();
    if (request.kind === 'image') {
      const image = fixture.images.get(request.id);
      if (image === undefined) throw new Error('source restoration fixture foreign product image');
      return echo(JSON.stringify([image]));
    }
    const role = roleOf(request.id);
    if (request.kind !== 'top' && audit.policyUpdates.some((update) => update.role === role))
      audit.policyReadbacks.push({
        role,
        policy: structuredClone(containers[role].HostConfig.RestartPolicy),
      });
    return echo(request.kind === 'top' ? tops[role] : JSON.stringify(containers[role]));
  };
  Object.assign(fixture.ports, { spawnProductMetadata });
  const docker = fixture.ports.docker;
  const collect = fixture.ports.authorities.collect;
  const coldExec = fixture.ports.execDocker;
  Object.assign(fixture.ports.authorities, {
    collect: async (...args: Parameters<typeof collect>) => {
      const original = await collect(...args);
      const envelope = readFields(JSON.parse(original));
      const openers: InstalledAuthorityObservation['databaseOpeners'][number][] = [];
      if (audit.events.includes('backend-start'))
        openers.push({
          environment: 'prod',
          suffix: '',
          pid: 40002,
          startTime: '140002',
          uid: 0,
          cgroup: '/docker/backend',
          fd: 7,
          executable: { device: '2049', inode: '992', sha256: digest('backend-bun') },
        });
      if (audit.events.includes('source-start')) {
        audit.authoritySourceBindings.push(audit.sourceObserved);
        openers.push({
          environment: 'dev',
          suffix: '',
          pid: 60003,
          startTime: '160003',
          uid: 1000,
          cgroup: '/docker/source',
          fd: 8,
          executable: { device: '2049', inode: '991', sha256: digest('source-bun') },
        });
      }
      if (audit.events.includes('source-start')) {
        const dev = openers.find((opener) => opener.environment === 'dev');
        if (dev === undefined) throw new Error('modeled dev opener absent');
        const rolePid = {
          'dev-gateway': 60004,
          'dev-mcp': 60005,
          'dev-frontend': 60006,
          'dev-helper': 60002,
          'dev-foreign': 61003,
        } as const;
        if (audit.fault in rolePid) {
          // Test boundary: the closed case kind is a rolePid key in this guarded branch.
          const pid = rolePid[audit.fault as keyof typeof rolePid];
          const node = pid === 60006 || pid === 60002;
          Object.assign(dev, {
            pid,
            startTime: String(pid + 100000),
            cgroup: pid === 61003 ? '/foreign/source' : '/docker/source',
            executable: {
              device: '2049',
              inode: node ? '992' : '991',
              sha256: digest(node ? 'source-node' : 'source-bun'),
            },
          });
        }
        if (audit.fault === 'dev-ticks') Object.assign(dev, { startTime: '160004' });
        if (audit.fault === 'dev-executable') Object.assign(dev, { executable: null });
        if (audit.fault === 'prod-source') Object.assign(dev, { environment: 'prod' });
      }
      const bytes = JSON.stringify({ ...envelope, databaseOpeners: openers });
      const decoded = decodeAuthorityCollection(
        bytes,
        readString(readFields(args[0])['nonce']),
        fixture.request.authorities.pins,
      );
      expect(decoded.databaseOpeners).toEqual(openers);
      if (
        audit.events.includes('source-start') &&
        (audit.fault.startsWith('dev-') ||
          audit.fault === 'prod-source' ||
          audit.fault === 'source-after-authority') &&
        !audit.faults.includes(audit.fault)
      ) {
        audit.faults.push(audit.fault);
        console.error(
          `SOURCE_RESTORATION_AUTHORITY_WIRE: ${audit.fault} decoded original-family collection`,
        );
      }
      audit.openerDeliveries.push(openers.map(({ environment, pid }) => ({ environment, pid })));
      if (audit.fault === 'source-after-authority' && audit.events.includes('source-start'))
        fixture.source.State.StartedAt = '2026-10-29T09:00:00Z';
      return bytes;
    },
  });
  Object.assign(fixture.ports, {
    docker: async (args: Parameters<typeof docker>[0], signal?: AbortSignal) => {
      if (restoresPolicies && args[0] === 'update' && args[1] === '--restart=no') {
        const role = roleOf(args[2]);
        Object.assign(containers[role].HostConfig.RestartPolicy, {
          Name: 'no',
          MaximumRetryCount: 0,
        });
      }
      if (restoresPolicies && args[0] === 'update' && args[1] !== '--restart=no') {
        expect(args).toHaveLength(3);
        const role = roleOf(args[2]);
        const match = /^--restart=(always|unless-stopped|on-failure)(?::([0-9]+))?$/.exec(args[1]);
        if (match === null || (match.at(2) !== undefined && match[1] !== 'on-failure'))
          throw new Error('policy fixture unsupported restart spelling');
        const intents = await Promise.all(
          (await readdir(fixture.root))
            .filter((name) => name.endsWith('-activation-participant-policy-intent.json'))
            .map(
              async (name) =>
                readFields(JSON.parse(await readFile(join(fixture.root, name), 'utf8')))['record'],
            ),
        );
        audit.policyUpdates.push({ role, args: [...args], intents });
        fixture.commands.push([...args]);
        Object.assign(containers[role].HostConfig.RestartPolicy, {
          Name: match[1],
          MaximumRetryCount: match.at(2) === undefined ? 0 : Number(match.at(2)),
        });
        if (role === 'backend' && audit.policyUpdates.length === 1) {
          if (audit.fault === 'policy-name')
            Object.assign(containers.backend.HostConfig.RestartPolicy, {
              Name: 'always',
              MaximumRetryCount: 0,
            });
          if (audit.fault === 'policy-count')
            Object.assign(containers.backend.HostConfig.RestartPolicy, {
              Name: 'on-failure',
              MaximumRetryCount: 4,
            });
          if (audit.fault === 'policy-pid')
            Object.assign(containers.backend.State, {
              Pid: 40011,
              StartedAt: '2026-10-30T09:00:00Z',
            });
          if (['policy-name', 'policy-count', 'policy-pid'].includes(audit.fault)) {
            audit.faults.push(audit.fault);
            console.error(
              `PARTICIPANT_POLICY_UPDATE_DELIVERY: ${audit.fault} actual original-ID update returned normally`,
            );
          }
        }
        return ids[role] + '\n';
      }
      if (
        restoresPolicies &&
        args[0] === 'inspect' &&
        !args.includes('--format') &&
        audit.policyNativeReadbacks.length < audit.policyUpdates.length
      ) {
        const update = audit.policyUpdates[audit.policyNativeReadbacks.length];
        const role = roleOf(update.args[2]);
        if (args.includes(ids[role])) {
          const reply = await docker(args, signal);
          audit.policyNativeReadbacks.push({
            role,
            id: ids[role],
            policy: structuredClone(containers[role].HostConfig.RestartPolicy),
          });
          console.error(
            `PARTICIPANT_POLICY_NATIVE_READBACK: ${role} original-ID native reply produced`,
          );
          if (audit.fault === 'policy-readback-fence' && audit.policyNativeReadbacks.length === 1) {
            if (originalContext === undefined) throw new Error('original fixture context absent');
            await writeFile(
              originalContext.fencedComplete.path,
              originalContext.fencedComplete.contents + ' ',
            );
            audit.faults.push(audit.fault);
            console.error(
              'PARTICIPANT_POLICY_FENCE_READBACK_DELIVERY: first actual native reply followed by physical original fence drift',
            );
          }
          if (audit.fault === 'policy-listener' && audit.policyNativeReadbacks.length === 3) {
            audit.listenerReplaced = true;
            audit.faults.push(audit.fault);
            console.error(
              'PARTICIPANT_POLICY_LISTENER_READBACK_DELIVERY: final actual native reply followed by coherent FD and TCP replacement',
            );
          }
          return reply;
        }
      }
      if (args[0] !== 'start') return docker(args, signal);
      expect(args).toHaveLength(2);
      const role = roleOf(args[1]);
      const expected =
        role === 'backend'
          ? []
          : role === 'gateway'
            ? ['backend-start']
            : ['backend-start', 'gateway-start'];
      expect(audit.events).toEqual(expected);
      expect(containers[role].State.Running).toBe(false);
      const records = await Promise.all(
        (await readdir(fixture.root))
          .filter((name) => name.endsWith('-activation-participant-start-intent.json'))
          .map(async (name) =>
            readFields(
              readFields(JSON.parse(await readFile(join(fixture.root, name), 'utf8')))['record'],
            ),
          ),
      );
      expect(
        records.filter((record) => record['role'] === role && record['id'] === ids[role]),
      ).toHaveLength(1);
      fixture.commands.push([...args]);
      Object.assign(containers[role].State, {
        Running: true,
        Status: 'running',
        Pid: role === 'backend' ? 40001 : role === 'gateway' ? 50001 : 60001,
        StartedAt: '2026-10-29T08:00:00Z',
      });
      if (role === 'source') {
        audit.sourceStarted = true;
        await writeFile(join(fixture.sourceRoot, 'apps/wbs/mcp-01/src/openapi.json'), generated, {
          mode: 0o644,
        });
      }
      audit.events.push(`${role}-start`);
      return ids[role] + '\n';
    },
    execDocker: async (
      args: readonly string[],
      nonce: string,
      receive: (token: string) => boolean,
      signal?: AbortSignal,
    ) => {
      if (args[0] === 'exec') {
        if (!coldIds.has(args[4]))
          throw new Error('cold scanner container outside original inventory');
        expect(args.slice(0, 11)).toEqual([
          'exec',
          '-i',
          '--user',
          '0:0',
          args[4],
          '/bin/busybox',
          'sh',
          '-c',
          SUPERVISOR_PROGRAM,
          '--',
          nonce,
        ]);
        if (
          args[11] !== CENSUS_PROGRAM &&
          args[11] !== GROUP_PROGRAM &&
          args[11] !== SNAPSHOT_PROGRAM
        )
          throw new Error('source restoration fixture cold scanner unsupported');
        return coldExec([...args], nonce, receive, signal);
      }
      const role = roleOf(args[8]);
      const source = role === 'source';
      let cleanup: boolean;
      if (source) {
        expect(args.slice(0, 18)).toEqual([
          '--host',
          'unix:///var/run/docker.sock',
          'exec',
          '-i',
          '--user',
          '1000:1000',
          '--workdir',
          '/',
          ids.source,
          '/usr/bin/env',
          '-i',
          'PATH=/usr/local/bin:/usr/bin:/bin',
          'LC_ALL=C',
          '/usr/local/bin/node',
          '-e',
          SOURCE_NODE_LAUNCHER,
          '--',
          nonce,
        ]);
        if (args[18] !== 'observe' && args[18] !== 'cleanup')
          throw new Error('source fixture unknown collector mode');
        cleanup = args[18] === 'cleanup';
      } else {
        expect(args.slice(0, 20)).toEqual([
          '--host',
          'unix:///var/run/docker.sock',
          'exec',
          '-i',
          '--user',
          '0:0',
          '--workdir',
          '/',
          ids[role],
          '/bin/busybox',
          'env',
          '-i',
          'PATH=/bin:/usr/bin',
          'LC_ALL=C',
          '/bin/busybox',
          'sh',
          '-c',
          SUPERVISOR_PROGRAM,
          '--',
          nonce,
        ]);
        if (args[20] !== GROUP_PROGRAM && args[20] !== OBSERVER_PROGRAM)
          throw new Error('product fixture unknown collector program');
        cleanup = args[20] === GROUP_PROGRAM;
      }
      if (!containers[role].State.Running) throw new Error('raw process collection preceded start');
      const sourceFault = audit.listenerReplaced ? 'listener' : 'none';
      if (source && !cleanup && audit.listenerReplaced) {
        audit.faults.push(restoresPolicies ? 'policy-listener-raw' : 'listener-after-ready');
        console.error(
          restoresPolicies
            ? 'PARTICIPANT_POLICY_LISTENER_RAW_DELIVERY: coherent replacement FD/TCP bytes entering actual raw observer'
            : 'SOURCE_RESTORATION_LISTENER_DELIVERY: coherent replacement FD/TCP bytes entering actual raw observer',
        );
      }
      const frame = (label: 'before' | 'after') =>
        source
          ? sourceBytes
              .frames(label, { name: sourceFault, closing: false })
              .map((token) =>
                token.replaceAll('0100007F:', '0200007F:').replaceAll('127.0.0.1/8', '127.0.0.2/8'),
              )
          : productBytes.frames(role, label, { fault: 'none', wrapper: false });
      const tokens = [
        'SESSION',
        nonce,
        '70001',
        '70001',
        '70001',
        '80001',
        ...(cleanup ? [] : [...frame('before'), ...frame('after')]),
        'DONE',
        nonce,
        '2',
      ];
      const directory = join(fixture.root, `restoration-${role}-${nonce}`);
      await mkdir(directory);
      const receipt = join(directory, 'receipt');
      const pidPath = join(directory, 'pid');
      await writeFile(receipt, tokens.join('\0') + '\0');
      await assertReadinessByteTransportFixture();
      await runDockerExec(['--', nonce, receipt, pidPath], nonce, receive, signal);
      const pid = Number(await readFile(pidPath, 'utf8'));
      let disappeared = false;
      try {
        process.kill(pid, 0);
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ESRCH') throw cause;
        disappeared = true;
      }
      expect(disappeared).toBe(true);
      audit.raw.push({ role, cleanup, nonce, pid, policyCount: audit.policyUpdates.length });
    },
  });
  const runtime = createParticipantSolverRuntime(fixture);
  const servers: ReturnType<typeof Bun.serve>[] = [];
  process.env['WBS_EDGE_STATE'] = fixture.root;
  try {
    for (const [hostname, port] of [
      ['127.0.0.1', 3100],
      ['127.0.0.1', 3200],
      ['127.0.0.2', 3100],
      ['127.0.0.2', 3200],
      ['127.0.0.2', 3300],
      ['127.0.0.2', 4200],
    ] as const) {
      servers.push(
        Bun.serve({
          hostname,
          port,
          fetch(request) {
            const path = new URL(request.url).pathname;
            audit.requests.push(`${hostname}:${String(port)} ${path}`);
            if (hostname === '127.0.0.2') {
              if (
                ['backend-drift', 'gateway-drift', 'solver-drift'].includes(audit.fault) &&
                !audit.faults.includes(audit.fault)
              ) {
                audit.faults.push(audit.fault);
                console.error(
                  `SOURCE_RESTORATION_HTTP_FAULT: ${audit.fault} actual source response`,
                );
              }
              if (audit.fault === 'backend-drift')
                fixture.backend.State.StartedAt = '2026-10-29T09:00:00Z';
              if (audit.fault === 'gateway-drift')
                fixture.gateway.State.StartedAt = '2026-10-29T09:00:00Z';
              if (audit.fault === 'solver-drift') runtime.setProcessDrift(true);
            }
            if (hostname === '127.0.0.2' && !audit.sourceStarted)
              throw new Error('source HTTP preceded source start');
            if (path === '/health' && port !== 3300)
              return Response.json(
                port === 3100
                  ? {
                      status: 'ok',
                      commit: hostname === '127.0.0.2' ? fixture.request.owner.sha : null,
                      bootCommit: hostname === '127.0.0.2' ? fixture.request.owner.sha : null,
                    }
                  : { status: 'ok' },
              );
            if (path === '/api/runtime/dependency-capability' && port === 3100)
              return Response.json({
                protocol: 'wbs-dependency-runtime',
                version: 1,
                role: 'backend',
                semantics: ['cross-project-dependencies-v1'],
              });
            if (hostname === '127.0.0.2' && port === 3300 && path === '/health/readiness')
              return Response.json({ status: 'ok' });
            if (hostname === '127.0.0.2' && port === 4200 && path === '/')
              return new Response(SOURCE_FRONTEND_DOCUMENT, {
                headers: { 'content-type': 'text/html' },
              });
            if (hostname === '127.0.0.2' && port === 4200 && path === '/src/main.tsx')
              return new Response(SOURCE_FRONTEND_ENTRY, {
                headers: { 'content-type': 'text/javascript' },
              });
            return new Response('source restoration fixture path absent', { status: 404 });
          },
        }),
      );
    }
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const prepared = await prepareActivatedParticipantsUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          deadline ?? performance.now() + 300000,
          fixture.root,
          fixture.ports,
        );
        release = () => {
          releasePreparedDependencyActivation(owner, prepared);
        };
        try {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          originalContext = context;
          runtime.bindContext(context);
          await action(context, fixture, runtime, audit);
        } finally {
          if (!released) releasePreparedDependencyActivation(owner, prepared);
        }
      },
      fixture.root,
    );
  } finally {
    for (const server of servers) await server.stop(true);
    await runtime.closeRuntime();
    await rm(fixture.root, { recursive: true });
    delete process.env['WBS_EDGE_STATE'];
  }
}
