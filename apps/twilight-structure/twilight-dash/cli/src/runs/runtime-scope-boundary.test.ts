import { deepStrictEqual, rejects, throws } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  readRuntimeState,
  type RuntimeReceipt,
  type RuntimeScope1,
  validateSchema,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { artifactDigest, ownerId } from './record-codecs';
import {
  decodeRecoveryFence,
  decodeRecoveryHistory,
  decodeRecoveryObservation,
  decodeRecoveryObservationCall,
  decodeRecoveryResolveCall,
} from './recovery-codecs';
import { readRecoveryExchange } from './recovery-evidence';
import * as codecs from './runtime-codecs';
import { verifyRuntimeReceipt } from './runtime-receipt';
import type { RuntimeIntent } from './runtime-records';
import { readRuntimeStateArtifact, readRuntimeStateObservation } from './runtime-state';

const scope: RuntimeScope1 = {
  organizationId: 'same-org',
  projectId: 'package-a',
  personId: 'same-person',
};
const current = {
  organizationId: scope.organizationId,
  workPackageId: scope.projectId,
  personId: scope.personId,
};
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
interface Capture {
  scope: RuntimeScope1;
  receipts: Partial<Record<'authority' | 'claim' | 'write', RuntimeReceipt>>;
  state: {
    schemaVersion: 1;
    ledgerId: string;
    scope: RuntimeScope1;
    facts: { projectRevision: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
}
const capturedBytes = readFileSync(
  new URL(
    '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (digest(capturedBytes) !== 'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44')
  throw new Error('required genuine outgoing runtime1 capture changed');
// The exact producer capture SHA is the trusted test-only JSON boundary.
const capture = JSON.parse(capturedBytes) as Capture;

test('local runtime equality admits the same validated three-field address', () => {
  expect(
    codecs.equalRuntimeScopes(codecs.decodeRuntimeScope(scope), codecs.decodeRuntimeScope(scope)),
  ).toBe(true);
});
for (const field of ['organizationId', 'projectId', 'personId'] as const)
  test('local runtime equality rejects independently different ' + field, () => {
    const other = codecs.decodeRuntimeScope({ ...scope, [field]: 'different' });
    expect(codecs.equalRuntimeScopes(codecs.decodeRuntimeScope(scope), other)).toBe(false);
  });

test('published local scope and pin bytes and physical tuple keys remain project-keyed', () => {
  const original = JSON.stringify(scope);
  const decoded = codecs.decodeRuntimeScope(scope);
  expect(JSON.stringify(decoded)).toBe(original);
  expect(JSON.stringify(codecs.decodeRuntimePin({ version: 1, scope, ledgerId: 'ledger' }))).toBe(
    '{"version":1,"scope":{"organizationId":"same-org","projectId":"package-a","personId":"same-person"},"ledgerId":"ledger"}',
  );
  expect(codecs.runtimeScopeKey(decoded)).toBe('["same-org","package-a","same-person"]');
  expect(codecs.runtimeScopeKey({ ...decoded, projectId: 'package-b' })).not.toBe(
    codecs.runtimeScopeKey(decoded),
  );
  expect(() => codecs.decodeRuntimeScope(current)).toThrow();
  expect(() => codecs.decodeRuntimeScope({ ...scope, workPackageId: scope.projectId })).toThrow();
});

test('complete current scope mapping copies all local fields without retaining caller aliases', () => {
  const map: unknown = Reflect.get(codecs, 'mapCurrentScope');
  expect(typeof map).toBe('function');
  if (typeof map !== 'function') throw new Error('required current scope map absent');
  const input = { ...scope };
  const mapped = codecs.mapCurrentScope(input);
  deepStrictEqual(mapped, current);
  input.organizationId = 'changed-org';
  input.projectId = 'changed-owner';
  input.personId = 'changed-person';
  deepStrictEqual(mapped, current);
});
test('complete local scope mapping copies all current fields without retaining caller aliases', () => {
  const map: unknown = Reflect.get(codecs, 'mapLocalScope');
  expect(typeof map).toBe('function');
  if (typeof map !== 'function') throw new Error('required local scope map absent');
  const input = { ...current };
  const mapped = codecs.mapLocalScope(input);
  deepStrictEqual(mapped, scope);
  input.organizationId = 'changed-org';
  input.workPackageId = 'changed-owner';
  input.personId = 'changed-person';
  deepStrictEqual(mapped, scope);
});

for (const command of ['grant', 'claim', 'write'])
  test(
    'genuine canonical1 ' +
      command +
      ' retains original bytes and digest while reading local scope',
    () => {
      const row = capture.tables.runtime_command_receipt.find(
        (candidate) => candidate.command_id === command,
      );
      if (row === undefined) throw new Error('required genuine accepted command absent');
      const accepted = JSON.parse(row.accepted) as {
        canonicalRequest: string;
        requestDigest: string;
      };
      const original = accepted.canonicalRequest;
      expect(digest(original)).toBe(accepted.requestDigest);
      deepStrictEqual(codecs.readRuntimeRequest(original), {
        scope: capture.scope,
        operation: parseCanonicalRuntimeRequest(original).operation,
      });
      expect(accepted.canonicalRequest).toBe(original);
      expect(digest(original)).toBe(accepted.requestDigest);
      expect(() => codecs.readRuntimeRequest(original + '\n')).toThrow(
        'runtime request bytes are not canonical',
      );
    },
  );

test('current canonical2 is an explicit local view without retagging its original bytes', () => {
  const operation = {
    schemaVersion: 1,
    kind: 'authority',
    commandId: 'current',
    expectedLedgerId: 'ledger',
    ownerId: 'owner',
    expectedGeneration: null,
  };
  const original = canonicalRuntimeRequest(current, operation);
  const originalDigest = digest(original);
  deepStrictEqual(codecs.readRuntimeRequest(original), { scope, operation });
  expect(original).toContain('"schemaVersion":2');
  expect(original).toContain('"workPackageId":"package-a"');
  expect(digest(original)).toBe(originalDigest);
  expect(() => codecs.readRuntimeRequest(original + '\n')).toThrow(
    'runtime request bytes are not canonical',
  );
});

function originalIntent(commandId: string): RuntimeIntent {
  const row = capture.tables.runtime_command_receipt.find(
    (entry) => entry.command_id === commandId,
  );
  if (row === undefined) throw new Error('required genuine command absent');
  const accepted = JSON.parse(row.accepted) as { canonicalRequest: string; requestDigest: string };
  return {
    version: 1,
    commandId,
    canonicalRequest: accepted.canonicalRequest,
    requestDigest: artifactDigest(accepted.requestDigest),
    localOwner: { ownerId: ownerId('local'), epoch: 1 },
    stagedRevision: 1,
  };
}
async function verifyReceiptValue(intent: RuntimeIntent, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const artifacts: ArtifactStore = {
    readArtifact: async () => await Promise.resolve(bytes.slice()),
    retainArtifact() {
      throw new Error('verification must not retain new evidence');
    },
  };
  return await verifyRuntimeReceipt(artifacts, intent, {
    version: 1,
    digest: artifactDigest(digest(JSON.stringify(value))),
    byteLength: bytes.byteLength,
    mediaType: 'application/json',
    retention: 'retain',
  });
}
for (const [kind, command] of [
  ['authority', 'grant'],
  ['claim', 'claim'],
  ['write', 'write'],
] as const) {
  test(
    'Dash verifies genuine raw receipt1 ' + kind + ' without changing its tag or bytes',
    async () => {
      const receipt = capture.receipts[kind];
      if (receipt === undefined) throw new Error('required genuine receipt absent');
      const before = JSON.stringify(receipt);
      const verified = await verifyReceiptValue(originalIntent(command), receipt);
      deepStrictEqual(verified, receipt);
      expect(JSON.stringify(verified)).toBe(before);
      expect(verified.schemaVersion).toBe(1);
      if (receipt.schemaVersion !== 1) throw new Error('genuine fixture must retain receipt1');
      await rejects(
        verifyReceiptValue(originalIntent(command), {
          ...receipt,
          scope: { ...receipt.scope, projectId: 'other-owner' },
        }),
        { message: 'runtime receipt correspondence differs' },
      );
      const extended = {
        ...receipt,
        future: { retained: 'old addition' },
        acceptance: { ...receipt.acceptance, future: 'acceptance addition' },
      };
      deepStrictEqual(await verifyReceiptValue(originalIntent(command), extended), extended);
    },
  );
  test(
    'Dash verifies current receipt2 ' + kind + ' and refuses independently different owner',
    async () => {
      const old = capture.receipts[kind];
      if (old === undefined) throw new Error('required original receipt absent');
      const retained = originalIntent(command);
      const operation = parseCanonicalRuntimeRequest(retained.canonicalRequest).operation;
      const scope = codecs.mapCurrentScope(capture.scope);
      const canonicalRequest = canonicalRuntimeRequest(scope, operation);
      const intent = {
        ...retained,
        canonicalRequest,
        requestDigest: artifactDigest(digest(canonicalRequest)),
      };
      const receipt = {
        ...old,
        schemaVersion: 2,
        scope,
        requestDigest: intent.requestDigest,
        future: { retained: 'addition' },
      };
      const before = JSON.stringify(receipt);
      const verified = await verifyReceiptValue(intent, receipt);
      deepStrictEqual(verified, receipt);
      expect(JSON.stringify(verified)).toBe(before);
      await rejects(
        verifyReceiptValue(intent, {
          ...receipt,
          scope: { ...scope, workPackageId: 'other-owner' },
        }),
        { message: 'runtime receipt correspondence differs' },
      );
      await rejects(verifyReceiptValue(intent, { ...receipt, schemaVersion: 3 }), {
        message: 'runtime receipt schema differs',
      });
    },
  );
}
test('Dash receipt local scope accessor preserves owner distinctions in both raw formats', () => {
  const old = capture.receipts.authority;
  if (old === undefined) throw new Error('required original authority receipt absent');
  const read: unknown = Reflect.get(codecs, 'readReceiptScope');
  expect(typeof read).toBe('function');
  if (typeof read !== 'function') throw new Error('required receipt scope accessor absent');
  deepStrictEqual(codecs.readReceiptScope(old), capture.scope);
  const currentReceipt: RuntimeReceipt = {
    ...old,
    schemaVersion: 2,
    scope: codecs.mapCurrentScope(capture.scope),
  };
  deepStrictEqual(codecs.readReceiptScope(currentReceipt), capture.scope);
  expect(
    codecs.equalRuntimeScopes(
      codecs.readReceiptScope({
        ...currentReceipt,
        scope: { ...currentReceipt.scope, workPackageId: 'other' },
      }),
      capture.scope,
    ),
  ).toBe(false);
});

function stateValue(version: 1 | 2) {
  const state = structuredClone(capture.state);
  if (version === 1) return state;
  const { projectRevision, ...facts } = state.facts;
  return {
    ...state,
    schemaVersion: 2,
    scope: codecs.mapCurrentScope(state.scope),
    facts: { ...facts, workPackageRevision: projectRevision },
  };
}
function artifactFixture() {
  const retained = new Map<string, Uint8Array>();
  const artifacts: ArtifactStore = {
    async retainArtifact(content, mediaType) {
      const reference = {
        version: 1 as const,
        digest: artifactDigest(digestBytes(content)),
        byteLength: content.byteLength,
        mediaType,
        retention: 'retain' as const,
      };
      retained.set(reference.digest, content.slice());
      return await Promise.resolve({ kind: 'retained' as const, reference });
    },
    async readArtifact(reference) {
      const content = retained.get(reference.digest);
      if (content === undefined) throw new Error('required artifact absent');
      return await Promise.resolve(content.slice());
    },
  };
  async function retain(value: unknown) {
    const reply = await artifacts.retainArtifact(
      new TextEncoder().encode(JSON.stringify(value)),
      'application/json',
    );
    if (reply.kind !== 'retained') throw new Error('required evidence retention failed');
    return reply.reference;
  }
  return { artifacts, retain };
}
function digestBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
for (const version of [1, 2] as const) {
  test(
    'Dash retained state' + String(version) + ' preserves raw full fields and additive values',
    async () => {
      const state = { ...stateValue(version), future: { identity: 'untouched' } };
      const stores = artifactFixture();
      const reference = await stores.retain(state);
      const before = JSON.stringify(state);
      const read = await readRuntimeStateArtifact(stores.artifacts, reference);
      deepStrictEqual(read, state);
      expect(JSON.stringify(read)).toBe(before);
      expect(read.schemaVersion).toBe(version);
      const view = await readRuntimeStateObservation(stores.artifacts, reference);
      deepStrictEqual(view.scope, codecs.mapCurrentScope(capture.scope));
      expect(view.facts.workPackageRevision).toBe(capture.state.facts.projectRevision);
      expect('schemaVersion' in view).toBe(false);
      expect(JSON.stringify(read)).toBe(before);
    },
  );
  test(
    'Dash recovery state' + String(version) + ' keeps original raw body through embedded decoding',
    async () => {
      const stores = artifactFixture();
      const state = { ...stateValue(version), future: { identity: 'still raw' } };
      const body = await stores.retain(state);
      const envelope = {
        version: 1,
        context: { kind: 'initial_state', recoveryId: 'recovery' },
        scope: capture.scope,
        ledgerId: capture.state.ledgerId,
        request: { kind: 'state' },
        status: 200,
        body,
      };
      const reference = await stores.retain(envelope);
      const read = await readRecoveryExchange(stores.artifacts, reference, { kind: 'state' });
      if (read.kind !== 'state') throw new Error('required state exchange absent');
      deepStrictEqual(read.exchange.body.value, state);
      const fence = {
        version: 1,
        recoveryId: 'recovery',
        ordinal: 1,
        canonicalRequest: originalIntent('grant').canonicalRequest,
        requestDigest: originalIntent('grant').requestDigest,
        owner: { ownerId: 'local', epoch: 1 },
        stagedRevision: 1,
        basis: { kind: 'initial', state: read.exchange },
      };
      deepStrictEqual(decodeRecoveryFence(fence).basis.state.body.value, state);
      deepStrictEqual(
        await stores.artifacts.readArtifact(body),
        new TextEncoder().encode(JSON.stringify(state)),
      );
    },
  );
  test('Dash retained state' + String(version) + ' rejects competing owner spelling', async () => {
    const state = stateValue(version);
    const stores = artifactFixture();
    const scope = {
      ...state.scope,
      ...(version === 1
        ? { workPackageId: capture.scope.projectId }
        : { projectId: capture.scope.projectId }),
    };
    const reference = await stores.retain({ ...state, scope });
    await rejects(readRuntimeStateArtifact(stores.artifacts, reference), {
      message: 'runtime state schema differs',
    });
  });
  test(
    'Dash retained state' + String(version) + ' rejects competing revision spelling',
    async () => {
      const state = stateValue(version);
      const stores = artifactFixture();
      const facts = {
        ...state.facts,
        ...(version === 1 ? { workPackageRevision: 0 } : { projectRevision: 0 }),
      };
      const reference = await stores.retain({ ...state, facts });
      await rejects(readRuntimeStateArtifact(stores.artifacts, reference), {
        message: 'runtime state schema differs',
      });
    },
  );
}
test('current live state endpoint refuses genuine historical state1 independently of retained reader', async () => {
  const checked = await validateSchema(readRuntimeState.responses[0].schema, capture.state);
  expect(checked.issues).toBeDefined();
  expect(
    (await validateSchema(readRuntimeState.responses[0].schema, stateValue(2))).issues,
  ).toBeUndefined();
});
for (const version of [0, 3, null, '1'])
  test('Dash retained state refuses unknown version ' + JSON.stringify(version), async () => {
    const stores = artifactFixture();
    const reference = await stores.retain({ ...capture.state, schemaVersion: version });
    await rejects(readRuntimeStateArtifact(stores.artifacts, reference), {
      message: 'runtime state schema differs',
    });
  });

function replaceStatePath(state: unknown, path: readonly (string | number)[], value: unknown) {
  const copy = structuredClone(state);
  let cursor = copy;
  for (const key of path.slice(0, -1)) {
    if (typeof cursor !== 'object' || cursor === null)
      throw new Error('required test branch absent');
    cursor = Reflect.get(cursor, key);
  }
  const last = path.at(-1);
  if (last === undefined || typeof cursor !== 'object' || cursor === null)
    throw new Error('required test leaf absent');
  Reflect.set(cursor, last, value);
  return copy;
}
const invalidStateLeaves: readonly [string, readonly (string | number)[], unknown][] = [
  ['ledger', ['ledgerId'], ''],
  ['basis', ['basis'], 'rb1:bad'],
  ['person', ['scope', 'personId'], ''],
  ['work id', ['facts', 'workItems', 0, 'id'], ''],
  ['work parent', ['facts', 'workItems', 0, 'parentId'], 9],
  ['work revision', ['facts', 'workItems', 0, 'revision'], -1],
  [
    'external refs',
    ['facts', 'workItems', 0, 'externalRefs'],
    [{ id: 'x', systemId: 's', url: 7, name: 'n' }],
  ],
  ['step id', ['facts', 'steps', 0, 'id'], ''],
  ['step code', ['facts', 'steps', 0, 'code'], 7],
  ['step position', ['facts', 'steps', 0, 'position'], 'zero'],
  ['authority owner', ['authority', 'ownerId'], ''],
  ['authority generation', ['authority', 'generation'], 0],
  ['claim identity', ['claims', 0, 'claim', 'id'], ''],
  ['claim account', ['claims', 0, 'claim', 'accountId'], ''],
  ['runtime binding', ['claims', 0, 'binding', 'execution', 'sessionId'], ''],
];
for (const version of [1, 2] as const) {
  for (const [name, path, value] of invalidStateLeaves)
    test('retained state' + String(version) + ' validates full original ' + name, async () => {
      const stores = artifactFixture();
      const reference = await stores.retain(replaceStatePath(stateValue(version), path, value));
      await rejects(readRuntimeStateArtifact(stores.artifacts, reference), {
        message: 'runtime state schema differs',
      });
    });
  test(
    'retained state' +
      String(version) +
      ' preserves nested public additions before local projection',
    async () => {
      const stores = artifactFixture();
      const state = replaceStatePath(stateValue(version), ['claims', 0, 'binding', 'future'], {
        identity: 'binding addition',
      });
      const reference = await stores.retain(state);
      deepStrictEqual(await readRuntimeStateArtifact(stores.artifacts, reference), state);
    },
  );
  test('retained state' + String(version) + ' rejects absent and unsafe revision', async () => {
    const stores = artifactFixture();
    for (const value of [undefined, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const reference = await stores.retain(
        replaceStatePath(
          stateValue(version),
          ['facts', version === 1 ? 'projectRevision' : 'workPackageRevision'],
          value,
        ),
      );
      await rejects(readRuntimeStateArtifact(stores.artifacts, reference), {
        message: 'runtime state schema differs',
      });
    }
  });
}

for (const version of [1, 2] as const)
  test('embedded write recovery preserves complete raw receipt' + String(version), async () => {
    const stores = artifactFixture();
    const old = capture.receipts.write;
    const authority = capture.receipts.authority;
    if (old === undefined || authority === undefined || old.acceptance.kind !== 'write')
      throw new Error('required captured write and authority absent');
    const original = originalIntent('write');
    const canonicalRequest =
      version === 1
        ? original.canonicalRequest
        : canonicalRuntimeRequest(
            codecs.mapCurrentScope(capture.scope),
            parseCanonicalRuntimeRequest(original.canonicalRequest).operation,
          );
    const intent = {
      ...original,
      canonicalRequest,
      requestDigest: artifactDigest(digest(canonicalRequest)),
    };
    const receipt =
      version === 1
        ? old
        : {
            ...old,
            schemaVersion: 2,
            scope: codecs.mapCurrentScope(capture.scope),
            requestDigest: intent.requestDigest,
          };
    const body = await stores.retain(receipt);
    const stateBody = await stores.retain(capture.state);
    const envelope = {
      version: 1,
      context: { kind: 'initial_state', recoveryId: 'recover' },
      scope: capture.scope,
      ledgerId: capture.state.ledgerId,
      request: { kind: 'state' },
      status: 200,
      body: stateBody,
    };
    const reference = await stores.retain(envelope);
    const statePair = {
      envelope: { artifact: reference, value: envelope },
      body: { artifact: stateBody, value: capture.state },
    };
    const fenceIntent = originalIntent('grant');
    const fence = {
      version: 1,
      recoveryId: 'recover',
      ordinal: 1,
      canonicalRequest: fenceIntent.canonicalRequest,
      requestDigest: fenceIntent.requestDigest,
      owner: { ownerId: 'local', epoch: 1 },
      stagedRevision: 1,
      basis: { kind: 'initial', state: statePair },
    };
    const authorityBody = await stores.retain(authority);
    const authorityPair = {
      envelope: { artifact: reference, value: envelope },
      body: { artifact: authorityBody, value: authority },
    };
    const pair = {
      envelope: { artifact: reference, value: envelope },
      body: { artifact: body, value: receipt },
    };
    const projection = {
      version: 1,
      actorId: old.actorId,
      basisAfter: old.acceptance.basisAfter,
      applied: old.acceptance.applied,
    };
    const resolve = {
      kind: 'write',
      recoveryId: 'recover',
      guard: {
        ownership: {
          version: 1,
          storeId: 'store',
          organizationId: capture.scope.organizationId,
          ownerId: 'local',
          epoch: 1,
          expiresAt: 2000,
        },
        runId: 'run',
        attemptId: 'attempt',
        expectedRevision: 0,
        expectedAttemptRevision: 0,
        scope: capture.scope,
        expectedScopeRevision: 0,
        expectedRecoveryRevision: 0,
      },
      fence: {
        fence,
        observation: {
          version: 1,
          kind: 'accepted',
          observedRevision: 2,
          fence,
          reply: authorityPair,
        },
      },
      decision: {
        kind: 'accepted',
        lookup: pair,
        command: {
          version: 1,
          kind: 'accept_write',
          commandId: 'accept',
          stageCommandId: 'stage',
          intent,
          evidence: body,
          projection,
        },
      },
    };
    deepStrictEqual(decodeRecoveryResolveCall(resolve), resolve);
  });

async function embeddedClaimFixture(version: 1 | 2) {
  const stores = artifactFixture();
  const originalAuthority = capture.receipts.authority;
  const originalClaim = capture.receipts.claim;
  if (originalAuthority === undefined || originalClaim?.acceptance.kind !== 'claim')
    throw new Error('required captured authority and claim absent');
  function retainedIntent(command: string) {
    const original = originalIntent(command);
    const canonicalRequest =
      version === 1
        ? original.canonicalRequest
        : canonicalRuntimeRequest(
            codecs.mapCurrentScope(capture.scope),
            codecs.readRuntimeRequest(original.canonicalRequest).operation,
          );
    return {
      ...original,
      canonicalRequest,
      requestDigest: artifactDigest(digest(canonicalRequest)),
    };
  }
  const scope = version === 1 ? capture.scope : codecs.mapCurrentScope(capture.scope);
  const authorityIntent = retainedIntent('grant');
  const claimIntent = retainedIntent('claim');
  const authority = {
    ...originalAuthority,
    schemaVersion: version,
    scope,
    requestDigest: authorityIntent.requestDigest,
    future: 'root addition',
    acceptance: { ...originalAuthority.acceptance, future: { nested: 'authority addition' } },
  };
  const claim = {
    ...originalClaim,
    schemaVersion: version,
    scope,
    requestDigest: claimIntent.requestDigest,
    future: 'root addition',
    acceptance: {
      ...originalClaim.acceptance,
      claim: {
        ...originalClaim.acceptance.claim,
        execution: { ...originalClaim.acceptance.claim.execution, future: 'execution addition' },
      },
      future: 'claim acceptance addition',
    },
  };
  const body = await stores.retain(capture.state);
  const envelope = {
    version: 1,
    context: { kind: 'initial_state', recoveryId: 'recover' },
    scope: capture.scope,
    ledgerId: capture.state.ledgerId,
    request: { kind: 'state' },
    status: 200,
    body,
  };
  const reference = await stores.retain(envelope);
  const pair = async (value: unknown) => ({
    envelope: { artifact: reference, value: envelope },
    body: { artifact: await stores.retain(value), value },
  });
  const fence = {
    version: 1,
    recoveryId: 'recover',
    ordinal: 1,
    canonicalRequest: authorityIntent.canonicalRequest,
    requestDigest: authorityIntent.requestDigest,
    owner: { ownerId: 'local', epoch: 1 },
    stagedRevision: 1,
    basis: { kind: 'initial', state: await pair(capture.state) },
  };
  const observation = {
    version: 1,
    kind: 'accepted',
    observedRevision: 2,
    fence,
    reply: await pair(authority),
  };
  const ownership = {
    version: 1,
    storeId: 'store',
    organizationId: capture.scope.organizationId,
    ownerId: 'local',
    epoch: 1,
    expiresAt: 2000,
  };
  const authorityGuard = {
    ownership,
    scope: capture.scope,
    expectedRevision: 0,
    expectedRecoveryRevision: 0,
  };
  const claimGuard = {
    ownership,
    runId: 'run',
    attemptId: 'attempt',
    expectedRevision: 0,
    expectedAttemptRevision: 0,
    scope: capture.scope,
    expectedScopeRevision: 0,
    expectedRecoveryRevision: 0,
  };
  const resolve = {
    kind: 'claim',
    recoveryId: 'recover',
    guard: claimGuard,
    fence: { fence, observation },
    decision: {
      kind: 'accepted',
      lookup: await pair(claim),
      command: {
        version: 2,
        kind: 'accept_claim',
        commandId: 'accept',
        intent: claimIntent,
        evidence: await stores.retain(claim),
        projection: {
          version: 1,
          claimId: originalClaim.acceptance.claim.claimId,
          actorId: originalClaim.actorId,
          basisAfter: originalClaim.acceptance.basisAfter,
        },
      },
    },
  };
  const history = {
    version: 1,
    intent: {
      version: 1,
      recoveryId: 'recover',
      target: {
        kind: 'claim',
        original: claimIntent,
        runId: 'run',
        attemptId: 'attempt',
        stageCommandId: 'stage',
        acceptanceCommandId: 'accept',
      },
      begunScopeRevision: 1,
      resolver: { ownerId: 'local', epoch: 1 },
    },
    revision: 0,
    fences: [fence],
    observations: [observation],
    closure: null,
  };
  const call = {
    kind: 'authority',
    guard: authorityGuard,
    recoveryId: 'recover',
    input: { kind: 'accepted', fence, reply: observation.reply },
  };
  return { observation, resolve, history, call };
}
for (const version of [1, 2] as const) {
  test(
    'embedded authority' +
      String(version) +
      ' observation and accepted fence preserve full raw additions',
    async () => {
      const fixture = await embeddedClaimFixture(version);
      deepStrictEqual(decodeRecoveryObservation(fixture.observation), fixture.observation);
      deepStrictEqual(decodeRecoveryObservationCall(fixture.call), fixture.call);
      deepStrictEqual(decodeRecoveryResolveCall(fixture.resolve).fence, fixture.resolve.fence);
    },
  );
  test(
    'embedded claim' + String(version) + ' resolve and history preserve full raw additions',
    async () => {
      const fixture = await embeddedClaimFixture(version);
      deepStrictEqual(decodeRecoveryResolveCall(fixture.resolve), fixture.resolve);
      deepStrictEqual(decodeRecoveryHistory(fixture.history), fixture.history);
    },
  );
  for (const [name, path, value] of [
    ['unsupported generation', ['schemaVersion'], 3],
    ['mismatched generation', ['schemaVersion'], version === 1 ? 2 : 1],
    ['wrong subtype', ['acceptance', 'kind'], 'claim'],
    ['required generation absent', ['acceptance', 'authority', 'generation'], undefined],
  ] as const)
    test('embedded authority' + String(version) + ' refuses ' + name, async () => {
      const fixture = await embeddedClaimFixture(version);
      const invalid = replaceStatePath(
        fixture.observation,
        ['reply', 'body', 'value', ...path],
        value,
      );
      throws(() => decodeRecoveryObservation(invalid), /reply\.body\.value/);
    });
  for (const [name, path, value] of [
    ['unsupported generation', ['schemaVersion'], 3],
    ['mismatched generation', ['schemaVersion'], version === 1 ? 2 : 1],
    ['wrong subtype', ['acceptance', 'kind'], 'authority'],
    ['required basis absent', ['acceptance', 'basisAfter'], undefined],
  ] as const)
    test('embedded claim' + String(version) + ' refuses ' + name, async () => {
      const fixture = await embeddedClaimFixture(version);
      const invalid = replaceStatePath(
        fixture.resolve,
        ['decision', 'lookup', 'body', 'value', ...path],
        value,
      );
      throws(() => decodeRecoveryResolveCall(invalid), /decision\.lookup\.body\.value/);
    });
}

async function malformedEmbeddedState(version: 1 | 2) {
  const stores = artifactFixture();
  const wire = replaceStatePath(
    stateValue(version),
    ['facts', version === 1 ? 'projectRevision' : 'workPackageRevision'],
    -1,
  );
  const body = await stores.retain(wire);
  const envelope = {
    version: 1,
    context: { kind: 'initial_state', recoveryId: 'recover-malformed' },
    scope: capture.scope,
    ledgerId: capture.state.ledgerId,
    request: { kind: 'state' },
    status: 200,
    body,
  };
  const reference = await stores.retain(envelope);
  return {
    stores,
    reference,
    pair: {
      envelope: { artifact: reference, value: envelope },
      body: { artifact: body, value: wire },
    },
  };
}
for (const version of [1, 2] as const) {
  test(
    'recovery retained state' +
      String(version) +
      ' rejects invalid revision before raw pair publication',
    async () => {
      const fixture = await malformedEmbeddedState(version);
      await rejects(
        readRecoveryExchange(fixture.stores.artifacts, fixture.reference, { kind: 'state' }),
        { message: 'recovery state schema differs' },
      );
    },
  );
  test(
    'embedded retained state' +
      String(version) +
      ' rejects invalid revision before later artifact verification',
    async () => {
      const fixture = await malformedEmbeddedState(version);
      const original = originalIntent('grant');
      throws(
        () =>
          decodeRecoveryFence({
            version: 1,
            recoveryId: 'recover-malformed',
            ordinal: 1,
            canonicalRequest: original.canonicalRequest,
            requestDigest: original.requestDigest,
            owner: { ownerId: 'local', epoch: 1 },
            stagedRevision: 1,
            basis: { kind: 'initial', state: fixture.pair },
          }),
        /basis\.state\.body\.value/,
      );
    },
  );
}

test('genuine receipt refuses retained intent digest drift before acceptance', async () => {
  const receipt = capture.receipts.authority;
  if (receipt === undefined) throw Error('required genuine authority receipt absent');
  const intent = originalIntent('grant');
  await rejects(
    verifyReceiptValue({ ...intent, requestDigest: artifactDigest('a'.repeat(64)) }, receipt),
    { message: 'runtime receipt correspondence differs' },
  );
});
