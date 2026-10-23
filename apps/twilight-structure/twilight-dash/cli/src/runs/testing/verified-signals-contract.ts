import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { artifactDigest, ownerId, runId } from '../record-codecs';
import { receiveDecision, reconcileReceipt } from '../record-signals';
import { type OutcomeFixture, unwrapReply } from './fixtures';
import { prepareReceipt } from './receipts-contract';
import { prepareWait } from './signals-contract';

export function verifiedSignalsContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    for (const operation of ['decision', 'receipt'] as const) {
      test(`verified ${operation} rejects absent evidence before any mutation`, async () => {
        const stores = await create();
        try {
          const setup =
            operation === 'decision' ? await prepareWait(stores) : await prepareReceipt(stores);
          const missing = { ...setup.quiescence.evidence, digest: artifactDigest('a'.repeat(64)) };
          const before = await stores.runs.readRun(setup.run.runId);
          if ('decision' in setup) {
            const decision = { ...setup.decision, authorizationEvidence: missing };
            await rejects(
              receiveDecision(stores.runs, stores.artifacts, setup.ownership, decision),
              /artifact does not exist/,
            );
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
            expect((await stores.runs.receiveDecision(setup.ownership, decision)).kind).toBe(
              'applied',
            );
          } else {
            const receipt = { ...setup.receipt, evidence: missing };
            const guard = await setup.currentGuard();
            await rejects(
              reconcileReceipt(stores.runs, stores.artifacts, guard, receipt),
              /artifact does not exist/,
            );
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
            expect((await stores.runs.reconcileReceipt(guard, receipt)).kind).toBe('applied');
          }
        } finally {
          stores.close();
        }
      });
      test(`verified ${operation} snapshots authority target and payload before awaiting artifact reads`, async () => {
        const stores = await create();
        try {
          const setup =
            operation === 'decision' ? await prepareWait(stores) : await prepareReceipt(stores);
          const entered = Promise.withResolvers<undefined>();
          const proceed = Promise.withResolvers<undefined>();
          const artifacts: ArtifactStore = {
            retainArtifact: (content, mediaType) =>
              stores.artifacts.retainArtifact(content, mediaType),
            async readArtifact(reference) {
              entered.resolve(undefined);
              await proceed.promise;
              return await stores.artifacts.readArtifact(reference);
            },
          };
          if ('decision' in setup) {
            const ownership = { ...setup.ownership };
            const decision = { ...setup.decision };
            const pending = receiveDecision(stores.runs, artifacts, ownership, decision);
            await entered.promise;
            ownership.ownerId = ownerId('mutated');
            ownership.epoch = 999;
            decision.choice = 'no';
            decision.authorizationEvidence = {
              ...decision.authorizationEvidence,
              digest: artifactDigest('b'.repeat(64)),
            };
            proceed.resolve(undefined);
            const reply = await pending;
            expect(reply).toMatchObject({ kind: 'applied' });
            expect(unwrapReply(reply)).toEqual(setup.decision);
            expect((await stores.runs.readRun(setup.run.runId)).decisions).toEqual([
              setup.decision,
            ]);
          } else {
            const guard = { ...(await setup.currentGuard()), ownership: { ...setup.ownership } };
            const receipt = { ...setup.receipt, claim: { ...setup.receipt.claim } };
            const pending = reconcileReceipt(stores.runs, artifacts, guard, receipt);
            await entered.promise;
            guard.runId = runId('mutated');
            guard.ownership.ownerId = ownerId('mutated');
            guard.expectedRevision = 999;
            receipt.acceptedWbsRevision = 'mutated';
            receipt.claim.runId = runId('mutated');
            receipt.evidence = { ...receipt.evidence, digest: artifactDigest('b'.repeat(64)) };
            proceed.resolve(undefined);
            const reply = await pending;
            expect(reply).toMatchObject({ kind: 'applied' });
            expect(unwrapReply(reply).state).toMatchObject({
              kind: 'terminal',
              receipt: setup.receipt,
            });
            expect((await stores.runs.readRun(setup.run.runId)).receipts).toEqual([setup.receipt]);
          }
        } finally {
          stores.close();
        }
      });
    }
  });
}
