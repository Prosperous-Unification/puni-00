# design — `step-node-readings`

Interview: `puni-plan/batch-10/interviews/020.10-answers.md` Q1, Q7 (the additive half), Q10.
No ADR: the stored vocabulary does not move (ADR 0045 records why `failed`, `waiting` and
`skipped` are not statements).

## D1 — The reading in `@wbs/domain`

`node-reading.ts`: `NODE_READINGS = ['skipped', 'done', 'on_hold', 'blocked', 'in_progress',
'blocked_by_proxy', 'waiting', 'unknown']` and

```
nodeReadingOf({
  participation: 'included' | 'skipped' | null,   // null until 010.4.13.3 stores it
  statement: StepState | null,
  rowHold: Hold | null,
  runningAttempt: boolean,
  rowBlockedByProxy: boolean,
  predecessors: readonly NodeReading[],            // the node's predecessors in the step graph
}): NodeReading
```

first match winning in the order above; `waiting` requires `predecessors.length >= 1` and
every predecessor `done`. Predecessors come from the resolved step-node graph
(`resolveStepNodeGraph`, workflow and authored edges into the node), so the reading follows
whatever the graph says and never re-derives step order. Shared by be-01 (the wire) and fe-01
(a filtered table folds its own subset), exactly as `leafStatusOf` is.

## D2 — The fold's additive extension

`workedStepsOf(estimates, actuals, stated)` gains `attempts`: a node with any attempt row
holds work. `rollUpProgress` reads a running attempt as `in_progress` for its node when the
node has no statement. Nothing else about the fold moves; `fold-over-included-nodes` owns the
step-set change. On the dev store no attempts exist before this change, so no leaf's status
moves; `verify.md` records the count (expected 0).

## D3 — Wire

The work-item read adds `readings: { [stepId]: NodeReading }` for leaves. `skipped` is in the
contract's union now so a later reader cannot meet a word its `Record` cannot name; the
mounted test asserts no `skipped` is produced while participation is null.

## D4 — Glyphs

`NODE_READING_GLYPH` in fe-01 reuses `STATUS_GLYPH` for the shared words (`○` unknown, `◐`
in progress, `✓` done, `‖` on hold, `⊘` blocked, `⊖` blocked by proxy) and adds `◇` waiting
and `∅` skipped. The interview's `⊖` for skipped collided with blocked-by-proxy (statuses task
6.4, 2026-09-29); the component test "every reading has its own glyph" is what decides, and
`∅` ("not part of the work") is the replacement. Palette tokens follow `STATUS_TOKEN` for
shared words; waiting takes the ready token's hue at the in-progress lightness, skipped the
muted proxy chroma. The glyph sits in the step cell's top-right corner, 10 px, with an
sr-only `Reading: Waiting`; the cell card's first line is the reading word, then `3 attempts,
last failed`, then the latest attempt's executor and reference.
