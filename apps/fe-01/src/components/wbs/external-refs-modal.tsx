import { systemOfUrl } from '@wbs/domain/external-system';
import { useState } from 'react';

import { type ExternalRefView, type ExternalSystemView, followableHref } from '@/lib/wbs-api';

import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '../ui/modal';

/** A ref as this editor states it — the shape the patch takes, with no minted id. */
export interface ExternalRefDraft {
  systemId: string;
  url: string;
}

export interface ExternalRefsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The work item's number, so the surface says whose links these are. */
  number: string;
  /** The refs as they stand, in order. */
  refs: readonly ExternalRefView[];
  /** The directory's vocabulary — what a system may be set to. */
  systems: readonly ExternalSystemView[];
  /**
   * States the whole list, in order.
   *
   * **Whole, never a delta**, and that is not this component's convenience: the
   * patch is a replacement (`tagIds`' rule), so every act here — an add, a
   * URL edit, a system change, a removal — sends the list as it will stand.
   * Undo restores the list it replaced, which it can only do because the list
   * was stated rather than merged.
   */
  onReplace: (refs: readonly ExternalRefDraft[]) => void;
}

/**
 * The system a pasted URL types itself as, as an id, or `''` for one no rule
 * claims.
 *
 * **The derivation runs here and its answer is then just a value in a select**
 * — the reader can change it before the ref is ever stored, and after it is
 * stored nothing re-derives (design D1). `''` is the reader's cue that the
 * paste was not recognised, not a failure: the editor refuses to add until a
 * system is named, which is the spec's "the ref SHALL NOT be stored until a
 * system is named".
 *
 * A name the deriver answers that this directory does not hold answers `''` as
 * well. That is a real state during a swap — an fe-01 holding a newer rule
 * against a be-01 whose vocabulary has not been migrated — and offering an id
 * the write would refuse with `unknown_system` is worse than asking.
 */
export function derivedSystemId(url: string, systems: readonly ExternalSystemView[]): string {
  const name = systemOfUrl(url);
  if (name === null) return '';
  return systems.find((system) => system.name === name)?.id ?? '';
}

