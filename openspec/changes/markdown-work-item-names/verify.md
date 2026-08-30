# verify — `markdown-work-item-names`

Slices 1–4 implemented and gated. Slice 4 was **written and not run** until
2026-08-30, when it was run on `E2E_PORT_SHIFT=600` — never against the dev
server holding 3100/3200/4200 — and its named negative was watched. Slice 5 is
partly run. Everything below that was not executed still says so.

## The decision this reverses

`hover-preview.tsx` deliberately rendered the name as text, with the reason
written on the symbol. That reason survives as D2 — the name is still never
composed into markdown source — and only the "nobody writes markdown in it"
half is reversed. The JSDoc is rewritten in the same commit, not left standing
over code that no longer does what it says.

## What was built

`inline-markdown.tsx` is the one renderer. `react-markdown` with `remark-gfm`
(the only way to get **strikethrough**, which the spec asks for and CommonMark
has no syntax for), a components map that passes `em`, `strong`, `code`, `del`,
`a` and text through, renders `p` as a fragment, and maps **every other tag
`react-markdown` can produce** — `blockquote`, `br`, `h1`–`h6`, `hr`, `img`,
`input`, `li`, `ol`, `pre`, `section`, `sup`, `table`, `tbody`, `td`, `th`,
`thead`, `tr`, `ul` — to a component that renders that element's **own source
text**, sliced out of the name by its parse position.

Four faces call it: `hover-preview.tsx`'s `<h1>`, `plan-cards.tsx`'s card,
`gantt-panel.tsx`'s row label, and the table's Name cell.

### The Name cell is two boxes

The Name cell is a `<textarea>`, and a `<textarea>` holds characters — it cannot
hold an `<em>`. So `CellInput` grew a `renderFirstLine` prop: with it set, the
box is wrapped in a positioned span and a second, `aria-hidden`,
`pointer-events: none` box is laid over it (`data-cell-rendered`). Two rules in
`styles.css` are the whole swap — the textarea's ink is transparent while it is
not focused, and the rendered box is `display: none` while it is.

Three consequences worth naming:

- **The textarea is untouched.** The value, the auto-size measurement, the
  focus, the commit, the refused-draft restore and the clamp all still belong to
  it, so nothing `e2e/name-cell.spec.ts` measures has moved.
- **The rendered box is out of the flow**, so "nothing a name contains may
  change a row's height" is true by **construction** rather than by measurement.
  That weakens the browser check — see "Skipped or unverified" below.
- **The rendered box draws what the box holds, not the `value` prop.** The prop
  is what the _server_ last said; the box also holds a draft be-01 refused and
  what somebody has just typed while the request is out. Drawing the prop would
  show a reader the **old** name over their own edit, with their own ink
  transparent underneath — `D directory-page`'s lesson in the window between a
  blur and an answer. `CellInput` takes the box's text down at the three moments
  it is at rest (attach, blur, sync) and never on a keystroke.

`remark-gfm@4.0.1` is a new dependency; `bun.lock` and `package.json` carry it.

## Commands

| Command                                    | Result                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `bunx nx run fe-01:test`                   | **2 failed \| 1824 passed (1826)** — both failures pre-existing, see below |
| `bunx nx run fe-01:lint`                   | **0 errors, 1 warning** — the warning pre-existing, see below              |
| `bunx nx run fe-01:typecheck`              | **passed**                                                                 |
| `openspec validate --all --json`           | **79/79 passed**                                                           |
| `bin/h2puni-gate.sh`                       | **not run** — out of scope for this session                                |
| `CI=1 bunx playwright test …` (whole gate) | **not run** — ports held, see below                                        |

```
> nx run fe-01:test
> bunx vitest run

 FAIL  src/components/wbs/plan-mermaid.test.ts > a real Mermaid parse (M5) > the excludes-weekends trap, watched rather than argued > leaves a bar crossing a weekend exactly where it was told, manualEndTime true
 FAIL  src/components/wbs/plan-mermaid.test.ts > a real Mermaid parse (M5) > the excludes-weekends trap, watched rather than argued > still parses a point (unestimated/zero) as a real milestone with equal dates
 Test Files  1 failed | 57 passed (58)
      Tests  2 failed | 1824 passed (1826)
   Duration  118.28s
```

Both `plan-mermaid` failures are **pre-existing and unrelated**, and that was
checked rather than assumed: with this whole change stashed
(`git stash push --include-untracked`), the same file on the same machine gives

