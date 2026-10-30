import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import {
  PARTICIPANT_OPENER_CASES,
  type ParticipantOpenerCase,
} from '../fixtures/participant-opener-cases';
import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import { inspectDependencyIngress } from './dependency-ingress';
import { activationRecord, inspectStore } from './dependency-participant-restoration.model';
import {
  assertAuditContent,
  assertLocalTransportSettled,
  current,
  withModelContext,
} from './dependency-product-process-model.model';
import * as ownership from './edge-ownership';
import { decodeAuthorityCollection } from './installed-authorities';
import { readClosed, readFields, readString } from './managed-cohort';

const { restoreBackendParticipantUnderOwner } =
  await import('./dependency-participant-restoration');
const hash = (contents: string) => createHash('sha256').update(contents).digest('hex');

interface RawOpener {
  environment: 'prod' | 'dev';
  suffix: '';
  pid: number;
  startTime: string;
  uid: number;
  cgroup: string;
  fd: number;
  executable: { device: string; inode: string; sha256: string } | null;
}
interface Delivery {
  readonly phase: 'prestart' | 'post-readiness' | 'after-ready';
  readonly nonce: string;
  readonly rawSha256: string;
  readonly readyBefore: number;
  readonly startsBefore: number;
  readonly healthBefore: number;
  readonly capabilityBefore: number;
  readonly execsBefore: number;
  readonly auditsBefore: number;
  readonly openers: readonly RawOpener[];
  readonly rawDecoderAccepted: true;
}

function openerFor(kind: ParticipantOpenerCase): RawOpener {
  // Independently stated raw model profile: host40002/start140002, root UID,
  // backend cgroup, inode992 and the existing processFrames backend-bun bytes.
  const executable = { device: '2049', inode: '992', sha256: hash('backend-bun') };
  const opener: RawOpener = {
    environment: 'prod',
    suffix: '',
    pid: 40002,
    startTime: '140002',
    uid: 0,
    cgroup: '/docker/backend',
    fd: 7,
    executable,
  };
  switch (kind) {
    case 'exact-prod':
    case 'prestart':
      return opener;
    case 'dev':
      return { ...opener, environment: 'dev' };
    case 'init-pid':
      return { ...opener, pid: 40001 };
    case 'foreign-pid':
      return { ...opener, pid: 49999 };
    case 'start-time':
      return { ...opener, startTime: '140003' };
    case 'uid':
      return { ...opener, uid: 1 };
    case 'cgroup':
      return { ...opener, cgroup: '/docker/foreign' };
    case 'exe-device':
      return { ...opener, executable: { ...executable, device: '2050' } };
    case 'exe-inode':
      return { ...opener, executable: { ...executable, inode: '993' } };
    case 'exe-sha':
      return { ...opener, executable: { ...executable, sha256: 'f'.repeat(64) } };
    case 'exe-null':
      return { ...opener, executable: null };
    case 'late-before-ready':
    case 'late-final-return':
      throw new Error('late process cases require empty opener observations');
  }
}

