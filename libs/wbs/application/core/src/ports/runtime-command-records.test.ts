import { describe, expect, it } from 'bun:test';

import {
  parseRuntimeAuthority,
  parseRuntimeClaim,
  parseRuntimeLedger,
  parseRuntimeScope,
  parseStoredRuntimeAcceptance,
} from './runtime-command-records';

const ledger = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  authorityCount: 0,
  bindingCount: 0,
  receiptCount: 0,
};
const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
const authority = { ownerId: 'owner', generation: 1 };
const claim = {
  claimId: 'claim',
  workItemId: 'work',
  stepId: 'step',
  parentClaimId: null,
  execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
};
const receipt = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  scope,
  commandId: 'command',
  requestDigest: 'a'.repeat(64),
  actorId: 'actor',
  acceptance: { kind: 'authority', authority },
};
const stored = {
  schemaVersion: 1,
  scope,
  commandId: 'command',
  canonicalRequest: '["authority"]',
  requestDigest: 'a'.repeat(64),
  receipt,
};

describe('trusted runtime record parsers', () => {
  it('rejects absent, unreadable-shape and undeclared marker state', () => {
    for (const invalid of [
      undefined,
      null,
      '',
      {},
      { ...ledger, schemaVersion: 2 },
      { ...ledger, ledgerId: '' },
      { ...ledger, extra: true },
    ])
      expect(() => parseRuntimeLedger(invalid)).toThrow();
  });
  for (const field of ['authorityCount', 'bindingCount', 'receiptCount']) {
    it(`rejects invalid retained ${field} independently of row-count reconciliation`, () => {
      for (const invalid of [
        -1,
        0.5,
        Number.MAX_SAFE_INTEGER + 1,
        Infinity,
        NaN,
        '0',
        null,
        undefined,
      ])
        expect(() => parseRuntimeLedger({ ...ledger, [field]: invalid })).toThrow();
      expect(parseRuntimeLedger({ ...ledger, [field]: Number.MAX_SAFE_INTEGER })).toHaveProperty(
        field,
        Number.MAX_SAFE_INTEGER,
      );
    });
  }
  it('rejects invalid authority generation and owner at the trusted row boundary', () => {
    for (const generation of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, '1', null])
      expect(() => parseRuntimeAuthority({ ownerId: 'owner', generation })).toThrow();
    expect(() => parseRuntimeAuthority({ ownerId: '', generation: 1 })).toThrow();
    expect(() => parseRuntimeAuthority({ ...authority, extra: true })).toThrow();
    expect(
      parseRuntimeAuthority({ ownerId: 'owner', generation: Number.MAX_SAFE_INTEGER }),
    ).toHaveProperty('generation', Number.MAX_SAFE_INTEGER);
  });
  it('requires all opaque scope IDs without coercion', () => {
    for (const field of ['organizationId', 'projectId', 'personId'])
      for (const invalid of ['', null, undefined, 1])
        expect(() => parseRuntimeScope({ ...scope, [field]: invalid })).toThrow();
    expect(() => parseRuntimeScope({ ...scope, extra: true })).toThrow();
  });
  it('requires complete exact binding IDs and bounded session identity', () => {
    for (const field of ['claimId', 'workItemId', 'stepId'])
      for (const invalid of ['', null, undefined])
        expect(() => parseRuntimeClaim({ ...claim, [field]: invalid })).toThrow();
    for (const field of ['storeId', 'runId', 'attemptId', 'sessionId'])
      for (const invalid of ['', null, undefined])
        expect(() =>
          parseRuntimeClaim({ ...claim, execution: { ...claim.execution, [field]: invalid } }),
        ).toThrow();
    expect(() => parseRuntimeClaim({ ...claim, parentClaimId: '' })).toThrow();
    expect(() =>
      parseRuntimeClaim({
        ...claim,
        execution: { ...claim.execution, sessionId: 'x'.repeat(257) },
      }),
    ).toThrow();
    expect(() =>
      parseRuntimeClaim({ ...claim, execution: { ...claim.execution, extra: true } }),
    ).toThrow();
    expect(
      parseRuntimeClaim({
        ...claim,
        execution: { ...claim.execution, sessionId: 'x'.repeat(256) },
      }),
    ).toHaveProperty('execution.sessionId', 'x'.repeat(256));
  });
  it('rejects malformed versions, request bytes, digests and acceptance variants', () => {
    for (const field of ['commandId', 'canonicalRequest', 'requestDigest'])
      expect(() => parseStoredRuntimeAcceptance({ ...stored, [field]: '' })).toThrow();
    expect(() => parseStoredRuntimeAcceptance({ ...stored, schemaVersion: 2 })).toThrow();
    expect(() =>
      parseStoredRuntimeAcceptance({ ...stored, receipt: { ...receipt, schemaVersion: 2 } }),
    ).toThrow();
    for (const acceptance of [
      {},
      { kind: 'unknown' },
      { kind: 'claim', authority, claim, basisAfter: 'invalid' },
      {
        kind: 'write',
        authority,
        claim,
        basisAfter: `rb1:${'b'.repeat(64)}`,
        applied: [{ index: -1, kind: 'setProgress' }],
      },
      {
        kind: 'write',
        authority,
        claim,
        basisAfter: `rb1:${'b'.repeat(64)}`,
        applied: [{ index: 0, kind: 'patchProject' }],
      },
    ])
      expect(() =>
        parseStoredRuntimeAcceptance({ ...stored, receipt: { ...receipt, acceptance } }),
      ).toThrow();
    for (const field of ['ledgerId', 'actorId', 'requestDigest'])
      expect(() =>
        parseStoredRuntimeAcceptance({ ...stored, receipt: { ...receipt, [field]: '' } }),
      ).toThrow();
    expect(() =>
      parseStoredRuntimeAcceptance({ ...stored, receipt: { ...receipt, extra: true } }),
    ).toThrow();
  });
  it('requires all receipt identity repetitions to match the envelope', () => {
    expect(() =>
      parseStoredRuntimeAcceptance({ ...stored, receipt: { ...receipt, commandId: 'other' } }),
    ).toThrow('identity mismatch');
    expect(() =>
      parseStoredRuntimeAcceptance({
        ...stored,
        receipt: { ...receipt, requestDigest: 'b'.repeat(64) },
      }),
    ).toThrow('identity mismatch');
    for (const field of ['organizationId', 'projectId', 'personId'])
      expect(() =>
        parseStoredRuntimeAcceptance({
          ...stored,
          receipt: { ...receipt, scope: { ...scope, [field]: 'other' } },
        }),
      ).toThrow('identity mismatch');
  });
});
