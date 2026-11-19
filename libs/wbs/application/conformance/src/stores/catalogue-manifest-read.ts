import type { StepCatalogue } from '@wbs/core';
import { expect } from 'bun:test';
import type { StepCatalogueFixture } from '../step-catalogue-fixture';

export const CATALOGUE_MANIFEST_READ_CASES = [
  'snapshot',
  'ordinary',
  'repair',
  'source-closed',
  'staged-rollback',
] as const;
export type CatalogueManifestReadCase = (typeof CATALOGUE_MANIFEST_READ_CASES)[number];
const EMPTY = 'manifest-read-empty';

async function readManifest(
  port: StepCatalogue,
  fixture: StepCatalogueFixture,
  projectId = fixture.seed.projectId,
) {
  const manifest = await port.readManifest(fixture.seed.organizationId, projectId);
  if (manifest === null) throw Error('actual manifest project disappeared');
  return manifest;
}
async function expectClosed(call: () => Promise<unknown>) {
  let failure: unknown;
  try {
    await call();
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw Error('expired manifest capability resolved');
  expect(failure.message).toContain('closed');
}
async function prepareManifest(fixture: StepCatalogueFixture) {
  const { port, seed } = fixture;
  for (const [id, scopeKind, scopeId, workItemTypeId, position] of [
    ['manifest-life-base', 'organization', seed.organizationId, null, 10],
    ['manifest-life-research', 'project', seed.projectId, seed.typeId, 20],
  ] as const) {
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id,
            code: id,
            name: id,
            position,
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 0,
          },
          { bindingId: id + ':binding', scopeKind, scopeId, workItemTypeId, position },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
}
async function withLoan(
  fixture: StepCatalogueFixture,
  kind: 'ordinary' | 'repair',
  use: (port: StepCatalogue) => Promise<void>,
) {
  if (kind === 'ordinary')
    await fixture.source.uow.run(async ({ stores }) => {
      await use(stores.stepCatalogue);
      return { commit: false, value: undefined };
    });
  else
    await fixture.source.uow.run<undefined>(() =>
      Promise.resolve({
        commit: false,
        value: undefined,
        afterRollback: async ({ stores }) => {
          await use(stores.stepCatalogue);
        },
      }),
    );
}
async function exercise(fixture: StepCatalogueFixture, selected: CatalogueManifestReadCase) {
  const { port, seed, source } = fixture;
  await prepareManifest(fixture);
  const baseline = await readManifest(port, fixture);
  expect(baseline.default).toEqual(['manifest-life-base']);
  expect(baseline.types).toEqual([
    { workItemTypeId: seed.secondTypeId, codes: ['manifest-life-base'] },
    { workItemTypeId: seed.typeId, codes: ['manifest-life-base', 'manifest-life-research'] },
  ]);
  if (selected === 'snapshot') {
    const before = fixture.readEvidence(),
      original = structuredClone(baseline);
    expect(baseline.project.id).toBe(seed.projectId);
    expect(await port.readManifest(seed.organizationId, seed.foreignProjectId)).toBeNull();
    expect(await port.readManifest(seed.organizationId, 'absent-manifest-project')).toBeNull();
    expect(await port.readManifest('absent-manifest-org', seed.projectId)).toBeNull();
    const empty = await readManifest(port, fixture, EMPTY);
    expect(empty.project.id).toBe(EMPTY);
    expect(empty.default).toEqual(['manifest-life-base']);
    expect(empty.types).toEqual([
      { workItemTypeId: seed.secondTypeId, codes: ['manifest-life-base'] },
      { workItemTypeId: seed.typeId, codes: ['manifest-life-base'] },
    ]);
    Reflect.set(baseline.project, 'revision', 987654321);
    Reflect.set(baseline.default, '0', 'caller-code');
    const first = baseline.types.at(0);
    if (first === undefined) throw Error('actual mutable typed reply absent');
    Reflect.set(first.codes, '0', 'caller-type-code');
    expect(await readManifest(port, fixture)).toEqual(original);
    expect(fixture.readEvidence()).toEqual(before);
    return;
  }
  if (selected === 'source-closed') {
    await fixture.close();
    await expectClosed(() => port.readManifest(seed.organizationId, seed.projectId));
    expect(baseline.default).toEqual(['manifest-life-base']);
    return;
  }
  if (selected === 'staged-rollback') {
    const before = fixture.readEvidence();
    await source.uow.run(async ({ stores }) => {
      expect(
        (
          await stores.stepCatalogue.defineAndBindStep(
            seed.organizationId,
            {
              id: 'manifest-life-staged',
              code: 'manifest-life-staged',
              name: 'Staged mapping',
              position: 30,
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 0,
            },
            {
              bindingId: 'manifest-life-staged:binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: seed.typeId,
              position: 30,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const staged = await readManifest(stores.stepCatalogue, fixture);
      expect(staged.project.revision).toBe(baseline.project.revision + 1);
      expect(staged.types).toEqual([
        { workItemTypeId: seed.secondTypeId, codes: ['manifest-life-base'] },
        {
          workItemTypeId: seed.typeId,
          codes: ['manifest-life-base', 'manifest-life-research', 'manifest-life-staged'],
        },
      ]);
      expect(await readManifest(port, fixture)).toEqual(baseline);
      return { commit: false, value: undefined };
    });
    expect(await readManifest(port, fixture)).toEqual(baseline);
    expect(fixture.readEvidence()).toEqual(before);
    return;
  }
  const retained: { port: StepCatalogue | undefined } = { port: undefined };
  await withLoan(fixture, selected, async (loan) => {
    retained.port = loan;
    expect(await readManifest(loan, fixture)).toEqual(baseline);
  });
  const expired = retained.port;
  if (expired === undefined) throw Error('actual manifest loan was not retained');
  const before = fixture.readEvidence();
  await expectClosed(() => expired.readManifest(seed.organizationId, seed.projectId));
  await withLoan(fixture, selected, async (loan) => {
    expect(await readManifest(loan, fixture)).toEqual(baseline);
    await expectClosed(() => expired.readManifest(seed.organizationId, seed.projectId));
  });
  expect(fixture.readEvidence()).toEqual(before);
}

/** Keeps the genuine Source owner until observations and its idempotent close settle. */
export async function runCatalogueManifestReadCase(
  fixture: StepCatalogueFixture,
  selected: CatalogueManifestReadCase,
) {
  let primary: { cause: unknown } | undefined;
  try {
    await exercise(fixture, selected);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'manifest read and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
