# Tasks

Ordered TDD slices. Each negative watched failing before the line it guards is
believed (R5).

## 1. The caret gets a gutter

- [x] `CARET_GUTTER_PX` in `table-frame.ts`, with why the 93px envelope already
      pays for it.
- [x] The Number cell wraps its caret in a span of that width, rendered on every
      row.
- [x] The frozen 🔒 moves after `[data-number]`.

## 2. Initials

- [x] `initialsOf` in its own module: two words give a letter each, one word its
      first two letters, upper case, and an empty name throws (R5).
- [x] Unit tests, five negatives watched.
- [x] ~~A `title` on the folded assignee carrying the whole name.~~ **Reverted.**
      `leaves the assignee no title of its own to say it twice` is a decision
      from 2026-08-09 and the hover card already names them in full. The spec
      was corrected to keep the decision rather than reverse it.
- [x] The folded role cell prints `initialsOf(...)`, bracketed and muted where
      assumed, and drops the `maxWidth: 60%` / `text-overflow: ellipsis` it no
      longer needs.
- [x] The 10 unit assertions that named the whole name updated to the initials,
      and the fault watched: printing `doing.name` again fails 10 of them.

## 3. The browser facts

jsdom lays nothing out, so no unit test can see two numbers sharing an x.

- [x] `lines up the number of a parent and a childless sibling`.
- [x] `holds a number still while its row is collapsed and opened again`.
- [x] `holds a number still when its row's number is frozen`.
- [x] Watch each fail: the gutter's width removed, and the lock swapped back in
      front of the number.

## 4. Gate

- [x] `bunx nx format:check --all`
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2`
- [x] `bun run e2e` — this checkout's dev server only, see the landmine
- [x] `openspec validate --all --json`
- [x] `verify.md`
