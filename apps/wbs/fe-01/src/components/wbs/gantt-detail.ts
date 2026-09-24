import { useEffect, useRef, useState } from 'react';

import type { RememberedPreferences } from '@/modules/preferences/contract';
import {
  useApplicationServicesReader,
  useApplicationServicesState,
} from '@/runtime/application-services-context';

/**
 * The chart's **detail** switch, whole: the key it remembers, the reading of
 * that key, the state the panel holds, and the write a click makes.
 *
 * These four were 3,500 lines apart in `gantt-panel.tsx` — the constant and the
 * storage at the top, the state at the middle, the mark gates and the control
 * near the bottom — which is what W4-6 is about. What stays in the panel is
 * what the panel **draws**: the three `detailShown &&` gates over the marks,
 * and the switch's own label and classes.
 *
 * One answer for **two** families of mark — the stored-dependency arrows and
 * the parent rows' summary brackets — and not two switches: Dany asked for "all
 * decluttering into one button" (2026-08-12), so there is no per-family state to
 * disagree with itself.
 *
 * It was three until 2026-09-11. The unestimated slices' assumed bars were the
 * third, and they left the switch's scope when Dany saw a chart with the detail
 * off: _"with details disabled you still have to show the unestimated slices"_.
 * `gantt-panel.tsx`'s `drawnBars` carries the measurement.
 */

/**
 * Reads the remembered answer, then drops the two keys this panel refuses — over
 * one runtime's `remembered`, `wbs.ganttDetail` and the retired key alike.
 *
 * `wbs.ganttDetail` is one key for the browser, and that is where it parts from
 * `wbs.ganttHeight.<projectId>` beside it: a panel height is one plan's share of
 * one screen, while detail on or off is an answer about a **feature** — a reader
 * who has turned sixty elbows off has turned them off, and having to say so
 * again in the next project is the fault this remembers away. It is
 * `wbs.ganttDetail` and no longer `wbs.ganttArrows`, because the switch no
 * longer answers about the arrows alone; see the retired-key note below.
 *
 * The answer is {@link readDetail}'s, read **before** the drop, which is exactly
 * what the chart opened on: a refused answer reads as off, and dropping it must
 * not turn it into the never-said default in the same breath. The drop is the
 * **write** half of the read, so this runs from the resynchronisation effect in
 * {@link useGanttDetail} and never from a render.
 *
 * The stored value is a claim, not a fact: user-editable storage read at a
 * boundary. Anything that is not a boolean takes the key with it and the switch
 * stays off. `JSON.parse` and a type check rather than `stored === 'true'`,
 * because the two answers a browser can hold have to be told apart from the
 * strings that merely look like them — `"yes"` parses fine and is not an answer.
 *
 * Deliberately not the "unknown is not OK" throw, for `rememberedGanttHeight`'s
 * reason: the alternative is a chart nobody can open until they clear storage by
 * hand, over a preference about a mark.
 */
function rememberedDetail(remembered: RememberedPreferences, hasEdges: boolean): boolean {
  const answer = readDetail(remembered, hasEdges);
  /**
   * The key the arrows-only switch wrote, for one day, between `gantt-declutter`
   * and `declutter-one-button`.
   *
   * **Dropped rather than migrated**, and the difference matters: it held an
   * answer about the arrows, and this switch draws two further families of mark
   * with them. Reading a stored `true` across would open the chart with parent
   * brackets and uncosted bars on it for a reader who asked for elbows — which is
   * the clutter Dany asked to be rid of in the first place. So the answer is
   * discarded and the key is **removed**, rather than left in storage to be
   * puzzled over by whoever reads a browser's `localStorage` next.
   *
   * The retired key goes whatever this browser has said since, and its value is
   * never looked at. Forgetting a key that is not there is a no-op, so there is
   * nothing to ask first.
   */
  //
  // Proof: this line deleted. `drops the key the arrows switch wrote, without
  // reading it` alone failed, `1 failed | 90 passed`, on `expected 'true' to be
  // null` — the retired key still in storage after the chart had been opened.
  // Watched 2026-08-12.
  // Proof: making the repository's `forget` a no-op failed its adapter case
  // and three chart-detail cases; this one failed on `expected 'true' to be
  // null`. Observed 2026-09-20.
  remembered.retiredGanttArrows.forget();
  // Proof: this refusal replaced by `claimed === true || (typeof claimed ===
  // 'string' && claimed !== '')`, which is what "read the claim, drop nothing"
  // comes to. `2 failed | 89 passed`: `refuses a stored answer that is not a
  // boolean, and drops the key` on `expected 'true' to be 'false'` — the detail
  // drawn from the string `"yes"` — and `refuses storage that is not JSON at
  // all, and drops the key` on `expected '{not json' to be null`, the unreadable
  // key left in storage to be read again next time. Watched 2026-08-11, and
  // again over the renamed key 2026-08-12.
  //
  // The answer is thrown away and the **drop** is the point: `readAndDrop`
  // removes a key whose contents this panel refuses, and `readDetail` below
  // then reads the same three states without writing.
  remembered.ganttDetail.readAndDrop();
  return answer;
}

