import { afterAll, setDefaultTimeout } from 'bun:test';

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

// Bun's default limit is 5 seconds a test. The suites that load this preload run real command
// lines over real Git fixtures, and on the shared build host 24 of Twilight Burokrat's tests took
// between 3.5 and 4.94 seconds in one gate run (h2puni, d748f1a7, 2026-09-20): a limit a loaded
// host reaches makes the gate fail at random. Thirty seconds still ends a test that hangs. A test
// whose point is its own speed states its own limit as the third argument.
// Proof: with this line removed, `a test may outlast Bun's five-second default` in
// scratch.test.ts timed out after 5000ms (2026-09-20).
setDefaultTimeout(30_000);
