import { ModalContent as KitModalContent, type ModalContentProps } from '@ui/saas-01';
import { type ComponentRef, forwardRef } from 'react';

import { usePageShortcutsSuspended } from './page-shortcuts';

export {
  Modal,
  ModalClose,
  type ModalContentProps,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  type ModalSide,
  ModalTitle,
  ModalTrigger,
} from '@ui/saas-01';

/**
 * Holds the page's keyboard back for as long as **this** is mounted, which is
 * for as long as the surface around it is on screen.
 *
 * It exists because "mounted" and "open" turned out not to be the same fact.
 * {@link ModalContent} is an ordinary child of `Modal`, so React runs its
 * body on every render of whatever holds it, open or shut — Radix's `Presence`
 * decides what the *portal* renders, not whether this component function was
 * called. So a hook called in `ModalContent`'s own body registered its capture
 * listener the moment the dialog was declared and never took it off, and every
 * page shortcut on the page went dead while the dialog was closed.
 *
 * Passing it as the kit's `held` puts it inside what the portal mounts and
 * unmounts, which is the thing that really tracks "open".
 *
 * Proof: found by the first production caller rather than by reasoning. With
 * `usePageShortcutsSuspended(true)` in `ModalContent`'s body and a closed
 * `StepsDialog` mounted in `WbsTable` — that surface is `ProjectSettingsModal`'s
 * steps section since `project-config-modal` — **49 tests** in `wbs-table.test.tsx`
 * failed — `outdents with shift-tab` on `expected [ '010' ] to deeply equal
 * [ '010', '020' ]`, because Ctrl+N was being swallowed by a dialog nobody had
 * opened. Watched 2026-08-09, and pinned since by `holds nothing back while the
 * modal is closed` in `page-shortcuts.test.tsx`.
 */
function PageShortcutsHeld(): null {
  usePageShortcutsSuspended(true);
  return null;
}

/**
 * The kit's modal surface with WBS's keyboard rule hung on it: while the
 * surface is open, `?`, Cmd+Z and the cells' command chords stop reaching the
 * table underneath ({@link usePageShortcutsSuspended}).
 *
 * Every WBS modal goes through this rather than the kit's own, so the rule is
 * written once; `held` is taken over, so a caller cannot pass one of its own.
 */
export const ModalContent = forwardRef<
  ComponentRef<typeof KitModalContent>,
  Omit<ModalContentProps, 'held'>
>(function ModalContent(props, ref) {
  return <KitModalContent ref={ref} {...props} held={<PageShortcutsHeld />} />;
});
