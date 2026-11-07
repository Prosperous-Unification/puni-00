import { rejects } from 'node:assert/strict';

import type { RuntimeState } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { readExecutionHistory } from './claim-history';
import { organizationId } from './record-codecs';
import { settleFixture } from './testing/construct-fixture';
import { FixtureClock, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { createWriteFixture } from './testing/write-fixture';
import { retainWriteReceipt } from './testing/write-store-contract';
import { artifactDigest } from './value-codecs';
import { executionCommandId } from './value-codecs';
import { stageWriteRequest } from './write-history';
import { acceptWriteReceipt } from './write-history';

for (const operation of ['stage', 'accept'] as const)
  for (const fault of ['input', 'guard'] as const)
    test(
      'verified write ' + operation + ' rejects malformed ' + fault + ' before trusted publication',
      async () => {
        const clock = new FixtureClock();
        const stores = createMemoryStores({
          organizationId: organizationId('organization'),
          capacity: 1,
          leaseMilliseconds: 100,
          clock,
        });
        try {
          const setup = await createWriteFixture({ ...stores, clock });
          let publications = 0;
          const runs = {
            ...stores.runs,
            async stageWrite(...parameters: Parameters<typeof stores.runs.stageWrite>) {
              publications++;
              return await stores.runs.stageWrite(...parameters);
            },
            async recordWriteAcceptance(
              ...parameters: Parameters<typeof stores.runs.recordWriteAcceptance>
            ) {
              publications++;
              return await stores.runs.recordWriteAcceptance(...parameters);
            },
          };
          let writing: Promise<unknown>;
          let publishValid: () => Promise<unknown>;
          if (operation === 'stage') {
            const input = {
              commandId: setup.command.commandId,
              completion: setup.completion,
              canonicalRequest: setup.canonicalRequest,
              stateEvidence: setup.stateEvidence,
            };
            writing = stageWriteRequest(
              runs,
              stores.artifacts,
              fault === 'guard' ? { ...setup.guard, expectedScopeRevision: -1 } : setup.guard,
              fault === 'input' ? Object.assign({ ...input }, { unexpected: true }) : input,
            );
            publishValid = () => stageWriteRequest(runs, stores.artifacts, setup.guard, input);
          } else {
            const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
            const guard = await setup.currentGuard();
            const input = {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence: await retainWriteReceipt(stores, stage.intent),
            };
            writing = acceptWriteReceipt(
              runs,
              stores.artifacts,
              fault === 'guard' ? { ...guard, expectedScopeRevision: -1 } : guard,
              fault === 'input' ? Object.assign({ ...input }, { unexpected: true }) : input,
            );
            publishValid = () => acceptWriteReceipt(runs, stores.artifacts, guard, input);
          }
          await rejects(writing);
          expect(publications).toBe(0);
          expect(await publishValid()).toMatchObject({ kind: 'applied' });
          expect(publications).toBe(1);
        } finally {
          await stores.close();
        }
      },
    );

for (const operation of ['stage', 'accept'] as const)
  test(
    'verified write ' +
      operation +
      ' snapshots caller cuts and command before its first evidence await',
    async () => {
      const clock = new FixtureClock();
      const stores = createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock,
      });
      const entered = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();
      let publishing: Promise<unknown> | undefined;
      await settleFixture(async () => {
        const setup = await createWriteFixture({ ...stores, clock });
        const stage =
          operation === 'accept'
            ? unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command))
            : undefined;
        const guard = { ...(await setup.currentGuard()) };
        if (stage === undefined) {
          const input = {
            commandId: setup.command.commandId,
            completion: setup.completion,
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: setup.stateEvidence,
          };
          const runs = {
            ...stores.runs,
            async readExecutionHistory(
              ...parameters: Parameters<typeof stores.runs.readExecutionHistory>
            ) {
              entered.resolve(undefined);
              await released.promise;
              return await stores.runs.readExecutionHistory(...parameters);
            },
          };
          const writing = stageWriteRequest(runs, stores.artifacts, guard, input);
          publishing = writing;
          await Promise.race([
            entered.promise,
            writing.then(() => {
              throw new Error('write stage completed before controlled history await');
            }),
          ]);
          guard.expectedScopeRevision = 0;
          input.commandId = executionCommandId('mutated');
          released.resolve(undefined);
          const reply = await writing;
          expect(reply.kind).toBe('applied');
        } else {
          const evidence = await retainWriteReceipt(stores, stage.intent);
          const input = {
            commandId: executionCommandId('accept-write'),
            stageCommandId: setup.command.commandId,
            intent: stage.intent,
            evidence,
          };
          const artifacts = {
            ...stores.artifacts,
            async readArtifact(reference: Parameters<typeof stores.artifacts.readArtifact>[0]) {
              entered.resolve(undefined);
              await released.promise;
              return await stores.artifacts.readArtifact(reference);
            },
          };
          const writing = acceptWriteReceipt(stores.runs, artifacts, guard, input);
          publishing = writing;
          await Promise.race([
            entered.promise,
            writing.then(() => {
              throw new Error('write acceptance completed before controlled receipt await');
            }),
          ]);
          guard.expectedScopeRevision = 0;
          input.commandId = executionCommandId('mutated');
          released.resolve(undefined);
          const reply = await writing;
          expect(reply.kind).toBe('applied');
        }
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.guard.attemptId,
        );
        expect(history.version).toBe(3);
        if (history.version !== 3) throw Error('current write history absent');
        expect(history.writes.at(-1)?.command.commandId).toBe(
          operation === 'stage' ? setup.command.commandId : executionCommandId('accept-write'),
        );
      }, [
        () => {
          released.resolve(undefined);
        },
        async () => {
          if (publishing !== undefined) await publishing;
        },
        () => stores.close(),
      ]);
    },
  );

