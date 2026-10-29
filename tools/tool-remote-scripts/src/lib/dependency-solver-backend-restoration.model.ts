import { ok } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import {
  GATEWAY_RESTORATION_CASES,
  type GatewayRestorationCase,
} from '../fixtures/gateway-restoration-cases';
import { createParticipantSolverRuntime } from '../fixtures/participant-solver-runtime';
import { SOLVER_BACKEND_CASES, type SolverBackendCase } from '../fixtures/solver-backend-cases';
import * as inventory from './dependency-participant-inventory';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { activationRecord, inspectStore } from './dependency-participant-restoration.model';
import {
  consumeSolverReadyForBackend,
  restoreSolverForPreparedParticipants,
} from './dependency-participant-solver-restoration';
import * as productProcess from './dependency-product-process';
import {
  assertAuditContent,
  assertLocalTransportSettled,
  current,
  withModelContext,
} from './dependency-product-process-model.model';
import * as solverRestoration from './dependency-solver-restoration';
import * as ownership from './edge-ownership';
import { captureEdgeRecord, type EdgeRecordSnapshot } from './edge-policy';
import {
  decodeAuthorityCollection,
  type HostProcessIdentity,
  type InstalledAuthorityObservation,
} from './installed-authorities';
import { readClosed, readFields, readString } from './managed-cohort';

const {
  restoreBackendAfterSolver,
  restoreBackendParticipantUnderOwner,
  restoreGatewayAfterBackend,
} = await import('./dependency-participant-restoration');
const hashContents = (contents: string) => createHash('sha256').update(contents).digest('hex');

async function readFailure(operation: Promise<unknown>, message?: string) {
  const failure: unknown = await operation.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  ok(failure instanceof Error, 'solver-backend operation must refuse');
  if (message !== undefined) {
    expect(failure.message).toBe(message);
    expect(failure.cause).toBeUndefined();
  }
  return failure;
}

