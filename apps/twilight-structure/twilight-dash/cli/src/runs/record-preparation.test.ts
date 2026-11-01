import { deepEqual, doesNotReject, rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { artifactDigest, organizationId } from './record-codecs';
import { recordExecution } from './record-execution';
import { readTargetObservation, recordPreparation } from './record-preparation';
import { admitExecution, FixtureClock, unwrapReply } from './testing/fixtures';
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
for (const fault of [
  'absent',
  'unreadable',
  'utf8',
  'json',
  'schema',
  'scope',
  'missing work',
  'duplicate work',
  'missing step',
  'duplicate step',
  'nullable code',
  'wrong code',
] as const)
  test('preparation refuses actual state ' + fault + ' without retaining intent', async () => {
    const stores = create();
    try {
      const setup = await admitExecution(stores);
      const before = await stores.runs.readRun(setup.run.runId);
      let state = structuredClone(setup.state);
      if (fault === 'scope') state = { ...state, scope: { ...state.scope, personId: 'other' } };
      if (fault === 'missing work') state = { ...state, facts: { ...state.facts, workItems: [] } };
      if (fault === 'duplicate work')
        state = {
          ...state,
          facts: {
            ...state.facts,
            workItems: [...state.facts.workItems, ...state.facts.workItems],
          },
        };
      if (fault === 'missing step') state = { ...state, facts: { ...state.facts, steps: [] } };
      if (fault === 'duplicate step')
        state = {
          ...state,
          facts: { ...state.facts, steps: [...state.facts.steps, ...state.facts.steps] },
        };
      if (fault === 'nullable code' || fault === 'wrong code')
        state = {
          ...state,
          facts: {
            ...state.facts,
            steps: [{ id: 'step', code: fault === 'nullable code' ? null : 'wrong', position: 0 }],
          },
        };
      const content =
        fault === 'utf8'
          ? new Uint8Array([0xff])
          : new TextEncoder().encode(
              fault === 'json'
                ? '{'
                : JSON.stringify(fault === 'schema' ? { ...state, schemaVersion: 2 } : state),
            );
      const retained = await stores.artifacts.retainArtifact(content, 'application/json');
      if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
      const stateEvidence =
        fault === 'absent'
          ? { ...retained.reference, digest: artifactDigest('f'.repeat(64)) }
          : retained.reference;
      const cause = new Error('state storage unreadable');
      const artifacts: ArtifactStore =
        fault === 'unreadable'
          ? {
              ...stores.artifacts,
              async readArtifact(reference) {
                if (reference.digest === stateEvidence.digest) throw cause;
                return await stores.artifacts.readArtifact(reference);
              },
            }
          : stores.artifacts;
      const pending = recordPreparation(stores.runs, artifacts, await setup.currentGuard(), {
        ...setup.preparationInput,
        stateEvidence,
      });
      if (fault === 'unreadable') await rejects(pending, (failure) => failure === cause);
      else await rejects(pending);
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      expect(
        (await stores.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId))
          .executions,
      ).toEqual([]);
    } finally {
      await stores.close();
    }
  });

const executorPins: Readonly<Record<string, string>>[] = [{}, { human: 'different' }];
for (const executorVersions of executorPins)
  test(
    'preparation requires exact selected kind pin ' + JSON.stringify(executorVersions),
    async () => {
      const stores = create();
      try {
        const setup = await admitExecution(stores, undefined, { executorVersions });
        const before = await stores.runs.readRun(setup.run.runId);
        await rejects(
          recordPreparation(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            setup.preparationInput,
          ),
          /executor pin differs/,
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    },
  );

test('preparation validates target and canonical bytes independently of artifact adapter', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const forged = new TextEncoder().encode(
      JSON.stringify({ ...setup.state, basis: 'rb1:' + 'c'.repeat(64) }),
    );
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        return reference.digest === setup.preparationInput.stateEvidence.digest
          ? forged
          : await stores.artifacts.readArtifact(reference);
      },
    };
    await rejects(
      recordPreparation(stores.runs, artifacts, await setup.currentGuard(), setup.preparationInput),
      /artifact integrity/,
    );
    const before = await stores.runs.readRun(setup.run.runId);
    for (const changes of [
      { executor: { kind: 'tool' as const, version: 'human-1' } },
      { stepCode: 'missing' },
      { preparation: { ...setup.preparationInput.preparation, creationKey: '' } },
    ])
      await rejects(
        recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), {
          ...setup.preparationInput,
          ...changes,
        }),
      );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});

