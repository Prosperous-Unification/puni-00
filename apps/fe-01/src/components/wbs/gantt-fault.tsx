import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * What the fallback says when the thing thrown was not an `Error` at all.
 *
 * Reachable: `throw 'nope'` is legal JavaScript and a dependency can do it.
 * The sentence names the absence rather than printing `undefined` beside a
 * colon, which is the shape of silence this whole file exists to stop.
 */
const NO_MESSAGE = 'the reason it gave was not an error message';

/** Whatever was thrown, as a sentence to put after "cannot be drawn:". */
function faultWords(thrown: unknown): string {
  if (!(thrown instanceof Error)) return NO_MESSAGE;
  return thrown.message === '' ? NO_MESSAGE : thrown.message;
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

interface GanttFaultState {
  /** The caught error's own words, or null while nothing has been caught. */
  message: string | null;
  /** The {@link GanttFaultProps.generation} this state was decided against. */
  generation: number;
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
 * remounted. `generation` moves on every landed tree read, so the next refetch
 * clears the fault and the panel redraws — cleared through
 * `getDerivedStateFromProps` rather than by a `key` on the element, because a
 * `key` would remount the panel on **every** refresh and take the chart's
 * scroll position with it.
 *
 * A class because React has no hook for this: `getDerivedStateFromError` is a
 * class-only lifecycle.
 */
export class GanttFaultBoundary extends Component<GanttFaultProps, GanttFaultState> {
  constructor(props: GanttFaultProps) {
    super(props);
    this.state = { message: null, generation: props.generation };
  }

  static getDerivedStateFromError(thrown: unknown): Pick<GanttFaultState, 'message'> {
    return { message: faultWords(thrown) };
  }

  /**
   * Clears a fault when a later read arrives, and only then.
   *
   * Runs before every render, including the one that follows
   * `getDerivedStateFromError` — where the generation has not moved, so the
   * fault stands and the fallback is what renders.
   */
  static getDerivedStateFromProps(
    props: GanttFaultProps,
    state: GanttFaultState,
  ): GanttFaultState | null {
    if (props.generation === state.generation) return null;
    return { message: null, generation: props.generation };
  }

  /**
   * Says so in the console, once, with React's own component stack.
   *
   * Not a log-and-continue: the render is already refused and the reader is
   * already told. This is the trace of *which* mark's data was wrong, which is
   * the only thing the sentence on screen leaves out.
   */
  override componentDidCatch(thrown: unknown, info: ErrorInfo): void {
    console.error('the Gantt panel could not draw this plan', thrown, info.componentStack);
  }

  override render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;
    return (
      <section data-gantt-fault aria-label="Gantt chart" className="border-border border-t p-3">
        <p role="status" className="text-sm">
          The chart cannot be drawn: {message}. The plan itself is unaffected, and the next read of
          it draws the chart again.
        </p>
      </section>
    );
  }
}
