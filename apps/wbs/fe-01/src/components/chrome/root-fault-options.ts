import type { RootOptions } from 'react-dom/client';

import { discloseFault } from './fault-disclosure';

/**
 * What React itself does with a fault, and the second half of the disclosure rule.
 *
 * **React logs the caught error whatever a boundary does, in a production build.** Left at
 * its default, `react-dom` writes `Error: <the thrown message>` and a stack to
 * `console.error` for every error a boundary catches — observed in Chromium on the shipped
 * Vite build, 2026-09-20, as `Error: saving plan p-7 for alice@example.com failed\n    at
 * De (<anonymous>:13:20104)…`. So a boundary that discloses only a public report still
 * leaves the raw message in the console beside it, and the browser console is a disclosure
 * boundary exactly as the page is.
 *
 * Every root in this application is created with these options for that reason.
 *
 * - `onCaughtError` is deliberately silent. A caught fault has already been reported by
 *   {@link import('./fault-boundary').FaultBoundary}, which names *which* boundary caught
 *   it; a second line here would be the same event twice, with less in it.
 * - `onUncaughtError` and `onRecoverableError` are the faults no boundary reported, so they
 *   say so here — as the public report's generic sentence, its occurrence id and what was
 *   lost deciding them, and never as the caught value. The four-argument shape is the same
 *   as {@link import('./fault-boundary').FaultBoundary}'s, so a caught value appended to
 *   either is a failed assertion rather than a longer line nobody reads.
 *
 * **They read a caught value the way the boundaries do, which is not at all.** react-dom's
 * default handlers inspect the thrown value to print it; {@link discloseFault} never does, so
 * neither does anything here, and a value that cannot be inspected costs a disclosure rather
 * than a render. What these options do **not** do is rescue a value React itself cannot get
 * past: a revoked `Proxy` thrown *as* the value fails inside react-dom's own `handleThrow`
 * while the render is still unwinding, above any handler and above any boundary (verified
 * fact 10, watched under jsdom 2026-09-20). Nothing in this module claims to catch that. The
 * hostile values these handlers really do meet are an `Error` with a throwing own accessor and
 * one whose *cause* the reporter cannot describe.
 */
export const ROOT_FAULT_OPTIONS: RootOptions = {
  onCaughtError: () => undefined,
  onUncaughtError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    // Proof: replacing the disclosed sentence with `String(thrown)` exposed
    // `Error: alice@example.com` in the uncaught-fault tuple (N13, 2026-09-21).
    console.error('no boundary caught this', fault.sentence, fault.occurrenceId, fault.lost);
  },
  onRecoverableError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    // Proof: appending `thrown` made the recoverable tuple five arguments instead of four
    // (N14, 2026-09-21).
    // Proof: dropping `occurrenceId` made the recoverable tuple three arguments and omitted
    // the AE handle (N15, 2026-09-21).
    console.error('React recovered from this', fault.sentence, fault.occurrenceId, fault.lost);
  },
};
