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

export type ReferenceSetKind = 'team' | 'tag' | 'service';

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
        }}
      >
        {own.map((entry) => (
          <span key={entry.id} data-reference-chip={entry.id} className={REFERENCE_SET_CHIP_CLASS}>
            <span className="truncate">{entry.name}</span>
            <button
              type="button"
              aria-label={removeLabel?.(entry) ?? `Remove ${entry.name} ${adapter.kind}`}
              disabled={pending}
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
        */}
        {adapter.inheritedLabel !== undefined && (
          <p data-reference-inherited="">Inherited: {adapter.inheritedLabel}</p>
        )}
        <ReferenceSetStrip label={label} adapter={sheetAdapter} {...stripProps} />
      </ModalContent>
    </Modal>
  );
}
