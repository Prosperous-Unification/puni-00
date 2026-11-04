import { createHash } from 'node:crypto';

import { type } from 'arktype';

const Fields = type('Record<string, unknown>');
const Resource = type({
  apiVersion: 'string > 0',
  kind: 'string > 0',
  metadata: {
    name: 'string > 0',
    uid: 'string > 0',
    'namespace?': 'string > 0',
    'labels?': 'Record<string, string>',
    'annotations?': 'Record<string, string>',
  },
  'spec?': Fields,
  'status?': Fields,
  'data?': Fields,
});
export const RegistryResourcePin = type({
  apiVersion: 'string > 0',
  kind: 'string > 0',
  name: 'string > 0',
  namespace: 'string | null',
  uid: 'string > 0',
  owner: 'string | null',
  specificationSha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});
export type RegistryResourcePin = typeof RegistryResourcePin.infer;

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid resource number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry: unknown) => canonical(entry)).join(',')}]`;
  const fields = Fields.assert(value);
  return `{${Object.keys(fields)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(fields[key])}`)
    .join(',')}}`;
}

/** Hash all immutable specification fields; only the exact maintenance-owned replica/suspend/selector fields are excluded. */
export function registrySpecificationSha256(kind: string, specification: unknown): string {
  const fields = structuredClone(Fields.assert(specification));
  if (kind === 'Kustomization') delete fields['suspend'];
  if (kind === 'Deployment') delete fields['replicas'];
  if (kind === 'Service') delete fields['selector'];
  return createHash('sha256').update(canonical(fields)).digest('hex');
}

/** Fresh API objects must match root-installed identity/source/specification pins; missing status is never inferred as convergence. */
export function verifyRegistryResource(
  pin: RegistryResourcePin,
  observed: unknown,
): typeof Resource.infer {
  const resource = Resource.assert(observed);
  const specification = resource.kind === 'ConfigMap' ? resource.data : resource.spec;
  const namespace = resource.metadata.namespace ?? null;
  const owner = resource.metadata.labels?.['kustomize.toolkit.fluxcd.io/name'] ?? null;
  const ownerNamespace =
    resource.metadata.labels?.['kustomize.toolkit.fluxcd.io/namespace'] ?? null;
  // Proof: UID/source/path/owner mutation cases each refuse before a host action can consume the observation.
  if (
    resource.apiVersion !== pin.apiVersion ||
    resource.kind !== pin.kind ||
    resource.metadata.name !== pin.name ||
    namespace !== pin.namespace ||
    resource.metadata.uid !== pin.uid ||
    owner !== pin.owner ||
    // Proof: foreign and missing owner-namespace mutations passed before this complete Flux identity check (task8-owner-namespace-red.log).
    ownerNamespace !== (pin.owner === null ? null : 'flux-system') ||
    registrySpecificationSha256(resource.kind, specification) !== pin.specificationSha256
  )
    throw new Error('Registry resource differs from installed identity or specification');
  // Kubernetes ConfigMaps and service specifications have no convergence status contract here.
  if (
    [
      'Kustomization',
      'GitRepository',
      'Deployment',
      'PersistentVolumeClaim',
      'PersistentVolume',
      'Node',
    ].includes(resource.kind) &&
    resource.status === undefined
  )
    throw new Error('Missing required registry resource status');
  return resource;
}
