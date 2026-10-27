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
 * Words are runs of letters and digits in any script, with their marks and
 * joiners and an apostrophe inside them (`D’Arcy Smith` is `DS`, `O'Neil` is
 * `ON`); everything else separates them, so `Mira (human)` is `MH`, never the
 * `M(` the 2026-10-25 swarm rehearsal drew. Characters are user-perceived
 * ones (`Intl.Segmenter` graphemes, after NFC composition), and only letters
 * and digits count, so `𝔄lma`, a decomposed `Zoë` and a conjunct such as
 * `क्ष` stay whole rather than halves of a surrogate pair, a bare combining
 * mark or a letter ending on its virama.
 *
 * A name of one character answers with that character rather than padding: `K`
 * is what there is. A name with characters but no letter or digit (`🤖`,
 * `👩‍💻`, a flag) answers with its first grapheme, since the directory accepts any name. A
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
  const words: readonly string[] = composed.match(WORD) ?? [];
  const head = words.at(0);
  const next = words.at(1);
  if (head === undefined) {
    const first = graphemesOf(composed.trim()).at(0);
    if (first === undefined) throw new Error('an assignee with no name cannot be initialled');
    return first.toLocaleUpperCase();
  }
  const initials =
    next === undefined ? lettersOf(head, 2) : lettersOf(head, 1) + lettersOf(next, 1);
  return initials.toLocaleUpperCase();
}

/** A word: a run of letters and digits, with its marks, joiners and inner apostrophes. */
const WORD = /[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}'’]|\u200C|\u200D)*/gu;

/** A grapheme that counts toward initials: one holding a letter or a digit. */
const LETTER = /[\p{L}\p{N}]/u;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The user-perceived characters of `text`. */
function graphemesOf(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
}

/** The first `count` letters or digits of `word`, each a whole grapheme; an apostrophe is skipped. */
function lettersOf(word: string, count: number): string {
  return graphemesOf(word)
    .filter((grapheme) => LETTER.test(grapheme))
    .slice(0, count)
    .join('');
}

/**
 * Two-character marks for everyone a plan can name, **distinct whenever the
 * names are** (`wbs-claim-display` C22): the folded assignee slot and the claim
 * chip print these instead of {@link initialsOf}, which gave `claude-code` and
 * `claude-code-worker` both `CC` on dev, 2026-10-26, so two holders of one plan
 * read identically.
 *
 * Still two characters, because the slots are sized for two capitals
 * (`ASSIGNEE_SLOT_PX`, `CLAIM_SLOT_PX`) and a third was what clipped `· (GH`
 * mid-bracket (F-034). Who keeps the plain initials, and what the others take:
 *
 * 1. Every name whose {@link initialsOf} nobody else shares keeps it, so a
 *    plan without a collision prints exactly what it printed before.
 * 2. Of names sharing initials, the shortest (then the first in code-unit
 *    order) keeps them: `claude-code` stays `CC`.
 * 3. Each other takes the first mark not yet taken from: its first letter with
 *    the first letter of each later word (`claude-code-worker` → `CW`); then
 *    with each later letter of the name in order (`vasyl` beside `vadym` →
 *    `VS`); then with 2, 3, 4… (`aa` beside `a a` → `A2`). The last list never
 *    ends, which is what guarantees an answer; past `9` it is three characters
 *    and the slot's `hidden` overflow is the backstop.
 *
 * The answer depends on the set of names and never on their order. Equal
 * names are one person to this rule; the cell's card names them in full.
 *
 * **Marks are per plan**: the caller passes the people one plan prints
 * (`planInitialsOf`), never the organization's directory, so a collision is
 * local and on screen, and a namesake added to another project does not
 * change a mark here (review of PR #763, B1).
 *
 * Proof: answering {@link initialsOf} for every name made `gives distinct
 * names distinct marks` fail on the counterexample `["aa","aaa"]` and `tells
 * claude-code from claude-code-worker` on `expected 'CC' to be 'CW'`; with the
 * second loop's `taken` check removed, the property shrank to `["aöa","aöA"]`;
 * both watched 2026-10-27.
 *
 * @throws If any name has no non-space character in it ({@link initialsOf}).
 */
export function assignInitials(names: Iterable<string>): ReadonlyMap<string, string> {
  const ordered = [...new Set(names)].sort(byPrecedence);
  const marks = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of ordered) {
    const plain = initialsOf(name);
    if (taken.has(plain)) continue;
    marks.set(name, plain);
    taken.add(plain);
  }
  for (const name of ordered) {
    if (marks.has(name)) continue;
    for (const candidate of alternativeMarksOf(name)) {
      if (taken.has(candidate)) continue;
      marks.set(name, candidate);
      taken.add(candidate);
      break;
    }
  }
  return marks;
}

/** Shorter names first, then code-unit order: who keeps plain initials in a tie. */
function byPrecedence(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The marks {@link assignInitials} tries for a name whose plain initials are
 * taken, in order, without end.
 */
function* alternativeMarksOf(name: string): Generator<string, never> {
  const composed = name.normalize('NFC');
  const words: readonly string[] = composed.match(WORD) ?? [];
  const head = words.at(0);
  const lead =
    head === undefined
      ? (graphemesOf(composed.trim()).at(0) ?? '')
      : lettersOf(head, 1).toLocaleUpperCase();
  if (head !== undefined) {
    for (const word of words.slice(1)) yield lead + lettersOf(word, 1).toLocaleUpperCase();
    const later = words
      .flatMap((word) => graphemesOf(word).filter((grapheme) => LETTER.test(grapheme)))
      .slice(1);
    for (const letter of later) yield lead + letter.toLocaleUpperCase();
  }
  for (let count = 2; ; count += 1) yield lead + String(count);
}

/**
 * `name`'s mark in `marks`, an {@link assignInitials} answer.
 *
 * @throws If `marks` was built without `name`: every surface builds its marks
 * from the people it can print, so a name outside them is a caller that skipped
 * one, never a person to invent a mark for.
 *
 * Proof: the throw replaced by `return initialsOf(name)` made `refuses a name
 * outside the marks rather than inventing one` fail on `expected [Function]
 * to throw an error`; watched 2026-10-27.
 */
export function initialsIn(marks: ReadonlyMap<string, string>, name: string): string {
  const mark = marks.get(name);
  if (mark === undefined) throw new Error(`no initials were assigned for ${JSON.stringify(name)}`);
  return mark;
}
