import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

import {
  type CapacityCharge,
  readCPUMilli,
  readMemoryMiB,
  sumCapacity,
} from './observability-capacity';
import { createObservabilitySource } from './observability-source';
import {
  assertRenderedObservabilitySource,
  indexObservabilitySource,
  renderObservabilitySource,
} from './observability-source-render';
import { NativeWorkloadSpec, normalizeWorkload } from './observability-workload';

/** Immutable rendered bytes. These are source evidence, never observed Pods or admission authority. */
export interface ColdStartFrame {
  readonly owner: string;
  readonly bytes: string;
}
/** Expected unfiltered resource closure from the independently validated render contract. */
export interface ColdStartInventory {
  readonly owner: string;
  readonly sha256: string;
  readonly resources: readonly string[];
}
interface TopologyFrame {
  readonly bytes: string;
  readonly sha256: string;
}
interface Blocker {
  readonly owner: string;
  readonly missingFact: string;
}
interface NativeCharge extends CapacityCharge {
  readonly kind: 'pod' | 'claim';
  readonly owner: string;
  readonly source: { readonly owner: string; readonly sha256: string; readonly pointer: string };
  readonly concurrency: {
    readonly phase: 'cold-create';
    readonly pods: number;
    readonly ordinal: number;
  };
}
const Claim = type({
  metadata: { name: 'string>0' },
  spec: { storageClassName: 'string>0', resources: { requests: { storage: 'string>0' } } },
});
const Controller = type({
  spec: {
    'replicas?': 'number',
    'ordinals?': 'unknown',
    'strategy?': { type: 'string', 'rollingUpdate?': 'unknown' },
    'updateStrategy?': { type: 'string', 'rollingUpdate?': 'unknown' },
    'volumeClaimTemplates?': Claim.array(),
    'parallelism?': 'number',
    'completions?': 'number',
    'backoffLimit?': 'number',
    'completionMode?': 'string',
    'podReplacementPolicy?': 'string',
    'activeDeadlineSeconds?': 'number',
    'suspend?': 'boolean',
    'managedBy?': 'string',
    'backoffLimitPerIndex?': 'number',
    'podFailurePolicy?': 'unknown',
    'podSuccessPolicy?': 'unknown',
    'successPolicy?': 'unknown',
    template: {
      spec: NativeWorkloadSpec.and({
        'restartPolicy?': 'string',
        'terminationGracePeriodSeconds?': 'number',
        'hostNetwork?': 'boolean',
        'hostPID?': 'boolean',
        'hostIPC?': 'boolean',
        'schedulerName?': 'string',
      }),
    },
  },
  metadata: { 'annotations?': type('Record<string,string>') },
});
const Topology = type({
  apiVersion: "'k3d.io/v1alpha5'",
  kind: "'Simple'",
  servers: 'number',
  agents: 'number',
  'options?': {
    'k3s?': { 'nodeLabels?': type({ label: 'string', nodeFilters: 'string[]' }).array() },
  },
});
// This closed list contains declarations with no native Pod/claim demand. CRs that can create Pods never enter it.
const noDemand = new Set([
  'Namespace',
  'ConfigMap',
  'Secret',
  'Service',
  'ServiceAccount',
  'NetworkPolicy',
  'Role',
  'RoleBinding',
  'ClusterRole',
  'ClusterRoleBinding',
  'CustomResourceDefinition',
  'MutatingWebhookConfiguration',
  'ValidatingWebhookConfiguration',
  'ServiceMonitor',
  'PodMonitor',
  'PrometheusRule',
  'Probe',
  'ScrapeConfig',
  'Ingress',
]);
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function refuse(reason: string): never {
  throw new Error(`Cold start ${reason}`);
}
function isPositiveInteger(count: number | undefined): count is number {
  return count !== undefined && Number.isSafeInteger(count) && count > 0;
}
/** Fixed categories and schema-validated identifiers provide context without serializing trusted input values or causes. */
function refuseSourceShape(
  category: 'controller-malformed' | 'workload-contradiction',
  source: string,
  owner: string,
  path: '/' | '/spec/template/spec',
): never {
  const context = type({
    source: /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/,
    owner: /^(?:Deployment|StatefulSet|DaemonSet|Job):[a-z0-9][a-z0-9.-]*:[a-z0-9][a-z0-9.-]*$/,
  })({ source, owner });
  // Proof: fix1-safe-context removal lost the unsafe-source contextual refusal.
  if (context instanceof type.errors) return refuse('workload-context-malformed');
  throw new Error(
    `Cold start ${category} source=${context.source} owner=${context.owner} path=${path}`,
  );
}

