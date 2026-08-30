import { useRef, useState } from 'react';

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';

import { CreatablePicker, type CreatablePickerProps } from './creatable-picker';
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

export interface ReferenceSetAdapter {
  kind: ReferenceSetKind;
  entries: readonly ReferenceSetEntry[];
  ownIds: readonly string[];
  /**
   * The ancestor's set this row reads while its own is empty, in words.
   *
   * Drawn by {@link ReferenceSetSheet} alone, as its `Inherited:` line. The
   * table cell has 120px and says the same thing in the search box's
   * placeholder ink with a leading `↳` — one reading per surface, because two
   * of them in one cell is two of the lines the Tags column grew.
   */
  inheritedLabel?: string;
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
  placeholder?: string;
  title?: string;
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

export const REFERENCE_SET_STRIP_STYLE = {
  display: 'flex',
  // One line, and the callers that want a second one ask for it: a 120px
  // column that wraps is a row that grows a line per chip, which is what the
  // Tags cell was doing on 2026-08-29 (three lines, screenshotted). Both this
  // and the chip group below say `nowrap`, because one wrapping container
  // beside one that does not still wraps.
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: 4,
  // Shrinks below its content, which is what lets a `nowrap` line clip instead
  // of pushing its cell wider — and, in the Services cell, what lets the strip
  // share a flex line with the mismatch mark beside it. A `flex: 1` was
  // written here for that second case and deleted: taken out, all three
  // Chromium cases still passed, because a flex item shrinks on
  // `flex-shrink: 1` alone and the strip's content is wider than any of these
  // columns. R5 — the guard whose removal cannot be seen does not ship.
  minWidth: 0,
} as const;

/**
 * The truncation cue a clipped rest line wears — the last 14px faded out.
 *
 * The Depends-on cell's own, shared rather than measured twice: `DEP_EDGE_FADE`
 * in `wbs-table.tsx` is this constant, and the reasoning for a fade rather than
 * a `+N` marker is written there. It belongs to **rest** alone on both cells:
 * the picker's list opens inside the element this masks, and a mask over an
 * open directory cuts the list somebody is reading.
 */
export const REFERENCE_SET_EDGE_FADE =
  'linear-gradient(to right, #000 calc(100% - 14px), transparent)';

/**
 * How tall one resting reference strip stands, in px.
 *
 * The strip leaves the flow while it is edited (see {@link ReferenceSetStrip}),
 * so something has to hold the line it was occupying or the row would shrink
 * the moment somebody clicked into a cell — the 2026-08-29 report's own fault
 * with its sign flipped. This is that height, on the anchor.
 *
 * It is a **measurement**, not a preference: the resting strip is as tall as
 * the search box in it, which is Chromium laying out a 14px `input` with this
 * table's padding and border. A constant that quietly disagreed with the real
 * one would clip the rest line by the difference, and silently — every style
 * assertion about the anchor is written against this same number. So
 * `e2e/reference-cells.spec.ts` measures the painted anchor against the
 * painted strip instead, and fails when the two part company.
 */
export const REFERENCE_SET_LINE_HEIGHT = 24;

/**
 * Where an open panel sits in the stack.
 *
 * Above every layer `table-frame.ts` gives a pinned or sticky cell (4 is its
 * highest) and below the `PickerList`'s own 15, which opens **inside** this
 * panel: a list that its own panel painted over would be a directory nobody
 * can read.
 */
const REFERENCE_SET_PANEL_LAYER = 10;

export const REFERENCE_SET_ADD_CLASS =
  'shrink-0 border-0 bg-transparent text-xs hover:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--cell-bg))] hover:text-foreground';
export const REFERENCE_SET_CHIP_CLASS =
  'bg-muted inline-flex max-w-full items-center gap-0.5 rounded px-1 text-xs';
export const REFERENCE_SET_REMOVE_CLASS = 'shrink-0 border-0 bg-transparent p-0';

/** Shared compact editor for directory-backed work-item reference sets. */
export function ReferenceSetStrip({
  label,
  adapter,
  dataCell,
  gridCell,
  addLabel,
  removeLabel,
  placeholder,
  title,
}: ReferenceSetStripProps) {
  const root = useRef<HTMLSpanElement>(null);
  const ownIds = unique(adapter.ownIds);
  const own = ownIds.map(
    (id) => adapter.entries.find((entry) => entry.id === id) ?? { id, name: id },
  );
  const offered = adapter.entries.filter((entry) => !ownIds.includes(entry.id));
  const sourceIdsRef = useRef(ownIds);
  const projectedIdsRef = useRef(ownIds);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  /**
   * Whether the focus is anywhere in this strip — which is the same question as
   * "is the picker's list open", because the box opens its list on focus and
   * discards it on blur. The chips' own ✕ buttons count: somebody removing
   * members is editing this cell as much as somebody typing into it.
   */
  const [editing, setEditing] = useState(false);
  /**
   * Wrapping is for the chips, and only while somebody is editing them.
   *
   * At rest the cell clips (see the strip's `overflow` below) and one line is
   * the whole of it — a 120px column cannot afford a line per chip, and
   * growing every row that states three tags was the 2026-08-29 report. While
   * the cell is being edited the chips wrap into reach instead, because a chip
   * clipped out of sight is a member nobody can take off. An **empty** cell
   * never wraps: it has nothing to wrap, and the wrap is what made the
   * Depends-on cell two lines tall the moment it was clicked into
   * (`deps-single-line`, measured in Chromium).
   *
   * Proof, three faults, all watched 2026-08-29 in
   * `reference-set-field.test.tsx`. Forced to `false`, `wraps both containers
   * only while a crowded cell is edited` failed on `expected 'nowrap' to be
   * 'wrap'`; widened to `editing` alone, `keeps an empty cell on one line
   * while it is edited` failed on `expected 'wrap' to be 'nowrap'`; and with
   * `'wrap'` written into either container's style at rest — one at a time,
   * because one `nowrap` beside one `wrap` still wraps — `rests every flex
   * container of a crowded cell on one line` failed on `expected 'wrap' to be
   * 'nowrap'` at the strip's assertion and at the chip group's in turn.
   *
   * All four of those are **style** assertions: jsdom computes no layout, so
   * none of them can see a row's height. The layout oracle is
   * `e2e/reference-cells.spec.ts`'s `three tags stand the row taller than a
   * row with none`, where the same two injections were watched in Chromium at
   * `Received: 68.1875` (strip) and `Received: 56` (chip group) against a
   * resting `27.1875`. Watched 2026-08-29, after the jsdom-only round shipped
   * a fix that did not work in a browser.
   */
  const wrapping = editing && own.length > 0;
  if (sourceIdsRef.current.join('\0') !== ownIds.join('\0')) {
    sourceIdsRef.current = ownIds;
    projectedIdsRef.current = ownIds;
  }

  const mutate = async (
    project: (current: string[]) => string[],
    commit: (current: string[], next: string[]) => Promise<CommitOutcome>,
  ): Promise<CommitOutcome> => {
    if (pendingRef.current) return 'unsent';
    pendingRef.current = true;
    setPending(true);
    const current = projectedIdsRef.current;
    const next = unique(project(current));
    try {
      const outcome = await commit(current, next);
      // Creation cannot project the server-assigned id. Its unchanged `next`
      // must not overwrite props that refreshed while the create was awaited.
      if (outcome === 'landed' && current.join('\0') !== next.join('\0')) {
        projectedIdsRef.current = next;
      }
      return outcome;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    await mutate(
      (current) => current.filter((ownId) => ownId !== id),
      (_current, next) => adapter.replace(next),
    );
  };

  return (
    /*
      The line the strip stands on, and goes on standing on while the strip is
      not in it.

      An edited strip wraps, and until 2026-08-29 it wrapped **in flow**: the
      cell grew a line per chip, the row grew with it, and every row below moved
      down while somebody was reading the list they had just opened. Dany's
      screenshot of a three-line Tags cell is that. The wrap itself is right — a
      chip clipped out of sight is a member nobody can take off — so what
      changes is where it happens: the strip leaves the flow and opens as a
      panel over the rows below, and this anchor keeps its line.

      `position: relative` as well as the height, because the panel is placed
      against this element. It is **not** the picker's containing block — that
      is the `position: relative` span inside `CreatablePicker`, so the list
      still opens under its own box wherever the panel has put it.
    */
    <span
      data-reference-anchor=""
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        // A floor, not a height. At rest the strip stands in this anchor and
        // sets its own height — 24.1875px in Chromium, an input's border and
        // padding included — and a pinned 24 would clip it by the difference.
        // While the strip floats, this is what is left holding the line.
        minHeight: REFERENCE_SET_LINE_HEIGHT,
      }}
    >
      <span
        ref={root}
        data-reference-set={adapter.kind}
        data-reference-strip=""
        // focusin/focusout, which is what React's onFocus/onBlur are: a move
        // between two controls of this strip must not read as leaving it, or the
        // chips would snap back onto one clipped line under the pointer on its
        // way to a ✕.
        onFocus={() => {
          setEditing(true);
        }}
        onBlur={(leaving) => {
          if (!leaving.currentTarget.contains(leaving.relatedTarget)) setEditing(false);
        }}
        style={{
          ...REFERENCE_SET_STRIP_STYLE,
          flexWrap: wrapping ? 'wrap' : 'nowrap',
          // At rest the strip **is** the cell's line, and fills the anchor
          // holding it. While editing it leaves that line — see below.
          flex: 1,
          ...(editing
            ? {
                /*
                  The open panel: out of the flow, over the rows below, opaque.

                  Out of the flow is the fix. The wrap that puts a clipped chip
                  back in reach is real layout while the strip is in flow, so
                  the cell grew and the row grew with it — measured in Chromium
                  on 2026-08-29 at 87.2px against a resting 27.2, and
                  screenshotted by Dany as a Tags cell three lines tall. The
                  anchor above keeps the line; this floats over it.

                  Opaque is what makes it readable rather than merely present.
                  An out-of-flow strip with no background draws its chips over
                  whatever row happens to be under them, which is the same
                  screenshot with a different explanation. `--popover` is the
                  ink the picker's own list uses, so the panel and the list it
                  opens read as one surface.

                  The offsets undo the border and the padding this adds, so a
                  chip sits where it sat at rest rather than stepping down and
                  to the right as the panel opens.
                */
                position: 'absolute' as const,
                top: -1,
                left: -2,
                zIndex: REFERENCE_SET_PANEL_LAYER,
                /*
                  Its own column's width, and never a pixel of the one beside
                  it. A panel sized to its content (`max-content`, capped at
                  240px) covered the Tags cell of the same row while a Teams
                  cell was open, and a click aimed at the neighbour hit the
                  panel instead: `<span data-reference-strip data-reference-set="team">
                  … intercepts pointer events`, watched in Chromium, 2026-08-29.
                  A popover that eats its neighbour's clicks is not an
                  improvement on a row that grew.

                  So it grows **downwards only**. The chips wrap inside the
                  column's own width and the panel hangs over the rows below,
                  which are the pixels a popover is allowed to take. The `+ 4`
                  and the `-2` offset either side undo this panel's border and
                  padding, so a chip sits where it sat at rest.
                */
                width: 'calc(100% + 4px)',
                padding: '0 1px',
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px oklch(0 0 0 / 12%)',
              }
            : {}),
          // Rest clips and fades; editing does neither. The picker's list is an
          // absolutely positioned child of this element, so a rest-state clip
          // that outlived the focus would cut the directory off at the cell's
          // edge. `editing` is exactly "the list may be open".
          //
          // Proof, two faults, both watched 2026-08-29 by `fades and clips the
          // rest line, and does neither while editing`: `overflow` pinned to
          // `visible` failed on `expected 'visible' to be 'hidden'`, and the
          // mask deleted failed on `expected 'display: flex; flex-wrap: nowrap;
          // ali…' to contain 'linear-gradient(to right, #000 calc(1…'`.
          //
          // Both again in Chromium, which is where clipping is a fact rather
          // than a property: the fade deleted failed `the clipped rest line
          // wears no truncation cue` on `Expected: not "none"`, and
          // `overflow: 'visible'` never reached an assertion at all — the
          // spilled chips cover the cell, and clicking the box timed out on
          // `<td data-column="tag"> intercepts pointer events`.
          overflow: editing ? 'visible' : 'hidden',
          ...(editing
            ? {}
            : {
                WebkitMaskImage: REFERENCE_SET_EDGE_FADE,
                maskImage: REFERENCE_SET_EDGE_FADE,
              }),
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={addLabel ?? `Add a ${adapter.kind}`}
          data-reference-add=""
          className={REFERENCE_SET_ADD_CLASS}
          disabled={pending}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => root.current?.querySelector<HTMLInputElement>('input')?.focus()}
        >
          +
        </button>
        <span
          data-reference-chips=""
          style={{
            display: 'flex',
            // The strip's rule, said again here because a `nowrap` strip holding
            // a `wrap` group is still a cell that grows a line per chip.
            flexWrap: wrapping ? 'wrap' : 'nowrap',
            alignItems: 'center',
            gap: 3,
            minWidth: 0,
            maxWidth: '100%',
            /*
              A chip may not paint outside this group, because what is beside
              it is the search box — and the box, being later in the DOM, takes
              the press.

              The group shrinks below its content (`minWidth: 0`, which is what
              lets the line clip rather than widen the column), and a `visible`
              overflow then draws the last chip straight across the box:
              measured live on 2026-08-29 at `chips` 750–835 with a
              `scrollWidth` of 101, the last chip's own box running to 851, and
              the input standing at 839. Clicking that chip's `✕` hit the input
              instead — the browser gate's `<input … aria-label="Tags for 010">
              from <span data-reference-search> subtree intercepts pointer
              events`, a 60s timeout in `round-trips every desktop reference
              set`.

              Clipping here is what the cell already promises: the rest line is
              one clipped line, the fade on the strip says so, and a chip that
              has run out of room is reached by opening the cell rather than by
              aiming at the sliver of it that is still drawn. While the cell is
              open the chips wrap into the panel and there is nothing to clip,
              which is why this follows `wrapping` rather than being pinned.
            */
            overflow: wrapping ? 'visible' : 'hidden',
          }}
        >
          {own.map((entry) => (
            <span
              key={entry.id}
              data-reference-chip={entry.id}
              className={REFERENCE_SET_CHIP_CLASS}
            >
              <span className="truncate">{entry.name}</span>
              <button
                type="button"
                aria-label={removeLabel?.(entry) ?? `Remove ${entry.name} ${adapter.kind}`}
                disabled={pending}
                // Out of the tab order while the rest line clips, the
                // Depends-on cell's rule for the same reason: a sequential Tab
                // can focus a chip that is not on screen, and the browser
                // scrolls an `overflow: hidden` box to show what it focused,
                // shifting a layout nobody asked to move. Tab enters the cell
                // at the box, the box's focus wraps every chip back on screen,
                // and the ✕s are focusable there.
                tabIndex={editing ? undefined : -1}
                // **The press must not take the focus.** Focus here is what
                // makes the strip wrap, and a wrap is a re-layout: Chromium
                // focused this button on `mousedown`, React flushed the
                // discrete update, the ✕ moved from x=690.7,y=154.6 to
                // x=667.7,y=172.5 — onto the second line — and the `mouseup`
                // landed on whatever had taken its place. Measured on the real
                // page, 2026-08-29: `{down: 1, up: 0, click: 0, focusIn: 1}`
                // and not one request sent. A chip's ✕ did nothing at all.
                //
                // The same guard the `+` above carries, for the same reason,
                // and R5 #14/#15's fault class a fourth time: a discrete update
                // inside a mouse gesture that moves the target out from under
                // it. `preventDefault` on `mousedown` suppresses the focus, not
                // the click.
                onMouseDown={(pressed) => {
                  pressed.preventDefault();
                }}
                className={REFERENCE_SET_REMOVE_CLASS}
                onClick={() => void remove(entry.id)}
              >
                ×
              </button>
            </span>
          ))}
        </span>
        {/*
          The search box takes what the chips leave, and at rest that is
          allowed to be nothing.

          A `minWidth` floor here is a floor on the whole cell: 72px of it in a
          120px column left 34px for every chip the row states, so a cell with
          two tags in it clipped both and a cell with three wrapped onto a third
          line. The floor is real while somebody is typing into the box — a
          search you cannot read what you typed into is not a search — and the
          `+` beside it is what says "add" while the box is shut.

          It holds **nothing**, whatever the set's size. The chips are the value;
          a `restingValue` that printed the sole own member into the box drew
          that member twice in one 120px cell — `Platform ✕ Platform` — and left
          the `add` placeholder beside it unreadable.

          Proof, two faults, both watched 2026-08-29: `minWidth: 72` restored at
          rest, `leaves the whole rest line to the chips until the box is
          entered` failed on `expected 72 to be +0`; `restingValue` restored,
          `draws the sole own member once, as its chip` failed on `expected [
          'Platform', 'Platform' ] to deeply equal [ 'Platform' ]` — a count of
          the **visible** nodes saying it, because both readings answer to one
          accessible name.

          And both in Chromium, where the floor is a width rather than a
          property: `the search box still claims a width floor at rest` failed on
          `Expected: < 72 / Received: 72`, and `the sole own member is drawn more
          than once` on `Expected: 1 / Received: 2`.
        */}
        <span data-reference-search="" style={{ flex: 1, minWidth: editing ? 72 : 0 }}>
          <CreatablePicker
            label={label}
            entries={offered}
            value={null}
            onChoose={(id) =>
              mutate(
                (current) => [...current, id],
                (_current, next) => adapter.replace(next),
              )
            }
            onCreate={(name) =>
              mutate(
                (current) => current,
                (current) => adapter.create(name, current),
              )
            }
            closeWhen={(outcome) => outcome === 'landed'}
            disabled={pending}
            placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
            title={title}
            dataCell={dataCell}
            gridCell={gridCell}
          />
        </span>
      </span>
    </span>
  );
}

export interface ReferenceSetSheetProps extends ReferenceSetStripProps {
  open: boolean;
  onClose: () => void;
}

/** Phone presentation of the same directory-set editor. */
export function ReferenceSetSheet({
  label,
  adapter,
  open,
  onClose,
  ...stripProps
}: ReferenceSetSheetProps) {
  if (!open) return null;

  const ownIds = unique(adapter.ownIds);
  const closeAfterLanded = (outcome: CommitOutcome): CommitOutcome => {
    if (outcome === 'landed') onClose();
    return outcome;
  };
  const sheetAdapter: ReferenceSetAdapter = {
    ...adapter,
    replace: async (ids) => {
      const isAddition = unique(ids).some((id) => !ownIds.includes(id));
      const outcome = await adapter.replace(ids);
      return isAddition ? closeAfterLanded(outcome) : outcome;
    },
    create: async (name, current) => closeAfterLanded(await adapter.create(name, current)),
  };

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <ModalContent side="bottom" className="min-h-[60vh]" aria-label={`Edit ${label}`}>
        <button type="button" aria-label={`Close ${label}`} onClick={onClose}>
          ×
        </button>
        <ModalHeader>
          <ModalTitle>Edit {label}</ModalTitle>
          <ModalDescription>Type to search the directory, or add a new name.</ModalDescription>
        </ModalHeader>
        {/*
          Inheritance, in words, and **only here**. A sheet has the room to say
          where a label came from; a 120px cell does not, and says the same
          thing in its box's own placeholder ink with `↳`. Drawing both put
          `↳ Risk, Review` and `Inherited: Risk, Review` in one cell, one under
          the other, which is two of the three lines the Tags column stood at
          on 2026-08-29.

          Proof: this line put back on the strip as well, `draws an inherited
          set once, in the box it is shown but not stored in` failed on
          `expected [ '↳ Core', 'Inherited: Core' ] to deeply equal [ '↳ Core'
          ]` and the sheet's own case on `expected [ 'Inherited: Core from
          010', …(1) ] to deeply equal [ 'Inherited: Core from 010' ]`.
          Watched, 2026-08-29.

          It is a layout fault as well as a duplicate one, and Chromium says
          so: this line has no `nowrap`, so its text wraps inside the strip's
          one line and stands the row up. With it restored, `an inherited set
          stands the row taller than a row with none` failed on `Expected: <=
          27.1875 / Received: 56.5625` — two of the three lines of the
          original report, measured.
        */}
        {adapter.inheritedLabel !== undefined && (
          <p data-reference-inherited="">Inherited: {adapter.inheritedLabel}</p>
        )}
        <ReferenceSetStrip label={label} adapter={sheetAdapter} {...stripProps} />
      </ModalContent>
    </Modal>
  );
}
