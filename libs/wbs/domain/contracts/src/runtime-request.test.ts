import { describe, expect, it } from 'bun:test';

import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  parseRuntimeAuthorityRequest,
  parseRuntimeClaimRequest,
  parseRuntimeLookup,
  parseRuntimeStateRequest,
  parseRuntimeWriteRequest,
} from './index';

const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
const authority = { ownerId: 'owner', generation: 1 };
const execution = { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' };
const common = { schemaVersion: 1 as const, commandId: 'command', expectedLedgerId: 'ledger' };
const acquisition = {
  ...common,
  kind: 'authority' as const,
  ownerId: 'owner',
  expectedGeneration: null,
};
const claim = {
  ...common,
  authority,
  expectedBasis: 'rb1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  action: {
    kind: 'claim' as const,
    workItemId: 'leaf',
    stepId: 'dev',
    parentClaimId: null,
    execution,
  },
};
const write = {
  ...claim,
  action: {
    kind: 'write' as const,
    claim: { claimId: 'claim', workItemId: 'leaf', stepId: 'dev', parentClaimId: null, execution },
    commands: [
      {
        kind: 'setMeasure' as const,
        workItemId: 'leaf',
        stepId: 'dev',
        metric: 'token_actual' as const,
        value: 0,
      },
      {
        kind: 'patchWorkItem' as const,
        workItemId: 'leaf',
        patch: {
          externalRefs: [
            { systemId: 'git', url: 'first', name: 'One' },
            { systemId: 'git', url: 'second' },
          ],
        },
      },
      { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
      {
        kind: 'releaseWorkItem' as const,
        workItemId: 'leaf',
        personId: 'person',
        steps: ['dev', 'review'],
      },
    ],
  },
};
const authorityBytes =
  '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"org","projectId":"project","personId":"person"},"commandId":"command","operation":{"kind":"authority","ownerId":"owner","expectedGeneration":null}}';
const claimBytes =
  '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"org","projectId":"project","personId":"person"},"commandId":"command","operation":{"kind":"claim","authority":{"ownerId":"owner","generation":1},"expectedBasis":"rb1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","action":{"kind":"claim","workItemId":"leaf","stepId":"dev","parentClaimId":null,"execution":{"storeId":"store","runId":"run","attemptId":"attempt","sessionId":"session"}}}}';
const writeBytes =
  '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"org","projectId":"project","personId":"person"},"commandId":"command","operation":{"kind":"write","authority":{"ownerId":"owner","generation":1},"expectedBasis":"rb1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","action":{"kind":"write","claim":{"claimId":"claim","workItemId":"leaf","stepId":"dev","parentClaimId":null,"execution":{"storeId":"store","runId":"run","attemptId":"attempt","sessionId":"session"}},"commands":[{"kind":"setMeasure","workItemId":"leaf","stepId":"dev","metric":"token_actual","value":0},{"kind":"patchWorkItem","workItemId":"leaf","patch":{"externalRefs":[{"systemId":"git","url":"first","name":"One"},{"systemId":"git","url":"second"}]}},{"kind":"setProgress","workItemId":"leaf","stepId":"dev","state":"done"},{"kind":"releaseWorkItem","workItemId":"leaf","personId":"person","steps":["dev","review"]}]}}}';

describe('public runtime request identity', () => {
  it.each([
    [acquisition, authorityBytes],
    [claim, claimBytes],
    [write, writeBytes],
  ] as const)('preserves independent version 1 literal bytes %#', (operation, bytes) => {
    expect(canonicalRuntimeRequest(scope, operation)).toBe(bytes);
    expect(parseCanonicalRuntimeRequest(bytes)).toEqual({ scope, operation });
  });
  it('normalizes caller key order at every nested identity without changing ordered content', () => {
    expect(
      canonicalRuntimeRequest(
        { personId: 'person', projectId: 'project', organizationId: 'org' },
        {
          action: {
            execution: {
              sessionId: 'session',
              attemptId: 'attempt',
              runId: 'run',
              storeId: 'store',
            },
            parentClaimId: null,
            stepId: 'dev',
            workItemId: 'leaf',
            kind: 'claim',
          },
          expectedBasis: claim.expectedBasis,
          authority: { generation: 1, ownerId: 'owner' },
          expectedLedgerId: 'ledger',
          commandId: 'command',
          schemaVersion: 1,
        },
      ),
    ).toBe(claimBytes);
    expect(
      canonicalRuntimeRequest(scope, {
        ...write,
        action: { ...write.action, commands: [...write.action.commands].reverse() },
      }),
    ).not.toBe(writeBytes);
    expect(
      canonicalRuntimeRequest(scope, {
        ...write,
        action: {
          ...write.action,
          commands: [
            write.action.commands[0],
            {
              kind: 'patchWorkItem',
              workItemId: 'leaf',
              patch: {
                externalRefs: [
                  { systemId: 'git', url: 'second' },
                  { systemId: 'git', url: 'first', name: 'One' },
                ],
              },
            },
            write.action.commands[2],
            write.action.commands[3],
          ],
        },
      }),
    ).not.toBe(writeBytes);
  });
  it('normalizes shuffled authority and ordered write keys to the literal fixtures', () => {
    expect(
      canonicalRuntimeRequest(scope, {
        expectedGeneration: null,
        ownerId: 'owner',
        kind: 'authority',
        expectedLedgerId: 'ledger',
        commandId: 'command',
        schemaVersion: 1,
      }),
    ).toBe(authorityBytes);
    expect(
      canonicalRuntimeRequest(scope, {
        action: {
          commands: [
            {
              value: 0,
              metric: 'token_actual',
              stepId: 'dev',
              workItemId: 'leaf',
              kind: 'setMeasure',
            },
            {
              patch: {
                externalRefs: [
                  { name: 'One', url: 'first', systemId: 'git' },
                  { url: 'second', systemId: 'git' },
                ],
              },
              workItemId: 'leaf',
              kind: 'patchWorkItem',
            },
            { state: 'done', stepId: 'dev', workItemId: 'leaf', kind: 'setProgress' },
            {
              steps: ['dev', 'review'],
              personId: 'person',
              workItemId: 'leaf',
              kind: 'releaseWorkItem',
            },
          ],
          claim: {
            execution: {
              sessionId: 'session',
              attemptId: 'attempt',
              runId: 'run',
              storeId: 'store',
            },
            parentClaimId: null,
            stepId: 'dev',
            workItemId: 'leaf',
            claimId: 'claim',
          },
          kind: 'write',
        },
        expectedBasis: claim.expectedBasis,
        authority: { generation: 1, ownerId: 'owner' },
        expectedLedgerId: 'ledger',
        commandId: 'command',
        schemaVersion: 1,
      }),
    ).toBe(writeBytes);
  });
  it.each([
    authorityBytes + ' ',
    claimBytes.replace('"kind":"claim"', '"kind":"write"'),
    writeBytes.replace('"value":0', '"value":0.0'),
    authorityBytes.replace('"schemaVersion":1', '"schemaVersion":2'),
    authorityBytes.replace('"ownerId":"owner"', '"ownerId":"owner","extra":true'),
    claimBytes.replace('"sessionId":"session"', '"sessionId":""'),
    '{',
  ])('rejects noncanonical or malformed stored bytes %#', (bytes) => {
    expect(() => parseCanonicalRuntimeRequest(bytes)).toThrow();
  });
  it('exposes strict acquisition, lookup and discovery parsers', () => {
    const request = { ...common, ownerId: 'owner', expectedGeneration: null };
    expect(parseRuntimeAuthorityRequest(request)).toEqual(request);
    expect(() => parseRuntimeAuthorityRequest({ ...request, personId: 'person' })).toThrow();
    expect(parseRuntimeLookup({ commandId: 'command', expectedLedgerId: 'ledger' })).toEqual({
      commandId: 'command',
      expectedLedgerId: 'ledger',
    });
    expect(() => parseRuntimeLookup({ commandId: 'command' })).toThrow();
    expect(parseRuntimeStateRequest({})).toEqual({});
    expect(() => parseRuntimeStateRequest({ expectedLedgerId: null })).toThrow();
  });
  it('rejects extraneous semantic input and detaches public mutating requests', () => {
    for (const invalid of [
      { ...acquisition, extra: true },
      { ...claim, action: { ...claim.action, execution: { ...execution, sessionId: '' } } },
      { ...write, action: { ...write.action, claim: { ...write.action.claim, extra: true } } },
    ])
      expect(() => canonicalRuntimeRequest(scope, invalid)).toThrow();
    const detachedClaim = parseRuntimeClaimRequest(claim);
    expect(detachedClaim).toEqual(claim);
    expect(detachedClaim.authority).not.toBe(claim.authority);
    expect(detachedClaim.action.execution).not.toBe(execution);
    const detachedWrite = parseRuntimeWriteRequest(write);
    expect(detachedWrite).toEqual(write);
    expect(detachedWrite.action.commands).not.toBe(write.action.commands);
    expect(detachedWrite.action.claim.execution).not.toBe(execution);
    expect(() => parseRuntimeClaimRequest(write)).toThrow('claim action');
    expect(() => parseRuntimeWriteRequest(claim)).toThrow('write action');
  });
  it.each([0, 201])('refuses a public canonical write with %i commands', (length) => {
    const commands = Array.from({ length }, () => ({
      kind: 'setProgress',
      workItemId: 'leaf',
      stepId: 'dev',
      state: 'done',
    }));
    expect(() =>
      canonicalRuntimeRequest(scope, { ...write, action: { ...write.action, commands } }),
    ).toThrow();
  });
  it('accepts a public canonical write with exactly 200 commands', () => {
    const commands = Array.from({ length: 200 }, () => ({
      kind: 'setProgress' as const,
      workItemId: 'leaf',
      stepId: 'dev',
      state: 'done' as const,
    }));
    const operation = { ...write, action: { ...write.action, commands } };
    expect(parseCanonicalRuntimeRequest(canonicalRuntimeRequest(scope, operation))).toEqual({
      scope,
      operation,
    });
  });
});
