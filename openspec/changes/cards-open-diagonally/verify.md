# verify — cards-open-diagonally

## Commands

| Command                                                        | Result           |
| -------------------------------------------------------------- | ---------------- |
| `openspec validate --all --json`                               | PENDING          |
| `nx run fe-01:typecheck`                                       | green            |
| `nx run fe-01:lint`                                            | exit 0           |
| `nx format:check --all`                                        | exit 0           |
| jsdom (`vitest --shard=1..3/3`)                                | 889 + 704 + 1023 |
| `playwright test` (whole gate, 4 shards, `E2E_PORT_SHIFT=500`) | PENDING          |

## Where the cards land now, measured in Chromium

The row ends at y 175 in each case, so every card starts at its row's own bottom edge:

| Card            | box                    | side                                       |
| --------------- | ---------------------- | ------------------------------------------ |
| Start           | `[836, 175, 260, 32]`  | left — that column ends 4px from the frame |
| notes preview   | `[502, 175, 876, 100]` | right, and as wide as the plan allows      |
| folded Dev step | `[884, 175, 420, 105]` | right                                      |

The writing panel is `[508, 150, 770, 131]`: level with the box it explains, past the Name cell,
and 770px of the row's right half.

## Failure proofs

| Check                                  | Injected fault                                | Watched failure                                                              |
| -------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `card-lanes` — the row is clear        | the row offset replaced by `top: 0`           | `Start: the card covers its own row · Expected: >= 174.1875 · Received: 150` |
| `hover-cards` — the reach              | `REACH_FOR_THE_CARD_MS` set to 0              | `the preview did not survive the reach · Expected: 1 · Received: 0`          |
| `external-refs` — the reach, for links | the same                                      | `the card closed on the way over to it`                                      |
| `hover-cards` — the writing panel      | the panel's `focus`/`input` listeners dropped | `waiting for getByLabel('Notes for 010, rendered while writing')`            |

## The teleport, a third time

The reach's first browser proof moved the pointer to the card in **one** `mouse.move`, and it
passed with the reach set to 0. It had to: the card is a DOM child of the cell's wrapper, so a
jump straight onto it fires no `mouseleave` anywhere — there was never a moment for the card to
close in. The card only dies on a **stepped** move, where the samples in between land on other
cells. R5 #23's lesson (`locator.hover()` teleports) with a third set of clothes: `mouse.move`
without `steps` teleports too, and a placement whose whole difficulty is the space between two
boxes cannot be tested by skipping that space.

## When each card goes, and the two faults on the way there

Dany, twice, while this was being built: _"i need it to go away when i move my mouse away from
the preview icon and not directly into the preview — rn preview just does not go away"_, and
_"same goes for other cells - make sure that it goes away at the right time"_.

The rule the cards ended on:

| gesture                        | what happens                          |
| ------------------------------ | ------------------------------------- |
| off the trigger, anywhere else | held 300ms, then gone                 |
| off the trigger, onto the card | kept — the card says it was reached   |
| off the card                   | the cell's own leave holds, then gone |
| onto another cardable cell     | gone at once, replaced                |

The hold was 300ms first and is **180ms**: Dany asked for it shorter (_"ok, can you remove it
just a bit faster"_), and 180 still clears the 130ms a 260px flick takes. The negative was
re-watched at the new figure — the reach set to 0, `the preview did not survive the reach ·
Expected: 1 · Received: 0`.

Two cuts were wrong before this one. The **first** put the timer in each cell, and a cell that
re-opened its own card could not cancel a hold another cell had started — the dependency card
died to it, 120 seconds of `waiting for locator('[role="tooltip"]')`. The **second** cancelled
the hold on entering anywhere in the cell, and the Name cell is the widest column in the table:
moving off the `≡` glyph onto the title beside it kept the card up with nothing left to close it,
which is exactly what Dany reported. The hold lives in the store, every write cancels it, and the
only cancel that is not a write is the card's own arrival.

`onPointerGone` — the card reporting that the pointer had left it — was written and **deleted**:
the cell's own `mouseleave` already fires when the pointer leaves the card for anywhere outside
the cell, so nothing could be seen to break with it gone.

## The state that had to move down a level

`WrittenNotesPanel` first held its text in the Name **cell**. Two suites caught it:
`plan-row-render-cost.test.tsx` on `expected 1 to be +0` — the cell re-rendering for a keystroke
it should not have noticed — and `a chord waits for the blur's patch that is still out` on
`expected "Paint" · received "Paint the trim"`, a re-render inside the blur putting the old text
back into an uncontrolled box. The panel holds its own state and listens to the box's own events
now, so nothing above it hears a keystroke.
