import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { Toolchain } from './contracts';
import { readCPUMilli, readMemoryMiB, sumCapacity } from './observability-capacity';
import {
  expandNativeOwner,
  expandNativeVolumes,
  normalizeNativeOwner,
  UnsupportedNativeWorkload,
} from './observability-cold-start';
import {
  prepareRehearsalInventory,
  readRehearsalSource,
} from './observability-rehearsal-inventory';
import { observabilityRenderCapabilities } from './observability-render';
import {
  assertInventoryWorkload,
  InventoryWorkloadSpec,
  NativeWorkloadSpec,
} from './observability-workload';
import { podSpecOf } from './platform-manifests';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
// Proof: Task25c3a count-domain widening lost the negative/fractional replica and negative Job count refusals.
const Count = type('number.integer>=0').atMost(2147483647);
const Claim = type({
  metadata: { name: 'string>0' },
  spec: {
    'storageClassName?': 'string',
    resources: { requests: { storage: 'string>0' } },
  },
});
// Proof: Task25c3a claim-storage-bound weakening lost the absent storage-class obligation.
const BoundClaim = Claim.and({ spec: { storageClassName: 'string>0' } });
class UnboundedSource extends Error {}
const Controller = type({
  spec: {
    'replicas?': Count,
    'podManagementPolicy?': 'string>0',
    'ordinals?': { start: Count },
    'updateStrategy?': {
      'type?': 'string>0',
      'rollingUpdate?': { 'partition?': Count, 'maxUnavailable?': 'number|string' },
    },
    'strategy?': 'unknown',
    'volumeClaimTemplates?': Claim.array(),
    template: { spec: 'unknown' },
  },
});
// Proof: Task25c3a grace-domain widening admitted negative grace before unsupported policy.
const Grace = type({ 'terminationGracePeriodSeconds?': 'number.integer>=0' });
function refuse(): never {
  throw new Error('Native ordinal source malformed');
}
function defaultFact<Value extends string | number | boolean>(
  declared: Value | undefined,
  fallback: Value,
) {
  return {
    declared: declared ?? 'absent',
    effective: declared ?? fallback,
    basis: declared === undefined ? ('kubernetes-v1.36.4-default' as const) : ('declared' as const),
  };
}
// Proof: Task25c3b deployment-schema widening lost paused/strategy/progress malformed-source refusals.
const Deployment = type({
  spec: {
    'replicas?': Count,
    'paused?': 'boolean',
    'minReadySeconds?': Count,
    'revisionHistoryLimit?': Count,
    'progressDeadlineSeconds?': Count,
    'strategy?': {
      'type?': "''|'Recreate'|'RollingUpdate'",
      'rollingUpdate?': { 'maxSurge?': 'number|string', 'maxUnavailable?': 'number|string' },
    },
    template: { spec: 'unknown' },
  },
});
/** Validate Deployment policy before any missing-bound or unsupported-scenario shortcut.
 * v1.36.4 apps defaulting/validation permit surge percentages above 100, but not unavailable percentages.
 * These fields describe rollout policy; none establishes a physical replacement or reclamation bound.
 */
