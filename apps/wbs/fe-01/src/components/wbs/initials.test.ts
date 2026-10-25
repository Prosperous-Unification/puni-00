import { describe, expect, it } from 'vitest';

import { initialsOf } from './initials';

describe('an assignee is named in two characters', () => {
  it('names a one-word assignee by its first two letters', () => {
    // One letter is not enough: `vadym` and `vitalii` are both `V`, and two
    // people who read identically is the fault the initials replace rather than
    // a smaller version of it.
    //
    // Proof: the single-word branch's `.slice(0, 2)` made `.slice(0, 1)` —
    // failed on `expected 'V' to be 'VA'`. Watched 2026-08-12.
    expect(initialsOf('vadym')).toBe('VA');
  });

  it('takes one letter from each of a two-word name', () => {
    // Proof: the two-word branch replaced with the one-word one — failed on
    // `expected 'KA' to be 'KN'`, which is Kat Nowak reading as Kat Adams.
    // Watched 2026-08-12.
    expect(initialsOf('Kat Nowak')).toBe('KN');
  });

  it('ignores everything after the second word', () => {
    expect(initialsOf('Anna Maria Rossi')).toBe('AM');
  });

  it('answers a one-character name with that character', () => {
    // Not padded and not refused: `K` is what there is, and a badge invented
    // around it would say something the directory does not.
    expect(initialsOf('K')).toBe('K');
  });

  it('upper-cases what it takes', () => {
    // Proof: `.toLocaleUpperCase()` dropped — failed on `expected 'va' to be
    // 'VA'`. Watched 2026-08-12.
    expect(initialsOf('vadym')).toBe('VA');
    expect(initialsOf('kat nowak')).toBe('KN');
  });

  it('reads a name padded with spaces as the name', () => {
    // The word pattern is what the padding is handled by: it matches runs of
    // letters and digits, so nothing at either end is ever a word.
    //
    // Proof: the pattern replaced by `split(/[^\p{L}\p{M}\p{N}]+/u)` with no
    // filter — failed on `expected 'V' to be 'VA'`, the leading empty segment
    // taken as the first word. Watched 2026-10-25 (the `.filter(Boolean)` it
    // replaced was watched the same way on 2026-08-12).
    expect(initialsOf('  vadym  ')).toBe('VA');
    expect(initialsOf('Kat\tNowak')).toBe('KN');
  });

  it('takes letters and digits only, in any script', () => {
    // The swarm rehearsal of 2026-10-25 drew `Mira (human)` as `M(`: the
    // bracket was the second word's first character.
    //
    // Proof: the word pattern replaced by `/\S+/gu` — failed on `expected 'M('
    // to be 'MH'`; the NFC composition dropped — `expected 'ZA' to be 'ZÅ'`;
    // `Array.from` replaced by `String#slice` — `expected '\uD835\uD835' to
    // be '𝔄𝔅'` (two half surrogates). All watched 2026-10-25.
    expect(initialsOf('Mira (human)')).toBe('MH');
    expect(initialsOf('w2')).toBe('W2');
    expect(initialsOf('agent-w3')).toBe('AW');
    expect(initialsOf('Zoë Ångström')).toBe('ZÅ');
    expect(initialsOf('Zoe\u0308 A\u030angstro\u0308m')).toBe('ZÅ');
    expect(initialsOf('Łukasz "Luk" Żak')).toBe('ŁL');
    expect(initialsOf('𝔄lma 𝔅erg')).toBe('𝔄𝔅');
  });

  it('answers a name without letters or digits with its first character', () => {
    // Proof: `.trim()` dropped from the fallback — failed on `expected ' ' to
    // be '🤖'`. Watched 2026-10-25.
    expect(initialsOf('  🤖 ')).toBe('🤖');
    expect(initialsOf('(-)')).toBe('(');
  });

  it('refuses a name with nothing in it', () => {
    // R5: the caller prints an assignee it has, so a blank here is state
    // nothing can account for rather than a person with a short name. A `''`
    // returned instead would print `· ` and read as an assignee whose name the
    // table lost.
    //
    // Proof: the throw replaced with `return ''` — failed on `expected
    // [Function] to throw an error`. Watched 2026-08-12.
    expect(() => initialsOf('')).toThrow();
    expect(() => initialsOf('   ')).toThrow();
  });
});