/**
 * The same read with **nothing written** — what a React render is allowed to
 * do.
 *
 * {@link useGanttDetail}'s `useState` lazy initialiser calls this, which React
 * calls during a render and StrictMode calls **twice** on purpose to surface
 * exactly this: {@link rememberedDetail} drops two keys, and dropping a key is a
 * write. The rule is the one this file already states over the switch's own
 * handler — "a state updater React may call twice is no place for a side
 * effect" — and it was being kept eleven hundred lines below where it was being
 * broken. The drops happen in the resynchronisation effect instead.
 *
 * Nothing anybody can observe changed: `removeItem` is idempotent, and the
 * `DETAIL_KEY` drop only ever fires on a stored value this panel refuses. It is
 * a rule kept, not a defect fixed. Cross-review, 2026-08-12.
 */
function readDetail(remembered: RememberedPreferences, hasEdges: boolean): boolean {
  const claimed = remembered.ganttDetail.claim();
  if (claimed.status === 'held') return claimed.value;
  // Nothing stored: the chart opens with the detail on for a plan that has
  // dependency edges — a first-time reader sees the arrows without hunting for
  // the toggle — and off for a plan with nothing to hide. A **refused** answer
  // is not the same state and does not read as one: somebody has said
  // something here, and it is not "show me the arrows". That is the third
  // state {@link Claim} exists for.
  //
  // Proof: the two collapsed into `return hasEdges`, watched failing on
  // `expected 'true' to be 'false'` in `refuses a stored answer that is not a
  // boolean, and drops the key` and in `refuses storage that is not JSON at
  // all, and drops the key` — `2 failed | 159 passed`. Observed 2026-09-02.
  return claimed.status === 'absent' ? hasEdges : false;
}

/**
 * The detail switch as a panel holds it: what to draw, and how to ask.
 *
 * The read is the **initial state** rather than an effect, exactly as the panel
 * height is: an effect would draw every mark for one frame and then take them
 * away. The drops are an effect, because dropping a key is a write and a lazy
 * initialiser is a render React may call twice — StrictMode double-invokes it
 * on purpose to surface exactly that.
 *
 * `hasDependencyEdges` decides only the **never-said** case: a plan carrying
 * edges opens with the detail on, so a first-time reader sees the arrows a WBS
 * Gantt exists to show rather than a toggle they have to find (TASK-38). A
 * stored answer always wins — turning the detail off is a remembered choice.
 */
export interface GanttDetail {
  /** Whether the three families of mark are drawn. */
  shown: boolean;
  /** Asks for the next answer, and remembers it where a runtime is live to. */
  ask: (next: boolean) => void;
  /**
   * Whether this browser is remembering `shown`, as of the render that produced
   * this value.
   *
   * React state, corrected by `ask` within its own call and by the
   * resynchronisation effect after the commit the slot's own deferred
   * notification caused — so, exactly as `lib/theme.ts`'s `Theme.persists`, a
   * reader can still see `true` for a runtime that has already gone, which is
   * why `ask` reads the runtime at the instant it runs instead of trusting this.
   * Once converged it is the visible degradation rule R5 asks for.
   */
  persists: boolean;
}

