import type { Row } from '@tanstack/react-table';
import { type ExpandedState } from '@tanstack/react-table';
import { Button, buttonVariants, Input, MENU_ITEM } from '@ui/saas-01';
import type { DependencyReach } from '@wbs/domain/dependency-reach';
import type { EffectiveTeams } from '@wbs/domain/effective-team';
import type * as React from 'react';
import {
  type CSSProperties,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useState,
} from 'react';

import type { RunPlanWrite } from '@/lib/local-write';
import { cn } from '@/lib/utils';
import type { PlanRead } from '@/lib/wbs-api';
import type {
  MeasureDefinitionView,
  PersonView,
  PriorityBandView,
  TeamCapacityView,
  TeamView,
} from '@/lib/wbs-api';
import { isEstimateMethod, type StepView } from '@/lib/wbs-api';
import type { PlanCommands } from '@/modules/plan-commands/contract';

import { MenuControl } from './actions-menu';
import { useClosedOnDismiss } from './close-on-dismiss';
import { DateField } from './date-field';
import type { GeneralPanelProps } from './general-panel';
import { ImportWithAiHelp } from './import-with-ai-help';
import { isMeasureShown, type MeasureToggles, unitLabelOf } from './measure-reading';
import type { PlanTableFeatures } from './plan-columns/column';
import type { EstimateGaps } from './plan-completeness';
import { describeGaps } from './plan-completeness';
import { isSectionMode, SECTION_MODES } from './plan-mermaid';
import { isAmbiguousWriteFailure } from './plan-refusal';
import { type PlanRenderRow } from './plan-render-rows';
import type { PlanRenderer } from './plan-renderer';
import { PlanSheetGroup, TAKES_THE_FOCUS } from './plan-toolbar-sheet';
import { ProjectSettingsModal } from './project-settings-modal';
import type { SavedView } from './remembered-layout';
import {
  rememberHiddenColumns,
  rememberMermaidSectionMode,
  rememberSavedViews,
} from './remembered-layout';
import { longIsoDate } from './short-date';
import { type FrameLayoutState } from './table-frame';
import { teamsOnThePlan } from './teams-panel';
import { ArrangeIcon, CollapseIcon, ExpandIcon, KeyboardIcon } from './toolbar-icons';
import type { TreeNarrowing } from './tree-search';
import {
  type FacetCriteria,
  type FilterCriteria,
  type FilterLabels,
  filterWords,
  isFiltering,
  NO_FACETS,
} from './tree-search';
import type { MeasureDefinitionsState } from './use-measure-definitions';
import type { FacetOption } from './use-plan-filter';
import { facetsChosen, toggledIn } from './use-plan-filter';
import type { GapLanding } from './use-plan-keyboard';
import type { ChartRead, PlanReadScope } from './use-plan-read';
import { type TreeRow } from './wbs-rows';

/**
 * The six facets a reader can narrow the plan by, beside the Find box.
 *
 * **A `<details>` and not a positioned popover**, for the reason
 * `plan-cards.tsx`'s step breakdown is one: it needs no measurement, no
 * pointer-type guard and no dismiss handler, and a tap is what opens one
 * already — which is what makes this control work unchanged inside the phone's
 * `Plan actions` sheet, where a `<summary>` and a checkbox are not the
 * `<button>` that closes it (`closingControlIn`).
 *
 * **Every list is the plan's own.** The teams are the effective teams somebody
 * on this plan carries, the people are the ones be-01 says are assigned on it,
 * the bands are this project's ladder and the steps are its steps. A facet
 * offering a value no row has is a filter whose only possible answer is an
 * empty table.
 *
 * The narrowing itself is not here and must not be: this writes criteria, and
 * `narrowTree` is the one thing that reads them.
 */