for (const fault of ['absent', 'unreadable'] as const)
  test(
    'verified write stage checks independently retained output ' +
      fault +
      ' before trusted publication',
    async () => {
      const clock = new FixtureClock();
      const stores = createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock,
      });
      try {
        const setup = await createWriteFixture({ ...stores, clock });
        const output = await stores.artifacts.retainArtifact(
          new TextEncoder().encode('Independently retained write output.'),
          'text/plain',
        );
        if (output.kind !== 'retained') throw Error('output fixture retention refused');
        const submitted =
          fault === 'absent'
            ? { ...output.reference, digest: artifactDigest('0'.repeat(64)) }
            : output.reference;
        const completion = {
          ...setup.completion,
          outcome: { ...setup.completion.outcome, artifacts: [submitted] },
        };
        const sentinel = new Error('independent write output unreadable');
        const artifacts = {
          ...stores.artifacts,
          async readArtifact(reference: Parameters<typeof stores.artifacts.readArtifact>[0]) {
            if (reference.digest === output.reference.digest && fault === 'unreadable')
              throw sentinel;
            return await stores.artifacts.readArtifact(reference);
          },
        };
        let publications = 0;
        const runs = {
          ...stores.runs,
          async stageWrite(...parameters: Parameters<typeof stores.runs.stageWrite>) {
            publications++;
            return await stores.runs.stageWrite(...parameters);
          },
        };
        const before = await stores.runs.readRun(setup.run.runId);
        await rejects(
          stageWriteRequest(runs, artifacts, setup.guard, {
            commandId: setup.command.commandId,
            completion,
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: setup.stateEvidence,
          }),
        );
        expect(publications).toBe(0);
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    },
  );

test('verified write stage consumes actual live claim state before publication', async () => {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
  });
  try {
    const setup = await createWriteFixture({ ...stores, clock });
    const staged = await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, {
      commandId: setup.command.commandId,
      completion: setup.completion,
      canonicalRequest: setup.canonicalRequest,
      stateEvidence: setup.stateEvidence,
    });
    expect(staged.kind).toBe('applied');
    expect(unwrapReply(staged).intent.canonicalRequest).toBe(setup.canonicalRequest);
  } finally {
    await stores.close();
  }
});

