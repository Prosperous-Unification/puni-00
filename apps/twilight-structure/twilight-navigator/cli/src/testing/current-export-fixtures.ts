import { readFileSync } from 'node:fs';

import { type PlanDocument, planDocument, requestSchema, validateSchema } from '@wbs/contracts';

const current = requestSchema(planDocument);

/** Strict, detached current test capture; adjacent provenance records the actual constructed WBS producer. */
export async function currentExportFixture(version: 15 | 16): Promise<PlanDocument> {
  const bytes = readFileSync(
    new URL('../fixtures/current-plan-export.v' + String(version) + '.json', import.meta.url),
    'utf8',
  );
  const checked = await validateSchema(current, JSON.parse(bytes));
  if (checked.issues !== undefined) throw new Error('Current producer test capture is malformed');
  if (
    checked.value.document.version !== version ||
    checked.value.workPackage.projectId !== checked.value.project.id
  )
    throw new Error('Current producer test capture identity disagrees');
  return checked.value;
}
