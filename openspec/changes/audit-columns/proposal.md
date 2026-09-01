<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **every record needs `createdAt`, `updatedAt` and
`createdBy`** — because "everybody can work on anything". A shared plan cannot
answer "who put this here, and when did it last move" about anything.

Measured on `main`: `schema.ts` holds **31 tables**, six carry `created_at`, and
**none** carries `updated_at` or `created_by` — the words are absent from the
repo. Who acted is recorded only in `command_journal` and `plan_event`, which
cover the command path and say nothing about a tag, team, service or person from
the directory. That gap is item 6 of the same batch.

Attribution cannot be recovered later: an instant can be inferred from an event
log, an actor cannot.

## What Changes

- The **26** tables holding a domain record gain what they lack — 24 gain
  `created_at`, all 26 gain `updated_at` and `created_by`: **76 columns**.
- Every write carries a **write stamp** — the acting user and the instant —
  threaded from the service layer, which holds both, into the repository, which
  holds neither.
- An insert stamps all three; an update stamps `updated_at` alone, so a later
  act cannot reassign authorship.
- The columns are **nullable**, which is the truth rather than a shortcut: rows
  older than this change have no author and nobody can invent one.
- Reads name their columns, so the new ones stay off the wire — a bare
  `select()` reads every column drizzle knows.

## Non-goals

- No API, no reader-facing surface, no plan column. Recording comes first;
  showing is its own change.
- No backfill, and no later migration tightening the columns: `created_by` for an
  existing row is unknowable rather than unknown.
- Five tables gain nothing — `event_sequencer` (one counter row), `examples`
  (scaffold), and `event_log`, `command_journal` and `plan_event`, which record an
  **act**: each already carries its actor and instant and is never updated, so a
  `created_by` beside a `user_id` is two columns for one fact.
- No renaming of `recorded_at` / `stated_at` into `created_at`.

## Constraints

- Forward migrations stay **additive** — blue and green share one SQLite file
  mid-swap — so the columns arrive nullable with no default. A `NOT NULL` column
  on a populated table needs a rebuild, and the lint allows one rebuilt table per
  folder: 31 folders.
- Every migration ships a non-empty `down.sql`.
- The stamp must be impossible to forget at a write site added later. A
  discipline resting on the next author remembering is R5's "check that cannot
  fail".
