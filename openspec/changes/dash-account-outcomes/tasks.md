## 1. Usage import

- [x] 1.1 `ledger/harness-usage.ts`: Claude Code transcript reader with request-id
      deduplication, cache-write split, branch, version, and pull-request references from
      tool results — test: `harness-usage.test.ts` fixture with repeated request lines yields
      one row; negative: remove the dedupe map and the row count triples; watched.
- [x] 1.2 Repeated request id with different usage refuses naming path and line — test:
      `harness-usage.test.ts`; negative: drop the comparison and the fixture imports silently.
- [x] 1.3 Codex rollout reader: `session_meta` branch, `turn_context` model, one row per
      `token_count` from the cumulative advance so repeats count once — test: fixture rollout
      with a repeated event; negative: a falling cached count with a held total refuses.
- [x] 1.4 Boundary refusals: absent directory and missing field refuse; a non-JSON line is
      listed as unreadable rather than fatal; zero rows dropped — test: one case each;
      negative: default the missing directory to `[]` and the absent-directory test passes
      wrongly; drop the unreadable record and its test loses the entry; watched.

## 2. Pricing

- [x] 2.1 `ledger/rate-card.ts`: schema, digest as price identity, micro-unit pricing per
      category — test: `rate-card.test.ts` prices a known row exactly.
- [x] 2.2 Unknown model and missing category stay unpriced with reason — test: same file;
      negative: return zero micros for an unknown model and the unpriced assertion fails.
- [x] 2.3 Commit `rate-cards/2026-10-22-list-prices.json` from the vendor pages read on
      2026-10-22 with source and access date per entry — test: the file parses under the
      schema.

## 3. Outcomes and attribution

- [x] 3.1 `ledger/accepted-outcomes.ts`: first-parent merges on `main`, subject parsing,
      nested member branches — test: scratch repository with a plan branch and two nested
      pull requests; negative: drop the nested walk and member branches are missing.
- [x] 3.2 `ledger/attribution.ts`: rules in order, reasons, coverage, blended figure —
      test: `attribution.test.ts` table cases including the ambiguous session; negative:
      attribute an ambiguous session to its first reference and the test reddens.

## 4. Command

- [x] 4.1 `ledger/account-outcomes.ts` and dispatcher entry: grammar before effects,
      repeated directory flags, new output directory, canonical outputs, summary line — test:
      `account-outcomes.test.ts` end to end on fixtures through `runDash`; negative: existing
      output directory refuses and writes nothing.
- [x] 4.2 Markdown rendering of the breakdown — test: golden file.
- [x] 4.3 README section, CONTEXT.md terms, `no-ambient-clock` test still green — test:
      `nx run twilight-dash:test`.
- [x] 4.4 Run against the operator's logs for the week to 2026-10-22 and record the figures
      in verify.md.
