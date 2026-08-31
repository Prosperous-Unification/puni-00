import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ESTIMATE_ROUNDINGS,
  type EstimateMethod,
  type EstimateRoundingView,
  type PertWeightsView,
} from '@/lib/wbs-api';

import type { SettingsSectionReport } from './teams-panel';

/** The three coefficients as their boxes hold them — text, because a half-typed number is text. */
export interface WeightDraft {
  optimistic: string;
  realistic: string;
  pessimistic: string;
}

export function draftOfWeights(weights: PertWeightsView): WeightDraft {
  return {
    optimistic: String(weights.optimistic),
    realistic: String(weights.realistic),
    pessimistic: String(weights.pessimistic),
  };
}

/**
 * What the three boxes amount to, or `null` where they cannot average a triple.
 *
 * The same bargain `ladderOfDrafts` makes one section along: what is refused
 * here is what be-01 would refuse with a code about a shape rather than about
 * the box somebody is looking at, and everything else is be-01's to refuse.
 * Three things are not a set of weights, and each is a real keystroke:
 *
 * - an **empty** box, because `Number('')` is `0` and a blank would travel as a
 *   deliberate zero;
 * - a box holding something that is not a finite number at or above zero —
 *   `1e999` parses to `Infinity`, which passes every `>= 0` ever written and
 *   would divide every step of the plan to nothing;
 * - **three zeroes**, which have no divisor at all: the sum of the weights is
 *   what the weighted total is divided by.
 *
 * Proof: the `Number.isFinite` arm replaced by a bare `Number(box) >= 0`, and
 * `refuses a weight of 1e999 rather than sending an Infinity` failed on
 * `expected "spy" to not be called at all, but actually been called 1 times` —
 * a triple on its way to be-01 with `Infinity` in it. Watched 2026-08-30.
 */
export function weightsOfDraft(draft: WeightDraft): PertWeightsView | null {
  const read = (box: string): number | null => {
    const typed = box.trim();
    if (typed === '') return null;
    const weight = Number(typed);
    return Number.isFinite(weight) && weight >= 0 ? weight : null;
  };
  const optimistic = read(draft.optimistic);
  const realistic = read(draft.realistic);
  const pessimistic = read(draft.pessimistic);
  if (optimistic === null || realistic === null || pessimistic === null) return null;
  if (optimistic + realistic + pessimistic <= 0) return null;
  return { optimistic, realistic, pessimistic };
}

/** What each rounding says about the plan, in the order they are offered. */
const ROUNDING_WORDS: Record<EstimateRoundingView, { title: string; sentence: string }> = {
  exact: {
    title: 'Keep the fraction',
    sentence:
      'A step is charged exactly what the formula gives, half days and all. What every plan did before rounding could be chosen.',
  },
  floor: {
    title: 'Round down',
    sentence: 'A step is charged the whole days it needs; anything under a day is charged as none.',
  },
  round: {
    title: 'Round to the nearest',
    sentence: 'Half a day or more is charged as a day, less than half as none.',
  },
  ceil: {
    title: 'Round up',
    sentence: 'A step that needs any part of a day is charged the whole day.',
  },
};

export interface EstimatingPanelProps extends SettingsSectionReport {
  /**
   * What the plan is planned with — the toolbar's `Plan with`, reported here so
   * this surface can say whether the weights below are in force at all. It is
   * **not** set here: the method is one control on the bar and a second one for
   * the same fact would be two answers to one question.
   */
  method: EstimateMethod;
  /** The coefficients as be-01 has them; what is in the boxes is seeded from these. */
  pertWeights: PertWeightsView;
  /** How a step's figure is charged as days, as be-01 has it — what is ticked. */
  estimateRounding: EstimateRoundingView;
  /** Writes either, or both at once. Throws be-01's refusal code. */
  setArithmetic: (arithmetic: {
    pertWeights?: PertWeightsView;
    estimateRounding?: EstimateRoundingView;
  }) => Promise<void>;
  /** Re-reads the plan, which is what puts the new figures on the table. */
  onChanged: () => Promise<void>;
  /** Asks the modal to close, once what was typed has landed. */
  onDone: () => void;
}

