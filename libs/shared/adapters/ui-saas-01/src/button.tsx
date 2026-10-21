import { cn } from '@ui/core-01';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

/**
 * How every `aria-pressed="true"` button is drawn: filled in the primary, so a
 * toggle's two states differ by its whole face. Its unpressed twin is whatever
 * variant the caller chose — `outline` or `ghost` for a toggle — which is the
 * rule WBS's Gantt strip already followed (plain when off, filled when pressed)
 * made the button's own.
 *
 * The primary rather than the strip's first `bg-accent`: the accent is
 * `--muted`'s slate, 1.1:1 against the light background, so a pressed and an
 * unpressed toggle sat one shade apart. The primary stands at least 3:1 off the
 * outline face in both palettes (WCAG 1.4.11), which WBS's `header.spec.ts`
 * measures. The hover keeps the fill, at the default variant's own
 * 90%, so the pointer resting on a pressed toggle cannot unfill it.
 */
const PRESSED =
  'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground';

/**
 * Every `variant` a button takes, in the order the catalogue lays them out.
 *
 * A tuple beside the cva table rather than `Object.keys` of it, so the
 * Storybook controls and the `Matrix` story read the keys with their literal
 * types and no cast; {@link VARIANT_CLASSES} is a `Record` over this tuple, so
 * a key added to one and not the other fails to typecheck.
 */
export const BUTTON_VARIANTS = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
] as const;

/** Every `size` a button takes; {@link SIZE_CLASSES} is a `Record` over it, as above. */
export const BUTTON_SIZES = ['default', 'sm', 'lg', 'square'] as const;

/** What each `variant` adds to the base; the reasons are on {@link buttonClasses}. */
const VARIANT_CLASSES: Record<(typeof BUTTON_VARIANTS)[number], string> = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  outline:
    'border-control-edge bg-background hover:bg-accent hover:text-accent-foreground border shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

/** What each `size` adds to the base. */
const SIZE_CLASSES: Record<(typeof BUTTON_SIZES)[number], string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-6',
  square: 'h-8 w-8 p-0',
};

/**
 * Every shape a chrome button comes in, and the tokens each one reads.
 *
 * Colours are named, never mixed: `bg-primary` and `text-primary-foreground`
 * are custom properties the kit's `theme.css` sets, which is what makes the dark set a
 * re-point of the palette rather than a second copy of this file.
 *
 * This is the shadcn registry's own variant table with two removals. There is
 * no `asChild`, because it needs `@radix-ui/react-slot`; a link drawn as a
 * button puts `buttonVariants()` on its own `<a>`. And there is no `icon` size
 * with a lucide glyph in it: the apps' icons are their own — text where a
 * codepoint reads (`✕`) and inline SVG where one does not (WBS's plan toolbar
 * draws its own, since a `⌨` glyph turned out to be a hairline outline on
 * macOS) — and a
 * dependency added for a component nothing renders is one nobody maintains.
 * `size="square"` is what those icon buttons take.
 *
 * **`border-0 bg-transparent` in the base is the one addition**, and it is here
 * rather than in the host app's reset on purpose. The registry assumes preflight
 * has already stripped every `<button>` in the document; WBS's reset
 * deliberately has not, because a global `button { background: none; border: 0 }`
 * would flatten every chrome button no swap has reached yet into bare text. So
 * the neutralising happens per component. Watched: without it the `link`
 * variant's "Have an account? Register" rendered inside the platform's grey
 * button box, on the signed-out page, 2026-08-09. `tailwind-merge` is what lets
 * the `outline` variant put its 1px border straight back — which is why every
 * caller goes through {@link buttonVariants}, never this table raw.
 *
 * The `outline` edge is `--control-edge`, not `--input`: a control whose only
 * cue is its boundary needs 3:1 against what it stands on (WCAG 1.4.11), and
 * `--input` measured 1.2:1 on white.
 *
 * **A pressed toggle is drawn filled, whatever its variant** ({@link PRESSED}).
 */
const buttonClasses = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 border-0 bg-transparent rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
    PRESSED,
  ],
  {
    variants: { variant: VARIANT_CLASSES, size: SIZE_CLASSES },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/**
 * The classes for one button shape, merged: the base's `border-0
 * bg-transparent` give way to the variant's `border bg-background`, and a
 * caller's `className` to both.
 *
 * Merged here and not by each caller, because `cva` **appends** without
 * merging and the stylesheet's order then picks the winner. An element that
 * took `buttonVariants({ variant: 'outline' })` raw — WBS's sign-in page's
 * Continue with SSO link, its toolbar's Freeze # trigger — carried both
 * `border-0` and `border`, and the zero won: no edge at all, 1.08:1 light and
 * 1.01:1 dark against the card. Merging twice through `cn`
 * is harmless.
 *
 * Proof: `e2e/control-edge.spec.ts` `outline controls paint a 3:1 edge` failed
 * on `Continue with SSO: outside · Expected: >= 3 · Received: 1.08…` (light)
 * and `1.01…` (dark) while this returned `buttonClasses(props)` unmerged.
 * Watched 2026-10-16.
 */
export function buttonVariants(props?: Parameters<typeof buttonClasses>[0]): string {
  return cn(buttonClasses(props));
}

/**
 * The classes that lay a `ghost` button out as one row of a menu: the full
 * width of the panel, its words from the left edge, at body weight. One
 * constant so a menu of actions (WBS's Export / Import menu, its row ⋯ menu)
 * reads as one list rather than as a column of buttons.
 */
export const MENU_ITEM = 'w-full justify-start font-normal';

export type ButtonVariant = NonNullable<VariantProps<typeof buttonClasses>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonClasses>['size']>;

/**
 * A native button's attributes plus the variant table's keys.
 *
 * Hyphenated `data-*` props pass without being declared here, since TypeScript
 * does not check a JSX attribute whose name is not an identifier; that is how
 * WBS's tool hints and project facts (`data-hint`, `data-fact-lead`) ride on a
 * kit button without the kit knowing about either.
 */
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonClasses> {}

/**
 * A chrome button.
 *
 * Chrome only, and that is a rule rather than a habit: nothing inside the WBS
 * table may carry a utility class, because the host app's stylesheet scopes
 * its reset to stop at that table and the table's column widths were measured
 * against what a browser draws with no stylesheet at all.
 *
 * `type` is left to the caller and deliberately not defaulted to `"button"`.
 * The auth form's submit is a `<Button type="submit">`, and a default that
 * silently made every button non-submitting would break exactly the one place
 * a form needs one.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
});
