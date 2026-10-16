<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Round 5 of the WBS UI review (2026-10-16, main `3e06eb5a4`) left five findings on the plan toolbar and the Saved plans panel:

- F-100 (S2): after a second save or a delete, with no edit to the plan, the comparison said "This plan has changed since the comparison below was made." The panel compared the shelf's rows by identity, and the shelf re-reads on every `saved_plans_changed`.
- F-103: a named saved plan's meta line was cut mid-clause (`with it…`) at the panel's own width, with nothing to read it whole.
- F-104: Views and Saved plans have one anatomy but two rules: Views' Save was off while the name was empty, Saved plans' Save saved under a time name.
- F-106 and F-127: the Export / Import menu stayed open after every one-shot item: behind the Import with AI dialog, and after a copy or a download.
- F-099: the toolbar's end group was reported split at 960 px with the menu open.

## What Changes

- A comparison is out of date only when one of its sides moved: the live plan (any project broadcast except `saved_plans_changed`, unknown ones included) or a saved side deleted by someone else. Saving, renaming or deleting other saved plans no longer marks it. A deleted side says so in its own sentence.
- A saved plan's meta line wraps between its clauses (when, by whom, what came along) and carries the whole sentence as the row's fact.
- An empty name never turns Save off in either panel. A view saved with no name is named by what it filters. Enter in the Views name field saves.
- Every one-shot Export / Import item (a copy, a download, Import with AI, a chosen JSON file) closes the menu and gives the focus to its summary. When the Import with AI dialog closes, the focus returns to that summary. Mermaid lanes, a setting, keeps the menu open.
- F-099 did not reproduce. The end-group test now also runs at 960 × 600 and with the menu open at 960 and 1024.

## Non-goals

- The Views Save button's variant (outline, not primary) and the Saved plans name truncation.
- Comparing two saved plans' contents, which cannot change.
