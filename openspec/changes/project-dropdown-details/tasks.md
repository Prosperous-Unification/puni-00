<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Vocabulary

- [x] 0.1 Add `project entry`, `entry meta` and `project owner` to
      `CONTEXT.md` in the `CONTEXT-FORMAT.md` shape, each with its `_Avoid_`
      line, before the code uses the words

## 1. be-01 names the owner in the list

- [x] 1.1 `listFor` left-joins `users` on `project.ownerId` and selects
      `users.username` as `ownerName`; `ProjectWithAccess` gains the field —
      test: `project.test.ts` lists projects owned by two accounts and asserts
      each entry's own owner, plus an unopened project still ordered last
      (the existing NULLs-last test must stay green — the join must not turn
      into an inner join on `project_access`)
- [x] 1.2 A dangling owner id throws instead of vanishing or blanking — the
      join is a LEFT JOIN precisely so the absent row is visible rather than
      dropped, and a null `ownerName` is malformed stored data — test:
      `project.test.ts` inserts a project whose owner id names no account
      (`PRAGMA foreign_keys=OFF` around the insert, the boundary named in the
      test) and asserts `listFor` throws; negative: with the null check
      deleted the list answers an entry whose owner is blank, watched, then
      restored; `Proof:` comment on the check names this test and that fault
- [x] 1.3 The owner costs no second query — test: `project.test.ts` seeds 50
      projects and counts statements through a counting Drizzle logger,
      asserting one; negative: with the join replaced by a per-project
      `findByUsername` the count is 51, watched failing, then restored
- [x] 1.4 Response-shape tests on all three routes, **containment not
      equality** — test: `project.controller.test.ts` asserts each response
      contains at least the fields that route really sends (create: the whole
      project it wrote plus its starting roles; a list entry: the picker's six
      **and** the `ownerId`, `estimateMethod`, `startDate`, `revision` it has
      always carried; the read route: what it carried before) plus the two
      absences that are claims — `lastOpenedAt` absent from create,
      `ownerName` absent from the read route. No exact key-set assertion:
      the wire keeps its other fields and an exact set would be a lie about it
      that also breaks on the next unrelated field; negative for the list
      case: with the `ownerName` select removed the list-entry assertion
      fails, watched

## 2. fe-01 splits the type

- [x] 2.1 `ProjectSummary` is replaced by `ProjectListEntry` — id, name,
      restricted, lastOpenedAt, ownerName, createdAt — on `listProjects`, and
      by `CreatedProject` — id, name, restricted, and no `lastOpenedAt`, which
      the create route has never sent — on `createProject`. Each is what fe-01
      **reads** of a response that carries more (be-01 sends the whole project
      either way); the JSDoc on both says so, so nobody later reads the type as
      the wire and deletes a field from be-01 to match. `ProjectPage`'s state
      and `matchingProjects`' `PickableProject` constraint follow — test:
      `bunx nx typecheck fe-01` is the proof, and it is only a proof because
      the test factories move with it (2.2)
- [x] 2.2 `fakeProjects` in `project-page.test.tsx` builds `ProjectListEntry`
      values with real `ownerName`/`createdAt`, and its `createProject`
      returns a `CreatedProject` — test: the existing project-page suite, all
      of it, green on the new shapes; the create path asserts the page still
      selects the created project from a response carrying no last-opened time

## 3. The entry says who and when

- [x] 3.1 The `<li>` renders the name plus a muted `(ownerName · shortInstant)`
      span; `createdAt` is epoch milliseconds, which is why it is
      `shortInstant` and **not** the `shortIsoDate` the table's Start, End and
      Not before cells use — those are zone-free calendar days, and the two
      formatters are chosen by the type of the value rather than by the
      surface. The meta is inside the option, so it is part of the accessible
      name — test: `project-page.test.tsx` two same-named projects with
      different owners are two distinguishable options by accessible name;
      a project created in another year shows the year, one created this year
      does not (both sides of the boundary, `shortInstant`'s own rule not
      re-implemented here); `optionNames()` expectations updated to the new
      text
- [x] 3.2 Filtering stays name-only — test: `project-picker.test.ts` typing an
      owner's username that appears in no project name offers nothing, and
      typing part of a name still offers it; negative: with the filter widened
      to include `ownerName` the first assertion fails, watched, then reverted
      (this is the recorded non-goal made breakable)

## 4. The listbox is bounded (browser)

- [x] 4.1 The listbox caps its width to the viewport and the entry's inner
      spans get `min-w-0` + `truncate`; the `<li>` carries the full name and
      meta in `title`. `whitespace-nowrap` stays — the truncation, not
      wrapping, is what keeps one entry one line
- [x] 4.2 The worst case be-01 permits is proven in Chromium — test:
      `e2e/header.spec.ts` registers an account whose username is 32 `W`s
      (`USERNAME` is `/^[a-zA-Z0-9_-]{3,32}$/`, so 32 wide ASCII glyphs is the
      widest name that can exist, not a CJK string), creates a long-named
      project, opens the picker at each of `FIT_WIDTHS` (1280, 1024, 900) and
      asserts the listbox's right edge is inside the viewport and
      `documentElement.scrollWidth <= clientWidth`; **precondition first**:
      the entry's `scrollWidth > clientWidth`, so the seeded case really does
      overflow — without it the bound assertion passes on a short string and
      proves nothing (the sixteenth fault's shape); negative: with the cap
      removed the assertion fails at every one of the three widths, watched,
      then restored; `Proof:` comment names the fault and this test.
      `FIT_WIDTHS` is `header.spec.ts`'s own constant for the widths the **bar**
      must stay one row at, and it stays that: nothing here reads `frameLayout`
      or a column width. The table cannot widen the document — it scrolls
      inside `TABLE_FRAME` — so the picker's bound is independent of T2's
      widths, and `header.spec.ts` measures the chrome while `layout.spec.ts`
      measures the columns, which is the split that file's own header states
- [x] 4.3 The full text survives truncation — test: same spec asserts the
      entry's `title` holds the whole name and meta while its rendered text is
      clipped, and that a short-named project owned by a short-named account
      is not clipped at all; negative: with `title` dropped the assertion
      fails, watched

## 5. Gate

- [x] 5.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` green; `verify.md` records commands,
      results, and the failure-proof table for every negative above
- [ ] 5.2 Deploy to dev and Dany looks at the dropdown
