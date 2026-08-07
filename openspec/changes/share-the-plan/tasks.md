## 1. The two writers, pure

- [x] 1.1 `plan-export.test.ts` first: the header block, the method by name,
      day-offsets versus dates both ways, unrounded finals, empty cells for the
      unestimated, resolved teams/assignees/dependency numbers, the `(sum)`
      marker in Markdown only, and the cycle's `—`.
- [x] 1.2 `plan-export.ts`: `planToMarkdown`, `planToCsv`, `planFileName` over a
      plain `PlanExport`. No React, no clock — the timestamp is an argument.
- [x] 1.3 One column list for both formats, so the two cannot drift; `(sum)` is
      the only thing that differs between them.

## 2. The CSV, which is where the faults are

- [x] 2.1 An RFC 4180 reader written **in the test**, strict about CRLF, and a
      battery of hostile names and notes round-tripped through it.
      **Negative test:** quote-doubling removed — 2 tests failed, watched.
      **Negative test:** CRLF replaced with LF — 15 failed, watched.
- [x] 2.2 The formula-leader guard. **Negative test:** prefix dropped — 2 tests
      failed, watched.
- [x] 2.3 Empty for the unestimated. **Negative test:** `0` exported instead —
      2 tests failed, watched.

## 3. The toolbar

- [x] 3.1 `projectName` reaches the table from the picker; the export is built
      from `flat`, `roles`, `teams`, `people`, the method, the start date and
      the schedule error, with the timestamp read in the shell.
- [x] 3.2 Copy as Markdown: the clipboard is looked for, and both its absence
      and its refusal are toasts. **Negative tests:** the absence guard removed
      and the rejection handler made to report success — one test each, watched.
- [x] 3.3 Download CSV: blob with a byte-order mark, object URL, anchor click,
      revoke. **Negative tests:** the mark dropped and the revoke dropped — the
      download test failed both times, watched.

## 4. Gate

- [x] 4.1 Format, the run-many gate uncached, `openspec validate --all` — in
      `verify.md`.
- [ ] 4.2 Deploy to dev; Dany exports a real plan and opens the CSV in a
      spreadsheet that is not jsdom.
