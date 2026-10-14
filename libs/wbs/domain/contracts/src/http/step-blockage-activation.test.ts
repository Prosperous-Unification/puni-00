import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { importProject } from './import-shapes';
import { validateSchema } from './schema-shape';
import { removeStep } from './step-shapes';
import { applyProjectCommands, redoProject, undoProject } from './work-item-shapes';

for (const endpoint of [
  importProject,
  applyProjectCommands,
  undoProject,
  redoProject,
  removeStep,
]) {
  test(`${endpoint.operationId} declares inactive blockage writer refusal`, async () => {
    const validations = await Promise.all(
      endpoint.refusals
        .filter((refusal) => refusal.status === 409)
        .map((refusal) =>
          validateSchema<unknown>(refusal.schema, { error: 'step_blockage_inactive' }),
        ),
    );
    expect(validations.some((validation) => validation.issues === undefined)).toBe(true);
    const document = documentFromShapes([endpoint]);
    expect(JSON.stringify(document)).toContain('step_blockage_inactive');
  });
}