```
 FAIL  src/components/wbs/plan-mermaid.test.ts > … > leaves a bar crossing a weekend exactly where it was told, manualEndTime true
 FAIL  src/components/wbs/plan-mermaid.test.ts > … > still parses a point (unestimated/zero) as a real milestone with equal dates
      Tests  2 failed | 47 passed (49)
```

The assertion is `expected '2026-09-02T21:00:00.000Z' to be
'2026-09-03T00:00:00.000Z'` — a three-hour offset, i.e. this host is not on UTC
and Mermaid's parse is being read back as an instant. Nothing in this change
touches `plan-mermaid.ts`.

```
> nx run fe-01:lint
> bunx eslint apps/fe-01/src apps/fe-01/e2e …

apps/fe-01/src/components/wbs/wbs-table.tsx
  4048:5  warning  React Hook useMemo has unnecessary dependencies: 'ownedServicesByTeam' and 'teamsByPerson'. …

✖ 1 problem (0 errors, 1 warning)
```

Pre-existing too, and checked the same way: stashed, the same warning is
reported at `4047:5` — the line number is the only thing this change moved.

```
> nx run fe-01:typecheck
> bunx tsc --build --force apps/fe-01/tsconfig.app.json
> bunx tsc --build --force apps/fe-01/tsconfig.e2e.json

 NX   Successfully ran target typecheck for project fe-01
```

## Failure proofs (R5)

Every row below was watched red with the fault in and green with it out, on
2026-08-29.

| Check                                   | Fault injected                                                                  | Test that saw it fail                                                      | Watched                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| a block marker is shown, not eaten      | `RENDERED_AS_SOURCE` never applied, so every block renders its children         | `a heading marker is shown, not eaten`, and four cases beside it           | `expected 'not a heading' to be '# not a heading'` (**5 failed \| 6 passed**, see the four below)                                        |
| a list marker is shown                  | the same                                                                        | `a list marker is shown, not eaten`                                        | `expected '\nbuy milk\n' to be '- buy milk'`                                                                                             |
| a fence is shown                        | the same                                                                        | `a fence, a rule, a quote and a table are shown, not eaten`                | `expected 'fence\n' to be '```\nfence\n```'`                                                                                             |
| a block's own inline text is not parsed | the same                                                                        | `inline emphasis still renders beside a block marker it was typed with`    | `expected 'not a heading' to be '# *not* a heading'`                                                                                     |
| an image never loads in a row           | the same                                                                        | `an image is shown as its source rather than loaded`                       | `expected <img …(2)></img> to be null`                                                                                                   |
| an unknown source position throws       | the `throw` in `blockSourceOf` replaced by `return ''`                          | `refuses to guess at the source of an element the parser gave no position` | `expected [Function] to throw an error`                                                                                                  |
| a link is not a tab stop                | `a` mapped to `LinkFollowable` unconditionally — a real `<a href>` in a cell    | `is not followable and adds no tab stop where the grid draws it`           | `expected <a data-name-link="true" …(5)></a> to be null`                                                                                 |
| the heading is not parser-made          | ``<Markdown>{`# ${name}\n\n${notes}`}</Markdown>`` put back                     | `the heading is not made by the parser`                                    | Expected `# not a heading <script>alert(1)</script> and *not* emphasis`, received the same without the asterisks                         |
| the heading still renders emphasis      | the heading's body put back to the bare `{name}`                                | `emphasis inside the heading still renders`                                | `expected undefined to be 'not'`, and `a link in the name is followable from the preview` on `expected undefined to be 'http://x.test/'` |
| the Name cell renders the name          | `renderFirstLine` taken off the Name column                                     | `emphasis in a name is rendered` + two beside it                           | `Error: no rendered name for 010` ×2, and `expect(element).toHaveAttribute("data-rendered-at-rest")`                                     |
| the card renders the name               | `renderFirstLine` taken off the card's `CellInput`                              | `renders a card’s name as inline markdown, …`                              | `Error: the card for 010 draws no rendered name`                                                                                         |
| the chart label renders the name        | the label's body put back to `{rowWords(label.number, label.name)}`             | `renders emphasis in a label, …`                                           | `expected undefined to be 'now'`                                                                                                         |
| the export stays raw                    | `planToMarkdown`'s Name cell run through `name.replace(/\*\*(.+?)\*\*/g, '$1')` | `an export carries the markdown source`                                    | `expected [ '010', 'blocked', '', '', '', …(22) ] to include '**blocked**'`                                                              |
| the search matches the source           | `narrowTree`'s `matches` given `row.name.replace(/[*_\`~]/g, '')`               | `a search matches the source`                                              | `expected [] to deeply equal [ 'a' ]`                                                                                                    |
| **the row height never moves**          | the block allowlist removed                                                     | the Chromium measurement in `e2e/name-markdown.spec.ts`                    | **not watched** — the spec was not run; see below                                                                                        |

