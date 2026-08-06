## 1. The rule, ported

- [x] 1.1 `dep-graph.ts`: `indexDepGraph` + `refusalFor` — a port of be-01's
      `canDepend`, `indexTree` and `expandToLeaves`, answering `self`,
      `ancestor`, `descendant`, `cycle` or nothing. `ancestor`/`descendant`
      split one of be-01's words in two because the dropdown writes a
      different sentence under each; everything else answers exactly as
      `canDepend` does.
- [x] 1.2 `dep-graph.test.ts`: every `canDepend` case from
      `apps/be-01/src/service/dependency.test.ts`, copied with its expectation
      and folded back to be-01's vocabulary before comparing — the two rules
      cannot drift without a red test. Plus the direction, `self`, and the
      throw that replaces be-01's `not_found`.
      **Negative test:** the tree expansion dropped — 4 cases failed, the two
      cross-review examples among them. **Negative test:** the two ancestor
      calls swapped — `says which way round an ancestor edge runs` failed
      alone.

## 2. The list

- [x] 2.1 `pickerEntries` returns `PickerEntry`s carrying `refusal`, narrowing
      first and asking the graph only about what survives. Its JSDoc records
      the reversal of the decision it used to state.
- [x] 2.2 `wbs-table.tsx`: greyed rendering, `aria-disabled`, the reason
      suffix from an exhaustive `REFUSAL_SUFFIX`, a click that returns, and a
      `pickable` list that the arrows and `aria-activedescendant` both use.
      **Negative tests:** the arrows given every entry, the click guard
      removed, `activeOption` resolved over every entry, `aria-disabled`
      dropped — one or two named tests failed under each.

## 3. What stays as it was

- [x] 3.1 The typed path untouched: `010, 020` is still sent, still partially
      succeeds, still reports be-01's refusals. Its tests are unchanged and
      still pass.
- [x] 3.2 Nothing cached: the graph is rebuilt from the rows on every call, so
      a refetch regrades an open list. Proven by the peer-edit test.
- [x] 3.3 `CONTEXT.md` gains **Dependency** and **Refused dependency** — the
      glossary had neither, and this change puts the second one on screen.

## 4. Gate

- [x] 4.1 Format, run-many uncached, `openspec validate` — in `verify.md`.
- [ ] 4.2 Deploy to dev; Dany looks. (Not run here — the tree is left dirty
      for review.)
