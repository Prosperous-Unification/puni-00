/**
 * The height every form control on an administration page takes: 44px, a
 * fingertip, below the `sm` breakpoint and the chrome's own 36px above it —
 * the Directory's `TAP` rule, so a phone can hit Remove without hitting the
 * control beside it.
 */
export const CONTROL_HEIGHT = 'h-11 sm:h-9';

/**
 * A native `<select>` drawn with the `Input` tokens, as the Directory's Kind
 * select is: the platform's own list stays (keyboard and screen-reader
 * behaviour for free) and only its box is restyled.
 */
export const SELECT_CLASS = `border-input bg-background text-foreground focus-visible:ring-ring focus-visible:ring-offset-background rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${CONTROL_HEIGHT}`;

/** A one-line form: fields stacked over the button on a phone, side by side from `sm`. */
export const FORM_CLASS = 'flex flex-col gap-3 sm:flex-row sm:items-end';

/** The caption above a form field. */
export const FIELD_LABEL_CLASS = 'text-sm font-medium';
