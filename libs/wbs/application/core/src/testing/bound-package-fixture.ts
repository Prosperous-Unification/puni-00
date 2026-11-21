import type {
  NewStepBinding,
  NewStepDefinition,
  NewWorkPackage,
  Source,
  StepCatalogue,
  TransactionalStores,
  WorkPackage,
  WriteStamp,
} from '../index';

/** Explicit current catalogue author metadata; it is never derived from a legacy Step DTO. */
export interface FixtureStepBinding {
  readonly definition: NewStepDefinition;
  readonly binding: Omit<NewStepBinding, 'stepId'>;
}

/** Authors explicitly supplied catalogue metadata before a fixture exercises current package creation. */
export async function bindFixtureSteps(
  source: Source<TransactionalStores>,
  organizationId: string,
  bindings: readonly FixtureStepBinding[],
  stamp: WriteStamp,
): Promise<void> {
  await source.uow.run(async ({ stores }) => {
    await writeFixtureBindings(stores.stepCatalogue, organizationId, bindings, stamp);
    return { commit: true, value: undefined };
  });
}

/** Keeps both fixture entry points on the actual admitted catalogue writer. */
async function writeFixtureBindings(
  catalogue: StepCatalogue,
  organizationId: string,
  bindings: readonly FixtureStepBinding[],
  stamp: WriteStamp,
): Promise<void> {
  // Proof (fixture prerequisite): omitting this loop makes the actual-days
  // service regression read no step-dev fact. No production guard is replaced.
  for (const { definition, binding } of bindings) {
    const defined = await catalogue.defineAndBindStep(organizationId, definition, binding, stamp);
    if (!defined.ok) throw new Error('fixture definition/binding refused: ' + defined.reason);
  }
}

/**
 * Seeds a package and its exact author-declared bindings on one actual fixture
 * loan. The organization/parent/account must already exist. Empty legacy input
 * writes no old Step rows; each current define-and-bind then materializes explicit
 * package values. This supplies persisted metadata, never an admission answer.
 * @throws for refused package/catalogue setup; the real Source UoW rolls back.
 */
export async function createBoundFixturePackage(
  source: Source<TransactionalStores>,
  organizationId: string,
  workPackage: NewWorkPackage,
  bindings: readonly FixtureStepBinding[],
  stamp: WriteStamp,
): Promise<WorkPackage> {
  return await source.uow.run(async ({ stores }) => {
    const created = await stores.workPackages.create(workPackage, [], stamp);
    if (typeof created === 'string')
      throw new Error('fixture package creation refused: ' + created);
    await writeFixtureBindings(stores.stepCatalogue, organizationId, bindings, stamp);
    return { commit: true, value: created };
  });
}
