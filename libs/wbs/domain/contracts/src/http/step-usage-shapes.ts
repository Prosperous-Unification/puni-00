import { STEP_FACT_KINDS } from '@wbs/domain/step-fact';
import { type } from 'arktype';

/**
 * Shared protected-pair wire vocabulary; its facts retain the domain registry's ordered names.
 * Proof: accepting arbitrary strings made the actual browser unknown-fact preview succeed;
 * exact restoration passed the same decoder owner (verification-unbind-20261119.json).
 */
export const stepInUsePairSchema = type({
  id: 'string',
  name: 'string',
  workPackageId: 'string',
  stepId: 'string',
  facts: type.enumerated(...STEP_FACT_KINDS).array(),
});
