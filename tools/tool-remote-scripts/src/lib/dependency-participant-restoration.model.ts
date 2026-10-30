import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, spyOn, test } from 'bun:test';

import * as preparations from './complete-dependency-exclusion';
import type { ActivationRecordByLabel } from './dependency-activation-records';
import { inspectDependencyIngress } from './dependency-ingress';
import {
  assertAuditContent,
  assertLocalTransportSettled,
  current,
  withModelContext,
} from './dependency-product-process-model.model';
import * as ownership from './edge-ownership';
import { captureEdgeRecord, captureOwnerOperationIntent } from './edge-policy';
import { readFields } from './managed-cohort';

const { restoreBackendParticipantUnderOwner } =
  await import('./dependency-participant-restoration');
const hash = (contents: string) => createHash('sha256').update(contents).digest('hex');

export function inspectStore(path: string) {
  const database = new Database(path, { create: false, readonly: true });
  try {
    return {
      activation: database
        .query<{ state: string }, []>(
          'SELECT state FROM cross_project_dependency_activation WHERE id=1',
        )
        .get(),
      authorityRows: database
        .query<{ id: number; state: string }, []>(
          'SELECT id,state FROM cross_project_dependency_activation ORDER BY id',
        )
        .all(),
      receipts: database
        .query<{ id: number; receipt: string }, []>(
          'SELECT id,receipt FROM cross_project_dependency_activation_receipt ORDER BY id',
        )
        .all(),
      ledger: database
        .query<{ id: number; name: string; hash: string; created_at: number }, []>(
          'SELECT id,name,hash,created_at FROM __drizzle_migrations ORDER BY name',
        )
        .all(),
    };
  } finally {
    database.close();
  }
}

export async function activationRecord(directory: string, label: string) {
  const names = (await readdir(directory)).filter((name) =>
    name.endsWith('-activation-' + label + '.json'),
  );
  expect(names).toHaveLength(1);
  const name = names.at(0);
  if (name === undefined) throw new Error('owning coordinator test record absent');
  const snapshot = await captureEdgeRecord(directory, name, 65536);
  const envelope: unknown = JSON.parse(snapshot.contents);
  return {
    snapshot,
    record: readFields(readFields(envelope)['record']),
    reference: { name, sha256: hash(snapshot.contents) },
  };
}