/** The vocabulary as a `<select>`, used by the add row and by every stored row. */
function SystemChoice({
  label,
  value,
  systems,
  onChange,
}: {
  label: string;
  value: string;
  systems: readonly ExternalSystemView[];
  onChange: (systemId: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="border-input bg-background h-8 shrink-0 rounded-md border px-2 text-sm"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">Choose a system</option>
      {systems.map((system) => (
        <option key={system.id} value={system.name}>
          {system.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The ref list, edited: add from a pasted URL, change a system or a URL, remove
 * one.
 *
 * **The editor is a modal and not a cell popover**, because the cell is 40px and
 * cannot hold a picker (design D4) — which is also why this dimension does not
 * join the `ReferenceSetStrip` family even though its *vocabulary* behaves like
 * the tags'. Reordering is deliberately not offered: the order is the order the
 * refs were added (the proposal's last non-goal).
 *
 * Every act writes the **whole** list through {@link ExternalRefsModalProps.onReplace}
 * as it happens, rather than collecting an edit and saving on close. A surface
 * with a Save button is a surface a reader can leave with unsaved work in it,
 * and the write is a single replacement either way.
 *
 * A stored URL is followable here on exactly the card's terms —
 * {@link followableHref} — because the rule is about the *URL*, not about which
 * surface is drawing it, and a guard written twice is a guard that gets deleted
 * once.
 */
export function ExternalRefsModal({
  open,
  onOpenChange,
  number,
  refs,
  systems,
  onReplace,
}: ExternalRefsModalProps) {
  const [typedUrl, setTypedUrl] = useState('');
  const [chosenSystemId, setChosenSystemId] = useState('');
  /**
   * The system the add row will use: whatever the reader chose, or what the URL
   * derived while they have chosen nothing.
   *
   * Read rather than stored, so a reader who pastes a second URL over the first
   * gets the second one's answer instead of the first one's — a `useEffect`
   * syncing a state to a prop is the version of this that shows the wrong
   * system for one render.
   */
  const addingSystemId =
    chosenSystemId === '' ? derivedSystemId(typedUrl, systems) : chosenSystemId;
  const stated = (): ExternalRefDraft[] =>
    refs.map((ref) => ({ systemId: ref.systemId, url: ref.url }));

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      {/*
        No `aria-label`: Radix points `aria-labelledby` at {@link ModalTitle},
        and an `aria-label` here would be a second name for the same surface —
        which is not a tidiness point, it is what made `Links for 010` match the
        dialog *and* the cell button beneath it and broke two tests on
        `Found multiple elements with the text of: Links for 010`.
      */}
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{`Links for ${number}`}</ModalTitle>
          <ModalDescription>
            Where this work also exists. Nothing is fetched — a ref is a link.
          </ModalDescription>
        </ModalHeader>
        <div data-refs-editor className="flex flex-col gap-2">
          {refs.map((ref, at) => {
            const href = followableHref(ref.url);
            return (
              <div key={ref.id} data-refs-editor-row={ref.id} className="flex items-center gap-2">
                <SystemChoice
                  label={`System of link ${String(at + 1)}`}
                  value={systems.find((system) => system.id === ref.systemId)?.name ?? ''}
                  systems={systems}
                  onChange={(name) => {
                    const chosen = systems.find((system) => system.name === name);
                    if (chosen === undefined) return;
                    const next = stated();
                    next[at] = { systemId: chosen.id, url: ref.url };
                    onReplace(next);
                  }}
                />
                <input
                  aria-label={`URL of link ${String(at + 1)}`}
                  className="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
                  defaultValue={ref.url}
                  // On the blur and on Enter, never per keystroke: each write is
                  // a whole-list replacement and a patch per character would be
                  // one undo entry per character.
                  onBlur={(event) => {
                    if (event.target.value === ref.url) return;
                    const next = stated();
                    next[at] = { systemId: ref.systemId, url: event.target.value };
                    onReplace(next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                {href === null ? (
                  // The refusal is visible rather than silent: a URL the app
                  // will not follow says so where the Follow link would be.
                  <span
                    data-refs-editor-url={ref.id}
                    className="text-muted-foreground shrink-0 text-xs"
                    data-fact="Only http and https links can be followed"
                  >
                    {ref.url}
                  </span>
                ) : (
                  <a
                    data-refs-editor-url={ref.id}
                    className="shrink-0 text-sm underline"
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Follow
                  </a>
                )}
                <button
                  type="button"
                  aria-label={`Remove link ${String(at + 1)}`}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
                  onClick={() => {
                    onReplace(stated().filter((_, index) => index !== at));
                  }}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            );
          })}
        </div>
        <div data-refs-add className="flex items-center gap-2 border-t pt-3">
          <input
            aria-label="Paste a URL"
            className="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
            placeholder="Paste a URL"
            value={typedUrl}
            onChange={(event) => {
              setTypedUrl(event.target.value);
            }}
          />
          <SystemChoice
            label="System of the new link"
            value={systems.find((system) => system.id === addingSystemId)?.name ?? ''}
            systems={systems}
            onChange={(name) => {
              setChosenSystemId(systems.find((system) => system.name === name)?.id ?? '');
            }}
          />
          <button
            type="button"
            // Refused rather than guessed at: a ref with no system is not
            // storable (be-01 answers `unknown_system`), so the control that
            // would send one is disabled and the select beside it is where the
            // reader says which.
            className="bg-primary text-primary-foreground h-8 shrink-0 rounded-md px-3 text-sm disabled:opacity-50"
            disabled={typedUrl === '' || addingSystemId === ''}
            onClick={() => {
              onReplace([...stated(), { systemId: addingSystemId, url: typedUrl }]);
              setTypedUrl('');
              setChosenSystemId('');
            }}
          >
            Add link
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
