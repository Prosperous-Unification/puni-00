import type {
  IssuedAttemptNumber,
  StoredAttempt,
  StoredMeasure,
  StoredMeasureEstimate,
} from '@wbs/core';
import type {
  PackageStepRecord,
  Source,
  StepCatalogue,
  StoredActual,
  StoredEstimate,
  StoredProgress,
  TransactionalStores,
} from '@wbs/core';
import type { StepCatalogueSeed } from '@wbs/core/testing/step-catalogue-seed';
export { STEP_CATALOGUE_SEED, type StepCatalogueSeed } from '@wbs/core/testing/step-catalogue-seed';
import { expect } from 'bun:test';

/** Source-owned raw tuple projections; numeric/enum fields stay unknown at the fixture boundary. */
export interface StepTupleEvidence {
  readonly measures: readonly Readonly<
    Record<Exclude<keyof StoredMeasure, 'basis'> | 'currency' | 'rateCardDigest', unknown>
  >[];
  readonly measureEstimates: readonly Readonly<
    Record<Exclude<keyof StoredMeasureEstimate, 'basis'> | 'currency' | 'rateCardDigest', unknown>
  >[];
  readonly attempts: readonly Readonly<Record<keyof StoredAttempt, unknown>>[];
  readonly issued: readonly Readonly<Record<keyof IssuedAttemptNumber, unknown>>[];
}

export interface StepCatalogueEvidence {
  /** Detached actual persisted store state, including all protected records; equality is adapter-local. */
  readonly snapshot: unknown;
  readonly tuples: StepTupleEvidence;
  readonly estimates: readonly StoredEstimate[];
  readonly actuals: readonly Readonly<Record<keyof StoredActual, unknown>>[];
  readonly progress: readonly Readonly<Record<keyof StoredProgress, unknown>>[];
  readonly packageValues: readonly PackageStepRecord[];
}

/** Test-only physical-column fault; current writer admission is neither bypassed nor asserted to accept it. */
export type StepFactCorruption =
  | {
      readonly kind: 'actual_days';
      readonly workItemId: string;
      readonly stepId: string;
      readonly value: number;
    }
  | {
      readonly kind: 'progress_time';
      readonly workItemId: string;
      readonly stepId: string;
      readonly value: string;
    }
  | {
      readonly kind: 'actual_step';
      readonly workItemId: string;
      readonly stepId: string;
      readonly value: string;
    }
  | {
      readonly kind: 'progress_step';
      readonly workItemId: string;
      readonly stepId: string;
      readonly value: string;
    };

export interface StepCatalogueFixture<
  OpenedSource extends Source<TransactionalStores> = Source<TransactionalStores>,
> {
  readonly fixtureId: string;
  readonly port: StepCatalogue;
  readonly source: OpenedSource;
  readonly seed: StepCatalogueSeed;
  /** Fixture-only actual storage extraction; never reconstruct facts from catalogue DTOs. */
  readEvidence(): StepCatalogueEvidence;
  corruptStepFact(corruption: StepFactCorruption): () => void;
  close(): Promise<void>;
}

/**
 * Adapts only a real opened source and its existing close owner. The adapter
 * opener retains setup/cleanup responsibility if any prerequisite fails here.
 * Reads actual settings/directory/package rows before the first catalogue call;
 * it creates no schema, authority answer, replacement store or lifetime owner.
 * Missing required port is explicitly a scaffolding prerequisite, not a guard proof.
 */
export async function stepCatalogueFixtureFromSource<
  OpenedSource extends Source<TransactionalStores>,
>(
  fixtureId: string,
  source: OpenedSource,
  seed: StepCatalogueSeed,
  close: () => Promise<void>,
  readEvidence: () => StepCatalogueEvidence,
  corruptStepFact: (corruption: StepFactCorruption) => () => void,
): Promise<StepCatalogueFixture<OpenedSource>> {
  const actual = await source.stores.settings.readTarget(
    { level: 'work_package', id: seed.workPackageId },
    seed.organizationId,
  );
  const sibling = await source.stores.settings.readTarget(
    { level: 'work_package', id: seed.siblingWorkPackageId },
    seed.organizationId,
  );
  const foreign = await source.stores.settings.readTarget(
    { level: 'work_package', id: seed.foreignWorkPackageId },
    seed.foreignOrganizationId,
  );
  expect(actual?.chain).toEqual({
    level: 'work_package',
    organizationId: seed.organizationId,
    spaceId: seed.spaceId,
    projectId: seed.projectId,
    workPackageId: seed.workPackageId,
  });
  expect(sibling?.chain).toEqual({
    level: 'work_package',
    organizationId: seed.organizationId,
    spaceId: null,
    projectId: seed.siblingProjectId,
    workPackageId: seed.siblingWorkPackageId,
  });
  expect(foreign?.chain).toEqual({
    level: 'work_package',
    organizationId: seed.foreignOrganizationId,
    spaceId: null,
    projectId: seed.foreignProjectId,
    workPackageId: seed.foreignWorkPackageId,
  });
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
  expect(await source.stores.workItems.listByWorkPackage(seed.siblingWorkPackageId)).toEqual([]);
  const ownTypes = await source.stores.directory.listInOrganization(
    'workItemTypes',
    seed.organizationId,
  );
  const foreignTypes = await source.stores.directory.listInOrganization(
    'workItemTypes',
    seed.foreignOrganizationId,
  );
  expect(ownTypes.map(({ id }) => id)).toContain(seed.typeId);
  expect(foreignTypes.map(({ id }) => id)).toContain(seed.foreignTypeId);
  expect(Object.hasOwn(source.stores, 'stepCatalogue')).toBe(true);
  // Memoize settlement, including failure: a closed-source assertion and runner cleanup share one actual owner call.
  let closing: Promise<void> | undefined;
  const closeOnce = (): Promise<void> => {
    closing ??= Promise.resolve().then(close);
    return closing;
  };
  return {
    fixtureId,
    port: source.stores.stepCatalogue,
    source,
    seed,
    readEvidence,
    corruptStepFact,
    close: closeOnce,
  };
}
