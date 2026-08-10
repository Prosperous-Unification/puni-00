# Verification Report

> Produced by `openspec-verify-change` AFTER apply completes. Failed checks go
> back to the artifact that caused them; then re-run verify.

**Change**: `gantt-height-drag`
**Verified at**: `2026-08-10 12:10`
**Verifier**: Claude (apply session, this change)

---

## 1. Structural Validation

- [x] `openspec validate --all --json` — all items `"valid": true`

```
Totals: 62 passed, 0 failed (62 items)
```

| Item | Type | Issues |
| ---- | ---- | ------ |
| —    | —    | —      |

---

## 2. Task Completion

- [x] Every `- [ ]` in tasks.md is now `- [x]`

| Task | Reason incomplete | Blocks archive? |
| ---- | ----------------- | --------------- |
| —    | —                 | —               |

One deviation from a task's wording, deliberate: 3.1's jsdom pointer sequence
is driven with hand-built `Event`s carrying `pointerId`/`clientY` via
`defineProperty` — jsdom's own PointerEvent takes neither from an init
dictionary — the shape `axisPointer` beside it already uses. And 3.2's test
lives in `gantt-panel.test.tsx` rather than `wbs-table.test.tsx`, beside the
existing fault-boundary fixtures it reuses.

---

## 3. Delta Spec Sync

| Capability   | Sync status | Note                                        |
| ------------ | ----------- | ------------------------------------------- |
| `wbs-domain` | ✗ pending   | synced at archive time, as the peers before |

---

## 4. Failure Proofs

> REQUIRED. Every new or changed safety check gets a row. A check with no proof
> is not done.

| Check (file:line)                                                            | Fault injected                                                                        | Test that observed the failure                                                                           | Result                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| stored-height refusal, `wbs-table.tsx:644`                                   | refusal replaced by `return claimed as number`                                        | `refuses storage that is not a number…`, `…below the floor…`, `…above the ceiling…` (wbs-table.test.tsx) | 3 failed: `expected '10px' to be ''`, `expected '99999px' to be ''`, missing `max-h-[40vh]` |
| reset forgets the height, `wbs-table.tsx:2329`                               | `setGanttHeightPx(null); forgetGanttHeight(…)` deleted from `resetLayout`             | `one reset forgets the widths and the height together`                                                   | failed: `expected '500' to be null`                                                         |
| reset offered on a height override, `wbs-table.tsx:6182`                     | `ganttHeightPx !== null` arm removed from the condition                               | `a height override alone offers the reset…`                                                              | failed: `Unable to find … "Reset layout"`                                                   |
| the drag follows the pointer, `e2e/gantt.spec.ts:1407`                       | `resize.drag(…)` call struck from `onPointerMove`                                     | `gives the chart the screen the pointer asks for…` (Chromium, shifted-port stack)                        | failed mid-drag: `Expected: <= 1.5, Received: 150`                                          |
| the default share is a real CSS class, `gantt-panel.test.tsx:3044` and peers | class glued as `border-tmax-h-[40vh]` (the fault prettier-plugin-tailwindcss shipped) | `keeps its bounded default share…` via `classList.contains`                                              | failed: `expected false to be true`                                                         |

Two negatives were watched **passing** before they were believed, and both
tests were rewritten rather than kept:

1. The e2e drag negative as first written measured the panel only **after**
   `pointerup` — and the release commits the height on its own, so both
   browser tests stayed green with the pointer-follow deleted. The
   measurement moved to mid-drag (`dragTheEdge` returns the in-flight rect),
   and the same fault was then watched failing on `Received: 150`.
2. The jsdom default-share assertion as first written was
   `className.toContain('max-h-[40vh]')` — and the real shipped fault was the
   space in front of the class eaten by `prettier-plugin-tailwindcss` inside
   a template-literal branch, leaving `border-tmax-h-[40vh]`: a string the
   substring check still contains. Found in Chromium by the pre-existing
   `picks the row on Space…` test (the panel had lost its cap and had nothing
   to scroll); the class is built with `cn()` now, the assertion is
   `classList.contains`, and the glued-class fault was watched failing in
   jsdom before the fix was believed.

- [x] Every check in this change has a row
- [x] Each negative test reaches the production call path, not a copy of it
- [x] Filesystem-state distinction: N/A — the boundary here is localStorage,
      whose absent-key and malformed-value cases are both covered above

---

## 5. Gate

- [x] `bunx nx format:check --all` — exit 0
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2` — exit 0
      (45 fe-01 test files, 1065 tests; 21 projects)
- [x] `openspec validate --all --json` — 62 passed, 0 failed
- [x] Browser suite: 112 passed (2.5m) via a scratch Playwright config on
      shifted ports 3111/3211/4211 — the committed config would have reused
      the `~/wd/puni/wbs-tool-v1` dev server holding 3100/3200/4200 (the
      seventeenth-fault landmine, checked with `lsof` before the first run).
      The scratch config is deleted; it is not part of the change.
