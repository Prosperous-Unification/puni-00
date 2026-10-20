# WBS — task-claimed resources

2026-10-17. Derived from Fable's design note,
`/home/claw/wd/puni/puni-00/notes/resource-claim-release-design-2026-10-17.md`.
Sizes assume the repo's existing gates (h2puni, golden corpus, prod-mode review
on migrations). Each numbered item lands and verifies alone.

**The key finding first:** the request is two features, and the repo already
split them in an approved spec (`CONTEXT-MAP.md`, A12 contract). WBS
**forecasts** resource contention; Twilight Dash **enforces** it at runtime.
Blurring them is the one genuinely bad outcome. Items 1–4 are WBS. Item 5 is
Dash.

---

## 1. Resource declaration surface — no engine effect · ~2–3 days

- 1.1 `resource` directory table — `id`, `name`, `kind` (`exclusive` |
  `divisible`), `unitLabel` (free text: "worktrees", "MB")
- 1.2 `project_resource_capacity`, keyed `(projectId, resourceId)`, mirroring
  `projectTeamCapacity` field for field — including "absent = unstated =
  constrains nothing" and the Remembered-capacity third state
- 1.3 `work_item_resource_demand` satellite — `(workItemId, resourceId, units)`,
  stored like `workItemTeam`, written through the existing Command batch
- 1.4 Undo via the Command journal with Preconditions (no new conflict
  machinery — reuses what teams already use)
- 1.5 Resources cell in the grid + a Resources section in the existing Project
  settings modal
- 1.6 Plan export and the Plan document carry demands

**Value on its own:** demands are authored, exported and visible. This is the
declaration surface Dash later reads.

## 2. Fast engine levels demands · ~3–4 days

- 2.1 `slicesOf` emits the demand vector per slice
- 2.2 `ScheduleInput` + canonicaliser + Input hash, contract bump
- 2.3 Golden-corpus no-op proof (no demands ⇒ byte-identical schedules)
- 2.4 Per-resource units through `jointWindowFor` / `reserve`
- 2.5 `boundBy` sentences name the blocking resource

**Value:** dates now move under contention. The feature exists after this item.

## 3. Optimized (CP-SAT) parity · ~2–3 days

- 3.1 Solver wire-format bump
- 3.2 `model.py` clause 4 generalised — one `AddCumulative` per resource,
  demand = units
- 3.3 Re-validator updated
- 3.4 Fixtures in both suites
- 3.5 Materialiser proof

**Ship this directly behind item 2** so the two engines never read different
constraint sets for long. In the gap they agree on hash and differ only in
quality; the publication guard already covers floor cases.

## 4. Explanation and reading surfaces · ~1–2 days

- 4.1 Gantt hover sentence for resource waits (sibling of `capacityFloorWords`)
- 4.2 A filter facet per resource
- 4.3 Directory usage / removal refusals, following the existing
  "Directory usage" pattern

## 5. Runtime enforcement — Twilight Dash · not sized

Already specced in `openspec/changes/twilight-control-plane/design.md`
(§Admission, lines 548–563): atomic vector reservation before launch, occupancy
counted from reservation, drain-gated preemption, starvation reported
separately from resource blocking.

- 5.1 Generalise the existing `solver_slot` lease machinery
  (`schema.ts:2327`) — it already has fencing `attemptToken`, heartbeats,
  `admittedDeadlineAt` reclamation and two-phase cancel-and-drain
- 5.2 Pools for agent slots, worktrees, disk budget, reviewer/build/browser
  slots
- 5.3 Measured-usage receipts written back to the plan
- 5.4 Receipts shown read-only on work items — "held wt-7 for 3h12m, peak tmp
  410 MB". **History, never schedule input.**

Depends on twilight-control-plane Tasks 2/9, not on items 1–4.

## 6. Explicitly NOT in v1

- `renewable` resources (hours-per-week) — the only kind needing new engine
  mathematics on both sides
- Any lease / holder / heartbeat state in WBS tables
- Cross-project leveling (both engines schedule one project in isolation; two
  projects each told "1 staging env" both plan as if they own it — that limit
  is stated, not hidden)
- Demand inheritance down the tree
- Per-step demands
- Preemption vocabulary
- Named exclusive units in planning (Slot rule: "counted, never named")
- Agents writing demands (demands are authored plan data; Dash writes receipts)
- Any implicit unit conversion (A12 forbids it)

---

## Totals

| Scope                         | Size                           |
| ----------------------------- | ------------------------------ |
| Items 1–2 (feature exists)    | ~5–7 days                      |
| Items 1–4 (complete WBS half) | ~8–12 days                     |
| Item 5 (Dash)                 | larger pending change, unsized |

## Decisions needed from Dany

1. **Which half first?** Default: WBS items 1–2 first, because Dash's control
   plane is the larger pending change. If the real itch is "agents must not
   fight over worktrees _right now_", that is item 5 alone and zero WBS change.
2. Directory-wide resource identity + per-project capacity? **Default: yes**
3. Exclusive units counted, never named, in the plan? **Default: yes**
4. `renewable` deferred until someone asks with a use case? **Default: yes**
5. Should **done** work items release their occupancy? Today the engine reads
   no status, so done slices still occupy pools. This predates resources and
   moves dates on existing plans the day it ships. **Default: file as its own
   change; demands inherit whatever slices do.**
