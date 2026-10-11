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

- [ ] 3.1 Delete both `Date.now` defaults; `authority/clock.ts` `wallClock()`; tests `refuses construction without a clock` and `only clock.ts reads the wall clock` with watched negatives.
- [ ] 3.2 `runDash(argv, deps)` with required `planEnrollment`, `clock`, `stdout`; `entrypoint.ts` composes them; `runDash refuses missing dependencies`.
- [ ] 3.3 `openspec/changes/test-axes/verify.md` drops the authority clock entries.

## 4. Absence refuses, bootstrap is explicit (S3)

- [ ] 4.1 `AuthorityOpenError` kinds; `openAuthority` refuses `absent`/`unreadable`; `bootstrapAuthority` with under-lock recheck; `resolveAuthorityDatabasePath` without `mkdir`; five tests with watched negatives.
- [ ] 4.2 Golden v5 schema text and a Burokrat-written v5 dump fixture; `schema-golden.test.ts`.
- [ ] 4.3 CLI `bootstrap-authority` and `inspect-authority`; dispatcher canary creates no `.git/module-wiki`.

## 5. Idempotent submission (S4)

- [ ] 5.1 `submitGenerationMatching` returns the token for an exact repeated submission.
- [ ] 5.2 CLI `submit-admission` in Dash with the four lost-response and refusal tests.

## 6. Publication recovery (S5)

- [ ] 6.1 `recoverPublication` and CLI `recover-publication`; two-process tests for refs not moved and refs moved.
- [ ] 6.2 Record the six mandatory proofs in `verify.md` from the relocated code.

## 7. Rollback proof and documents (S6)

- [ ] 7.1 `rollback-compatibility.test.ts` against the pinned pre-relocation commit.
- [ ] 7.2 ADR 0048, ADR 0021 pointer, `names.md`, `LLM_README.md`, `CONTEXT.md`, READMEs, `verify.md`.
