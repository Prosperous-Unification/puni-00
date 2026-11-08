import { expect, test } from 'bun:test';

import { describeRegistryDeletionFailure } from './registry-deletion.fixture';
import { observeRegistryDeletionOwner } from './registry-deletion-owner-observation.fixture';
for (const [message, expected] of [
  ['Missing child manifest revision', 'missing-child-revision'],
  ['Missing stored manifest content', 'missing-manifest-content'],
  ['Missing or unsupported registry dependency', 'missing-dependency'],
  ['private unrelated failure', 'unknown'],
] as const)
  test(`fixed retained census failure category ${expected}`, () => {
    expect(describeRegistryDeletionFailure(new Error(message))).toBe(expected);
  });
test('untrusted shape and nested failure do not become retained census proof', () => {
  expect(describeRegistryDeletionFailure({ message: 'Missing child manifest revision' })).toBe(
    'unknown',
  );
  expect(
    describeRegistryDeletionFailure(
      new AggregateError(
        [new Error('Missing child manifest revision')],
        'Missing child manifest revision',
      ),
    ),
  ).toBe('unknown');
});
for (const fault of [
  'exact',
  'unrelated',
  'aggregate',
  'reporter',
  'observation',
  'both-reporters',
  'reporter-observation',
  'undefined',
  'null',
  'opaque',
  'success',
  'success-observation',
  'success-report',
  'caller-uid',
  'caller-gid',
] as const)
  test(`actual maintenance catch emits bounded category and preserves failure ${fault}`, async () => {
    const observed = await observeRegistryDeletionOwner({ family: 'maintenance', fault });
    if (fault === 'caller-uid' || fault === 'caller-gid') {
      expect(observed.state).toBe('rejected');
      expect(observed.message).toBe('Wrong fixture owner');
      expect(observed.events).toEqual([]);
      expect(observed.received).toEqual([]);
      return;
    }
    expect(observed.received).toEqual([
      {
        directory: '/var/lib/puni-registry/journal/contents',
        operationId: 'native-host-retire',
        owner: 'operator',
        kind: 'retirement',
        recover: false,
        hasPorts: true,
        hasRuntime: true,
        hasBackup: true,
        clock: '2026-11-08T00:00:00.000Z',
      },
    ]);
    expect(observed.observerFinishes).toBe(1);
    expect(observed.events.slice(0, 7)).toEqual([
      'installation',
      'ports',
      'clock',
      'journal-read',
      'runtime',
      'observer-start',
      'maintenance',
    ]);
    if (fault === 'success') {
      expect(observed.state).toBe('fulfilled');
      expect(observed.output).toEqual(['verified-native-retirement']);
      expect(observed.members).toEqual([]);
      expect(observed.events.slice(7)).toEqual([
        'observer-finish',
        'http-report',
        'journal-read',
        'output',
      ]);
    } else {
      expect(observed.state).toBe('rejected');
      expect(observed.output).toEqual([]);
      const expected =
        fault === 'reporter'
          ? ['primary', 'category-reporter']
          : fault === 'observation'
            ? ['primary', 'observation']
            : fault === 'both-reporters'
              ? ['primary', 'category-reporter', 'http-reporter']
              : fault === 'reporter-observation'
                ? ['primary', 'category-reporter', 'observation']
                : fault === 'success-observation'
                  ? ['observation']
                  : fault === 'success-report'
                    ? ['http-reporter']
                    : ['primary'];
      expect(observed.members).toEqual(expected);
      if (expected.length > 1) {
        expect(observed.isAggregateError).toBe(true);
        expect(observed.hasPrimaryCause).toBe(true);
      } else if (expected[0] === 'primary') expect(observed.isExactPrimary).toBe(true);
      if (
        fault === 'exact' ||
        fault === 'unrelated' ||
        fault === 'aggregate' ||
        fault === 'undefined' ||
        fault === 'null' ||
        fault === 'opaque'
      )
        expect(observed.errors).toContain(
          'task8-deletion-retained:' + (fault === 'exact' ? 'missing-child-revision' : 'unknown'),
        );
      expect(observed.events).toContain('observer-finish');
    }
    expect(observed.errors.join('\n')).not.toContain('PRIVATE');
  });
for (const fault of ['none', 'publication', 'observation', 'both', 'output'] as const)
  for (const kind of ['expired', 'protected'] as const) {
    if (kind === 'protected' && fault !== 'none') continue;
    test(`actual deletion publication preserves failures ${fault}${kind === 'protected' ? ' protected' : ''}`, async () => {
      const observed = await observeRegistryDeletionOwner({ family: 'publication', fault, kind });
      expect(observed.selectedPublication).toBe(kind);
      expect(observed.observerFinishes).toBe(1);
      expect(observed.received).toEqual([]);
      expect(observed.events.slice(0, 4)).toEqual([
        'installation',
        'ports',
        'observer-start',
        'publication',
      ]);
      if (fault === 'none') {
        expect(observed.state).toBe('fulfilled');
        expect(observed.members).toEqual([]);
        expect(observed.output.map((line): unknown => JSON.parse(line))).toEqual([
          {
            kind,
            operationId: 'owned-publication',
            repository: kind === 'protected' ? 'retained/index' : 'retained/expired',
            root: 'sha256:' + 'a'.repeat(64),
            manifests: (kind === 'protected' ? ['a', 'c', 'd'] : ['a']).map(
              (letter) => 'sha256:' + letter.repeat(64),
            ),
            blobs: (kind === 'protected' ? ['b', 'e', 'f', '0'] : ['b', 'e', 'f']).map(
              (letter) => 'sha256:' + letter.repeat(64),
            ),
          },
        ]);
        expect(observed.events.slice(4)).toEqual(['observer-finish', 'http-report', 'output']);
      } else {
        expect(observed.state).toBe('rejected');
        expect(observed.output).toEqual([]);
        expect(observed.members).toEqual(
          fault === 'publication'
            ? ['primary']
            : fault === 'observation'
              ? ['observation']
              : fault === 'both'
                ? ['primary', 'observation']
                : ['output'],
        );
        if (fault === 'publication') expect(observed.isExactPrimary).toBe(true);
        if (fault === 'both' || fault === 'observation') {
          expect(observed.isAggregateError).toBe(true);
          expect(observed.hasObserverCause).toBe(true);
        }
      }
    });
  }
