import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { dependentReceiptFixture } from './testing/runtime-history-contract';
import { runtimeHistoryContract } from './testing/runtime-history-contract';

runtimeHistoryContract('memory runtime history', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});

import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { artifactDigest, ownerId } from './record-codecs';
import { acceptRuntimeReceipt, readRuntimeHistory } from './runtime-history';
import { unwrapReply } from './testing/fixtures';
import {
  authorityReceipt,
  authorityRequest,
  runtimeEvidence,
  runtimePin,
  runtimeScope,
} from './testing/runtime-history-contract';

async function verifiedFixture() {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
  });
  const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local'), 0));
  unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
  const intent = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope: runtimeScope, expectedRevision: 0 },
      authorityRequest(),
    ),
  );
  const guard = { ownership, scope: structuredClone(runtimeScope), expectedRevision: 1 };
  async function retain(candidate: unknown) {
    const retained = await stores.artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(candidate)),
      'application/json',
    );
    if (retained.kind !== 'retained') throw new Error('artifact metadata conflict');
    return retained.reference;
  }
  return { ...stores, guard, intent, retain };
}

test('verified receipt retains actual matching artifact and verified history rereads every historical evidence link', async () => {
  const stores = await verifiedFixture();
  try {
    const evidence = await stores.retain(authorityReceipt(stores.intent));
    const accepted = unwrapReply(
      await acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        stores.guard,
        stores.intent,
        evidence,
      ),
    );
    expect(accepted).toMatchObject({ commandId: 'acquire', acceptedRevision: 2, evidence });
    expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
      revision: 2,
      acceptances: [accepted],
    });
    const unreadable: ArtifactStore = {
      ...stores.artifacts,
      readArtifact() {
        throw new Error('injected unreadable artifact');
      },
    };
    await rejects(
      readRuntimeHistory(stores.runs, unreadable, runtimeScope),
      /injected unreadable artifact/,
    );
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({ revision: 2 });
  } finally {
    await stores.close();
  }
});

test('verified receipt rejects absent unreadable and corrupt bytes before acceptance', async () => {
  const stores = await verifiedFixture();
  try {
    const before = await stores.runs.readRuntimeScope(runtimeScope);
    await rejects(
      acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        stores.guard,
        stores.intent,
        runtimeEvidence,
      ),
      /artifact does not exist/,
    );
    const evidence = await stores.retain(authorityReceipt(stores.intent));
    const unreadable: ArtifactStore = {
      ...stores.artifacts,
      readArtifact() {
        return Promise.reject(new Error('injected unreadable artifact'));
      },
    };
    await rejects(
      acceptRuntimeReceipt(stores.runs, unreadable, stores.guard, stores.intent, evidence),
      /injected unreadable artifact/,
    );
    const corrupt: ArtifactStore = {
      ...stores.artifacts,
      readArtifact() {
        return Promise.resolve(
          new TextEncoder().encode(
            JSON.stringify({ ...authorityReceipt(stores.intent), actorId: 'different' }),
          ),
        );
      },
    };
    await rejects(
      acceptRuntimeReceipt(stores.runs, corrupt, stores.guard, stores.intent, evidence),
      /artifact integrity mismatch/,
    );
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
  } finally {
    await stores.close();
  }
});

for (const fault of [
  'version',
  'scope',
  'ledger',
  'command',
  'digest',
  'owner',
  'generation',
  'kind',
  'unknown kind',
] as const)
  test(`verified receipt rejects otherwise valid ${fault} mismatch without acceptance`, async () => {
    const stores = await verifiedFixture();
    try {
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      const receipt = authorityReceipt(stores.intent);
      const wire = structuredClone(receipt);
      if (fault === 'version') wire.schemaVersion = 2;
      if (fault === 'scope') wire.scope = { ...wire.scope, personId: 'other' };
      if (fault === 'ledger') wire.ledgerId = 'other';
      if (fault === 'command') wire.commandId = 'other';
      if (fault === 'digest') wire.requestDigest = artifactDigest('b'.repeat(64));
      if (fault === 'owner') wire.acceptance.authority.ownerId = 'other';
      if (fault === 'generation') wire.acceptance.authority.generation = 5;
      if (fault === 'unknown kind') wire.acceptance.kind = 'invented';
      if (fault === 'kind')
        Object.assign(wire.acceptance, {
          kind: 'claim',
          claim: {
            claimId: 'claim',
            workItemId: 'work',
            stepId: 'step',
            parentClaimId: null,
            execution: {
              storeId: 'store',
              runId: 'run',
              attemptId: 'attempt',
              sessionId: 'session',
            },
          },
          basisAfter: `rb1:${'a'.repeat(64)}`,
        });
      const evidence = await stores.retain(wire);
      await rejects(
        acceptRuntimeReceipt(stores.runs, stores.artifacts, stores.guard, stores.intent, evidence),
      );
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    } finally {
      await stores.close();
    }
  });

