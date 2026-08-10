# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   202 pass  0 fail (5 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
17 items, 0 invalid — notes-and-wrap valid
```

## The check, and the fault that broke it

| Check                                                   | Fault injected                                                       | What the run reported                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A note's HTML is text, not markup (`notes-preview.tsx`) | `<Markdown>` swapped for `dangerouslySetInnerHTML={{__html: notes}}` | 2 tests failed, including `renders a script in a note as the text somebody typed` — the `<img>` was in the DOM; restored, 80 pass |

That fault is the whole reason the renderer is `react-markdown` without
`rehype-raw` rather than a markdown-to-HTML string. Notes are written by one
person on a project and read by everyone else on it.

The wrapping half is watched by the element itself (`name.tagName` is
`TEXTAREA`) and by the row count changing on focus and back on blur. The
existing keyboard suite — 200-odd assertions over Tab, Shift+Tab, Backspace and
the arrows — is what proves the change did not break the structure keys: those
guards used to test for `HTMLInputElement` and every one of them failed loudly
when the Name cell became a textarea, before the guards were widened.

## What is not watched here

Whether the wrap _looks_ right: column widths, where the popover lands, whether
eight rows is too many. jsdom has no layout. Needs Dany's screen at
<https://dev.wbs.bulletpoints.club>.
