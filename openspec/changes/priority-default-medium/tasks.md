<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The default is a rank read from the ladder

- [ ] 1.1 `createWorkItem` reads the project's ladder inside the write and stamps `bands[2].defaultValue` when the command names no priority — test: `plan-commands.test.ts` `a new work item is ordinary by default`, `a re-cut ladder moves the default`, `a renamed middle band still supplies the default`; negative: `bands[2].defaultValue` replaced by the constant `50`, watched failing on the re-cut-ladder case. The label-keyed variant is the second negative: the lookup changed to `bands.find(b => b.label === 'Medium')`, watched failing on the renamed-band case.
- [ ] 1.2 `createWorkItem` gains an optional `priority` distinguishing absent / value / null — test: `plan-commands.test.ts` `an explicit priority is written as given`, `an explicit null creates an unprioritised item`, and the absent case from 1.1; negative: `null` collapsed to absent, watched failing on the explicit-null case.
- [ ] 1.3 The ladder read is inside the create's transaction — test: `work-item.test.ts` `the default priority comes from the project being written to`, with two projects on differently-cut ladders written in one batch; negative: the read hoisted out of the loop, watched failing on the second project taking the first's default.

## 2. Nothing existing moves

- [ ] 2.1 No migration is added. A plan of null priorities is read back unchanged — test: `work-item.test.ts` `an existing plan is unchanged`; this is a check that a thing was **not** done, so its negative is a scratch backfill migration, watched taking the case red and then deleted.

## 3. The ramp

- [ ] 3.1 `BAND_INKS` re-cut per design D3 — test: `priority-band-style.test.ts` `the middle rank is neutral` (asserting rank 2's ink equals the literal grey rank 4 carried, pinned as a string), `the two cool ranks are told apart` (same hue and lightness, chroma differing by at least a stated margin, rank 4 the greater); negative: ranks 3 and 4 set to the same value, watched failing on the chroma margin. A `toBeDefined`-shaped assertion would not see it.
- [ ] 3.2 The four faces are unchanged in code and re-pinned in tests where they assert a colour — test: existing Prio-cell, chart, card and export colour cases updated to the new inks, each pinned as a literal.

## 4. Both palettes, in a browser

- [ ] 4.1 `e2e/` spec reading the computed ink of a rank 2, rank 3 and rank 4 chip in **both** palettes: rank 2 neutral, ranks 3 and 4 distinguishable, all three legible against the page — negative: rank 3 and rank 4 set equal, watched failing in both palettes. A change that edits a shared colour table runs the **whole** browser gate (`AGENTS.md`, `linked-row-hover`).

## 5. Gate

- [ ] 5.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the whole `CI=1` Playwright gate on shifted ports.
