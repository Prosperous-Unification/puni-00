# design — `priority-default-medium`

## D1 — the default is a rank, read from the project's own ladder

Not the constant 50, and not the band labelled `Medium`.

- **Not 50**, because a project may re-cut its ladder: a project whose middle
  rung starts at 200 would get every new item stamped 50, which lands in its
  _most important_ band. The number has no meaning outside the ladder it is read
  against.
- **Not `Medium`**, because a rung is renameable and `priority-band-style.ts`
  already refuses to key on the label for that exact reason — "a project may
  rename `Critical` to `Blocker`, so a colour that followed the word would follow
  it out of the ladder."

So: `PriorityBandRepository.listFor(projectId)` returns five bands in rank order;
the default is `bands[2].defaultValue`. A project holding no rows reads the
default ladder, so a fresh project gets 50 without a special case.

**The read is inside the create's transaction**, not fetched by fe-01 and sent
along. A client-supplied default is a number the server cannot distinguish from
one somebody typed, and undo/redo would replay it as an intentional priority.

## D2 — an explicit priority on the command still wins

`createWorkItem` gains an optional `priority`. Absent, the rank-2 default is
written. Present, it is written as given — including present-and-null, which
means "create this with no priority" and is what a caller wanting the old
behaviour sends.

Three states, and the distinction matters for `mcp-01`: a batch that builds a
plan and sets priorities per item must not have them overwritten, and a batch
that deliberately leaves an item unprioritised must be able to say so. `absent`
≠ `null` is the same distinction the patch path already draws for `notes`.

## D3 — the ramp becomes diverging, and that is a change of kind

Today's `BAND_INKS` comment says the five are "a **nominal** scale drawn from an
ordinal one" held at one lightness band, so nothing reads as a heat map. That
argument survives; what changes is the hue's meaning.

| Rank | Band (default names) | Now                    | After                  |
| ---- | -------------------- | ---------------------- | ---------------------- |
| 0    | Critical             | `oklch(0.55 0.21 27)`  | unchanged              |
| 1    | High                 | `oklch(0.62 0.17 52)`  | unchanged              |
| 2    | Medium               | `oklch(0.62 0.13 92)`  | `oklch(0.58 0.02 265)` |
| 3    | Low                  | `oklch(0.58 0.11 205)` | `oklch(0.59 0.06 240)` |
| 4    | Lowest               | `oklch(0.58 0.02 265)` | `oklch(0.58 0.12 240)` |

Tints stay the same hue at `14%`, as today.

Rank 2 takes rank 4's exact current value — Dany asked for "same as Lowest now"
and the value is copied rather than re-picked, so the grey on screen is the grey
he approved.

Ranks 3 and 4 are two steps of one hue at one lightness, differing only in
chroma, with **4 the more saturated**. This is the counter-intuitive part and it
is deliberate: with neutral at the middle rung, "quietest" no longer means "least
important" — it means "most ordinary". Chroma now measures _distance from
ordinary_ in both directions. A reader scanning for what is deprioritised looks
for blue, and the bluest thing is the least important.

**Ranks 3 and 4 must be told apart.** Two steps of one hue at one lightness is
the smallest distinction on this ramp, so it is the one that needs measuring
rather than eyeballing: slice 3 asserts a minimum chroma difference and the
Chromium spec reads both computed colours in both palettes.

## D4 — what this does not change about a blank priority

`priorityBandStyleOf` returns `null` for a null priority and every face draws
nothing. That stays. A plan will now hold a mix — items created before this
change blank, items after it Medium — and that mix is honest: nobody decided
about the old ones.

The alternative, drawing null as Medium, was rejected in the design interview
(2026-08-29): the Prio cell would show a value the database does not hold, and
clearing it would put the cell back to showing the same thing it showed before.
