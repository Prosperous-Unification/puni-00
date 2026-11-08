import { expect, test } from 'bun:test';

for (const fault of [
  'partial',
  'untrusted',
  'unrelated',
  'aggregate',
  'success',
  'close',
  'report',
  'evidence',
] as const)
  test(`partial census preserves exact failure and closes before reporting: ${fault}`, async () => {
    const source = await Bun.file(
      new URL('./registry-deletion.fixture.ts', import.meta.url),
    ).text();
    const start = source.indexOf('export async function requireRegistryPartialCensus');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('export ', ''),
    );
    const failure =
      fault === 'untrusted'
        ? { message: 'Current tag omits required manifest revision' }
        : fault === 'aggregate'
          ? new AggregateError(
              [new Error('private')],
              'Current tag omits required manifest revision',
            )
          : new Error(
              fault === 'unrelated'
                ? 'private cause'
                : 'Current tag omits required manifest revision',
            );
    const closeFailure = new Error('close refused');
    const reportFailure = new Error('report refused');
    const calls: string[] = [];
    const records: string[] = [];
    // Boundary: execute the exact owned fixture source with explicit modeled ports, never external code.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const createObserver = new Function(
      'collectRegistryInventory',
      'console',
      `${body}; return requireRegistryPartialCensus;`,
    ) as (...ports: unknown[]) => (input: unknown) => Promise<never>;
    const invoke = createObserver(
      () => {
        calls.push('census');
        // Boundary: the intentional non-Error rejection proves diagnostic shape rejection without changing the thrown identity.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return fault !== 'success' ? Promise.reject(failure) : Promise.resolve({});
      },
      {
        error: (line: string) => {
          calls.push('report');
          if (fault === 'report') throw reportFailure;
          records.push(line);
        },
      },
    );
    const pending = invoke({
      session: {
        read: () => ({
          maintenanceEvidence: fault === 'evidence' ? null : { operationId: 'owned' },
        }),
        record: () => {
          calls.push('record');
          return Promise.resolve();
        },
      },
      runtime: {
        fence: () => {
          calls.push('fence');
          return Promise.resolve('fenced');
        },
        assertStopped: () => {
          calls.push('stopped');
          return Promise.resolve();
        },
        identify: () => {
          calls.push('identify');
          return Promise.resolve({});
        },
        open: (_session: unknown, mode: string) => {
          calls.push(mode);
          return Promise.resolve({
            endpoint: {},
            close: () => {
              calls.push('close');
              return fault === 'close' ? Promise.reject(closeFailure) : Promise.resolve();
            },
          });
        },
      },
      ports: {},
    });
    const rejected = await pending.then(
      () => undefined,
      (cause: unknown) => cause,
    );
    if (fault === 'evidence') {
      expect(rejected).toBeInstanceOf(Error);
      expect(calls).toEqual([]);
    } else {
      expect(calls.slice(0, 7)).toEqual([
        'fence',
        'record',
        'stopped',
        'identify',
        'readonly',
        'census',
        'close',
      ]);
      if (fault === 'close' || fault === 'report') {
        expect(rejected).toBeInstanceOf(AggregateError);
        expect((rejected as AggregateError).errors).toEqual([
          failure,
          fault === 'close' ? closeFailure : reportFailure,
        ]);
        expect((rejected as Error).cause).toBe(failure);
      } else if (fault === 'success') {
        expect(rejected).toBeInstanceOf(Error);
        expect((rejected as Error).message).toBe('Partial census unexpectedly succeeded');
      } else expect(rejected).toBe(failure);
    }
    expect(records).toEqual(
      fault === 'partial' ? ['task8-partial-census:current-tag-without-revision'] : [],
    );
    expect(records.join('')).not.toContain('private');
  });
