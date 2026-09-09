# verify — links-card-takes-the-pointer

## Commands

| Command                                                      | Result         |
| ------------------------------------------------------------ | -------------- |
| `nx run fe-01:typecheck`                                     | green          |
| `vitest run plan-cells.test.tsx`                             | 109 passed     |
| `playwright test … external-refs -g "walks onto the card"`   | 1 passed       |
| `nx run fe-01:test`                                          | _filled below_ |
| `playwright test` (whole browser gate, `E2E_PORT_SHIFT=500`) | _filled below_ |

## Failure proofs

| Check                                          | Injected fault           | Watched failure                                  |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `walks onto the card` — the straight-down half | `takesPointer` removed   | `the card closed on the way down to it`          |
| `walks onto the card` — the diagonal half      | `CARD_GRACE_MS` set to 0 | `the card closed on a diagonal reach for a link` |

**Each is blind to the other's fault**, which is why both are here: with the grace at 0 the
straight-down half passes, and without `takesPointer` the diagonal half is never reached.

## What the previous change's tests could not see

`locator.hover()` puts the pointer on an element's centre. `link-names-and-card` asserted that
the card's link was reachable and clickable with `await name.hover()` and passed twice over a
card whose padding was `pointer-events: none`. Every proof here moves the pointer in `steps`.
