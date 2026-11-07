import * as AppEx from 'application-exception';
import { spyOn } from 'bun:test';

/** What the injected fault throws, so a test can tell it apart from a genuine library failure. */
const INJECTED_REPORTING_FAULT = 'injected reporting fault: makeReportPair threw';

/**
 * Run `run` while application-exception's `makeReportPair` throws, so a test drives the
 * reporting-loss branch of `reportFailure` through its production call path.
 *
 * No caught value makes caught-object-report-json 15 or application-exception 0.9 throw, so the
 * loss can no longer be provoked from the input side; the fault is injected at the library
 * instead. Bun's `spyOn` replaces the export on the module namespace every importer shares, the
 * named import in `report-failure.ts` included, and the original is restored before this returns,
 * whatever `run` did.
 *
 * Bun tests only: it imports `bun:test`, and the shared namespace is a property of Bun's CommonJS
 * interop, not an ESM guarantee. Vitest suites mock `application-exception` instead, as
 * `app-fault.test.tsx` in fe-01 does.
 *
 * @param run Synchronous work that reports one or more failures.
 * @returns Whatever `run` returned.
 * @throws {TypeError} When `run` returns a promise: its continuation would outlive the restore
 *   and report normally, so the test would not prove what it claims.
 */
export function runWhileReportingThrows<T>(run: () => T): T {
  const fault = spyOn(AppEx, 'makeReportPair').mockImplementation(() => {
    throw new Error(INJECTED_REPORTING_FAULT);
  });
  try {
    const outcome = run();
    if (outcome instanceof Promise) {
      throw new TypeError('runWhileReportingThrows takes synchronous work only');
    }
    return outcome;
  } finally {
    fault.mockRestore();
  }
}
