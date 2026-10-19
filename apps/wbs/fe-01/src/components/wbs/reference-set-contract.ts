import type { CreatablePickerProps } from './creatable-picker';
import type { CommitOutcome } from './live-editing';

/**
 * The dimensions this strip draws.
 *
 * `type` is the fourth and the one that never sets `inheritedLabel`: a work item
 * type does not inherit, so there is no ancestor reading for the placeholder or
 * the sheet's `Inherited:` line to show
 * (`docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md`). The field stays
 * optional rather than growing a per-kind type, because the strip's behaviour is
 * "draw it if you were given one" either way, and a union that made it
 * impossible for `type` would be a rule enforced in the one place nobody can
 * read it from — the cell that would have passed it.
 */
export type ReferenceSetKind = 'team' | 'tag' | 'service' | 'type';

export interface ReferenceSetEntry {
  id: string;
  name: string;
}

/** One member in force from above, and the row a reader has to go to to remove it. */
export interface InheritedReferenceEntry extends ReferenceSetEntry {
  /** The stating row, as a reader knows it — `010 Compliance`, never an id. */
  fromRow: string;
}

export interface ReferenceSetAdapter {
  kind: ReferenceSetKind;
  entries: readonly ReferenceSetEntry[];
  ownIds: readonly string[];
  /**
   * The ancestor's set this row reads while its own is empty, in words.
   *
   * Drawn by [ReferenceSetSheet](./reference-set-field.tsx) alone, as its `Inherited:` line. The
   * table cell has 120px and says the same thing in the search box's
   * placeholder ink with a leading `↳` — one reading per surface, because two
   * of them in one cell is two of the lines the Tags column grew.
   *
   * **The overriding dimensions' shape**, which since ADR 0008 is teams and
   * services. It cannot describe an accumulating one: "while its own is empty"
   * is the whole of what it says, and a row states `Ready` while carrying `Risk`
   * from `010`. Tags pass {@link inheritedEntries} instead.
   */
  inheritedLabel?: string;
  /**
   * The members in force from above that this row does not state, drawn as chips
   * beside its own.
   *
   * **Chips rather than a placeholder**, because a row that states members of
   * its own still carries these: the box is not empty, so there is no
   * placeholder left to say it in. That is the accumulating dimension's shape,
   * which since ADR 0008 is tags and tags alone — teams and services override,
   * so a row that states any carries none of its ancestor's and
   * {@link inheritedLabel} is the whole of what they need.
   *
   * No adapter passes both: they are the same claim in two shapes, and drawing
   * both put `↳ Risk, Review` and `Inherited: Risk, Review` in one 120px cell on
   * 2026-08-29. The `type` kind passes **neither**, and that absence is
   * load-bearing rather than an omission — a type does not inherit at all
   * (`docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md`), so there is
   * nothing above a row for either field to describe.
   *
   * These wear no ✕ — a member comes off where it was written, and `fromRow` is
   * what the chip's `title` says instead.
   */
  inheritedEntries?: readonly InheritedReferenceEntry[];
  replace: (ids: string[]) => Promise<CommitOutcome>;
  create: (name: string, current: string[]) => Promise<CommitOutcome>;
}

export interface ReferenceSetStripProps {
  label: string;
  adapter: ReferenceSetAdapter;
  dataCell?: CreatablePickerProps['dataCell'];
  gridCell?: CreatablePickerProps['gridCell'];
  addLabel?: string;
  removeLabel?: (entry: ReferenceSetEntry) => string;
  /** The name of a conflicted type's keep button; see {@link holdsOneMember}. */
  keepLabel?: (entry: ReferenceSetEntry) => string;
  placeholder?: string;
  /**
   * Where the strip is drawn: a table cell's one clipped line (the default), or
   * the phone's sheet — see [ReferenceSetSheet](./reference-set-field.tsx).
   *
   * The sheet is a surface with room, so there it is laid out as a form: the
   * chips on their own wrapping line, the search under them at the sheet's
   * width, always in the flow. None of the cell's machinery for a 120px column
   * applies there — the clip and `+N` at rest, the floating panel while
   * editing, the hover card — and drawn with it, the sheet's anchor took the
   * sheet's whole height (`flex: 1` in a column) and centred one search box in
   * it: the blank middle and bottom-docked field of F-049 (2026-10-13).
   *
   * Proof: with the sheet passing no `face`, `opens the team sheet titled by
   * its field, chips and search at the top (F-049)` in `e2e/mobile.spec.ts`
   * failed on `the search is not under the chips — Expected: > 586.90625,
   * Received: 586.90625`: one line, 450px down the sheet.
   */
  face?: 'cell' | 'sheet';
  'data-hint'?: string;
  /** The project fact this box carries, drawn at once where a hint would wait. */
  'data-fact'?: string;
}

/**
 * Whether a kind holds at most one member: the work item type does
 * (WBS 010.4.10), so choosing replaces, creating selects the new type alone, and
 * a row stored with several is a **type conflict** drawn whole and flagged, with
 * a keep button per type. Nothing here picks one for the reader. The other
 * kinds add to a set.
 */
// Proof: forcing false made `flags a type conflict, shows every type, and keeps
// the one picked` find no conflict flag (2026-10-17).
export const holdsOneMember = (kind: ReferenceSetKind): boolean => kind === 'type';

/** One chip a resting line could not draw whole: its key and its words. */
export interface HiddenChip {
  key: string;
  text: string;
  /**
   * Whether it is hidden for being wider than what is left of the line, not
   * for having wrapped below it — a first chip a wrap cannot move. Its caller
   * may take it out of the flow (it keeps its width, so it stays measured as
   * too wide and the answer is stable) so it leaves no blank gap.
   */
  overruns: boolean;
}

/** One line of [ReferenceSetStrip](./reference-set-field.tsx)'s hover card. */
export interface ReferenceSetLine {
  /** Stable within one card — the React key. */
  key: string;
  text: string;
  /** Whether this row wrote the member, as against carrying it from above. */
  stated: boolean;
}

export interface ReferenceSetSheetProps extends Omit<ReferenceSetStripProps, 'face'> {
  open: boolean;
  onClose: () => void;
  /**
   * The sheet's heading and its dialog's name: the field this sheet edits and
   * the row it edits it on, in words (`Teams for 010 - Onboarding redesign`).
   *
   * Separate from {@link ReferenceSetStripProps.label}, which names the search
   * box and its list and is the table cell's own accessible name. The heading
   * was `Edit {label}` — `Edit Service or team for 010` on a sheet that edits
   * teams, which said neither which field nor which work item (F-049).
   */
  title: string;
}
