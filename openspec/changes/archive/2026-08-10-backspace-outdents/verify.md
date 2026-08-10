# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   477 pass  0 fail
      fe-01 (vitest)                         168 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
12 items, 0 invalid — backspace-outdents valid
```

## The check, and the fault that broke it

| Check                                                 | Fault injected                                        | What the run reported                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Only a start-of-text caret outdents (`wbs-table.tsx`) | the `!caret.atStart` condition deleted from the guard | only `backspace anywhere else, or over a selection, stays a backspace` failed — `api.move` was called from mid-text; restored, 3 pass |

The selection and root-row conditions are each held red-able by the same test
pair: the selection case anchors a selection at position 0 (so `atStart` alone
would pass it through), and the root case puts the caret at 0 on a row with no
parent.

## What jsdom models and what it does not

The caret here is `setSelectionRange`, which jsdom implements faithfully for
text inputs — the tests drive the same `selectionStart`/`selectionEnd` fields
`caretOf` reads in a browser. What no test on this box watches is a real key
in a real caret; that remains the standing browser gap named in
`pick-deps-and-keep-the-project/verify.md`, and it needs Dany's screen at
<https://dev.wbs.bulletpoints.club>.
