import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * What the fallback says when the thing thrown was not an `Error` at all.
 *
 * Reachable: `throw 'nope'` is legal JavaScript and a dependency can do it.
 * The sentence names the absence rather than printing `undefined` beside a
 * colon.
 *
 * Deliberately not shared with `gantt-fault.tsx`'s copy: the two boundaries say
 * different things about different scopes, and one exported helper between them
 * would be a shared vocabulary that neither is free to change.
 */
const NO_MESSAGE = 'the reason it gave was not an error message';

/** Whatever was thrown, as a sentence to put after "stopped:". */
function faultWords(thrown: unknown): string {
  if (!(thrown instanceof Error)) return NO_MESSAGE;
  return thrown.message === '' ? NO_MESSAGE : thrown.message;
}

interface AppFaultState {
  /** The caught error's own words, or null while nothing has been caught. */
  message: string | null;
}

/**
 * The last boundary in the document: what the app throws when nothing nearer
 * caught it.
 *
 * **It exists because the alternative is an empty page.** A throw anywhere in
 * the editor unmounted the whole tree and left `innerHTML` empty — React's
 * "Consider adding an error boundary" in the console and nothing at all on
 * screen, observed live 2026-08-09. AGENTS.md's R5 is explicit that an
 * impossible union state throws into an Error Boundary; without one at the root
 * the throw goes into a blank document instead, and the reader is not even told
 * that something broke.
 *
 * **It is the outermost one, and not the only one.** React runs the *nearest*
 * boundary above the throw, so
 * {@link import('../wbs/gantt-fault').GanttFaultBoundary} still catches the
 * chart's own faults and costs the reader a chart rather than a page. That is
 * the right split and this boundary does not widen it: the chart is the
 * explicitly optional feature, the editor is not, and a fault the editor throws
 * has no smaller thing to degrade to.
 *
 * **It cannot heal itself, and says so rather than pretending.** The chart's
 * boundary clears on the next whole read, because a chart is drawn from a read
 * and there is always another one coming. The root has no such moment: whatever
 * state the tree held is gone with the tree, no later prop can prove the fault
 * is over, and React never retries a boundary on its own. So the fallback
 * offers the only thing that actually works — a fresh document — and the button
 * says it in one word instead of leaving the reader to guess that reloading is
 * allowed.
 *
 * A class because React has no hook for this: `getDerivedStateFromError` is a
 * class-only lifecycle.
 */
export class AppFaultBoundary extends Component<{ children: ReactNode }, AppFaultState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(thrown: unknown): AppFaultState {
    return { message: faultWords(thrown) };
  }

  /**
   * Says so in the console, once, with React's own component stack.
   *
   * Not a log-and-continue: the render is already refused and the reader is
   * already told. This is the trace of *where* it was thrown, which is the one
   * thing the sentence on screen leaves out.
   */
  override componentDidCatch(thrown: unknown, info: ErrorInfo): void {
    console.error('the app could not render', thrown, info.componentStack);
  }

  override render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;
    return (
      <main
        data-app-fault
        className="bg-background text-foreground min-h-full p-8 font-sans"
        // `alert`, not `status`: the page the reader was working on has just
        // gone, and a screen reader that waited for a quiet moment to mention
        // it would be describing a document that is no longer there.
        role="alert"
      >
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">WBS tool v2</h1>
        <p className="mb-4 text-sm">
          The app stopped: {message}. Nothing on this page can put it back — reload it to start
          again. Anything already saved is on the server.
        </p>
        <button
          type="button"
          className="border-border bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center rounded-md border px-3 text-sm"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </button>
      </main>
    );
  }
}
