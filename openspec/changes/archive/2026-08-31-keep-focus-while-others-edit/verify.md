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

## The caret itself, in a browser (task 3.3)

Written on 2026-08-30 on a machine that has one. `apps/fe-01/e2e/live-caret.spec.ts`
drives **two browser contexts** — two React apps, two gateway sockets, one project
picked off the bar by the second one — and the peer's rename travels
`POST …/commands` → be-01 → gw-01 → the other session's refetch. Nothing is faked:
the caret is put in the middle of a half-typed name by clicking, typing and walking
back with `ArrowLeft`, and four characters are taken with `Shift+ArrowLeft` so the
box holds an anchor and a `selectionDirection` as well as an insertion point.

**The window is opened deliberately.** The peer renames the typed-in row _first_
(waiting for its `POST …/commands` to answer, so two commands cannot land out of
order) and a bystander row _second_; the caret is read only once the bystander's
new name is on screen in the first session. That name exists nowhere else there,
so it can only come from a refetch issued after both writes landed — which is what
makes the read happen inside the window the fault lives in rather than before it
(`estimate-triple-visible`'s family of five, `AGENTS.md`).

```
$ CI=1 E2E_PORT_SHIFT=1400 bunx playwright test \
    --config apps/fe-01/playwright.config.ts apps/fe-01/e2e/live-caret.spec.ts
  ✓  1 [chromium] › their rename of the row being typed in moves neither the caret nor the text (2.2s)
  1 passed (6.3s)
```

`E2E_PORT_SHIFT=1400`, not the 1100 the instruction sheet carried: the config
**refuses** 1100, because 3100+1100 is 4200 and that is fe-01's own default —
`E2E_PORT_SHIFT=1100 puts a tier on 4200, which is another tier's usual port`. 1400
puts the three on 4500/4600/5600.

The whole browser gate was run rather than the new file alone, for
`linked-row-hover`'s reason: **245 passed, 1 skipped, 3 failed** — the three
failures (`layout.spec.ts`'s folded-step trio and parent-figure slot,
`mobile.spec.ts`'s `Final 3.7 days` reading `Final 4 days`) reproduce identically
with this spec **not in the run at all**, and belong to other agents' in-flight
edits to `wbs-table.tsx` / `wbs-api.ts` in the same working tree.

| Check                                                 | Fault injected                                            | What the run reported                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The caret, the selection and the half-typed text stay | rule 2 of `sync` deleted from `live-editing.ts`           | `- "direction": "backward" / + "none"`, `- "end": 13 / + 15`, `- "start": 9 / + 15`, `- "value": "Strip the wiring in the she" / + "Rewire the shed"`; `focused` and `sameElement` unmoved |
| The box is the same element, and still has the focus  | `key={value}` put on the `<textarea>` in `cell-input.tsx` | the four above with `+ "start": 0 / + "end": 0` instead, plus `- "focused": true / + false` and `- "sameElement": true / + false`                                                          |

The second fault is the value-bearing `key` this change removed from
`wbs-table.tsx`, injected one level down in `cell-input.tsx` because that file was
free to edit and `wbs-table.tsx` was being edited by another agent at the time. It
is the same reconciliation and the same damage; the row it proves is the browser's
half of the table's first row above.

## What this does not cover

- **IME composition.** A composition in progress when a peer's edit arrives is
  held back by the same rule as any other typing, but nothing tests it.
- **A peer's edit to a row nobody is in, while another row holds the caret.** The
  browser spec above passes one through — the bystander rename is what opens its
  window — but that half is not independently falsifiable from any file this
  change owns: the only fault that moves a caret when the focused cell's own value
  has not changed is `columns` in `wbs-table.tsx` losing its memo identity and
  remounting every cell (`LLM_README.md`'s first landmine). That fault was not
  injected, so the claim is carried by the landmine and by the two rows above
  rather than by a watched failure of its own.
- **`readOnly` roll-up cells.** They cannot be typed in, so they never withhold;
  the commit guard in the estimate column still refuses them separately.
