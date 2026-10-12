import { expect, test } from 'bun:test';

import { hashCanonical } from '../evidence/content-manifest';
import { decodeIntegrationPolicy } from './integration-candidate';

const policyBody = {
  schemaVersion: 1 as const,
  checkSpecs: [
    'check.consumer',
    'check.gate',
    'check.one',
    'check.producer',
    'check.relationships',
    'check.trusted-gate',
  ].map((checkId) => ({
    checkId,
    command: ['bun', 'run', checkId === 'check.trusted-gate' ? 'check.gate' : checkId],
    cwdIdentity: 'coordinator',
    journalId: 'journal.checks',
    resourceLane: 'lane.tool-wiki',
    toolIdentity: '9'.repeat(64),
  })),
  contractRules: [
    {
      contractId: 'contract.api',
      requiredConsumers: [
        {
          implementationSelectors: [{ kind: 'path' as const, path: 'src/consumer.ts' }],
          interfaceId: 'interface.api',
        },
      ],
    },
  ],
  mappingIdentity: '2'.repeat(64),
  reviewSpecs: [
    'review.consumer',
    'review.gate',
    'review.one',
    'review.producer',
    'review.relationships',
    'review.trusted-gate',
  ].map((reviewId) => ({
    executor: {
      effort: 'high',
      model: 'astra',
      provider: 'fixture',
      toolchain: 'codex',
      version: '1',
    },
    journalId: 'journal.reviews',
    reviewId,
    trustScope: 'trusted-harness' as const,
  })),
  selectorRules: [
    {
      checks: ['check.trusted-gate'],
      kind: 'path' as const,
      path: 'gate.ts',
      reviews: ['review.trusted-gate'],
    },
    {
      checks: ['check.relationships'],
      kind: 'path' as const,
      path: 'src/consumer.ts',
      reviews: ['review.relationships'],
    },
  ],
};
const policy = { ...policyBody, policyIdentity: hashCanonical(policyBody) };

test('strict policy decoding rejects unknown selector kinds and malformed primitive fields', () => {
  const globBody = {
    ...policyBody,
    selectorRules: [{ checks: [], kind: 'glob', path: '*.ts', reviews: [] }],
  };
  expect(() =>
    decodeIntegrationPolicy({
      ...globBody,
      policyIdentity: hashCanonical(globBody),
    }),
  ).toThrow('Validation failed');
  expect(() => decodeIntegrationPolicy({ ...policy, contractRules: 'not-an-array' })).toThrow(
    'Validation failed',
  );
});
