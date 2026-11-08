import type { Source, StoredRuntimeAcceptance, TransactionalStores } from '@wbs/core';
import { expect, it } from 'bun:test';

/** Opaque historical scope intentionally has no dependency on current project/person existence. */
export const RUNTIME_SCOPE = { organizationId: 'org', projectId: 'project', personId: 'person' };
export const RUNTIME_CLAIM = {
  claimId: 'claim',
  workItemId: 'work',
  stepId: 'step',
  parentClaimId: null,
  execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
};

/** Raw persistence fixture; this does not claim application admission occurred. */
export function runtimeAcceptanceFixture(
  ledgerId: string,
  commandId = 'command',
): StoredRuntimeAcceptance {
  return {
    schemaVersion: 1,
    scope: RUNTIME_SCOPE,
    commandId,
    canonicalRequest: '["authority",1]',
    requestDigest: 'a'.repeat(64),
    receipt: {
      schemaVersion: 1,
      ledgerId,
      scope: RUNTIME_SCOPE,
      commandId,
      requestDigest: 'a'.repeat(64),
      actorId: 'actor',
      acceptance: { kind: 'authority', authority: { ownerId: 'owner', generation: 1 } },
    },
  };
}

/** Real-provider checks for permanent storage and its surrounding unit of work. */
export function runtimeCommandConformance(
  open: () => Promise<{
    source: Source<TransactionalStores>;
    close(): Promise<void>;
  }>,
): void {
  async function withSource(check: (source: Source<TransactionalStores>) => Promise<void>) {
    const opened = await open();
    try {
      await check(opened.source);
    } finally {
      await opened.close();
    }
  }
  it('compares generations and retains one authority count across takeover', () =>
    withSource(async (source) => {
      const store = source.stores.runtimeCommands;
      expect(store).toBeDefined();
      const initial = await store.inspectLedger();
      expect(initial).toMatchObject({
        schemaVersion: 1,
        authorityCount: 0,
        bindingCount: 0,
        receiptCount: 0,
      });
      expect(initial.ledgerId.length).toBeGreaterThan(0);
      expect(await store.readAuthority(RUNTIME_SCOPE)).toBeNull();
      expect(await store.compareAuthority(RUNTIME_SCOPE, 0, 'owner')).toBeNull();
      expect(await store.compareAuthority(RUNTIME_SCOPE, null, 'owner')).toEqual({
        ownerId: 'owner',
        generation: 1,
      });
      expect(await store.compareAuthority(RUNTIME_SCOPE, null, 'other')).toBeNull();
      expect(await store.compareAuthority(RUNTIME_SCOPE, 1, 'other')).toEqual({
        ownerId: 'other',
        generation: 2,
      });
      expect(await store.compareAuthority(RUNTIME_SCOPE, 1, 'stale')).toBeNull();
      expect(await store.readAuthority(RUNTIME_SCOPE)).toEqual({ ownerId: 'other', generation: 2 });
      expect(await store.inspectLedger()).toEqual({ ...initial, authorityCount: 1 });
    }));
  it('retains exact detached claim and unique store-attempt binding', () =>
    withSource(async (source) => {
      const store = source.stores.runtimeCommands;
      await store.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      expect(await store.readBinding(RUNTIME_SCOPE, 'claim')).toEqual(RUNTIME_CLAIM);
      expect(await store.readAttemptBinding(RUNTIME_SCOPE, 'store', 'attempt')).toEqual(
        RUNTIME_CLAIM,
      );
      const detached = await store.readBinding(RUNTIME_SCOPE, 'claim');
      if (detached === null) throw new Error('fixture binding missing');
      Object.assign(detached.execution, { sessionId: 'changed' });
      expect(await store.readBinding(RUNTIME_SCOPE, 'claim')).toEqual(RUNTIME_CLAIM);
      await assertRuntimeRejection(
        store.insertBinding(RUNTIME_SCOPE, { ...RUNTIME_CLAIM, claimId: 'new-claim' }),
      );
      await assertRuntimeRejection(
        store.insertBinding(RUNTIME_SCOPE, {
          ...RUNTIME_CLAIM,
          execution: { ...RUNTIME_CLAIM.execution, attemptId: 'new-attempt' },
        }),
      );
      await store.insertBinding({ ...RUNTIME_SCOPE, personId: 'other' }, RUNTIME_CLAIM);
      await store.insertBinding(RUNTIME_SCOPE, {
        ...RUNTIME_CLAIM,
        claimId: 'other-store-claim',
        execution: { ...RUNTIME_CLAIM.execution, storeId: 'other-store' },
      });
      expect(
        await store.readAttemptBinding(RUNTIME_SCOPE, 'other-store', 'attempt'),
      ).toHaveProperty('claimId', 'other-store-claim');
      expect(await store.inspectLedger()).toHaveProperty('bindingCount', 3);
    }));
  it('retains one immutable acceptance per scoped command ID', () =>
    withSource(async (source) => {
      const store = source.stores.runtimeCommands;
      const { ledgerId } = await store.inspectLedger();
      const accepted = runtimeAcceptanceFixture(ledgerId);
      expect(await store.readAcceptance(RUNTIME_SCOPE, 'command')).toBeNull();
      await store.insertAcceptance(accepted);
      expect(await store.readAcceptance(RUNTIME_SCOPE, 'command')).toEqual(accepted);
      await assertRuntimeRejection(
        store.insertAcceptance({ ...accepted, canonicalRequest: '["changed"]' }),
      );
      const detached = await store.readAcceptance(RUNTIME_SCOPE, 'command');
      if (detached === null) throw new Error('fixture acceptance missing');
      Object.assign(detached.receipt, { actorId: 'changed' });
      expect(await store.readAcceptance(RUNTIME_SCOPE, 'command')).toEqual(accepted);
      expect(await store.inspectLedger()).toHaveProperty('receiptCount', 1);
    }));
  it('commits all records and counters together and discards refused writes', () =>
    withSource(async (source) => {
      const initial = await source.stores.runtimeCommands.inspectLedger();
      for (const commit of [false, true]) {
        await source.uow.run(async ({ stores }) => {
          await stores.runtimeCommands.compareAuthority(RUNTIME_SCOPE, null, 'owner');
          await stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
          await stores.runtimeCommands.insertAcceptance(runtimeAcceptanceFixture(initial.ledgerId));
          return { commit, value: undefined };
        });
        expect(await source.stores.runtimeCommands.inspectLedger()).toEqual({
          ...initial,
          authorityCount: commit ? 1 : 0,
          bindingCount: commit ? 1 : 0,
          receiptCount: commit ? 1 : 0,
        });
        expect(await source.stores.runtimeCommands.readBinding(RUNTIME_SCOPE, 'claim')).toEqual(
          commit ? RUNTIME_CLAIM : null,
        );
        expect(
          await source.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'command'),
        ).toEqual(commit ? runtimeAcceptanceFixture(initial.ledgerId) : null);
      }
    }));
  it('rolls back earlier mutations when a real duplicate receipt write fails late', () =>
    withSource(async (source) => {
      const store = source.stores.runtimeCommands;
      const { ledgerId } = await store.inspectLedger();
      await store.insertAcceptance(runtimeAcceptanceFixture(ledgerId));
      await assertRuntimeRejection(
        source.uow.run(async ({ stores }) => {
          await stores.runtimeCommands.compareAuthority(RUNTIME_SCOPE, null, 'owner');
          await stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
          await stores.runtimeCommands.insertAcceptance(runtimeAcceptanceFixture(ledgerId));
          return { commit: true, value: undefined };
        }),
      );
      expect(await store.readAuthority(RUNTIME_SCOPE)).toBeNull();
      expect(await store.readBinding(RUNTIME_SCOPE, 'claim')).toBeNull();
      expect(await store.inspectLedger()).toMatchObject({
        authorityCount: 0,
        bindingCount: 0,
        receiptCount: 1,
      });
    }));
}