test('preparation snapshots caller before awaits and accepts forward readable wire extras', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify({ ...setup.state, future: { receipt: true } })),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
    const input = structuredClone({ ...setup.preparationInput, stateEvidence: retained.reference });
    const guard = structuredClone(await setup.currentGuard());
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        entered.resolve(undefined);
        await release.promise;
        return await stores.artifacts.readArtifact(reference);
      },
    };
    const pending = recordPreparation(stores.runs, artifacts, guard, input);
    await entered.promise;
    const original = structuredClone(input);
    Object.assign(input.preparation, { creationKey: 'mutated' });
    Object.assign(input.executor, { version: 'mutated' });
    Object.assign(input.scope, { personId: 'mutated' });
    Object.assign(input.stateEvidence, { byteLength: 0 });
    Object.assign(guard, { expectedRevision: 999 });
    release.resolve(undefined);
    const attempt = unwrapReply(await pending);
    expect(attempt.state).toMatchObject({
      kind: 'preparing',
      preparation: {
        preparation: original.preparation,
        executor: original.executor,
        target: { observation: { evidence: original.stateEvidence, scope: original.scope } },
      },
    });
    const history = await stores.runs.readExecutionHistory(
      setup.run.runId,
      setup.admission.attemptId,
    );
    const command = history.executions.at(0)?.command;
    if (command?.kind !== 'execution') throw new Error('fixture preparation missing');
    await rejects(
      recordExecution(stores.runs, stores.artifacts, await setup.currentGuard(), command),
      /recordPreparation/,
    );
  } finally {
    await stores.close();
  }
});

import { attemptId as preparationAttemptId, runId as preparationRunId } from './record-codecs';
test('preparation embedded invalid UTF8 remains parseable JSON under a permissive decoder', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const content = Buffer.from(JSON.stringify({ ...setup.state, ledgerId: 'ledger-marker' }));
    const offset = content.indexOf('marker');
    if (offset < 0) throw new Error('fixture marker missing');
    content[offset] = 0xff;
    expect(
      (JSON.parse(new TextDecoder().decode(content)) as { ledgerId: string }).ledgerId,
    ).toContain('\uFFFD');
    const retained = await stores.artifacts.retainArtifact(content, 'application/json');
    if (retained.kind !== 'retained') throw new Error('fixture retain refused');
    const before = await stores.runs.readRun(setup.run.runId);
    await rejects(
      recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), {
        ...setup.preparationInput,
        stateEvidence: retained.reference,
      }),
    );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});
test('preparation requires JSON media type on otherwise valid retained state bytes', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores),
      content = new TextEncoder().encode(JSON.stringify(setup.state, null, 2));
    const retained = await stores.artifacts.retainArtifact(content, 'text/plain');
    if (retained.kind !== 'retained') throw new Error('fixture retain refused');
    const before = await stores.runs.readRun(setup.run.runId);
    await rejects(
      recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), {
        ...setup.preparationInput,
        stateEvidence: retained.reference,
      }),
      /runtime state requires application\/json/,
    );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});
test('preparation verifies returned run identity before invoking the actual provider', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores),
      before = await stores.runs.readRun(setup.run.runId);
    const runs = {
      ...stores.runs,
      async readRun(identity: Parameters<typeof stores.runs.readRun>[0]) {
        const snapshot = await stores.runs.readRun(identity);
        return { ...snapshot, run: { ...snapshot.run, runId: preparationRunId('misdirected') } };
      },
    };
    await rejects(
      recordPreparation(runs, stores.artifacts, await setup.currentGuard(), setup.preparationInput),
      /preparation attempt does not exist/,
    );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});
test('preparation rejects a coherent different attempt identity at its helper boundary', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores),
      before = await stores.runs.readRun(setup.run.runId);
    await rejects(
      recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), {
        ...setup.preparationInput,
        preparation: {
          ...setup.preparationInput.preparation,
          attemptId: preparationAttemptId('different'),
        },
      }),
      /preparation identity differs/,
    );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});
test('preparation rejects a coherent foreign organization observation at its helper boundary', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores),
      before = await stores.runs.readRun(setup.run.runId),
      scope = { ...setup.scope, organizationId: 'other' };
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify({ ...setup.state, scope })),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture retain refused');
    await rejects(
      recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), {
        ...setup.preparationInput,
        scope,
        stateEvidence: retained.reference,
      }),
      /preparation scope differs/,
    );
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    await stores.close();
  }
});

test('target observation snapshots its reference and target before IO', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const evidence = { ...setup.preparationInput.stateEvidence };
    const target = structuredClone({
      scope: setup.preparationInput.scope,
      workItemId: setup.run.workItemId,
      stepId: setup.preparationInput.stepId,
      stepCode: setup.preparationInput.stepCode,
    });
    const expected = {
      version: 1,
      evidence: structuredClone(evidence),
      ...structuredClone(target),
      ledgerId: setup.state.ledgerId,
      basis: setup.state.basis,
    };
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        const bytes = await stores.artifacts.readArtifact(reference);
        started.resolve(undefined);
        await gate.promise;
        return bytes;
      },
    };
    const pending = readTargetObservation(artifacts, evidence, target);
    try {
      await started.promise;
      Object.assign(evidence, { digest: artifactDigest('f'.repeat(64)), byteLength: 0 });
      Object.assign(target.scope, {
        personId: 'mutated',
        projectId: 'mutated',
        organizationId: 'mutated',
      });
      Object.assign(target, { workItemId: 'mutated', stepId: 'mutated', stepCode: 'mutated' });
      gate.resolve(undefined);
      await doesNotReject(async () => {
        deepEqual(await pending, expected);
      }, 'target observation must preserve its pre-IO reference and target');
    } finally {
      gate.resolve(undefined);
      await Promise.allSettled([pending]);
    }
  } finally {
    await stores.close();
  }
});
