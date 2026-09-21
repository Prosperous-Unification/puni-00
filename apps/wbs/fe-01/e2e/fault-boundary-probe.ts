import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

/**
 * What one run of the app's root fault boundary in a real browser put on the page.
 *
 * The console is not in here: Playwright listens to it from outside the page, which is the
 * only reading that includes React's own lines as well as the boundary's.
 */
export interface FaultBoundaryProof {
  /** Everything the boundary rendered, as text. */
  readonly pageText: string;
  /** Everything the boundary rendered, as markup: attributes as well as text. */
  readonly markup: string;
  /** The occurrence identifier the page disclosed, or null if it disclosed none. */
  readonly reference: string | null;
}

/**
 * The fault this probe throws.
 *
 * Its three literal strings are what `fault-boundary.spec.ts` searches the document and the
 * console for: a personal identifier in the message, a credential on the cause and an
 * internal locator beside it. String literals, because the shipped config builds this probe
 * minified and an identifier would not survive that — a marker that cannot appear is a
 * search that cannot fail.
 */
function throwInsideAComponent(): never {
  throw new Error('saving plan p-7 for alice@example.com failed', {
    cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
  });
}

/** A component that throws the moment it renders, the way an impossible union does. */
function Throwing(): never {
  return throwInsideAComponent();
}

/**
 * Render the shipped root boundary over a throwing child and read what the document says.
 *
 * Deliberately the production component **and** the production root options from `src/`,
 * through the deployed Vite config, and not a copy: a probe over its own boundary would keep passing while the app's grew a raw
 * message. `flushSync` is not used — `createRoot().render` is asynchronous, so the caller
 * waits for the fallback rather than for a frame count.
 *
 * @returns What the page carried once the fallback had rendered.
 */
async function proveTheBoundaryDisclosesNothingRaw(): Promise<FaultBoundaryProof> {
  const host = document.createElement('div');
  document.body.append(host);
  // `createElement` and not JSX, so that this probe stays a `.ts` file: the e2e tsconfig
  // and Playwright's `testMatch` both name `.ts`, and one `.tsx` here would need both
  // widened for two calls.
  createRoot(host, ROOT_FAULT_OPTIONS).render(
    createElement(AppFaultBoundary, null, createElement(Throwing)),
  );
  const deadline = Date.now() + 10_000;
  while (host.querySelector('[data-app-fault]') === null) {
    if (Date.now() > deadline) throw new Error('the root fault boundary never rendered');
    await new Promise((settle) => setTimeout(settle, 10));
  }
  const reference = host.querySelector('[data-app-fault-reference]')?.textContent ?? null;
  return {
    pageText: host.textContent,
    markup: host.innerHTML,
    reference: reference === null ? null : reference.replace('Reference ', ''),
  };
}

// The cast names the one boundary this file has: a bundled module and the page that loads it
// share nothing but this global, and `globalThis` is typed without it.
(globalThis as unknown as { faultBoundaryProof: Promise<FaultBoundaryProof> }).faultBoundaryProof =
  proveTheBoundaryDisclosesNothingRaw();
