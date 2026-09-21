import { Component, type ReactNode } from 'react';

import { type DisclosedFault, discloseFault } from './fault-disclosure';

export interface FaultBoundaryProps {
  /**
   * What a caught fault renders instead of the children, given only what the fault
   * discloses.
   *
   * The whole of what differs between the two boundaries, and the reason the
   * fallback is a prop rather than a `message` this class knows how to print:
   * one of them offers a reload of the document and the other says the plan
   * above it is unaffected, and neither sentence is true of the other's scope.
   *
   * It receives a {@link DisclosedFault} and never the caught value: a fallback
   * that could reach the thrown error could put its message on screen, which is
   * the disclosure this boundary exists to prevent.
   */
  fallback: (fault: DisclosedFault) => ReactNode;
  /**
   * A disclosure selector for the one kind of failure this boundary's own words are
   * already public for, or omitted where the boundary discloses nothing of its own.
   *
   * See {@link discloseFault}: it returns the sentence to show, or `null` to fall back to
   * the public report's generic message.
   */
  discloses?: (thrown: unknown) => string | null;
  /**
   * What the console line calls the thing that could not render.
   *
   * Logged beside the fault's occurrence id and disclosed sentence, and nothing
   * else: the console is a disclosure boundary like the DOM, so neither the
   * caught value nor the component stack goes into it. This is the trace of
   * **where** it was thrown, which is the one thing the sentence on screen
   * leaves out.
   */
  logAs: string;
  /**
   * The identity of the state the children were drawn from; a fault clears when
   * it moves, and only then.
   *
   * React never retries a boundary on its own, so a boundary with nothing to
   * reset against latches until it is remounted. The Gantt panel passes the
   * **tree read's** generation, because the fault it catches is a payload skew
   * that is over by the next whole read; the root passes a constant, because
   * whatever state the tree held is gone with the tree and no later prop can
   * prove the fault is over.
   *
   * Cleared through here rather than by a `key` on the element: a `key` would
   * remount the children on every change and take the chart's scroll position
   * with it.
   */
  resetKey: number | string;
  children: ReactNode;
}

interface FaultBoundaryState {
  /** What the caught fault discloses, or null while nothing has been caught. */
  fault: DisclosedFault | null;
  /** The {@link FaultBoundaryProps.resetKey} this state was decided against. */
  resetKey: number | string;
}

/**
 * The machinery both of this app's error boundaries are, with everything that
 * differs between them passed in.
 *
 * A class because React has no hook for this: `getDerivedStateFromError` is a
 * class-only lifecycle. It was written out twice — two constructors, two
 * `getDerivedStateFromError`, two `componentDidCatch`, two `render` guards —
 * and the second one grew the reset the first one still has no use for.
 *
 * Where each boundary stands and why is on {@link AppFaultBoundary} and
 * {@link GanttFaultBoundary}; that argument is about scope, not about this.
 */
export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  constructor(props: FaultBoundaryProps) {
    super(props);
    this.state = { fault: null, resetKey: props.resetKey };
  }

  /**
   * Turn the caught value into a disclosure before anything can render it.
   *
   * The reporting happens here rather than in `componentDidCatch` so that the very first
   * commit after the throw already has the public sentence and the occurrence id: a
   * fallback rendered from a half-filled state would put the generic message on screen
   * without the handle a reader is meant to quote.
   *
   * It is a static lifecycle and has no access to props, so the selector cannot be read
   * here; `componentDidCatch` applies it and replaces the state. Repeating the call is
   * cheap and correlates: `reportFailure` returns the **same** occurrence id for a second
   * report of the same `Error` object (measured 2026-09-20), so the sentence this renders
   * and the one `componentDidCatch` logs carry one handle.
   */
  static getDerivedStateFromError(thrown: unknown): Pick<FaultBoundaryState, 'fault'> {
    return { fault: discloseFault(thrown) };
  }

  /**
   * Clears a fault when the children's state has moved on, and only then.
   *
   * Runs before every render, including the one that follows
   * `getDerivedStateFromError` — where the key has not moved, so the fault
   * stands and the fallback is what renders.
   */
  static getDerivedStateFromProps(
    props: FaultBoundaryProps,
    state: FaultBoundaryState,
  ): FaultBoundaryState | null {
    if (props.resetKey === state.resetKey) return null;
    return { fault: null, resetKey: props.resetKey };
  }

  /**
   * Apply this boundary's own disclosure selector and say, once, that a fault was caught.
   *
   * The console line carries the disclosed sentence, the handle and what was lost deciding
   * them, and nothing else — a fixed four-argument shape, so a caught value appended to it
   * is a failed assertion rather than a longer line nobody reads. Not a log-and-continue:
   * the render is already refused and the reader is already told; this is the copy an
   * operator can be read back over a telephone.
   *
   * React's `ErrorInfo` second argument is deliberately not taken. Its `componentStack` is
   * a stack, the console is a disclosure boundary, and the adoption plan's third reporting
   * requirement puts browser consoles on the same footing as agent transcripts.
   */
  override componentDidCatch(thrown: unknown): void {
    const fault = discloseFault(thrown, this.props.discloses);
    this.setState({ fault });
    // Proof: appending 'thrown' made the fixed tuple five arguments and failed
    // 'logs the boundary, the disclosed sentence and the reference, and nothing else'
    // (N3, 2026-09-21).
    console.error(this.props.logAs, fault.sentence, fault.occurrenceId, fault.lost);
  }

  override render(): ReactNode {
    const { fault } = this.state;
    return fault === null ? this.props.children : this.props.fallback(fault);
  }
}
