import type { RuntimeCommandRequest } from '@wbs/contracts';
import { describe, expect, it } from 'bun:test';

import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  parseRuntimeAuthorityRequest,
  parseRuntimeLookup,
  parseRuntimeStateRequest,
} from './runtime-request';

const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
const acquisition = {
  kind: 'authority' as const,
  schemaVersion: 1 as const,
  commandId: 'command',
  expectedLedgerId: 'ledger',
  ownerId: 'owner',
  expectedGeneration: null,
};
const execution = { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' };
const claim = {
  claimId: 'claim',
  workItemId: 'leaf',
  stepId: 'dev',
  parentClaimId: null,
  execution,
};
const authority = { ownerId: 'owner', generation: 1 };
const write = {
  schemaVersion: 1 as const,
  commandId: 'write',
  expectedLedgerId: 'ledger',
  authority,
  expectedBasis: `rb1:${'a'.repeat(64)}`,
  action: {
    kind: 'write' as const,
    claim,
    commands: [
      { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
    ],
  },
};

describe('canonical runtime request', () => {
  it('fixes every authority envelope key and preserves explicit null', () => {
    expect(canonicalRuntimeRequest(scope, acquisition)).toBe(
      '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"org","projectId":"project","personId":"person"},"commandId":"command","operation":{"kind":"authority","ownerId":"owner","expectedGeneration":null}}',
    );
    expect(
      canonicalRuntimeRequest(
        { personId: 'person', projectId: 'project', organizationId: 'org' },
        { ...acquisition, ownerId: 'owner' },
      ),
    ).toBe(canonicalRuntimeRequest(scope, acquisition));
  });
  it('normalizes nested claim/write object keys while retaining ordered content', () => {
    const canonical = canonicalRuntimeRequest(scope, write);
    expect(canonical).toBe(
      '{"schemaVersion":1,"expectedLedgerId":"ledger","scope":{"organizationId":"org","projectId":"project","personId":"person"},"commandId":"write","operation":{"kind":"write","authority":{"ownerId":"owner","generation":1},"expectedBasis":"rb1:' +
        'a'.repeat(64) +
        '","action":{"kind":"write","claim":{"claimId":"claim","workItemId":"leaf","stepId":"dev","parentClaimId":null,"execution":{"storeId":"store","runId":"run","attemptId":"attempt","sessionId":"session"}},"commands":[{"kind":"setProgress","workItemId":"leaf","stepId":"dev","state":"done"}]}}}',
    );
    expect(
      canonicalRuntimeRequest(scope, {
        ...write,
        action: {
          kind: 'claim',
          workItemId: 'leaf',
          stepId: 'dev',
          parentClaimId: null,
          execution,
        },
      }),
    ).not.toBe(canonical);
    const refs = [
      { systemId: 'git', url: 'first', name: 'One' },
      { systemId: 'git', url: 'second' },
    ];
    const commands = [
      { kind: 'patchWorkItem' as const, workItemId: 'leaf', patch: { externalRefs: refs } },
      ...write.action.commands,
    ];
    expect(
      canonicalRuntimeRequest(scope, { ...write, action: { ...write.action, commands } }),
    ).not.toBe(
      canonicalRuntimeRequest(scope, {
        ...write,
        action: { ...write.action, commands: [...commands].reverse() },
      }),
    );
    expect(
      canonicalRuntimeRequest(scope, { ...write, action: { ...write.action, commands } }),
    ).not.toBe(
      canonicalRuntimeRequest(scope, {
        ...write,
        action: {
          ...write.action,
          commands: [
            {
              kind: 'patchWorkItem',
              workItemId: 'leaf',
              patch: { externalRefs: [...refs].reverse() },
            },
          ],
        },
      }),
    );
  });
  it.each([
    { ...acquisition, ignored: true },
    { ...acquisition, schemaVersion: 2 },
    { ...acquisition, commandId: '' },
    { ...acquisition, expectedGeneration: -1 },
    { ...acquisition, expectedGeneration: 0 },
    { ...acquisition, expectedGeneration: Number.MAX_SAFE_INTEGER + 1 },
    { ...write, authority: { ...authority, extra: true } },
    { ...write, expectedBasis: 'invalid' },
    {
      ...write,
      action: {
        ...write.action,
        claim: { ...claim, execution: { ...execution, sessionId: 's'.repeat(257) } },
      },
    },
    { ...write, action: { ...write.action, commands: [] } },
    {
      ...write,
      action: {
        ...write.action,
        commands: Array.from({ length: 201 }, () => write.action.commands[0]),
      },
    },
    {
      ...write,
      action: {
        ...write.action,
        commands: [
          { kind: 'setMeasure', workItemId: 'leaf', stepId: 'dev', metric: 'money', value: 2 },
        ],
      },
    },
    {
      ...write,
      action: {
        ...write.action,
        commands: [
          {
            kind: 'setMeasure',
            workItemId: 'leaf',
            stepId: 'dev',
            metric: 'token_actual',
            value: NaN,
          },
        ],
      },
    },
    {
      ...write,
      action: {
        ...write.action,
        commands: [
          {
            kind: 'setMeasure',
            workItemId: 'leaf',
            stepId: 'dev',
            metric: 'token_actual',
            value: Infinity,
          },
        ],
      },
    },
    {
      ...write,
      action: {
        ...write.action,
        commands: [
          { kind: 'setProgress', workItemId: 'leaf', stepNodeId: 'alternate', state: 'done' },
        ],
      },
    },
    {
      ...write,
      action: {
        ...write.action,
        commands: [{ kind: 'patchWorkItem', workItemId: 'leaf', patch: { name: 'other' } }],
      },
    },
  ])('rejects undeclared, malformed or unsupported input %#', (operation) => {
    expect(() => canonicalRuntimeRequest(scope, operation)).toThrow();
  });
});

describe('runtime application request boundaries', () => {
  it('rejects malformed acquisition fields before asynchronous admission', () => {
    const { kind: _kind, ...request } = acquisition;
    for (const invalid of [
      { ...request, extra: true },
      { ...request, commandId: '' },
      { ...request, expectedGeneration: 0 },
      { ...request, expectedGeneration: 1.5 },
      { ...request, expectedGeneration: Number.MAX_SAFE_INTEGER + 1 },
      { ...request, schemaVersion: 2 },
    ])
      expect(() => parseRuntimeAuthorityRequest(invalid)).toThrow();
    expect(parseRuntimeAuthorityRequest(request)).toEqual(request);
  });
  it('requires an exact lookup pin and distinguishes omitted discovery pin from invalid input', () => {
    for (const invalid of [
      { commandId: 'command' },
      { commandId: 'command', expectedLedgerId: '' },
      { commandId: 'command', expectedLedgerId: 'ledger', extra: true },
    ])
      expect(() => parseRuntimeLookup(invalid)).toThrow();
    for (const invalid of [{ expectedLedgerId: '' }, { expectedLedgerId: null }, { extra: true }])
      expect(() => parseRuntimeStateRequest(invalid)).toThrow();
    expect(parseRuntimeStateRequest({})).toEqual({});
    expect(parseRuntimeLookup({ commandId: 'command', expectedLedgerId: 'ledger' })).toEqual({
      commandId: 'command',
      expectedLedgerId: 'ledger',
    });
  });
  it('retains complete measure/release fields and rejects noncanonical envelope bytes', () => {
    const operation: RuntimeCommandRequest = {
      ...write,
      action: {
        ...write.action,
        commands: [
          {
            kind: 'setMeasure',
            workItemId: 'leaf',
            stepId: 'dev',
            metric: 'token_actual',
            value: 7,
          },
          { kind: 'releaseWorkItem', workItemId: 'leaf', personId: 'person', steps: ['dev'] },
        ],
      },
    };
    const bytes = canonicalRuntimeRequest(scope, operation);
    expect(bytes).toContain('"metric":"token_actual","value":7');
    expect(bytes).toContain('"personId":"person","steps":["dev"]');
    expect(parseCanonicalRuntimeRequest(bytes)).toEqual({ scope, operation });
    expect(() => parseCanonicalRuntimeRequest(bytes + ' ')).toThrow('not canonical');
    expect(() =>
      parseCanonicalRuntimeRequest(bytes.replace('"kind":"write"', '"kind":"claim"')),
    ).toThrow('not canonical');
    expect(() =>
      parseCanonicalRuntimeRequest(bytes.replace('"schemaVersion":1', '"schemaVersion":2')),
    ).toThrow();
  });
});