const stateFaults: readonly [string, (state: RuntimeState) => unknown][] = [
  ['scope', (state) => ({ ...state, scope: { ...state.scope, personId: 'other' } })],
  ['ledger', (state) => ({ ...state, ledgerId: 'other' })],
  ['basis', (state) => ({ ...state, basis: 'rb1:' + 'f'.repeat(64) })],
  ['authority', (state) => ({ ...state, authority: { kind: 'uninitialized' } })],
  ['missing claim', (state) => ({ ...state, claims: [] })],
  ['duplicate claim', (state) => ({ ...state, claims: [...state.claims, ...state.claims] })],
  [
    'ordinary claim',
    (state) => ({
      ...state,
      claims: state.claims.map((entry) => ({ kind: 'ordinary', claim: entry.claim })),
    }),
  ],
  [
    'actor',
    (state) => ({
      ...state,
      claims: state.claims.map((entry) => ({
        ...entry,
        claim: { ...entry.claim, accountId: 'other' },
      })),
    }),
  ],
  [
    'run',
    (state) => ({
      ...state,
      claims: state.claims.map((entry) => ({
        ...entry,
        claim: { ...entry.claim, runId: 'other' },
      })),
    }),
  ],
  [
    'claim target',
    (state) => ({
      ...state,
      claims: state.claims.map((entry) => ({
        ...entry,
        claim: { ...entry.claim, workItemId: 'other' },
      })),
    }),
  ],
  [
    'binding session',
    (state) => ({
      ...state,
      claims: state.claims.map((entry) =>
        entry.kind === 'runtime'
          ? {
              ...entry,
              binding: {
                ...entry.binding,
                execution: { ...entry.binding.execution, sessionId: 'other' },
              },
            }
          : entry,
      ),
    }),
  ],
  [
    'step code',
    (state) => ({
      ...state,
      facts: {
        ...state.facts,
        steps: state.facts.steps.map((entry) => ({ ...entry, code: 'other' })),
      },
    }),
  ],
];
for (const [fault, rewrite] of stateFaults)
  test(
    'verified write stage rejects actual state ' + fault + ' before calling trusted publication',
    async () => {
      const clock = new FixtureClock();
      const stores = createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 2,
        leaseMilliseconds: 100,
        clock,
      });
      try {
        const setup = await createWriteFixture({ ...stores, clock });
        const retained = await stores.artifacts.retainArtifact(
          new TextEncoder().encode(JSON.stringify(rewrite(setup.state))),
          'application/json',
        );
        if (retained.kind !== 'retained') throw Error('fault artifact refused');
        const before = await stores.runs.readRun(setup.run.runId);
        let publications = 0;
        const runs = {
          ...stores.runs,
          async stageWrite(...parameters: Parameters<typeof stores.runs.stageWrite>) {
            publications++;
            return await stores.runs.stageWrite(...parameters);
          },
        };
        await rejects(
          stageWriteRequest(runs, stores.artifacts, setup.guard, {
            commandId: setup.command.commandId,
            completion: setup.completion,
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: retained.reference,
          }),
        );
        expect(publications).toBe(0);
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    },
  );

for (const state of ['pending', 'terminal'] as const)
  for (const fault of state === 'pending'
    ? ['state unreadable', 'outcome unreadable', 'quiescence unreadable']
    : ['state unreadable', 'outcome unreadable', 'quiescence unreadable', 'receipt unreadable'])
    test('verified ' + state + ' history rechecks ' + fault, async () => {
      const clock = new FixtureClock();
      const stores = createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 2,
        leaseMilliseconds: 100,
        clock,
      });
      try {
        const setup = await createWriteFixture({ ...stores, clock });
        const output = await stores.artifacts.retainArtifact(
          new TextEncoder().encode('Separate validated write output.'),
          'text/plain',
        );
        const quiescence = await stores.artifacts.retainArtifact(
          new TextEncoder().encode('Separate settled write quiescence.'),
          'text/plain',
        );
        if (output.kind !== 'retained' || quiescence.kind !== 'retained')
          throw new Error('write history fixtures not retained');
        const completion = {
          ...setup.completion,
          outcome: { ...setup.completion.outcome, artifacts: [output.reference] },
          quiescence: { ...setup.completion.quiescence, evidence: quiescence.reference },
        };
        const staged = unwrapReply(
          await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, {
            commandId: setup.command.commandId,
            completion,
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: setup.stateEvidence,
          }),
        );
        let receipt = setup.stateEvidence;
        if (state === 'terminal') {
          receipt = await retainWriteReceipt(stores, staged.intent);
          unwrapReply(
            await acceptWriteReceipt(stores.runs, stores.artifacts, await setup.currentGuard(), {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: staged.intent,
              evidence: receipt,
            }),
          );
        }
        const history = await readExecutionHistory(
          stores.runs,
          stores.artifacts,
          setup.run.runId,
          setup.guard.attemptId,
        );
        expect(history.version).toBe(3);
        const digest =
          fault === 'state unreadable'
            ? setup.stateEvidence.digest
            : fault === 'outcome unreadable'
              ? output.reference.digest
              : fault === 'quiescence unreadable'
                ? quiescence.reference.digest
                : receipt.digest;
        const sentinel = new Error(fault);
        const artifacts = {
          ...stores.artifacts,
          async readArtifact(reference: Parameters<typeof stores.artifacts.readArtifact>[0]) {
            if (reference.digest === digest) throw sentinel;
            return await stores.artifacts.readArtifact(reference);
          },
        };
        await rejects(
          readExecutionHistory(stores.runs, artifacts, setup.run.runId, setup.guard.attemptId),
          (cause) => cause === sentinel,
        );
      } finally {
        await stores.close();
      }
    });
