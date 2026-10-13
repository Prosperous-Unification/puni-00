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
 * A dialog opened from inside the panel counts as inside it. Radix portals the dialog to
 * `<body>`, so a click on its Copy button is outside the `<details>` by containment; closing the
 * panel then hid the trigger that Radix returns the focus to on close (Export / Import → Import
 * with AI). The trigger names its dialog by `aria-controls`, which is how ownership is read.
 *
 * **Escape** is the other half of a menu's manners, and the app's one popover
 * rule: every popover closes on Escape and returns the focus to what opened it
 * (UI review F-028, 2026-10-13 — the five panels were the only popovers in the
 * app Escape left open). The key counts when it is pressed inside the panel, or
 * with nothing focused at all — Safari does not focus a clicked `<summary>`, so
 * a mouse reader's Escape arrives at `<body>`. A key some other control already
 * handled (`defaultPrevented`) is left alone: Radix's dialog closes first and
 * prevents the default, so the Import with AI dialog opened from Export /
 * Import shuts without taking the menu under it along.
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
      // Proof: on 2026-09-27, dropping this check failed `keeps Export / Import open while its
      // Import with AI dialog is used` (plan-toolbar.test.tsx) on the closed menu.
      if (target instanceof Element && isInsideOwnedDialog(panel, target)) return;
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

    // The keyboard's half of the pointer rule above: Tab out of an open panel and it
    // closes, so an Escape pressed later never meets a panel it can no longer reach.
    //
    // Judged a task later, on where the focus **landed**, not on the event's
    // `relatedTarget`. A click on a tick box's label inside the phone's sheet moves the
    // focus through the sheet's own surface on its way to the box: closing on that
    // passing target hid the box mid-click, the sheet's focus trap took the focus back,
    // and the two chased each other until the tab crashed (`makes the row of a tick box
    // the tick box` in `e2e/mobile.spec.ts`: `Target crashed`, 2026-10-14). A focus that
    // ends nowhere (`<body>`) is left to the pointer rule, and one in the panel's own
    // dialog keeps it open.
    // Proof: on 2026-10-13, without this listener `closes when the focus leaves it by
    // the keyboard` in `close-on-dismiss.test.tsx` failed on `expected true to be false`.
    let pendingFocusCheck: ReturnType<typeof setTimeout> | undefined;
    const closeOnFocusOut = (): void => {
      if (!panel.open) return;
      clearTimeout(pendingFocusCheck);
      pendingFocusCheck = setTimeout(() => {
        const landed = document.activeElement;
        if (!panel.open || landed === null || landed === document.body) return;
        if (panel.contains(landed) || isInsideOwnedDialog(panel, landed)) return;
        panel.open = false;
      }, 0);
    };

    // One panel open at a time, whatever opened it: a summary toggled by Enter fires no
    // pointerdown, so two keyboard opens used to leave both standing.
    // Proof: on 2026-10-13, without this listener `opening one popover by the keyboard
    // closes the other (F-028)` in `e2e/toolbar-panels.spec.ts` failed with both open.
    const closeTheOthers = (): void => {
      if (!panel.open) return;
      for (const other of document.querySelectorAll(`details[${DISMISSIBLE}][open]`)) {
        if (other !== panel && other instanceof HTMLDetailsElement) other.open = false;
      }
    };

    document.addEventListener('pointerdown', closeIfOutside, true);
    // Bubble phase, so a control inside the panel that owns Escape (a field
    // that clears on it) is asked first and can say so with preventDefault.
    // Proof: on 2026-10-13, without this listener `every popover closes on Escape and gives the
    // focus back to its summary (F-028)` in `e2e/toolbar-panels.spec.ts` failed listing all five
    // panels as `open=true focused=false`.
    document.addEventListener('keydown', closeOnEscape);
    panel.addEventListener('focusout', closeOnFocusOut);
    panel.addEventListener('toggle', closeTheOthers);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
      panel.removeEventListener('focusout', closeOnFocusOut);
      clearTimeout(pendingFocusCheck);
      panel.removeEventListener('toggle', closeTheOthers);
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

/** Whether `target` sits in an open dialog whose trigger (`aria-controls`) is inside `panel`. */
function isInsideOwnedDialog(panel: HTMLDetailsElement, target: Element): boolean {
  const dialog = target.closest('[role="dialog"]');
  if (dialog === null || dialog.id === '') return false;
  return [...panel.querySelectorAll('[aria-controls]')].some(
    (trigger) => trigger.getAttribute('aria-controls') === dialog.id,
  );
}
