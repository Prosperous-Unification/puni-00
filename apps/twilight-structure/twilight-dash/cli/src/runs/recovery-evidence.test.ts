import { deepEqual, rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { referenceArtifact } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import { artifactDigest, organizationId, ownerId } from './record-codecs';
import {
  decodeRecoveryBeginCall,
  decodeRecoveryExchange,
  decodeRecoveryFenceCall,
  decodeRecoveryHistory,
  decodeRecoveryObservationCall,
  decodeRecoveryResolveCall,
} from './recovery-codecs';
import { deriveRecoveryClaimCommand, readRecoveryExchange } from './recovery-evidence';
import type { ClaimRecoveryTarget, RecoveryExchange, RecoveryIntent } from './recovery-records';
import { decodeRuntimeIntent, digestRuntimeRequest } from './runtime-codecs';
import { FixtureClock, prepareClaimed } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import {
  authorityReceipt,
  authorityRequest,
  runtimeScope,
} from './testing/runtime-history-contract';

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
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const reference = referenceArtifact(
  bytes({ error: 'runtime_receipt_not_found' }),
  'application/json',
);
const original = decodeRuntimeIntent({
  version: 1,
  commandId: 'acquire',
  canonicalRequest: authorityRequest(),
  requestDigest: digestRuntimeRequest(authorityRequest()),
  localOwner: { ownerId: 'owner', epoch: 1 },
  stagedRevision: 1,
});
const intent = {
  version: 1,
  recoveryId: 'recover',
  target: { kind: 'authority', original },
  begunScopeRevision: 1,
  resolver: { ownerId: ownerId('owner'), epoch: 1 },
} as const;
const guard = {
  ownership: {
    version: 1,
    storeId: 'store',
    organizationId: 'organization',
    ownerId: 'owner',
    epoch: 1,
    expiresAt: 2000,
  },
  scope: runtimeScope,
  expectedRevision: 1,
  expectedRecoveryRevision: 0,
};
const state = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  scope: runtimeScope,
  basis: 'rb1:' + 'a'.repeat(64),
  facts: { projectRevision: 0, workItems: [], steps: [] },
  authority: { kind: 'uninitialized' },
  claims: [],
};
const exchange = {
  version: 1,
  context: { kind: 'initial_state', recoveryId: 'recover' },
  scope: runtimeScope,
  ledgerId: 'ledger',
  request: { kind: 'state' },
  status: 200,
  body: reference,
} as const;
const pair = <T>(value: T, envelope: unknown = exchange) => ({
  envelope: { artifact: reference, value: envelope },
  body: { artifact: reference, value },
});
const fence = {
  version: 1,
  recoveryId: 'recover',
  ordinal: 1,
  canonicalRequest: authorityRequest('fence', 1),
  requestDigest: digestRuntimeRequest(authorityRequest('fence', 1)),
  owner: intent.resolver,
  stagedRevision: 1,
  basis: { kind: 'initial', state: pair(state) },
};
const observation = {
  version: 1,
  kind: 'accepted',
  observedRevision: 2,
  fence,
  reply: pair(authorityReceipt(original)),
};
const history = { version: 1, intent, revision: 0, fences: [], observations: [], closure: null };
const begin = { kind: 'authority', guard, intent };
const call = { kind: 'authority', guard, recoveryId: 'recover', input: { fence } };
const resolve = {
  kind: 'authority',
  guard,
  recoveryId: 'recover',
  fence: { fence, observation },
  decision: { kind: 'fenced_nonaccepted', lookup: pair({ error: 'runtime_receipt_not_found' }) },
};

async function retain(artifacts: ArtifactStore, content: Uint8Array) {
  const retained = await artifacts.retainArtifact(content, 'application/json');
  if (retained.kind !== 'retained') throw new Error('fixture artifact refused');
  return retained.reference;
}
async function capture(
  artifacts: ArtifactStore,
  body: unknown,
  changes: Partial<RecoveryExchange> = {},
) {
  const bodyRef = await retain(artifacts, bytes(body));
  const envelope = await retain(artifacts, bytes({ ...exchange, body: bodyRef, ...changes }));
  return { envelope, bodyRef };
}

