/**
 * Where a binding applies, which is also how the cheat sheet is grouped.
 *
 * `Editing` is the keys that only fire in a Name cell — they type, so they
 * restructure only where the keystroke has no text meaning. `Moving rows` is
 * the Alt chords, which work from any cell and any caret position. The order
 * here is the order the sheet is read in.
 */
export type Where = 'Editing' | 'Moving rows' | 'Estimates' | 'Pickers' | 'Anywhere';

export const WHERE_ORDER: readonly Where[] = [
  'Editing',
  'Moving rows',
  'Estimates',
  'Pickers',
  'Anywhere',
];

/** One key or chord, what it does, and where it applies. */
export interface KeyBinding {
  /** The chord as it is shown. `Alt` is a token — {@link showKeys} labels it per platform. */
  keys: string;
  does: string;
  where: Where;
}

/**
 * Every key this table answers to, held once.
 *
 * This is the only prose description of the keyboard in the app: the cheat
 * sheet renders it and nothing else re-states it, so the sheet cannot drift
 * from the registry. What keeps the *registry* from drifting from the code is
 * the cross-check in `keyboard-cheat-sheet.test.tsx` — every entry there names
 * the behaviour tests that prove it, and the check fails when a named test
 * leaves `wbs-table.test.tsx`. Read that file's `PROVEN_BY` before adding an
 * entry here; an entry with no test named for it fails the check.
 *
 * `(where, keys)` is unique, because that pair is the key the mapping is by.
 */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    keys: 'Enter',
    does: 'A new work item below this one, at the same level, ready to be typed into.',
    where: 'Editing',
  },
  {
    keys: 'Tab',
    does: 'At the very start of a name, indents the row under the one above it. Anywhere else in the text, moves to the next cell.',
    where: 'Editing',
  },
  {
    keys: 'Shift + Tab',
    does: 'At the very start of a name, outdents the row. Anywhere else, moves back to the previous cell.',
    where: 'Editing',
  },
  {
    keys: 'Backspace',
    does: 'At the very start of a name, outdents the row — and on a wholly empty top-level row, removes it, leaving the focus on the row above.',
    where: 'Editing',
  },
  {
    keys: '↑ ↓ ← →',
    does: 'Move between cells: up and down walk a column, left and right move on once the caret has run out of text.',
    where: 'Editing',
  },
  {
    keys: 'Alt + ↑ / Alt + ↓',
    does: 'Moves the row up or down among its siblings. It never changes what the row sits under, and it stops at either end of the group.',
    where: 'Moving rows',
  },
  {
    keys: 'Alt + →',
    does: 'Indents the row — from any cell and any caret position, where Tab needs the start of the name.',
    where: 'Moving rows',
  },
  {
    keys: 'Alt + ←',
    does: 'Outdents the row, from any cell.',
    where: 'Moving rows',
  },
  {
    keys: '2/3/8',
    does: 'In a folded role’s cell: optimistic, realistic and pessimistic in one go.',
    where: 'Estimates',
  },
  {
    keys: '5',
    does: 'One number means all three points are that number.',
    where: 'Estimates',
  },
  {
    keys: 'Empty it',
    does: 'Emptying a folded role’s cell clears the estimate it held.',
    where: 'Estimates',
  },
  {
    keys: 'Type',
    does: 'Searches the list. Depends on takes a number or a name; the assignee and team boxes take a name.',
    where: 'Pickers',
  },
  {
    keys: '↑ ↓',
    does: 'Move the highlight in the Depends on list, stepping over the rows it would refuse.',
    where: 'Pickers',
  },
  {
    keys: 'Enter',
    does: 'Takes the highlighted entry. In an assignee or team box — which has no highlight — it takes the first match, or adds what you typed when nothing matches it.',
    where: 'Pickers',
  },
  {
    keys: 'Escape',
    does: 'Closes the list, leaving the box as it was.',
    where: 'Pickers',
  },
  {
    keys: '010, 020',
    does: 'Depends on takes several numbers at once, separated by commas or spaces.',
    where: 'Pickers',
  },
  {
    keys: '?',
    does: 'Opens this sheet — from anywhere except a box you are typing in, where it stays a question mark.',
    where: 'Anywhere',
  },
  {
    keys: 'Escape',
    does: 'Closes this sheet. In the Find box, clears the search and puts your collapsed branches back.',
    where: 'Anywhere',
  },
];

/**
 * Which label the `Alt` key should be given, or `unsure` when nothing said.
 *
 * `unsure` is a third answer rather than a default to one of the other two: a
 * sheet that says `⌥` to a Windows reader is wrong in a way that is hard to
 * recover from, and one that says `⌥/Alt` is merely wordy. Every reader can
 * read their own keyboard.
 */
export type AltStyle = 'mac' | 'pc' | 'unsure';

const MAC = /\b(mac|iphone|ipad|ipod)/i;
const NOT_MAC = /\b(win|linux|android|cros|x11|freebsd|openbsd)/i;

/**
 * Reads a platform out of what `navigator` says, if it says anything.
 *
 * Both arguments are optional because both can be absent: `navigator.platform`
 * is deprecated and empty in some browsers, and neither string is trusted to
 * exist. A runtime that reports neither gets `unsure`, which is a rendered
 * answer rather than a guess.
 *
 * @param platform What `navigator.platform` said, or undefined where it said nothing.
 * @param userAgent What `navigator.userAgent` said, or undefined.
 * @returns Which label {@link showKeys} should use for `Alt`.
 */
export function altStyleOf(platform: string | undefined, userAgent: string | undefined): AltStyle {
  const said = `${platform ?? ''} ${userAgent ?? ''}`;
  if (MAC.test(said)) return 'mac';
  if (NOT_MAC.test(said)) return 'pc';
  return 'unsure';
}

const ALT_LABEL: Readonly<Record<AltStyle, string>> = {
  mac: '⌥',
  pc: 'Alt',
  unsure: '⌥/Alt',
};

/**
 * One binding's chord, with `Alt` labelled for the keyboard in front of the
 * reader.
 *
 * A whole-word replacement: `Alt` is the only token that differs between
 * platforms here, and the arrows, Tab, Enter and the typed examples are the
 * same on both.
 *
 * @param keys A binding's `keys` string.
 * @param style What {@link altStyleOf} made of the browser.
 * @returns The chord as it should be shown.
 */
export function showKeys(keys: string, style: AltStyle): string {
  return keys.replaceAll(/\bAlt\b/g, ALT_LABEL[style]);
}
