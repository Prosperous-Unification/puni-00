## 1. Contract and consistency slice

- [x] 1.1 Add failing production CLI tests using real Navigator v7/v8 output and a historical v6 reference.
- [x] 1.2 Move unchanged task contracts to Burokrat and update Navigator imports.
- [x] 1.3 Implement pure strict validation and deterministic bounded report, route positional CLI through readJsonDocument.

## 2. Refusal and proof slice

- [x] 2.1 Add production negatives for digest tampering, re-digested semantic mismatches, duplicates, unknown keys, invocation and file boundaries.
- [x] 2.2 Remove guards individually, observe corresponding production tests fail, restore guards and record adjacent Proof comments.
- [x] 2.3 Run scoped tests, typecheck, lint, formatting and OpenSpec validation; record evidence and skipped checks.

## 3. Installed launcher review repair

- [x] 3.1 Reproduce the omitted launcher route with a failing built executable acceptance test.
- [x] 3.2 Expose the command through the installed launcher allowlist and help.
- [x] 3.3 Validate real Navigator output and refuse tampered tasks through the built executable outside the repository; watch the digest-guard mutation fail that refusal.
- [x] 3.4 Run package build tests, scoped lint/typecheck, formatting and OpenSpec validation.
