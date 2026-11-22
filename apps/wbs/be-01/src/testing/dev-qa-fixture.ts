import type { StepCatalogue, WriteStamp } from '@wbs/core';

/** Authors the Dev/QA definitions and project bindings explicitly required by execution fixtures, through their actual catalogue writer. */
export async function bindDevQaFixture(
  catalogue: StepCatalogue,
  organizationId: string,
  projectId: string,
  stamp: WriteStamp,
): Promise<void> {
  for (const [code, name, position] of [
    ['dev', 'Dev', 10],
    ['qa', 'QA', 20],
  ] as const) {
    const defined = await catalogue.defineAndBindStep(
      organizationId,
      {
        id: crypto.randomUUID(),
        code,
        name,
        position,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: crypto.randomUUID(),
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
      stamp,
    );
    if (!defined.ok) throw new Error('Dev/QA fixture binding refused: ' + defined.reason);
  }
}

/** Binds stable step IDs addressed by runtime fixture requests and persisted receipts. */
export async function bindRuntimeFixtureSteps(
  catalogue: StepCatalogue,
  projectId: string,
  steps: readonly (readonly [id: string, name: string])[],
  stamp: WriteStamp,
): Promise<void> {
  for (const [index, [id, name]] of steps.entries()) {
    const position = (index + 1) * 10;
    const bound = await catalogue.defineAndBindStep(
      'org-a',
      {
        id,
        code: id,
        name,
        position,
        defaultAllowancePercent: 0,
        defaultEstimateUnit: 'workdays',
      },
      {
        bindingId: id + '-binding',
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
      stamp,
    );
    if (!bound.ok) throw new Error('Runtime fixture binding refused: ' + bound.reason);
  }
}
