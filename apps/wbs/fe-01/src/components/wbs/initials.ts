/**
 * The two characters a folded step cell names its assignee by.
 *
 * A folded step is 96px wide and holds a figure as well as a person, which left
 * the name about 40px: `vadym` printed as `vad…` and `kucherenko` as `kuc…`, and
 * three characters of a name with an ellipsis after them is not a name — two
 * different people on one plan read identically. Initials are the same length
 * every time, so the column lines up, and nothing is lost that the cell's own
 * tooltip and its hover card do not say in full.
 *
 * Two words give a letter each — `Kat Nowak` is `KN` — and one word gives its
 * first two letters, because usernames here are single words (`vadym` → `VA`)
 * and one letter is not enough to tell two of them apart. Upper case, because
 * these are read as a mark rather than as text.
 *
 * Words are runs of letters and digits in any script (marks stay with their
 * letter); everything else separates them, so `Mira (human)` is `MH`, never
 * the `M(` the 2026-10-25 swarm rehearsal drew. Characters are counted by code
 * point after NFC composition, so `𝔄lma` and a decomposed `Zoë` give whole
 * letters, not halves of a surrogate pair or a bare combining mark.
 *
 * A name of one character answers with that character rather than padding: `K`
 * is what there is. A name with characters but no letter or digit (`🤖`)
 * answers with its first character, since the directory accepts any name. A
 * name that is empty or only spaces is **not** a case this models — the caller
 * does not print an assignee it does not have — so it throws rather than
 * answering with a blank badge nobody can account for (R5).
 *
 * Proof: `.slice(0, 2)` on a single word made `.slice(0, 1)`, `names a
 * one-word assignee by its first two letters` failed on `expected 'V' to be
 * 'VA'`; the throw replaced with `return ''`, `refuses a name with nothing in
 * it` failed on `expected [Function] to throw an error`. Both watched
 * 2026-08-12.
 *
 * @param name The assignee's name, as the directory holds it.
 * @returns One or two upper-case characters.
 * @throws If `name` has no non-space character in it.
 */
export function initialsOf(name: string): string {
  const composed = name.normalize('NFC');
  const words: readonly string[] = composed.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu) ?? [];
  const head = words.at(0);
  const next = words.at(1);
  if (head === undefined) {
    const first = Array.from(composed.trim()).at(0);
    if (first === undefined) throw new Error('an assignee with no name cannot be initialled');
    return first.toLocaleUpperCase();
  }
  const letters = (word: string, count: number) => Array.from(word).slice(0, count).join('');
  const initials = next === undefined ? letters(head, 2) : letters(head, 1) + letters(next, 1);
  return initials.toLocaleUpperCase();
}