/**
 * The arithmetic this plan turns its estimates into days with: the PERT weights
 * and the rounding one step's figure is charged at.
 *
 * A section of `ProjectSettingsModal` rather than a control on the plan toolbar,
 * and `dep-reach-whole-item` is the precedent it follows: a project-wide
 * statement about **how the plan is computed** belongs where the teams'
 * capacity and the priority ladder are, not on a bar whose width is the scarce
 * resource and which already folded three such surfaces away. It is set once
 * and read for weeks.
 *
 * **The weights and the rounding commit differently, and the difference is the
 * fact.** A rounding is one choice out of four and lands the moment it is
 * picked, the way the reach does one section along. Three weights are only a
 * set **together** — 1/4/1 on its way to 1/1/1 passes through triples nobody
 * means — so they are held as drafts and sent as one triple by `Save`, exactly
 * as a ladder is.
 *
 * Nothing here is optimistic: every write re-reads the plan, and a refusal is a
 * sentence on this surface rather than a toast in the corner of the page the
 * modal is covering.
 */
export function EstimatingPanel({
  method,
  pertWeights,
  estimateRounding,
  setArithmetic,
  onChanged,
  onDirtyChange,
  onDone,
}: EstimatingPanelProps) {
  const [draft, setDraft] = useState<WeightDraft>(() => draftOfWeights(pertWeights));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Dirty while the boxes say something the saved weights do not, or while a
   * write is in flight. Compared against what be-01 has **now**, so a peer's
   * change that happens to match what was typed reads as clean.
   */
  const dirty =
    busy ||
    Object.entries(draftOfWeights(pertWeights)).some(
      ([field, saved]) => draft[field as keyof WeightDraft] !== saved,
    );
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  async function write(
    arithmetic: { pertWeights?: PertWeightsView; estimateRounding?: EstimateRoundingView },
    done: boolean,
  ): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await setArithmetic(arithmetic);
      await onChanged();
      if (done) onDone();
    } catch (thrown: unknown) {
      // The boxes are kept on a refusal: what is on screen is what the reader
      // typed and what the sentence is about. be-01's code is turned into a
      // sentence here — there is one refusal this surface can earn, and it is
      // the one `weightsOfDraft` already refuses without a round trip.
      setProblem(
        thrown instanceof Error && thrown.message === 'bad_pert_weights'
          ? 'Those weights cannot average an estimate. At least one of the three has to be above zero.'
          : 'That change did not land. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function save(): void {
    const weights = weightsOfDraft(draft);
    if (weights === null) {
      setProblem(
        'Each weight has to be a number at or above zero, and at least one of the three has to be above zero.',
      );
      return;
    }
    void write({ pertWeights: weights }, true);
  }

  const weighed = method === 'pert';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        How this plan turns an estimate into days. A step’s three points are combined by{' '}
        <strong>Plan with</strong> on the toolbar, the figure is rounded as you choose below, and
        only then are a work item’s steps added up.
      </p>

      {problem !== null && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="text-sm font-medium">PERT weights</legend>
        <p className="text-muted-foreground text-sm">
          {weighed
            ? 'Each point counts this many times, and the total is divided by the three added together — 1, 4 and 1 is the textbook (o + 4r + p) / 6, and 1, 1 and 1 is a plain average.'
            : 'This plan takes one of the three points as it stands, so these weights are not in force. They apply when Plan with is set to PERT.'}
        </p>
        <div className="flex items-end gap-2">
          {(['optimistic', 'realistic', 'pessimistic'] as const).map((point) => (
            <div key={point} className="flex flex-1 flex-col gap-1">
              <Label htmlFor={`pert-weight-${point}`} className="capitalize">
                {point}
              </Label>
              <Input
                id={`pert-weight-${point}`}
                className="h-8"
                inputMode="decimal"
                value={draft[point]}
                onChange={(event) => {
                  const typed = event.currentTarget.value;
                  setDraft((current) => ({ ...current, [point]: typed }));
                }}
              />
            </div>
          ))}
          <Button type="button" size="sm" onClick={save}>
            Save weights
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="text-sm font-medium">A step’s days are</legend>
        {ESTIMATE_ROUNDINGS.map((rounding) => (
          <Label key={rounding} className="flex items-start gap-2 font-normal">
            <input
              type="radio"
              name="estimate-rounding"
              value={rounding}
              className="mt-1"
              // be-01's answer arriving as a prop, never a state of its own —
              // the same rule the reach keeps one section along, so a rounding
              // somebody else picked redraws here.
              checked={estimateRounding === rounding}
              onChange={() => {
                void write({ estimateRounding: rounding }, false);
              }}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{ROUNDING_WORDS[rounding].title}</span>
              <span className="text-muted-foreground text-sm">
                {ROUNDING_WORDS[rounding].sentence}
              </span>
            </span>
          </Label>
        ))}
      </fieldset>

      <p className="text-muted-foreground text-sm">
        Each step is rounded on its own before anything is added up, so two half-day steps are two
        days rather than one — and a work item with children carries what its children were charged.
      </p>
    </div>
  );
}
