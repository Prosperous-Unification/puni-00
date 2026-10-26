import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { attemptId, decodeAdmission, organizationId, runId } from '../record-codecs';
import type { AttemptGuard } from '../run-store';
import {
  createCompletion,
  createExecutionCommand,
  createRun,
  FixtureClock,
  prepareTurn,
  unwrapReply,
} from '../testing/fixtures';
import { prepareReceipt } from '../testing/receipts-contract';
import { prepareWait } from '../testing/signals-contract';
import { bootstrapSqliteStores } from './open-stores';

async function createFixture(capacity = 3) {
  const directory = mkdtempSync(join(tmpdir(), 'run-capacity-integrity-'));
  const path = join(directory, 'runs.sqlite');
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path,
    organizationId: organizationId('organization'),
    capacity,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  });
  const database = new Database(path);
  return {
    ...stores,
    clock,
    database,
    close() {
      database.close();
      stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function readRows(database: Database) {
  return [
    'run_meta',
    'run_record',
    'run_attempt',
    'run_reservation',
    'run_execution',
    'run_completion',
    'run_outbox',
    'run_decision',
    'run_consumption',
    'run_receipt',
  ].map((table) => database.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

for (const route of [
  'read',
  'admission',
  'consumption',
  'execution',
  'outcome',
  'receipt',
] as const) {
  for (const fault of ['missing', 'orphan', 'settled'] as const) {
    test(`${route} rejects global ${fault} reservation without mutation and recovers after restoration`, async () => {
      const fixture = await createFixture();
      try {
        const setup =
          route === 'consumption'
            ? { ...(await prepareWait(fixture)), kind: 'wait' as const }
            : route === 'receipt'
              ? { ...(await prepareReceipt(fixture)), kind: 'receipt' as const }
              : { ...(await prepareTurn(fixture)), kind: 'attempt' as const };
        if (setup.kind === 'wait')
          unwrapReply(await fixture.runs.receiveDecision(setup.ownership, setup.decision));
        const guard = await setup.currentGuard();
        const other = createRun({
          runId: runId('other'),
          manifestDigest: setup.run.manifestDigest,
        });
        unwrapReply(await fixture.runs.createRun(setup.ownership, other));
        const admission = decodeAdmission({
          ...setup.admission,
          attemptId: 'other',
          identity: { ...setup.admission.identity, runId: other.runId },
        });
        unwrapReply(
          await fixture.runs.admitAttempt(
            { ownership: setup.ownership, runId: other.runId, expectedRevision: 0 },
            admission,
          ),
        );
        const otherGuard: AttemptGuard = {
          ownership: setup.ownership,
          runId: other.runId,
          expectedRevision: 1,
          attemptId: attemptId('other'),
          expectedAttemptRevision: 0,
        };
        if (fault === 'settled')
          unwrapReply(
            await fixture.runs.recordExecution(
              otherGuard,
              createExecutionCommand({ kind: 'interrupted', quiescence: setup.quiescence }),
            ),
          );
        const target = createRun({
          runId: runId('target'),
          manifestDigest: setup.run.manifestDigest,
        });
        unwrapReply(await fixture.runs.createRun(setup.ownership, target));
        const operation = (requested = guard) => {
          switch (route) {
            case 'read':
              return fixture.runs.readRun(setup.run.runId);
            case 'admission':
              return fixture.runs.admitAttempt(
                { ownership: requested.ownership, runId: target.runId, expectedRevision: 0 },
                decodeAdmission({
                  ...admission,
                  attemptId: 'target',
                  identity: { ...admission.identity, runId: target.runId },
                }),
              );
            case 'consumption':
              if (setup.kind !== 'wait') throw new Error('missing decision fixture');
              return fixture.runs.consumeDecision(requested, setup.decision.decisionId);
            case 'execution':
              return fixture.runs.recordExecution(
                requested,
                createExecutionCommand(
                  { kind: 'interrupted', quiescence: setup.quiescence },
                  'release',
                ),
              );
            case 'outcome':
              return fixture.runs.commitOutcome(
                requested,
                createCompletion(setup.claim, setup.quiescence),
              );
            case 'receipt':
              if (setup.kind !== 'receipt') throw new Error('missing receipt fixture');
              return fixture.runs.reconcileReceipt(requested, setup.receipt);
          }
        };
        if (fault === 'missing')
          fixture.database.run("DELETE FROM run_reservation WHERE attempt_id='other'");
        else
          fixture.database
            .query('INSERT INTO run_reservation(attempt_id) VALUES (?)')
            .run(fault === 'orphan' ? 'absent' : 'other');
        const damaged = readRows(fixture.database);
        if (route !== 'read')
          expect(
            await operation({ ...guard, ownership: { ...guard.ownership, epoch: 99 } }),
          ).toEqual({ kind: 'refused', reason: 'owner_stale' });
        await rejects(
          operation(),
          fault === 'orphan' ? /orphan reservation/ : /corrupt attempt reservation/,
        );
        expect(readRows(fixture.database)).toEqual(damaged);
        if (fault === 'missing')
          fixture.database.run("INSERT INTO run_reservation(attempt_id) VALUES ('other')");
        else
          fixture.database
            .query('DELETE FROM run_reservation WHERE attempt_id=?')
            .run(fault === 'orphan' ? 'absent' : 'other');
        const restored = await operation();
        if ('kind' in restored) expect(restored.kind).toBe('applied');
        else expect(restored.capacity.reserved).toBe(fault === 'settled' ? 1 : 2);
        const snapshot = await fixture.runs.readRun(setup.run.runId);
        expect(snapshot.capacity.reserved).toBeLessThanOrEqual(3);
        if (route === 'execution' || route === 'outcome' || route === 'receipt')
          expect(snapshot.attempts[0]?.holdsCapacity).toBe(false);
        if (route === 'consumption') {
          expect(snapshot.attempts[0]?.holdsCapacity).toBe(true);
          expect(snapshot.consumedDecisionIds.map(String)).toEqual(['decision']);
        }
      } finally {
        fixture.close();
      }
    });
  }
}

test('capacity one rejects cross-run admission after a live reservation disappears', async () => {
  const fixture = await createFixture(1);
  try {
    const setup = await prepareTurn(fixture);
    const target = createRun({ runId: runId('target'), manifestDigest: setup.run.manifestDigest });
    unwrapReply(await fixture.runs.createRun(setup.ownership, target));
    const guard = { ownership: setup.ownership, runId: target.runId, expectedRevision: 0 };
    const admission = decodeAdmission({
      ...setup.admission,
      attemptId: 'target',
      identity: { ...setup.admission.identity, runId: target.runId },
    });
    fixture.database.run('DELETE FROM run_reservation');
    const damaged = readRows(fixture.database);
    await rejects(fixture.runs.admitAttempt(guard, admission), /corrupt attempt reservation/);
    expect(readRows(fixture.database)).toEqual(damaged);
    fixture.database.run("INSERT INTO run_reservation(attempt_id) VALUES ('attempt')");
    expect(await fixture.runs.admitAttempt(guard, admission)).toEqual({
      kind: 'refused',
      reason: 'capacity_full',
    });
    expect((await fixture.runs.readRun(target.runId)).attempts).toEqual([]);
  } finally {
    fixture.close();
  }
});

for (const route of ['execution', 'outcome', 'receipt'] as const) {
  test(`${route} rejects its own damaged reservation instead of normalizing settled state`, async () => {
    const fixture = await createFixture();
    try {
      const setup =
        route === 'receipt'
          ? { ...(await prepareReceipt(fixture)), kind: 'receipt' as const }
          : { ...(await prepareTurn(fixture)), kind: 'attempt' as const };
      const guard = await setup.currentGuard();
      const operation = () => {
        if (route === 'execution')
          return fixture.runs.recordExecution(
            guard,
            createExecutionCommand(
              { kind: 'interrupted', quiescence: setup.quiescence },
              'release',
            ),
          );
        if (route === 'outcome')
          return fixture.runs.commitOutcome(guard, createCompletion(setup.claim, setup.quiescence));
        if (setup.kind !== 'receipt') throw new Error('missing receipt fixture');
        return fixture.runs.reconcileReceipt(guard, setup.receipt);
      };
      fixture.database.run(
        route === 'receipt'
          ? "INSERT INTO run_reservation(attempt_id) VALUES ('attempt')"
          : 'DELETE FROM run_reservation',
      );
      const damaged = readRows(fixture.database);
      await rejects(operation(), /corrupt attempt reservation/);
      expect(readRows(fixture.database)).toEqual(damaged);
      fixture.database.run(
        route === 'receipt'
          ? 'DELETE FROM run_reservation'
          : "INSERT INTO run_reservation(attempt_id) VALUES ('attempt')",
      );
      expect((await operation()).kind).toBe('applied');
      const snapshot = await fixture.runs.readRun(setup.run.runId);
      expect(snapshot.capacity.reserved).toBe(0);
      expect(snapshot.attempts[0]?.holdsCapacity).toBe(false);
    } finally {
      fixture.close();
    }
  });
}
