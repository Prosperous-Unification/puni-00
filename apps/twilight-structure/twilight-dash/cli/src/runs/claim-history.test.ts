import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { acceptClaimReceipt, readExecutionHistory, stageClaimRequest } from './claim-history';
import { artifactDigest, executionCommandId, organizationId } from './record-codecs';
import { FixtureClock, prepareSession, retainClaimReceipt, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

function create() {
  const clock = new FixtureClock();
  return {
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  };
}
async function stage(stores: ReturnType<typeof create>) {
  const setup = await prepareSession(stores);
  const staged = unwrapReply(
    await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
      commandId: executionCommandId('stage-claim'),
      canonicalRequest: setup.canonicalRequest,
      stateEvidence: setup.preparationInput.stateEvidence,
    }),
  );
  const evidence = await retainClaimReceipt(stores, staged.intent);
  return { ...setup, staged, evidence };
}
for (const fault of [
  'absent',
  'unreadable',
  'utf8',
  'json',
  'version',
  'scope',
  'command',
  'digest',
  'authority',
  'session',
  'schema',
] as const)
  test('claim acceptance refuses actual receipt ' + fault + ' without either half', async () => {
    const stores = create();
    try {
      const setup = await stage(stores);
      // The retained receipt is a valid fixture; this mutable projection deliberately corrupts one field.
      const wire = JSON.parse(
        new TextDecoder().decode(await stores.artifacts.readArtifact(setup.evidence)),
      ) as {
        schemaVersion: number;
        scope: { personId: string };
        commandId: string;
        requestDigest: string;
        acceptance: {
          authority: { generation: number };
          claim: { execution: { sessionId: string } };
        };
        actorId?: string;
      };
      if (fault === 'version') wire.schemaVersion = 2;
      if (fault === 'scope') wire.scope.personId = 'other';
      if (fault === 'command') wire.commandId = 'other';
      if (fault === 'digest') wire.requestDigest = 'f'.repeat(64);
      if (fault === 'authority') wire.acceptance.authority.generation = 99;
      if (fault === 'session') wire.acceptance.claim.execution.sessionId = 'other';
      if (fault === 'schema') delete wire.actorId;
      const content =
        fault === 'utf8'
          ? new Uint8Array([0xff])
          : new TextEncoder().encode(fault === 'json' ? '{' : JSON.stringify(wire));
      const retained = await stores.artifacts.retainArtifact(content, 'application/json');
      if (retained.kind !== 'retained') throw new Error('receipt fixture refused');
      const evidence =
        fault === 'absent'
          ? { ...retained.reference, digest: artifactDigest('f'.repeat(64)) }
          : retained.reference;
      const cause = new Error('receipt unreadable');
      const artifacts: ArtifactStore =
        fault === 'unreadable'
          ? {
              ...stores.artifacts,
              readArtifact() {
                return Promise.reject(cause);
              },
            }
          : stores.artifacts;
      const before = {
        history: await stores.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
        scope: await stores.runs.readRuntimeScope(setup.scope),
      };
      const pending = acceptClaimReceipt(stores.runs, artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('accepted'),
        intent: setup.staged.intent,
        evidence,
      });
      if (fault === 'unreadable') await rejects(pending, (failure) => failure === cause);
      else await rejects(pending);
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
      ).toEqual(before.history);
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(before.scope);
    } finally {
      await stores.close();
    }
  });

for (const field of ['claimId', 'actorId', 'basisAfter'] as const)
  test(
    'verified history rejects coherently retained generated ' +
      field +
      ' not present in real receipt',
    async () => {
      const stores = create();
      try {
        const setup = await stage(stores);
        const projection = {
          version: 1 as const,
          claimId: 'claim',
          actorId: 'account',
          basisAfter: 'rb1:' + 'b'.repeat(64),
          [field]: field === 'basisAfter' ? 'rb1:' + 'c'.repeat(64) : 'forged',
        };
        unwrapReply(
          await stores.runs.recordClaimAcceptance(await setup.scopedGuard(), {
            version: 2,
            kind: 'accept_claim',
            commandId: executionCommandId('accepted'),
            intent: setup.staged.intent,
            evidence: setup.evidence,
            projection,
          }),
        );
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.admission.attemptId,
        );
        expect(history.attempt.state.kind).toBe('ready');
        await rejects(
          readExecutionHistory(
            stores.runs,
            stores.artifacts,
            setup.run.runId,
            setup.admission.attemptId,
          ),
          /historical claim projection differs from artifact/,
        );
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
        ).toEqual(history);
      } finally {
        await stores.close();
      }
    },
  );

