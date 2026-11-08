import { expect, test } from 'bun:test';

import {
  registrySpecificationSha256,
  verifyRegistryResource,
} from './registry-maintenance-observation';

const resource = {
  apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
  kind: 'Kustomization',
  metadata: {
    name: 'fleet-helsinki',
    namespace: 'flux-system',
    uid: 'owned',
    labels: {
      'kustomize.toolkit.fluxcd.io/name': 'fleet-helsinki-bootstrap',
      'kustomize.toolkit.fluxcd.io/namespace': 'flux-system',
    },
  },
  spec: {
    sourceRef: { kind: 'GitRepository', name: 'puni-fleet' },
    path: './clusters/helsinki',
    suspend: false,
  },
  status: { lastHandledReconcileAt: 'observed' },
};
function pin() {
  return {
    apiVersion: resource.apiVersion,
    kind: resource.kind,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    uid: resource.metadata.uid,
    owner: 'fleet-helsinki-bootstrap',
    specificationSha256: registrySpecificationSha256(resource.kind, resource.spec),
  };
}
test('fresh resource permits only its modeled suspension mutation', () => {
  expect(
    verifyRegistryResource(pin(), { ...resource, spec: { ...resource.spec, suspend: true } })
      .metadata.uid,
  ).toBe('owned');
});
for (const fault of [
  'uid',
  'source',
  'path',
  'owner',
  'owner-namespace',
  'missing-owner-namespace',
  'missing-status',
] as const) {
  test(`fresh identity refuses ${fault} drift`, () => {
    const changed = structuredClone(resource);
    if (fault === 'uid') changed.metadata.uid = 'foreign';
    if (fault === 'source') changed.spec.sourceRef.name = 'foreign';
    if (fault === 'path') changed.spec.path = './foreign';
    if (fault === 'owner') changed.metadata.labels['kustomize.toolkit.fluxcd.io/name'] = 'foreign';
    if (fault === 'owner-namespace')
      changed.metadata.labels['kustomize.toolkit.fluxcd.io/namespace'] = 'foreign';
    if (fault === 'missing-owner-namespace')
      Reflect.deleteProperty(changed.metadata.labels, 'kustomize.toolkit.fluxcd.io/namespace');
    if (fault === 'missing-status') Reflect.deleteProperty(changed, 'status');
    expect(() => verifyRegistryResource(pin(), changed)).toThrow();
  });
}
