import { openMemorySourceFixture } from '@wbs/store-memory/source';

import type { NewStepBinding, NewStepDefinition, WorkPackage, WriteStamp } from '../index';
import type { WorkItemServiceOptions } from '../module/work-item/work-item.resource';
import { createTestServices } from './harness';

/** Explicit author metadata; no legacy Step DTO or inferred permission answer is accepted. */
export interface CurrentPlanSeed {
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackage: WorkPackage;
  readonly stamp: WriteStamp;
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly boundSteps: readonly {
    readonly definition: NewStepDefinition;
    readonly binding: Omit<NewStepBinding, 'stepId'>;
  }[];
  readonly creatorGrant: { readonly id: string; readonly auditId: string };
}

/**
 * Fresh actual current MemorySource fixture. Account, parent, membership and type
 * ownership are explicit source fixture records. Definitions/bindings and empty-
 * input package birth run in one real loan, so SC21 creates explicit values.
 * Service fault overrides remain explicit test dependencies, never runtime guards.
 * @throws on refused setup or paired setup/close failure; the actual source close
 * owner is memoized and returned for the caller's cleanup.
 */
export async function createCurrentPlanFixture(
  seed: CurrentPlanSeed,
  overrides: Partial<WorkItemServiceOptions> = {},
) {
  const fixture = openMemorySourceFixture(),
    source = fixture.source;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= Promise.resolve().then(() => source.close());
    return closing;
  };
  try {
    const account = await source.stores.users.create(
      { id: seed.stamp.by, username: seed.stamp.by, passwordHash: null, createdAt: seed.stamp.at },
      seed.stamp,
    );
    if (account === null) throw new Error('current fixture account was refused');
    fixture.addOrganization(seed.organizationId, { legacy: false });
    fixture.setPackageCreationMembers(seed.organizationId, [seed.stamp.by]);
    fixture.seedPackageParent({
      id: seed.projectId,
      organizationId: seed.organizationId,
      name: seed.projectId,
      spaceId: null,
      spacePosition: null,
      revision: 0,
      createdAt: seed.stamp.at,
      createdBy: seed.stamp.by,
      updatedAt: null,
    });
    for (const type of seed.types) {
      const created = await source.stores.directory.addWorkItemType(type, seed.stamp);
      if (created.id !== type.id) throw new Error('current fixture type identity differs');
      fixture.ownWorkItemTypeInOrganization(type.id, seed.organizationId);
    }
    await fixture.activateOrganizationIsolation();
    const workPackage = await source.uow.run(async ({ stores }) => {
      for (const { definition, binding } of seed.boundSteps) {
        const defined = await stores.stepCatalogue.defineAndBindStep(
          seed.organizationId,
          definition,
          binding,
          seed.stamp,
        );
        if (!defined.ok)
          throw new Error('current fixture definition was refused: ' + defined.reason);
      }
      const created = await stores.workPackages.createInOrganization(
        seed.workPackage,
        [],
        seed.stamp,
        seed.organizationId,
        seed.creatorGrant,
      );
      if (typeof created === 'string')
        throw new Error('current fixture package was refused: ' + created);
      return { commit: true, value: created };
    });
    return { ...createTestServices(source, overrides), fixture, workPackage, seed, close };
  } catch (cause: unknown) {
    try {
      await close();
    } catch (cleanup: unknown) {
      throw new AggregateError(
        [cause, cleanup],
        'current plan fixture setup and source close failed',
        { cause: cleanup },
      );
    }
    throw cause;
  }
}
