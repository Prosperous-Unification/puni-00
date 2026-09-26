## 1. Create a child from the row and card

- [ ] 1.1 Add failing menu tests for leaf, parent, frozen parent, mobile card, last-child order, success focus and failed-create focus.
- [ ] 1.2 Add Add child to both menus using the existing create command. After success, open the parent and ancestors and focus Name. Keep one undo and first-child hand-down; test both with a failing case before implementation.
- [ ] 1.3 Inject omitted ancestor expansion and omitted hand-down; watch the focused tests fail, restore, and add adjacent Proof: comments.

## 2. Keep a flat plan out of collapsed-all

- [ ] 2.1 Add a failing test that presses Collapse all on a flat plan, creates its first child, remounts, and sees that child; assert no no-nested hint and no new collapsed preference.
- [ ] 2.2 Make flat-plan toolbar actions disabled or inert without a hint, preserving filtering behavior and nested-plan expansion.
- [ ] 2.3 Inject the old unconditional empty-map write; watch the first-child/remount test fail, restore, and add an adjacent Proof: comment.

## 3. Verify

- [ ] 3.1 Run focused component and browser tests, format, lint, typecheck, OpenSpec validation and the applicable host gate. Record outcomes and witnessed R5 faults in verify.md.
