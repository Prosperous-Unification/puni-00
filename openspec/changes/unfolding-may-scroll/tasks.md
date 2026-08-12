# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5). The fault numbers are `verify.md`'s.

## 1. The one writer

- [x] `toggleRole` adds and removes rather than replacing. It is the only
      writer, which is why the rule it keeps is stated on the state it writes.
- [x] The JSDoc on `unfoldedRoles` says what the arithmetic still is — 96px
      folded, 348 open, 1219 for two folded and 1723 for two open — and what
      the change decided to spend the frame's scrollbar on.
- [x] The fold button stops promising that any other role folds and says what
      unfolding may now cost instead.

## 2. The unit tests, superseded by name

- [x] `unfolds one role at a time, so the table still fits the window` becomes
      `unfolds each role on its own, and leaves the others open`: both open,
      the declared minimum at 1723, then folding one and leaving the other.
      Fault 1, watched.
- [x] The fold button's copy test asserts the new sentence and the absence of
      the old one.
- [x] A both-open keyboard walk: Tab through the second open role's four cells
      and on into the next row, and the motion chords across the boundary
      between the two roles.

## 3. The browser, which is the only thing that can see the scroll

- [x] One browser case for both open roles: both open at both matrix widths,
      the equation asserted past the frame first so the scroll claim cannot go
      vacuous, the page asserted not to scroll, and the three pinned columns
      measured against the layout's own offsets after a real scroll. Fault 1,
      watched.
- [x] The one-role case keeps measuring one role: it used to rely on the
      accordion folding the other, and it folds it by hand now — by the
      button's **exact** name, because an accessible name is matched as a
      substring and `Fold QA estimates` finds the Unfold button too.
- [x] The folded matrix is untouched, which is the guarantee this change does
      not weaken.

## 4. Everything that said at most one, enumerated

- [x] `table-frame.test.ts`'s equation comment, the every-phase fixture's
      comment, the phase-removal test's, and the drafts sanitizer's finding —
      each one rewritten where it stood rather than left describing an
      accordion.
- [x] `docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md` gains the
      addendum its fit language needs: the guarantee is the folded one.
- [x] The spec delta removes the old requirement by name, with the reason and
      the migration, and adds the one that replaces it.

## 5. The gate

- [x] fe-01's unit suite under a real node on h2puni.
- [x] The browser suite in the Playwright image on h2puni.
- [x] `format:check`, `lint` and `typecheck` on h2puni.
- [x] CI green: the whole gate plus the pixels job.
