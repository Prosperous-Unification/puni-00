# design — `external-refs`

## D1 — the ref's type is stored, and derivation happens once

```
external_system     (id, name)                       unique on name
work_item_external_ref (id, work_item_id, system_id, url, position)
```

`name` is the canonical type — `github-pr`, `jira-issue`, `confluence-page`,
`slack-message` — seeded, and extensible by naming a new one, exactly as a tag
is created by naming it.

**Derivation is a write-time convenience, not a read-time rule.** `systemOfUrl`
in `libs/domain` matches a URL against an ordered list of host+path patterns and
answers a canonical name or nothing. It runs when a ref is added or its URL
edited, and its answer is **stored**.

The alternative — deriving on read — is rejected because the rule will change.
Adding a pattern would silently re-type every existing ref, including ones a
reader had corrected by hand, and there would be no record that it had happened.

The reader may always override the derived type, and an override is just the
stored value being different from what `systemOfUrl` would say now.

## D2 — one dot per system, never one per ref

A row with four GitHub PRs shows **one** black dot. The column answers "what is
this wired to", not "how many links". Per-ref dots would make the column's width
depend on its contents, which is the one thing a fixed 40px column cannot do.

Up to four dots fit (6px each, 2px gaps, inside a 40px cell with padding). A
fifth distinct system collapses the overflow into a small `+`. The dots are
absolutely positioned inside a fixed-height box, so neither their number nor
their absence changes the row's height — the claim measured in Chromium, since
jsdom computes no layout.

**Empty is blank, not `-`.** The same bargain the Prio cell already made and
documented: "a column of furniture down a plan nobody has prioritised says less
than a blank does."

## D3 — colour alone would be an unreadable encoding, so it is not alone

Dany asked for dots and asked to see what reads best. Straight colour coding
fails twice: Jira blue against Confluence "darker blue" is the pair the common
colour deficiencies collapse first, and in dark mode GitHub's black dot
disappears into the page.

So each system gets **two** channels:

| System         | Fill        | Shape             | Dark palette               |
| -------------- | ----------- | ----------------- | -------------------------- |
| `jira-*`       | blue        | filled            | same hue, raised lightness |
| `confluence-*` | blue        | **ring** (hollow) | same                       |
| `github-*`     | neutral ink | filled            | near-white, not near-black |
| `slack-*`      | green       | filled            | same hue, raised lightness |
| anything else  | muted       | ring              | same                       |

The neutral flips with the palette because `currentColor`-adjacent ink is the
only value that reads on both grounds — the same reason `priority-band-style.ts`
states lightness rather than letting it emerge from a hue.

And every dot carries an accessible name (`2 GitHub links`), so the column is
readable with no colour at all. That is asserted, not assumed: a test reads the
cell's accessible description with the dots' colours ignored.

**This is the part Dany asked to be shown rather than told.** It ships as
described and gets looked at; the table above is one file's worth of change if
the ring/fill split reads badly.

## D4 — the cell clicks into a modal, and hovers into a card

Two surfaces because they answer two questions. The hover card is the fast read
— the list, each entry followable — and reuses `DependsCard`'s passive surface
and pointer bridge rather than a second overflow mechanism. The modal is the
editor: add by pasting a URL, edit a type or URL, remove, reorder is not
offered.

The cell is 40px. It cannot hold a picker, which is why this dimension does not
join the `ReferenceSetStrip` family even though its _type_ vocabulary behaves
like tags.

**A link is followed in a new tab with `rel="noreferrer noopener"`**, and a
stored URL is rendered as a link only if it parses as `http:` or `https:`.
Anything else renders as text. A `javascript:` URL stored by a peer edit is the
fault that rule exists for, and its negative stores one and asserts no `href`.

## D5 — the column sits between `#` and Name, and is not hideable

Dany's placement. It is 40px, so it costs the folded budget 40 — affordable
against the 240px `configurable-columns` freed, and stated here rather than
discovered in `layout.spec.ts`.

It joins `hideableColumnIds` (a reader with no external systems should be able
to take it off) but **not** `DEFAULT_HIDDEN_COLUMNS`: the feature is invisible
until somebody adds a ref, and a column hidden by default is a feature nobody
finds.
