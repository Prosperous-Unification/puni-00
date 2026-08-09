import type { RoleView } from '@/lib/wbs-api';

import { CellInput } from './cell-input';
import type { CellRef } from './cell-navigation';
import { PickerList, type PickerOption } from './creatable-picker';
import { type CellElement, cellKey } from './editable-grid';
import type { CommitOutcome } from './live-editing';
import { composeNameCell } from './name-notes';
import { indentFor } from './table-frame';
import type { TreeRow } from './wbs-rows';

/** One work item as the list draws it: the row, where it sits, and its branch. */
export interface CardRow {
  row: TreeRow;
  /** How deep in the outline it is, which is the card's indent. */
  depth: number;
  /** Whether it has children this list can hide. False while a search is on. */
  expandable: boolean;
  expanded: boolean;
  toggleBranch: () => void;
}

/**
 * Who is doing one phase of one work item, as a card prints it.
 *
 * `assumed` is the derived reading — nobody named on this phase and exactly one
 * person named on another — and it is why this is one answer with a flag rather
 * than two questions: the rule that a lone assignee is taken to be doing every
 * phase belongs to be-01 and is computed once by whoever hands this over, not
 * twice by two renderers.
 */
export interface CardAssignee {
  name: string;
  assumed: boolean;
}

export interface PlanCardsProps {
  /** The rows on screen, in the order and the expansion the table model gives them. */
  rows: readonly CardRow[];
  roles: readonly RoleView[];
  /**
   * Takes the list element, which is this renderer's `[data-grid]`.
   *
   * A callback rather than a ref object because the holder's ref is an
   * `HTMLElement` — it is a `<table>` under the other renderer — and React's
   * `Ref<HTMLDivElement>` will not take one.
   */
  gridRef: (node: HTMLElement | null) => void;
  /** The name and the notes as one text, and what be-01 did with them. */
  commitName: (rowId: string, typed: string, baseline: string) => Promise<CommitOutcome>;
  /**
   * Offers a box that is attaching to whatever focus a structural edit asked
   * for — {@link import('./live-editing').FocusIntent.landOnAttached}.
   */
  claimFocus: (node: CellElement, cell: CellRef) => void;
  /** What one phase's figure box shows: the pending shorthand, or the final figure. */
  estimateValue: (row: TreeRow, roleId: string) => string;
  /** What is wrong with what that box shows, or null. */
  estimateProblem: (row: TreeRow, roleId: string) => string | null;
  commitEstimate: (
    row: TreeRow,
    roleId: string,
    typed: string,
    baseline: string,
  ) => Promise<CommitOutcome>;
  /** The focus arriving in a figure box, which is what remembers its value. */
  enterEstimate: (box: CellElement) => void;
  /** A keystroke in one, which is what opens and closes the `@` list. */
  readEstimate: (rowId: string, roleId: string, box: CellElement) => void;
  /** Escape: the list closes and the box is left exactly as it is. */
  closeMention: () => void;
  /** The focus leaving a figure box, which takes a half-typed `@` with it. */
  leaveEstimate: () => void;
  /** What the `@` list in one box is offering, or nothing while it is closed. */
  mentionOptions: (row: TreeRow, roleId: string) => PickerOption[];
  assigneeOn: (row: TreeRow, roleId: string) => CardAssignee | null;
  /** The numbers of the work items this one waits for. */
  waitsFor: (row: TreeRow) => string[];
  teamName: (row: TreeRow) => string | null;
  /** When this work item happens: dates on a plan with a start date, day offsets without. */
  spanOf: (row: TreeRow) => { start: string; finish: string };
  /** A figure as the table prints one, so two renderers cannot round differently. */
  showDay: (days: number) => string;
}

/** A tap target big enough to hit — 44px, which is `min-h-11` in this scale. */
const TAP = 'min-h-11';

