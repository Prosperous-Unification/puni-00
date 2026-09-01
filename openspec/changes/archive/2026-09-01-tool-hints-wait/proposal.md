<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-09-01: **"this must avoid unnecessary interruptions while moving the
cursor over UI elements, rn this is more annoying than useful when you already
know what buttons or UI elements do"**.

`hints-are-the-page-s-own` made every hint instant, with no timer. That is right
for words about **the project** — who a tag was inherited from, how many days a
row can slip, where a link goes. It is wrong for words about **what a control
does**: a cursor crossing the toolbar fires a card per button, and the second
time you read "Undo your last change to this plan" it is noise over the plan.

The split is by what the words are **about**, not by which control carries them,
and it is sometimes decided per render: the reorder grip says either "Drag to
move this row" — the tool — or "Frozen — unfreeze this row before moving it" —
this row.

## What Changes

- A hint is one of two things. A **project fact** carries its words in a new
  `data-fact` and opens instantly, as today. A **tool hint** keeps `data-hint`
  and now waits three seconds. Roughly 25 of the ~100 sites become facts.
- While a tool hint is waiting, a **wait ring** is drawn beside the cursor: no
  mark at all for the first 400ms, so a sweep across the toolbar draws nothing,
  then a ring that fills over the remaining 2.6 seconds. It goes when the card
  opens, when the pointer moves on, or when the pointer leaves the window.
- The keyboard opens both kinds immediately from `focusin`. There is no cursor
  to put a ring beside, and a delay there withholds a description.

## Non-goals

- No warm window. Every tool hint waits its full three seconds, every time.
- No wording changes, and no change to the nine hand-written hover cards. Every
  one is a project fact and stays instant; the Gantt keeps its own 220ms.

## Constraints

- The words stay in the DOM, readable without hovering: the oracles that read a
  control's hint back out cannot hover, and they must keep working for both
  attributes.
- A node carrying both attributes is a fault, not a precedence puzzle. Nearest
  ancestor wins across the two, so a fact chip inside a hinted toolbar answers
  instantly.
