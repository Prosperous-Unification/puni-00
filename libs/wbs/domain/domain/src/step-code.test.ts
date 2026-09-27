import { describe, expect, it } from 'bun:test';

import {
  isReservedStepCode,
  isStepCode,
  STEP_CODE_MAX_LENGTH,
  suggestStepCode,
  suggestStepCodes,
} from './step-code';

describe('suggestStepCode', () => {
  it('lowercases a name and collapses every run outside [a-z0-9] to one hyphen', () => {
    expect(suggestStepCode('Dev', new Set())).toBe('dev');
    expect(suggestStepCode('Code  Review!!', new Set())).toBe('code-review');
    expect(suggestStepCode('  --QA / UAT--  ', new Set())).toBe('qa-uat');
  });

  it('prefixes step- when the result does not start with a letter', () => {
    expect(suggestStepCode('2nd pass', new Set())).toBe('step-2nd-pass');
  });

  it('prefixes step- when the result is reserved for the ordinal alias', () => {
    expect(suggestStepCode('S2 Review', new Set())).toBe('step-s2-review');
    expect(suggestStepCode('s12', new Set())).toBe('step-s12');
  });

  it('keeps a name that starts with s but not s<digit>', () => {
    expect(suggestStepCode('Sales', new Set())).toBe('sales');
  });

  it('prefixes a name that starts like the alias even when it is not reserved yet', () => {
    expect(suggestStepCode('s2x', new Set())).toBe('step-s2x');
  });

  it('never cuts or suffixes a name into the reserved namespace', () => {
    const cutIntoAlias = `s${'1'.repeat(31)}x`;
    const suffixedIntoAlias = `s${'1'.repeat(29)}xy`;
    const first = suggestStepCode(cutIntoAlias, new Set());
    const second = suggestStepCode(
      suffixedIntoAlias,
      new Set([suggestStepCode(suffixedIntoAlias, new Set())]),
    );
    for (const code of [first, second]) {
      expect(isReservedStepCode(code)).toBe(false);
      expect(isStepCode(code)).toBe(true);
    }
  });

  it('answers step for a name with nothing codeable in it', () => {
    expect(suggestStepCode('Ревю', new Set())).toBe('step');
    expect(suggestStepCode('!!!', new Set(['step']))).toBe('step-2');
  });

  it('adds -2, -3… on collision', () => {
    expect(suggestStepCode('Review!', new Set(['review']))).toBe('review-2');
    expect(suggestStepCode('Review', new Set(['review', 'review-2']))).toBe('review-3');
  });

  it('truncates the stem so stem and suffix stay within 32 characters', () => {
    const long = 'Integration and acceptance testing phase';
    const first = suggestStepCode(long, new Set());
    expect(first).toBe('integration-and-acceptance-testi');
    expect(first).toHaveLength(STEP_CODE_MAX_LENGTH);

    const second = suggestStepCode(long, new Set([first]));
    expect(second).toBe('integration-and-acceptance-tes-2');
    expect(second).toHaveLength(STEP_CODE_MAX_LENGTH);

    const taken = new Set([first, second]);
    for (let n = 3; n <= 10; n += 1) taken.add(suggestStepCode(long, taken));
    const eleventh = suggestStepCode(long, taken);
    expect(eleventh).toBe('integration-and-acceptance-te-11');
    expect(eleventh).toHaveLength(STEP_CODE_MAX_LENGTH);
  });

  it('never ends a truncated stem on a hyphen', () => {
    // 31 characters then a hyphen at the cut: `…-` would be a valid but ugly code.
    const code = suggestStepCode('abcdefghij abcdefghij abcdefghi xyz', new Set());
    expect(code).toBe('abcdefghij-abcdefghij-abcdefghi');
  });

  it('always answers a code the grammar accepts and that is not reserved', () => {
    for (const name of ['Dev', '2nd pass', 's3-qa', '', '---', 'Ω', 'a'.repeat(80)]) {
      const code = suggestStepCode(name, new Set());
      expect(isStepCode(code)).toBe(true);
      expect(isReservedStepCode(code)).toBe(false);
    }
  });
});

describe('suggestStepCodes', () => {
  it('codes steps in the order given, each against the codes before it', () => {
    expect(suggestStepCodes(['Review', 'Review!', 'QA'], new Set(['qa']))).toEqual([
      'review',
      'review-2',
      'qa-2',
    ]);
  });
});

describe('isStepCode', () => {
  it('accepts a lowercase letter then letters, digits or hyphens, up to 32', () => {
    expect(isStepCode('dev')).toBe(true);
    expect(isStepCode('qa-2')).toBe(true);
    expect(isStepCode('a'.repeat(32))).toBe(true);
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'Dev', '2dev', '-dev', 'dev.qa', 'dev qa', 'a'.repeat(33)]) {
      expect(isStepCode(bad)).toBe(false);
    }
  });
});

describe('isReservedStepCode', () => {
  it('reserves s<digits> and s<digits>-…', () => {
    expect(isReservedStepCode('s1')).toBe(true);
    expect(isReservedStepCode('s12-review')).toBe(true);
  });

  it('leaves every other code alone', () => {
    expect(isReservedStepCode('s')).toBe(false);
    expect(isReservedStepCode('s2x')).toBe(false);
    expect(isReservedStepCode('sales')).toBe(false);
    expect(isReservedStepCode('step-s2')).toBe(false);
  });
});