describe('recovery record codecs', () => {
  test('decode valid detached records synchronously', () => {
    for (const [decode, value] of [
      [decodeRecoveryExchange, exchange],
      [decodeRecoveryBeginCall, begin],
      [decodeRecoveryFenceCall, call],
      [
        decodeRecoveryObservationCall,
        { ...call, input: { kind: 'accepted', fence, reply: observation.reply } },
      ],
      [decodeRecoveryResolveCall, resolve],
      [decodeRecoveryHistory, history],
    ] as const) {
      const decoded = decode(value);
      deepEqual(decoded, value);
      expect(decoded).not.toBe(value);
      expect(decoded).not.toBeInstanceOf(Promise);
    }
  });
  test.each([
    [
      'write target',
      decodeRecoveryBeginCall,
      { ...begin, intent: { ...intent, target: { kind: 'write', original } } },
    ],
    [
      'wrong target',
      decodeRecoveryBeginCall,
      {
        ...begin,
        intent: {
          ...intent,
          target: {
            kind: 'claim',
            original,
            runId: 'run',
            attemptId: 'attempt',
            stageCommandId: 'stage',
            acceptanceCommandId: 'accept',
          },
        },
      },
    ],
    ['wrong guard', decodeRecoveryBeginCall, { ...begin, guard: { ...guard, runId: 'run' } }],
    [
      'missing body value',
      decodeRecoveryFenceCall,
      {
        ...call,
        input: {
          fence: {
            ...fence,
            basis: { kind: 'initial', state: { ...pair(state), body: { artifact: reference } } },
          },
        },
      },
    ],
    [
      'missing envelope ref',
      decodeRecoveryFenceCall,
      {
        ...call,
        input: {
          fence: {
            ...fence,
            basis: { kind: 'initial', state: { ...pair(state), envelope: { value: exchange } } },
          },
        },
      },
    ],
    [
      'unknown nested key',
      decodeRecoveryHistory,
      { ...history, intent: { ...intent, extra: true } },
    ],
    [
      'unsafe revision',
      decodeRecoveryHistory,
      { ...history, revision: Number.MAX_SAFE_INTEGER + 1 },
    ],
    [
      'negative revision',
      decodeRecoveryBeginCall,
      { ...begin, guard: { ...guard, expectedRecoveryRevision: -1 } },
    ],
    [
      'fractional ordinal',
      decodeRecoveryFenceCall,
      { ...call, input: { fence: { ...fence, ordinal: 1.5 } } },
    ],
    [
      'zero ordinal',
      decodeRecoveryFenceCall,
      { ...call, input: { fence: { ...fence, ordinal: 0 } } },
    ],
    [
      'unknown context',
      decodeRecoveryExchange,
      { ...exchange, context: { kind: 'unknown', recoveryId: 'recover' } },
    ],
    [
      'missing context field',
      decodeRecoveryExchange,
      { ...exchange, context: { kind: 'original_lookup', recoveryId: 'recover', ordinal: 1 } },
    ],
    ['write request', decodeRecoveryExchange, { ...exchange, request: { kind: 'write' } }],
    [
      'unknown observation',
      decodeRecoveryObservationCall,
      { ...call, input: { ...observation, kind: 'missing' } },
    ],
    [
      'wrong receipt discriminant',
      decodeRecoveryObservationCall,
      {
        ...call,
        input: {
          kind: 'generation_conflict',
          fence,
          reply: pair({ error: 'runtime_receipt_not_found' }),
        },
      },
    ],
    [
      'missing claim command',
      decodeRecoveryResolveCall,
      {
        ...resolve,
        kind: 'claim',
        guard: {
          ...guard,
          runId: 'run',
          attemptId: 'attempt',
          expectedAttemptRevision: 1,
          expectedScopeRevision: 1,
        },
        decision: { kind: 'accepted', lookup: pair(authorityReceipt(original)) },
      },
    ],
  ])('rejects %s', (_name, decode, value) => {
    expect(() => decode(value)).toThrow();
  });
  test.each([
    'initial_state',
    'supersession_state',
    'supersession_lookup',
    'original_lookup',
    'fence_reply',
  ] as const)('decodes %s context', (kind) => {
    const contexts = {
      initial_state: { kind, recoveryId: 'recover' },
      supersession_state: {
        kind,
        recoveryId: 'recover',
        previousOrdinal: 1,
        previousRequestDigest: original.requestDigest,
      },
      supersession_lookup: {
        kind,
        recoveryId: 'recover',
        previousOrdinal: 1,
        stateExchange: reference,
      },
      original_lookup: {
        kind,
        recoveryId: 'recover',
        ordinal: 1,
        observationRevision: 2,
        fenceExchange: reference,
        fenceReceipt: reference,
      },
      fence_reply: {
        kind,
        recoveryId: 'recover',
        ordinal: 1,
        stagedRevision: 1,
        requestDigest: original.requestDigest,
      },
    };
    deepEqual(
      decodeRecoveryExchange({ ...exchange, context: contexts[kind] }).context,
      contexts[kind],
    );
  });
});