/** Malformed trusted records must throw before a row or retained counter changes. */
export function runtimeRecordConformance(
  open: () => Promise<{ source: Source<TransactionalStores>; close(): Promise<void> }>,
): void {
  it('stores all three complete acceptance variants without placeholders', async () => {
    const opened = await open();
    try {
      const store = opened.source.stores.runtimeCommands;
      const { ledgerId } = await store.inspectLedger();
      const authority = { ownerId: 'owner', generation: 1 };
      const basisAfter = `rb1:${'b'.repeat(64)}`;
      const variants = [
        { kind: 'authority', authority },
        { kind: 'claim', authority, claim: RUNTIME_CLAIM, basisAfter },
        {
          kind: 'write',
          authority,
          claim: RUNTIME_CLAIM,
          basisAfter,
          applied: [
            { index: 0, kind: 'setProgress' },
            { index: 1, kind: 'releaseWorkItem' },
          ],
        },
      ] as const;
      for (const [index, acceptance] of variants.entries()) {
        const fixture = runtimeAcceptanceFixture(ledgerId, `command-${String(index)}`);
        const accepted = { ...fixture, receipt: { ...fixture.receipt, acceptance } };
        await store.insertAcceptance(accepted);
        expect(await store.readAcceptance(RUNTIME_SCOPE, fixture.commandId)).toEqual(accepted);
      }
    } finally {
      await opened.close();
    }
  });
  for (const boundary of ['ID types', 'undeclared fields'] as const) {
    it(`refuses malformed binding scope ${boundary} without changing retained rows or counters`, async () => {
      const opened = await open();
      try {
        const store = opened.source.stores.runtimeCommands;
        await store.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
        const before = await store.inspectLedger();
        const incoming = {
          ...RUNTIME_CLAIM,
          claimId: 'next-claim',
          execution: { ...RUNTIME_CLAIM.execution, attemptId: 'next-attempt' },
        };
        const scopes: (typeof RUNTIME_SCOPE)[] = [];
        if (boundary === 'ID types') {
          for (const field of ['organizationId', 'projectId', 'personId']) {
            for (const invalid of [new Uint8Array([1, 2]), 42, null, undefined, true, '']) {
              const scope = { ...RUNTIME_SCOPE };
              Reflect.set(scope, field, invalid);
              scopes.push(scope);
            }
          }
        } else scopes.push({ ...RUNTIME_SCOPE, ...{ unexpected: 'field' } });
        for (const scope of scopes) {
          await assertRuntimeRejection(store.insertBinding(scope, incoming));
          expect(await store.inspectLedger()).toEqual(before);
          expect(await store.readBinding(RUNTIME_SCOPE, 'claim')).toEqual(RUNTIME_CLAIM);
          expect(await store.readBinding(RUNTIME_SCOPE, 'next-claim')).toBeNull();
          expect(await store.readAttemptBinding(RUNTIME_SCOPE, 'store', 'attempt')).toEqual(
            RUNTIME_CLAIM,
          );
          expect(await store.readAttemptBinding(RUNTIME_SCOPE, 'store', 'next-attempt')).toBeNull();
        }
        await store.insertBinding(RUNTIME_SCOPE, incoming);
        expect(await store.readBinding(RUNTIME_SCOPE, 'next-claim')).toEqual(incoming);
        expect(await store.inspectLedger()).toEqual({ ...before, bindingCount: 2 });
      } finally {
        await opened.close();
      }
    });
  }
  it('refuses malformed trusted scope and nested records without partial counters', async () => {
    const opened = await open();
    try {
      const store = opened.source.stores.runtimeCommands;
      const initial = await store.inspectLedger();
      await assertRuntimeRejection(
        store.compareAuthority({ ...RUNTIME_SCOPE, personId: '' }, null, 'owner'),
      );
      await assertRuntimeRejection(store.compareAuthority(RUNTIME_SCOPE, null, ''));
      for (const binding of [
        { ...RUNTIME_CLAIM, execution: { ...RUNTIME_CLAIM.execution, sessionId: '' } },
        { ...RUNTIME_CLAIM, execution: { ...RUNTIME_CLAIM.execution, sessionId: 's'.repeat(257) } },
        { ...RUNTIME_CLAIM, unexpected: () => undefined },
      ])
        await assertRuntimeRejection(store.insertBinding(RUNTIME_SCOPE, binding));
      const fixture = runtimeAcceptanceFixture(initial.ledgerId);
      for (const accepted of [
        { ...fixture, receipt: { ...fixture.receipt, ledgerId: 'other-ledger' } },
        { ...fixture, receipt: { ...fixture.receipt, commandId: 'other-command' } },
        { ...fixture, receipt: { ...fixture.receipt, requestDigest: 'b'.repeat(64) } },
        {
          ...fixture,
          receipt: { ...fixture.receipt, scope: { ...RUNTIME_SCOPE, personId: 'other' } },
        },
        {
          ...fixture,
          requestDigest: 'invalid',
          receipt: { ...fixture.receipt, requestDigest: 'invalid' },
        },
        {
          ...fixture,
          receipt: {
            ...fixture.receipt,
            acceptance: {
              kind: 'authority' as const,
              authority: { ownerId: 'owner', generation: 0 },
            },
          },
        },
        {
          ...fixture,
          receipt: {
            ...fixture.receipt,
            acceptance: {
              kind: 'authority' as const,
              authority: { ownerId: 'owner', generation: Number.MAX_SAFE_INTEGER + 1 },
            },
          },
        },
      ])
        await assertRuntimeRejection(store.insertAcceptance(accepted));
      expect(await store.inspectLedger()).toEqual(initial);
    } finally {
      await opened.close();
    }
  });
}

/** Awaits the real operation before asserting rejection and subsequent durable state. */
export async function assertRuntimeRejection(
  operation: Promise<unknown>,
  message?: string | RegExp,
): Promise<void> {
  await operation.then(
    () => {
      throw new Error('runtime persistence operation unexpectedly resolved');
    },
    (cause: unknown) => {
      expect(() => {
        throw cause;
      }).toThrow(message);
    },
  );
}
