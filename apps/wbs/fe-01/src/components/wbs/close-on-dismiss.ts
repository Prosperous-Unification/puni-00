import { type RefCallback, useCallback, useEffect, useState } from 'react';

/**
 * Closes an open `<details>` when a pointer goes down anywhere outside it, or
 * when Escape is pressed in it — and on Escape gives the focus back to its
 * `<summary>`.
 *
 * The toolbar's four panels — Filters, Views, Columns and Export — are
 * `<details>` elements rather than positioned popovers, for the reason
 * {@link FilterFacets} gives: no measurement, no portal, and the disclosure
 * state is the element's own. What that shape does not give is a menu's manners.
 * A native `<details>` closes on its summary and on nothing else, so an open
 * panel stayed open over the plan while the reader went back to the table —
 * reported by Dany on 2026-08-31: "allow to collapse Filters, Views, Columns
 * pop-ups by clicking somewhere outside the space".
 *
 * `pointerdown` and not `click`, in the **capture** phase: a menu that closes on
 * the way down is what every other menu on this page does, and the reader's
 * click then lands on whatever they aimed at rather than being spent shutting
 * the panel. Capture so this runs before the grid's own handlers, which stop
 * some events on their way up.
 *
 * A pointer inside the panel is left alone — every control in there is a thing
 * to tick, and `node.contains` covers the summary too, so clicking the summary
 * still toggles rather than being closed and reopened in one gesture.
 *
 * Native `<select>` popups (the Export panel's Mermaid lanes picker) are drawn
 * by the platform, not the document, so choosing from one fires no `pointerdown`
 * here and cannot close the panel underneath it.
 *
 * A panel item that opens a dialog closes the panel itself as the dialog opens and hands the
 * focus back to the panel's `<summary>` when the dialog closes (Export / Import → Import with AI,
 * UI review F-106), so no dialog stands over an open panel for this hook to reason about.
 *
 * **Escape** is the other half of a menu's manners, and the app's one popover
 * rule: every popover closes on Escape and returns the focus to what opened it
 * (UI review F-028, 2026-10-13 — the five panels were the only popovers in the
 * app Escape left open). The key counts when it is pressed inside the panel, or
 * with nothing focused at all — Safari does not focus a clicked `<summary>`, so
 * a mouse reader's Escape arrives at `<body>`. A key some other control already
 * handled (`defaultPrevented`) is left alone: a dialog closes first and
 * prevents the default, so its Escape never reaches a panel as well.
 *
 * Summary activation closes peers synchronously, including the native click dispatched by
 * Enter or Space. A `toggle` notification is queued: two activations can finish before the
 * first notification, which would let the older panel close the newer one. The toggle
 * listener also covers disclosure state changed without summary activation.
 *
 * The callback ref makes the mounted node an effect dependency. Some controls,
 * including Export, are absent until their boundary read succeeds; a one-shot
 * effect that reads `ref.current` can run before that `<details>` exists and
 * never install its listener.
 */
