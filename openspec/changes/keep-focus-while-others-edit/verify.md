# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   638 pass  0 fail
      fe-01 (vitest)                         136 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/keep-focus-while-others-edit
Totals: 10 passed, 0 failed (10 items)
```

## Every check, and the fault that broke it

| Check                                                         | Fault injected                                        | What the run reported                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The input is not replaced (`wbs-table.tsx`)                   | `key={`${id}-${name}`}` restored on the name cell     | only `survives their edit landing in the very field being typed in` failed — a different element, holding the peer's value |
| A new server value reaches the cell (`cell-input.tsx`)        | the `input.value = latest.current` assignment deleted | only `shows their edit in a cell nobody is typing in` failed — the cell still read `Strip`                                 |
| A blur that changed nothing writes nothing (`cell-input.tsx`) | `input.value !== shown.current` replaced with `true`  | only `sends nothing when a cell is left without being typed in` failed — one PATCH of a name nobody typed                  |

### One check that was removed rather than proved

`onBlur` first carried a second condition, `edited && input.value !== shown`, with
`edited` read from the `typed` ref. Removing it failed nothing, and it could not
be made to: `typed` is only ever false when `sync` has already brought the node and
`shown` into agreement, so the value comparison alone decides every case. It was
deleted rather than kept as an unfalsifiable guard — which is the same rule that
put the other three rows in this table.

## What this does not cover

- **A real browser's caret position.** jsdom reports focus but has no caret of its
  own, so `document.activeElement` is what the tests assert. That the caret stays
  at character 17 of a half-typed word, rather than merely that the element keeps
  focus, has not been watched anywhere.
- **Two real clients.** The peer's edit is delivered by calling the subscription's
  `onChange` against a fake API, not by a second browser over a socket. Task 3.2
  is that, on dev, and is not done.
- **IME composition.** A composition in progress when a peer's edit arrives is
  held back by the same rule as any other typing, but nothing tests it.
- **`readOnly` roll-up cells.** They cannot be typed in, so they never withhold;
  the commit guard in the estimate column still refuses them separately.