test('verified claim acceptance snapshots guard intent evidence and mutable byte replies', async () => {
  const stores = create();
  try {
    const setup = await stage(stores);
    const guard = structuredClone(await setup.scopedGuard());
    const input = structuredClone({
      commandId: executionCommandId('accepted'),
      intent: setup.staged.intent,
      evidence: setup.evidence,
    });
    const entered = Promise.withResolvers<undefined>();
    const proceed = Promise.withResolvers<undefined>();
    const content = Buffer.from(await stores.artifacts.readArtifact(setup.evidence));
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact() {
        entered.resolve(undefined);
        await proceed.promise;
        queueMicrotask(() => {
          queueMicrotask(() => content.fill(0));
        });
        return content;
      },
    };
    const pending = acceptClaimReceipt(stores.runs, artifacts, guard, input);
    await entered.promise;
    Object.assign(input.intent, { commandId: 'mutated' });
    Object.assign(input.evidence, { byteLength: 0 });
    Object.assign(guard, { expectedScopeRevision: 999 });
    proceed.resolve(undefined);
    const accepted = unwrapReply(await pending);
    expect(accepted.binding.intent).toEqual(setup.staged.intent);
    expect(accepted.binding.acceptance.evidence).toEqual(setup.evidence);
    expect(accepted.binding.projection).toEqual({
      version: 1,
      claimId: 'claim',
      actorId: 'account',
      basisAfter: 'rb1:' + 'b'.repeat(64),
    });
    expect(content.every((byte) => byte === 0)).toBe(true);
  } finally {
    await stores.close();
  }
});

test('claim stage snapshots state reference and request before history and artifact awaits', async () => {
  const stores = create();
  try {
    const setup = await prepareSession(stores);
    const guard = structuredClone(await setup.scopedGuard());
    const input = structuredClone({
      commandId: executionCommandId('stage-claim'),
      canonicalRequest: setup.canonicalRequest,
      stateEvidence: setup.preparationInput.stateEvidence,
    });
    const entered = Promise.withResolvers<undefined>();
    const proceed = Promise.withResolvers<undefined>();
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        entered.resolve(undefined);
        await proceed.promise;
        return await stores.artifacts.readArtifact(reference);
      },
    };
    const pending = stageClaimRequest(stores.runs, artifacts, guard, input);
    await entered.promise;
    input.canonicalRequest = '{}';
    Object.assign(input.stateEvidence, { digest: artifactDigest('f'.repeat(64)) });
    Object.assign(guard, { expectedRevision: 999 });
    proceed.resolve(undefined);
    const staged = unwrapReply(await pending);
    expect(staged.intent.canonicalRequest).toBe(setup.canonicalRequest);
    const history = await stores.runs.readExecutionHistory(
      setup.run.runId,
      setup.admission.attemptId,
    );
    expect(history.executions.at(-1)).toMatchObject({
      command: { observation: { evidence: setup.preparationInput.stateEvidence } },
    });
  } finally {
    await stores.close();
  }
});

test('authority-only methods refuse claim stages and acceptances even as exact redelivery', async () => {
  const stores = create();
  try {
    const setup = await stage(stores);
    const guard = { ownership: setup.ownership, scope: setup.scope, expectedRevision: 3 };
    const before = await stores.runs.readRuntimeScope(setup.scope);
    expect(await stores.runs.stageRuntimeRequest(guard, setup.canonicalRequest)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
    expect(
      await stores.runs.recordRuntimeAcceptance(guard, {
        intent: setup.staged.intent,
        evidence: setup.evidence,
      }),
    ).toEqual({ kind: 'refused', reason: 'state_conflict' });
    expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(before);
    unwrapReply(
      await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('accepted'),
        intent: setup.staged.intent,
        evidence: setup.evidence,
      }),
    );
    expect(
      await stores.runs.recordRuntimeAcceptance(guard, {
        intent: setup.staged.intent,
        evidence: setup.evidence,
      }),
    ).toEqual({ kind: 'refused', reason: 'state_conflict' });
  } finally {
    await stores.close();
  }
});

