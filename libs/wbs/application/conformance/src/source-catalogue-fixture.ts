import type { TransactionalStores } from '@wbs/core';
import { expect } from 'bun:test';

import { DETERMINISTIC_SEED } from './source-declaration';

/** The two actual project scopes carrying disjoint current fixture inventories. */
export const CURRENT_SOURCE_PROJECT_IDS = ['fixture-project', 'fixture-project-b'] as const;

/** Settings fixtures deliberately place both packages below the same project. */
export type SourceProjectLayout = 'separate-projects' | 'shared-project';

const CURRENT_SOURCE_STEPS = [
  { id: 'step-a-dev', code: 'dev', name: 'Dev', projectId: 'fixture-project', position: 10 },
  { id: 'step-a-qa', code: 'qa', name: 'QA', projectId: 'fixture-project', position: 20 },
  {
    id: 'step-b-dev',
    code: 'b-dev',
    name: 'Other Dev',
    projectId: 'fixture-project-b',
    position: 10,
  },
  { id: 'step-b-qa', code: 'b-qa', name: 'Other QA', projectId: 'fixture-project-b', position: 20 },
] as const;

/** Explicit current authoring uses each project's actual owner; shared-project fixtures use the first owner for both packages. Never inferred from legacy Step DTO writes. */
export async function seedCurrentSourceSteps(
  stores: Pick<TransactionalStores, 'stepCatalogue'>,
  layout: SourceProjectLayout,
  organizationIds: readonly [string, string],
): Promise<void> {
  for (const definition of CURRENT_SOURCE_STEPS) {
    // Proof: forcing the first owner fails actual SQLite limit fixture authoring
    // (current-sqlite-scoped-fixture-effect-definition-owner-v1).
    const organizationId =
      layout === 'shared-project' || definition.projectId === CURRENT_SOURCE_PROJECT_IDS[0]
        ? organizationIds[0]
        : organizationIds[1];
    const written = await stores.stepCatalogue.defineAndBindStep(
      organizationId,
      {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        position: definition.position,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: definition.id + ':current-binding',
        scopeKind: 'project',
        scopeId: layout === 'shared-project' ? CURRENT_SOURCE_PROJECT_IDS[0] : definition.projectId,
        position:
          layout === 'shared-project' && definition.projectId === CURRENT_SOURCE_PROJECT_IDS[1]
            ? definition.position + 20
            : definition.position,
        workItemTypeId: null,
      },
      DETERMINISTIC_SEED.stamps[0],
    );
    expect(written.ok).toBe(true);
    if (!written.ok)
      throw new Error('authored current Source definition was refused: ' + written.reason);
  }
  for (const [index, workPackageId] of DETERMINISTIC_SEED.workPackageIds.entries()) {
    // Proof: forcing the first read owner fails the actual second-package lookup
    // (current-sqlite-scoped-fixture-effect-package-read-owner-v1).
    const organizationId =
      layout === 'shared-project' || index === 0 ? organizationIds[0] : organizationIds[1];
    const current = await stores.stepCatalogue.readPackage(organizationId, workPackageId);
    if (current === null) throw new Error('current Source seed package is absent');
    const expected =
      layout === 'shared-project'
        ? CURRENT_SOURCE_STEPS.map(({ id }) => id)
        : DETERMINISTIC_SEED.stepIds.at(index);
    // Proof: shifting the actual pair lookup past the inventory fails here
    // (current-sqlite-scoped-fixture-effect-missing-step-pair-v1).
    if (expected === undefined)
      throw new Error('current Source fixture step identities are absent');
    expect(current.steps.map(({ stepId }) => stepId)).toEqual([...expected]);
  }
}

/** Both ordinary and injected creation owners use the same actual project-only factor. */
export async function seedSourceCreationSettings(
  stores: Pick<TransactionalStores, 'settings'>,
): Promise<void> {
  const target = await stores.settings.readTarget(
    { level: 'project', id: CURRENT_SOURCE_PROJECT_IDS[0] },
    null,
  );
  if (target === null) throw new Error('created-package fixture project is absent');
  expect(
    await stores.settings.write(
      target,
      { key: 'budgetFactor', value: 1.5 },
      DETERMINISTIC_SEED.stamps[0],
    ),
  ).toEqual({ ok: true });
}