## A check written for this change that could not fail, and was not shipped

The chart's row label was going to claim that the **number** is never put
through the parser — "putting `010 - ` in front of the name would be the
composition D2 rejects wearing a different hat". The fault was written
(`<InlineMarkdown>{rowWords(label.number, label.name)}</InlineMarkdown>`) and
**watched passing**: `1 passed | 143 skipped`.

It had to pass. A number in front of a name _suppresses_ block parsing rather
than causing it — `010 - # x` is a paragraph, because a heading marker has to
start its line — and the inline grammar reads identically either way. There is
no name for which the composed and uncomposed readings differ, so there was
nothing for the assertion to see.

The claim is deleted. The split into `numberWords`/`nameWords` stays, described
in `gantt-panel.tsx` as what it is — structure, so the tooltip can say the whole
sentence in its own source while the button draws half of it through the parser
— and no test claims otherwise. (`AGENTS.md`, R5, `T1 column-widths-drag`:
delete the guard whose removal you cannot see.)

## Skipped or unverified checks

**Named plainly, because none of these was run.**

1. **No browser was run at all.** `bun run e2e` and every Playwright invocation
   were deliberately not executed: ports 3100/3200/4200 are held by a dev
   server on this host, and the committed config sets
   `reuseExistingServer: !isCi`, so a run here would have measured **another
   checkout** — `LLM_README.md`'s landmine and R5's own sixteenth entry.
   `e2e/name-markdown.spec.ts` is therefore **written and never executed**:
   neither its assertions nor the negative for them has been watched, and it may
   not even be green as written.

2. **The row-height claim has no oracle in this run, and is structurally weak
   even when it gets one.** jsdom computes no layout, so no unit test in this
   change can see a `p` margin, a `pre` block or a wrapped `<h1>` — the whole of
   D3. And because the rendered box is absolutely positioned, the injected fault
   (block allowlist removed) _cannot_ move a row's height: it moves the rendered
   box's height. The spec measures both and says which is which, but the row
   half of the requirement's own scenario is satisfied by construction rather
   than by evidence.

3. **The two-box swap is unverified.** `textarea[data-rendered-at-rest]:not(:focus)
{ color: transparent }` and the `display: none` beside it are the only thing
   deciding which box a reader sees, and jsdom applies no stylesheet. If they
   are wrong, a Name cell shows its name twice, or shows nothing. The unit tests
   assert only the attribute they hang off.

4. **Pixel alignment of the two boxes is unverified.** `[data-cell-rendered]`
   takes `padding: 2px` and a 1px border — the user agent's own `<textarea>`
   metrics, which `styles.css` deliberately does not restyle — and a caller with
   a padding of its own (the phone card's `p-2 text-base`) overrides both boxes
   through one `className`. Whether the drawn text actually lands on the typed
   text has not been seen. `the drawn text sits exactly where the typed text
sits` in the unrun spec is the check for it.

5. **`bin/h2puni-gate.sh` was not run**, so `format:check`, `build`, the secrets
   scan and the migration lint have not seen this change. The three fe-01
   targets above were run directly instead, and `prettier --write` was run over
   every file this change touches.

6. **The dark palette was not seen.** `LINK_INK` uses `var(--primary)` and an
   underline on both faces; nothing has looked at it in either palette, and the
   `dark-mode.spec.ts` sweep has not run.

7. **No `plan-cards`/`gantt-panel` browser measurement.** Slice 4.1 asks for the
   card and the chart label to be measured too. `e2e/name-markdown.spec.ts`
   covers only the table.

## Slice 4, run at last (2026-08-30)

`CI=1 E2E_PORT_SHIFT=600 bunx playwright test --config
apps/fe-01/playwright.config.ts name-markdown`: **7 passed**. Four of those
seven are `name-links-and-height`'s, added the same day; the three this change
wrote are the two palette cases and the two-box swap.

| Check                                      | Fault injected                                           | Observed failure                                                | Watched              |
| ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| the block allowlist keeps a marker as text | the `RENDERED_AS_SOURCE` loop deleted so children render | `four rows, four names, one height` failed in **both** palettes | Chromium, 2026-08-30 |

The card and chart-label faces named in 4.1 are still **not** measured in a
browser. The row and the cell are; the other two are asserted only in jsdom,
which computes no layout. That gap is this change's, not the later one's, and it
is left standing rather than quietly dropped.
