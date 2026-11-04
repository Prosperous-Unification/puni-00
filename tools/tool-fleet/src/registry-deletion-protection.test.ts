import { expect, test } from 'bun:test';

import { observeRegistryAdmission } from './registry-admission-observation.fixture';

const digest = (letter: string) => 'sha256:' + letter.repeat(64);
const protection = {
  command: 'acquire-protection',
  expectedRevision: 7,
  operationId: 'native-deletion-protection',
  owner: 'operator',
  roots: [digest('a')],
  references: [{ repository: 'retained/index', digest: digest('a') }],
  reason: 'explicit-native-protected-index',
};
for (const fault of ['none', 'kind', 'repository', 'closure', 'count'] as const) {
  test('fixed canonical index protection boundary ' + fault, async () => {
    const observed = await observeRegistryAdmission('protection', fault);
    if (fault === 'none') {
      expect(observed.state).toBe('fulfilled');
      expect(observed.value).toBeNull();
      expect(observed.requests).toEqual([{ command: 'read' }, protection]);
    } else {
      expect(observed.state).toBe('rejected');
      expect(observed.message).toBe('Protected deletion fixture receipt differs');
      expect(observed.requests).toEqual([]);
    }
    expect(observed.commands).toEqual([]);
    expect(observed.hasRestoredSpawn).toBe(true);
  });
}
for (const fault of ['read-absent', 'read-unreadable', 'journal-fails', 'acquire-fails'] as const) {
  test('whole protection module preserves exact dependency refusal: ' + fault, async () => {
    const observed = await observeRegistryAdmission('protection', fault);
    expect(observed.state).toBe('rejected');
    expect(observed.isOriginalFailure).toBe(true);
    expect(observed.requests).toEqual(
      fault === 'journal-fails'
        ? [{ command: 'read' }]
        : fault === 'acquire-fails'
          ? [{ command: 'read' }, protection]
          : [],
    );
    expect(observed.commands).toEqual([]);
    expect(observed.reads).toEqual(['/etc/puni/registry-deletion-protected.json']);
    expect(observed.hasRestoredSpawn).toBe(true);
  });
}
