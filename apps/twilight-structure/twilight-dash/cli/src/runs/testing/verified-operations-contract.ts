import { doesNotReject, rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { artifactDigest, decodeExecutionFact } from '../record-codecs';
import { recordExecution } from '../record-execution';
import { recordOutcome } from '../record-outcome';
import type { ExecutionFact } from '../records';
import { retainManifest } from '../retain-manifest';
import { createExecutionCommand } from './fixtures';
import {
  createCompletion,
  createManifest,
  type OutcomeFixture,
  prepareAttempt,
  prepareTurn,
} from './fixtures';

export function verifiedOperationsContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    for (const field of ['prompts', 'toolPolicies'] as const)
      test(`verified manifest rejects missing or mismatched ${field} before retention`, async () => {
        const stores = await create();
        try {
          const setup = await prepareAttempt(stores);
          for (const reference of [
            { ...setup.quiescence.evidence, digest: artifactDigest('0'.repeat(64)) },
            { ...setup.quiescence.evidence, byteLength: 999 },
          ]) {
            const manifest = createManifest({ [field]: [reference] });
            await rejects(retainManifest(stores.runs, stores.artifacts, setup.ownership, manifest));
            await rejects(stores.runs.readManifest(manifest.digest), /manifest does not exist/);
          }
        } finally {
          await stores.close();
        }
      });
    for (const kind of ['interrupted', 'waiting', 'unresolved'] as const)
      test(`verified ${kind} rejects missing evidence before changing revision or capacity`, async () => {
        const stores = await create();
        try {
          const setup = await prepareTurn(stores);
          const missing = { ...setup.quiescence.evidence, digest: artifactDigest('0'.repeat(64)) };
          const quiescence = { ...setup.quiescence, evidence: missing };
          const fact: ExecutionFact =
            kind === 'interrupted'
              ? { kind, quiescence }
              : kind === 'unresolved'
                ? { kind, reason: 'ambiguous', evidence: missing }
                : decodeExecutionFact({
                    kind,
                    wait: {
                      version: 1,
                      correlationKey: 'question',
                      prompt: setup.quiescence.evidence,
                      choices: ['yes'],
                    },
                    quiescence,
                  });
          const before = await stores.runs.readRun(setup.run.runId);
          await rejects(
            recordExecution(
              stores.runs,
              stores.artifacts,
              await setup.currentGuard(),
              createExecutionCommand(fact),
            ),
            /artifact does not exist/,
          );
          expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
          if (kind === 'waiting') {
            const promptFact = decodeExecutionFact({
              ...fact,
              quiescence: setup.quiescence,
              wait: { version: 1, correlationKey: 'question', prompt: missing, choices: ['yes'] },
            });
            await rejects(
              recordExecution(
                stores.runs,
                stores.artifacts,
                await setup.currentGuard(),
                createExecutionCommand(promptFact),
              ),
              /artifact does not exist/,
            );
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
          }
        } finally {
          await stores.close();
        }
      });
    for (const field of ['output', 'quiescence'] as const)
      test(`verified completion rejects missing or inconsistent ${field} before outcome and outbox`, async () => {
        const stores = await create();
        try {
          const setup = await prepareTurn(stores);
          const before = await stores.runs.readRun(setup.run.runId);
          for (const reference of [
            { ...setup.quiescence.evidence, digest: artifactDigest('0'.repeat(64)) },
            { ...setup.quiescence.evidence, byteLength: 999 },
          ]) {
            const complete = createCompletion(setup.claim, setup.quiescence);
            const completion =
              field === 'output'
                ? createCompletion(setup.claim, setup.quiescence, {
                    outcome: { ...complete.outcome, artifacts: [reference] },
                    intent: {
                      ...complete.intent,
                      outcome: { ...complete.outcome, artifacts: [reference] },
                    },
                  })
                : { ...complete, quiescence: { ...complete.quiescence, evidence: reference } };
            await rejects(
              recordOutcome(stores.runs, stores.artifacts, await setup.currentGuard(), completion),
            );
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
          }
        } finally {
          await stores.close();
        }
      });
    for (const operation of ['manifest', 'execution', 'outcome'] as const)
      test(`verified ${operation} commits the snapshot verified before asynchronous reads`, async () => {
        const stores = await create();
        try {
          const setup = await prepareTurn(stores);
          const started = Promise.withResolvers<undefined>();
          const release = Promise.withResolvers<undefined>();
          const artifacts: ArtifactStore = {
            retainArtifact: stores.artifacts.retainArtifact.bind(stores.artifacts),
            async readArtifact(reference) {
              started.resolve(undefined);
              await release.promise;
              return await stores.artifacts.readArtifact(reference);
            },
          };
          const guard = structuredClone(await setup.currentGuard());
          const manifest = structuredClone(
            createManifest({
              prompts: [setup.quiescence.evidence],
              toolPolicies: [setup.quiescence.evidence],
            }),
          );
          const completion = structuredClone(createCompletion(setup.claim, setup.quiescence));
          const fact = decodeExecutionFact({
            kind: 'waiting',
            wait: {
              version: 1,
              correlationKey: 'question',
              prompt: setup.quiescence.evidence,
              choices: ['yes'],
            },
            quiescence: setup.quiescence,
          });
          const command = createExecutionCommand(fact);
          const pending =
            operation === 'manifest'
              ? retainManifest(stores.runs, artifacts, setup.ownership, manifest)
              : operation === 'execution'
                ? recordExecution(stores.runs, artifacts, guard, command)
                : recordOutcome(stores.runs, artifacts, guard, completion);
          await started.promise;
          const original = structuredClone({ manifest, completion, fact, command, guard });
          // The caller owns mutable objects even though the persistence interfaces expose readonly records.
          (manifest as unknown as { prompts: { byteLength: number }[] }).prompts[0].byteLength =
            999;
          (
            completion as unknown as { outcome: { artifacts: { byteLength: number }[] } }
          ).outcome.artifacts[0].byteLength = 999;
          if (fact.kind !== 'waiting') throw new Error('expected waiting fact');
          fact.wait.prompt.byteLength = 999;
          (command as { commandId: string }).commandId = 'mutated-command';
          (setup.ownership as { ownerId: string }).ownerId = 'mutated-owner';
          (guard as { expectedRevision: number }).expectedRevision = 999;
          release.resolve(undefined);
          await doesNotReject(pending);
          expect((await pending).kind).toBe('applied');
          if (operation === 'manifest')
            expect(await stores.runs.readManifest(original.manifest.digest)).toEqual(
              original.manifest,
            );
          else {
            const snapshot = await stores.runs.readRun(setup.run.runId);
            if (operation === 'execution') {
              if (original.fact.kind !== 'waiting') throw new Error('expected original wait');
              expect(
                await stores.runs.recordExecution(original.guard, original.command),
              ).toMatchObject({ kind: 'duplicate' });
              expect(snapshot.attempts[0]?.state).toEqual({
                kind: 'waiting_for_person',
                checkpoint: setup.checkpoint,
                wait: original.fact.wait,
                quiescence: original.fact.quiescence,
              });
            } else expect(snapshot.pendingIntents).toEqual([original.completion.intent]);
          }
        } finally {
          await stores.close();
        }
      });
    test('facts without artifacts do not require artifact reads', async () => {
      const stores = await create();
      try {
        const setup = await prepareTurn(stores);
        const artifacts: ArtifactStore = {
          retainArtifact: stores.artifacts.retainArtifact.bind(stores.artifacts),
          async readArtifact() {
            return await Promise.reject(new Error('unexpected artifact read'));
          },
        };
        expect(
          (
            await recordExecution(
              stores.runs,
              artifacts,
              await setup.currentGuard(),
              createExecutionCommand(
                { kind: 'recovery_required', reason: 'lost reply' },
                'recovery-command',
              ),
            )
          ).kind,
        ).toBe('applied');
      } finally {
        await stores.close();
      }
    });
  });
}
