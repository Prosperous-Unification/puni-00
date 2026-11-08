import { readFile } from 'node:fs/promises';
import { runInThisContext } from 'node:vm';

import { expect, test } from 'bun:test';

for (const fault of ['none', 'unclassified', 'formatter', 'writer'] as const)
  test(`actual root failure export preserves tag diagnostic and cause ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-host.native.ts', import.meta.url),
      'utf8',
    );
    const marker = '}).catch(async (cause: unknown) => {';
    const start = source.indexOf(marker);
    const end = source.indexOf(
      "        });\n        await appendFile(home + '/actions.log'",
      start,
    );
    if (start < 0 || end < 0) throw new Error('Missing actual root failure export');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      'return async (cause: unknown) => {' + source.slice(start + marker.length, end) + '};',
    );
    const cause = new Error('PRIVATE_ROOT_FAILURE');
    const reporting = new Error('PRIVATE_REPORT_FAILURE');
    const records: unknown[] = [];
    const diagnostic = {
      stage: 'open',
      metadata: null,
      category: 'access-denied',
      location: { kind: 'absent' },
    };
    // Boundary: compile only the exact checked-in fixture catch; modeled ports are explicit function arguments.
    const createObserver = runInThisContext(
      '(function(signal, RegistryMaintenanceCancellation, appendFile, home, request, describeRegistryTagFailure) {' +
        body +
        '})',
    ) as (...ports: unknown[]) => (cause: unknown) => Promise<never>;
    const observe = createObserver(
      { aborted: false },
      class extends Error {},
      (path: string, bytes: string) => {
        expect(path).toBe('/fixed/failure.log');
        if (fault === 'writer') return Promise.reject(reporting);
        records.push(JSON.parse(bytes));
        return Promise.resolve();
      },
      '/fixed',
      { action: 'serve-deletion' },
      (observed: unknown) => {
        expect(observed).toBe(cause);
        if (fault === 'formatter') throw reporting;
        return fault === 'unclassified' ? null : diagnostic;
      },
    );
    const rejected = await observe(cause).catch((failure: unknown) => failure);
    if (fault === 'formatter' || fault === 'writer') {
      expect(rejected).toBeInstanceOf(AggregateError);
      expect((rejected as AggregateError).errors).toEqual([cause, reporting]);
      expect(records).toEqual([]);
    } else {
      expect(rejected).toBe(cause);
      expect(records).toEqual([
        {
          action: 'serve-deletion',
          ownSignalAborted: false,
          rootDeadline: false,
          ownerCancellation: false,
          other: true,
          ...(fault === 'unclassified' ? {} : { tagCleanup: diagnostic }),
        },
      ]);
      expect(JSON.stringify(records)).not.toContain('PRIVATE');
    }
  });
