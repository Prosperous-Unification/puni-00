/**
 * A link to a space or a project, in the palette's ink rather than the user
 * agent's link blue (`page-nav.tsx` measured that blue against the dark
 * `--background`), underlined in a quiet tone that darkens on hover, and ringed on focus as the chrome's
 * buttons are. `[overflow-wrap:anywhere]` breaks a long unbroken name instead
 * of widening its row past a phone.
 */
export const LINK_CLASS =
  'text-foreground decoration-muted-foreground/50 hover:decoration-foreground focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm font-medium underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

/** The column every spaces page lays its cards in, scrolled by `main` as the Directory's is. */
export const MAIN_CLASS = 'bg-background text-foreground min-h-0 flex-1 overflow-y-auto font-sans';

/**
 * A list inside a card, with the user agent's bullet, indent and margins taken
 * off: this app has no preflight (`styles.css` says why), so a bare `<ul>`
 * keeps its 40px indent.
 */
export const LIST_CLASS = 'divide-border m-0 flex list-none flex-col divide-y p-0';

/** One field of a spaces form: its caption above its control. */
export const FIELD_CLASS = 'flex min-w-0 flex-1 flex-col gap-1.5';

/**
 * An in-place outcome or loading sentence. Outcomes quote names (`Moved … up.`),
 * so it breaks a long unbroken one as {@link LINK_CLASS} does.
 */
export const STATUS_CLASS = 'text-sm [overflow-wrap:anywhere]';

/** A failure sentence, broken anywhere for {@link STATUS_CLASS}'s reason. */
export const ALERT_CLASS = 'text-destructive text-sm [overflow-wrap:anywhere]';

/** A quiet sentence (an empty list, a count, a cut), broken anywhere for {@link STATUS_CLASS}'s reason. */
export const NOTE_CLASS = 'text-muted-foreground text-sm [overflow-wrap:anywhere]';

/** A row of a card's list: what it names on the left, its controls on the right or below. */
export const ROW_CLASS =
  'flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4';
