import { afterAll } from 'bun:test';

import { removeProcessRoot } from '.';

// Bun test workers skip Node-compatible exit hooks at runner teardown. A
// preload hook spans every file assigned to the worker, unlike a hook registered
// by the first test file that happens to import the cached scratch module.
// Proof: TASK-385's h2puni fault run removed this hook; scratch.test.ts failed
// and the watched wbs-test-* count increased.
// Proof: tool-git-hooks:typecheck caught a deliberate string assigned to number
// here (TS2322); removing ../test/scratch/**/*.ts from its spec include hid the
// same error. The temporary assignment was removed after both runs.
afterAll(removeProcessRoot);

// No `setDefaultTimeout` here. Bun 1.4.2 applies a preload's default to the first test file only
// and overrides the target's `--timeout=<ms>` there, so the 30-second default this file used to set
// left every later file at 5 seconds. The flag is where each suite's budget lives
// (docs/test-budgets.md); scratch.test.ts proves it ends a hang in every file.