test('recovery evidence reads actual absence bytes and propagates unreadable envelope', async () => {
  const stores = create();
  try {
    const captured = await capture(
      stores.artifacts,
      { error: 'runtime_receipt_not_found' },
      {
        context: {
          kind: 'supersession_lookup',
          recoveryId: 'recover',
          previousOrdinal: 1,
          stateExchange: reference,
        },
        request: { kind: 'lookup', commandId: 'fence-1' },
        status: 404,
      },
    );
    expect(
      await readRecoveryExchange(stores.artifacts, captured.envelope, { kind: 'absent' }),
    ).toMatchObject({
      kind: 'absent',
      exchange: {
        body: { artifact: captured.bodyRef, value: { error: 'runtime_receipt_not_found' } },
      },
    });
    await rejects(
      readRecoveryExchange(
        {
          ...stores.artifacts,
          readArtifact: () => Promise.reject(new Error('recovery unreadable')),
        },
        captured.envelope,
        { kind: 'absent' },
      ),
      new RegExp('recovery unreadable'),
    );
  } finally {
    await stores.close();
  }
});

for (const side of ['envelope', 'body'] as const) {
  for (const fault of [
    'missing',
    'unreadable',
    'digest',
    'length',
    'media',
    'utf8',
    'json',
    'schema',
  ] as const) {
    test(`recovery evidence rejects ${side} ${fault}`, async () => {
      const stores = create();
      try {
        let bodyContent = bytes({
          ...state,
          facts: { ...state.facts, steps: [{ id: 'recovery-step', code: null, position: 0 }] },
        });
        let bodyRef = referenceArtifact(bodyContent, 'application/json');
        let envelopeContent = bytes({ ...exchange, body: bodyRef });
        const corrupt = (content: Uint8Array) => {
          if (fault === 'utf8') {
            const malformed = new Uint8Array(content);
            const marker = new TextDecoder()
              .decode(content)
              .indexOf(side === 'envelope' ? '"recover"' : '"recovery-step"');
            malformed[marker + 2] = 0xff;
            return malformed;
          }
          return fault === 'json'
            ? bytes('{').slice(1, -1)
            : bytes(
                side === 'body'
                  ? { ...state, schemaVersion: 2 }
                  : { ...exchange, body: bodyRef, version: 2 },
              );
        };
        if (side === 'body' && ['utf8', 'json', 'schema'].includes(fault)) {
          bodyContent = corrupt(bodyContent);
          bodyRef = referenceArtifact(bodyContent, 'application/json');
        }
        if (side === 'body' && fault === 'digest')
          bodyRef = { ...bodyRef, digest: artifactDigest('f'.repeat(64)) };
        if (side === 'body' && fault === 'length')
          bodyRef = { ...bodyRef, byteLength: bodyRef.byteLength + 1 };
        if (side === 'body' && fault === 'media') bodyRef = { ...bodyRef, mediaType: 'text/plain' };
        envelopeContent = bytes({ ...exchange, body: bodyRef });
        if (side === 'envelope' && ['utf8', 'json', 'schema'].includes(fault))
          envelopeContent = corrupt(envelopeContent);
        let envelopeRef = referenceArtifact(envelopeContent, 'application/json');
        if (side === 'envelope' && fault === 'digest')
          envelopeRef = { ...envelopeRef, digest: artifactDigest('e'.repeat(64)) };
        if (side === 'envelope' && fault === 'length')
          envelopeRef = { ...envelopeRef, byteLength: envelopeRef.byteLength + 1 };
        if (side === 'envelope' && fault === 'media')
          envelopeRef = { ...envelopeRef, mediaType: 'text/plain' };
        const artifacts: ArtifactStore = {
          ...stores.artifacts,
          readArtifact(requested) {
            const isEnvelope = requested.digest === envelopeRef.digest;
            if ((side === 'envelope') === isEnvelope) {
              if (fault === 'missing') return Promise.resolve(new Uint8Array());
              if (fault === 'unreadable')
                return Promise.reject(new Error('recovery unreadable ' + side));
            }
            return Promise.resolve(isEnvelope ? envelopeContent : bodyContent);
          },
        };
        const pending = readRecoveryExchange(artifacts, envelopeRef, { kind: 'state' });
        if (fault === 'unreadable')
          await rejects(pending, new RegExp('recovery unreadable ' + side));
        else await rejects(pending);
      } finally {
        await stores.close();
      }
    });
  }
}

