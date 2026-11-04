import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import {
  classifyDependencyRecovery,
  decodeDependencyEvidence,
  type DependencyEvidenceBinding,
  type DependencyEvidencePayload,
  sealDependencyEvidence,
} from './dependency-evidence';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const image = `be@sha256:${'1'.repeat(64)}`;
const invocation = (role: string) => ({
  observationId: role,
  namespace: 'wbs',
  jobName: role,
  jobUid: `${role}-job`,
  podUid: `${role}-pod`,
  image,
  command: ['bun', role],
  commandSha256: hash(JSON.stringify(['bun', role])),
});
const binding: DependencyEvidenceBinding = {
  transactionId: 'attempt',
  clusterUid: 'cluster',
  namespace: 'wbs',
  pvcName: 'wbs-data',
  pvcUid: 'pvc',
  volumeName: 'volume',
  pvUid: 'pv',
  databasePath: '/data/wbs.sqlite',
  candidateImage: image,
  retainedImage: image,
  migrationCaptureSha256: '2'.repeat(64),
  candidateInvocation: invocation('candidate'),
  retainedInvocation: invocation('retained'),
};
function fixture(): DependencyEvidencePayload {
  return {
    format: 'wbs-k8s-dependency-evidence',
    version: 1,
    binding: structuredClone(binding),
    binaries: {
      candidate: { invocation: invocation('candidate'), semantics: [] },
      retained: { invocation: invocation('retained'), semantics: [] },
    },
    store: { state: 'incomplete', reason: 'not observed' },
    participants: {
      policy: {
        id: 'policy',
        revision: 'v1',
        requiredRoles: ['backend'],
        body: '{"exclusion":"unverified"}',
      },
      roster: [
        {
          id: 'backend',
          role: 'backend',
          identity: { kind: 'Deployment', uid: 'backend-uid', image },
        },
      ],
      entries: [],
      unresolved: ['backend'],
    },
    activation: { state: 'not-requested' },
    exposure: { state: 'not-started' },
  };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('test path is not an object');
  return value as Record<string, unknown>;
}
function change(payload: unknown, path: string, replacement: unknown): unknown {
  const cloned: unknown = JSON.parse(JSON.stringify(payload));
  const keys = path.split('.');
  let parent = record(cloned);
  for (const key of keys.slice(0, -1)) parent = record(parent[key]);
  const key = keys.at(-1);
  if (key === undefined) throw new Error('empty test path');
  if (replacement === undefined) Reflect.deleteProperty(parent, key);
  else parent[key] = replacement;
  return cloned;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function receipt(payload: DependencyEvidencePayload) {
  return {
    protocol: 'wbs-dependency-activation' as const,
    version: 1 as const,
    activationId: binding.transactionId,
    databaseIdentity: binding.databasePath,
    candidateImage: image,
    rollbackImage: image,
    participantProofSha256: hash(canonical(payload.participants)),
    migrationCaptureSha256: binding.migrationCaptureSha256,
    activatedAt: 42,
  };
}
function intent(): DependencyEvidencePayload {
  const payload = fixture();
  return { ...payload, activation: { state: 'durable-intent', receipt: receipt(payload) } };
}
function confirmed(): DependencyEvidencePayload {
  const payload = fixture();
  const exactReceipt = receipt(payload);
  return {
    ...payload,
    activation: {
      state: 'confirmed',
      receipt: exactReceipt,
      command: { invocation: invocation('activate'), receipt: exactReceipt },
      readback: { invocation: invocation('readback'), receipt: exactReceipt },
    },
  };
}
function observed(): DependencyEvidencePayload {
  return {
    ...fixture(),
    store: {
      state: 'observed',
      stage: 'pre-migration',
      interval: { id: 'B2-interval', ownershipSha256: 'a'.repeat(64), startedAt: 1, observedAt: 2 },
      source: structuredClone(binding),
      invocation: invocation('store'),
      authority: {
        protocol: 'wbs-dependency-preservation',
        version: 1,
        state: 'DISABLED',
        externalRelationships: 0,
      },
      receipt: { state: 'absent' },
    },
  };
}

test('round trips exact bytes and equal-image independent invocations without granting rollback', () => {
  const envelope = sealDependencyEvidence(fixture(), binding);
  expect(decodeDependencyEvidence(envelope, binding)).toEqual(envelope);
  expect(classifyDependencyRecovery({ state: 'available', evidence: envelope }, binding)).toBe(
    'requires-dormant-admission',
  );
  for (const state of ['lost', 'uncertain'] as const)
    expect(classifyDependencyRecovery({ state, reason: 'checkpoint absent' }, binding)).toBe(
      'requires-attended-recovery',
    );
});
for (const [path, replacement] of [
  ['extra', true],
  ['format', 'foreign'],
  ['version', 2],
  ['binding.pvcUid', 'foreign'],
  ['binding.pvUid', 'foreign'],
  ['binding.volumeName', 'foreign'],
  ['binding.transactionId', 'foreign'],
  ['binding.databasePath', '/foreign'],
  ['binding.clusterUid', 'foreign'],
  ['binding.candidateImage', `be@sha256:${'3'.repeat(64)}`],
  ['activation', null],
  ['exposure', undefined],
  ['store', null],
  ['binaries.candidate.invocation', invocation('retained')],
  ['binaries.candidate.invocation.command', ['bun', 'foreign']],
  ['binaries.retained.invocation.podUid', 'foreign'],
  ['binaries.candidate.semantics', ['unknown']],
  [
    'binaries.candidate.semantics',
    ['cross-project-dependencies-v1', 'cross-project-dependencies-v1'],
  ],
  ['participants.unresolved', []],
  ['participants.roster', []],
  [
    'participants.entries',
    [
      {
        participantId: 'foreign',
        identity: { kind: 'Deployment', uid: 'x', image },
        claim: 'fenced',
        proof: { source: 'claim', bytes: '{}', sha256: hash('{}') },
      },
    ],
  ],
  ['binding.pvcUid', ''],
  ['binding.migrationCaptureSha256', 'invalid'],
  ['binding.candidateImage', 'unpinned'],
] as const)
  test(`rejects resealed malformed or foreign ${path}: ${JSON.stringify(replacement)}`, () => {
    expect(() => sealDependencyEvidence(change(fixture(), path, replacement), binding)).toThrow();
  });

test('rejects modified bytes, digest, projection and noncanonical payload bytes', () => {
  const envelope = sealDependencyEvidence(fixture(), binding);
  for (const malformed of [
    { ...envelope, bytes: envelope.bytes + ' ' },
    { ...envelope, sha256: '0'.repeat(64) },
    { ...envelope, payload: change(fixture(), 'store.reason', 'altered') },
    {
      ...envelope,
      bytes: JSON.stringify(envelope.payload),
      sha256: hash(JSON.stringify(envelope.payload)),
    },
    { ...envelope, extra: true },
    null,
    { ...envelope, bytes: 'not JSON' },
  ])
    expect(() => decodeDependencyEvidence(malformed, binding)).toThrow();
  expect(() =>
    classifyDependencyRecovery({ state: 'available', evidence: null }, binding),
  ).toThrow();
});
test('durable intent survives crash without command completion and requires attendance', () => {
  for (const payload of [
    intent(),
    confirmed(),
    {
      ...fixture(),
      exposure: { state: 'durable-intent', intentId: 'start', candidateImage: image },
    },
    {
      ...fixture(),
      exposure: {
        state: 'confirmed',
        intentId: 'start',
        candidateImage: image,
        invocation: invocation('start'),
      },
    },
  ])
    expect(
      classifyDependencyRecovery(
        { state: 'available', evidence: sealDependencyEvidence(payload, binding) },
        binding,
      ),
    ).toBe('requires-attended-recovery');
});
for (const field of [
  'protocol',
  'version',
  'activationId',
  'databaseIdentity',
  'candidateImage',
  'rollbackImage',
  'participantProofSha256',
  'migrationCaptureSha256',
  'activatedAt',
])
  test(`refuses missing activation receipt binding ${field}`, () => {
    expect(() =>
      sealDependencyEvidence(change(intent(), `activation.receipt.${field}`, undefined), binding),
    ).toThrow();
  });
for (const [field, replacement] of [
  ['protocol', 'foreign'],
  ['version', 2],
  ['activationId', 'foreign'],
  ['databaseIdentity', 'foreign'],
  ['candidateImage', `be@sha256:${'f'.repeat(64)}`],
  ['rollbackImage', `be@sha256:${'f'.repeat(64)}`],
  ['participantProofSha256', 'f'.repeat(64)],
  ['migrationCaptureSha256', 'f'.repeat(64)],
  ['activatedAt', -1],
  ['activatedAt', 0.5],
] as const)
  test(`refuses foreign activation receipt binding ${field}: ${String(replacement)}`, () => {
    expect(() =>
      sealDependencyEvidence(change(intent(), `activation.receipt.${field}`, replacement), binding),
    ).toThrow();
  });

test('confirmation requires separate command and independent exact readback invocations', () => {
  const payload = confirmed();
  expect(sealDependencyEvidence(payload, binding).payload.activation.state).toBe('confirmed');
  for (const [path, replacement] of [
    ['activation.command', undefined],
    ['activation.readback', undefined],
    ['activation.readback.invocation', invocation('activate')],
    ['activation.readback.receipt.activatedAt', 43],
    ['activation.command.receipt.activatedAt', 43],
    ['activation.readback.invocation.image', `be@sha256:${'f'.repeat(64)}`],
    ['activation.readback.invocation.commandSha256', 'f'.repeat(64)],
  ] as const)
    expect(() => sealDependencyEvidence(change(payload, path, replacement), binding)).toThrow();
});
test('preserves observed store stage, interval, exact source, authority and absent receipt', () => {
  const payload = observed();
  expect(
    decodeDependencyEvidence(sealDependencyEvidence(payload, binding), binding).payload.store,
  ).toEqual(payload.store);
  for (const [path, replacement] of [
    ['store.stage', 'unknown'],
    ['store.interval.observedAt', 0],
    ['store.interval.ownershipSha256', 'invalid'],
    ['store.source.pvcUid', 'foreign'],
    ['store.authority.state', 'ENABLED'],
    ['store.authority.externalRelationships', 1],
    ['store.receipt', null],
    ['store.invocation.namespace', 'foreign'],
  ] as const)
    expect(() => sealDependencyEvidence(change(payload, path, replacement), binding)).toThrow();
});
test('preserves complete participant claim body while checking roster and obligations structurally', () => {
  const payload = fixture();
  const identity = { kind: 'Deployment', uid: 'backend-uid', image };
  payload.participants.entries = [
    {
      participantId: 'backend',
      identity,
      claim: 'fenced',
      proof: {
        source: 'operator-claim',
        bytes: '{"full":"unverified claim"}',
        sha256: hash('{"full":"unverified claim"}'),
      },
    },
  ];
  payload.participants.unresolved = [];
  expect(sealDependencyEvidence(payload, binding).payload.participants).toEqual(
    payload.participants,
  );
  for (const [path, replacement] of [
    ['participants.roster', [...payload.participants.roster, ...payload.participants.roster]],
    ['participants.entries', [...payload.participants.entries, ...payload.participants.entries]],
    ['participants.entries.0.identity.uid', 'foreign'],
    ['participants.entries.0.proof.sha256', '0'.repeat(64)],
    ['participants.unresolved', ['foreign']],
    ['participants.entries.0.claim', 'unresolved'],
    ['participants.roster.0.role', 'foreign'],
  ] as const)
    expect(() => sealDependencyEvidence(change(payload, path, replacement), binding)).toThrow();
});

for (const field of ['store', 'participants', 'activation', 'exposure', 'binaries'])
  test(`missing ${field} never derives dormant progress`, () => {
    expect(() => sealDependencyEvidence(change(fixture(), field, undefined), binding)).toThrow();
  });
for (const field of ['observationId', 'jobName', 'jobUid', 'podUid'])
  test(`equal-digest invocations still need separate ${field}`, () => {
    const payload = fixture();
    const candidate = payload.binaries.candidate.invocation;
    const retained = {
      ...payload.binaries.retained.invocation,
      [field]: candidate[field as keyof typeof candidate],
    };
    const expected = { ...binding, retainedInvocation: retained };
    expect(() =>
      sealDependencyEvidence(
        {
          ...payload,
          binding: expected,
          binaries: {
            ...payload.binaries,
            retained: { ...payload.binaries.retained, invocation: retained },
          },
        },
        expected,
      ),
    ).toThrow();
  });
test('rejects empty invocation commands even with consistent command hash and pinned binding', () => {
  const payload = fixture();
  const candidate = {
    ...payload.binaries.candidate.invocation,
    command: [],
    commandSha256: hash('[]'),
  };
  const expected = { ...binding, candidateInvocation: candidate };
  expect(() =>
    sealDependencyEvidence(
      {
        ...payload,
        binding: expected,
        binaries: {
          ...payload.binaries,
          candidate: { ...payload.binaries.candidate, invocation: candidate },
        },
      },
      expected,
    ),
  ).toThrow();
});
for (const field of [
  'protocol',
  'version',
  'activationId',
  'databaseIdentity',
  'candidateImage',
  'rollbackImage',
  'participantProofSha256',
  'migrationCaptureSha256',
  'activatedAt',
])
  test(`confirmation compares independent receipt ${field}`, () => {
    const replacement =
      field === 'version'
        ? 2
        : field === 'activatedAt'
          ? 43
          : field.endsWith('Sha256')
            ? 'f'.repeat(64)
            : field.endsWith('Image')
              ? `be@sha256:${'f'.repeat(64)}`
              : 'foreign';
    for (const observation of ['command', 'readback'])
      expect(() =>
        sealDependencyEvidence(
          change(confirmed(), `activation.${observation}.receipt.${field}`, replacement),
          binding,
        ),
      ).toThrow();
  });

test('names malformed boundary failures rather than incidental JavaScript exceptions', () => {
  expect(() => sealDependencyEvidence(null, binding)).toThrow('object required');
  expect(() =>
    sealDependencyEvidence(change(fixture(), 'binaries.candidate.semantics', null), binding),
  ).toThrow('array required');
  expect(() => sealDependencyEvidence(change(fixture(), 'store.reason', ''), binding)).toThrow(
    'nonempty text required',
  );
  expect(() =>
    sealDependencyEvidence(
      change(fixture(), 'participants.roster.0.identity.image', 'unpinned'),
      binding,
    ),
  ).toThrow('digest image required');
});

test('refuses an additional foreign-role roster claim independently of required-role coverage', () => {
  const payload = fixture();
  payload.participants.roster.push({
    id: 'foreign',
    role: 'unknown',
    identity: { kind: 'Deployment', uid: 'foreign', image },
  });
  payload.participants.unresolved.push('foreign');
  expect(() => sealDependencyEvidence(payload, binding)).toThrow('foreign participant role');
});

test('refuses missing required-role coverage independently of known roster obligations', () => {
  const payload = fixture();
  payload.participants.policy.requiredRoles.push('gateway');
  expect(() => sealDependencyEvidence(payload, binding)).toThrow('missing policy role');
});

test('names foreign participant claims before inspecting an absent roster member', () => {
  const payload = fixture();
  payload.participants.entries.push({
    participantId: 'foreign',
    identity: { kind: 'Deployment', uid: 'foreign', image },
    claim: 'unresolved',
    proof: { source: 'claim', bytes: '{}', sha256: hash('{}') },
  });
  expect(() => sealDependencyEvidence(payload, binding)).toThrow('foreign participant claim');
});

for (const path of [
  'binaries.candidate.semantics',
  'binaries.candidate.invocation.command',
  'participants.policy.requiredRoles',
  'participants.roster',
  'participants.entries',
  'participants.unresolved',
]) {
  test(`refuses sparse ${path} without losing its slot during decoding`, () => {
    const malformed = change(fixture(), path, new Array<unknown>(1));
    expect(() => sealDependencyEvidence(malformed, binding)).toThrow('dense array required');
    const envelope = sealDependencyEvidence(fixture(), binding);
    expect(() => decodeDependencyEvidence({ ...envelope, payload: malformed }, binding)).toThrow(
      'dense array required',
    );
  });
}
