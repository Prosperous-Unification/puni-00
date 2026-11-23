import { type APIRequestContext, expect } from '@playwright/test';
import { bindCatalogueStep, listStepCatalogue, readProjectSteps } from '@wbs/contracts';

import { ordinaryReply } from './ordinary-context';

export interface FixtureStep {
  code: string;
  name: string;
}

export const ORDINARY_STEPS: readonly FixtureStep[] = [
  { code: 'dev', name: 'Dev' },
  { code: 'qa', name: 'QA' },
];

/** Authors real project bindings before package birth and verifies current inherited resolution. */
export async function bindFixtureSteps(
  request: APIRequestContext,
  origin: string,
  organizationId: string,
  projectId: string,
  steps: readonly FixtureStep[],
): Promise<void> {
  const headers = { origin, 'X-WBS-Expected-Organization': organizationId };
  const catalogue = await ordinaryReply(
    await request.get(origin + listStepCatalogue.path, { headers }),
    listStepCatalogue.responses[0].schema,
    200,
    'Fixture catalogue read',
  );
  const stepIds: string[] = [];
  for (const [position, step] of steps.entries()) {
    const definition = catalogue.definitions.find(({ code }) => code === step.code);
    if (definition !== undefined) expect(definition.name).toBe(step.name);
    const bound = await ordinaryReply(
      await request.post(origin + bindCatalogueStep.path, {
        headers,
        data: {
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position,
          ...(definition === undefined
            ? {
                define: {
                  ...step,
                  position,
                  defaultEstimateUnit: 'workdays',
                  defaultAllowanceBps: 0,
                },
              }
            : { stepId: definition.id }),
        },
      }),
      bindCatalogueStep.responses[0].schema,
      201,
      'Fixture project binding',
    );
    expect(bound.binding).toMatchObject({
      organizationId,
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
    });
    stepIds.push(bound.binding.stepId);
  }
  const resolved = await ordinaryReply(
    await request.get(origin + '/api/projects/' + encodeURIComponent(projectId) + '/steps', {
      headers,
    }),
    readProjectSteps.responses[0].schema,
    200,
    'Fixture project resolution',
  );
  expect(resolved.steps.map(({ stepId }) => stepId)).toEqual(stepIds);
  expect(resolved.steps.map(({ name }) => name)).toEqual(steps.map(({ name }) => name));
}