test.each([
  ['status', { status: 404 }],
  ['request', { request: { kind: 'lookup', commandId: 'acquire' } }],
  [
    'context',
    {
      context: {
        kind: 'supersession_lookup',
        recoveryId: 'recover',
        previousOrdinal: 1,
        stateExchange: reference,
      },
    },
  ],
  ['scope', { scope: { ...runtimeScope, personId: 'other' } }],
  ['ledger', { ledgerId: 'other' }],
] as const)('recovery evidence rejects state %s correspondence', async (_name, changes) => {
  const stores = create();
  try {
    const captured = await capture(stores.artifacts, state, changes);
    await rejects(readRecoveryExchange(stores.artifacts, captured.envelope, { kind: 'state' }));
  } finally {
    await stores.close();
  }
});

test('recovery evidence verifies authority canonical receipt and rejects different original', async () => {
  const stores = create();
  try {
    const captured = await capture(stores.artifacts, authorityReceipt(original), {
      context: {
        kind: 'fence_reply',
        recoveryId: 'recover',
        ordinal: 1,
        requestDigest: original.requestDigest,
        stagedRevision: 1,
      },
      request: { kind: 'authority', canonicalRequest: original.canonicalRequest },
    });
    expect(
      await readRecoveryExchange(stores.artifacts, captured.envelope, {
        kind: 'authority',
        intent: original,
      }),
    ).toMatchObject({
      kind: 'authority',
      exchange: { body: { value: { commandId: 'acquire', acceptance: { kind: 'authority' } } } },
    });
    const changed = decodeRuntimeIntent({
      ...original,
      canonicalRequest: authorityRequest('other'),
      commandId: 'other',
      requestDigest: digestRuntimeRequest(authorityRequest('other')),
    });
    await rejects(
      readRecoveryExchange(stores.artifacts, captured.envelope, {
        kind: 'authority',
        intent: changed,
      }),
    );
  } finally {
    await stores.close();
  }
});

test('recovery evidence derives actual generated claim projection and retained acceptance identity', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const receipt: unknown = JSON.parse(
      new TextDecoder().decode(
        await stores.artifacts.readArtifact(setup.accepted.acceptance.evidence),
      ),
    );
    const captured = await capture(stores.artifacts, receipt, {
      context: {
        kind: 'original_lookup',
        recoveryId: 'recover',
        ordinal: 1,
        observationRevision: 2,
        fenceExchange: reference,
        fenceReceipt: reference,
      },
      request: { kind: 'lookup', commandId: setup.staged.intent.commandId },
    });
    const verified = await readRecoveryExchange(stores.artifacts, captured.envelope, {
      kind: 'claim',
      intent: setup.staged.intent,
    });
    if (verified.kind !== 'claim') throw new Error('fixture claim required');
    const claimIntent: RecoveryIntent<ClaimRecoveryTarget> = {
      ...intent,
      target: {
        kind: 'claim',
        original: setup.staged.intent,
        runId: setup.run.runId,
        attemptId: setup.attempt.attemptId,
        stageCommandId: 'stage-claim',
        acceptanceCommandId: 'recover-accept',
      },
    };
    deepEqual(deriveRecoveryClaimCommand(claimIntent, verified.exchange), {
      version: 2,
      kind: 'accept_claim',
      commandId: 'recover-accept',
      intent: setup.staged.intent,
      evidence: captured.bodyRef,
      projection: {
        version: 1,
        claimId: 'claim',
        actorId: 'account',
        basisAfter: 'rb1:' + 'b'.repeat(64),
      },
    });
    const acceptedCall = {
      ...resolve,
      kind: 'claim',
      guard: { ...(await setup.scopedGuard()), expectedRecoveryRevision: 0 },
      decision: {
        kind: 'accepted',
        lookup: verified.exchange,
        command: deriveRecoveryClaimCommand(claimIntent, verified.exchange),
      },
    };
    deepEqual(decodeRecoveryResolveCall(acceptedCall), acceptedCall);
    for (const cause of ['claim_nonaccepted', 'claim_accepted_fenced'] as const) {
      const checkpoint =
        cause === 'claim_nonaccepted' ? setup.staged.attempt.state : setup.accepted.attempt.state;
      const held = {
        ...setup.accepted.attempt,
        version: 3,
        state: { kind: 'recovery_hold', cause, closureId: 'recover', checkpoint },
      };
      const closure: Record<string, unknown> = {
        version: 1,
        recoveryId: 'recover',
        original: setup.staged.intent,
        fence: resolve.fence,
        decision: {
          kind: 'accepted',
          lookup: verified.exchange,
          command: deriveRecoveryClaimCommand(claimIntent, verified.exchange),
        },
        resolvedRevision: 3,
        resolver: intent.resolver,
        scopeBefore: 3,
        scopeAfter: 5,
        originalReply: {
          kind: 'claim',
          command: deriveRecoveryClaimCommand(claimIntent, verified.exchange),
          ack: setup.accepted,
        },
        attemptReply: held,
      };
      const closed = { ...history, intent: claimIntent, closure };
      deepEqual(decodeRecoveryHistory(closed), closed);
      expect(() =>
        decodeRecoveryHistory({
          ...closed,
          closure: {
            ...closure,
            attemptReply: {
              ...held,
              state: {
                ...held.state,
                checkpoint:
                  cause === 'claim_nonaccepted'
                    ? setup.accepted.attempt.state
                    : setup.staged.attempt.state,
              },
            },
          },
        }),
      ).toThrow();
    }
  } finally {
    await stores.close();
  }
});

