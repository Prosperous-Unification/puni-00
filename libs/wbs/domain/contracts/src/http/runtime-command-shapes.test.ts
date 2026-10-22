import { expect, test } from 'bun:test';

import {
  acquireRuntimeAuthority,
  applyRuntimeCommands,
  lookupRuntimeReceipt,
  readRuntimeState,
  runtimeCommandShapes,
} from './runtime-command-shapes';
import { validateSchema } from './schema-shape';

test('runtime declarations require complete pins and reject unknown wire keys', async () => {
  expect(runtimeCommandShapes).toHaveLength(4);
  const valid = {
    schemaVersion: 1,
    commandId: 'c',
    personId: 'p',
    expectedLedgerId: 'ledger',
    ownerId: 'owner',
    expectedGeneration: null,
  };
  expect((await validateSchema(acquireRuntimeAuthority.body, valid)).issues).toBeUndefined();
  for (const candidate of [
    { ...valid, expectedLedgerId: '' },
    { ...valid, expectedLedgerId: undefined },
    { ...valid, extra: 1 },
    { ...valid, schemaVersion: 2 },
    { ...valid, expectedGeneration: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    expect((await validateSchema(acquireRuntimeAuthority.body, candidate)).issues).toBeDefined();
  }
  expect((await validateSchema(readRuntimeState.query, { personId: 'p' })).issues).toBeUndefined();
  expect(
    (await validateSchema(lookupRuntimeReceipt.query, { personId: 'p' })).issues,
  ).toBeDefined();
  expect(
    (
      await validateSchema(applyRuntimeCommands.body, {
        ...valid,
        authority: { ownerId: 'o', generation: 1 },
        expectedBasis: 'bad',
        action: {},
      })
    ).issues,
  ).toBeDefined();
});

// These assignments keep the wire and framework-free application records aligned.
import type {
  RuntimeAuthorityRequest,
  RuntimeCommandRequest,
  RuntimeReceipt,
  RuntimeState,
} from '../runtime-command-values';
import type { ClientInput } from './client-types';
import type { SchemaShape } from './schema-shape';
type Value<S> = S extends SchemaShape<infer T> ? T : never;
type AuthorityBody = Value<typeof acquireRuntimeAuthority.body>;
type CommandBody = Value<typeof applyRuntimeCommands.body>;
const _authorityCorresponds = (wire: AuthorityBody): RuntimeAuthorityRequest => wire;
const _commandCorresponds = (wire: CommandBody): RuntimeCommandRequest => wire;
const _receiptCorresponds = (
  wire: Value<(typeof applyRuntimeCommands.responses)[0]['schema']>,
): RuntimeReceipt => wire;
const _stateCorresponds = (
  wire: Value<(typeof readRuntimeState.responses)[0]['schema']>,
): RuntimeState => wire;
function _compileBoundary() {
  const _missingPin: ClientInput<typeof acquireRuntimeAuthority> = {
    params: { id: 'p' },
    // @ts-expect-error Explicit pin is mandatory on authority acquisition.
    body: {
      schemaVersion: 1,
      commandId: 'c',
      personId: 'p',
      ownerId: 'o',
      expectedGeneration: null,
    },
  };
  const _missingLookupPin: ClientInput<typeof lookupRuntimeReceipt> = {
    params: { id: 'p', commandId: 'c' },
    // @ts-expect-error Lookup cannot infer absence without a ledger pin.
    query: { personId: 'p' },
  };
  const _missingClaim: ClientInput<typeof applyRuntimeCommands> = {
    params: { id: 'p' },
    body: {
      schemaVersion: 1,
      commandId: 'c',
      personId: 'p',
      expectedLedgerId: 'l',
      authority: { ownerId: 'o', generation: 1 },
      expectedBasis: `rb1:${'0'.repeat(64)}`,
      // @ts-expect-error A write requires the complete exact claim.
      action: { kind: 'write', commands: [] },
    },
  };
}

test('write receipt ordering reports the exact invalid index after complete field validation', async () => {
  const receipt = {
    schemaVersion: 1,
    ledgerId: 'ledger',
    scope: { organizationId: 'org', projectId: 'project', personId: 'person' },
    commandId: 'command',
    requestDigest: 'a'.repeat(64),
    actorId: 'actor',
    acceptance: {
      kind: 'write',
      authority: { ownerId: 'owner', generation: 1 },
      claim: {
        claimId: 'claim',
        workItemId: 'leaf',
        stepId: 'dev',
        parentClaimId: null,
        execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
      },
      basisAfter: `rb1:${'a'.repeat(64)}`,
      applied: [
        { index: 0, kind: 'setProgress' },
        { index: 2, kind: 'setMeasure' },
      ],
    },
  } satisfies RuntimeReceipt;
  for (const schema of [
    applyRuntimeCommands.responses[0].schema,
    lookupRuntimeReceipt.responses[0].schema,
  ]) {
    const checked = await validateSchema<RuntimeReceipt>(schema, receipt);
    expect(checked.issues).toEqual([
      {
        message: 'Applied command index must equal its zero-based position',
        path: ['acceptance', 'applied', 1, 'index'],
      },
    ]);
    const valid = {
      ...receipt,
      acceptance: {
        ...receipt.acceptance,
        applied: [
          { index: 0, kind: 'setProgress' },
          { index: 1, kind: 'setMeasure' },
        ],
      },
    } satisfies RuntimeReceipt;
    const accepted = await validateSchema<RuntimeReceipt>(schema, valid);
    expect(accepted.issues).toBeUndefined();
    if (accepted.issues !== undefined) throw new Error('valid sequence refused');
    expect(accepted.value).toBe(valid);
  }
});
