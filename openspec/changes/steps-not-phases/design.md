# design — `steps-not-phases`

A rename with no behaviour in it. Everything below is about the four places
where "rename it everywhere" is not safe as stated.

## D1 — `role` is two words, and only one of them is being renamed

`grep -rl role apps/fe-01` matches `role="combobox"`, `role="option"`,
`getByRole`, `role="dialog"` and `aria-*` siblings. Those are the ARIA
attribute, a word from a different vocabulary that happens to share four
letters. Renaming them breaks the accessibility tree and every
`getByRole`-shaped test in the repo.

**The rename is done identifier by identifier from an enumerated list, never by
a pattern.** The list is the 108 distinct identifiers matching
`[A-Za-z]*[Rr]ole[A-Za-z]*` across `libs`, `apps/be-01/src` and
`apps/fe-01/src`, minus the ARIA set. Slice 1 writes that list to
`openspec/changes/steps-not-phases/identifiers.txt` and the rename works from
it, so the diff is reviewable as a list and the ARIA exclusions are visible
rather than assumed.

The proof that the exclusion holds is the existing test suite: fe-01 has ~1300
jsdom tests, a large share of which find elements `ByRole`. A rename that
touched the attribute takes hundreds of them red at once.

## D2 — the DB keeps its names, and the schema says so out loud

Blue and green share one SQLite file during a swap and forward migrations must
be additive (`AGENTS.md`, Migrations; `LLM_README.md` landmine). `ALTER TABLE
role RENAME TO step` is not additive: the outgoing release reads `role`, and it
is still serving while green migrates.

So this change renames down to — and not including — the physical schema.
`apps/be-01/src/repository/schema.ts` gains:

```ts
export const step = sqliteTable('role', { … stepId: text('role_id') … })
```

with a JSDoc naming the boundary: the physical names are the pre-rename ones,
the rename is `steps-schema-rename`'s expand/contract, and until that lands the
two spellings are one thing. This is the "adjacent comment naming the boundary"
that AGENTS.md requires wherever a name and its referent disagree.

**Why not do the physical rename here.** Two reasons, in order. It is a
different risk class — a migration that must be reversible and swap-safe versus
a diff a compiler checks. And it needs a decision this change does not have to
make: whether the expand phase dual-writes (safe, two sources of truth for a
release) or whether the rename waits for a stop-the-world window (simple,
refused by the deploy tooling today).

## D3 — the wire moves in one step, not behind a compatibility shim

`roleId` → `stepId` and `/roles` → `/steps` change together, with no accepted
alias for the old spelling.

The alternative — be-01 accepting both keys for a release — is what a public API
would owe its callers. This one has exactly three: `fe-01`, `mcp-01`'s generated
tools, and `openapi.json`, all in this repo and all deployed together. A shim
would be a second parse path per field, tested or not tested, for callers that
do not exist. `gw-01` does not read these fields at all.

Two consumers live outside a deploy, and both are accepted costs rather than
oversights.

The first is an **MCP client holding a cached tool list** — a chat session that
already fetched `postApiProjectsByIdRoles`. It gets a 404 and re-lists. That is
the same experience as any tool being renamed, and `apps/mcp-01/README.md` is
regenerated in the same commit so the list on disk is never the stale one.

The second is a **browser tab holding an already-loaded `fe-01` bundle across a
blue/green swap**. The three callers above ship together, but a _tab_ does not:
one opened before the swap keeps the old bundle until it is reloaded, and its
next step write goes to `/api/projects/:id/roles` on a be-01 that now serves
`/steps`. It gets a 404 — the write is refused, loudly, and nothing is silently
written to the wrong shape. Accepted, and cheap to accept: dev has no prod
release to swap against (`LLM_README.md`, open findings 1 and 2), the window is
one reload wide, and the alternative is the same compatibility shim this section
already declined. It is named here so a reader meets it as a decision rather than
as a surprise.

## D4 — `CONTEXT.md` is edited term by term, and two entries change meaning-shape

Six entries mention the word. Four are a substitution (**Role** → **Step**,
**Role order** → **Step order**, **Role usage** → **Step usage**, **Assumed
assignee**'s body). Two need care:

- **Slice** — its `_Avoid_` line currently lists `phase` as a word not to use.
  After this change `phase` is not merely discouraged, it is gone; the line
  keeps it (a reader may still arrive with the word) and adds `role`, which is
  now the stale spelling.
- **Role order**'s `_Avoid_` line lists `phase order`. Same treatment.

New alphabetical position matters: `CONTEXT.md`'s entries are grouped by
subject rather than alphabetised, so **Step** stays where **Role** was — beside
**Repadding** and above **Assumed assignee** — because that grouping is about
what the term is near, not what letter it starts with.

## What "no behaviour change" is proved by

The whole existing suite, unchanged in intent, renamed in identifiers. A rename
that changed behaviour shows up as a test that had to be _reasoned_ about rather
than mechanically renamed. Slice 5 asserts the count: the number of test cases
before and after is equal, and any case whose body changed beyond identifier
substitution is listed in `verify.md` with why.