test('recovery evidence snapshots envelope and receipt subject before IO', async () => {
  const stores = create();
  try {
    const subject = { kind: 'authority' as const, intent: structuredClone(original) };
    const captured = await capture(stores.artifacts, authorityReceipt(original), {
      context: {
        kind: 'original_lookup',
        recoveryId: 'recover',
        ordinal: 1,
        observationRevision: 2,
        fenceExchange: reference,
        fenceReceipt: reference,
      },
      request: { kind: 'lookup', commandId: original.commandId },
    });
    const mutableRef = { ...captured.envelope };
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const pending = readRecoveryExchange(
      {
        ...stores.artifacts,
        async readArtifact(ref) {
          started.resolve(undefined);
          await gate.promise;
          return stores.artifacts.readArtifact(ref);
        },
      },
      mutableRef,
      subject,
    );
    await started.promise;
    mutableRef.digest = artifactDigest('f'.repeat(64));
    subject.intent = decodeRuntimeIntent({
      ...original,
      commandId: 'other',
      canonicalRequest: authorityRequest('other'),
      requestDigest: digestRuntimeRequest(authorityRequest('other')),
    });
    gate.resolve(undefined);
    expect(await pending).toMatchObject({
      kind: 'authority',
      exchange: {
        envelope: { artifact: captured.envelope },
        body: { value: { commandId: 'acquire' } },
      },
    });
  } finally {
    await stores.close();
  }
});

test('recovery codecs retain superseding bases conflict observations and authority closure', () => {
  const superseding = {
    ...fence,
    ordinal: 2,
    basis: {
      kind: 'superseding',
      previousOrdinal: 1,
      state: pair({
        ...state,
        authority: { kind: 'held', ownerId: 'receiver-owner', generation: 1 },
        claims: [
          {
            kind: 'ordinary',
            claim: {
              id: 'ordinary',
              workItemId: 'work',
              stepId: null,
              personId: 'person',
              runId: null,
              parentClaimId: null,
              accountId: 'account',
            },
          },
        ],
      }),
      lookup: pair({ error: 'runtime_receipt_not_found' }),
    },
  };
  const conflict = {
    kind: 'generation_conflict',
    fence,
    reply: pair({ error: 'runtime_generation_conflict' }),
  };
  deepEqual(decodeRecoveryFenceCall({ ...call, input: { fence: superseding } }).input, {
    fence: superseding,
  });
  deepEqual(decodeRecoveryObservationCall({ ...call, input: conflict }).input, conflict);
  const closure = {
    version: 1,
    recoveryId: 'recover',
    original,
    fence: resolve.fence,
    decision: { kind: 'accepted', lookup: pair(authorityReceipt(original)) },
    resolvedRevision: 3,
    resolver: intent.resolver,
    scopeBefore: 1,
    scopeAfter: 3,
    originalReply: {
      kind: 'authority',
      acceptance: {
        version: 1,
        commandId: original.commandId,
        requestDigest: original.requestDigest,
        evidence: reference,
        acceptedRevision: 2,
      },
    },
    attemptReply: null,
  };
  const retained = {
    ...history,
    revision: 3,
    fences: [fence, superseding],
    observations: [observation, { ...conflict, version: 1, observedRevision: 2 }],
    closure,
  };
  deepEqual(decodeRecoveryHistory(retained), retained);
  expect(
    decodeRecoveryHistory({
      ...retained,
      closure: { ...closure, decision: resolve.decision, originalReply: null },
    }).closure?.originalReply,
  ).toBeNull();
  deepEqual(
    decodeRecoveryResolveCall({ ...resolve, decision: closure.decision }).decision,
    closure.decision,
  );
});

