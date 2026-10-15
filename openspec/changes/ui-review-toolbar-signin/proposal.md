<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Round 3 of the WBS UI review (2026-10-14) left three S3 findings:

- F-052: the signed-out page put the sign-in card top-left under a bare `WBS tool v2`, said nothing about the product, and reserved an empty error line that held the password field 52px above its button.
- F-056: at 1024 the plan toolbar wrapped Export / Import alone to the left of row two, with the schedule group at the right: two islands on one row. `ui-review-header-toolbar` grouped only Starts, Plan with and Reset layout.
- F-071: the hidden-chip count `+N` measured 4.48:1 on a banded row in `--muted-foreground`, and the grid's `search` placeholders, drawn in the same token at 0.7 opacity, 2.65:1 (light) and 4.16:1 (dark).

## What Changes

- The signed-out page is one centred column: the word mark, one line of product wording, and the sign-in panel. The refusal line takes space only while it has text, and opens with a short row transition.
- Undo, Redo, Keyboard shortcuts and Export / Import join the schedule group in one group at the end of the toolbar. Wherever the bar wraps, the last row holds that group alone, at the right edge. The 1280 toolbar budgets count controls by role, since the bar's children are groups now.
- A `--quiet-ink` token carries the `+N` count and the grid's placeholders, and clears 4.5:1 on a banded row in both palettes. `--muted-foreground` itself is unchanged.

## Non-goals

- The Estimate cells' `o/r/p` placeholder, which is deliberately fainter (0.45 opacity) as a syntax reminder rather than a prompt.
- Hovered or pointer-lit rows, the phone sheets' placeholders, and the signed-in header word mark.