import { runId as claimHistoryRunId } from './record-codecs';
import { admitExecution as admitExecutionForVerifiedHistory } from './testing/fixtures';
test('claim helper verifies returned history target before staging an otherwise exact claim', async () => {
  const stores = create();
  try {
    const setup = await prepareSession(stores),
      before = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      scope = await stores.runs.readRuntimeScope(setup.scope);
    const runs = {
      ...stores.runs,
      async readExecutionHistory(
        run: Parameters<typeof stores.runs.readExecutionHistory>[0],
        attempt: Parameters<typeof stores.runs.readExecutionHistory>[1],
      ) {
        const history = await stores.runs.readExecutionHistory(run, attempt);
        return { ...history, run: { ...history.run, runId: claimHistoryRunId('misdirected') } };
      },
    };
    await rejects(
      stageClaimRequest(runs, stores.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('stage'),
        canonicalRequest: setup.canonicalRequest,
        stateEvidence: setup.preparationInput.stateEvidence,
      }),
      /claim history target differs/,
    );
    expect(
      await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).toEqual(before);
    expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
  } finally {
    await stores.close();
  }
});
for (const fault of ['selection', 'observation'] as const)
  test(
    'verified preparation history rejects coherent ' +
      fault +
      ' differing from independently retained bytes',
    async () => {
      const original = create(),
        stores = create();
      try {
        const originalSetup = await prepareSession(original),
          setup = await admitExecutionForVerifiedHistory(stores);
        const originalHistory = await original.runs.readExecutionHistory(
          originalSetup.run.runId,
          originalSetup.attempt.attemptId,
        );
        const preparation = originalHistory.executions.find(
          (entry) =>
            entry.command.kind === 'execution' &&
            entry.command.fact.kind === 'preparation_intended',
        );
        if (
          preparation?.command.kind !== 'execution' ||
          preparation.command.fact.kind !== 'preparation_intended'
        )
          throw new Error('fixture preparation missing');
        const intent = structuredClone(preparation.command.fact.intent);
        if (fault === 'selection') Object.assign(intent.selection, { className: 'forged-class' });
        else Object.assign(intent.target.observation, { basis: 'rb1:' + 'c'.repeat(64) });
        const prepared = unwrapReply(
          await stores.runs.recordExecution(await setup.currentGuard(), {
            ...preparation.command,
            fact: { kind: 'preparation_intended', intent },
          }),
        );
        expect(prepared.state.kind).toBe('preparing');
        const before = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        await rejects(
          readExecutionHistory(
            stores.runs,
            stores.artifacts,
            setup.run.runId,
            setup.attempt.attemptId,
          ),
          fault === 'selection'
            ? /historical preparation selection differs/
            : /retained target projection differs from artifact/,
        );
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(before);
      } finally {
        await original.close();
        await stores.close();
      }
    },
  );

test('missing preparation retains its intentional diagnostic without invoking stageClaim', async () => {
  const stores = create();
  try {
    const setup = await prepareSession(stores),
      before = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
    let writes = 0;
    const runs = {
      ...stores.runs,
      async readExecutionHistory(
        run: Parameters<typeof stores.runs.readExecutionHistory>[0],
        attempt: Parameters<typeof stores.runs.readExecutionHistory>[1],
      ) {
        const history = await stores.runs.readExecutionHistory(run, attempt);
        return {
          ...history,
          executions: history.executions.filter(
            (entry) =>
              entry.command.kind !== 'execution' ||
              entry.command.fact.kind !== 'preparation_intended',
          ),
        };
      },
      async stageClaim(...parameters: Parameters<typeof stores.runs.stageClaim>) {
        writes++;
        return await stores.runs.stageClaim(...parameters);
      },
    };
    await rejects(
      stageClaimRequest(runs, stores.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('stage'),
        canonicalRequest: setup.canonicalRequest,
        stateEvidence: setup.preparationInput.stateEvidence,
      }),
      /claim preparation does not exist/,
    );
    expect(writes).toBe(0);
    expect(
      await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).toEqual(before);
  } finally {
    await stores.close();
  }
});
test('verified history checks returned target before reading retained binding', async () => {
  const stores = create();
  try {
    const setup = await prepareSession(stores),
      before = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
    let reads = 0;
    const runs = {
      ...stores.runs,
      async readExecutionHistory(
        run: Parameters<typeof stores.runs.readExecutionHistory>[0],
        attempt: Parameters<typeof stores.runs.readExecutionHistory>[1],
      ) {
        const history = await stores.runs.readExecutionHistory(run, attempt);
        return { ...history, run: { ...history.run, runId: claimHistoryRunId('misdirected') } };
      },
      async readManifest(...parameters: Parameters<typeof stores.runs.readManifest>) {
        reads++;
        return await stores.runs.readManifest(...parameters);
      },
    };
    await rejects(
      readExecutionHistory(runs, stores.artifacts, setup.run.runId, setup.attempt.attemptId),
      /execution history target differs/,
    );
    expect(reads).toBe(0);
    expect(
      await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).toEqual(before);
  } finally {
    await stores.close();
  }
});
