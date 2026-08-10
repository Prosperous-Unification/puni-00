## 1. The fold

- [x] 1.1 `unfoldedRoles` state and toggle; the role's final column carries
      the control and never moves; trio and assignee columns exist only while
      unfolded; trio headers lose the role-name prefix.
- [x] 1.2 `columns` depends on `[roles, unfoldedRoles]`, with the remount cost
      documented at the dependency list and in the proposal.
- [x] 1.3 The folded figure carries the trio's complaint, red with the reason.

## 2. Tests

- [x] 2.1 Folded by default; unfold shows trio+assignee and leaves the other
      role folded; fold hides them again.
- [x] 2.2 A draft survives fold/unfold unsent. **Negative test:** drafts
      dropped from state — 10 tests failed, watched.
- [x] 2.3 The complaint survives the fold. **Negative test:** marker
      hard-coded away, watched failing.
- [x] 2.4 Every existing estimate/assignee/keyboard test unfolds first, as a
      person would; the tab tests unfold before typing, since the remount
      resets an uncommitted name.

## 3. Gate

- [x] 3.1 Format, run-many gate, `openspec validate` — in `verify.md`.
- [x] 3.2 Deploy to dev; Dany looks.
