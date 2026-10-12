## 1. Split Burokrat's admission directory (S0)

- [x] 1.1 Move judge files to `admission-judge/` and runtime files to `admission-runtime/`; import paths only; the 152 pre-existing admission and CLI test names are unchanged.
- [x] 1.2 Split `integrate.ts` into `admission-judge/integration-candidate.ts` and `admission-runtime/integration-compose.ts`; the policy-decoding case moves to `integration-candidate.test.ts`; `Proof:` lines are byte-identical as a multiset.
- [x] 1.3 Split `packet.ts` into `admission-judge/packet-judgment.ts` and `admission-runtime/packet-binding.ts`; `cli.ts` decodes packets through the codec.
- [x] 1.4 Add `judge-facade.ts` and `judge-facade.test.ts` (surface pin plus reachable-module scan for store, clock and network reads) with three watched negatives.

## 2. Move the runtime half to Dash (S1)

- [x] 2.1 This change's proposal, design, spec, tasks and verify skeleton; OpenSpec validates; the first change's tasks point here.
- [x] 2.2 `git mv` `admission-runtime/*` to Dash `authority/`; imports from `@twilight-burokrat/judge`; alias in `tsconfig.base.json`; Dash lint overrides; boundaries test `Dash authority reaches only the judge alias` with watched negatives.
- [x] 2.3 Burokrat drops `submit-admission` from `cli.ts`, `bin.ts` and usage; tests `submit-admission is an unknown command` and `the validator bundle carries no authority store` (schema version, table and file name; `bun:sqlite` stays because the judge's relationship parser uses an in-memory database). The command moves to Dash unchanged in this slice so its five production-CLI cases keep running; S3 and S4 change its open semantics and add idempotency.
- [x] 2.4 Re-pin the namespacing handoff digest; RESTART_PATHS if the oracle requires it; Dash and Burokrat README first paragraphs.

## 3. Required clock (S2)

- [x] 3.1 Delete both `Date.now` defaults; `authority/clock.ts` `wallClock()`; tests `refuses construction without a clock` and `only clock.ts reads the wall clock` with watched negatives.
- [x] 3.2 `runDash(argv, deps)` with required `planEnrollment`, `clock`, `stdout`; `entrypoint.ts` composes them; `runDash refuses missing dependencies`.
- [x] 3.3 `openspec/changes/test-axes/verify.md` and `tasks.md` drop `admission/authority-store.ts` from the remaining Burokrat clock reads (added on main by WBS 9a25268b) and name this change. The ambient-clock scan covers production modules only, because tests time their own harness (readiness deadlines), not the authority; it also pins `wallClock()` composition to `entrypoint.ts`.

## 4. Absence refuses, bootstrap is explicit (S3)

- [x] 4.1 `AuthorityOpenError` kinds; `openAuthority` refuses `absent`/`unreadable`; `bootstrapAuthority` with under-lock recheck; `resolveAuthorityDatabasePath` without `mkdir`; five tests with watched negatives.
- [x] 4.2 Golden v5 schema text and a Burokrat-written v5 dump fixture; `schema-golden.test.ts`.
- [x] 4.3 CLI `bootstrap-authority` and `inspect-authority`; dispatcher canary creates no `.git/module-wiki`.

## 5. Idempotent submission (S4)

- [x] 5.1 `submitGenerationMatching` returns the token for an exact repeated submission.
- [x] 5.2 CLI `submit-admission` in Dash with the four lost-response and refusal tests.
- [x] 5.3 Model-based lifecycle test (`fc.asyncModelRun` + `fc.scheduler()`, child processes) for
      bootstrap, open, inspect and acquire; five sabotages fail it.

## 6. Publication recovery (S5)

- [x] 6.1 `recoverPublication` and CLI `recover-publication`; two-process tests for refs not moved and refs moved.
- [x] 6.2 Record the six mandatory proofs in `verify.md` from the relocated code.

## 7. Rollback proof and documents (S6)

- [x] 7.1 Rollback proof: `integration-races.test.ts` case `the pre-relocation authority opens a Dash-written store with identical state and continues its generations`, against the vendored `fixtures/authority/pre-relocation-burokrat.tar` (pinned SHA-256; source `e57278139`).
- [x] 7.2 ADR 0050 (0048 and 0049 were taken), ADR 0021 pointer, `names.md`, `LLM_README.md`, `CONTEXT.md`, READMEs, `verify.md`.
