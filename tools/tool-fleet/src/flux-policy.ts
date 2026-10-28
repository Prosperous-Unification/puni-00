import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { readMemoryMiB } from './observability-capacity';
import { assertCandidatePodResources } from './observability-pod-resources';
import { decodeRenderedResources } from './rendered-resources';

const roles = [
  'source-controller',
  'kustomize-controller',
  'helm-controller',
  'notification-controller',
] as const;
// Proof: Task62 root-schema/patch-schema removal admitted foreign root options and an external patch path through validatePlatform.
const Overlay = type({
  apiVersion: "'kustomize.config.k8s.io/v1beta1'",
  kind: "'Kustomization'",
  resources: 'string[]',
  patches: type({ target: 'Record<string,unknown>', patch: 'string', '+': 'reject' }).array(),
  '+': 'reject',
});
// Proof: Task62 operation-schema removal admitted an extra from field in the production policy negative.
const Operation = type({ op: 'string', path: 'string', value: 'unknown', '+': 'reject' });
const Manager = type({
  spec: {
    template: {
      spec: {
        containers: type({
          name: "'manager'",
          resources: {
            requests: 'Record<string,string|number>',
            limits: 'Record<string,string|number>',
          },
        })
          .array()
          .atLeastLength(1),
      },
    },
  },
});
function refuse(reason: string): never {
  throw new Error(`Flux scratch policy ${reason}`);
}
function readDocument(bytes: string): unknown {
  const documents = parseAllDocuments(bytes);
  // Proof: Task62 yaml-count/yaml-errors removal admitted a second document and coherent duplicate keys.
  if (documents.length !== 1 || documents[0].errors.length) refuse('malformed or ambiguous YAML');
  return documents[0].toJSON();
}
/**
 * Validate the sole authored Flux overlay; only four exact identity-tested additive policies are supported.
 * Raw vendor authentication belongs to the caller. No patch executor or generic workload scanner runs here.
 * Complete resource maps reuse the locked manager's unchanged CPU/memory and the candidate quantity boundary.
 * Throws for foreign references/options/targets/operations, ambiguous YAML, incomplete or nonpositive bounds.
 */
export function assertFluxPolicy(bytes: string, vendorBytes: string): void {
  const overlay = Overlay.assert(readDocument(bytes));
  // Proof: Task62 root-closure removal admitted a foreign resource and an omitted controller role.
  if (
    !isDeepStrictEqual(overlay.resources, ['install.yaml']) ||
    overlay.patches.length !== roles.length
  )
    refuse('resource or role closure differs');
  const vendor = decodeRenderedResources(vendorBytes);
  const seen = new Set<string>();
  for (const patch of overlay.patches) {
    const name = type('string').assert(patch.target['name']);
    // Proof: Task62 target-closure removal admitted the wrong namespace and a duplicate controller role.
    if (
      !roles.some((role) => role === name) ||
      seen.has(name) ||
      !isDeepStrictEqual(patch.target, {
        group: 'apps',
        version: 'v1',
        kind: 'Deployment',
        name,
        namespace: 'flux-system',
      })
    )
      refuse('target or role differs');
    seen.add(name);
    const volumes = name === 'source-controller' ? ['data', 'tmp'] : ['temp'];
    const identities = [
      ['/apiVersion', 'apps/v1'],
      ['/kind', 'Deployment'],
      ['/metadata/name', name],
      ['/metadata/namespace', 'flux-system'],
      ['/spec/template/spec/containers/0/name', 'manager'],
      ['/spec/template/spec/volumes', volumes.map((name) => ({ name, emptyDir: {} }))],
    ].map(([path, value]) => ({ op: 'test', path, value }));
    const operations = Operation.array().assert(readDocument(patch.patch));
    const additions = [
      '/spec/template/spec/containers/0/resources/requests/ephemeral-storage',
      '/spec/template/spec/containers/0/resources/limits/ephemeral-storage',
      ...volumes.map(
        (_, index) => `/spec/template/spec/volumes/${String(index)}/emptyDir/sizeLimit`,
      ),
    ];
    // Proof: Task62 identity-closure/operation-count removals admitted a foreign manager test and a coherent extra operation.
    if (
      operations.length !== identities.length + additions.length ||
      !isDeepStrictEqual(operations.slice(0, identities.length), identities)
    )
      refuse('ordered identity tests or operation closure differ');
    const quantities = additions.map((path, index) => {
      const operation = operations[identities.length + index];
      // Proof: Task62 addition-closure removal admitted a foreign path and replace instead of add.
      if (operation.op !== 'add' || operation.path !== path) refuse('addition differs');
      // Proof: Task62 positive-quantity/string-quantity removals admitted zero scratch and a numeric quantity.
      if (typeof operation.value !== 'string' || readMemoryMiB(operation.value, refuse) <= 0)
        refuse('quantity must be a finite positive string');
      return operation.value;
    });
    const workload = vendor.find(
      (resource) =>
        resource.identity.kind === 'Deployment' && resource.identity.metadata.name === name,
    );
    const manager = Manager.assert(workload?.manifest).spec.template.spec.containers[0];
    // Proof: Task62 resource-dependency removal admitted an ephemeral request above its limit through validatePlatform.
    assertCandidatePodResources({
      requests: { ...manager.resources.requests, 'ephemeral-storage': quantities[0] },
      limits: { ...manager.resources.limits, 'ephemeral-storage': quantities[1] },
    });
  }
}
