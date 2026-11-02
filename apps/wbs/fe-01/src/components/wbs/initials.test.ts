import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assignInitials, initialsIn, initialsOf } from './initials';

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
    // be '𝔄𝔅'` (two half surrogates), watched again for `String#slice` in
    // place of the grapheme letters. All watched 2026-10-25.
    expect(initialsOf('Mira (human)')).toBe('MH');
    expect(initialsOf('w2')).toBe('W2');
    expect(initialsOf('agent-w3')).toBe('AW');
    expect(initialsOf('Zoë Ångström')).toBe('ZÅ');
    expect(initialsOf('Zoe\u0308 A\u030angstro\u0308m')).toBe('ZÅ');
    expect(initialsOf('Łukasz "Luk" Żak')).toBe('ŁL');
    expect(initialsOf('𝔄lma 𝔅erg')).toBe('𝔄𝔅');
  });

  it('keeps an apostrophe inside a word and counts whole graphemes', () => {
    // Proof: 2026-10-25, without the apostrophe in the word pattern `D’Arcy
    // Smith` gave `DA`; with code points for graphemes `क्षत्रिय` gave `कष`
    // (the conjunct torn apart); with no letter filter `O'Neil` gave `O'`.
    expect(initialsOf('D’Arcy Smith')).toBe('DS');
    expect(initialsOf("O'Neil")).toBe('ON');
    expect(initialsOf('क्षत्रिय')).toBe('क्षत्रि');
  });

  it('answers an emoji name with its whole first grapheme', () => {
    // Proof: 2026-10-25, with code points for graphemes `👩‍💻` gave `👩`.
    expect(initialsOf('👩‍💻')).toBe('👩‍💻');
    expect(initialsOf('🇺🇦 crew')).toBe('CR');
    expect(initialsOf('🇺🇦')).toBe('🇺🇦');
    expect(initialsOf('👍🏽 ')).toBe('👍🏽');
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

describe('everyone a plan names reads differently (wbs-claim-display C22)', () => {
  it('tells claude-code from claude-code-worker', () => {
    // The dev by-eye check of 2026-10-26: two agents of one swarm, both `CC`.
    // Proof: `assignInitials` answering `initialsOf` for every name failed on
    // `expected 'CC' to be 'CW'`; watched 2026-10-27.
    const marks = assignInitials(['claude-code-worker', 'claude-code']);
    expect(marks.get('claude-code')).toBe('CC');
    expect(marks.get('claude-code-worker')).toBe('CW');
  });

  it('leaves a name nobody collides with its plain initials', () => {
    expect([...assignInitials(['vadym', 'Kat Nowak', 'codex'])]).toEqual([
      ['codex', 'CO'],
      ['vadym', 'VA'],
      ['Kat Nowak', 'KN'],
    ]);
  });

  it('reaches into later letters, then numbers, when words run out', () => {
    // `vasyl` has one word: its later letters are a, s, y, l, and `VA` is
    // vadym's (same length, earlier in code-unit order).
    expect(assignInitials(['vasyl', 'vadym']).get('vasyl')).toBe('VS');
    // Nothing but `a`s: the numbers are what is left.
    const as = assignInitials(['aa', 'a a', 'a  a']);
    expect(new Set(as.values())).toEqual(new Set(['AA', 'A2', 'A3']));
    // A name with no letter takes its grapheme and a number.
    expect(assignInitials(['🤖', '🤖 ']).get('🤖 ')).toBe('🤖2');
  });

  it('gives distinct names distinct marks, whatever the names', () => {
    // Proof: with `assignInitials` answering `initialsOf` per name, fast-check
    // failed on `[["aa","aaa"]]` (`expected 1 to be 2`); with the second
    // loop's `taken` check removed, on `[["aöa","aöA"]]`; watched 2026-10-27.
    const name = fc
      .array(fc.constantFrom('a', 'b', 'c', ' ', '-', 'A', 'ö', '2', '🤖'), {
        minLength: 1,
        maxLength: 6,
      })
      .map((chars) => chars.join(''))
      .filter((each) => each.trim() !== '');
    fc.assert(
      fc.property(fc.uniqueArray(fc.oneof(name, fc.string({ minLength: 1 }))), (names) => {
        const named = names.filter((each) => each.trim() !== '');
        const marks = assignInitials(named);
        expect(marks.size).toBe(named.length);
        expect(new Set(marks.values()).size).toBe(named.length);
      }),
      { numRuns: 500 },
    );
  });

  it('keeps every uncontested plain initial, and answers the same for any order', () => {
    const word = fc
      .array(fc.constantFrom('a', 'b', 'c', 'd', ' '), { minLength: 1, maxLength: 5 })
      .map((chars) => chars.join(''))
      .filter((each) => each.trim() !== '');
    fc.assert(
      fc.property(
        fc
          .uniqueArray(word, { maxLength: 8 })
          .chain((names) =>
            fc.tuple(fc.constant(names), fc.shuffledSubarray(names, { minLength: names.length })),
          ),
        ([names, shuffled]) => {
          const marks = assignInitials(names);
          expect([...assignInitials(shuffled)].sort()).toEqual([...marks].sort());
          for (const each of names) {
            const plain = initialsOf(each);
            const sharing = names.filter((other) => initialsOf(other) === plain);
            if (sharing.length === 1) expect(marks.get(each)).toBe(plain);
          }
        },
      ),
    );
  });

  it('refuses a blank name, as initialsOf does', () => {
    expect(() => assignInitials(['ada', '  '])).toThrow();
  });
});

describe('a mark the caller never assigned', () => {
  it('refuses a name outside the marks rather than inventing one', () => {
    // Review of PR #763, S3. Proof: the throw replaced by `return
    // initialsOf(name)` failed on `expected [Function] to throw an error`;
    // watched 2026-10-27.
    const marks = assignInitials(['ada']);
    expect(initialsIn(marks, 'ada')).toBe('AD');
    expect(() => initialsIn(marks, 'eve')).toThrow('no initials were assigned for "eve"');
  });
});
