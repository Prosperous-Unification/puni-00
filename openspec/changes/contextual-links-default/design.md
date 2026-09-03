# design — `contextual-links-default`

## Context

`rememberedHiddenColumns(projectId)` currently maps an absent
`wbs.hiddenColumns.<projectId>` key to one static `DEFAULT_HIDDEN_COLUMNS` list.
`resetLayout()` deletes that key and restores the same list. `columnsDiffer`
also compares against it, so initial state, stored choice and reset target are
one concept in three places.

The client already holds the correct project-wide input. `flat` walks every row
from the last successful `api.tree(projectId)` read before TanStack applies
collapse or `narrowTree` produces `shownRows`. Deleted work items are absent
from that read, and a live row's `externalRefs` is an array.

## Decisions

### D1 — three states have an explicit precedence

The visible column set is resolved in this order:

1. a valid `wbs.hiddenColumns.<projectId>` list — an explicit Columns toggle or
   saved view;
2. a valid local `wbs.linksResetShown.<projectId>` marker — exactly the JSON
   boolean `true`, meaning the last full-table reset showed Links;
3. the first-visit baseline — Links hidden.

Rename the static baseline to `INITIAL_HIDDEN_COLUMNS` and add `refs` to its
current `team`, `service`, `type` members. A pure
`resetHiddenColumns(hasAnyExternalRefs)` returns that list without `refs` when
true and unchanged when false.

Any explicit column writer stores the whole current hide-list and clears the
reset marker, so there is one authority. Applying an old saved view with no
column set changes neither. Project switching reads the same precedence whole.
The marker uses `remembered(key, (value) => value === true)`; `false`, strings,
numbers, objects and malformed JSON are invalid and removed by the existing
`Remembered` boundary.

### D2 — Reset stores one semantic exception, not a layout snapshot

At the click, full-table Reset evaluates:

```ts
const hasAnyExternalRefs = flat.some((row) => row.externalRefs.length > 0);
```

It deletes the explicit hidden-column key, restores the contextual target in
state, and writes `wbs.linksResetShown.<projectId> = true` only when the target
shows Links; the hidden target needs no marker and removes a prior one. Width
and Gantt keys remain forget-only.

This deliberately narrows the older absolute rule that Reset writes no column
snapshot. Without one durable bit, Reset can show Links, a reload sees no
stored layout, and the first-visit rule immediately hides it again. Persisting
the single reset outcome is the minimum state that satisfies both reload
stability and “link changes wait for the next reset”; storing the full hide-list
would freeze unrelated defaults.

### D3 — link data changes the reset target, never the layout

There is no effect from `hasAnyExternalRefs` into `storedHiddenColumns`.
Adding or removing refs may change whether Reset is offered, but cannot mount
or unmount Links. Filtering, collapsing and scrolling change neither the target
nor the layout.

Reset reads the last successful whole-tree snapshot in the render that handled
the click. A write still in flight is not in that snapshot. A later refresh may
change the next reset target, not the result already chosen. JavaScript event
ordering therefore supplies a deterministic boundary without a server request
or race-prone second read.

Before the current project has produced its first successful tree read, the
full-table Reset control is unavailable rather than treating the initial empty
array as a confirmed empty project. A successful empty read enables the normal
hidden target. After any success, a failed refresh keeps Reset based on that
last successful snapshot, consistently with the stale-tree screen.

### D4 — the reset predicate compares against today's contextual target

`columnsDiffer` compares the current hidden set with
`resetHiddenColumns(hasAnyExternalRefs)` as sets. Consequences are intentional:

- a first visit to a project that already has refs hides Links and offers Reset,
  because Reset would show it;
- after Reset, the control disappears when no width or Gantt override remains;
- a later first/last link can make Reset appear, but the column stays put until
  it is pressed;
- an explicit layout equal to the current target offers no no-op reset.

### D5 — width, pinning, mobile and collaborators stay derived

Links keeps id `refs`, width 40 and its position between Number and Name.
`frameLayout` receives only visible leaf ids, and `pinnedGeometryFor` already
skips a pinned id absent from them. Hidden Links therefore moves Name's sticky
left edge left by exactly 40px; shown Links restores the present geometry. No
width constant is rebalanced.

The default argument of `foldedTableMinWidth` uses
`INITIAL_HIDDEN_COLUMNS`; runtime callers continue passing the current hidden
set. Thus a first visit is 40px narrower, while reset-with-refs has today's
folded width.

Phone cards still render no Links field. Columns remains an explicit local
preference inside Plan actions for a later table viewport, while the phone's
existing Gantt-only Reset layout neither computes nor stores the Links target.
Each collaborator evaluates shared project data only when pressing their own
full-table reset; both preference keys remain per project, per browser and are
never sent to be-01.

## Risks / Trade-offs

- The marker is a narrow exception to reset's forget-only rule. The alternative
  visibly reverts the reset on reload and is rejected.
- The Reset button can appear after link data changes even though the table does
  not. That is the required affordance for an available recomputation.
- A stale-tree banner means Reset uses the last successful tree on screen. It
  does not claim fresher server state than the rest of the page has.
