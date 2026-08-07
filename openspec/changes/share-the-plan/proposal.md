# Share the plan

## Why

Both UX reviewers ranked export in their top ten, 2026-08-06, and codex made it
a MUST: "sharing conclusions is a core use case; export needs explicit
raw-versus-displayed and date semantics."

A plan is written in this tool and read somewhere else — in a document, in a
spreadsheet, in a message to whoever is paying for the work. Today the only way
out is a screenshot of a table that is wider than the screen. And a table on its
own does not say which of four methods produced its final figures, whether its
dates are dates or day offsets, or how old they are; the same grid of numbers
means four different things depending on a `<select>` the reader never saw.

## What Changes

**The plan leaves as a document, not as a grid**

- **Copy as Markdown** puts the whole plan on the clipboard as a table.
  **Download CSV** saves it as a file. fe-01 only: both are built from what is
  already on screen, so nothing is asked of be-01 and neither is disabled while
  the socket is down or the tree is stale.
- **The whole plan, every time.** Not what the Find box narrowed to, not what is
  expanded: a collapsed branch is how one reader is looking at it, and an export
  missing rows with nothing saying so is worse than no export.
- **A header block first**, in both formats: project, the method **by name**
  ("Final figures: PERT"), the start date or `not on a calendar`, what the date
  columns mean, the timestamp, and that the figures are unrounded. In Markdown a
  short block above the table; in CSV leading `key,value` records then a blank
  record, because CSV has no comment syntax that every reader agrees on.
- **Columns**: Number, Name, Team, then per role optimistic/realistic/
  pessimistic, the final labelled with the method (`Dev final (PERT)`), and the
  assignee; then the total, Depends on, Not before, Starts, Ends, Slack, Notes.
- **The table stays flat and the number is the outline.** `010`, `010.1`,
  `010.1.1` already carry the hierarchy; indenting the name would say it twice
  and would say it differently in a spreadsheet than in Markdown.

**Raw, not displayed**

- **Final figures export unrounded.** The screen rounds to one decimal so a
  column of `3.3333333333333335` is readable; a spreadsheet that adds the
  column wants the number the schedule was computed from.
- **An unestimated leaf exports empty cells, never `0`.** A zero is a claim
  that something takes no time. So is a total of a row nothing is estimated on.
- **A rolled-up parent's figures are marked `(sum)` in Markdown**, and are not
  marked in CSV, where `7 (sum)` is text in a column of numbers.
- Ids are resolved to what people call things: team names, assignee names,
  dependency **numbers**. The every-phase assumption is spelled out rather than
  exported as a blank.
- **A cycle exports `—`, not `day 0`.** With no schedule, every row carries the
  same zeroed one, and printing it reads as "everything happens at once".

**The CSV is RFC 4180, and safe to open**

- Fields holding a comma, a quote or a line break are quoted; quotes are
  doubled; records are separated by CRLF. A multi-line note stays one cell.
- **A field starting `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`** — CSV
  injection (CWE-1236): a name typed as `=cmd|'/c calc'` is a formula in Excel,
  LibreOffice and Sheets. The apostrophe is stripped back off on display.
- The file starts with a UTF-8 byte-order mark, or Excel on Windows reads every
  em dash and non-ASCII name as the system codepage.

**Failing out loud**

- A clipboard is a permission, not a function call: it is absent on an http page
  and the write can be refused. Both are reported as error toasts naming the CSV
  as the way out; the copy that lands is an info toast that takes itself off.

## Non-Goals

- **No server-side export, no XLSX, no PDF, no print stylesheet.** Markdown and
  CSV are what a plan is pasted and summed in.
- **No column or row selection.** The whole plan, in the table's own order.
- **No `?` marker for a finish whose row is not estimated.** The table draws one;
  in the export the empty estimate cells beside it say the same thing.
- No sharing link, no scheduled export, no history of exports.

## Constraints

fe-01 only, no API change. `columns` in `wbs-table.tsx` still depends on `roles`
and `unfoldedRoles` alone — the export lives in the toolbar and touches none of
it. The two writers are pure and free of React, and the timestamp is passed in.

## Domain Terms

`Plan export`.

## Decisions Recorded

none — reversible, and no alternative was close enough to need an ADR.

## Impact

`apps/fe-01/src/components/wbs/plan-export.ts` (new), `wbs-table.tsx`,
`project-page.tsx` (passes the project name), `CONTEXT.md`.
