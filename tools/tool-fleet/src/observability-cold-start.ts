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
import {
  deriveSelectedCapacityInputs,
  type deriveSelectedCapacityTraits,
} from './observability-generated-capacity';
import { createObservabilitySource } from './observability-source';
import {
  type ColdStartFrame,
  type ColdStartInventory,
  readColdStartSource,
} from './observability-source-inventory';
import {
  assertRenderedObservabilitySource,
  indexObservabilitySource,
  renderObservabilitySource,
} from './observability-source-render';
import {
  NativeWorkloadSpec,
  normalizeWorkload,
  type SourceVolumePolicy,
} from './observability-workload';

export type { ColdStartFrame, ColdStartInventory } from './observability-source-inventory';
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

/** A valid native shape outside the shared normalizer contract remains an explicit source obligation. */
export class UnsupportedNativeWorkload extends Error {}

/** Expand only declared claim-template volume identities; duplicate names and foreign claim-template kinds refuse. */
export function expandNativeVolumes<Volume extends { name: string }>(
  declared: readonly Volume[],
  templates: readonly { metadata: { name: string } }[],
  kind: string,
) {
  // Proof: Task25a claim-kind removal lost the Deployment claim-template refusal.
  if (templates.length !== 0 && kind !== 'StatefulSet') refuse('claim-template-kind');
  // Proof: Task25a claim-template-duplicate removal lost the duplicate-template refusal.
  // Proof: Task25c3a claim-template-duplicate removal replaced the required early duplicate refusal with a later collision; the diagnostic control failed.
  if (new Set(templates.map((template) => template.metadata.name)).size !== templates.length)
    refuse('claim-template-duplicate');
  const volumes: (Volume | { name: string; persistentVolumeClaim: { claimName: string } })[] = [
    ...declared,
  ];
  for (const template of templates) {
    // Proof: Task25a claim-volume-collision removal lost the explicit/template volume collision refusal.
    if (volumes.some((volume) => volume.name === template.metadata.name))
      refuse('claim-template-volume-collision');
    volumes.push({
      name: template.metadata.name,
      persistentVolumeClaim: { claimName: template.metadata.name },
    });
  }
  return volumes;
}

/** Normalize one already validated native owner using the shared workload arithmetic.
 * The broad inventory caller classifies missing bounds only after validating all supplied fields;
 * omitted refusal policy preserves selected-input strictness. Malformed source throws with safe context. */
export function normalizeNativeOwner(
  pod: typeof NativeWorkloadSpec.infer,
  templates: readonly (typeof Claim.infer)[],
  kind: string,
  frame: string,
  identity: string,
  refuseUnbounded?: (reason: string) => never,
  policy?: SourceVolumePolicy,
) {
  const volumes = expandNativeVolumes(pod.volumes ?? [], templates, kind);
  return normalizeWorkload(
    { ...pod, volumes },
    {
      memory: (quantity) => readMemoryMiB(quantity, refuse),
      cpu: (quantity) => readCPUMilli(quantity, refuse),
      // Proof: fix1-malformed-callback bypass downgraded contradictory source volumes to incomplete.
      refuseMalformed: () =>
        refuseSourceShape('workload-contradiction', frame, identity, '/spec/template/spec'),
      refuse: (reason) => {
        if (
          // Proof: Task25c3a missing-bound-policy removal made valid writable-root/emptyDir omissions throw instead of remain named incomplete.
          refuseUnbounded !== undefined &&
          [
            'candidate-ephemeral-unbounded',
            'candidate-emptydir-unbounded',
            'memory-unknown',
            'cpu-unknown',
          ].includes(reason)
        )
          return refuseUnbounded(reason);
        if (reason === 'workload-volume-unsupported' || reason === 'workload-shape-unsupported')
          throw new UnsupportedNativeWorkload(reason);
        return refuse(reason);
      },
    },
    // Proof: Task60 policy-forward corruption removed both full selected node-exporter cohorts; real native-reader contribution assertion failed.
    policy,
  );
}

/** Expand full Pod and namespace/controller/template/ordinal claim charges once; source pointers belong to the caller's validated traversal. */
export function expandNativeOwner({
  identity,
  namespace,
  name,
  pods,
  templates,
  model,
  source,
  claimPointer,
}: {
  identity: string;
  namespace: string;
  name: string;
  pods: number;
  templates: readonly (typeof Claim.infer)[];
  model: Pick<ReturnType<typeof normalizeWorkload>, 'memoryMiB' | 'cpuMilli' | 'ephemeralMiB'>;
  source: NativeCharge['source'];
  claimPointer: (template: typeof Claim.infer, index: number) => string;
}): NativeCharge[] {
  const entries: NativeCharge[] = [];
  for (let ordinal = 0; ordinal < pods; ordinal++) {
    entries.push({
      identity: `${identity}/pod/${String(ordinal)}`,
      owner: identity,
      kind: 'pod',
      // Proof: Task25c3a pod-zero mutation failed the full per-ordinal normalized charge assertion.
      memoryMiB: model.memoryMiB,
      cpuMilli: model.cpuMilli,
      diskMiB: model.ephemeralMiB,
      source,
      concurrency: { phase: 'cold-create', pods, ordinal },
    });
    for (const [index, template] of templates.entries()) {
      const sizeMiB = readMemoryMiB(template.spec.resources.requests.storage, refuse);
      // Proof: Task25a claim-bound removal admitted the zero claim request fixture.
      if (sizeMiB <= 0) refuse('claim-size-unbounded');
      appendNativeClaim(
        entries,
        `PersistentVolumeClaim:${namespace}:${template.metadata.name}-${name}-${String(ordinal)}`,
        sizeMiB,
        {
          ...source,
          pointer: claimPointer(template, index),
        },
        identity,
        // Proof: Task25c3a claim-ordinal substitution changed second ordinals to zero and failed identity metadata assertions.
        ordinal,
      );
    }
  }
  return entries;
}

