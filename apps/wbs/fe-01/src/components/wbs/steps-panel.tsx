import { DEPENDENCY_REACHES, type DependencyReach } from '@wbs/domain/dependency-reach';
import { allowancePercentOf, type EstimateUnit } from '@wbs/domain/estimate';
import { type KeyboardEvent, type SubmitEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type AssumedAssigneeFlipView,
  STEP_REFUSALS,
  type StepUsage,
  type StepView,
} from '@/lib/wbs-api';

import { commandChordIn } from './keyboard-bindings';
import { CARDS_BELOW, TABLE_NEEDS_HEIGHT } from './plan-renderer';
import { foldedTableMinWidth, type FrameLayoutState } from './table-frame';
import type { SettingsSectionReport } from './teams-panel';
import { SectionProblem, useSettingsSection } from './use-settings-section';

/** What a work item's number is, or null once it is no longer in the tree on screen. */
export type NumberOf = (workItemId: string) => string | null;
/** Who somebody is, or null when the directory has no such person. */
export type NameOf = (personId: string) => string | null;

/**
 * How many of a thing, with the thing named singly or plurally.
 *
 * `2 estimates` and `1 assignment` in one sentence, from one place: two
 * spellings of a count is how a confirmation comes to read as though it were
 * about two different removals.
 */
const count = (howMany: number, thing: string): string =>
  `${String(howMany)} ${thing}${howMany === 1 ? '' : 's'}`;

/**
 * What removing a step would take, as confirmation text.
 *
 * Estimate, assignment and reported direct blockage counts include zero.
 * An absent older-server blockage count is stated as unknown.
 * The first two counts always, even when one is zero: "1 estimate and 0 assignments"
 * is a complete answer, and a sentence that dropped the zero would leave the
 * reader wondering whether it had been asked.
 *
 * It names the **kind** of thing as well as the name — "the step QA" rather
 * than "QA" — because a project's steps are named by whoever made them and one
 * may well be called after a person or a team. `steps-not-phases` made the word
 * the same everywhere it is written; this is the one sentence that has to say
 * it out loud, since it is what somebody agrees to before a removal.
 */
export function usageSentence(stepName: string, inUse: StepUsage): string {
  // Proof: bypassing the unknown branch failed the older-server confirmation assertion (steps-panel.test.tsx, 2026-10-14).
  const blockageSentence =
    inUse.blockages === undefined
      ? 'The server did not report step blockages.'
      : `It would also delete ${count(inUse.blockages, 'step blockage')}.`;
  return `Removing the step ${stepName} would delete ${count(
    inUse.estimates,
    'estimate',
  )} and ${count(inUse.assignments, 'assignment')}. ${blockageSentence}`;
}

/**
 * What one assumed-assignee flip says, in the words of somebody reading a plan.
 *
 * "Assumed to be doing all of it" rather than `doesEveryStep`: the field is
 * derived from a work item holding exactly one assignment, and the person it
 * names never agreed to anything — so the sentence has to say who is being
 * assumed, not report a flag.
 *
 * A work item the tree on screen no longer holds is named by nothing at all
 * rather than by its id: a uuid in a confirmation is a fact nobody can act on.
 * That is a state, not a fault — this list came from be-01 and the tree here is
 * a moment older.
 */
export function flipSentence(
  flip: AssumedAssigneeFlipView,
  numberOf: NumberOf,
  nameOf: NameOf,
): string {
  const who = (personId: string | null): string =>
    personId === null ? 'nobody' : (nameOf(personId) ?? 'somebody no longer in the directory');
  const named = numberOf(flip.workItemId) ?? 'A work item no longer on screen';
  return `${named}: ${who(flip.assumedNow)} is assumed to be doing all of it now, ${who(
    flip.assumedAfter,
  )} would be afterwards.`;
}