/**
 * The plan as a list of outline cards: what a phone gets instead of the table.
 *
 * **The same plan, not a summary of it.** Every card is a work item of the same
 * row model the table draws, at the same depth, in the same order, with the
 * same branches open — `WbsTable` builds that once and hands it to whichever
 * renderer the viewport asked for (`plan-renderer.ts`).
 *
 * **The same cells, too**, and that is the contract worth reading. Each box
 * carries the `data-cell` of the cell it edits — `rowId::name`, and
 * `rowId::<roleId>-final` for a phase's figure — which is the *same* string the
 * table's box for that cell carries. So the {@link import('./live-editing').LiveField}
 * a card mounts is the one the table mounted, and a draft be-01 refused is
 * still there when a phone is turned. That is the whole of what
 * `X live-editing-extraction` was for.
 *
 * **Three things are editable and nothing else is**: the name-and-notes box,
 * each phase's `o/r/p` figure, and — through the `@` list inside that figure's
 * box — who is on that phase. The dependencies, the team, the not-before date
 * and the three separate points are printed and not typed into: each is a
 * picker or a date field, and each is its own touch design.
 *
 * **No drag handle and no keyboard grid.** A phone has no pointer to drag a row
 * with and no Tab key to walk a grid with, so none of `onTabKey`, `onArrowKey`,
 * `onCommandKey` or `onAltMove` is wired here. The list is still marked as the
 * grid — the focus a create asks for has to be able to find a card — but
 * nothing on a card claims a key for moving between cells.
 */
