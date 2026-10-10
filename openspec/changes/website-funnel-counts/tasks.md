Each slice is red-green-refactor. "Test" names the test that proves it; "Negative" names the
production-path fault injected and watched failing before the adjacent `Proof:` comment. Run Bun
tests with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## 1. Store

- [x] 1.1 `readCeilingSettled` and `ceilingSettledToday` on `readGuardrailOverview`. Test:
      `guardrail-store.test.ts` "the overview counts today's ceiling-settled operations".
      Negative: drop `state = 'unknown'`; the count becomes 3.
- [x] 1.2 `readFunnelCounts(database, now, days = 30)` and `WebsiteStore.readFunnelCounts`. Test:
      `funnel-store.test.ts` "counts drafts, conversations, briefs, exhaustions and proposals per
      UTC day, split by origin". Negative: count `intake_draft` rows as proposals; `proposals.manual`
      fails.

## 2. API

- [x] 2.1 `GET /operator/funnel` behind the operator session with `Cache-Control: no-store`. Tests:
      `server.test.ts` "the funnel overview counts the day's rows", "the funnel overview carries no
      canary text", "the funnel overview needs an operator session". Negatives: serve without the
      operator check (the 401 test gets 200); add `intake_draft.description` to each day row (the
      canary test fails).

## 3. Operator page

- [ ] 3.1 `funnel-panel.tsx` below Guardrails and the ceiling-settled line in
      `guardrails-panel.tsx`. Tests: `funnel-panel.test.ts` "renders thirty UTC days and the chat
      share" and the malformed-body test; `guardrails-panel.test.ts` ceiling-settled line.
- [ ] 3.2 `browser/screens.mjs` `operator-funnel` capture at four widths.

## 4. Docs

- [ ] 4.1 `docs/website/build-runtime.md` "Funnel" paragraph; **Funnel count** in
      `docs/website/CONTEXT.md`.