export function useClosedOnDismiss(): RefCallback<HTMLDetailsElement> {
  const [panel, setPanel] = useState<HTMLDetailsElement | null>(null);
  const rememberPanel = useCallback((node: HTMLDetailsElement | null): void => {
    setPanel(node);
  }, []);

  useEffect(() => {
    if (panel === null) return undefined;
    panel.setAttribute(DISMISSIBLE, '');

    const closeIfOutside = (event: PointerEvent): void => {
      // Nothing to close, and nothing to read the target for.
      if (!panel.open) return;
      const { target } = event;
      if (target instanceof Node && panel.contains(target)) return;
      panel.open = false;
    };

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !panel.open || event.defaultPrevented) return;
      const { target } = event;
      const inside = target instanceof Node && panel.contains(target);
      if (!inside && target !== document.body) return;
      event.preventDefault();
      panel.open = false;
      summaryOf(panel).focus();
    };

    // The keyboard's half of the pointer rule above: **Tab** out of an open panel and it
    // closes, so an Escape pressed later never meets a panel it can no longer reach.
    //
    // Only a Tab pressed inside the panel arms it. A focus the page moves by itself — the
    // grid putting the caret back after a refetch — is not the reader leaving, and closing
    // on it shut the Columns panel under `status.spec.ts`'s tick in CI (2026-10-14). And it
    // is judged a task later, on where the focus **landed** rather than on the event's
    // `relatedTarget`: a tick-box label click in the phone's sheet passes the focus through
    // the sheet's surface, and closing on that hid the box mid-click until the sheet's focus
    // trap and this handler crashed the tab (`mobile.spec.ts`, `Target crashed`).
    // Proof: on 2026-10-13, without this listener `closes when Tab takes the focus out of
    // it` in `close-on-dismiss.test.tsx` failed on `expected true to be false`.
    let leavingByTab = false;
    let pendingFocusCheck: ReturnType<typeof setTimeout> | undefined;
    const armOnTab = (event: KeyboardEvent): void => {
      leavingByTab = event.key === 'Tab';
    };
    const closeOnFocusOut = (): void => {
      if (!panel.open || !leavingByTab) return;
      leavingByTab = false;
      clearTimeout(pendingFocusCheck);
      pendingFocusCheck = setTimeout(() => {
        const landed = document.activeElement;
        if (!panel.open || landed === null || landed === document.body) return;
        if (panel.contains(landed)) return;
        panel.open = false;
      }, 0);
    };

    const closeOthers = (): void => {
      for (const other of document.querySelectorAll(`details[${DISMISSIBLE}][open]`)) {
        if (other !== panel && other instanceof HTMLDetailsElement) other.open = false;
      }
    };

    const closeOnSummaryClick = (event: MouseEvent): void => {
      const { target } = event;
      if (panel.open || !(target instanceof Node) || !summaryOf(panel).contains(target)) return;
      // Proof: without this listener, `keeps the latest activated panel open before queued
      // toggles settle (F-028)` failed with ['Filters'] instead of ['Views'] (2026-10-14).
      closeOthers();
    };
    // Preserve disclosure changes that activate no summary. A close notification must not
    // dismiss the panel that replaced this one.
    // Proof: without this listener, `closes the previous panel when disclosure state changes
    // without summary activation` failed with Filters still open (2026-10-14).
    const closeOnToggle = (): void => {
      if (panel.open) closeOthers();
    };

    document.addEventListener('pointerdown', closeIfOutside, true);
    // Bubble phase, so a control inside the panel that owns Escape (a field
    // that clears on it) is asked first and can say so with preventDefault.
    // Proof: on 2026-10-13, without this listener `every popover closes on Escape and gives the
    // focus back to its summary (F-028)` in `e2e/toolbar-panels.spec.ts` failed listing all five
    // panels as `open=true focused=false`.
    document.addEventListener('keydown', closeOnEscape);
    panel.addEventListener('keydown', armOnTab);
    panel.addEventListener('focusout', closeOnFocusOut);
    panel.addEventListener('click', closeOnSummaryClick);
    panel.addEventListener('toggle', closeOnToggle);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
      panel.removeEventListener('keydown', armOnTab);
      panel.removeEventListener('focusout', closeOnFocusOut);
      clearTimeout(pendingFocusCheck);
      panel.removeEventListener('click', closeOnSummaryClick);
      panel.removeEventListener('toggle', closeOnToggle);
    };
  }, [panel]);

  return rememberPanel;
}

/** The mark every panel this hook holds carries, so opening one can close the rest. */
const DISMISSIBLE = 'data-dismissible';

/**
 * The `<summary>` a panel is opened by.
 *
 * @throws When the `<details>` has none: every panel this hook is given is
 *   written with one, and a disclosure without a summary has nothing to return
 *   the focus to.
 */
function summaryOf(panel: HTMLDetailsElement): HTMLElement {
  const summary = panel.querySelector(':scope > summary');
  if (!(summary instanceof HTMLElement)) throw new Error('a dismissible panel has no <summary>');
  return summary;
}