function readDeployment(manifest: Record<string, unknown>) {
  const controller = Deployment(manifest);
  if (controller instanceof type.errors) refuse();
  const spec = controller.spec;
  // Proof: Task25c3b foreign-field omissions each lost the corresponding Deployment lifecycle contradiction refusal.
  if (
    ['updateStrategy', 'podManagementPolicy', 'ordinals', 'volumeClaimTemplates'].some((field) =>
      Object.hasOwn(spec, field),
    )
  )
    refuse();
  const strategy = spec.strategy;
  // Proof: Task25c3b array-shape removal admitted strategy and rolling arrays behind absent bounds.
  if (Array.isArray(strategy) || Array.isArray(strategy?.rollingUpdate)) refuse();
  // Proof: Task25c3b recreate-contradiction removal admitted rolling fields under Recreate.
  if (strategy?.type === 'Recreate' && strategy.rollingUpdate !== undefined) refuse();
  const rolling = strategy?.rollingUpdate;
  // Proof: Task25c3b surge-input/unavailable-input omissions and numeric-domain/percent-grammar weakening lost malformed quantity refusals.
  for (const quantity of [rolling?.maxSurge, rolling?.maxUnavailable])
    if (
      quantity !== undefined &&
      !(typeof quantity === 'number' ? Count.allows(quantity) : /^[0-9]+%$/.test(quantity))
    )
      refuse();
  const surge = rolling?.maxSurge ?? '25%';
  const unavailable = rolling?.maxUnavailable ?? '25%';
  const readAmount = (quantity: number | string) =>
    typeof quantity === 'number' ? quantity : Number(quantity.slice(0, -1));
  // Proof: Task25c3b unavailable-bound removal admitted 101%; rolling-zero removal admitted both zero.
  if (typeof unavailable === 'string' && readAmount(unavailable) > 100) refuse();
  if (readAmount(surge) === 0 && readAmount(unavailable) === 0) refuse();
  // Proof: Task25c3b deadline-relation removal lost zero deadline and default-deadline/readiness refusals.
  if ((spec.progressDeadlineSeconds ?? 600) <= (spec.minReadySeconds ?? 0)) refuse();
  return controller;
}
// Proof: Task25c3e record-only schema failed eight malformed mode/boolean/restart/replacement/failure-rule negatives.
const Job = type({
  metadata: { 'annotations?': 'Record<string,string>|null' },
  spec: {
    'parallelism?': Count,
    'completions?': Count,
    'backoffLimit?': Count,
    'backoffLimitPerIndex?': Count,
    'maxFailedIndexes?': Count,
    // Proof: Task25c3e deadline widening failed malformed deadline negative and unsafe tests.
    'activeDeadlineSeconds?': type('number.integer>=0').atMost(Number.MAX_SAFE_INTEGER),
    'ttlSecondsAfterFinished?': Count,
    'completionMode?': "'NonIndexed'|'Indexed'",
    'suspend?': 'boolean',
    'manualSelector?': 'boolean',
    'managedBy?': 'string>0',
    'podReplacementPolicy?': "'TerminatingOrFailed'|'Failed'",
    'podFailurePolicy?': {
      'rules?': type({
        action: "'Count'|'FailJob'|'Ignore'|'FailIndex'",
        'onExitCodes?': {
          'containerName?': 'string>0',
          operator: "'In'|'NotIn'",
          values: type('number.integer')
            .atLeast(-2147483648)
            .atMost(2147483647)
            .array()
            .atLeastLength(1)
            .atMostLength(255),
        },
        'onPodConditions?': type({ type: 'string>0', 'status?': "''|'True'|'False'|'Unknown'" })
          .array()
          .atMostLength(20),
      })
        .array()
        .atMostLength(20),
    },
    'successPolicy?': {
      rules: type({ 'succeededCount?': Count, 'succeededIndexes?': 'string<=65536' })
        .array()
        .atLeastLength(1)
        .atMostLength(20),
    },
    'selector?': {
      'matchLabels?': 'Record<string,string>',
      'matchExpressions?': type({
        key: 'string>0',
        operator: "'In'|'NotIn'|'Exists'|'DoesNotExist'",
        'values?': 'string[]',
      }).array(),
    },
    template: {
      'metadata?': { 'labels?': 'Record<string,string>' },
      spec: {
        restartPolicy: "'Never'|'OnFailure'",
        containers: type({ name: 'string>0' }).array(),
        'initContainers?': type({ name: 'string>0' }).array(),
      },
    },
  },
});
function isJobLabel(value: string) {
  return value.length <= 63 && /^(?:[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?)?$/.test(value);
}
function isJobKey(value: string) {
  const parts = value.split('/');
  const name = parts.pop();
  return (
    name !== undefined &&
    name !== '' &&
    isJobLabel(name) &&
    (parts.length === 0 ||
      (parts.length === 1 &&
        parts[0].length <= 253 &&
        parts[0]
          .split('.')
          .every((label) => label.length <= 63 && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(label))))
  );
}
/** Decode known Job policy before unsupported/default-provider or resource-bound decisions.
 * Source declarations precede server-generated selectors; absent counts use the conditional v1.36.4 batch defaults.
 * This is a narrow source decoder, not API admission or controller execution.
 */
function readJob(manifest: Record<string, unknown>) {
  const controller = Job(manifest);
  if (controller instanceof type.errors) refuse();
  const spec = controller.spec;
  const rules = spec.podFailurePolicy?.rules ?? [];
  const labels = spec.template.metadata?.labels ?? {};
  // Proof: Task25c3e object-array bypass failed malformed selector array/labels array and failure shape tests.
  if (
    [
      spec,
      spec.template.metadata,
      spec.template.metadata?.labels,
      spec.selector,
      spec.selector?.matchLabels,
      spec.podFailurePolicy,
      spec.successPolicy,
      ...rules,
      ...rules.map((rule) => rule.onExitCodes),
      ...rules.flatMap((rule) => rule.onPodConditions ?? []),
      ...(spec.successPolicy?.rules ?? []),
      ...(spec.selector?.matchExpressions ?? []),
    ].some(Array.isArray)
  )
    refuse();
  // Proof: Task25c3e foreign-field check removal failed foreign replicas/strategy/claims tests.
  if (
    [
      'replicas',
      'strategy',
      'updateStrategy',
      'podManagementPolicy',
      'ordinals',
      'volumeClaimTemplates',
    ].some((field) => Object.hasOwn(spec, field))
  )
    refuse();
  // Proof: Task25c3e unconditional completions1 admitted the valid unsupported workqueue test.
  const completions = spec.completions ?? (spec.parallelism === undefined ? 1 : undefined);
  // Proof: Task25c3e Indexed relationship bypass failed indexed work queue and parallel cap negatives.
  if (
    spec.completionMode === 'Indexed' &&
    (completions === undefined || (spec.parallelism ?? 1) > 100000)
  )
    refuse();
  if (
    // Proof: Task25c3e Indexed-policy bypass admitted per index nonindexed and success nonindexed negatives.
    (spec.backoffLimitPerIndex !== undefined || spec.successPolicy !== undefined) &&
    spec.completionMode !== 'Indexed'
  )
    refuse();
  if (
    // Proof: Task25c3e max-index bypass failed max failed without index and indexed max failures tests.
    spec.maxFailedIndexes !== undefined &&
    (spec.backoffLimitPerIndex === undefined ||
      completions === undefined ||
      spec.maxFailedIndexes > completions ||
      spec.maxFailedIndexes > 100000)
  )
    refuse();
  if (
    completions !== undefined &&
    // Proof: Task25c3e high-count guard bypass failed indexed large missing max failures.
    completions > 100000 &&
    spec.backoffLimitPerIndex !== undefined &&
    (spec.maxFailedIndexes === undefined ||
      spec.maxFailedIndexes > 10000 ||
      (spec.parallelism ?? 1) > 10000)
  )
    refuse();
  if (
    // Proof: Task25c3e restart/replacement bypass failed OnFailure and failure replacement contradiction tests.
    spec.podFailurePolicy !== undefined &&
    (spec.template.spec.restartPolicy !== 'Never' ||
      (spec.podReplacementPolicy !== undefined && spec.podReplacementPolicy !== 'Failed'))
  )
    refuse();
  if (
    // Proof: Task25c3e managedBy validation bypass failed malformed managed controller domain.
    spec.managedBy !== undefined &&
    (spec.managedBy.length > 63 ||
      // Proof: Task25c3e DNS-label bypass failed malformed managed controller empty domain label.
      !isJobKey(spec.managedBy.split('/')[0] + '/controller') ||
      !/^[a-z0-9](?:[-.a-z0-9]*[a-z0-9])?\/[A-Za-z0-9/_.~%!$&'()*+,;=:-]+$/.test(spec.managedBy))
  )
    refuse();
  for (const rule of rules) {
    const codes = rule.onExitCodes;
    const conditions = rule.onPodConditions ?? [];
    // Proof: Task25c3e matcher bypass failed failure rule neither and both matchers tests.
    if ((codes === undefined) === (conditions.length === 0)) refuse();
    // Proof: Task25c3e qualified-condition check removal failed malformed condition type.
    if (conditions.some((condition) => !isJobKey(condition.type))) refuse();
    // Proof: Task25c3e per-index prerequisite removal failed failure index contradiction.
    if (rule.action === 'FailIndex' && spec.backoffLimitPerIndex === undefined) refuse();
    if (codes !== undefined) {
      if (
        // Proof: Task25c3e exit-code content bypass failed zero, duplicate and unordered negatives.
        codes.values.some(
          (code, index) =>
            (codes.operator === 'In' && code === 0) ||
            (index > 0 && codes.values[index - 1] >= code),
        )
      )
        refuse();
      if (
        // Proof: Task25c3e container lookup bypass failed failure container unknown.
        codes.containerName !== undefined &&
        ![...spec.template.spec.containers, ...(spec.template.spec.initContainers ?? [])].some(
          (container) => container.name === codes.containerName,
        )
      )
        refuse();
    }
  }
  for (const rule of spec.successPolicy?.rules ?? []) {
    // Proof: Task25c3e required-rule removal failed success empty rule.
    if (rule.succeededCount === undefined && rule.succeededIndexes === undefined) refuse();
    let count = 0;
    let previous = -1;
    for (const interval of rule.succeededIndexes === undefined || rule.succeededIndexes === ''
      ? []
      : rule.succeededIndexes.split(',')) {
      // Proof: Task25c3e grammar removal admitted success index exponent independently of numeric bounds.
      if (!/^[0-9]+(?:-[0-9]+)?$/.test(interval)) refuse();
      const [first, last = first] = interval.split('-').map(Number);
      if (
        // Proof: Task25c3e interval guard removal failed success indexes overlap and bound tests.
        !Number.isSafeInteger(last) ||
        first <= previous ||
        last < first ||
        completions === undefined ||
        last >= completions
      )
        refuse();
      count += last - first + 1;
      previous = last;
    }
    if (
      // Proof: Task25c3e count-bound removal failed success count exceeds indexes.
      rule.succeededCount !== undefined &&
      (completions === undefined ||
        rule.succeededCount > completions ||
        (rule.succeededIndexes !== undefined && rule.succeededCount > count))
    )
      refuse();
  }
  // Proof: Task25c3e label guard removal failed selector invalid key/value and mismatched template tests.
  for (const [key, value] of Object.entries(spec.selector?.matchLabels ?? {}))
    if (!isJobKey(key) || !isJobLabel(value) || labels[key] !== value) refuse();
  for (const expression of spec.selector?.matchExpressions ?? []) {
    // Proof: Task25c3e expression grammar removal admitted the matching invalid-label selector test.
    if (!isJobKey(expression.key) || expression.values?.some((value) => !isJobLabel(value)))
      refuse();
    const value = Object.hasOwn(labels, expression.key) ? labels[expression.key] : undefined;
    if (
      // Proof: Task25c3e template-match removal failed In, NotIn, Exists and DoesNotExist controls.
      expression.operator === 'In'
        ? value === undefined || !expression.values?.includes(value)
        : expression.operator === 'NotIn'
          ? value !== undefined && expression.values?.includes(value)
          : expression.operator === 'Exists'
            ? value === undefined
            : value !== undefined
    )
      refuse();
    const hasValues = (expression.values?.length ?? 0) > 0;
    // Proof: Task25c3e value-cardinality removal admitted Exists with values.
    if ((expression.operator === 'In' || expression.operator === 'NotIn') !== hasValues) refuse();
  }
  return { ...controller, completions };
}

function readNativeInput(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
  const { entry, manifest } = view;
  const spec = type('Record<string,unknown>')(manifest['spec']);
  if (spec instanceof type.errors || Array.isArray(spec)) refuse();
  const specifications = [spec];
  if (entry.kind === 'CronJob') {
    const cron = type({ jobTemplate: { spec: 'Record<string,unknown>' } })(spec);
    if (cron instanceof type.errors) refuse();
    specifications.push(cron.jobTemplate.spec);
  }
  for (const specification of specifications) {
    for (const field of [
      'replicas',
      'parallelism',
      'completions',
      'backoffLimit',
      'backoffLimitPerIndex',
      'activeDeadlineSeconds',
      'minReadySeconds',
      'revisionHistoryLimit',
      'successfulJobsHistoryLimit',
      'failedJobsHistoryLimit',
      'startingDeadlineSeconds',
      'ttlSecondsAfterFinished',
    ])
      if (
        specification[field] !== undefined &&
        !(entry.kind === 'Job' && field === 'activeDeadlineSeconds') &&
        !Count.allows(specification[field])
      )
        refuse();
  }
  if (entry.category === 'claim') return null;
  // Proof: Task25c3b prepass-order removal let an earlier ordinal collision conceal malformed Deployment lifecycle state.
  if (entry.kind === 'Deployment') readDeployment(manifest);
  // Proof: Task25c3e prepass removal let an earlier ordinal claim collision mask a malformed later Job.
  if (entry.kind === 'Job') readJob(manifest);
  const pod = InventoryWorkloadSpec(podSpecOf({ kind: entry.kind, spec }));
  if (pod instanceof type.errors) refuse();
  const templates = type({ 'volumeClaimTemplates?': Claim.array() })(spec);
  if (templates instanceof type.errors) refuse();
  const volumes = expandNativeVolumes(
    pod.volumes ?? [],
    templates.volumeClaimTemplates ?? [],
    entry.kind,
  );
  // Proof: Task25c3a prepass-ordering bypass hid contradictory volumes behind absent bounds and unsupported management.
  assertInventoryWorkload(
    { ...pod, volumes },
    {
      memory: (quantity) => readMemoryMiB(quantity, refuse),
      cpu: (quantity) => readCPUMilli(quantity, refuse),
      refuse,
      refuseMalformed: refuse,
    },
  );
  const grace = Grace(pod);
  if (grace instanceof type.errors) refuse();
  if (entry.kind === 'StatefulSet') {
    const controller = Controller(manifest);
    if (controller instanceof type.errors) refuse();
    // Proof: Task25c3a strategy-contradiction/unavailable-domain removals admitted contradictory or fractional update fields.
    const strategy = controller.spec.updateStrategy;
    if (
      controller.spec.strategy !== undefined ||
      (strategy?.type === 'OnDelete' && strategy.rollingUpdate !== undefined)
    )
      refuse();
    const unavailable = strategy?.rollingUpdate?.maxUnavailable;
    if (
      unavailable !== undefined &&
      !(typeof unavailable === 'number'
        ? Count.allows(unavailable)
        : /^(?:100|[0-9]{1,2})%$/.test(unavailable))
    )
      refuse();
  }
  return pod;
}

function hasRuntimeIdentity(manifest: Record<string, unknown>) {
  const metadata = type({ metadata: 'Record<string,unknown>' })(manifest);
  if (metadata instanceof type.errors) refuse();
  return (
    ['ownerReferences', 'deletionTimestamp', 'uid', 'generation', 'resourceVersion'].some(
      (field) => metadata.metadata[field] !== undefined,
    ) || manifest['status'] !== undefined
  );
}
function deriveDeploymentLifecycle(
  controller: ReturnType<typeof readDeployment>,
  entry: ReturnType<typeof readRehearsalSource>['native'][number]['entry'],
  identity: string,
  replicas: number,
) {
  const spec = controller.spec;
  const declared = spec.strategy?.type;
  // Proof: Task25c3b default-strategy substitution changed the fixed source policy control.
  const strategy =
    declared === ''
      ? { ...defaultFact(undefined, 'RollingUpdate'), declared }
      : defaultFact(declared, 'RollingUpdate');
  const grace = Grace(spec.template.spec);
  if (grace instanceof type.errors) refuse();
  return {
    owner: identity,
    // Proof: Task25c3b template-binding substitution made changed same-owner templates share a hash.
    templateSHA256: hash(JSON.stringify(spec.template)),
    source: entry,
    replicas,
    strategy,
    // Proof: Task25c3b default-rolling substitution failed declared-absence/default provenance assertions.
    rolling:
      strategy.effective === 'Recreate'
        ? null
        : {
            maxSurge: defaultFact(spec.strategy?.rollingUpdate?.maxSurge, '25%'),
            maxUnavailable: defaultFact(spec.strategy?.rollingUpdate?.maxUnavailable, '25%'),
          },
    minReadySeconds: defaultFact(spec.minReadySeconds, 0),
    revisionHistoryLimit: defaultFact(spec.revisionHistoryLimit, 10),
    progressDeadlineSeconds: defaultFact(spec.progressDeadlineSeconds, 600),
    grace: {
      ...defaultFact(grace.terminationGracePeriodSeconds, 30),
      reclamationDeadline: false as const,
    },
    scenario: 'immutable-source-single-replicaset-first-replacement-wave' as const,
    initialPods: replicas,
    replacementPods: replicas,
    maximumPodSlots: 2 * replicas,
    // Proof: Task25c3b runtime-conditions/replacement-condition omissions and runtime-observation forgery failed unobserved event-contract assertions.
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-deployment-UID-one-replicaset-UID-one-template-unchanged-scale',
      history: 'complete-successful-and-uncertain-creation-history',
      initial: 'no-prior-work-or-adoption-and-no-unaccounted-create-retries',
      replacements: 'at-most-one-per-initial-Pod-no-replacement-of-replacement',
      controller: 'reachable-cooperative-creation-observations-and-expectations-reconciled',
      excluded: [
        'rollout',
        'scale-change',
        'controller-recreation',
        'foreign-mutation',
        'forced-deletion',
        'lost-node-execution',
      ],
      retention: 'full-initial-and-replacement-demand-without-assumed-reclamation',
      admission: 'independently-bind-and-enforce-event-constraints-before-creation',
      runtimeObserved: false as const,
    },
    runtimeObserved: false as const,
  };
}
/** Expand two full same-template accounting cohorts; slots are not observed Pod names, UIDs or ordinals. */
function expandDeployment(
  input: Omit<Parameters<typeof expandNativeOwner>[0], 'templates' | 'claimPointer' | 'pods'>,
  replicas: number,
) {
  // Proof: Task25c3b cohort-count removal lost full first-replacement charges; initial-charge/replacement-charge zeroing failed the per-slot ledger.
  return expandNativeOwner({
    ...input,
    pods: 2 * replicas,
    templates: [],
    claimPointer: () => {
      throw new Error('Deployment claim template impossible');
    },
  }).map((charge, index) => {
    // Proof: Task25c3b slot-identity/cohort-identity substitutions triggered duplicate charge refusal in first-wave controls.
    const cohort = index < replicas ? ('initial' as const) : ('replacement' as const);
    const slot = index % replicas;
    return {
      ...charge,
      kind: 'pod' as const,
      identity: `${input.identity}/${cohort}/${String(slot)}`,
      concurrency: {
        phase: 'immutable-source-deployment-replacement-wave' as const,
        pods: 2 * replicas,
        cohort,
        slot,
      },
    };
  });
}
/** Keep default provenance and the conditional one-UID envelope separate from runtime admission.
 * At most 256 accounting slots are materialized by this adapter (backoff 0..255), a computational
 * representation limit rather than a Kubernetes, hardware or physical safety bound.
 * Failed/terminating attempts retain full demand; restarts reuse a slot but cumulative logs remain unbounded.
 */
function deriveJobLifecycle(
  controller: ReturnType<typeof readJob>,
  entry: ReturnType<typeof readRehearsalSource>['native'][number]['entry'],
  identity: string,
) {
  const spec = controller.spec;
  const grace = Grace(spec.template.spec);
  if (grace instanceof type.errors) refuse();
  return {
    owner: identity,
    // Proof: Task25c3e owner-only template hash failed the full-template/changed-label condition control.
    templateSHA256: hash(JSON.stringify(spec.template)),
    source: entry,
    hooks: entry.hooks,
    annotations:
      controller.metadata.annotations === undefined
        ? ('absent' as const)
        : controller.metadata.annotations,
    annotationSource: entry.annotationSource,
    parallelism: defaultFact(spec.parallelism, 1),
    completions: defaultFact(spec.completions, 1),
    // Proof: Task25c3e default backoff7 substitution failed declared-absence/provider provenance control.
    backoffLimit: defaultFact(spec.backoffLimit, 6),
    completionMode: defaultFact(spec.completionMode, 'NonIndexed'),
    suspend: defaultFact(spec.suspend, false),
    manualSelector: defaultFact(spec.manualSelector, false),
    podReplacementPolicy: defaultFact(spec.podReplacementPolicy, 'TerminatingOrFailed'),
    podFailurePolicy: 'absent' as const,
    successPolicy: 'absent' as const,
    managedBy: {
      declared: spec.managedBy ?? 'absent',
      effective: 'kubernetes.io/job-controller' as const,
      basis:
        spec.managedBy === undefined
          ? ('kubernetes-v1.36.4-controller' as const)
          : ('declared' as const),
    },
    restartPolicy: spec.template.spec.restartPolicy,
    activeDeadlineSeconds: {
      declared: spec.activeDeadlineSeconds ?? 'absent',
      reclamationDeadline: false as const,
    },
    ttlSecondsAfterFinished: {
      declared: spec.ttlSecondsAfterFinished ?? 'absent',
      reclamationDeadline: false as const,
    },
    grace: {
      ...defaultFact(grace.terminationGracePeriodSeconds, 30),
      reclamationDeadline: false as const,
    },
    maximumPodSlots: (spec.backoffLimit ?? 6) + 1,
    scenario: 'immutable-source-single-uid-serial-nonindexed-job' as const,
    // Proof: Task25c3e success-condition omission failed conditions and whole attempt history control.
    conditions: {
      source: 'fresh-immutable-attempt',
      identity: 'one-Job-UID-one-template-unchanged-counts-and-policies',
      history: 'complete-successful-and-uncertain-creation-reconciliation',
      initial: 'no-prior-work-or-adoption-and-no-unaccounted-creation',
      failures:
        'every-replaced-nonsuccessful-Pod-durably-counted-once-before-next-create-including-finalizers',
      success: 'no-further-creation-after-first-success',
      controller: 'reachable-cooperative-controller-with-reconciled-expectations',
      excluded: [
        'foreign-mutation',
        'forced-deletion',
        'lost-node-execution',
        'controller-recreation',
      ],
      retention: 'full-failed-terminating-and-current-Pod-demand-without-cleanup-credit',
      restarts: 'reuse-Pod-slot-cumulative-restart-logs-remain-unbounded',
      admission: 'independently-bind-and-enforce-event-constraints-before-creation',
      runtimeObserved: false as const,
    },
    wholeAttempt: {
      required: [
        'Helm-install-upgrade-retry-remediation-invocation-identities',
        'hook-created-Job-UID-generations',
        'Flux-forced-recreation-generations',
        'retained-predecessor-Pod-device-log-histories',
      ],
      // Proof: Task25c3e forged multiplier one failed conditions and whole attempt history control.
      generationMultiplier: 'unobserved' as const,
      cleanupCredit: false as const,
      runtimeObserved: false as const,
    },
    // Proof: Task25c3e runtimeObserved forgery failed conditions and whole attempt history control.
    runtimeObserved: false as const,
  };
}

/** Materialize full normalized retry accounting slots, never observed Pod names or UIDs. */
function expandJob(
  input: Omit<Parameters<typeof expandNativeOwner>[0], 'templates' | 'claimPointer' | 'pods'>,
  backoff: number,
) {
  // Proof: Task25c3e B+1 removal failed backoff0/4/6/10 full-attempt controls.
  const pods = backoff + 1;
  return expandNativeOwner({
    ...input,
    pods,
    templates: [],
    claimPointer: () => {
      throw new Error('Job claim template impossible');
    },
  }).map((charge, slot) => ({
    ...charge,
    kind: 'pod' as const,
    // Proof: Task25c3e slot shift and zeroed retry memory/CPU/disk failed backoff4 full-charge control.
    identity: `${input.identity}/attempt/${String(slot)}`,
    concurrency: { phase: 'immutable-source-serial-job-attempts' as const, pods, slot },
  }));
}

function deriveNativeCosts(source: ReturnType<typeof readRehearsalSource>, lock: Toolchain) {
  const entries: ReturnType<typeof expandNativeOwner> = [];
  const deploymentEntries: ReturnType<typeof expandDeployment> = [];
  const deploymentLifecycles: ReturnType<typeof deriveDeploymentLifecycle>[] = [];
  const jobEntries: ReturnType<typeof expandJob> = [];
  const jobLifecycles: ReturnType<typeof deriveJobLifecycle>[] = [];
  const blockers: { owner: string; missingFact: string }[] = [];
  const lifecycles: {
    owner: string;
    templateSHA256: string;
    management: ReturnType<typeof defaultFact<string>>;
    update: ReturnType<typeof defaultFact<string>>;
    grace: ReturnType<typeof defaultFact<number>> & { reclamationDeadline: false };
    scenario: string;
    runtimeObserved: false;
    source: ReturnType<typeof readRehearsalSource>['inventory']['entries'][number];
  }[] = [];
  const missing = (owner: string, missingFact: string) => blockers.push({ owner, missingFact });
  // Proof: Task25c3a provider-pin bypass granted charges to mismatched intended k3s/node versions.
  const providerMatches =
    lock.binaries.k3s.version === 'v1.36.4+k3s1' &&
    lock.runtimeImages.k3dNode.name === 'docker.io/rancher/k3s:v1.36.4-k3s1';
  if (!providerMatches) missing('provider', 'pinned-defaulting-contract');
  const claims = new Set(
    source.native
      .filter(({ entry }) => entry.category === 'claim')
      .map(({ entry }) => `PersistentVolumeClaim:${entry.namespace ?? '_'}:${entry.name}`),
  );
  function deriveDeployment(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    const controller = readDeployment(manifest);
    const spec = controller.spec;
    // Proof: Task25c3b source-runtime-identity bypass admitted live/deleting/foreign source identities.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      return;
    }
    // Proof: Task25c3b namespace bypass lost the unresolved source namespace obligation.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      return;
    }
    // Proof: Task25c3b provider/paused bypasses admitted unsupported first-wave sources.
    if (!providerMatches || spec.paused === true) {
      missing(identity, 'deployment-replacement-wave-policy');
      return;
    }
    // Proof: Task25c3b replica-obligation removal hid absent/zero declared counts.
    if (spec.replicas === undefined || spec.replicas === 0) {
      missing(identity, 'replica-count');
      return;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    // Proof: Task25c3b missing-bounds removal hid valid absent/null resource obligations.
    if (pod instanceof type.errors) {
      missing(identity, 'workload-bounds-or-resource-policy');
      return;
    }
    let model: ReturnType<typeof normalizeNativeOwner>;
    try {
      model = normalizeNativeOwner(pod, [], entry.kind, entry.owner, identity, (reason) => {
        throw new UnboundedSource(reason);
      });
    } catch (failure) {
      if (!(failure instanceof UnsupportedNativeWorkload) && !(failure instanceof UnboundedSource))
        throw failure;
      // Proof: Task25c3b normalization-obligation removal hid unbounded emptyDir/root and unsupported hostPath facts.
      missing(identity, failure.message);
      return;
    }
    deploymentEntries.push(
      ...expandDeployment(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          // Proof: Task25c3b source-frame/source-pointer substitutions failed exact charge provenance assertions.
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/template/spec`,
          },
        },
        spec.replicas,
      ),
    );
    // Proof: Task25c3b claim-reference omission and claim-namespace substitution lost exact external-claim obligations.
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim'))
      missing(
        identity,
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    // Proof: Task25c3b ephemeral-app/ephemeral-init omissions lost absent-limit writer obligations.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    // Proof: Task25c3b runtime-binding removal made conditional cohorts lose their required per-owner admission blocker.
    missing(identity, 'deployment-replacement-wave-runtime-binding');
    deploymentLifecycles.push(
      deriveDeploymentLifecycle(controller, entry, identity, spec.replicas),
    );
  }
  function deriveJob(view: ReturnType<typeof readRehearsalSource>['native'][number]) {
    const { entry, manifest } = view;
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    const controller = readJob(manifest);
    const spec = controller.spec;
    // Proof: Task25c3e whole-attempt blocker omission failed both lifecycle and unbounded bucket controls.
    missing(
      identity,
      'whole-attempt-helm-install-upgrade-retry-remediation-hook-Job-UID-Flux-recreation-and-retained-Pod-device-log-history',
    );
    // Proof: Task25c3e identity bypass admitted UID/owner/deletion/generation/resourceVersion sources.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      return;
    }
    // Proof: Task25c3e namespace bypass failed namespace and provider control.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      return;
    }
    // Proof: Task25c3e serial-policy/provider bypass failed ten unsupported/provider controls.
    if (
      !providerMatches ||
      controller.completions !== 1 ||
      (spec.parallelism ?? 1) !== 1 ||
      (spec.completionMode ?? 'NonIndexed') !== 'NonIndexed' ||
      spec.suspend === true ||
      spec.manualSelector === true ||
      spec.selector !== undefined ||
      spec.podFailurePolicy !== undefined ||
      spec.successPolicy !== undefined ||
      spec.backoffLimitPerIndex !== undefined ||
      (spec.podReplacementPolicy ?? 'TerminatingOrFailed') !== 'TerminatingOrFailed' ||
      (spec.managedBy !== undefined && spec.managedBy !== 'kubernetes.io/job-controller')
    ) {
      missing(identity, 'job-serial-policy');
      return;
    }
    // Proof: Task25c3e range removal admitted B256; hostile MaxInt32 was never run with the guard removed.
    if ((spec.backoffLimit ?? 6) > 255) {
      missing(identity, 'job-attempt-expansion-range');
      return;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    if (pod instanceof type.errors) {
      // Proof: Task25c3e missing-bound blocker omission failed all four broad resource-absence controls.
      missing(identity, 'workload-bounds-or-resource-policy');
      return;
    }
    let model: ReturnType<typeof normalizeNativeOwner>;
    try {
      model = normalizeNativeOwner(pod, [], entry.kind, entry.owner, identity, (reason) => {
        throw new UnboundedSource(reason);
      });
    } catch (failure) {
      if (!(failure instanceof UnsupportedNativeWorkload) && !(failure instanceof UnboundedSource))
        throw failure;
      // Proof: Task25c3e normalization blocker omission failed unbounded bucket scratch.
      missing(identity, failure.message);
      return;
    }
    // Proof: Task25c3e claim lookup removal failed external claim owners remain namespace scoped.
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim'))
      missing(
        identity,
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    // Proof: Task25c3e ephemeral-obligation omission failed independent app and init writer controls.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    jobEntries.push(
      ...expandJob(
        {
          identity,
          namespace: entry.namespace,
          name: entry.name,
          model,
          // Proof: Task25c3e frame and pointer substitutions independently failed backoff4 charge provenance.
          source: {
            owner: entry.owner,
            sha256: entry.source.frameSHA256,
            pointer: `${entry.pointer}/spec/template/spec`,
          },
        },
        spec.backoffLimit ?? 6,
      ),
    );
    // Proof: Task25c3e runtime blocker omission failed conditions and whole attempt history control.
    missing(identity, 'job-serial-runtime-binding');
    jobLifecycles.push(deriveJobLifecycle(controller, entry, identity));
  }
  const validated = source.native.map((view) => ({ ...view, pod: readNativeInput(view) }));
  for (const { entry, manifest } of validated) {
    const identity = `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`;
    if (entry.category === 'claim') {
      missing(identity, 'claim-owner-and-retention-unaccounted');
      continue;
    }
    if (entry.kind === 'Deployment') {
      deriveDeployment({ entry, manifest });
      continue;
    }
    if (entry.kind === 'Job') {
      deriveJob({ entry, manifest });
      continue;
    }
    if (entry.kind !== 'StatefulSet') {
      missing(identity, `${entry.kind}-lifecycle-unaccounted`);
      continue;
    }
    const controller = Controller(manifest);
    if (controller instanceof type.errors) refuse();
    const spec = controller.spec;
    // Proof: Task25c3a source-generation bypass admitted ownerReferences and deleting-source identities to the fixed scenario.
    if (hasRuntimeIdentity(manifest)) {
      missing(identity, 'source-controller-identity-and-generation');
      continue;
    }
    const pod = NativeWorkloadSpec(spec.template.spec);
    if (pod instanceof type.errors) {
      // Proof: Task25c3a missing-map-policy strict substitution rejected valid absent/null declarations instead of retaining their obligations.
      missing(identity, 'workload-bounds-or-resource-policy');
      continue;
    }
    const grace = Grace(spec.template.spec);
    if (grace instanceof type.errors) refuse();
    // Proof: Task25c3a default-substitution replaced OrderedReady with Parallel; default lifecycle charges/provenance assertions failed.
    const management = defaultFact(spec.podManagementPolicy, 'OrderedReady');
    const update = defaultFact(spec.updateStrategy?.type, 'RollingUpdate');
    // Proof: Task25c3a namespace-obligation bypass invented charges for an unresolved native namespace.
    if (entry.namespace === null) {
      missing(identity, 'source-namespace');
      continue;
    }
    if (
      // Proof: Task25c3a management/update/ordinal/partition/unavailable-policy bypasses each admitted an unsupported lifecycle.
      !providerMatches ||
      management.effective !== 'OrderedReady' ||
      update.effective !== 'RollingUpdate' ||
      spec.ordinals !== undefined ||
      (spec.updateStrategy?.rollingUpdate?.partition !== undefined &&
        spec.updateStrategy.rollingUpdate.partition !== 0) ||
      spec.updateStrategy?.rollingUpdate?.maxUnavailable !== undefined ||
      spec.strategy !== undefined
    ) {
      missing(identity, 'stateful-ordinal-lifecycle-policy');
      continue;
    }
    // Proof: Task25c3a count-obligation bypass lost explicit absent/zero replica obligations.
    if (spec.replicas === undefined || spec.replicas === 0) {
      missing(identity, 'replica-count');
      continue;
    }
    let model: ReturnType<typeof normalizeNativeOwner>;
    const templates = BoundClaim.array()(spec.volumeClaimTemplates ?? []);
    if (templates instanceof type.errors) {
      missing(identity, 'claim-storage-class-unresolved');
      continue;
    }
    try {
      model = normalizeNativeOwner(pod, templates, entry.kind, entry.owner, identity, (reason) => {
        throw new UnboundedSource(reason);
      });
    } catch (failure) {
      if (!(failure instanceof UnsupportedNativeWorkload) && !(failure instanceof UnboundedSource))
        throw failure;
      missing(identity, failure.message);
      continue;
    }
    const charges = expandNativeOwner({
      identity,
      namespace: entry.namespace,
      name: entry.name,
      pods: spec.replicas,
      templates,
      model,
      source: {
        owner: entry.owner,
        // Proof: Task25c3a source-hash/source-pointer substitutions failed exact charge frame and document provenance assertions.
        sha256: entry.source.frameSHA256,
        pointer: `${entry.pointer}/spec/template/spec`,
      },
      claimPointer: (_template, index) =>
        `${entry.pointer}/spec/volumeClaimTemplates/${String(index)}`,
    });
    // Proof: Task25c3a claim-collision bypass admitted both equal-size and conflicting explicit ordinal PVCs.
    for (const charge of charges)
      if (charge.kind === 'claim' && claims.has(charge.identity))
        throw new Error('Native ordinal claim-identity-collision');
    // Proof: Task25c3a pod-double/claim-double injection failed the full ordinal ledger control through shared duplicate-charge refusal.
    entries.push(...charges);
    for (const volume of model.volumes.filter((volume) => volume.kind === 'claim')) {
      if (templates.some((template) => template.metadata.name === volume.name)) continue;
      missing(
        identity,
        // Proof: Task25c3a claim-namespace substitution borrowed a prod claim for a dev owner; the missing-source assertion failed.
        claims.has(`PersistentVolumeClaim:${entry.namespace}:${volume.reference}`)
          ? `claim-owner-and-retention:${entry.namespace}/${volume.reference}`
          : `claim-source:${entry.namespace}/${volume.reference}`,
      );
    }
    // Proof: Task25c3a ephemeral-obligation removal hid absent limits behind read-only-root zero arithmetic.
    for (const container of [...pod.containers, ...(pod.initContainers ?? [])])
      if (container.resources.limits['ephemeral-storage'] === undefined)
        missing(
          identity,
          `ephemeral-storage-limit-absent:${container.name}; writable-logs-and-runtime-state-unobserved`,
        );
    lifecycles.push({
      owner: identity,
      // Proof: Task25c3a template-binding substitution made changed same-owner templates share one binding; the control failed.
      templateSHA256: hash(JSON.stringify(spec.template)),
      management,
      update,
      grace: {
        ...defaultFact(grace.terminationGracePeriodSeconds, 30),
        reclamationDeadline: false,
      },
      scenario: 'immutable-source-process-recovery-or-graceful-same-template-ordinal-replacement',
      runtimeObserved: false,
      source: entry,
    });
  }
  for (const entry of source.inventory.entries)
    if (entry.category === 'provider-input' || entry.category === 'unclassified')
      missing(
        `${entry.kind}:${entry.namespace ?? '_'}:${entry.name}`,
        'provider-or-unclassified-demand',
      );
  return {
    scope: 'immutable-source-native-ordinal-lifecycle' as const,
    // Proof: Task25c3a completeness/creation-authority/runtime-authority forgeries failed the conditional-ledger authority assertions.
    state: 'incomplete' as const,
    creationAuthority: false as const,
    runtimeAuthority: false as const,
    deploymentScope: 'immutable-source-deployment-replacement-wave' as const,
    deploymentLifecycles,
    jobScope: 'immutable-source-serial-job-attempts' as const,
    jobLifecycles,
    entries: [
      ...entries.map((entry) => ({
        ...entry,
        concurrency: { ...entry.concurrency, phase: 'immutable-source-ordinal' as const },
      })),
      ...deploymentEntries,
      ...jobEntries,
    ],
    // Proof: Task25c3b combined-total omission lost both Deployment cohorts from shared sums.
    // Proof: Task25c3e Job-total omission failed shared init/overhead/emptyDir normalization control.
    knownContributions: sumCapacity([...entries, ...deploymentEntries, ...jobEntries]),
    blockers,
    lifecycles,
    sourceInventorySHA256: hash(JSON.stringify(source.inventory)),
    sourceFrames: source.inventory.frames,
    sourceUnresolved: source.inventory.unresolved,
    provider: {
      kubernetesDefaultVersion: 'v1.36.4' as const,
      intendedK3sVersion: lock.binaries.k3s.version,
      intendedNodeImage: lock.runtimeImages.k3dNode,
      // Proof: Task25c3a render-observation/runtime-observation forgeries failed separate source-capability and intended-provider assertions.
      sourceRenderCapability: observabilityRenderCapabilities,
      runtimeObserved: false as const,
    },
    // Proof: Task25c3a excluded-lifecycle removal lost forced/lost/foreign/unbound/generation exclusions in the lifecycle control.
    unsupportedScenarios: [
      'forced-deletion',
      'lost-node-execution',
      'foreign-mutation',
      'unbound-old-new-templates',
      'unaccounted-controller-generations',
    ],
    runtimePrerequisites: [
      'actual-version-and-feature-equality',
      'cooperative-reachable-controller',
      'actual-UID-owner-template-node-equality',
      'actual-termination-and-enforcement',
      'writable-logs-and-runtime-state',
    ],
    excludedContributors: [
      'operator-generated Pods',
      'system/runtime',
      'host/retained services',
      'images/archive/transients',
      'hostPath growth',
    ],
  };
}

/** Decode every independently bound source frame before conditional lifecycle accounting.
 * Reuses {@link normalizeNativeOwner} and {@link expandNativeOwner}; no filtered receipt or scenario assertion grants admission.
 * One full normalized Pod remains charged through process recovery and ordinary graceful same-template ordinal replacement.
 * Claim bytes are source reservations, not Bound storage, usage or filesystem quotas. Grace is defaulting metadata, not reclamation time.
 * Pinned defaults and render capability remain separate from actual version, ownership, placement, termination and enforcement prerequisites.
 * Deployment cohorts reserve initial plus first replacement Pods conditionally; source policy cannot enforce the required event exclusions.
 * Its accounting slots carry no observed Pod/ReplicaSet identity, and runtime-wave binding remains an owner-specific obligation.
 * Serial Job slots retain every full failed/terminating attempt conditionally; Helm/Flux generations and retained histories remain unobserved.
 * Supplied malformed fields throw before missing-bound/unsupported classifications. Other families and all runtime authority remain unresolved.
 */
export function readRehearsalNativeCosts(...input: Parameters<typeof readRehearsalSource>) {
  const source = readRehearsalSource(...input);
  return deriveNativeCosts(source, input[3]);
}

/** Share the canonical eleven-stage producer with inventory; this companion does not rerender or serialize raw native bodies. */
export async function deriveObservabilityRehearsalNativeCosts(
  ...input: Parameters<typeof prepareRehearsalInventory>
) {
  const source = await prepareRehearsalInventory(...input);
  return {
    ...deriveNativeCosts(source, source.lock),
    sourceInventorySHA256: source.inventory.inventorySHA256,
    provenance: source.inventory.provenance,
    obligations: source.inventory.obligations,
  };
}
