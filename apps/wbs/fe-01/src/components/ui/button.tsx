import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { type Factable, type Hintable } from '@/components/wbs/hint';
import { cn } from '@/lib/utils';

/**
 * Every shape a chrome button comes in, and the tokens each one reads.
 *
 * Colours are named, never mixed: `bg-primary` and `text-primary-foreground`
 * are custom properties `styles.css` sets, which is what makes the dark set a
 * re-point of the palette rather than a second copy of this file.
 *
 * This is the shadcn registry's own variant table with two removals. There is
 * no `asChild`, because it needs `@radix-ui/react-slot`; the one link drawn as
 * a button (`credential-refusal-state.tsx`) puts `cn(buttonVariants())` on its
 * own `<a>`. And there is no `icon` size with a lucide glyph
 * in it: this app's icons are its own — text where a codepoint reads (`✕`) and
 * inline SVG where one does not (`wbs/toolbar-icons.tsx`, since the plan
 * toolbar's `⌨` turned out to be a hairline outline on macOS) — and a
 * dependency added for a component nothing renders is one nobody maintains.
 * `size="square"` is what those icon buttons take.
 *
 * **`border-0 bg-transparent` in the base is the one addition**, and it is here
 * rather than in `styles.css`'s reset on purpose. The registry assumes preflight
 * has already stripped every `<button>` in the document; this app's reset
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
 * `--input` measured 1.2:1 on white (UI review F-124).
 */
const buttonClasses = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 border-0 bg-transparent rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border-control-edge bg-background hover:bg-accent hover:text-accent-foreground border shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        square: 'h-8 w-8 p-0',
      },
    },
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
 * took `buttonVariants({ variant: 'outline' })` raw — the sign-in page's
 * Continue with SSO link, the toolbar's Freeze # trigger — carried both
 * `border-0` and `border`, and the zero won: no edge at all, 1.08:1 light and
 * 1.01:1 dark against the card (UI review F-124). Merging twice through `cn`
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
 * constant so the Export / Import menu and its Import with AI trigger read as
 * the row ⋯ menu does (UI review F-031) rather than as a column of buttons.
 */
export const MENU_ITEM = 'w-full justify-start font-normal';

export type ButtonVariant = NonNullable<VariantProps<typeof buttonClasses>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonClasses>['size']>;

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonClasses>,
    Hintable,
    Factable {}

/**
 * A chrome button.
 *
 * Chrome only, and that is a rule rather than a habit: nothing inside
 * `[data-grid]` may carry a utility class, because the scoped reset in
 * `styles.css` stops at that element and the widths in `table-frame.ts` were
 * measured against what a browser draws with no stylesheet at all.
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
