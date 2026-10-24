import { Button, Input, SELECT_CLASS } from '@ui/saas-01';
import { type ReactNode, useId, useState } from 'react';

import type {
  BudgetStatement,
  MeasureDefinitionView,
  MeasureTrio,
  MoneyBasisView,
  StepView,
  WorkItemView,
} from '@/lib/wbs-api';

import {
  basisWords,
  type BudgetReading,
  budgetReadingOf,
  factKeyOf,
  formatMeasureValue,
  type MeasureFacet,
  measureFiguresOf,
  mixedSentence,
  storedValueOf,
  TYPED_FIGURE_HELP,
  typedValueOf,
  unitLabelOf,
} from './measure-reading';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from './modal';
import { MeasureFigureText } from './plan-columns/measures';
import { showDay } from './plan-number-format';
import type { MeasureDefinitionsState } from './use-measure-definitions';

/**
 * The panel's writes, each answering the sentence a refusal reads as
 * (`plan-refusal.ts`) or null when it landed. The table builds them over its
 * plan command batch, so a refusal is also toasted and the plan reread exactly
 * as for any other edit; the panel shows the sentence beside the control that
 * asked, where the reader is looking.
 */
export interface MeasureWrites {
  setEstimate: (
    stepId: string,
    measure: string,
    estimate: MeasureTrio,
    rateCardDigest?: string,
  ) => Promise<string | null>;
  clearEstimate: (stepId: string, measure: string) => Promise<string | null>;
  setFact: (
    stepId: string,
    measure: string,
    value: number,
    rateCardDigest?: string,
  ) => Promise<string | null>;
  clearFact: (stepId: string, measure: string) => Promise<string | null>;
  setBudget: (measure: string, budget: BudgetStatement) => Promise<string | null>;
  clearBudget: (measure: string) => Promise<string | null>;
}

/** The row fields the panel reads: the row read's measure fields and its identity. */
export type MeasurePanelRow = Pick<
  WorkItemView,
  | 'id'
  | 'number'
  | 'name'
  | 'rolledUp'
  | 'finalTotal'
  | 'actuals'
  | 'measures'
  | 'measureEstimates'
  | 'budgets'
  | 'mixedRateCards'
  | 'moneyBases'
>;

export interface MeasurePanelProps {
  onOpenChange: (open: boolean) => void;
  row: MeasurePanelRow;
  steps: readonly StepView[];
  state: MeasureDefinitionsState;
  writes: MeasureWrites;
}

/** Whether a row holds any figure or budget in any measure: the panel's empty state. */
function holdsAnyMeasure(row: MeasurePanelRow): boolean {
  return (
    Object.keys(row.measureEstimates ?? {}).length > 0 ||
    Object.keys(row.budgets ?? {}).length > 0 ||
    Object.keys(row.mixedRateCards ?? {}).length > 0 ||
    Object.entries(row.measures ?? {}).some(
      ([metric, byStep]) => metric !== 'token_estimate' && Object.keys(byStep).length > 0,
    )
  );
}

/** Eased colour and width changes that stand still for a reader who asks for less motion. */
const EASED =
  'transition-[color,background-color,width] duration-200 ease-out motion-reduce:transition-none';

/**
 * Every measure definition of the organization for one work item, in order:
 * the estimate trio and its expected figure, the fact, the variance and the
 * budget, each editable here (`wbs-measure-budgets` D7, task 4.3).
 *
 * A modal opened from the row's menu, because the plan has no work item page:
 * attempts and dependencies live in hover cards over one cell each, and a
 * panel listing five measures with their forms is not a hover (design D57).
 * Every state is rendered: definitions loading, the organization not yet
 * activated, the read refused, and a row with nothing in any measure.
 */
