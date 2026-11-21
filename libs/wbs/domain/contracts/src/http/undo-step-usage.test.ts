import { expect, test } from 'bun:test';

import { validateSchema } from './schema-shape';
import { redoWorkPackage, undoWorkPackage } from './work-item-shapes';

for (const endpoint of [undoWorkPackage, redoWorkPackage]) {
  test(
    endpoint.operationId + ' admits precise step usage conflicts and refuses malformed payloads',
    async () => {
      const pair = {
        id: 'destination',
        name: 'Destination',
        workPackageId: 'p',
        stepId: 'dev',
        facts: ['estimate'],
      };
      const schemas = endpoint.refusals
        .filter(({ status }) => status === 409)
        .map(({ schema }) => schema);
      const accepts = async (payload: unknown) => {
        const validations = await Promise.all(
          schemas.map((schema) => validateSchema<unknown>(schema, payload)),
        );
        return validations.some((validation) => validation.issues === undefined);
      };
      expect(await accepts({ error: 'step_nodes_in_use', count: 1, pairs: [pair] })).toBe(true);
      for (const payload of [
        { error: 'step_nodes_in_use', count: 0, pairs: [pair] },
        { error: 'step_nodes_in_use', count: 1.25, pairs: [pair] },
        { error: 'step_nodes_in_use', count: 1, pairs: [{ ...pair, facts: ['invented'] }] },
        {
          error: 'step_nodes_in_use',
          count: 1,
          pairs: [{ id: pair.id, name: pair.name, stepId: pair.stepId, facts: pair.facts }],
        },
      ])
        expect(await accepts(payload)).toBe(false);
    },
  );
}
