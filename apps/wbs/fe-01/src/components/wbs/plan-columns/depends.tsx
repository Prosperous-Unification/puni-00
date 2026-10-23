import { useRef, useState } from 'react';

import type { TypedDependencyEndpoint } from '@/lib/wbs-api';

import { PICKER_PANEL_STYLE } from '../creatable-picker';
import { CapturedDependencyDetails, DependencyNavigation } from '../dependency-navigation';
import { DependencyOptions } from '../dependency-options';
import {
  type DependencySelection,
  encodeDependencyEndpoint,
  type EndpointOption,
  serializeDependencyEndpoint,
  serializePersistedDependencyEndpoint,
} from '../dependency-selection';
import type { DependencyDraftCapture } from '../dependency-token-bindings';
import { DependsCard, dependsLine } from '../depends-card';
import { currentDependencyToken, replaceDependencyToken } from '../depends-input';
import { cellKey } from '../editable-grid';
import { commandChordIn, escapesAnOpenList } from '../keyboard-bindings';
import { didLand } from '../live-editing';
import { DEP_LIST_WIDTH } from '../plan-cell-props';
import type { PlanLive } from '../plan-live';
import {
  chipLineStyle,
  HiddenChipCount,
  REFERENCE_SET_ADD_CLASS,
  REFERENCE_SET_CHIP_CLASS,
  REFERENCE_SET_STRIP_STYLE,
  useHiddenChips,
} from '../reference-set-field';
import { RemoteDependencyEditor } from '../remote-dependency-editor';
import {
  buildLocalDependencyEditor,
  buildPersistedSuccessorEditor,
} from '../typed-dependency-editor';
import { dependencyWords, endpointText, TypedDependencyEditor } from '../typed-dependency-editor';
import { useCardOpenOn } from '../use-card-open-on';
import { useDependencySearch } from '../use-dependency-search';
import { column } from './column';

/**
 * A dependency chip keeps its intrinsic width: its words are a number, and a
 * number cut to `010.…` names nothing (UI review F-058). The shared chip
 * class's `max-w-full` is lifted for it; a chip that does not fit whole is
 * wrapped out of sight, or hidden where it is the first, and counted by
 * {@link HiddenChipCount} (decision D4).
 */
const WHOLE_CHIP_STYLE = { maxWidth: 'none', flexShrink: 0 } as const;

/**
 * A chip the resting line could not draw whole: not painted and not under the
 * pointer, but still in the accessibility tree — the cell's ✕ buttons are
 * named controls a reader's element walk must still find, as when a clipped
 * chip stood past the edge. `visibility: hidden` was the first answer and took
 * the chip out of that tree with its paint.
 */
const UNDRAWN_CHIP_STYLE = { opacity: 0, pointerEvents: 'none' } as const;

/** Builds the depends column family against the stable live cell contract.
 * Tab and Shift+Tab keep the grid walk. Home in an empty search focuses the
 * first typed chip; ArrowDown/ArrowUp move between typed chips, Enter edits,
 * Delete removes, and Escape returns to search. ArrowRight/› on a highlighted
 * search result opens Customize for a new relationship.
 */
