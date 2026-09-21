import type { ReactNode } from 'react';

import { FaultBoundary } from '@/components/chrome/fault-boundary';

import { GanttDataError } from './gantt-geometry';

/**
 * The one kind of failure this panel discloses its own words for.
 *
 * {@link GanttDataError}'s messages are sentences this module's own source writes over
 * identifiers the payload already carried — `slice x is under step y, which this plan does
 * not list` — so they disclose nothing the reader did not send. Everything else reaching
 * this boundary is unmodelled, and gets the public report's generic message instead.
 *
 * **It reads a property descriptor and never the property.** `thrown.message` would run an
 * own accessor on a value this function was handed precisely because it could not be
 * trusted, and would return whatever that accessor returned — an object reaching
 * `DisclosedFault.sentence`, which promises a string. So the own descriptor is inspected
 * instead and only a string-valued **data** property is accepted: an accessor, an absent
 * property and a non-string value are all the same modelled outcome, `null`, and the
 * generic public message is what the panel discloses.
 *
 * @param thrown The caught value.
 * @returns The panel's own sentence, or `null` for an accessor, an absent `message`, a
 *   non-string `message`, or any value that is not a {@link GanttDataError}.
 */
// Proof: deleting the 'discloses' prop made 'costs a chart rather than a page when the chart is
// what threw' receive 'Something went wrong' instead of the modelled sentence (N5, 2026-09-21).
// Proof: widening the kind check to 'Error' disclosed 'alice@example.com' and failed
// 'discloses the chart’s own modelled sentence and no other error’s' (N6, 2026-09-21).
// Proof: reading 'thrown.message' invoked the hostile accessor once and failed
// 'never invokes an accessor to read the chart’s sentence' (N8, 2026-09-21).
// Proof: accepting a non-string descriptor value produced two boundary log tuples and failed
// 'never discloses a chart message that is not a string' (N9, 2026-09-21).
function ganttWords(thrown: unknown): string | null {
  if (!(thrown instanceof GanttDataError)) return null;
  const own = Object.getOwnPropertyDescriptor(thrown, 'message');
  if (own === undefined || !('value' in own) || typeof own.value !== 'string') return null;
  return own.value;
}

interface GanttFaultProps {
  /**
   * Which tree read the children are drawing.
   *
   * The reset key, and it must be the identity of the **read** rather than of
   * the panel: `layOutGantt` throws on a payload whose slices name something
   * the payload has not got, and the commonest way to get one is a peer's edit
   * landing between two of this client's reads. That skew is transient by
   * construction — the next whole read has neither half of it — so a boundary
   * that latched would turn a moment into a panel nobody can reopen without
   * reloading the page.
   */
  generation: number;
  children: ReactNode;
}

/**
 * The error boundary the Gantt panel's throws are thrown into, and nothing
 * else's.
 *
 * **It wraps the panel alone, deliberately.** The chart is the explicitly
 * optional feature AGENTS.md's degradation clause is about: the plan above it
 * is the editor, it is what the reader came for, and a chart that cannot be
 * drawn must cost them a chart rather than a page. A boundary any higher would
 * take the table down with the drawing.
 *
 * **The fallback says why.** {@link GanttDataError}'s messages are sentences
 * naming the slice and what it promised — `slice x is under step y, which this
 * plan does not list` — and they are the only description anybody has of a skew
 * that is over by the time it is read about. Printing "something went wrong"
 * over them would throw away the one artefact of the fault.
 *
 * **And it resets itself.** React never retries a boundary on its own: once
 * caught, the fallback stands until the boundary's state is cleared or it is
 * remounted. `generation` is the {@link FaultBoundary.resetKey}, and it moves on
 * every landed tree read, so the next refetch clears the fault and the panel
 * redraws.
 *
 * The machinery is {@link FaultBoundary}, shared with the root boundary since
 * 2026-09-02; what is here is this boundary's own scope and its own sentence.
 */
export function GanttFaultBoundary({ generation, children }: GanttFaultProps): ReactNode {
  return (
    <FaultBoundary
      logAs="the Gantt panel could not draw this plan"
      discloses={ganttWords}
      resetKey={generation}
      fallback={(fault) => (
        <section data-gantt-fault aria-label="Gantt chart" className="border-border border-t p-3">
          <p role="status" className="text-sm">
            The chart cannot be drawn: {fault.sentence}. The plan itself is unaffected, and the next
            read of it draws the chart again.
          </p>
          {/*
           * The same handle the root's fallback shows, for the same reason: a reader who
           * reports a chart that will not draw has one thing to quote, and it is the
           * identifier the console line beside it carries.
           */}
          {/* Proof: deleting this element made the chart reference undefined instead of its
          logged AE handle in 'shows the chart’s own reference, matching what it logged'
          (N7, 2026-09-21). */}
          <p className="text-muted-foreground font-mono text-xs" data-gantt-fault-reference>
            Reference {fault.occurrenceId}
          </p>
        </section>
      )}
    >
      {children}
    </FaultBoundary>
  );
}
