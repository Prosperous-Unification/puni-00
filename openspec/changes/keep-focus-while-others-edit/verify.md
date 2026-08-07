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

## On dev, with two real clients

Deployed to dev at `fb5d54a` (`bin/dev-deploy.sh`; app shell 200, be-01 and gw-01
answering, auth routes mounted). Two accounts, two real sockets through the real
edge, both subscribed to one project:

```
  [ada  ] <- {"type":"presence","users":["ada","grace"]}
  [grace] <- {"type":"presence","users":["ada","grace"]}
grace renamed it — waiting for ada's socket
  [ada  ] <- {"subscription":"project:b209096b…","seq":1,
              "message":{"type":"work_items_changed","workItems":[{"id":"a9b90399…
ada's socket received the change: true
the row now reads: "Rewire the shed"
```

That is the path the fix rides on: a peer's edit reaching the client that has to
survive it, on the deployed build rather than against a fake.

## What this does not cover

- **A real browser's caret position.** This is the gap, and it is the whole
  point of the change. jsdom reports focus but has no caret, so the tests assert
  `document.activeElement`; the dev run above proves the edit arrives but has no
  DOM at all. h1claw has no browser and no Playwright, so nobody has yet watched a
  caret stay at character 17 of a half-typed word while somebody else renamed the
  row. Task 3.3.
- **IME composition.** A composition in progress when a peer's edit arrives is
  held back by the same rule as any other typing, but nothing tests it.
- **`readOnly` roll-up cells.** They cannot be typed in, so they never withhold;
  the commit guard in the estimate column still refuses them separately.
