import { ok } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

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
import { decodeAuthorityCollection } from './installed-authorities';
import { readClosed, readFields, readString } from './managed-cohort';

const { restoreBackendAfterSolver, restoreBackendParticipantUnderOwner } =
  await import('./dependency-participant-restoration');
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

async function runSolverBackendCase(scenario: SolverBackendCase) {
  current.readinessTransport = true;
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
        let isBootDriftExpected = false;
        let bootDriftObservations = 0;
        let lateSourceChanges = 0;
        const observeProduct = productProcess.observeSelectedProductRole;
        const finalProduct = spyOn(productProcess, 'observeSelectedProductRole').mockImplementation(
          async (...args) => {
            const observation = await observeProduct(...args);
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
            const bytes = JSON.stringify({ ...envelope, databaseOpeners: [opener] });
            const nonce = readString(readFields(args[0])['nonce']);
            expect(
              decodeAuthorityCollection(bytes, nonce, fixture.request.authorities.pins)
                .databaseOpeners,
            ).toEqual([opener]);
            rawOpenerDeliveries++;
            return bytes;
          },
        });
        const observed = spyOn(context, 'observeAuthorities').mockImplementation(async () => {
          const authority = await observeAuthorities();
          if (isBootDriftExpected) {
            expect(authority.bootId).toBe('22222222-2222-2222-2222-222222222222');
            expect(authority.solver.phase).toBe('running');
            expect(authority.solver.tuple).toEqual(context.authorities.solver.tuple);
            bootDriftObservations++;
          }
          if (authority.databaseOpeners.length !== 0) {
            expect(authority.databaseOpeners).toEqual([opener]);
            expect(authority.solver.phase).toBe('running');
            expect(authority.solver.tuple).toEqual(context.authorities.solver.tuple);
            consumedOpeners++;
          }
          return authority;
        });
        Object.assign(fixture.ports, {
          docker: async (args: Parameters<typeof docker>[0], signal?: AbortSignal) => {
            if (args[0] !== 'start') return docker(args, signal);
            expect(args).toEqual(['start', context.originals.backend.id]);
            expect(starts).toBe(0);
            expect(solver).toBeDefined();
            if (solver === undefined) throw new Error('backend preceded actual solver readiness');
            const restoration = await activationRecord(fixture.root, 'participant-restore-intent');
            const intent = await activationRecord(fixture.root, 'participant-start-intent');
            startsAtPublication.push({ restoration, intent });
            expect(events).toEqual(['solver-ready']);
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
        try {
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
          expect(inspectStore(fixture.prodPath)).toEqual(prodBefore);
          expect(inspectStore(fixture.devPath)).toEqual(devBefore);
          for (const audit of audits) {
            assertLocalTransportSettled(audit);
            await assertAuditContent(audit);
          }
          expect(fixture.gateway.State.Running).toBe(false);
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
  }
}

for (const scenario of SOLVER_BACKEND_CASES)
  test(scenario.name, () => runSolverBackendCase(scenario.kind), 300000);
