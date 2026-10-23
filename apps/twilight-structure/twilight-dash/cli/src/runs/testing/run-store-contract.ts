import { doesNotReject, rejects } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  attemptId,
  decodeAdmission,
  digestManifest,
  manifestDigest,
  occurrenceId,
  operationKey,
  organizationId,
  ownerId,
  runId,
} from '../record-codecs';
import type { OwnershipStatus } from '../records';
import type { RunStore } from '../run-store';
import type { FixtureClock } from './fixtures';
import { createManifest, createRun, unwrapReply } from './fixtures';

export interface StoreFixture {
  readonly runs: RunStore;
  readonly ownership: OwnershipStatus;
  readonly clock: FixtureClock;
  close(): void;
}
/** Registers provider-independent admission, fencing and isolation observations. */
export function runStoreContract(name: string, create: () => Promise<StoreFixture>): void {
  describe(name, () => {
    const opened: StoreFixture[] = [];
    afterEach(() => {
      for (const fixture of opened.splice(0)) fixture.close();
    });
    async function createFixture() {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(
        await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
      );
      unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
      const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
      const admission = decodeAdmission({
        attemptId: 'attempt',
        identity: {
          version: 1,
          runId: run.runId,
          occurrenceId: 'occurrence',
          operationKey: 'operation',
        },
        ordinal: 1,
      });
      return { ...stores, ownership, run, admission };
    }
    test('capacity one admits exactly one concurrent run without changing the loser', async () => {
      const fixture = await createFixture();
      const second = createRun({ ...fixture.run, runId: runId('second') });
      unwrapReply(await fixture.runs.createRun(fixture.ownership, second));
      const replies = await Promise.all(
        [fixture.run, second].map((run, index) =>
          fixture.runs.admitAttempt(
            { ownership: fixture.ownership, runId: run.runId, expectedRevision: run.revision },
            {
              ...fixture.admission,
              attemptId: attemptId(`attempt-${String(index)}`),
              identity: { ...fixture.admission.identity, runId: run.runId },
            },
          ),
        ),
      );
      expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'refused']);
      expect(replies.find((reply) => reply.kind === 'refused')).toEqual({
        kind: 'refused',
        reason: 'capacity_full',
      });
      const snapshots = await Promise.all(
        [fixture.run, second].map((run) => fixture.runs.readRun(run.runId)),
      );
      expect(snapshots.map((snapshot) => snapshot.capacity.reserved)).toEqual([1, 1]);
      expect(snapshots.flatMap((snapshot) => snapshot.attempts)).toHaveLength(1);
      expect(snapshots.find((snapshot) => snapshot.attempts.length === 0)?.run.revision).toBe(0);
    });

    test('takeover fences writes without freeing surviving work', async () => {
      const fixture = await createFixture();
      const guard = {
        ownership: fixture.ownership,
        runId: fixture.run.runId,
        expectedRevision: fixture.run.revision,
      };
      unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
      const before = await fixture.runs.readRun(fixture.run.runId);
      expect(
        await fixture.runs.acquireOwnership(ownerId('replacement'), fixture.ownership.epoch),
      ).toEqual({ kind: 'refused', reason: 'owner_busy' });
      fixture.clock.advance(101);
      const next = unwrapReply(
        await fixture.runs.acquireOwnership(ownerId('owner'), fixture.ownership.epoch),
      );
      expect(next.epoch).toBe(2);
      expect(await fixture.runs.admitAttempt(guard, fixture.admission)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
      expect(before.capacity.reserved).toBe(1);
      expect(await fixture.runs.retainManifest(fixture.ownership, createManifest())).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await fixture.runs.createRun(fixture.ownership, fixture.run)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });

    test('expired ownership refuses all writes even without takeover and ignores forged expiry', async () => {
      const fixture = await createFixture();
      fixture.clock.advance(100);
      const ownership = { ...fixture.ownership, expiresAt: 999999 };
      expect(await fixture.runs.renewOwnership(ownership)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await fixture.runs.retainManifest(ownership, createManifest())).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await fixture.runs.createRun(ownership, fixture.run)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(
        await fixture.runs.admitAttempt(
          { ownership, runId: fixture.run.runId, expectedRevision: 0 },
          fixture.admission,
        ),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
    });

    test('stale authority refuses before reading an absent target run', async () => {
      const fixture = await createFixture();
      fixture.clock.advance(100);
      expect(fixture.ownership.epoch).toBe(1);
      await doesNotReject(async () => {
        expect(
          await fixture.runs.admitAttempt(
            { ownership: fixture.ownership, runId: runId('absent'), expectedRevision: 0 },
            fixture.admission,
          ),
        ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      });
    });

    test('renewal uses configured duration and rejects store organization owner and epoch mismatches', async () => {
      const fixture = await createFixture();
      fixture.clock.advance(50);
      const renewed = unwrapReply(
        await fixture.runs.renewOwnership({ ...fixture.ownership, expiresAt: 1 }),
      );
      expect(renewed.expiresAt).toBe(1150);
      const other = await createFixture();
      for (const requested of [
        other.ownership,
        { ...renewed, organizationId: organizationId('elsewhere') },
        { ...renewed, ownerId: ownerId('elsewhere') },
        { ...renewed, epoch: 2 },
      ]) {
        expect(await fixture.runs.renewOwnership(requested)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
      }
      expect(await fixture.runs.acquireOwnership(ownerId('next'), 0)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
    });

    test('clock regression and invalid clock observations throw without changing work', async () => {
      for (const delta of [-1, -1001, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
        const fixture = await createFixture();
        const before = await fixture.runs.readRun(fixture.run.runId);
        fixture.clock.advance(delta);
        await rejects(fixture.runs.renewOwnership(fixture.ownership));
        expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
      }
    });

    test('refused ownership acquisition persists the greatest clock observation', async () => {
      const fixture = await createFixture();
      fixture.clock.advance(50);
      expect(await fixture.runs.acquireOwnership(ownerId('next'), 1)).toEqual({
        kind: 'refused',
        reason: 'owner_busy',
      });
      fixture.clock.advance(-1);
      await rejects(fixture.runs.renewOwnership(fixture.ownership), /clock regressed/);
    });

    test('exact run and admission identities are idempotent after revision advances', async () => {
      const fixture = await createFixture();
      const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
      const attempt = unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
      expect(attempt).toMatchObject({
        ordinal: 1,
        revision: 0,
        admittedEpoch: 1,
        holdsCapacity: true,
        state: { kind: 'queued' },
      });
      expect(await fixture.runs.admitAttempt(guard, fixture.admission)).toEqual({
        kind: 'duplicate',
        value: attempt,
      });
      expect(await fixture.runs.createRun(fixture.ownership, fixture.run)).toMatchObject({
        kind: 'duplicate',
        value: { revision: 1 },
      });
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
      expect(
        await fixture.runs.createRun(fixture.ownership, { ...fixture.run, maxAttempts: 4 }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await fixture.runs.createRun(fixture.ownership, { ...fixture.run, revision: 1 }),
      ).toEqual({
        kind: 'refused',
        reason: 'revision_conflict',
      });
      for (const admission of [
        { ...fixture.admission, ordinal: 2 },
        {
          ...fixture.admission,
          identity: { ...fixture.admission.identity, operationKey: operationKey('changed') },
        },
      ]) {
        expect(await fixture.runs.admitAttempt(guard, admission)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
      }
    });

    test('stale run revision cannot reserve another slot', async () => {
      const fixture = await createFixture();
      const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
      unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
      const before = await fixture.runs.readRun(fixture.run.runId);
      expect(
        await fixture.runs.admitAttempt(guard, {
          ...fixture.admission,
          attemptId: attemptId('second'),
          identity: { ...fixture.admission.identity, occurrenceId: occurrenceId('second') },
        }),
      ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
    });

    test('admission enforces run identity, stored budget, contiguous ordinals and active occurrence', async () => {
      const fixture = await createFixture();
      const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
      expect(
        await fixture.runs.admitAttempt(guard, {
          ...fixture.admission,
          identity: { ...fixture.admission.identity, runId: runId('other') },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(await fixture.runs.admitAttempt(guard, { ...fixture.admission, ordinal: 4 })).toEqual({
        kind: 'refused',
        reason: 'retry_exhausted',
      });
      expect(await fixture.runs.admitAttempt(guard, { ...fixture.admission, ordinal: 2 })).toEqual({
        kind: 'refused',
        reason: 'identity_conflict',
      });
      unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
      const retry = { ...fixture.admission, attemptId: attemptId('retry'), ordinal: 2 };
      const current = { ...guard, expectedRevision: 1 };
      expect(await fixture.runs.admitAttempt(current, retry)).toEqual({
        kind: 'refused',
        reason: 'attempt_active',
      });
      expect(
        await fixture.runs.admitAttempt(current, {
          ...retry,
          identity: { ...retry.identity, operationKey: operationKey('changed') },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      const second = createRun({ ...fixture.run, runId: runId('second') });
      unwrapReply(await fixture.runs.createRun(fixture.ownership, second));
      expect(
        await fixture.runs.admitAttempt(
          { ...guard, runId: second.runId },
          {
            ...fixture.admission,
            identity: { ...fixture.admission.identity, runId: second.runId },
          },
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
    });

    test('manifest hash and canonical binding integrity refuse before persistence', async () => {
      const fixture = await createFixture();
      const manifest = createManifest();
      expect(await fixture.runs.retainManifest(fixture.ownership, manifest)).toEqual({
        kind: 'duplicate',
        value: manifest,
      });
      for (const changed of [
        { ...manifest, credentialReferences: ['changed'] },
        { ...manifest, digest: manifestDigest('f'.repeat(64)) },
        { ...manifest, canonicalBinding: '{ "binding": "fixture" }' },
      ]) {
        await rejects(fixture.runs.retainManifest(fixture.ownership, changed));
      }
      const noncanonical = { ...manifest, canonicalBinding: '{ "binding": "fixture" }' };
      await rejects(
        fixture.runs.retainManifest(fixture.ownership, {
          ...noncanonical,
          digest: digestManifest(noncanonical),
        }),
        /not canonical JSON/,
      );
      expect(await fixture.runs.readManifest(manifest.digest)).toEqual(manifest);
    });

    test('run creation requires a retained manifest before any reservation', async () => {
      const fixture = await createFixture();
      await rejects(
        fixture.runs.createRun(
          fixture.ownership,
          createRun({
            ...fixture.run,
            runId: runId('absent'),
            manifestDigest: manifestDigest('a'.repeat(64)),
          }),
        ),
        /manifest does not exist/,
      );
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
    });

    for (const request of [
      'renewal',
      'manifest owner',
      'manifest payload',
      'run owner',
      'run payload',
      'admission guard',
      'admission payload',
    ] as const) {
      test(`submitted ${request} snapshots before the first await`, async () => {
        const fixture = await createFixture();
        const ownership = { ...fixture.ownership };
        const manifest = createManifest({ credentialReferences: ['submitted'] });
        const run = createRun({ runId: runId('submitted') });
        const admission = structuredClone(fixture.admission);
        const guard = { ownership, runId: fixture.run.runId, expectedRevision: 0 };
        if (request === 'renewal') {
          fixture.clock.advance(10);
          const pending = fixture.runs.renewOwnership(ownership);
          ownership.ownerId = ownerId('mutated');
          const reply = await pending;
          expect(reply.kind).toBe('applied');
          expect(unwrapReply(reply)).toMatchObject({ ownerId: 'owner', expiresAt: 1110 });
        } else if (request.startsWith('manifest')) {
          const pending = fixture.runs.retainManifest(ownership, manifest);
          if (request === 'manifest owner') ownership.ownerId = ownerId('mutated');
          else Object.assign(manifest, createManifest({ credentialReferences: ['mutated'] }));
          const reply = await pending;
          expect(reply.kind).toBe('applied');
          const retained = unwrapReply(reply);
          expect(retained.credentialReferences).toEqual(['submitted']);
          expect((await fixture.runs.readManifest(retained.digest)).credentialReferences).toEqual([
            'submitted',
          ]);
        } else if (request.startsWith('run')) {
          const pending = fixture.runs.createRun(ownership, run);
          if (request === 'run owner') ownership.ownerId = ownerId('mutated');
          else Object.assign(run, { runId: 'mutated', maxAttempts: 9 });
          const reply = await pending;
          expect(reply.kind).toBe('applied');
          expect(unwrapReply(reply)).toMatchObject({ runId: 'submitted', maxAttempts: 3 });
          expect((await fixture.runs.readRun(runId('submitted'))).run.maxAttempts).toBe(3);
        } else {
          const pending = fixture.runs.admitAttempt(guard, admission);
          if (request === 'admission guard') {
            ownership.ownerId = ownerId('mutated');
            guard.runId = runId('mutated');
            guard.expectedRevision = 9;
          } else {
            Object.assign(admission.identity, { occurrenceId: 'mutated', operationKey: 'mutated' });
            Object.assign(admission, { attemptId: 'mutated' });
          }
          const reply = await pending;
          expect(reply.kind).toBe('applied');
          expect(unwrapReply(reply)).toMatchObject({
            attemptId: 'attempt',
            identity: { occurrenceId: 'occurrence', operationKey: 'operation' },
          });
          expect((await fixture.runs.readRun(fixture.run.runId)).attempts).toHaveLength(1);
        }
      });
    }

    for (const request of ['renewal', 'manifest', 'run', 'admission'] as const) {
      test(`submitted stale ${request} cannot gain authority while awaiting`, async () => {
        const fixture = await createFixture();
        const before = await fixture.runs.readRun(fixture.run.runId);
        const ownership = { ...fixture.ownership, ownerId: ownerId('stale') };
        const manifest = createManifest({ credentialReferences: ['unpublished'] });
        const run = createRun({ runId: runId('unpublished') });
        const pending =
          request === 'renewal'
            ? fixture.runs.renewOwnership(ownership)
            : request === 'manifest'
              ? fixture.runs.retainManifest(ownership, manifest)
              : request === 'run'
                ? fixture.runs.createRun(ownership, run)
                : fixture.runs.admitAttempt(
                    { ownership, runId: fixture.run.runId, expectedRevision: 0 },
                    fixture.admission,
                  );
        ownership.ownerId = fixture.ownership.ownerId;
        expect(await pending).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
        if (request === 'manifest')
          await rejects(fixture.runs.readManifest(manifest.digest), /manifest does not exist/);
        if (request === 'run') await rejects(fixture.runs.readRun(run.runId), /run does not exist/);
      });
    }

    test('caller mutation cannot change retained manifests, runs, attempts or returned snapshots', async () => {
      const fixture = await createFixture();
      const manifest = createManifest({ credentialReferences: ['credential-ref'] });
      const retained = unwrapReply(await fixture.runs.retainManifest(fixture.ownership, manifest));
      (manifest.credentialReferences as string[]).push('mutated');
      (retained.credentialReferences as string[]).push('returned');
      expect((await fixture.runs.readManifest(retained.digest)).credentialReferences).toEqual([
        'credential-ref',
      ]);
      const run = createRun({ ...fixture.run, runId: runId('mutable') });
      unwrapReply(await fixture.runs.createRun(fixture.ownership, run));
      Object.assign(run, { maxAttempts: 99 });
      expect((await fixture.runs.readRun(run.runId)).run.maxAttempts).toBe(3);
      const guard = {
        ownership: fixture.ownership,
        runId: fixture.run.runId,
        expectedRevision: fixture.run.revision,
      };
      const admitted = unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
      Object.assign(fixture.admission.identity, { operationKey: 'mutated' });
      Object.assign(admitted.state, { claim: { broken: true } });
      const snapshot = await fixture.runs.readRun(fixture.run.runId);
      expect(String(snapshot.attempts[0]?.identity.operationKey)).toBe('operation');
      expect(snapshot.attempts[0]?.state).toEqual({ kind: 'queued' });
      Object.assign(snapshot.capacity, { reserved: 99 });
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
    });

    test('unowned stores fence writes and closed stores reject all operations', async () => {
      const stores = await create();
      opened.push(stores);
      const fixture = await createFixture();
      expect(stores.ownership).toMatchObject({ epoch: 0, owner: null });
      expect(await stores.runs.renewOwnership(fixture.ownership)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await stores.runs.retainManifest(fixture.ownership, createManifest())).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(await stores.runs.createRun(fixture.ownership, fixture.run)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(
        await stores.runs.admitAttempt(
          { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
          fixture.admission,
        ),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      stores.close();
      stores.close();
      const operations = [
        () => stores.runs.acquireOwnership(ownerId('owner'), 0),
        () => stores.runs.renewOwnership(fixture.ownership),
        () => stores.runs.retainManifest(fixture.ownership, createManifest()),
        () => stores.runs.readManifest(fixture.run.manifestDigest),
        () => stores.runs.createRun(fixture.ownership, fixture.run),
        () => stores.runs.readRun(fixture.run.runId),
        () =>
          stores.runs.admitAttempt(
            { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
            fixture.admission,
          ),
      ];
      for (const operation of operations) await rejects(operation(), /closed/);
    });
    test('missing trusted run and manifest throw on inspection', async () => {
      const fixture = await createFixture();
      expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
      await rejects(fixture.runs.readRun(runId('absent')), /run does not exist/);
      await rejects(
        fixture.runs.readManifest(manifestDigest('f'.repeat(64))),
        /manifest does not exist/,
      );
    });
  });
}
