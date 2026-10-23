import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@ui/core-01';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type ReactNode,
} from 'react';

/**
 * Where a modal surface is anchored, which is the whole difference between what
 * the shadcn registry ships as two components.
 *
 * `centre` is its dialog and the three edges are its sheet. They are one
 * component here because they are one Radix primitive with one dismissal
 * contract, one focus trap and — the reason this change exists — one rule about
 * the page's keyboard. Vendored as two files, that rule would have been written
 * twice, and the second copy is the one that goes stale.
 */
export type ModalSide = 'centre' | 'right' | 'left' | 'bottom';

const SIDE_CLS: Record<ModalSide, string> = {
  centre:
    'left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-lg',
  right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l shadow-lg sm:max-w-md',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r shadow-lg sm:max-w-md',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t shadow-lg',
};

/** The modal itself: open state, dismissal, and the portal its surface lands in. */
export const Modal = DialogPrimitive.Root;
/** A control that opens the modal it is inside, without the caller holding state. */
export const ModalTrigger = DialogPrimitive.Trigger;
/** A control that closes the modal it is inside — the ✕, and any Cancel button. */
export const ModalClose = DialogPrimitive.Close;

/**
 * The dimmed page behind the surface.
 *
 * Exported because `ModalContent` is not the only shape a modal will ever need
 * — a toolbar in a bottom sheet with its own padding is one WBS plans — and
 * because a caller assembling its own portal still has to get the overlay
 * right.
 */
export const ModalOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function ModalOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-(--layer-modal) bg-black/40', className)}
      {...props}
    />
  );
});

export interface ModalContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  side?: ModalSide;
  /**
   * Whether the surface draws its own ✕ in the top right.
   *
   * On by default: Radix gives a modal Escape and a click away, and neither is
   * discoverable by someone reading the screen rather than remembering it.
   * Off for a surface that puts its own dismissal somewhere else — a confirm
   * with Cancel and Delete has two ✕s otherwise, and they mean different things.
   */
  closeButton?: boolean;
  /**
   * Rendered inside the portal, first, for whatever the host app must mount
   * only while the surface is open (WBS mounts its page-shortcut hold here).
   *
   * A slot rather than a hook the kit calls, because which keyboard a page owns
   * is the app's policy, not the kit's; and inside the portal rather than
   * beside this component, because only what the portal mounts tracks "open"
   * (a component in this one's body runs whenever its caller renders, open or
   * shut).
   */
  held?: ReactNode;
  children: ReactNode;
}

/**
 * Whether an outside pointer event landed on a toast, which no modal treats as
 * leaving it (see {@link ModalContent}). A toast is anything under
 * `[data-toasts]` (the stack) or `[data-toast]` (one toast): the attributes a
 * host app's toast stack carries for this, as WBS's does.
 *
 * `[data-toast]` as well as the stack: Radix reports a mouse's pointer-down
 * outside only once the click has landed, and by then the ✕ has dismissed its
 * toast, so the target is a detached node whose ancestors stop at the toast it
 * was in.
 */
function isToastTap(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-toasts], [data-toast]') !== null;
}

/**
 * A modal surface, and the one place a host app holds its page back.
 *
 * Radix owns everything that is about this dialog: the focus trap, the return
 * of the focus on close, `role="dialog"` with `aria-modal`, Escape, the click
 * away, and `aria-hidden` on the page behind. What Radix cannot know about is
 * the host app's **page-level** keyboard — WBS listens for `?` and Cmd+Z on
 * `window`, and for command chords on its cells — so an open dialog left every
 * one of them live over a page nobody could see. That rule is the app's, so it
 * arrives through {@link ModalContentProps.held}, which this renders **inside**
 * the portal rather than calling anything from this body. That is not tidiness:
 * this body runs whenever its caller renders, open or shut, and only what the
 * portal mounts tracks "open". There is no flag to keep in step — the mount is
 * the flag.
 *
 * The dialog needs a {@link ModalTitle} — Radix warns without one, and a modal
 * with no accessible name is one a screen reader announces as "dialog".
 */
export const ModalContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(function ModalContent(
  {
    className,
    side = 'centre',
    closeButton = true,
    held,
    children,
    onPointerDownOutside,
    onInteractOutside,
    ...props
  },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <ModalOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-modal-surface={side}
        className={cn(
          'bg-background text-foreground fixed z-(--layer-modal) flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-6',
          SIDE_CLS[side],
          className,
        )}
        {...props}
        // A toast is drawn above every modal (`--layer-toast`), so a tap on
        // its ✕ is a tap outside this surface, and Radix would close the
        // surface under it. Dismissing what happened is not leaving what the
        // reader was doing. Decided here, **before** the caller hears of it,
        // and for both hooks: Radix calls `onInteractOutside` right after
        // `onPointerDownOutside` whatever that one prevented, and a caller that
        // closes itself from `onInteractOutside` (WBS's Project settings) would
        // otherwise still close.
        //
        // Proof: with this guard on `onPointerDownOutside` only, WBS's `a
        // toast's ✕ leaves Project settings open` (`e2e/project-settings.spec.ts`
        // in `apps/wbs/fe-01`) failed on the dialog, `element(s) not found`; with
        // no guard at all, `a refused import is drawn above the sheet it was
        // chosen on` (its `e2e/plan-import.spec.ts`) failed the same way on the
        // Plan actions sheet. Watched 2026-10-16.
        onPointerDownOutside={(event) => {
          if (isToastTap(event.target)) {
            event.preventDefault();
            return;
          }
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (isToastTap(event.target)) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
      >
        {held}
        {children}
        {closeButton && (
          <DialogPrimitive.Close
            className="ring-offset-background focus-visible:ring-ring absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            // The word rather than a glyph: `✕` is announced as "multiplication
            // sign" or as nothing at all, depending on the reader.
            aria-label="Close"
          >
            <span aria-hidden="true">✕</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/** The surface's own heading block — title, and the sentence under it. */
export function ModalHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

/** Where a surface's actions sit: right-aligned on a wide screen, stacked on a narrow one. */
export function ModalFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

/** The modal's accessible name, wired to `aria-labelledby` by Radix. */
export const ModalTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function ModalTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
});

/** The modal's `aria-describedby` sentence — what this surface is for. */
export const ModalDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function ModalDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
});
