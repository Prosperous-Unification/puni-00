import type { KeyboardEvent } from 'react';

import type { AttemptOutcomeView } from '@/lib/wbs-api';

import { attemptEntryText } from './attempt-words';
import { STATUS_TOKEN } from './status-palette';
import type { StepNodeReadings } from './step-reading';

/**
 * What a reader can do to one step node's attempts from its card: each sent
 * through the command batch as one journalled act, so the plan's Undo takes it
 * back verbatim (`step-node-attempts` D2).
 */
export interface AttemptActions {
  /** Starts the next attempt now. */
  start: () => void;
  /** Asks how the running attempt ended: the outcome and a reference. */
  end: () => void;
  /** Removes one attempt by its number, as a correction. */
  remove: (attemptNumber: number) => void;
}

/**
 * The colour an attempt's line is said in: a success in done's hue, a failure
 * in the destructive one, a running attempt in progress's, a cancelled one
 * muted — what came of it, before the words are read.
 */
const OUTCOME_TOKEN: Readonly<Record<AttemptOutcomeView | 'running', string>> = {
  succeeded: STATUS_TOKEN.done ?? 'inherit',
  failed: 'var(--destructive)',
  cancelled: 'var(--muted-foreground)',
  running: STATUS_TOKEN.in_progress ?? 'inherit',
};

export interface AttemptsSectionProps {
  node: StepNodeReadings;
  /** The node as a reader names it: its canonical reference, or `Dev for 010`. */
  label: string;
  /** `null` lists the attempts and offers nothing, as a read-only surface does. */
  actions: AttemptActions | null;
  /**
   * The keys a hover card's actions answer to — Tab walks them and Escape
   * returns to the cell — so these buttons are walked with the copy actions.
   */
  onActionKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** 44px tall buttons, for the phone card a finger taps (`plan-cards.tsx`'s `TAP`). */
  tapSized?: boolean;
}

/**
 * One step node's attempts, newest first, with `Start attempt` or — while one
 * runs — `End attempt`, and a remove on each line (`step-node-attempts` D7).
 *
 * Inline styles and plain buttons, never utility classes: the step card stands
 * inside `[data-grid]`, where the scoped reset stops and a utility class would
 * reach a cell (see {@link Button}). The phone card's step details draw the
 * same section for the same reason a phone has no hover to open the card.
 *
 * **Nothing at all without the project's zone.** A be-01 whose tree read
 * predates `timezone` sends attempts it cannot say the days of; printing them
 * in the browser's zone would be the two-readers-two-days fault D3 exists to
 * stop, so the list and its actions are left out and the summary lines above
 * still say how many attempts there were.
 */
export function AttemptsSection({
  node,
  label,
  actions,
  onActionKeyDown,
  tapSized = false,
}: AttemptsSectionProps) {
  const zone = node.timezone;
  const tap = tapSized ? { minHeight: 44, padding: '0 12px' } : {};
  // Proof: the zone defaulted to `UTC` and this guard removed, `leaves the
  // list and its actions out without the project zone` failed on `expected
  // <ol …(2)>…(2)</ol> to be null`; watched 2026-10-12.
  if (zone === null) return null;
  const newestFirst = [...node.attempts].reverse();
  const running = node.attempts.at(-1)?.outcome === null ? node.attempts.at(-1) : undefined;
  return (
    <div data-attempts={label} style={{ marginTop: 4 }}>
      {newestFirst.length > 0 && (
        <ol
          aria-label={`Attempts at ${label}`}
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {newestFirst.map((attempt) => {
            const outcome = attempt.outcome ?? 'running';
            return (
              <li
                key={attempt.attemptNumber}
                data-attempt-entry={attempt.attemptNumber}
                data-attempt-outcome={outcome}
                style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: OUTCOME_TOKEN[outcome], fontWeight: 600, flex: 'none' }}
                >
                  ●
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  {attemptEntryText(
                    attempt,
                    zone,
                    node.executorNames.get(attempt.attemptNumber) ?? null,
                  )}
                </span>
                {actions !== null && (
                  <button
                    type="button"
                    data-card-action
                    aria-label={`Remove attempt ${String(attempt.attemptNumber)} of ${label}`}
                    onKeyDown={onActionKeyDown}
                    onClick={() => {
                      actions.remove(attempt.attemptNumber);
                    }}
                    style={{ flex: 'none', ...tap }}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {actions !== null && (
        <div style={{ marginTop: 4 }}>
          {running !== undefined ? (
            // Proof: offered with none running — the condition read
            // `node.attempts.length > 0` — `offers Start attempt when none
            // runs, and sends it` failed on `expected <button …> to be null`
            // for the ended node's End button; watched 2026-10-12.
            <button
              type="button"
              data-card-action
              onKeyDown={onActionKeyDown}
              onClick={actions.end}
              style={tap}
            >
              End attempt {String(running.attemptNumber)}…
            </button>
          ) : node.reading === 'done' ? (
            // A done node refuses a start (`node_done`); saying so here is
            // cheaper than a refusal in the corner of the screen.
            <span style={{ color: 'var(--muted-foreground)' }}>
              Done — reopen the step to start another attempt.
            </span>
          ) : (
            <button
              type="button"
              data-card-action
              onKeyDown={onActionKeyDown}
              onClick={actions.start}
              style={tap}
            >
              Start attempt
            </button>
          )}
        </div>
      )}
    </div>
  );
}