for (const kind of ['absent', 'generation_conflict'] as const) {
  test(`recovery evidence validates public ${kind} and rejects another refusal`, async () => {
    const stores = create();
    try {
      const error = kind === 'absent' ? 'runtime_receipt_not_found' : 'runtime_generation_conflict';
      const context: RecoveryExchange['context'] =
        kind === 'absent'
          ? {
              kind: 'original_lookup',
              recoveryId: 'recover',
              ordinal: 1,
              observationRevision: 2,
              fenceExchange: reference,
              fenceReceipt: reference,
            }
          : {
              kind: 'fence_reply',
              recoveryId: 'recover',
              ordinal: 1,
              requestDigest: original.requestDigest,
              stagedRevision: 1,
            };
      const request: RecoveryExchange['request'] =
        kind === 'absent'
          ? { kind: 'lookup', commandId: 'acquire' }
          : { kind: 'authority', canonicalRequest: original.canonicalRequest };
      const changes = { context, request, status: kind === 'absent' ? 404 : 409 };
      const captured = await capture(stores.artifacts, { error }, changes);
      expect(
        await readRecoveryExchange(stores.artifacts, captured.envelope, { kind }),
      ).toMatchObject({ kind, exchange: { body: { value: { error } } } });
      for (const wrong of [
        { error: kind === 'absent' ? 'unknown_person' : 'runtime_authority_stale' },
        { error: 'invalid' },
        { schemaVersion: 1 },
      ]) {
        const invalid = await capture(stores.artifacts, wrong, changes);
        await rejects(readRecoveryExchange(stores.artifacts, invalid.envelope, { kind }));
      }
      for (const change of [
        { status: 200 },
        { request: { kind: 'state' as const } },
        { context: { kind: 'initial_state' as const, recoveryId: 'recover' } },
      ]) {
        const invalid = await capture(stores.artifacts, { error }, { ...changes, ...change });
        await rejects(readRecoveryExchange(stores.artifacts, invalid.envelope, { kind }));
      }
    } finally {
      await stores.close();
    }
  });
}

for (const [label, change] of [
  ['lookup command', { request: { kind: 'lookup', commandId: 'other' } }],
  ['receipt scope', { scope: { ...runtimeScope, personId: 'other' } }],
  ['receipt ledger', { ledgerId: 'other' }],
  [
    'fence digest',
    {
      context: {
        kind: 'fence_reply',
        recoveryId: 'recover',
        ordinal: 1,
        stagedRevision: 1,
        requestDigest: artifactDigest('b'.repeat(64)),
      },
    },
  ],
  [
    'fence revision',
    {
      context: {
        kind: 'fence_reply',
        recoveryId: 'recover',
        ordinal: 1,
        stagedRevision: 2,
        requestDigest: original.requestDigest,
      },
    },
  ],
] as const)
  test(`recovery evidence rejects ${label} capture correspondence`, async () => {
    const stores = create();
    try {
      const captured = await capture(stores.artifacts, authorityReceipt(original), {
        request: { kind: 'lookup', commandId: 'acquire' },
        context: {
          kind: 'fence_reply',
          recoveryId: 'recover',
          ordinal: 1,
          requestDigest: original.requestDigest,
          stagedRevision: 1,
        },
        ...change,
      });
      await rejects(
        readRecoveryExchange(stores.artifacts, captured.envelope, {
          kind: 'authority',
          intent: original,
        }),
      );
    } finally {
      await stores.close();
    }
  });