class UnsupportedWorkload extends Error {}

/** Derive only one cold-create generation, with no deletion, restart, upgrade or recovery authority.
 * Inventory must come from the validated source contract, not caller JSON or filtered workload lists.
 * Throws on trusted byte/identity drift and malformed quantities/bounds; modeled unsupported shapes stay incomplete.
 * Rolling/terminating/retry bounds, operator traits, host paths and non-native allowances remain separate facts.
 */
export function deriveColdStartCosts(
  frames: readonly ColdStartFrame[],
  inventory: readonly ColdStartInventory[],
  topology: TopologyFrame,
) {
  const entries: NativeCharge[] = [];
  const blockers: Blocker[] = [];
  const missing = (owner: string, missingFact: string) => {
    blockers.push({ owner, missingFact });
  };
  const owners = frames.map((frame) => frame.owner).sort();
  // Proof: Task25a source-owner-closure removal failed missing/duplicate/empty source-inventory negatives.
  if (
    inventory.length === 0 ||
    new Set(owners).size !== owners.length ||
    new Set(inventory.map((frame) => frame.owner)).size !== inventory.length ||
    !isDeepStrictEqual(owners, inventory.map((frame) => frame.owner).sort())
  )
    refuse('source-owner-closure');
  // Proof: Task25a topology-hash removal failed changed topology hash refusal.
  if (hash(topology.bytes) !== topology.sha256) refuse('topology-hash');
  const parsedTopology = parseDocument(topology.bytes);
  // Proof: Task25a topology-malformed removal lost the malformed YAML diagnostic.
  if (parsedTopology.errors.length !== 0) refuse('topology-malformed');
  const planned = Topology.assert(parsedTopology.toJSON());
  // Proof: Task25a forcing oneServer=true failed the multi-server topology negative.
  const oneServer = planned.servers === 1 && planned.agents === 0;
  if (!oneServer) missing('topology', 'eligible-one-server-topology');
  const labels: Record<string, string> = {};
  for (const label of planned.options?.k3s?.nodeLabels ?? []) {
    const delimiter = label.label.indexOf('=');
    // Proof: Task25a topology-label-scope removal admitted an agent-only label.
    if (delimiter <= 0 || !isDeepStrictEqual(label.nodeFilters, ['server:*']))
      refuse('topology-label-unsupported');
    const key = label.label.slice(0, delimiter);
    // Proof: Task25a topology-label-duplicate removal admitted a repeated label.
    if (Object.hasOwn(labels, key)) refuse('topology-label-duplicate');
    labels[key] = label.label.slice(delimiter + 1);
  }
  const rendered: Record<string, string> = {};
  for (const frame of frames) {
    const expected = inventory.find((expected) => expected.owner === frame.owner);
    // Proof: Task25a source-hash removal admitted changed immutable source bytes.
    if (hash(frame.bytes) !== expected?.sha256) refuse('source-hash');
    rendered[frame.owner] = frame.bytes;
  }
  const indexed = indexObservabilitySource(rendered);
  for (const expected of inventory) {
    // Proof: Task25a resource-closure removal admitted omitted/wrong-name/wrong-namespace owners.
    if (
      !isDeepStrictEqual(
        Object.keys(indexed[expected.owner]).sort(),
        [...expected.resources].sort(),
      )
    )
      refuse('source-resource-closure');
  }
  const claims = new Map<
    string,
    { readonly sizeMiB: number; readonly source: NativeCharge['source'] }
  >();
  const chargeClaim = (
    identity: string,
    sizeMiB: number,
    source: NativeCharge['source'],
    owner: string,
  ) => {
    // Proof: Task25a claim-collision removal admitted a conflicting expanded StatefulSet claim.
    if (entries.some((entry) => entry.identity === identity)) refuse('claim-identity-collision');
    entries.push({
      identity,
      owner,
      kind: 'claim',
      memoryMiB: 0,
      cpuMilli: 0,
      diskMiB: sizeMiB,
      source,
      concurrency: { phase: 'cold-create', pods: 0, ordinal: 0 },
    });
  };
  for (const expected of inventory)
    for (const [identity, manifest] of Object.entries(indexed[expected.owner])) {
      const [kind, namespace, name] = identity.split(':');
      if (kind !== 'PersistentVolumeClaim') continue;
      const claim = Claim.assert(manifest);
      const sizeMiB = readMemoryMiB(claim.spec.resources.requests.storage, refuse);
      // Proof: Task25a claim-bound removal admitted the zero claim request fixture.
      if (sizeMiB <= 0) refuse('claim-size-unbounded');
      const source = {
        owner: expected.owner,
        sha256: expected.sha256,
        pointer: `${identity}/spec/resources/requests/storage`,
      };
      claims.set(`${namespace}/${name}`, { sizeMiB, source });
      chargeClaim(identity, sizeMiB, source, identity);
    }
  for (const expected of inventory)
    for (const [identity, manifest] of Object.entries(indexed[expected.owner])) {
      const [kind, namespace, name] = identity.split(':');
      if (noDemand.has(kind) || kind === 'PersistentVolumeClaim') continue;
      if (!['Deployment', 'StatefulSet', 'Job', 'DaemonSet'].includes(kind)) {
        // Proof: Task25a unknown-runnable removal made an unmodeled CronJob disappear.
        missing(identity, `unsupported-runnable-kind:${kind}`);
        continue;
      }
      const workload = Controller(manifest);
      // Proof: fix1-controller-malformed downgrade failed string-replica, nonarray-container and missing-map negatives.
      if (workload instanceof type.errors)
        refuseSourceShape('controller-malformed', expected.owner, identity, '/');
      const spec = workload.spec;
      const pod = spec.template.spec;
      // Proof: fix1-ordering-before-concurrency early return let rolling behavior hide malformed volumes.
      const templates = spec.volumeClaimTemplates ?? [];
      // Proof: Task25a claim-kind removal lost the Deployment claim-template refusal.
      if (templates.length !== 0 && kind !== 'StatefulSet') refuse('claim-template-kind');
      // Proof: Task25a claim-template-duplicate removal lost the duplicate-template refusal.
      if (new Set(templates.map((template) => template.metadata.name)).size !== templates.length)
        refuse('claim-template-duplicate');
      const volumes = [...(pod.volumes ?? [])];
      for (const template of templates) {
        // Proof: Task25a claim-volume-collision removal lost the explicit/template volume collision refusal.
        if (volumes.some((volume) => volume.name === template.metadata.name))
          refuse('claim-template-volume-collision');
        volumes.push({
          name: template.metadata.name,
          persistentVolumeClaim: { claimName: template.metadata.name },
        });
      }
      let model: ReturnType<typeof normalizeWorkload>;
      try {
        model = normalizeWorkload(
          { ...pod, volumes },
          {
            memory: (quantity) => readMemoryMiB(quantity, refuse),
            cpu: (quantity) => readCPUMilli(quantity, refuse),
            // Proof: fix1-malformed-callback bypass downgraded contradictory source volumes to incomplete.
            refuseMalformed: () =>
              refuseSourceShape(
                'workload-contradiction',
                expected.owner,
                identity,
                '/spec/template/spec',
              ),
            refuse: (reason) => {
              if (
                reason === 'workload-volume-unsupported' ||
                reason === 'workload-shape-unsupported'
              )
                throw new UnsupportedWorkload(reason);
              return refuse(reason);
            },
          },
        );
      } catch (failure) {
        if (!(failure instanceof UnsupportedWorkload)) throw failure;
        missing(identity, failure.message);
        continue;
      }
      // Proof: Task25a ordinal removal invented zero-based claim identities for start=10.
      if (spec.ordinals !== undefined) {
        missing(identity, 'stateful-ordinal-contract');
        continue;
      }
      let pods: number;
      if (kind === 'Deployment' || kind === 'StatefulSet') {
        // Proof: Task25a replica-count removal dropped absent and zero replica facts.
        if (!isPositiveInteger(spec.replicas)) {
          missing(identity, 'replica-count');
          continue;
        }
        const strategy = kind === 'Deployment' ? spec.strategy : spec.updateStrategy;
        const expectedStrategy = kind === 'Deployment' ? 'Recreate' : 'OnDelete';
        if (
          strategy?.type !== expectedStrategy ||
          strategy.rollingUpdate !== undefined ||
          (kind === 'Deployment' ? spec.updateStrategy !== undefined : spec.strategy !== undefined)
        ) {
          // Proof: Task25a rolling-overlap removal dropped StatefulSet and DaemonSet replacement facts.
          missing(identity, 'surge-and-terminating-overlap');
          continue;
        }
        pods = spec.replicas;
      } else if (kind === 'DaemonSet') {
        if (
          spec.updateStrategy?.type !== 'OnDelete' ||
          spec.updateStrategy.rollingUpdate !== undefined ||
          spec.strategy !== undefined ||
          spec.replicas !== undefined
        ) {
          // Proof: Task25a rolling-overlap removal dropped StatefulSet and DaemonSet replacement facts.
          missing(identity, 'surge-and-terminating-overlap');
          continue;
        }
        if (!oneServer) continue;
        pods = 1;
      } else {
        if (
          !isPositiveInteger(spec.parallelism) ||
          spec.completions !== spec.parallelism ||
          spec.backoffLimit !== 0 ||
          spec.completionMode !== 'NonIndexed' ||
          spec.podReplacementPolicy !== 'Failed' ||
          !isPositiveInteger(spec.activeDeadlineSeconds) ||
          pod.restartPolicy !== 'Never' ||
          spec.suspend === true ||
          spec.managedBy !== undefined ||
          spec.backoffLimitPerIndex !== undefined ||
          spec.podFailurePolicy !== undefined ||
          spec.podSuccessPolicy !== undefined ||
          spec.successPolicy !== undefined ||
          spec.strategy !== undefined ||
          spec.updateStrategy !== undefined ||
          spec.replicas !== undefined
        ) {
          // Proof: Task25a job-retry/hook-count removal dropped retry and absent/zero count facts.
          missing(identity, 'job-retry-and-terminating-overlap');
          continue;
        }
        const hook = workload.metadata.annotations?.['helm.sh/hook'];
        if (hook !== undefined && hook !== 'pre-install' && hook !== 'post-install') {
          // Proof: Task25a hook-phase removal admitted a repeated pre/post-install hook.
          missing(identity, 'hook-invocation-overlap');
          continue;
        }
        pods = spec.parallelism;
      }
      // Proof: Task25a termination-bound removal dropped a missing termination fact.
      if (!isPositiveInteger(pod.terminationGracePeriodSeconds)) {
        missing(identity, 'termination-grace-bound');
        continue;
      }
      if (
        !oneServer ||
        pod.nodeName !== undefined ||
        pod.affinity !== undefined ||
        pod.hostNetwork === true ||
        pod.hostPID === true ||
        pod.hostIPC === true ||
        (pod.schedulerName !== undefined && pod.schedulerName !== 'default-scheduler') ||
        Object.entries(pod.nodeSelector ?? {}).some(([key, value]) => labels[key] !== value)
      ) {
        // Proof: Task25a placement removal admitted a selector absent from the planned server labels.
        missing(identity, 'eligible-one-server-placement');
        continue;
      }
      const source = {
        owner: expected.owner,
        sha256: expected.sha256,
        pointer: `${identity}/spec/template/spec`,
      };
      for (let ordinal = 0; ordinal < pods; ordinal++) {
        entries.push({
          identity: `${identity}/pod/${String(ordinal)}`,
          owner: identity,
          kind: 'pod',
          memoryMiB: model.memoryMiB,
          cpuMilli: model.cpuMilli,
          diskMiB: model.ephemeralMiB,
          source,
          concurrency: { phase: 'cold-create', pods, ordinal },
        });
        for (const template of templates) {
          const sizeMiB = readMemoryMiB(template.spec.resources.requests.storage, refuse);
          // Proof: Task25a claim-bound removal admitted the zero claim request fixture.
          if (sizeMiB <= 0) refuse('claim-size-unbounded');
          chargeClaim(
            `PersistentVolumeClaim:${namespace}:${template.metadata.name}-${name}-${String(ordinal)}`,
            sizeMiB,
            {
              ...source,
              pointer: `${identity}/spec/volumeClaimTemplates/${template.metadata.name}`,
            },
            identity,
          );
        }
      }
      for (const volume of model.volumes.filter((volume) => volume.kind === 'claim')) {
        if (templates.some((template) => template.metadata.name === volume.name)) continue;
        const claim = claims.get(`${namespace}/${volume.reference}`);
        // Proof: Task25a claim-source removal let a prod-only claim satisfy a dev reference.
        if (claim === undefined) missing(identity, `claim-source:${namespace}/${volume.reference}`);
      }
    }
  return {
    state: blockers.length === 0 ? ('complete' as const) : ('incomplete' as const),
    scope: 'single-cold-create-native-owners' as const,
    creationAuthority: false as const,
    entries,
    blockers,
    knownContributions: sumCapacity(entries),
    provenance: inventory,
    excludedContributors: [
      'operator-generated Pods',
      'system/runtime',
      'host/retained services',
      'images/archive/transients',
      'hostPath growth',
    ],
    closureSHA256: hash(JSON.stringify({ inventory, topology: topology.sha256 })),
  };
}

/** Regenerate and validate every selected source owner before deriving its native subset.
 * This read-only production entry binds the full unfiltered render and authored one-server topology.
 * It does not cover platform/system, generated operator Pods, host or transient demand, or admit creation.
 */
export async function deriveObservabilityColdStartCosts(
  root: string,
  tools: string,
  input: unknown,
) {
  const source = await createObservabilitySource(root, input);
  // Proof: Task25a local-planned-topology removal let production source borrow local topology.
  if (source.assembly.request.placement !== 'local') refuse('local-planned-topology-required');
  const rendered = await renderObservabilitySource(root, tools, source);
  assertRenderedObservabilitySource(source, rendered);
  const indexed = indexObservabilitySource(rendered);
  const frames = Object.entries(rendered).map(([owner, bytes]) => ({ owner, bytes }));
  const inventory = frames.map((frame) => ({
    owner: frame.owner,
    sha256: hash(frame.bytes),
    resources: Object.keys(indexed[frame.owner]).sort(),
  }));
  const bytes = await readFile(join(root, 'infra/local/platform.k3d.yaml'), 'utf8');
  return deriveColdStartCosts(frames, inventory, { bytes, sha256: hash(bytes) });
}
