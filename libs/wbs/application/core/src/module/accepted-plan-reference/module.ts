import { DiBag } from 'di-bag';

import { AcceptedPlanReferences } from './accepted-plan-reference.feature';
import { createReferenceTransaction } from './accepted-plan-reference.resource';
import { ACCEPTED_PLAN_REFERENCE_LABEL, type AcceptedPlanReferenceRequirements } from './contract';

/** The reference feature and its private mapping from the borrowed writer. */
export const acceptedPlanReferenceModule = DiBag.createBuilder()
  .withServices({
    acceptedPlanReferences: DiBag.createProvider(
      ({ source, clock }: AcceptedPlanReferenceRequirements) =>
        new AcceptedPlanReferences(createReferenceTransaction(source), clock),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .buildModule({
    exportedServiceKeys: ['acceptedPlanReferences'],
    moduleLabel: ACCEPTED_PLAN_REFERENCE_LABEL,
  });