test('recovery evidence rejects receipt bytes that differ from original canonical request', async () => {
  const stores = create();
  try {
    const captured = await capture(
      stores.artifacts,
      { ...authorityReceipt(original), actorId: 'account', commandId: 'other' },
      {
        request: { kind: 'lookup', commandId: original.commandId },
        context: {
          kind: 'original_lookup',
          recoveryId: 'recover',
          ordinal: 1,
          observationRevision: 2,
          fenceExchange: reference,
          fenceReceipt: reference,
        },
      },
    );
    await rejects(
      readRecoveryExchange(stores.artifacts, captured.envelope, {
        kind: 'authority',
        intent: original,
      }),
      new RegExp('runtime receipt correspondence'),
    );
  } finally {
    await stores.close();
  }
});

test('recovery evidence refuses receipt subject swaps through actual public bytes', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const claimReceipt: unknown = JSON.parse(
      new TextDecoder().decode(
        await stores.artifacts.readArtifact(setup.accepted.acceptance.evidence),
      ),
    );
    for (const [originalIntent, receipt, kind] of [
      [original, authorityReceipt(original), 'claim'],
      [setup.staged.intent, claimReceipt, 'authority'],
    ] as const) {
      const captured = await capture(stores.artifacts, receipt, {
        context: {
          kind: 'original_lookup',
          recoveryId: 'recover',
          ordinal: 1,
          observationRevision: 2,
          fenceExchange: reference,
          fenceReceipt: reference,
        },
        request: { kind: 'lookup', commandId: originalIntent.commandId },
      });
      await rejects(
        readRecoveryExchange(stores.artifacts, captured.envelope, { kind, intent: originalIntent }),
      );
    }
  } finally {
    await stores.close();
  }
});

test('recovery evidence returns complete public state inventory and detached pairs', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const observed = {
      ...setup.state,
      claims: [
        {
          kind: 'runtime',
          claim: {
            id: 'claim',
            workItemId: 'work',
            stepId: 'step',
            personId: 'person',
            runId: 'business',
            parentClaimId: null,
            accountId: 'account',
          },
          binding: {
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
        },
      ],
    };
    const captured = await capture(stores.artifacts, observed);
    const verified = await readRecoveryExchange(stores.artifacts, captured.envelope, {
      kind: 'state',
    });
    deepEqual(verified.exchange.body.value, observed);
    deepEqual(verified.exchange.envelope.value.body, captured.bodyRef);
    expect(verified.exchange.body.value).not.toBe(observed);
  } finally {
    await stores.close();
  }
});

test('recovery projection validates all generated fields before returning a command', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const receipt: unknown = JSON.parse(
      new TextDecoder().decode(
        await stores.artifacts.readArtifact(setup.accepted.acceptance.evidence),
      ),
    );
    const captured = await capture(stores.artifacts, receipt, {
      context: {
        kind: 'original_lookup',
        recoveryId: 'recover',
        ordinal: 1,
        observationRevision: 2,
        fenceExchange: reference,
        fenceReceipt: reference,
      },
      request: { kind: 'lookup', commandId: setup.staged.intent.commandId },
    });
    const verified = await readRecoveryExchange(stores.artifacts, captured.envelope, {
      kind: 'claim',
      intent: setup.staged.intent,
    });
    if (verified.kind !== 'claim') throw new Error('fixture claim required');
    const claimIntent: RecoveryIntent<ClaimRecoveryTarget> = {
      ...intent,
      target: {
        kind: 'claim',
        original: setup.staged.intent,
        runId: 'run',
        attemptId: 'attempt',
        stageCommandId: 'stage',
        acceptanceCommandId: 'accept',
      },
    };
    for (const field of ['claimId', 'actorId', 'basisAfter'] as const) {
      const invalid = structuredClone(verified.exchange);
      const projected = invalid.body.value;
      const changed =
        field === 'actorId'
          ? { ...projected, actorId: '' }
          : {
              ...projected,
              acceptance: {
                ...projected.acceptance,
                ...(field === 'claimId'
                  ? { claim: { ...projected.acceptance.claim, claimId: '' } }
                  : { basisAfter: 'invalid' }),
              },
            };
      expect(() =>
        deriveRecoveryClaimCommand(claimIntent, {
          ...invalid,
          body: { ...invalid.body, value: changed },
        }),
      ).toThrow();
    }
  } finally {
    await stores.close();
  }
});

