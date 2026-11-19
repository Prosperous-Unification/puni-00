import type { StepBindingsReordered, StepCatalogue } from '@wbs/core';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

export type ReadReorderAudit = (projectId: string) => {
  readonly revision: number;
  readonly updatedAt: number | null;
};
type Observed<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };

async function observeReorder<Value>(call: () => Value | Promise<Value>): Promise<Observed<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

async function prepareReorder(fixture: StepCatalogueFixture) {
  const { port, seed } = fixture;
  for (const [index, bindingId] of ['reorder-life-a', 'reorder-life-b'].entries()) {
    const position = (index + 1) * 10;
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: bindingId + ':step',
            code: bindingId,
            name: bindingId,
            position,
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 7,
          },
          {
            bindingId,
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: null,
            position,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  const catalogue = await port.readCatalogue(seed.organizationId);
  if (catalogue === null) throw Error('required current catalogue absent after genuine writes');
  expect(
    catalogue.bindings.map(({ bindingId, position }) => ({
      bindingId,
      position,
    })),
  ).toEqual([
    { bindingId: 'reorder-life-a', position: 10 },
    { bindingId: 'reorder-life-b', position: 20 },
  ]);
  expect(
    await port.reorderBindings(
      seed.organizationId,
      { scopeKind: 'project', scopeId: seed.projectId },
      ['reorder-life-a', 'reorder-life-b'],
      seed.stamp,
    ),
  ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
  return {
    scope: { scopeKind: 'project' as const, scopeId: seed.projectId },
    next: ['reorder-life-b', 'reorder-life-a'],
  };
}

async function expectReorderClosed(call: () => Promise<StepBindingsReordered>) {
  const observed = await observeReorder(call);
  expect(observed.ok).toBe(false);
  if (observed.ok) throw Error('settled reorder capability unexpectedly resolved');
  expect(observed.cause).toBeInstanceOf(Error);
  if (!(observed.cause instanceof Error)) throw observed.cause;
  expect(observed.cause.message).toContain('closed');
}

async function queuedRetention(
  fixture: StepCatalogueFixture,
  readAudit: ReadReorderAudit,
  field: 'scope' | 'ids' | 'stamp',
) {
  const { scope, next } = await prepareReorder(fixture),
    { source, port, seed } = fixture;
  const before = fixture.readEvidence(),
    audit = readAudit(seed.projectId),
    at = seed.stamp.at + 17,
    stamp = { by: seed.stamp.by, at };
  let pending: Promise<Observed<StepBindingsReordered>> | undefined;
  const held = await observeReorder(() =>
    source.uow.run(() => {
      pending = observeReorder(() => port.reorderBindings(seed.organizationId, scope, next, stamp));
      if (field === 'scope') scope.scopeId = seed.siblingProjectId;
      if (field === 'ids') next.reverse();
      if (field === 'stamp') stamp.at = at + 900;
      return Promise.resolve({
        commit: false,
        value: 'actual holding writer released',
      });
    }),
  );
  const queued = pending;
  if (queued === undefined) {
    if (!held.ok) throw held.cause;
    throw Error('required actual reorder call was not queued');
  }
  const settled = await queued;
  if (!held.ok) {
    if (!settled.ok)
      throw new AggregateError(
        [held.cause, settled.cause],
        'holding writer and queued reorder failed',
        { cause: settled.cause },
      );
    throw held.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(held.value).toBe('actual holding writer released');
  if (field === 'scope') expect(scope.scopeId).toBe(seed.siblingProjectId);
  if (field === 'ids') expect(next).toEqual(['reorder-life-a', 'reorder-life-b']);
  if (field === 'stamp') expect(stamp.at).toBe(at + 900);
  expect(settled.value).toEqual({
    ok: true,
    workPackageIds: [seed.workPackageId],
    projectIds: [seed.projectId],
  });
  expect(readAudit(seed.projectId)).toEqual({
    revision: audit.revision + 1,
    updatedAt: at,
  });
  expect(
    (await port.readCatalogue(seed.organizationId))?.bindings.map(({ bindingId, position }) => ({
      bindingId,
      position,
    })),
  ).toEqual([
    { bindingId: 'reorder-life-a', position: 20 },
    { bindingId: 'reorder-life-b', position: 10 },
  ]);
  expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
}

async function expiredLoan(
  fixture: StepCatalogueFixture,
  _readAudit: ReadReorderAudit,
  kind: 'ordinary' | 'repair',
) {
  const { scope, next } = await prepareReorder(fixture),
    { source, port, seed } = fixture;
  const retained: { port: StepCatalogue | undefined } = { port: undefined };
  if (kind === 'ordinary') {
    await source.uow.run(async ({ stores }) => {
      retained.port = stores.stepCatalogue;
      expect(
        await stores.stepCatalogue.reorderBindings(
          seed.organizationId,
          scope,
          ['reorder-life-a', 'reorder-life-b'],
          seed.stamp,
        ),
      ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
      return { commit: true, value: undefined };
    });
  } else {
    await source.uow.run<undefined>(() =>
      Promise.resolve({
        commit: false,
        value: undefined,
        afterRollback: async ({ stores }) => {
          retained.port = stores.stepCatalogue;
          expect(
            await stores.stepCatalogue.reorderBindings(
              seed.organizationId,
              scope,
              ['reorder-life-a', 'reorder-life-b'],
              seed.stamp,
            ),
          ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
        },
      }),
    );
  }
  const expired = retained.port;
  if (expired === undefined) throw Error('actual reorder loan was not retained');
  const before = fixture.readEvidence();
  await expectReorderClosed(() =>
    expired.reorderBindings(seed.organizationId, scope, next, seed.stamp),
  );
  expect(fixture.readEvidence()).toEqual(before);
  const useFresh = async (stores: StepCatalogueFixture['source']['stores']) => {
    expect(
      await stores.stepCatalogue.reorderBindings(
        seed.organizationId,
        scope,
        ['reorder-life-a', 'reorder-life-b'],
        seed.stamp,
      ),
    ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
    await expectReorderClosed(() =>
      expired.reorderBindings(seed.organizationId, scope, next, seed.stamp),
    );
  };
  if (kind === 'ordinary')
    await source.uow.run(async ({ stores }) => {
      await useFresh(stores);
      return { commit: false, value: undefined };
    });
  else
    await source.uow.run<undefined>(() =>
      Promise.resolve({
        commit: false,
        value: undefined,
        afterRollback: async ({ stores }) => await useFresh(stores),
      }),
    );
  expect(fixture.readEvidence()).toEqual(before);
  expect(
    await port.reorderBindings(
      seed.organizationId,
      scope,
      ['reorder-life-a', 'reorder-life-b'],
      seed.stamp,
    ),
  ).toEqual({ ok: true, workPackageIds: [], projectIds: [] });
}

async function sourceClosed(fixture: StepCatalogueFixture) {
  const { scope, next } = await prepareReorder(fixture),
    { port, seed } = fixture;
  const catalogue = await port.readCatalogue(seed.organizationId);
  if (catalogue === null) throw Error('catalogue absent before actual Source close');
  await fixture.close();
  await expectReorderClosed(() =>
    port.reorderBindings(seed.organizationId, scope, next, seed.stamp),
  );
  await expectReorderClosed(() => port.reorderBindings(seed.organizationId, scope, [], seed.stamp));
  expect(catalogue.bindings.map((binding) => binding.bindingId)).toEqual([
    'reorder-life-a',
    'reorder-life-b',
  ]);
}

async function detachedSuccess(fixture: StepCatalogueFixture) {
  const { scope, next } = await prepareReorder(fixture),
    { port, seed } = fixture;
  const changed = await port.reorderBindings(seed.organizationId, scope, next, seed.stamp);
  expect(changed).toEqual({
    ok: true,
    workPackageIds: [seed.workPackageId],
    projectIds: [seed.projectId],
  });
  if (!changed.ok) throw Error('actual reorder did not succeed before detachment oracle');
  const before = fixture.readEvidence();
  Reflect.set(changed.workPackageIds, '0', 'caller-mutated-package');
  Reflect.set(changed.projectIds, '0', 'caller-mutated-project');
  expect(fixture.readEvidence()).toEqual(before);
  expect(
    await port.reorderBindings(
      seed.organizationId,
      scope,
      ['reorder-life-a', 'reorder-life-b'],
      seed.stamp,
    ),
  ).toEqual({
    ok: true,
    workPackageIds: [seed.workPackageId],
    projectIds: [seed.projectId],
  });
}

async function malformedBoundary(fixture: StepCatalogueFixture) {
  const { scope } = await prepareReorder(fixture),
    { port, seed } = fixture,
    before = fixture.readEvidence();
  for (const [organization, address, ids, stamp] of [
    ['', scope, ['reorder-life-b', 'reorder-life-a'], seed.stamp],
    [seed.organizationId, undefined, ['reorder-life-b', 'reorder-life-a'], seed.stamp],
    [seed.organizationId, { scopeKind: 'work_package', scopeId: seed.projectId }, [], seed.stamp],
    [seed.organizationId, scope, undefined, seed.stamp],
    [seed.organizationId, scope, 'not-an-array', seed.stamp],
    [seed.organizationId, scope, [3], seed.stamp],
    [seed.organizationId, scope, [''], seed.stamp],
    [
      seed.organizationId,
      scope,
      ['reorder-life-b', 'reorder-life-a'],
      { by: seed.stamp.by, at: 0.5 },
    ],
  ]) {
    const observed = await observeReorder(() =>
      Reflect.apply(port.reorderBindings, port, [organization, address, ids, stamp]),
    );
    expect(observed.ok).toBe(false);
    if (observed.ok) throw Error('malformed direct catalogue reorder resolved');
    expect(observed.cause).toBeInstanceOf(Error);
    expect(fixture.readEvidence()).toEqual(before);
  }
}

async function queuedClose(fixture: StepCatalogueFixture) {
  const { scope, next } = await prepareReorder(fixture),
    { source, port, seed } = fixture;
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const writer = observeReorder(() =>
    source.uow.run(async () => {
      entered.resolve();
      await release.promise;
      return { commit: false, value: 'held reorder writer rolled back' };
    }),
  ).then((observed) => {
    if (!observed.ok) entered.reject(observed.cause);
    return observed;
  });
  const owned: {
    queued: Promise<Observed<StepBindingsReordered>> | undefined;
    closing: Promise<Observed<void>> | undefined;
  } = { queued: undefined, closing: undefined };
  let primary: { cause: unknown } | undefined;
  try {
    await entered.promise;
    owned.queued = observeReorder(() =>
      port.reorderBindings(seed.organizationId, scope, next, seed.stamp),
    );
    owned.closing = observeReorder(() => fixture.close());
  } catch (cause: unknown) {
    primary = { cause };
  }
  release.resolve();
  const settled = await writer,
    queued = owned.queued === undefined ? undefined : await owned.queued,
    closing = owned.closing === undefined ? undefined : await owned.closing;
  if (primary !== undefined || closing === undefined || !closing.ok) {
    const causes: unknown[] = [];
    if (primary !== undefined) causes.push(primary.cause);
    if (!settled.ok) causes.push(settled.cause);
    if (queued !== undefined && !queued.ok) causes.push(queued.cause);
    if (closing !== undefined && !closing.ok) causes.push(closing.cause);
    throw new AggregateError(causes, 'queued reorder setup or actual Source close failed');
  }
  if (settled.ok) expect(settled.value).toBe('held reorder writer rolled back');
  else expect(String(settled.cause)).toMatch(/closed/);
  expect(queued).toBeDefined();
  if (queued === undefined) throw Error('actual queued reorder was not acquired');
  expect(queued.ok).toBe(false);
  if (queued.ok) throw Error('queued reorder resolved after Source close');
  expect(String(queued.cause)).toMatch(/closed/);
}

export const CATALOGUE_REORDER_LIFETIME_ASSERTIONS = [
  ...(['scope', 'ids', 'stamp'] as const).map((field) => ({
    caseId: 'reorder-life:queued-' + field,
    assert: (fixture: StepCatalogueFixture, readAudit: ReadReorderAudit) =>
      queuedRetention(fixture, readAudit, field),
  })),
  {
    caseId: 'reorder-life:ordinary-expiry',
    assert: (fixture: StepCatalogueFixture, readAudit: ReadReorderAudit) =>
      expiredLoan(fixture, readAudit, 'ordinary'),
  },
  {
    caseId: 'reorder-life:repair-expiry',
    assert: (fixture: StepCatalogueFixture, readAudit: ReadReorderAudit) =>
      expiredLoan(fixture, readAudit, 'repair'),
  },
  { caseId: 'reorder-life:source-closed', assert: sourceClosed },
  { caseId: 'reorder-life:queued-close', assert: queuedClose },
  { caseId: 'reorder-life:detached-success', assert: detachedSuccess },
  { caseId: 'reorder-life:malformed-boundary', assert: malformedBoundary },
];

/** Every acquired queued operation settles before the actual fixture's memoized close owner. */
export async function runCatalogueReorderLifetimeCase(
  fixture: StepCatalogueFixture,
  observe: (fixture: StepCatalogueFixture, readAudit: ReadReorderAudit) => Promise<void>,
  readAudit: ReadReorderAudit,
): Promise<void> {
  let primary: { cause: unknown } | undefined;
  try {
    await observe(fixture, readAudit);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'catalogue reorder owner and close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