export function createDependsColumn({ live }: { live: PlanLive }) {
  return column.display({
    id: 'depends',
    meta: { isEditable: () => true },
    header: 'Depends on',
    cell: ({ row }) => {
      // A subscription and not a reading off `live`: this cell is a component
      // ({@link flexRender} builds it with `createElement`), so it can be told
      // about its own card without the table rendering. First, and
      // unconditionally, because it is a hook.
      // `flexRender` builds this with `React.createElement`, so it **is** a
      // component and the hook below is legal; the rule reads the property
      // name `cell` and cannot see the call site.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const cardOpen = useCardOpenOn(live.current.cellCards, cellKey(row.original.id, 'depends'));
      // This column's cell is rendered as a React component by flexRender.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [editing, setEditing] = useState<{
        predecessorId: string;
        dependencyId?: string;
        selection?: DependencySelection;
        draftCapture?: DependencyDraftCapture;
      } | null>(null);
      // flexRender mounts this cell as a React component; the ref identifies one Customize gesture.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const editorSession = useRef({ editing, generation: 0 });
      // Proof: removing the gesture key kept a reopened identical target busy with its previous pending write (mounted round2 tests).
      if (editorSession.current.editing !== editing)
        editorSession.current = { editing, generation: editorSession.current.generation + 1 };
      // This cell is rendered as a component by the table library.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [announcement, setAnnouncement] = useState('');
      // This cell is rendered as a component by the table library.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [adding, setAdding] = useState<ReadonlySet<string>>(() => new Set());
      // The resting line's chip group, measured for what it could not draw.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const chipLine = useRef<HTMLSpanElement>(null);
      // From the tree (`dependenciesOf` walks `flat`), never from the
      // rows on screen: a collapsed or filtered-out dependency has no row
      // to light, and the card naming it is then the only place it is
      // said at all.
      // Proof: narrowed to entries with a rendered `<tr>`, `a collapsed
      // dependency has no row to light, and the card still names it`
      // failed on `Unable to find an accessible element with the role
      // "tooltip"` — the hidden dependency dropped, the cell left with
      // nothing to say. Watched, 2026-08-10.
      const waitingFor = row.original.readings.dependencies;
      const typedDependencies = row.original.readings.typedDependencies;
      const dependencyRows = row.original.readings.dependencyRows;
      const dependencySteps = row.original.readings.dependencySteps;
      const dependsCell = cellKey(row.original.id, 'depends');
      // This cell's picker, or null while it is closed or under another row.
      const picker = row.original.readings.dependencyPicker;
      // The table library renders cell as a component; hook order is unconditional.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const search = useDependencySearch({
        lookup: live.current.dependencyLookup,
        projectId: live.current.projectId,
        ownerId: row.original.id,
        active: picker !== null,
        typed: picker?.typed ?? '',
        setTyped: (typed) => {
          live.current.setDepPicker((current) =>
            current?.rowId === row.original.id ? { ...current, typed, highlightId: null } : current,
          );
        },
        localEntries: row.original.readings.dependencyEntries,
      });
      const entries = search.options;
      const customize = (option: EndpointOption) => {
        setEditing({
          predecessorId: option.selection.endpoint.workItemId,
          selection: option.selection,
          draftCapture: search.captureDraft(),
        });
      };
      const choose = (option: EndpointOption) => {
        if (adding.has(option.key)) return;
        if (picker?.stepId !== undefined) {
          customize(option);
          return;
        }
        const typed = picker?.typed ?? '';
        const reference =
          option.selection.kind === 'remote' ? option.selection.candidate.reference : null;
        const draft = reference === null ? typed : replaceDependencyToken(typed, reference);
        live.current.setDepPicker((current) =>
          current?.rowId === row.original.id ? { ...current, typed: draft } : current,
        );
        setAdding((current) => new Set(current).add(option.key));
        void live.current
          .pickDependency(row.original.id, option.selection, search.captureDraft(draft))
          .then((outcome) => {
            setAdding((current) => {
              const next = new Set(current);
              next.delete(option.key);
              return next;
            });
            setAnnouncement(didLand(outcome) ? 'Dependency added.' : 'Dependency refused.');
          });
      };
      // The entries a click or an Enter may actually take. A marked entry
      // is on screen to be read, not to be picked: be-01 would refuse it,
      // and the mark is this cell saying so before the click rather than
      // after it.
      const pickable = entries.filter(
        (entry) => entry.kind === 'project' || entry.refusal === undefined,
      );
      // Resolved by id at render, so a highlight whose row has left the
      // list — or has since become one be-01 would refuse — is simply
      // nothing rather than somebody else's row.
      const activeOption =
        picker?.highlightId == null
          ? undefined
          : pickable.find((entry) => entry.key === picker.highlightId);
      const open = picker !== null;
      const resting = picker === null;
      const hasChips = waitingFor.length > 0 || typedDependencies.length > 0;
      // The chips the resting line could not draw whole, by the same
      // measurement as the Tags, Teams, Services and Types strips: `+N` after
      // the chips with an `Also: …` title, and no edge fade (decision D4 as
      // amended 2026-10-14: `+N` is the cue; a fade dimmed the last chip's ✕).
      // Proof: the count's render removed, `draws a dependency number whole
      // and counts what the line hid` (`e2e/plan-table-review.spec.ts`)
      // failed on `Expected: "+2" · Received: null`. Watched 2026-10-14.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const hiddenChips = useHiddenChips(
        chipLine,
        resting,
        [...waitingFor.map(({ id }) => id), ...typedDependencies.map(({ id }) => id)].join('\0'),
      );
      const undrawnStyleOf = (key: string) => {
        const hidden = hiddenChips.find((chip) => chip.key === key);
        if (hidden === undefined) return {};
        // Out of the flow where it overran the line, so a lone chip too wide
        // for the cell leaves `+ +1` rather than a blank chip-wide gap. It
        // keeps its width and its static place, so it still measures as too
        // wide and the answer cannot flicker.
        return hidden.overruns
          ? { ...UNDRAWN_CHIP_STYLE, position: 'absolute' as const }
          : UNDRAWN_CHIP_STYLE;
      };
      // Nothing to expand where nothing is waited for, and the picker owns
      // the cell while it is open: both boxes hang off the bottom edge of
      // one 110px cell, and the one somebody is typing into is the one they
      // are looking at. `picker`, not `open`: a picker with nothing to
      // offer is still a cell being typed in.
      const cardable = (waitingFor.length > 0 || typedDependencies.length > 0) && picker === null;
      const carded = cardable && cardOpen;
      // What the card says, for a reader with no pointer. This cell cannot
      // answer a focus with the card the way the folded step cell does —
      // the focus here already belongs to the picker, which opens on it and
      // offers the rows this one could *start* waiting for, and stacking
      // two boxes over one 110px cell is what the design ruled out. So the
      // names are a description of the box instead, off the same
      // `waitingFor` list the card is built from. codex round 3, finding 2.
      // Proof: the `aria-describedby` dropped from the input, `describes the
      // box with what the row waits for, pointer or no pointer` failed on
      // `expected null to be 'depends-w3'`. Watched, 2026-08-09.
      const waitsForId = `depends-${row.original.id}`;
      return (
        <span
          // **No `onMouseEnter` here, and that is this change.** The
          // cell-level dependency hover used to be on this wrapper, which
          // stands *inside* the `<td>`'s padding box and, at the column's
          // own 110px, is filled edge to edge by the pills — so a reader
          // pointing at the cell got nothing, and the only place that
          // answered the whole-cell gesture was the 15.8px add button. It
          // is on the `<td>` now; see `dependsCellHoverProps`, and
          // `openspec/changes/table-width-budget/design.md` D2 for the
          // measurement.
          //
          // This wrapper carried `whiteSpace: 'normal'` until 2026-08-10,
          // with the rationale "an uneven row height is a cost worth
          // paying; a dependency nobody can see is not". The change
          // `deps-single-line` reverses that decision by name — and
          // `table-geometry-and-tab-order`'s "wraps its chips onto a
          // second line rather than clipping them" with it (archived at
          // openspec/changes/archive/2026-08-10-table-geometry-and-tab-order/)
          // — because the full list now lives in the DependsCard hover
          // and the box's sr-only description, so the cell no longer has
          // to be several lines tall to say it. At rest the strip below
          // clamps to one clipped line; the `+N` after it is the cue.
          //
          // The positioned ancestor the listbox below is placed against —
          // which is what decides *where* the list opens, not whether it
          // is clipped. The clipper is the `<td>`, and it is what
          // {@link POPOVER_COLUMNS} exempts.
          style={{
            position: 'relative',
            display: 'block',
            maxWidth: '100%',
          }}
        >
          {waitingFor.length > 0 && (
            <span id={waitsForId} className="sr-only">
              {`Waiting for ${waitingFor.map(dependsLine).join(', ')}`}
            </span>
          )}
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
          {/*
                The strip: the chips and the box, and nothing else — the
                popovers below hang from the wrapper, because this box clips
                and they must not be inside the clipper. At rest it is one
                flex line that does not wrap; while the picker owns the cell
                **and the cell has chips** it wraps exactly as the cell always
                did, so typing and the open list are unchanged (precedent:
                {@link CellInputProps.restShowsFirstLineOnly} — clamped at
                rest, whole while somebody is in it). `whiteSpace: 'nowrap'`
                is not decoration beside `flexWrap`: it is what keeps a
                squeezed chip's `✕` from folding under its number and growing
                the one line into two. The rest state's truncation cue is
                the `+N` after the chips, counting what the line hid
                (decision D4); there is no edge fade.

                **And only with chips**, which is this change's own correction
                and not a tidy. `wrap` plus the box's `width: 100%` claim
                means the box can never share a flex line with anything: its
                hypothetical size is the whole strip, so the 13px `+` beside
                it pushed it onto a second line and made an *empty* cell grow
                the moment somebody clicked into it. Measured on dev at
                `2b2affec` in a cloud Chromium, 2026-08-11: a chipless row
                rested at **26px** and stood at **44.98px** with the picker
                open, the box dropping from `y=198` to `y=219.98` and taking
                the listbox 21px down the page with it — the affordance
                moving the list somebody had just opened to read. Clicking
                the cell and clicking the `+` measured identically, so it was
                the layout and not the button's handler.

                Wrapping only for chips returns the open empty cell to the
                geometry it has at rest — one line, the box shrunk past the
                `+` by `minWidth: 0` to the same `84.2px` it rests at — and
                leaves the crowded cell's open state untouched, which is the
                half `deps-single-line` measured. The `+` was not hidden
                instead: always on screen is the whole of what it is for
                (Dany, 2026-08-11), and a cell somebody is typing into is
                where an affordance saying "another one" has most to say.

                Proof: the rest branch's `flexWrap` forced to `'wrap'`,
                `clamps the chips and the box onto one nowrap line at rest`
                failed on `expected 'wrap' to be 'nowrap'`. Watched,
                2026-08-10. The chipless half is its own check, below. The
                row height itself — seven chips no taller than none, a
                clipped chip invisible, an empty cell no taller open than
                shut — is Chromium's proof, in `e2e/deps-cell.spec.ts`.
              */}
          <span
            data-depends-strip={row.original.id}
            data-reference-strip=""
            style={{
              ...REFERENCE_SET_STRIP_STYLE,
              // Wrapping is for the chips, and only for them. See the
              // block above: an empty cell has nothing to wrap, and the
              // wrap is what made it two lines tall the moment it was
              // clicked into.
              // Proof: excluding typed chips made `wraps a typed-only dependency
              // chip while its picker is open` receive `nowrap`. Watched, 2026-09-28.
              flexWrap: picker !== null && hasChips ? 'wrap' : 'nowrap',
              gap: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              // Pinned: the `+` leads and the clip cuts the *physical* right
              // edge — the app is LTR-only today.
              direction: 'ltr',
            }}
          >
            {/*
                  The add affordance, first on the strip's line and always on
                  it. Adding a dependency has only ever been discoverable by
                  knowing that the cell's box is a box — a rested cell full of
                  chips shows `010 ✕ 030 ✕` and nothing that says another one
                  can be added (Dany, 2026-08-11). This is that affordance, and
                  it triggers exactly the flow a click in the cell already
                  triggers: the box takes the focus, and the box's own
                  `onFocus` opens the picker ready to type.

                  **First, not last.** The strip clips its right edge; a trailing
                  affordance in a cell waiting on seven rows would be clipped
                  out of sight in exactly the crowded cell that needs it most,
                  and the box's `width: 100%` claim would have pushed it there
                  on an empty one too. The leading edge is the one place on a
                  clipping `nowrap` line that is never cut. Proven in Chromium
                  — `keeps the add button visible in a cell whose chips are
                  clipped`, `e2e/deps-cell.spec.ts` — because whether a box is
                  clipped is a layout fact and jsdom lays nothing out (R5
                  #14–16).

                  Sized as a chip and no larger: the row rests at 28px and the
                  chips are what set that line's height, so an affordance built
                  to their `line-height` costs the row nothing. `flexShrink: 0`
                  because a squeezed cell must clip chips rather than crush
                  this.
                */}
            <button
              type="button"
              data-dep-add={row.original.id}
              data-reference-add=""
              className={REFERENCE_SET_ADD_CLASS}
              // Not `Add a dependency to 020` — that is the box's own
              // label, and two controls in one cell answering to one name
              // is a reader told the same thing twice with no way to tell
              // which is which. The chips' voice instead: they say `Stop
              // 020 waiting for 030`, so this says what it starts.
              //
              // No `title` beside it. `Add a dependency` was one, and a
              // tooltip reading one thing while the accessible name reads
              // another is the control answering to two names — the exact
              // fault the name above was chosen to avoid, reintroduced by
              // the attribute that was meant to explain it (codex review,
              // 2026-08-11). The sighted reader has the `+`; anyone who
              // needs words has the name.
              aria-label={`Make ${row.original.number} wait for something`}
              // Deliberately not a tab stop, at rest and with the picker
              // open alike — where the chips flip (`deps-single-line`).
              // The keyboard already has this exact path and reaches it
              // first: Tab into the cell lands on the box, and the box's
              // focus is what opens the picker. A stop here would add one
              // Tab per row to every walk through the plan and offer
              // nothing at the end of it that the next Tab does not
              // already do. It stays a `<button>` with a name, so a
              // reader's element walk still finds it; what it does not do
              // is stand in the sequential order.
              tabIndex={-1}
              onMouseDown={(pressed) => {
                // The press must not move the focus. Without this the
                // button takes it, and a button taking the focus from this
                // cell's *own* box is a blur — which closes the picker and
                // drops what was typed into it (the box's `onBlur`, this
                // cell's contract since it was written). Somebody who
                // types `03` and then reaches for the affordance beside it
                // would lose the search to the control that means "search".
                // The precedent is the Name cell's notes marker, which
                // forwards its press to the box under it the same way.
                //
                // The click below still fires — `preventDefault` on
                // `mousedown` suppresses the focus, not the click (R5 #14's
                // lesson, read the other way round). And the action lives
                // there rather than here for two reasons: a `mousedown`
                // that re-renders before the browser performs its default
                // action is R5 #12's fault class, and an assistive
                // technology's activation dispatches a click with no
                // `mousedown` at all.
                pressed.preventDefault();
              }}
              onClick={(pressed) => {
                // The box is this button's sibling on the strip — the same
                // reach the notes marker makes, scoped by the row's own id
                // so a stale query can never focus another row's cell.
                const box = pressed.currentTarget.parentElement?.querySelector<HTMLInputElement>(
                  `[data-depends-input="${row.original.id}"]`,
                );
                /*
                        **A toggle**, and the question is about the picker rather
                        than the focus. Dany, 2026-09-01: _"can you make it so
                        that clicking second time on plus sign for tags/deps
                        on/teams/services hides the add UI"_.

                        `picker` is already exactly "this cell's picker, or null
                        while it is closed or under another row", so this cell
                        needs no `aria-expanded` reading the way the reference
                        strip's `+` does — it has the state itself. What it must
                        not read is the focus: this box opens its picker *on*
                        focus, so "focused" and "open" are the same thing here
                        only because nothing closes the list under a box that
                        keeps the focus. The reference strip's `+` says at length
                        why that distinction matters on the cells where a take
                        closes the list and leaves the focus behind.

                        `blur()` and not `setDepPicker(null)`: the blur is the
                        close this cell already makes from Escape and from a
                        click outside, and it clears the cell-level focus light
                        beside the picker. Closing the picker alone would leave
                        the box holding the keyboard with no list under it.
                      */
                if (picker !== null) {
                  box?.blur();
                  return;
                }
                box?.focus();
              }}
              style={{ flexShrink: 0 }}
            >
              +
            </button>
            {/*
                  The chips, in a group of their own so the resting line can
                  wrap what does not fit out of sight and count it — the
                  reference strips' {@link chipLineStyle}, shared. Open, the
                  group takes the line beside the `+` (`flex: 1 1 0%`) and
                  wraps every chip into reach; the box goes under it.

                  The data-only total that stood here (`3` beside the `+`,
                  `waitingFor.length`) is gone: it read as "add 3", counted
                  the chips on screen as well as the hidden ones, and said it
                  before them (UI review F-057).
                */}
            {hasChips && (
              <span
                ref={chipLine}
                data-reference-chips=""
                style={{
                  ...chipLineStyle(!resting, 2),
                  // The containing block an overrunning chip leaves the flow
                  // into, and is clipped by.
                  position: 'relative',
                  ...(resting ? {} : { flex: '1 1 0%' }),
                }}
              >
                {waitingFor.map(({ id, number }) => (
                  <button
                    key={id}
                    type="button"
                    data-reference-chip={id}
                    data-rest-chip={id}
                    className={`${REFERENCE_SET_CHIP_CLASS} border-0`}
                    style={{
                      ...WHOLE_CHIP_STYLE,
                      ...undrawnStyleOf(id),
                    }}
                    aria-label={`Stop ${row.original.number} waiting for ${number}`}
                    // No hint here: the cell's
                    // own card owns this hover, and the ✕ already answers to
                    // `Stop 020 waiting for 010`.
                    // Out of the tab order while the strip is clipped: a
                    // clipped chip is a native button a sequential Tab could
                    // still reach, invisible, and the browser may scroll the
                    // `overflow: hidden` strip to show what it focused —
                    // shifting the rested layout. With the picker open the
                    // strip wraps, every chip is on screen, and the ✕ is
                    // focusable the way a visible button should be. Keyboard
                    // removal is unchanged: Tab enters the cell at the box,
                    // the picker opens on the focus, the chips are back.
                    // Proof: the condition dropped (chips always focusable),
                    // `keeps clipped chips out of the tab order at rest`
                    // failed on `expected +0 to be -1`. Watched, 2026-08-10.
                    tabIndex={picker === null ? -1 : undefined}
                    // The pill-level hover: this one dependency's row alone,
                    // and the card's emphasis with it. A chip the strip has
                    // clipped simply has no hover target — the cell-level
                    // enter above still lights every dependency's row, which
                    // is the U3→U4 case named in the plan rather than
                    // discovered.
                    onMouseEnter={() => {
                      // **No guard, since 2026-09-09**, and the cell's own is gone
                      // with it: while the card stood *under* its cell, a chip of
                      // the row beneath was what the pointer landed on inside the
                      // card's passive padding, and narrowing to that chip's row lit
                      // the wrong plan. The card opens **beside** its cell now, so
                      // no chip but this card's own row's is ever under it.
                      live.current.depLights.updateHover((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? current
                          : { rowId: row.original.id, pillId: id },
                      );
                    }}
                    onMouseLeave={() => {
                      // Off the pill but still in the cell: back to the whole
                      // waited-for set, not cleared — the wrapper's own leave
                      // is what clears. Guarded on this pill's id so a leave
                      // that lands after the next pill's enter cannot widen
                      // the hover that enter just narrowed.
                      // Proof: the restore dropped (leave returning
                      // `current`), `narrows to the pill's row, and widens
                      // again when the pill is left` failed on `expected
                      // ['010'] to deeply equal ['010', '020']`. Watched,
                      // 2026-08-10.
                      live.current.depLights.updateHover((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? { rowId: row.original.id, pillId: null }
                          : current,
                      );
                    }}
                    // The keyboard's reading of the same pill — see
                    // {@link depFocus}. The enter/leave pair above, with focus
                    // in place of the pointer, and one difference: the blur
                    // *clears* where the leave widens. A leave means the
                    // pointer is still in the cell (the wrapper's own leave is
                    // what clears); a blur means nothing of the sort, and
                    // widening on it would leave the cell lit forever once the
                    // focus walked out of the plan from a chip. Focus moving
                    // chip → box relights the cell from the box's own focus,
                    // which fires after this blur.
                    onFocus={() => {
                      live.current.depLights.updateFocus((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? current
                          : { rowId: row.original.id, pillId: id },
                      );
                    }}
                    onBlur={() => {
                      live.current.depLights.updateFocus((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? null
                          : current,
                      );
                    }}
                    onClick={() => {
                      // This button *is* the pill, so the click unmounts it and
                      // no `mouseleave` or `blur` of its own ever arrives: the
                      // hover would stay on an id the cell no longer names and
                      // keep the cut edge's row lit under a pointer that had
                      // not moved. The pointer *is* still in the cell, so this
                      // widens to the cell itself — exactly what the leave that
                      // cannot fire would have done, which is why the light
                      // goes to the remaining dependencies rather than out.
                      // Focus is cleared instead, for the reason `onBlur` above
                      // gives. `depLit` refuses a `pillId` the cell no longer
                      // names as well: this end is the pointer's truth, that
                      // end is the paint's.
                      //
                      // Proof: this widen dropped, `widens back to the
                      // remaining dependencies when a pill is deleted under the
                      // pointer` failed on `expected [] to deeply equal
                      // ['020']` — the light gone from a cell the pointer was
                      // still in. Watched, 2026-08-11.
                      live.current.depLights.updateHover((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? { rowId: row.original.id, pillId: null }
                          : current,
                      );
                      live.current.depLights.updateFocus((current) =>
                        current?.rowId === row.original.id && current.pillId === id
                          ? null
                          : current,
                      );
                      void live.current.run((write) =>
                        write.perform(['tree'], () =>
                          live.current.commands.removeDependency(row.original.id, id),
                        ),
                      );
                    }}
                  >
                    <span>{number}</span> ✕
                  </button>
                ))}
                {typedDependencies.map((dependency) => {
                  const wholeWait =
                    dependency.type === 'FS' &&
                    dependency.predecessor.scope === 'whole' &&
                    dependency.successor.scope === 'whole';
                  const predecessorNumber = endpointText(
                    dependency.predecessor,
                    dependencyRows,
                    dependencySteps,
                    row.original.readings.dependencyStepNodes ?? undefined,
                  );
                  const words = dependencyWords(
                    dependency,
                    dependencyRows,
                    dependencySteps,
                    row.original.readings.dependencyStepNodes ?? undefined,
                  );
                  return (
                    <button
                      key={dependency.id}
                      type="button"
                      className={`${REFERENCE_SET_CHIP_CLASS} border-0`}
                      style={{
                        ...WHOLE_CHIP_STYLE,
                        ...undrawnStyleOf(dependency.id),
                      }}
                      data-rest-chip={dependency.id}
                      aria-label={`${wholeWait ? `Stop ${row.original.number} waiting for ${predecessorNumber}. ` : 'Edit dependency: '}${words.label}. Enter to edit. Delete to remove. Escape to return to dependency search.`}
                      title={`${words.label}. Enter to edit.`}
                      aria-keyshortcuts="Enter Delete"
                      data-typed-dependency-chip=""
                      data-reference-chip={
                        wholeWait ? dependency.predecessor.workItemId : undefined
                      }
                      tabIndex={picker === null ? -1 : undefined}
                      onMouseEnter={() => {
                        live.current.depLights.updateHover(() => ({
                          rowId: row.original.id,
                          pillId: dependency.id,
                        }));
                      }}
                      onMouseLeave={() => {
                        live.current.depLights.updateHover((current) =>
                          current?.pillId === dependency.id ? null : current,
                        );
                      }}
                      onFocus={() => {
                        live.current.depLights.updateFocus(() => ({
                          rowId: row.original.id,
                          pillId: dependency.id,
                        }));
                      }}
                      onBlur={() => {
                        live.current.depLights.updateFocus((current) =>
                          current?.pillId === dependency.id ? null : current,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          event.currentTarget
                            .closest('[data-depends-strip]')
                            ?.querySelector<HTMLInputElement>(
                              `[data-depends-input="${row.original.id}"]`,
                            )
                            ?.focus();
                          return;
                        }
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          const chips = Array.from(
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                              '[data-typed-dependency-chip]',
                            ) ?? [],
                          );
                          const index = chips.indexOf(event.currentTarget);
                          chips[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
                          return;
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          setEditing({
                            predecessorId: dependency.predecessor.workItemId,
                            dependencyId: dependency.id,
                          });
                          return;
                        }
                        if (event.key !== 'Delete') return;
                        event.preventDefault();
                        // Proof: bypassing Delete made `Home reaches typed chips for Enter edit and Delete removal while Tab stays in the grid` fail to find `Dependency removed.`; watched 2026-09-28.
                        event.currentTarget
                          .closest('[data-depends-strip]')
                          ?.querySelector<HTMLInputElement>(
                            `[data-depends-input="${row.original.id}"]`,
                          )
                          ?.focus();
                        void live.current
                          .run((write) =>
                            write.perform(['tree'], () =>
                              live.current.commands.removeTypedDependency(dependency.id),
                            ),
                          )
                          .then((outcome) => {
                            setAnnouncement(
                              didLand(outcome)
                                ? 'Dependency removed.'
                                : 'Dependency removal refused.',
                            );
                          });
                      }}
                      onClick={() => {
                        if (wholeWait) {
                          void live.current.run((write) =>
                            write.perform(['tree'], () =>
                              live.current.commands.removeTypedDependency(dependency.id),
                            ),
                          );
                          return;
                        }
                        setEditing({
                          predecessorId: dependency.predecessor.workItemId,
                          dependencyId: dependency.id,
                        });
                      }}
                    >
                      {wholeWait ? (
                        <>
                          <span>{predecessorNumber}</span> ✕
                        </>
                      ) : (
                        <span>{words.chip}</span>
                      )}
                    </button>
                  );
                })}
              </span>
            )}
            {resting && <HiddenChipCount hidden={hiddenChips} />}
            <input
              aria-label={`Add a dependency to ${row.original.number}`}
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? `dep-options-${row.original.id}` : undefined}
              aria-activedescendant={
                activeOption === undefined ? undefined : `dep-option-${activeOption.key}`
              }
              aria-autocomplete="list"
              aria-describedby={waitingFor.length > 0 ? waitsForId : undefined}
              // `search`, and only on a strip with no chip or while the picker
              // owns the cell (UI review F-035, 2026-10-13). `search, or 010,
              // 020` never fitted the cell and read `search, o`; beside a chip
              // at rest what room the box had left drew a sliver of it. The
              // `+` is the cue there. Numbers typed in are the column hint's
              // sentence now (`column-hints.ts`).
              placeholder={resting && hasChips ? '' : 'search'}
              // No hint on this box:
              // the Depends on cell draws its own card over these pixels,
              // and a second surface saying how to type into the box is
              // the race `start-date-hover-card` removed rather than one
              // to reintroduce. The placeholder beside it —
              // `search, or 010, 020` — is the same instruction, on
              // screen, with nothing to open. Watched with the hint back
              // on: `no card opened on the depends cell · Expected: 1 ·
              // Received: 2`, the second card reading `Type to search by
              // number or name, or a l…`.
              // `minWidth: 0` is what lets the box shrink behind the chips
              // on the strip's one rested line: a flex item's automatic
              // minimum would hold an `<input>` at its intrinsic width and
              // push its rect out past the cell. `100%` is still its claim
              // — the whole cell where it has the line to itself, the
              // remainder where it does not. At rest it takes only what the
              // chip group leaves (`flex: 1 1 0%`): with the group shrinkable,
              // a `100%` basis beside it would share the cut with the chips
              // and squeeze a whole chip out of a line it fits on.
              style={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                ...(resting ? { flex: '1 1 0%' } : {}),
                // Beside resting chips the box is empty, borderless (the
                // grid's `transparent`) and unlabelled, so its 8px of inline
                // padding and border are room taken from a chip for nothing
                // anyone can see. They come back with the focus, which opens
                // the picker and ends `resting`.
                ...(resting && hasChips ? { paddingInline: 0, borderInlineWidth: 0 } : {}),
              }}
              data-depends-input={row.original.id}
              // A cell of the keyboard grid, so Tab reaches this box and
              // leaves it again rather than walking the chips' ✕ buttons.
              data-cell={cellKey(row.original.id, 'depends')}
              value={picker?.typed ?? ''}
              onFocus={() => {
                live.current.setDepPicker((current) => ({
                  rowId: row.original.id,
                  // Proof: resetting this draft erased 999 before local Customize success returned focus (mounted round1 test).
                  typed: current?.rowId === row.original.id ? current.typed : '',
                  highlightId: null,
                  ...(current?.rowId === row.original.id && current.stepId !== undefined
                    ? { stepId: current.stepId }
                    : {}),
                }));
                // The keyboard's cell-level light — see {@link depFocus}.
                // This is the reachable half: Tab through the plan lands on
                // this box, and the rows the row waits for light while it
                // is here. Guarded on having something to say by the same
                // rule the wrapper's `mouseenter` uses.
                if (waitingFor.length > 0) {
                  live.current.depLights.updateFocus(() => ({
                    rowId: row.original.id,
                    pillId: null,
                  }));
                }
              }}
              onBlur={(event) => {
                if (
                  event.relatedTarget instanceof HTMLElement &&
                  (event.relatedTarget.closest('.typed-dependency-editor') !== null ||
                    event.relatedTarget.closest('[data-typed-dependency-chip]') !== null ||
                    event.relatedTarget.closest('[role="listbox"]') !== null)
                )
                  return;
                live.current.setDepPicker((current) =>
                  current?.rowId === row.original.id ? null : current,
                );
                // Only the cell-level focus this box owns. `pillId === null`
                // in the guard and not just the row: focus moving box → chip
                // fires this blur *before* the chip's focus, and without the
                // field in the guard a later blur could not tell its own
                // reading from the chip's.
                live.current.depLights.updateFocus((current) =>
                  current?.rowId === row.original.id && current.pillId === null ? null : current,
                );
              }}
              onChange={(e) => {
                const typed = e.currentTarget.value;
                // Only a single token auto-highlights. Earlier tokens must retain list submission.
                // Proof: removing the token-count guard made `adds every number in one
                // comma-separated list` miss the 010 dependency; watched 2026-10-22.
                const first =
                  currentDependencyToken(typed).token === '' ||
                  typed.split(/[,\s]+/).filter(Boolean).length !== 1
                    ? undefined
                    : live.current
                        .depEntriesFor(row.original, typed)
                        .find((entry) => entry.refusal === undefined);
                live.current.setDepPicker((current) => ({
                  rowId: row.original.id,
                  typed,
                  highlightId:
                    first === undefined
                      ? null
                      : encodeDependencyEndpoint({
                          projectId: live.current.projectId,
                          workItemId: first.id,
                          scope: 'whole',
                        }),
                  // Proof: dropping this retained step made `keeps QA preselected after
                  // typing a predecessor search` receive Whole instead of QA for
                  // both endpoints. Watched 2026-09-28.
                  ...(current?.rowId === row.original.id && current.stepId !== undefined
                    ? { stepId: current.stepId }
                    : {}),
                }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  // The move blurs this input, which closes the list and
                  // drops what was typed into it — this cell's blur contract
                  // since it was written, now reached by Tab on purpose. The
                  // typed text is a *search*: committing it on the way out
                  // would add dependencies nobody confirmed.
                  //
                  // Proof: the call dropped, leaving only the `return`, both
                  // `Tab from the depends input closes the picker…` and
                  // `Shift+Tab from the depends input lands in the name…`
                  // failed with the key left to the browser. Watched,
                  // 2026-08-07.
                  live.current.onTabKey(e, row.original.id, 'depends');
                  return;
                }
                if (
                  open &&
                  e.key === 'Home' &&
                  picker.typed === '' &&
                  typedDependencies.length > 0 &&
                  !e.altKey &&
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  // Proof: without Home, `Home reaches typed chips for Enter edit and Delete removal while Tab stays in the grid` left focus on the input; watched 2026-09-28.
                  e.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>('[data-typed-dependency-chip]')
                    ?.focus();
                  return;
                }
                if (
                  open &&
                  !e.altKey &&
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !e.shiftKey &&
                  (e.key === 'ArrowRight' || e.key === '›')
                ) {
                  e.preventDefault();
                  if (activeOption !== undefined) {
                    // Proof: without this branch, both highlighted-result keyboard
                    // cases found no Customize dialog. Watched 2026-09-28.
                    // Proof: without the modifier guards, `Alt+→ and Alt+←
                    // restructure the row from the Depends on cell` left the
                    // row at 020 instead of indenting it to 010.1. Watched 2026-09-28.
                    if (activeOption.kind === 'endpoint') customize(activeOption);
                  }
                  return;
                }
                if (escapesAnOpenList(e)) {
                  // The eight keys the list may not swallow: the four
                  // motion chords out of this cell and the four row moves
                  // under it. This box opens its list on **focus**, so
                  // without this branch Ctrl+L into it had no documented
                  // way out — see {@link escapesAnOpenList}, which is where
                  // the split between these and the chords that make or
                  // destroy a row is argued.
                  //
                  // Before the ArrowUp/ArrowDown branch below on purpose:
                  // that one reads no modifiers, so an Alt+↑ aimed at the
                  // row would have moved the list's highlight instead.
                  live.current.onAltMove(e, row.original, 'depends');
                  live.current.onCommandKey(e, row.original, 'depends');
                  return;
                }
                if (open && commandChordIn(e) !== null) {
                  // Inert means consumed. Skipping `onCommandKey` was not
                  // enough on its own: Cmd/⌘+Enter fell through to the Enter
                  // branch below, which reads no modifiers, and added the
                  // highlighted dependency — codex round 2, finding 2.
                  // Proof: this guard removed, `Cmd+Enter in the open
                  // depends list adds no dependency` failed on `expected
                  // <button type="button" …(2)></button> to be null` — the
                  // chip for an edge nobody confirmed. Watched, 2026-08-08.
                  e.preventDefault();
                  return;
                }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  live.current.moveDepHighlight(
                    row.original.id,
                    e.key === 'ArrowDown' ? 1 : -1,
                    // The refused entries are not in this list, so the
                    // highlight steps over them: a highlight that could stop
                    // on one would be an Enter that does nothing, which is
                    // the click this change exists to prevent.
                    pickable.map((entry) => entry.key),
                  );
                  return;
                }
                if (e.key === 'Escape') {
                  live.current.setDepPicker(null);
                  return;
                }
                if (!open) {
                  // Closed, this is a cell like any other and the chords
                  // that make and destroy a row reach it. Open, the list
                  // owns those — the routing matrix's inert row, narrowed
                  // by the branch above to the chords that act on a row
                  // rather than merely leaving the cell.
                  // Proof: the condition forced true, `every chord is inert
                  // while the depends list is open` failed on `expected
                  // <input …(11)></input> to be <input …(10)></input>` — the
                  // focus taken out of a list somebody was reading. Watched,
                  // 2026-08-08.
                  live.current.onCommandKey(e, row.original, 'depends');
                }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const typed = picker?.typed ?? e.currentTarget.value;
                if (activeOption !== undefined) {
                  if (activeOption.kind === 'project') search.chooseProject(activeOption.project);
                  else choose(activeOption);
                  return;
                }
                // No highlight to take — the typed flow: one number or a
                // separated list of them, exactly as this cell always worked.
                if (typed.trim() === '') return;
                live.current.dependOn(
                  row.original.id,
                  typed,
                  search.observations,
                  search.captureDraft(),
                );
              }}
            />
          </span>
          {picker !== null && (
            <DependencyOptions
              search={search}
              onLeave={() => {
                live.current.setDepPicker(null);
              }}
              onReturnFocus={() =>
                document
                  .querySelector<HTMLInputElement>(`[data-depends-input="${row.original.id}"]`)
                  ?.focus()
              }
              isPending={(key) => adding.has(key)}
              activeKey={activeOption?.key}
              onChoose={choose}
              onCustomize={customize}
              id={`dep-options-${row.original.id}`}
              label={`Work items ${row.original.number} can depend on`}
              style={{
                ...PICKER_PANEL_STYLE,
                color: 'var(--popover-foreground)',
                zIndex: 10,
                minWidth: DEP_LIST_WIDTH,
              }}
            />
          )}
          {editing !== null &&
            (() => {
              if (editing.selection?.kind === 'remote') {
                return (
                  <RemoteDependencyEditor
                    key={editorSession.current.generation}
                    selection={editing.selection}
                    lookup={live.current.dependencyLookup}
                    ownerProjectId={live.current.projectId}
                    ownerId={row.original.id}
                    successor={buildLocalDependencyEditor(
                      live.current.projectId,
                      row.original,
                      dependencyRows,
                      dependencySteps,
                      picker?.stepId ?? 'whole',
                    )}
                    preferredCode={dependencySteps.find((step) => step.id === picker?.stepId)?.code}
                    onCancel={() => {
                      setEditing(null);
                      // Proof: omitting focus left body active after remote Back in the mounted round1 probe.
                      document
                        .querySelector<HTMLInputElement>(
                          `[data-depends-input="${row.original.id}"]`,
                        )
                        ?.focus();
                    }}
                    onSave={(source, target, type) =>
                      live.current
                        .run((write) =>
                          write.perform(['tree'], () =>
                            live.current.commands.addTypedDependency(
                              serializeDependencyEndpoint(source, live.current.projectId),
                              serializeDependencyEndpoint(target, live.current.projectId),
                              type,
                            ),
                          ),
                        )
                        .then((outcome) => {
                          if (didLand(outcome))
                            live.current.setDepPicker((current) => {
                              if (
                                current?.rowId !== row.original.id ||
                                editing.draftCapture === undefined
                              )
                                return current;
                              const consumed = editing.draftCapture.consumeToken(current.typed);
                              return consumed.kind === 'stale'
                                ? current
                                : { ...current, typed: consumed.typed, highlightId: null };
                            });
                          return outcome;
                        })
                    }
                  />
                );
              }
              const dependency = typedDependencies.find(
                (candidate) => candidate.id === editing.dependencyId,
              );
              // Proof: forcing this guard false made `refuses to recreate an edited
              // relationship removed before Save` fail because the stale alert was absent;
              // the editor exposed Add. Watched 2026-09-28.
              if (editing.dependencyId !== undefined && dependency === undefined)
                return (
                  <div role="alert">
                    This dependency was removed.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                      }}
                    >
                      Back to dependency picker
                    </button>
                  </div>
                );
              // Proof: before this ordering, `shows a stale edit when deleting its predecessor also removes the relationship` threw `Missing predecessor` instead of rendering the alert; watched 2026-09-28.
              const close = () => {
                setEditing(null);
                document
                  .querySelector<HTMLInputElement>(`[data-depends-input="${row.original.id}"]`)
                  ?.focus();
              };
              // Proof: disabling this branch reported a removed predecessor instead of opening mounted captured details (2026-10-22).
              if (
                dependency?.predecessor.captured !== undefined ||
                dependency?.successor.captured !== undefined
              )
                return (
                  <CapturedDependencyDetails
                    // Proof: retaining only the relationship id let the previous pending save close the repeated same-target gesture (mounted desktop, 2026-10-23).
                    key={`${dependency.id}:${String(editorSession.current.generation)}`}
                    dependency={dependency}
                    successor={
                      dependency.successor.projectId === live.current.projectId
                        ? buildPersistedSuccessorEditor(
                            live.current.projectId,
                            dependency.successor,
                            dependencyRows,
                            dependencySteps,
                          )
                        : undefined
                    }
                    onClose={close}
                    onSave={
                      // Proof: forcing this owner check true exposed Save for a foreign successor with a colliding work-item id (mounted desktop, 2026-10-23).
                      dependency.successor.projectId === live.current.projectId
                        ? (type, target) =>
                            live.current.run((write) =>
                              write.perform(['tree'], () =>
                                live.current.commands.updateTypedDependency(
                                  dependency.id,
                                  serializePersistedDependencyEndpoint(
                                    dependency.predecessor,
                                    live.current.projectId,
                                  ),
                                  serializeDependencyEndpoint(target, live.current.projectId),
                                  type,
                                ),
                              ),
                            )
                        : undefined
                    }
                  />
                );
              const predecessor = dependencyRows.find(
                (candidate) => candidate.id === editing.predecessorId,
              );
              // Proof: deleting a pending Add predecessor made the mounted
              // stale-Add regression throw Missing predecessor; watched 2026-09-28.
              if (predecessor === undefined)
                return (
                  <div role="alert">
                    This predecessor was removed.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                      }}
                    >
                      Back to dependency picker
                    </button>
                  </div>
                );
              return (
                <TypedDependencyEditor
                  projectId={live.current.projectId}
                  // Proof: removing this key made `switching edit targets shows the newly selected relationship scopes` keep Whole instead of Dev; watched 2026-09-28.
                  key={`${editing.dependencyId ?? `add:${editing.predecessorId}`}:${String(editorSession.current.generation)}`}
                  predecessor={predecessor}
                  successor={row.original}
                  rows={dependencyRows}
                  steps={dependencySteps}
                  dependency={dependency}
                  // Proof: forcing both editor defaults to whole made `starts from the QA cell
                  // with the same step id on both endpoints` fail: predecessor was whole,
                  // expected step-qa. Watched 2026-09-27.
                  preferredStepId={picker?.stepId}
                  availablePredecessorStepIds={row.original.readings.dependencyStepIdsByRow?.get(
                    predecessor.id,
                  )}
                  onCancel={close}
                  onSave={(
                    source: TypedDependencyEndpoint,
                    target: TypedDependencyEndpoint,
                    type,
                  ) =>
                    live.current
                      .run((write) =>
                        write.perform(['tree'], () =>
                          dependency === undefined
                            ? live.current.commands.addTypedDependency(source, target, type)
                            : live.current.commands.updateTypedDependency(
                                dependency.id,
                                source,
                                target,
                                type,
                              ),
                        ),
                      )
                      .then((outcome) => {
                        if (didLand(outcome) && editing.draftCapture !== undefined)
                          live.current.setDepPicker((current) => {
                            if (
                              current?.rowId !== row.original.id ||
                              editing.draftCapture === undefined
                            )
                              return current;
                            const consumed = editing.draftCapture.consumeToken(current.typed);
                            return consumed.kind === 'stale'
                              ? current
                              : { ...current, typed: consumed.typed, highlightId: null };
                          });
                        setAnnouncement(
                          didLand(outcome)
                            ? dependency === undefined
                              ? 'Dependency added.'
                              : 'Dependency updated.'
                            : 'Dependency refused.',
                        );
                        return outcome;
                      })
                  }
                  onRemove={
                    dependency === undefined
                      ? undefined
                      : () =>
                          live.current
                            .run((write) =>
                              write.perform(['tree'], () =>
                                live.current.commands.removeTypedDependency(dependency.id),
                              ),
                            )
                            .then((outcome) => {
                              setAnnouncement(
                                didLand(outcome)
                                  ? 'Dependency removed.'
                                  : 'Dependency removal refused.',
                              );
                              return outcome;
                            })
                  }
                />
              );
            })()}
          {carded && (
            <DependsCard
              number={row.original.number}
              entries={waitingFor}
              typedEntries={typedDependencies.map((dependency) => ({
                id: dependency.id,
                navigation: <DependencyNavigation dependency={dependency} />,
                label: dependencyWords(
                  dependency,
                  dependencyRows,
                  dependencySteps,
                  row.original.readings.dependencyStepNodes ?? undefined,
                ).label,
                onEdit: () => {
                  setEditing({
                    predecessorId: dependency.predecessor.workItemId,
                    dependencyId: dependency.id,
                  });
                },
                onRemove: () => {
                  void live.current
                    .run((write) =>
                      write.perform(['tree'], () =>
                        live.current.commands.removeTypedDependency(dependency.id),
                      ),
                    )
                    .then((outcome) => {
                      setAnnouncement(
                        didLand(outcome) ? 'Dependency removed.' : 'Dependency removal refused.',
                      );
                    });
                },
              }))}
              // This cell's pill hover and no other's: a card is only on
              // screen for the hovered cell, but the guard keeps a stale
              // `depHover` from another row emphasising an entry here.
              // Proof: hardcoded to null, `emphasises the pill's entry in
              // the card as a background, not bold` failed on `expected
              // '' to be 'var(--card-dep-lit)'`. Watched, 2026-08-11.
              // Subscribed inside the card since 2026-09-02, so moving
              // the pointer between its entries costs a render of the
              // card and not of the plan. The guard the prop used to
              // carry is {@link DepLights.pillFor}'s own.
              depLights={live.current.depLights}
              rowId={row.original.id}
              onPointEntry={(pillId) => {
                // **A line of the card, and only a line, is an arrival on the
                // card.** The bridge also reports the pointer on this cell
                // itself (`pillId === null`), and until the takeover that too
                // went to the store as `cancelHold` — harmless while every
                // arrival elsewhere was instant. It is not harmless now: at a
                // row boundary the bridge's rectangle test still says "owner"
                // for a point Chromium has already handed to the row below, so
                // the store had just been told `arriveOn(030)` when this said
                // "on the card" and dropped that takeover. Traced in Chromium
                // on 2026-09-11 — `arriveOn 030 · bridge move owner · arriveOnCard
                // pending=030 · bridge move outside · hold fired` — and 030 never
                // answered. The cell's own `mouseenter` is what says the pointer
                // is back on this cell, and it goes through `arriveOn`.
                // Proof: the guard removed (every region cancelling) — `card-lanes.spec.ts`'s
                // `the pointer walks down each column and every row answers for
                // itself` failed on `Depends on: the pointer reached 030 and 030
                // did not answer · Expected: 1 · Received: 0`. Watched, 2026-09-11.
                if (pillId !== null) live.current.cellCards.arriveOnCard();
                live.current.depLights.updateHover((current) =>
                  current?.rowId === row.original.id && current.pillId === pillId
                    ? current
                    : { rowId: row.original.id, pillId },
                );
              }}
              onPointerOutside={() => {
                live.current.depLights.updateHover((current) =>
                  current?.rowId === row.original.id ? null : current,
                );
                // **Held rather than cleared**, since the card became diagonal
                // — past this cell and past this row — so the pointer going to
                // one of its lines is outside every region the bridge knows for
                // the length of the trip. See {@link REACH_FOR_THE_CARD_MS};
                // arriving on the card cancels it, because the card is inside
                // this cell's own subtree.
                live.current.cellCards.holdHovered(dependsCell);
              }}
            />
          )}
        </span>
      );
    },
  });
}
