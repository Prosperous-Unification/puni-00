import { describe, expect, it } from 'bun:test';

import {
  matchesRuntimeClaim,
  matchesRuntimeReceipt,
  matchesRuntimeScope,
  type RuntimeClaim,
  type RuntimeClaimRequest,
  type RuntimeOperation,
  type RuntimeReceipt,
  type RuntimeWriteRequest,
} from './index';

const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
const authority = { ownerId: 'owner', generation: 4 };
const execution = { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' };
const claim: RuntimeClaim = {
  claimId: 'receiver-generated',
  workItemId: 'leaf',
  stepId: 'dev',
  parentClaimId: null,
  execution,
};
const common = { schemaVersion: 1 as const, commandId: 'command', expectedLedgerId: 'ledger' };
const acquisition = {
  ...common,
  kind: 'authority' as const,
  ownerId: 'owner',
  expectedGeneration: 3,
};
const request: RuntimeClaimRequest = {
  ...common,
  authority,
  expectedBasis: 'rb1:' + 'a'.repeat(64),
  action: { kind: 'claim', workItemId: 'leaf', stepId: 'dev', parentClaimId: null, execution },
};
const write: RuntimeWriteRequest = {
  ...request,
  action: {
    kind: 'write',
    claim,
    commands: [
      { kind: 'setMeasure', workItemId: 'leaf', stepId: 'dev', metric: 'token_actual', value: 0 },
      { kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' },
    ],
  },
};
const digest = 'b'.repeat(64);
const envelope = {
  schemaVersion: 1 as const,
  ledgerId: 'ledger',
  scope,
  commandId: 'command',
  requestDigest: digest,
  actorId: 'account-distinct-from-person',
};
const authorityReceipt: RuntimeReceipt = {
  ...envelope,
  acceptance: { kind: 'authority', authority },
};
const claimReceipt = {
  ...envelope,
  acceptance: { kind: 'claim' as const, authority, claim, basisAfter: request.expectedBasis },
};
const writeReceipt = {
  ...envelope,
  acceptance: {
    kind: 'write' as const,
    authority,
    claim,
    basisAfter: request.expectedBasis,
    applied: [
      { index: 0, kind: 'setMeasure' as const },
      { index: 1, kind: 'setProgress' as const },
    ],
  },
};
const claimMismatches: readonly (readonly [string, RuntimeClaim])[] = [
  ['claimId', { ...claim, claimId: 'other' }],
  ['workItemId', { ...claim, workItemId: 'other' }],
  ['stepId', { ...claim, stepId: 'other' }],
  ['parentClaimId', { ...claim, parentClaimId: 'other' }],
  ...(['storeId', 'runId', 'attemptId', 'sessionId'] as const).map(
    (field) => [field, { ...claim, execution: { ...execution, [field]: 'other' } }] as const,
  ),
];

describe('public runtime receipt correspondence', () => {
  it.each([
    [acquisition, authorityReceipt],
    [
      { ...acquisition, expectedGeneration: null },
      {
        ...authorityReceipt,
        acceptance: { kind: 'authority', authority: { ownerId: 'owner', generation: 1 } },
      },
    ],
    [request, claimReceipt],
    [write, writeReceipt],
  ] satisfies readonly (readonly [RuntimeOperation, RuntimeReceipt])[])(
    'matches complete authority, receiver-generated claim and ordered write %#',
    (operation, receipt) => {
      const before = structuredClone({ scope, operation, receipt });
      expect(matchesRuntimeReceipt(scope, operation, digest, receipt)).toBe(true);
      expect({ scope, operation, receipt }).toEqual(before);
    },
  );
  it('matches detached scope and claim values', () => {
    expect(matchesRuntimeScope(scope, { ...scope })).toBe(true);
    expect(matchesRuntimeClaim(claim, structuredClone(claim))).toBe(true);
  });
  it.each(['organizationId', 'projectId', 'personId'] as const)(
    'rejects independent scope %s mismatch',
    (field) => {
      const changed = { ...scope, [field]: 'other' };
      expect(
        matchesRuntimeReceipt(scope, acquisition, digest, { ...authorityReceipt, scope: changed }),
      ).toBe(false);
      expect(matchesRuntimeScope(scope, changed)).toBe(false);
    },
  );
  it.each(['ledgerId', 'commandId', 'requestDigest'] as const)(
    'rejects independent metadata %s mismatch',
    (field) => {
      expect(
        matchesRuntimeReceipt(scope, acquisition, digest, {
          ...authorityReceipt,
          [field]: field === 'requestDigest' ? 'c'.repeat(64) : 'other',
        }),
      ).toBe(false);
    },
  );
  it.each([
    { kind: 'authority' as const, authority: { ownerId: 'other', generation: 4 } },
    { kind: 'authority' as const, authority: { ownerId: 'owner', generation: 3 } },
    claimReceipt.acceptance,
  ])('rejects acquisition acceptance mismatch %#', (acceptance) => {
    expect(matchesRuntimeReceipt(scope, acquisition, digest, { ...envelope, acceptance })).toBe(
      false,
    );
  });
  it('rejects wrong first generation for an uninitialized authority', () => {
    expect(
      matchesRuntimeReceipt(
        scope,
        { ...acquisition, expectedGeneration: null },
        digest,
        authorityReceipt,
      ),
    ).toBe(false);
  });
  it.each([request, write])(
    'rejects command acceptance kind and authority mismatches %#',
    (operation) => {
      const receipt = operation.action.kind === 'claim' ? claimReceipt : writeReceipt;
      for (const acceptance of [
        authorityReceipt.acceptance,
        { ...receipt.acceptance, authority: { ownerId: 'other', generation: 4 } },
        { ...receipt.acceptance, authority: { ownerId: 'owner', generation: 5 } },
        operation.action.kind === 'claim' ? writeReceipt.acceptance : claimReceipt.acceptance,
      ])
        expect(matchesRuntimeReceipt(scope, operation, digest, { ...envelope, acceptance })).toBe(
          false,
        );
    },
  );
  it.each(claimMismatches)('rejects immutable claim %s mismatch', (_field, changed) => {
    expect(matchesRuntimeClaim(claim, changed)).toBe(false);
    expect(
      matchesRuntimeReceipt(scope, write, digest, {
        ...writeReceipt,
        acceptance: { ...writeReceipt.acceptance, claim: changed },
      }),
    ).toBe(false);
  });
  it.each(claimMismatches.filter(([field]) => field !== 'claimId'))(
    'rejects request-known claim %s mismatch',
    (_field, changed) => {
      expect(
        matchesRuntimeReceipt(scope, request, digest, {
          ...claimReceipt,
          acceptance: { ...claimReceipt.acceptance, claim: changed },
        }),
      ).toBe(false);
    },
  );
  it.each([
    [{ index: 0, kind: 'setMeasure' as const }],
    [...writeReceipt.acceptance.applied, { index: 2, kind: 'setProgress' as const }],
    [
      { index: 1, kind: 'setMeasure' as const },
      { index: 1, kind: 'setProgress' as const },
    ],
    [
      { index: 0, kind: 'setMeasure' as const },
      { index: 0, kind: 'setProgress' as const },
    ],
    [
      { index: 0, kind: 'setProgress' as const },
      { index: 1, kind: 'setProgress' as const },
    ],
    [
      { index: 0, kind: 'setMeasure' as const },
      { index: 1, kind: 'setMeasure' as const },
    ],
  ])('rejects write applied length, index or kind mismatch %#', (...applied) => {
    expect(
      matchesRuntimeReceipt(scope, write, digest, {
        ...writeReceipt,
        acceptance: { ...writeReceipt.acceptance, applied },
      }),
    ).toBe(false);
  });
});
