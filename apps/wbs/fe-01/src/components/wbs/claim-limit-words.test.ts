import { describe, expect, it } from 'vitest';

import { refusalSentence } from './plan-refusal';

describe('claim cap refusal words', () => {
  it('words the claim cap rather than naming its code', () => {
    const sentence = refusalSentence(new Error('claim_limit'));
    expect(sentence).toContain('Organization limit');
    expect(sentence).not.toContain('claim_limit');
  });
});
