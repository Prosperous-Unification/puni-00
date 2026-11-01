import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import type {
  AuthenticatedUser,
  RuntimeCommandRequest,
  RuntimeReadRefusal,
  RuntimeReceipt,
  RuntimeReply,
} from '@wbs/contracts';
import { createRuntimeReceiver } from '@wbs/core/module/plan-commands/composition';
import { canonicalRuntimeRequest } from '@wbs/core/module/plan-commands/runtime-request';
import type { RuntimeContext } from '@wbs/core/module/plan-commands/runtime-state';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { rollbackTo } from '@wbs/store-sqlite/migrate-down';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, describe, expect, it } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const actor: AuthenticatedUser = { id: 'ada', username: 'ada', scopes: ['read', 'write'] };
const context: RuntimeContext = {
  actor,
  access: { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'ada', role: 'member' } },
  projectId: 'a1',
  personId: 'agent',
};
const stamp = { at: 2, by: 'ada' };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function seeded() {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-authority-'));
  const dbPath = await openSpaceDatabase(directory);
  const sqlite = openSqliteSource({
    dbPath,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
  });
  const source = sqlite.bindLivePlans({
    schedulerOf: () => {
      throw new Error('runtime authority invoked scheduler');
    },
  });
  cleanups.push(async () => {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  });
  sqlite.db.run(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
  );
  await source.stores.directory.addPerson({ id: 'agent', name: 'Agent', kind: 'agent' }, [], stamp);
  await source.stores.directory.mapInOrganization('people', 'agent', 'org-a', 'Agent');
  expect(
    await source.stores.directory.patchPerson('agent', { accountId: 'ada' }, stamp),
  ).toMatchObject({ ok: true });
  await source.stores.steps.add(
    {
      id: 'dev',
      projectId: 'a1',
      name: 'Dev',
      code: 'dev',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await source.stores.workItems.insert(workItemRow({ id: 'leaf', projectId: 'a1' }), [], stamp);
  const receiver = createRuntimeReceiver(source.uow, nodeDigest);
  const ledger = await source.stores.runtimeCommands.inspectLedger();
  const acquisition = {
    schemaVersion: 1 as const,
    commandId: 'first',
    expectedLedgerId: ledger.ledgerId,
    ownerId: 'owner-a',
    expectedGeneration: null,
  };
  return { source, sqlite, receiver, ledger, acquisition, dbPath };
}
function receipt(reply: RuntimeReply<RuntimeReceipt>): RuntimeReceipt {
  if (!reply.ok)
    throw new Error(
      `Expected runtime acceptance: ${'reason' in reply ? reply.reason : reply.error}`,
    );
  return reply.value;
}

describe('admitted runtime authority', () => {
  it('accepts once, returns historical replay after takeover and reports current authority independently', async () => {
    const { receiver, source, ledger, acquisition } = await seeded();
    const first = await receiver.acquireRuntimeAuthority(context, acquisition);
    expect(receipt(first)).toMatchObject({
      schemaVersion: 1,
      ledgerId: ledger.ledgerId,
      scope: { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
      commandId: 'first',
      actorId: 'ada',
      acceptance: { kind: 'authority', authority: { ownerId: 'owner-a', generation: 1 } },
    });
    const takeover = await receiver.acquireRuntimeAuthority(context, {
      ...acquisition,
      commandId: 'next',
      ownerId: 'owner-b',
      expectedGeneration: 1,
    });
    expect(receipt(takeover).acceptance).toEqual({
      kind: 'authority',
      authority: { ownerId: 'owner-b', generation: 2 },
    });
    expect(await receiver.acquireRuntimeAuthority(context, acquisition)).toEqual(first);
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'first',
        expectedLedgerId: ledger.ledgerId,
      }),
    ).toEqual(first);
    const state = await receiver.readRuntimeState(context, { expectedLedgerId: ledger.ledgerId });
    expect(state).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 1,
        ledgerId: ledger.ledgerId,
        authority: { kind: 'held', ownerId: 'owner-b', generation: 2 },
        claims: [],
      },
    });
    if (!state.ok) throw new Error('state refused');
    expect(state.value.basis).toMatch(/^rb1:[0-9a-f]{64}$/);
    expect(state.value.facts.workItems).toEqual([
      { id: 'leaf', parentId: null, revision: 0, externalRefs: [] },
    ]);
    expect(await source.stores.runtimeCommands.inspectLedger()).toEqual({
      ...ledger,
      authorityCount: 1,
      receiptCount: 2,
    });
  });
  it('binds the basis to actual coherent complete local facts and waits for staged writes to roll back', async () => {
    const { receiver, source, ledger } = await seeded();
    const before = await receiver.readRuntimeState(context, {});
    if (!before.ok) throw new Error('state refused');
    expect(before.value.facts.projectRevision).toBe(1);
    expect(before.value.basis).toBe(
      `rb1:${await nodeDigest.sha256(`["wbs-runtime-basis",1,"${ledger.ledgerId}","org-a","a1",1,[["leaf",0]]]`)}`,
    );
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writing = source.uow.run(async ({ stores }) => {
      await stores.workItems.insert(workItemRow({ id: 'staged', projectId: 'a1' }), [], stamp);
      entered.resolve(undefined);
      await release.promise;
      return { commit: false, value: undefined };
    });
    await entered.promise;
    let settled = false;
    const reading = receiver
      .readRuntimeState(context, { expectedLedgerId: ledger.ledgerId })
      .then((state) => {
        settled = true;
        return state;
      });
    let settledBeforeRelease: boolean;
    try {
      await Bun.sleep(30);
      settledBeforeRelease = settled;
    } finally {
      release.resolve(undefined);
    }
    await writing;
    expect({ settledBeforeRelease, state: await reading }).toEqual({
      settledBeforeRelease: false,
      state: before,
    });
    await source.stores.workItems.insert(workItemRow({ id: 'z-leaf', projectId: 'a1' }), [], stamp);
    const after = await receiver.readRuntimeState(context, {});
    if (!after.ok) throw new Error('state refused');
    expect(after.value.facts.workItems.map(({ id }) => id)).toEqual(['leaf', 'z-leaf']);
    expect(after.value.basis).toBe(
      `rb1:${await nodeDigest.sha256(`["wbs-runtime-basis",1,"${ledger.ledgerId}","org-a","a1",1,[["leaf",0],["z-leaf",0]]]`)}`,
    );
    expect(after.value.basis).not.toBe(before.value.basis);
  });
  it('admits exactly one racing initialization and never records a refused request', async () => {
    const { receiver, source, ledger, acquisition } = await seeded();
    const replies = await Promise.all([
      receiver.acquireRuntimeAuthority(context, acquisition),
      receiver.acquireRuntimeAuthority(context, {
        ...acquisition,
        commandId: 'racer',
        ownerId: 'racer',
      }),
    ]);
    expect(replies.filter((reply) => reply.ok)).toHaveLength(1);
    expect(replies.filter((reply) => !reply.ok)).toEqual([
      { ok: false, reason: 'runtime_generation_conflict' },
    ]);
    expect(await source.stores.runtimeCommands.inspectLedger()).toEqual({
      ...ledger,
      authorityCount: 1,
      receiptCount: 1,
    });
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'racer',
        expectedLedgerId: ledger.ledgerId,
      }),
    ).toEqual({ ok: false, reason: 'runtime_receipt_not_found' });
  });
  it('refuses stale new IDs and changed bytes for accepted IDs', async () => {
    const { receiver, source, ledger, acquisition } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    expect(
      await receiver.acquireRuntimeAuthority(context, { ...acquisition, commandId: 'stale' }),
    ).toEqual({ ok: false, reason: 'runtime_generation_conflict' });
    for (const changed of [{ ownerId: 'changed' }, { expectedGeneration: 1 }])
      expect(
        await receiver.acquireRuntimeAuthority(context, { ...acquisition, ...changed }),
      ).toEqual({ ok: false, reason: 'runtime_command_conflict' });
    expect((await source.stores.runtimeCommands.inspectLedger()).receiptCount).toBe(1);
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'missing',
        expectedLedgerId: ledger.ledgerId,
      }),
    ).toEqual({ ok: false, reason: 'runtime_receipt_not_found' });
    expect(
      receipt(
        await receiver.acquireRuntimeAuthority(context, {
          ...acquisition,
          commandId: 'stale',
          expectedGeneration: 1,
        }),
      ).acceptance,
    ).toEqual({ kind: 'authority', authority: { ownerId: 'owner-a', generation: 2 } });
    expect((await source.stores.runtimeCommands.inspectLedger()).receiptCount).toBe(2);
  });
  it('checks current authorization before exact replay, lookup or state', async () => {
    const { receiver, sqlite, ledger, acquisition } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    sqlite.db.run(
      "UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a' AND user_id='ada'",
    );
    expect(await receiver.acquireRuntimeAuthority(context, acquisition)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'first',
        expectedLedgerId: ledger.ledgerId,
      }),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(await receiver.readRuntimeState(context, {})).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });
  it('requires write credential scope for acquisition while permitting authorized receipt reads', async () => {
    const { receiver, acquisition } = await seeded();
    const first = await receiver.acquireRuntimeAuthority(context, acquisition);
    const reader = { ...context, actor: { ...actor, scopes: ['read'] as const } };
    expect(await receiver.acquireRuntimeAuthority(reader, acquisition)).toEqual({
      ok: false,
      error: 'insufficient_scope',
    });
    expect(
      await receiver.lookupRuntimeReceipt(reader, {
        commandId: 'first',
        expectedLedgerId: acquisition.expectedLedgerId,
      }),
    ).toEqual(first);
  });
  it('pins the ledger before replay, acquisition and absence', async () => {
    const { receiver, acquisition } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    expect(
      await receiver.acquireRuntimeAuthority(context, {
        ...acquisition,
        expectedLedgerId: 'other',
      }),
    ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
    for (const commandId of ['first', 'absent'])
      expect(
        await receiver.lookupRuntimeReceipt(context, { commandId, expectedLedgerId: 'other' }),
      ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
    expect(await receiver.readRuntimeState(context, { expectedLedgerId: 'other' })).toEqual({
      ok: false,
      reason: 'runtime_ledger_mismatch',
    });
  });
  it('rolls back generation and all counts when the actual receipt INSERT fails late', async () => {
    const { receiver, source, sqlite, ledger, acquisition } = await seeded();
    sqlite.db.run(
      "CREATE TRIGGER fail_runtime_acceptance BEFORE INSERT ON runtime_command_receipt BEGIN SELECT CASE WHEN (SELECT generation FROM runtime_authority WHERE organization_id='org-a' AND project_id='a1' AND person_id='agent')=1 AND (SELECT authority_count FROM runtime_ledger)=1 THEN RAISE(ABORT,'late receipt insert') ELSE RAISE(ABORT,'CAS was not staged') END; END",
    );
    const failure = await receiver.acquireRuntimeAuthority(context, acquisition).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toMatchObject({ cause: { message: 'late receipt insert' } });
    expect(await source.stores.runtimeCommands.inspectLedger()).toEqual(ledger);
    expect(
      await source.stores.runtimeCommands.readAuthority({
        organizationId: 'org-a',
        projectId: 'a1',
        personId: 'agent',
      }),
    ).toBeNull();
    sqlite.db.run('DROP TRIGGER fail_runtime_acceptance');
    expect(
      receipt(await receiver.acquireRuntimeAuthority(context, acquisition)).acceptance,
    ).toEqual({ kind: 'authority', authority: { ownerId: 'owner-a', generation: 1 } });
  });
});

