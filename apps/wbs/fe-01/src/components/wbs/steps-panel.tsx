import { Input, Label } from '@ui/saas-01';
import { DEPENDENCY_REACHES, type DependencyReach } from '@wbs/domain/dependency-reach';
import { allowancePercentOf, type EstimateUnit } from '@wbs/domain/estimate';
import { type KeyboardEvent, useState } from 'react';

import { STEP_REFUSALS, type StepView } from '@/lib/wbs-api';

import { CARDS_BELOW, TABLE_NEEDS_HEIGHT } from './plan-renderer';
import { foldedTableMinWidth, type FrameLayoutState } from './table-frame';
import type { SettingsSectionReport } from './teams-panel';
import { SectionProblem, useSettingsSection } from './use-settings-section';

/** A count with its singular or plural unit. */
const count = (howMany: number, thing: string): string =>
  `${String(howMany)} ${thing}${howMany === 1 ? '' : 's'}`;

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
  setStepAllowance: (stepId: string, allowancePercent: number) => Promise<StepView>;
  /**
   * How far into a predecessor this work package's dependencies reach — be-01's
   * answer, not this dialog's. What is ticked is read straight off it, so a
   * reach somebody else changed redraws here.
   */
  depReach: DependencyReach;
  /**
   * Writes the work package's reach. Every date on the plan may move on it, which is
   * why the caller re-reads through {@link StepsPanelProps.onChanged}
   * afterwards like every other change made here.
   */
  setDepReach: (reach: DependencyReach) => Promise<void>;
  /** Re-reads the work package, which is what puts the new columns on the table. */
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

/**
 * Explicit package unit and allowance values over the current step snapshot. Definition
 * names and applicability belong to organization/space/project settings. No edit is optimistic;
 * successful changes reread through onChanged. Allowance drafts and pending writes report
 * to WorkPackageSettingsModal, which owns close, focus and cross-section lifetimes.
 */
export function StepsPanel({
  steps,
  estimateCounts,
  setStepUnit,
  frameState,
  hiddenColumnIds,
  setStepAllowance,
  depReach,
  setDepReach,
  onChanged,
  onReachChanged,
  onRefused,
  onDirtyChange,
  onBusyChange,
}: StepsPanelProps) {
  const [allowances, setAllowances] = useState<Partial<Record<string, string>>>({});

  const section = useSettingsSection({
    words: STEP_REFUSALS,
    // Proof: forcing false let the modal close over an allowance draft; the current modal draft case failed.
    dirty: Object.keys(allowances).length > 0,
    onDirtyChange,
    ...(onBusyChange === undefined ? {} : { onBusyChange }),
    onChanged,
    ...(onRefused === undefined ? {} : { onRefused }),
  });

  /** Escape reverts this allowance draft unless its write is still pending. */
  function forgetOnEscape(event: KeyboardEvent<HTMLInputElement>, forget: () => void): boolean {
    // Proof: omitting busy protection reset the pending value; omitting forget retained the abandoned draft. Both current surface cases failed.
    if (event.key !== 'Escape' || section.busy) return false;
    forget();
    section.clear();
    return true;
  }

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
    // Proof: omission duplicated the allowance write across repeated Enter/blur; the pending surface case failed.
    if (section.busy) return;
    await section.attempt(change, onLanded);
  }

  function estimateCount(stepId: string): number {
    const count = estimateCounts[stepId];
    // Proof: omission again rendered an absent estimate census instead of throwing its named fault (steps-panel.test.tsx).
    if (count === undefined) throw new Error(`no estimate count for step ${stepId}`);
    return count;
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
    // Proof: omission sent a write for0.00over0 and failed the strengthened unchanged-allowance case; its earlier untouched-field test was vacuous.
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
        Names and applicability are managed in organization, space and project settings. Units and
        allowances below belong to this work package.
      </p>

      <SectionProblem problem={section.problem} />
      {steps.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No steps apply to this work package. Add bindings in organization, space or project
          settings.
        </p>
      )}

      <>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(9rem,1fr)_auto_auto] sm:items-center sm:gap-x-3">
          <div
            aria-hidden="true"
            className="text-muted-foreground hidden text-xs font-medium sm:col-span-3 sm:grid sm:grid-cols-subgrid"
          >
            <span>Step</span>
            <span>Estimate unit</span>
            <span>Allowance</span>
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
                className="border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 sm:col-span-3 sm:grid-cols-subgrid sm:border-b-0 sm:pb-0"
              >
                {/* Proof: restoring a name textbox violated the text-only definition display; the current surface case failed. */}
                <span className="min-w-0 break-words" title={step.name}>
                  {step.name}
                </span>
                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:contents">
                  {/*
                      Proof: removing estimate-count locking again failed the current blocked-unit case (steps-panel.test.tsx).
                      The stored estimate count supplies the accessible description for a locked unit.
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
              </li>
            ))}
          </ul>
        </div>

        {/*
              How far a dependency reaches, here rather than in a dialog of its
              own because it is a statement about how the steps above chain:
              reordering them moves what an `anchor-slice` dependency waits for,
              and the two facts belong on one surface.

              Nothing is held locally — `checked` is be-01's answer arriving as
              a prop, the same rule the step snapshot above keeps. The write goes
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
                <span className="text-muted-foreground text-sm">{REACH_WORDS[reach].sentence}</span>
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
          {count(steps.length, 'step')} {steps.length === 1 ? 'needs' : 'need'} ≥{String(minWidth)}
          px of width to sit side by side; a narrower window scrolls sideways, and under{' '}
          {String(CARDS_BELOW)}px wide or {String(TABLE_NEEDS_HEIGHT)}px tall the plan is drawn as
          cards instead.
        </p>
      </>
    </div>
  );
}
