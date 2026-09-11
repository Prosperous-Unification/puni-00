# Verify

Not started. Designed 2026-09-10 on Dany's ask; implementation has not begun, and this
file is written when it has.

## Failure-proof table

| Check | Fault injected | Test that observed it | Result |
| ----- | -------------- | --------------------- | ------ |

## Measurements

| Figure                                                       | Before the control   | With the control | Pin  |
| ------------------------------------------------------------ | -------------------- | ---------------- | ---- |
| folded toolbar, 1280×900 (`layout.spec.ts`)                  | 1552.73 (2026-08-30) | —                | 1600 |
| `[data-toolbar]` laid out, 1280 (`project-settings.spec.ts`) | —                    | —                | 1265 |

## The corpus cannot see the tie-break

Task 2.6 planned one negative for `goesFirst`'s move from the number string to
`treeOrder`: reverse the order deliberately and watch the eight golden-corpus plans go
red. Watched **passing** on 2026-09-11 — and so was the entire domain suite, 629 tests,
with every work item's place inverted.

It had to. That rule is the sixth of eight and is reached only by two slices tying on
slack, deadline, priority, CPM start and float while competing for one person; no corpus
plan holds such a pair. A _consistent_ reversal is also still a total order derived from
the tree, so the determinism cases — which assert only that two row orders agree — cannot
see it either. R5 #28's lesson, second outing: an injected fault that is not the fault
proves nothing, and it looks exactly like a proof.

What the corpus does prove is the half that matters for shipping: `deriveNumbers` and the
engine answer byte-for-byte what they answered before, on plans whose frozen labels ascend
along position.

The tie-break's own witnesses are two, both watched on `629 pass / 2 fail`:

| Witness                                                                                                              | What it sees                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `schedule-priority.test.ts` › `gives the person to the work item that reads first, not to the smaller number`        | two roots frozen `030`/`010` against positions 10/20, tied on every rule above the sixth |
| `canonical-schedule-input.test.ts` › `two frozen numbers that contradict position, which no longer reorder anything` | fails the moment frozen numbers start moving placements again                            |

## Fixed point (D10)

Seeds run: —. Counterexamples: —.

## Gate

Pending: the by-name runs, the whole workspace gate, `openspec validate --all --json`, and
the whole browser gate on shifted ports, as `tasks.md` § 7 lists them.
