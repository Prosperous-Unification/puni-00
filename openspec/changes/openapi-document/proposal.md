<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Dany wants to hand an LLM session the API: _"for this I need a good openapi spec
so that agent can refer to it"_. Today there is none — no spec, no mention of
one. This is **A1** of the R4 split: the emitter, the document, and the check
that keeps it honest. A2–A6 (the full annotation pass, tokens, rate limiting,
narrowed writes, dry run) are not here.

A generated spec that rots is worse than no spec, because a caller reads it as
current. So the document is committed and diffed against the running app by a
test; there is no version of this change without that check.

## What Changes

`@elysiajs/openapi@1.4.15` (peer `elysia >= 1.4.0`, matching the installed
1.4.28 — **not** `@elysiajs/swagger`, stuck at 1.3.1). Mounted in `buildApp`
with `provider: null`, so it adds exactly **one** route,
`GET /api/openapi.json`, and no CDN-loading HTML page.

`apps/be-01/openapi.json` is committed: 42 operations over 32 paths, rewritten by
`bun apps/be-01/src/openapi/emit-openapi-cli.ts`. `openapi-document.test.ts` fails when the
routes move and the file does not.

**The eight hand-parsed bodies are documented, not declared.** The six work-item
writes, the capacity PUT and the priority-band PUT parse their own bodies so that
`number_is_derived` and the priority, parallelism, capacity and ladder guards can
fire at all — Elysia strips unknown properties before a handler runs. Each gets
`detail.requestBody`: the fields, the units, the refusal codes, and the sentence
saying the schema is documentation. Declaring them properly would delete working
guards, so the check also asserts they stay described rather than declared.

## Non-goals

- **`detail` on the other 33 operations, `response:` schemas, an `x-refusals`
  enum generated from the union types, `docs/api-for-agents.md`** — change A2.
  Ten routes carry the body schema Elysia already knew about; nothing carries a
  documented response.
- **API tokens, rate limiting, narrowed writes, dry run** — A3–A6. This change
  adds no credential and no authorisation path.
- **Hiding `/internal/*`, `/metrics` or `/api/smoke/echo`.** The document is the
  whole served surface; what an agent may reach is A3's question.