async function runProductRestorationCase(scenario: SolverBackendCase | GatewayRestorationCase) {
  current.readinessTransport = true;
  const isGateway = GATEWAY_RESTORATION_CASES.some((entry) => entry.kind === scenario);
  let isBackendProcessDrifted = false;
  let isGatewayProcessDrifted = false;
  let readReleasedGatewayAttempts = () => 0;
  let healthRequests = 0;
  let capabilityRequests = 0;
  let runtime: ReturnType<typeof createParticipantSolverRuntime> | undefined;
  let releasedContext: FinalizedParticipantRestorationContext | undefined;
  let readReleasedStarts = () => 0;
  const events: string[] = [];
  const backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 3100,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/health') {
        healthRequests++;
        if (scenario === 'solver-during') {
          if (runtime === undefined) throw new Error('solver runtime fixture absent');
          runtime.setProcessDrift(true);
        }
        return Response.json({ status: 'ok', commit: null });
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
  let gatewayHealthRequests = 0;
  const gateway = isGateway
    ? Bun.serve({
        hostname: '127.0.0.1',
        port: 3200,
        fetch(request) {
          if (new URL(request.url).pathname !== '/health')
            return new Response('fixture path absent', { status: 404 });
          gatewayHealthRequests++;
          if (scenario === 'gateway-backend-drift') isBackendProcessDrifted = true;
          if (scenario === 'gateway-solver-drift') {
            if (runtime === undefined) throw new Error('solver runtime fixture absent');
            runtime.setProcessDrift(true);
          }
          return Response.json({ status: 'ok' });
        },
      })
    : null;
  try {
    await withModelContext(
      async (context, fixture, audits) => {
        if (runtime === undefined) throw new Error('solver fixture was not attached');
        const activeRuntime = runtime;
        activeRuntime.bindContext(context);
        const prodBefore = inspectStore(fixture.prodPath);
        const devBefore = inspectStore(fixture.devPath);
        let solver:
          Awaited<ReturnType<typeof solverRestoration.restoreSolverUnderOwner>> | undefined;
        const inventoryInputs: { parked: readonly unknown[]; removed: ReadonlySet<string> }[] = [];
        const inspectInventory = inventory.assertParticipantInventory;
        const forwardedInventory = spyOn(
          inventory,
          'assertParticipantInventory',
        ).mockImplementation((...args) => {
          inventoryInputs.push({ parked: args[0], removed: args[4] });
          inspectInventory(...args);
        });
        const restore = solverRestoration.restoreSolverUnderOwner;
        const restoredSolver = spyOn(
          solverRestoration,
          'restoreSolverUnderOwner',
        ).mockImplementation(async (...args) => {
          expect(args[0]).toBe(context.owner);
          expect(args[4]).toBe(context.deadline);
          expect(args[6].parked).toBe(context.parked);
          expect(args[6].intent).toBe(context.solverIntent);
          expect(args[6].installed).toBe(context.authorities.solver.tuple);
          solver = await restore(...args);
          events.push('solver-ready');
          return solver;
        });
        let changedPublications = 0;
        const retainSolver = ownership.retainSolverRecord;
        const publication = spyOn(ownership, 'retainSolverRecord').mockImplementation(
          async (...args) => {
            const retained = await retainSolver(...args);
            if (
              scenario === 'publication-bytes' &&
              args[2] === 'restore-complete' &&
              readFields(args[3])['phase'] === 'solver-ready-participants-fenced'
            ) {
              const envelope: unknown = JSON.parse(retained.contents);
              const record = readFields(readFields(envelope)['record']);
              await writeFile(
                retained.path,
                JSON.stringify({
                  ...readFields(envelope),
                  record: { ...record, phase: 'policy-published' },
                }) + '\n',
              );
              changedPublications++;
            }
            return retained;
          },
        );
        const docker = fixture.ports.docker;
        const collect = fixture.ports.authorities.collect;
        const observeAuthorities = context.observeAuthorities;
        let starts = 0;
        let gatewayStartAttempts = 0;
        let gatewayStarts = 0;
        const activationPublications: { label: string; snapshot: EdgeRecordSnapshot }[] = [];
        const retainActivation = ownership.retainActivationRecord;
        const activation = spyOn(ownership, 'retainActivationRecord').mockImplementation(
          async (...args) => {
            const snapshot = await retainActivation(...args);
            activationPublications.push({ label: args[2], snapshot: structuredClone(snapshot) });
            return snapshot;
          },
        );
        const readPublicationRecord = (snapshot: EdgeRecordSnapshot) =>
          readFields(readFields(JSON.parse(snapshot.contents))['record']);

        let isBootDriftExpected = false;
        let bootDriftObservations = 0;
        let lateSourceChanges = 0;
        let lateGatewayChanges = 0;
        let gatewayProcessChanges = 0;
        let invalidOpenerDeliveries = 0;
        let consumedInvalidOpeners = 0;
        let deliveredOpeners: InstalledAuthorityObservation['databaseOpeners'] = [];
        let gatewayProcess: HostProcessIdentity | null = null;
        const sourcePolicy = fixture.source.HostConfig.RestartPolicy.Name;
        const observeProduct = productProcess.observeSelectedProductRole;
        const finalProduct = spyOn(productProcess, 'observeSelectedProductRole').mockImplementation(
          async (...args) => {
            const priorFault = current.fault;
            if (
              (isBackendProcessDrifted && args[1] === 'backend') ||
              (isGatewayProcessDrifted && args[1] === 'gateway')
            )
              current.fault = 'application-object';
            let observation: Awaited<ReturnType<typeof observeProduct>>;
            try {
              observation = await observeProduct(...args);
            } finally {
              current.fault = priorFault;
            }
            if (args[1] === 'gateway') gatewayProcess = observation.process;
            if (
              (scenario === 'gateway-late-source' || scenario === 'gateway-late-fence') &&
              args[1] === 'gateway' &&
              lateGatewayChanges === 0 &&
              activationPublications.some(
                (publication) =>
                  publication.label === 'participant-ready' &&
                  readPublicationRecord(publication.snapshot)['role'] === 'gateway',
              )
            ) {
              lateGatewayChanges++;
              if (scenario === 'gateway-late-source')
                fixture.source.HostConfig.RestartPolicy.Name = 'always';
              else
                await writeFile(context.fencedComplete.path, context.fencedComplete.contents + ' ');
            }
            if (
              scenario === 'late-source' &&
              (await readdir(fixture.root)).some((name) =>
                name.endsWith('-activation-participant-ready.json'),
              )
            ) {
              expect(lateSourceChanges).toBe(0);
              fixture.source.HostConfig.RestartPolicy.Name = 'always';
              lateSourceChanges++;
            }
            return observation;
          },
        );
        const startsAtPublication: {
          restoration: Awaited<ReturnType<typeof activationRecord>>;
          intent: Awaited<ReturnType<typeof activationRecord>>;
        }[] = [];
        let rawOpenerDeliveries = 0;
        let consumedOpeners = 0;
        const opener = {
          environment: scenario === 'dev-opener' ? ('dev' as const) : ('prod' as const),
          suffix: '' as const,
          pid: 40002,
          startTime: '140002',
          uid: 0,
          cgroup: '/docker/backend',
          fd: 7,
          executable: { device: '2049', inode: '992', sha256: hashContents('backend-bun') },
        };
        Object.assign(fixture.ports.authorities, {
          collect: async (...args: Parameters<typeof collect>) => {
            const original = await collect(...args);
            if (
              starts !== 1 ||
              healthRequests !== 1 ||
              capabilityRequests !== 1 ||
              current.execs < 6
            )
              return original;
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
            let openers: InstalledAuthorityObservation['databaseOpeners'][number][] = [opener];
            if (
              gatewayStarts === 1 &&
              gatewayHealthRequests === 1 &&
              (scenario === 'gateway-opener' ||
                scenario === 'gateway-dev-opener' ||
                scenario === 'gateway-foreign-opener')
            ) {
              let invalid: InstalledAuthorityObservation['databaseOpeners'][number] = {
                ...opener,
                environment: 'dev',
                fd: 8,
              };
              if (scenario === 'gateway-opener') {
                if (gatewayProcess === null)
                  throw new Error('actual gateway process absent before opener collection');
                expect(gatewayProcess.executable).not.toBeNull();
                invalid = {
                  ...opener,
                  environment: 'prod',
                  pid: gatewayProcess.pid,
                  startTime: gatewayProcess.startTime,
                  uid: gatewayProcess.uid,
                  cgroup: gatewayProcess.cgroup,
                  executable: gatewayProcess.executable,
                  fd: 8,
                };
              } else if (scenario === 'gateway-foreign-opener') {
                invalid = {
                  ...opener,
                  environment: 'prod',
                  pid: 60002,
                  startTime: '160002',
                  cgroup: '/foreign',
                  fd: 8,
                };
              }
              openers = [opener, invalid];
              invalidOpenerDeliveries++;
            }
            deliveredOpeners = openers;
            const bytes = JSON.stringify({ ...envelope, databaseOpeners: openers });
            const nonce = readString(readFields(args[0])['nonce']);
            expect(
              decodeAuthorityCollection(bytes, nonce, fixture.request.authorities.pins)
                .databaseOpeners,
            ).toEqual(openers);
            rawOpenerDeliveries++;
            return bytes;
          },
        });
        const observed = spyOn(context, 'observeAuthorities').mockImplementation(async () => {
          const authority = await observeAuthorities();
          if (
            scenario === 'gateway-late-process' &&
            gatewayHealthRequests === 1 &&
            gatewayStarts === 1 &&
            !isGatewayProcessDrifted
          ) {
            isGatewayProcessDrifted = true;
            gatewayProcessChanges++;
          }
          if (isBootDriftExpected) {
            expect(authority.bootId).toBe('22222222-2222-2222-2222-222222222222');
            expect(authority.solver.phase).toBe('running');
            expect(authority.solver.tuple).toEqual(context.authorities.solver.tuple);
            bootDriftObservations++;
          }
          if (authority.databaseOpeners.length !== 0) {
            expect(authority.databaseOpeners).toEqual(deliveredOpeners);
            expect(authority.solver.phase).toBe(
              scenario === 'gateway-parked' ? 'stopped' : 'running',
            );
            if (authority.databaseOpeners.length > 1) consumedInvalidOpeners++;
            expect(authority.solver.tuple).toEqual(context.authorities.solver.tuple);
            consumedOpeners++;
          }
          return authority;
        });
        Object.assign(fixture.ports, {
          docker: async (args: Parameters<typeof docker>[0], signal?: AbortSignal) => {
            if (args[0] !== 'start') return docker(args, signal);
            if (args[1] === context.originals.gateway.id) {
              gatewayStartAttempts++;
              expect(args).toEqual(['start', context.originals.gateway.id]);
              expect(gatewayStarts).toBe(0);
              expect(starts).toBe(1);
              expect(events).toEqual(['solver-ready', 'backend-start']);
              expect(fixture.backend.State.Running).toBe(true);
              expect(fixture.source.State.Running).toBe(false);
              const intents = activationPublications.filter(
                (publication) =>
                  publication.label === 'participant-start-intent' &&
                  readPublicationRecord(publication.snapshot)['role'] === 'gateway',
              );
              expect(intents).toHaveLength(1);
              const gatewayIntent = intents.at(0);
              const backendPublication = startsAtPublication.at(0);
              if (gatewayIntent === undefined || backendPublication === undefined)
                throw new Error('actual gateway start publications absent');
              expect(readPublicationRecord(gatewayIntent.snapshot)).toEqual({
                format: 'dependency-participant-start-intent',
                version: 1,
                restoration: backendPublication.restoration.reference,
                role: 'gateway',
                id: context.originals.gateway.id,
              });
              const backendReady = activationPublications.filter(
                (publication) =>
                  publication.label === 'participant-ready' &&
                  readPublicationRecord(publication.snapshot)['role'] === 'backend',
              );
              expect(backendReady).toHaveLength(1);
              const retainedBackendReady = backendReady.at(0);
              if (retainedBackendReady === undefined)
                throw new Error('actual backend ready publication absent');
              expect(await readFile(retainedBackendReady.snapshot.path, 'utf8')).toBe(
                retainedBackendReady.snapshot.contents,
              );
              events.push('gateway-start');
              gatewayStarts++;
              fixture.commands.push([...args]);
              Object.assign(fixture.gateway.State, {
                Running: true,
                Status: 'running',
                Pid: 50001,
                StartedAt: '2026-10-24T08:00:00Z',
              });
              fixture.setTop('PID PPID\n50001 1\n50002 50001\n', fixture.gateway.Id);
              return fixture.gateway.Id + '\n';
            }
            expect(args).toEqual(['start', context.originals.backend.id]);
            expect(starts).toBe(0);
            if (scenario === 'gateway-parked') expect(solver).toBeUndefined();
            else {
              expect(solver).toBeDefined();
              if (solver === undefined) throw new Error('backend preceded actual solver readiness');
            }
            const restoration = await activationRecord(fixture.root, 'participant-restore-intent');
            const intent = await activationRecord(fixture.root, 'participant-start-intent');
            startsAtPublication.push({ restoration, intent });
            expect(events).toEqual(scenario === 'gateway-parked' ? [] : ['solver-ready']);
            events.push('backend-start');
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
        const assertBackendStopped = async () => {
          expect(starts).toBe(0);
          expect(healthRequests).toBe(0);
          expect(capabilityRequests).toBe(0);
          expect(fixture.backend.State.Running).toBe(false);
          expect(fixture.gateway.State.Running).toBe(false);
          expect(fixture.source.State.Running).toBe(false);
          expect(
            (await readdir(fixture.root)).some(
              (name) =>
                name.endsWith('-activation-participant-restore-intent.json') ||
                name.endsWith('-activation-participant-start-intent.json') ||
                name.endsWith('-activation-participant-ready.json'),
            ),
          ).toBe(false);
        };
        const assertGatewayStopped = () => {
          expect(gatewayStartAttempts).toBe(0);
          expect(gatewayStarts).toBe(0);
          expect(gatewayHealthRequests).toBe(0);
          expect(fixture.gateway.State.Running).toBe(false);
          expect(
            activationPublications.some(
              (publication) =>
                (publication.label === 'participant-start-intent' ||
                  publication.label === 'participant-ready') &&
                readPublicationRecord(publication.snapshot)['role'] === 'gateway',
            ),
          ).toBe(false);
        };
        try {
          if (scenario === 'gateway-ready') {
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            assertGatewayStopped();
          }
          if (scenario === 'gateway-parked') {
            const partial = await restoreBackendParticipantUnderOwner(context);
            expect(partial.state).toBe('backend-ready-participants-fenced');
            expect(starts).toBe(1);
            expect(activeRuntime.readSolverStarts()).toBe(0);
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            assertGatewayStopped();
            return;
          }
          if (scenario === 'ready') {
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await assertBackendStopped();
          }
          if (scenario === 'publication-bytes') {
            await readFailure(
              restoreSolverForPreparedParticipants(context),
              'solver participant restoration refused',
            );
            expect(changedPublications).toBe(1);
            expect(activeRuntime.readSolverStarts()).toBe(1);
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await assertBackendStopped();
            return;
          }
          await restoreSolverForPreparedParticipants(context);
          expect(activeRuntime.readSolverStarts()).toBe(1);
          expect(activeRuntime.readSocketConnections()).toBeGreaterThan(0);
          expect(events).toEqual(['solver-ready']);
          expect(fixture.backend.State.Running).toBe(false);
          expect(fixture.gateway.State.Running).toBe(false);
          expect(fixture.source.State.Running).toBe(false);
          if (solver === undefined) throw new Error('actual retained solver result absent');
          const actualSolver = solver;
          if (scenario === 'released') {
            releasedContext = context;
            readReleasedStarts = () => starts;
            await assertBackendStopped();
            return;
          }
          if (scenario === 'record-monitor') {
            const path = actualSolver.readySnapshot.path;
            const held = join(fixture.root, 'held-original-solver-ready');
            const contents = actualSolver.readySnapshot.contents;
            for (const fault of ['missing', 'unreadable', 'changed', 'same-byte']) {
              if (fault === 'missing' || fault === 'same-byte') await rename(path, held);
              if (fault === 'same-byte') {
                await writeFile(path, contents, { mode: 0o600 });
                expect(String((await lstat(path, { bigint: true })).ino)).not.toBe(
                  actualSolver.readySnapshot.inode,
                );
                expect(await readFile(path, 'utf8')).toBe(contents);
              }
              if (fault === 'unreadable') await chmod(path, 0);
              if (fault === 'changed') await writeFile(path, contents + ' ');
              try {
                await readFailure(actualSolver.inspectReady());
              } finally {
                if (fault === 'same-byte') await unlink(path);
                if (fault === 'missing' || fault === 'same-byte') await rename(held, path);
                if (fault === 'unreadable') await chmod(path, 0o600);
                if (fault === 'changed') await writeFile(path, contents);
              }
              await actualSolver.inspectReady();
            }
            await rename(path, held);
            try {
              await readFailure(
                restoreBackendAfterSolver(context),
                'backend participant restoration refused',
              );
              await assertBackendStopped();
            } finally {
              await rename(held, path);
            }
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await readFailure(consumeSolverReadyForBackend(context));
            await assertBackendStopped();
            return;
          }
          if (scenario === 'authority-drift') {
            fixture.setAuthorityFault('boot-drift');
            isBootDriftExpected = true;
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            expect(bootDriftObservations).toBeGreaterThan(0);
            await assertBackendStopped();
            fixture.setAuthorityFault('none');
            isBootDriftExpected = false;
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await assertBackendStopped();
            return;
          }
          if (scenario === 'late-source') {
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            expect(lateSourceChanges).toBe(1);
            expect(starts).toBe(1);
            expect(healthRequests).toBe(1);
            expect(capabilityRequests).toBe(1);
            expect(rawOpenerDeliveries).toBeGreaterThan(0);
            expect(consumedOpeners).toBe(rawOpenerDeliveries);
            expect(
              (await readdir(fixture.root)).filter((name) =>
                name.endsWith('-activation-participant-ready.json'),
              ),
            ).toHaveLength(1);
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            expect(starts).toBe(1);
            return;
          }
          if (scenario === 'solver-before') {
            activeRuntime.setProcessDrift(true);
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await assertBackendStopped();
            activeRuntime.setProcessDrift(false);
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            await assertBackendStopped();
            return;
          }
          if (scenario === 'solver-during' || scenario === 'dev-opener') {
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            expect(starts).toBe(1);
            expect(healthRequests).toBe(1);
            expect(capabilityRequests).toBe(1);
            if (scenario === 'dev-opener') {
              expect(rawOpenerDeliveries).toBeGreaterThan(0);
              expect(consumedOpeners).toBe(rawOpenerDeliveries);
            }
            expect(
              (await readdir(fixture.root)).some((name) =>
                name.endsWith('-activation-participant-ready.json'),
              ),
            ).toBe(false);
            activeRuntime.setProcessDrift(false);
            await readFailure(
              restoreBackendAfterSolver(context),
              'backend participant restoration refused',
            );
            expect(starts).toBe(1);
            return;
          }
          await readFailure(
            restoreBackendAfterSolver({ ...context }),
            'backend participant restoration refused',
          );
          await assertBackendStopped();
          const ready = await restoreBackendAfterSolver(context);
          expect(ready.state).toBe('backend-ready-participants-fenced');
          expect(inventoryInputs.length).toBeGreaterThan(0);
          expect(
            inventoryInputs.every(
              (snapshot) =>
                snapshot.parked === context.parkedInventory &&
                snapshot.removed === actualSolver.removed,
            ),
          ).toBe(true);
          const startPublication = startsAtPublication.at(0);
          if (startPublication === undefined) throw new Error('actual start publication absent');
          expect(startPublication.restoration.record['solverReady']).toEqual({
            name: basename(actualSolver.readySnapshot.path),
            sha256: hashContents(actualSolver.readySnapshot.contents),
          });
          expect(startPublication.intent.record).toEqual({
            format: 'dependency-participant-start-intent',
            version: 1,
            restoration: startPublication.restoration.reference,
            role: 'backend',
            id: fixture.backend.Id,
          });
          expect(ready.exposure).toBe('closed');
          expect(ready.controllers).toBe('fenced');
          expect(ready.readiness.observation.process.pid).toBe(40002);
          expect(starts).toBe(1);
          expect(healthRequests).toBe(1);
          expect(capabilityRequests).toBe(1);
          expect(rawOpenerDeliveries).toBeGreaterThan(0);
          expect(consumedOpeners).toBe(rawOpenerDeliveries);
          expect(events).toEqual(['solver-ready', 'backend-start']);
          if (scenario === 'gateway-released') {
            releasedContext = context;
            readReleasedGatewayAttempts = () => gatewayStartAttempts;
            assertGatewayStopped();
            return;
          }
          if (
            scenario === 'gateway-record-missing' ||
            scenario === 'gateway-record-unreadable' ||
            scenario === 'gateway-record-changed' ||
            scenario === 'gateway-record-same-byte'
          ) {
            const originalReady = structuredClone(ready.ready);
            const path = originalReady.path;
            const held = join(fixture.root, 'held-original-backend-ready');
            let isRenamed = false;
            let hasReplacement = false;
            try {
              if (
                scenario === 'gateway-record-missing' ||
                scenario === 'gateway-record-same-byte'
              ) {
                await rename(path, held);
                isRenamed = true;
              }
              if (scenario === 'gateway-record-same-byte') {
                await writeFile(path, originalReady.contents, { mode: 0o600 });
                hasReplacement = true;
                expect(String((await lstat(path, { bigint: true })).ino)).not.toBe(
                  originalReady.inode,
                );
                expect(await readFile(path, 'utf8')).toBe(originalReady.contents);
              }
              if (scenario === 'gateway-record-unreadable') await chmod(path, 0);
              if (scenario === 'gateway-record-changed') {
                const envelope = readFields(JSON.parse(originalReady.contents));
                await writeFile(
                  path,
                  JSON.stringify({
                    ...envelope,
                    record: { ...readFields(envelope['record']), readinessSha256: 'f'.repeat(64) },
                  }) + '\n',
                );
                Object.assign(
                  ready.ready,
                  await captureEdgeRecord(dirname(path), basename(path), 65536),
                );
              }
              await readFailure(
                restoreGatewayAfterBackend(context),
                'gateway participant restoration refused',
              );
              assertGatewayStopped();
            } finally {
              if (hasReplacement) await unlink(path);
              if (isRenamed) await rename(held, path);
              if (scenario === 'gateway-record-unreadable') await chmod(path, 0o600);
              if (scenario === 'gateway-record-changed')
                await writeFile(path, originalReady.contents);
            }
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            assertGatewayStopped();
            return;
          }
          if (
            scenario === 'gateway-late-process' ||
            scenario === 'gateway-backend-drift' ||
            scenario === 'gateway-solver-drift' ||
            scenario === 'gateway-opener' ||
            scenario === 'gateway-dev-opener' ||
            scenario === 'gateway-foreign-opener' ||
            scenario === 'gateway-late-source' ||
            scenario === 'gateway-late-fence'
          ) {
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            expect(gatewayStartAttempts).toBe(1);
            expect(gatewayStarts).toBe(1);
            expect(gatewayHealthRequests).toBe(1);
            const isLate = scenario === 'gateway-late-source' || scenario === 'gateway-late-fence';
            expect(
              activationPublications.filter(
                (publication) =>
                  publication.label === 'participant-ready' &&
                  readPublicationRecord(publication.snapshot)['role'] === 'gateway',
              ),
            ).toHaveLength(isLate ? 1 : 0);
            if (isLate) expect(lateGatewayChanges).toBe(1);
            if (scenario === 'gateway-late-process') expect(gatewayProcessChanges).toBe(1);
            if (
              scenario === 'gateway-opener' ||
              scenario === 'gateway-dev-opener' ||
              scenario === 'gateway-foreign-opener'
            ) {
              expect(invalidOpenerDeliveries).toBeGreaterThan(0);
              expect(consumedInvalidOpeners).toBe(invalidOpenerDeliveries);
            }
            isBackendProcessDrifted = false;
            isGatewayProcessDrifted = false;
            activeRuntime.setProcessDrift(false);
            if (scenario === 'gateway-late-source')
              fixture.source.HostConfig.RestartPolicy.Name = sourcePolicy;
            if (scenario === 'gateway-late-fence')
              await writeFile(context.fencedComplete.path, context.fencedComplete.contents);
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            expect(gatewayStartAttempts).toBe(1);
            return;
          }
          if (scenario === 'gateway-ready') {
            await readFailure(
              restoreGatewayAfterBackend({ ...context }),
              'gateway participant restoration refused',
            );
            assertGatewayStopped();
            const fenced = context.fencedComplete.path;
            const held = join(fixture.root, 'held-original-finalized-fence');
            await rename(fenced, held);
            try {
              await readFailure(
                restoreGatewayAfterBackend(context),
                'gateway participant restoration refused',
              );
              assertGatewayStopped();
            } finally {
              await rename(held, fenced);
            }
            expect(Object.isFrozen(ready.readiness.observation.process)).toBe(true);
            Object.assign(ready, {
              readiness: {
                ...ready.readiness,
                observation: {
                  ...ready.readiness.observation,
                  process: { ...ready.readiness.observation.process, startTime: '777777' },
                },
              },
            });
            Object.assign(ready.ready, { contents: 'public summary changed\n' });
            const gatewayReady = await restoreGatewayAfterBackend(context);
            expect(gatewayReady.state).toBe('gateway-ready-participants-fenced');
            expect(gatewayReady.exposure).toBe('closed');
            expect(gatewayReady.controllers).toBe('fenced');
            expect(gatewayReady.readiness.role).toBe('gateway');
            expect(gatewayReady.readiness.observation.process.pid).toBe(50002);
            expect(gatewayReady.readiness.capabilitySha256).toBeNull();
            expect(gatewayHealthRequests).toBe(1);
            expect(gatewayStartAttempts).toBe(1);
            expect(gatewayStarts).toBe(1);
            expect(starts).toBe(1);
            expect(healthRequests).toBe(1);
            expect(capabilityRequests).toBe(1);
            expect(events).toEqual(['solver-ready', 'backend-start', 'gateway-start']);
            expect(fixture.gateway.State.Running).toBe(true);
            expect(fixture.source.State.Running).toBe(false);
            expect(
              activationPublications.filter(
                (publication) => publication.label === 'participant-restore-intent',
              ),
            ).toHaveLength(1);
            const gatewayRecords = activationPublications.filter(
              (publication) =>
                publication.label === 'participant-ready' &&
                readPublicationRecord(publication.snapshot)['role'] === 'gateway',
            );
            expect(gatewayRecords).toHaveLength(1);
            const gatewayRecord = gatewayRecords.at(0);
            if (gatewayRecord === undefined)
              throw new Error('actual gateway ready publication absent');
            expect(gatewayReady.ready).toEqual(gatewayRecord.snapshot);
            expect(readPublicationRecord(gatewayRecord.snapshot)).toEqual({
              format: 'dependency-participant-ready',
              version: 1,
              restoration: startPublication.restoration.reference,
              role: 'gateway',
              id: fixture.gateway.Id,
              readinessSha256: gatewayReady.readiness.sha256,
            });
            expect(consumedOpeners).toBe(rawOpenerDeliveries);
            expect(rawOpenerDeliveries).toBeGreaterThan(0);
            await readFailure(
              restoreGatewayAfterBackend(context),
              'gateway participant restoration refused',
            );
            expect(gatewayStartAttempts).toBe(1);
            return;
          }
          await readFailure(
            restoreBackendAfterSolver(context),
            'backend participant restoration refused',
          );
          await readFailure(
            restoreBackendParticipantUnderOwner(context),
            'backend participant restoration refused',
          );
          await readFailure(consumeSolverReadyForBackend(context));
          expect(starts).toBe(1);
        } finally {
          Object.assign(fixture.ports, { docker });
          Object.assign(fixture.ports.authorities, { collect });
          observed.mockRestore();
          restoredSolver.mockRestore();
          forwardedInventory.mockRestore();
          publication.mockRestore();
          finalProduct.mockRestore();
          activation.mockRestore();
          expect(inspectStore(fixture.prodPath)).toEqual(prodBefore);
          expect(inspectStore(fixture.devPath)).toEqual(devBefore);
          for (const audit of audits) {
            assertLocalTransportSettled(audit);
            await assertAuditContent(audit);
          }
          if (!isGateway) expect(fixture.gateway.State.Running).toBe(false);
          expect(fixture.source.State.Running).toBe(false);
          expect(
            (await readdir(fixture.root)).some(
              (name) =>
                name.endsWith('-activation-participants-restored.json') ||
                name.endsWith('-activation-participant-policy-intent.json'),
            ),
          ).toBe(false);
        }
      },
      (fixture) => {
        runtime = createParticipantSolverRuntime(fixture);
        for (const member of isGateway ? [fixture.backend, fixture.gateway] : [fixture.backend]) {
          const networks = readFields(
            readFields(readFields(member)['NetworkSettings'])['Networks'],
          );
          Object.assign(readFields(networks[fixture.layouts.prod.network]), {
            IPAddress: '127.0.0.1',
            GlobalIPv6Address: '',
          });
        }
      },
      [],
    );
    if (scenario === 'gateway-released') {
      if (releasedContext === undefined) throw new Error('released original context absent');
      await readFailure(
        restoreGatewayAfterBackend(releasedContext),
        'gateway participant restoration refused',
      );
      expect(readReleasedGatewayAttempts()).toBe(0);
    }

    if (scenario === 'released') {
      if (releasedContext === undefined) throw new Error('released original context absent');
      await readFailure(consumeSolverReadyForBackend(releasedContext));
      await readFailure(
        restoreBackendAfterSolver(releasedContext),
        'backend participant restoration refused',
      );
      expect(readReleasedStarts()).toBe(0);
    }
  } finally {
    if (runtime !== undefined) await runtime.closeRuntime();
    await backend.stop(true);
    if (gateway !== null) await gateway.stop(true);
  }
}

for (const scenario of [...SOLVER_BACKEND_CASES, ...GATEWAY_RESTORATION_CASES])
  test(scenario.name, () => runProductRestorationCase(scenario.kind), 300000);
