## 1. Create a child from the row and card

- [ ] 1.1 Add failing menu tests for leaf, parent, frozen parent, mobile card, last-child order, success focus and failed-create focus.
- [ ] 1.2 Add Add child to both menus using the existing create command. After success, open the parent and ancestors and focus Name. Keep one undo and first-child hand-down; test both with a failing case before implementation.
- [ ] 1.3 Inject omitted ancestor expansion and omitted hand-down; watch the focused tests fail, restore, and add adjacent Proof: comments.

## 2. Keep a flat plan out of collapsed-all

- [ ] 2.1 Add a failing test that presses Collapse all on a flat plan, creates its first child, remounts, and sees that child; assert no no-nested hint and no new collapsed preference.
- [ ] 2.2 Make flat-plan toolbar actions disabled or inert without a hint, preserving filtering behavior and nested-plan expansion.
- [ ] 2.3 Inject the old unconditional empty-map write; watch the first-child/remount test fail, restore, and add an adjacent Proof: comment.

## 3. Make drag into a parent legible and recoverable

- [ ] 3.1 Add failing drag-zone tests for middle-to-last-child, tinted target and indented “Move under 010 · Release” cue, edge insertion lines and stable target while the layout opens.
- [ ] 3.2 Add failing timer tests: valid collapsed parent opens after about 600ms; exit/cancel clears the timer and restores transient expansion; success retains expansion. Implement with the existing top/middle/bottom planner.
- [ ] 3.3 Add failing refusal tests for self/descendant and dependency-invalid reparenting, concurrent tree edits, server refusal, frozen-number label preservation and one-command undo. Restore preview and explain refused writes.
- [ ] 3.4 Add failing keyboard/mobile tests for arbitrary-destination Move under… parent picker. Preserve Alt+Right and Alt+Left behavior and implement the picker.
- [ ] 3.5 Inject stale-hover timer, rejected-write preview retention and self-drop acceptance; watch the production-path tests fail, restore and add adjacent Proof: comments.

## 4. Verify

- [ ] 4.1 Run focused component and browser tests, format, lint, typecheck, OpenSpec validation and the applicable host gate. Record outcomes and witnessed R5 faults in verify.md.
