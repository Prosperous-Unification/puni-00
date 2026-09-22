import type { ReactNode } from 'react';

import type { DisclosedFault } from './fault-disclosure';

/**
 * What a reader sees when the page's own runtime could not be built or retired.
 *
 * **One page for both, so its words have to be true of both.** It is shown when a
 * runtime could not be acquired at startup, and when a retirement rejected or outran
 * its wait — which happens to a page a reader has been working in, with their own
 * text on the screen it replaces. So it claims neither that the page never started nor that nothing was
 * lost, and it borrows the root boundary's narrower assurance instead: what reached
 * the server is on the server.
 *
 * The lifecycle twin of {@link import('./app-fault').AppFaultBoundary}'s
 * fallback, and **not** that fallback reused: a cleanup or construction failure is
 * not a caught render fault, so no boundary is above it and no `resetKey` can clear
 * it — this page stands until the document is replaced. The disclosure is identical, which is
 * the part that has to be: the sentence is whatever
 * {@link import('./fault-disclosure').discloseFault} selected, the line under it
 * is the occurrence handle both reports share, and the caught value reaches
 * neither.
 *
 * It takes a {@link DisclosedFault} and never the thrown value, for
 * `FaultBoundaryProps.fallback`'s reason: a component that could reach the
 * refusal could put it on screen.
 */
export function LifetimeFault({ fault }: { fault: DisclosedFault }): ReactNode {
  return (
    <main
      data-lifetime-fault
      className="bg-background text-foreground min-h-full p-8 font-sans"
      // `alert`, as the root fallback is: there is no page for a screen reader to
      // come back to, so waiting for a quiet moment would describe nothing.
      role="alert"
    >
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">WBS tool v2</h1>
      <p className="mb-4 text-sm">
        The page&rsquo;s services stopped: {fault.sentence}. Nothing here can put it back — reload
        to start again. Anything already saved is on the server.
      </p>
      <p className="text-muted-foreground mb-4 font-mono text-xs" data-lifetime-fault-reference>
        Reference {fault.occurrenceId}
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