export interface StepsPanelProps extends SettingsSectionReport {
  /** The steps the table is currently drawing columns for. */
  steps: readonly StepView[];
  estimateCounts: Readonly<Partial<Record<string, number>>>;
  setStepUnit: (stepId: string, unit: EstimateUnit) => Promise<StepView>;
  /**
   * The plan the table is drawing, as far as a width depends on it.
   *
   * Passed down rather than assumed, because the figure below is the table's
   * own minimum and the table's minimum moves with this: a plan where nobody
   * has set an earliest start is 28px narrower than one where somebody has.
   */
  frameState: FrameLayoutState;
  /**
   * The reader's hidden columns, sanitised — what the table is really showing,
   * so the folded width quoted below is the width of that table and not of the
   * default one. `foldedTableMinWidth` throws on an id it does not know, which
   * is why the caller hands over its filtered list and never the stored one.
   */
  hiddenColumnIds: readonly string[];
  numberOf: NumberOf;
  nameOf: NameOf;
  addStep: (name: string, unit: EstimateUnit) => Promise<StepView>;
  renameStep: (stepId: string, name: string) => Promise<StepView>;
  setStepAllowance: (stepId: string, allowancePercent: number) => Promise<StepView>;
  removeStep: (stepId: string, cascade: boolean) => Promise<{ ok: boolean; inUse?: StepUsage }>;
  /**
   * How far into a predecessor this project's dependencies reach — be-01's
   * answer, not this dialog's. What is ticked is read straight off it, so a
   * reach somebody else changed redraws here.
   */
  depReach: DependencyReach;
  /**
   * Writes the project's reach. Every date on the plan may move on it, which is
   * why the caller re-reads through {@link StepsPanelProps.onChanged}
   * afterwards like every other change made here.
   */
  setDepReach: (reach: DependencyReach) => Promise<void>;
  /** Re-reads the project, which is what puts the new columns on the table. */
  onChanged: () => Promise<void>;
  /** Re-reads the tree after changing dependency reach. */
  onReachChanged?: () => Promise<void>;
  /** Fully resynchronizes after a refused write whose step may have disappeared. */
  onRefused?: () => Promise<void>;
}

/**
 * The two reaches, in the order they are offered, with the sentence each one
 * makes about the plan.
 *
 * Read off `DEPENDENCY_REACHES` rather than written out, so a third value
 * cannot appear in the domain and be silently unofferable here — the type of
 * this record makes that a compile error.
 */
const REACH_WORDS: Record<DependencyReach, { title: string; sentence: string }> = {
  'whole-item': {
    title: 'The whole work item',
    sentence: 'A dependency waits until every step of the work item it depends on is finished.',
  },
  'anchor-slice': {
    title: 'The first estimated step',
    sentence:
      'A dependency waits for the first step anybody estimated; the steps behind it run alongside the work waiting on it.',
  },
};

/** A removal be-01 refused, and the decision the reader has not made yet. */
interface Confirming {
  step: StepView;
  inUse: StepUsage;
  cascade: boolean;
}

/**
 * The project's steps, and everything that can be done to them.
 *
 * **A panel and not a dialog since `project-config-modal`** (2026-08-30). This
 * was `StepsDialog`, `ModalContent`'s first production caller and the surface
 * that found two of its rules; it is one of three sections of
 * `ProjectSettingsModal` now, which owns the shell, the trigger, the title and
 * the close. Both rules still hold and are the modal's to hold: the page's own
 * keyboard is held back while it is open, and a command chord aimed at a field
 * **on** the surface is let through — which is what makes Cmd/Ctrl+Enter
 * available to submit with here, and why {@link onChord} is on this panel's own
 * root rather than on a `ModalContent` it no longer renders.
 *
 * **Refusals are shown on the surface rather than raised as toasts.** A toast
 * appears in the corner of a page this modal is covering, and every one of
 * these refusals is about the box somebody is typing in. They are also
 * sentences rather than be-01's codes; {@link STEP_REFUSALS} is the one table
 * place that translation happens.
 *
 * **Nothing here is optimistic.** Every change re-reads the project through
 * `onChanged` and the list redraws from what came back — the same rule the table
 * behind it keeps, and for the same reason: a step list kept locally would be a
 * second answer to a question be-01 owns.
 *
 * What used to be cleared on the dialog's close — a confirmation walked away
 * from, a refusal about a box no longer on screen, the names typed over — is
 * cleared by the unmount now: the modal mounts this when it opens and unmounts
 * it when it closes, so there is nothing for an `onOpenChange` to reset.
 */
