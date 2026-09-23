import { createRoot } from 'react-dom/client';

import { bootstrapApplication } from '@/runtime/application-bootstrap';
import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';

/**
 * What the spec reads back after driving the page through a real
 * navigate-away-and-back cycle.
 *
 * Left on `window` rather than returned from a promise: a real back/forward-cache
 * restoration resumes this exact JS context (the whole point of the probe), so
 * the spec reads this global again after `page.goBack()` rather than awaiting
 * anything that a fresh navigation would have discarded.
 */
export interface LifetimeBfcacheProbe {
  /** How many times `acquireApplicationRuntime` actually ran. */
  readonly builds: () => number;
  /** Every `pageshow.persisted` this page's own listener observed, in order. */
  readonly pageshowPersisted: () => boolean[];
  /**
   * Whether a write-then-read round trip through `remembered.ganttDetail`
   * succeeded, once per time the slot reached `live` — so once for the first
   * build, and again after a persisted restore rebuilds it.
   */
  readonly usableAtLive: () => boolean[];
}

const builds: { count: number } = { count: 0 };
const pageshowPersisted: boolean[] = [];
const usableAtLive: boolean[] = [];

// Not the bootstrap's own listener — a second one, registered directly on this
// probe's own page, purely as independent evidence that a real `pageshow` (not
// a synthetic jsdom one) actually carried `persisted: true`. The bootstrap's
// own listener is the one this probe is proving, so this file does not read
// its outcome through it.
window.addEventListener('pageshow', (event: PageTransitionEvent) => {
  pageshowPersisted.push(event.persisted);
});

// Reads `applicationSlot` directly rather than only counting acquisitions:
// `acquireApplicationRuntime`'s own `isLive` is wired to this exact singleton
// (`application-runtime.ts`'s own `acquireApplicationRuntime`), so a service
// this subscription cannot read as live is a service every one of its own
// members already refuses. Recording this at the instant the slot reaches
// `live` — not inside `acquire()`, which runs *before* the slot publishes —
// is what makes the check meaningful: a write attempted mid-construction
// would always find the slot not yet live and prove nothing.
applicationSlot.subscribe(() => {
  const state = applicationSlot.snapshot();
  if (state.status !== 'live') return;
  try {
    state.services.remembered.ganttDetail.write(true);
    usableAtLive.push(state.services.remembered.ganttDetail.read() === true);
  } catch {
    usableAtLive.push(false);
  }
});

const Probe = (): null => null;

const host = document.createElement('div');
document.body.append(host);

// `applicationSlot`, the real production singleton — not a fresh slot. A
// fresh slot paired with `acquireApplicationRuntime` publishes services whose
// own `isLive` still reads the singleton, which this probe never touches: a
// mismatch reproduced directly (restored below in `usableAtLive`'s own
// comment) as `applicationSlot.snapshot().status === 'empty'` while the
// probe's own slot read `live`, so every access threw "the page withdrew this
// preference store before the access completed". This page owns nothing else
// that could read `applicationSlot`, so using the real one here is exactly as
// isolated as a fresh one would have been, and it is the one the real
// `isLive` check actually reads.
void bootstrapApplication(host, {
  acquire: () => {
    builds.count += 1;
    return acquireApplicationRuntime();
  },
  slot: applicationSlot,
  mount: (element, options) => createRoot(element, options),
  app: Probe,
  eventTarget: window,
});

(globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }).lifetimeBfcacheProbe = {
  builds: () => builds.count,
  pageshowPersisted: () => pageshowPersisted,
  usableAtLive: () => usableAtLive,
};
