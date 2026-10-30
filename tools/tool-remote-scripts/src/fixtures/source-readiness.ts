import { rejects } from 'node:assert/strict';
import { chmodSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, spyOn } from 'bun:test';

import * as activation from '../lib/complete-dependency-exclusion';
import * as ingress from '../lib/dependency-ingress';
import type { FinalizedParticipantRestorationContext } from '../lib/dependency-participant-preparation';
import * as dockerExec from '../lib/docker-exec';
import { withDependencyOwner } from '../lib/edge-ownership';
import { readFields } from '../lib/managed-cohort';
import type { observeSelectedSourceRoles } from '../lib/source-role-process';
import { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } from './source-frontend-responses';
import { sourceFault, sourceProcessFixture } from './source-role-process';

export const SOURCE_WIRE_FAULTS = [
  'backend-identity',
  'backend-disk',
  'backend-boot',
  'backend-capability',
  'gateway-health',
  'mcp-health',
  'mcp-route',
  'frontend-document',
  'frontend-entry',
  'frontend-mime',
] as const;
export type SourceWireFault = 'none' | (typeof SOURCE_WIRE_FAULTS)[number];
export type SourceBarrier = 'source' | 'evidence' | 'artifact' | 'stores' | 'ingress' | 'context';
export const SOURCE_REQUESTS = [
  '3100 /health',
  '3100 /api/runtime/dependency-capability',
  '3200 /health',
  '3300 /health/readiness',
  '4200 /',
  '4200 /src/main.tsx',
] as const;

function replaceFile(path: string, held: string): void {
  const before = lstatSync(path, { bigint: true });
  const bytes = readFileSync(path);
  renameSync(path, held);
  writeFileSync(path, bytes, { flag: 'wx', mode: Number(before.mode & 0o7777n) });
  const after = lstatSync(path, { bigint: true });
  expect(`${String(after.dev)}:${String(after.ino)}`).not.toBe(
    `${String(before.dev)}:${String(before.ino)}`,
  );
  expect(readFileSync(path)).toEqual(bytes);
  expect(after.mode & 0o7777n).toBe(before.mode & 0o7777n);
}

interface SourceListenerDrift {
  readonly role: keyof Awaited<ReturnType<typeof observeSelectedSourceRoles>>['roles'];
  readonly pid: number;
  readonly port: number;
  readonly descriptor: number;
  readonly inode: string;
  readonly replacement: string;
}

export interface SourceReadinessAudit {
  readonly requests: string[];
  wire: SourceWireFault;
  driftAfter: number;
  drift: SourceListenerDrift | null;
  driftDeliveries: number;
  contextChecks: number;
  evidenceChecks: number;
  artifactChecks: number;
  ingressChecks: number;
  injected: boolean;
  afterContext?: () => void;
  afterArtifact?: () => void;
  afterIngress?: () => void;
  rawExecutions(): number;
  release(): void;
}

/** Physical trusted-file faults in this owned scratch only; never replaces the retained monitor or expected values. */
export function injectSourceBarrier(
  barrier: SourceBarrier,
  context: FinalizedParticipantRestorationContext,
  fixture: Awaited<ReturnType<typeof sourceProcessFixture>>,
): void {
  if (barrier === 'source') {
    const path = join(fixture.sourceRoot, 'apps/wbs/fe-01/index.html');
    writeFileSync(path, readFileSync(path, 'utf8') + '<!-- late original source drift -->');
  } else if (barrier === 'evidence') {
    replaceFile(
      join(context.directory, `dependency-activation-${context.attempt}`, 'prod.before.sqlite'),
      join(context.directory, 'source-held-backup.sqlite'),
    );
  } else if (barrier === 'artifact') {
    const path = join(
      context.directory,
      'dependency-artifacts',
      context.request.migrations.manifestSha256,
      'drizzle',
    );
    const before = lstatSync(path, { bigint: true });
    const mode = Number(before.mode & 0o7777n);
    if (mode !== 0o700 && mode !== 0o755)
      throw new Error('original source artifact mode unsupported');
    chmodSync(path, mode === 0o700 ? 0o755 : 0o700);
    expect(lstatSync(path, { bigint: true }).ino).toBe(before.ino);
  } else if (barrier === 'stores') {
    replaceFile(fixture.prodPath, join(context.directory, 'source-held-main.sqlite'));
  } else if (barrier === 'ingress') {
    const path = context.layouts.prod.siteCaddyPath;
    writeFileSync(path, readFileSync(path, 'utf8') + '\n# retained source ingress drift\n');
  } else {
    replaceFile(context.fencedComplete.path, join(context.directory, 'source-held-fenced.json'));
  }
}

