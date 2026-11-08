import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument, stringify } from 'yaml';

import type { ObservabilitySource } from './observability-source';
import authority from './observability-source-differences.json';
import {
  assertRenderedObservabilitySource,
  indexObservabilitySource,
} from './observability-source-render';

const Scalar = type('string|number|boolean|null');
const Difference = type({
  path: 'string>0',
  local: Scalar,
  production: Scalar,
  reason: 'string>0',
  verification: 'string>0',
  '+': 'reject',
});
export type ObservabilitySourceDifference = typeof Difference.infer;
const escape = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
function expandConfiguration(manifest: Record<string, unknown>) {
  const decoded = type({ kind: 'string', data: 'Record<string,string>' })(manifest);
  if (decoded instanceof type.errors || decoded.kind !== 'ConfigMap') return;
  const files: Record<string, unknown> = {};
  for (const [name, content] of Object.entries(decoded.data)) {
    if (/\.ya?ml$/.test(name) || name === 'relay') {
      const document = parseDocument(content);
      if (document.errors.length)
        throw new Error('Observability source configuration YAML malformed');
      files[name] = document.toJSON() as unknown;
    } else if (name.endsWith('.json')) files[name] = JSON.parse(content) as unknown;
    else if (name.endsWith('.ndjson'))
      files[name] = content
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line) as unknown);
    else files[name] = content;
  }
  manifest['data'] = files;
}
/** Structural view expands YAML/JSON and projects only validated content-address identities; every payload, namespace and sibling stays visible. */
export function compareObservabilitySourceView(
  source: ObservabilitySource,
  rendered: Record<string, string>,
): Map<string, unknown> {
  const indexed = indexObservabilitySource(rendered);
  for (const instance of source.instances) {
    const owner = `${instance.namespace}/native`;
    const resources = indexed[owner];
    const names = new Map<string, string>();
    for (const [identity, manifest] of Object.entries(resources)) {
      const config = type({ kind: "'ConfigMap'", metadata: { name: 'string' } })(manifest);
      if (config instanceof type.errors) continue;
      const name = config.metadata.name;
      const base = name.slice(0, -65);
      names.set(name, base);
      config.metadata.name = base;
      Reflect.deleteProperty(resources, identity);
      resources[`ConfigMap:${instance.namespace}:${base}`] = manifest;
    }
    for (const manifest of Object.values(resources)) {
      const document = parseDocument(stringify(manifest));
      const workload = type({ spec: { template: { spec: { volumes: 'object[]' } } } })(manifest);
      if (workload instanceof type.errors) continue;
      for (let index = 0; index < workload.spec.template.spec.volumes.length; index++) {
        const path = ['spec', 'template', 'spec', 'volumes', index, 'configMap', 'name'];
        const name = document.getIn(path);
        if (typeof name === 'string' && names.has(name)) document.setIn(path, names.get(name));
      }
      Object.assign(manifest, document.toJSON());
    }
  }
  for (const resources of Object.values(indexed))
    for (const manifest of Object.values(resources)) expandConfiguration(manifest);
  const handoffs = Object.fromEntries(
    source.handoffs.map((handoff) => [
      handoff.path,
      {
        owner: handoff.owner,
        enabled: handoff.enabled,
        applied: handoff.applied,
        resources: Object.fromEntries(
          handoff.resources.map((resource) => [
            resource.identity,
            {
              manifest: parseDocument(resource.manifest).toJSON() as unknown,
              patches: resource.patches,
            },
          ]),
        ),
      },
    ]),
  );
  const requirements = Object.fromEntries(
    source.instances.map((instance) => [
      instance.namespace,
      {
        authority: instance.authority,
        routes: instance.routes,
        retention: instance.retention,
        policy: instance.policy,
        capacity: instance.capacity,
        backupCaRequired: source.assembly.request.placement === 'local',
        requiredSecrets: instance.requiredSecrets.map((secret) =>
          secret.name === 'elastic-s3-credentials'
            ? { ...secret, keys: secret.keys.filter((key) => key !== 'ca.crt') }
            : secret,
        ),
      },
    ]),
  );
  const flat = new Map<string, unknown>();
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        flat.set(path, value);
        return;
      }
      for (const [key, child] of entries) visit(child, `${path}/${escape(key)}`);
    } else flat.set(path, value);
  }
  visit(
    {
      rendered: indexed,
      handoffs,
      requirements,
      retainedListeners: source.retainedListeners,
      platformAuthority: source.platformAuthority,
      migrationPrerequisites: source.migrationPrerequisites,
    },
    '',
  );
  return flat;
}
/** Independent checked-in scalar authority. Candidate-supplied reasons and expected values cannot authorize a new path. */
export function reviewObservabilitySourceDifferences(
  local: ObservabilitySource,
  production: ObservabilitySource,
): ObservabilitySourceDifference[] {
  const differences = Difference.array().assert(structuredClone(authority));
  if (
    local.assembly.request.instances[1].policy === 'disposable-rehearsal' &&
    production.assembly.request.instances[1].policy === 'retained-production'
  ) {
    const prefix =
      '/rendered/observability~1elasticsearch/Elasticsearch:observability:elasticsearch/spec/nodeSets/0';
    const capacity: [string, string, string][] = [
      [`${prefix}/podTemplate/spec/containers/0/resources/requests/memory`, '2Gi', '4Gi'],
      [`${prefix}/podTemplate/spec/containers/0/resources/limits/memory`, '2Gi', '4Gi'],
      [`${prefix}/podTemplate/spec/initContainers/3/resources/requests/memory`, '2Gi', '4Gi'],
      [`${prefix}/podTemplate/spec/initContainers/3/resources/limits/memory`, '2Gi', '4Gi'],
      [`${prefix}/podTemplate/spec/containers/0/env/0/value`, '-Xms1g -Xmx1g', '-Xms2g -Xmx2g'],
      [`${prefix}/volumeClaimTemplates/0/spec/resources/requests/storage`, '10Gi', '100Gi'],
      ['/requirements/observability/capacity/memory', '2Gi', '4Gi'],
      ['/requirements/observability/capacity/heap', '1g', '2g'],
      ['/requirements/observability/capacity/storage', '10Gi', '100Gi'],
      ['/requirements/observability/policy', 'disposable-rehearsal', 'retained-production'],
    ];
    for (const [path, first, second] of capacity)
      differences.push({
        path,
        local: first,
        production: second,
        reason:
          'Explicit disposable local production-role sizing; retained production bounds are unchanged.',
        verification: 'tools/tool-fleet/src/observability-source-parity.test.ts',
      });
  }
  return differences;
}
/** Complete actual-render comparison with exact authorized leaf values; no subtree, code-line, environment or namespace replacement. */
export function assertObservabilitySourceParity(
  local: ObservabilitySource,
  left: Record<string, string>,
  production: ObservabilitySource,
  right: Record<string, string>,
  input: unknown,
) {
  // Proof: removing the pair guard lost the placement refusal in the reversed-pair negative.
  if (
    local.assembly.request.placement !== 'local' ||
    production.assembly.request.placement !== 'production'
  )
    throw new Error('Observability source placement pair differs');
  assertRenderedObservabilitySource(local, left);
  assertRenderedObservabilitySource(production, right);
  const before = compareObservabilitySourceView(local, left),
    after = compareObservabilitySourceView(production, right);
  const supplied = Difference.array()(input);
  if (supplied instanceof type.errors)
    throw new Error('Observability source malformed differences');
  const authorized = new Map(
    reviewObservabilitySourceDifferences(local, production).map((difference) => [
      difference.path,
      difference,
    ]),
  );
  const accepted = new Set<string>();
  for (const difference of supplied) {
    const first = before.get(difference.path),
      second = after.get(difference.path);
    // Proof: removing scalar/path closure lost the unknown/subtree refusal in independently supplied exception negatives.
    if (
      !before.has(difference.path) ||
      !after.has(difference.path) ||
      !Scalar.allows(first) ||
      !Scalar.allows(second) ||
      /[?*]/.test(difference.path)
    )
      throw new Error('Observability source unknown or subtree difference');
    // Proof: removing this guard lost the unused-exception refusal in observability-source-parity.test.ts.
    if (isDeepStrictEqual(first, second)) throw new Error('Observability source unused difference');
    // Proof: removing uniqueness admitted repeated exception records in the duplicate negative.
    if (accepted.has(difference.path)) throw new Error('Observability source duplicate difference');
    // Proof: removing independent authorization admitted stale supplied values in the stale-exception negative.
    if (
      !isDeepStrictEqual(difference, authorized.get(difference.path)) ||
      !isDeepStrictEqual(first, difference.local) ||
      !isDeepStrictEqual(second, difference.production)
    )
      throw new Error('Observability source unauthorized scalar difference');
    accepted.add(difference.path);
  }
  // Proof: removing sibling comparison admitted an unreviewed Elasticsearch metadata label in the production parity negative.
  for (const path of new Set([...before.keys(), ...after.keys()]))
    if (
      !accepted.has(path) &&
      (!before.has(path) ||
        !after.has(path) ||
        !isDeepStrictEqual(before.get(path), after.get(path)))
    )
      throw new Error(`Observability source unreviewed difference: ${path}`);
  return {
    wholeRenderParity: true as const,
    reviewedDifferences: accepted.size,
    runtimeRehearsal: false as const,
    liveBinding: false as const,
  };
}