function appendNativeClaim(
  entries: NativeCharge[],
  identity: string,
  sizeMiB: number,
  source: NativeCharge['source'],
  owner: string,
  ordinal = 0,
) {
  // Proof: Task25a claim-collision removal admitted a conflicting expanded StatefulSet claim.
  if (entries.some((entry) => entry.identity === identity)) refuse('claim-identity-collision');
  entries.push({
    identity,
    owner,
    kind: 'claim',
    memoryMiB: 0,
    cpuMilli: 0,
    // Proof: Task25c3a claim-zero mutation failed unique ordinal claim byte totals.
    diskMiB: sizeMiB,
    source,
    concurrency: { phase: 'cold-create', pods: 0, ordinal },
  });
}

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
  // Proof: Task25b2 native-source-boundary bypass admitted changed source bytes; the native bound-hash negative failed.
  return deriveNativeCosts(readColdStartSource(frames, inventory), topology);
}
function deriveNativeCosts(
  validated: ReturnType<typeof readColdStartSource>,
  topology: TopologyFrame,
) {
  const { indexed, inventory } = validated;
  const entries: NativeCharge[] = [];
  const blockers: Blocker[] = [];
  const missing = (owner: string, missingFact: string) => {
    blockers.push({ owner, missingFact });
  };
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
    appendNativeClaim(entries, identity, sizeMiB, source, owner);
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
      let model: ReturnType<typeof normalizeWorkload>;
      try {
        model = normalizeNativeOwner(pod, templates, kind, expected.owner, identity);
      } catch (failure) {
        if (!(failure instanceof UnsupportedNativeWorkload)) throw failure;
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
      for (const charge of expandNativeOwner({
        identity,
        namespace,
        name,
        pods,
        templates,
        model,
        source,
        claimPointer: (template) =>
          `${identity}/spec/volumeClaimTemplates/${template.metadata.name}`,
      })) {
        if (charge.kind === 'claim')
          chargeClaim(charge.identity, charge.diskMiB, charge.source, identity);
        else entries.push(charge);
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
 * Selected generated traits retain unresolved operator overlap, readonly-input/runtime overhead and enforcement.
 * It does not certify effective Pods, platform/system, host or transient demand, or admit creation.
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
  const lockBytes = await readFile(join(root, 'infra/versions/toolchain.json'), 'utf8');
  const validated = readColdStartSource(frames, inventory);
  const native = deriveNativeCosts(validated, { bytes, sha256: hash(bytes) });
  return combineObservabilityColdStartCosts(
    native,
    deriveSelectedCapacityInputs(source, validated, { bytes: lockBytes, sha256: hash(lockBytes) }),
  );
}

/** Replace only successfully processed source-owner kind blockers with concrete unresolved trait prerequisites.
 * Native entries and known totals stay exact; selected per-replica traits never become attempt charges.
 */
export function combineObservabilityColdStartCosts(
  native: ReturnType<typeof deriveColdStartCosts>,
  generatedTraits: ReturnType<typeof deriveSelectedCapacityTraits>,
) {
  const blockers = native.blockers.flatMap((blocker) => {
    // Proof: Task25b2 exact-blocker-owner removal replaced a foreign same-kind owner; concrete-replacement-facts removal erased unresolved prerequisites.
    const trait = generatedTraits.find(
      (trait) =>
        trait.identity === blocker.owner &&
        blocker.missingFact === `unsupported-runnable-kind:${trait.kind}`,
    );
    return trait === undefined
      ? [blocker]
      : trait.missingFacts.map((missingFact) => ({ owner: trait.identity, missingFact }));
  });
  return {
    // Proof: Task25b2 native-charge-preservation and no-nominal-generated-charge faults lost nonzero native costs or appended nominal generated charges.
    ...native,
    scope: 'native-cold-create-and-selected-generated-traits' as const,
    state: 'incomplete' as const,
    generatedTraits,
    blockers,
    closureSHA256: hash(
      JSON.stringify({
        native: native.closureSHA256,
        // Proof: Task25b2 combined-provider/runtime/derivation-closure removals each lost the corresponding changed-identity receipt.
        generated: generatedTraits.map((trait) => ({
          identity: trait.identity,
          source: trait.source,
          provider: trait.provider,
          runtime: trait.runtime,
          derivation: trait.derivation,
        })),
      }),
    ),
  };
}