describe('runtime authorization and request detachment', () => {
  it('refuses legacy access and missing scope capability without recording acceptance', async () => {
    const { receiver, source, sqlite, acquisition, ledger } = await seeded();
    expect(
      await receiver.acquireRuntimeAuthority(
        { ...context, access: { kind: 'legacy' } },
        acquisition,
      ),
    ).toEqual({ ok: false, reason: 'runtime_scope_unavailable' });
    expect(
      await receiver.lookupRuntimeReceipt(
        { ...context, access: { kind: 'legacy' } },
        { commandId: 'first', expectedLedgerId: ledger.ledgerId },
      ),
    ).toEqual({ ok: false, reason: 'runtime_scope_unavailable' });
    expect(await receiver.readRuntimeState({ ...context, access: { kind: 'legacy' } }, {})).toEqual(
      { ok: false, reason: 'runtime_scope_unavailable' },
    );
    await assertRuntimeRejection(
      createRuntimeReceiver(sqlite.uow, nodeDigest).acquireRuntimeAuthority(context, acquisition),
      'runtime project scope resolver is missing',
    );
    expect(await source.stores.runtimeCommands.inspectLedger()).toEqual(ledger);
  });
  it('checks project, organization person, account binding and credential pin on every entry', async () => {
    const { receiver, source, sqlite, acquisition, ledger } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    const check = async (current: RuntimeContext, reason: RuntimeReadRefusal['reason']) => {
      expect(await receiver.acquireRuntimeAuthority(current, acquisition)).toEqual({
        ok: false,
        reason,
      });
      expect(
        await receiver.lookupRuntimeReceipt(current, {
          commandId: 'first',
          expectedLedgerId: ledger.ledgerId,
        }),
      ).toEqual({ ok: false, reason });
      expect(await receiver.readRuntimeState(current, {})).toEqual({ ok: false, reason });
    };
    await check({ ...context, projectId: 'b1' }, 'not_found');
    await check({ ...context, personId: 'missing' }, 'unknown_person');
    await source.stores.directory.addPerson(
      { id: 'foreign', name: 'Foreign', kind: 'agent' },
      [],
      stamp,
    );
    await source.stores.directory.mapInOrganization('people', 'foreign', 'org-b', 'Foreign');
    await source.stores.directory.patchPerson('foreign', { accountId: 'ada' }, stamp);
    await check({ ...context, personId: 'foreign' }, 'unknown_person');
    await source.stores.directory.patchPerson('agent', { accountId: null }, stamp);
    await check(context, 'person_not_bound');
    sqlite.db.run(
      "UPDATE organization_membership SET role='admin' WHERE organization_id='org-a' AND user_id='ada'",
    );
    const admin: RuntimeContext = {
      ...context,
      access: { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'ada', role: 'admin' } },
    };
    expect(await receiver.acquireRuntimeAuthority(admin, acquisition)).toMatchObject({ ok: true });
    // A machine credential's own person is the pin (`wbs-machine-credentials` A12, A18); a
    // machine has no admin bypass of the binding, so the person is bound again first.
    await source.stores.directory.patchPerson('agent', { accountId: 'ada' }, stamp);
    await check(
      {
        ...admin,
        actor: {
          ...actor,
          authentication: { kind: 'machine', credentialId: 'key-1', personId: 'foreign' },
        },
      },
      'credential_not_for_person',
    );
    sqlite.db.run(
      "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'",
    );
    await check(context, 'forbidden');
  });
  it('retains original context and request bytes while a real transaction queues admission', async () => {
    const { receiver, source, acquisition, ledger } = await seeded();
    await source.stores.directory.addPerson(
      { id: 'missing', name: 'Other pin', kind: 'agent' },
      [],
      stamp,
    );
    const mutable = {
      projectId: 'a1',
      personId: 'agent',
      actor: {
        ...actor,
        authentication: {
          kind: 'machine' as const,
          credentialId: 'key-1',
          personId: 'agent',
        },
      },
      access: {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
      },
    };
    const request = { ...acquisition };
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async () => {
      entered.resolve(undefined);
      await release.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    const acquiring = receiver.acquireRuntimeAuthority(mutable, request);
    const reading = receiver.readRuntimeState(mutable, { expectedLedgerId: ledger.ledgerId });
    mutable.projectId = 'b1';
    mutable.personId = 'missing';
    mutable.actor.id = 'missing';
    mutable.actor.authentication.personId = 'missing';
    mutable.access.scope.organizationId = 'org-b';
    request.commandId = 'changed';
    request.ownerId = 'changed';
    request.expectedLedgerId = 'changed';
    release.resolve(undefined);
    await writer;
    expect(receipt(await acquiring)).toMatchObject({
      commandId: 'first',
      scope: { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
      actorId: 'ada',
      acceptance: { authority: { ownerId: 'owner-a', generation: 1 } },
    });
    expect(await reading).toMatchObject({ ok: true, value: { authority: { ownerId: 'owner-a' } } });
  });
  it('detaches lookup and pinned state requests synchronously before queued admission', async () => {
    const { receiver, source, acquisition } = await seeded();
    const first = await receiver.acquireRuntimeAuthority(context, acquisition);
    const lookupRequest = { commandId: 'first', expectedLedgerId: acquisition.expectedLedgerId };
    const stateRequest = { expectedLedgerId: acquisition.expectedLedgerId };
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async () => {
      entered.resolve(undefined);
      await release.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    const lookup = receiver.lookupRuntimeReceipt(context, lookupRequest);
    const state = receiver.readRuntimeState(context, stateRequest);
    lookupRequest.commandId = 'changed';
    lookupRequest.expectedLedgerId = 'changed';
    stateRequest.expectedLedgerId = 'changed';
    release.resolve(undefined);
    await writer;
    expect(await lookup).toEqual(first);
    expect(await state).toMatchObject({
      ok: true,
      value: { ledgerId: acquisition.expectedLedgerId },
    });
  });
  it('rechecks current role after a queued admin loses the binding bypass', async () => {
    const { receiver, source, sqlite, acquisition } = await seeded();
    await source.stores.directory.patchPerson('agent', { accountId: null }, stamp);
    sqlite.db.run(
      "UPDATE organization_membership SET role='admin' WHERE organization_id='org-a' AND user_id='ada'",
    );
    const admin: RuntimeContext = {
      ...context,
      access: { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'ada', role: 'admin' } },
    };
    receipt(await receiver.acquireRuntimeAuthority(admin, acquisition));
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async () => {
      sqlite.db.run(
        "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id='ada'",
      );
      entered.resolve(undefined);
      await release.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    const replay = receiver.acquireRuntimeAuthority(admin, acquisition);
    release.resolve(undefined);
    await writer;
    expect(await replay).toEqual({ ok: false, reason: 'person_not_bound' });
  });
  it('preserves original acceptance actor when a different currently authorized admin reconciles it', async () => {
    const { receiver, sqlite, acquisition } = await seeded();
    const first = await receiver.acquireRuntimeAuthority(context, acquisition);
    sqlite.db.run(
      "INSERT INTO users (id,username,password_hash,created_at) VALUES ('grace','grace','x',1)",
    );
    sqlite.db.run(
      "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','grace','admin',1)",
    );
    const admin: RuntimeContext = {
      ...context,
      actor: { id: 'grace', username: 'grace', scopes: ['read', 'write'] },
      access: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: 'grace', role: 'admin' },
      },
    };
    expect(await receiver.acquireRuntimeAuthority(admin, acquisition)).toEqual(first);
    expect(
      await receiver.lookupRuntimeReceipt(admin, {
        commandId: 'first',
        expectedLedgerId: acquisition.expectedLedgerId,
      }),
    ).toEqual(first);
  });
});

