/**
 * A work item's name and its notes, as be-01 holds them: two fields.
 *
 * They stay two fields. This module is only the reading and writing of the one
 * box the table shows them in — see {@link composeNameCell}.
 */
export interface NameAndNotes {
  name: string;
  notes: string;
}

/**
 * The one text a work item's Name cell shows: its name, and its notes under it.
 *
 * The separator is one newline and it is a separator, never a terminator — a
 * work item with no notes composes to its name and nothing else. An invented
 * trailing newline would round-trip through {@link splitNameCell} unnoticed
 * while every cell in the table grew a blank second line nobody typed.
 *
 * @param name The work item's name, as be-01 holds it.
 * @param notes Its notes, as be-01 holds them; `''` when it has none.
 * @returns The text the cell shows and is edited as.
 */
export function composeNameCell(name: string, notes: string): string {
  return notes === '' ? name : `${name}\n${notes}`;
}

/**
 * What a typed Name cell says the name and the notes now are.
 *
 * Everything before the first newline is the name; everything after it is the
 * notes, internal newlines included. There is no ambiguity to resolve and no
 * edit to refuse — which is the point, and it has consequences that are
 * **product semantics rather than accidents**, each pinned by a test in
 * `name-notes.test.ts`:
 *
 * - Deleting line 1 renames the work item to what was its first note. That is
 *   what editing one merged field means; Cmd+Z is the way back.
 * - An empty first line with something under it is a work item with no name and
 *   notes, which the completeness checker already reports as an unnamed item.
 * - A trailing newline is no notes at all, so pressing Enter at the end of a
 *   name and pausing does not save a note whose whole content is a blank line.
 *   A blank line with something *under* it is inside the notes, where markdown
 *   needs it.
 *
 * Pass the text through {@link normalizeNewlines} first: a pasted `\r\n` splits
 * here into a name ending in `\r`, which is a difference nobody can see and one
 * that would be stored, compared against and re-sent forever.
 *
 * @param text What the cell holds.
 * @returns The two fields it says be-01 should now hold.
 */
export function splitNameCell(text: string): NameAndNotes {
  const at = text.indexOf('\n');
  if (at === -1) return { name: text, notes: '' };
  return { name: text.slice(0, at), notes: text.slice(at + 1) };
}

/**
 * The same text with every line ending written the one way this cell reads.
 *
 * Paste is the vector — a note copied out of Notepad or an email arrives with
 * `\r\n`, and a lone `\r` is what old Mac software and some rich-text editors
 * still produce. Both become `\n`, because {@link splitNameCell} splits on
 * `\n` and an unnormalised `\r` would ride along invisibly on the end of the
 * name.
 */
export function normalizeNewlines(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
