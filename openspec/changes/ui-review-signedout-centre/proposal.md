# Every signed-out card centred on its own, and the cue pill says Priority / Finish

## Why

D11 (`ui-review-signin-gantt`, F-125) hung every signed-out card from the sign-in card's anchor so
the `WBS tool v2` word mark never moved; the outage and access-refused cards then stood about 188px
above centre at 1440 with empty page under them. Dany reversed it on 2026-10-18: "make them all
middle of the screen" — each card centred, the word mark moving between cards accepted. Dany also
accepted F-149: the optimization cue pill said `Pri` / `Time` while Project settings say
Priority-first / Finish-first, two names for one objective.

## What Changes

- Sign-in, Server unavailable and Access refused are each centred in the window. The sign-in card
  stays centred by its top with its refusal row's room counted, so a refused sign-in still opens
  below without moving the heading (F-090). A window shorter than a card scrolls; nothing clips.
- The cue's short names are `Priority` and `Finish` on the pill, its menu, Retry items, its card and
  the contrast line (`Priority against Finish: …`). The pill is pinned at 13rem (was 11.5rem) so
  `Fast · Priority 3 days earlier` is drawn whole; the 1280 toolbar still lays out in two rows.
- A menu's box is capped at the window less its gutters, where an item wraps, and its trigger's
  wrapper passes down the room it is given: on a 390 phone the longer cue words otherwise ran the
  menu off screen and drew the pill over `Plan actions`.

## Non-goals

- No change to be-01, to the objective values (`pri`, `time`) or to the settings words.

## Impact

`apps/wbs/fe-01`: `app.tsx`, `components/wbs/{optimization-words,optimization-cue-reading,
optimization-cue,actions-menu,wbs-table}.ts(x)`, their tests, `e2e/{signed-out-column,sign-in,
shell-faults,optimization-cue}`. The one-anchor requirement is struck from `ui-review-signin-gantt`
and the `ui-review-shell-faults` outage scenario now asks for vertical centre.
