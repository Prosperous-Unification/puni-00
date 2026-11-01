## 1. Sequential staged lint

- [x] 1.1 Add `tools/tool-git-hooks/src/hooks/staged-lint.ts` and `staged-lint.test.ts`, replace only the lefthook lint invocation, and prove complete sequential nearest-project grouping (including nested project, workspace, spaces and leading-hyphen sources) through the production CLI with the real installed ESLint. Capture RED before implementation and GREEN afterward; a real rule violation in a later project and workspace batch must block the hook.
- [x] 1.2 Prove absent ESLint, abnormal child termination, malformed and unreadable present manifests fail through the production CLI; distinguish ordinary absent manifests. Watch each new safety guard's covering test fail with the guard removed or dependency broken, restore it, and add adjacent `Proof:` comments. Keep the same ESLint configuration/cwd and source glob. No shell interpolation, new dependency, cache, CI change or heap override.

## 2. Verification and integration handoff

- [ ] 2.1 Run focused tests, the owning tool-git-hooks test target once, affected lint/typecheck/format and OpenSpec validation, retaining output and timings in `verify.md`. Commit normally with all hooks and record any unavailable checks explicitly. Independently review only this bounded repair before attempting the large observability integration; record actual large-commit timings and memory outcome separately in the observability verification record.
