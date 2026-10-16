# Burokrat source test selection verification

Base: `155c1c67cdd1b4e997dccd7da62c38ab988af0e2`. Bun: `1.4.2 (744846f84)`.

The CLI test target restores its declared source boundary (`sourceRoot` and
`tsconfig.spec.json` both select `src`). Generated toolkit dependencies below
`dist/` are package artifacts, not this project's source tests. This precise
boundary restoration does not change a product contract or require OpenSpec.

## Production path proof

`src/test-target.test.ts` executes the actual `project.json` test command in a
scratch workspace with the real scratch preload, one passing source test, two
failing generated dependency tests, and the two excluded package tests.

- Before the fix, the regression failed: the unscoped target executed
  `dist/toolkit/trusted-node-modules/thread-stream/test/vendored.test.js` and
  reported `EXCLUDED-TEST-SELECTED` (1 passing inner test, 1 failure, 1 error).
  Retained local output: `/tmp/burokrat-test-selection-red.log`.
- Replacing the scope with bare `src` also failed: Bun treats this as a path
  filter and selected `dist/.../test/src/nested.test.js`. Retained local output:
  `/tmp/burokrat-test-selection-src-filter.log`.
- Literal `./src` passed: 1 regression, 3 assertions. It selected the passing
  source test and excluded both generated tests and both package-only tests.
  An adjacent `Proof:` comment records both observed faults.

The test and imported `project.json` are covered by the target's `default`
input (`{projectRoot}/**/*`); the copied preload is covered by `sharedGlobals`
(`tools/test/**/*`). No new input lies outside the declared graph.

## Commands

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: passed, 1573 installs checked.
  The initial command without `BUN_TMPDIR` failed on a read-only temporary
  directory; no lockfile changed.
- `bun test apps/twilight-structure/twilight-burokrat/cli/src/test-target.test.ts`:
  passed, 1 test and 3 assertions after the fix.
- `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/test-target.test.ts`:
  passed after removing an unnecessary child PATH override.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source`:
  passed, uncached target execution (28.2 seconds).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck`:
  passed, uncached target execution (2 seconds).

- `NX_DAEMON=false bunx nx run twilight-burokrat:test`: IN_PROGRESS at review
  handoff, 48 source test files reached with no reported failure. The new
  regression passed within this run. Retained full output:
  `/tmp/burokrat-source-target-green.log`; local exec session `6340`. This is
  not a passing full-target claim.
- `bunx prettier --check` over all three changed files and `git diff --check`:
  passed.

The canonical h2 gate and its retained original log are unavailable in this
local sandbox. No shared h2 tree was edited or cleaned. The canonical gate,
whole-repository checks, and release publication remain unverified here.
