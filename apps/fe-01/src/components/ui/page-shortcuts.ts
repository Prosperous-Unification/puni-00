import { useEffect } from 'react';

import { isPageShortcut } from '@/components/wbs/keyboard-bindings';

/**
 * Holds the page's own keyboard back for as long as a modal surface is open.
 *
 * **The fault it exists for.** `?`, Cmd+Z and Cmd+Shift+Z are listened for on
 * `window` in `wbs-table.tsx` — deliberately, because the change being undone
 * could have been made from any cell, any picker or the toolbar, and there is
 * no one element to hang them on. The command chords (`Ctrl + N / D / H J K L`,
 * `Ctrl/⌘ + Enter`) are handled on the cells themselves. None of those
 * listeners knows anything about a dialog, so an open dialog left every one of
 * them live over a table nobody could see: Cmd+Z undid a change behind the
 * sheet, `?` opened the cheat sheet on top of it, and — because this app's
 * cheat sheet deliberately does not trap the focus — Tab out of the sheet and
 * Ctrl+N created a work item in the plan underneath.
 *
 * **The rule, and it is one rule.** While `isOpen`, a `keydown` listener on
 * `window` in the **capture** phase ends any keystroke {@link isPageShortcut}
 * claims. Capture on `window` is the first thing to run in the whole
 * propagation, before the document, before React's root container and before
 * the bubble-phase listeners the table registers on `window` — so
 * `stopImmediatePropagation` there is what makes "the page's shortcuts are off"
 * true rather than a claim about listener registration order.
 *
 * **What it deliberately does not do.**
 *
 * - No `preventDefault`. The browser's own Cmd+Z inside a text box in the
 *   dialog is better than anything this app could offer for a half-typed word,
 *   and `undoChord` already answers null for a typing target, so that keystroke
 *   is never claimed here in the first place.
 * - Nothing about Escape, Tab or the arrows. Those belong to whichever modal is
 *   open — Radix dismisses and traps on them — and a rule that swallowed them
 *   would take the ways out of the dialog with it.
 * - No count of open modals. Two of them register two listeners and each stops
 *   the same keystroke; stopping an already-stopped event is not a thing that
 *   can go wrong.
 *
 * Proof: the `window.addEventListener` line commented out, all four tests in
 * `page-shortcuts.test.tsx` failed — the cheat sheet opening over an open
 * modal, `api.undo` called once, `api.create` called once, and the cheat sheet
 * failing to hold Cmd+Z back. Watched 2026-08-09, quoted in
 * `openspec/changes/shadcn-foundation/verify.md`.
 *
 * @param isOpen Whether the modal surface asking is on screen right now.
 */
export function usePageShortcutsSuspended(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const swallow = (event: KeyboardEvent) => {
      if (!isPageShortcut(event, event.target)) return;
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', swallow, true);
    return () => {
      window.removeEventListener('keydown', swallow, true);
    };
  }, [isOpen]);
}
