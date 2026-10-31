import { deepEqual, doesNotReject, rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { artifactDigest, organizationId } from './record-codecs';
import { readRuntimeStateArtifact } from './runtime-state';
import { admitExecution, FixtureClock } from './testing/fixtures';
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

test('retained state reader returns complete authority and ordinary/runtime claim inventory', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const claim = {
      id: 'ordinary-claim',
      workItemId: setup.run.workItemId,
      stepId: null,
      personId: setup.state.scope.personId,
      runId: null,
      parentClaimId: null,
      accountId: 'account',
    };
    const state: typeof setup.state = {
      ...setup.state,
      claims: [
        { kind: 'ordinary', claim },
        {
          kind: 'runtime',
          claim: { ...claim, id: 'runtime-claim', stepId: 'step', runId: 'business-run' },
          binding: {
            claimId: 'runtime-claim',
            workItemId: setup.run.workItemId,
            stepId: 'step',
            parentClaimId: null,
            execution: {
              storeId: 'store',
              runId: 'local-run',
              attemptId: 'local-attempt',
              sessionId: 'local-session',
            },
          },
        },
      ],
    };
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(state)),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('fixture state refused');
    deepEqual(await readRuntimeStateArtifact(stores.artifacts, retained.reference), state);
    deepEqual(
      await readRuntimeStateArtifact(stores.artifacts, setup.preparationInput.stateEvidence),
      setup.state,
    );
  } finally {
    await stores.close();
  }
});

test('retained state reader snapshots its reference before IO', async () => {
  const stores = create();
  try {
    const setup = await admitExecution(stores);
    const evidence = { ...setup.preparationInput.stateEvidence };
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
    const pending = readRuntimeStateArtifact(artifacts, evidence);
    try {
      await started.promise;
      evidence.digest = artifactDigest('f'.repeat(64));
      gate.resolve(undefined);
      await doesNotReject(async () => {
        deepEqual(await pending, setup.state);
      }, 'retained state reader must preserve its pre-IO reference');
    } finally {
      gate.resolve(undefined);
      await Promise.allSettled([pending]);
    }
  } finally {
    await stores.close();
  }
});

for (const fault of [
  'missing',
  'unreadable',
  'media',
  'digest',
  'length',
  'utf8',
  'json',
  'schema',
])
  test('retained state reader rejects ' + fault, async () => {
    const stores = create();
    try {
      const setup = await admitExecution(stores);
      let content = Buffer.from(
        fault === 'json'
          ? '{'
          : JSON.stringify({
              ...setup.state,
              ...(fault === 'schema' ? { schemaVersion: 2 } : {}),
              ledgerId: 'ledger-marker',
            }),
      );
      if (fault === 'utf8') {
        const offset = content.indexOf('marker');
        if (offset < 0) throw new Error('fixture marker missing');
        content[offset] = 0xff;
        const decoded = new TextDecoder().decode(content);
        expect(() => {
          JSON.parse(decoded);
        }).not.toThrow();
        expect(decoded).toContain('\uFFFD');
      }
      const retained = await stores.artifacts.retainArtifact(
        content,
        fault === 'media' ? 'text/plain' : 'application/json',
      );
      if (retained.kind !== 'retained') throw new Error('fixture state refused');
      const reference =
        fault === 'missing'
          ? { ...retained.reference, digest: artifactDigest('f'.repeat(64)) }
          : retained.reference;
      const cause = new Error('retained state unreadable');
      let missingCause: unknown;
      // These modeled broken adapters return wrong bytes after a real read; the real store's
      // integrity guard stays installed. They cover the reader's inherited independent check.
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        async readArtifact(evidence) {
          if (fault === 'unreadable') throw cause;
          if (fault === 'missing') {
            try {
              return await stores.artifacts.readArtifact(evidence);
            } catch (failure) {
              missingCause = failure;
              throw failure;
            }
          }
          const bytes = await stores.artifacts.readArtifact(evidence);
          if (fault === 'digest') {
            content = Buffer.from(bytes);
            const offset = content.indexOf('marker');
            if (offset < 0) throw new Error('fixture marker missing');
            content[offset] = 'x'.charCodeAt(0);
            return content;
          }
          if (fault === 'length') return new Uint8Array([...bytes, 0x20]);
          return bytes;
        },
      };
      const pending = readRuntimeStateArtifact(artifacts, reference);
      if (fault === 'missing')
        await rejects(pending, (failure) => failure instanceof Error && failure === missingCause);
      else if (fault === 'unreadable') await rejects(pending, (failure) => failure === cause);
      else if (fault === 'media')
        await rejects(pending, /runtime state requires application\/json/);
      else if (fault === 'digest' || fault === 'length')
        await rejects(pending, /artifact integrity mismatch/);
      else if (fault === 'schema') await rejects(pending, /runtime state schema differs/);
      else if (fault === 'json') await rejects(pending, SyntaxError);
      else await rejects(pending);
    } finally {
      await stores.close();
    }
  });
