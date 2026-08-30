<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Three faults in the plan toolbar, reported by Dany on 2026-08-29.

**Two buttons for one subject.** `Freeze numbering` and `Unfreeze all` are
adjacent, opposite, and both spelled out in full. Together they take more of the
bar than `Add work item`, and neither is used often.

**`Expand all` and `Collapse all` are two words each for a shape.** Eighteen
characters of a width-constrained bar (`min-w-0`, a flex bar that gives way) to
say something a chevron says.

**`⌨` does not read on macOS.** U+2328 renders as a thin monochrome outline in
the system font at button size and is illegible. The control's meaning is
carried entirely by a codepoint whose rendering the app does not control.

## What Changes

**`Freeze #` becomes one menu control.** A single button labelled `Freeze #`
opens a menu with `Freeze numbering` and `Unfreeze all`. Both writes are
unchanged; only their entry point moves. The menu joins the rule that a plan
chord is inert while a menu is open, and refuses a modified Enter with
`preventDefault` — the `actions-menu` fault of 2026-08-09, which cannot be seen
from jsdom.

**Expand and collapse become icon buttons.** Two square buttons carrying a
drawn chevron each, with `aria-label` and `title` keeping the full words. The
accessible names `Expand all` and `Collapse all` are unchanged, so every
existing test and screen-reader path still finds them.

**Every toolbar glyph becomes a drawn shape, not a codepoint.** `⌨` and the
new chevrons are inline SVG with `currentColor`, sized in `em`. A glyph the app
draws renders identically on every platform; a glyph it names does not.

## Non-Goals

- No change to what freeze, unfreeze, expand or collapse do.
- No new keyboard binding; `?` still opens the cheat sheet.
- No icon library dependency. Three small inline SVGs, in one module.
- The `Detail`, `Gantt`, `Views`, `Columns` and export controls are untouched.

## Capabilities

### Modified Capabilities

- `wbs-domain`: the plan toolbar's controls and how they are labelled.

## Domain Terms

Freeze; Frozen number; Expansion.

## Impact

`wbs-table.tsx`'s toolbar, a new `toolbar-icons.tsx`, the phone sheet's control
list, `wbs-table.test.tsx`, `plan-cards.test.tsx`, and Chromium specs for the
menu's keyboard behaviour and the bar's width.
