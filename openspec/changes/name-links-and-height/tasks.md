<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The link, followable

- [x] 1.1 `LinkAsText` becomes `LinkInGrid`: an anchor with `target="_blank"`,
      `rel="noreferrer noopener"` and `tabIndex={-1}`, plus a
      `[data-cell-rendered] a { pointer-events: auto }` rule against the box's
      own `none` — test: `e2e/name-markdown.spec.ts` `a link in a name is not a
tab stop but can be followed`, which asserts the popup's URL, the Tab
      landing elsewhere, and a click past the link still opening the editor;
      negative: the `pointer-events` rule deleted, watched failing on the click
      opening the editor instead of the popup.
- [x] 1.2 The hover preview's notes map `a` to `LinkFollowable`, the component
      its title already uses — test: `e2e/hover-cards.spec.ts` `a link in the
notes is followable, and drawn like the name's`; negative: the mapping
      removed, watched failing on the missing `target`.
- [x] 1.3 A non-`http(s)` URL carries no such `href` on either face — test:
      `a javascript: URL in a name is not a link at all`.

## 2. The height

- [x] 2.1 `drawnBoxHeight` measures the box the reader sees and the at-rest
      height comes from it, with a `useLayoutEffect` re-measuring once the drawn
      content has committed — test: `e2e/name-markdown.spec.ts` `a link whose
source outruns its reading does not grow the row`; negative:
      `drawnBoxHeight` made to answer `null`, watched failing on `Expected:
26.1875 / Received: 42`.

## 3. Gate

- [ ] 3.1 `nx run-many -t test lint typecheck build`, `openspec validate --all
--json`, and the whole `CI=1` Playwright gate on shifted ports.