for (const kind of PARTICIPANT_OPENER_CASES)
  test(`backend coordinator authority boundary: ${kind}`, async () => {
    current.readinessTransport = true;
    let healthRequests = 0;
    let capabilityRequests = 0;
    const backend = Bun.serve({
      hostname: '127.0.0.1',
      port: 3100,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/health') {
          healthRequests++;
          return Response.json({ status: 'ok', commit: null, bootCommit: null });
        }
        if (path === '/api/runtime/dependency-capability') {
          capabilityRequests++;
          return Response.json({
            protocol: 'wbs-dependency-runtime',
            version: 1,
            role: 'backend',
            semantics: ['cross-project-dependencies-v1'],
          });
        }
        return new Response('fixture path absent', { status: 404 });
      },
    });
    try {
      await withModelContext(
        async (context, fixture, audits) => {
          const prodBefore = inspectStore(fixture.prodPath);
          const devBefore = inspectStore(fixture.devPath);
          expect(prodBefore.activation).toEqual({ state: 'ENABLED' });
          expect(devBefore.activation).toEqual({ state: 'DISABLED' });
          const attemptedStarts: string[][] = [];
          const deliveries: Delivery[] = [];
          const consumed: Delivery[] = [];
          let delivery: Delivery | null = null;
          let readyPublications = 0;
          let starts = 0;
          const docker = fixture.ports.docker;
          const collect = fixture.ports.authorities.collect;
          const observeAuthorities = context.observeAuthorities;
          const retain = ownership.retainActivationRecord;
          const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
            async (...args) => {
              const snapshot = await retain(...args);
              if (args[2] === 'participant-ready') readyPublications++;
              return snapshot;
            },
          );
          // This probe returns the real observation unchanged. A recorded return
          // proves the closed decoder/classifier/tuple/owner checks completed.
          const observation = spyOn(context, 'observeAuthorities').mockImplementation(async () => {
            const observed = await observeAuthorities();
            if (delivery !== null) {
              expect(observed.databaseOpeners).toEqual(delivery.openers);
              consumed.push(delivery);
            }
            return observed;
          });
          Object.assign(fixture.ports, {
            docker: async (args: Parameters<typeof docker>[0], signal?: AbortSignal) => {
              if (args[0] !== 'start') return docker(args, signal);
              attemptedStarts.push([...args]);
              expect(args).toEqual(['start', context.originals.backend.id]);
              expect(signal?.aborted).toBe(false);
              expect(starts).toBe(0);
              const restoration = await activationRecord(
                fixture.root,
                'participant-restore-intent',
              );
              const intent = await activationRecord(fixture.root, 'participant-start-intent');
              expect(intent.record).toEqual({
                format: 'dependency-participant-start-intent',
                version: 1,
                restoration: restoration.reference,
                role: 'backend',
                id: fixture.backend.Id,
              });
              expect(readyPublications).toBe(0);
              starts++;
              fixture.commands.push([...args]);
              Object.assign(fixture.backend.State, {
                Running: true,
                Status: 'running',
                Pid: 40001,
                StartedAt: '2026-10-24T08:00:00Z',
              });
              fixture.setTop('PID PPID\n40001 1\n40002 40001\n', fixture.backend.Id);
              return fixture.backend.Id + '\n';
            },
          });
          Object.assign(fixture.ports.authorities, {
            collect: async (...args: Parameters<typeof collect>) => {
              delivery = null;
              // Delegate the actual scratch collector first; change only raw opener
              // bytes or the later raw inner executable object, never readiness.
              const original = await collect(...args);
              const afterReadiness =
                starts === 1 &&
                healthRequests === 1 &&
                capabilityRequests === 1 &&
                current.execs >= 6;
              const applies =
                kind === 'prestart'
                  ? starts === 0
                  : afterReadiness &&
                    (kind === 'late-before-ready'
                      ? readyPublications === 0
                      : kind === 'late-final-return'
                        ? readyPublications === 1
                        : true);
              if (!applies) return original;
              const envelope = readClosed(JSON.parse(original), [
                'nonce',
                'writerManifestSha256',
                'complete',
                'version',
                'euid',
                'hostMachineIdSha256',
                'bootId',
                'launchConfigurationSha256',
                'databaseOpeners',
                'relevantProcesses',
                'internalProcesses',
              ]);
              expect(envelope['databaseOpeners']).toEqual([]);
              const late = kind === 'late-before-ready' || kind === 'late-final-return';
              const openers = late ? [] : [openerFor(kind)];
              const bytes = JSON.stringify({ ...envelope, databaseOpeners: openers });
              const nonce = readString(readFields(args[0])['nonce']);
              expect(
                decodeAuthorityCollection(bytes, nonce, fixture.request.authorities.pins)
                  .databaseOpeners,
              ).toEqual(openers);
              const captured: Delivery = {
                phase:
                  starts === 0
                    ? 'prestart'
                    : readyPublications === 0
                      ? 'post-readiness'
                      : 'after-ready',
                nonce,
                rawSha256: hash(bytes),
                readyBefore: readyPublications,
                startsBefore: starts,
                healthBefore: healthRequests,
                capabilityBefore: capabilityRequests,
                execsBefore: current.execs,
                auditsBefore: audits.length,
                openers,
                rawDecoderAccepted: true,
              };
              deliveries.push(captured);
              delivery = captured;
              if (late) current.fault = 'application-object';
              return bytes;
            },
          });
          try {
            let returned:
              Awaited<ReturnType<typeof restoreBackendParticipantUnderOwner>> | undefined;
            let failure: unknown;
            try {
              returned = await restoreBackendParticipantUnderOwner(context);
            } catch (cause) {
              failure = cause;
            }
            // Every case must reach its intended raw transport phase and return
            // through the real authority observer before refusal can earn credit.
            expect(deliveries.length).toBeGreaterThan(0);
            expect(consumed).toEqual(deliveries);
            if (kind === 'exact-prod') {
              expect(failure).toBeUndefined();
              expect(returned?.state).toBe('backend-ready-participants-fenced');
              expect(returned?.readiness.observation.process.pid).toBe(40002);
              expect(returned?.readiness.observation.process.startTime).toBe('140002');
              expect(deliveries.some((entry) => entry.phase === 'post-readiness')).toBe(true);
              expect(deliveries.some((entry) => entry.phase === 'after-ready')).toBe(true);
              expect(readyPublications).toBe(1);
              const ready = await activationRecord(fixture.root, 'participant-ready');
              expect(returned?.ready).toEqual(ready.snapshot);
            } else {
              expect(returned).toBeUndefined();
              expect(failure).toBeInstanceOf(Error);
              if (!(failure instanceof Error)) throw new Error('coordinator refusal absent');
              expect(failure.message).toBe('backend participant restoration refused');
              expect(failure.cause).toBeUndefined();
              expect(readyPublications).toBe(kind === 'late-final-return' ? 1 : 0);
            }
            if (kind === 'prestart') {
              expect(attemptedStarts).toEqual([]);
              expect(starts).toBe(0);
              expect(healthRequests).toBe(0);
              expect(capabilityRequests).toBe(0);
              expect(
                deliveries.every((entry) => entry.phase === 'prestart' && entry.execsBefore === 0),
              ).toBe(true);
            } else {
              expect(attemptedStarts).toEqual([['start', fixture.backend.Id]]);
              expect(starts).toBe(1);
              expect(healthRequests).toBe(1);
              expect(capabilityRequests).toBe(1);
              expect(
                deliveries.every(
                  (entry) =>
                    entry.startsBefore === 1 &&
                    entry.healthBefore === 1 &&
                    entry.capabilityBefore === 1 &&
                    entry.execsBefore >= 6,
                ),
              ).toBe(true);
            }
            if (kind === 'late-before-ready' || kind === 'late-final-return') {
              const injected = deliveries.at(0);
              if (injected === undefined) throw new Error('late process fault not injected');
              expect(injected.phase).toBe(
                kind === 'late-before-ready' ? 'post-readiness' : 'after-ready',
              );
              expect(injected.openers).toEqual([]);
              expect(injected.readyBefore).toBe(kind === 'late-before-ready' ? 0 : 1);
              expect(
                audits
                  .slice(injected.auditsBefore)
                  .some(
                    (audit) =>
                      !audit.cleanup &&
                      audit.tokens.some((token) => token.startsWith('2049:995:123456|')),
                  ),
              ).toBe(true);
            }
            for (const audit of audits) {
              assertLocalTransportSettled(audit);
              await assertAuditContent(audit);
            }
            const readyNames = (await readdir(fixture.root)).filter((name) =>
              name.endsWith('-activation-participant-ready.json'),
            );
            expect(readyNames).toHaveLength(
              kind === 'exact-prod' || kind === 'late-final-return' ? 1 : 0,
            );
            expect(
              (await readdir(fixture.root)).some((name) =>
                name.endsWith('-activation-participants-restored.json'),
              ),
            ).toBe(false);
          } finally {
            Object.assign(fixture.ports, { docker });
            Object.assign(fixture.ports.authorities, { collect });
            observation.mockRestore();
            publication.mockRestore();
            expect(inspectStore(fixture.prodPath)).toEqual(prodBefore);
            expect(inspectStore(fixture.devPath)).toEqual(devBefore);
            expect(fixture.gateway.State.Running).toBe(false);
            expect(fixture.source.State.Running).toBe(false);
            expect(fixture.commands.filter((args) => args[0] === 'start')).toEqual(
              starts === 0 ? [] : [['start', fixture.backend.Id]],
            );
            expect(fixture.commands.some((args) => ['restart', 'rm'].includes(args[0]))).toBe(
              false,
            );
            await context.source.inspectCold();
            await inspectDependencyIngress(
              context.owner,
              [context.layouts.prod, context.layouts.dev],
              context.ports.docker,
              context.deadline,
            );
            await assertParticipantRestorationContext(context);
          }
        },
        (fixture) => {
          const networks = readFields(
            readFields(readFields(fixture.backend)['NetworkSettings'])['Networks'],
          );
          Object.assign(readFields(networks[fixture.layouts.prod.network]), {
            IPAddress: '127.0.0.1',
            GlobalIPv6Address: '',
          });
        },
        [],
      );
    } finally {
      await backend.stop(true);
    }
  }, 300000);