export function MeasurePanel({ onOpenChange, row, steps, state, writes }: MeasurePanelProps) {
  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-xl" data-measure-panel>
        <ModalHeader>
          <ModalTitle>{`Measures for ${row.number}`}</ModalTitle>
          <ModalDescription>
            {row.name === '' ? 'This work item' : row.name} — estimates, facts and budgets per
            measure. Only time moves the schedule.
          </ModalDescription>
        </ModalHeader>
        {state.kind === 'loading' && (
          <p role="status" className="text-muted-foreground text-sm">
            Reading this organization’s measures…
          </p>
        )}
        {state.kind === 'organization_required' && (
          <p data-measures-unavailable className="text-muted-foreground text-sm">
            Measures belong to an organization, and this workspace does not belong to one yet. Once
            it does, tokens, cost and agent minutes can be estimated, recorded and budgeted here.
          </p>
        )}
        {state.kind === 'failed' && (
          <p role="alert" className="text-destructive text-sm">
            {state.sentence}
          </p>
        )}
        {state.kind === 'ready' && (
          <div className="flex flex-col gap-3">
            {!holdsAnyMeasure(row) && (
              <p
                data-measures-empty
                className="bg-muted/50 text-muted-foreground rounded-md p-3 text-sm"
              >
                Nothing is estimated, recorded or budgeted in any measure but time on this row yet.
                Open a measure below to start.
              </p>
            )}
            {state.measures.map((definition) =>
              definition.schedulesWork ? (
                <TimeCard key={definition.key} definition={definition} row={row} />
              ) : (
                <MeasureCard
                  key={definition.key}
                  definition={definition}
                  row={row}
                  steps={steps}
                  writes={writes}
                />
              ),
            )}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}

/** A card's frame: one surface per measure, its name, unit and what kind of figure it is. */
function CardFrame({
  definition,
  children,
  badges,
}: {
  definition: MeasureDefinitionView;
  children: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <section
      data-measure-card={definition.key}
      aria-label={definition.name}
      className="bg-card flex flex-col gap-2 rounded-md border p-3"
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{definition.name}</h3>
        <span className="text-quiet-ink text-xs">{unitLabelOf(definition)}</span>
        {badges}
      </header>
      {children}
    </section>
  );
}

/** A small word beside a measure's name: derived, advisory, exceeded. */
function Badge({ children, tone }: { children: ReactNode; tone: 'quiet' | 'warn' | 'over' }) {
  const color =
    tone === 'over'
      ? 'var(--status-blocked)'
      : tone === 'warn'
        ? 'var(--status-in-progress)'
        : 'var(--quiet-ink)';
  return (
    <span
      className="rounded-full border px-1.5 text-[0.6875rem] leading-4 font-medium"
      style={{ color, borderColor: color }}
    >
      {children}
    </span>
  );
}

/**
 * Time, read here and edited where it always was: its trio in the step
 * columns and its fact as the actual days (design D27). It holds no budget
 * (design D35).
 */
function TimeCard({
  definition,
  row,
}: {
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
}) {
  const actual = Object.values(row.actuals ?? {});
  return (
    <CardFrame definition={definition} badges={<Badge tone="quiet">schedules work</Badge>}>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Figure label="Planned">{showDay(row.finalTotal)}</Figure>
        <Figure label="Actual">
          {actual.length === 0 ? (
            <span className="text-quiet-ink" data-fact="No actual days recorded.">
              —
            </span>
          ) : (
            showDay(actual.reduce((total, days) => total + days, 0))
          )}
        </Figure>
        <Figure label="Budget">
          <span className="text-quiet-ink">none</span>
        </Figure>
      </dl>
      <p className="text-muted-foreground text-xs">
        Estimated in the step columns; its fact is the actual days. It takes no budget.
      </p>
    </CardFrame>
  );
}

/** One labelled figure in a card's row of three. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

/** The money basis line: the one card a sum is priced on, or the two a sum mixes. */
function BasisLine({
  row,
  definition,
}: {
  row: MeasurePanelRow;
  definition: MeasureDefinitionView;
}) {
  if (definition.kind !== 'money') return null;
  const mixed = row.mixedRateCards?.[definition.key];
  const bases = row.moneyBases?.[definition.key];
  const lines = [
    mixed?.facts === undefined ? null : `Facts: ${mixedSentence(mixed.facts)}`,
    mixed?.estimates === undefined ? null : `Estimates: ${mixedSentence(mixed.estimates)}`,
    mixed?.facts === undefined && bases?.facts !== undefined
      ? `Facts priced on ${basisWords(bases.facts)}`
      : null,
    mixed?.estimates === undefined && bases?.estimates !== undefined
      ? `Estimates priced on ${basisWords(bases.estimates)}`
      : null,
  ].filter((line) => line !== null);
  if (lines.length === 0) return null;
  return (
    <ul data-measure-bases className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
      {lines.map((line) => (
        <li
          key={line}
          style={line.includes('Mixed') ? { color: 'var(--status-in-progress)' } : undefined}
          className={line.includes('Mixed') ? 'font-medium' : 'text-muted-foreground'}
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

/**
 * A budget drawn by its policy: a strict budget as a bar of spent against its
 * cap with what remains, since a start is refused on it; an advisory or
 * derived one as a marker line, since it only reports. Exceeded is said in
 * words and colour both.
 */
function BudgetView({
  reading,
  definition,
}: {
  reading: BudgetReading;
  definition: MeasureDefinitionView;
}) {
  const show = (value: number) => formatMeasureValue(value, definition);
  switch (reading.kind) {
    case 'none':
      return (
        <p data-budget="none" className="text-quiet-ink text-xs">
          No budget.
        </p>
      );
    case 'blocked':
      return (
        <p
          data-budget="blocked"
          className="text-xs font-medium"
          style={{ color: 'var(--status-in-progress)' }}
        >
          Budget unknown: its {reading.of} mix rate cards ({basisWords(reading.bases[0])} and{' '}
          {basisWords(reading.bases[1])}). Treat it as unknown, not unbounded.
        </p>
      );
    case 'budget': {
      const over = reading.exceeded;
      const refusing = reading.refusing;
      const held = reading.held > 0 ? ` · ${show(reading.held)} held for running attempts` : '';
      // What is left, in the words of why: facts past the cap are "over";
      // holds that take the rest are "nothing left", never "over" (review S2-3).
      const left =
        reading.remaining > 0
          ? `${show(reading.remaining)} left`
          : over
            ? `${show(reading.spent - reading.cap)} over`
            : 'nothing left';
      const why = over
        ? 'Exceeded'
        : reading.held > 0 && reading.remaining < 0
          ? 'Nothing left once running attempts’ holds are counted'
          : 'Spent to the cap';
      // Proof: with this test negated (the renderings swapped), `draws a strict
      // budget as a bar and an advisory one as a marker` (measure-panel.test.tsx)
      // found no meter in the Tokens card; watched 2026-10-23.
      if (reading.policy === 'strict') {
        return (
          <div
            data-budget="strict"
            data-exceeded={over}
            data-refusing={refusing}
            className="flex flex-col gap-1"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="font-medium">
                Strict budget{reading.source === 'derived' ? ' (derived)' : ''}
              </span>
              <span
                style={refusing ? { color: 'var(--status-blocked)' } : undefined}
                className="tabular-nums"
              >
                {show(reading.spent)} of {show(reading.cap)} · {left}
                {held}
              </span>
            </div>
            <div
              role="meter"
              aria-label={`${definition.name} budget spent`}
              aria-valuemin={0}
              aria-valuemax={reading.cap}
              aria-valuenow={Math.max(0, reading.spent)}
              aria-valuetext={`${show(reading.spent)} of ${show(reading.cap)}${over ? ', exceeded' : refusing ? ', nothing left' : ''}`}
              className="bg-muted h-2 overflow-hidden rounded-full"
            >
              <div
                className={`h-full rounded-full ${EASED}`}
                style={{
                  width: `${String(Math.round(reading.fill * 100))}%`,
                  background: refusing ? 'var(--status-blocked)' : 'var(--primary)',
                }}
              />
            </div>
            {/* Proof: with this keyed on `over` again, `warns at the cap and on
                holds, as the coordinator refuses` (measure-panel.test.tsx) found
                no sentence on a budget spent to its cap; watched 2026-10-23. */}
            {refusing && (
              <p
                data-refusing-sentence
                className="text-xs font-semibold"
                style={{ color: 'var(--status-blocked)' }}
              >
                {why} — the next attempt is refused here.
              </p>
            )}
          </div>
        );
      }
      return (
        <p
          data-budget="advisory"
          data-exceeded={over}
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <Badge tone={over ? 'over' : 'warn'}>
            {reading.source === 'derived' ? 'derived · advisory' : 'advisory'}
          </Badge>
          <span
            className="tabular-nums"
            style={over ? { color: 'var(--status-blocked)' } : undefined}
          >
            {show(reading.spent)} of {show(reading.cap)} · {left}
            {held}
            {over ? ' · exceeded (reported only)' : ''}
          </span>
        </p>
      );
    }
  }
}

/** One measure's card: its figures, basis, budget and, opened, its forms. */
function MeasureCard({
  definition,
  row,
  steps,
  writes,
}: {
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
  steps: readonly StepView[];
  writes: MeasureWrites;
}) {
  const [editing, setEditing] = useState(false);
  const figures = measureFiguresOf(row, definition);
  const facets: readonly { facet: MeasureFacet; label: string }[] = definition.threePoint
    ? [
        { facet: 'estimate', label: 'Expected' },
        { facet: 'fact', label: 'Fact' },
        { facet: 'variance', label: 'Variance' },
      ]
    : [{ facet: 'fact', label: 'Fact' }];
  const reading = budgetReadingOf(row, definition.key);
  return (
    <CardFrame
      definition={definition}
      badges={
        <>
          {definition.derived && <Badge tone="quiet">derived</Badge>}
          {reading.kind === 'budget' && reading.exceeded && <Badge tone="over">exceeded</Badge>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 transition-colors motion-reduce:transition-none"
            aria-expanded={editing}
            onClick={() => {
              setEditing((open) => !open);
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {facets.map(({ facet, label }) => (
          <Figure key={facet} label={label}>
            <MeasureFigureText figure={figures[facet]} definition={definition} facet={facet} />
          </Figure>
        ))}
      </dl>
      <TrioLine row={row} definition={definition} />
      <BasisLine row={row} definition={definition} />
      <BudgetView reading={reading} definition={definition} />
      {/* No `aria-controls`: the forms are not mounted while closed, and a
          control pointing at a missing id is worse than none. */}
      {editing && <MeasureForms definition={definition} row={row} steps={steps} writes={writes} />}
    </CardFrame>
  );
}

/** The summed trio behind the expected figure, where the row holds one. */
function TrioLine({
  row,
  definition,
}: {
  row: MeasurePanelRow;
  definition: MeasureDefinitionView;
}) {
  const trios = Object.values(row.measureEstimates?.[definition.key] ?? {});
  if (trios.length === 0 || row.mixedRateCards?.[definition.key]?.estimates !== undefined)
    return null;
  const sum = (point: 'optimistic' | 'realistic' | 'pessimistic') =>
    formatMeasureValue(
      trios.reduce((total, trio) => total + trio[point], 0),
      definition,
    );
  return (
    <p data-measure-trio className="text-muted-foreground text-xs tabular-nums">
      {trios.every((trio) => trio.singlePoint)
        ? `A single legacy figure: ${sum('realistic')}. Type three points to replace it.`
        : `Optimistic ${sum('optimistic')} · realistic ${sum('realistic')} · pessimistic ${sum('pessimistic')}`}
    </p>
  );
}

/** One form's message: a sentence that is a refusal, or what the reader has to type. */
function FormMessage({ message }: { message: string | null }) {
  // Reserved height, so a message arriving does not shove the controls below it.
  return (
    <p role={message === null ? undefined : 'alert'} className="text-destructive min-h-4 text-xs">
      {message}
    </p>
  );
}

/** The basis a money write is priced on, prefilled from the row's one basis. */
function knownDigest(row: MeasurePanelRow, key: string): string {
  const bases: { facts?: MoneyBasisView; estimates?: MoneyBasisView } | undefined =
    row.moneyBases?.[key];
  return bases?.facts?.rateCardDigest ?? bases?.estimates?.rateCardDigest ?? '';
}

/**
 * The forms a measure's card opens: a step's trio and fact, and the work
 * item's budget. A parent takes no trio or fact of its own (`rolled_up`): its
 * figures are its leaves' sums, so only its budget is offered. A derived
 * measure takes no fact, and the scheduling measure never reaches here.
 */
function MeasureForms({
  definition,
  row,
  steps,
  writes,
}: {
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
  steps: readonly StepView[];
  writes: MeasureWrites;
}) {
  const prefix = useId();
  const [stepId, setStepId] = useState(steps.at(0)?.id ?? '');
  const [digest, setDigest] = useState(() => knownDigest(row, definition.key));
  const money = definition.kind === 'money';
  const leafOnly = !row.rolledUp;
  const takesFigures = leafOnly && steps.length > 0;
  return (
    <div className="border-t pt-2">
      {row.rolledUp && (
        <p className="text-muted-foreground mb-2 text-xs">
          This row’s figures are the sums of the rows beneath it; estimate and record on those.
        </p>
      )}
      {takesFigures && (steps.length > 1 || money) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {steps.length > 1 && (
            <label className="flex flex-col gap-1 text-xs">
              Step
              <select
                className={SELECT_CLASS}
                value={stepId}
                onChange={(event) => {
                  setStepId(event.target.value);
                }}
              >
                {steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {money && (
            <label
              htmlFor={`${prefix}-digest`}
              className="flex min-w-0 flex-1 flex-col gap-1 text-xs"
            >
              Rate card digest
              <Input
                id={`${prefix}-digest`}
                value={digest}
                placeholder="sha256:…"
                onChange={(event) => {
                  setDigest(event.target.value);
                }}
              />
            </label>
          )}
        </div>
      )}
      {takesFigures && definition.threePoint && !definition.derived && (
        <TrioForm
          // Keyed on what is stored, so a Clear or a peer's write lands in the
          // boxes instead of leaving the last typed figures there.
          // Proof: keyed on the step alone, `clears through the panel, and the
          // boxes follow what is stored` (measure-panel.test.tsx) read `100`
          // after the clear; watched 2026-10-23.
          key={`trio-${stepId}-${JSON.stringify(row.measureEstimates?.[definition.key]?.[stepId] ?? null)}`}
          prefix={prefix}
          definition={definition}
          row={row}
          stepId={stepId}
          digest={money ? digest : undefined}
          writes={writes}
        />
      )}
      {takesFigures && !definition.derived && (
        <FactForm
          key={`fact-${stepId}-${String(row.measures?.[factKeyOf(definition.key)]?.[stepId] ?? 'none')}`}
          prefix={prefix}
          definition={definition}
          row={row}
          stepId={stepId}
          digest={money ? digest : undefined}
          writes={writes}
        />
      )}
      {definition.derived && (
        <p className="text-muted-foreground mb-2 text-xs">
          {definition.name} are read from ended attempts and are never typed. A budget can still
          bound them.
        </p>
      )}
      <BudgetForm
        key={`budget-${JSON.stringify(row.budgets?.[definition.key] ?? null)}`}
        prefix={prefix}
        definition={definition}
        row={row}
        writes={writes}
      />
    </div>
  );
}

/** A labelled figure box in a measure's unit (currency for money). */
function FigureField({
  id,
  label,
  value,
  onChange,
  definition,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  definition: MeasureDefinitionView;
}) {
  return (
    // `justify-end`: a label that wraps to two lines ("Cost pessimistic" on a
    // phone) grows upward, so the three boxes of a trio stay on one line.
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col justify-end gap-1 text-xs">
      {label}
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={unitLabelOf(definition)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

/** Runs one write, holding the controls while it is out and keeping its sentence. */
function useWrite(): {
  busy: boolean;
  message: string | null;
  setMessage: (message: string | null) => void;
  send: (write: () => Promise<string | null>) => void;
} {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return {
    busy,
    message,
    setMessage,
    send: (write) => {
      setBusy(true);
      setMessage(null);
      void write().then((sentence) => {
        setBusy(false);
        setMessage(sentence);
      });
    },
  };
}

function TrioForm({
  prefix,
  definition,
  row,
  stepId,
  digest,
  writes,
}: {
  prefix: string;
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
  stepId: string;
  digest: string | undefined;
  writes: MeasureWrites;
}) {
  const stored = row.measureEstimates?.[definition.key]?.[stepId];
  const typed = (point: 'optimistic' | 'realistic' | 'pessimistic') =>
    stored === undefined ? '' : typedValueOf(stored[point], definition);
  const [points, setPoints] = useState({
    optimistic: typed('optimistic'),
    realistic: typed('realistic'),
    pessimistic: typed('pessimistic'),
  });
  const { busy, message, setMessage, send } = useWrite();
  return (
    <form
      aria-label={`Estimate of ${definition.name}`}
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const optimistic = storedValueOf(points.optimistic, definition);
        const realistic = storedValueOf(points.realistic, definition);
        const pessimistic = storedValueOf(points.pessimistic, definition);
        if (optimistic === null || realistic === null || pessimistic === null) {
          setMessage(`All three points. ${TYPED_FIGURE_HELP}`);
          return;
        }
        send(() =>
          writes.setEstimate(
            stepId,
            definition.key,
            { optimistic, realistic, pessimistic },
            digest === undefined || digest === '' ? undefined : digest,
          ),
        );
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        {(['optimistic', 'realistic', 'pessimistic'] as const).map((point) => (
          <FigureField
            key={point}
            id={`${prefix}-${point}`}
            label={`${definition.name} ${point}`}
            value={points[point]}
            definition={definition}
            onChange={(value) => {
              setPoints((current) => ({ ...current, [point]: value }));
            }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Save estimate
        </Button>
        {stored !== undefined && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              send(() => writes.clearEstimate(stepId, definition.key));
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <FormMessage message={message} />
    </form>
  );
}

function FactForm({
  prefix,
  definition,
  row,
  stepId,
  digest,
  writes,
}: {
  prefix: string;
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
  stepId: string;
  digest: string | undefined;
  writes: MeasureWrites;
}) {
  const stored = row.measures?.[factKeyOf(definition.key)]?.[stepId];
  const [value, setValue] = useState(stored === undefined ? '' : typedValueOf(stored, definition));
  const { busy, message, setMessage, send } = useWrite();
  return (
    <form
      aria-label={`Fact of ${definition.name}`}
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const figure = storedValueOf(value, definition);
        if (figure === null) {
          setMessage(TYPED_FIGURE_HELP);
          return;
        }
        send(() =>
          writes.setFact(
            stepId,
            definition.key,
            figure,
            digest === undefined || digest === '' ? undefined : digest,
          ),
        );
      }}
    >
      <div className="flex items-end gap-2">
        <FigureField
          id={`${prefix}-fact`}
          label={`${definition.name} fact`}
          value={value}
          definition={definition}
          onChange={setValue}
        />
        <Button type="submit" size="sm" disabled={busy}>
          Save fact
        </Button>
        {stored !== undefined && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              send(() => writes.clearFact(stepId, definition.key));
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <FormMessage message={message} />
    </form>
  );
}

function BudgetForm({
  prefix,
  definition,
  row,
  writes,
}: {
  prefix: string;
  definition: MeasureDefinitionView;
  row: MeasurePanelRow;
  writes: MeasureWrites;
}) {
  const stated = row.budgets?.[definition.key];
  const isStated = stated?.source === 'stated';
  const [cap, setCap] = useState(isStated ? typedValueOf(stated.cap, definition) : '');
  const [policy, setPolicy] = useState<'strict' | 'advisory'>(stated?.policy ?? 'strict');
  // Prefilled from the stated hold (design D60): `setBudget` restates the
  // whole budget, so a hold the box did not show would be dropped on Save.
  // Proof: with this prefill empty again, `keeps a stated hold when a budget is
  // saved` (measure-panel.test.tsx) found an empty hold box, which Save sends
  // as `holdPerAttempt: null`; watched 2026-10-23.
  const [hold, setHold] = useState(
    isStated && stated.holdPerAttempt !== undefined
      ? typedValueOf(stated.holdPerAttempt, definition)
      : '',
  );
  const { busy, message, setMessage, send } = useWrite();
  return (
    <form
      aria-label={`Budget of ${definition.name}`}
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const figure = storedValueOf(cap, definition);
        if (figure === null) {
          setMessage(`The cap. ${TYPED_FIGURE_HELP}`);
          return;
        }
        // Empty is the reader's explicit "no hold" (the box shows any stated one).
        const holdFigure = hold.trim() === '' ? 'none' : storedValueOf(hold, definition);
        if (holdFigure === null) {
          setMessage(`The hold per attempt, or leave it empty. ${TYPED_FIGURE_HELP}`);
          return;
        }
        send(() =>
          writes.setBudget(definition.key, {
            cap: figure,
            policy,
            holdPerAttempt: holdFigure === 'none' ? null : holdFigure,
          }),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <FigureField
          id={`${prefix}-cap`}
          label={`${definition.name} budget cap`}
          value={cap}
          definition={definition}
          onChange={setCap}
        />
        <label className="flex flex-col gap-1 text-xs">
          Policy
          <select
            className={SELECT_CLASS}
            value={policy}
            onChange={(event) => {
              setPolicy(event.target.value === 'advisory' ? 'advisory' : 'strict');
            }}
          >
            <option value="strict">Strict</option>
            <option value="advisory">Advisory</option>
          </select>
        </label>
        <FigureField
          id={`${prefix}-hold`}
          label="Hold per attempt"
          value={hold}
          definition={definition}
          onChange={setHold}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Save budget
        </Button>
        {isStated && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              send(() => writes.clearBudget(definition.key));
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <FormMessage message={message} />
    </form>
  );
}
