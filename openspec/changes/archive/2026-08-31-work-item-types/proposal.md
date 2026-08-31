<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A plan tracked against Jira carries an issue type per row — Story, Bug, Spike,
Epic — and the table has nowhere to put it. Readers encode it in the name
(`[BUG] …`) or in a tag, which makes tags mean two things and makes the filter's
tag facet a mix of vocabulary and taxonomy.

## What Changes

**A fourth reference dimension: work item type.** A directory-global vocabulary
of names, exactly `tag`'s shape — `work_item_type` with a unique name, and
`work_item_work_item_type` joining it to a row. **Set-valued**, on Dany's call
(2026-08-29): a row may carry several, the way it carries several tags.

**One more cell in the reference family.** The Type cell is a
`ReferenceSetStrip` like Teams, Tags and Services: the quiet `+`, compact
removable chips, keyboard search, and creating a type by naming one that does
not exist. It inherits whatever `unified-reference-cell-ux` settled, including
the one-line rule that change's section 4b adds.

**Hidden by default, like Teams and Services.** `DEFAULT_HIDDEN_COLUMNS` gains
`type`, so the folded 1280 budget is unchanged to the pixel and a reader who
wants the dimension turns it on in `Columns`.

**The filter gains a type facet**, beside the tag and priority facets, listing
the types present on the plan.

## Non-Goals

- Any Jira integration. This is a vocabulary the reader keeps; nothing syncs.
  Linking a row to a real Jira issue is `external-refs`.
- Per-project type vocabularies. Global, matching tags, teams and services.
- A type deciding anything — no colour, no schedule effect, no default, no
  required-ness. It is a label.
- Inheritance down the tree. A row's types are its own; unlike Teams, an unset
  type is unset.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `wbs-domain`: the reference dimensions a work item carries.

## Domain Terms

Work item type (new); Directory; Directory usage.

## Impact

Two tables (additive, with `down.sql`); the directory service, read and write
paths; `patchWorkItem`'s `typeIds`/`typeRefs`; the plan payload; a `type` column
and cell in `fe-01`; the filter facet; the directory page's vocabulary editor.
