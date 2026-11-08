import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { basename, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { productProcessFixture } from '../fixtures/dependency-product-process';
import { roots } from '../fixtures/source-startup';
import {
  assertParticipantRestorationContext,
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import { inspectDependencyIngress } from './dependency-ingress';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { restoreSolverForPreparedParticipants } from './dependency-participant-solver-restoration';
import * as solverRestoration from './dependency-solver-restoration';
import { withDependencyOwner } from './edge-ownership';
import { captureEdgePolicy, captureEdgeRecord, captureParticipantFence } from './edge-policy';
import type { InstalledAuthorityObservation } from './installed-authorities';
import { readFields, readString } from './managed-cohort';
import { SOLVER_EDGE_STATE, type SolverRestorePorts } from './solver-host';

function readStore(path: string) {
  const database = new Database(path, { readonly: true, create: false });
  try {
    return {
      authority: database
        .query('SELECT * FROM cross_project_dependency_activation ORDER BY id')
        .all(),
      receipts: database
        .query('SELECT * FROM cross_project_dependency_activation_receipt ORDER BY id')
        .all(),
      ledger: database.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
    };
  } finally {
    database.close();
  }
}

function projectAuthorityIdentity(authority: InstalledAuthorityObservation) {
  return {
    format: authority.format,
    version: authority.version,
    activation: authority.activation,
    sourceSha: authority.sourceSha,
    writerManifestSha256: authority.writerManifestSha256,
    hostMachineIdSha256: authority.hostMachineIdSha256,
    bootId: authority.bootId,
    launchConfigurationSha256: authority.launchConfigurationSha256,
    files: authority.files,
    scope: authority.scope,
  };
}

async function assertRunningAuthority(context: FinalizedParticipantRestorationContext) {
  const observed = await context.observeAuthorities();
  expect(projectAuthorityIdentity(observed)).toEqual(projectAuthorityIdentity(context.authorities));
  expect(observed.solver).toEqual({
    phase: 'running',
    pid: 123,
    startTime: '12345',
    cgroup: '/user.slice/user-1000.slice/user@1000.service/app.slice/wbs-solver-supervisor.service',
    tuple: context.authorities.solver.tuple,
  });
  expect(observed.databaseOpeners).toEqual([]);
  expect(observed.relevantProcesses).toHaveLength(1);
  expect(observed.relevantProcesses.at(0)).toMatchObject({
    pid: 123,
    startTime: '12345',
    cgroup: '/user.slice/user-1000.slice/user@1000.service/app.slice/wbs-solver-supervisor.service',
  });
}

async function assertRestorationRefusal(context: FinalizedParticipantRestorationContext) {
  let refusal: unknown;
  try {
    await restoreSolverForPreparedParticipants(context);
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('solver restoration refusal absent');
  expect(refusal.message).toBe('solver participant restoration refused');
  expect(refusal.cause).toBeUndefined();
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});

for (const scenario of [
  'present',
  'absent',
  'released',
  'late-source',
  'authority-drift',
  'openers',
] as const)
  test(`original-context solver restoration precedes every product: ${scenario}`, async () => {
    const fixture = await productProcessFixture();
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const deadline = performance.now() + 300000;
    const socketPath = join(fixture.root, 'solver-ready.sock');
    let socketConnections = 0;
    const server = createServer((connection) => connection.destroy());
    const runHost = fixture.ports.solver.runHost;
    const observeCgroup = fixture.ports.solver.observeCgroup;
    const initialUnit = await runHost({ kind: 'show' });
    let context: FinalizedParticipantRestorationContext | undefined;
    let solverStarts = 0;
    let primitiveCalls = 0;
    let collectionsAtFault = 0;
    let releasedPolicy: Awaited<ReturnType<typeof captureEdgePolicy>> | undefined;
    let releasedStores:
      { prod: ReturnType<typeof readStore>; dev: ReturnType<typeof readStore> } | undefined;
    let restored: Awaited<ReturnType<typeof solverRestoration.restoreSolverUnderOwner>> | undefined;
    const events: string[] = [];
    const ports: SolverRestorePorts = {
      ...fixture.ports.solver,
      runHost: async (command, signal) => {
        signal?.throwIfAborted();
        if (command.kind === 'start') {
          if (context === undefined) throw new Error('solver start preceded finalized consumption');
          await assertParticipantRestorationContext(context);
          expect(context.deadline).toBe(deadline);
          expect(fixture.backend.State.Running).toBe(false);
          expect(fixture.gateway.State.Running).toBe(false);
          expect(fixture.source.State.Running).toBe(false);
          expect((await captureEdgePolicy(fixture.root)).policy.phase).toBe('restoring');
          expect(await captureEdgeRecord(fixture.root, 'edge-owner.pending', 65536)).toEqual(
            context.pending,
          );
          solverStarts++;
          events.push('solver-start');
          await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(socketPath, () => {
              server.removeListener('error', reject);
              resolve();
            });
          });
          return '';
        }
        return solverStarts === 1 && command.kind === 'show'
          ? initialUnit
          : runHost(command, signal);
      },
      observeCgroup: async (...args) => {
        const observed = await observeCgroup(...args);
        return solverStarts === 1 && observed !== null
          ? { ...observed, populated: true }
          : observed;
      },
      connectSocket: async (signal) => {
        expect(solverStarts).toBe(1);
        events.push('socket-connect');
        await new Promise<void>((resolve, reject) => {
          const connection = createConnection({ path: socketPath, signal });
          connection.once('connect', () => {
            socketConnections++;
            if (
              socketConnections === 1 &&
              (scenario === 'authority-drift' || scenario === 'openers')
            ) {
              collectionsAtFault = fixture.collections();
              fixture.setAuthorityFault(scenario === 'authority-drift' ? 'boot-drift' : 'opener');
            }
            if (scenario === 'late-source' && socketConnections === 3)
              fixture.source.HostConfig.RestartPolicy.Name = 'always';
            connection.destroy();
            resolve();
          });
          connection.once('error', (cause) => {
            connection.destroy();
            reject(cause);
          });
        });
      },
    };
    // The subtype traverses the original preparation. The missing case supplies
    // its base type, so no fake ready observation or second transport enters.
    const selectedPorts =
      scenario !== 'absent'
        ? ports
        : {
            ...fixture.ports.solver,
            runHost: ports.runHost,
            observeCgroup: ports.observeCgroup,
          };
    Object.assign(fixture.ports, { solver: selectedPorts });
    Object.assign(fixture.ports.authorities, {
      solver: {
        ...selectedPorts,
        runHost: async (
          command: Parameters<SolverRestorePorts['runHost']>[0],
          signal?: AbortSignal,
        ) =>
          (await selectedPorts.runHost(command, signal)).replace(
            `WBS_EDGE_STATE=${fixture.root}`,
            `WBS_EDGE_STATE=${SOLVER_EDGE_STATE}`,
          ),
      },
    });
    const restore = solverRestoration.restoreSolverUnderOwner;
    const called = spyOn(solverRestoration, 'restoreSolverUnderOwner').mockImplementation(
      async (...args) => {
        if (context === undefined)
          throw new Error('solver primitive preceded finalized consumption');
        primitiveCalls++;
        expect(args[0]).toBe(context.owner);
        expect(args[1]).toBe(context.layouts);
        expect(args[2]).toBe(context.request.solver);
        expect(context.ports.solver).toBe(args[3]);
        expect(args[4]).toBe(context.deadline);
        expect(args[5]).toBe(context.originalPolicy);
        expect(args[6].parked).toBe(context.parked);
        expect(args[6].intent).toBe(context.solverIntent);
        expect(args[6].installed).toBe(context.authorities.solver.tuple);
        events.push('solver-primitive');
        restored = await restore(...args);
        events.push('solver-ready');
        return restored;
      },
    );
    try {
      await withDependencyOwner(
        fixture.request.owner,
        async (owner) => {
          const prepared = await prepareActivatedParticipantsUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            deadline,
            fixture.root,
            fixture.ports,
          );
          try {
            context = await consumePreparedDependencyActivation(owner, prepared);
            expect(context.owner).toBe(owner);
            expect(context.deadline).toBe(deadline);
            expect(context.ports).toBe(fixture.ports);
            expect(context.ports.solver).toBe(selectedPorts);
            expect(context.authorities.solver.phase).toBe('stopped');
            await assertParticipantRestorationContext(context);
            await context.parked.inspect(new Set());
            const prodBefore = readStore(fixture.prodPath);
            const devBefore = readStore(fixture.devPath);
            const policyBefore = await captureEdgePolicy(fixture.root);
            const retainedFences = await Promise.all(
              (
                [
                  {
                    directory: context.layouts.dev.stateDir,
                    name: 'dependency-source-dev-intent.json',
                  },
                  {
                    directory: context.layouts.dev.stateDir,
                    name: 'dependency-source-dev-complete.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-backend-fence.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-backend-intent.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-backend-complete.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-gateway-fence.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-gateway-intent.json',
                  },
                  {
                    directory: context.layouts.prod.stateDir,
                    name: 'dependency-gateway-complete.json',
                  },
                ] as const
              ).map(async (reference) => ({
                ...reference,
                snapshot: await captureParticipantFence(reference.directory, reference.name),
              })),
            );
            if (scenario === 'released') {
              releasedPolicy = policyBefore;
              releasedStores = { prod: prodBefore, dev: devBefore };
              return;
            }
            if (scenario === 'absent') {
              await assertRestorationRefusal(context);
              expect(primitiveCalls).toBe(0);
              expect(solverStarts).toBe(0);
              expect(await captureEdgePolicy(fixture.root)).toEqual(policyBefore);
              // A failed attempt remains terminal even if its missing transport is later repaired.
              Object.assign(selectedPorts, { connectSocket: ports.connectSocket });
              await assertRestorationRefusal(context);
              expect(primitiveCalls).toBe(0);
              expect(solverStarts).toBe(0);
              expect(await captureEdgePolicy(fixture.root)).toEqual(policyBefore);
            } else if (scenario === 'authority-drift' || scenario === 'openers') {
              await assertRestorationRefusal(context);
              expect(primitiveCalls).toBe(1);
              expect(solverStarts).toBe(1);
              expect(socketConnections).toBe(2);
              expect(fixture.collections()).toBeGreaterThan(collectionsAtFault);
              fixture.setAuthorityFault('none');
            } else if (scenario === 'late-source') {
              await assertRestorationRefusal(context);
              expect(primitiveCalls).toBe(1);
              expect(solverStarts).toBe(1);
              expect(socketConnections).toBe(3);
              expect(fixture.source.HostConfig.RestartPolicy.Name).toBe('always');
              // Restore only the injected fixture fault after observing refusal.
              fixture.source.HostConfig.RestartPolicy.Name = 'no';
            } else {
              await assertRestorationRefusal({ ...context });
              expect(primitiveCalls).toBe(0);
              expect(solverStarts).toBe(0);
              expect(await captureEdgePolicy(fixture.root)).toEqual(policyBefore);
              const completion = await restoreSolverForPreparedParticipants(context);
              expect(completion).toEqual({
                state: 'solver-ready-participants-fenced',
                exposure: 'closed',
                controllers: 'fenced',
              });
              expect(primitiveCalls).toBe(1);
              expect(solverStarts).toBe(1);
              expect(socketConnections).toBeGreaterThan(0);
              await assertRunningAuthority(context);
              expect(events.slice(0, 4)).toEqual([
                'solver-primitive',
                'solver-start',
                'socket-connect',
                'solver-ready',
              ]);
              if (restored === undefined) throw new Error('actual retained solver result absent');
              expect(restored.removed.size).toBe(0);
              expect(await captureEdgePolicy(fixture.root)).toEqual(restored.policy);
              await restored.inspectReady();
              await assertRunningAuthority(context);
              expect(socketConnections).toBeGreaterThan(1);
              expect(context.originalPolicy).toEqual(policyBefore);
              expect(context.authorities.solver.phase).toBe('stopped');
              const names = (await readdir(fixture.root)).filter((name) =>
                /^edge-owner-[0-9]{6,12}-solver-restore-complete\.json$/.test(name),
              );
              expect(names).toHaveLength(3);
              const pendingContents = context.pending.contents;
              const records = await Promise.all(
                names.sort().map(async (name) => {
                  const envelope: unknown = JSON.parse(
                    await readFile(join(fixture.root, name), 'utf8'),
                  );
                  expect(readFields(envelope)['owner']).toBe(pendingContents);
                  return readFields(readFields(envelope)['record']);
                }),
              );
              expect(records.map((record) => record['phase'])).toEqual([
                'policy-publication-intent',
                'policy-published',
                'solver-ready-participants-fenced',
              ]);
              expect(
                records.filter((record) => record['phase'] === 'solver-ready-participants-fenced'),
              ).toHaveLength(1);
              const publicationIntent = records.at(0);
              const policyPublished = records.at(1);
              const solverReady = records.at(2);
              if (
                publicationIntent === undefined ||
                policyPublished === undefined ||
                solverReady === undefined
              )
                throw new Error('solver publication record sequence absent');
              const reference = {
                name: basename(context.solverIntent.path),
                sha256: createHash('sha256').update(context.solverIntent.contents).digest('hex'),
              };
              const sibling = readString(publicationIntent['sibling']);
              expect(sibling).toMatch(/^\.edge-policy\.json\.dependency-[a-f0-9-]{36}$/);
              expect(publicationIntent).toEqual({
                phase: 'policy-publication-intent',
                reference,
                sibling,
                originalSha256: createHash('sha256').update(policyBefore.contents).digest('hex'),
              });
              expect(policyPublished).toEqual({ phase: 'policy-published', reference });
              const cgroup =
                '/user.slice/user-1000.slice/user@1000.service/app.slice/wbs-solver-supervisor.service';
              expect(solverReady).toEqual({
                phase: 'solver-ready-participants-fenced',
                observed: {
                  unit: { pid: 123, invocation: 'a'.repeat(32), cgroup },
                  process: { pid: 123, startTime: '12345', cgroup },
                  cgroup: { device: '1', inode: '2', populated: true },
                },
              });
              await assertRestorationRefusal(context);
              expect(primitiveCalls).toBe(1);
              expect(solverStarts).toBe(1);
              expect(await captureEdgePolicy(fixture.root)).toEqual(restored.policy);
            }
            expect(readStore(fixture.prodPath)).toEqual(prodBefore);
            expect(readStore(fixture.devPath)).toEqual(devBefore);
            await context.storage.evidence.inspect();
            context.artifact.verify();
            await context.storage.stores.inspect();
            await context.source.inspectCold();
            await assertParticipantRestorationContext(context);
            await inspectDependencyIngress(
              owner,
              [fixture.layouts.prod, fixture.layouts.dev],
              fixture.ports.docker,
              deadline,
            );
            for (const reference of retainedFences)
              expect(await captureParticipantFence(reference.directory, reference.name)).toEqual(
                reference.snapshot,
              );
            expect(
              fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0])),
            ).toBe(false);
            expect(fixture.backend.State.Running).toBe(false);
            expect(fixture.gateway.State.Running).toBe(false);
            expect(fixture.source.State.Running).toBe(false);
            expect(
              (await readdir(fixture.root)).some(
                (name) =>
                  name.endsWith('-activation-participants-restored.json') ||
                  name.endsWith('-activation-participant-start-intent.json') ||
                  name.endsWith('-activation-participant-policy-intent.json'),
              ),
            ).toBe(false);
          } finally {
            releasePreparedDependencyActivation(owner, prepared);
          }
        },
        fixture.root,
      );
      if (scenario === 'released') {
        if (context === undefined || releasedPolicy === undefined || releasedStores === undefined)
          throw new Error('genuine released context was not retained');
        await assertRestorationRefusal(context);
        expect(primitiveCalls).toBe(0);
        expect(solverStarts).toBe(0);
        expect(await captureEdgePolicy(fixture.root)).toEqual(releasedPolicy);
        expect(readStore(fixture.prodPath)).toEqual(releasedStores.prod);
        expect(readStore(fixture.devPath)).toEqual(releasedStores.dev);
        expect(fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0]))).toBe(
          false,
        );
      }
    } finally {
      called.mockRestore();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((cause) => {
            if (cause === undefined) resolve();
            else reject(cause);
          }),
        );
    }
  }, 300000);
