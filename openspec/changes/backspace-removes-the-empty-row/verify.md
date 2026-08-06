# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   174 pass  0 fail (3 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
14 items, 0 invalid — backspace-removes-the-empty-row valid
```

## The check, and the fault that broke it

| Check                                                 | Fault injected                                          | What the run reported                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Only a wholly empty item is removed (`wbs-table.tsx`) | the `input.value === ''` condition deleted from `empty` | only `anything the item holds vetoes the backspace removal` failed — `api.remove` fired on a row with text in its Name; restored, all 174 pass |

The other four vetoes — notes, an estimate, a child, a dependency — are each
held red-able by that same test: it puts exactly one kind of content on each of
four otherwise empty root rows and watches `api.remove` stay silent for all of
them, so deleting any one condition from `empty` turns it red. The
nested-row case has its own test watching both behaviours at once: the row
outdents, and `api.remove` is not called.

## What jsdom models and what it does not

Same standing gap as `backspace-outdents`: the caret is `setSelectionRange`,
faithful in jsdom for text inputs, and the focus landing on the row above is
`document.activeElement` under jsdom's focus model. A real key in a real caret
needs Dany's screen at <https://dev.wbs.bulletpoints.club>.
