import { expect, test } from 'bun:test';

import { registryMaintenancePatch } from './registry-maintenance-kubernetes';

const identity = { metadata: { uid: 'owned', resourceVersion: '123' } };
test('fixed maintenance patches compare exact resource version before changing named fields', () => {
  expect(registryMaintenancePatch(identity, { kind: 'stop' })).toEqual([
    { op: 'test', path: '/metadata/uid', value: 'owned' },
    { op: 'test', path: '/metadata/resourceVersion', value: '123' },
    { op: 'add', path: '/spec/replicas', value: 0 },
  ]);
});
for (const fault of ['version', 'uid', 'action', 'field'] as const) {
  test(`fixed mutation boundary refuses ${fault}`, () => {
    const changed = structuredClone(identity);
    if (fault === 'version') Reflect.deleteProperty(changed.metadata, 'resourceVersion');
    if (fault === 'uid') Reflect.deleteProperty(changed.metadata, 'uid');
    const action =
      fault === 'action'
        ? { kind: 'exec', argv: ['sh'] }
        : fault === 'field'
          ? { kind: 'stop', path: '/arbitrary' }
          : { kind: 'stop' };
    expect(() => registryMaintenancePatch(changed, action)).toThrow();
  });
}
test('Flux patch preserves arbitrary prior annotation text as JSON and never a command', () => {
  expect(
    registryMaintenancePatch(identity, {
      kind: 'owner',
      suspended: true,
      requestedAt: '$(malicious)',
    }),
  ).toContainEqual({
    op: 'add',
    path: '/metadata/annotations',
    value: { 'reconcile.fluxcd.io/requestedAt': '$(malicious)' },
  });
});
