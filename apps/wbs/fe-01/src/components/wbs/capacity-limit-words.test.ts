import { describe, expect, it } from 'vitest';

import { refusalSentence } from './plan-refusal';

describe('capacity cap refusal words', () => {
  it('words the capacity cap rather than naming its code', () => {
    const sentence = refusalSentence(new Error('capacity_limit'));
    expect(sentence).toContain('Organization limit');
    expect(sentence).not.toContain('capacity_limit');
  });
});