export function StepsPanel({
  steps,
  estimateCounts,
  setStepUnit,
  frameState,
  hiddenColumnIds,
  numberOf,
  nameOf,
  addStep,
  renameStep,
  setStepAllowance,
  removeStep,
  depReach,
  setDepReach,
  onChanged,
  onReachChanged,
  onRefused,
  onDirtyChange,
  onBusyChange,
}: StepsPanelProps) {
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<EstimateUnit>('workdays');
  /**
   * The names being typed over the steps' own, by step id.
   *
   * Only the ones somebody has touched: an entry that is absent means "as be-01
   * has it", so a step renamed by somebody else redraws rather than being held
   * at the name this browser last read.
   */
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [allowances, setAllowances] = useState<Partial<Record<string, string>>>({});
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  /**
   * What the modal must not close over: a name typed and not added, a rename
   * typed and not committed, or a confirmation not yet answered. A change on
   * its way to be-01 counts too and is {@link useSettingsSection}'s to add.
   *
   * Proof: reported `false` unconditionally, and `project-settings-modal.test.tsx`'s
   * `a clean modal closes from any section` still passed — it is about the clean
   * case — while `refuses to close over a confirmation nobody has answered` let
   * Escape close over an open removal; watched 2026-08-30.
   */
  const section = useSettingsSection({
    words: STEP_REFUSALS,
    dirty:
      newName.trim() !== '' ||
      newUnit !== 'workdays' ||
      Object.keys(renamed).length > 0 ||
      Object.keys(allowances).length > 0 ||
      confirming !== null,
    onDirtyChange,
    ...(onBusyChange === undefined ? {} : { onBusyChange }),
    onChanged,
    ...(onRefused === undefined ? {} : { onRefused }),
  });

  const nameShown = (step: StepView): string => renamed[step.id] ?? step.name;

  /**
   * Escape over a draft in one of this panel's boxes forgets that draft, as
   * Teams' capacity box does, so "Escape in a field puts it back" (D7) holds
   * here too: since a field's Escape stopped refusing the modal's close, a box
   * with no revert of its own made it a dead key (ui-review F-162). Not while a
   * write travels, for the ladder's reason (F-110): the box shows what was sent.
   *
   * Proof: on 2026-10-18, without these handlers, `Escape in a Steps box
   * forgets what was typed there` (steps-panel.test.tsx) failed on `expected
   * 'Review' to be 'QA'`.
   */
  function forgetOnEscape(event: KeyboardEvent<HTMLInputElement>, forget: () => void): boolean {
    if (event.key !== 'Escape' || section.busy) return false;
    forget();
    section.clear();
    return true;
  }

  const forgetRename = (stepId: string): void => {
    setRenamed((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== stepId)),
    );
  };

  /**
   * Runs one step change, reports what refused it, and re-reads on success.
   *
   * The refusal is caught here rather than by the table's `run`: that one puts
   * be-01's code straight into a toast, which is the raw-code path this change
   * exists to close.
   */
  async function attempt(
    change: () => Promise<void>,
    onLanded?: () => Promise<void>,
  ): Promise<void> {
    // One write at a time: the boxes stay focusable while one travels (F-066),
    // so a second Enter in the same box must not send its copy.
    // Proof: on 2026-10-14, this guard removed, `a step’s name, which a second
    // Enter does not send again` (settings-busy.test.tsx) failed on `expected
    // "vi.fn()" to be called 1 times, but got 2 times`.
    if (section.busy) return;
    await section.attempt(change, onLanded);
  }

  function estimateCount(stepId: string): number {
    const count = estimateCounts[stepId];
    // Proof: removing the count guard made the absent-estimate-count mounted test render instead of throwing; watched 2026-10-12.
    if (count === undefined) throw new Error(`no estimate count for step ${stepId}`);
    return count;
  }

  function submitNew(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const clean = newName.trim();
    // Refused here rather than by be-01: the answer is the same either way and
    // this one arrives without a round trip. Trimmed rather than tested as
    // typed, because a name of spaces is what `name_required` is about.
    if (clean === '') {
      section.refuse('name_required');
      return;
    }
    void attempt(async () => {
      await addStep(clean, newUnit);
      setNewUnit('workdays');
      setNewName('');
    });
  }

  /**
   * Sends the name typed over this step's, if it is a different one.
   *
   * Reached from Enter — the form's own submit — and from **leaving the box**,
   * which is the half that was missing. Every other text field in this product
   * commits on blur, so a rename typed and then abandoned by clicking the ✕ was
   * silently dropped: no PATCH, no toast, no mark on the field. Observed on
   * 2026-08-09, and `onOpenChange` clearing `renamed` is what made it silent.
   *
   * An empty name is a refusal rather than a no-op, on both paths: somebody who
   * cleared the box meant something by it, and a step with no name is what
   * `name_required` is about.
   *
   * A name typed back to what it was is **forgotten** rather than left as a
   * draft that happens to match: the modal reads a draft as an edit it must not
   * close over, and a box that says exactly what be-01 says is holding nothing.
   */
  function commitRename(step: StepView): void {
    const clean = nameShown(step).trim();
    if (clean === '') {
      section.refuse('name_required');
      return;
    }
    if (clean === step.name) {
      forgetRename(step.id);
      return;
    }
    void attempt(async () => {
      await renameStep(step.id, clean);
      forgetRename(step.id);
    });
  }

  function submitRename(event: SubmitEvent<HTMLFormElement>, step: StepView): void {
    event.preventDefault();
    commitRename(step);
  }

  function commitAllowance(step: StepView): void {
    const typed = allowances[step.id];
    if (typed === undefined) return;
    const percent = allowancePercentOf(Number(typed));
    // Proof: disabling this guard made `refuses a fractional hundredth overflow locally` fail: setStepAllowance was called once for 30.001.
    if (typed.trim() === '' || percent === null) {
      section.refuse('invalid_allowance');
      return;
    }
    if (percent === step.allowancePercent) {
      setAllowances((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== step.id)),
      );
      return;
    }
    void attempt(async () => {
      await setStepAllowance(step.id, percent);
      setAllowances((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== step.id)),
      );
    });
  }

  /**
   * Asks for a removal without a cascade, which is always the first ask.
   *
   * be-01 removes a step nothing points at outright, so a confirmation only
   * opens for one that would take something with it — asking anyway is how
   * people learn to confirm without reading.
   */
  function askToRemove(step: StepView): void {
    void attempt(async () => {
      const outcome = await removeStep(step.id, false);
      if (outcome.ok) return;
      if (outcome.inUse === undefined) throw new Error('in_use');
      setConfirming({ step, inUse: outcome.inUse, cascade: false });
    });
  }

  function confirmRemoval(): void {
    if (confirming === null) return;
    // The whole of what the checkbox is for. Nothing is sent until it is
    // ticked, and it starts off — see the assertion in `steps-panel.test.tsx`.
    if (!confirming.cascade) return;
    const step = confirming.step;
    void attempt(async () => {
      const outcome = await removeStep(step.id, true);
      if (!outcome.ok) throw new Error('in_use');
      setConfirming(null);
    });
  }

  /**
   * Cmd/Ctrl+Enter, which submits whatever form the keystroke was aimed at.
   *
   * The chord this surface can have at all only because `F shadcn-foundation`'s
   * second round let a command chord through to a field on a modal surface:
   * the first version of {@link usePageShortcutsSuspended} swallowed it in the
   * capture step and this handler would never have run.
   *
   * `requestSubmit` rather than calling the handler directly, so the chord goes
   * through exactly the path Enter does — validation, the `submit` event, and
   * the one place each form's rules are written.
   *
   * On each box rather than on a wrapper: the dialog this panel was put it on
   * `ModalContent`, which is Radix's `role="dialog"` element and may listen; a
   * plain `<div>` may not (`jsx-a11y/no-static-element-interactions`), and the
   * boxes are where the keystroke lands anyway.
   */
  function onChord(event: KeyboardEvent<HTMLInputElement>): void {
    if (commandChordIn(event) !== 'next-or-create') return;
    const aimedAt = event.target;
    if (!(aimedAt instanceof HTMLElement)) return;
    const form = aimedAt.closest('form');
    if (form === null) return;
    event.preventDefault();
    form.requestSubmit();
  }

  /**
   * How wide the table would be with these steps folded.
   *
   * The steps' **real** ids, not their number: every width resolves per
   * column id, so a figure summed from stand-in ids would answer about columns
   * that do not exist while the table lays out the ones that do.
   */
  const minWidth = foldedTableMinWidth(
    steps.map((step) => step.id),
    frameState,
    hiddenColumnIds,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The steps every work item on this plan is estimated by. Estimates and assignees follow them.
      </p>

      <SectionProblem problem={section.problem} />

      {confirming === null ? (
        <>
          {/*
            One grid for every step and the row that adds one, so the name
            boxes, the unit choices, the allowances and the buttons stand in
            columns. F-020 (UI review 2026-10-13): as one flex row per step the
            name box was the only child allowed to shrink, and three steps
            read "|", "" and "Rev". The name column is `minmax(9rem, 1fr)` and
            every other column is as wide as its widest cell, which `subgrid`
            shares across the rows; under `sm` a row is two lines instead —
            name and remove, then unit and allowance — because four columns
            do not fit a phone. The labels the cells are found by stay whole
            for a screen reader and are drawn once, as the header.
          */}
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(9rem,1fr)_auto_auto_auto] sm:items-center sm:gap-x-3">
            <div
              aria-hidden="true"
              className="text-muted-foreground hidden text-xs font-medium sm:col-span-4 sm:grid sm:grid-cols-subgrid"
            >
              <span>Step</span>
              <span>Estimate unit</span>
              <span>Allowance</span>
              <span />
            </div>
            {/*
              Not redundant here: WebKit drops a list's implicit role once it is
              `display: contents`, so the role is said out loud for the screen
              reader that would otherwise hear five loose rows.
            */}
            {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- the `display: contents` boundary above */}
            <ul role="list" className="contents">
              {steps.map((step) => (
                <li
                  key={step.id}
                  data-step-row
                  className="border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 sm:col-span-4 sm:grid-cols-subgrid sm:border-b-0 sm:pb-0"
                >
                  <form
                    className="min-w-0"
                    onSubmit={(event) => {
                      submitRename(event, step);
                    }}
                  >
                    <Label htmlFor={`step-${step.id}`} className="sr-only">
                      {step.name}
                    </Label>
                    <Input
                      id={`step-${step.id}`}
                      value={nameShown(step)}
                      title={nameShown(step)}
                      readOnly={section.busy}
                      onChange={(event) => {
                        const typed = event.currentTarget.value;
                        setRenamed((current) => ({ ...current, [step.id]: typed }));
                      }}
                      onBlur={() => {
                        commitRename(step);
                      }}
                      onKeyDown={(event) => {
                        if (
                          step.id in renamed &&
                          forgetOnEscape(event, () => {
                            forgetRename(step.id);
                          })
                        )
                          return;
                        onChord(event);
                      }}
                    />
                    <button type="submit" className="sr-only">
                      Rename {step.name}
                    </button>
                  </form>
                  <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
                    {/*
                      Proof: removing the estimate-count disabled arm failed blocks the unit control over estimates; watched 2026-10-12.
                      The reason a unit is locked is said on the row, under its radios, and is the
                      group's description (ui-review F-118): it was a hover `title`, and the greyed
                      pair beside the New step row's live one read as a broken control.
                    */}
                    <fieldset
                      className="m-0 flex flex-wrap items-center gap-x-3 border-0 p-0 whitespace-nowrap"
                      aria-describedby={
                        estimateCount(step.id) > 0 ? `unit-locked-${step.id}` : undefined
                      }
                      disabled={section.busy || estimateCount(step.id) > 0}
                    >
                      <legend className="sr-only">{step.name} estimate unit</legend>
                      {(['workdays', 'minutes'] as const).map((unit) => (
                        <label key={unit} className="inline-flex items-center gap-1.5 text-sm">
                          <input
                            type="radio"
                            name={`unit-${step.id}`}
                            aria-label={`${step.name} ${unit}`}
                            checked={step.estimateUnit === unit}
                            onChange={() => {
                              void attempt(async () => {
                                await setStepUnit(step.id, unit);
                              });
                            }}
                          />
                          {unit}
                        </label>
                      ))}
                      {estimateCount(step.id) > 0 && (
                        <span
                          id={`unit-locked-${step.id}`}
                          className="text-muted-foreground basis-full text-xs"
                        >
                          fixed by {count(estimateCount(step.id), 'estimate')}
                        </span>
                      )}
                    </fieldset>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span aria-hidden="true" className="text-muted-foreground sm:hidden">
                        Allowance
                      </span>
                      <Label htmlFor={`allowance-${step.id}`} className="sr-only">
                        {step.name} allowance (%)
                      </Label>
                      <Input
                        id={`allowance-${step.id}`}
                        className="w-20"
                        type="number"
                        min={0}
                        max={1000}
                        step={0.01}
                        value={allowances[step.id] ?? String(step.allowancePercent)}
                        readOnly={section.busy}
                        onChange={(event) => {
                          const typed = event.currentTarget.value;
                          setAllowances((current) => ({ ...current, [step.id]: typed }));
                        }}
                        onBlur={() => {
                          commitAllowance(step);
                        }}
                        onKeyDown={(event) => {
                          if (
                            step.id in allowances &&
                            forgetOnEscape(event, () => {
                              setAllowances((current) =>
                                Object.fromEntries(
                                  Object.entries(current).filter(([id]) => id !== step.id),
                                ),
                              );
                            })
                          )
                            return;
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitAllowance(step);
                          }
                        }}
                      />
                      <span aria-hidden="true">%</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                    // The word the button shows, and which step it removes: one
                    // column of "Remove" is unambiguous to the eye, not to a reader.
                    aria-label={`Remove ${step.name}`}
                    disabled={section.busy}
                    onClick={() => {
                      askToRemove(step);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>

            <form
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t pt-3 sm:col-span-4 sm:grid-cols-subgrid"
              onSubmit={submitNew}
            >
              <div className="min-w-0">
                <Label htmlFor="step-new" className="sr-only">
                  New step
                </Label>
                <Input
                  id="step-new"
                  placeholder="New step"
                  value={newName}
                  readOnly={section.busy}
                  onChange={(event) => {
                    setNewName(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      newName !== '' &&
                      forgetOnEscape(event, () => {
                        setNewName('');
                      })
                    )
                      return;
                    onChord(event);
                  }}
                />
              </div>
              <fieldset
                className="col-span-2 m-0 flex items-center gap-3 border-0 p-0 whitespace-nowrap sm:col-span-1"
                disabled={section.busy}
              >
                <legend className="sr-only">New step estimate unit</legend>
                {(['workdays', 'minutes'] as const).map((unit) => (
                  <label key={unit} className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="new-step-unit"
                      aria-label={`New step ${unit}`}
                      checked={newUnit === unit}
                      onChange={() => {
                        setNewUnit(unit);
                      }}
                    />
                    {unit}
                  </label>
                ))}
              </fieldset>
              <span aria-hidden="true" className="hidden sm:block" />
              <Button
                type="submit"
                size="sm"
                className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                disabled={section.busy}
              >
                Add step
              </Button>
            </form>
          </div>

          {/*
              How far a dependency reaches, here rather than in a dialog of its
              own because it is a statement about how the steps above chain:
              reordering them moves what an `anchor-slice` dependency waits for,
              and the two facts belong on one surface.

              Nothing is held locally — `checked` is be-01's answer arriving as
              a prop, the same rule the phase names above keep. The write goes
              through `attempt`, so a refusal is a sentence on this surface and
              the plan is re-read either way: every date on it can move on this.
            */}
          <fieldset className="flex flex-col gap-2" disabled={section.busy}>
            <legend className="text-sm font-medium">A dependency waits for</legend>
            {DEPENDENCY_REACHES.map((reach) => (
              <Label key={reach} className="flex items-start gap-2 font-normal">
                <input
                  type="radio"
                  name="dep-reach"
                  value={reach}
                  className="mt-1"
                  checked={depReach === reach}
                  onChange={() => {
                    void attempt(() => setDepReach(reach), onReachChanged ?? onChanged);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm">{REACH_WORDS[reach].title}</span>
                  <span className="text-muted-foreground text-sm">
                    {REACH_WORDS[reach].sentence}
                  </span>
                </span>
              </Label>
            ))}
          </fieldset>

          {/*
            The arithmetic, said out loud where the decision is made. Somebody
            adding a sixth step is entitled to know what it costs before the
            table starts scrolling sideways under them, and the number is
            `table-frame.ts`'s own rather than a figure typed in here.
          */}
          {/*
            Renderer-neutral, and it has to be: this modal opens from the
            phone's toolbar sheet too, where there is no table on screen to
            scroll and a sentence about one describes something the reader
            will never see. Both numbers are read from the modules that own
            them rather than typed in here.
          */}
          <p className="text-muted-foreground text-sm">
            {/*
              `needs` for one step and `need` for several. {@link count}
              gets the noun right and the verb was written once, plurally,
              and never made to follow it — so a single-step plan read
              `1 step need ≥1123px`. Found on 2026-08-14 while measuring
              this very figure at 1280; it is the `and 1 others` defect #59
              corrected in the chart's blocking-set sentence, in the sentence
              next door. `steps-panel.test.tsx` asserts the whole sentence
              now rather than a prefix that swept the verb up with the noun.
            */}
            {count(steps.length, 'step')} {steps.length === 1 ? 'needs' : 'need'} ≥
            {String(minWidth)}px of width to sit side by side; a narrower window scrolls sideways,
            and under {String(CARDS_BELOW)}px wide or {String(TABLE_NEEDS_HEIGHT)}px tall the plan
            is drawn as cards instead.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p>{usageSentence(confirming.step.name, confirming.inUse)}</p>
          {confirming.inUse.assumedAssignees.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">
                It would also change who is assumed to be doing every step of these:
              </p>
              <ul className="text-sm">
                {confirming.inUse.assumedAssignees.map((flip) => (
                  <li key={flip.workItemId}>{flipSentence(flip, numberOf, nameOf)}</li>
                ))}
              </ul>
            </div>
          )}
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirming.cascade}
              disabled={section.busy}
              onChange={(event) => {
                const ticked = event.currentTarget.checked;
                setConfirming((current) =>
                  current === null ? null : { ...current, cascade: ticked },
                );
              }}
            />
            Delete them along with the step
          </Label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={section.busy}
              onClick={() => {
                setConfirming(null);
              }}
            >
              Keep {confirming.step.name}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              // Off until the box is ticked, and the button says so rather
              // than the click quietly doing nothing.
              disabled={section.busy || !confirming.cascade}
              onClick={confirmRemoval}
            >
              Remove {confirming.step.name}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
