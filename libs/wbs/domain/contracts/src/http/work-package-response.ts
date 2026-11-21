import { type } from 'arktype';

import { responseSchema } from './schema-shape';
import { stepShape } from './step-shapes';

/** Complete stored work package settings, shared by work package reads, lists, writes and exports. */
const storedWorkPackage = type({
  id: 'string',
  name: 'string',
  projectId: 'string > 0',
  restricted: 'boolean',
  estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
  depReach: "'whole-item' | 'anchor-slice'",
  pertWeights: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
  estimateRounding: "'exact' | 'floor' | 'round' | 'ceil'",
  startDate: 'string | null',
  solutionRef: type({ slug: 'string', url: 'string' }).or('null'),
  revision: 'number',
  createdAt: 'number',
  optimizationEnabled: 'boolean',
  scheduleEngine: "'fast' | 'optimized'",
  scheduleObjective: "'pri' | 'time'",
  /**
   * What derived budgets multiply the pessimistic point by
   * (`wbs-measure-budgets` D38). Optional on the wire only so a newer client
   * can read an older be-01 mid-swap.
   */
  'budgetFactor?': 'number',
  /**
   * The IANA zone every day derived from an instant is read in
   * (`step-node-attempts` D3). Optional on the wire only so a newer client can
   * read an older be-01 mid-swap; every be-01 that knows it sends it.
   */
  'timezone?': 'string',
});

/** Live replies require a persisted normalized work package address. */
export const workPackage = storedWorkPackage.and({
  abbreviation: type('string').matching(/^[A-Z][A-Z0-9_-]{0,19}$/),
});

/** Current document metadata; published owner-bearing13/14 use their independent frozen closure. */
export const documentWorkPackage = storedWorkPackage.and({
  'abbreviation?': type('string').matching(/^[A-Z][A-Z0-9_-]{0,19}$/),
});

/**
 * A work package's complete stored settings with its ordered steps, as read and
 * creation return them. Additive fields survive this wire boundary; internal
 * repository columns are excluded by the repository's own projection.
 * Proof: optional depReach admitted a damaged work package,200 instead of500 in
 * work-package.controller.test.ts's solution-settings case. Using requestSchema
 * rejected its additive fields,500 instead of200 in the same mounted case.
 */
export const workPackageWithSteps = responseSchema(
  type({
    workPackage,
    steps: stepShape.array(),
  }),
);