test('backend restart coordinator retains fences through durable ready', async () => {
  // A missing pre-start context/inventory check, durable intent, exact owner-bound
  // effect, actual observer/HTTP composition or ready publication breaks this slice.
  current.readinessTransport = true;
  const effects: string[] = [];
  let healthRequests = 0;
  let capabilityRequests = 0;
  const backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 3100,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/health') {
        healthRequests++;
        effects.push('health');
        return Response.json({ status: 'ok', commit: null, bootCommit: null });
      }
      if (path === '/api/runtime/dependency-capability') {
        capabilityRequests++;
        effects.push('capability');
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
        expect(context.completion.activated).toEqual(['prod']);
        const before = inspectStore(fixture.prodPath);
        expect(before.activation).toEqual({ state: 'ENABLED' });
        const devBefore = inspectStore(fixture.devPath);
        expect(devBefore.activation).toEqual({ state: 'DISABLED' });
        const participants = await captureEdgeRecord(
          fixture.root,
          context.storage.participantRecord.name,
          65536,
        );
        expect(hash(participants.contents)).toBe(context.storage.participantRecord.sha256);
        const participantEnvelope: unknown = JSON.parse(participants.contents);
        expect(readFields(participantEnvelope)['owner']).toBe(context.pending.contents);
        expect(readFields(participantEnvelope)['record']).toEqual(context.participants);
        const commits = await Promise.all(
          context.storage.commitRecords.map(async (entry) => {
            const snapshot = await captureEdgeRecord(fixture.root, entry.reference.name, 65536);
            expect(hash(snapshot.contents)).toBe(entry.reference.sha256);
            const envelope: unknown = JSON.parse(snapshot.contents);
            expect(readFields(envelope)['owner']).toBe(context.pending.contents);
            expect(readFields(readFields(envelope)['record'])['environment']).toBe(
              entry.environment,
            );
            return { name: entry.reference.name, snapshot };
          }),
        );
        const solver = await captureEdgeRecord(
          fixture.root,
          basename(context.solverIntent.path),
          65536,
        );
        expect(solver.path).toBe(context.solverIntent.path);
        expect(solver.contents).toBe(context.solverIntent.contents);
        const expectedRestoration: ActivationRecordByLabel['participant-restore-intent'] = {
          format: 'dependency-participant-restore-intent',
          version: 1,
          participants: structuredClone(context.storage.participantRecord),
          committed: context.storage.commitRecords.map((entry) => ({
            environment: entry.environment,
            record: structuredClone(entry.reference),
          })),
          solverIntent: {
            name: basename(context.solverIntent.path),
            sha256: hash(context.solverIntent.contents),
          },
          selected: (['backend', 'gateway', 'source'] as const).map((role) => ({
            role,
            id: context.originals[role].id,
            originalPolicy: structuredClone(context.originals[role].policy),
            // Existing JSON.stringify(snapshot) convention hashes the original
            // decoded ParticipantSnapshot, including its complete native member.
            snapshotSha256: hash(JSON.stringify(context.originals[role])),
          })),
        };
        expect(fixture.backend.State.Running).toBe(false);
        expect(fixture.gateway.State.Running).toBe(false);
        expect(fixture.source.State.Running).toBe(false);
        let contextInspections = 0;
        let inventoryReads = 0;
        let starts = 0;
        const assertContext = preparations.assertParticipantRestorationContext;
        const retain = ownership.retainActivationRecord;
        const docker = fixture.ports.docker;
        const inspected = spyOn(
          preparations,
          'assertParticipantRestorationContext',
        ).mockImplementation(async (subject) => {
          await assertContext(subject);
          if (subject === context) contextInspections++;
        });
        const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
          async (...args) => {
            const snapshot = await retain(...args);
            const label = args[2];
            if (
              label === 'participant-restore-intent' ||
              label === 'participant-start-intent' ||
              label === 'participant-ready'
            )
              effects.push(label);
            return snapshot;
          },
        );
        Object.assign(fixture.ports, {
          docker: async (args: Parameters<typeof docker>[0], signal?: AbortSignal) => {
            if (args[0] === 'ps' && starts === 0) inventoryReads++;
            if (args[0] !== 'start') return docker(args, signal);
            expect(args).toEqual(['start', context.originals.backend.id]);
            expect(signal?.aborted).toBe(false);
            expect(starts).toBe(0);
            expect(contextInspections).toBeGreaterThan(0);
            expect(inventoryReads).toBeGreaterThan(0);
            const restoration = await activationRecord(fixture.root, 'participant-restore-intent');
            const intent = await activationRecord(fixture.root, 'participant-start-intent');
            expect(restoration.record).toEqual(expectedRestoration);
            expect(
              await captureEdgeRecord(fixture.root, context.storage.participantRecord.name, 65536),
            ).toEqual(participants);
            for (const commit of commits)
              expect(await captureEdgeRecord(fixture.root, commit.name, 65536)).toEqual(
                commit.snapshot,
              );
            expect(
              await captureEdgeRecord(fixture.root, basename(context.solverIntent.path), 65536),
            ).toEqual(solver);
            expect(intent.record).toEqual({
              format: 'dependency-participant-start-intent',
              version: 1,
              restoration: restoration.reference,
              role: 'backend',
              id: fixture.backend.Id,
            });
            const intents = await Promise.all(
              (await readdir(fixture.root))
                .filter((name) => /^edge-owner-[0-9]{6,12}-intent\.json$/.test(name))
                .map((name) => captureOwnerOperationIntent(fixture.root, name)),
            );
            expect(
              intents.some((snapshot) => {
                const envelope: unknown = JSON.parse(snapshot.contents);
                return JSON.stringify(readFields(envelope)['args']) === JSON.stringify(args);
              }),
            ).toBe(true);
            expect(
              (await readdir(fixture.root)).some((name) =>
                name.endsWith('-activation-participant-ready.json'),
              ),
            ).toBe(false);
            expect(inspectStore(fixture.prodPath).activation).toEqual({ state: 'ENABLED' });
            starts++;
            effects.push('owner-bound-start');
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
        try {
          const restored = await restoreBackendParticipantUnderOwner(context);
          expect(restored.state).toBe('backend-ready-participants-fenced');
          expect(restored.exposure).toBe('closed');
          expect(restored.controllers).toBe('fenced');
          expect(restored.readiness.role).toBe('backend');
          expect(restored.readiness.observation.process.pid).toBe(40002);
          expect(restored.readiness.healthSha256).toBe(
            hash(JSON.stringify({ status: 'ok', commit: null, bootCommit: null })),
          );
          expect(healthRequests).toBe(1);
          expect(capabilityRequests).toBe(1);
          expect(starts).toBe(1);
          expect(effects).toEqual([
            'participant-restore-intent',
            'participant-start-intent',
            'owner-bound-start',
            'health',
            'capability',
            'participant-ready',
          ]);
          const restoration = await activationRecord(fixture.root, 'participant-restore-intent');
          const ready = await activationRecord(fixture.root, 'participant-ready');
          expect(ready.record).toEqual({
            format: 'dependency-participant-ready',
            version: 1,
            restoration: restoration.reference,
            role: 'backend',
            id: fixture.backend.Id,
            readinessSha256: restored.readiness.sha256,
          });
          expect(restored.ready).toEqual(ready.snapshot);
          expect(current.execs).toBeGreaterThanOrEqual(6);
          expect(audits.length).toBeGreaterThanOrEqual(6);
          for (const audit of audits) {
            assertLocalTransportSettled(audit);
            await assertAuditContent(audit);
          }
          expect(
            (await readdir(fixture.root)).some(
              (name) =>
                name.endsWith('-activation-participants-restored.json') ||
                name.endsWith('-activation-participant-policy-intent.json'),
            ),
          ).toBe(false);
        } finally {
          Object.assign(fixture.ports, { docker });
          publication.mockRestore();
          inspected.mockRestore();
          expect(inspectStore(fixture.prodPath)).toEqual(before);
          expect(inspectStore(fixture.devPath)).toEqual(devBefore);
          expect(fixture.gateway.State.Running).toBe(false);
          expect(fixture.source.State.Running).toBe(false);
          await context.source.inspectCold();
          await inspectDependencyIngress(
            context.owner,
            [context.layouts.prod, context.layouts.dev],
            context.ports.docker,
            context.deadline,
          );
          await preparations.assertParticipantRestorationContext(context);
          expect(fixture.commands.filter((args) => args[0] === 'start')).toEqual(
            starts === 0 ? [] : [['start', fixture.backend.Id]],
          );
          expect(fixture.commands.some((args) => ['restart', 'rm'].includes(args[0]))).toBe(false);
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
