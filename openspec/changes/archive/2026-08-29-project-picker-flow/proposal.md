<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.
-->

## Why

Three faults in the project picker, all reported by Dany on 2026-08-29.

**The card lands on the list it explains.** `ProjectOptionCard` anchors to the
option the pointer is on, so the card the reader opened to tell two projects
apart covers the other projects they were comparing it against. Reading the
card and reading the list are the same gesture, and it cannot serve both.

**Picking a project leaves a caret in its name.** `choose` sets the selection
and clears the search; the closed combobox then shows `selectedProject.name` in
a focused `<Input>`. Nothing is armed for a rename — `rename` is still null and
only `✎` sets it — but a text field holding the project's name with the caret
in it is indistinguishable from one, and a stray keystroke reads as the start
of a rename that will not happen.

**Creating a project leaves the caret nowhere.** `create` posts the literal
name `New project`, cancels any armed rename, selects the result and stops.
Every new project is called `New project` until somebody finds `✎`.

## What Changes

**The card opens beside the list, not over it.** The hover card is anchored to
the **listbox's right edge** at the hovered option's vertical position, so the
whole option list stays readable while a card is open. Where the viewport has
no room to the right the card falls back to the left edge, never over the list.

**A pick ends the typing.** Choosing an option blurs the combobox and leaves it
at rest, presented as the label of what is open rather than as a field with a
caret in it. The box is still a combobox: focusing it re-opens the search.

**A new project starts named by its author.** `create` selects the new project
**and arms the rename** on it with the caret in the field and `New project`
selected, so the first keystroke replaces it. Escape leaves the placeholder
name — the project is already created and nothing is rolled back.

## Non-Goals

No change to the wire, `GET /api/projects`, the entry meta, project deletion,
or the card's contents. No new keyboard binding.

## Capabilities

### Modified Capabilities

- `wbs-domain`: project picker card placement, selection, and creation.

## Domain Terms

Project entry; Entry meta.

## Impact

`apps/fe-01/src/components/wbs/project-page.tsx` and its test file; one
Chromium spec for the card's placement.
