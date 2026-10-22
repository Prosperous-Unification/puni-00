import { expect, it } from 'bun:test';

import { parseDependencyReceipt } from './dependency-runtime';

const receipt = {
  protocol: 'wbs-dependency-activation',
  version: 1,
  activationId: 'attempt',
  databaseIdentity: 'db',
  candidateImage: `wbs@sha256:${'a'.repeat(64)}`,
  rollbackImage: `wbs@sha256:${'b'.repeat(64)}`,
  participantProofSha256: 'c'.repeat(64),
  migrationCaptureSha256: 'd'.repeat(64),
  activatedAt: 1,
} as const;
it('accepts exact attributed receipt', () => {
  expect(parseDependencyReceipt(receipt)).toEqual(receipt);
});
for (const [field, value] of [
  ['protocol', 'wrong'],
  ['version', 2],
  ['version', true],
  ['activationId', ' '],
  ['databaseIdentity', ''],
  ['candidateImage', 'wbs:latest'],
  ['rollbackImage', 'wbs:latest'],
  ['participantProofSha256', 'xyz'],
  ['migrationCaptureSha256', 'xyz'],
  ['activatedAt', -1],
  ['activatedAt', 1.5],
  ['activatedAt', Number.MAX_SAFE_INTEGER + 1],
  ['extra', 1],
] as const) {
  it(`refuses receipt ${field}=${String(value)}`, () => {
    expect(() => parseDependencyReceipt({ ...receipt, [field]: value })).toThrow(
      'invalid dependency activation receipt',
    );
  });
}
for (const absent of Object.keys(receipt)) {
  it(`refuses absent ${absent}`, () => {
    expect(() =>
      parseDependencyReceipt(
        Object.fromEntries(Object.entries(receipt).filter(([field]) => field !== absent)),
      ),
    ).toThrow();
  });
}
for (const malformed of [null, [], true, 1, 'receipt', {}]) {
  it(`refuses malformed receipt ${JSON.stringify(malformed)}`, () => {
    expect(() => parseDependencyReceipt(malformed)).toThrow();
  });
}
