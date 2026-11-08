import { describe, expect, it } from 'vitest';

import { refusalSentence } from './plan-refusal';

/** Every code slices 1–5 added that a Measures panel write can be answered with. */
const MEASURE_CODES = [
  'unknown_measure',
  'derived_measure',
  'scheduling_measure_fact',
  'scheduling_measure_estimate',
  'scheduling_measure_budget',
  'three_point_forbidden',
  'scale_mismatch',
  'rate_card_required',
  'rate_card_forbidden',
  'mixed_rate_cards',
  'invalid_measure',
  'invalid_estimate',
  'invalid_budget',
  'rolled_up',
  'organization_required',
  'forbidden',
] as const;

describe('measure refusal words (wbs-measure-budgets task 4.3)', () => {
  it('words every measure refusal the panel can reach', () => {
    for (const code of MEASURE_CODES) {
      const sentence = refusalSentence(new Error(code));
      expect(sentence, code).not.toContain(code);
      expect(sentence, code).not.toMatch(/could not be completed \(/);
    }
  });

  it('says a viewer’s edit is not theirs to make, as for every other edit', () => {
    expect(refusalSentence(new Error('forbidden'))).toBe(
      'That change could not be completed: this plan is not yours to change.',
    );
  });
});