/** Genuine original preparation/consumption with modeled raw source metadata and real leased-loopback HTTP. All original byte peers still use the production transport and retain its cleanup assertions. */
export async function withSourceReadinessContext(
  action: (
    context: FinalizedParticipantRestorationContext,
    fixture: Awaited<ReturnType<typeof sourceProcessFixture>>,
    audit: SourceReadinessAudit,
  ) => Promise<void>,
  corruptCold = false,
): Promise<void> {
  const fixture = await sourceProcessFixture();
  const network = readFields(readFields(readFields(fixture.source)['NetworkSettings'])['Networks']);
  Object.assign(readFields(network[fixture.layouts.dev.network]), {
    IPAddress: '127.0.0.1',
    GlobalIPv6Address: '',
  });
  const servers: ReturnType<typeof Bun.serve>[] = [];
  let initialExecs = 0;
  let originalRoles: Awaited<ReturnType<typeof observeSelectedSourceRoles>>['roles'] | undefined;
  let released = false;
  let release: (() => void) | undefined;
  const audit: SourceReadinessAudit = {
    requests: [],
    wire: 'none',
    driftAfter: 0,
    drift: null,
    driftDeliveries: 0,
    contextChecks: 0,
    evidenceChecks: 0,
    artifactChecks: 0,
    ingressChecks: 0,
    injected: false,
    rawExecutions: () => sourceFault.execs - initialExecs,
    release: () => {
      if (release === undefined || released) throw new Error('source context release unavailable');
      release();
      released = true;
    },
  };
  try {
    for (const port of [3100, 3200, 3300, 4200])
      servers.push(
        Bun.serve({
          hostname: '127.0.0.1',
          port,
          fetch(request) {
            const path = new URL(request.url).pathname;
            audit.requests.push(`${String(port)} ${path}`);
            const phase = audit.requests.length;
            if (phase === audit.driftAfter) {
              // Fault activation is independent of the next query; only a DIFFERENT
              // original role's modeled listener changes when its raw frame is consumed.
              const role =
                phase <= 2 ? 'gateway' : phase === 3 ? 'mcp' : phase === 4 ? 'frontend' : 'backend';
              const requestedRole =
                phase <= 2 ? 'backend' : phase === 3 ? 'gateway' : phase === 4 ? 'mcp' : 'frontend';
              expect(role).not.toBe(requestedRole);
              const binding = originalRoles?.[role];
              const listener = binding?.listeners.at(0);
              if (binding === undefined || listener === undefined || binding.listeners.length !== 1)
                throw new Error('original source drift role listener absent');
              const inode = Number(listener.inode);
              expect(Number.isSafeInteger(inode)).toBe(true);
              audit.drift = {
                role,
                pid: binding.innerPid,
                port: listener.port,
                descriptor: listener.descriptor,
                inode: listener.inode,
                replacement: String(inode + 10000),
              };
              audit.injected = true;
              console.error(
                `SOURCE_READINESS_HANDLER_DRIFT: phase=${String(phase)} role=${role} pid=${String(binding.innerPid)} port=${String(listener.port)} inode=${listener.inode} replacement=${audit.drift.replacement}`,
              );
            }
            if (port === 3100 && path === '/health')
              return Response.json({
                status: 'ok',
                commit:
                  audit.wire === 'backend-disk' || audit.wire === 'backend-identity'
                    ? 'b'.repeat(40)
                    : fixture.request.owner.sha,
                bootCommit:
                  audit.wire === 'backend-identity'
                    ? 'b'.repeat(40)
                    : audit.wire === 'backend-boot'
                      ? 'c'.repeat(40)
                      : fixture.request.owner.sha,
              });
            if (port === 3100 && path === '/api/runtime/dependency-capability')
              return Response.json({
                protocol: 'wbs-dependency-runtime',
                version: 1,
                role: audit.wire === 'backend-capability' ? 'gateway' : 'backend',
                semantics: ['cross-project-dependencies-v1'],
              });
            if (port === 3200 && path === '/health')
              return Response.json({
                status: audit.wire === 'gateway-health' ? 'unavailable' : 'ok',
              });
            if (port === 3300 && path === '/health/readiness')
              return audit.wire === 'mcp-route'
                ? new Response('readiness route unavailable', { status: 404 })
                : Response.json({ status: audit.wire === 'mcp-health' ? 'unavailable' : 'ok' });
            if (port === 3300 && path === '/health' && audit.wire === 'mcp-route')
              return Response.json({ status: 'ok' });
            if (port === 4200 && path === '/')
              return new Response(
                SOURCE_FRONTEND_DOCUMENT +
                  (audit.wire === 'frontend-document' ? '<script>void 1</script>' : ''),
                { headers: { 'content-type': 'text/html' } },
              );
            if (port === 4200 && path === '/src/main.tsx')
              return new Response(
                SOURCE_FRONTEND_ENTRY +
                  (audit.wire === 'frontend-entry' ? '\n// changed entry' : ''),
                {
                  headers: {
                    'content-type':
                      audit.wire === 'frontend-mime' ? 'text/html' : 'text/javascript',
                  },
                },
              );
            return new Response('modeled source path absent', { status: 404 });
          },
        }),
      );
    if (corruptCold) {
      const path = join(fixture.sourceRoot, 'apps/wbs/fe-01/index.html');
      await writeFile(path, (await readFile(path, 'utf8')) + '<!-- unsupported original input -->');
    }
    process.env['WBS_EDGE_STATE'] = fixture.root;
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        if (corruptCold) {
          await rejects(
            activation.prepareActivatedParticipantsUnderOwner(
              owner,
              fixture.request,
              fixture.layouts,
              performance.now() + 300000,
              fixture.root,
              fixture.ports,
            ),
          );
          expect(audit.requests).toEqual([]);
          return;
        }
        const prepared = await activation.prepareActivatedParticipantsUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          fixture.ports,
        );
        release = () => {
          activation.releasePreparedDependencyActivation(owner, prepared);
        };
        try {
          const context = await activation.consumePreparedDependencyActivation(owner, prepared);
          expect(context.source.frontend).toBe('wbs-source-frontend-wire-v1');
          await fixture.start();
          await context.source.inspectRunning();
          const observer = await import('../lib/source-role-process');
          const before = await observer.observeSelectedSourceRoles(context);
          originalRoles = before.roles;
          expect(Object.keys(before.roles).sort()).toEqual([
            'backend',
            'frontend',
            'gateway',
            'mcp',
          ]);
          expect(before.roles.frontend.listeners[0]?.port).toBe(4200);
          expect(audit.requests).toEqual([]);
          console.error(
            'SOURCE_READINESS_REACHED: original prepare/consume/modeled start/profile/running monitor/whole-source observation succeeded',
          );
          initialExecs = sourceFault.execs;
          const realContext = activation.assertParticipantRestorationContext;
          const realIngress = ingress.inspectDependencyIngress;
          const realEvidence = context.storage.evidence.inspect;
          const realArtifact = context.artifact.verify;
          const realExec = dockerExec.runDockerExec;
          const contextSpy = spyOn(
            activation,
            'assertParticipantRestorationContext',
          ).mockImplementation(async (selected) => {
            audit.contextChecks++;
            await realContext(selected);
            audit.afterContext?.();
          });
          const ingressSpy = spyOn(ingress, 'inspectDependencyIngress').mockImplementation(
            async (...args) => {
              audit.ingressChecks++;
              await realIngress(...args);
              audit.afterIngress?.();
            },
          );
          const evidenceSpy = spyOn(context.storage.evidence, 'inspect').mockImplementation(
            async () => {
              audit.evidenceChecks++;
              await realEvidence();
            },
          );
          const artifactSpy = spyOn(context.artifact, 'verify').mockImplementation(() => {
            audit.artifactChecks++;
            realArtifact();
            audit.afterArtifact?.();
          });
          const execSpy = spyOn(dockerExec, 'runDockerExec').mockImplementation(async (...args) => {
            if (audit.drift !== null) {
              const path = args[0].at(2);
              if (!path?.startsWith(`${fixture.root}/source-bytes-`))
                throw new Error('owned source byte receipt absent');
              const before = await readFile(path, 'utf8');
              // Cleanup receipts carry no PASS frames. Collection receipts must contain
              // both exact original-role FD tuples and matching port/inode TCP rows.
              if (before.includes('\0PASS\0before\0')) {
                const drift = audit.drift;
                const fd = [
                  'FD',
                  String(drift.pid),
                  String(drift.descriptor),
                  `socket:[${drift.inode}]`,
                  '',
                ].join('\0');
                const changedFd = [
                  'FD',
                  String(drift.pid),
                  String(drift.descriptor),
                  `socket:[${drift.replacement}]`,
                  '',
                ].join('\0');
                const tcp = `1000 0 ${drift.inode}\n`;
                const changedTcp = `1000 0 ${drift.replacement}\n`;
                expect(before.split(fd)).toHaveLength(3);
                expect(before.split(tcp)).toHaveLength(3);
                const rows = before
                  .split('\n')
                  .filter((line) => line.endsWith(`1000 0 ${drift.inode}`));
                expect(rows).toHaveLength(2);
                for (const row of rows)
                  expect(row).toContain(
                    `0100007F:${drift.port.toString(16).toUpperCase().padStart(4, '0')} `,
                  );
                const changed = before.replaceAll(fd, changedFd).replaceAll(tcp, changedTcp);
                expect(changed).not.toContain(fd);
                expect(changed).not.toContain(tcp);
                expect(changed.split(changedFd)).toHaveLength(3);
                expect(changed.split(changedTcp)).toHaveLength(3);
                await writeFile(path, changed);
                expect(await readFile(path, 'utf8')).toBe(changed);
                audit.driftDeliveries++;
                console.error(
                  `SOURCE_READINESS_RAW_DRIFT: role=${drift.role} pid=${String(drift.pid)} port=${String(drift.port)} fd=2 tcp=2 readback=exact inode=${drift.inode} replacement=${drift.replacement}`,
                );
              }
            }
            await realExec(...args);
          });
          try {
            await action(context, fixture, audit);
          } finally {
            execSpy.mockRestore();
            artifactSpy.mockRestore();
            evidenceSpy.mockRestore();
            ingressSpy.mockRestore();
            contextSpy.mockRestore();
          }
          expect(sourceFault.settlements).toBe(sourceFault.execs);
          expect(sourceFault.receiptFailures).toBe(0);
          expect(
            fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0])),
          ).toBe(false);
        } finally {
          if (!released) audit.release();
        }
      },
      fixture.root,
    );
  } finally {
    for (const server of servers) await server.stop(true);
  }
}
