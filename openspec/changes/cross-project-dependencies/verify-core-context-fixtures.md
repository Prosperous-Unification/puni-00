# Core dependency-context fixture repair — 2026-10-23

Base: `9f3a179a0c3a6caf868f0acd5fefc66aedfc85c3`, isolated managed worktree
`/home/df/.codex/worktrees/c3cc/puni-00`. The primary feature worktree was not
edited. This restores the existing eager incident-capability prerequisite in
legacy unit-of-work fixtures; production code and existing assertions are unchanged.
No new behavior, contract, architecture, or OpenSpec delta is introduced.

## Observed baseline and repair

```sh
bun test libs/wbs/application/core/src/http/step.routes.test.ts \
  libs/wbs/application/core/src/use-cases/admission.test.ts \
  libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts \
  libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts \
  libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts \
  --timeout=10000
```

At the exact base: **11 pass, 15 fail, 37 assertions**, exit 1. Log:
`/tmp/core-context-baseline.log`. Failures reach the eager
`createDependencyContext` incident-persistence requirement with no
`typedDependencies` in the admitted scope. Six use the counting unit of work,
two use recovery scopes, two use the recording unit of work, one uses staged
scope identities, and four use the admission runner.

Each fixture now supplies the existing real `inMemoryTypedDependencies()`
implementation, including `incidents.capture`, `detach`, and `restore`.
The counting fixture permits that named store and retains its error for every
other store. Recovery authority and expiry assertions, commit/fanout ordering,
rollback decisions, staged store identities, serialized repair, and actor/project
admission constraints remain unchanged. No lazy context or fake incident
persistence was introduced.

## Fresh focused verification

The complete focused command was:

```sh
bun test libs/wbs/application/core/src/http/step.routes.test.ts \
  libs/wbs/application/core/src/use-cases/admission.test.ts \
  libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts \
  libs/wbs/application/core/src/module/plan-commands/plan-command-scope.test.ts \
  libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts \
  libs/wbs/application/core/src/service/dependency-context.test.ts \
  libs/wbs/application/core/src/testing/writes-fixture.test.ts \
  libs/wbs/adapters/store-memory/src/typed-dependency-fixture.test.ts \
  --timeout=10000
```

**52 pass, 0 fail, 223 Bun assertions**, exit 0. Log:
`/tmp/core-context-complete-tests.log`. This includes all four missing persistence
constructor negatives (all/capture/detach/restore), all five malformed retention
constructor negatives, and real memory incident capture/detach/restore coverage.

The new counting-unit-of-work negative exercises unexpected project-store access
through `UnitOfWork.run`, asserting rejection and the recorded rollback. Replacing
only the proxy's throw with `return undefined` produced **0 pass, 1 fail**,
exit 1: `AssertionError: Missing expected rejection.` after the unit of work resolved. The throw was
restored before the final green run. Log:
`/tmp/core-context-tripwire-final-mutant.log`; adjacent `Proof:` records this fault.
No production safety check was changed.

## Configured verification

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`:
  exit 0, including every module check and `bunx tsc --build --force
libs/wbs/application/core/tsconfig.json`. Log:
  `/tmp/core-context-typecheck-complete.log`. Earlier attempts found TS2352 at
  the partial catalog casts; explicit `unknown` boundary casts fixed them. The
  counting proxy's boundary comment names its rejection of omitted members.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint`:
  exit 0, uncached configured ESLint over core source, testing composition, and
  Playwright config. Log: `/tmp/core-context-lint-verified.log`. Nx printed
  the existing `NO_COLOR`/`FORCE_COLOR` environment warning.
- `bunx prettier --check` on all six changed TypeScript files and this evidence
  file: exit 0. The complete path list is the four changed consumer fixture paths above,
  `libs/wbs/application/core/src/testing/writes-fixture.ts`,
  `libs/wbs/application/core/src/testing/writes-fixture.test.ts`, and this file;
  `use-cases/admission.test.ts` is a consumer and was not edited.
- `./node_modules/.bin/openspec validate cross-project-dependencies --json`:
  exit 0, **1 passed, 0 failed**. Log: `/tmp/core-context-openspec-final.log`.
- `git diff --check`: exit 0.
- `bun install --frozen-lockfile`: exit 0, 1493 packages installed. Its initial
  sandboxed attempt failed EROFS before installation and is not success evidence;
  the authorized retry used the isolated worktree.

Earlier lint attempts identified only changed-file import sorting and the new
negative's Bun matcher typing (`await-thenable`, `no-confusing-void-expression`,
`no-meaningless-void-operator`). The negative now uses real `node:assert/strict`
`rejects` and reads the unexpected store in the unit-of-work decision. Its repeat
mutation and final focused suite passed after these changes; final import sorting
was checked with scoped ESLint.

Normal commit hooks ran without bypass: staged lint, format, plaintext-secrets,
private-nesting, prepare-commit-msg, and commit-msg passed. Tool Wiki exited 0
with `status: inactive`, `certified: false` because its external activation root
is not provisioned. Migration lint, website migration lint, and doc-caps were
explicitly skipped because no staged paths matched. Log:
`/tmp/core-context-commit.log`. This evidence-only follow-up uses normal hooks too.

## Limits

No host gate, full Nx gate, browser tests, deployment, push, or merge was run.
This packet proves the bounded fixtures and constructor negatives, not the full
cross-project feature. Required configured checks and normal commit hooks are
reported with their actual outcomes; Tool Wiki inactivity is not certification.
