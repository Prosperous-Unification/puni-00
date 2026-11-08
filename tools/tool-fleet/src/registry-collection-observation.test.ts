import { expect, test } from 'bun:test';

import { observeRegistryAdmission } from './registry-admission-observation.fixture';

test('collection fixture preserves strict normal admission receipts', async () => {
  const observed = await observeRegistryAdmission('collection', 'normal');
  expect(observed.state).toBe('fulfilled');
  expect(observed.value).toBe('verified');
  expect(observed.records).toEqual([
    { fault: 'absent', refused: true, gcStarted: false },
    { fault: 'snapshot', refused: true, gcStarted: false },
    { fault: 'none', refused: false, gcStarted: true },
  ]);
  expect(observed.commands).toEqual([['/pinned/registry', 'garbage-collect']]);
  expect(observed.hasRestoredSpawn).toBe(true);
});
test('collection fixture reports actual returned child before missing-call assertion', async () => {
  const observed = await observeRegistryAdmission('collection', 'missing-call');
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Collection receipt admission failed before native GC launch');
  expect(observed.records).toEqual([{ fault: 'absent', refused: false, gcStarted: true }]);
  expect(observed.hasRestoredSpawn).toBe(true);
});
for (const fault of ['spawn-fails', 'effect-fails'] as const) {
  test('collection fixture preserves exact failure and start observation: ' + fault, async () => {
    const observed = await observeRegistryAdmission('collection', fault);
    expect(observed.state).toBe('rejected');
    expect(observed.isOriginalFailure).toBe(true);
    expect(observed.records).toEqual([
      { fault: 'absent', refused: false, gcStarted: fault === 'effect-fails' },
    ]);
    expect(observed.hasRestoredSpawn).toBe(true);
  });
}
test('collection fixture refuses an invalid returned child without a start claim', async () => {
  const observed = await observeRegistryAdmission('collection', 'invalid-child');
  expect(observed.state).toBe('rejected');
  expect(observed.message).toBe('Native GC child identity is invalid');
  expect(observed.records).toEqual([{ fault: 'absent', refused: false, gcStarted: false }]);
  expect(observed.hasRestoredSpawn).toBe(true);
});
for (const fault of ['root', 'action', 'marker', 'read-absent', 'read-unreadable'] as const) {
  test('whole collection module refuses invalid eligibility before effects: ' + fault, async () => {
    const observed = await observeRegistryAdmission('collection', fault);
    expect(observed.state).toBe('rejected');
    if (fault === 'read-absent' || fault === 'read-unreadable')
      expect(observed.isOriginalFailure).toBe(true);
    else expect(observed.message).toBe('Collection proof requires fixed owned root fixture');
    expect(observed.records).toEqual([]);
    expect(observed.commands).toEqual([]);
    expect(observed.requests).toEqual([]);
    expect(observed.reads).toEqual(
      fault === 'root' || fault === 'action' ? [] : ['/root/task8-fixture/collect-proof'],
    );
    expect(observed.hasRestoredSpawn).toBe(true);
  });
}

for (const fault of ['no-final-child', 'duplicate-final-child'] as const) {
  test('whole collection module requires exactly one returned GC child: ' + fault, async () => {
    const observed = await observeRegistryAdmission('collection', fault);
    expect(observed.state).toBe('rejected');
    expect(observed.message).toBe('Verified collection did not launch exactly one native GC');
    expect(observed.records).toEqual([
      { fault: 'absent', refused: true, gcStarted: false },
      { fault: 'snapshot', refused: true, gcStarted: false },
    ]);
    expect(observed.commands).toEqual(
      fault === 'no-final-child'
        ? []
        : [
            ['/pinned/registry', 'garbage-collect'],
            ['/pinned/registry', 'garbage-collect'],
          ],
    );
    expect(observed.hasRestoredSpawn).toBe(true);
  });
}