test('recovery evidence rejects malformed subject before reading valid artifacts', async () => {
  const stores = create();
  try {
    const captured = await capture(stores.artifacts, state);
    await rejects(
      readRecoveryExchange(stores.artifacts, captured.envelope, {
        kind: 'state',
        extra: true,
      } as never),
    );
  } finally {
    await stores.close();
  }
});

test('recovery conflict capture binds canonical authority scope ledger and digest', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const request = { kind: 'authority' as const, canonicalRequest: original.canonicalRequest };
    const context = {
      kind: 'fence_reply' as const,
      recoveryId: 'recover',
      ordinal: 1,
      requestDigest: original.requestDigest,
      stagedRevision: 1,
    };
    for (const change of [
      { scope: { ...runtimeScope, personId: 'other' } },
      { ledgerId: 'other' },
      { context: { ...context, requestDigest: 'b'.repeat(64) } },
      {
        request: { ...request, canonicalRequest: setup.staged.intent.canonicalRequest },
        context: { ...context, requestDigest: setup.staged.intent.requestDigest },
      },
    ]) {
      const captured = await capture(
        stores.artifacts,
        { error: 'runtime_generation_conflict' },
        { status: 409, request, context, ...change },
      );
      await rejects(
        readRecoveryExchange(stores.artifacts, captured.envelope, { kind: 'generation_conflict' }),
      );
    }
  } finally {
    await stores.close();
  }
});

test('recovery codecs preserve every claim call discriminant and reject authority guard fields', async () => {
  const stores = create();
  try {
    const setup = await prepareClaimed(stores);
    const claimIntent = {
      ...intent,
      target: {
        kind: 'claim',
        original: setup.staged.intent,
        runId: setup.run.runId,
        attemptId: setup.attempt.attemptId,
        stageCommandId: 'stage-claim',
        acceptanceCommandId: 'accept',
      },
    };
    const claimGuard = { ...(await setup.scopedGuard()), expectedRecoveryRevision: 0 };
    const beginClaim = { kind: 'claim', guard: claimGuard, intent: claimIntent };
    deepEqual(decodeRecoveryBeginCall(beginClaim), beginClaim);
    const claimCall = { kind: 'claim', guard: claimGuard, recoveryId: 'recover', input: { fence } };
    deepEqual(decodeRecoveryFenceCall(claimCall), claimCall);
    const reply = { kind: 'accepted', fence, reply: observation.reply };
    deepEqual(decodeRecoveryObservationCall({ ...claimCall, input: reply }), {
      ...claimCall,
      input: reply,
    });
    deepEqual(decodeRecoveryResolveCall({ ...resolve, kind: 'claim', guard: claimGuard }), {
      ...resolve,
      kind: 'claim',
      guard: claimGuard,
    });
    expect(() => decodeRecoveryBeginCall({ ...beginClaim, guard })).toThrow();
  } finally {
    await stores.close();
  }
});

test('recovery evidence validates envelope reference before reading matching bytes', async () => {
  const stores = create();
  try {
    const captured = await capture(stores.artifacts, state);
    const content = await stores.artifacts.readArtifact(captured.envelope);
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      readArtifact(ref) {
        return ref.digest === captured.envelope.digest
          ? Promise.resolve(content)
          : stores.artifacts.readArtifact(ref);
      },
    };
    await rejects(
      readRecoveryExchange(artifacts, { ...captured.envelope, version: 2 } as never, {
        kind: 'state',
      }),
    );
  } finally {
    await stores.close();
  }
});

test('recovery evidence rejects same-reference state value substitution', async () => {
  const stores = create();
  try {
    const captured = await capture(stores.artifacts, state);
    const changed = bytes({ ...state, basis: 'rb1:' + 'b'.repeat(64) });
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      readArtifact(ref) {
        return ref.digest === captured.bodyRef.digest
          ? Promise.resolve(changed)
          : stores.artifacts.readArtifact(ref);
      },
    };
    await rejects(
      readRecoveryExchange(artifacts, captured.envelope, { kind: 'state' }),
      /artifact integrity mismatch/,
    );
  } finally {
    await stores.close();
  }
});