describe('runtime coherent inventory and trusted corruption', () => {
  it('reads only the requested person inventory and preserves ordinary claims and immutable bindings on takeover', async () => {
    const { receiver, source, acquisition } = await seeded();
    const scope = { organizationId: 'org-a', projectId: 'a1', personId: 'agent' };
    const claims = [
      {
        id: 'ordinary',
        workItemId: 'leaf',
        stepId: 'dev',
        personId: 'agent',
        runId: 'ordinary-session',
        parentClaimId: null,
        accountId: 'ada',
      },
      {
        id: 'runtime',
        workItemId: 'other-leaf',
        stepId: 'dev',
        personId: 'agent',
        runId: 'runtime-session',
        parentClaimId: null,
        accountId: 'ada',
      },
      {
        id: 'other-person',
        workItemId: 'foreign-leaf',
        stepId: 'dev',
        personId: 'other',
        runId: null,
        parentClaimId: null,
        accountId: 'ada',
      },
    ];
    await source.stores.directory.addPerson(
      { id: 'other', name: 'Other', kind: 'agent' },
      [],
      stamp,
    );
    for (const id of ['other-leaf', 'foreign-leaf'])
      await source.stores.workItems.insert(workItemRow({ id, projectId: 'a1' }), [], stamp);
    expect(await source.stores.claims.add(claims, [], stamp, [])).toBe('written');
    const binding = {
      claimId: 'runtime',
      workItemId: 'other-leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: {
        storeId: 'store',
        runId: 'run',
        attemptId: 'attempt',
        sessionId: 'runtime-session',
      },
    };
    await source.stores.runtimeCommands.insertBinding(scope, binding);
    const before = await source.stores.claims.listByProject('a1');
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    receipt(
      await receiver.acquireRuntimeAuthority(context, {
        ...acquisition,
        commandId: 'takeover',
        expectedGeneration: 1,
        ownerId: 'new-owner',
      }),
    );
    const state = await receiver.readRuntimeState(context, {});
    expect(state).toMatchObject({
      ok: true,
      value: {
        authority: { kind: 'held', ownerId: 'new-owner', generation: 2 },
        claims: [
          { kind: 'ordinary', claim: claims[0] },
          { kind: 'runtime', claim: claims[1], binding },
        ],
      },
    });
    expect(await source.stores.claims.listByProject('a1')).toEqual(before);
    expect(await source.stores.runtimeCommands.readBinding(scope, 'runtime')).toEqual(binding);
  });
  it('exposes actual live fields beside the original binding without rebinding after ordinary movement', async () => {
    const { receiver, source } = await seeded();
    const claim = {
      id: 'bound',
      workItemId: 'leaf',
      stepId: 'dev',
      personId: 'agent',
      runId: 'actual',
      parentClaimId: null,
      accountId: 'ada',
    };
    expect(await source.stores.claims.add([claim], [], stamp, [])).toBe('written');
    await source.stores.runtimeCommands.insertBinding(
      { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
      {
        claimId: 'bound',
        workItemId: 'leaf',
        stepId: 'dev',
        parentClaimId: null,
        execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'actual' },
      },
    );
    await source.stores.workItems.insert(workItemRow({ id: 'moved', projectId: 'a1' }), [], stamp);
    await source.stores.claims.moveAll('leaf', 'moved', stamp);
    expect(await receiver.readRuntimeState(context, {})).toMatchObject({
      ok: true,
      value: {
        claims: [
          {
            kind: 'runtime',
            claim: { id: 'bound', workItemId: 'moved', runId: 'actual' },
            binding: { claimId: 'bound', workItemId: 'leaf', execution: { sessionId: 'actual' } },
          },
        ],
      },
    });
  });
  for (const corruption of [
    'digest',
    'bytes',
    'scope-person',
    'scope-organization',
    'scope-project',
    'command',
    'ledger',
    'owner',
    'generation',
    'kind',
  ] as const) {
    it(`throws for retained ${corruption} corruption before replay or lookup`, async () => {
      const { receiver, sqlite, source, acquisition } = await seeded();
      receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
      const stored = await source.stores.runtimeCommands.readAcceptance(
        { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
        'first',
      );
      if (stored === null) throw new Error('accepted fixture missing');
      const parsed = JSON.parse(stored.canonicalRequest) as {
        operation: { ownerId: string };
        scope: { personId: string; organizationId: string; projectId: string };
        commandId: string;
        expectedLedgerId: string;
      };
      let acceptance = stored.receipt.acceptance;
      if (corruption === 'scope-person') parsed.scope.personId = 'changed';
      if (corruption === 'scope-organization') parsed.scope.organizationId = 'changed';
      if (corruption === 'scope-project') parsed.scope.projectId = 'changed';
      if (corruption === 'command') parsed.commandId = 'changed';
      if (corruption === 'ledger') parsed.expectedLedgerId = 'changed';
      if (corruption === 'owner')
        acceptance = { ...acceptance, authority: { ...acceptance.authority, ownerId: 'changed' } };
      if (corruption === 'generation')
        acceptance = { ...acceptance, authority: { ...acceptance.authority, generation: 3 } };
      if (corruption === 'kind') {
        acceptance = {
          kind: 'claim',
          authority: { ownerId: 'owner-a', generation: 1 },
          claim: {
            claimId: 'generated',
            workItemId: 'leaf',
            stepId: 'dev',
            parentClaimId: null,
            execution: {
              storeId: 'store',
              runId: 'run',
              attemptId: 'attempt',
              sessionId: 'session',
            },
          },
          basisAfter: `rb1:${'a'.repeat(64)}`,
        };
      }
      const canonicalRequest = JSON.stringify(parsed) + (corruption === 'bytes' ? ' ' : '');
      const requestDigest =
        corruption === 'digest' ? '0'.repeat(64) : await nodeDigest.sha256(canonicalRequest);
      const corrupted = {
        ...stored,
        canonicalRequest,
        requestDigest,
        receipt: { ...stored.receipt, requestDigest, acceptance },
      };
      const immutable = sqlite.db.get<{ sql: string } | undefined>(
        "SELECT sql FROM sqlite_master WHERE name='runtime_command_receipt_no_update'",
      );
      if (immutable === undefined) throw new Error('receipt immutable trigger missing');
      sqlite.db.run('DROP TRIGGER runtime_command_receipt_no_update');
      sqlite.db.run(
        `UPDATE runtime_command_receipt SET accepted='${JSON.stringify(corrupted).replaceAll("'", "''")}' WHERE command_id='first'`,
      );
      sqlite.db.run(immutable.sql);
      const expectedError =
        corruption === 'digest'
          ? 'runtime canonical request digest mismatch'
          : corruption === 'bytes'
            ? 'runtime request bytes are not canonical'
            : ['owner', 'generation', 'kind'].includes(corruption)
              ? 'runtime request acceptance mismatch'
              : 'runtime canonical receipt identity mismatch';
      await assertRuntimeRejection(
        receiver.acquireRuntimeAuthority(context, acquisition),
        expectedError,
      );
      await assertRuntimeRejection(
        receiver.lookupRuntimeReceipt(context, {
          commandId: 'first',
          expectedLedgerId: acquisition.expectedLedgerId,
        }),
        expectedError,
      );
    });
  }
  it('verifies complete retained claim/write request correspondence without treating generated historical facts as current state', async () => {
    const { receiver, source, acquisition } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    const scope = { organizationId: 'org-a', projectId: 'a1', personId: 'agent' };
    const authority = { ownerId: 'owner-a', generation: 1 };
    const execution = {
      storeId: 'store',
      runId: 'run',
      attemptId: 'attempt',
      sessionId: 'session',
    };
    const claim = {
      claimId: 'historical',
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution,
    };
    const expectedBasis = `rb1:${'a'.repeat(64)}`;
    const basisAfter = `rb1:${'b'.repeat(64)}`;
    const claimAction = {
      kind: 'claim' as const,
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution,
    };
    const claimAcceptance = { kind: 'claim' as const, authority, claim, basisAfter };
    const writeAction = {
      kind: 'write' as const,
      claim,
      commands: [
        { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
      ],
    };
    const writeAcceptance = {
      kind: 'write' as const,
      authority,
      claim,
      basisAfter,
      applied: [{ index: 0, kind: 'setProgress' as const }],
    };
    const changedClaims = [
      { ...claim, claimId: 'changed' },
      { ...claim, workItemId: 'changed' },
      { ...claim, stepId: 'changed' },
      { ...claim, parentClaimId: 'changed' },
      ...(['storeId', 'runId', 'attemptId', 'sessionId'] as const).map((field) => ({
        ...claim,
        execution: { ...execution, [field]: 'changed' },
      })),
    ];
    const corruptions: RuntimeReceipt['acceptance'][] = [
      { kind: 'claim', authority, claim, basisAfter },
      { ...writeAcceptance, authority: { ownerId: 'changed', generation: 1 } },
      { ...writeAcceptance, authority: { ownerId: 'owner-a', generation: 2 } },
      ...changedClaims.map((changed) => ({ ...writeAcceptance, claim: changed })),
      { ...writeAcceptance, applied: [] },
      { ...writeAcceptance, applied: [{ index: 1, kind: 'setProgress' }] },
      { ...writeAcceptance, applied: [{ index: 0, kind: 'setMeasure' }] },
    ];
    const fixtures: {
      commandId: string;
      action: RuntimeCommandRequest['action'];
      acceptance: RuntimeReceipt['acceptance'];
      valid: boolean;
    }[] = [
      { commandId: 'claim', action: claimAction, acceptance: claimAcceptance, valid: true },
      { commandId: 'write', action: writeAction, acceptance: writeAcceptance, valid: true },
      ...corruptions.map((acceptance, index) => ({
        commandId: `invalid-write-${String(index)}`,
        action: writeAction,
        acceptance,
        valid: false,
      })),
      ...changedClaims.slice(1).map((changed, index) => ({
        commandId: `invalid-claim-${String(index)}`,
        action: claimAction,
        acceptance: { ...claimAcceptance, claim: changed },
        valid: false,
      })),
    ];
    for (const fixture of fixtures) {
      const { commandId, action, acceptance } = fixture;
      // Explicit trusted-record fixtures exercise future receipt variants only; this is not application acceptance.
      const canonicalRequest = canonicalRuntimeRequest(scope, {
        schemaVersion: 1,
        commandId,
        expectedLedgerId: acquisition.expectedLedgerId,
        authority,
        expectedBasis,
        action,
      });
      const requestDigest = await nodeDigest.sha256(canonicalRequest);
      const retained: RuntimeReceipt = {
        schemaVersion: 1,
        ledgerId: acquisition.expectedLedgerId,
        scope,
        commandId,
        requestDigest,
        actorId: 'historical-actor',
        acceptance,
      };
      await source.stores.runtimeCommands.insertAcceptance({
        schemaVersion: 1,
        scope,
        commandId,
        canonicalRequest,
        requestDigest,
        receipt: retained,
      });
      const lookup = receiver.lookupRuntimeReceipt(context, {
        commandId,
        expectedLedgerId: acquisition.expectedLedgerId,
      });
      if (fixture.valid) {
        expect(await lookup).toEqual({ ok: true, value: retained });
        expect(
          await receiver.acquireRuntimeAuthority(context, { ...acquisition, commandId }),
        ).toEqual({ ok: false, reason: 'runtime_command_conflict' });
      } else await assertRuntimeRejection(lookup, 'runtime request acceptance mismatch');
    }
  });
  it('throws for missing ledger and retained history loss before claiming uninitialized scope or receipt absence', async () => {
    const { receiver, sqlite, acquisition } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    const immutable = sqlite.db.get<{ sql: string } | undefined>(
      "SELECT sql FROM sqlite_master WHERE name='runtime_command_receipt_no_delete'",
    );
    if (immutable === undefined) throw new Error('receipt immutable trigger missing');
    sqlite.db.run('DROP TRIGGER runtime_command_receipt_no_delete');
    sqlite.db.run('DELETE FROM runtime_command_receipt');
    sqlite.db.run(immutable.sql);
    await assertRuntimeRejection(
      receiver.lookupRuntimeReceipt(context, {
        commandId: 'missing',
        expectedLedgerId: acquisition.expectedLedgerId,
      }),
    );
    await assertRuntimeRejection(receiver.readRuntimeState(context, {}));
    sqlite.db.run('DROP TABLE runtime_ledger');
    await assertRuntimeRejection(receiver.acquireRuntimeAuthority(context, acquisition));
  });
});

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
describe('accepted runtime lifecycle', () => {
  it('refuses down permanently after real acceptance even with all ordinary claims released', async () => {
    const { receiver, source, sqlite, acquisition, dbPath } = await seeded();
    receipt(await receiver.acquireRuntimeAuthority(context, acquisition));
    const claims = [
      {
        id: 'claim',
        workItemId: 'leaf',
        stepId: 'dev',
        personId: 'agent',
        runId: 'session',
        parentClaimId: null,
        accountId: 'ada',
      },
    ];
    expect(await source.stores.claims.add(claims, [], stamp, [])).toBe('written');
    await source.stores.claims.remove(claims, [], stamp);
    expect(await source.stores.claims.listByProject('a1')).toEqual([]);
    const readInstallation = () => ({
      migrations: sqlite.db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY id'),
      schema: sqlite.db.all('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name'),
      ledger: sqlite.db.all('SELECT * FROM runtime_ledger ORDER BY id'),
      authority: sqlite.db.all('SELECT * FROM runtime_authority ORDER BY rowid'),
      bindings: sqlite.db.all('SELECT * FROM runtime_claim_binding ORDER BY rowid'),
      receipts: sqlite.db.all('SELECT * FROM runtime_command_receipt ORDER BY rowid'),
    });
    const installed = readInstallation();
    expect(installed.migrations.slice(-15)).toMatchObject([
      { name: '20261022130000_add_organization_limits' },
      { name: '20261022130100_widen_organization_audit_organization_limits' },
      { name: '20261022140000_add_resource_provider' },
      { name: '20261022140100_widen_organization_audit_compute_providers' },
      { name: '20261023100000_add_claim_lease' },
      { name: '20261023140000_add_measure' },
      { name: '20261023150000_key_step_measure' },
      { name: '20261023160000_add_measure_estimate' },
      { name: '20261023170000_add_work_item_budget' },
      { name: '20261025120000_add_resource_use' },
      { name: '20261025130000_add_resource_runtime' },
      { name: '20261026120000_add_command_journal_person' },
      { name: '20261026130000_widen_organization_audit_machine_tokens' },
      { name: '20261028100000_add_agent_pool' },
      { name: '20261028100100_widen_organization_audit_agent_pools' },
    ]);
    expect(rollbackTo(dbPath, migrations, '20261022121000_add_runtime_commands')).toEqual([
      '20261028100100_widen_organization_audit_agent_pools',
      '20261028100000_add_agent_pool',
      '20261026130000_widen_organization_audit_machine_tokens',
      '20261026120000_add_command_journal_person',
      '20261025130000_add_resource_runtime',
      '20261025120000_add_resource_use',
      '20261023170000_add_work_item_budget',
      '20261023160000_add_measure_estimate',
      '20261023150000_key_step_measure',
      '20261023140000_add_measure',
      '20261023100000_add_claim_lease',
      '20261022140100_widen_organization_audit_compute_providers',
      '20261022140000_add_resource_provider',
      '20261022130100_widen_organization_audit_organization_limits',
      '20261022130000_add_organization_limits',
    ]);
    const before = readInstallation();
    expect(before.migrations).toEqual(installed.migrations.slice(0, -15));
    expect(() => rollbackTo(dbPath, migrations, '20261020130000_add_claim_occupancy')).toThrow(
      'runtime history',
    );
    expect(readInstallation()).toEqual(before);
    runMigrations(dbPath, migrations);
    expect(readInstallation()).toEqual(installed);
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'first',
        expectedLedgerId: acquisition.expectedLedgerId,
      }),
    ).toMatchObject({ ok: true });
  });
  it('refuses the old pin after unused down/up before uninitialized scope or absence', async () => {
    const { receiver, acquisition, dbPath } = await seeded();
    expect(await receiver.readRuntimeState(context, {})).toMatchObject({
      ok: true,
      value: { authority: { kind: 'uninitialized' } },
    });
    expect(rollbackTo(dbPath, migrations, '20261020130000_add_claim_occupancy')).toContain(
      '20261022121000_add_runtime_commands',
    );
    runMigrations(dbPath, migrations);
    expect(
      await receiver.readRuntimeState(context, { expectedLedgerId: acquisition.expectedLedgerId }),
    ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
    expect(await receiver.acquireRuntimeAuthority(context, acquisition)).toEqual({
      ok: false,
      reason: 'runtime_ledger_mismatch',
    });
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'missing',
        expectedLedgerId: acquisition.expectedLedgerId,
      }),
    ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
  });
});