export function PlanCards({
  rows,
  roles,
  gridRef,
  commitName,
  claimFocus,
  estimateValue,
  estimateProblem,
  commitEstimate,
  enterEstimate,
  readEstimate,
  closeMention,
  leaveEstimate,
  mentionOptions,
  assigneeOn,
  waitsFor,
  teamName,
  spanOf,
  showDay,
}: PlanCardsProps) {
  return (
    /*
      `data-grid` for the same two reasons the `<table>` carries it: it scopes
      the vendored components' reset away from the boxes (`styles.css`), and
      since `X live-editing-extraction` it is how `editable-grid.ts` finds the
      grid at all. A card list that did not carry it would be a plan whose
      cells nothing could find — no focus after a create, no readiness walk.
    */
    <div
      data-grid
      data-plan-cards
      ref={gridRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2"
    >
      {rows.map(({ row, depth, expandable, expanded, toggleBranch }) => {
        const waits = waitsFor(row);
        const team = teamName(row);
        const span = spanOf(row);
        return (
          <article
            key={row.id}
            data-card={row.id}
            data-frozen={row.frozenNumber !== null ? 'true' : 'false'}
            aria-label={`Work item ${row.number}`}
            // The outline, kept: a card list with no indent is a flat list of
            // rows whose numbers are the only thing saying what is under what.
            // Capped by the `min-w-0` chain rather than by arithmetic — a
            // deeply nested plan indents until the card stops shrinking.
            style={{ marginLeft: indentFor(depth) }}
            className="border-border bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-3"
          >
            <header className="flex items-center gap-2">
              {expandable && (
                <button
                  type="button"
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.number}`}
                  className={`${TAP} min-w-11 shrink-0 rounded-md border`}
                  onClick={toggleBranch}
                >
                  {expanded ? '▾' : '▸'}
                </button>
              )}
              {row.frozenNumber !== null && <span aria-label="Number is frozen">🔒</span>}
              <span data-number className="font-semibold">
                {row.number}
              </span>
              <span data-final-total className="text-muted-foreground ml-auto text-sm">
                {showDay(row.finalTotal)} d
              </span>
            </header>

            {/*
              The name and the notes in one box, exactly as the table holds them
              (`name-notes.ts`): the first line is the name and everything under
              it is the note. Taller at rest than the table's, because a phone
              is narrow and a name wraps sooner.
            */}
            <CellInput
              aria-label={`Name of ${row.number}`}
              cellKey={cellKey(row.id, 'name')}
              multiline
              autoSize
              rows={2}
              maxRestRows={8}
              className={`${TAP} box-border w-full rounded-md border p-2 text-base`}
              value={composeNameCell(row.name, row.notes)}
              onAttach={(element) => {
                claimFocus(element, { rowId: row.id, columnId: 'name' });
              }}
              commit={(typed, baseline) => commitName(row.id, typed, baseline)}
            />

            {roles.map((role) => {
              const problem = estimateProblem(row, role.id);
              const options = mentionOptions(row, role.id);
              const listId = `card-mention-${row.id}-${role.id}`;
              const assignee = assigneeOn(row, role.id);
              return (
                <div
                  key={role.id}
                  data-phase={role.id}
                  // The positioned ancestor `PickerList` measures `top: 100%`
                  // from — it owns the box, the caller owns the wrapper.
                  // The blur is the mention's, bubbling from the box inside:
                  // leaving the cell takes a half-typed `@ka` with it.
                  className="relative flex min-w-0 items-center gap-2"
                  onBlur={leaveEstimate}
                >
                  <span className="text-muted-foreground w-20 shrink-0 truncate text-sm">
                    {role.name}
                  </span>
                  {row.rolledUp ? (
                    // A parent's figure is a sum of what is below it. Printed
                    // rather than typed into, the same rule the table's folded
                    // cell keeps.
                    <span className="font-semibold">{estimateValue(row, role.id)}</span>
                  ) : (
                    <CellInput
                      aria-label={`${role.name} estimate for ${row.number}`}
                      cellKey={cellKey(row.id, `${role.id}-final`)}
                      role="combobox"
                      aria-expanded={options.length > 0}
                      aria-controls={options.length > 0 ? listId : undefined}
                      aria-autocomplete="list"
                      aria-invalid={problem !== null}
                      title={problem ?? undefined}
                      placeholder="o/r/p"
                      // `inputMode` rather than `type="number"`: the value is
                      // `2/3/8` as often as it is `4`, and a number field
                      // refuses the slashes. This is the keyboard a phone
                      // offers, and nothing about what the box accepts.
                      inputMode="decimal"
                      className={`${TAP} box-border w-28 shrink-0 rounded-md border px-2 text-base font-semibold ${
                        problem === null ? '' : 'border-destructive text-destructive'
                      }`}
                      onFocus={(event) => {
                        enterEstimate(event.currentTarget);
                        event.currentTarget.select();
                      }}
                      onTyped={(box) => {
                        readEstimate(row.id, role.id, box);
                      }}
                      onKeyDown={(event) => {
                        // The open list owns the keyboard, and Escape is how it
                        // is given back — the same routing the table's folded
                        // cell has, minus the chords and the alt-arrows, which
                        // are not wired on a card at all.
                        if (options.length === 0) return;
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          closeMention();
                          return;
                        }
                        if (event.key === 'Enter') {
                          // The first entry, which is `CreatablePicker`'s rule:
                          // what is offered first is what is taken.
                          event.preventDefault();
                          options[0]?.take();
                        }
                      }}
                      value={estimateValue(row, role.id)}
                      commit={(typed, baseline) => commitEstimate(row, role.id, typed, baseline)}
                    />
                  )}
                  {problem !== null && (
                    <span role="status" className="text-destructive text-sm">
                      {problem}
                    </span>
                  )}
                  {assignee !== null && (
                    <span
                      data-card-assignee={role.id}
                      {...(assignee.assumed ? { 'data-assumed': role.id } : {})}
                      title={
                        assignee.assumed
                          ? `${assignee.name} — only one person is assigned, so they are assumed to do this phase too`
                          : assignee.name
                      }
                      className={`min-w-0 truncate text-sm ${
                        assignee.assumed ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {assignee.assumed ? `(${assignee.name})` : assignee.name}
                    </span>
                  )}
                  {options.length > 0 && (
                    <PickerList
                      id={listId}
                      label={`${role.name} assignee for ${row.number}`}
                      options={options}
                    />
                  )}
                </div>
              );
            })}

            {/*
              What the plan says about this work item and a card cannot be typed
              into: when it happens, what it waits for, and whose it is. Read
              off the same fields the table's columns print.
            */}
            <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
              <span data-card-span>
                {span.start} → {span.finish}
              </span>
              {waits.length > 0 && <span data-card-waits>waits for {waits.join(', ')}</span>}
              {team !== null && <span data-card-team>{team}</span>}
            </p>
          </article>
        );
      })}
    </div>
  );
}
