/* eslint-disable @typescript-eslint/no-unsafe-member-access -- JSON fault fixtures validate malformed external envelopes. */
import { expect, test } from 'bun:test';

import { assertStorageOwnership, sealStorageOwnership } from './storage-ownership';

const storage = {
  namespace: 'wbs',
  pvcName: 'wbs-data',
  pvcUid: 'pvc-1',
  volumeName: 'disk',
  pvUid: 'pv-1',
  databasePath: '/data/wbs.sqlite',
} as const;
const identity = {
  transactionId: 'transaction-1',
  clusterUid: 'cluster-1',
  namespace: 'wbs',
  storage,
  flux: { namespace: 'flux-system', kustomization: 'release' },
};
function prepared() {
  return sealStorageOwnership(
    identity,
    {
      fluxUid: 'flux-1',
      owner: {
        kind: 'CronJob',
        name: 'sqlite-backup',
        uid: 'backup-1',
        resourceVersion: '7',
        templateSha256: 'a'.repeat(64),
        suspension: { kind: 'absent' },
      },
    },
    'ownership-token',
  );
}
test('preserves absent false and true suspension distinctly', () => {
  const original = prepared();
  for (const suspension of [
    { kind: 'absent' },
    { kind: 'present', value: false },
    { kind: 'present', value: true },
  ] as const) {
    const record = sealStorageOwnership(
      identity,
      { fluxUid: 'flux-1', owner: { ...original.owner, suspension } },
      'token',
    );
    expect(JSON.parse(record.bytes).owner.suspension).toEqual(suspension);
    expect(record.disposition).toBe(
      suspension.kind === 'present' && suspension.value ? 'already-suspended' : 'suspend-requested',
    );
    expect(() => {
      assertStorageOwnership(JSON.parse(JSON.stringify(record)), identity);
    }).not.toThrow();
  }
});
test('rejects altered ownership bytes and envelope', () => {
  const record = prepared();
  expect(() => {
    assertStorageOwnership({ ...record, bytes: record.bytes + ' ' }, identity);
  }).toThrow();
  expect(() => {
    assertStorageOwnership({ ...record, token: 'foreign' }, identity);
  }).toThrow();
  expect(() => {
    assertStorageOwnership({ ...record, sha256: 'b'.repeat(64) }, identity);
  }).toThrow();
});
for (const [name, change] of Object.entries({
  transaction: { transactionId: 'foreign' },
  cluster: { clusterUid: 'foreign' },
  namespace: { namespace: 'foreign' },
  pvc: { storage: { ...storage, pvcUid: 'foreign' } },
  flux: { flux: null },
}))
  test(`rejects ownership from a different ${name}`, () => {
    expect(() => {
      assertStorageOwnership(prepared(), { ...identity, ...change });
    }).toThrow();
  });
function canonicalBytes(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalBytes).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalBytes(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const faults: Record<string, (record: ReturnType<typeof prepared>) => unknown> = {
  'unsupported format': (record) => ({ ...record, format: 'foreign' }),
  'unsupported version': (record) => ({ ...record, version: 2 }),
  'foreign PVC name': (record) => ({
    ...record,
    storage: { ...record.storage, pvcName: 'foreign' },
  }),
  'foreign database path': (record) => ({
    ...record,
    storage: { ...record.storage, databasePath: '/other' },
  }),
  'foreign storage namespace': (record) => ({
    ...record,
    storage: { ...record.storage, namespace: 'foreign' },
  }),
  'empty Flux name': (record) => ({
    ...record,
    flux: { namespace: 'flux-system', kustomization: '' },
  }),
  'unknown field': (record) => ({ ...record, unexpected: true }),
  'unsupported stage': (record) => ({ ...record, stage: 'suspended' }),
  'foreign controller': (record) => ({ ...record, owner: { ...record.owner, name: 'foreign' } }),
  'missing owner UID': (record) => ({ ...record, owner: { ...record.owner, uid: '' } }),
  'invalid suspension': (record) => ({
    ...record,
    owner: { ...record.owner, suspension: { kind: 'present', value: 0 } },
  }),
  'unknown suspension field': (record) => ({
    ...record,
    owner: { ...record.owner, suspension: { kind: 'absent', value: false } },
  }),
  'invalid template hash': (record) => ({
    ...record,
    owner: { ...record.owner, templateSha256: 'no' },
  }),
  'inconsistent disposition': (record) => ({ ...record, disposition: 'already-suspended' }),
  'missing Flux UID': (record) => ({ ...record, fluxUid: null }),
};
for (const [name, corrupt] of Object.entries(faults))
  test(`rejects ${name} even with resealed bytes`, () => {
    const envelope = corrupt(prepared()) as Record<string, unknown>;
    const { bytes: _bytes, sha256: _sha256, ...payload } = envelope;
    envelope['bytes'] = canonicalBytes(payload);
    envelope['sha256'] = new Bun.CryptoHasher('sha256')
      .update(envelope['bytes'] as string)
      .digest('hex');
    expect(() => {
      assertStorageOwnership(envelope, identity);
    }).toThrow();
  });

test('rejects unknown envelope fields without changing original bytes', () => {
  expect(() => {
    assertStorageOwnership({ ...prepared(), unexpected: true }, identity);
  }).toThrow();
});

test('malformed envelope identifies the trusted-state boundary', () => {
  expect(() => {
    assertStorageOwnership(null, identity);
  }).toThrow('malformed storage ownership object');
});
test('rejects a namespace inconsistent with its own storage even when caller repeats it', () => {
  const record = prepared();
  const altered = { ...record, storage: { ...record.storage, namespace: 'foreign' } };
  const { bytes: _bytes, sha256: _sha256, ...payload } = altered;
  altered.bytes = canonicalBytes(payload);
  altered.sha256 = new Bun.CryptoHasher('sha256').update(altered.bytes).digest('hex');
  expect(() => {
    assertStorageOwnership(altered, { ...identity, storage: altered.storage });
  }).toThrow();
});

test('malformed suspension identifies its trusted-state boundary', () => {
  const record = prepared();
  const altered = { ...record, owner: { ...record.owner, suspension: null } };
  const { bytes: _bytes, sha256: _sha256, ...payload } = altered;
  altered.bytes = canonicalBytes(payload);
  altered.sha256 = new Bun.CryptoHasher('sha256').update(altered.bytes).digest('hex');
  expect(() => {
    assertStorageOwnership(altered, identity);
  }).toThrow('malformed storage ownership suspension');
});
test('missing in-memory field identifies its canonical boundary', () => {
  const record = prepared();
  expect(() => {
    assertStorageOwnership({ ...record, token: undefined }, identity);
  }).toThrow('missing storage ownership field');
});