export function FilterFacets({
  facets,
  setFacets,
  teams,
  tags,
  services,
  resources,
  people,
  bands,
  steps,
  ownershipKnown,
  membershipKnown,
}: {
  facets: FacetCriteria;
  setFacets: (next: FacetCriteria) => void;
  teams: readonly FacetOption[];
  tags: readonly FacetOption[];
  services: readonly FacetOption[];
  /** The resources the plan's leaves demand (`wbs-resources` task 3.4). */
  resources: readonly FacetOption[];
  people: readonly FacetOption[];
  bands: readonly FacetOption[];
  steps: readonly FacetOption[];
  /**
   * Whether any team owns any service — the directory fact `builtByNonOwner`
   * is asked against.
   *
   * False is the state the deployment ships in (the map has no seed data, by
   * the proposal's non-goal), and in it the signal does not mean "nothing is
   * built by a non-owner" — it flags **every** row carrying a team and a
   * service, because no team owns anything. Offering the box there would put a
   * marker on most of a plan on the strength of a directory nobody has filled
   * in, which is the failure `label-mismatch.ts` exists to argue against. The
   * design's first risk, mitigated by saying so instead of by ticking.
   */
  ownershipKnown: boolean;
  /** The same fact for the second signal: whether anybody belongs to any team. */
  membershipKnown: boolean;
}) {
  const chosen = facetsChosen(facets);
  /** One group of tick boxes, or nothing at all where the plan offers none. */
  const group = (
    title: string,
    kind: string,
    options: readonly FacetOption[],
    picked: readonly string[],
    take: (next: string[]) => FacetCriteria,
  ): ReactNode =>
    options.length === 0 ? null : (
      <fieldset data-facet-group={kind} className="mb-2 border-0 p-0">
        <legend className="text-muted-foreground mb-1 text-xs font-semibold">{title}</legend>
        {options.map((option) => (
          <label key={option.id} className="flex min-h-6 items-center gap-1.5">
            <input
              type="checkbox"
              // Named by its facet as well as its value: a team and a person
              // may share a name, and two boxes with one label is a control
              // neither a reader nor a test can aim at.
              aria-label={`${title} ${option.label}`}
              checked={picked.includes(option.id)}
              onChange={() => {
                setFacets(take(toggledIn(picked, option.id)));
              }}
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </fieldset>
    );

  /**
   * One mismatch signal's box, with the reason it cannot be asked yet where a
   * reader will read it.
   *
   * **Disabled only while it is not already ticked.** A view saved when the
   * directory had ownership in it, reopened after somebody emptied the map,
   * would otherwise show a ticked box that cannot be unticked and a table with
   * nothing in it — a filter a reader cannot leave. Ticked wins: the box stays
   * live so it can be turned off, and the hint below still says why it now
   * finds nothing.
   *
   * `title` rather than a paragraph under the label, because this panel is 56
   * units wide and two sentences of hint per box push the State group off the
   * bottom of a phone's sheet. The same sentence is also the box's accessible
   * description, so it is not a mouse-only explanation.
   */
  const signal = (
    label: string,
    what: string,
    ticked: boolean,
    askable: boolean,
    why: string,
    take: (next: boolean) => FacetCriteria,
  ): ReactNode => {
    const off = !askable && !ticked;
    // `aria-describedby` at a visually-hidden span rather than
    // `aria-description`, which `jsx-a11y/role-supports-aria-props` refuses on
    // a checkbox — the attribute is ARIA 1.3 and the implicit role's property
    // list is 1.2. Observed, not assumed: the `aria-description` spelling was
    // this file's only lint error at a8ad8bd. The described-by spelling has
    // been supported everywhere since forever and reads the same to a screen
    // reader. Id derived from the label the same way `waitsForId` is derived
    // from the row id — the panel renders once, and the two labels differ.
    const hint = `facet-why-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
      <label
        className={`flex min-h-6 items-center gap-1.5 ${off ? 'text-muted-foreground' : ''}`}
        // `why` is a refusal about this project — nothing in it is askable — so
        // it opens at once; `what` says what ticking the box does, and waits.
        {...(off ? { 'data-fact': why } : { 'data-hint': what })}
      >
        <input
          type="checkbox"
          aria-label={label}
          aria-describedby={hint}
          checked={ticked}
          disabled={off}
          onChange={() => {
            setFacets(take(!ticked));
          }}
        />
        <span>{label.replace(' only', '')}</span>
        <span id={hint} className="sr-only">
          {off ? why : what}
        </span>
      </label>
    );
  };

  return (
    <details ref={useClosedOnDismiss()} data-facets className="relative">
      <summary
        className="border-control-edge h-8 cursor-pointer rounded-md border px-2 py-1 text-xs select-none"
        data-hint="Narrow the plan to the rows carrying these — the table, the chart and the cards together"
      >
        Filters{chosen > 0 ? ` (${String(chosen)})` : ''}
      </summary>
      {/*
        Over the plan rather than in the toolbar's flow: this row already wraps
        at 1245px of controls, and a panel opening inside it would push the
        table down the page every time somebody looked at what was ticked.
      */}
      <div
        data-facet-panel
        className="scroll-cue bg-popover absolute z-50 mt-1 max-h-[min(40rem,calc(100dvh-10rem))] w-56 overflow-y-auto rounded-md border p-3 text-sm shadow-md"
      >
        {group('Team', 'team', teams, facets.teamIds, (teamIds) => ({ ...facets, teamIds }))}
        {/*
          Directly under Team, because the two answer the neighbouring questions
          — who does the work, and what kind of thing it is — and a reader
          narrowing by one usually wants the other in view.
        */}
        {group('Tag', 'tag', tags, facets.tagIds, (tagIds) => ({ ...facets, tagIds }))}
        {/*
          The third label dimension, beside the other two and after them: Team,
          Tag and Service are one question asked three ways, and a reader
          narrowing by one wants the others in view. Like both of them it
          disappears when the plan carries no services at all — `group` returns
          nothing for an empty list.
        */}
        {group('Service', 'service', services, facets.serviceIds, (serviceIds) => ({
          ...facets,
          serviceIds,
        }))}
        {/*
          What a leaf needs while it runs, beside who runs it. Gone on a plan
          stating no demand, as every group with nothing to offer is.
        */}
        {group('Resource', 'resource', resources, facets.resourceIds, (resourceIds) => ({
          ...facets,
          resourceIds,
        }))}
        {group('Assignee', 'assignee', people, facets.assigneeIds, (assigneeIds) => ({
          ...facets,
          assigneeIds,
        }))}
        {group('Priority', 'priority', bands, facets.priorityBands, (priorityBands) => ({
          ...facets,
          priorityBands,
        }))}
        {group('Estimated for', 'step', steps, facets.estimatedStepIds, (estimatedStepIds) => ({
          ...facets,
          estimatedStepIds,
        }))}
        <fieldset data-facet-group="state" className="mb-2 border-0 p-0">
          <legend className="text-muted-foreground mb-1 text-xs font-semibold">State</legend>
          <label className="flex min-h-6 items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="Unestimated only"
              checked={facets.unestimated}
              onChange={() => {
                setFacets({ ...facets, unestimated: !facets.unestimated });
              }}
            />
            {/*
              The readiness badge's own count, said as a filter: the same
              `gaps.leaves` the button beside it reports, so the two cannot
              describe two different plans.
            */}
            <span>Unestimated</span>
          </label>
          <label className="flex min-h-6 items-center gap-1.5">
            <input
              type="checkbox"
              aria-label="Critical path only"
              checked={facets.critical}
              onChange={() => {
                setFacets({ ...facets, critical: !facets.critical });
              }}
            />
            <span>On the critical path</span>
          </label>
        </fieldset>
        {/*
          The two mismatch signals, in a group of their own and not in `State`.
          Every box above narrows by something a row *carries*; these two narrow
          by something a row and the **directory** disagree about, which is a
          different question and reads as one.
        */}
        <fieldset data-facet-group="mismatch" className="mb-2 border-0 p-0">
          <legend className="text-muted-foreground mb-1 text-xs font-semibold">Mismatch</legend>
          {signal(
            'Built by non-owner only',
            'Rows whose effective team does not own their effective service.',
            facets.builtByNonOwner,
            ownershipKnown,
            'No team owns a service yet — set that on the team rows in the directory.',
            (builtByNonOwner) => ({ ...facets, builtByNonOwner }),
          )}
          {signal(
            'Assigned outside the team only',
            "Rows whose assignee is not a member of the row's effective team.",
            facets.assignedOutsideTeam,
            membershipKnown,
            'Nobody belongs to a team yet — set that on the people in the directory.',
            (assignedOutsideTeam) => ({ ...facets, assignedOutsideTeam }),
          )}
        </fieldset>
        {/*
          Offered only while there is something to forget, the same bargain
          `Reset layout` makes: a control that provably does nothing reads as a
          broken one. It clears the ticks and not the Find box — Escape in the
          box is how the typed half is left, and one control undoing the other's
          work is how a reader loses a query they were still using.
        */}
        {chosen > 0 && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            data-hint="Untick every filter. The Find box is left as it is."
            onClick={() => {
              setFacets(NO_FACETS);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </details>
  );
}

export const COLUMN_LABELS: ReadonlyMap<string, string> = new Map([
  ['refs', 'Links'],
  ['depends', 'Depends on'],
  ['priority', 'Priority'],
  ['team', 'Teams'],
  ['tag', 'Tags'],
  ['service', 'Services'],
  ['type', 'Types'],
  ['resources', 'Resources'],
  ['in-parallel', 'People at once'],
  ['final-total', 'Days'],
  ['not-before', 'Not before'],
  ['deadline', 'Deadline'],
  ['status', 'Status'],
  ['fact-start', 'Fact start'],
  ['fact-end', 'Fact end'],
  ['start', 'Start'],
  ['finish', 'End'],
  ['float', 'Slack'],
]);

/**
 * The Columns control: one tick box per column a reader may hide, and one per
 * step, in the order the table renders them. Ticked is on screen.
 *
 * A `<details>` for the reason {@link FilterFacets} is one — no measurement,
 * no dismiss handler, and it works unchanged inside the phone's `Plan actions`
 * sheet. What it writes is the hide-list {@link rememberedHiddenColumns}
 * reads; the table itself is the one reader of that list, through the
 * `columns` memo, and this control never touches a column definition.
 *
 * Each row is a `<label>` wrapping its box — the shape the phone sheet's 44px
 * floor is written on — with `htmlFor` as well, so a test can read the panel
 * label-by-label off `label[for]`.
 */
export function ColumnsControl({
  offered,
  hiddenColumnIds,
  onToggle,
  measures,
}: {
  offered: readonly { id: string; label: string }[];
  hiddenColumnIds: readonly string[];
  onToggle: (columnId: string) => void;
  /** The Measures group below the columns; absent where no table offers one. */
  measures?: MeasureChooser;
}) {
  const prefix = useId();
  return (
    <details ref={useClosedOnDismiss()} data-columns className="relative">
      <summary
        className="border-control-edge h-8 cursor-pointer rounded-md border px-2 py-1 text-xs select-none"
        data-hint="Choose which columns are on the table. Number, Name and the row's controls always are."
      >
        Columns
      </summary>
      <div
        data-columns-panel
        className="scroll-cue bg-popover absolute z-50 mt-1 max-h-[min(40rem,calc(100dvh-10rem))] w-56 overflow-y-auto rounded-md border p-3 text-sm shadow-md"
      >
        {offered.map(({ id, label }) => {
          const boxId = `${prefix}-${id}`;
          // A label **wrapping** its box, as the facet rows are: on a phone the
          // sheet's 44px floor (`styles.css`, `label:has(> input[type='checkbox'])`)
          // is written on exactly that shape, and the row is the tap target.
          // `htmlFor` as well, so the name can be read off `label[for]`.
          return (
            <label key={id} htmlFor={boxId} className={CHOOSER_ROW}>
              <input
                id={boxId}
                type="checkbox"
                checked={!hiddenColumnIds.includes(id)}
                onChange={() => {
                  onToggle(id);
                }}
              />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
        {measures !== undefined && <MeasureChoices prefix={prefix} chooser={measures} />}
      </div>
    </details>
  );
}

/**
 * One row of the Columns control: the tap target, with a hover tint, a focus
 * ring around the box it wraps and a pressed tint, eased unless the reader asks
 * for reduced motion. The same height in every state, so nothing moves.
 */
const CHOOSER_ROW =
  'flex min-h-6 cursor-pointer items-center gap-1.5 rounded-sm px-1 -mx-1 transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent active:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60';

/**
 * What the Columns control offers for measures (`wbs-measure-budgets` D7):
 * the definitions as the table read them, the reader's answers, and the two
 * writers. Time is the scheduling measure; its toggle drives the step columns
 * and Days rather than columns of its own.
 */
export interface MeasureChooser {
  state: MeasureDefinitionsState;
  toggles: MeasureToggles;
  onToggle: (definition: MeasureDefinitionView) => void;
  timeShown: boolean;
  onToggleTime: () => void;
}

/**
 * The Measures group: one box per definition in the organization's order, or
 * the sentence for why there are none. Before organization activation the
 * read answers `organization_required` (review S3-6), which is said here as a
 * state, never as an error.
 */
function MeasureChoices({ prefix, chooser }: { prefix: string; chooser: MeasureChooser }) {
  const { state } = chooser;
  return (
    <section data-measure-choices aria-label="Measures" className="mt-2 border-t pt-2">
      <h3 className="text-muted-foreground mb-1 text-xs font-medium">Measures</h3>
      {state.kind === 'loading' && (
        // No live region: the group sits in a closed menu, and the page's own
        // status line is the one a reader is told about.
        <p data-measures-loading className="text-muted-foreground text-xs">
          Reading this organization’s measures…
        </p>
      )}
      {state.kind === 'organization_required' && (
        <p data-measures-unavailable className="text-muted-foreground text-xs">
          Measure columns need an organization. Once this workspace belongs to one, tokens, cost and
          agent minutes can be shown here.
        </p>
      )}
      {state.kind === 'failed' && (
        // A sentence and not an alert: the group sits in a closed menu, and an
        // alert nobody opened is noise in front of whatever the page is saying.
        <p data-measures-failed className="text-destructive text-xs">
          {state.sentence}
        </p>
      )}
      {state.kind === 'ready' &&
        state.measures.map((definition) => {
          const boxId = `${prefix}-measure-${definition.key}`;
          const shown = definition.schedulesWork
            ? chooser.timeShown
            : isMeasureShown(definition, chooser.toggles);
          return (
            <label
              key={definition.key}
              htmlFor={boxId}
              className={CHOOSER_ROW}
              data-measure-choice={definition.key}
            >
              <input
                id={boxId}
                type="checkbox"
                checked={shown}
                onChange={() => {
                  if (definition.schedulesWork) chooser.onToggleTime();
                  else chooser.onToggle(definition);
                }}
              />
              <span className="truncate">{definition.name}</span>
              <span className="text-quiet-ink ml-auto shrink-0 text-xs">
                {definition.schedulesWork ? 'steps · Days' : unitLabelOf(definition)}
              </span>
            </label>
          );
        })}
    </section>
  );
}

/**
 * Closes the Export / Import menu once a one-shot item in `panel` is chosen, until React detaches
 * the panel (a React 19 ref callback's cleanup).
 *
 * Every item but the Mermaid lanes setting is a one-shot, and a menu closes once its choice is
 * made (UI review F-106, F-127): a button (a copy, a download, the Import with AI dialog) closes
 * it on its click, the JSON import once a file is chosen, not on the label's click, which only
 * opens the picker. The setting is a `<select>`, so neither reaches it. The focus goes to the
 * summary, what opened the menu, since the item it was on is hidden now.
 *
 * Native listeners on the panel rather than React props, because the panel is a plain container
 * of controls and not itself interactive. They run in the bubble before React's root listener,
 * so the menu is shut before an item's own handler (Radix opening its dialog) runs.
 *
 * @throws When the panel is not inside a `<details>` with a `<summary>`: it is written inside one.
 */
function closeOnChoice(panel: HTMLDivElement | null): (() => void) | undefined {
  if (panel === null) return undefined;
  const close = (): void => {
    const menu = panel.closest('details');
    const summary = menu?.querySelector(':scope > summary');
    if (menu === null || !(summary instanceof HTMLElement))
      throw new Error('the Export / Import panel is outside its <details> menu');
    menu.open = false;
    summary.focus();
  };
  const onClick = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest('button') !== null) close();
  };
  // Proof: on 2026-10-16, with this listener's close taken out, the file step of `closes Export
  // / Import after every one-shot item, and keeps it for Mermaid lanes (F-127)` failed on
  // `expected true to be false`.
  const onChange = (event: Event): void => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') close();
  };
  // Proof: on 2026-10-16, with the click listener's close taken out, the same case failed on
  // `expected [ 'Copy as Markdown', …(6) ] to deeply equal []`.
  panel.addEventListener('click', onClick);
  panel.addEventListener('change', onChange);
  return () => {
    panel.removeEventListener('click', onClick);
    panel.removeEventListener('change', onChange);
  };
}

/**
 * Named filters this browser has saved for this project — R10 F4, beside
 * {@link FilterFacets} because naming a filter and ticking one are the same
 * act's two moments.
 *
 * **Narrow, not highlight**, same as the filter itself: picking a saved view
 * writes the Find box and the ticks, exactly as if a reader had typed and
 * ticked it themselves, and {@link narrowTree} is the one thing that reads
 * what a view leaves behind. Nothing here holds a narrowed tree of its own.
 *
 * Save is offered only while something is actually being asked of the plan —
 * the same bargain `Clear filters` makes: a view named for the whole,
 * unfiltered plan has nothing to be picked back to, because opening a project
 * already shows the whole plan.
 *
 * **An empty name does not turn Save off (UI review F-104).** Views and Saved
 * plans are sibling panels with one anatomy, and Saved plans names a plan saved
 * with no name by its time. A view saved with no name is named by what it asks
 * of the plan — {@link filterWords}, the words its row's fact already shows —
 * and Enter in the field saves, as it does there. A name a view already has
 * replaces that view rather than listing a second one (F-140).
 */
export function SavedViews({
  views,
  current,
  labels,
  onSave,
  onApply,
  onDelete,
}: {
  views: readonly SavedView[];
  current: FilterCriteria;
  labels: FilterLabels;
  onSave: (name: string) => void;
  onApply: (view: SavedView) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const filtering = isFiltering(current);
  const save = (): void => {
    const typed = name.trim();
    // Proof: on 2026-10-16, saving `typed` as it stood failed `names a view by what it filters
    // when no name is typed, as Saved plans does (F-104)` on `expected [ '' ] to deeply equal
    // [ 'team Billing' ]`.
    onSave(typed === '' ? filterWords(current, labels).join('; ') : typed);
    setName('');
  };
  return (
    <details ref={useClosedOnDismiss()} data-saved-views className="relative">
      <summary
        className="border-control-edge h-8 cursor-pointer rounded-md border px-2 py-1 text-xs select-none"
        data-hint="Name the current filter, or pick one already named"
      >
        Views{views.length > 0 ? ` (${String(views.length)})` : ''}
      </summary>
      <div
        data-saved-views-panel
        className="scroll-cue bg-popover absolute z-50 mt-1 max-h-[min(40rem,calc(100dvh-10rem))] w-64 overflow-y-auto rounded-md border p-3 text-sm shadow-md"
      >
        <form
          className="mb-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (filtering) save();
          }}
        >
          <Input
            className="h-8 flex-1 text-xs"
            aria-label="Name this view"
            placeholder="Name this view…"
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            type="submit"
            disabled={!filtering}
            // What the button does while there is something to save, and why it
            // is off while there is not — the second is about the plan in front
            // of the reader, so it does not wait.
            {...(filtering
              ? {
                  'data-hint':
                    'Save the Find box and the ticked filters. With no name, it is named by what it filters.',
                }
              : { 'data-fact': 'Nothing is filtered — there is no view to name' })}
          >
            Save
          </Button>
        </form>
        {views.length === 0 ? (
          <p className="text-muted-foreground text-xs">No saved views yet.</p>
        ) : (
          <ul>
            {views.map((view) => {
              // What the view asks of the plan, said the same way the
              // filtered export's `Scope` line says it — one account of a
              // filter, not two that could disagree.
              const words = filterWords(view.criteria, labels);
              return (
                <li key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="min-h-7 flex-1 truncate text-left text-xs underline-offset-2 hover:underline"
                    data-fact={words.length > 0 ? words.join('; ') : view.name}
                    onClick={() => {
                      onApply(view);
                    }}
                  >
                    {view.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="square"
                    type="button"
                    aria-label={`Delete view ${view.name}`}
                    data-hint="Forget this view. What it narrows to is untouched."
                    onClick={() => {
                      onDelete(view.id);
                    }}
                  >
                    <span aria-hidden="true">✕</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

/**
 * The plan's toolbar, for both faces of the app: the desktop bar and the phone
 * sheet render this one component with the same props.
 *
 * Every prop is already resolved — nothing here reads the plan, and nothing
 * here decides what a control means. That is what lets the two renderers
 * differ only in where the controls are put.
 */
export function PlanToolbar({
  criteria,
  scheduleError,
  arrangeBySchedule,
  freezeMenuOpen,
  setFreezeMenuOpen,
  busy,
  run,
  commands,
  projectId,
  generalSettings,
  addWorkItem,
  filtering,
  setExpanded,
  ganttOpen,
  setGanttOpen,
  renderer,
  teams,
  teamCapacities,
  flat,
  effectiveTeams,
  refreshOrMarkStale,
  priorityBands,
  steps,
  hiddenColumnIds,
  frameState,
  people,
  chartRead,
  estimateMethod,
  commitQuery,
  facets,
  setFacets,
  facetTeams,
  facetTags,
  facetServices,
  facetResources,
  facetPeople,
  facetBands,
  facetSteps,
  ownershipKnown,
  membershipKnown,
  savedViews,
  filterLabels,
  setSavedViews,
  setStoredHiddenColumns,
  offeredColumns,
  toggleColumn,
  measureChooser,
  shownRows,
  search,
  gaps,
  walkToNextGap,
  layoutReset,
  stack,
  stepStack,
  setCheatSheetOpen,
  exportAvailable,
  copyAsMarkdown,
  copyAsMermaid,
  downloadCsv,
  downloadMermaidDocument,
  downloadChartSvg,
  downloadOnScreen,
  downloadJson,
  importBusy,
  importJson,
  mermaidSectionMode,
  setMermaidSectionMode,
  startDate,
  chooseEstimateMethod,
  sheetExtras,
  claimsSheet,
}: {
  criteria: FilterCriteria;
  freezeMenuOpen: boolean;
  setFreezeMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  busy: boolean;
  run: RunPlanWrite;
  commands: PlanCommands;
  projectId: string;
  generalSettings?: Omit<GeneralPanelProps, 'onDirtyChange' | 'onBusyChange'>;
  addWorkItem: () => void;
  filtering: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<ExpandedState>>;
  ganttOpen: boolean;
  setGanttOpen: React.Dispatch<React.SetStateAction<boolean>>;
  renderer: PlanRenderer;
  teams: TeamView[];
  teamCapacities: TeamCapacityView[];
  flat: TreeRow[];
  effectiveTeams: Map<string, EffectiveTeams>;
  refreshOrMarkStale: (scope?: PlanReadScope) => Promise<void>;
  priorityBands: PriorityBandView[];
  steps: StepView[];
  hiddenColumnIds: string[];
  frameState: FrameLayoutState;
  people: PersonView[];
  /** Why the plan has no dated schedule to arrange, when it has none. */
  scheduleError: PlanRead['scheduleError'];
  /** Issues the arrangement and says it landed; built where the toast stack is. */
  arrangeBySchedule: () => void;
  chartRead: ChartRead;
  estimateMethod: 'pert' | 'optimistic' | 'realistic' | 'pessimistic';
  commitQuery: (projectId: string, query: string) => void;
  facets: Omit<FilterCriteria, 'query'>;
  setFacets: React.Dispatch<React.SetStateAction<Omit<FilterCriteria, 'query'>>>;
  facetTeams: FacetOption[];
  facetTags: FacetOption[];
  facetServices: FacetOption[];
  facetResources: FacetOption[];
  facetPeople: FacetOption[];
  facetBands: { id: string; label: string }[];
  facetSteps: { id: string; label: string }[];
  ownershipKnown: boolean;
  membershipKnown: boolean;
  savedViews: SavedView[];
  filterLabels: FilterLabels;
  setSavedViews: React.Dispatch<React.SetStateAction<SavedView[]>>;
  setStoredHiddenColumns: React.Dispatch<React.SetStateAction<readonly string[]>>;
  offeredColumns: { id: string; label: string }[];
  toggleColumn: (columnId: string) => void;
  /** The Columns control's Measures group, or absent where the table offers none. */
  measureChooser?: MeasureChooser;
  shownRows: Row<PlanTableFeatures, PlanRenderRow>[];
  search: TreeNarrowing;
  gaps: EstimateGaps;
  walkToNextGap: () => GapLanding | null;
  /**
   * The table's own Reset layout, or null while there is nothing to reset or
   * the toolbar is in the phone's sheet. Drawn last in the schedule group.
   */
  layoutReset: ReactNode;
  stack: { undoable: boolean; redoable: boolean };
  stepStack: (direction: 'undo' | 'redo') => Promise<void>;
  setCheatSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportAvailable: boolean;
  copyAsMarkdown: () => void;
  copyAsMermaid: () => void;
  downloadCsv: () => void;
  downloadMermaidDocument: () => void;
  downloadChartSvg: () => void;
  downloadOnScreen: () => void;
  downloadJson: () => void;
  importBusy: boolean;
  importJson: React.ChangeEventHandler<HTMLInputElement>;
  mermaidSectionMode: 'step' | 'outline' | 'assignee';
  setMermaidSectionMode: React.Dispatch<React.SetStateAction<'step' | 'outline' | 'assignee'>>;
  startDate: string | null;
  chooseEstimateMethod: (method: 'pert' | 'optimistic' | 'realistic' | 'pessimistic') => void;
  /**
   * Controls the phone's sheet carries that the table does not own, by the
   * group they join — the chart's `Reset layout` under View, the saved-plan
   * shelf under Schedule. Drawn only on the sheet; above `md` the shelf is in
   * the app header and the reset is on the chart's own strip.
   */
  sheetExtras?: { view?: React.ReactNode; schedule?: React.ReactNode };
  /**
   * The Claims sheet's button and sheet (`wbs-claim-display` C16), built by the
   * table, which holds the claims; it draws nothing while no claim is held.
   */
  claimsSheet?: React.ReactNode;
}) {
  /** Whether this is the phone's `Plan actions` sheet, where every control carries its words. */
  const sheet = renderer === 'cards';
  // Selected optimized and still drawn by Fast — solving, failed or infeasible,
  // which are one state to a reader waiting for the schedule they picked. The
  // same three conditions be-01 refuses `schedule_not_ready` on.
  const awaitingSchedule =
    chartRead.optimization !== undefined &&
    chartRead.optimization.enabled &&
    chartRead.optimization.engine === 'optimized' &&
    chartRead.optimization.displayed === 'fast';

  /**
   * Whether any branch exists for the two expansion ends to open or close.
   * Without one they do nothing and say nothing (Dany, 2026-09-27): no hint
   * that there is nothing nested, and above all no saved record — an empty
   * one reads every parent created later as closed.
   */
  const hasNestedItems = flat.some((row) => row.parentId !== null);
  const exportMenu = useClosedOnDismiss();
  /** What the last walk to an unestimated leaf said, for the badge's live region. */
  const [gapNotice, setGapNotice] = useState('');
  const [query, setQuery] = useState(criteria.query);
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    commitQuery(projectId, deferredQuery);
  }, [commitQuery, deferredQuery, projectId]);
  const currentCriteria = { ...criteria, query };

  /** Conservatively reconciles a settings write whose server outcome is unknown. */
  const recoverAmbiguousSettingsChange = async (thrown: unknown): Promise<void> => {
    // Proof: removing this boundary left mounted priority, arithmetic and
    // optimization transport/invalid-response cases at zero reads instead of
    // all nine. Watched in `ambiguous $name $failure fully recovers from its
    // mounted control`, 2026-09-14.
    if (isAmbiguousWriteFailure(thrown)) await refreshOrMarkStale();
  };

  const freeze = (
    <>
      {/*
      Both writes on the numbering, behind one control.

      **A menu and not a toggle**, and that is the whole of `design.md` D4:
      `Freeze numbering` freezes every current number and `Unfreeze all`
      releases every frozen row, but a plan may be **partly** frozen — a row's
      own ⋯ unfreezes one — so an `aria-pressed` button or a label that
      swapped would claim a state this project does not have.

      Both items are always present and both are enabled while the toolbar is
      not busy. `Unfreeze all` on a plan with nothing frozen is a no-op write,
      which is exactly what it was as a button; making it conditional would
      need an "is anything frozen" read the toolbar does not have.

      The trigger carries `disabled={busy}` and the affordance for the reason
      the two buttons did: these are the plan's writes, and a click during a
      refetch is a click be-01 would answer 409 to.
    */}
      <MenuControl
        name="Freeze #"
        data-hint="Freeze the numbering as it stands, or release every frozen row"
        align="left"
        open={freezeMenuOpen}
        onOpen={() => {
          setFreezeMenuOpen(true);
        }}
        onClose={() => {
          setFreezeMenuOpen(false);
        }}
        busy={busy}
        actions={[
          {
            id: 'freeze',
            label: 'Freeze numbering',
            run: () => void run((write) => write.perform(['tree'], () => commands.freezeProject())),
          },
          {
            id: 'unfreeze-all',
            label: 'Unfreeze all',
            run: () =>
              void run((write) => write.perform(['tree'], () => commands.unfreezeProject())),
          },
        ]}
        trigger={{
          className: buttonVariants({ variant: 'outline', size: 'sm' }),
          disabled: busy,
          ...busyAffordance(busy),
        }}
      >
        Freeze #
      </MenuControl>
    </>
  );
  const addItem = (
    <>
      <Button
        size="sm"
        type="button"
        // One of the three controls that aims the caret itself — the new
        // row's name, through `focusIntent` below. See {@link TAKES_THE_FOCUS}.
        {...{ [TAKES_THE_FOCUS]: '' }}
        onClick={addWorkItem}
        // The one write in this toolbar that is **not** `disabled={busy}`, and
        // {@link addWorkItem} is where the argument is: each click is its own
        // row, so refusing one loses work rather than deduplicating a command.
        // The affordance stays — the wait is still shown, it just no longer
        // eats what arrives during it.
        {...busyAffordance(busy)}
      >
        Add work item
      </Button>
    </>
  );
  const collapseAll = (
    <>
      {/*
      The two ends of the expansion, which is otherwise one triangle at a
      time — a forty-row plan takes forty clicks to fold. Both write the
      reader's own expansion, and it is remembered per project from there.

      Disabled while the Find box holds something, for the reason the
      triangles are hidden then: what is open during a search is the
      search's answer, and a button that appeared to do nothing would read
      as broken. Not disabled by `busy`, unlike the control above: neither
      asks be-01 for anything.

      **Icon buttons whose names did not change.** Eighteen characters of a
      width-constrained bar said what a chevron says, so the words moved from
      the face of the button into its `aria-label` — which is where the two
      facts "a smaller thing" and "the same control" are made one, exactly as
      `project-page.tsx`'s `✎` already does. Every existing test and every
      screen-reader path still finds `Expand all` and `Collapse all`, and that
      the old cases pass **unchanged** is the proof the names held.

      The chevron pair points apart to open and together to close, which is
      deliberately **not** the `▾`/`▸` a row's own disclosure control uses:
      one shape with a per-row meaning and a per-plan meaning is a shape a
      reader disambiguates by position. See `toolbar-icons.tsx`.
    */}
      <Button
        variant="outline"
        size="square"
        type="button"
        disabled={filtering}
        aria-label="Collapse all"
        // The refusal is about the filter the reader has on right now, so it
        // does not wait; what the button does when it is live is the tool.
        {...(filtering
          ? { 'data-fact': 'Clear the filter first — a filter opens whatever it has to.' }
          : { 'data-hint': 'Close every branch' })}
        onClick={() => {
          // Proof: this guard removed, `keeps a flat plan out of collapsed-all,
          // so its first child arrives open` failed on `expected '{}' to be
          // 'true'` and `shows the first child of a flat plan after Collapse
          // all and a remount` on `expected [ '010' ]`. Watched 2026-09-27.
          if (hasNestedItems) setExpanded({});
        }}
      >
        <CollapseIcon />
        {sheet && 'Collapse all'}
      </Button>
    </>
  );
  const expandAll = (
    <>
      <Button
        variant="outline"
        size="square"
        type="button"
        disabled={filtering}
        aria-label="Expand all"
        {...(filtering
          ? { 'data-fact': 'Clear the filter first — a filter opens whatever it has to.' }
          : { 'data-hint': 'Open every branch' })}
        onClick={() => {
          if (hasNestedItems) setExpanded(true);
        }}
      >
        <ExpandIcon />
        {sheet && 'Expand all'}
      </Button>
    </>
  );
  const arrange = (
    <>
      {/*
      Whether the project picked the optimized engine and is still being drawn
      by Fast — solving, failed or infeasible, which are one state to a reader
      waiting for their own schedule. The same three conditions be-01 refuses
      `schedule_not_ready` on, read off the payload the chart is already
      holding rather than asked for again.
    */}
      {/*
      One press puts every sibling group in the order its bars start — the
      third control that acts on the tree's shape, after the two that open and
      close it.

      **An icon, and its name is the thing that does not change** (D1 of
      `plan-toolbar-controls`): `Arrange by schedule` is what every test and
      every screen reader finds, and the staircase is what the bar spends
      width on. Dany asked for "an icon" and "a small column for now" on
      2026-09-10, which is the narrowest control this bar can carry.

      **Two states swap the hint for a fact and disable it**, because in both
      of them be-01 would refuse and the reason is about *this plan* rather
      than about the tool. A cycle has no schedule to arrange by; a project on
      the optimized engine that is still drawing Fast has not got the one it
      picked yet, and arranging by Fast there would leave the rows in an order
      the reader did not choose with nothing on screen admitting it (ADR
      0023).
    */}
      <Button
        variant="outline"
        size="square"
        type="button"
        disabled={busy || scheduleError !== null || awaitingSchedule}
        aria-label="Arrange by schedule"
        {...(scheduleError === 'cycle'
          ? {
              'data-fact':
                'The plan has a dependency cycle, so there is no schedule to arrange by.',
            }
          : scheduleError === 'calendar_range'
            ? {
                'data-fact':
                  'The plan reaches beyond the calendar, so there are no dated bars to arrange by.',
              }
            : awaitingSchedule
              ? { 'data-fact': 'Optimizing… arrange once the schedule settles.' }
              : { 'data-hint': 'Put every sibling in the order its bar starts' })}
        {...busyAffordance(busy)}
        onClick={arrangeBySchedule}
      >
        <ArrangeIcon />
        {sheet && 'Arrange by schedule'}
      </Button>
    </>
  );
  const gantt = (
    <>
      {/*
      The schedule as something to look at, under the plan. `aria-pressed`
      rather than two labels: it is one thing that is on or off, and a button
      whose word changes is a button that reads as "Gantt" when the chart is
      already there.

      Not disabled by `busy` and not by a cycle: it asks be-01 for nothing,
      and the panel is where the unscheduled state is said out loud.
    */}
      <Button
        variant="outline"
        size="sm"
        type="button"
        aria-pressed={ganttOpen}
        data-hint="Draw the schedule under the plan"
        onClick={() => {
          setGanttOpen((open) => !open);
        }}
      >
        Gantt
      </Button>
    </>
  );
  const settings = (
    <>
      {/*
      Everything the **project** configures about itself — its teams' capacity,
      its priority ladder, and its steps — behind one control, since
      `project-config-modal` (2026-08-30). These were three labelled buttons
      here, each a thing somebody sets once and then leaves for weeks, sitting
      permanently beside `Add work item` and `Undo` on a bar whose width is the
      scarce resource. The three surfaces are three sections of one modal now.

      The button belongs to the modal rather than sitting beside it: Radix
      restores the focus to its **trigger** on close and to nothing at all
      without one, so the two are one component. The surface itself lands in
      a portal, not here. A gear on this bar and its name on the phone's
      sheet, which lists its controls by word and has the room.

      Not disabled by `busy`: each section has its own in-flight state, and a
      button that went dead while somebody else's edit was refetching would
      be unopenable on a plan two people are working on.

      The teams section reads every row's **effective** teams, so a team only
      an ancestor carries is offered a box: its pool is what the leaves below
      it spend. The same reading the cell, the cards, the export and the bars
      use — one `effectiveTeamsOf` per render and never a second copy.
      Flattened, because a row on two teams puts a box beside each of them.
      C3 put that box in the directory, where a global size belonged; the
      number is one plan's now (`capacity-per-project`, Dany 2026-08-13), and
      the directory page has no plan.

      The steps section is handed the same `frameState` the `<colgroup>`
      above is resolved from, so the figure it quotes and the width the table
      lays out cannot be answers to two different questions.
    */}
      <ProjectSettingsModal
        projectId={projectId}
        trigger={renderer === 'cards' ? 'labelled' : 'glyph'}
        {...(generalSettings === undefined
          ? {}
          : {
              general: {
                ...generalSettings,
                onChanged: async () => {
                  await generalSettings.onChanged();
                  await refreshOrMarkStale('tree');
                },
              },
            })}
        teams={{
          teams: teamsOnThePlan(
            teams,
            teamCapacities,
            flat.flatMap((row) => effectiveTeams.get(row.id)?.teamIds ?? []),
          ),
          setCapacity: (teamId, size) => commands.setTeamCapacity(teamId, size),
          onChanged: () => refreshOrMarkStale('tree'),
          onRefused: recoverAmbiguousSettingsChange,
        }}
        priorities={{
          bands: priorityBands,
          setBands: (bands) => commands.setPriorityBands(bands),
          onChanged: () => refreshOrMarkStale('tree'),
          onRefused: recoverAmbiguousSettingsChange,
        }}
        steps={{
          steps,
          hiddenColumnIds,
          frameState,
          numberOf: (workItemId) => flat.find((row) => row.id === workItemId)?.number ?? null,
          nameOf: (personId) => people.find((person) => person.id === personId)?.name ?? null,
          addStep: (name, unit) => commands.addStep(name, unit),
          setStepUnit: (stepId, unit) => commands.setStepUnit(stepId, unit),
          estimateCounts: Object.fromEntries(
            steps.map((step) => [
              step.id,
              flat.filter((row) => !row.rolledUp && Object.hasOwn(row.estimates, step.id)).length,
            ]),
          ),
          renameStep: (stepId, name) => commands.renameStep(stepId, name),
          setStepAllowance: (stepId, allowancePercent) =>
            commands.setStepAllowance(stepId, allowancePercent),
          removeStep: (stepId, cascade) => commands.removeStep(stepId, cascade),
          // How far a dependency reaches, on the same surface as the steps it
          // is about: reordering them moves what an `anchor-slice` dependency
          // waits for. Off the chart read rather than a state of its own, so
          // the value ticked here and the reach the arrows were drawn with are
          // one fact.
          depReach: chartRead.depReach,
          setDepReach: (reach: DependencyReach) => commands.setDepReach(reach),
          // The same reread every other change on this page makes, which is
          // what puts the new columns on the table and the new list in the
          // section.
          onChanged: () => refreshOrMarkStale('tree-and-steps'),
          onReachChanged: () => refreshOrMarkStale('tree'),
          // Proof: dropping this recovery left `Remove QA` visible after the
          // fake peer had deleted it in `fully recovers when a peer already
          // removed the refused step`. Watched, 2026-09-13.
          onRefused: () => refreshOrMarkStale(),
        }}
        resources={{
          projectId,
          // A declared capacity moves dates, so an adopt rereads the plan
          // the way a team's capacity does.
          onChanged: () => refreshOrMarkStale('tree'),
        }}
        estimating={{
          // The method is reported, not set: `Plan with` on the bar is the one
          // control for it, and a second would be two answers to one question.
          method: estimateMethod,
          // Off the chart read, like the reach above and for the same reason —
          // these are the weights the figures on screen were computed with.
          pertWeights: chartRead.pertWeights,
          estimateRounding: chartRead.estimateRounding,
          setArithmetic: (arithmetic) => commands.setEstimateArithmetic(arithmetic),
          onChanged: () => refreshOrMarkStale('tree'),
          onRefused: recoverAmbiguousSettingsChange,
        }}
        timezone={{
          // Off the chart read, for the weights' reason: the zone the attempt
          // times on screen were printed in.
          timezone: chartRead.timezone,
          // The commands' own member, so its identity holds across renders and
          // the panel asks for the list once per mount.
          listTimezones: commands.listTimezones,
          setTimezone: (timezone) => commands.setTimezone(timezone),
          onChanged: () => refreshOrMarkStale('tree'),
          onRefused: recoverAmbiguousSettingsChange,
        }}
        {...(chartRead.optimization === undefined
          ? {}
          : {
              optimization: {
                value: chartRead.optimization,
                setSettings: (patch) => commands.setOptimizationSettings(patch),
                onChanged: () => refreshOrMarkStale('tree'),
                onRefused: recoverAmbiguousSettingsChange,
              },
            })}
      />
    </>
  );
  const find = (
    <>
      {/*
      Find. Deliberately without `data-cell`: this is not a cell of the
      table's keyboard grid, and letting Tab and the arrows walk into it
      from the last cell of a row would put the caret somewhere no edit can
      be made.
    */}
      {/*
        On the desktop bar the count lives inside the Find box's own edge
        (UI review F-016): as a toolbar child it appeared on the first
        keystroke and pushed every control to its right sideways by its width.
        The box's width is fixed, so the count costs the typed text room, not
        the bar a shift. The phone's sheet is a column with room for a line of
        its own, so there the box stands alone and {@link filterCount} follows.
      */}
      {sheet ? (
        <Input
          className="h-8 w-32 text-xs"
          aria-label="Find"
          placeholder="Find…"
          size={14}
          data-hint="Show work items whose name contains this, with the rows above and below them"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            // Escape empties the box, which is how a search is left — and
            // leaving it puts every collapsed branch back, because the search
            // never wrote to the reader's own expansion.
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setQuery('');
          }}
        />
      ) : (
        <span className="relative inline-flex shrink-0">
          <Input
            className={cn('h-8 w-32 text-xs', filtering && 'pr-16')}
            aria-label="Find"
            placeholder="Find…"
            size={14}
            data-hint="Show work items whose name contains this, with the rows above and below them"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              // Escape empties the box, which is how a search is left — and
              // leaving it puts every collapsed branch back, because the search
              // never wrote to the reader's own expansion.
              if (e.key !== 'Escape') return;
              e.preventDefault();
              setQuery('');
            }}
          />
          {filtering && (
            <span
              role="status"
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] whitespace-nowrap"
            >
              {shownRows.length} of {flat.length}
              <span className="sr-only"> rows</span>
            </span>
          )}
        </span>
      )}
    </>
  );
  const filters = (
    <>
      {/*
      The other six of R10's seven fields. Beside the Find box because they
      are the same act — narrowing the plan — and the count below counts what
      all seven left, not what each one did.
    */}
      <FilterFacets
        facets={facets}
        setFacets={setFacets}
        teams={facetTeams}
        tags={facetTags}
        services={facetServices}
        resources={facetResources}
        people={facetPeople}
        bands={facetBands}
        steps={facetSteps}
        // The two directory maps read as one bit each — the same two the row
        // facets are computed from, so the box and the answer behind it can
        // never disagree about whether the question is askable.
        ownershipKnown={ownershipKnown}
        membershipKnown={membershipKnown}
      />
    </>
  );
  const views = (
    <>
      {/*
      Name the current filter, or pick one already named — R10 F4. Beside
      `FilterFacets` because saving and ticking are the same act's two
      moments, and applying a view writes {@link query} and {@link facets}
      exactly as typing and ticking would.
    */}
      <SavedViews
        views={savedViews}
        current={currentCriteria}
        labels={filterLabels}
        onSave={(name) => {
          // One name names one view (UI review F-140): a save under a name a view already has
          // replaces that view where it stands, so a double press of Save, or a derived name
          // saved twice, cannot list two identical rows.
          // Proof: on 2026-10-16, appending regardless failed `a save under a name a view
          // already has replaces that view, not a second row (F-140)` on `expected [ Array(3) ]
          // to deeply equal [ 'team Billing' ]`.
          const named = savedViews.find((view) => view.name === name);
          const saved = {
            id: named?.id ?? crypto.randomUUID(),
            name,
            criteria: currentCriteria,
            hiddenColumnIds,
          };
          const next =
            named === undefined
              ? [...savedViews, saved]
              : savedViews.map((view) => (view.id === named.id ? saved : view));
          setSavedViews(next);
          rememberSavedViews(projectId, next);
        }}
        onApply={(view) => {
          const { query: savedQuery, ...savedFacets } = view.criteria;
          setQuery(savedQuery);
          setFacets(savedFacets);
          // A view with no column set leaves the columns as they are — see
          // {@link SavedView}. One with a set applies it and remembers it, as
          // the Columns control would have.
          if (view.hiddenColumnIds !== undefined) {
            setStoredHiddenColumns(view.hiddenColumnIds);
            rememberHiddenColumns(projectId, view.hiddenColumnIds);
          }
        }}
        onDelete={(id) => {
          const next = savedViews.filter((view) => view.id !== id);
          setSavedViews(next);
          rememberSavedViews(projectId, next);
        }}
      />
    </>
  );
  const columns = (
    <>
      <ColumnsControl
        offered={offeredColumns}
        hiddenColumnIds={hiddenColumnIds}
        onToggle={toggleColumn}
        {...(measureChooser === undefined ? {} : { measures: measureChooser })}
      />
    </>
  );
  const filterCount = (
    <>
      {sheet && filtering && (
        <span role="status" className="text-muted-foreground text-sm">
          {shownRows.length} of {flat.length} rows
        </span>
      )}
    </>
  );
  const noMatches = (
    <>
      {/*
      Said out loud rather than left to an empty table, which reads as a
      plan that has been lost rather than a filter that found nothing. The
      count beside it stays, so `0 of 12 rows` says the twelve are still
      there.

      Two sentences, because a filter with nothing typed into it has no
      query to quote: `No matches for “”` would be a question mark where the
      reason should be.
    */}
      {filtering && search.matchIds.size === 0 && (
        <span className="text-sm">
          {criteria.query.trim() === ''
            ? 'No rows match these filters'
            : `No matches for “${criteria.query}”${
                facetsChosen(facets) > 0 ? ' with these filters' : ''
              }`}
        </span>
      )}
    </>
  );
  const unestimated = (
    <>
      {/*
      How ready this plan is to be read, and the way to the rows that make
      it not ready. Absent entirely when every leaf is estimated for every
      step: a complete plan needs no badge, and a tick that is always there
      is a thing to stop seeing — this has to be noticed the day it appears.

      Not disabled while the table is busy, unlike the buttons beside it:
      it writes nothing, and a button that greys out during somebody else's
      refetch reads as broken.
    */}
      {/*
        The badge and, inside the same box, where it just took the caret, said
        out loud (UI review F-024): the walk opens branches, scrolls and moves
        the focus, and nothing on screen names which of the gaps this is. The
        region is visually hidden — the focused cell is the visual answer — and
        polite, so it follows the focus move. A bare live region rather than
        `role="status"`: the schedule cue is this table's one status. In the
        badge's own box rather than a toolbar child of its own: an `sr-only`
        child is still a flex item with a top of its own, and it read as a third
        toolbar row in the 1280 budget.
      */}
      {gaps.leaves.length > 0 && (
        <span className="relative inline-flex">
          <Button
            variant="outline"
            size="sm"
            type="button"
            // The second control that aims the caret itself: `walkToNextGap`
            // puts it in the cell that estimates the next gap. See
            // {@link TAKES_THE_FOCUS}.
            {...{ [TAKES_THE_FOCUS]: '' }}
            data-fact={describeGaps(gaps)}
            onClick={() => {
              const landing = walkToNextGap();
              if (landing !== null) setGapNotice(gapLandingWords(landing, flat, steps));
            }}
          >
            {gaps.leaves.length} unestimated
          </Button>
          <span aria-live="polite" aria-atomic="true" className="sr-only" data-gap-notice>
            {gapNotice}
          </span>
        </span>
      )}
    </>
  );
  const undo = (
    <>
      {/*
      The way in for anyone who never learns the chord — which is most
      people, and the reason the buttons are here at all rather than the
      keyboard being the only route. Disabled by `busy` like every other
      control that writes, and by an empty half of the stack: be-01 would
      answer 409 and a button that is always live invites that.

      The disabled state is read off the last tree read rather than counted
      here. It is per account, and be-01 is the only thing that knows what
      somebody else's edit did to it.
    */}
      <Button
        variant="outline"
        size={sheet ? 'sm' : 'square'}
        type="button"
        disabled={busy || !stack.undoable}
        {...busyAffordance(busy)}
        aria-label="Undo"
        data-hint="Undo your last change to this plan (Ctrl/⌘ + Z)"
        onClick={() => {
          void stepStack('undo');
        }}
      >
        <span data-glyph aria-hidden="true">
          ↶
        </span>
        {sheet && 'Undo'}
      </Button>
    </>
  );
  const redo = (
    <>
      <Button
        variant="outline"
        size={sheet ? 'sm' : 'square'}
        type="button"
        disabled={busy || !stack.redoable}
        {...busyAffordance(busy)}
        aria-label="Redo"
        data-hint="Put back what you last undid (Ctrl/⌘ + Shift + Z)"
        onClick={() => {
          void stepStack('redo');
        }}
      >
        <span data-glyph aria-hidden="true">
          ↷
        </span>
        {sheet && 'Redo'}
      </Button>
    </>
  );
  const shortcuts = (
    <>
      {/*
      The way in for anyone who was never told about `?`, which is most
      people the first time. Not disabled by `busy`: it asks be-01 for
      nothing and reads nothing that a refetch could change.
    */}
      <Button
        variant="outline"
        size={sheet ? 'sm' : 'square'}
        type="button"
        aria-label="Keyboard shortcuts"
        data-hint="Keyboard shortcuts (?)"
        // The third control that aims the caret itself: the cheat sheet takes
        // the focus onto its own panel as it mounts, and Radix's restore
        // arrives after it. See {@link TAKES_THE_FOCUS}.
        {...{ [TAKES_THE_FOCUS]: '' }}
        onClick={() => {
          setCheatSheetOpen(true);
        }}
      >
        {/*
        Drawn, not named. This was `⌨` (U+2328) until 2026-08-29, and macOS
        has no colour presentation for it: the system font falls back to a
        hairline outline that is illegible at button size, and what the
        control meant was carried entirely by a codepoint the app does not
        control the rendering of.
      */}
        <KeyboardIcon />
        {sheet && 'Keyboard shortcuts'}
      </Button>
    </>
  );
  const transfer = (
    <>
      {/*
      Sharing the plan, which is what most of it is written for. The local
      exports take the whole plan rather than what is on screen and ask
      be-01 for nothing; Download JSON deliberately asks for the complete
      archival document instead of rebuilding one from visible rows. None is
      disabled by `busy`, and the local exports
      work while the socket is down or the tree is stale. What they cannot
      do is say the figures are current; the header's timestamp is what
      says when they were true. The two Mermaid buttons add a fourth
      clipboard/download outcome the CSV and Markdown-table pair do not
      have: a plan a gantt cannot be drawn of at all (no start date, no
      schedule, or nothing placed), reported the same way a refused
      clipboard write already is. The chart's `.svg` adds a fifth: there is
      no drawing on screen to take a copy of, which is a fact about this
      page rather than about the plan — see {@link downloadChartSvg}.
    */}
      {/*
      One menu for the transfer controls, since `configurable-columns`: measured at 1280,
      the five buttons of that day took 683px of a 1248px toolbar and a thirteenth
      control pushed the row to three lines. A `<details>`, as Filters and
      Views are — no dismiss handler, and a `<button>` inside it still
      closes the phone's sheet (`closingControlIn`). The buttons keep their
      names, titles and handlers; the only thing that moved is where they
      sit.
    */}
      {/* Proof: removing `exportAvailable` left `<details data-export>` in the
        unavailable-plan fixture; expected null, received the live Export menu. */}
      {exportAvailable && (
        <details ref={exportMenu} data-export className="relative">
          <summary
            className="border-control-edge h-8 cursor-pointer rounded-md border px-2 py-1 text-xs whitespace-nowrap select-none"
            data-hint="Copy, download, or import the plan as Markdown, Mermaid, CSV, JSON, or what is on screen"
          >
            {/*
              One line, in the shape of the Filters, Views and Columns summaries beside it. It
              was a fixed `w-16` two-line label from 2026-09-14 to save 42px of the 1280
              budget, and was the only control on the bar that wrapped and stood taller than
              its neighbours (UI review F-004). The line costs 45px; Undo, Redo and Keyboard
              shortcuts became the 32px squares the other icon buttons are (−18px), and
              `project-settings.spec.ts` re-pins the bar's measured sum with the difference.
            */}
            Export / Import
          </summary>
          <div
            data-export-panel
            // Plain menu items, the row ⋯ menu's vocabulary: a borderless row per action that
            // lights on hover and focus, with a rule between the exports, the imports and
            // the one setting. It was nine bordered buttons in a column (UI review F-031).
            className="bg-popover absolute z-50 mt-1 flex w-56 flex-col items-stretch rounded-md border p-1 shadow-md"
            ref={closeOnChoice}
          >
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Copy the whole plan as a Markdown table, with a header saying how to read it"
              onClick={copyAsMarkdown}
            >
              Copy as Markdown
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Copy the chart as a Mermaid gantt, for a Markdown document that draws it"
              onClick={copyAsMermaid}
            >
              Copy as Mermaid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Download the whole plan as a CSV, with a header saying how to read it"
              onClick={downloadCsv}
            >
              Download CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Download the chart as a Mermaid gantt bundled with the Markdown table, with a header saying how to read it"
              onClick={downloadMermaidDocument}
            >
              Download as Markdown
            </Button>
            {/*
          The chart as a picture, in the menu every other export is in. It
          was on the chart's own control strip alone until 2026-08-31 — a
          `⇩` glyph beside `Full` — which is where somebody already
          looking at the chart finds it and nowhere a reader asking "how do I
          send this to somebody" looks. Both stand now: the glyph where the
          chart is, this where the exports are.

          Not disabled while the chart is closed. A control that is there and
          says why is a control that teaches where the chart is; a greyed one
          says nothing at all, and the five beside it are never disabled
          either.
        */}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-export-chart-svg
              data-hint="Download the chart as a standalone .svg — every bar, arrow, hand-off and colour, openable with no app around it"
              onClick={downloadChartSvg}
            >
              Download chart as SVG
            </Button>
            {/*
          The one action that takes the rows on screen rather than the plan. Its
          own button rather than a switch on the four beside it: a mode on a
          button whose header claims the whole plan is how a partial plan gets
          sent as a whole one, which is what §9's Q3 refused. Always offered, not
          only while a filter is on — a collapsed branch narrows the screen too,
          and the `Scope` line it writes says which of the two did it.
        */}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Download the rows on screen as a Markdown table, with a header saying what was filtered out and what is missing"
              onClick={downloadOnScreen}
            >
              Download what’s on screen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={MENU_ITEM}
              data-hint="Download the complete versioned plan archive as JSON"
              onClick={downloadJson}
            >
              Download JSON
            </Button>
            <div role="separator" className="bg-border my-1 h-px shrink-0" />
            <label
              aria-disabled={importBusy}
              data-import-file
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), MENU_ITEM)}
            >
              Import JSON
              <input
                type="file"
                accept="application/json"
                aria-label="Import JSON"
                className="sr-only"
                // Proof: making this permanently enabled failed `disables the
                // import file control while an import is in flight`: expected
                // disabled, received enabled. Observed 2026-09-14.
                disabled={importBusy}
                onChange={importJson}
              />
            </label>
            {/*
            Guidance, not a transfer: it opens a dialog and changes nothing. It sits beside
            Import JSON because that is where someone bringing a project in already looks.
          */}
            <ImportWithAiHelp />
            {/*
          The one setting among the export actions, and it governs two of them:
          `Copy as Mermaid` and `Download as Markdown` both write their fence
          through it. Mermaid has exactly one grouping channel and it is
          `section`, so a fence can be lanes of outline, of step, or of
          person, and never of two at once — which is why this is a picker
          rather than three buttons or three tick boxes.

          Inside the Export menu rather than on the bar, and that is a
          measurement rather than a taste: the panel is `absolute`, so the
          `<details>` the toolbar lays out is its summary and nothing else,
          and a control in here costs the folded toolbar's budget (`e2e/
          layout.spec.ts`, 1600px at 1280) exactly nothing. It also sits
          where the two exports it is about already are.

          A `<select>` rather than a `<Button>`: {@link closingControlIn}
          closes the phone's sheet on a `<button>` inside it, and a picker
          that dismissed the sheet before the export it configures could be
          reached would be a setting nobody can spend.
        */}
            <div role="separator" className="bg-border my-1 h-px shrink-0" />
            <label className="flex items-center justify-between gap-1 px-3 text-xs">
              Mermaid lanes
              <select
                className="border-control-edge bg-background h-8 rounded-md border px-2 text-xs"
                // No `aria-label`: the `<label>` wrapping it already names it,
                // which is where it parts from `Final estimate` below — that one
                // reads `Plan with` on screen and needs the name spelling out.
                data-hint="What the two Mermaid exports group their bars into — the plan's outline, the step a bar is estimated under, or whoever is on it"
                value={mermaidSectionMode}
                onChange={(e) => {
                  const asked = e.target.value;
                  // Narrowing, **not** a guard, and no negative test is owed for
                  // it: `value` is typed `string` and the options are
                  // {@link SECTION_MODES} itself, so nothing a browser can put
                  // here fails it. The same line the `Plan with` picker below
                  // carries, for the same reason. The real boundary is
                  // {@link rememberedMermaidSectionMode}, which reads storage.
                  if (!isSectionMode(asked)) return;
                  // Stored where it is picked and nowhere else, exactly as the
                  // chart's own rung is: opening a plan must not write to it.
                  setMermaidSectionMode(asked);
                  rememberMermaidSectionMode(asked);
                }}
              >
                {SECTION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      )}
    </>
  );
  const starts = (
    <>
      <label data-start-field className="flex items-center gap-1 text-sm">
        Starts
        {/*
        The day the whole plan begins. Setting it moves every date at once,
        because every date is an offset from it — there is nothing stored
        per row to drag along.
      */}
        {/*
          The day in the cells' own words, "19 Sep 2026", over the native
          field, whose text is the platform's (`09/19/2026` in an en-US
          Chromium) and disagreed with every date in the table (UI review
          F-007). The native field stays underneath for picking and typing: its
          text is transparent until it takes the focus, and the words never
          take a pointer, so a click still lands on the field. With no day set
          the words are "No start date" in the muted ink of a placeholder: the
          native `mm/dd/yyyy` was the only US-format date in the app (F-059).
        */}
        <span data-start-box className="group relative inline-flex">
          <DateField
            className="border-control-edge bg-background h-8 rounded-md border px-2 text-sm not-focus:text-transparent"
            aria-label="Project start date"
            disabled={busy}
            {...busyAffordance(busy)}
            value={startDate ?? ''}
            commit={(typed) => {
              void run((write) =>
                write.perform(['tree'], () => commands.setStartDate(typed === '' ? null : typed)),
              );
            }}
          />
          <span
            aria-hidden="true"
            data-start-day
            className={cn(
              'pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm group-focus-within:hidden',
              startDate === null && 'text-muted-foreground',
            )}
          >
            {startDate === null ? 'No start date' : longIsoDate(startDate)}
          </span>
        </span>
      </label>
    </>
  );
  const method = (
    <>
      <label className="flex items-center gap-1 text-sm">
        Plan with
        {/*
        A project-wide setting rather than a per-reader preference: the
        dates below are computed from it, and two people reading different
        dates off one plan is the failure this must not have.
      */}
        <select
          className="border-control-edge bg-background h-8 rounded-md border px-2 text-sm"
          aria-label="Final estimate"
          value={estimateMethod}
          disabled={busy}
          {...busyAffordance(busy)}
          onChange={(e) => {
            const chosen = e.target.value;
            if (isEstimateMethod(chosen)) chooseEstimateMethod(chosen);
          }}
        >
          <option value="pert">PERT</option>
          <option value="optimistic">optimistic</option>
          <option value="realistic">realistic</option>
          <option value="pessimistic">pessimistic</option>
        </select>
      </label>
    </>
  );

  if (sheet) {
    return (
      /*
        The phone's sheet, as a list of labelled rows grouped by what they are
        for — not the desktop bar poured into a wrapping grid, which drew six
        icon-only buttons with no words, rows of mixed widths, a squeezed Find
        and nothing saying which control belonged with which (F-045 of the
        2026-10-13 phone review). The controls are the same elements in both
        faces; only their order and grouping differ, and the sizing is
        `[data-sheet-rows]` in `styles.css`.

        Proof: with the desktop fragment returned here as well, `lists the Plan
        actions as labelled full-width rows grouped by purpose (F-045)` in
        `e2e/mobile.spec.ts` failed on the group headings, `Expected: ["View",
        "Find and filter", "Edit", "Export", "Schedule"]` against none.
      */
      <div data-sheet-groups="" className="flex flex-col gap-4">
        <PlanSheetGroup title="View">
          {gantt}
          {collapseAll}
          {expandAll}
          {arrange}
          {columns}
          {shortcuts}
          {/* Proof: left off this sheet, `is offered on the Plan actions sheet,
          and opens over it` (plan-cards.test.tsx) found no `Claims, 5 held`
          button; watched 2026-10-24. */}
          {claimsSheet}
          {sheetExtras?.view}
        </PlanSheetGroup>
        <PlanSheetGroup title="Find and filter">
          {find}
          {filters}
          {views}
          {filterCount}
          {noMatches}
        </PlanSheetGroup>
        <PlanSheetGroup title="Edit">
          {addItem}
          {undo}
          {redo}
          {unestimated}
          {freeze}
          {settings}
        </PlanSheetGroup>
        {exportAvailable && <PlanSheetGroup title="Export">{transfer}</PlanSheetGroup>}
        <PlanSheetGroup title="Schedule">
          {starts}
          {method}
          {sheetExtras?.schedule}
        </PlanSheetGroup>
      </div>
    );
  }

  return (
    <>
      {freeze}
      {addItem}
      {collapseAll}
      {expandAll}
      {arrange}
      {gantt}
      {settings}
      {find}
      {filters}
      {views}
      {columns}
      {filterCount}
      {noMatches}
      {unestimated}
      {claimsSheet}
      {/*
        The end of the bar as one flex item (UI review F-056, after F-005): the
        icon buttons that act on the plan as a whole — Undo, Redo, Keyboard
        shortcuts and Export / Import — and then the schedule controls, the day
        the plan starts, the figure it is planned with and, while there is one
        to forget, the table's layout reset. One item rather than five, so the
        bar wraps them together: at 1024 Export / Import stood alone at the left
        of row two with the schedule group at its right, two islands; now row
        two, wherever the bar wraps (1024 to 1440 on a plan with unestimated
        rows), is this group alone, right-aligned by `ml-auto`
        (`toolbar-panels.spec.ts`). The inner gap is the bar's own `gap-x-1.5`, so the width
        the budgets in `project-settings.spec.ts` and `optimization-cue.spec.ts`
        add up is unchanged; they count the controls by role, not by child.
        Named groups (F-094), so a screen reader hears the grouping the eye sees.
      */}
      <div
        data-toolbar-end
        role="group"
        aria-label="Whole plan"
        className="ml-auto flex shrink-0 items-center gap-1.5"
      >
        {undo}
        {redo}
        {shortcuts}
        {transfer}
        {/*
          The schedule controls stay a group of their own inside it (F-005):
          Starts, Plan with and Reset layout never part.
        */}
        <div
          data-schedule
          role="group"
          aria-label="Schedule"
          className="flex shrink-0 items-center gap-1.5"
        >
          {starts}
          {method}
          {layoutReset}
        </div>
      </div>

      {/*
        No slot here for plan-level controls the table does not own, and that
        is a measurement rather than an omission. The saved-plan shelf held one
        between `adb58ad9` and this change; `project-settings.spec.ts:77` puts
        `[data-toolbar]`'s children against a 1265px budget with a named margin
        for exactly one more control, and a fifth disclosure spent it — the row
        gained a line, and `gantt.spec.ts:2605` could no longer watch the wrap
        it is about, because the bar was already wrapped before the drag. The
        shelf is in the app header's project row now; `SavedPlanShelf` in
        `project-page.tsx` carries the full list of shapes and what each cost.
      */}
    </>
  );
}

/**
 * The sentence the readiness badge's live region says after a walk:
 * `Unestimated 3 of 87: 010.3.01 Run E1, Plan`.
 *
 * @throws When the landing names a row or a step the plan does not hold: the
 *   walk chose both from this same plan's gaps, so a miss is a broken
 *   invariant rather than a state to word.
 */
export function gapLandingWords(
  landing: GapLanding,
  flat: readonly TreeRow[],
  steps: readonly StepView[],
): string {
  const row = flat.find((candidate) => candidate.id === landing.rowId);
  const step = steps.find((candidate) => candidate.id === landing.stepId);
  if (row === undefined || step === undefined)
    throw new Error('a walk landed on a row or step the plan does not hold');
  return `Unestimated ${String(landing.at)} of ${String(landing.of)}: ${row.number} ${row.name}, ${step.name}`;
}

/**
 * What a control that is unavailable **because a save is in flight** looks
 * like, as opposed to one that is unavailable because there is nothing for it
 * to do.
 *
 * **The fault it exists for.** Every toolbar control that writes is
 * `disabled={busy}` for the whole of the write *and* the refetch after it, and
 * a `disabled` button drops a click on the floor without a sound. Typing a
 * character, pressing ⌘+Enter and clicking `Add work item` in the same breath
 * produced a `PATCH` and two `GET`s and **no `POST` at all** — no new row, no
 * cursor change, no message. Reproduced on demand in Chrome, 2026-08-09.
 *
 * The click is still dropped: queuing it would be a second, invisible order of
 * operations over a plan two people are editing, and that is a design decision
 * nobody has made. What this changes is that the drop is **visible** — the
 * whole toolbar says `aria-busy`, and the controls the wait is holding back
 * fade and take the progress cursor, so a click that goes nowhere lands on
 * something that already said it would.
 *
 * `Undo` with nothing to undo gets none of this and that is the distinction
 * being drawn: it is disabled because the stack is empty, waiting will not
 * change it, and a progress cursor over it would be a lie. The affordance is
 * spread only while `busy` is true, so a control disabled for both reasons
 * wears it for exactly as long as the wait is the reason.
 */
export const busyAffordance = (busy: boolean): { 'data-busy'?: ''; style?: CSSProperties } =>
  busy ? { 'data-busy': '', style: { cursor: 'progress', opacity: 0.6 } } : {};
