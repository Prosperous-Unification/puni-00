## 1. Existing database inspection

- [x] 1.1 Implement the existing-database maintenance boundary in `libs/website/adapters/store-sqlite/src/draft-retention.ts`, exported through `store.ts`, with narrowly shared migration metadata if required — tests: inspection refuses missing/unreadable/malformed database, unknown or changed migration and incompatible schema, creates no path, and leaves an in-flight chat/usage hold unchanged; negatives: break each required state dependency and remove its refusal, observe the named production-path test fail and add adjacent Proof comments.
- [x] 1.2 Implement read-only eligibility, aggregate plan and database/cohort fingerprint — test: mixed fixture includes exactly expired unconsumed/unlinked drafts at the cutoff and excludes future, consumed, proposal-linked, request-linked, legacy-linked and replay-linked drafts; negatives: remove each independent exclusion or expiry boundary and observe an erroneous eligible count; distinctive prompt/email/claim markers never appear in report output.

## 2. Transactional cleanup

- [x] 2.1 Implement explicit `purgeExpiredDrafts` using the inspected cutoff/fingerprint and one immediate transaction and deterministic prepared per-candidate deletes — tests: unchanged plan deletes exactly eligible rows, future cutoff/different database/changed association refuses without mutation, and a dependency fault injected on a later delete after validation rolls back earlier deletes; negatives: remove fingerprint/future-cutoff guards and transaction respectively, observing stale-plan, live-draft and partial-deletion failures. Preserve every chat, usage, account and submitted record.

## 3. Operator command and package

- [x] 3.1 Add `apps/website/be-01/src/draft-retention-cli.ts` with explicit `inspect DATABASE` and `apply DATABASE CUTOFF FINGERPRINT` commands — child-process tests: inspection is read-only, malformed command/number/hash fails nonzero, valid explicit application returns only committed aggregate count; negative: remove argument validation and observe invalid-input tests fail. No HTTP endpoint or implicit apply.
- [x] 3.2 Include the CLI in `apps/website/be-01/build.ts` and add a smoke using the actual built entrypoint and copied migrations on a disposable fixture — negative: omit the CLI entrypoint or a migration input and observe the built-command smoke fail.

## 4. Review and operating evidence

- [x] 4.1 Document the command and backup limitation in `docs/website/draft-retention.md`, link from the website index, record tests/proofs in `verify.md`, and keep full 12-month/client/backup/telemetry work explicitly incomplete. Run uncached `website-store-sqlite` and `website-be-01` test/lint/typecheck/build, built-command smoke, OpenSpec/format checks and independent review. Use disposable fixtures only; do not change the current release branch, running gate or live host.
