<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The emitter and the route

- [x] 1.1 `@elysiajs/openapi@^1.4.15` in `package.json` and `bun.lock`. Pinned by
      the lockfile and `--frozen-lockfile` in CI, so a plugin release cannot move
      the committed document under an unrelated PR.
- [x] 1.2 `src/openapi/openapi-plugin.ts`: `provider: null`,
      `specPath: '/api/openapi.json'`, and the `info.description` that says what a
      generator cannot — which header carries the token, that ten bodies are
      declared and eight only described, and that numbers are derived. Mounted in
      `buildApp`. Test: `is served as JSON at its own path`.
      **Negative watched:** the `.use(openApiPlugin())` line commented out gives
      **0 pass / 3 fail**, `documentFromApp` naming
      `/api/openapi.json answered 404`.

## 2. The committed document and its freshness check

- [x] 2.1 `src/openapi/document-from-app.ts` — one reader (`app.handle`, the way a
      client asks) and one serialisation (two spaces, trailing newline, which is
      what prettier writes and `format:check --all` reads), used by both the writer
      and the check so they cannot disagree about what the document is.
- [x] 2.2 `emit-openapi-cli.ts` writes `apps/be-01/openapi.json` from the app
      built with the `src/testing` doubles — route registration touches no
      service, so a real one would mean a database file for a byte-identical
      answer.
- [x] 2.3 The check: `is what the app serves right now`, comparing the committed
      **text** against the served document. **This is the new guard, so it gets
      its watched red:** `POST /projects/:id/work-items` renamed to
      `/projects/:id/work-item` with the file left alone gives **2 fail / 1 pass**,
      the diff naming `postApiProjectsByIdWork-item` where `…Work-items` was owed.
      `Proof:` comment on the test.

## 3. The eight hand-parsed bodies, described and held there

- [x] 3.1 `src/openapi/hand-parsed-body.ts` — the caveat sentence in one place,
      because it is a fact about the class of route rather than about any one of
      them.
- [x] 3.2 `detail` on the six work-item writes, the capacity PUT and the
      priority-band PUT: summary, the preconditions in prose, the refusal codes
      with their statuses, and the units (`days` on estimates, `people at once` on
      parallelism and capacity, `1 to 1000`). **No `body:` schema added to any of
      them** — that is the point of the slice.
- [x] 3.3 The check: `describes every hand-parsed body without declaring it`.
      **Watched red:** `body: t.Object({ personId: … })` added to the assignees
      PUT, its `detail` left in place and the document re-emitted so 2.3 stayed
      green, gives **1 fail / 2 pass** — Elysia's schema **replaces**
      `detail.requestBody`, so the caveat is gone and the body arrives under three
      media types instead of one.

## 4. The record

- [x] 4.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`**, no citation table, no R5 fault table: PoC-mode contract,
      `notes/delivery-modes.md` 2026-08-14. `nx format:check --all` is in the local
      gate, per that file's own amendment.
- [x] 4.2 `LLM_README.md` gains one row pointing at the document and the command
      that rewrites it. The file was at 148 of its 150-line cap.
- [x] 4.3 The finding this change turned up, in `verify.md` rather than fixed
      here: `_must_be_id_or_null` has **no negative test on any of its four
      fields**, so on the assignees PUT the document check is the only thing that
      notices that guard being switched off.