test('verified receipt rejects strict UTF8 JSON and wrong media before retaining acceptance', async () => {
  const stores = await verifiedFixture();
  try {
    const before = await stores.runs.readRuntimeScope(runtimeScope);
    for (const [bytes, mediaType] of [
      [new Uint8Array([0xc3, 0x28]), 'application/json'],
      [new TextEncoder().encode('{'), 'application/json'],
      [new TextEncoder().encode(JSON.stringify(authorityReceipt(stores.intent))), 'text/plain'],
    ] as const) {
      const retained = await stores.artifacts.retainArtifact(bytes, mediaType);
      if (retained.kind !== 'retained') throw new Error('expected retained');
      await rejects(
        acceptRuntimeReceipt(
          stores.runs,
          stores.artifacts,
          stores.guard,
          stores.intent,
          retained.reference,
        ),
      );
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    }
  } finally {
    await stores.close();
  }
});

test('verified operation snapshots guard intent and evidence before artifact await', async () => {
  const stores = await verifiedFixture();
  try {
    const evidence = await stores.retain(authorityReceipt(stores.intent));
    const guard = structuredClone(stores.guard);
    const intent = structuredClone(stores.intent);
    const submitted = structuredClone(evidence);
    const gate = Promise.withResolvers<undefined>();
    const waiting: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        await gate.promise;
        return await stores.artifacts.readArtifact(reference);
      },
    };
    const pending = acceptRuntimeReceipt(stores.runs, waiting, guard, intent, submitted);
    Object.assign(guard.scope, { personId: 'mutated' });
    Object.assign(intent.localOwner, { ownerId: 'mutated' });
    Object.assign(submitted, { byteLength: 2 });
    gate.resolve(undefined);
    expect((await pending).kind).toBe('applied');
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
      revision: 2,
      acceptances: [{ evidence }],
    });
  } finally {
    await stores.close();
  }
});

test('verified receipt follows public response compatibility for extra fields', async () => {
  const stores = await verifiedFixture();
  try {
    const evidence = await stores.retain({
      ...authorityReceipt(stores.intent),
      futureField: { enabled: true },
    });
    expect(
      (
        await acceptRuntimeReceipt(
          stores.runs,
          stores.artifacts,
          stores.guard,
          stores.intent,
          evidence,
        )
      ).kind,
    ).toBe('applied');
    expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
      revision: 2,
    });
  } finally {
    await stores.close();
  }
});

test('verified history checks an older artifact even after a newer acceptance supplies the grant', async () => {
  const stores = await verifiedFixture();
  try {
    const firstEvidence = await stores.retain(authorityReceipt(stores.intent));
    unwrapReply(
      await acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        stores.guard,
        stores.intent,
        firstEvidence,
      ),
    );
    const next = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ...stores.guard, expectedRevision: 2 },
        authorityRequest('next', 1),
      ),
    );
    const nextEvidence = await stores.retain(authorityReceipt(next));
    unwrapReply(
      await acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        { ...stores.guard, expectedRevision: 3 },
        next,
        nextEvidence,
      ),
    );
    expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
      revision: 4,
      acceptances: [expect.anything(), expect.anything()],
    });
    const unreadable: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        if (reference.digest === firstEvidence.digest)
          throw new Error('injected historical artifact unreadability');
        return await stores.artifacts.readArtifact(reference);
      },
    };
    await rejects(
      readRuntimeHistory(stores.runs, unreadable, runtimeScope),
      /historical artifact unreadability/,
    );
  } finally {
    await stores.close();
  }
});

test('verified receipt consumes the complete dependent applied-order schema', async () => {
  const stores = await verifiedFixture();
  try {
    const before = await stores.runs.readRuntimeScope(runtimeScope);
    const candidate = dependentReceiptFixture();
    const evidence = await stores.retain(candidate.receipt);
    await rejects(
      acceptRuntimeReceipt(stores.runs, stores.artifacts, stores.guard, candidate.intent, evidence),
      /runtime receipt schema/,
    );
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
  } finally {
    await stores.close();
  }
});

test('verified receipt refuses invalid UTF8 inside an otherwise valid ignored actor string', async () => {
  const stores = await verifiedFixture();
  try {
    const encoded = JSON.stringify(authorityReceipt(stores.intent));
    const bytes = new TextEncoder().encode(encoded);
    const actor = encoded.indexOf('"actorId":"account"');
    if (actor < 0) throw new Error('fixture actor absent');
    bytes[actor + '"actorId":"'.length] = 255;
    const retained = await stores.artifacts.retainArtifact(bytes, 'application/json');
    if (retained.kind !== 'retained') throw new Error('fixture artifact refusal');
    await rejects(
      acceptRuntimeReceipt(
        stores.runs,
        stores.artifacts,
        stores.guard,
        stores.intent,
        retained.reference,
      ),
    );
    expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
      revision: 1,
      acceptances: [],
    });
  } finally {
    await stores.close();
  }
});

test('memory count audit diagnoses lost retained pin before reporting absence', async () => {
  const stores = await verifiedFixture();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve and restore the prototype method; the fixture invokes it with its original receiver.
  const originalSet = Map.prototype.set;
  try {
    const scope = { ...runtimeScope, personId: 'lost' };
    const pin = { ...runtimePin, scope };
    const key = JSON.stringify(['organization', 'project', 'lost']);
    Map.prototype.set = function (identity, value) {
      if (identity === key) return this;
      return originalSet.call(this, identity, value);
    };
    try {
      unwrapReply(await stores.runs.pinRuntimeScope(stores.guard.ownership, pin));
    } finally {
      Map.prototype.set = originalSet;
    }
    await rejects(stores.runs.readRuntimeScope(scope), /memory runtime counts/);
  } finally {
    Map.prototype.set = originalSet;
    await stores.close();
  }
});
