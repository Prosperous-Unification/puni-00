import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';

import { readMemoryMiB } from './observability-capacity';
import { expandNativeCohorts } from './observability-native-cohorts';
import { readHostPathConsumers } from './observability-native-hostpath';
import type {
  readRehearsalSource,
  RehearsalFrameContract,
} from './observability-rehearsal-inventory';
import {
  assertRehearsalSource,
  readRehearsalTopology,
  rehearsalBootstrapPaths,
  type RehearsalSource,
} from './observability-rehearsal-sources';
import type { InventoryWorkloadSpec } from './observability-workload';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
type NativeView = ReturnType<typeof readRehearsalSource>['native'][number];
/** Selected-source identity is independent of the adapter revision and actual runtime identity. */
interface Selection {
  readonly sourceRevision: string;
  readonly artifactSHA256: string;
}
/** Existing captured inventory fields anchor the native-only evidence overload. */
export interface NativeSourceContract extends RehearsalFrameContract {
  readonly bootstrapSources: readonly RehearsalSource[];
  readonly provenance: Selection;
}
/** Exact retained bytes carry coordinates, never a caller-selected node count or eligibility assertion. */
export interface RehearsalTopologyEvidence {
  readonly bytes: string;
  readonly source: RehearsalSource;
  readonly selection: Selection;
}
const SHA256 = /^[a-f0-9]{64}$/;
// Proof: Task25c3g selection-shape widening admitted coherent malformed revision/packet identities.
const SelectionSpec = type({ sourceRevision: /^[a-f0-9]{40}$/, artifactSHA256: SHA256 });
const SourceSpec = type({ sourcePath: 'string>0', artifactPath: 'string>0', sha256: SHA256 });
/** Bind bytes to the independently retained source contract before decoding; detach new metadata from caller mutation. */
export function readDaemonTopology(
  contract: RehearsalFrameContract,
  evidence: RehearsalTopologyEvidence | undefined,
) {
  if (evidence === undefined) return undefined;
  const anchor = type({ bootstrapSources: SourceSpec.array(), provenance: SelectionSpec })(
    contract,
  );
  const supplied = type({ bytes: 'string>0', source: SourceSpec, selection: SelectionSpec })(
    evidence,
  );
  if (anchor instanceof type.errors || supplied instanceof type.errors)
    throw new Error('Native topology contract malformed');
  // Proof: Task25c3g coordinate-map omission admitted an invented retained topology relocation.
  assertRehearsalSource(supplied.source);
  const coordinates = anchor.bootstrapSources.filter(
    (source) => source.sourcePath === rehearsalBootstrapPaths.topology,
  );
  // Proof: Task25c3g source/revision/packet/hash/closure omissions failed independent-hash, changed-byte and contract-coordinate negatives.
  if (
    coordinates.length !== 1 ||
    !isDeepStrictEqual(supplied.source, coordinates[0]) ||
    supplied.selection.sourceRevision !== anchor.provenance.sourceRevision ||
    supplied.selection.artifactSHA256 !== anchor.provenance.artifactSHA256 ||
    hash(supplied.bytes) !== supplied.source.sha256
  )
    throw new Error('Native topology source binding differs');
  // Proof: Task25c3g decoder bypass admitted coherently hashed malformed/duplicate YAML and forbidden k3d options.
  const declaration = readRehearsalTopology(supplied.bytes);
  // Proof: Task25c3g count substitution lost the full two-node cohorts; safe-count removal admitted unsafe operands/sums.
  const candidateNodes = declaration.servers + declaration.agents;
  if (![declaration.servers, declaration.agents, candidateNodes].every(Number.isSafeInteger))
    throw new Error('Native topology count malformed');
  // Proof: Task25c3g snapshot removal at both output boundaries let caller mutation rewrite topology source/selection metadata.
  return structuredClone({
    source: supplied.source,
    selection: supplied.selection,
    servers: declaration.servers,
    agents: declaration.agents,
    candidateNodes,
    nodeUIDs: 'unobserved' as const,
  });
}
const Count = type('number.integer>=0').atMost(2147483647);
const Expression = type({
  key: 'string>0',
  operator: "'In'|'NotIn'|'Exists'|'DoesNotExist'",
  'values?': 'string[]',
});
const Selector = type({
  'matchLabels?': 'Record<string,string>',
  'matchExpressions?': Expression.array(),
});
// Proof: Task25c3g affinity-schema widening admitted Bad after the daemon resource projection; the original masked fault is not evidence.
const NodeExpression = type({
  key: 'string>0',
  operator: "'In'|'NotIn'|'Exists'|'DoesNotExist'|'Gt'|'Lt'",
  'values?': 'string[]',
});
const NodeTerm = type({
  'matchExpressions?': NodeExpression.array(),
  'matchFields?': NodeExpression.array(),
});
const PodTerm = type({
  'labelSelector?': Selector.or('null'),
  'namespaces?': 'string[]',
  'namespaceSelector?': Selector.or('null'),
  topologyKey: 'string>0',
  'matchLabelKeys?': 'string[]',
  'mismatchLabelKeys?': 'string[]',
});
// Proof: Task25c3g weight-domain widening admitted preference weight101 behind absent workload bounds.
const PodAffinity = type({
  'requiredDuringSchedulingIgnoredDuringExecution?': PodTerm.array(),
  'preferredDuringSchedulingIgnoredDuringExecution?': type({
    weight: type('number.integer>=1').atMost(100),
    podAffinityTerm: PodTerm,
  }).array(),
});
// Proof: Task25c3g toleration-schema widening admitted the malformed effect before incomplete classification.
const Toleration = type({
  'key?': 'string',
  'operator?': "''|'Equal'|'Exists'",
  'value?': 'string',
  'effect?': "''|'NoSchedule'|'PreferNoSchedule'|'NoExecute'",
  'tolerationSeconds?': type('number.integer')
    .atLeast(Number.MIN_SAFE_INTEGER)
    .atMost(Number.MAX_SAFE_INTEGER),
});
// Proof: Task25c3g strategy/restart/deadline schema weakening each lost its malformed-source production refusal.
const DaemonSet = type({
  spec: {
    'minReadySeconds?': Count,
    'revisionHistoryLimit?': Count,
    'updateStrategy?': {
      'type?': "''|'RollingUpdate'|'OnDelete'",
      'rollingUpdate?': { 'maxSurge?': 'number|string', 'maxUnavailable?': 'number|string' },
    },
    selector: Selector,
    template: {
      metadata: { labels: 'Record<string,string>' },
      spec: {
        'restartPolicy?': "''|'Always'",
        'activeDeadlineSeconds?': 'never',
        'terminationGracePeriodSeconds?': 'number.integer>=0',
        'nodeName?': 'string',
        'nodeSelector?': 'Record<string,string>',
        'hostNetwork?': 'boolean',
        'tolerations?': Toleration.array(),
        'schedulerName?': 'string',
        'affinity?': {
          'nodeAffinity?': {
            'requiredDuringSchedulingIgnoredDuringExecution?': {
              nodeSelectorTerms: NodeTerm.array().atLeastLength(1),
            },
            'preferredDuringSchedulingIgnoredDuringExecution?': type({
              weight: type('number.integer>=1').atMost(100),
              preference: NodeTerm,
            }).array(),
          },
          'podAffinity?': PodAffinity,
          'podAntiAffinity?': PodAffinity,
        },
      },
    },
  },
});
function refuse(): never {
  throw new Error('Native ordinal source malformed');
}
// Proof: Task25c3g label/key bypasses admitted invalid template/nodeSelector labels and selector/pod-affinity keys.
function isLabel(value: string) {
  return value.length <= 63 && /^(?:[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?)?$/.test(value);
}
function isKey(value: string) {
  const parts = value.split('/');
  const name = parts.pop();
  return (
    name !== undefined &&
    name !== '' &&
    isLabel(name) &&
    (parts.length === 0 ||
      (parts.length === 1 &&
        parts[0].length <= 253 &&
        parts[0]
          .split('.')
          .every((label) => label.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(label))))
  );
}
// Proof: Task25c3g map-check removal admitted strategy/rolling arrays behind absent bounds.
function requireMaps(...mappings: unknown[]) {
  if (mappings.some(Array.isArray)) refuse();
}
// Proof: Task25c3g expression-check removal admitted selector value, numeric cardinality, field relation and pod-affinity selector faults.
function requireExpression(expression: typeof NodeExpression.infer, field = false) {
  requireMaps(expression);
  const values = expression.values ?? [];
  if (!isKey(expression.key)) refuse();
  if (field) {
    if (
      expression.key !== 'metadata.name' ||
      !['In', 'NotIn'].includes(expression.operator) ||
      values.length !== 1 ||
      values[0] === ''
    )
      refuse();
    return;
  }
  if (expression.operator === 'Gt' || expression.operator === 'Lt') {
    if (
      values.length !== 1 ||
      !/^[+-]?\d+$/.test(values[0]) ||
      BigInt(values[0]) < -9223372036854775808n ||
      BigInt(values[0]) > 9223372036854775807n
    )
      refuse();
  } else if (
    (expression.operator === 'In' || expression.operator === 'NotIn') !== values.length > 0 ||
    values.some((value) => !isLabel(value))
  )
    refuse();
}
function requireSelector(selector: typeof Selector.infer) {
  requireMaps(selector, selector.matchLabels);
  for (const [key, value] of Object.entries(selector.matchLabels ?? {}))
    if (!isKey(key) || !isLabel(value)) refuse();
  for (const expression of selector.matchExpressions ?? []) requireExpression(expression);
}
function readQuantity(quantity: number | string) {
  return typeof quantity === 'number' ? quantity : Number(quantity.slice(0, -1));
}
/** Validate known daemon fields before incomplete accounting branches; this is not general API admission. */
export function readDaemonSet(manifest: Record<string, unknown>) {
  const controller = DaemonSet(manifest);
  if (controller instanceof type.errors) refuse();
  const spec = controller.spec,
    pod = spec.template.spec,
    strategy = spec.updateStrategy;
  requireMaps(
    spec,
    strategy,
    strategy?.rollingUpdate,
    spec.template,
    spec.template.metadata,
    spec.template.metadata.labels,
    pod,
    pod.nodeSelector,
    pod.affinity,
    pod.affinity?.nodeAffinity,
    pod.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution,
  );
  // Proof: Task25c3g foreign-field omission admitted unrelated controller lifecycle fields even without resources.
  if (
    [
      'replicas',
      'strategy',
      'podManagementPolicy',
      'ordinals',
      'volumeClaimTemplates',
      'parallelism',
      'completions',
      'backoffLimit',
      'activeDeadlineSeconds',
      'progressDeadlineSeconds',
      'paused',
      'completionMode',
      'suspend',
      'manualSelector',
      'managedBy',
      'podFailurePolicy',
      'podReplacementPolicy',
      'backoffLimitPerIndex',
      'maxFailedIndexes',
      'successPolicy',
      'ttlSecondsAfterFinished',
      'schedule',
      'concurrencyPolicy',
      'startingDeadlineSeconds',
      'successfulJobsHistoryLimit',
      'failedJobsHistoryLimit',
    ].some((field) => Object.hasOwn(spec, field))
  )
    refuse();
  requireSelector(spec.selector);
  // Proof: Task25c3g empty-selector and label/expression-match omissions lost independent selector/template refusals.
  if (
    Object.keys(spec.selector.matchLabels ?? {}).length === 0 &&
    (spec.selector.matchExpressions?.length ?? 0) === 0
  )
    refuse();
  const labels = spec.template.metadata.labels;
  for (const [key, value] of Object.entries(labels)) if (!isKey(key) || !isLabel(value)) refuse();
  for (const [key, value] of Object.entries(spec.selector.matchLabels ?? {}))
    if (labels[key] !== value) refuse();
  for (const expression of spec.selector.matchExpressions ?? []) {
    const value = Object.hasOwn(labels, expression.key) ? labels[expression.key] : undefined;
    if (
      expression.operator === 'In'
        ? value === undefined || !expression.values?.includes(value)
        : expression.operator === 'NotIn'
          ? value !== undefined && expression.values?.includes(value)
          : expression.operator === 'Exists'
            ? value === undefined
            : value !== undefined
    )
      refuse();
  }
  for (const [key, value] of Object.entries(pod.nodeSelector ?? {}))
    if (!isKey(key) || !isLabel(value)) refuse();
  // Proof: Task25c3g toleration-relation removal admitted empty-key, Exists/value and seconds/effect contradictions.
  for (const toleration of pod.tolerations ?? []) {
    requireMaps(toleration);
    const operator = toleration.operator === '' ? 'Equal' : (toleration.operator ?? 'Equal');
    if (
      (toleration.key !== undefined && toleration.key !== '' && !isKey(toleration.key)) ||
      ((!toleration.key || operator === 'Exists') &&
        (operator !== 'Exists' || (toleration.value ?? '') !== '')) ||
      (operator === 'Equal' && !isLabel(toleration.value ?? '')) ||
      (toleration.tolerationSeconds !== undefined && toleration.effect !== 'NoExecute')
    )
      refuse();
  }
  const affinity = pod.affinity?.nodeAffinity;
  for (const weighted of affinity?.preferredDuringSchedulingIgnoredDuringExecution ?? [])
    requireMaps(weighted);
  const terms = [
    ...(affinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms ?? []),
    ...(affinity?.preferredDuringSchedulingIgnoredDuringExecution ?? []).map(
      (weighted) => weighted.preference,
    ),
  ];
  for (const term of terms) {
    requireMaps(term);
    for (const expression of term.matchExpressions ?? []) requireExpression(expression);
    for (const expression of term.matchFields ?? []) requireExpression(expression, true);
  }
  for (const related of [pod.affinity?.podAffinity, pod.affinity?.podAntiAffinity]) {
    requireMaps(related);
    for (const weighted of related?.preferredDuringSchedulingIgnoredDuringExecution ?? [])
      requireMaps(weighted);
    for (const term of [
      ...(related?.requiredDuringSchedulingIgnoredDuringExecution ?? []),
      ...(related?.preferredDuringSchedulingIgnoredDuringExecution ?? []).map(
        (weighted) => weighted.podAffinityTerm,
      ),
    ]) {
      requireMaps(term);
      if (!isKey(term.topologyKey)) refuse();
      if (term.labelSelector !== undefined && term.labelSelector !== null)
        requireSelector(term.labelSelector);
      if (term.namespaceSelector !== undefined && term.namespaceSelector !== null)
        requireSelector(term.namespaceSelector);
      for (const key of [...(term.matchLabelKeys ?? []), ...(term.mismatchLabelKeys ?? [])])
        if (!isKey(key)) refuse();
    }
  }
  // Proof: Task25c3g quantity-check removal admitted malformed integer/percentage domains; rolling-zero removal admitted both-zero/both-nonzero.
  for (const quantity of [
    strategy?.rollingUpdate?.maxSurge,
    strategy?.rollingUpdate?.maxUnavailable,
  ]) {
    if (
      quantity !== undefined &&
      !(typeof quantity === 'number'
        ? Count.allows(quantity)
        : /^\d+%$/.test(quantity) && readQuantity(quantity) <= 100)
    )
      refuse();
  }
  // OnDelete rolling fields are ignored by the pinned apps validator, not an API contradiction.
  if (
    strategy?.type !== 'OnDelete' &&
    (readQuantity(strategy?.rollingUpdate?.maxSurge ?? 0) === 0) ===
      (readQuantity(strategy?.rollingUpdate?.maxUnavailable ?? 1) === 0)
  )
    refuse();
  return controller;
}
/** Resource normalization does not consume affinity. Preserve it on the full source/lifecycle while
 * removing only this already-validated placement field from the older resource schema's input.
 * That schema requires expression values even for valid Exists/DoesNotExist; its legacy contract stays unchanged.
 */
// Proof: Task25c3g affinity-projection removal rejected valid Exists affinity with omitted values on the public native boundary.
export function selectDaemonWorkload(controller: ReturnType<typeof readDaemonSet>) {
  const { affinity: _affinity, ...workload } = controller.spec.template.spec;
  return workload;
}
function defaultFact<Value extends string | number | boolean>(
  declared: Value | undefined,
  fallback: Value,
  emptyDefaults = false,
) {
  const isDefault = declared === undefined || (emptyDefaults && declared === '');
  return {
    declared: declared ?? 'absent',
    effective:
      declared === undefined ? fallback : emptyDefaults && declared === '' ? fallback : declared,
    basis: isDefault ? ('kubernetes-v1.36.4-default' as const) : ('declared' as const),
  };
}
/** Source policy never grants permission for repeated replacement or a larger eligible-node discount. */
// Proof: Task25c3g policy bypass charged valid unsupported OnDelete and surge sources.
export function supportsDaemonPolicy(controller: ReturnType<typeof readDaemonSet>) {
  const spec = controller.spec;
  return (
    spec.updateStrategy?.type !== 'OnDelete' &&
    readQuantity(spec.updateStrategy?.rollingUpdate?.maxSurge ?? 0) === 0 &&
    !spec.template.spec.nodeName &&
    !spec.template.spec.affinity?.podAffinity &&
    !spec.template.spec.affinity?.podAntiAffinity
  );
}
/** Preserve every independent source obligation before topology/policy/normalization can stop charging. No resource arithmetic is performed here. */
export function readDaemonObligations(
  view: NativeView,
  pod: typeof InventoryWorkloadSpec.infer,
  claims: ReadonlySet<string>,
) {
  const missing: string[] = [];
  // Proof: Task60 writer-obligations corruption removed independent writer/bind/device/recursive-readonly/Pod-node facts while source costs remained; obligation assertions failed.
  for (const host of readHostPathConsumers(pod, refuse))
    missing.push(
      `hostPath-independent-writers-and-retained-bytes:${host.name}`,
      `hostPath-bind-device-submount-and-recursive-readonly:${host.name}`,
      `hostPath-Pod-node-observation:${host.name}`,
    );
  // Proof: Task25c3g obligation-scan omission hid independent host/scratch/root/claim facts; claim-namespace bypass lost existing-claim retention.
  for (const volume of pod.volumes ?? []) {
    if (volume.hostPath !== undefined) missing.push(`hostPath-device-growth:${volume.name}`);
    if (
      volume.emptyDir !== undefined &&
      (volume.emptyDir.sizeLimit === undefined ||
        readMemoryMiB(volume.emptyDir.sizeLimit, refuse) <= 0)
    )
      missing.push(`emptyDir-bound:${volume.name}`);
    if (volume.persistentVolumeClaim !== undefined) {
      const name = `${view.entry.namespace ?? '_'}/${volume.persistentVolumeClaim.claimName}`;
      missing.push(
        claims.has(
          `PersistentVolumeClaim:${view.entry.namespace ?? '_'}:${volume.persistentVolumeClaim.claimName}`,
        )
          ? `claim-owner-and-retention:${name}`
          : `claim-source:${name}`,
      );
    }
  }
  // Proof: Task25c3g init-writer omission hid the absent init ephemeral limit despite successful normalization.
  for (const container of [...pod.containers, ...(pod.initContainers ?? [])]) {
    const quantities = view.entry.sourceLimits.find(
      (limit) =>
        limit.pointer.endsWith(`/resources/limits`) &&
        view.entry.images.some(
          (image) =>
            image.name === container.name &&
            image.pointer.replace(/\/image$/, '/resources/limits') === limit.pointer,
        ),
    )?.quantities;
    if (quantities?.['ephemeral-storage'] === undefined) {
      missing.push(
        `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
      );
      if (container.securityContext?.readOnlyRootFilesystem !== true)
        missing.push(`writable-root-bound:${container.name}`);
    }
  }
  return missing;
}
/** Record conditional source facts, default provenance and unobserved whole-attempt restrictions; no field grants runtime authority. */
export function deriveDaemonLifecycle(
  controller: ReturnType<typeof readDaemonSet>,
  entry: NativeView['entry'],
  identity: string,
  topology: NonNullable<ReturnType<typeof readDaemonTopology>>,
) {
  const spec = controller.spec,
    pod = spec.template.spec,
    nodes = topology.candidateNodes;
  // Proof: Task25c3g controller-toleration omission lost the host-network network-unavailable declaration.
  const controllerTolerations = [
    ...['not-ready', 'unreachable'].map((name) => ({
      key: `node.kubernetes.io/${name}`,
      operator: 'Exists' as const,
      effect: 'NoExecute' as const,
    })),
    ...[
      'disk-pressure',
      'memory-pressure',
      'pid-pressure',
      'unschedulable',
      ...(pod.hostNetwork === true ? ['network-unavailable'] : []),
    ].map((name) => ({
      key: `node.kubernetes.io/${name}`,
      operator: 'Exists' as const,
      effect: 'NoSchedule' as const,
    })),
  ];
  return {
    owner: identity,
    source: entry,
    // Proof: Task25c3g owner-only template hash failed exact full-template provenance.
    templateSHA256: hash(JSON.stringify(spec.template)),
    topology: structuredClone(topology),
    // Proof: Task25c3g default-strategy substitution failed declared-absence/pinned-default provenance.
    strategy: defaultFact(spec.updateStrategy?.type, 'RollingUpdate', true),
    rolling: {
      maxSurge: defaultFact(spec.updateStrategy?.rollingUpdate?.maxSurge, 0),
      maxUnavailable: defaultFact(spec.updateStrategy?.rollingUpdate?.maxUnavailable, 1),
    },
    minReadySeconds: defaultFact(spec.minReadySeconds, 0),
    revisionHistoryLimit: defaultFact(spec.revisionHistoryLimit, 10),
    restartPolicy: defaultFact(pod.restartPolicy, 'Always', true),
    grace: {
      ...defaultFact(pod.terminationGracePeriodSeconds, 30),
      reclamationDeadline: false as const,
    },
    placement: structuredClone({
      nodeName: pod.nodeName ?? 'absent',
      nodeSelector: pod.nodeSelector ?? 'absent',
      affinity: pod.affinity ?? 'absent',
      tolerations: pod.tolerations ?? 'absent',
      tolerationDefaults: (pod.tolerations ?? []).map((toleration) => ({
        operator: defaultFact(toleration.operator, 'Equal', true),
        effect: defaultFact(toleration.effect, ''),
        seconds: {
          declared: toleration.tolerationSeconds ?? 'absent',
          effective:
            toleration.tolerationSeconds === undefined
              ? 'unbounded'
              : Math.max(0, toleration.tolerationSeconds),
        },
      })),
      hostNetwork: defaultFact(pod.hostNetwork, false),
      controllerTolerations: {
        entries: controllerTolerations,
        basis: 'kubernetes-v1.36.4-controller' as const,
      },
      eligibility: 'unobserved' as const,
    }),
    initialPods: nodes,
    replacementPods: nodes,
    maximumPodSlots: 2 * nodes,
    scenario: 'immutable-source-single-daemon-first-replacement-wave' as const,
    // Proof: Task25c3g node/controller-condition omissions and generationMultiplier1 forgery failed the full lifecycle control.
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-DaemonSet-UID-generation-template-unchanged',
      nodes: 'fixed-reachable-unchanged-Node-UID-set',
      controller: 'reachable-cooperative-DaemonSet-controller',
      initial: 'no-prior-adopted-or-orphan-work-and-no-uncharged-retention',
      history: 'complete-successful-and-uncertain-creation-history-and-reconciled-expectations',
      replacements: 'at-most-one-first-replacement-per-candidate-no-replacement-of-replacement',
      retention: 'full-initial-failed-terminating-unschedulable-and-replacement-demand',
      excluded: [
        'rollout',
        'node-addition',
        'node-replacement',
        'placement-mutation',
        'repeated-failure-or-eviction',
        'forced-deletion',
        'lost-node-execution',
        'controller-recreation',
        'foreign-mutation',
      ],
      admission:
        'independently-bind-effective-admission-resources-provider-features-and-event-constraints-before-creation',
      runtimeObserved: false as const,
    },
    wholeAttempt: {
      generationMultiplier: 'unobserved' as const,
      required: [
        'DaemonSet-UID-and-template-generations',
        'successful-and-uncertain-creation-and-expectation-history',
        'retained-predecessor-Pod-device-log-histories',
      ],
      cleanupCredit: false as const,
      runtimeObserved: false as const,
    },
    runtimeObserved: false as const,
  };
}
/** Both cohorts retain full normalized demand; candidateSlot never purports to identify an observed Node. */
export function expandDaemon(input: Parameters<typeof expandNativeCohorts>[0], nodes: number) {
  // Proof: Task25c3g zeroed full charges and shifted candidate-slot coordinates failed the two-node full-cohort control.
  return expandNativeCohorts(input, nodes).map((charge) => ({
    ...charge,
    concurrency: {
      phase: 'immutable-source-daemon-replacement-wave' as const,
      pods: charge.concurrency.pods,
      cohort: charge.concurrency.cohort,
      candidateSlot: charge.concurrency.slot,
    },
  }));
}
