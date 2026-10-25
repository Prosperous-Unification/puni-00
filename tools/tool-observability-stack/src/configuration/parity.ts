import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parse, parseAllDocuments } from 'yaml';

const Scalar = type('string | number | boolean | null');
const Difference = type({
  path: 'string>0',
  candidates: ["'local'", "'production'"],
  expected: { local: Scalar, production: Scalar, '+': 'reject' },
  reason: 'string>0',
  verification: 'string>0',
  '+': 'reject',
});
const Candidate = type({ rendered: 'string', effective: 'Record<string, string>', '+': 'reject' });
// Proof: bypassing Input.assert makes the malformed-exception CLI negative accept an empty reason.
const Input = type({
  candidates: { local: Candidate, production: Candidate, '+': 'reject' },
  differences: Difference.array(),
  '+': 'reject',
});
export type ParityInput = typeof Input.infer;
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const Manifest = type({ kind: 'string>0', metadata: { name: 'string>0', 'namespace?': 'string' } });
const releases = [
  'eck-operator',
  'elasticsearch',
  'kibana',
  'kube-prometheus-stack',
  'otel-collector',
];
const roles = [
  'StatefulSet:observability:signal-collector',
  'StatefulSet:observability:signal-gateway',
  'Deployment:observability:signal-metrics',
  'Job:observability:elastic-settings',
  'ConfigMap:observability:signal-configuration',
  ...releases.map((name) => `HelmRelease:observability:${name}`),
];
const effectiveRoles: Record<string, string[]> = {
  'eck-operator': ['StatefulSet:observability:elastic-operator'],
  elasticsearch: ['Elasticsearch:_:elasticsearch'],
  kibana: ['Kibana:_:kibana'],
  'kube-prometheus-stack': [
    'Prometheus:observability:kps-prometheus',
    'Alertmanager:observability:kps-alertmanager',
    'Deployment:observability:kps-operator',
    'Deployment:observability:kube-prometheus-stack-kube-state-metrics',
    'DaemonSet:observability:kube-prometheus-stack-prometheus-node-exporter',
  ],
  'otel-collector': ['DaemonSet:observability:otel-collector-agent'],
};

function parseJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map(parseJson);
  if (typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, parseJson(entry)]));
  throw new Error('malformed non-JSON value');
}
function pointer(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}
function stable(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(',')}}`;
}
function digest(value: Json): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

/** Reads one closed input envelope. ENOENT, EACCES and malformed content remain distinct refusals. */
export async function readParityInput(path: string): Promise<ParityInput> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (failure) {
    const fault = type({ code: 'string' }).assert(failure);
    // Proof: absent/unreadable CLI input negative controls independently exercise ENOENT and chmod-000 EACCES.
    if (fault.code === 'ENOENT') throw new Error(`absent input: ${path}`, { cause: failure });
    throw new Error(`unreadable input: ${path} (${fault.code})`, { cause: failure });
  }
  return parseParityInput(text);
}
/** Decodes the reviewed scalar records; callers retain the boundary's validation failure. */
export function parseReviewedDifferences(text: string): ParityInput['differences'] {
  // Proof: bypassing this schema makes malformed reviewed records pass the production tree-validator negative.
  return Difference.array().assert(JSON.parse(text));
}
/** Validates external JSON once before the comparison uses precise internal types. */
export function parseParityInput(text: string): ParityInput {
  try {
    return Input.assert(JSON.parse(text));
  } catch (failure) {
    throw new Error('malformed input', { cause: failure });
  }
}
function documents(text: string): Json[] {
  return parseAllDocuments(text)
    .map((document) => {
      // Proof: malformed-rendered-YAML CLI negative refuses parser errors before comparison.
      if (document.errors.length) throw new Error('malformed rendered YAML');
      return parseJson(document.toJSON());
    })
    .filter((document) => document !== null);
}
function indexDocuments(text: string, rehearsal: boolean): Record<string, Json> {
  const manifests = documents(text);
  const names = manifests.map((manifest) => Manifest.assert(manifest).metadata.name);
  const generated = names.filter((name) => /^signal-configuration-[a-z0-9]+$/.test(name));
  // Proof: missing/duplicate generated configuration CLI negatives exercise the exact ConfigMap identity boundary.
  if (generated.length !== 1) throw new Error('required role: generated signal-configuration');
  const [configurationName] = generated;
  let indexed: Record<string, Json> = {};
  for (const manifest of manifests) {
    const identity = Manifest.assert(manifest);
    const name =
      identity.kind === 'ConfigMap' && identity.metadata.name === configurationName
        ? 'signal-configuration'
        : identity.metadata.name;
    const key = `${identity.kind}:${identity.metadata.namespace ?? '_'}:${name}`;
    // Proof: duplicate-resource CLI negative rejects resource identity collisions instead of overwriting.
    if (Object.hasOwn(indexed, key)) throw new Error(`duplicate resource: ${key}`);
    indexed[key] = manifest;
  }
  for (const [key, expected] of Object.entries(rehearsalDigests)) {
    // Proof: modified/absent rehearsal receiver and production-fixture CLI negatives reject the exact controlled fixture boundary.
    if (
      rehearsal
        ? !Object.hasOwn(indexed, key) || digest(indexed[key]) !== expected
        : Object.hasOwn(indexed, key)
    )
      throw new Error(`rehearsal fixture differs: ${key}`);
    if (rehearsal)
      indexed = Object.fromEntries(Object.entries(indexed).filter(([name]) => name !== key));
  }
  expandConfigMaps(indexed);
  return indexed;
}
function expandConfigMaps(indexed: Record<string, Json>): void {
  for (const [key, manifest] of Object.entries(indexed)) {
    if (!key.startsWith('ConfigMap:')) continue;
    const configuration = type({ data: 'Record<string, string>' }).assert(manifest);
    const parsed: Record<string, Json> = {};
    for (const [name, value] of Object.entries(configuration.data)) {
      try {
        parsed[name] = name.endsWith('.json')
          ? parseJson(JSON.parse(value))
          : name.endsWith('.yaml')
            ? parseJson(parse(value))
            : value;
      } catch (failure) {
        throw new Error(`malformed configuration: ${key}/${name}`, { cause: failure });
      }
    }
    indexed[key] = parseJson({ ...type('Record<string, unknown>').assert(manifest), data: parsed });
  }
}
function indexEffective(text: string): Record<string, Json> {
  const indexed: Record<string, Json> = {};
  for (const manifest of documents(text)) {
    const { kind, metadata } = Manifest.assert(manifest);
    const key = `${kind}:${metadata.namespace ?? '_'}:${metadata.name}`;
    // Proof: removing this guard makes the duplicate-effective-resource CLI negative accept an overwritten resource.
    if (Object.hasOwn(indexed, key)) throw new Error(`duplicate resource: ${key}`);
    indexed[key] = manifest;
  }
  expandConfigMaps(indexed);
  return indexed;
}
function candidateConfiguration(
  candidate: ParityInput['candidates']['local'],
  local: boolean,
): Json {
  const rendered = indexDocuments(candidate.rendered, local);
  const effective: Record<string, Json> = {};
  // Proof: both-missing native gateway and both-missing effective Kibana CLI negatives reject equal but incomplete candidates.
  for (const key of roles)
    if (!Object.hasOwn(rendered, key)) throw new Error(`required role: ${key}`);
  // Proof: removing this closure admits an unknown effective release in both candidates.
  if (!isDeepStrictEqual(Object.keys(candidate.effective).sort(), [...releases].sort()))
    throw new Error('required role: exact Helm release set');
  for (const [name, keys] of Object.entries(effectiveRoles)) {
    const indexed = indexEffective(candidate.effective[name]);
    for (const key of keys)
      if (!Object.hasOwn(indexed, key)) throw new Error(`required role: effective ${key}`);
    effective[name] = indexed;
  }
  return { rendered, effective };
}
function flatten(value: Json, path = '', leaves = new Map<string, Json>()): Map<string, Json> {
  if (value !== null && typeof value === 'object') {
    leaves.set(path, Array.isArray(value) ? [] : {});
    for (const [key, entry] of Object.entries(value))
      flatten(entry, `${path}/${pointer(key)}`, leaves);
  } else leaves.set(path, value);
  return leaves;
}
const trustModePaths = new Set([
  '/rendered/HelmRelease:observability:elasticsearch/spec/values/nodeSets/0/podTemplate/spec/initContainers/0/env/0/value',
  '/effective/elasticsearch/Elasticsearch:_:elasticsearch/spec/nodeSets/0/podTemplate/spec/initContainers/0/env/0/value',
]);
function isPermittedPath(path: string, local: Json, production: Json): boolean {
  // Proof: broadening these exact paths admits lookalike-field CLI negatives; widening either closed mode admits unknown/swapped-mode negatives.
  if (trustModePaths.has(path))
    return local === 'system-roots-plus-ca' && production === 'system-roots';
  if (
    /^\/rendered\/(ConfigMap:observability:signal-configuration\/metadata\/name|(StatefulSet:observability:signal-(collector|gateway)|Job:observability:elastic-settings)\/spec\/template\/spec\/volumes\/\d+\/configMap\/name)$/.test(
      path,
    )
  )
    return (
      typeof local === 'string' &&
      typeof production === 'string' &&
      /^signal-configuration-[a-z0-9]+$/.test(local) &&
      /^signal-configuration-[a-z0-9]+$/.test(production)
    );
  // Proof: removing the positive-quantity constraint admits null memory in the capacity-exception CLI negative.
  if (
    (/\/resources\/(limits|requests)\/(memory|cpu|storage)$/.test(path) &&
      [local, production].every(
        (value) => typeof value === 'string' && /^[1-9]\d*(?:m|Ki|Mi|Gi|Ti|K|M|G|T)?$/.test(value),
      )) ||
    (path.endsWith('/env/0/value') &&
      typeof local === 'string' &&
      /^-Xms\dg -Xmx\dg$/.test(local) &&
      typeof production === 'string' &&
      /^-Xms\dg -Xmx\dg$/.test(production))
  )
    return true;
  if (
    /\/s3\.client\.default\.endpoint$|\/metricRelabelings\/0\/replacement$|puni-telemetry\/data\/environment$|\/ipBlock\/cidr$/.test(
      path,
    )
  )
    return true;
  if (!path.startsWith('/rendered/ConfigMap:observability:signal-configuration/data/'))
    return false;
  if (/\/(policyName|index\.lifecycle\.name)$/.test(path)) return true;
  if (/\/gateway.yaml\/processors\/resource~1stream\/attributes\/0\/value$/.test(path))
    return local === 'dev' && production === 'prod';
  if (
    /\/processors\/filter~1(source|platform)\/(logs\/log_record|metrics\/datapoint|traces\/span)\/0$/.test(
      path,
    )
  )
    return (
      typeof local === 'string' &&
      typeof production === 'string' &&
      local
        .replaceAll('platform-local', 'platform-production')
        .replaceAll('workers-local', 'workers-production')
        .replaceAll('"dev"', '"prod"') === production
    );
  return false;
}
/** Compares complete parsed renders and Helm output; reviewed differences apply to individual existing scalar leaves only. This never establishes live readiness. */
export function assertParity(input: ParityInput): {
  candidates: string[];
  reviewedDifferences: number;
  evidence: 'render-time parity';
} {
  const local = flatten(candidateConfiguration(input.candidates.local, true));
  const production = flatten(candidateConfiguration(input.candidates.production, false));
  const reviewed = new Map<string, typeof Difference.infer>();
  for (const difference of input.differences) {
    // Proof: wildcard/subtree and unknown-path CLI negatives fail when exact-leaf validation is removed.
    if (
      !difference.path.startsWith('/') ||
      /[*?]/.test(difference.path) ||
      !local.has(difference.path) ||
      !production.has(difference.path)
    )
      throw new Error(`invalid exception path: ${difference.path}`);
    const left = local.get(difference.path),
      right = production.get(difference.path);
    if (
      left === undefined ||
      right === undefined ||
      (typeof left === 'object' && left !== null) ||
      (typeof right === 'object' && right !== null)
    )
      throw new Error(`subtree exception: ${difference.path}`);
    // Proof: each image/auth/queue/protocol/Secret/probe exception CLI negative exercises the semantic allowlist.
    if (!isPermittedPath(difference.path, left, right))
      throw new Error(`forbidden exception: ${difference.path}`);
    // Proof: duplicate exception CLI negative observes collision rather than last-writer-wins.
    if (reviewed.has(difference.path)) throw new Error(`duplicate exception: ${difference.path}`);
    // Proof: unused/equal and stale concrete-value CLI negatives exercise both reviewed value contracts.
    if (isDeepStrictEqual(left, right)) throw new Error(`unused exception: ${difference.path}`);
    if (
      !isDeepStrictEqual(left, difference.expected.local) ||
      !isDeepStrictEqual(right, difference.expected.production)
    )
      throw new Error(`exception values differ: ${difference.path}`);
    reviewed.set(difference.path, difference);
  }
  for (const path of new Set([...local.keys(), ...production.keys()])) {
    // Proof: capacity sibling, digest, auth and extra-empty-key CLI negatives fail when this comparison is removed.
    if (
      !reviewed.has(path) &&
      (!local.has(path) ||
        !production.has(path) ||
        !isDeepStrictEqual(local.get(path), production.get(path)))
    )
      throw new Error(`unreviewed difference: ${path}`);
  }
  return {
    candidates: ['local', 'production'],
    reviewedDifferences: reviewed.size,
    evidence: 'render-time parity',
  };
}

const rehearsalDigests: Record<string, string> = {
  'Deployment:observability:alert-receiver':
    '60cb0b1660ee30e7d2ce6fa94cc7f7fc9058606cc331cef51ed98bd3fec723fd',
  'Service:observability:alert-receiver':
    'bb89e2ecd444a4a9000f4f721bad8302336e356730fefafdce637a2eb8f6d2e7',
};
