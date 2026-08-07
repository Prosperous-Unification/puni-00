# Verification

## The gate, uncached

```
$ bunx nx format:write --all && bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   407 pass  0 fail  (376 before; 31 new)
                       plan-export.test.ts 26, wbs-table.test.tsx +5

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
30 items, 30 passed, 0 failed — share-the-plan valid, no issues
```

## The checks, and the faults that broke them

Every fault below was injected into the production path, watched failing, and
reverted. 2026-08-07.

| Check                                                               | Fault injected                                                 | What the run reported                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quotes are doubled inside a quoted CSV field (`plan-export.ts`)     | `guarded.replaceAll('"', '""')` → `guarded`                    | `round-trips every field through a reader that knows only RFC 4180` and `guards the header block too` failed — 24/26                                       |
| Records are separated by CRLF (`plan-export.ts`)                    | `CRLF` set to `'\n'`                                           | 15 of 26 failed: the strict reader read the whole file as one record, so every column assertion went with it                                               |
| A field a spreadsheet would run is prefixed (`plan-export.ts`)      | the `FORMULA_LEADERS` prefix dropped — `const guarded = value` | `prefixes a field a spreadsheet would run as a formula` and `guards the header block too` failed — `=SUM(A1)` exported bare                                |
| An unestimated cell is empty, never zero (`plan-export.ts`)         | `figure()` returning `showFigure(0)` for an absent figure      | `leaves an unestimated leaf empty, never zero` and `leaves the roles a row was never estimated for empty…` failed on `0` where the export must say nothing |
| A page with no clipboard says so (`wbs-table.tsx`)                  | the `NO_CLIPBOARD` toast removed, leaving a bare `return`      | `says so when the page has no clipboard at all` failed with nothing on screen — the silent Copy button this check exists to prevent                        |
| A refused clipboard write says so (`wbs-table.tsx`)                 | the rejection handler made to push the success toast           | `says so when the clipboard refuses the write` failed reporting `Copied as Markdown.` over a write that never happened                                     |
| The downloaded file starts with a byte-order mark (`wbs-table.tsx`) | `BOM` dropped from the `Blob` parts                            | `downloads a CSV named after the project and the day, and lets the URL go` failed on the first three bytes                                                 |
| The object URL is revoked (`wbs-table.tsx`)                         | `URL.revokeObjectURL(url)` removed                             | the same test failed with nothing revoked                                                                                                                  |

## What makes the CSV tests able to fail at all

The reader in `plan-export.test.ts` is written **in the test** and implements
RFC 4180 and nothing else: CRLF and only CRLF ends a record, a bare LF is data,
`""` inside a quoted field is one quote. It knows nothing about the writer it is
checking, which is why the CRLF fault above takes 15 tests with it rather than
passing quietly through a lenient split. The battery it reads is `a,b`,
`say "hi"`, a note over three lines with a comma and a quote in it, `=SUM(A1)`,
`@echo`, `+1 (555) 0100` and `-3 days`.

The width assertion — every data record has exactly 20 fields — is what catches
a field that broke out of its quotes without any test having to name the field
it broke into.

## What is not watched here

- **No spreadsheet has opened one of these files.** jsdom has no Excel, no
  LibreOffice and no Sheets, so the formula-leader guard is verified as bytes
  written, not as a formula that did not run; and the byte-order mark is
  verified as three bytes, not as an em dash Excel rendered correctly. Both are
  well-documented behaviours of those readers, not measurements taken here.
  Task 4.2 is Dany opening a real export.
- **No browser has been asked for a clipboard.** jsdom ships none, which is
  exactly the shape of an http page — so the absent branch is tested against the
  real absence, and the granted and refused branches are tested against a stub.
  What is not covered is a browser that prompts for the permission and is left
  waiting: nothing times out, and the button can be pressed again.
- **The anchor download is stubbed.** jsdom implements neither
  `URL.createObjectURL` nor a download, so the test replaces both and asserts
  what they were handed. That a browser saves the file under `anchor.download`
  is the browser's contract, not this change's.
- **The Markdown has not been rendered.** Pipes are escaped and line breaks are
  flattened, both asserted as text; whether GitHub or a wiki draws the table the
  way it reads here has not been checked.