/**
 * The detail switch over whichever runtime the page is publishing — the state
 * machine `lib/theme.ts`'s `useTheme` records, for a second answer the page
 * keeps on screen.
 *
 * - **No runtime yet**: the never-said default (`hasDependencyEdges`), not
 *   remembered; `ask` still turns the marks on and off.
 * - **Live**: the stored answer, remembered; `ask` writes it first and shows it
 *   second, so a store that refuses the write for a reason of its own
 *   propagates, by identity, before anything on screen has moved.
 * - **Withdrawn after live**: back to the never-said default, not remembered —
 *   the default an unread key already produces — as soon as the slot's own
 *   notification has committed, without waiting for the disposal.
 * - **Replaced**: the replacement's own stored answer, remembered, with its
 *   refused keys dropped.
 *
 * `ask` is superseded once a runtime other than the one its render read is live:
 * it then changes nothing at all, neither the marks nor any store. It reads the
 * runtime at the instant it runs, through {@link useApplicationServicesReader},
 * so it can tell that apart from a runtime that has merely been withdrawn — and
 * it never reaches a withdrawn or replaced runtime's store, so there is no
 * lifecycle refusal for it to catch. The resynchronisation effect reads the
 * runtime the same way, for the same reason: a passive effect runs after every
 * layout effect of its commit, and a layout effect can retire the slot first.
 */
export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
  const services = useApplicationServicesState();
  const readServices = useApplicationServicesReader();
  const rendered = services.status === 'live' ? services.remembered : null;
  const [shown, setShown] = useState(() =>
    rendered === null ? hasDependencyEdges : readDetail(rendered, hasDependencyEdges),
  );
  const [persists, setPersists] = useState(() => rendered !== null);
  /**
   * The never-said default as it stands now, for the effect below — which
   * re-runs when the published runtime changes, not when the plan's edges do:
   * a plan whose edges arrive after the chart opened keeps the answer it opened
   * on, as it always has.
   */
  const hasEdges = useRef(hasDependencyEdges);
  hasEdges.current = hasDependencyEdges;

  // On mount, on withdrawal and on every newly published runtime: resync to the
  // runtime live **now**, and drop the keys it refuses. The write half of the
  // read above.
  useEffect(() => {
    // Proof: on 2026-09-24, reading the render's runtime here instead of the one
    // live now failed `settles on the withdrawn state, without throwing, when
    // retired between its render and its effect` on `expected
    // PreferenceStoreLifecycleError: the page w… { kind: '…' } to be null`.
    const now = readServices();
    // Proof: on 2026-09-24, deleting this branch's two resets failed `returns to
    // the never-said default and stops remembering once withdrawn, without
    // waiting for disposal` on `expected false to be true`.
    if (now.status !== 'live') {
      setShown(hasEdges.current);
      setPersists(false);
      return;
    }
    // Proof: on 2026-09-24, dropping the keys without adopting the answer failed
    // `adopts a replacement runtime’s own remembered answer, and drops what it
    // refuses` on `expected false to be true`.
    setShown(rememberedDetail(now.remembered, hasEdges.current));
    setPersists(true);
  }, [rendered, readServices]);

  return {
    shown,
    persists,
    ask: (next) => {
      const now = readServices();
      const live = now.status === 'live' ? now.remembered : null;
      // Superseded: a runtime this render never read is live. Nothing changes.
      //
      // Proof: on 2026-09-24, deleting this guard failed `does not let a
      // superseded ask change the marks or any store` on `expected false to be
      // true`. Widening it to `live !== rendered`, so a withdrawal counted as a
      // supersession, failed `changes the marks and remembers nothing when asked
      // between a withdrawal and the next render` on `expected true to be false`.
      if (live !== null && live !== rendered) return;
      if (live === null) {
        setShown(next);
        // Proof: on 2026-09-24, answering `true` here failed `opens on the
        // never-said default and remembers nothing when no runtime is live` on
        // `expected true to be false`.
        setPersists(false);
        return;
      }
      // Written here and nowhere else, so opening a chart never changes what is
      // remembered about it — the same bargain `rememberGanttHeight` makes with
      // a drag that is let go of.
      //
      // Proof: this line deleted, so the answer lived in the hook alone. `opens
      // with the detail a fresh panel is remounted onto` alone failed, `1 failed
      // | 90 passed`, on `expected 'false' to be 'true'` — the switch back off
      // on the next mount. Watched 2026-08-11 over the arrows key, and again
      // 2026-08-12 over this one.
      //
      // Proof: on 2026-09-24, moving this write after the two state changes
      // failed `lets a store’s own write failure through by identity, showing
      // nothing it could not keep` on `expected true to be false`. Wrapping it in
      // a swallowing `try` failed the same test on `expected null to be Error:
      // write denied`.
      live.ganttDetail.write(next);
      setShown(next);
      setPersists(true);
    },
  };
}
